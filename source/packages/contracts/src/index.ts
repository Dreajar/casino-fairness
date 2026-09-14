export * from "@rounder/game-runtime-contracts";
export * from "./club-host.ts";
export * from "./identifiers.ts";
export type GameMechanic = "board" | "cards" | "climb" | "crash" | "instant" | "slots";

export const FLOOR_LAVA_STARTING_PLATFORMS = 49;
export const FLOOR_LAVA_LEVELS = 1;
export const FLOOR_LAVA_DIFFICULTIES = {
  easy: { safeCounts: [42, 35, 28, 21, 14, 7], levels: FLOOR_LAVA_LEVELS },
  medium: { safeCounts: [38, 27, 16, 5], levels: FLOOR_LAVA_LEVELS },
  hard: { safeCounts: [26, 3], levels: FLOOR_LAVA_LEVELS },
  toxic: { safeCounts: [1], levels: FLOOR_LAVA_LEVELS }
} as const;

export type FloorLavaDifficulty = keyof typeof FLOOR_LAVA_DIFFICULTIES;

export function isFloorLavaDifficulty(value: unknown): value is FloorLavaDifficulty {
  return typeof value === "string" && value in FLOOR_LAVA_DIFFICULTIES;
}

export const DRAGON_TOWER_DIFFICULTIES = {
  easy: { safeTiles: 3, tiles: 4 },
  medium: { safeTiles: 2, tiles: 3 },
  hard: { safeTiles: 1, tiles: 2 },
  expert: { safeTiles: 1, tiles: 3 },
  master: { safeTiles: 1, tiles: 4 }
} as const;

export type DragonTowerDifficulty = keyof typeof DRAGON_TOWER_DIFFICULTIES;

export const DRAGON_TOWER_PAYTABLE: Readonly<Record<DragonTowerDifficulty, readonly number[]>> = {
  easy: [1.29, 1.72, 2.3, 3.07, 4.09, 5.45, 7.27, 9.69, 12.92],
  medium: [1.46, 2.18, 3.27, 4.91, 7.37, 11.05, 16.57, 24.86, 37.29],
  hard: [1.94, 3.88, 7.76, 15.52, 31.04, 62.08, 124.16, 248.32, 496.64],
  expert: [2.91, 8.73, 26.19, 78.57, 235.71, 707.13, 2121.39, 6364.17, 19092.51],
  master: [3.88, 15.52, 62.08, 248.32, 993.28, 3973.12, 15892.48, 63569.92, 254279.68]
};

export const DRAGON_TOWER_FLOORS = 9;

export function isDragonTowerDifficulty(value: unknown): value is DragonTowerDifficulty {
  return typeof value === "string" && value in DRAGON_TOWER_DIFFICULTIES;
}

export const TOWER_DIFFICULTIES = {
  easy: { safeTiles: 3, tiles: 4 },
  medium: { safeTiles: 2, tiles: 3 },
  hard: { safeTiles: 1, tiles: 2 },
  expert: { safeTiles: 1, tiles: 3 },
  master: { safeTiles: 1, tiles: 4 }
} as const;

export type TowerDifficulty = keyof typeof TOWER_DIFFICULTIES;

export const TOWER_RTP = 0.96;
export const TOWER_FLOORS = 8;

/** Rainbet Tower floors its displayed multiplier to two decimal places. */
export const TOWER_PAYTABLE: Readonly<Record<TowerDifficulty, readonly number[]>> = {
  easy: [1.28, 1.7, 2.27, 3.03, 4.04, 5.39, 7.19, 9.58],
  medium: [1.44, 2.16, 3.24, 4.86, 7.29, 10.93, 16.4, 24.6],
  hard: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76],
  expert: [2.88, 8.64, 25.92, 77.76, 233.28, 699.84, 2099.52, 6298.56],
  master: [3.84, 15.36, 61.44, 245.76, 983.04, 3932.16, 15728.64, 62914.56]
};

export function isTowerDifficulty(value: unknown): value is TowerDifficulty {
  return typeof value === "string" && value in TOWER_DIFFICULTIES;
}

export interface GameDefinition {
  readonly id: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly mechanic: GameMechanic;
  readonly accent: string;
  readonly accentSecondary: string;
  readonly symbols: readonly string[];
  readonly instructions: readonly string[];
}

export interface PublicGame {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  readonly releaseStage?: "released" | "development";
  readonly category: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly route: string;
  readonly embedRoute: string;
  readonly art: string;
  readonly accent: string;
  readonly minWagerMinor?: string;
  readonly maxWagerMinor?: string;
  readonly minWager?: string;
  readonly maxWager?: string;
}

export interface FairnessSessionView {
  readonly activeRound?: FairnessPlayResult;
  readonly id: string;
  readonly gameId: string;
  readonly clientSeed: string;
  readonly serverSeedHash: string;
  readonly nonce: number;
  readonly demoBalance: number;
  readonly createdAt: string;
}

export interface FairnessPlayResult {
  readonly requestId: string;
  readonly sessionId: string;
  readonly gameId: string;
  readonly nonce: number;
  readonly action: string;
  readonly fairnessAction?: string;
  readonly wager: number;
  readonly multiplier: number;
  readonly payout: number;
  readonly maxPayout?: number;
  readonly balance: number;
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly serverSeedHash: string;
  readonly roundActive?: boolean;
}

export interface FairnessHistoryRound {
  readonly id: string;
  readonly sessionId: string;
  readonly gameId: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly action: string;
  readonly fairnessAction?: string;
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly multiplier: number | string;
  readonly wager: number | string;
  readonly payout: number | string;
  readonly serverSeedHash: string;
  readonly revealedServerSeed?: string;
  readonly proofProtocol?: "casino-game-proof-v1" | "casino-progressive-proof-v1";
  readonly proofPath?: string;
  readonly payoutRounding?: "floor-minor-v1";
  readonly createdAt: string;
}

export interface FairnessHistoryPage {
  readonly rounds: readonly FairnessHistoryRound[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly nextOffset?: number;
}

export type GameToHostMessage =
  | { readonly type: "favorite-request"; readonly gameId: string; readonly favorite: boolean }
  | { readonly type: "history-request"; readonly gameId: string }
  | { readonly type: "game-ready"; readonly gameId: string }
  | { readonly type: "demo-balance-sync"; readonly gameId: string; readonly balance: number }
  | { readonly type: "open-panel"; readonly gameId: string; readonly panel: "fairness" | "rules" }
  | { readonly type: "wager-started"; readonly gameId: string; readonly wager: number }
  | { readonly type: "presentation-complete"; readonly gameId: string; readonly requestId: string }
  | { readonly type: "wager-change"; readonly gameId: string; readonly wager: number }
  | {
      readonly type: "wager-request";
      readonly gameId: string;
      readonly wager: number;
      readonly action: string;
      readonly requestId: string;
    }
  | { readonly type: "sound-state"; readonly muted: boolean }
  | { readonly type: "resize"; readonly height: number };

export type HostToGameMessage =
  | { readonly type: "balance-update"; readonly balance: number }
  | { readonly type: "wager-update"; readonly wager: number }
  | { readonly type: "wager-settled"; readonly requestId: string; readonly payout: number; readonly multiplier: number }
  | { readonly type: "settlement-update"; readonly result: FairnessPlayResult }
  /**
   * A round the host could not settle. Without it a rejected wager leaves the
   * game pending forever, because only `settlement-update` clears that state.
   */
  | {
      readonly type: "wager-rejected";
      readonly requestId: string;
      readonly reason: string;
      readonly retryable?: boolean;
    }
  | { readonly type: "sound-state"; readonly muted: boolean }
  | { readonly type: "resize"; readonly width: number; readonly height: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown, maximum = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function gameId(value: unknown): value is string {
  return nonEmpty(value, 80) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function fairnessPlayResult(value: unknown): value is FairnessPlayResult {
  if (!record(value) || !record(value.outcome)) return false;
  return (
    nonEmpty(value.requestId, 128) &&
    nonEmpty(value.sessionId, 128) &&
    gameId(value.gameId) &&
    typeof value.nonce === "number" &&
    Number.isSafeInteger(value.nonce) &&
    value.nonce >= 0 &&
    nonEmpty(value.action) &&
    (value.fairnessAction === undefined || nonEmpty(value.fairnessAction)) &&
    finite(value.wager) &&
    value.wager >= 0 &&
    finite(value.multiplier) &&
    value.multiplier >= 0 &&
    finite(value.payout) &&
    value.payout >= 0 &&
    (value.maxPayout === undefined || (finite(value.maxPayout) && value.maxPayout > 0)) &&
    finite(value.balance) &&
    value.balance >= 0 &&
    (value.roundActive === undefined || typeof value.roundActive === "boolean") &&
    typeof value.serverSeedHash === "string" &&
    /^[a-f\d]{64}$/i.test(value.serverSeedHash)
  );
}

export function parseGameToHostMessage(value: unknown): GameToHostMessage | undefined {
  if (!record(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "favorite-request":
      return gameId(value.gameId) && typeof value.favorite === "boolean"
        ? { type: value.type, gameId: value.gameId, favorite: value.favorite }
        : undefined;
    case "history-request":
      return gameId(value.gameId) ? { type: value.type, gameId: value.gameId } : undefined;
    case "game-ready":
      return gameId(value.gameId) ? { type: value.type, gameId: value.gameId } : undefined;
    case "demo-balance-sync":
      return gameId(value.gameId) && finite(value.balance) && value.balance >= 0
        ? { type: value.type, gameId: value.gameId, balance: value.balance }
        : undefined;
    case "open-panel":
      return gameId(value.gameId) && (value.panel === "fairness" || value.panel === "rules")
        ? { type: value.type, gameId: value.gameId, panel: value.panel }
        : undefined;
    case "wager-started":
      return gameId(value.gameId) && finite(value.wager) && value.wager >= 0
        ? { type: value.type, gameId: value.gameId, wager: value.wager }
        : undefined;
    case "presentation-complete":
      return gameId(value.gameId) && nonEmpty(value.requestId, 128)
        ? { type: value.type, gameId: value.gameId, requestId: value.requestId }
        : undefined;
    case "wager-change":
      return gameId(value.gameId) && finite(value.wager) && value.wager >= 0.1
        ? { type: value.type, gameId: value.gameId, wager: value.wager }
        : undefined;
    case "wager-request":
      return gameId(value.gameId) &&
        finite(value.wager) &&
        value.wager >= 0 &&
        nonEmpty(value.action) &&
        nonEmpty(value.requestId, 128)
        ? {
            type: value.type,
            gameId: value.gameId,
            wager: value.wager,
            action: value.action,
            requestId: value.requestId
          }
        : undefined;
    case "sound-state":
      return typeof value.muted === "boolean" ? { type: value.type, muted: value.muted } : undefined;
    case "resize":
      return finite(value.height) && value.height > 0 ? { type: value.type, height: value.height } : undefined;
    default:
      return undefined;
  }
}

export function parseHostToGameMessage(value: unknown): HostToGameMessage | undefined {
  if (!record(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "balance-update":
      return finite(value.balance) && value.balance >= 0 ? { type: value.type, balance: value.balance } : undefined;
    case "wager-update":
      return finite(value.wager) && value.wager >= 0 ? { type: value.type, wager: value.wager } : undefined;
    case "wager-settled":
      return nonEmpty(value.requestId, 128) &&
        finite(value.payout) &&
        value.payout >= 0 &&
        finite(value.multiplier) &&
        value.multiplier >= 0
        ? { type: value.type, requestId: value.requestId, payout: value.payout, multiplier: value.multiplier }
        : undefined;
    case "settlement-update":
      return fairnessPlayResult(value.result) ? { type: value.type, result: value.result } : undefined;
    case "wager-rejected":
      return nonEmpty(value.requestId, 128) && nonEmpty(value.reason, 500)
        ? {
            type: value.type,
            requestId: value.requestId,
            reason: value.reason,
            ...(typeof value.retryable === "boolean" ? { retryable: value.retryable } : {})
          }
        : undefined;
    case "sound-state":
      return typeof value.muted === "boolean" ? { type: value.type, muted: value.muted } : undefined;
    case "resize":
      return finite(value.width) && value.width > 0 && finite(value.height) && value.height > 0
        ? { type: value.type, width: value.width, height: value.height }
        : undefined;
    default:
      return undefined;
  }
}
