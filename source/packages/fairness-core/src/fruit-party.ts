export const FRUIT_PARTY_COLUMNS = 7;
export const FRUIT_PARTY_ROWS = 7;
export const FRUIT_PARTY_CELLS = FRUIT_PARTY_COLUMNS * FRUIT_PARTY_ROWS;
export const FRUIT_PARTY_MIN_CLUSTER = 5;
export const FRUIT_PARTY_MAX_TUMBLES = 12;
export const FRUIT_PARTY_MAX_FREE_SPINS = 50;
export const FRUIT_PARTY_MAX_WIN = 5_000;
export const FRUIT_PARTY_MIN_WAGER = 0.2;
export const FRUIT_PARTY_MAX_WAGER = 180;

/** TODO(rtp): calibrate these temporary public weights and paytable before release claims. */
export const FRUIT_PARTY_PAYTABLE = {
  strawberry: [0.2, 0.35, 0.6, 1, 2],
  plum: [0.25, 0.45, 0.75, 1.25, 2.5],
  orange: [0.3, 0.55, 0.9, 1.5, 3],
  apple: [0.4, 0.7, 1.1, 2, 4],
  grapes: [0.55, 0.9, 1.5, 3, 6],
  star: [0.8, 1.4, 2.5, 5, 10]
} as const;

export type FruitPartyRegularSymbol = keyof typeof FRUIT_PARTY_PAYTABLE;
export type FruitPartySymbol = FruitPartyRegularSymbol | "scatter";

export interface FruitPartyRandom {
  int(maxExclusive: number): number;
}

export interface FruitPartyCluster {
  readonly symbol: FruitPartyRegularSymbol;
  readonly positions: readonly number[];
  readonly count: number;
  readonly payout: number;
}

export interface FruitPartyDrop {
  readonly from: number;
  readonly to: number;
}

export interface FruitPartyNewCell {
  readonly position: number;
  readonly symbol: FruitPartySymbol;
}

export interface FruitPartyMultiplier {
  readonly position: number;
  readonly value: number;
}

export interface FruitPartyTumble {
  readonly index: number;
  readonly grid: readonly FruitPartySymbol[];
  readonly clusters: readonly FruitPartyCluster[];
  readonly removedPositions: readonly number[];
  readonly multipliers: readonly FruitPartyMultiplier[];
  readonly baseWin: number;
  readonly multiplier: number;
  readonly win: number;
  readonly drops: readonly FruitPartyDrop[];
  readonly newCells: readonly FruitPartyNewCell[];
  readonly nextGrid: readonly FruitPartySymbol[];
}

export interface FruitPartySpin {
  readonly initialGrid: readonly FruitPartySymbol[];
  readonly scatterCount: number;
  readonly tumbles: readonly FruitPartyTumble[];
  readonly win: number;
}

const DRAW_TABLE = [
  { symbol: "strawberry", weight: 22 },
  { symbol: "plum", weight: 20 },
  { symbol: "orange", weight: 18 },
  { symbol: "apple", weight: 16 },
  { symbol: "grapes", weight: 13 },
  { symbol: "star", weight: 9 },
  { symbol: "scatter", weight: 1 }
] as const satisfies readonly { readonly symbol: FruitPartySymbol; readonly weight: number }[];

export const FRUIT_PARTY_MULTIPLIER_WEIGHTS = [
  { value: 2, weight: 45 },
  { value: 4, weight: 26 },
  { value: 8, weight: 13 },
  { value: 16, weight: 7 },
  { value: 32, weight: 4 },
  { value: 64, weight: 3 },
  { value: 128, weight: 1 },
  { value: 256, weight: 1 }
] as const;

function roundSlot(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function weighted<T>(random: FruitPartyRandom, entries: readonly { readonly value: T; readonly weight: number }[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(total);
  for (const entry of entries) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  throw new Error("Weighted selection failed");
}

function drawSymbol(random: FruitPartyRandom): FruitPartySymbol {
  return weighted(
    random,
    DRAW_TABLE.map((entry) => ({ value: entry.symbol, weight: entry.weight }))
  );
}

export function fruitPartyClusterPayout(symbol: FruitPartyRegularSymbol, count: number): number {
  if (count < FRUIT_PARTY_MIN_CLUSTER) return 0;
  const tier = count >= 15 ? 4 : count >= 12 ? 3 : count >= 9 ? 2 : count >= 7 ? 1 : 0;
  return FRUIT_PARTY_PAYTABLE[symbol][tier];
}

export function findFruitPartyClusters(grid: readonly FruitPartySymbol[]): readonly FruitPartyCluster[] {
  if (grid.length !== FRUIT_PARTY_CELLS) throw new Error("Fruit Party grid must contain 49 cells");
  const visited = new Set<number>();
  const clusters: FruitPartyCluster[] = [];
  for (let start = 0; start < grid.length; start += 1) {
    if (visited.has(start) || grid[start] === "scatter") continue;
    const symbol = grid[start] as FruitPartyRegularSymbol;
    const positions: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const position = queue.shift();
      if (position === undefined) break;
      positions.push(position);
      const row = Math.floor(position / FRUIT_PARTY_COLUMNS);
      const column = position % FRUIT_PARTY_COLUMNS;
      const neighbors = [
        row > 0 ? position - FRUIT_PARTY_COLUMNS : -1,
        row + 1 < FRUIT_PARTY_ROWS ? position + FRUIT_PARTY_COLUMNS : -1,
        column > 0 ? position - 1 : -1,
        column + 1 < FRUIT_PARTY_COLUMNS ? position + 1 : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && !visited.has(neighbor) && grid[neighbor] === symbol) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const payout = fruitPartyClusterPayout(symbol, positions.length);
    if (payout > 0)
      clusters.push({ symbol, positions: positions.sort((a, b) => a - b), count: positions.length, payout });
  }
  return clusters;
}

export function applyFruitPartyGravity(
  grid: readonly FruitPartySymbol[],
  removedPositions: readonly number[],
  random: FruitPartyRandom
): {
  readonly nextGrid: readonly FruitPartySymbol[];
  readonly drops: readonly FruitPartyDrop[];
  readonly newCells: readonly FruitPartyNewCell[];
} {
  const removed = new Set(removedPositions);
  const nextGrid = Array<FruitPartySymbol>(FRUIT_PARTY_CELLS);
  const drops: FruitPartyDrop[] = [];
  const newCells: FruitPartyNewCell[] = [];
  for (let column = 0; column < FRUIT_PARTY_COLUMNS; column += 1) {
    const survivors: Array<{ readonly from: number; readonly symbol: FruitPartySymbol }> = [];
    for (let row = FRUIT_PARTY_ROWS - 1; row >= 0; row -= 1) {
      const position = row * FRUIT_PARTY_COLUMNS + column;
      const symbol = grid[position];
      if (!removed.has(position) && symbol) survivors.push({ from: position, symbol });
    }
    let targetRow = FRUIT_PARTY_ROWS - 1;
    for (const survivor of survivors) {
      const to = targetRow * FRUIT_PARTY_COLUMNS + column;
      nextGrid[to] = survivor.symbol;
      if (survivor.from !== to) drops.push({ from: survivor.from, to });
      targetRow -= 1;
    }
    while (targetRow >= 0) {
      const position = targetRow * FRUIT_PARTY_COLUMNS + column;
      const symbol = drawSymbol(random);
      nextGrid[position] = symbol;
      newCells.push({ position, symbol });
      targetRow -= 1;
    }
  }
  return { nextGrid, drops, newCells };
}

function multiplierForTumble(
  random: FruitPartyRandom,
  removedPositions: readonly number[]
): readonly FruitPartyMultiplier[] {
  if (removedPositions.length === 0 || random.int(100) >= 24) return [];
  const count = random.int(100) < 18 ? 2 : 1;
  const available = [...removedPositions];
  const multipliers: FruitPartyMultiplier[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const selected = random.int(available.length);
    const [position] = available.splice(selected, 1);
    if (position === undefined) continue;
    multipliers.push({ position, value: weighted(random, FRUIT_PARTY_MULTIPLIER_WEIGHTS) });
  }
  return multipliers;
}

export function resolveFruitPartySpin(random: FruitPartyRandom): FruitPartySpin {
  const initialGrid = Array.from({ length: FRUIT_PARTY_CELLS }, () => drawSymbol(random));
  let grid: readonly FruitPartySymbol[] = initialGrid;
  let totalWin = 0;
  const tumbles: FruitPartyTumble[] = [];
  for (let index = 0; index < FRUIT_PARTY_MAX_TUMBLES; index += 1) {
    const clusters = findFruitPartyClusters(grid);
    if (clusters.length === 0) break;
    const removedPositions = [...new Set(clusters.flatMap((cluster) => cluster.positions))].sort((a, b) => a - b);
    const multipliers = multiplierForTumble(random, removedPositions);
    const combinedMultiplier = multipliers.reduce((sum, multiplier) => sum + multiplier.value, 0) || 1;
    const baseWin = roundSlot(clusters.reduce((sum, cluster) => sum + cluster.payout, 0));
    const win = roundSlot(baseWin * combinedMultiplier);
    const gravity = applyFruitPartyGravity(grid, removedPositions, random);
    tumbles.push({
      index,
      grid,
      clusters,
      removedPositions,
      multipliers,
      baseWin,
      multiplier: combinedMultiplier,
      win,
      ...gravity
    });
    totalWin = roundSlot(totalWin + win);
    grid = gravity.nextGrid;
  }
  return {
    initialGrid,
    scatterCount: initialGrid.filter((symbol) => symbol === "scatter").length,
    tumbles,
    win: totalWin
  };
}

export function resolveFruitParty(
  random: FruitPartyRandom,
  action: string
): { readonly multiplier: number; readonly outcome: Readonly<Record<string, unknown>> } {
  const baseSpin = resolveFruitPartySpin(random);
  const bonusTriggered = baseSpin.scatterCount >= 3;
  let awarded = bonusTriggered ? 10 : 0;
  let bonusWin = 0;
  const spins: Array<Readonly<Record<string, unknown>>> = [];
  for (let index = 0; index < awarded && index < FRUIT_PARTY_MAX_FREE_SPINS; index += 1) {
    const spin = resolveFruitPartySpin(random);
    const retriggered = spin.scatterCount >= 3 ? 5 : 0;
    awarded = Math.min(FRUIT_PARTY_MAX_FREE_SPINS, awarded + retriggered);
    bonusWin = roundSlot(bonusWin + spin.win);
    spins.push({ index, retriggered, ...spin });
    if (baseSpin.win + bonusWin >= FRUIT_PARTY_MAX_WIN) break;
  }
  const rawTotal = roundSlot(baseSpin.win + bonusWin);
  const finalMultiplier = roundSlot(Math.min(FRUIT_PARTY_MAX_WIN, rawTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "fruit-party",
      version: 1,
      action,
      baseSpin,
      bonusTriggered,
      freeSpins: { awarded, played: spins.length, win: bonusWin, spins },
      rawTotal,
      uncappedMultiplier: rawTotal,
      maxWinCap: FRUIT_PARTY_MAX_WIN,
      finalMultiplier,
      presentation: { presentationMs: Math.min(30_000, 1_100 + baseSpin.tumbles.length * 850 + spins.length * 180) }
    }
  };
}
