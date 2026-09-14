import { USD_SCALE, USD_FACTOR, parseUsdAtoms, formatUsdAtoms } from "../../../../packages/dice-proof/src/usd.mjs";
export { USD_SCALE, USD_FACTOR };

export class MoneyError extends Error {}

export function parseUsd(value: string): bigint {
  try { return parseUsdAtoms(value); } catch (error) { throw new MoneyError((error as Error).message); }
}

export function formatUsd(minor: bigint): string { return formatUsdAtoms(minor); }

export function parseMinorInteger(value: string, label = "amount"): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new MoneyError(`${label} must be an integer minor-unit string`);
  return BigInt(value);
}

export function decimalRatio(value: string): { readonly numerator: bigint; readonly denominator: bigint } {
  const normalized = value.trim();
  const match = normalized.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new MoneyError(`Invalid non-negative decimal ${value}`);
  const whole = match[1];
  if (whole === undefined) throw new MoneyError(`Invalid decimal ${value}`);
  const fraction = match[2] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  return { numerator: BigInt(whole) * denominator + BigInt(fraction || "0"), denominator };
}

export function multiplyMinorByDecimal(minor: bigint, decimal: string): bigint {
  if (minor < 0n) throw new MoneyError("Cannot multiply a negative money amount");
  const { numerator, denominator } = decimalRatio(decimal);
  return minor * numerator / denominator;
}

/** Payouts round down at the final accounting unit. */
export function floorMinorByDecimal(minor: bigint, decimal: string): bigint {
  if (minor < 0n) throw new MoneyError("Cannot multiply a negative money amount");
  const { numerator, denominator } = decimalRatio(decimal);
  return minor * numerator / denominator;
}

/** Coverage rounds UP: a fractional bound must never under-reserve a payout. */
export function ceilMinorByDecimal(minor: bigint, decimal: string): bigint {
  if (minor < 0n) throw new MoneyError("Cannot multiply a negative money amount");
  const { numerator, denominator } = decimalRatio(decimal);
  return (minor * numerator + denominator - 1n) / denominator;
}

export function splitHouseWin(
  wagerMinor: bigint,
  payoutMinor: bigint,
  clubShareBps: number
): {
  readonly houseWinMinor: bigint;
  readonly houseLossMinor: bigint;
  readonly clubShareMinor: bigint;
  readonly platformShareMinor: bigint;
} {
  if (wagerMinor <= 0n || payoutMinor < 0n) throw new MoneyError("Invalid round amounts");
  if (!Number.isInteger(clubShareBps) || clubShareBps < 0 || clubShareBps > 10_000) {
    throw new MoneyError("Club share must be between 0 and 10000 basis points");
  }
  const houseWinMinor = wagerMinor > payoutMinor ? wagerMinor - payoutMinor : 0n;
  const houseLossMinor = payoutMinor > wagerMinor ? payoutMinor - wagerMinor : 0n;
  const clubShareMinor = (houseWinMinor * BigInt(clubShareBps)) / 10_000n;
  return {
    houseWinMinor,
    houseLossMinor,
    clubShareMinor,
    platformShareMinor: houseWinMinor - clubShareMinor
  };
}

export function expectedRoundValue(
  wagerMinor: bigint,
  expectedRtpBps: number,
  clubShareBps: number
): {
  readonly playerReturnMicrominor: bigint;
  readonly houseValueMicrominor: bigint;
  readonly clubShareMicrominor: bigint;
  readonly platformValueMicrominor: bigint;
} {
  if (wagerMinor <= 0n) throw new MoneyError("Expected value requires a positive wager");
  for (const [label, value] of [
    ["Expected RTP", expectedRtpBps],
    ["Club share", clubShareBps]
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new MoneyError(`${label} must be between 0 and 10000 basis points`);
    }
  }
  const playerReturnMicrominor = wagerMinor * BigInt(expectedRtpBps) / 10_000n;
  const houseValueMicrominor = wagerMinor - playerReturnMicrominor;
  const clubShareMicrominor = (houseValueMicrominor * BigInt(clubShareBps)) / 10_000n;
  return {
    playerReturnMicrominor,
    houseValueMicrominor,
    clubShareMicrominor,
    platformValueMicrominor: houseValueMicrominor - clubShareMicrominor
  };
}

export function formatMicrominorUsd(value: bigint): string {
  return formatUsd(value);
}

export interface AssetAmountConfig {
  readonly scale: number;
  readonly usdStablecoin: boolean;
}

export function assetAmountToUsdMinor(value: string, config: AssetAmountConfig): bigint {
  if (!config.usdStablecoin) throw new MoneyError("Asset is not approved as a 1:1 USD stablecoin");
  if (!Number.isInteger(config.scale) || config.scale < 2 || config.scale > 18)
    throw new MoneyError("Invalid asset scale");
  const match = value.trim().match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new MoneyError("Invalid asset amount");
  const whole = match[1];
  if (whole === undefined) throw new MoneyError("Invalid asset amount");
  const fraction = match[2] ?? "";
  if (fraction.length > config.scale) throw new MoneyError("Asset amount exceeds configured precision");
  const assetMinor = BigInt(whole) * 10n ** BigInt(config.scale) + BigInt(fraction.padEnd(config.scale, "0") || "0");
  if (config.scale <= USD_SCALE) return assetMinor * 10n ** BigInt(USD_SCALE - config.scale);
  const divisor = 10n ** BigInt(config.scale - USD_SCALE);
  if (assetMinor % divisor !== 0n) throw new MoneyError("Stablecoin amount is below USD eight-decimal precision");
  return assetMinor / divisor;
}

export function assetAmountToUsdMinorFloor(value: string, config: AssetAmountConfig): bigint {
  if (!config.usdStablecoin) throw new MoneyError("Asset is not approved as a 1:1 USD stablecoin");
  if (!Number.isInteger(config.scale) || config.scale < 2 || config.scale > 18)
    throw new MoneyError("Invalid asset scale");
  const match = value.trim().match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new MoneyError("Invalid asset amount");
  const whole = match[1];
  if (whole === undefined) throw new MoneyError("Invalid asset amount");
  const fraction = match[2] ?? "";
  if (fraction.length > config.scale) throw new MoneyError("Asset amount exceeds configured precision");
  const assetMinor = BigInt(whole) * 10n ** BigInt(config.scale) + BigInt(fraction.padEnd(config.scale, "0") || "0");
  return config.scale <= USD_SCALE ? assetMinor * 10n ** BigInt(USD_SCALE - config.scale) : assetMinor / 10n ** BigInt(config.scale - USD_SCALE);
}

export function usdMinorToAssetAmount(minor: bigint, scale: number): string {
  if (minor < 0n || !Number.isInteger(scale) || scale < 2 || scale > 18) {
    throw new MoneyError("Invalid asset conversion");
  }
  if (scale < USD_SCALE && minor % (10n ** BigInt(USD_SCALE - scale)) !== 0n)
    throw new MoneyError("Amount cannot be represented exactly by this asset");
  const assetMinor = scale < USD_SCALE ? minor / (10n ** BigInt(USD_SCALE - scale)) : minor * 10n ** BigInt(scale - USD_SCALE);
  const divisor = 10n ** BigInt(scale);
  return `${assetMinor / divisor}.${(assetMinor % divisor).toString().padStart(scale, "0")}`;
}
