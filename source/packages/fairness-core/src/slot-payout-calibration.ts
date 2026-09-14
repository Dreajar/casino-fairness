import { quantizeSlotMultiplier } from "./constants.ts";
import { SLOT_20X_PROFILES } from "./slot-20x-profiles.ts";
import { SLOT_PAYOUT_SCALES } from "./slot-payout-scales.ts";

export const SLOT_PAYOUT_MATH_VERSION = "slot-payout-calibration-v1";
export type SlotPayoutMathVersion = "slot-payout-calibration-v1" | "slot-payout-calibration-v2" | "slot-payout-20x-v3";
export const SLOT_20X_MATH_VERSION = "slot-payout-20x-v3";
export const SLOT_MAX_CHARGED_MULTIPLIER = 20;
const isTwentyX = (version?: SlotPayoutMathVersion) => version === undefined || version === SLOT_20X_MATH_VERSION;
// Fixed, public correction to the already-calibrated schedule. Applying it
// after the old cap preserves a pointwise bound against the retained v1 audit.
const correctionBpsFor = (gameId: string, version?: SlotPayoutMathVersion) =>
  version === "slot-payout-calibration-v1"
    ? 10000
    : gameId === "sweet-bonanza-2500"
      ? 9800
      : gameId === "american-aurora" || gameId === "rip-city"
        ? 9700
        : 10000;
function correctMultiplier(value: number, bps: number): number {
  if (bps === 10000) return value;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents * bps + 5000)) throw new Error("Payout correction exceeds exact integer range");
  return Math.floor((cents * bps + 5000) / 10000) / 100;
}

export function calibratedSlotMultiplier(
  gameId: string,
  action: string,
  value: number,
  cap: number,
  version?: SlotPayoutMathVersion
): number {
  const scales = SLOT_PAYOUT_SCALES[gameId];
  if (!scales) return value;
  if (isTwentyX(version)) {
    const profile = SLOT_20X_PROFILES[gameId]?.[action];
    if (!profile) throw new Error(`Missing 20x slot profile: ${gameId}/${action}`);
    if (profile.preserveV2)
      return Math.min(
        SLOT_MAX_CHARGED_MULTIPLIER * profile.cost,
        calibratedSlotMultiplier(gameId, action, value, cap, "slot-payout-calibration-v2")
      );
    return quantizeSlotMultiplier(Math.min(SLOT_MAX_CHARGED_MULTIPLIER * profile.cost, value * profile.factor));
  }
  const factor = scales[action];
  if (factor === undefined) throw new Error(`Invalid ${gameId} action`);
  return correctMultiplier(quantizeSlotMultiplier(Math.min(cap, value * factor)), correctionBpsFor(gameId, version));
}

const payoutKeys = new Set([
  "payout",
  "basePay",
  "rewardMultiplier",
  "win",
  "totalWin",
  "rawWin",
  "baseGameWin",
  "scatterAward",
  "superScatterAward",
  "rawTotal",
  "uncappedTotal",
  "uncappedMultiplier",
  "winMultiplier",
  "accumulatedMultiplier",
  "lineMultiplier",
  "coinMultiplier",
  "baseMultiplier",
  "bonusMultiplier"
]);

/** Convert monetary awards only. Orb, wild, wheel and persistent feature multipliers are NOT money. */
function monetaryField(gameId: string, path: readonly string[]): boolean {
  const key = path.at(-1)!;
  if (payoutKeys.has(key)) return true;
  if (gameId === "american-aurora") return key.endsWith("WinCents") || key === "winCents";
  if (key === "finalMultiplier") return path.length === 1;
  if (key === "totalMultiplier") return gameId !== "gates-of-olympus-super-scatter";
  if (key === "featureMultiplier") return gameId === "wanted-dead-or-wild" && path.length === 1;
  if (key === "rate") return gameId === "witch-blood-megaways";
  if (key !== "multiplier") return false;
  return (
    path.some((part) => ["wins", "lineWins", "waysWins", "evaluatedWins", "scatterWin"].includes(part)) ||
    (["midnight-train-heist", "midas-feast", "sands-of-sekhmet", "poseidons-abyssal-crown", "sixsixsix"].includes(
      gameId
    ) &&
      path[0] === "cascades") ||
    (["wanted-dead-or-wild", "rip-city", "xmas-drop"].includes(gameId) &&
      path.length === 3 &&
      ["featureSpins", "bonusSpins"].includes(path[0]!))
  );
}

function visibleAwardTotal(gameId: string, outcome: Readonly<Record<string, unknown>>, fallback: number): number {
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sum = (value: unknown, key: string) =>
    Array.isArray(value) ? value.reduce((total, item) => total + number(record(item)[key]), 0) : 0;
  let total = fallback;
  if (["fruit-party", "sweet-bonanza-2500", "neon-syndicate"].includes(gameId)) total = number(outcome.rawTotal);
  if (gameId === "rip-city") total = sum(outcome.wins, "multiplier") + sum(outcome.bonusSpins, "multiplier");
  if (gameId === "xmas-drop") total = sum(outcome.wins, "multiplier") + sum(outcome.featureSpins, "multiplier");
  if (gameId === "wanted-dead-or-wild") total = number(outcome.baseMultiplier) + number(outcome.featureMultiplier);
  if (gameId === "fist-of-destruction") total = number(outcome.win) + number(record(outcome.bonus).win);
  if (gameId === "american-aurora") {
    const ticket = record(outcome.ticket);
    if (number(ticket.betCents) > 0) total = number(ticket.uncappedWinCents) / number(ticket.betCents);
  }
  return Math.max(fallback, total);
}

/**
 * Public per-action conversion of the legacy award schedule into base-wager payouts.
 * Preserve RNG, feature selection, and continuations. v3 applies the complete
 * round's 20x charged-wager cap; historical versions retain their old caps.
 * Apply once, before charged-wager normalization. Never derive factors from a player's history.
 */
export function calibrateSlotPayout(
  gameId: string,
  action: string,
  resolved: { readonly multiplier: number; readonly outcome: Readonly<Record<string, unknown>> },
  rawCap: number,
  version?: SlotPayoutMathVersion
): { readonly multiplier: number; readonly outcome: Readonly<Record<string, unknown>> } {
  const scales = SLOT_PAYOUT_SCALES[gameId];
  if (!scales) return resolved;
  const factor = isTwentyX(version) ? SLOT_20X_PROFILES[gameId]?.[action]?.factor : scales[action];
  if (factor === undefined) throw new Error(`Invalid ${gameId} action`);
  const correctionBps = isTwentyX(version) ? 10000 : correctionBpsFor(gameId, version);
  const multiplier = calibratedSlotMultiplier(gameId, action, resolved.multiplier, rawCap, version);
  const payoutCap = isTwentyX(version)
    ? SLOT_MAX_CHARGED_MULTIPLIER * SLOT_20X_PROFILES[gameId]![action]!.cost
    : rawCap;
  const effectiveMaximum = isTwentyX(version)
    ? payoutCap
    : correctMultiplier(quantizeSlotMultiplier(Math.min(rawCap, rawCap * factor)), correctionBps);
  // Apportion capped v3 awards across the visible monetary components, while
  // leaving symbol values and feature mechanics untouched.
  const displayTotal = isTwentyX(version)
    ? visibleAwardTotal(gameId, resolved.outcome, resolved.multiplier)
    : resolved.multiplier;
  const displayFactor = isTwentyX(version) && displayTotal > 0 ? multiplier / displayTotal : factor;
  const convert = (value: unknown, path: string[]): unknown => {
    if (typeof value === "number" && monetaryField(gameId, path)) {
      const scaled = correctionBps === 10000 ? value * displayFactor : (value * displayFactor * correctionBps) / 10000;
      if (path.at(-1)?.endsWith("Cents")) return Math.round(scaled);
      return path.at(-1) === "multiplier" ? quantizeSlotMultiplier(scaled) : scaled;
    }
    if (Array.isArray(value)) return value.map((item, index) => convert(item, [...path, String(index)]));
    if (value !== null && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item, [...path, key])]));
    return value;
  };
  const outcome = convert(resolved.outcome, []) as Record<string, unknown>;
  if ("finalMultiplier" in outcome) outcome.finalMultiplier = multiplier;
  if ("totalMultiplier" in outcome) outcome.totalMultiplier = multiplier;
  if (gameId === "american-aurora") {
    const ticket = outcome.ticket as Record<string, unknown>;
    ticket.totalWinCents = Math.round(multiplier * Number(ticket.betCents));
    ticket.maxWinReached = multiplier >= (correctionBps === 10000 ? payoutCap : effectiveMaximum);
  }
  if ("capped" in outcome)
    outcome.capped = resolved.outcome.capped === true || resolved.multiplier * factor > payoutCap;
  for (const key of ["maxMultiplier", "maxWin", "maxWinCap"]) if (key in outcome) outcome[key] = effectiveMaximum;
  if ("winTier" in outcome)
    outcome.winTier =
      multiplier >= 20
        ? "legendary"
        : multiplier >= 10
          ? "epic"
          : multiplier >= 5
            ? "big"
            : multiplier > 0
              ? "win"
              : "none";
  outcome.payoutCalibration = {
    version: isTwentyX(version)
      ? SLOT_20X_MATH_VERSION
      : correctionBps === 10000
        ? SLOT_PAYOUT_MATH_VERSION
        : "slot-payout-calibration-v2",
    ...(correctionBps === 10000 ? {} : { correctionBps }),
    ...(isTwentyX(version) && SLOT_20X_PROFILES[gameId]?.[action]?.preserveV2
      ? { preservedMathVersion: "slot-payout-calibration-v2" }
      : {}),
    factor,
    cap: payoutCap,
    effectiveMaximum,
    finalMultiplier: multiplier
  };
  return { multiplier, outcome };
}
