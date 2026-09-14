import { parseUsdAtoms, USD_FACTOR } from "../../dice-proof/src/usd.mjs";
import { baccaratPayoutMinor, parseBaccaratBets, resolveBaccaratV2 } from "./baccarat-markets.ts";
import { calibrateSlotPayout } from "./slot-payout-calibration.ts";
import { SLOT_PAYOUT_SCALES } from "./slot-payout-scales.ts";
import { RpsAscentRoundKernel } from "../../../enclave/oracle/rps-ascent-round.ts";

export * from "./baccarat-markets.ts";

import {
  actWar,
  dealWar,
  type WarAction,
  type WarState,
  warCommand,
  warCommitted,
  warDraws,
  warOutcome,
  warPayout,
  warStartAction,
  warUnits,
  withWarSideBets
} from "../../../games/rainbet-war/model.ts";

export * from "../../../games/rainbet-war/model.ts";

import {
  actBlackjack,
  type BlackjackAction,
  type BlackjackState,
  blackjackCommand,
  blackjackCommitted,
  blackjackOutcome,
  blackjackPayout,
  blackjackShoe,
  blackjackStartAction,
  blackjackUnits,
  dealBlackjack,
  withBlackjackSideBets
} from "../../../games/blackjack/model.ts";

export * from "../../../games/blackjack/model.ts";

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  DRAGON_TOWER_DIFFICULTIES,
  DRAGON_TOWER_FLOORS,
  DRAGON_TOWER_PAYTABLE,
  type DragonTowerDifficulty,
  type FairnessHistoryPage,
  type FairnessHistoryRound,
  type FairnessPlayResult,
  type FairnessSessionView,
  FLOOR_LAVA_DIFFICULTIES,
  FLOOR_LAVA_STARTING_PLATFORMS,
  type FloorLavaDifficulty,
  isDragonTowerDifficulty,
  isFloorLavaDifficulty,
  isTowerDifficulty,
  TOWER_DIFFICULTIES,
  TOWER_FLOORS,
  TOWER_PAYTABLE,
  type TowerDifficulty
} from "@replicate/contracts";
import { canonicalJson, type DiceReceipt } from "@replicate/dice-proof";
import { ENABLED_GAME_IDS, type EnabledGameId } from "@replicate/game-registry/enabled-games";
import { buildTicket as buildAuroraTicket } from "../../../american-aurora/aurora-engine.js";
import {
  resolveInteractiveThirteenCardFlipFromHands,
  resolveThirteenCardFlip,
  THIRTEEN_CARD_FLIP_PAYOUT,
  type ThirteenCardFlipCard
} from "../../../games/thirteen-card-flip/model.ts";
import {
  dealVideoPoker,
  drawVideoPoker,
  VIDEO_POKER_MAX_MULTIPLIER,
  type VideoPokerCardCode
} from "../../../games/video-poker/model.ts";
import { RTP_MODEL as PINBALL_RTP_MODEL } from "../../../lucky-pinball/game/logic.js";
import {
  PLINKO_RTP_TOLERANCE as SHARED_PLINKO_RTP_TOLERANCE,
  PLINKO_TARGET_RTP as SHARED_PLINKO_TARGET_RTP,
  RAINBET_PLINKO_PAYTABLES as SHARED_RAINBET_PLINKO_PAYTABLES
} from "../../../originals-lab/plinko-paytables.js";
import {
  GRID_SIZES as SHARED_MINES_GRID_SIZES,
  MINES_MAX_MULTIPLIER as SHARED_MINES_MAX_MULTIPLIER,
  multiplierFor as sharedMinesMultiplierFor
} from "../../../rainbet-mines/engine.js";
import { EUROPEAN_WHEEL, rouletteColor, settleRouletteBets } from "../../../rainbet-roulette/engine.js";
import {
  makeCard as makeWarCard,
  settleLegacyWarRound as settleWarRound,
  WAR_RANKS,
  WAR_SUITS
} from "../../../rainbet-war/engine.js";
import {
  RISKS as RAINBET_WHEEL_RISKS,
  outcomeForIndex as rainbetWheelOutcomeForIndex,
  riskTableFor as rainbetWheelRiskTableFor
} from "../../../rainbet-wheel/engine.js";
import { PAYOUTS as SHARED_KENO_PAYTABLES } from "../../../shuffle-keno/engine.js";
import { resolveDart as resolveStakeDart } from "../../../stake-darts/engine.js";
import { resolveDart as resolveEnhancedStakeDart } from "../../../stake-darts-enhanced/engine.js";
import { multiplierForStreak } from "../../../stake-flip/engine.js";
import {
  normalizeDifficulty as normalizeSnakesDifficulty,
  firstMultiplierFor as snakesFirstMultiplierFor
} from "../../../stake-snakes/engine.js";
import {
  outcomeForIndex as stakeWheelOutcomeForIndex,
  validateConfiguration as validateStakeWheelConfiguration
} from "../../../stake-wheel/engine.js";
import { drawTarot, drawLegacyTarot } from "../../../tarot/engine.js";
import {
  quantizeMultiplier,
  quantizeSlotMultiplier,
  RAINBET_LIMBO_RTP,
  SLOT_MAX_SETTLED_MULTIPLIER,
  TARGET_RTP
} from "./constants.ts";
import { DRILL_RESULT_MAXIMUM, parseDrillAction, resolveDrill } from "./drill.ts";
import { FIST_OF_DESTRUCTION_MAX_WIN, resolveFistOfDestruction } from "./fist-of-destruction.ts";
import { FRUIT_PARTY_MAX_WAGER, FRUIT_PARTY_MAX_WIN, FRUIT_PARTY_MIN_WAGER, resolveFruitParty } from "./fruit-party.ts";
import {
  NEON_SYNDICATE_MAX_WAGER,
  NEON_SYNDICATE_MAX_WIN,
  NEON_SYNDICATE_MIN_WAGER,
  neonSyndicateCostMultiplierForAction,
  resolveNeonSyndicate
} from "./neon-syndicate.ts";
import {
  ODINS_VAULT_MAX_WAGER,
  ODINS_VAULT_MIN_WAGER,
  odinsVaultCostMultiplierForAction,
  odinsVaultRawCapForAction,
  resolveOdinsVaultSpin
} from "./odins-vault.ts";
import { PACKS_MAX_MULTIPLIER, resolvePacks } from "./packs.ts";
import { RIP_CITY_MAX_MULTIPLIER, resolveRipCity } from "./rip-city.ts";
import { FAIR_SLOT_MAX_MULTIPLIERS, type FairSlotGameId, resolveFairSlot } from "./slots.ts";
import {
  resolveSweetBonanza2500,
  SWEET_BONANZA_MAX_WAGER,
  SWEET_BONANZA_MAX_WIN,
  SWEET_BONANZA_MIN_WAGER
} from "./sweet-bonanza-2500.ts";
import { resolveWantedDeadOrWild, WANTED_MAX_WIN, wantedCostMultiplierForAction } from "./wanted-dead-or-wild.ts";
import { createWitchBloodOutcome, WITCH_BLOOD_MAX_MULTIPLIER } from "./witch-blood.ts";
import { resolveXmasDrop, XMAS_DROP_MAX_MULTIPLIER } from "./xmas-drop.ts";

export * from "../../../games/thirteen-card-flip/model.ts";
export * from "../../../games/video-poker/model.ts";
export * from "./constants.ts";
export * from "./slot-payout-calibration.ts";
export * from "./drill.ts";
export * from "./fist-of-destruction.ts";
export * from "./fruit-party.ts";
export * from "./gravity.ts";
export * from "./neon-syndicate.ts";
export * from "./odins-vault.ts";
export * from "./packs.ts";
export * from "./rip-city.ts";
export * from "./slots.ts";
export * from "./sweet-bonanza-2500.ts";
export * from "./wanted-dead-or-wild.ts";
export type {
  WitchBloodBoard,
  WitchBloodCell,
  WitchBloodFreeSpin,
  WitchBloodGameOutcome,
  WitchBloodOutcome,
  WitchBloodRandom,
  WitchBloodScatterWin,
  WitchBloodSpin,
  WitchBloodSymbol,
  WitchBloodTumble,
  WitchBloodWildEvent,
  WitchBloodWin
} from "./witch-blood.ts";
export {
  applyWitchBloodGravity,
  capWitchBloodMultiplier,
  chargeWitchBloodWilds,
  createWitchBloodOutcome,
  evaluateWitchBloodWaysWins,
  spawnWitchBloodAfterExplosions,
  spawnWitchBloodWilds,
  WITCH_BLOOD_MAX_FREE_SPINS,
  WITCH_BLOOD_MAX_MULTIPLIER,
  WITCH_BLOOD_MAX_TUMBLES,
  WITCH_BLOOD_PAYOUT_SCALE,
  WITCH_BLOOD_SYMBOLS,
  witchBloodExplosionBoost,
  witchBloodFreeSpins,
  witchBloodNextFeatureMultiplier,
  witchBloodRetrigger,
  witchBloodScatterMultiplier,
  witchBloodWays
} from "./witch-blood.ts";
export * from "./xmas-drop.ts";

export const FAIRNESS_VERSION = "replicate-fairness-v1";
export const STAKE_CRASH_MAX_MULTIPLIER = 1_000;
export const MINES_GRID_SIZES = SHARED_MINES_GRID_SIZES as readonly (25 | 36 | 49 | 64)[];
export const MINES_MAX_MULTIPLIER = SHARED_MINES_MAX_MULTIPLIER;

export function minesMultiplierFor(gridSize: number, mineCount: number, revealedCount: number): number {
  return sharedMinesMultiplierFor({ gridSize, mineCount, revealedCount });
}

export interface RandomContext {
  readonly gameId: EnabledGameId;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly action: string;
  /** Replay only: settlement callers always use the current math by default. */
  readonly slotMathVersion?: "legacy" | "slot-payout-calibration-v1" | "slot-payout-calibration-v2" | "slot-payout-20x-v3";
  readonly blackjackRules?: "six-deck-s17-v1" | "six-deck-s17-v2";
  readonly midasMathVersion?: "legacy" | "midas-grid-v2";
  /** Replay only; new settlements always use the current Tarot distribution. */
  readonly tarotMathVersion?: "legacy" | "tarot-house-edge-v2";
  readonly packsMathVersion?: "legacy" | "packs-house-edge-v2";
}

export interface GameOutcome {
  readonly multiplier: number;
  readonly outcome: Readonly<Record<string, unknown>>;
}

export const CHICKEN_RTP = 0.98;
export const CHICKEN_PATHS = {
  easy: [1.03, 1.09, 1.15, 1.23, 1.31, 1.4, 1.51, 1.63, 1.78, 1.96, 2.18, 2.45, 2.8, 3.27, 3.92, 4.9, 6.53, 9.8, 19.6],
  medium: [1.15, 1.37, 1.64, 2, 2.46, 3.07, 3.91, 5.08, 6.77, 9.31, 13.3, 19.95, 31.92, 55.86, 111.72, 279.3, 1117.2],
  hard: [1.31, 1.77, 2.46, 3.48, 5.06, 7.59, 11.81, 19.18, 32.89, 60.29, 120.59, 271.32, 723.52, 2532.32, 15193.92],
  expert: [1.96, 4.14, 9.31, 22.61, 60.29, 180.88, 633.08, 2743.35, 16460.08, 181060.88]
} as const;

export type ChickenDifficulty = keyof typeof CHICKEN_PATHS;

export interface ChickenLaneResolution {
  readonly lane: number;
  readonly multiplier: number;
  readonly successChance: number;
  readonly success: boolean;
}

export const FLOOR_LAVA_RTP = 0.98;

export interface FloorLavaProgress {
  readonly level: number;
  readonly stage: number;
  readonly levelComplete: boolean;
  readonly totalSteps: number;
}

export function floorLavaProgress(difficulty: FloorLavaDifficulty, step: number): FloorLavaProgress {
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const stagesPerLevel = config.safeCounts.length;
  const totalSteps = stagesPerLevel * config.levels;
  const boundedStep = Math.max(0, Math.min(totalSteps, Math.trunc(step)));
  const completedLevels = Math.floor(boundedStep / stagesPerLevel);
  const atTerminalStep = boundedStep === totalSteps;
  return {
    level: atTerminalStep ? config.levels : completedLevels + 1,
    stage: atTerminalStep ? stagesPerLevel : boundedStep % stagesPerLevel,
    levelComplete: boundedStep > 0 && boundedStep % stagesPerLevel === 0,
    totalSteps
  };
}

export function floorLavaMultiplier(difficulty: FloorLavaDifficulty, step: number): number {
  if (step < 1) return 0;
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const progress = floorLavaProgress(difficulty, step);
  if (step > progress.totalSteps) return 0;
  const stageIndex = (step - 1) % config.safeCounts.length;
  const safeCount = config.safeCounts[stageIndex];
  const finalSafeCount = config.safeCounts.at(-1);
  if (!safeCount || !finalSafeCount) return 0;
  const completedLevels = Math.floor((step - 1) / config.safeCounts.length);
  const cumulativeSurvivalProbability =
    (safeCount / FLOOR_LAVA_STARTING_PLATFORMS) * (finalSafeCount / FLOOR_LAVA_STARTING_PLATFORMS) ** completedLevels;
  return quantizeMultiplier(FLOOR_LAVA_RTP / cumulativeSurvivalProbability);
}

export function floorLavaMaximumMultiplier(difficulty: FloorLavaDifficulty): number {
  return floorLavaMultiplier(difficulty, floorLavaProgress(difficulty, Number.MAX_SAFE_INTEGER).totalSteps);
}

export const FLOOR_LAVA_MAX_MULTIPLIER = Math.max(
  ...(Object.keys(FLOOR_LAVA_DIFFICULTIES) as FloorLavaDifficulty[]).map(floorLavaMaximumMultiplier)
);

export function floorLavaAvailablePlatforms(
  difficulty: FloorLavaDifficulty,
  safeStages: readonly (readonly number[])[],
  clearedSteps: number
): readonly number[] {
  const stagesPerLevel = FLOOR_LAVA_DIFFICULTIES[difficulty].safeCounts.length;
  if (clearedSteps === 0 || clearedSteps % stagesPerLevel === 0) {
    return Array.from({ length: FLOOR_LAVA_STARTING_PLATFORMS }, (_, index) => index);
  }
  return safeStages[clearedSteps - 1] ?? [];
}

export interface FloorLavaPick {
  readonly step: number;
  readonly platform: number;
  readonly safe: boolean;
}

export interface VerifyRequest extends RandomContext {
  readonly usdScale?: 2 | 8;
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly expectedOutcome?: Readonly<Record<string, unknown>>;
  readonly expectedMultiplier?: number;
  readonly wager?: number;
  readonly expectedPayout?: number;
  readonly maxPayout?: number;
  readonly fairnessAction?: string;
}

export interface VerifyResult {
  readonly commitmentValid: boolean;
  readonly outcomeMatches?: boolean;
  readonly settlementMatches?: boolean;
  readonly computed: GameOutcome;
}

export function commitmentFor(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)));
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function hmacBlock(serverSeed: string, context: RandomContext, block: number): Uint8Array {
  const message = [
    FAIRNESS_VERSION,
    context.gameId,
    context.clientSeed,
    String(context.nonce),
    context.action,
    String(block)
  ].join("\u0000");
  return hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(message));
}

export class FairRandom {
  readonly #serverSeed: string;
  readonly #context: RandomContext;
  #block = 0;
  #buffer = new Uint8Array(0);
  #offset = 0;

  constructor(serverSeed: string, context: RandomContext) {
    this.#serverSeed = serverSeed;
    this.#context = context;
  }

  #take(length: number): Uint8Array {
    while (this.#buffer.length - this.#offset < length) {
      const remainder = this.#buffer.subarray(this.#offset);
      this.#buffer = concatBytes(remainder, hmacBlock(this.#serverSeed, this.#context, this.#block));
      this.#offset = 0;
      this.#block += 1;
    }
    const value = this.#buffer.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  uint32(): number {
    const bytes = this.#take(4);
    return (bytes[0] ?? 0) * 0x1_000000 + ((bytes[1] ?? 0) << 16) + ((bytes[2] ?? 0) << 8) + (bytes[3] ?? 0);
  }

  int(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
      throw new Error("maxExclusive must be an integer between 1 and 2^32");
    }
    const rejectionLimit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    let value = this.uint32();
    while (value >= rejectionLimit) value = this.uint32();
    return value % maxExclusive;
  }

  float(): number {
    const bytes = this.#take(6);
    let integer = 0;
    for (const byte of bytes) integer = integer * 256 + byte;
    return integer / 0x1_0000_0000_0000;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("Cannot pick from an empty array");
    const value = values[this.int(values.length)];
    if (value === undefined) throw new Error("Random selection failed");
    return value;
  }
}

export const GATES_SUPER_SCATTER_PAYTABLE = {
  blue: [0.25, 0.75, 2],
  green: [0.4, 0.9, 4],
  yellow: [0.5, 1, 5],
  purple: [0.8, 1.2, 8],
  red: [1, 1.5, 10],
  chalice: [1.5, 2, 12],
  ring: [2, 5, 15],
  hourglass: [2.5, 10, 25],
  crown: [10, 25, 50]
} as const;

export const GATES_SUPER_SCATTER_MULTIPLIERS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500] as const;
export const GATES_SUPER_SCATTER_MAX_WIN = SLOT_MAX_SETTLED_MULTIPLIER;
export const GATES_SUPER_SCATTER_MAX_TUMBLES = 64;
export const GATES_SUPER_SCATTER_MAX_FREE_SPINS = 100;
export const GATES_SUPER_SCATTER_RTP_CALIBRATION = 1;
export const GATES_SUPER_SCATTER_MIN_WAGER = 0.2;
export const GATES_SUPER_SCATTER_MAX_WAGER = 180;

export function gatesSuperScatterCostMultiplierForAction(action: string): number {
  if (action === "buy-free-spins") return 100;
  if (action === "buy-super-free-spins") return 500;
  if (action === "ante-spin") return 1.5;
  return 1;
}

export function gatesSuperScatterRawCapForAction(action: string): number {
  return GATES_SUPER_SCATTER_MAX_WIN * gatesSuperScatterCostMultiplierForAction(action);
}

export type GatesRegularSymbol = keyof typeof GATES_SUPER_SCATTER_PAYTABLE;
export type GatesSymbol = GatesRegularSymbol | "scatter" | "super-scatter" | "multiplier";

export interface GatesCell {
  readonly symbol: GatesSymbol;
  readonly multiplier?: number;
}

export interface GatesRandomSource {
  int(maxExclusive: number): number;
}

interface GatesWin {
  readonly symbol: GatesRegularSymbol;
  readonly count: number;
  readonly payout: number;
  readonly positions: readonly number[];
}

interface GatesTumble {
  readonly index: number;
  readonly grid: readonly GatesCell[];
  readonly winningSymbols: readonly GatesWin[];
  readonly removedPositions: readonly number[];
  readonly rawWin: number;
  readonly multiplierOrbs: readonly { readonly position: number; readonly value: number }[];
  readonly drops: readonly { readonly from: number; readonly to: number }[];
  readonly newPositions: readonly number[];
  readonly nextGrid: readonly GatesCell[];
}

interface GatesTumbleSequence {
  readonly initialGrid: readonly GatesCell[];
  readonly tumbles: readonly GatesTumble[];
  readonly finalGrid: readonly GatesCell[];
  readonly rawWin: number;
  readonly multiplierSum: number;
  readonly totalWin: number;
}

const gatesWeightedSymbols = [
  { symbol: "blue", weight: 130 },
  { symbol: "green", weight: 125 },
  { symbol: "yellow", weight: 120 },
  { symbol: "purple", weight: 115 },
  { symbol: "red", weight: 110 },
  { symbol: "chalice", weight: 105 },
  { symbol: "ring", weight: 100 },
  { symbol: "hourglass", weight: 95 },
  { symbol: "crown", weight: 90 },
  { symbol: "scatter", weight: 25 },
  { symbol: "super-scatter", weight: 1 },
  { symbol: "multiplier", weight: 5 }
] as const satisfies readonly { readonly symbol: GatesSymbol; readonly weight: number }[];

const gatesWeightedMultipliers = [
  { value: 2, weight: 5_010 },
  { value: 3, weight: 2_500 },
  { value: 4, weight: 1_200 },
  { value: 5, weight: 600 },
  { value: 6, weight: 300 },
  { value: 8, weight: 150 },
  { value: 10, weight: 100 },
  { value: 12, weight: 50 },
  { value: 15, weight: 30 },
  { value: 20, weight: 20 },
  { value: 25, weight: 15 },
  { value: 50, weight: 10 },
  { value: 100, weight: 8 },
  { value: 250, weight: 5 },
  { value: 500, weight: 2 }
] as const satisfies readonly {
  readonly value: (typeof GATES_SUPER_SCATTER_MULTIPLIERS)[number];
  readonly weight: number;
}[];

function roundedMultiplier(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function gatesWeightedSymbol(random: GatesRandomSource, allowSuperScatter: boolean, ante = false): GatesSymbol {
  const candidates = allowSuperScatter
    ? gatesWeightedSymbols
    : gatesWeightedSymbols.filter((entry) => entry.symbol !== "super-scatter");
  const weightFor = (entry: (typeof candidates)[number]) =>
    ante && (entry.symbol === "scatter" || entry.symbol === "super-scatter") ? entry.weight * 2 : entry.weight;
  const totalWeight = candidates.reduce((sum, entry) => sum + weightFor(entry), 0);
  let cursor = random.int(totalWeight);
  for (const entry of candidates) {
    const weight = weightFor(entry);
    if (cursor < weight) return entry.symbol;
    cursor -= weight;
  }
  return "blue";
}

function gatesCell(
  random: GatesRandomSource,
  allowSuperScatter: boolean,
  ante = false,
  minimumMultiplier = 2
): GatesCell {
  const symbol = gatesWeightedSymbol(random, allowSuperScatter, ante);
  if (symbol !== "multiplier") return { symbol };
  const totalWeight = gatesWeightedMultipliers.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(totalWeight);
  for (const entry of gatesWeightedMultipliers) {
    if (cursor < entry.weight) return { symbol, multiplier: Math.max(minimumMultiplier, entry.value) };
    cursor -= entry.weight;
  }
  return { symbol, multiplier: 2 };
}

function gatesGrid(
  random: GatesRandomSource,
  allowSuperScatter: boolean,
  ante = false,
  minimumMultiplier = 2
): readonly GatesCell[] {
  return Array.from({ length: 30 }, () => gatesCell(random, allowSuperScatter, ante, minimumMultiplier));
}

function gatesFeatureTriggerGrid(random: GatesRandomSource, superFeature: boolean): readonly GatesCell[] {
  const grid = [...gatesGrid(random, true, false, superFeature ? 10 : 2)];
  const scatterCount = 4 + random.int(3);
  const available = Array.from({ length: 30 }, (_, index) => index);
  for (let index = 0; index < scatterCount; index += 1) {
    const selected = random.int(available.length);
    const position = available.splice(selected, 1)[0] ?? index;
    grid[position] = { symbol: superFeature && index === 0 ? "super-scatter" : "scatter" };
  }
  return grid;
}

function gatesSymbolPayout(symbol: GatesRegularSymbol, count: number): number {
  if (count < 8) return 0;
  const tier = count >= 12 ? 2 : count >= 10 ? 1 : 0;
  return GATES_SUPER_SCATTER_PAYTABLE[symbol][tier];
}

function gatesWins(grid: readonly GatesCell[]): readonly GatesWin[] {
  return (Object.keys(GATES_SUPER_SCATTER_PAYTABLE) as GatesRegularSymbol[]).flatMap((symbol) => {
    const positions = grid.flatMap((cell, index) => (cell.symbol === symbol ? [index] : []));
    const payout = gatesSymbolPayout(symbol, positions.length);
    return payout > 0 ? [{ symbol, count: positions.length, payout, positions }] : [];
  });
}

function gatesTumbleSequence(
  random: GatesRandomSource,
  initialGrid: readonly GatesCell[],
  allowSuperScatter: boolean,
  ante = false,
  minimumMultiplier = 2
): GatesTumbleSequence {
  let current = [...initialGrid];
  const tumbles: GatesTumble[] = [];
  let rawWin = 0;
  let multiplierSum = 0;
  for (let index = 0; index < GATES_SUPER_SCATTER_MAX_TUMBLES; index += 1) {
    const winningSymbols = gatesWins(current);
    if (winningSymbols.length === 0) break;
    const multiplierOrbs = current.flatMap((cell, position) =>
      cell.symbol === "multiplier" && typeof cell.multiplier === "number" ? [{ position, value: cell.multiplier }] : []
    );
    const removedPositions = [
      ...new Set([...winningSymbols.flatMap((win) => win.positions), ...multiplierOrbs.map((orb) => orb.position)])
    ].sort((left, right) => left - right);
    const tumbleWin = roundedMultiplier(winningSymbols.reduce((sum, win) => sum + win.payout, 0));
    rawWin = roundedMultiplier(rawWin + tumbleWin);
    multiplierSum += multiplierOrbs.reduce((sum, orb) => sum + orb.value, 0);
    const removed = new Set(removedPositions);
    const nextGrid = Array<GatesCell>(30);
    const drops: { from: number; to: number }[] = [];
    const newPositions: number[] = [];
    for (let column = 0; column < 6; column += 1) {
      const survivors = Array.from({ length: 5 }, (_, row) => row * 6 + column).filter(
        (position) => !removed.has(position)
      );
      const refillCount = 5 - survivors.length;
      for (let row = 0; row < refillCount; row += 1) {
        const position = row * 6 + column;
        nextGrid[position] = gatesCell(random, allowSuperScatter, ante, minimumMultiplier);
        newPositions.push(position);
      }
      survivors.forEach((from, survivorIndex) => {
        const to = (refillCount + survivorIndex) * 6 + column;
        nextGrid[to] = current[from] as GatesCell;
        drops.push({ from, to });
      });
    }
    tumbles.push({
      index,
      grid: current,
      winningSymbols,
      removedPositions,
      rawWin: tumbleWin,
      multiplierOrbs,
      drops,
      newPositions,
      nextGrid
    });
    current = nextGrid;
  }
  return {
    initialGrid,
    tumbles,
    finalGrid: current,
    rawWin,
    multiplierSum,
    totalWin: roundedMultiplier(rawWin * (multiplierSum > 0 ? multiplierSum : 1))
  };
}

function gatesScatterPayout(scatterCount: number): number {
  return scatterCount >= 6 ? 100 : scatterCount === 5 ? 5 : scatterCount === 4 ? 3 : 0;
}

function gatesSuperScatterPayout(superScatterCount: number): number {
  return [0, 100, 500, 5_000, 50_000][Math.min(4, Math.max(0, superScatterCount))] ?? 0;
}

/**
 * Transparent, deterministic demo model. These public weights/paytable are not
 * proprietary reel strips and do not claim the commercial game's certified RTP.
 */
export function resolveGatesSuperScatter(random: GatesRandomSource, action = "spin"): GameOutcome {
  const ante = action === "ante-spin";
  const boughtFeature = action === "buy-free-spins" || action === "buy-super-free-spins";
  const superFeature = action === "buy-super-free-spins";
  const minimumMultiplier = superFeature ? 10 : 2;
  const rawCap = gatesSuperScatterRawCapForAction(action);
  const initialGrid = boughtFeature
    ? gatesFeatureTriggerGrid(random, superFeature)
    : gatesGrid(random, true, ante, minimumMultiplier);
  const sequence = gatesTumbleSequence(random, initialGrid, true, ante, minimumMultiplier);
  const regularScatterCount = initialGrid.filter((cell) => cell.symbol === "scatter").length;
  const superScatterCount = initialGrid.filter((cell) => cell.symbol === "super-scatter").length;
  const qualifyingScatterCount = regularScatterCount + superScatterCount;
  const bonusTriggered = qualifyingScatterCount >= 4;
  const scatterAward = bonusTriggered ? gatesScatterPayout(qualifyingScatterCount) : 0;
  const superScatterAward = bonusTriggered ? gatesSuperScatterPayout(superScatterCount) : 0;

  const freeSpinTranscripts: Array<Readonly<Record<string, unknown>>> = [];
  let awardedFreeSpins = bonusTriggered ? 15 : 0;
  let persistentMultiplier = 1;
  let bonusWin = 0;
  for (let spin = 0; spin < awardedFreeSpins && spin < GATES_SUPER_SCATTER_MAX_FREE_SPINS; spin += 1) {
    const freeInitialGrid = gatesGrid(random, false, false, minimumMultiplier);
    const freeSequence = gatesTumbleSequence(random, freeInitialGrid, false, false, minimumMultiplier);
    const freeScatterCount = freeInitialGrid.filter((cell) => cell.symbol === "scatter").length;
    const retriggeredSpins = freeScatterCount >= 3 ? 5 : 0;
    awardedFreeSpins = Math.min(GATES_SUPER_SCATTER_MAX_FREE_SPINS, awardedFreeSpins + retriggeredSpins);
    persistentMultiplier += freeSequence.multiplierSum;
    const freeScatterAward = gatesScatterPayout(freeScatterCount);
    const spinWin = roundedMultiplier(freeSequence.rawWin * persistentMultiplier + freeScatterAward);
    bonusWin = roundedMultiplier(bonusWin + spinWin);
    freeSpinTranscripts.push({
      spin: spin + 1,
      initialGrid: freeSequence.initialGrid,
      tumbles: freeSequence.tumbles,
      finalGrid: freeSequence.finalGrid,
      rawWin: freeSequence.rawWin,
      landedMultiplier: freeSequence.multiplierSum,
      totalMultiplier: persistentMultiplier,
      scatterCount: freeScatterCount,
      retriggeredSpins,
      win: spinWin
    });
    if (sequence.totalWin + scatterAward + superScatterAward + bonusWin >= rawCap) break;
  }

  const rawTotal = roundedMultiplier(sequence.totalWin + scatterAward + superScatterAward + bonusWin);
  const uncappedTotal = roundedMultiplier(rawTotal * GATES_SUPER_SCATTER_RTP_CALIBRATION);
  const finalMultiplier = quantizeSlotMultiplier(Math.min(rawCap, uncappedTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "gates-super-scatter",
      action,
      ante,
      boughtFeature,
      superFeature,
      columns: 6,
      rows: 5,
      initialGrid: sequence.initialGrid,
      tumbles: sequence.tumbles,
      finalGrid: sequence.finalGrid,
      rawWin: sequence.rawWin,
      multiplierSum: sequence.multiplierSum,
      baseGameWin: sequence.totalWin,
      regularScatterCount,
      superScatterCount,
      qualifyingScatterCount,
      scatterAward,
      superScatterAward,
      bonusTriggered,
      bonus: {
        awardedSpins: awardedFreeSpins,
        playedSpins: freeSpinTranscripts.length,
        finalMultiplier: persistentMultiplier,
        win: bonusWin,
        spins: freeSpinTranscripts
      },
      rawTotal,
      rtpCalibration: GATES_SUPER_SCATTER_RTP_CALIBRATION,
      uncappedTotal,
      maxWinCap: rawCap,
      finalMultiplier
    }
  };
}

export interface DragonTowerPick {
  readonly floor: number;
  readonly column: number;
  readonly safe: boolean;
}

export interface TowerPick {
  readonly floor: number;
  readonly column: number;
  readonly safe: boolean;
}

export const MOLES_HOLE_COUNT = 7;
export const MOLES_MIN_COUNT = 1;
export const MOLES_MAX_COUNT = 6;
export const MOLES_MAX_STEPS = 6;
export const MOLES_RTP = 0.96;

export function molesMultiplier(moles: number, step: number): number {
  const count = Math.min(MOLES_MAX_COUNT, Math.max(MOLES_MIN_COUNT, Math.round(moles)));
  const completedSteps = Math.min(MOLES_MAX_STEPS, Math.max(0, Math.floor(step)));
  if (completedSteps === 0) return 0;
  return Math.floor((MOLES_RTP * (MOLES_HOLE_COUNT / count) ** completedSteps + Number.EPSILON) * 100) / 100;
}

// Legal Moles rounds stop after `moles` picks. Six picks with one mole is not
// reachable and must not determine the wager/exposure limit.
export const MOLES_MAX_MULTIPLIER = Math.max(
  ...Array.from({ length: MOLES_MAX_COUNT - MOLES_MIN_COUNT + 1 }, (_, index) =>
    molesMultiplier(index + MOLES_MIN_COUNT, index + MOLES_MIN_COUNT)
  )
);

export interface MolesPick {
  readonly step: number;
  readonly tile: number;
  readonly safe: boolean;
}

interface MolesRound {
  readonly id: string;
  readonly moles: number;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: MolesPick[];
  step: number;
}

interface MinesRound {
  readonly id: string;
  readonly gridSize: 25 | 36 | 49 | 64;
  readonly mineCount: number;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly mines: readonly number[];
  readonly revealed: number[];
}

interface ThirteenCardFlipRound {
  readonly id: string;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly hands: Readonly<Record<"a" | "b", readonly ThirteenCardFlipCard[]>>;
  readonly playerChoices: number[];
}

interface VideoPokerRound {
  readonly id: string;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly deck: readonly VideoPokerCardCode[];
}

function molesCountFromAction(action: string): number {
  const count = Number(action.match(/^start:([1-6])$/)?.[1]);
  if (!Number.isSafeInteger(count) || count < MOLES_MIN_COUNT || count > MOLES_MAX_COUNT) {
    throw new Error("Invalid Moles count");
  }
  return count;
}

function minesConfigurationFromAction(action: string): {
  readonly gridSize: 25 | 36 | 49 | 64;
  readonly mineCount: number;
} {
  const match = /^start:(25|36|49|64):(\d+)$/.exec(action);
  const gridSize = Number(match?.[1]);
  const mineCount = Number(match?.[2]);
  if (
    !MINES_GRID_SIZES.includes(gridSize as 25 | 36 | 49 | 64) ||
    !Number.isSafeInteger(mineCount) ||
    mineCount < 1 ||
    mineCount >= gridSize
  ) {
    throw new Error("Invalid Midnight Mines configuration");
  }
  return { gridSize: gridSize as 25 | 36 | 49 | 64, mineCount };
}

export function generateMinesLayout(serverSeed: string, context: RandomContext): readonly number[] {
  if (context.gameId !== "rainbet-mines") {
    throw new Error("Midnight Mines layout requires the rainbet-mines game ID");
  }
  const { gridSize, mineCount } = minesConfigurationFromAction(context.action);
  const random = new FairRandom(serverSeed, context);
  const positions = Array.from({ length: gridSize }, (_, index) => index);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const target = random.int(index + 1);
    const current = positions[index];
    const replacement = positions[target];
    if (current === undefined || replacement === undefined) throw new Error("Midnight Mines shuffle failed");
    positions[index] = replacement;
    positions[target] = current;
  }
  return positions.slice(0, mineCount).sort((left, right) => left - right);
}

export function generateMolesLayout(serverSeed: string, context: RandomContext): readonly (readonly number[])[] {
  if (context.gameId !== "moles") throw new Error("Moles layout requires the moles game ID");
  const count = molesCountFromAction(context.action);
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: MOLES_MAX_STEPS }, () => {
    const holes = Array.from({ length: MOLES_HOLE_COUNT }, (_, index) => index);
    for (let index = holes.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      const current = holes[index];
      const replacement = holes[swap];
      if (current === undefined || replacement === undefined) throw new Error("Moles shuffle failed");
      holes[index] = replacement;
      holes[swap] = current;
    }
    return holes.slice(0, count).sort((left, right) => left - right);
  });
}

interface DragonTowerRound {
  readonly id: string;
  readonly difficulty: DragonTowerDifficulty;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: DragonTowerPick[];
  floor: number;
}

interface TowerRound {
  readonly id: string;
  readonly difficulty: TowerDifficulty;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: TowerPick[];
  floor: number;
}

interface ChickenRound {
  readonly id: string;
  readonly difficulty: ChickenDifficulty;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly lanes: readonly ChickenLaneResolution[];
  readonly crossings: ChickenLaneResolution[];
  step: number;
}

interface FloorLavaRound {
  readonly id: string;
  readonly difficulty: FloorLavaDifficulty;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly safeStages: readonly (readonly number[])[];
  readonly picks: FloorLavaPick[];
  step: number;
}

interface PumpRound {
  readonly id: string;
  readonly difficulty: PumpDifficulty;
  readonly wager: number;
  readonly nonce: number;
  readonly fairnessAction: string;
  readonly popPoint: number;
  step: number;
}

function isChickenDifficulty(value: unknown): value is ChickenDifficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert";
}

function chickenDifficultyFromAction(action: string): ChickenDifficulty {
  const difficulty =
    action.match(/^start:(easy|medium|hard|expert)$/)?.[1] ??
    action.match(/:difficulty:(easy|medium|hard|expert)(?::|$)/)?.[1];
  if (action.includes(":difficulty:") && difficulty === undefined) throw new Error("Invalid Chicken difficulty");
  return isChickenDifficulty(difficulty) ? difficulty : "medium";
}

function chickenStepFromAction(action: string): number {
  const raw = action.match(/:step:(\d+)(?::|$)/)?.[1];
  if (action.includes(":step:") && raw === undefined) throw new Error("Invalid Chicken step");
  return raw === undefined ? 0 : Number(raw);
}

export function generateChickenPath(serverSeed: string, context: RandomContext): readonly ChickenLaneResolution[] {
  if (context.gameId !== "chicken-cross") throw new Error("Chicken path requires the chicken-cross game ID");
  const difficulty = chickenDifficultyFromAction(context.action);
  const multipliers = CHICKEN_PATHS[difficulty];
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  return multipliers.map((multiplier, index) => {
    const successChance = index === 0 ? CHICKEN_RTP / multiplier : (multipliers[index - 1] ?? 1) / multiplier;
    return {
      lane: index + 1,
      multiplier,
      successChance,
      success: random.float() < successChance
    };
  });
}

function floorLavaDifficultyFromAction(action: string): FloorLavaDifficulty {
  const difficulty =
    action.match(/^start:(easy|medium|hard|toxic)$/)?.[1] ??
    action.match(/:difficulty:(easy|medium|hard|toxic)(?::|$)/)?.[1];
  if (!isFloorLavaDifficulty(difficulty)) throw new Error("Invalid Floor Is Lava difficulty");
  return difficulty;
}

export function generateFloorLavaField(serverSeed: string, context: RandomContext): readonly (readonly number[])[] {
  if (context.gameId !== "floor-is-lava") throw new Error("Floor Is Lava field requires its canonical game ID");
  const difficulty = floorLavaDifficultyFromAction(context.action);
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const stages: number[][] = [];
  for (let level = 0; level < config.levels; level += 1) {
    const platforms = Array.from({ length: FLOOR_LAVA_STARTING_PLATFORMS }, (_, index) => index);
    for (let index = platforms.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      const current = platforms[index];
      const replacement = platforms[swap];
      if (current === undefined || replacement === undefined) throw new Error("Floor Is Lava shuffle failed");
      platforms[index] = replacement;
      platforms[swap] = current;
    }
    for (const count of config.safeCounts) {
      stages.push(platforms.slice(0, count).sort((left, right) => left - right));
    }
  }
  return stages;
}

function dragonTowerDifficultyFromAction(action: string): DragonTowerDifficulty {
  const difficulty = action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
  if (!isDragonTowerDifficulty(difficulty)) throw new Error("Invalid Dragon Tower difficulty");
  return difficulty;
}

export function generateDragonTowerLayout(serverSeed: string, context: RandomContext): readonly (readonly number[])[] {
  if (context.gameId !== "dragon-tower") throw new Error("Dragon Tower layout requires the dragon-tower game ID");
  const difficulty = dragonTowerDifficultyFromAction(context.action);
  const config = DRAGON_TOWER_DIFFICULTIES[difficulty];
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: DRAGON_TOWER_FLOORS }, () => {
    const columns = Array.from({ length: config.tiles }, (_, column) => column);
    for (let index = columns.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      const current = columns[index];
      const replacement = columns[swap];
      if (current === undefined || replacement === undefined) throw new Error("Dragon Tower shuffle failed");
      columns[index] = replacement;
      columns[swap] = current;
    }
    return columns.slice(0, config.safeTiles).sort((left, right) => left - right);
  });
}

function towerDifficultyFromAction(action: string): TowerDifficulty {
  const difficulty = action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
  if (!isTowerDifficulty(difficulty)) throw new Error("Invalid Tower difficulty");
  return difficulty;
}

export function generateTowerLayout(serverSeed: string, context: RandomContext): readonly (readonly number[])[] {
  if (context.gameId !== "tower") throw new Error("Tower layout requires the tower game ID");
  const difficulty = towerDifficultyFromAction(context.action);
  const config = TOWER_DIFFICULTIES[difficulty];
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: TOWER_FLOORS }, () => {
    const columns = Array.from({ length: config.tiles }, (_, column) => column);
    for (let index = columns.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      const current = columns[index];
      const replacement = columns[swap];
      if (current === undefined || replacement === undefined) throw new Error("Tower shuffle failed");
      columns[index] = replacement;
      columns[swap] = current;
    }
    return columns.slice(0, config.safeTiles).sort((left, right) => left - right);
  });
}

export const KENO_RISKS = ["Classic", "Low", "Medium", "High", "Extreme"] as const;
export type KenoRisk = (typeof KENO_RISKS)[number];

export const KENO_PAYTABLES: Readonly<Record<KenoRisk, Readonly<Record<number, readonly number[]>>>> =
  Object.fromEntries(
    KENO_RISKS.map((risk) => [
      risk,
      Object.fromEntries(
        Object.entries(SHARED_KENO_PAYTABLES[risk]).map(([picks, row]) => [
          Number(picks),
          row.map((multiplier) => Number(multiplier.replaceAll(",", "").replace("x", "")))
        ])
      )
    ])
  ) as unknown as Record<KenoRisk, Record<number, readonly number[]>>;

/** Classic remains the backwards-compatible default for older Keno actions. */
export const KENO_PAYTABLE = KENO_PAYTABLES.Classic;

function kenoConfiguration(action: string): { readonly risk: KenoRisk; readonly selected: readonly number[] } {
  const configured = /^numbers:(classic|low|medium|high|extreme):(.*)$/i.exec(action);
  const risk = configured
    ? (KENO_RISKS.find((candidate) => candidate.toLowerCase() === configured[1]?.toLowerCase()) ?? "Classic")
    : "Classic";
  const numberSource = configured?.[2] ?? (action.startsWith("numbers:") ? action.slice("numbers:".length) : "");
  const selected = numberSource
    ? numberSource
        .split(",")
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 40)
        .slice(0, 10)
    : [Number(action.match(/tile:(\d+)/)?.[1] ?? 0) + 1];
  return { risk, selected: [...new Set(selected)] };
}

export const PLINKO_PAYTABLE = SHARED_RAINBET_PLINKO_PAYTABLES.low[8];

export const PLINKO_TARGET_RTP = SHARED_PLINKO_TARGET_RTP;
export const PLINKO_RTP_TOLERANCE = SHARED_PLINKO_RTP_TOLERANCE;
export const RAINBET_PLINKO_RISKS = ["low", "medium", "high", "rain"] as const;
export type RainbetPlinkoRisk = (typeof RAINBET_PLINKO_RISKS)[number];

export const RAINBET_PLINKO_PAYTABLES: Readonly<
  Record<RainbetPlinkoRisk, Readonly<Record<number, readonly number[]>>>
> = SHARED_RAINBET_PLINKO_PAYTABLES as unknown as Readonly<
  Record<RainbetPlinkoRisk, Readonly<Record<number, readonly number[]>>>
>;

export const RAINBET_PLINKO_MAX_MULTIPLIER = Math.max(
  ...Object.values(RAINBET_PLINKO_PAYTABLES).flatMap((tables) => Object.values(tables).flat())
);

export function rainbetPlinkoPaytable(risk: RainbetPlinkoRisk, rows: number): readonly number[] {
  const paytable = RAINBET_PLINKO_PAYTABLES[risk][rows];
  if (!paytable) throw new Error("Rainbet Plinko rows must be an integer from 8 through 16");
  return paytable;
}

export function settleRainbetPlinkoPath(
  risk: RainbetPlinkoRisk,
  rows: number,
  path: readonly ("left" | "right")[]
): GameOutcome {
  if (path.length !== rows) throw new Error("Rainbet Plinko paths must contain one decision per row");
  const slot = path.filter((turn) => turn === "right").length;
  const multiplier = rainbetPlinkoPaytable(risk, rows)[slot];
  if (multiplier === undefined) throw new Error("Rainbet Plinko path resolved outside the configured board");
  return { multiplier, outcome: { kind: "plinko", slot, path, rows, risk } };
}

export function rainbetPlinkoConfiguration(
  action: string
): { readonly risk: RainbetPlinkoRisk; readonly rows: number } | undefined {
  const match = /^drop:(low|medium|high|rain):(8|9|10|11|12|13|14|15|16)$/.exec(action);
  if (!match?.[1] || !match[2]) return undefined;
  return { risk: match[1] as RainbetPlinkoRisk, rows: Number(match[2]) };
}

const slots = (
  random: FairRandom,
  gameId: EnabledGameId,
  midasMathVersion?: RandomContext["midasMathVersion"]
): GameOutcome => resolveFairSlot(random, gameId as FairSlotGameId, midasMathVersion);

const board = (random: FairRandom, gameId: EnabledGameId, action: string): GameOutcome => {
  if (gameId === "keno") {
    const pool = Array.from({ length: 40 }, (_, index) => index + 1);
    const draw: number[] = [];
    while (draw.length < 10) {
      const index = random.int(pool.length);
      const [number] = pool.splice(index, 1);
      if (number !== undefined) draw.push(number);
    }
    const { risk, selected: uniqueSelected } = kenoConfiguration(action);
    const matchedNumbers = uniqueSelected.filter((number) => draw.includes(number));
    const payoutByMatches = KENO_PAYTABLES[risk][uniqueSelected.length] ?? [];
    const multiplier = payoutByMatches[matchedNumbers.length] ?? 0;
    return {
      multiplier,
      outcome: { kind: "keno", risk, selected: uniqueSelected, draw, matchedNumbers, matches: matchedNumbers.length }
    };
  }
  const requestedTile = Number(action.match(/tile:(\d+)/)?.[1] ?? 0);
  const boardSize = gameId === "moles" ? MOLES_HOLE_COUNT : 25;
  const hazardsNeeded = gameId === "moles" ? 3 : 5;
  const hazardLocations: number[] = [];
  while (hazardLocations.length < hazardsNeeded) {
    const location = random.int(boardSize);
    if (!hazardLocations.includes(location)) hazardLocations.push(location);
  }
  const safe = gameId === "moles" ? hazardLocations.includes(requestedTile) : !hazardLocations.includes(requestedTile);
  return {
    multiplier: safe ? (gameId === "moles" ? molesMultiplier(3, 1) : TARGET_RTP / 0.8) : 0,
    outcome: {
      kind: gameId === "moles" ? "moles" : "nullfield",
      safe,
      tile: requestedTile,
      ...(gameId === "moles" ? { moleLocations: hazardLocations } : { nullLocations: hazardLocations })
    }
  };
};

const climb = (random: FairRandom, gameId: EnabledGameId, action: string): GameOutcome => {
  if (gameId === "rps-ascent") {
    const choices = ["rock", "paper", "scissors"] as const;
    const player = choices.find((choice) => action.toLowerCase().includes(choice)) ?? "rock";
    const opponent = random.pick(choices);
    const draw = player === opponent;
    const success =
      (player === "rock" && opponent === "scissors") ||
      (player === "paper" && opponent === "rock") ||
      (player === "scissors" && opponent === "paper");
    const step = success ? 1 : 0;
    return {
      multiplier: draw ? 1 : success ? 1.91 : 0,
      outcome: {
        kind: "rps-ascent",
        success,
        draw,
        player,
        opponent,
        step,
        ascent: Array.from({ length: step }, (_, index) => index + 1)
      }
    };
  }
  const difficulty = chickenDifficultyFromAction(action);
  const nextMultiplier = CHICKEN_PATHS[difficulty][0];
  const successChance = CHICKEN_RTP / nextMultiplier;
  const success = random.float() < successChance;
  const step = success ? 1 : 0;
  return {
    multiplier: success ? nextMultiplier : 0,
    outcome: {
      kind: "chicken-cross",
      difficulty,
      success,
      successChance,
      step,
      collisionLane: success ? null : 1
    }
  };
};

export const PRISM_DECK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const PRISM_DECK_SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

export type PrismDeckRank = (typeof PRISM_DECK_RANKS)[number];
export type PrismDeckSuit = (typeof PRISM_DECK_SUITS)[number];
export type PrismDeckDirection = "higher" | "lower";
export const PRISM_DECK_TARGET_RTP = 0.96;

export interface PrismDeckCard {
  readonly id: string;
  readonly rank: PrismDeckRank;
  readonly value: number;
  readonly suit: PrismDeckSuit;
  readonly red: boolean;
}

function prismDeckCard(index: number): PrismDeckCard {
  const value = (index % PRISM_DECK_RANKS.length) + 1;
  const rank = PRISM_DECK_RANKS[value - 1];
  const suit = PRISM_DECK_SUITS[Math.floor(index / PRISM_DECK_RANKS.length)];
  if (!rank || !suit) throw new Error("Prism Deck card index is out of range");
  return {
    id: `${rank}-${suit}`,
    rank,
    value,
    suit,
    red: suit === "hearts" || suit === "diamonds"
  };
}

export const PRISM_DECK_OPENING_CARD: PrismDeckCard = prismDeckCard(45);

function prismDeckCardIndex(card: PrismDeckCard): number {
  const rankIndex = PRISM_DECK_RANKS.indexOf(card.rank);
  const suitIndex = PRISM_DECK_SUITS.indexOf(card.suit);
  if (rankIndex < 0 || suitIndex < 0) throw new Error("Prism Deck card is invalid");
  return suitIndex * PRISM_DECK_RANKS.length + rankIndex;
}

/** Each v4 guess is a separate wager. Its visible card is committed before
 * fresh ticket entropy is drawn; either direction has the same bounded RTP. */
export function prismDeckAction(direction: PrismDeckDirection, card: PrismDeckCard): string {
  if (direction !== "higher" && direction !== "lower") throw new Error("Invalid Prism Deck direction");
  return `prism:v4:${direction}:${prismDeckCardIndex(card)}`;
}

export function parsePrismDeckAction(action: string): { direction: PrismDeckDirection; currentIndex: number } {
  const match = /^prism:v4:(higher|lower):(0|[1-9][0-9]?)$/.exec(action);
  if (!match || Number(match[2]) > 51) throw new Error("Invalid committed Prism Deck action");
  return { direction: match[1] as PrismDeckDirection, currentIndex: Number(match[2]) };
}

function nextPrismDeckCard(
  serverSeed: string,
  clientSeed: string,
  position: number,
  current: PrismDeckCard
): PrismDeckCard {
  const random = new FairRandom(serverSeed, {
    gameId: "prism-deck",
    clientSeed,
    nonce: position - 1,
    action: "prism-deck-sequence-v3"
  });
  const currentIndex = prismDeckCardIndex(current);
  const candidate = random.int(PRISM_DECK_RANKS.length * PRISM_DECK_SUITS.length - 1);
  return prismDeckCard(candidate >= currentIndex ? candidate + 1 : candidate);
}

/**
 * Returns the authoritative visible card at a sequence position. Position zero
 * is the free opening card. Every later position draws uniformly from the 51
 * cards other than the current exact card. This is an infinite-deck sequence:
 * cards can return after another card, but never repeat consecutively. Every
 * position uses its own action-independent HMAC domain, so changing a call from
 * Higher to Lower cannot change the deal.
 */
export function prismDeckCardAt(serverSeed: string, clientSeed: string, position: number): PrismDeckCard {
  if (!Number.isSafeInteger(position) || position < 0)
    throw new Error("Prism Deck position must be a non-negative integer");
  let card = PRISM_DECK_OPENING_CARD;
  for (let nextPosition = 1; nextPosition <= position; nextPosition += 1)
    card = nextPrismDeckCard(serverSeed, clientSeed, nextPosition, card);
  return card;
}

export function prismDeckWinProbability(direction: PrismDeckDirection, currentValue: number): number {
  if (!Number.isInteger(currentValue) || currentValue < 1 || currentValue > PRISM_DECK_RANKS.length)
    throw new Error("Prism Deck rank value must be an integer from 1 through 13");
  const winningRanks = direction === "higher" ? PRISM_DECK_RANKS.length + 1 - currentValue : currentValue;
  const winningCards = winningRanks * PRISM_DECK_SUITS.length - 1;
  return winningCards / (PRISM_DECK_RANKS.length * PRISM_DECK_SUITS.length - 1);
}

export function evaluatePrismDeckChoice(
  direction: PrismDeckDirection,
  currentCard: Pick<PrismDeckCard, "value">,
  nextCard: Pick<PrismDeckCard, "value">
): boolean {
  return direction === "higher" ? nextCard.value >= currentCard.value : nextCard.value <= currentCard.value;
}

const cards = (serverSeed: string, context: RandomContext): GameOutcome => {
  const committed = context.action.startsWith("prism:") ? parsePrismDeckAction(context.action) : undefined;
  const currentCard = committed ? prismDeckCard(committed.currentIndex) : prismDeckCardAt(serverSeed, context.clientSeed, context.nonce);
  let nextCard: PrismDeckCard;
  if (committed) {
    const random = new FairRandom(serverSeed, { ...context, action: `prism-deck-committed-card-v4:${committed.currentIndex}` });
    const candidate = random.int(51);
    nextCard = prismDeckCard(candidate >= committed.currentIndex ? candidate + 1 : candidate);
  } else {
    // Preserve historical sequence-v3 transcripts exactly.
    nextCard = prismDeckCardAt(serverSeed, context.clientSeed, context.nonce + 1);
  }
  const direction: PrismDeckDirection = committed?.direction ?? (context.action.toLowerCase().includes("lower") ? "lower" : "higher");
  const won = evaluatePrismDeckChoice(direction, currentCard, nextCard);
  const draw = nextCard.value === currentCard.value;
  const probability = prismDeckWinProbability(direction, currentCard.value);
  const stepPayout = quantizeMultiplier(PRISM_DECK_TARGET_RTP / probability);
  return {
    multiplier: won ? stepPayout : 0,
    outcome: {
      kind: "cards",
      current: currentCard.value,
      next: nextCard.value,
      currentCard,
      nextCard,
      direction,
      won,
      draw,
      probability,
      stepPayout,
      deck: [currentCard, nextCard]
    }
  };
};

export const BACCARAT_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const BACCARAT_SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;

export type BaccaratRank = (typeof BACCARAT_RANKS)[number];
export type BaccaratSuit = (typeof BACCARAT_SUITS)[number];
export type BaccaratBet = "player" | "tie" | "banker";
export type BaccaratWinner = BaccaratBet;

export interface BaccaratCard {
  readonly id: string;
  readonly deck: number;
  readonly rank: BaccaratRank;
  readonly suit: BaccaratSuit;
  readonly value: number;
}

export function baccaratCardValue(rank: BaccaratRank): number {
  if (rank === "A") return 1;
  const value = Number(rank);
  return Number.isInteger(value) && value >= 2 && value <= 9 ? value : 0;
}

export function baccaratTotal(cards: readonly Pick<BaccaratCard, "value">[]): number {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

export function baccaratPlayerDraws(total: number): boolean {
  return total >= 0 && total <= 5;
}

export function baccaratBankerDraws(total: number, playerThirdValue?: number): boolean {
  if (total < 0 || total > 7) return false;
  if (playerThirdValue === undefined) return total <= 5;
  if (total <= 2) return true;
  if (total === 3) return playerThirdValue !== 8;
  if (total === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (total === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (total === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}

export function baccaratWinner(playerTotal: number, bankerTotal: number): BaccaratWinner {
  if (playerTotal === bankerTotal) return "tie";
  return playerTotal > bankerTotal ? "player" : "banker";
}

export function baccaratMultiplier(bet: BaccaratBet, winner: BaccaratWinner): number {
  if (winner === "tie") return bet === "tie" ? 9 : 1;
  if (bet !== winner) return 0;
  return winner === "banker" ? 1.95 : 2;
}

export function createBaccaratShoe(random: FairRandom): readonly BaccaratCard[] {
  const shoe: BaccaratCard[] = [];
  for (let deck = 0; deck < 8; deck += 1) {
    for (const suit of BACCARAT_SUITS) {
      for (const rank of BACCARAT_RANKS) {
        shoe.push({ id: `deck-${deck}-${suit}-${rank}`, deck, rank, suit, value: baccaratCardValue(rank) });
      }
    }
  }
  for (let index = shoe.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    const currentCard = shoe[index];
    const swapCard = shoe[swap];
    if (!currentCard || !swapCard) throw new Error("Baccarat shoe shuffle failed");
    shoe[index] = swapCard;
    shoe[swap] = currentCard;
  }
  return shoe;
}

const baccarat = (random: FairRandom, action: string): GameOutcome => {
  const actionBet = action.match(/^bet:(player|tie|banker)$/)?.[1];
  const bet: BaccaratBet = actionBet === "tie" || actionBet === "banker" ? actionBet : "player";
  const shoe = createBaccaratShoe(random);
  let cursor = 0;
  const dealOrder: BaccaratCard[] = [];
  const draw = (): BaccaratCard => {
    const card = shoe[cursor];
    if (!card) throw new Error("Baccarat shoe exhausted");
    cursor += 1;
    dealOrder.push(card);
    return card;
  };

  const playerCards: BaccaratCard[] = [draw()];
  const bankerCards: BaccaratCard[] = [draw()];
  playerCards.push(draw());
  bankerCards.push(draw());

  const initialPlayerTotal = baccaratTotal(playerCards);
  const initialBankerTotal = baccaratTotal(bankerCards);
  const natural = initialPlayerTotal >= 8 || initialBankerTotal >= 8;
  let playerThird: BaccaratCard | undefined;
  if (!natural && baccaratPlayerDraws(initialPlayerTotal)) {
    playerThird = draw();
    playerCards.push(playerThird);
  }
  if (!natural && baccaratBankerDraws(initialBankerTotal, playerThird?.value)) bankerCards.push(draw());

  const playerTotal = baccaratTotal(playerCards);
  const bankerTotal = baccaratTotal(bankerCards);
  const winner = baccaratWinner(playerTotal, bankerTotal);
  return {
    multiplier: baccaratMultiplier(bet, winner),
    outcome: {
      kind: "baccarat",
      bet,
      winner,
      natural,
      player: { cards: playerCards, total: playerTotal, drewThird: playerCards.length === 3 },
      banker: { cards: bankerCards, total: bankerTotal, drewThird: bankerCards.length === 3 },
      dealOrder
    }
  };
};

export const PUMP_MULTIPLIERS = {
  easy: [
    1, 1.02, 1.07, 1.11, 1.17, 1.23, 1.29, 1.36, 1.44, 1.53, 1.63, 1.75, 1.88, 2.04, 2.23, 2.45, 2.72, 3.06, 3.5, 4.08,
    4.9, 6.13, 8.17, 12.25, 24.5
  ],
  medium: [
    1, 1.11, 1.27, 1.46, 1.69, 1.98, 2.33, 2.76, 3.31, 4.03, 4.95, 6.19, 7.88, 10.25, 13.66, 18.78, 26.83, 40.25, 64.4,
    112.7, 225.4, 563.5, 2254
  ],
  hard: [
    1, 1.23, 1.55, 1.98, 2.56, 3.36, 4.48, 6.08, 8.41, 11.92, 17.34, 26.01, 40.46, 65.74, 112.7, 206.62, 413.23, 929.77,
    2479.4, 8677.9, 52067.4
  ],
  expert: [
    1, 1.63, 2.8, 4.95, 9.08, 17.34, 34.68, 73.21, 164.72, 400.02, 1066.73, 3200.18, 11200.65, 48536.13, 291216.8,
    3203384.8
  ]
} as const;

export type PumpDifficulty = keyof typeof PUMP_MULTIPLIERS;

export const PUMP_DANGER_COUNTS: Readonly<Record<PumpDifficulty, number>> = {
  easy: 1,
  medium: 3,
  hard: 5,
  expert: 10
};

export const PUMP_POSITION_COUNT = 25;

export function isPumpDifficulty(value: unknown): value is PumpDifficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert";
}

export function pumpDifficultyFromAction(action: string): PumpDifficulty {
  const difficulty = action.match(/^start:(easy|medium|hard|expert)$/)?.[1];
  if (!isPumpDifficulty(difficulty)) throw new Error("Invalid Pump difficulty");
  return difficulty;
}

export function pumpMultiplier(difficulty: PumpDifficulty, step: number): number {
  const ladder = PUMP_MULTIPLIERS[difficulty];
  return ladder[Math.max(0, Math.min(ladder.length - 1, step))] ?? 1;
}

export function pumpChance(difficulty: PumpDifficulty, step: number): number {
  const available = PUMP_POSITION_COUNT - PUMP_DANGER_COUNTS[difficulty] - step;
  return Math.max(0, Math.min(100, (available / PUMP_POSITION_COUNT) * 100));
}

export function generatePumpPopPoint(serverSeed: string, context: RandomContext): number {
  if (context.gameId !== "stake-pump") throw new Error("Pump layout requires the stake-pump game ID");
  const difficulty = pumpDifficultyFromAction(context.action);
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  const positions = Array.from({ length: PUMP_POSITION_COUNT }, (_, index) => index + 1);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    const current = positions[index];
    const replacement = positions[swap];
    if (current === undefined || replacement === undefined) throw new Error("Pump shuffle failed");
    positions[index] = replacement;
    positions[swap] = current;
  }
  return Math.min(...positions.slice(0, PUMP_DANGER_COUNTS[difficulty]));
}

function pumpAction(action: string): {
  readonly difficulty: PumpDifficulty;
  readonly pumps: number;
  readonly action: string;
} {
  const parsed = action.match(/^pumps:(\d+)(?::(easy|medium|hard|expert))?$/i);
  const difficulty = (parsed?.[2]?.toLowerCase() ?? "hard") as PumpDifficulty;
  const ladder = PUMP_MULTIPLIERS[difficulty];
  const requested = Number(parsed?.[1] ?? 1);
  const pumps = Math.max(1, Math.min(ladder.length - 1, Number.isSafeInteger(requested) ? requested : 1));
  return { difficulty, pumps, action: `pumps:${pumps}:${difficulty}` };
}

function pump(random: FairRandom, action: string): GameOutcome {
  const { difficulty, pumps } = pumpAction(action);
  const positions = Array.from({ length: PUMP_POSITION_COUNT }, (_, index) => index + 1);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const target = random.int(index + 1);
    const currentPosition = positions[index];
    const targetPosition = positions[target];
    if (currentPosition === undefined || targetPosition === undefined) throw new Error("Pump shuffle failed");
    positions[index] = targetPosition;
    positions[target] = currentPosition;
  }
  const dangerPositions = positions.slice(0, PUMP_DANGER_COUNTS[difficulty]).sort((left, right) => left - right);
  const popPoint = dangerPositions[0] ?? null;
  const burst = popPoint !== null && popPoint <= pumps;
  const target = PUMP_MULTIPLIERS[difficulty][pumps] ?? 1;
  const attemptedPumps = burst && popPoint !== null ? popPoint : pumps;
  const successfulPumps = burst ? Math.max(0, attemptedPumps - 1) : pumps;
  return {
    multiplier: burst ? 0 : target,
    outcome: {
      kind: "pump",
      result: burst ? 0 : target,
      target,
      popPoint,
      attemptedPumps,
      successfulPumps,
      dangerPositions,
      burst,
      difficulty
    }
  };
}

function crashTarget(gameId: EnabledGameId, action: string): number {
  if (gameId === "stake-crash") {
    if (action.startsWith("crash:v")) {
      const match = /^crash:v2:target:([0-9]+(?:\.[0-9]{1,2})?)$/.exec(action);
      const parsed = Number(match?.[1]);
      if (!match || parsed < 1.01 || parsed > STAKE_CRASH_MAX_MULTIPLIER) throw new Error("Invalid Crash v2 target");
      return Math.round(parsed * 100) / 100;
    }
    const parsed = Number(action.match(/^crash:target:(\d+(?:\.\d+)?)/)?.[1] ?? 2);
    return Math.max(1.01, Math.min(STAKE_CRASH_MAX_MULTIPLIER, Math.floor(parsed * 100) / 100));
  }
  const parsed = Number(action.match(/target:(\d+(?:\.\d+)?)/)?.[1] ?? 2);
  return Math.max(1.01, Math.min(100_000, parsed));
}

/** Maximum payout per charged wager for an action chosen before randomness.
 * Interactive games retain their full remaining-round bound. */
export function maximumMultiplierForAction(gameId: EnabledGameId, action: string): number {
  if (SLOT_PAYOUT_SCALES[gameId]) return 20;
  if (gameId === "drill") return quantizeSettlementMultiplier(gameId, parseDrillAction(action).target);
  if (gameId === "limbo" || gameId === "stake-crash") return quantizeSettlementMultiplier(gameId, crashTarget(gameId, action));
  if (gameId === "moonbound") {
    const { difficulty, pumps } = pumpAction(action);
    return quantizeSettlementMultiplier(gameId, PUMP_MULTIPLIERS[difficulty][pumps] ?? 1);
  }
  return FAIRNESS_MAX_MULTIPLIERS[gameId];
}

export const ACTION_BOUNDED_GAMES: ReadonlySet<EnabledGameId> = new Set(["drill", "limbo", "stake-crash", "moonbound"]);

/** Exact inverse-CDF on the engine's uniform 48-bit draw. Integer division
 * avoids floating-point threshold drift and permits the advertised 1000x cap. */
export function stakeCrashV2Point(draw: bigint): number {
  const size = 1n << 48n;
  if (draw < 0n || draw >= size) throw new Error("Invalid Crash draw");
  const cents = (99n * size) / (size - draw);
  return Number(cents < 100n ? 100n : cents > 100000n ? 100000n : cents) / 100;
}

const crash = (random: FairRandom, gameId: EnabledGameId, action: string): GameOutcome => {
  if (gameId === "stake-crash") {
    const raw = action.startsWith("crash:v2:") ? stakeCrashV2Point(BigInt(random.float() * 0x1_0000_0000_0000)) : Math.min(
      STAKE_CRASH_MAX_MULTIPLIER,
      Math.max(1, Math.floor((0.99 / Math.max(0.001, 1 - random.float())) * 100) / 100)
    );
    const target = crashTarget(gameId, action);
    const won = target <= raw;
    return {
      multiplier: won ? target : 0,
      outcome: { kind: "stake-crash", crashAt: raw, target, won }
    };
  }
  if (gameId === "stake-pump" || gameId === "moonbound") return pump(random, action);
  const raw = Math.min(100_000, Math.floor((RAINBET_LIMBO_RTP / (1 - random.float())) * 100) / 100);
  const target = crashTarget(gameId, action);
  return {
    multiplier: raw >= target ? target : 0,
    outcome: { kind: "limbo", result: raw, target }
  };
};

const instant = (random: FairRandom, gameId: EnabledGameId, action: string): GameOutcome => {
  if (gameId === "rock-paper-scissors") {
    const choices = ["rock", "paper", "scissors"] as const;
    const player = choices.find((choice) => action.toLowerCase().includes(choice)) ?? "rock";
    const opponent = random.pick(choices);
    const draw = player === opponent;
    const won =
      (player === "rock" && opponent === "scissors") ||
      (player === "paper" && opponent === "rock") ||
      (player === "scissors" && opponent === "paper");
    return {
      multiplier: draw ? 1 : won ? 1.91 : 0,
      outcome: { kind: "rps", player, opponent, won, draw }
    };
  }
  if (gameId === "dice") {
    const rollBasisPoints = random.int(10_000);
    const roll = rollBasisPoints / 100;
    const match = action.match(/^(over|under):(\d+(?:\.\d+)?)$/);
    const direction = match?.[1] === "under" ? "under" : "over";
    const targetBasisPoints = Math.max(200, Math.min(9_800, Math.round(Number(match?.[2] ?? 50) * 100)));
    const target = targetBasisPoints / 100;
    const won = direction === "over" ? rollBasisPoints >= targetBasisPoints : rollBasisPoints < targetBasisPoints;
    const chanceBasisPoints = direction === "over" ? 10_000 - targetBasisPoints : targetBasisPoints;
    const multiplierMicros = Math.floor((9_900 * 1_000_000) / chanceBasisPoints);
    return {
      multiplier: won ? multiplierMicros / 1_000_000 : 0,
      outcome: { kind: "dice", roll, rollBasisPoints, target, targetBasisPoints, direction, won, multiplierMicros }
    };
  }
  const configuration = rainbetPlinkoConfiguration(action);
  if (!configuration && action !== "drop") throw new Error("Invalid Plinko action");
  const rows = configuration?.rows ?? 8;
  const path = Array.from({ length: rows }, () => (random.int(2) === 0 ? "left" : "right"));
  if (!configuration) {
    const slot = path.filter((turn) => turn === "right").length;
    return { multiplier: PLINKO_PAYTABLE[slot] ?? 0, outcome: { kind: "plinko", slot, path } };
  }
  return settleRainbetPlinkoPath(configuration.risk, configuration.rows, path);
};

function settledStandalone(
  random: FairRandom,
  gameId: EnabledGameId,
  action: string,
  tarotMathVersion?: RandomContext["tarotMathVersion"]
): GameOutcome {
  if (gameId === "rainbet-mines") {
    const { gridSize, mineCount } = minesConfigurationFromAction(action);
    const positions = Array.from({ length: gridSize }, (_, index) => index);
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const target = random.int(index + 1);
      [positions[index], positions[target]] = [positions[target] ?? index, positions[index] ?? target];
    }
    const mineLocations = positions.slice(0, mineCount).sort((left, right) => left - right);
    return {
      multiplier: 1,
      outcome: { kind: "rainbet-mines", gridSize, mineCount, mineLocations }
    };
  }
  if (gameId === "rainbet-wheel") {
    const risk = action.match(/^spin:(low|medium|high|risky)$/)?.[1];
    if (!risk) throw new Error("Invalid Rainbet Wheel action");
    if (!RAINBET_WHEEL_RISKS.includes(risk)) throw new Error("Invalid Rainbet Wheel risk");
    const table = rainbetWheelRiskTableFor(risk);
    const resolved = rainbetWheelOutcomeForIndex(risk, random.int(table.length));
    return { multiplier: resolved.multiplier, outcome: { kind: "rainbet-wheel", ...resolved } };
  }
  if (gameId === "rainbet-roulette") {
    if (!action.startsWith("spin:")) throw new Error("Invalid Roulette action");
    const entries = action
      .slice(5)
      .split("|")
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.lastIndexOf("@");
        const key = entry.slice(0, separator);
        const amount = Number(entry.slice(separator + 1));
        if (
          !/^(?:number:(?:[0-9]|[12]\d|3[0-6])|dozen:[1-3]|column:[1-3]|range:(?:low|high)|parity:(?:even|odd)|color:(?:red|black))$/.test(
            key
          )
        ) {
          throw new Error("Invalid Roulette bet");
        }
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Roulette wager allocation");
        return [key, amount] as const;
      });
    if (entries.length === 0) throw new Error("Roulette requires at least one bet");
    const pocket = EUROPEAN_WHEEL[random.int(EUROPEAN_WHEEL.length)] ?? 0;
    const settlement = settleRouletteBets(new Map(entries), pocket);
    return {
      multiplier: settlement.stake > 0 ? settlement.payout / settlement.stake : 0,
      outcome: {
        kind: "rainbet-roulette",
        pocket,
        color: rouletteColor(pocket),
        ...settlement,
        winners: [...settlement.winners]
      }
    };
  }
  if (gameId === "rainbet-war") {
    const match = /^deal:(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(action);
    if (!match?.[1] || !match[2] || !match[3]) throw new Error("Invalid War action");
    const mainWager = Number(match[1]);
    const tieWager = Number(match[2]);
    const colouredTieWager = Number(match[3]);
    const openingStake = mainWager + tieWager + colouredTieWager;
    if (!Number.isFinite(openingStake) || openingStake <= 0) throw new Error("War requires a wager");
    const deck: ReturnType<typeof makeWarCard>[] = [];
    for (const suit of WAR_SUITS) for (const rank of WAR_RANKS) deck.push(makeWarCard(rank, suit));
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const target = random.int(index + 1);
      const currentCard = deck[index];
      const targetCard = deck[target];
      if (!currentCard || !targetCard) throw new Error("War deck shuffle failed");
      deck[index] = targetCard;
      deck[target] = currentCard;
    }
    const battles = [];
    for (let index = 0; index < 4; index += 1) {
      const player = deck[index * 2];
      const dealer = deck[index * 2 + 1];
      if (!player || !dealer) throw new Error("War deck exhausted");
      battles.push({ player, dealer });
      if (player.value !== dealer.value) break;
    }
    const settlement = settleWarRound({ battles, mainWager, tieWager, colouredTieWager });
    return {
      multiplier: settlement.totalPayout / openingStake,
      outcome: { kind: "rainbet-war", battles, openingStake, ...settlement }
    };
  }
  if (gameId === "stake-darts" || gameId === "stake-darts-enhanced") {
    const difficulty = action.match(/^throw:(easy|medium|hard|expert)$/)?.[1];
    if (!difficulty) throw new Error("Invalid Darts action");
    const resolved = (gameId === "stake-darts" ? resolveStakeDart : resolveEnhancedStakeDart)({
      difficulty,
      rotationFloat: random.float(),
      distanceFloat: random.float()
    });
    return { multiplier: resolved.multiplier, outcome: { kind: gameId, ...resolved } };
  }
  if (gameId === "stake-flip") {
    const selected = action.match(/^flip:(heads|tails)$/)?.[1];
    if (!selected) throw new Error("Invalid Flip action");
    const landed = random.int(2) === 0 ? "heads" : "tails";
    const won = landed === selected;
    return {
      multiplier: won ? (multiplierForStreak(1) ?? 0) : 0,
      outcome: { kind: "stake-flip", selected, landed, won, streak: 1 }
    };
  }
  if (gameId === "stake-wheel") {
    const match = /^spin:(low|medium|high):(10|20|30|40|50)$/.exec(action);
    if (!match?.[1] || !match[2]) throw new Error("Invalid Stake Wheel action");
    const configuration = validateStakeWheelConfiguration(match[1], Number(match[2]));
    const resolved = stakeWheelOutcomeForIndex(configuration, random.int(configuration.segments));
    return { multiplier: resolved.multiplier, outcome: { kind: "stake-wheel", ...resolved } };
  }
  if (gameId === "stake-snakes") {
    const requestedDifficulty = action.match(/^roll:(easy|medium|hard|expert|master)$/)?.[1];
    if (!requestedDifficulty) throw new Error("Invalid Snakes action");
    const difficulty = normalizeSnakesDifficulty(requestedDifficulty);
    const dieA = random.int(6) + 1;
    const dieB = random.int(6) + 1;
    const total = dieA + dieB;
    const multiplier = snakesFirstMultiplierFor(difficulty, total);
    return {
      multiplier,
      outcome: { kind: "stake-snakes", difficulty, dieA, dieB, total, safe: multiplier > 0 }
    };
  }
  if (gameId === "tarot") {
    const difficulty = action.match(/^draw:(easy|medium|hard|expert)$/)?.[1];
    if (!difficulty) throw new Error("Invalid Tarot action");
    const resolved =
      tarotMathVersion === "legacy"
        ? drawLegacyTarot(difficulty, () => random.float())
        : drawTarot(
            difficulty,
            () => random.float(),
            (bound: number) => random.int(bound)
          );
    return { multiplier: resolved.multiplier, outcome: { kind: "tarot", difficulty, ...resolved } };
  }
  if (gameId === "american-aurora") {
    if (action !== "spin") throw new Error("Invalid American Aurora action");
    const ticket = buildAuroraTicket({ rng: () => random.float(), betCents: 100 });
    return { multiplier: ticket.totalWinCents / ticket.betCents, outcome: { kind: "american-aurora", ticket } };
  }
  if (gameId === "neon-pulse-pinball") {
    if (action !== "launch") throw new Error("Invalid Neon Pulse Pinball action");
    const unit = random.float();
    const probabilities = PINBALL_RTP_MODEL.probabilities;
    const scenarioId =
      unit < probabilities.safe
        ? "safe"
        : unit < probabilities.safe + probabilities.win
          ? "win"
          : unit < probabilities.safe + probabilities.win + probabilities.collision
            ? "collision"
            : "loss";
    const multiplier = PINBALL_RTP_MODEL.payoutMultipliers[scenarioId];
    return { multiplier, outcome: { kind: "neon-pulse-pinball", scenarioId } };
  }
  throw new Error(`Unsupported settled standalone game: ${gameId}`);
}

export const FAIRNESS_ADAPTERS: Readonly<Record<EnabledGameId, string>> = {
  blackjack: "blackjack",
  "stake-pump": "crash",
  moonbound: "crash",
  "stake-crash": "stake-crash",
  packs: "packs",
  drill: "drill",
  "rps-ascent": "climb",
  "midnight-train-heist": "slots",
  "wanted-dead-or-wild": "wanted-dead-or-wild",
  "midas-feast": "slots",
  "sands-of-sekhmet": "slots",
  "poseidons-abyssal-crown": "slots",
  "witch-blood-megaways": "witch-blood-megaways",
  "rip-city": "rip-city",
  "xmas-drop": "xmas-drop",
  sixsixsix: "slots",
  "gates-of-olympus-super-scatter": "gates-super-scatter",
  "fruit-party": "fruit-party",
  "sweet-bonanza-2500": "sweet-bonanza-2500",
  "neon-syndicate": "neon-syndicate",
  "fist-of-destruction": "fist-of-destruction",
  "odins-vault": "odins-vault",
  moles: "board",
  "prism-deck": "cards",
  "thirteen-card-flip": "thirteen-card-flip",
  "video-poker": "video-poker",
  baccarat: "baccarat",
  nullfield: "board",
  "chicken-cross": "climb",
  "floor-is-lava": "floor-is-lava",
  tower: "tower",
  "dragon-tower": "dragon-tower",
  "rock-paper-scissors": "instant",
  limbo: "crash",
  keno: "board",
  plinko: "instant",
  dice: "instant",
  "rainbet-mines": "settled-standalone",
  "rainbet-wheel": "settled-standalone",
  "rainbet-roulette": "settled-standalone",
  "rainbet-war": "settled-standalone",
  "stake-darts": "settled-standalone",
  "stake-darts-enhanced": "settled-standalone",
  "stake-flip": "settled-standalone",
  "stake-wheel": "settled-standalone",
  "stake-snakes": "settled-standalone",
  tarot: "settled-standalone",
  "american-aurora": "settled-standalone",
  "neon-pulse-pinball": "settled-standalone"
};

/** Native bounds retained for historical replay and calibration. Current
 * settlement must use maximumMultiplierForAction, including the slot 20x cap. */
export const FAIRNESS_MAX_MULTIPLIERS: Readonly<Record<EnabledGameId, number>> = {
  blackjack: 135,
  "stake-pump": quantizeMultiplier(PUMP_MULTIPLIERS.expert.at(-1) ?? 0),
  moonbound: quantizeMultiplier(PUMP_MULTIPLIERS.expert.at(-1) ?? 0),
  "stake-crash": quantizeMultiplier(STAKE_CRASH_MAX_MULTIPLIER),
  packs: quantizeMultiplier(PACKS_MAX_MULTIPLIER),
  drill: quantizeMultiplier(DRILL_RESULT_MAXIMUM),
  "rps-ascent": quantizeMultiplier(1.91),
  "midnight-train-heist": FAIR_SLOT_MAX_MULTIPLIERS["midnight-train-heist"],
  "wanted-dead-or-wild": quantizeSlotMultiplier(WANTED_MAX_WIN),
  "midas-feast": FAIR_SLOT_MAX_MULTIPLIERS["midas-feast"],
  "sands-of-sekhmet": FAIR_SLOT_MAX_MULTIPLIERS["sands-of-sekhmet"],
  "poseidons-abyssal-crown": FAIR_SLOT_MAX_MULTIPLIERS["poseidons-abyssal-crown"],
  "witch-blood-megaways": WITCH_BLOOD_MAX_MULTIPLIER,
  "rip-city": quantizeSlotMultiplier(RIP_CITY_MAX_MULTIPLIER),
  "xmas-drop": quantizeSlotMultiplier(XMAS_DROP_MAX_MULTIPLIER),
  sixsixsix: FAIR_SLOT_MAX_MULTIPLIERS.sixsixsix,
  "gates-of-olympus-super-scatter": GATES_SUPER_SCATTER_MAX_WIN,
  "fruit-party": quantizeSlotMultiplier(FRUIT_PARTY_MAX_WIN),
  "sweet-bonanza-2500": quantizeSlotMultiplier(SWEET_BONANZA_MAX_WIN),
  "neon-syndicate": quantizeSlotMultiplier(NEON_SYNDICATE_MAX_WIN),
  "fist-of-destruction": quantizeMultiplier(FIST_OF_DESTRUCTION_MAX_WIN),
  "odins-vault": SLOT_MAX_SETTLED_MULTIPLIER,
  moles: quantizeMultiplier(MOLES_MAX_MULTIPLIER),
  "prism-deck": quantizeMultiplier(PRISM_DECK_TARGET_RTP / (3 / 51)),
  "thirteen-card-flip": quantizeMultiplier(THIRTEEN_CARD_FLIP_PAYOUT),
  "video-poker": VIDEO_POKER_MAX_MULTIPLIER,
  baccarat: quantizeMultiplier(31),
  nullfield: quantizeMultiplier(TARGET_RTP / 0.8),
  "chicken-cross": quantizeMultiplier(Math.max(...Object.values(CHICKEN_PATHS).flat())),
  "floor-is-lava": FLOOR_LAVA_MAX_MULTIPLIER,
  tower: quantizeMultiplier(TOWER_PAYTABLE.master[TOWER_FLOORS - 1] ?? 0),
  "dragon-tower": quantizeMultiplier(DRAGON_TOWER_PAYTABLE.master[DRAGON_TOWER_FLOORS - 1] ?? 0),
  "rock-paper-scissors": quantizeMultiplier(1.91),
  limbo: quantizeMultiplier(100_000),
  keno: quantizeMultiplier(
    Math.max(...Object.values(KENO_PAYTABLES).flatMap((tables) => Object.values(tables).flat()))
  ),
  plinko: quantizeMultiplier(RAINBET_PLINKO_MAX_MULTIPLIER),
  dice: quantizeMultiplier(49.5),
  "rainbet-mines": quantizeMultiplier(MINES_MAX_MULTIPLIER),
  "rainbet-wheel": quantizeMultiplier(10_000),
  "rainbet-roulette": quantizeMultiplier(36),
  "rainbet-war": quantizeMultiplier(1_001),
  "stake-darts": quantizeMultiplier(500),
  "stake-darts-enhanced": quantizeMultiplier(500),
  "stake-flip": quantizeMultiplier(1.96),
  "stake-wheel": quantizeMultiplier(49.5),
  "stake-snakes": quantizeMultiplier(17.64),
  tarot: quantizeMultiplier(80),
  "american-aurora": quantizeMultiplier(5_000),
  "neon-pulse-pinball": quantizeMultiplier(30.1)
};

export function isEnabledGameId(value: string): value is EnabledGameId {
  return (ENABLED_GAME_IDS as readonly string[]).includes(value);
}

function randomActionFor(context: RandomContext): string {
  switch (context.gameId) {
    case "rps-ascent":
      return context.action.match(/rock|paper|scissors/i)?.[0]?.toLowerCase() ?? "rock";
    case "chicken-cross":
      return `start:${chickenDifficultyFromAction(context.action)}`;
    case "moles":
    case "nullfield":
      return "single-step";
    case "stake-pump":
    case "moonbound":
      return pumpAction(context.action).action;
    case "prism-deck":
      return "deal";
    case "thirteen-card-flip":
      return "deal";
    case "blackjack":
    case "video-poker":
      return "deal";
    case "drill":
      // Stake's verifier takes only seed/nonce inputs for Drill. Presentation
      // choices therefore must not perturb the generated three-result tuple.
      return "drill-results";
    default:
      return context.action;
  }
}

function unquantizedOutcomeFor(serverSeed: string, context: RandomContext): GameOutcome {
  const random = new FairRandom(serverSeed, { ...context, action: randomActionFor(context) });
  switch (FAIRNESS_ADAPTERS[context.gameId]) {
    case "drill": {
      const resolved = resolveDrill(random, context.action);
      return {
        multiplier: resolved.multiplier,
        outcome: resolved.outcome as unknown as Readonly<Record<string, unknown>>
      };
    }
    case "packs": {
      const resolved = resolvePacks(
        new FairRandom(serverSeed, { ...context, action: "open-pack" }),
        context.packsMathVersion
      );
      const presentationMs = context.action.includes(":reduced")
        ? 1
        : context.action.includes(":instant")
          ? 1
          : context.action.includes(":fast")
            ? 706
            : resolved.outcome.presentation.presentationMs;
      return {
        multiplier: resolved.multiplier,
        outcome: {
          ...resolved.outcome,
          presentation: { ...resolved.outcome.presentation, presentationMs }
        } as unknown as Readonly<Record<string, unknown>>
      };
    }
    case "odins-vault": {
      const outcome = resolveOdinsVaultSpin(random, context.action);
      return {
        multiplier: outcome.totalMultiplier,
        outcome: outcome as unknown as Readonly<Record<string, unknown>>
      };
    }
    case "dragon-tower": {
      const difficulty = dragonTowerDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "dragon-tower-layout",
          difficulty,
          safeRows: generateDragonTowerLayout(serverSeed, context)
        }
      };
    }
    case "tower": {
      const difficulty = towerDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "tower-layout",
          difficulty,
          safeRows: generateTowerLayout(serverSeed, context)
        }
      };
    }
    case "floor-is-lava": {
      const difficulty = floorLavaDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "floor-is-lava-layout",
          difficulty,
          safeStages: generateFloorLavaField(serverSeed, context)
        }
      };
    }
    case "slots":
      return slots(random, context.gameId, context.midasMathVersion);
    case "wanted-dead-or-wild": {
      const outcome = resolveWantedDeadOrWild(random, context.action);
      return { multiplier: outcome.totalMultiplier, outcome: outcome as unknown as Readonly<Record<string, unknown>> };
    }
    case "witch-blood-megaways":
      return createWitchBloodOutcome(random);
    case "rip-city":
      return resolveRipCity(random, context.action) as unknown as GameOutcome;
    case "xmas-drop":
      return resolveXmasDrop(random, context.action) as unknown as GameOutcome;
    case "gates-super-scatter":
      return resolveGatesSuperScatter(random, context.action);
    case "fruit-party":
      return resolveFruitParty(random, context.action);
    case "sweet-bonanza-2500":
      return resolveSweetBonanza2500(random, context.action);
    case "neon-syndicate":
      return resolveNeonSyndicate(random, context.action) as unknown as GameOutcome;
    case "fist-of-destruction":
      return resolveFistOfDestruction(random, context.action);
    case "board":
      return board(random, context.gameId, context.action);
    case "climb":
      return climb(random, context.gameId, context.action);
    case "cards":
      return cards(serverSeed, context);
    case "thirteen-card-flip": {
      const resolved = resolveThirteenCardFlip(random, "b");
      return {
        multiplier: resolved.payout,
        outcome: resolved as unknown as Readonly<Record<string, unknown>>
      };
    }
    case "blackjack": {
      let state = dealBlackjack(blackjackShoe(random), context.blackjackRules);
      while (state.phase === "player") state = actBlackjack(state, "stand");
      return {
        multiplier: Number(blackjackPayout(state, 100n)) / 100,
        outcome: blackjackOutcome(state, "verification", 100n)
      };
    }
    case "video-poker": {
      const dealt = dealVideoPoker(random);
      return {
        multiplier: 0,
        outcome: {
          kind: "video-poker",
          phase: "hold",
          initialCards: dealt.initialCards
        }
      };
    }
    case "baccarat":
      return context.action.startsWith("bets:")
        ? resolveBaccaratV2(random, context.action)
        : baccarat(random, context.action);
    case "crash":
      return crash(random, context.gameId, context.action);
    case "stake-crash":
      return crash(random, context.gameId, context.action);
    case "instant":
      return instant(random, context.gameId, context.action);
    case "settled-standalone":
      return settledStandalone(random, context.gameId, context.action, context.tarotMathVersion);
  }
  throw new Error(`Missing fairness adapter for ${context.gameId}`);
}

export function quantizeSettlementMultiplier(gameId: EnabledGameId, multiplier: number): number {
  const adapter = FAIRNESS_ADAPTERS[gameId];
  return adapter === "slots" ||
    adapter === "wanted-dead-or-wild" ||
    adapter === "witch-blood-megaways" ||
    adapter === "rip-city" ||
    adapter === "xmas-drop" ||
    adapter === "gates-super-scatter" ||
    adapter === "fruit-party" ||
    adapter === "sweet-bonanza-2500" ||
    adapter === "neon-syndicate" ||
    adapter === "fist-of-destruction" ||
    adapter === "odins-vault"
    ? quantizeSlotMultiplier(multiplier)
    : quantizeMultiplier(multiplier);
}

export function outcomeFor(serverSeed: string, context: RandomContext): GameOutcome {
  const raw = unquantizedOutcomeFor(serverSeed, context);
  const resolved =
    context.slotMathVersion === "legacy"
      ? raw
      : calibrateSlotPayout(context.gameId, context.action, raw, slotRawPayoutCap(context.gameId, context.action), context.slotMathVersion);
  const multiplier = quantizeSettlementMultiplier(context.gameId, resolved.multiplier);
  return { ...resolved, multiplier };
}

export function slotRawPayoutCap(gameId: EnabledGameId, action: string): number {
  if (gameId === "odins-vault") return odinsVaultRawCapForAction(action);
  if (gameId === "gates-of-olympus-super-scatter") return gatesSuperScatterRawCapForAction(action);
  return FAIRNESS_MAX_MULTIPLIERS[gameId];
}

/** Cost is expressed in base wagers; settlement multipliers use the charged wager. */
export function slotActionCostMultiplier(gameId: string, action: string): number {
  if (gameId === "odins-vault") return odinsVaultCostMultiplierForAction(action);
  if (gameId === "gates-of-olympus-super-scatter") return gatesSuperScatterCostMultiplierForAction(action);
  if (gameId === "wanted-dead-or-wild") return wantedCostMultiplierForAction(action);
  if (gameId === "neon-syndicate") return neonSyndicateCostMultiplierForAction(action);
  return 1;
}

/** Round a fractional action charge once, in minor units, without converting money to Number. */
export function slotChargedWagerMinor(wager: bigint, gameId: string, action: string): bigint {
  if (wager < 0n) throw new Error("Wager must be non-negative");
  const costHundredths = BigInt(Math.round(slotActionCostMultiplier(gameId, action) * 100));
  return (wager * costHundredths + 50n) / 100n;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberRows(value: unknown): readonly (readonly number[])[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || !row.every((column) => Number.isSafeInteger(column))) return undefined;
    rows.push([...row] as number[]);
  }
  return rows;
}

function chickenCrossings(value: unknown): readonly ChickenLaneResolution[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const crossings: ChickenLaneResolution[] = [];
  for (const item of value) {
    if (!recordValue(item)) return undefined;
    if (
      !Number.isSafeInteger(item.lane) ||
      typeof item.multiplier !== "number" ||
      !Number.isFinite(item.multiplier) ||
      typeof item.successChance !== "number" ||
      !Number.isFinite(item.successChance) ||
      typeof item.success !== "boolean"
    ) {
      return undefined;
    }
    crossings.push({
      lane: item.lane as number,
      multiplier: item.multiplier,
      successChance: item.successChance,
      success: item.success
    });
  }
  return crossings;
}

function verificationFactor(request: VerifyRequest): number { return request.usdScale === 8 ? 100_000_000 : 100; }

function verificationPayout(request: VerifyRequest, multiplier: number): number {
  if (request.usdScale !== 8) return Math.round(request.wager! * multiplier * 100) / 100;
  const wager = parseUsdAtoms(request.wager!.toFixed(8));
  const ratio = parseUsdAtoms(multiplier.toFixed(8));
  return Number(wager * ratio / USD_FACTOR) / Number(USD_FACTOR);
}

function chickenVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? `start:${chickenDifficultyFromAction(request.action)}`;
  const difficulty = chickenDifficultyFromAction(fairnessAction);
  const lanes = generateChickenPath(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "chicken-cross",
    difficulty,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    collisionLane: null,
    crossings: []
  };

  if (recordValue(expected)) {
    const crossings = chickenCrossings(expected.crossings);
    const phase = expected.phase;
    let transcriptValid = crossings !== undefined && crossings.length > 0;
    let step = 0;
    if (crossings) {
      for (const [index, crossing] of crossings.entries()) {
        const lane = lanes[index];
        if (!lane || crossing.lane !== index + 1 || stableJson(crossing) !== stableJson(lane)) {
          transcriptValid = false;
          break;
        }
        if (crossing.success) step += 1;
        else if (index !== crossings.length - 1) transcriptValid = false;
      }
    }

    if (phase === "lost") {
      transcriptValid &&= crossings?.at(-1)?.success === false && crossings.length === step + 1;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= Boolean(crossings?.every((crossing) => crossing.success));
      transcriptValid &&= step > 0 && step < lanes.length && crossings?.length === step;
      terminalMultiplier = CHICKEN_PATHS[difficulty][step - 1] ?? 0;
    } else if (phase === "completed") {
      transcriptValid &&= Boolean(crossings?.every((crossing) => crossing.success));
      transcriptValid &&= step === lanes.length && crossings?.length === lanes.length;
      terminalMultiplier = CHICKEN_PATHS[difficulty][lanes.length - 1] ?? 0;
    } else {
      transcriptValid = false;
    }

    const latest = crossings?.at(-1);
    const collisionLane = phase === "lost" ? (latest?.lane ?? step + 1) : null;
    transcriptValid &&= expected.kind === "chicken-cross";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= expected.step === step;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.collisionLane === collisionLane;
    transcriptValid &&= expected.success === (phase !== "lost");
    transcriptValid &&= expected.successChance === (latest?.successChance ?? 0);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "chicken-cross",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      success: phase !== "lost",
      successChance: latest?.successChance ?? 0,
      step,
      currentMultiplier: terminalMultiplier,
      collisionLane,
      crossings: crossings ?? []
    };
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function floorLavaVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = floorLavaDifficultyFromAction(fairnessAction);
  const safeStages = generateFloorLavaField(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "floor-is-lava",
    difficulty,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    nextMultiplier: 0,
    level: 1,
    stage: 0,
    levelComplete: false,
    picks: [],
    remainingPlatforms: [],
    revealedSafePlatforms: [],
    lastPick: null,
    safeStages
  };

  if (recordValue(expected)) {
    const expectedStages = numberRows(expected.safeStages);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks: FloorLavaPick[] = [];
    let cleared = 0;
    let lost = false;
    let transcriptValid = true;

    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const step = rawPick.step;
      const platform = rawPick.platform;
      const declaredSafe = rawPick.safe;
      const available = floorLavaAvailablePlatforms(difficulty, safeStages, cleared);
      if (
        !Number.isSafeInteger(step) ||
        step !== cleared + 1 ||
        !Number.isSafeInteger(platform) ||
        !available.includes(platform as number) ||
        typeof declaredSafe !== "boolean"
      ) {
        transcriptValid = false;
        break;
      }
      const safe = safeStages[cleared]?.includes(platform as number) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ step: step as number, platform: platform as number, safe });
      if (safe) cleared += 1;
      else lost = true;
    }

    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < safeStages.length && picks.length === cleared;
      terminalMultiplier = floorLavaMultiplier(difficulty, cleared);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === safeStages.length && picks.length === safeStages.length;
      terminalMultiplier = floorLavaMultiplier(difficulty, cleared);
    } else {
      transcriptValid = false;
    }

    const terminalStage = lost ? (safeStages[cleared] ?? []) : (safeStages[Math.max(0, cleared - 1)] ?? []);
    const expectedReveal = phase === "lost" || phase === "completed" ? terminalStage : [];
    const progress = floorLavaProgress(difficulty, cleared);
    transcriptValid &&= expected.kind === "floor-is-lava";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= expected.step === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.nextMultiplier === 0;
    transcriptValid &&= expected.level === progress.level;
    transcriptValid &&= expected.stage === progress.stage;
    transcriptValid &&= expected.levelComplete === progress.levelComplete;
    transcriptValid &&= stableJson(expected.remainingPlatforms) === stableJson(terminalStage);
    transcriptValid &&= stableJson(expected.revealedSafePlatforms) === stableJson(expectedReveal);
    transcriptValid &&= stableJson(expected.lastPick) === stableJson(picks.at(-1) ?? null);
    transcriptValid &&= stableJson(expectedStages) === stableJson(safeStages);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "floor-is-lava",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      step: cleared,
      currentMultiplier: terminalMultiplier,
      nextMultiplier: 0,
      level: progress.level,
      stage: progress.stage,
      levelComplete: progress.levelComplete,
      picks,
      remainingPlatforms: terminalStage,
      revealedSafePlatforms: expectedReveal,
      lastPick: picks.at(-1) ?? null,
      safeStages
    };
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function dragonTowerVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = dragonTowerDifficultyFromAction(fairnessAction);
  const safeRows = generateDragonTowerLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "dragon-tower",
    difficulty,
    phase: "unverified",
    floor: 0,
    currentMultiplier: 0,
    picks: [],
    safeRows
  };

  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks: DragonTowerPick[] = [];
    let cleared = 0;
    let transcriptValid = true;
    let lost = false;
    const config = DRAGON_TOWER_DIFFICULTIES[difficulty];

    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const floor = rawPick.floor;
      const column = rawPick.column;
      const declaredSafe = rawPick.safe;
      if (
        !Number.isSafeInteger(floor) ||
        floor !== cleared + 1 ||
        !Number.isSafeInteger(column) ||
        (column as number) < 0 ||
        (column as number) >= config.tiles ||
        typeof declaredSafe !== "boolean"
      ) {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[(floor as number) - 1]?.includes(column as number) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ floor: floor as number, column: column as number, safe });
      if (safe) cleared += 1;
      else lost = true;
    }

    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < DRAGON_TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(DRAGON_TOWER_PAYTABLE[difficulty][cleared - 1] ?? 0);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === DRAGON_TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(DRAGON_TOWER_PAYTABLE[difficulty][DRAGON_TOWER_FLOORS - 1] ?? 0);
    } else {
      transcriptValid = false;
    }

    transcriptValid &&= expected.kind === "dragon-tower";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= expected.floor === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "dragon-tower",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      floor: cleared,
      currentMultiplier: terminalMultiplier,
      picks,
      safeRows
    };
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function towerVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = towerDifficultyFromAction(fairnessAction);
  const safeRows = generateTowerLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "tower",
    difficulty,
    phase: "unverified",
    floor: 0,
    currentMultiplier: 0,
    picks: [],
    safeRows
  };

  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks: TowerPick[] = [];
    let cleared = 0;
    let transcriptValid = true;
    let lost = false;
    const config = TOWER_DIFFICULTIES[difficulty];

    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const floor = rawPick.floor;
      const column = rawPick.column;
      const declaredSafe = rawPick.safe;
      if (
        !Number.isSafeInteger(floor) ||
        floor !== cleared + 1 ||
        !Number.isSafeInteger(column) ||
        (column as number) < 0 ||
        (column as number) >= config.tiles ||
        typeof declaredSafe !== "boolean"
      ) {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[(floor as number) - 1]?.includes(column as number) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ floor: floor as number, column: column as number, safe });
      if (safe) cleared += 1;
      else lost = true;
    }

    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(TOWER_PAYTABLE[difficulty][cleared - 1] ?? 0);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(TOWER_PAYTABLE[difficulty][TOWER_FLOORS - 1] ?? 0);
    } else {
      transcriptValid = false;
    }

    transcriptValid &&= expected.kind === "tower";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= expected.floor === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "tower",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      floor: cleared,
      currentMultiplier: terminalMultiplier,
      picks,
      safeRows
    };
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function molesVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const moles = molesCountFromAction(fairnessAction);
  const safeRows = generateMolesLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "moles",
    moles,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    nextMultiplier: 0,
    picks: [],
    revealedMoles: [],
    lastPick: null,
    safeRows
  };

  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks: MolesPick[] = [];
    let cleared = 0;
    let lost = false;
    let transcriptValid = true;

    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const step = rawPick.step;
      const tile = rawPick.tile;
      const declaredSafe = rawPick.safe;
      if (
        !Number.isSafeInteger(step) ||
        step !== cleared + 1 ||
        !Number.isSafeInteger(tile) ||
        (tile as number) < 0 ||
        (tile as number) >= MOLES_HOLE_COUNT ||
        typeof declaredSafe !== "boolean"
      ) {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[(step as number) - 1]?.includes(tile as number) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ step: step as number, tile: tile as number, safe });
      if (safe) cleared += 1;
      else lost = true;
    }

    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < moles;
      terminalMultiplier = molesMultiplier(moles, cleared);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === moles;
      terminalMultiplier = molesMultiplier(moles, moles);
    } else {
      transcriptValid = false;
    }

    const expectedReveal = phase === "lost" || phase === "completed" ? (safeRows[picks.length - 1] ?? []) : [];
    transcriptValid &&= expected.kind === "moles";
    transcriptValid &&= expected.moles === moles;
    transcriptValid &&= expected.step === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.nextMultiplier === 0;
    transcriptValid &&= stableJson(expected.revealedMoles) === stableJson(expectedReveal);
    transcriptValid &&= stableJson(expected.lastPick) === stableJson(picks.at(-1) ?? null);
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "moles",
      moles,
      phase: typeof phase === "string" ? phase : "invalid",
      step: cleared,
      currentMultiplier: terminalMultiplier,
      nextMultiplier: 0,
      picks,
      revealedMoles: expectedReveal,
      lastPick: picks.at(-1) ?? null,
      safeRows
    };
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function thirteenCardFlipVerification(request: VerifyRequest): VerifyResult {
  const dealt = resolveThirteenCardFlip(
    new FairRandom(request.serverSeed, {
      gameId: "thirteen-card-flip",
      clientSeed: request.clientSeed,
      nonce: request.nonce,
      action: "deal"
    }),
    "b"
  );
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = dealt as unknown as Readonly<Record<string, unknown>>;

  if (recordValue(expected)) {
    const choices = Array.isArray(expected.playerChoices)
      ? expected.playerChoices.filter((item): item is number => Number.isSafeInteger(item))
      : [];
    const choicesValid =
      Array.isArray(expected.playerChoices) &&
      choices.length === expected.playerChoices.length &&
      choices.every((choice) => choice >= 0 && choice < 13) &&
      new Set(choices).size === choices.length;
    const resolved = resolveInteractiveThirteenCardFlipFromHands(dealt.hands, "b", choicesValid ? choices : []);
    const roundId = typeof expected.roundId === "string" ? expected.roundId : "";
    canonicalOutcome = {
      ...resolved,
      ...(roundId ? { roundId } : {})
    } as unknown as Readonly<Record<string, unknown>>;
    outcomeMatches =
      choicesValid &&
      roundId.length > 0 &&
      resolved.phase === "completed" &&
      stableJson(expected) === stableJson(canonicalOutcome);
    terminalMultiplier = resolved.phase === "completed" ? resolved.payout : 0;
  }

  const computed: GameOutcome = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function warVerification(request: VerifyRequest): VerifyResult {
  let state = dealWar(
    warDraws(
      new FairRandom(request.serverSeed, {
        gameId: "rainbet-war",
        clientSeed: request.clientSeed,
        nonce: request.nonce,
        action: "deal"
      })
    )
  );
  let outcome: Record<string, unknown> = {};
  let multiplier = 0;
  let payout = 0;
  let wager = 0;
  let matches = false;
  try {
    const expected = request.expectedOutcome;
    if (
      !recordValue(expected) ||
      !Array.isArray(expected.actions) ||
      expected.actions.length > 3 ||
      typeof expected.baseWagerMinor !== "string" ||
      !/^[1-9]\d{0,14}$/.test(expected.baseWagerMinor) ||
      typeof expected.roundId !== "string" ||
      !expected.roundId
    )
      throw new Error("Invalid War receipt");
    const base = BigInt(expected.baseWagerMinor);
    state = withWarSideBets(state, `start:deal:${expected.tieWagerMinor}:${expected.colouredWagerMinor}`, base, request.usdScale);
    for (const action of expected.actions) state = actWar(state, action as WarAction);
    outcome = warOutcome(state, expected.roundId, base);
    const committed = warCommitted(state, base);
    const paid = warPayout(state, base);
    payout = Number(paid) / verificationFactor(request);
    wager = Number(committed) / verificationFactor(request);
    multiplier = Number((Number(paid) / Number(committed)).toFixed(4));
    const last = state.actions.at(-1);
    const expectedAction = last
      ? `${last}:${expected.roundId}:${state.revision - 1}`
      : request.action === "start:deal" && state.tieMinor === "0" && state.colouredMinor === "0"
        ? "start:deal"
        : warStartAction(state);
    matches =
      state.phase === "settled" && request.action === expectedAction && stableJson(expected) === stableJson(outcome);
  } catch {
    matches = false;
  }
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    outcomeMatches: matches,
    settlementMatches:
      matches &&
      request.wager === wager &&
      request.expectedPayout === payout &&
      request.expectedMultiplier === multiplier,
    computed: { outcome, multiplier }
  };
}

function blackjackVerification(request: VerifyRequest): VerifyResult {
  let state = dealBlackjack(
    blackjackShoe(
      new FairRandom(request.serverSeed, {
        gameId: "blackjack",
        clientSeed: request.clientSeed,
        nonce: request.nonce,
        action: "deal"
      })
    ),
    request.expectedOutcome?.rules === "six-deck-s17-v1" ? "six-deck-s17-v1" : "six-deck-s17-v2"
  );
  let outcome: Record<string, unknown> = {};
  let multiplier = 0;
  let payout = 0;
  let wager = 0;
  let matches = false;
  try {
    const expected = request.expectedOutcome;
    if (
      !recordValue(expected) ||
      !Array.isArray(expected.actions) ||
      expected.actions.length > 100 ||
      typeof expected.baseWagerMinor !== "string" ||
      !/^[1-9]\d{0,14}$/.test(expected.baseWagerMinor) ||
      typeof expected.roundId !== "string" ||
      !expected.roundId
    )
      throw new Error("Invalid Blackjack receipt");
    const base = BigInt(expected.baseWagerMinor);
    if (recordValue(expected.sideBets)) {
      const sides = expected.sideBets;
      if (!recordValue(sides.perfectPair) || !recordValue(sides.twentyOneThree)) throw new Error("Invalid side bets");
      state = withBlackjackSideBets(
        state,
        `start:deal:${sides.perfectPair.wagerMinor}:${sides.twentyOneThree.wagerMinor}`,
        base
      );
    }
    for (const action of expected.actions) state = actBlackjack(state, action as BlackjackAction);
    outcome = blackjackOutcome(state, expected.roundId, base);
    const committed = blackjackCommitted(state, base);
    const paid = blackjackPayout(state, base);
    payout = Number(paid) / verificationFactor(request);
    wager = Number(committed) / verificationFactor(request);
    multiplier = Number((Number(paid) / Number(committed)).toFixed(4));
    const last = state.actions.at(-1);
    const expectedAction = last ? `${last}:${expected.roundId}:${state.revision - 1}` : blackjackStartAction(state);
    matches =
      state.phase === "settled" && request.action === expectedAction && stableJson(expected) === stableJson(outcome);
  } catch {
    matches = false;
  }
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    outcomeMatches: matches,
    settlementMatches:
      matches &&
      request.wager === wager &&
      request.expectedPayout === payout &&
      request.expectedMultiplier === multiplier,
    computed: { outcome, multiplier }
  };
}

function videoPokerVerification(request: VerifyRequest): VerifyResult {
  const dealt = dealVideoPoker(
    new FairRandom(request.serverSeed, {
      gameId: "video-poker",
      clientSeed: request.clientSeed,
      nonce: request.nonce,
      action: "deal"
    })
  );
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let multiplier = 0;
  let canonicalOutcome: Readonly<Record<string, unknown>> = {
    kind: "video-poker",
    phase: "hold",
    initialCards: dealt.initialCards
  };
  if (recordValue(expected)) {
    const held = Array.isArray(expected.held)
      ? expected.held.filter((index): index is number => Number.isSafeInteger(index))
      : [];
    try {
      const drawn = drawVideoPoker(dealt.deck, held);
      multiplier = drawn.result.multiplier;
      const roundId = typeof expected.roundId === "string" ? expected.roundId : "";
      canonicalOutcome = {
        kind: "video-poker",
        phase: "settled",
        ...(roundId ? { roundId } : {}),
        initialCards: drawn.initialCards,
        finalCards: drawn.finalCards,
        held: drawn.held,
        replacementCards: drawn.replacementCards,
        result: drawn.result
      };
      outcomeMatches = roundId.length > 0 && stableJson(expected) === stableJson(canonicalOutcome);
    } catch {
      outcomeMatches = false;
    }
  }
  const computed = { multiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === undefined ? undefined : verificationPayout(request, multiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === multiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function pumpVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = pumpDifficultyFromAction(fairnessAction);
  const popPoint = generatePumpPopPoint(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  const maximumStep = PUMP_MULTIPLIERS[difficulty].length - 1;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let step = 0;
  let attemptedMultiplier = 1;
  let phase = "invalid";

  if (recordValue(expected)) {
    phase = typeof expected.phase === "string" ? expected.phase : "invalid";
    step = Number.isSafeInteger(expected.step) ? (expected.step as number) : -1;
    if (phase === "lost") {
      terminalMultiplier = 0;
      attemptedMultiplier = pumpMultiplier(difficulty, step);
      outcomeMatches = step === popPoint - 1;
    } else if (phase === "cashed-out") {
      terminalMultiplier = pumpMultiplier(difficulty, step);
      attemptedMultiplier = terminalMultiplier;
      outcomeMatches = step > 0 && step < maximumStep && step < popPoint;
    } else if (phase === "completed") {
      terminalMultiplier = pumpMultiplier(difficulty, maximumStep);
      attemptedMultiplier = terminalMultiplier;
      outcomeMatches = step === maximumStep && popPoint > maximumStep;
    }
    outcomeMatches &&= expected.kind === "pump";
    outcomeMatches &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    outcomeMatches &&= expected.difficulty === difficulty;
    outcomeMatches &&= expected.currentMultiplier === terminalMultiplier;
    outcomeMatches &&= expected.attemptedMultiplier === attemptedMultiplier;
    outcomeMatches &&= expected.nextMultiplier === 0;
    outcomeMatches &&= expected.chance === pumpChance(difficulty, step);
    outcomeMatches &&= expected.popPoint === popPoint;
  }

  const computed: GameOutcome = {
    multiplier: terminalMultiplier,
    outcome: {
      kind: "pump",
      difficulty,
      phase,
      step,
      currentMultiplier: terminalMultiplier,
      attemptedMultiplier,
      nextMultiplier: 0,
      chance: pumpChance(difficulty, Math.max(0, step)),
      popPoint
    }
  };
  const computedPayout =
    request.wager === undefined ? undefined : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

function minesVerification(request: VerifyRequest): VerifyResult {
  const fairnessAction = request.fairnessAction ?? request.action;
  const { gridSize, mineCount } = minesConfigurationFromAction(fairnessAction);
  const mineLocations = generateMinesLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let phase = "invalid";
  let revealed: number[] = [];
  let computedPayout: number | undefined;

  if (recordValue(expected)) {
    phase = typeof expected.phase === "string" ? expected.phase : "invalid";
    const suppliedRevealed = Array.isArray(expected.revealed) ? expected.revealed : [];
    revealed = suppliedRevealed.filter((value): value is number => Number.isSafeInteger(value));
    const uniqueRevealed = new Set(revealed);
    let transcriptValid = suppliedRevealed.length === revealed.length && uniqueRevealed.size === revealed.length;
    transcriptValid &&= revealed.every((index) => index >= 0 && index < gridSize && !mineLocations.includes(index));
    const reveal = /^reveal:([a-f\d-]+):(\d+)$/i.exec(request.action);
    const cashout = /^cashout:([a-f\d-]+)$/i.exec(request.action);
    const rawMultiplier = revealed.length
      ? quantizeMultiplier(minesMultiplierFor(gridSize, mineCount, revealed.length))
      : 0;
    const rawPayout = request.wager === undefined ? undefined : verificationPayout(request, rawMultiplier);
    const capped =
      rawPayout !== undefined &&
      request.maxPayout !== undefined &&
      Number.isFinite(request.maxPayout) &&
      request.maxPayout > 0 &&
      rawPayout >= request.maxPayout;
    computedPayout =
      rawPayout === undefined ? undefined : capped && request.maxPayout !== undefined ? request.maxPayout : rawPayout;
    if (phase === "lost") {
      const index = Number(reveal?.[2]);
      transcriptValid &&= Boolean(reveal) && mineLocations.includes(index);
      terminalMultiplier = 0;
      computedPayout = request.wager === undefined ? undefined : 0;
    } else if (phase === "cashed-out") {
      const index = Number(reveal?.[2]);
      transcriptValid &&=
        revealed.length > 0 &&
        revealed.length <= gridSize - mineCount &&
        (Boolean(cashout) || (Boolean(reveal) && capped && revealed.at(-1) === index));
      terminalMultiplier =
        capped && request.maxPayout !== undefined && request.wager !== undefined
          ? quantizeMultiplier(request.maxPayout / request.wager)
          : rawMultiplier;
    } else if (phase === "completed") {
      const index = Number(reveal?.[2]);
      transcriptValid &&=
        Boolean(reveal) && !capped && revealed.length === gridSize - mineCount && revealed.at(-1) === index;
      terminalMultiplier = rawMultiplier;
    } else {
      transcriptValid = false;
    }
    transcriptValid &&= expected.kind === "rainbet-mines";
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= (reveal?.[1] ?? cashout?.[1]) === expected.roundId;
    transcriptValid &&= expected.gridSize === gridSize;
    transcriptValid &&= expected.mineCount === mineCount;
    transcriptValid &&= stableJson(expected.mineLocations) === stableJson(mineLocations);
    outcomeMatches = transcriptValid;
  }

  const computed: GameOutcome = {
    multiplier: terminalMultiplier,
    outcome: { kind: "rainbet-mines", gridSize, mineCount, phase, revealed, mineLocations }
  };
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...(request.expectedOutcome === undefined ? {} : { outcomeMatches }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            outcomeMatches &&
            request.expectedMultiplier === terminalMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

export function verify(request: VerifyRequest): VerifyResult {
  if (request.gameId === "rps-ascent" && request.expectedOutcome?.rules === "rps-ladder-v1") {
    let computed: GameOutcome = {multiplier: 0, outcome: {kind: "rps-ascent"}};
    let outcomeMatches = false, settlementMatches = false;
    try {
      const expected = request.expectedOutcome, base = BigInt(Math.round((request.wager ?? 1) * verificationFactor(request)));
      const roundId = String(expected.roundId);
      const kernel = new RpsAscentRoundKernel({roundId, gameId: "rps-ascent", wagerMinor: base, maximumPayoutMinor: base * 10000n,
        action: "start:run", serverSeed: request.serverSeed, clientSeed: request.clientSeed, nonce: request.nonce});
      if (!Array.isArray(expected.throws) || expected.throws.length > 120) throw new Error("Invalid RPS transcript");
      let sequence = 0;
      for (const move of expected.throws) {
        if (!move || typeof move !== "object" || !("player" in move)) throw new Error("Invalid RPS throw");
        kernel.advance({roundId, sequence: ++sequence, requestId: `replay-${sequence}`, action: `throw:${roundId}:${move.player}`});
      }
      if (expected.phase === "cashed-out") kernel.advance({roundId, sequence: ++sequence, requestId: "replay-cashout", action: `cashout:${roundId}`});
      const view = kernel.view();
      computed = {multiplier: view.multiplier, outcome: view.outcome};
      const lastThrow = expected.throws.at(-1);
      const finalAction = expected.phase === "cashed-out" ? `cashout:${roundId}` : lastThrow ? `throw:${roundId}:${lastThrow.player}` : "start:run";
      outcomeMatches = request.action === finalAction && (request.fairnessAction ?? "start:run") === "start:run" && stableJson(view.outcome) === stableJson(expected);
      settlementMatches = outcomeMatches && request.expectedMultiplier === view.multiplier && request.expectedPayout === Number(view.payoutMinor) / verificationFactor(request);
    } catch { /* A malformed or impossible transcript must not verify. */ }
    return {commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash), outcomeMatches,
      ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined ? {} : {settlementMatches}), computed};
  }
  if (request.gameId === "rainbet-war" && request.fairnessAction === "start:deal") return warVerification(request);
  if (request.gameId === "blackjack" && request.fairnessAction === "start:deal") return blackjackVerification(request);
  if (request.gameId === "stake-pump" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return pumpVerification(request);
  }
  if (request.gameId === "chicken-cross") return chickenVerification(request);
  if (request.gameId === "floor-is-lava") return floorLavaVerification(request);
  if (request.gameId === "dragon-tower") return dragonTowerVerification(request);
  if (request.gameId === "tower") return towerVerification(request);
  if (request.gameId === "moles" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return molesVerification(request);
  }
  if (request.gameId === "rainbet-mines" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return minesVerification(request);
  }
  if (request.gameId === "thirteen-card-flip" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return thirteenCardFlipVerification(request);
  }
  if (request.gameId === "video-poker" && (request.fairnessAction ?? request.action) === "start:deal") {
    return videoPokerVerification(request);
  }
  const replayContext: RandomContext = {
    ...request,
    ...(request.gameId === "blackjack" && request.blackjackRules === undefined && request.expectedOutcome?.rules === "six-deck-s17-v1"
      ? { blackjackRules: "six-deck-s17-v1" as const } : {}),
    ...(request.gameId === "packs" &&
    request.packsMathVersion === undefined &&
    request.expectedOutcome !== undefined &&
    !("mathVersion" in request.expectedOutcome)
      ? { packsMathVersion: "legacy" as const }
      : {}),
    ...(request.gameId === "midas-feast" &&
    request.midasMathVersion === undefined &&
    request.expectedOutcome !== undefined &&
    !("mathVersion" in request.expectedOutcome)
      ? { midasMathVersion: "legacy" as const }
      : {}),
    ...(request.slotMathVersion === undefined &&
    request.expectedOutcome !== undefined &&
    !("payoutCalibration" in request.expectedOutcome)
      ? { slotMathVersion: "legacy" as const }
      : {}),
    ...(request.slotMathVersion === undefined && request.expectedOutcome?.payoutCalibration !== null &&
    typeof request.expectedOutcome?.payoutCalibration === "object" &&
    (request.expectedOutcome.payoutCalibration as { version?: unknown }).version === "slot-payout-calibration-v1"
      ? { slotMathVersion: "slot-payout-calibration-v1" as const }
      : {}),
    ...(request.slotMathVersion === undefined && request.expectedOutcome?.payoutCalibration !== null &&
    typeof request.expectedOutcome?.payoutCalibration === "object" &&
    (request.expectedOutcome.payoutCalibration as { version?: unknown }).version === "slot-payout-calibration-v2"
      ? { slotMathVersion: "slot-payout-calibration-v2" as const }
      : {}),
    ...(request.gameId === "tarot" &&
    request.tarotMathVersion === undefined &&
    request.expectedOutcome !== undefined &&
    !("mathVersion" in request.expectedOutcome)
      ? { tarotMathVersion: "legacy" as const }
      : {})
  };
  let computed = outcomeFor(request.serverSeed, replayContext);
  // The artwork-era grid shipped without a version tag. For those records only,
  // try that exact engine when the original grid cannot reproduce the stored
  // outcome. This is verification, never a choice of engine during wagering.
  if (
    request.gameId === "midas-feast" &&
    request.midasMathVersion === undefined &&
    request.expectedOutcome !== undefined &&
    !("mathVersion" in request.expectedOutcome) &&
    stableJson(computed.outcome) !== stableJson(request.expectedOutcome)
  ) {
    const candidate = outcomeFor(request.serverSeed, { ...replayContext, midasMathVersion: "midas-grid-v2" });
    const { mathVersion: _version, ...historicalOutcome } = candidate.outcome;
    if (stableJson(historicalOutcome) === stableJson(request.expectedOutcome)) {
      computed = { ...candidate, outcome: historicalOutcome };
    }
  }
  const commitmentValid = equalHex(commitmentFor(request.serverSeed), request.serverSeedHash);
  const costMultiplier =
    request.gameId === "odins-vault"
      ? odinsVaultCostMultiplierForAction(request.action)
      : request.gameId === "gates-of-olympus-super-scatter"
        ? gatesSuperScatterCostMultiplierForAction(request.action)
        : request.gameId === "wanted-dead-or-wild"
          ? wantedCostMultiplierForAction(request.action)
          : request.gameId === "neon-syndicate"
            ? neonSyndicateCostMultiplierForAction(request.action)
            : 1;
  const settlementMultiplier = quantizeSettlementMultiplier(request.gameId, computed.multiplier / costMultiplier);
  const computedPayout =
    request.wager === undefined
      ? undefined
      : request.gameId === "baccarat" && request.action.startsWith("bets:v2:")
        ? Number(baccaratPayoutMinor(computed.outcome, BigInt(Math.round(request.wager * verificationFactor(request))), request.usdScale === 8 ? "floor-minor-v1" : "half-up")) / verificationFactor(request)
        : verificationPayout(request, settlementMultiplier);
  return {
    commitmentValid,
    ...(request.expectedOutcome === undefined
      ? {}
      : { outcomeMatches: stableJson(request.expectedOutcome) === stableJson(computed.outcome) }),
    ...(request.expectedMultiplier === undefined && request.expectedPayout === undefined
      ? {}
      : {
          settlementMatches:
            request.expectedMultiplier === settlementMultiplier &&
            request.wager !== undefined &&
            request.expectedPayout === computedPayout
        }),
    computed
  };
}

interface InternalSession {
  activeRpsRound?: { kernel: RpsAscentRoundKernel; wager: number; nonce: number };
  activeWarRound?: { id: string; nonce: number; baseMinor: bigint; state: WarState };
  activeBlackjackRound?: { id: string; nonce: number; baseMinor: bigint; state: BlackjackState };
  readonly id: string;
  readonly gameId: EnabledGameId;
  clientSeed: string;
  serverSeed: string;
  serverSeedHash: string;
  nonce: number;
  balance: number;
  readonly createdAt: string;
  readonly idempotency: Map<string, { readonly signature: string; readonly result: FairnessPlayResult }>;
  activeTowerRound?: TowerRound;
  activeDragonTowerRound?: DragonTowerRound;
  activeMolesRound?: MolesRound;
  activeMinesRound?: MinesRound;
  activeThirteenCardFlipRound?: ThirteenCardFlipRound;
  activeVideoPokerRound?: VideoPokerRound;
  activeChickenRound?: ChickenRound;
  activeFloorLavaRound?: FloorLavaRound;
  activePumpRound?: PumpRound;
}

export interface CreateSessionRequest {
  readonly gameId: string;
  readonly clientSeed?: string;
}

export interface PlayRequest {
  readonly requestId: string;
  readonly wager: number;
  readonly action?: string;
}

export interface FairnessSessionOptions {
  readonly randomHex?: (bytes: number) => string;
  readonly historyLimit?: number;
  readonly initialBalanceCents?: bigint;
}

export class FairnessSessions {
  readonly #sessions = new Map<string, InternalSession>();
  readonly #randomHex: (bytes: number) => string;
  readonly #historyLimit: number;
  readonly #history: FairnessHistoryRound[] = [];
  readonly #revealedSeeds = new Map<string, string>();
  readonly #initialBalance: number;

  constructor(options: FairnessSessionOptions = {}) {
    this.#randomHex = options.randomHex ?? ((bytes) => bytesToHex(randomBytes(bytes)));
    this.#historyLimit = Math.max(1, Math.floor(options.historyLimit ?? 500));
    const initialBalanceCents = options.initialBalanceCents ?? 100_000n;
    if (initialBalanceCents < 10n || initialBalanceCents > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Initial demo balance must be between 0.10 and the safe integer limit");
    }
    this.#initialBalance = Number(initialBalanceCents) / 100;
  }

  create(request: CreateSessionRequest): FairnessSessionView {
    if (!isEnabledGameId(request.gameId)) throw new Error("Unknown or disabled game");
    const serverSeed = this.#randomHex(32);
    const session: InternalSession = {
      id: this.#randomHex(16),
      gameId: request.gameId,
      clientSeed: request.clientSeed?.trim() || this.#randomHex(12),
      serverSeed,
      serverSeedHash: commitmentFor(serverSeed),
      nonce: 0,
      balance: this.#initialBalance,
      createdAt: new Date().toISOString(),
      idempotency: new Map()
    };
    this.#sessions.set(session.id, session);
    return this.#view(session);
  }

  get(id: string): FairnessSessionView | undefined {
    const session = this.#sessions.get(id);
    return session ? this.#view(session) : undefined;
  }

  play(id: string, request: PlayRequest): FairnessPlayResult {
    const session = this.#sessions.get(id);
    if (!session) throw new Error("Fairness session not found");
    if (!request.requestId.trim()) throw new Error("requestId is required");
    if (!Number.isFinite(request.wager) || request.wager < 0.1) {
      if (session.gameId === "odins-vault" && Number.isFinite(request.wager)) {
        throw new Error("Odin's Vault wager must be between 0.10 and 50.00");
      }
      throw new Error("Wager must be at least 0.10");
    }
    const wager = Math.round(request.wager * 100) / 100;
    const action = request.action?.trim() || "play";
    const signature = stableJson({ wager, action });
    const prior = session.idempotency.get(request.requestId);
    if (prior) {
      if (prior.signature !== signature) throw new Error("Idempotency key was reused with a different play");
      return prior.result;
    }

    if (session.gameId === "rps-ascent" && (session.activeRpsRound || action === "start:run" || action.startsWith("throw:") || action.startsWith("cashout:"))) {
      let round = session.activeRpsRound;
      if (action === "start:run") {
        if (round) throw new Error("An RPS run is already active");
        if (wager > session.balance) throw new Error("Insufficient demo balance");
        const base = BigInt(Math.round(wager * 100));
        round = {wager, nonce: session.nonce, kernel: new RpsAscentRoundKernel({roundId: this.#randomHex(16), gameId: "rps-ascent",
          wagerMinor: base, maximumPayoutMinor: base * 10000n, action, serverSeed: session.serverSeed, clientSeed: session.clientSeed, nonce: session.nonce})};
        session.activeRpsRound = round;
        session.nonce += 1;
        session.balance = Math.round((session.balance - wager) * 100) / 100;
      } else {
        if (!round || round.wager !== wager) throw new Error("Matching RPS run and original wager required");
        const before = round.kernel.view();
        const next = round.kernel.advance({roundId: before.roundId, sequence: before.sequence + 1, requestId: request.requestId, action});
        if (next.status !== "ACTIVE") {
          session.balance = Math.round((session.balance + Number(next.payoutMinor) / 100) * 100) / 100;
          delete session.activeRpsRound;
        }
      }
      const result = this.#rpsResult(session, round, request.requestId, action);
      session.idempotency.set(request.requestId, {signature, result});
      if (!result.roundActive) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "tower") {
      const result = this.#playTower(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "rainbet-war") {
      const result = this.#playWar(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (!result.roundActive) this.#recordHistory(session, result);
      return result;
    }
    if (session.gameId === "blackjack") {
      const result = this.#playBlackjack(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (!result.roundActive) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "dragon-tower") {
      const result = this.#playDragonTower(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "moles") {
      const result = this.#playMoles(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "rainbet-mines") {
      const result = this.#playMines(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (
      session.gameId === "thirteen-card-flip" &&
      (session.activeThirteenCardFlipRound || action.startsWith("start:") || action.startsWith("pick:"))
    ) {
      const result = this.#playThirteenCardFlip(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (
      session.gameId === "video-poker" &&
      (session.activeVideoPokerRound || action === "start:deal" || action.startsWith("draw:"))
    ) {
      const result = this.#playVideoPoker(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "chicken-cross") {
      const result = this.#playChicken(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "floor-is-lava") {
      const result = this.#playFloorLava(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "stake-pump") {
      const result = this.#playPump(session, request.requestId, wager, action);
      session.idempotency.set(request.requestId, { signature, result });
      if (result.roundActive !== true) this.#recordHistory(session, result);
      return result;
    }

    if (session.gameId === "odins-vault" && (wager < ODINS_VAULT_MIN_WAGER || wager > ODINS_VAULT_MAX_WAGER)) {
      throw new Error("Odin's Vault wager must be between 0.10 and 50.00");
    }
    if (
      session.gameId === "gates-of-olympus-super-scatter" &&
      (wager < GATES_SUPER_SCATTER_MIN_WAGER || wager > GATES_SUPER_SCATTER_MAX_WAGER)
    ) {
      throw new Error("Super Scatter wager must be between 0.20 and 180.00");
    }
    if (session.gameId === "fruit-party" && (wager < FRUIT_PARTY_MIN_WAGER || wager > FRUIT_PARTY_MAX_WAGER)) {
      throw new Error("Fruit Party wager must be between 0.20 and 180.00");
    }
    if (
      session.gameId === "sweet-bonanza-2500" &&
      (wager < SWEET_BONANZA_MIN_WAGER || wager > SWEET_BONANZA_MAX_WAGER)
    ) {
      throw new Error("Sweet Bonanza 2500 wager must be between 0.20 and 180.00");
    }
    if (session.gameId === "neon-syndicate" && (wager < NEON_SYNDICATE_MIN_WAGER || wager > NEON_SYNDICATE_MAX_WAGER)) {
      throw new Error("Neon Syndicate wager must be between 0.10 and 50.00");
    }
    const costMultiplier =
      session.gameId === "odins-vault"
        ? odinsVaultCostMultiplierForAction(action)
        : session.gameId === "gates-of-olympus-super-scatter"
          ? gatesSuperScatterCostMultiplierForAction(action)
          : session.gameId === "wanted-dead-or-wild"
            ? wantedCostMultiplierForAction(action)
            : session.gameId === "neon-syndicate"
              ? neonSyndicateCostMultiplierForAction(action)
              : 1;
    const chargedWager = Math.round(wager * costMultiplier * 100) / 100;
    if (SLOT_PAYOUT_SCALES[session.gameId] && chargedWager > 100) {
      throw new Error("Total slot wager must not exceed $100.00");
    }
    if (chargedWager > session.balance) throw new Error("Insufficient demo balance");

    if (session.gameId === "baccarat" && action.startsWith("bets:")) parseBaccaratBets(action);
    const nonce = session.nonce;
    session.nonce += 1;
    const resolved = outcomeFor(session.serverSeed, {
      gameId: session.gameId,
      clientSeed: session.clientSeed,
      nonce,
      action
    });
    const settlementMultiplier = quantizeSettlementMultiplier(session.gameId, resolved.multiplier / costMultiplier);
    const payout =
      session.gameId === "baccarat" && action.startsWith("bets:v2:")
        ? Number(baccaratPayoutMinor(resolved.outcome, BigInt(Math.round(chargedWager * 100)))) / 100
        : Math.round(chargedWager * settlementMultiplier * 100) / 100;
    session.balance = Math.round((session.balance - chargedWager + payout) * 100) / 100;
    const result: FairnessPlayResult = {
      requestId: request.requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce,
      action,
      wager: chargedWager,
      multiplier: settlementMultiplier,
      payout,
      balance: session.balance,
      outcome: resolved.outcome,
      serverSeedHash: session.serverSeedHash
    };
    session.idempotency.set(request.requestId, { signature, result });
    this.#recordHistory(session, result);
    return result;
  }

  settleDiceProof(id: string, receipt: DiceReceipt): FairnessPlayResult {
    const session = this.#sessions.get(id);
    if (!session) throw new Error("Fairness session not found");
    if (session.gameId !== "dice" || receipt.gameId !== "dice")
      throw new Error("Dice proof cannot settle another game");
    if (receipt.sessionId !== session.id) throw new Error("Dice proof receipt is bound to a different session");
    const signature = canonicalJson(receipt);
    const prior = session.idempotency.get(receipt.requestId);
    if (prior) {
      if (prior.signature !== signature) throw new Error("Idempotency key was reused with a different Dice proof");
      return prior.result;
    }
    if (receipt.sequence !== session.nonce) throw new Error("Dice proof receipt sequence is stale");

    const wagerAtoms = BigInt(receipt.wagerAtoms);
    const payoutAtoms = BigInt(receipt.payoutAtoms);
    const balanceAtoms = BigInt(Math.round(session.balance * 100));
    if (wagerAtoms < 10n) throw new Error("Wager must be at least 0.10");
    if (wagerAtoms > balanceAtoms) throw new Error("Insufficient demo balance");
    const nextBalanceAtoms = balanceAtoms - wagerAtoms + payoutAtoms;
    if (nextBalanceAtoms < 0n || nextBalanceAtoms > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Dice proof settlement exceeds the demo balance limit");
    }
    const multiplier = Number(BigInt(receipt.multiplierMicros)) / 1_000_000;
    const wager = Number(wagerAtoms) / 100;
    const payout = Number(payoutAtoms) / 100;
    session.nonce += 1;
    session.balance = Number(nextBalanceAtoms) / 100;
    const result: FairnessPlayResult = {
      requestId: receipt.requestId,
      sessionId: session.id,
      gameId: "dice",
      nonce: receipt.sequence,
      action: `${receipt.direction}:${(receipt.targetBasisPoints / 100).toFixed(2)}`,
      wager,
      multiplier,
      payout,
      balance: session.balance,
      outcome: {
        kind: "dice",
        roll: receipt.rollBasisPoints / 100,
        target: receipt.targetBasisPoints / 100,
        direction: receipt.direction,
        won: receipt.won
      },
      serverSeedHash: receipt.serverSeedHash
    };
    session.idempotency.set(receipt.requestId, { signature, result });
    this.#recordHistory(session, result);
    return result;
  }

  history({ limit = 50, offset = 0 }: { readonly limit?: number; readonly offset?: number } = {}): FairnessHistoryPage {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    const total = this.#history.length;
    const rounds = this.#history.slice(safeOffset, safeOffset + safeLimit).map((round) => {
      const revealedServerSeed = this.#revealedSeeds.get(round.serverSeedHash);
      return { ...round, ...(revealedServerSeed ? { revealedServerSeed } : {}) };
    });
    const nextOffset = safeOffset + rounds.length;
    return {
      rounds,
      offset: safeOffset,
      limit: safeLimit,
      total,
      ...(nextOffset < total ? { nextOffset } : {})
    };
  }

  rotate(
    id: string,
    nextClientSeed?: string
  ): {
    readonly previousServerSeed: string;
    readonly previousServerSeedHash: string;
    readonly next: FairnessSessionView;
  } {
    const session = this.#sessions.get(id);
    if (!session) throw new Error("Fairness session not found");
    if (session.activeTowerRound) throw new Error("Finish the active Tower round before rotating seeds");
    if (session.activeDragonTowerRound) throw new Error("Finish the active Dragon Tower round before rotating seeds");
    if (session.activeMolesRound) throw new Error("Finish the active Moles round before rotating seeds");
    if (session.activeMinesRound) throw new Error("Finish the active Midnight Mines round before rotating seeds");
    if (session.activeThirteenCardFlipRound)
      throw new Error("Finish the active 13 Card Flip round before rotating seeds");
    if (session.activeVideoPokerRound) throw new Error("Finish the active Video Poker hand before rotating seeds");
    if (session.activeWarRound) throw new Error("Finish the active War hand before rotating seeds");
    if (session.activeBlackjackRound) throw new Error("Finish the active Blackjack hand before rotating seeds");
    if (session.activeChickenRound) throw new Error("Finish the active Chicken round before rotating seeds");
    if (session.activeFloorLavaRound) throw new Error("Finish the active Floor Is Lava round before rotating seeds");
    if (session.activePumpRound) throw new Error("Finish the active Pump round before rotating seeds");
    if (session.activeRpsRound) throw new Error("Finish the active RPS run before rotating seeds");
    const previousServerSeed = session.serverSeed;
    const previousServerSeedHash = session.serverSeedHash;
    this.#revealedSeeds.set(previousServerSeedHash, previousServerSeed);
    session.serverSeed = this.#randomHex(32);
    session.serverSeedHash = commitmentFor(session.serverSeed);
    session.clientSeed = nextClientSeed?.trim() || session.clientSeed;
    session.nonce = 0;
    session.idempotency.clear();
    return { previousServerSeed, previousServerSeedHash, next: this.#view(session) };
  }

  #recordHistory(session: InternalSession, result: FairnessPlayResult): void {
    this.#history.unshift({
      id: `${result.sessionId}:${result.requestId}`,
      sessionId: result.sessionId,
      gameId: result.gameId,
      clientSeed: session.clientSeed,
      nonce: result.nonce,
      action: result.action,
      ...(result.fairnessAction ? { fairnessAction: result.fairnessAction } : {}),
      outcome: result.outcome,
      multiplier: result.multiplier,
      wager: result.wager,
      payout: result.payout,
      serverSeedHash: result.serverSeedHash,
      createdAt: new Date().toISOString()
    });
    if (this.#history.length > this.#historyLimit) this.#history.length = this.#historyLimit;
  }

  #view(session: InternalSession): FairnessSessionView {
    const activeRound = session.activeRpsRound ? this.#rpsResult(session, session.activeRpsRound, "resume", "resume") : session.activeVideoPokerRound
      ? this.#videoPokerResult(
          session,
          session.activeVideoPokerRound,
          "resume",
          `resume:${session.activeVideoPokerRound.id}`
        )
      : session.activeWarRound
        ? this.#warResult(session, session.activeWarRound, "resume", "resume")
        : session.activeBlackjackRound
          ? this.#blackjackResult(session, session.activeBlackjackRound, "resume", "resume")
          : undefined;
    return {
      id: session.id,
      gameId: session.gameId,
      clientSeed: session.clientSeed,
      serverSeedHash: session.serverSeedHash,
      nonce: session.nonce,
      demoBalance: session.balance,
      createdAt: session.createdAt,
      ...(activeRound ? { activeRound } : {})
    };
  }

  #rpsResult(session: InternalSession, round: NonNullable<InternalSession["activeRpsRound"]>, requestId: string, action: string): FairnessPlayResult {
    const view = round.kernel.view();
    return {requestId, sessionId: session.id, gameId: "rps-ascent", nonce: round.nonce, action, fairnessAction: "start:run",
      wager: round.wager, multiplier: view.multiplier, payout: Number(view.payoutMinor) / 100, balance: session.balance,
      roundActive: view.status === "ACTIVE", outcome: view.outcome, serverSeedHash: session.serverSeedHash};
  }

  #warResult(
    session: InternalSession,
    round: NonNullable<InternalSession["activeWarRound"]>,
    requestId: string,
    action: string
  ): FairnessPlayResult {
    const committed = warCommitted(round.state, round.baseMinor);
    const payout = warPayout(round.state, round.baseMinor);
    return {
      requestId,
      sessionId: session.id,
      gameId: "rainbet-war",
      nonce: round.nonce,
      action,
      fairnessAction: "start:deal",
      wager: Number(committed) / 100,
      multiplier: Number((Number(payout) / Number(committed)).toFixed(4)),
      payout: Number(payout) / 100,
      balance: session.balance,
      roundActive: round.state.phase === "player",
      outcome: warOutcome(round.state, round.id, round.baseMinor),
      serverSeedHash: session.serverSeedHash
    };
  }

  #playWar(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    const baseMinor = BigInt(Math.round(wager * 100));
    const starting = action === "start:deal" || action.startsWith("start:deal:");
    let round = session.activeWarRound;
    let debit = baseMinor;
    if (starting) {
      if (round) throw new Error("A War hand is already active");
      round = {
        id: this.#randomHex(12),
        nonce: session.nonce,
        baseMinor,
        state: dealWar(
          warDraws(
            new FairRandom(session.serverSeed, {
              gameId: "rainbet-war",
              clientSeed: session.clientSeed,
              nonce: session.nonce,
              action: "deal"
            })
          )
        )
      };
      round.state = withWarSideBets(round.state, action, baseMinor);
      debit = warCommitted(round.state, baseMinor);
    } else {
      if (!round) throw new Error("War hand is not active");
      if (baseMinor !== round.baseMinor) throw new Error("The wager cannot change during an active hand");
      const next = actWar(round.state, warCommand(action, round.id, round.state.revision));
      debit = baseMinor * BigInt(warUnits(next) - warUnits(round.state));
      round = { ...round, state: next };
    }
    const balance = BigInt(Math.round(session.balance * 100));
    if (debit > balance) throw new Error("Insufficient balance");
    if (starting) session.nonce++;
    session.balance = Number(balance - debit + warPayout(round.state, baseMinor)) / 100;
    if (round.state.phase === "player") session.activeWarRound = round;
    else delete session.activeWarRound;
    return this.#warResult(session, round, requestId, action);
  }

  #blackjackResult(
    session: InternalSession,
    round: NonNullable<InternalSession["activeBlackjackRound"]>,
    requestId: string,
    action: string
  ): FairnessPlayResult {
    const committed = blackjackCommitted(round.state, round.baseMinor);
    const payout = blackjackPayout(round.state, round.baseMinor);
    return {
      requestId,
      sessionId: session.id,
      gameId: "blackjack",
      nonce: round.nonce,
      action,
      fairnessAction: "start:deal",
      wager: Number(committed) / 100,
      multiplier: Number((Number(payout) / Number(committed)).toFixed(4)),
      payout: Number(payout) / 100,
      balance: session.balance,
      roundActive: round.state.phase === "player",
      outcome: blackjackOutcome(round.state, round.id, round.baseMinor),
      serverSeedHash: session.serverSeedHash
    };
  }

  #playBlackjack(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    const baseMinor = BigInt(Math.round(wager * 100));
    const starting = action === "start:deal" || action.startsWith("start:deal:");
    let round = session.activeBlackjackRound;
    let debit = baseMinor;
    if (starting) {
      if (round) throw new Error("A Blackjack hand is already active");
      round = {
        id: this.#randomHex(12),
        nonce: session.nonce,
        baseMinor,
        state: dealBlackjack(
          blackjackShoe(
            new FairRandom(session.serverSeed, {
              gameId: "blackjack",
              clientSeed: session.clientSeed,
              nonce: session.nonce,
              action: "deal"
            })
          )
        )
      };
      round.state = withBlackjackSideBets(round.state, action, baseMinor);
      debit = blackjackCommitted(round.state, baseMinor);
    } else {
      if (!round) throw new Error("Blackjack hand is not active");
      if (baseMinor !== round.baseMinor) throw new Error("The wager cannot change during an active hand");
      const next = actBlackjack(round.state, blackjackCommand(action, round.id, round.state.revision));
      debit = baseMinor * BigInt(blackjackUnits(next) - blackjackUnits(round.state));
      round = { ...round, state: next };
    }
    const balance = BigInt(Math.round(session.balance * 100));
    if (debit > balance) throw new Error("Insufficient balance");
    if (starting) session.nonce++;
    session.balance = Number(balance - debit + blackjackPayout(round.state, baseMinor)) / 100;
    if (round.state.phase === "player") session.activeBlackjackRound = round;
    else delete session.activeBlackjackRound;
    return this.#blackjackResult(session, round, requestId, action);
  }

  #playVideoPoker(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action === "start:deal") {
      if (session.activeVideoPokerRound) throw new Error("A Video Poker hand is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const nonce = session.nonce;
      session.nonce += 1;
      const dealt = dealVideoPoker(
        new FairRandom(session.serverSeed, {
          gameId: "video-poker",
          clientSeed: session.clientSeed,
          nonce,
          action: "deal"
        })
      );
      const round: VideoPokerRound = {
        id: this.#randomHex(12),
        wager,
        nonce,
        fairnessAction: action,
        deck: dealt.deck
      };
      session.activeVideoPokerRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#videoPokerResult(session, round, requestId, action);
    }

    const round = session.activeVideoPokerRound;
    if (!round) throw new Error("Video Poker hand is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Video Poker hand");
    const draw = action.match(/^draw:([a-f\d]+):([0-4](?:,[0-4])*)?$/i);
    if (!draw) throw new Error("Invalid Video Poker draw command");
    const [, roundId = "", holdsText = ""] = draw;
    if (roundId !== round.id) throw new Error("Stale Video Poker round ID");
    const held = holdsText === "" ? [] : holdsText.split(",").map(Number);
    return this.#videoPokerResult(session, round, requestId, action, held);
  }

  #videoPokerResult(
    session: InternalSession,
    round: VideoPokerRound,
    requestId: string,
    action: string,
    held?: readonly number[]
  ): FairnessPlayResult {
    if (!held) {
      return {
        requestId,
        sessionId: session.id,
        gameId: session.gameId,
        nonce: round.nonce,
        action,
        fairnessAction: round.fairnessAction,
        wager: round.wager,
        multiplier: 0,
        payout: 0,
        balance: session.balance,
        roundActive: true,
        outcome: {
          kind: "video-poker",
          phase: "hold",
          roundId: round.id,
          initialCards: round.deck.slice(0, 5)
        },
        serverSeedHash: session.serverSeedHash
      };
    }
    const drawn = drawVideoPoker(round.deck, held);
    const payout = Math.round(round.wager * drawn.result.multiplier * 100) / 100;
    session.balance = Math.round((session.balance + payout) * 100) / 100;
    delete session.activeVideoPokerRound;
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier: drawn.result.multiplier,
      payout,
      balance: session.balance,
      roundActive: false,
      outcome: {
        kind: "video-poker",
        phase: "settled",
        roundId: round.id,
        initialCards: drawn.initialCards,
        finalCards: drawn.finalCards,
        held: drawn.held,
        replacementCards: drawn.replacementCards,
        result: drawn.result
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playThirteenCardFlip(
    session: InternalSession,
    requestId: string,
    wager: number,
    action: string
  ): FairnessPlayResult {
    if (action === "start:player") {
      if (session.activeThirteenCardFlipRound) throw new Error("A 13 Card Flip round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const nonce = session.nonce;
      session.nonce += 1;
      const dealt = resolveThirteenCardFlip(
        new FairRandom(session.serverSeed, {
          gameId: "thirteen-card-flip",
          clientSeed: session.clientSeed,
          nonce,
          action: "deal"
        }),
        "b"
      );
      const round: ThirteenCardFlipRound = {
        id: this.#randomHex(12),
        wager,
        nonce,
        fairnessAction: action,
        hands: dealt.hands,
        playerChoices: []
      };
      session.activeThirteenCardFlipRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#thirteenCardFlipResult(session, round, requestId, action);
    }

    const round = session.activeThirteenCardFlipRound;
    if (!round) throw new Error("13 Card Flip round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active 13 Card Flip round");
    const pick = action.match(/^pick:([a-f\d]+):(\d+)$/i);
    if (!pick) throw new Error("Invalid 13 Card Flip command");
    const [, roundId = "", cardText = ""] = pick;
    const cardIndex = Number(cardText);
    if (roundId !== round.id) throw new Error("Stale 13 Card Flip round ID");
    if (!Number.isSafeInteger(cardIndex) || cardIndex < 0 || cardIndex >= 13) {
      throw new Error("13 Card Flip card is out of range");
    }
    if (round.playerChoices.includes(cardIndex)) throw new Error("13 Card Flip card was already revealed");
    round.playerChoices.push(cardIndex);
    return this.#thirteenCardFlipResult(session, round, requestId, action);
  }

  #thirteenCardFlipResult(
    session: InternalSession,
    round: ThirteenCardFlipRound,
    requestId: string,
    action: string
  ): FairnessPlayResult {
    const resolved = resolveInteractiveThirteenCardFlipFromHands(round.hands, "b", round.playerChoices);
    const roundActive = resolved.phase === "active";
    const multiplier = roundActive ? 0 : resolved.payout;
    const payout = Math.round(round.wager * multiplier * 100) / 100;
    if (!roundActive) {
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeThirteenCardFlipRound;
    }
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: { ...resolved, roundId: round.id },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playMines(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activeMinesRound) throw new Error("A Midnight Mines round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const { gridSize, mineCount } = minesConfigurationFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: MinesRound = {
        id: this.#randomHex(12),
        gridSize,
        mineCount,
        wager,
        nonce,
        fairnessAction: action,
        mines: generateMinesLayout(session.serverSeed, {
          gameId: "rainbet-mines",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        revealed: []
      };
      session.activeMinesRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#minesResult(session, round, requestId, action, 1, 0, true, "active");
    }

    const round = session.activeMinesRound;
    if (!round) throw new Error("Midnight Mines round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Midnight Mines round");

    const reveal = action.match(/^reveal:([a-f\d]+):(\d+)$/i);
    if (reveal) {
      const roundId = reveal[1] ?? "";
      const index = Number(reveal[2]);
      if (roundId !== round.id) throw new Error("Stale Midnight Mines round ID");
      if (!Number.isSafeInteger(index) || index < 0 || index >= round.gridSize || round.revealed.includes(index)) {
        throw new Error("Midnight Mines tile is unavailable");
      }
      if (round.mines.includes(index)) {
        delete session.activeMinesRound;
        return this.#minesResult(session, round, requestId, action, 0, 0, false, "lost");
      }
      round.revealed.push(index);
      const multiplier = quantizeMultiplier(minesMultiplierFor(round.gridSize, round.mineCount, round.revealed.length));
      if (round.revealed.length === round.gridSize - round.mineCount) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activeMinesRound;
        return this.#minesResult(session, round, requestId, action, multiplier, payout, false, "completed");
      }
      return this.#minesResult(session, round, requestId, action, multiplier, 0, true, "active");
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Midnight Mines round ID");
      if (round.revealed.length === 0) throw new Error("Reveal at least one tile before cashing out");
      const multiplier = quantizeMultiplier(minesMultiplierFor(round.gridSize, round.mineCount, round.revealed.length));
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeMinesRound;
      return this.#minesResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    throw new Error("Invalid Midnight Mines command");
  }

  #minesResult(
    session: InternalSession,
    round: MinesRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed"
  ): FairnessPlayResult {
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "rainbet-mines",
        roundId: round.id,
        gridSize: round.gridSize,
        mineCount: round.mineCount,
        phase,
        revealed: [...round.revealed],
        ...(roundActive ? {} : { mineLocations: [...round.mines] })
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playMoles(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activeMolesRound) throw new Error("A Moles round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const moles = molesCountFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: MolesRound = {
        id: this.#randomHex(12),
        moles,
        wager,
        nonce,
        fairnessAction: action,
        safeRows: generateMolesLayout(session.serverSeed, {
          gameId: "moles",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        picks: [],
        step: 0
      };
      session.activeMolesRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#molesResult(session, round, requestId, action, 0, 0, true, "active");
    }

    const round = session.activeMolesRound;
    if (!round) throw new Error("Moles round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Moles round");

    const pick = action.match(/^pick:([a-f\d]+):(\d+):(\d+)$/i);
    if (pick) {
      const [, roundId = "", stepText = "", tileText = ""] = pick;
      const step = Number(stepText);
      const tile = Number(tileText);
      if (roundId !== round.id) throw new Error("Stale Moles round ID");
      if (step !== round.step + 1 || step < 1 || step > round.moles) {
        throw new Error("Moles picks must target the next step");
      }
      if (!Number.isSafeInteger(tile) || tile < 0 || tile >= MOLES_HOLE_COUNT) {
        throw new Error("Moles tile is out of range");
      }
      const safeMoles = round.safeRows[step - 1] ?? [];
      const safe = safeMoles.includes(tile);
      round.picks.push({ step, tile, safe });
      if (!safe) {
        delete session.activeMolesRound;
        return this.#molesResult(session, round, requestId, action, 0, 0, false, "lost", safeMoles);
      }

      round.step = step;
      const multiplier = molesMultiplier(round.moles, step);
      if (step === round.moles) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activeMolesRound;
        return this.#molesResult(session, round, requestId, action, multiplier, payout, false, "completed", safeMoles);
      }
      return this.#molesResult(session, round, requestId, action, multiplier, 0, true, "active", safeMoles);
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Moles round ID");
      if (round.step < 1) throw new Error("Find at least one mole before cashing out");
      const multiplier = molesMultiplier(round.moles, round.step);
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeMolesRound;
      return this.#molesResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    throw new Error("Invalid Moles command");
  }

  #molesResult(
    session: InternalSession,
    round: MolesRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed",
    revealedMoles: readonly number[] = []
  ): FairnessPlayResult {
    const lastPick = round.picks.at(-1);
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "moles",
        roundId: round.id,
        moles: round.moles,
        phase,
        step: round.step,
        currentMultiplier: multiplier,
        nextMultiplier: roundActive ? molesMultiplier(round.moles, round.step + 1) : 0,
        picks: round.picks.map((item) => ({ ...item })),
        revealedMoles: [...revealedMoles],
        lastPick: lastPick ? { ...lastPick } : null,
        ...(roundActive ? {} : { safeRows: round.safeRows })
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playPump(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activePumpRound) throw new Error("A Pump round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const difficulty = pumpDifficultyFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: PumpRound = {
        id: this.#randomHex(12),
        difficulty,
        wager,
        nonce,
        fairnessAction: action,
        popPoint: generatePumpPopPoint(session.serverSeed, {
          gameId: "stake-pump",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        step: 0
      };
      session.activePumpRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#pumpResult(session, round, requestId, action, 1, 0, true, "active", 1);
    }

    const round = session.activePumpRound;
    if (!round) throw new Error("Pump round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Pump round");

    const pump = action.match(/^pump:([a-f\d]+):(\d+)$/i);
    if (pump) {
      const [, roundId = "", stepText = ""] = pump;
      const step = Number(stepText);
      const maximumStep = PUMP_MULTIPLIERS[round.difficulty].length - 1;
      if (roundId !== round.id) throw new Error("Stale Pump round ID");
      if (step !== round.step + 1 || step < 1 || step > maximumStep) {
        throw new Error("Pump commands must target the next position");
      }
      const attemptedMultiplier = pumpMultiplier(round.difficulty, round.step);
      if (step === round.popPoint) {
        delete session.activePumpRound;
        return this.#pumpResult(session, round, requestId, action, 0, 0, false, "lost", attemptedMultiplier);
      }
      round.step = step;
      const multiplier = pumpMultiplier(round.difficulty, step);
      if (step === maximumStep) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activePumpRound;
        return this.#pumpResult(session, round, requestId, action, multiplier, payout, false, "completed", multiplier);
      }
      return this.#pumpResult(session, round, requestId, action, multiplier, 0, true, "active", multiplier);
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Pump round ID");
      if (round.step < 1) throw new Error("Pump the balloon at least once before cashing out");
      const multiplier = pumpMultiplier(round.difficulty, round.step);
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activePumpRound;
      return this.#pumpResult(session, round, requestId, action, multiplier, payout, false, "cashed-out", multiplier);
    }

    throw new Error("Invalid Pump command");
  }

  #pumpResult(
    session: InternalSession,
    round: PumpRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed",
    attemptedMultiplier: number
  ): FairnessPlayResult {
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "pump",
        roundId: round.id,
        difficulty: round.difficulty,
        phase,
        step: round.step,
        currentMultiplier: multiplier,
        attemptedMultiplier,
        nextMultiplier: roundActive ? pumpMultiplier(round.difficulty, round.step + 1) : 0,
        chance: pumpChance(round.difficulty, round.step),
        ...(roundActive ? {} : { popPoint: round.popPoint })
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playChicken(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    const cashingOut = action.startsWith("cashout:");
    let round = session.activeChickenRound;

    if (!round) {
      if (cashingOut) throw new Error("Chicken round is not active");
      if (!action.startsWith("cross-next-lane")) throw new Error("Invalid Chicken command");
      if (chickenStepFromAction(action) !== 0) throw new Error("Chicken rounds must begin at lane 1");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const difficulty = chickenDifficultyFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const fairnessAction = `start:${difficulty}`;
      round = {
        id: this.#randomHex(12),
        difficulty,
        wager,
        nonce,
        fairnessAction,
        lanes: generateChickenPath(session.serverSeed, {
          gameId: "chicken-cross",
          clientSeed: session.clientSeed,
          nonce,
          action: fairnessAction
        }),
        crossings: [],
        step: 0
      };
      session.activeChickenRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
    } else {
      if (wager !== round.wager) throw new Error("The wager cannot change during an active Chicken round");
      const declaredDifficulty = action.match(/:difficulty:(easy|medium|hard|expert)(?::|$)/)?.[1];
      if (declaredDifficulty !== undefined && declaredDifficulty !== round.difficulty) {
        throw new Error("The difficulty cannot change during an active Chicken round");
      }
      if (chickenStepFromAction(action) !== round.step) throw new Error("Chicken commands must target the next lane");
    }

    if (cashingOut) {
      if (round.step < 1) throw new Error("Cross at least one lane before cashing out");
      const multiplier = CHICKEN_PATHS[round.difficulty][round.step - 1] ?? 0;
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeChickenRound;
      return this.#chickenResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    if (!action.startsWith("cross-next-lane")) throw new Error("Invalid Chicken command");
    const lane = round.lanes[round.step];
    if (!lane) throw new Error("Chicken has already cleared every lane");
    round.crossings.push(lane);
    if (!lane.success) {
      delete session.activeChickenRound;
      return this.#chickenResult(session, round, requestId, action, 0, 0, false, "lost");
    }

    round.step += 1;
    if (round.step === round.lanes.length) {
      const payout = Math.round(round.wager * lane.multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeChickenRound;
      return this.#chickenResult(session, round, requestId, action, lane.multiplier, payout, false, "completed");
    }
    return this.#chickenResult(session, round, requestId, action, lane.multiplier, 0, true, "active");
  }

  #chickenResult(
    session: InternalSession,
    round: ChickenRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed"
  ): FairnessPlayResult {
    const latest = round.crossings.at(-1);
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "chicken-cross",
        roundId: round.id,
        difficulty: round.difficulty,
        phase,
        success: phase !== "lost",
        successChance: latest?.successChance ?? 0,
        step: round.step,
        currentMultiplier: multiplier,
        collisionLane: phase === "lost" ? (latest?.lane ?? round.step + 1) : null,
        crossings: round.crossings.map((crossing) => ({ ...crossing }))
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playFloorLava(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activeFloorLavaRound) throw new Error("A Floor Is Lava round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const difficulty = floorLavaDifficultyFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: FloorLavaRound = {
        id: this.#randomHex(12),
        difficulty,
        wager,
        nonce,
        fairnessAction: action,
        safeStages: generateFloorLavaField(session.serverSeed, {
          gameId: "floor-is-lava",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        picks: [],
        step: 0
      };
      session.activeFloorLavaRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#floorLavaResult(session, round, requestId, action, 0, 0, true, "active");
    }

    const round = session.activeFloorLavaRound;
    if (!round) throw new Error("Floor Is Lava round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Floor Is Lava round");

    const pick = action.match(/^pick:([a-f\d]+):(\d+):(\d+)$/i);
    if (pick) {
      const [, roundId = "", stepText = "", platformText = ""] = pick;
      const step = Number(stepText);
      const platform = Number(platformText);
      if (roundId !== round.id) throw new Error("Stale Floor Is Lava round ID");
      if (step !== round.step + 1 || step < 1 || step > round.safeStages.length) {
        throw new Error("Floor Is Lava picks must target the next level");
      }
      const available = floorLavaAvailablePlatforms(round.difficulty, round.safeStages, round.step);
      if (!Number.isSafeInteger(platform) || !available.includes(platform)) {
        throw new Error("Floor Is Lava platform is unavailable");
      }
      const safePlatforms = round.safeStages[round.step] ?? [];
      const safe = safePlatforms.includes(platform);
      round.picks.push({ step, platform, safe });
      if (!safe) {
        delete session.activeFloorLavaRound;
        return this.#floorLavaResult(session, round, requestId, action, 0, 0, false, "lost", safePlatforms);
      }

      round.step = step;
      const multiplier = floorLavaMultiplier(round.difficulty, step);
      if (step === round.safeStages.length) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activeFloorLavaRound;
        return this.#floorLavaResult(
          session,
          round,
          requestId,
          action,
          multiplier,
          payout,
          false,
          "completed",
          safePlatforms
        );
      }
      return this.#floorLavaResult(session, round, requestId, action, multiplier, 0, true, "active", safePlatforms);
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Floor Is Lava round ID");
      if (round.step < 1) throw new Error("Land on at least one platform before cashing out");
      const multiplier = floorLavaMultiplier(round.difficulty, round.step);
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeFloorLavaRound;
      return this.#floorLavaResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    throw new Error("Invalid Floor Is Lava command");
  }

  #floorLavaResult(
    session: InternalSession,
    round: FloorLavaRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed",
    revealedSafePlatforms: readonly number[] = []
  ): FairnessPlayResult {
    const progress = floorLavaProgress(round.difficulty, round.step);
    const resolvedPlatforms = round.step > 0 ? (round.safeStages[round.step - 1] ?? []) : [];
    const awaitingNextLevel = phase === "active" && progress.levelComplete && round.step < progress.totalSteps;
    const remainingPlatforms =
      phase === "lost"
        ? [...revealedSafePlatforms]
        : round.step === 0 || awaitingNextLevel
          ? Array.from({ length: FLOOR_LAVA_STARTING_PLATFORMS }, (_, index) => index)
          : [...resolvedPlatforms];
    const lastPick = round.picks.at(-1);
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "floor-is-lava",
        roundId: round.id,
        difficulty: round.difficulty,
        phase,
        step: round.step,
        currentMultiplier: multiplier,
        nextMultiplier: roundActive ? floorLavaMultiplier(round.difficulty, round.step + 1) : 0,
        level: progress.level,
        stage: progress.stage,
        levelComplete: progress.levelComplete,
        picks: round.picks.map((item) => ({ ...item })),
        remainingPlatforms,
        revealedSafePlatforms: lastPick && phase !== "cashed-out" ? [...revealedSafePlatforms] : [],
        lastPick: lastPick ? { ...lastPick } : null,
        ...(roundActive ? {} : { safeStages: round.safeStages })
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playTower(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activeTowerRound) throw new Error("A Tower round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const difficulty = towerDifficultyFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: TowerRound = {
        id: this.#randomHex(12),
        difficulty,
        wager,
        nonce,
        fairnessAction: action,
        safeRows: generateTowerLayout(session.serverSeed, {
          gameId: "tower",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        picks: [],
        floor: 0
      };
      session.activeTowerRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#towerResult(session, round, requestId, action, 0, 0, true, "active");
    }

    const round = session.activeTowerRound;
    if (!round) throw new Error("Tower round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Tower round");

    const pick = action.match(/^pick:([a-f\d]+):(\d+):(\d+)$/i);
    if (pick) {
      const [, roundId = "", floorText = "", columnText = ""] = pick;
      const floor = Number(floorText);
      const column = Number(columnText);
      if (roundId !== round.id) throw new Error("Stale Tower round ID");
      if (floor !== round.floor + 1 || floor < 1 || floor > TOWER_FLOORS) {
        throw new Error("Tower picks must target the next floor");
      }
      const config = TOWER_DIFFICULTIES[round.difficulty];
      if (!Number.isSafeInteger(column) || column < 0 || column >= config.tiles) {
        throw new Error("Tower column is out of range");
      }
      const safe = round.safeRows[floor - 1]?.includes(column) === true;
      round.picks.push({ floor, column, safe });
      if (!safe) {
        delete session.activeTowerRound;
        return this.#towerResult(session, round, requestId, action, 0, 0, false, "lost");
      }

      round.floor = floor;
      const multiplier = TOWER_PAYTABLE[round.difficulty][floor - 1] ?? 0;
      if (floor === TOWER_FLOORS) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activeTowerRound;
        return this.#towerResult(session, round, requestId, action, multiplier, payout, false, "completed");
      }
      return this.#towerResult(session, round, requestId, action, multiplier, 0, true, "active");
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Tower round ID");
      if (round.floor < 1) throw new Error("Clear at least one floor before cashing out");
      const multiplier = TOWER_PAYTABLE[round.difficulty][round.floor - 1] ?? 0;
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeTowerRound;
      return this.#towerResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    throw new Error("Invalid Tower command");
  }

  #towerResult(
    session: InternalSession,
    round: TowerRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed"
  ): FairnessPlayResult {
    const revealedRows = round.picks.map((pick) => ({
      floor: pick.floor,
      safeColumns: round.safeRows[pick.floor - 1] ?? []
    }));
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "tower",
        roundId: round.id,
        difficulty: round.difficulty,
        phase,
        floor: round.floor,
        nextFloor: roundActive ? round.floor + 1 : null,
        currentMultiplier: multiplier,
        picks: round.picks.map((pick) => ({ ...pick })),
        revealedRows,
        ...(roundActive ? {} : { safeRows: round.safeRows })
      },
      serverSeedHash: session.serverSeedHash
    };
  }

  #playDragonTower(session: InternalSession, requestId: string, wager: number, action: string): FairnessPlayResult {
    if (action.startsWith("start:")) {
      if (session.activeDragonTowerRound) throw new Error("A Dragon Tower round is already active");
      if (wager > session.balance) throw new Error("Insufficient demo balance");
      const difficulty = dragonTowerDifficultyFromAction(action);
      const nonce = session.nonce;
      session.nonce += 1;
      const round: DragonTowerRound = {
        id: this.#randomHex(12),
        difficulty,
        wager,
        nonce,
        fairnessAction: action,
        safeRows: generateDragonTowerLayout(session.serverSeed, {
          gameId: "dragon-tower",
          clientSeed: session.clientSeed,
          nonce,
          action
        }),
        picks: [],
        floor: 0
      };
      session.activeDragonTowerRound = round;
      session.balance = Math.round((session.balance - wager) * 100) / 100;
      return this.#dragonTowerResult(session, round, requestId, action, 1, 0, true, "active");
    }

    const round = session.activeDragonTowerRound;
    if (!round) throw new Error("Dragon Tower round is not active");
    if (wager !== round.wager) throw new Error("The wager cannot change during an active Dragon Tower round");

    const pick = action.match(/^pick:([a-f\d]+):(\d+):(\d+)$/i);
    if (pick) {
      const [, roundId = "", floorText = "", columnText = ""] = pick;
      const floor = Number(floorText);
      const column = Number(columnText);
      if (roundId !== round.id) throw new Error("Stale Dragon Tower round ID");
      if (floor !== round.floor + 1 || floor < 1 || floor > DRAGON_TOWER_FLOORS) {
        throw new Error("Dragon Tower picks must target the next floor");
      }
      const config = DRAGON_TOWER_DIFFICULTIES[round.difficulty];
      if (!Number.isSafeInteger(column) || column < 0 || column >= config.tiles) {
        throw new Error("Dragon Tower column is out of range");
      }
      const safe = round.safeRows[floor - 1]?.includes(column) === true;
      round.picks.push({ floor, column, safe });
      if (!safe) {
        delete session.activeDragonTowerRound;
        return this.#dragonTowerResult(session, round, requestId, action, 0, 0, false, "lost");
      }

      round.floor = floor;
      const multiplier = DRAGON_TOWER_PAYTABLE[round.difficulty][floor - 1] ?? 0;
      if (floor === DRAGON_TOWER_FLOORS) {
        const payout = Math.round(round.wager * multiplier * 100) / 100;
        session.balance = Math.round((session.balance + payout) * 100) / 100;
        delete session.activeDragonTowerRound;
        return this.#dragonTowerResult(session, round, requestId, action, multiplier, payout, false, "completed");
      }
      return this.#dragonTowerResult(session, round, requestId, action, multiplier, 0, true, "active");
    }

    const cashout = action.match(/^cashout:([a-f\d]+)$/i);
    if (cashout) {
      if (cashout[1] !== round.id) throw new Error("Stale Dragon Tower round ID");
      if (round.floor < 1) throw new Error("Clear at least one floor before cashing out");
      const multiplier = DRAGON_TOWER_PAYTABLE[round.difficulty][round.floor - 1] ?? 0;
      const payout = Math.round(round.wager * multiplier * 100) / 100;
      session.balance = Math.round((session.balance + payout) * 100) / 100;
      delete session.activeDragonTowerRound;
      return this.#dragonTowerResult(session, round, requestId, action, multiplier, payout, false, "cashed-out");
    }

    throw new Error("Invalid Dragon Tower command");
  }

  #dragonTowerResult(
    session: InternalSession,
    round: DragonTowerRound,
    requestId: string,
    action: string,
    multiplier: number,
    payout: number,
    roundActive: boolean,
    phase: "active" | "lost" | "cashed-out" | "completed"
  ): FairnessPlayResult {
    const revealedRows = round.picks.map((pick) => ({
      floor: pick.floor,
      safeColumns: round.safeRows[pick.floor - 1] ?? []
    }));
    return {
      requestId,
      sessionId: session.id,
      gameId: session.gameId,
      nonce: round.nonce,
      action,
      fairnessAction: round.fairnessAction,
      wager: round.wager,
      multiplier,
      payout,
      balance: session.balance,
      roundActive,
      outcome: {
        kind: "dragon-tower",
        roundId: round.id,
        difficulty: round.difficulty,
        phase,
        floor: round.floor,
        nextFloor: roundActive ? round.floor + 1 : null,
        currentMultiplier: multiplier,
        picks: round.picks.map((pick) => ({ ...pick })),
        revealedRows,
        ...(roundActive ? {} : { safeRows: round.safeRows })
      },
      serverSeedHash: session.serverSeedHash
    };
  }
}
