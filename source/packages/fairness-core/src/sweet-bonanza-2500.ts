export const SWEET_BONANZA_COLUMNS = 6;
export const SWEET_BONANZA_ROWS = 5;
export const SWEET_BONANZA_CELLS = SWEET_BONANZA_COLUMNS * SWEET_BONANZA_ROWS;
export const SWEET_BONANZA_MIN_MATCH = 8;
export const SWEET_BONANZA_MAX_TUMBLES = 12;
export const SWEET_BONANZA_MAX_FREE_SPINS = 50;
export const SWEET_BONANZA_MAX_WIN = 25_000;
export const SWEET_BONANZA_MIN_WAGER = 0.2;
export const SWEET_BONANZA_MAX_WAGER = 180;

/**
 * Provisional demo-credit configuration. It is deliberately centralized so a
 * calibrated production model can replace it without touching presentation or
 * settlement contracts. No RTP is claimed for these values.
 */
export const SWEET_BONANZA_PLACEHOLDER_MATH = {
  symbols: [
    { symbol: "purple", weight: 18 },
    { symbol: "blue", weight: 17 },
    { symbol: "green", weight: 16 },
    { symbol: "heart", weight: 15 },
    { symbol: "grapes", weight: 12 },
    { symbol: "melon", weight: 10 },
    { symbol: "apple", weight: 8 },
    { symbol: "banana", weight: 7 },
    { symbol: "plum", weight: 6 },
    { symbol: "scatter", weight: 2 }
  ],
  paytable: {
    purple: [0.25, 0.5, 1, 2, 4],
    blue: [0.3, 0.6, 1.2, 2.4, 5],
    green: [0.35, 0.7, 1.4, 2.8, 6],
    heart: [0.4, 0.8, 1.6, 3.2, 8],
    grapes: [0.5, 1, 2, 4, 10],
    melon: [0.6, 1.2, 2.4, 5, 12],
    apple: [0.8, 1.6, 3.2, 7, 16],
    banana: [1, 2, 4, 10, 24],
    plum: [1.2, 2.5, 5, 12, 30]
  },
  bombChancePercent: 28,
  bombsPerLanding: 3,
  bombWeights: [
    { value: 2, weight: 28 },
    { value: 3, weight: 22 },
    { value: 5, weight: 18 },
    { value: 10, weight: 12 },
    { value: 25, weight: 8 },
    { value: 50, weight: 5 },
    { value: 100, weight: 3 },
    { value: 250, weight: 2 },
    { value: 500, weight: 1 },
    { value: 2500, weight: 1 }
  ]
} as const;

export type SweetBonanzaRegularSymbol = keyof typeof SWEET_BONANZA_PLACEHOLDER_MATH.paytable;
export type SweetBonanzaSymbol = SweetBonanzaRegularSymbol | "scatter" | "bomb";

export interface SweetBonanzaRandom {
  int(maxExclusive: number): number;
}

export interface SweetBonanzaWin {
  readonly symbol: SweetBonanzaRegularSymbol;
  readonly positions: readonly number[];
  readonly count: number;
  readonly payout: number;
}

export interface SweetBonanzaDrop {
  readonly from: number;
  readonly to: number;
}

export interface SweetBonanzaNewCell {
  readonly position: number;
  readonly symbol: SweetBonanzaSymbol;
  readonly multiplier?: number;
}

export interface SweetBonanzaBomb {
  readonly position: number;
  readonly value: number;
}

export interface SweetBonanzaTumble {
  readonly index: number;
  readonly grid: readonly SweetBonanzaSymbol[];
  readonly wins: readonly SweetBonanzaWin[];
  readonly removedPositions: readonly number[];
  readonly bombs: readonly SweetBonanzaBomb[];
  readonly baseWin: number;
  readonly multiplier: number;
  readonly win: number;
  readonly drops: readonly SweetBonanzaDrop[];
  readonly newCells: readonly SweetBonanzaNewCell[];
  readonly nextGrid: readonly SweetBonanzaSymbol[];
}

export interface SweetBonanzaSpin {
  readonly initialGrid: readonly SweetBonanzaSymbol[];
  readonly scatterCount: number;
  readonly tumbles: readonly SweetBonanzaTumble[];
  readonly win: number;
}

function roundSlot(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function weighted<T>(
  random: SweetBonanzaRandom,
  entries: readonly { readonly value: T; readonly weight: number }[]
): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(total);
  for (const entry of entries) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  throw new Error("Sweet Bonanza weighted selection failed");
}

function drawRegular(random: SweetBonanzaRandom): Exclude<SweetBonanzaSymbol, "bomb"> {
  return weighted(
    random,
    SWEET_BONANZA_PLACEHOLDER_MATH.symbols.map((entry) => ({ value: entry.symbol, weight: entry.weight }))
  );
}

export function sweetBonanzaPayout(symbol: SweetBonanzaRegularSymbol, count: number): number {
  if (count < SWEET_BONANZA_MIN_MATCH) return 0;
  const tier = count >= 20 ? 4 : count >= 15 ? 3 : count >= 12 ? 2 : count >= 10 ? 1 : 0;
  return SWEET_BONANZA_PLACEHOLDER_MATH.paytable[symbol][tier];
}

export function findSweetBonanzaWins(grid: readonly SweetBonanzaSymbol[]): readonly SweetBonanzaWin[] {
  if (grid.length !== SWEET_BONANZA_CELLS) throw new Error("Sweet Bonanza grid must contain 30 cells");
  return (Object.keys(SWEET_BONANZA_PLACEHOLDER_MATH.paytable) as SweetBonanzaRegularSymbol[]).flatMap(
    (symbol): SweetBonanzaWin[] => {
      const positions = grid.flatMap((cell, position) => (cell === symbol ? [position] : []));
      const payout = sweetBonanzaPayout(symbol, positions.length);
      return payout > 0 ? [{ symbol, positions, count: positions.length, payout }] : [];
    }
  );
}

function drawBomb(random: SweetBonanzaRandom): SweetBonanzaBomb["value"] {
  return weighted(random, SWEET_BONANZA_PLACEHOLDER_MATH.bombWeights);
}

export function applySweetBonanzaGravity(
  grid: readonly SweetBonanzaSymbol[],
  removedPositions: readonly number[],
  random: SweetBonanzaRandom,
  bonus: boolean
): {
  readonly nextGrid: readonly SweetBonanzaSymbol[];
  readonly drops: readonly SweetBonanzaDrop[];
  readonly newCells: readonly SweetBonanzaNewCell[];
  readonly bombs: readonly SweetBonanzaBomb[];
} {
  const removed = new Set(removedPositions);
  const nextGrid = Array<SweetBonanzaSymbol>(SWEET_BONANZA_CELLS);
  const drops: SweetBonanzaDrop[] = [];
  const newCells: SweetBonanzaNewCell[] = [];
  const bombs: SweetBonanzaBomb[] = [];
  let bombsRemaining =
    bonus && random.int(100) < SWEET_BONANZA_PLACEHOLDER_MATH.bombChancePercent
      ? 1 + random.int(SWEET_BONANZA_PLACEHOLDER_MATH.bombsPerLanding)
      : 0;
  for (let column = 0; column < SWEET_BONANZA_COLUMNS; column += 1) {
    const survivors: Array<{ readonly from: number; readonly symbol: SweetBonanzaSymbol }> = [];
    for (let row = SWEET_BONANZA_ROWS - 1; row >= 0; row -= 1) {
      const position = row * SWEET_BONANZA_COLUMNS + column;
      const symbol = grid[position];
      if (!removed.has(position) && symbol && symbol !== "bomb") survivors.push({ from: position, symbol });
    }
    let targetRow = SWEET_BONANZA_ROWS - 1;
    for (const survivor of survivors) {
      const to = targetRow * SWEET_BONANZA_COLUMNS + column;
      nextGrid[to] = survivor.symbol;
      if (survivor.from !== to) drops.push({ from: survivor.from, to });
      targetRow -= 1;
    }
    while (targetRow >= 0) {
      const position = targetRow * SWEET_BONANZA_COLUMNS + column;
      if (bombsRemaining > 0) {
        const multiplier = drawBomb(random);
        nextGrid[position] = "bomb";
        bombs.push({ position, value: multiplier });
        newCells.push({ position, symbol: "bomb", multiplier });
        bombsRemaining -= 1;
      } else {
        const symbol = drawRegular(random);
        nextGrid[position] = symbol;
        newCells.push({ position, symbol });
      }
      targetRow -= 1;
    }
  }
  return { nextGrid, drops, newCells, bombs };
}

function forceFeatureScatters(grid: SweetBonanzaSymbol[]): void {
  for (const position of [3, 10, 19, 26]) grid[position] = "scatter";
}

export function resolveSweetBonanzaSpin(
  random: SweetBonanzaRandom,
  options: { readonly bonus?: boolean; readonly forceFeature?: boolean } = {}
): SweetBonanzaSpin {
  const initialGrid = Array.from({ length: SWEET_BONANZA_CELLS }, () => drawRegular(random));
  if (options.forceFeature) forceFeatureScatters(initialGrid);
  let grid: readonly SweetBonanzaSymbol[] = initialGrid;
  let totalWin = 0;
  let scatterCount = grid.filter((symbol) => symbol === "scatter").length;
  const tumbles: SweetBonanzaTumble[] = [];
  for (let index = 0; index < SWEET_BONANZA_MAX_TUMBLES; index += 1) {
    const wins = findSweetBonanzaWins(grid);
    if (wins.length === 0) break;
    const removedPositions = [...new Set(wins.flatMap((win) => win.positions))].sort((a, b) => a - b);
    const baseWin = roundSlot(wins.reduce((sum, win) => sum + win.payout, 0));
    const gravity = applySweetBonanzaGravity(grid, removedPositions, random, options.bonus === true);
    const multiplier = gravity.bombs.reduce((sum, bomb) => sum + bomb.value, 0) || 1;
    const win = roundSlot(baseWin * multiplier);
    tumbles.push({ index, grid, wins, removedPositions, baseWin, multiplier, win, ...gravity });
    totalWin = roundSlot(totalWin + win);
    grid = gravity.nextGrid;
    scatterCount = Math.max(scatterCount, grid.filter((symbol) => symbol === "scatter").length);
  }
  return { initialGrid, scatterCount, tumbles, win: totalWin };
}

export function resolveSweetBonanza2500(
  random: SweetBonanzaRandom,
  action: string
): { readonly multiplier: number; readonly outcome: Readonly<Record<string, unknown>> } {
  const forceFeature = action.includes("feature");
  const baseSpin = resolveSweetBonanzaSpin(random, { forceFeature });
  const bonusTriggered = baseSpin.scatterCount >= 4;
  let awarded = bonusTriggered ? 10 : 0;
  let bonusWin = 0;
  const spins: Array<Readonly<Record<string, unknown>>> = [];
  for (let index = 0; index < awarded && index < SWEET_BONANZA_MAX_FREE_SPINS; index += 1) {
    const spin = resolveSweetBonanzaSpin(random, { bonus: true });
    const retriggered = spin.scatterCount >= 3 ? 5 : 0;
    awarded = Math.min(SWEET_BONANZA_MAX_FREE_SPINS, awarded + retriggered);
    bonusWin = roundSlot(bonusWin + spin.win);
    spins.push({ index, retriggered, ...spin });
    if (baseSpin.win + bonusWin >= SWEET_BONANZA_MAX_WIN) break;
  }
  const rawTotal = roundSlot(baseSpin.win + bonusWin);
  const finalMultiplier = roundSlot(Math.min(SWEET_BONANZA_MAX_WIN, rawTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "sweet-bonanza-2500",
      version: 1,
      action,
      baseSpin,
      bonusTriggered,
      freeSpins: { awarded, played: spins.length, win: bonusWin, spins },
      rawTotal,
      uncappedMultiplier: rawTotal,
      maxWinCap: SWEET_BONANZA_MAX_WIN,
      mathStatus: "provisional-demo-only",
      presentation: { presentationMs: Math.min(45_000, 1_400 + baseSpin.tumbles.length * 1_050 + spins.length * 220) }
    }
  };
}
