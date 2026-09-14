export const USD_SCALE: 8;
export const USD_FACTOR: bigint;
export const MINIMUM_WAGER_MINOR: bigint;
export const MAXIMUM_SLOT_WAGER_MINOR: bigint;
export function parseUsdAtoms(value: string | number): bigint;
export function formatUsdAtoms(value: string | bigint): string;
