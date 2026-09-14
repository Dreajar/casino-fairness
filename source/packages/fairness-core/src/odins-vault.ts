import { quantizeSlotMultiplier, SLOT_MAX_SETTLED_MULTIPLIER, TARGET_RTP } from "./constants.ts";

export const ODINS_VAULT_COLUMNS = 5;
export const ODINS_VAULT_ROWS = 6;
export const ODINS_VAULT_MIN_WAGER = 0.1;
export const ODINS_VAULT_MAX_WAGER = 50;
export const ODINS_VAULT_MAX_MULTIPLIER = SLOT_MAX_SETTLED_MULTIPLIER;
export const ODINS_VAULT_MAX_COIN_VALUE = 500_000;
export const ODINS_VAULT_RTP_CALIBRATION = TARGET_RTP / 0.967;
export const ODINS_VAULT_ACTION_CALIBRATION: Readonly<Record<OdinsVaultAction, number>> = {
  spin: 1,
  "enhancer:bonus": 2.0296953620360245,
  "enhancer:degen": 8.439683886898873,
  "enhancer:trickster": 15.667952629090827,
  "enhancer:fu": 403,
  "buy:bonus": 5.477282860062938,
  "buy:super": 15.29579389447073
};

export const ODINS_VAULT_REGULAR_SYMBOLS = [
  "clubs",
  "spades",
  "diamonds",
  "hearts",
  "horn",
  "axe",
  "mask",
  "horse",
  "falcon"
] as const;

export type OdinsVaultRegularSymbol = (typeof ODINS_VAULT_REGULAR_SYMBOLS)[number];
export type OdinsVaultCoinTier = "bronze" | "silver" | "gold" | "sapphire" | "ruby" | "diamond" | "max";
export type OdinsVaultBonusTier = "free" | "super" | "legendary" | "mythic";
export type OdinsVaultAction =
  | "spin"
  | "enhancer:bonus"
  | "enhancer:degen"
  | "enhancer:trickster"
  | "enhancer:fu"
  | "buy:bonus"
  | "buy:super";

export type OdinsVaultSpecialSymbol =
  | "eye"
  | "mystery"
  | "coin"
  | "max-coin"
  | "key"
  | "bard"
  | "upgrader"
  | "redrop"
  | "collector"
  | "super-collector"
  | "scatter";

export type OdinsVaultSymbol = OdinsVaultRegularSymbol | OdinsVaultSpecialSymbol;

export interface OdinsVaultRandom {
  int(maxExclusive: number): number;
  pick<T>(values: readonly T[]): T;
}

export interface OdinsVaultCell {
  readonly symbol: OdinsVaultSymbol;
  readonly resolvedSymbol?: OdinsVaultRegularSymbol;
  readonly coinTier?: OdinsVaultCoinTier;
  readonly coinValue?: number;
}

export interface OdinsVaultLineWin {
  readonly line: number;
  readonly symbol: OdinsVaultRegularSymbol;
  readonly count: 3 | 4 | 5;
  readonly positions: readonly number[];
  readonly multiplier: number;
}

export interface OdinsVaultRedrop {
  readonly positions: readonly number[];
  readonly replacements: readonly OdinsVaultRegularSymbol[];
}

export interface OdinsVaultGridResult {
  readonly grid: readonly OdinsVaultCell[];
  readonly lineWins: readonly OdinsVaultLineWin[];
  readonly lineMultiplier: number;
  readonly coinMultiplier: number;
  readonly totalMultiplier: number;
  readonly scatterCount: number;
  readonly eyeMeterGain: number;
  readonly eyeTarget?: OdinsVaultRegularSymbol;
  readonly globalMultiplier: number;
  readonly globalSide?: "red" | "white";
  readonly bardMultiplier: number;
  readonly collectorActivations: number;
  readonly redrop?: OdinsVaultRedrop;
  readonly upgraded: boolean;
  readonly presentationEvents: readonly string[];
}

export interface OdinsVaultBonusSpin extends OdinsVaultGridResult {
  readonly spin: number;
  readonly tier: OdinsVaultBonusTier;
  readonly upgradedTo?: OdinsVaultBonusTier;
}

export interface OdinsVaultOutcome {
  readonly kind: "odins-vault";
  readonly action: OdinsVaultAction;
  readonly costMultiplier: number;
  readonly columns: 5;
  readonly rows: 6;
  readonly paylines: 28;
  readonly base: OdinsVaultGridResult;
  readonly bonusTier?: OdinsVaultBonusTier;
  readonly bonusSpins: readonly OdinsVaultBonusSpin[];
  readonly totalMultiplier: number;
  readonly capped: boolean;
  readonly presentationEvents: readonly string[];
}

export const ODINS_VAULT_PAYTABLE: Readonly<Record<OdinsVaultRegularSymbol, Readonly<Record<3 | 4 | 5, number>>>> = {
  clubs: { 3: 0.1, 4: 0.2, 5: 0.4 },
  spades: { 3: 0.1, 4: 0.2, 5: 0.5 },
  diamonds: { 3: 0.1, 4: 0.2, 5: 0.7 },
  hearts: { 3: 0.2, 4: 0.5, 5: 1 },
  horn: { 3: 1, 4: 2, 5: 3 },
  axe: { 3: 1, 4: 2, 5: 4 },
  mask: { 3: 1, 4: 2, 5: 5 },
  horse: { 3: 2, 4: 3, 5: 10 },
  falcon: { 3: 2.5, 4: 10, 5: 25 }
};

export const ODINS_VAULT_COIN_VALUES: Readonly<Record<Exclude<OdinsVaultCoinTier, "max">, readonly number[]>> = {
  bronze: [1, 2, 3, 4],
  silver: [5, 10, 15],
  gold: [25, 50, 100],
  sapphire: [150, 200, 250, 500],
  ruby: [750, 1_000, 2_500, 5_000],
  diamond: [10_000, 25_000, 50_000]
};

// The source does not publish the exact 28 line coordinates. These are a documented,
// symmetrical five-reel approximation using the full six-row board.
export const ODINS_VAULT_PAYLINES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [5, 5, 5, 5, 5],
  [0, 1, 2, 1, 0],
  [5, 4, 3, 4, 5],
  [0, 0, 1, 0, 0],
  [5, 5, 4, 5, 5],
  [1, 2, 3, 2, 1],
  [4, 3, 2, 3, 4],
  [2, 1, 0, 1, 2],
  [3, 4, 5, 4, 3],
  [0, 1, 1, 1, 0],
  [5, 4, 4, 4, 5],
  [1, 0, 1, 0, 1],
  [4, 5, 4, 5, 4],
  [0, 2, 4, 2, 0],
  [5, 3, 1, 3, 5],
  [2, 0, 2, 0, 2],
  [3, 5, 3, 5, 3],
  [0, 1, 2, 3, 4],
  [5, 4, 3, 2, 1],
  [1, 2, 3, 4, 5],
  [4, 3, 2, 1, 0],
  [0, 2, 3, 2, 0],
  [5, 3, 2, 3, 5]
];

const MYTHIC_PATTERNS = [
  ...ODINS_VAULT_PAYLINES.slice(0, 6),
  ODINS_VAULT_PAYLINES[6],
  ODINS_VAULT_PAYLINES[7],
  ODINS_VAULT_PAYLINES[22],
  ODINS_VAULT_PAYLINES[23],
  ODINS_VAULT_PAYLINES[24],
  ODINS_VAULT_PAYLINES[25]
].filter((line): line is readonly [number, number, number, number, number] => line !== undefined);

const REGULAR_WEIGHTS: readonly OdinsVaultRegularSymbol[] = [
  ...Array.from({ length: 18 }, () => "clubs" as const),
  ...Array.from({ length: 17 }, () => "spades" as const),
  ...Array.from({ length: 16 }, () => "diamonds" as const),
  ...Array.from({ length: 15 }, () => "hearts" as const),
  ...Array.from({ length: 9 }, () => "horn" as const),
  ...Array.from({ length: 8 }, () => "axe" as const),
  ...Array.from({ length: 7 }, () => "mask" as const),
  ...Array.from({ length: 6 }, () => "horse" as const),
  ...Array.from({ length: 4 }, () => "falcon" as const)
];

const BONUS_TIERS: readonly OdinsVaultBonusTier[] = ["free", "super", "legendary", "mythic"];
const COIN_TIERS: readonly Exclude<OdinsVaultCoinTier, "max">[] = [
  "bronze",
  "silver",
  "gold",
  "sapphire",
  "ruby",
  "diamond"
];

const actionCosts: Readonly<Record<OdinsVaultAction, number>> = {
  spin: 1,
  "enhancer:bonus": 3,
  "enhancer:degen": 25,
  "enhancer:trickster": 75,
  "enhancer:fu": 5_000,
  "buy:bonus": 200,
  "buy:super": 1_000
};

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function isOdinsVaultAction(value: string): value is OdinsVaultAction {
  return Object.hasOwn(actionCosts, value);
}

export function odinsVaultCostMultiplierForAction(action: string): number {
  if (!isOdinsVaultAction(action)) throw new Error("Invalid Odin's Vault action");
  return actionCosts[action];
}

export function odinsVaultRawCapForAction(action: string): number {
  return ODINS_VAULT_MAX_MULTIPLIER * odinsVaultCostMultiplierForAction(action);
}

export function odinsVaultCoinTierForValue(value: number): OdinsVaultCoinTier | undefined {
  if (value === ODINS_VAULT_MAX_COIN_VALUE) return "max";
  for (const tier of COIN_TIERS) {
    if (ODINS_VAULT_COIN_VALUES[tier].includes(value)) return tier;
  }
  return undefined;
}

export function upgradeOdinsVaultBonusTier(tier: OdinsVaultBonusTier): OdinsVaultBonusTier {
  const index = BONUS_TIERS.indexOf(tier);
  return BONUS_TIERS[Math.min(BONUS_TIERS.length - 1, index + 1)] ?? tier;
}

function gridIndex(column: number, row: number): number {
  return row * ODINS_VAULT_COLUMNS + column;
}

function paySymbol(cell: OdinsVaultCell | undefined): OdinsVaultRegularSymbol | undefined {
  if (!cell) return undefined;
  if (cell.symbol === "mystery") return cell.resolvedSymbol;
  return (ODINS_VAULT_REGULAR_SYMBOLS as readonly string[]).includes(cell.symbol)
    ? (cell.symbol as OdinsVaultRegularSymbol)
    : undefined;
}

export function evaluateOdinsVaultPaylines(grid: readonly OdinsVaultCell[]): readonly OdinsVaultLineWin[] {
  if (grid.length !== ODINS_VAULT_COLUMNS * ODINS_VAULT_ROWS) {
    throw new Error("Odin's Vault grid must contain exactly 30 cells");
  }
  const wins: OdinsVaultLineWin[] = [];
  for (const [lineIndex, rows] of ODINS_VAULT_PAYLINES.entries()) {
    const first = paySymbol(grid[gridIndex(0, rows[0])]);
    if (!first) continue;
    let count = 1;
    const positions = [gridIndex(0, rows[0])];
    for (let column = 1; column < ODINS_VAULT_COLUMNS; column += 1) {
      const row = rows[column];
      if (row === undefined) break;
      const position = gridIndex(column, row);
      if (paySymbol(grid[position]) !== first) break;
      count += 1;
      positions.push(position);
    }
    if (count >= 3) {
      const paidCount = Math.min(5, count) as 3 | 4 | 5;
      wins.push({
        line: lineIndex + 1,
        symbol: first,
        count: paidCount,
        positions,
        multiplier: ODINS_VAULT_PAYTABLE[first][paidCount]
      });
    }
  }
  return wins;
}

export function odinsVaultFreeSpinTierForGrid(grid: readonly OdinsVaultCell[]): OdinsVaultBonusTier | undefined {
  const scatters = grid.flatMap((cell, index) => (cell.symbol === "scatter" ? [index] : []));
  if (scatters.length < 3) return undefined;
  if (scatters.length >= 5) {
    const mythic = MYTHIC_PATTERNS.some((rows) =>
      rows.every((row, column) => grid[gridIndex(column, row)]?.symbol === "scatter")
    );
    return mythic ? "mythic" : "legendary";
  }
  return scatters.length === 4 ? "super" : "free";
}

function modeBoost(action: OdinsVaultAction, tier?: OdinsVaultBonusTier): number {
  const actionBoost = {
    spin: 0,
    "enhancer:bonus": 55,
    "enhancer:degen": 140,
    "enhancer:trickster": 230,
    "enhancer:fu": 480,
    "buy:bonus": 90,
    "buy:super": 170
  }[action];
  const tierBoost = tier ? (BONUS_TIERS.indexOf(tier) + 1) * 45 : 0;
  return actionBoost + tierBoost;
}

function randomCoin(random: OdinsVaultRandom, boost: number): OdinsVaultCell {
  if (random.int(100_000_000) === 0) {
    return { symbol: "max-coin", coinTier: "max", coinValue: ODINS_VAULT_MAX_COIN_VALUE };
  }
  const tierRoll = random.int(1_000_000_000);
  const thresholds = [
    Math.max(900_000_000, 979_000_000 - boost * 30_000),
    997_000_000 - boost * 10_000,
    999_700_000 - boost * 2_000,
    999_990_000 - boost * 200,
    999_999_990,
    1_000_000_000
  ];
  const index = thresholds.findIndex((threshold) => tierRoll < threshold);
  const tier = COIN_TIERS[Math.max(0, index)] ?? "bronze";
  return { symbol: "coin", coinTier: tier, coinValue: random.pick(ODINS_VAULT_COIN_VALUES[tier]) };
}

function randomCell(random: OdinsVaultRandom, action: OdinsVaultAction, tier?: OdinsVaultBonusTier): OdinsVaultCell {
  const boost = modeBoost(action, tier);
  const roll = random.int(10_000);
  let edge = 115 + Math.floor(boost * 0.12);
  if (roll < edge) return { symbol: "scatter" };
  edge += 559 + Math.floor(boost * 0.8);
  if (roll < edge) return randomCoin(random, boost);
  edge += 90 + Math.floor(boost * 0.12);
  if (roll < edge) return { symbol: "eye" };
  edge += 34 + Math.floor(boost * 0.06);
  if (roll < edge) return { symbol: "key" };
  edge += 34 + Math.floor(boost * 0.06);
  if (roll < edge) return { symbol: "bard" };
  edge += 22 + Math.floor(boost * 0.04);
  if (roll < edge) return { symbol: "upgrader" };
  edge += 34 + Math.floor(boost * 0.05);
  if (roll < edge) return { symbol: "redrop" };
  edge += 16 + Math.floor(boost * 0.1);
  if (roll < edge) return { symbol: "collector" };
  edge += 2 + Math.floor(boost * 0.025);
  if (roll < edge) return { symbol: "super-collector" };
  return { symbol: random.pick(REGULAR_WEIGHTS) };
}

function forceScatterCount(grid: OdinsVaultCell[], count: number, random: OdinsVaultRandom): void {
  const positions = Array.from({ length: grid.length }, (_, index) => index);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    [positions[index], positions[swap]] = [positions[swap] ?? index, positions[index] ?? swap];
  }
  for (const position of positions.slice(0, count)) grid[position] = { symbol: "scatter" };
}

function upgradeCoins(grid: OdinsVaultCell[], random: OdinsVaultRandom): boolean {
  let changed = false;
  for (let index = 0; index < grid.length; index += 1) {
    const cell = grid[index];
    if (!cell || (cell.symbol !== "coin" && cell.symbol !== "max-coin") || !cell.coinTier || cell.coinTier === "max") {
      continue;
    }
    const tierIndex = COIN_TIERS.indexOf(cell.coinTier);
    const nextTier = COIN_TIERS[Math.min(COIN_TIERS.length - 1, tierIndex + 1)] ?? cell.coinTier;
    grid[index] = { symbol: "coin", coinTier: nextTier, coinValue: random.pick(ODINS_VAULT_COIN_VALUES[nextTier]) };
    changed = true;
  }
  return changed;
}

export interface ResolveGridOptions {
  readonly tier?: OdinsVaultBonusTier;
  readonly persistentEyeTarget?: OdinsVaultRegularSymbol;
  readonly forceUpgrader?: boolean;
  readonly forcedScatterCount?: number;
}

export function resolveOdinsVaultGrid(
  random: OdinsVaultRandom,
  action: OdinsVaultAction,
  options: ResolveGridOptions = {}
): OdinsVaultGridResult {
  const grid = Array.from({ length: ODINS_VAULT_COLUMNS * ODINS_VAULT_ROWS }, () =>
    randomCell(random, action, options.tier)
  );
  if (options.forcedScatterCount) forceScatterCount(grid, options.forcedScatterCount, random);

  if (options.forceUpgrader && !grid.some((cell) => cell.symbol === "upgrader")) {
    const position = grid.findIndex((cell) => cell.symbol !== "scatter");
    if (position >= 0) grid[position] = { symbol: "upgrader" };
  }
  if (options.forceUpgrader && !grid.some((cell) => cell.symbol === "coin" || cell.symbol === "max-coin")) {
    const position = grid.findIndex((cell) => cell.symbol !== "scatter" && cell.symbol !== "upgrader");
    if (position >= 0) grid[position] = { symbol: "coin", coinTier: "bronze", coinValue: 1 };
  }

  const events: string[] = [];
  const redropPositions: number[] = [];
  const redropReplacements: OdinsVaultRegularSymbol[] = [];
  if (grid.some((cell) => cell.symbol === "redrop")) {
    for (let index = 0; index < grid.length; index += 1) {
      if (!paySymbol(grid[index])) continue;
      const replacement = random.pick(REGULAR_WEIGHTS);
      grid[index] = { symbol: replacement };
      redropPositions.push(index);
      redropReplacements.push(replacement);
    }
    if (redropPositions.length > 0) events.push("redrop");
  }

  const eyeCells = grid.flatMap((cell, index) => (cell.symbol === "eye" ? [index] : []));
  const eyeTarget =
    options.persistentEyeTarget ?? (eyeCells.length > 0 ? random.pick(ODINS_VAULT_REGULAR_SYMBOLS) : undefined);
  if (eyeTarget && (eyeCells.length > 0 || options.persistentEyeTarget)) {
    const candidates = grid.flatMap((cell, index) => (paySymbol(cell) ? [index] : []));
    const conversions = Math.min(candidates.length, Math.max(1, eyeCells.length * 2 || 1));
    for (let index = 0; index < conversions; index += 1) {
      const candidateIndex = random.int(candidates.length);
      const [position] = candidates.splice(candidateIndex, 1);
      if (position !== undefined) grid[position] = { symbol: "mystery", resolvedSymbol: eyeTarget };
    }
    events.push("eye-awakens");
  }

  const upgraded = grid.some((cell) => cell.symbol === "upgrader") && upgradeCoins(grid, random);
  if (upgraded) events.push("coin-upgrade");

  const keyCount = grid.filter((cell) => cell.symbol === "key").length;
  const globalMultiplier = keyCount > 0 ? random.pick([2, 3, 4, 5, 10] as const) : 1;
  const globalSide = keyCount > 0 ? random.pick(["red", "white"] as const) : undefined;
  if (globalSide) events.push(`global-${globalSide}`);

  const bardCount = grid.filter((cell) => cell.symbol === "bard").length;
  const bardMultiplier = bardCount > 0 ? random.pick([2, 3, 5, 10, 20] as const) : 1;
  if (bardMultiplier > 1) events.push("bard-multiplier");

  const collectorActivations =
    grid.filter((cell) => cell.symbol === "collector").length +
    grid.filter((cell) => cell.symbol === "super-collector").length * 2;
  const coinValue = grid.reduce((sum, cell) => sum + (cell.coinValue ?? 0), 0);
  const coinMultiplier = round6(
    coinValue *
      collectorActivations *
      bardMultiplier *
      globalMultiplier *
      ODINS_VAULT_RTP_CALIBRATION *
      ODINS_VAULT_ACTION_CALIBRATION[action]
  );
  if (collectorActivations > 0 && coinValue > 0) {
    events.push(collectorActivations > 1 ? "super-collect" : "collect");
  }

  const lineWins = evaluateOdinsVaultPaylines(grid);
  const lineMultiplier = round6(
    lineWins.reduce((sum, win) => sum + win.multiplier, 0) *
      globalMultiplier *
      ODINS_VAULT_RTP_CALIBRATION *
      ODINS_VAULT_ACTION_CALIBRATION[action]
  );
  if (lineWins.length > 0) events.push("line-win");
  if (grid.some((cell) => cell.symbol === "max-coin")) events.push("max-win-coin");

  return {
    grid,
    lineWins,
    lineMultiplier,
    coinMultiplier,
    totalMultiplier: Math.min(odinsVaultRawCapForAction(action), round6(lineMultiplier + coinMultiplier)),
    scatterCount: grid.filter((cell) => cell.symbol === "scatter").length,
    eyeMeterGain: eyeCells.length,
    ...(eyeTarget ? { eyeTarget } : {}),
    globalMultiplier,
    ...(globalSide ? { globalSide } : {}),
    bardMultiplier,
    collectorActivations,
    ...(redropPositions.length > 0 ? { redrop: { positions: redropPositions, replacements: redropReplacements } } : {}),
    upgraded,
    presentationEvents: events
  };
}

function forcedTierForAction(action: OdinsVaultAction): OdinsVaultBonusTier | undefined {
  if (action === "buy:bonus") return "free";
  if (action === "buy:super") return "super";
  return undefined;
}

export function resolveOdinsVaultSpin(random: OdinsVaultRandom, rawAction: string): OdinsVaultOutcome {
  if (!isOdinsVaultAction(rawAction)) throw new Error("Invalid Odin's Vault action");
  const action = rawAction;
  const forcedTier = forcedTierForAction(action);
  const base = resolveOdinsVaultGrid(random, action, {
    ...(forcedTier ? { forcedScatterCount: forcedTier === "super" ? 4 : 3 } : {})
  });
  const initialBonusTier = forcedTier ?? odinsVaultFreeSpinTierForGrid(base.grid);
  let bonusTier = initialBonusTier;
  const bonusSpins: OdinsVaultBonusSpin[] = [];
  let persistentEyeTarget: OdinsVaultRegularSymbol | undefined;
  if (bonusTier) {
    for (let spin = 1; spin <= 10; spin += 1) {
      const tierAtStart: OdinsVaultBonusTier = bonusTier;
      const persistent = tierAtStart !== "free";
      const resolved = resolveOdinsVaultGrid(random, action, {
        tier: tierAtStart,
        ...(persistent && persistentEyeTarget ? { persistentEyeTarget } : {}),
        ...(tierAtStart === "mythic" && spin === 1 ? { forceUpgrader: true } : {})
      });
      if (persistent && resolved.eyeTarget) persistentEyeTarget = resolved.eyeTarget;
      const upgradedTo: OdinsVaultBonusTier | undefined =
        resolved.scatterCount > 0 ? upgradeOdinsVaultBonusTier(tierAtStart) : undefined;
      if (upgradedTo) bonusTier = upgradedTo;
      bonusSpins.push({
        ...resolved,
        spin,
        tier: tierAtStart,
        ...(upgradedTo && upgradedTo !== tierAtStart ? { upgradedTo } : {})
      });
    }
  }

  const uncapped = round6(base.totalMultiplier + bonusSpins.reduce((sum, spin) => sum + spin.totalMultiplier, 0));
  const rawCap = odinsVaultRawCapForAction(action);
  const totalMultiplier = quantizeSlotMultiplier(capOdinsVaultMultiplier(uncapped, action));
  const presentationEvents = [
    ...base.presentationEvents,
    ...(bonusSpins.length > 0 ? ["bonus-transition", "free-spins"] : []),
    ...bonusSpins.flatMap((spin) => spin.presentationEvents),
    ...(uncapped >= rawCap ? ["max-win"] : [])
  ];
  return {
    kind: "odins-vault",
    action,
    costMultiplier: odinsVaultCostMultiplierForAction(action),
    columns: 5,
    rows: 6,
    paylines: 28,
    base,
    ...(initialBonusTier ? { bonusTier: initialBonusTier } : {}),
    bonusSpins,
    totalMultiplier,
    capped: uncapped > rawCap,
    presentationEvents
  };
}

export function capOdinsVaultMultiplier(value: number, action = "spin"): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(odinsVaultRawCapForAction(action), round6(value));
}
