import { isFloorLavaDifficulty, type FloorLavaDifficulty } from "@replicate/contracts";
import { floorLavaAvailablePlatforms, floorLavaMaximumMultiplier, floorLavaMultiplier, floorLavaProgress,
  generateFloorLavaField, type FloorLavaPick } from "../../packages/fairness-core/src/index.ts";
import { floorMinorByDecimal } from "../../apps/server/src/payments/money.ts";
import type { ProgressiveKernelInput } from "./progressive-kernels.ts";
import type { ProgressiveCommand } from "./progressive-round.ts";
type FloorLavaStatus = "ACTIVE" | "LOST" | "CASHED_OUT" | "COMPLETED";

/** One committed field; only already-resolved platforms may leave the enclave. */
export class FloorLavaRoundKernel {
  readonly #difficulty: FloorLavaDifficulty;
  readonly #stages: readonly (readonly number[])[];
  readonly #input: ProgressiveKernelInput;
  #picks: FloorLavaPick[] = [];
  #step = 0;
  #sequence = 0;
  #status: FloorLavaStatus = "ACTIVE";
  #multiplier = 0;
  #payout = 0n;
  #revealed: readonly number[] = [];
  readonly #replies = new Map<string, { fingerprint: string; view: ReturnType<FloorLavaRoundKernel["view"]> }>();

  constructor(input: ProgressiveKernelInput) {
    const difficulty = input.action.match(/^start:(easy|medium|hard|toxic)$/)?.[1];
    if (input.gameId !== "floor-is-lava" || !isFloorLavaDifficulty(difficulty) || !/^[a-f\d-]{1,128}$/i.test(input.roundId) ||
        typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n || typeof input.maximumPayoutMinor !== "bigint" || input.maximumPayoutMinor <= 0n) {
      throw new Error("Invalid Floor Is Lava opening");
    }
    if (floorMinorByDecimal(input.wagerMinor, floorLavaMaximumMultiplier(difficulty).toFixed(4)) > input.maximumPayoutMinor) {
      throw new Error("Floor Is Lava maximum payout exceeds policy");
    }
    this.#input = Object.freeze({ ...input });
    this.#difficulty = difficulty;
    this.#stages = generateFloorLavaField(input.serverSeed, { gameId: input.gameId, action: input.action, clientSeed: input.clientSeed, nonce: input.nonce });
  }

  view() {
    const active = this.#status === "ACTIVE";
    const progress = floorLavaProgress(this.#difficulty, this.#step);
    const phase = this.#status === "CASHED_OUT" ? "cashed-out" : this.#status.toLowerCase();
    const lastPick = this.#picks.at(-1) ?? null;
    return structuredClone({ roundId: this.#input.roundId, gameId: "floor-is-lava" as const,
      sequence: this.#sequence, status: this.#status, multiplier: this.#multiplier, payoutMinor: this.#payout.toString(),
      outcome: { kind: "floor-is-lava", roundId: this.#input.roundId, difficulty: this.#difficulty, phase,
        step: this.#step, currentMultiplier: this.#multiplier,
        nextMultiplier: active ? floorLavaMultiplier(this.#difficulty, this.#step + 1) : 0,
        level: progress.level, stage: progress.stage, levelComplete: progress.levelComplete,
        picks: this.#picks, remainingPlatforms: this.#status === "LOST" ? this.#revealed
          : active || this.#step === 0 ? floorLavaAvailablePlatforms(this.#difficulty, this.#stages, this.#step)
          : this.#stages[this.#step - 1] ?? [],
        revealedSafePlatforms: lastPick && phase !== "cashed-out" ? this.#revealed : [], lastPick,
        ...(active ? {} : { safeStages: this.#stages }) } });
  }

  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.#input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
        typeof command.action !== "string" || command.action.length > 1024 || !Number.isSafeInteger(command.sequence)) throw new Error("Invalid Floor Is Lava command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Floor Is Lava idempotency conflict");
      return structuredClone(previous.view);
    }
    if (this.#status !== "ACTIVE" || command.sequence !== this.#sequence + 1) throw new Error("Floor Is Lava sequence conflict");
    const pick = command.action.match(/^pick:([a-f\d-]+):(\d+):(\d+)$/i);
    const cashout = command.action.match(/^cashout:([a-f\d-]+)$/i);
    let step = this.#step, multiplier = 0, payout = 0n;
    let status: FloorLavaStatus = "ACTIVE";
    let revealed: readonly number[] = [];
    const picks = [...this.#picks];
    if (pick) {
      const requestedStep = Number(pick[2]), platform = Number(pick[3]);
      if (pick[1] !== this.#input.roundId || requestedStep !== step + 1 || requestedStep > this.#stages.length ||
          !Number.isSafeInteger(platform) || !floorLavaAvailablePlatforms(this.#difficulty, this.#stages, step).includes(platform)) throw new Error("Invalid Floor Is Lava platform or progression");
      revealed = this.#stages[step] ?? [];
      const safe = revealed.includes(platform);
      picks.push({ step: requestedStep, platform, safe });
      if (safe) {
        step = requestedStep;
        multiplier = floorLavaMultiplier(this.#difficulty, step);
        if (step === this.#stages.length) status = "COMPLETED";
      } else status = "LOST";
    } else if (cashout && cashout[1] === this.#input.roundId && step > 0) {
      status = "CASHED_OUT";
      multiplier = floorLavaMultiplier(this.#difficulty, step);
    } else throw new Error("Invalid Floor Is Lava action or premature cashout");
    if (status === "CASHED_OUT" || status === "COMPLETED") payout = floorMinorByDecimal(this.#input.wagerMinor, multiplier.toFixed(4));
    if (payout > this.#input.maximumPayoutMinor) throw new Error("Floor Is Lava payout exceeds policy");
    this.#step = step; this.#multiplier = multiplier; this.#status = status; this.#payout = payout;
    this.#picks = picks; this.#revealed = revealed; this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, { fingerprint, view });
    return structuredClone(view);
  }
}
