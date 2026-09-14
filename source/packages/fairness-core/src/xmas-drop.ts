import { quantizeSlotMultiplier } from "./constants.ts";

export const XMAS_DROP_MAX_MULTIPLIER = 12_500;
export const XMAS_DROP_COLUMNS = 5;
export const XMAS_DROP_ROWS = 5;
export const XMAS_DROP_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [0, 0, 1, 0, 0],
  [4, 4, 3, 4, 4],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [1, 0, 0, 0, 1],
  [3, 4, 4, 4, 3],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [0, 1, 1, 1, 0],
  [4, 3, 3, 3, 4],
  [1, 1, 2, 1, 1],
  [3, 3, 2, 3, 3]
] as const;
export const XMAS_DROP_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200] as const;

export const XMAS_DROP_SYMBOLS = [
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
  "candy",
  "stocking",
  "bell",
  "tree",
  "teddy",
  "gift",
  "santa",
  "scatter"
] as const;
export type XmasDropSymbol = (typeof XMAS_DROP_SYMBOLS)[number];
export type XmasDropFeature = "night" | "town" | "none";
export interface XmasDropRandom {
  int(maxExclusive: number): number;
}
export interface XmasDropCell {
  readonly id: number;
  readonly symbol: XmasDropSymbol;
  readonly reel: number;
  readonly row: number;
  readonly multiplier: number;
  readonly expanded: boolean;
}
export interface XmasDropWin {
  readonly symbol: XmasDropSymbol;
  readonly positions: readonly number[];
  readonly count: number;
  readonly wildMultiplier: number;
  readonly multiplier: number;
}
export interface XmasDropSpin {
  readonly spin: number;
  readonly feature: Exclude<XmasDropFeature, "none">;
  readonly initialGrid: readonly XmasDropCell[];
  readonly grid: readonly XmasDropCell[];
  readonly expandedPositions: readonly number[];
  readonly crossedGifts: readonly number[];
  readonly activatedReels: readonly number[];
  readonly wins: readonly XmasDropWin[];
  readonly multiplier: number;
}
export interface XmasDropOutcome {
  readonly kind: "xmas-drop";
  readonly mathModel: "provisional-clean-room-v1";
  readonly columns: 5;
  readonly rows: 5;
  readonly initialGrid: readonly XmasDropCell[];
  readonly grid: readonly XmasDropCell[];
  readonly expandedPositions: readonly number[];
  readonly crossedGifts: readonly number[];
  readonly wins: readonly XmasDropWin[];
  readonly feature: XmasDropFeature;
  readonly featureSpins: readonly XmasDropSpin[];
  readonly totalMultiplier: number;
  readonly maxMultiplier: 12500;
  readonly replacementNote: string;
}

const weights: readonly [XmasDropSymbol, number][] = [
  ["ten", 14],
  ["jack", 14],
  ["queen", 13],
  ["king", 12],
  ["ace", 11],
  ["candy", 9],
  ["stocking", 8],
  ["bell", 7],
  ["tree", 7],
  ["teddy", 6],
  ["gift", 5],
  ["santa", 4],
  ["scatter", 3]
];
const pays: Readonly<Record<XmasDropSymbol, readonly [number, number, number]>> = {
  ten: [0.1, 0.25, 0.75],
  jack: [0.12, 0.3, 0.9],
  queen: [0.14, 0.35, 1],
  king: [0.16, 0.4, 1.2],
  ace: [0.18, 0.5, 1.5],
  candy: [0.22, 0.65, 1.8],
  stocking: [0.25, 0.75, 2.1],
  bell: [0.3, 0.9, 2.6],
  tree: [0.35, 1.1, 3],
  teddy: [0.5, 1.5, 4],
  gift: [0, 0, 0],
  santa: [0, 0, 0],
  scatter: [0, 0, 0]
};

function pick(random: XmasDropRandom): XmasDropSymbol {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = random.int(total);
  for (const [symbol, weight] of weights) {
    if (ticket < weight) return symbol;
    ticket -= weight;
  }
  return "ten";
}
function cellAt(grid: readonly XmasDropCell[], reel: number, row: number) {
  return grid.find((cell) => cell.reel === reel && cell.row === row);
}
const substitute = (cell: XmasDropCell | undefined) => cell?.symbol === "gift" || cell?.symbol === "santa";

function makeGrid(
  random: XmasDropRandom,
  feature: XmasDropFeature,
  offset = 0,
  activated: ReadonlySet<number> = new Set(),
  minimumSantas = 0
): XmasDropCell[] {
  const grid = Array.from({ length: 25 }, (_, index) => {
    const reel = Math.floor(index / 5);
    const row = index % 5;
    let symbol = pick(random);
    if (feature === "night" && random.int(6) === 0) symbol = random.int(3) === 0 ? "gift" : "santa";
    return { id: offset + index + 1, symbol, reel, row, multiplier: 1, expanded: false };
  });
  const ensureSanta = (reel: number) => {
    const cells = grid.filter((cell) => cell.reel === reel);
    const existing = cells.filter((cell) => cell.symbol === "santa");
    for (const duplicate of existing.slice(1)) {
      const index = duplicate.id - offset - 1;
      grid[index] = { ...duplicate, symbol: "teddy" };
    }
    if (!existing.length) {
      const index = reel * 5 + random.int(5);
      const cell = grid[index];
      if (cell) {
        grid[index] = { ...cell, symbol: "santa" };
      }
    }
  };
  for (const reel of activated) ensureSanta(reel);
  const reelsWithSanta = new Set(grid.filter((cell) => cell.symbol === "santa").map((cell) => cell.reel));
  for (let reel = 0; reel < 5 && reelsWithSanta.size < minimumSantas; reel++)
    if (!reelsWithSanta.has(reel)) {
      ensureSanta(reel);
      reelsWithSanta.add(reel);
    }
  for (let reel = 0; reel < 5; reel++) {
    const santas = grid.filter((cell) => cell.reel === reel && cell.symbol === "santa");
    for (const duplicate of santas.slice(1)) {
      const index = duplicate.id - offset - 1;
      grid[index] = { ...duplicate, symbol: "teddy" };
    }
  }
  return grid;
}

export function evaluateXmasDropWins(grid: readonly XmasDropCell[]): XmasDropWin[] {
  const wins: XmasDropWin[] = [];
  for (const payline of XMAS_DROP_PAYLINES) {
    const line = payline.map((row, reel) => cellAt(grid, reel, row));
    const anchor = line.find((cell) => cell && !substitute(cell) && cell.symbol !== "scatter")?.symbol;
    if (!anchor) continue;
    const positions: number[] = [];
    const multipliers: number[] = [];
    for (const cell of line) {
      if (!cell || (cell.symbol !== anchor && !substitute(cell))) break;
      positions.push(cell.id);
      if (cell.symbol === "santa" && cell.expanded && cell.multiplier > 1) multipliers.push(cell.multiplier);
    }
    if (positions.length < 3) continue;
    const wildMultiplier = multipliers.length ? multipliers.reduce((sum, value) => sum + value, 0) : 1;
    wins.push({
      symbol: anchor,
      positions,
      count: positions.length,
      wildMultiplier,
      multiplier: quantizeSlotMultiplier((pays[anchor][Math.min(2, positions.length - 3)] ?? 0) * wildMultiplier)
    });
  }
  return wins;
}

export function expandXmasDropSantas(
  grid: readonly XmasDropCell[],
  random: XmasDropRandom
): { grid: XmasDropCell[]; positions: number[]; crossedGifts: number[] } {
  const original = grid.map((cell) => ({ ...cell, expanded: false, multiplier: 1 }));
  const candidates = original
    .filter((cell) => cell.symbol === "santa")
    .map((santa) => {
      const covered = original.filter((cell) => cell.reel === santa.reel && cell.row >= santa.row);
      const gifts = covered.filter((cell) => cell.symbol === "gift");
      const multiplier = gifts.length
        ? gifts.reduce((sum) => sum + (XMAS_DROP_MULTIPLIERS[random.int(XMAS_DROP_MULTIPLIERS.length)] ?? 2), 0)
        : 1;
      return { santa, covered, gifts, multiplier };
    });
  const expanded = original.map((cell) => {
    const candidate = candidates.find((item) => item.covered.some((covered) => covered.id === cell.id));
    return candidate ? { ...cell, symbol: "santa" as const, expanded: true, multiplier: candidate.multiplier } : cell;
  });
  const winningIds = new Set(evaluateXmasDropWins(expanded).flatMap((win) => win.positions));
  const active = candidates.filter((item) => item.covered.some((cell) => winningIds.has(cell.id)));
  const activeById = new Map(active.flatMap((item) => item.covered.map((cell) => [cell.id, item] as const)));
  return {
    grid: original.map((cell) => {
      const item = activeById.get(cell.id);
      return item ? { ...cell, symbol: "santa", expanded: true, multiplier: item.multiplier } : cell;
    }),
    positions: [...activeById.keys()],
    crossedGifts: active.flatMap((item) => item.gifts.map((gift) => gift.id))
  };
}

function resolveGrid(
  random: XmasDropRandom,
  feature: XmasDropFeature,
  offset: number,
  activated: ReadonlySet<number> = new Set(),
  minimumSantas = 0
) {
  const initialGrid = makeGrid(random, feature, offset, activated, minimumSantas);
  const landed = expandXmasDropSantas(initialGrid, random);
  const wins = evaluateXmasDropWins(landed.grid);
  return {
    initialGrid,
    grid: landed.grid,
    positions: landed.positions,
    crossedGifts: landed.crossedGifts,
    wins,
    multiplier: quantizeSlotMultiplier(wins.reduce((sum, win) => sum + win.multiplier, 0))
  };
}

export function resolveXmasDrop(
  random: XmasDropRandom,
  action = "spin"
): { multiplier: number; outcome: XmasDropOutcome } {
  const minimumSantas = action.includes("three-santas") ? 3 : action.includes("two-santas") ? 2 : 0;
  const base = resolveGrid(random, "none", 0, new Set(), minimumSantas);
  const scatterCount = base.initialGrid.filter((cell) => cell.symbol === "scatter").length;
  const forced = action.includes("force-night") ? "night" : action.includes("force-town") ? "town" : undefined;
  const feature: XmasDropFeature = forced ?? (scatterCount >= 4 ? "town" : scatterCount === 3 ? "night" : "none");
  const featureSpins: XmasDropSpin[] = [];
  let total = base.multiplier;
  if (feature !== "none") {
    let current: Exclude<XmasDropFeature, "none"> = feature;
    let remaining = 10;
    let spin = 0;
    const activated = new Set<number>();
    while (remaining > 0 && spin < 50) {
      spin++;
      remaining--;
      const resolved = resolveGrid(random, current, spin * 100, new Set(activated));
      const landedScatters = resolved.initialGrid.filter((cell) => cell.symbol === "scatter").length;
      if (current === "town")
        for (const cell of resolved.initialGrid) if (cell.symbol === "santa") activated.add(cell.reel);
      if (landedScatters >= 3) remaining += 4;
      if (current === "night" && landedScatters >= 4) {
        current = "town";
        if (remaining < 10) remaining = 10;
      }
      featureSpins.push({
        spin,
        feature: current,
        initialGrid: resolved.initialGrid,
        grid: resolved.grid,
        expandedPositions: resolved.positions,
        crossedGifts: resolved.crossedGifts,
        activatedReels: [...activated].sort(),
        wins: resolved.wins,
        multiplier: resolved.multiplier
      });
      total += resolved.multiplier;
    }
  }
  total = Math.min(XMAS_DROP_MAX_MULTIPLIER, quantizeSlotMultiplier(total));
  return {
    multiplier: total,
    outcome: {
      kind: "xmas-drop",
      mathModel: "provisional-clean-room-v1",
      columns: 5,
      rows: 5,
      initialGrid: base.initialGrid,
      grid: base.grid,
      expandedPositions: base.positions,
      crossedGifts: base.crossedGifts,
      wins: base.wins,
      feature,
      featureSpins,
      totalMultiplier: total,
      maxMultiplier: XMAS_DROP_MAX_MULTIPLIER,
      replacementNote: "Provisional deterministic demo weights and payouts; RTP calibration intentionally deferred."
    }
  };
}
