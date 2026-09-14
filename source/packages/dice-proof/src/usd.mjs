/** Ledger amounts are integer hundred-millionths of a US dollar. */
export const USD_SCALE = 8;
export const USD_FACTOR = 100_000_000n;
export const MINIMUM_WAGER_MINOR = 10_000_000n;
export const MAXIMUM_SLOT_WAGER_MINOR = 10_000_000_000n;

export function parseUsdAtoms(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(String(value).trim());
  if (!match) throw new Error("Amount must be a non-negative USD value with at most eight decimal places");
  return BigInt(match[1]) * USD_FACTOR + BigInt((match[2] ?? "").padEnd(USD_SCALE, "0"));
}

export function formatUsdAtoms(value) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % USD_FACTOR).toString().padStart(USD_SCALE, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${amount < 0n ? "-" : ""}${absolute / USD_FACTOR}.${fraction}`;
}
