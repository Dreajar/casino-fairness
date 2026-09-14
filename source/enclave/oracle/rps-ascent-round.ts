import { FairRandom } from "../../packages/fairness-core/src/index.ts";
import { RPS_MOVES, RPS_MULTIPLIERS, RPS_MAX_THROWS, isRpsMove, rpsThrowResult, type RpsMove } from "../../games/rps-ascent/model.ts";
import { floorMinorByDecimal } from "../../apps/server/src/payments/money.ts";
import type { ProgressiveKernelInput } from "./progressive-kernels.ts";
import type { ProgressiveCommand } from "./progressive-round.ts";

/** A single wager funds the complete ladder. A throw is derived from its
 * committed sequence, never the player's move; draws consume a sequence but
 * neither a stage nor another stake. Only completed throws are public. */
export class RpsAscentRoundKernel {
  readonly #input: ProgressiveKernelInput;
  #step = 0;
  #sequence = 0;
  #status: "ACTIVE" | "LOST" | "CASHED_OUT" | "COMPLETED" = "ACTIVE";
  #payout = 0n;
  #throws: { player: RpsMove; opponent: RpsMove; result: "draw" | "win" | "loss" }[] = [];
  readonly #replies = new Map<string, { fingerprint: string; view: ReturnType<RpsAscentRoundKernel["view"]> }>();
  constructor(input: ProgressiveKernelInput) {
    if (input.gameId !== "rps-ascent" || input.action !== "start:run" || !/^[a-f\d-]{1,128}$/i.test(input.roundId) ||
        typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n || typeof input.maximumPayoutMinor !== "bigint" ||
        input.wagerMinor * 10000n > input.maximumPayoutMinor) throw new Error("Invalid RPS Ascent opening or exposure");
    this.#input = Object.freeze({...input});
  }
  view() {
    const last = this.#throws.at(-1);
    const multiplier = this.#status === "LOST" ? 0 : this.#step === 0 ? (this.#status === "COMPLETED" ? 1 : 0) : RPS_MULTIPLIERS[this.#step - 1]!;
    return structuredClone({roundId: this.#input.roundId, gameId: "rps-ascent" as const, sequence: this.#sequence,
      status: this.#status, multiplier, payoutMinor: this.#payout.toString(), outcome: {
        kind: "rps-ascent", rules: "rps-ladder-v1", roundId: this.#input.roundId,
        phase: this.#status === "CASHED_OUT" ? "cashed-out" : this.#status.toLowerCase(),
        step: this.#step, currentMultiplier: multiplier, throws: this.#throws,
        player: last?.player ?? null, opponent: last?.opponent ?? null,
        success: last?.result === "win", draw: last?.result === "draw"
      }});
  }
  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.#input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
        !Number.isSafeInteger(command.sequence) || typeof command.action !== "string" || command.action.length > 1024) throw new Error("Invalid RPS command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("RPS idempotency conflict");
      return structuredClone(previous.view);
    }
    if (this.#status !== "ACTIVE" || command.sequence !== this.#sequence + 1) throw new Error("RPS sequence conflict");
    if (command.action === `cashout:${this.#input.roundId}` && this.#step > 0) {
      this.#status = "CASHED_OUT";
    } else {
      const parts = command.action.split(":");
      if (parts.length !== 3 || parts[0] !== "throw" || parts[1] !== this.#input.roundId || !isRpsMove(parts[2]!)) throw new Error("Invalid RPS throw or premature cashout");
      const player = parts[2];
      const opponent = new FairRandom(this.#input.serverSeed, {gameId: "rps-ascent", clientSeed: this.#input.clientSeed,
        nonce: this.#input.nonce, action: `rps-ladder-v1:throw:${command.sequence}`}).pick(RPS_MOVES);
      const result = rpsThrowResult(player, opponent);
      this.#throws.push({player, opponent, result});
      if (result === "loss") this.#status = "LOST";
      if (result === "win" && ++this.#step === RPS_MULTIPLIERS.length) this.#status = "COMPLETED";
      if (this.#status === "ACTIVE" && this.#throws.length === RPS_MAX_THROWS) this.#status = "COMPLETED";
    }
    if (this.#status === "CASHED_OUT" || this.#status === "COMPLETED") this.#payout = floorMinorByDecimal(this.#input.wagerMinor, String(this.#step ? RPS_MULTIPLIERS[this.#step - 1] : 1));
    this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, {fingerprint, view});
    return structuredClone(view);
  }
}
