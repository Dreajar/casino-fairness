import { progressiveMaximumPayoutMinor } from "./progressive-limits.ts";
import {
  advanceProgressiveState, createProgressiveState, isProgressiveGameId, type ProgressiveGameId,
  type ProgressiveGameState, type ProgressiveRoundStatus
} from "../../apps/server/src/payments/progressive-kernel.ts";

export interface ProgressiveCommand {
  roundId: string;
  requestId: string;
  sequence: number;
  action: string;
}

/** Enclave-local state machine, not an RPC seed-import API. Its owner generates
 * and commits the seed before supplying the player's fresh entropy. The owner
 * must sign each returned view and durably journal it before acknowledging it.
 * It must never serialize private state to an unencrypted host checkpoint. */
export class ProgressiveRoundKernel {
  #state: ProgressiveGameState;
  #status: ProgressiveRoundStatus;
  #sequence = 0;
  #payout = 0n;
  #multiplier: number;
  readonly #identity: { id: string; game_id: ProgressiveGameId; wager_minor: bigint };
  readonly #maximumPayout: bigint;
  readonly #replies = new Map<string, { fingerprint: string; view: ReturnType<ProgressiveRoundKernel["view"]> }>();

  constructor(input: {
    roundId: string; gameId: ProgressiveGameId; wagerMinor: bigint; maximumPayoutMinor: bigint;
    action: string; serverSeed: string; clientSeed: string; nonce: number;
  }) {
    if (!isProgressiveGameId(input.gameId) || !/^[a-f\d-]{1,128}$/i.test(input.roundId) ||
        typeof input.wagerMinor !== "bigint" || typeof input.maximumPayoutMinor !== "bigint" ||
        input.wagerMinor <= 0n || input.maximumPayoutMinor <= 0n) {
      throw new Error("Invalid progressive round identity or limits");
    }
    this.#identity = { id: input.roundId, game_id: input.gameId, wager_minor: input.wagerMinor };
    this.#maximumPayout = input.maximumPayoutMinor;
    if (progressiveMaximumPayoutMinor(input.gameId, input.action, input.wagerMinor, input.maximumPayoutMinor) > input.maximumPayoutMinor) {
      throw new Error("Progressive maximum payout exceeds policy");
    }
    const initial = createProgressiveState({ ...input, maxPayoutMinor: input.maximumPayoutMinor });
    this.#state = initial.state;
    this.#multiplier = initial.multiplier;
    this.#status = initial.state.kind === "chicken-cross" && !initial.state.crossings[0]?.success ? "LOST" : "ACTIVE";
  }

  view() {
    const state = this.#state;
    const terminal = this.#status !== "ACTIVE";
    // Explicit public projections: spreading private state into a response
    // would leak the next safe tile or pop point before the player commits.
    const outcome = state.kind === "pump"
      ? { kind: state.kind, difficulty: state.difficulty, step: state.step, ...(terminal ? { popPoint: state.popPoint } : {}) }
      : state.kind === "chicken-cross"
        ? { kind: state.kind, difficulty: state.difficulty, step: state.step, crossings: state.crossings, ...(terminal ? { lanes: state.lanes } : {}) }
        : state.kind === "mines"
          ? { kind: state.kind, gridSize: state.gridSize, mineCount: state.mineCount, revealed: state.revealed, ...(terminal ? { mines: state.mines } : {}) }
          : state.kind === "moles"
            ? { kind: state.kind, moles: state.moles, step: state.step, picks: state.picks, ...(terminal ? { safeRows: state.safeRows } : {}) }
            : { kind: state.kind, difficulty: state.difficulty, floor: state.floor, picks: state.picks, ...(terminal ? { safeRows: state.safeRows } : {}) };
    return structuredClone({ roundId: this.#identity.id, gameId: this.#identity.game_id, sequence: this.#sequence,
      status: this.#status, multiplier: this.#multiplier, payoutMinor: this.#payout.toString(), outcome });
  }

  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.#identity.id || !command.requestId || command.requestId.length > 128 ||
        !Number.isSafeInteger(command.sequence) || typeof command.action !== "string" || command.action.length > 1024) {
      throw new Error("Invalid progressive command identity");
    }
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Progressive idempotency conflict");
      return structuredClone(previous.view);
    }
    if (this.#status !== "ACTIVE") throw new Error("Progressive round is terminal");
    if (command.sequence !== this.#sequence + 1) throw new Error("Progressive sequence conflict");
    const next = advanceProgressiveState(this.#identity, this.#state, command, "floor-minor-v1");
    if (next.payoutMinor < 0n || next.payoutMinor > this.#maximumPayout) throw new Error("Progressive payout exceeds policy");
    this.#state = next.state;
    this.#status = next.status;
    this.#multiplier = next.multiplier;
    this.#payout = next.payoutMinor;
    this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, { fingerprint, view });
    return structuredClone(view);
  }
}
