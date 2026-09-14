import { quantizeSlotMultiplier } from "./constants.ts";

export const RIP_CITY_MAX_MULTIPLIER = 12_500;
export const RIP_CITY_COLUMNS = 5;
export const RIP_CITY_ROWS = 5;
export const RIP_CITY_PAYLINES = [
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
const RIP_CITY_WILD_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200] as const;

export const RIP_CITY_SYMBOLS = [
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
  "dice",
  "banana",
  "candle",
  "eightball",
  "smiley",
  "mouse",
  "cat",
  "wild",
  "bonus"
] as const;
export type RipCitySymbol = (typeof RIP_CITY_SYMBOLS)[number];

export interface RipCityRandom {
  int(maxExclusive: number): number;
}

export interface RipCityCell {
  readonly id: number;
  readonly symbol: RipCitySymbol;
  readonly reel: number;
  readonly row: number;
  readonly wildMultiplier: number;
  readonly expanded: boolean;
}

export interface RipCityWin {
  readonly symbol: RipCitySymbol;
  readonly positions: readonly number[];
  readonly count: number;
  readonly wildMultiplier: number;
  readonly multiplier: number;
}

export interface RipCityBonusSpin {
  readonly spin: number;
  readonly variant: "cat" | "mouse";
  readonly initialGrid: readonly RipCityCell[];
  readonly grid: readonly RipCityCell[];
  readonly expandedPositions: readonly number[];
  readonly activatedReels: readonly number[];
  readonly wins: readonly RipCityWin[];
  readonly multiplier: number;
}

export interface RipCityOutcome {
  readonly kind: "rip-city";
  readonly mathModel: "provisional-clean-room-v2";
  readonly columns: typeof RIP_CITY_COLUMNS;
  readonly rows: typeof RIP_CITY_ROWS;
  readonly initialGrid: readonly RipCityCell[];
  readonly grid: readonly RipCityCell[];
  readonly expandedPositions: readonly number[];
  readonly wins: readonly RipCityWin[];
  readonly bonusTriggered: boolean;
  readonly bonusVariant: "cat" | "mouse" | "none";
  readonly bonusSpins: readonly RipCityBonusSpin[];
  readonly totalMultiplier: number;
  readonly maxMultiplier: typeof RIP_CITY_MAX_MULTIPLIER;
  readonly replacementNote: string;
}

const provisionalWeights: readonly [RipCitySymbol, number][] = [
  ["ten", 14],
  ["jack", 14],
  ["queen", 13],
  ["king", 12],
  ["ace", 11],
  ["dice", 9],
  ["banana", 8],
  ["candle", 7],
  ["eightball", 7],
  ["smiley", 6],
  ["mouse", 5],
  ["cat", 4],
  ["wild", 5],
  ["bonus", 3]
];

const basePays: Readonly<Record<RipCitySymbol, readonly [number, number, number]>> = {
  ten: [0.1, 0.25, 0.75],
  jack: [0.12, 0.3, 0.9],
  queen: [0.14, 0.35, 1],
  king: [0.16, 0.4, 1.2],
  ace: [0.18, 0.5, 1.5],
  dice: [0.22, 0.65, 1.8],
  banana: [0.25, 0.75, 2.1],
  candle: [0.3, 0.9, 2.6],
  eightball: [0.35, 1.1, 3],
  smiley: [0.4, 1.25, 3.5],
  mouse: [0.5, 1.5, 4],
  cat: [0, 0, 0],
  wild: [0, 0, 0],
  bonus: [0, 0, 0]
};

function pick(random: RipCityRandom): RipCitySymbol {
  const total = provisionalWeights.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = random.int(total);
  for (const [symbol, weight] of provisionalWeights) {
    if (ticket < weight) return symbol;
    ticket -= weight;
  }
  return "ten";
}

function makeGrid(
  random: RipCityRandom,
  bonus: "cat" | "mouse" | "none",
  idOffset = 0,
  activatedReels: ReadonlySet<number> = new Set()
): RipCityCell[] {
  const grid = Array.from({ length: RIP_CITY_COLUMNS * RIP_CITY_ROWS }, (_, index) => {
    const reel = Math.floor(index / RIP_CITY_ROWS);
    const row = index % RIP_CITY_ROWS;
    let symbol = pick(random);
    if (bonus === "cat" && random.int(6) === 0) symbol = random.int(3) === 0 ? "wild" : "cat";
    return { id: idOffset + index + 1, symbol, reel, row, wildMultiplier: 1, expanded: false };
  });
  for (let reel = 0; reel < RIP_CITY_COLUMNS; reel += 1) {
    const cats = grid.filter((cell) => cell.reel === reel && cell.symbol === "cat");
    for (const duplicate of cats.slice(1)) grid[duplicate.id - idOffset - 1] = { ...duplicate, symbol: "mouse" };
    if (activatedReels.has(reel) && cats.length === 0) {
      const row = random.int(RIP_CITY_ROWS);
      const index = reel * RIP_CITY_ROWS + row;
      const cell = grid[index]!;
      grid[index] = { ...cell, symbol: "cat" };
    }
  }
  return grid;
}

function cellAt(grid: readonly RipCityCell[], reel: number, row: number) {
  return grid.find((cell) => cell.reel === reel && cell.row === row);
}

function isSubstitute(cell: RipCityCell | undefined) {
  return cell?.symbol === "wild" || cell?.symbol === "cat";
}

export function expandRipCityWilds(
  grid: readonly RipCityCell[],
  random?: RipCityRandom
): { grid: RipCityCell[]; positions: number[] } {
  const original = grid.map((cell) => ({ ...cell, expanded: false, wildMultiplier: 1 }));
  const cats = original.filter((cell) => cell.symbol === "cat");
  if (!cats.length) return { grid: original, positions: [] };
  const candidates = cats.map((cat) => {
    const covered = original.filter((cell) => cell.reel === cat.reel && cell.row >= cat.row);
    const crossedWilds = covered.filter((cell) => cell.symbol === "wild");
    const multiplier = crossedWilds.length
      ? crossedWilds.reduce(
          (sum) => sum + RIP_CITY_WILD_MULTIPLIERS[random?.int(RIP_CITY_WILD_MULTIPLIERS.length) ?? 0]!,
          0
        )
      : 1;
    return { cat, covered, multiplier };
  });
  const expandedAll = original.map((cell) => {
    const candidate = candidates.find(({ covered }) => covered.some(({ id }) => id === cell.id));
    return candidate ? { ...cell, symbol: "cat" as const, expanded: true, wildMultiplier: candidate.multiplier } : cell;
  });
  const provisionalWins = evaluateRipCityWins(expandedAll);
  const winningIds = new Set(provisionalWins.flatMap((win) => win.positions));
  const active = candidates.filter(({ covered }) => covered.some(({ id }) => winningIds.has(id)));
  const positions = active.flatMap(({ covered }) => covered.map(({ id }) => id));
  const activeIds = new Set(positions);
  const finalGrid = original.map((cell) => {
    const candidate = active.find(({ covered }) => covered.some(({ id }) => id === cell.id));
    return candidate && activeIds.has(cell.id)
      ? { ...cell, symbol: "cat" as const, expanded: true, wildMultiplier: candidate.multiplier }
      : cell;
  });
  return { grid: finalGrid, positions };
}

export function evaluateRipCityWins(grid: readonly RipCityCell[]): RipCityWin[] {
  const wins: RipCityWin[] = [];
  for (const payline of RIP_CITY_PAYLINES) {
    const line = payline.map((row, reel) => cellAt(grid, reel, row));
    const anchor = line.find((cell) => cell && !isSubstitute(cell) && cell.symbol !== "bonus")?.symbol;
    if (!anchor) continue;
    const positions: number[] = [];
    const appliedMultipliers: number[] = [];
    for (const cell of line) {
      if (!cell || (cell.symbol !== anchor && !isSubstitute(cell))) break;
      positions.push(cell.id);
      if (cell.symbol === "cat" && cell.expanded && cell.wildMultiplier > 1)
        appliedMultipliers.push(cell.wildMultiplier);
    }
    if (positions.length < 3) continue;
    const wildMultiplier = appliedMultipliers.length ? appliedMultipliers.reduce((sum, value) => sum + value, 0) : 1;
    const pay = (basePays[anchor][Math.min(2, positions.length - 3)] ?? 0) * wildMultiplier;
    wins.push({
      symbol: anchor,
      positions,
      count: positions.length,
      wildMultiplier,
      multiplier: quantizeSlotMultiplier(pay)
    });
  }
  return wins;
}

function resolveGrid(
  random: RipCityRandom,
  variant: "cat" | "mouse" | "none",
  offset: number,
  activatedReels: ReadonlySet<number> = new Set()
) {
  const initialGrid = makeGrid(random, variant, offset, activatedReels);
  const landed = expandRipCityWilds(initialGrid, random);
  const wins = evaluateRipCityWins(landed.grid);
  const multiplier = wins.reduce((sum, win) => sum + win.multiplier, 0);
  return {
    initialGrid,
    grid: landed.grid,
    positions: landed.positions,
    wins,
    multiplier: quantizeSlotMultiplier(multiplier)
  };
}

export function resolveRipCity(
  random: RipCityRandom,
  action = "spin"
): { multiplier: number; outcome: RipCityOutcome } {
  const base = resolveGrid(random, "none", 0);
  const bonusCount = base.initialGrid.filter((cell) => cell.symbol === "bonus").length;
  const forced = action.includes("force-cat") ? "cat" : action.includes("force-mouse") ? "mouse" : undefined;
  const bonusVariant: "cat" | "mouse" | "none" =
    forced ?? (bonusCount >= 4 ? "mouse" : bonusCount === 3 ? "cat" : "none");
  const bonusSpins: RipCityBonusSpin[] = [];
  let total = base.multiplier;
  if (bonusVariant !== "none") {
    let currentVariant = bonusVariant;
    let spinsRemaining = 10;
    let spin = 0;
    const activatedReels = new Set<number>();
    while (spinsRemaining > 0 && spin < 50) {
      spin += 1;
      spinsRemaining -= 1;
      const activeBeforeSpin = new Set(activatedReels);
      const resolved = resolveGrid(random, currentVariant, spin * 100, activeBeforeSpin);
      const scatterCount = resolved.initialGrid.filter((cell) => cell.symbol === "bonus").length;
      if (currentVariant === "mouse") {
        for (const cell of resolved.initialGrid) if (cell.symbol === "cat") activatedReels.add(cell.reel);
      }
      if (scatterCount >= 3) spinsRemaining += 4;
      if (currentVariant === "cat" && scatterCount >= 4) {
        currentVariant = "mouse";
        if (spinsRemaining < 10) spinsRemaining = 10;
      }
      bonusSpins.push({
        spin,
        variant: currentVariant,
        initialGrid: resolved.initialGrid,
        grid: resolved.grid,
        expandedPositions: resolved.positions,
        activatedReels: [...activatedReels].sort(),
        wins: resolved.wins,
        multiplier: resolved.multiplier
      });
      total += resolved.multiplier;
    }
  }
  total = Math.min(RIP_CITY_MAX_MULTIPLIER, quantizeSlotMultiplier(total));
  return {
    multiplier: total,
    outcome: {
      kind: "rip-city",
      mathModel: "provisional-clean-room-v2",
      columns: RIP_CITY_COLUMNS,
      rows: RIP_CITY_ROWS,
      initialGrid: base.initialGrid,
      grid: base.grid,
      expandedPositions: base.positions,
      wins: base.wins,
      bonusTriggered: bonusVariant !== "none",
      bonusVariant,
      bonusSpins,
      totalMultiplier: total,
      maxMultiplier: RIP_CITY_MAX_MULTIPLIER,
      replacementNote: "Temporary deterministic demo weights and payouts; replace this resolver during RTP calibration."
    }
  };
}
