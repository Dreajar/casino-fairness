export const TARGET_RTP_BPS = 9_700;
export const TARGET_RTP = TARGET_RTP_BPS / 10_000;
export const RAINBET_LIMBO_RTP_BPS = 9_900;
export const RAINBET_LIMBO_RTP = RAINBET_LIMBO_RTP_BPS / 10_000;
export const MULTIPLIER_DECIMAL_PLACES = 4;
export const MULTIPLIER_SCALE = 10 ** MULTIPLIER_DECIMAL_PLACES;
export const SLOT_MULTIPLIER_DECIMAL_PLACES = 2;
export const SLOT_MULTIPLIER_SCALE = 10 ** SLOT_MULTIPLIER_DECIMAL_PLACES;
export const SLOT_RTP_MINIMUM = 0.95;
export const SLOT_RTP_MAXIMUM = 0.98;
export const SLOT_RTP_ROUNDING_ERROR = 0.5 / SLOT_MULTIPLIER_SCALE;
export const SLOT_MAX_SETTLED_MULTIPLIER = 20;

export function quantizeMultiplier(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Multiplier must be a finite non-negative number");
  return Math.round(value * MULTIPLIER_SCALE) / MULTIPLIER_SCALE;
}

export function quantizeSlotMultiplier(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Slot multiplier must be a finite non-negative number");
  return Math.round(value * SLOT_MULTIPLIER_SCALE) / SLOT_MULTIPLIER_SCALE;
}

export function slotRtpRangeAfterQuantization(target = TARGET_RTP): readonly [number, number] {
  return [target - SLOT_RTP_ROUNDING_ERROR, target + SLOT_RTP_ROUNDING_ERROR];
}
