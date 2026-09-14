import { FairRandom } from "../../packages/fairness-core/src/index.ts";
import { dealVideoPoker, drawVideoPoker, VIDEO_POKER_MAX_MULTIPLIER, type VideoPokerDeal, type VideoPokerDraw } from "../../games/video-poker/model.ts";
import { floorMinorByDecimal } from "../../apps/server/src/payments/money.ts";
import { isProgressiveGameId, type ProgressiveGameId } from "../../apps/server/src/payments/progressive-kernel.ts";
import { ProgressiveRoundKernel, type ProgressiveCommand } from "./progressive-round.ts";
import { FloorLavaRoundKernel } from "./floor-lava-round.ts";
import { ThirteenCardFlipRoundKernel } from "./thirteen-card-flip-round.ts";
import { BlackjackRoundKernel, WarRoundKernel } from "./stake-card-round.ts";
import { blackjackOpeningBets, type BlackjackRules } from "../../games/blackjack/model.ts";
import { warOpeningBets } from "../../games/rainbet-war/model.ts";
import { RpsAscentRoundKernel } from "./rps-ascent-round.ts";

export type EnclaveProgressiveGameId = ProgressiveGameId | "video-poker" | "floor-is-lava" | "thirteen-card-flip" | "blackjack" | "rainbet-war" | "rps-ascent";
export function isEnclaveProgressiveGameId(value: string): value is EnclaveProgressiveGameId {
  return isProgressiveGameId(value) || ["video-poker", "floor-is-lava", "thirteen-card-flip", "blackjack", "rainbet-war", "rps-ascent"].includes(value);
}
export function progressiveInitialWagerMinor(gameId: string, action: string, base: bigint, usdScale: 2 | 8 = 2): bigint {
  const sideBets = gameId === "blackjack" ? blackjackOpeningBets(action, base, usdScale) : gameId === "rainbet-war" ? warOpeningBets(action, base, usdScale) : [];
  return sideBets.reduce((total, stake) => total + stake, base);
}
export interface ProgressiveKernelInput {
  usdScale?: 2 | 8;
  roundId: string; gameId: EnclaveProgressiveGameId; wagerMinor: bigint; maximumPayoutMinor: bigint;
  action: string; serverSeed: string; clientSeed: string; nonce: number;
  /** Historical transcript replay only; live openings use the current rules. */
  blackjackRules?: BlackjackRules;
}

/** The initial five cards are public. The remaining shuffled deck stays inside
 * the enclave until the player's single, irrevocable hold selection settles. */
export class VideoPokerRoundKernel {
  readonly #deal: VideoPokerDeal;
  #draw?: VideoPokerDraw;
  #payout = 0n;
  #request?: { id: string; fingerprint: string };
  constructor(private readonly input: ProgressiveKernelInput) {
    if (input.gameId !== "video-poker" || !/^[a-f\d-]{1,128}$/i.test(input.roundId) || input.action !== "start:deal" ||
      typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n || typeof input.maximumPayoutMinor !== "bigint" ||
      input.maximumPayoutMinor <= 0n || input.wagerMinor * BigInt(VIDEO_POKER_MAX_MULTIPLIER) > input.maximumPayoutMinor) throw new Error("Invalid Video Poker opening or exposure");
    this.input = Object.freeze({ ...input });
    this.#deal = dealVideoPoker(new FairRandom(input.serverSeed, { gameId: "video-poker", clientSeed: input.clientSeed, nonce: input.nonce, action: "deal" }));
  }
  view() {
    return structuredClone({ roundId: this.input.roundId, gameId: "video-poker" as const, sequence: this.#draw ? 1 : 0,
      status: this.#draw ? "COMPLETED" as const : "ACTIVE" as const, multiplier: this.#draw?.result.multiplier ?? 0, payoutMinor: this.#payout.toString(),
      outcome: this.#draw ? { kind: "video-poker", phase: "settled", roundId: this.input.roundId, ...this.#draw }
        : { kind: "video-poker", phase: "hold", roundId: this.input.roundId, initialCards: this.#deal.initialCards } });
  }
  advance(command: ProgressiveCommand) {
    if (command.roundId !== this.input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 || typeof command.action !== "string" || command.action.length > 1024) throw new Error("Invalid Video Poker command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    if (this.#request?.id === command.requestId) {
      if (this.#request.fingerprint !== fingerprint) throw new Error("Video Poker idempotency conflict");
      return this.view();
    }
    if (this.#draw) throw new Error("Video Poker round is terminal");
    if (command.sequence !== 1) throw new Error("Video Poker sequence conflict");
    const prefix = `draw:${this.input.roundId}:`;
    if (!command.action.startsWith(prefix)) throw new Error("Invalid Video Poker draw");
    const holds = command.action.slice(prefix.length);
    if (!/^(?:[0-4](?:,[0-4])*)?$/.test(holds)) throw new Error("Invalid Video Poker holds");
    const draw = drawVideoPoker(this.#deal.deck, holds ? holds.split(',').map(Number) : []);
    const payout = floorMinorByDecimal(this.input.wagerMinor, String(draw.result.multiplier));
    if (payout > this.input.maximumPayoutMinor) throw new Error("Video Poker payout exceeds policy");
    this.#draw = draw; this.#payout = payout; this.#request = { id: command.requestId, fingerprint };
    return this.view();
  }
}

export function createProgressiveKernel(input: ProgressiveKernelInput) {
  if (input.gameId === "rps-ascent") return new RpsAscentRoundKernel(input);
  if (input.gameId === "floor-is-lava") return new FloorLavaRoundKernel(input);
  if (input.gameId === "thirteen-card-flip") return new ThirteenCardFlipRoundKernel(input);
  if (input.gameId === "blackjack") return new BlackjackRoundKernel(input);
  if (input.gameId === "rainbet-war") return new WarRoundKernel(input);
  return input.gameId === "video-poker" ? new VideoPokerRoundKernel(input) : new ProgressiveRoundKernel({ ...input, gameId: input.gameId });
}
