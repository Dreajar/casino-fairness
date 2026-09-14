export const WANTED_MAX_WIN = 12_500;

export const WANTED_PAYLINES = [
  [2, 2, 2, 2, 2],
  [1, 1, 1, 1, 1],
  [3, 3, 3, 3, 3],
  [0, 0, 0, 0, 0],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [0, 1, 0, 1, 0],
  [4, 3, 4, 3, 4],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [1, 0, 1, 0, 1],
  [3, 4, 3, 4, 3]
] as const;

export const WANTED_SYMBOLS = [
  "10",
  "J",
  "Q",
  "K",
  "A",
  "boot",
  "skull",
  "bottle",
  "money",
  "cylinder",
  "wild",
  "train",
  "duel",
  "dead",
  "vs",
  "collect"
] as const;

export const WANTED_DUEL_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 25, 50, 100] as const;
export const WANTED_COLLECT_MULTIPLIERS = [1, 2, 3, 5, 10] as const;

export type WantedFeature = "train" | "duel" | "dead";
export type WantedSymbol = (typeof WANTED_SYMBOLS)[number];

export const WANTED_PAYTABLE: Readonly<Record<WantedSymbol, Readonly<Record<number, number>>>> = {
  "10": { 3: 0.1, 4: 0.5, 5: 1 },
  J: { 3: 0.1, 4: 0.5, 5: 1 },
  Q: { 3: 0.1, 4: 0.5, 5: 1 },
  K: { 3: 0.1, 4: 0.5, 5: 1 },
  A: { 3: 0.1, 4: 0.5, 5: 1 },
  boot: { 3: 0.5, 4: 2.5, 5: 5 },
  skull: { 3: 0.5, 4: 2.5, 5: 5 },
  bottle: { 3: 1, 4: 5, 5: 10 },
  money: { 3: 1, 4: 5, 5: 10 },
  cylinder: { 3: 2, 4: 10, 5: 20 },
  wild: { 5: 20 },
  train: {},
  duel: {},
  dead: {},
  vs: {},
  collect: {}
};

/** Original provisional weights. RTP calibration is intentionally deferred. */
export const WANTED_PROVISIONAL_MODEL = {
  base: [
    "10",
    "10",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "A",
    "boot",
    "boot",
    "boot",
    "skull",
    "skull",
    "skull",
    "bottle",
    "bottle",
    "money",
    "money",
    "cylinder",
    "wild",
    "wild",
    "train",
    "duel",
    "dead",
    "vs"
  ] as readonly WantedSymbol[],
  duel: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild",
    "vs",
    "vs",
    "vs",
    "vs"
  ] as readonly WantedSymbol[],
  train: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild",
    "wild",
    "wild"
  ] as readonly WantedSymbol[],
  showdown: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild"
  ] as readonly WantedSymbol[]
} as const;

export function wantedCostMultiplierForAction(action: string): number {
  if (action === "feature:train") return 80;
  if (action === "feature:duel") return 200;
  if (action === "feature:dead") return 400;
  return 1;
}

export interface WantedRandom {
  int(maxExclusive: number): number;
}
export interface WantedVsReel {
  readonly reel: number;
  readonly multiplier: number;
  readonly cards: readonly [number, number];
  readonly survivor: 0 | 1;
}
export interface WantedLineWin {
  readonly line: number;
  readonly symbol: WantedSymbol;
  readonly count: number;
  readonly positions: readonly number[];
  readonly baseMultiplier: number;
  readonly appliedMultiplier: number;
  readonly contributingVsReels: readonly number[];
  readonly multiplier: number;
}
export interface WantedSpin {
  readonly index: number;
  readonly grid: readonly WantedSymbol[];
  readonly wins: readonly WantedLineWin[];
  readonly multiplier: number;
  readonly stickyWilds?: readonly number[];
  readonly vsReels?: readonly WantedVsReel[];
  readonly collected?: readonly number[];
  readonly newWilds?: readonly number[];
  readonly newMultipliers?: readonly number[];
  readonly collectedMultiplier?: number;
  readonly respinsRemaining?: number;
  readonly phase?: "collect" | "showdown";
}
export interface WantedOutcome {
  readonly kind: "wanted-dead-or-wild";
  readonly grid: readonly WantedSymbol[];
  readonly wins: readonly WantedLineWin[];
  readonly vsReels: readonly WantedVsReel[];
  readonly feature: WantedFeature | null;
  readonly featureSpins: readonly WantedSpin[];
  readonly featurePriority: readonly WantedFeature[];
  readonly baseMultiplier: number;
  readonly featureMultiplier: number;
  readonly totalMultiplier: number;
  readonly maxWin: number;
  readonly paylineCount: 15;
  readonly columns: 5;
  readonly rows: 5;
}

const round = (value: number) => Math.round(value * 100) / 100;
export const capWantedMultiplier = (value: number) => Math.min(WANTED_MAX_WIN, Math.max(0, round(value)));
const isScatter = (symbol: WantedSymbol) => symbol === "train" || symbol === "duel" || symbol === "dead";
const isSpecial = (symbol: WantedSymbol) => isScatter(symbol) || symbol === "vs" || symbol === "collect";
function drawGrid(
  random: WantedRandom,
  symbols: readonly WantedSymbol[] = WANTED_PROVISIONAL_MODEL.base
): WantedSymbol[] {
  return Array.from({ length: 25 }, () => symbols[random.int(symbols.length)] ?? "10");
}

export function evaluateWantedLines(
  grid: readonly WantedSymbol[],
  vsReels: readonly WantedVsReel[] = []
): readonly WantedLineWin[] {
  const wins: WantedLineWin[] = [];
  const vsByReel = new Map(vsReels.map((entry) => [entry.reel, entry.multiplier]));
  WANTED_PAYLINES.forEach((rows, line) => {
    const positions = rows.map((row, reel) => row * 5 + reel);
    const sequence = positions.map((position) => grid[position] ?? "10");
    const target = sequence.find((symbol) => symbol !== "wild") ?? "wild";
    if (isSpecial(target)) return;
    let count = 0;
    for (const symbol of sequence) {
      if (symbol !== target && symbol !== "wild") break;
      count += 1;
    }
    const baseMultiplier = WANTED_PAYTABLE[target][count] ?? 0;
    if (baseMultiplier <= 0) return;
    const contributingVsReels = positions
      .slice(0, count)
      .map((position) => position % 5)
      .filter((reel) => vsByReel.has(reel));
    const appliedMultiplier = contributingVsReels.length
      ? contributingVsReels.reduce((sum, reel) => sum + (vsByReel.get(reel) ?? 0), 0)
      : 1;
    wins.push({
      line: line + 1,
      symbol: target,
      count,
      positions: positions.slice(0, count),
      baseMultiplier,
      appliedMultiplier,
      contributingVsReels,
      multiplier: round(baseMultiplier * appliedMultiplier)
    });
  });
  return wins;
}

const winTotal = (wins: readonly WantedLineWin[]) => round(wins.reduce((sum, win) => sum + win.multiplier, 0));
function expandReels(grid: readonly WantedSymbol[], reels: readonly number[]): WantedSymbol[] {
  const expanded = [...grid];
  for (const reel of reels) for (let row = 0; row < 5; row += 1) expanded[row * 5 + reel] = "wild";
  return expanded;
}

export function qualifyingWantedVsReels(grid: readonly WantedSymbol[]): readonly number[] {
  const candidates = [...new Set(grid.flatMap((symbol, position) => (symbol === "vs" ? [position % 5] : [])))].sort();
  if (!candidates.length) return [];
  let qualifying = candidates;
  while (qualifying.length) {
    const expanded = expandReels(grid, qualifying);
    const used = new Set(evaluateWantedLines(expanded).flatMap((win) => win.positions.map((position) => position % 5)));
    const next = qualifying.filter((reel) => used.has(reel));
    if (next.length === qualifying.length) return next;
    qualifying = next;
  }
  return [];
}

function duelCards(random: WantedRandom): readonly [number, number] {
  return [
    WANTED_DUEL_MULTIPLIERS[random.int(WANTED_DUEL_MULTIPLIERS.length)] ?? 2,
    WANTED_DUEL_MULTIPLIERS[random.int(WANTED_DUEL_MULTIPLIERS.length)] ?? 2
  ];
}
export function resolveWantedVs(grid: readonly WantedSymbol[], random: WantedRandom) {
  const reels = qualifyingWantedVsReels(grid);
  const vsReels = reels.map((reel): WantedVsReel => {
    const cards = duelCards(random);
    const survivor = random.int(2) as 0 | 1;
    return { reel, cards, survivor, multiplier: cards[survivor] };
  });
  const expanded = expandReels(grid, reels);
  // Expansion is used only for win evaluation. Keep the landed symbols intact
  // for presentation instead of replacing whole visible reels with W symbols.
  return { grid: [...grid], wins: evaluateWantedLines(expanded, vsReels), vsReels } as const;
}

export function triggeredWantedFeatures(grid: readonly WantedSymbol[]): readonly WantedFeature[] {
  const counts: Record<WantedFeature, number> = { train: 0, duel: 0, dead: 0 };
  for (const symbol of grid) if (isScatter(symbol)) counts[symbol] += 1;
  return (["dead", "duel", "train"] as const).filter((feature) => counts[feature] >= 3);
}

function trainFeature(random: WantedRandom): readonly WantedSpin[] {
  const sticky = new Set<number>();
  return Array.from({ length: 10 }, (_unused, index) => {
    const grid = drawGrid(random, WANTED_PROVISIONAL_MODEL.train);
    grid.forEach((symbol, position) => {
      if (symbol === "wild") sticky.add(position);
    });
    for (const position of sticky) grid[position] = "wild";
    const wins = evaluateWantedLines(grid);
    return { index: index + 1, grid, wins, multiplier: winTotal(wins), stickyWilds: [...sticky].sort((a, b) => a - b) };
  });
}
function duelFeature(random: WantedRandom): readonly WantedSpin[] {
  return Array.from({ length: 10 }, (_unused, index) => {
    const resolved = resolveWantedVs(drawGrid(random, WANTED_PROVISIONAL_MODEL.duel), random);
    return {
      index: index + 1,
      grid: resolved.grid,
      wins: resolved.wins,
      multiplier: winTotal(resolved.wins),
      vsReels: resolved.vsReels
    };
  });
}
function deadFeature(random: WantedRandom): readonly WantedSpin[] {
  const collected = new Set<number>();
  const spins: WantedSpin[] = [];
  let collectedMultiplier = 1;
  let remaining = 3;
  let index = 0;
  while (remaining > 0) {
    index += 1;
    if (index > 100) throw new Error("Dead Man collect phase exceeded deterministic safety bound");
    const grid = drawGrid(random, WANTED_PROVISIONAL_MODEL.showdown);
    const newWilds: number[] = [];
    const newMultipliers: number[] = [];
    for (let position = 0; position < 25; position += 1) {
      if (!collected.has(position) && random.int(16) === 0) {
        collected.add(position);
        newWilds.push(position);
      }
    }
    if (random.int(5) === 0) {
      const value = WANTED_COLLECT_MULTIPLIERS[random.int(WANTED_COLLECT_MULTIPLIERS.length)] ?? 1;
      newMultipliers.push(value);
      collectedMultiplier += value;
    }
    if (index === 1 && collected.size === 0 && newMultipliers.length === 0) {
      const position = random.int(25);
      collected.add(position);
      newWilds.push(position);
    }
    remaining = newWilds.length || newMultipliers.length ? 3 : remaining - 1;
    for (const position of collected) grid[position] = "money";
    for (let item = 0; item < newMultipliers.length; item += 1) {
      const slot = (random.int(25) + item) % 25;
      if (!collected.has(slot)) grid[slot] = "collect";
    }
    spins.push({
      index,
      grid,
      wins: [],
      multiplier: 0,
      collected: [...collected].sort((a, b) => a - b),
      newWilds,
      newMultipliers,
      collectedMultiplier,
      respinsRemaining: remaining,
      phase: "collect"
    });
  }
  for (let showdown = 1; showdown <= 3; showdown += 1) {
    const grid = drawGrid(random, WANTED_PROVISIONAL_MODEL.showdown);
    for (const position of collected) grid[position] = "wild";
    const wins = evaluateWantedLines(grid).map((win) => ({
      ...win,
      appliedMultiplier: round(win.appliedMultiplier * collectedMultiplier),
      multiplier: round(win.multiplier * collectedMultiplier)
    }));
    spins.push({
      index: showdown,
      grid,
      wins,
      multiplier: winTotal(wins),
      collected: [...collected].sort((a, b) => a - b),
      collectedMultiplier,
      respinsRemaining: 3 - showdown,
      phase: "showdown"
    });
  }
  return spins;
}
function featureSpins(random: WantedRandom, feature: WantedFeature): readonly WantedSpin[] {
  if (feature === "train") return trainFeature(random);
  if (feature === "duel") return duelFeature(random);
  return deadFeature(random);
}

export function resolveWantedDeadOrWild(random: WantedRandom, action = "spin"): WantedOutcome {
  const rawGrid = drawGrid(random);
  const featurePriority = triggeredWantedFeatures(rawGrid);
  const base = resolveWantedVs(rawGrid, random);
  const requested = /^feature:(train|duel|dead)$/.exec(action)?.[1] as WantedFeature | undefined;
  const feature = requested ?? featurePriority[0] ?? null;
  const spins = feature ? featureSpins(random, feature) : [];
  const baseMultiplier = winTotal(base.wins);
  const featureMultiplier = round(spins.reduce((sum, spin) => sum + spin.multiplier, 0));
  const totalMultiplier = capWantedMultiplier(baseMultiplier + featureMultiplier);
  return {
    kind: "wanted-dead-or-wild",
    grid: base.grid,
    wins: base.wins,
    vsReels: base.vsReels,
    feature,
    featureSpins: spins,
    featurePriority,
    baseMultiplier,
    featureMultiplier,
    totalMultiplier,
    maxWin: WANTED_MAX_WIN,
    paylineCount: 15,
    columns: 5,
    rows: 5
  };
}
