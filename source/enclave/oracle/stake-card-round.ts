import { FairRandom } from "../../packages/fairness-core/src/index.ts";
import { actBlackjack, blackjackAllowed, blackjackCommand, blackjackCommitted, blackjackMaximumPayout,
  blackjackOutcome, blackjackPayout, blackjackShoe, dealBlackjack, withBlackjackSideBets, type BlackjackState } from "../../games/blackjack/model.ts";
import { actWar, dealWar, warCommand, warCommitted, warDraws, warMaximumPayout, warOutcome, warPayout,
  warUnits, withWarSideBets, type WarState } from "../../games/rainbet-war/model.ts";
import type { ProgressiveKernelInput } from "./progressive-kernels.ts";
import type { ProgressiveCommand } from "./progressive-round.ts";

interface CardAdapter<State> {
  initial(input: ProgressiveKernelInput): State;
  active(state: State): boolean;
  committed(state: State, base: bigint): bigint;
  maximum(state: State, base: bigint): bigint;
  payout(state: State, base: bigint): bigint;
  outcome(state: State, id: string, base: bigint): Record<string, unknown>;
  nextCosts(state: State, base: bigint): Record<string, string>;
  advance(state: State, action: string, id: string): State;
}

/** The signed public view quotes the extra stake for every available action.
 * The accounting coordinator must reserve that quote before requesting the
 * action. Both the resulting charge and cumulative stake are replay-verified. */
class StakeCardRoundKernel<State> {
  readonly #input: ProgressiveKernelInput;
  #state: State;
  #sequence = 0;
  #actionWager: bigint;
  readonly #replies = new Map<string, { fingerprint: string; view: ReturnType<StakeCardRoundKernel<State>["view"]> }>();
  constructor(input: ProgressiveKernelInput, private readonly adapter: CardAdapter<State>) {
    if (!/^[a-f\d-]{1,128}$/i.test(input.roundId) || typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n ||
        typeof input.maximumPayoutMinor !== "bigint" || input.maximumPayoutMinor <= 0n) throw new Error("Invalid card round identity or limits");
    this.#input = Object.freeze({ ...input });
    this.#state = adapter.initial(input);
    if (adapter.maximum(this.#state, input.wagerMinor) > input.maximumPayoutMinor) throw new Error("Card round maximum payout exceeds policy");
    this.#actionWager = adapter.committed(this.#state, input.wagerMinor);
  }
  view() {
    const { adapter } = this;
    const base = this.#input.wagerMinor;
    const active = adapter.active(this.#state);
    const total = adapter.committed(this.#state, base);
    const payout = active ? 0n : adapter.payout(this.#state, base);
    return structuredClone({ roundId: this.#input.roundId, gameId: this.#input.gameId, sequence: this.#sequence,
      status: active ? "ACTIVE" as const : payout === 0n ? "LOST" as const : "COMPLETED" as const,
      multiplier: Number(payout) / Number(total), payoutMinor: payout.toString(),
      actionWagerMinor: this.#actionWager.toString(), totalWagerMinor: total.toString(),
      nextActionWagersMinor: active ? adapter.nextCosts(this.#state, base) : {},
      outcome: adapter.outcome(this.#state, this.#input.roundId, base) });
  }
  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.#input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
        typeof command.action !== "string" || command.action.length > 1024 || !Number.isSafeInteger(command.sequence)) throw new Error("Invalid card command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Card round idempotency conflict");
      return structuredClone(previous.view);
    }
    if (!this.adapter.active(this.#state) || command.sequence !== this.#sequence + 1) throw new Error("Card round sequence conflict");
    const action = command.action.split(":")[0] ?? "";
    const quote = this.adapter.nextCosts(this.#state, this.#input.wagerMinor)[action];
    if (quote === undefined) throw new Error("Card action is unavailable");
    const next = this.adapter.advance(this.#state, command.action, this.#input.roundId);
    const charged = this.adapter.committed(next, this.#input.wagerMinor) - this.adapter.committed(this.#state, this.#input.wagerMinor);
    if (charged < 0n || charged.toString() !== quote) throw new Error("Card action stake quote mismatch");
    if (this.adapter.payout(next, this.#input.wagerMinor) > this.#input.maximumPayoutMinor) throw new Error("Card round payout exceeds policy");
    this.#state = next; this.#actionWager = charged; this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, { fingerprint, view });
    return structuredClone(view);
  }
}

const blackjack: CardAdapter<BlackjackState> = {
  initial(input) {
    if (input.gameId !== "blackjack") throw new Error("Blackjack identity mismatch");
    const shoe = blackjackShoe(new FairRandom(input.serverSeed, { gameId: input.gameId, clientSeed: input.clientSeed, nonce: input.nonce, action: "deal" }));
    return withBlackjackSideBets(dealBlackjack(shoe, input.blackjackRules), input.action, input.wagerMinor, input.usdScale);
  },
  active: state => state.phase === "player", committed: blackjackCommitted, maximum: blackjackMaximumPayout,
  payout: blackjackPayout, outcome: blackjackOutcome,
  nextCosts(state, base) {
    return Object.fromEntries(blackjackAllowed(state).map(action => [action,
      action === "split" || action === "double" ? (base * BigInt(state.hands[state.active]?.units ?? 0)).toString() : "0"]));
  },
  advance: (state, action, id) => actBlackjack(state, blackjackCommand(action, id, state.revision))
};
const war: CardAdapter<WarState> = {
  initial(input) {
    if (input.gameId !== "rainbet-war") throw new Error("War identity mismatch");
    const shoe = warDraws(new FairRandom(input.serverSeed, { gameId: input.gameId, clientSeed: input.clientSeed, nonce: input.nonce, action: "deal" }));
    return withWarSideBets(dealWar(shoe), input.action, input.wagerMinor, input.usdScale);
  },
  active: state => state.phase === "player", committed: warCommitted, maximum: warMaximumPayout,
  payout: warPayout, outcome: warOutcome,
  nextCosts: (state, base) => ({ war: (base * BigInt(warUnits(state))).toString(), surrender: "0" }),
  advance: (state, action, id) => actWar(state, warCommand(action, id, state.revision))
};
export class BlackjackRoundKernel extends StakeCardRoundKernel<BlackjackState> {
  constructor(input: ProgressiveKernelInput) { super(input, blackjack); }
}
export class WarRoundKernel extends StakeCardRoundKernel<WarState> {
  constructor(input: ProgressiveKernelInput) { super(input, war); }
}
