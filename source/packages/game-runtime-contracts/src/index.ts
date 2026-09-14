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
  readonly balance: number;
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly serverSeedHash: string;
  readonly roundActive?: boolean;
}

export type GameToHostMessage =
  | { readonly type: "game-ready"; readonly gameId: string }
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
  | { readonly type: "wager-rejected"; readonly requestId: string; readonly reason: string }
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
    case "game-ready":
      return gameId(value.gameId) ? { type: value.type, gameId: value.gameId } : undefined;
    case "wager-started":
      return gameId(value.gameId) && finite(value.wager) && value.wager >= 0
        ? { type: value.type, gameId: value.gameId, wager: value.wager }
        : undefined;
    case "presentation-complete":
      return gameId(value.gameId) && nonEmpty(value.requestId, 128)
        ? { type: value.type, gameId: value.gameId, requestId: value.requestId }
        : undefined;
    case "wager-change":
      return gameId(value.gameId) &&
        finite(value.wager) &&
        (value.wager > 0 || (value.gameId === "limbo" && value.wager === 0))
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
        ? { type: value.type, requestId: value.requestId, reason: value.reason }
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
