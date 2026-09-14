import { FairRandom } from "../../packages/fairness-core/src/index.ts";
import { resolveThirteenCardFlip, resolveInteractiveThirteenCardFlipFromHands, THIRTEEN_CARD_FLIP_PAYOUT,
  type ThirteenCardFlipOutcome } from "../../games/thirteen-card-flip/model.ts";
import { floorMinorByDecimal } from "../../apps/server/src/payments/money.ts";
import type { ProgressiveKernelInput } from "./progressive-kernels.ts";
import type { ProgressiveCommand } from "./progressive-round.ts";

export class ThirteenCardFlipRoundKernel {
  readonly #input: ProgressiveKernelInput;
  readonly #hands: ThirteenCardFlipOutcome["hands"];
  #resolved: ThirteenCardFlipOutcome;
  #sequence = 0;
  #choices: number[] = [];
  readonly #replies = new Map<string, { fingerprint: string; view: ReturnType<ThirteenCardFlipRoundKernel["view"]> }>();
  constructor(input: ProgressiveKernelInput) {
    if (input.gameId !== "thirteen-card-flip" || input.action !== "start:deal" || !/^[a-f\d-]{1,128}$/i.test(input.roundId) ||
        typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n || typeof input.maximumPayoutMinor !== "bigint" || input.maximumPayoutMinor <= 0n ||
        floorMinorByDecimal(input.wagerMinor, String(THIRTEEN_CARD_FLIP_PAYOUT)) > input.maximumPayoutMinor) throw new Error("Invalid 13 Card Flip opening or exposure");
    this.#input = Object.freeze({ ...input });
    this.#hands = resolveThirteenCardFlip(new FairRandom(input.serverSeed, { gameId: input.gameId,
      clientSeed: input.clientSeed, nonce: input.nonce, action: "deal" }), "b").hands;
    this.#resolved = resolveInteractiveThirteenCardFlipFromHands(this.#hands, "b", []);
  }
  view() {
    const resolved = this.#resolved;
    const active = resolved.phase === "active";
    const hands = active ? Object.fromEntries((["a", "b"] as const).map(player => {
      const revealed = new Map(resolved.reveals.filter(item => item.player === player).map(item => [item.playerIndex - 1, item.card]));
      return [player, Array.from({ length: 13 }, (_, index) => revealed.get(index) ?? {
        id: `hidden-${player}-${index}`, rank: "2", rankValue: 2, suit: "clubs", red: false
      })];
    })) : resolved.hands;
    const multiplier = active ? 0 : resolved.payout;
    return structuredClone({ roundId: this.#input.roundId, gameId: "thirteen-card-flip" as const, sequence: this.#sequence,
      status: active ? "ACTIVE" as const : resolved.payout === 0 ? "LOST" as const : "COMPLETED" as const,
      multiplier, payoutMinor: floorMinorByDecimal(this.#input.wagerMinor, String(multiplier)).toString(),
      outcome: { ...resolved, hands, roundId: this.#input.roundId } });
  }
  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.#input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
        typeof command.action !== "string" || command.action.length > 1024 || !Number.isSafeInteger(command.sequence)) throw new Error("Invalid 13 Card Flip command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("13 Card Flip idempotency conflict");
      return structuredClone(previous.view);
    }
    if (this.#resolved.phase !== "active" || command.sequence !== this.#sequence + 1) throw new Error("13 Card Flip sequence conflict");
    const pick = command.action.match(/^pick:([a-f\d-]+):(\d+)$/i);
    const index = Number(pick?.[2]);
    if (!pick || pick[1] !== this.#input.roundId || !Number.isSafeInteger(index) || index < 0 || index >= 13 || this.#choices.includes(index)) throw new Error("13 Card Flip card unavailable");
    const choices = [...this.#choices, index];
    const resolved = resolveInteractiveThirteenCardFlipFromHands(this.#hands, "b", choices);
    if (floorMinorByDecimal(this.#input.wagerMinor, String(resolved.payout)) > this.#input.maximumPayoutMinor) throw new Error("13 Card Flip payout exceeds policy");
    this.#choices = [...(resolved.playerChoices ?? choices)];
    this.#resolved = resolved; this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, { fingerprint, view });
    return structuredClone(view);
  }
}
