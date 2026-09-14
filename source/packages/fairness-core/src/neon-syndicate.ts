export const NEON_SYNDICATE_COLUMNS = 5;
export const NEON_SYNDICATE_ROWS = 4;
export const NEON_SYNDICATE_CELLS = NEON_SYNDICATE_COLUMNS * NEON_SYNDICATE_ROWS;
export const NEON_SYNDICATE_MIN_WAGER = 0.1;
export const NEON_SYNDICATE_MAX_WAGER = 50;
export const NEON_SYNDICATE_MAX_WIN = 15_000;
export const NEON_SYNDICATE_MAX_FREE_SPINS = 50;

export const NEON_SYNDICATE_REGULAR_SYMBOLS = [
  "prism",
  "scan-bars",
  "shield",
  "tri-cell",
  "cross",
  "shuriken",
  "reactor-skull",
  "infiltrator",
  "signal-runner",
  "security-mask"
] as const;

export type NeonSyndicateRegularSymbol = (typeof NEON_SYNDICATE_REGULAR_SYMBOLS)[number];
export type NeonSyndicateSymbol = NeonSyndicateRegularSymbol | "wild" | "rival" | "fs" | "triple-trial";
export type NeonSyndicateBonusMode = "signal-run" | "neon-cleave" | "last-contract";
export type NeonSyndicateAction =
  | "spin"
  | "boost:rival"
  | "boost:duo"
  | "boost:triple"
  | "buy:signal"
  | "buy:cleave"
  | "buy:last"
  | "buy:trial-signal"
  | "buy:trial-cleave"
  | "buy:trial-last";

export interface NeonSyndicateRandom {
  int(maxExclusive: number): number;
}

export interface NeonSyndicateRival {
  readonly reel: number;
  readonly row: number;
  readonly leftMultiplier: number;
  readonly rightMultiplier: number;
  readonly winningSide: "lime" | "magenta";
  readonly multiplier: number;
  readonly activated: boolean;
}

export interface NeonSyndicateLineWin {
  readonly line: number;
  readonly symbol: NeonSyndicateRegularSymbol;
  readonly count: 3 | 4 | 5;
  readonly positions: readonly number[];
  readonly baseMultiplier: number;
  readonly rivalMultiplier: number;
  readonly multiplier: number;
}

export interface NeonSyndicateSpin {
  readonly grid: readonly NeonSyndicateSymbol[];
  readonly evaluatedGrid: readonly NeonSyndicateSymbol[];
  readonly lineWins: readonly NeonSyndicateLineWin[];
  readonly rivalReels: readonly NeonSyndicateRival[];
  readonly scatterCount: number;
  readonly tripleTrial: boolean;
  readonly cleaveRow?: number;
  readonly win: number;
  readonly retriggered: number;
  readonly presentationEvents: readonly string[];
}

export interface NeonSyndicateBonus {
  readonly mode: NeonSyndicateBonusMode;
  readonly awarded: number;
  readonly played: number;
  readonly win: number;
  readonly spins: readonly NeonSyndicateSpin[];
}

export interface NeonSyndicateTrial {
  readonly index: number;
  readonly bonus: NeonSyndicateBonus;
}

export interface NeonSyndicateOutcome {
  readonly kind: "neon-syndicate";
  readonly version: 1;
  readonly action: NeonSyndicateAction;
  readonly costMultiplier: number;
  readonly columns: 5;
  readonly rows: 4;
  readonly paylines: 14;
  readonly baseSpin: NeonSyndicateSpin;
  readonly bonusMode?: NeonSyndicateBonusMode;
  readonly bonus?: NeonSyndicateBonus;
  readonly trials: readonly NeonSyndicateTrial[];
  readonly rawTotal: number;
  readonly finalMultiplier: number;
  readonly capped: boolean;
  readonly presentationEvents: readonly string[];
}

export const NEON_SYNDICATE_PAYTABLE: Readonly<
  Record<NeonSyndicateRegularSymbol, Readonly<Record<3 | 4 | 5, number>>>
> = {
  prism: { 3: 0.2, 4: 1, 5: 2 },
  "scan-bars": { 3: 0.2, 4: 1, 5: 2 },
  shield: { 3: 0.2, 4: 1, 5: 2 },
  "tri-cell": { 3: 0.2, 4: 1, 5: 2 },
  cross: { 3: 0.2, 4: 1, 5: 2 },
  shuriken: { 3: 1, 4: 3, 5: 6 },
  "reactor-skull": { 3: 1, 4: 3, 5: 6 },
  infiltrator: { 3: 2, 4: 6, 5: 12 },
  "signal-runner": { 3: 2, 4: 6, 5: 12 },
  "security-mask": { 3: 4, 4: 10, 5: 20 }
};

export const NEON_SYNDICATE_PAYLINES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0],
  [3, 2, 1, 2, 3],
  [0, 0, 1, 0, 0],
  [3, 3, 2, 3, 3],
  [1, 0, 1, 0, 1],
  [2, 3, 2, 3, 2],
  [0, 1, 1, 1, 0],
  [3, 2, 2, 2, 3],
  [0, 1, 2, 3, 2],
  [3, 2, 1, 0, 1]
];

export const NEON_SYNDICATE_RIVAL_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 250, 500] as const;

const ACTION_COSTS: Readonly<Record<NeonSyndicateAction, number>> = {
  spin: 1,
  "boost:rival": 3,
  "boost:duo": 25,
  "boost:triple": 75,
  "buy:signal": 80,
  "buy:cleave": 150,
  "buy:last": 500,
  "buy:trial-signal": 240,
  "buy:trial-cleave": 450,
  "buy:trial-last": 1_500
};

const REGULAR_DRAW: readonly NeonSyndicateRegularSymbol[] = [
  ...Array.from({ length: 16 }, () => "prism" as const),
  ...Array.from({ length: 16 }, () => "scan-bars" as const),
  ...Array.from({ length: 15 }, () => "shield" as const),
  ...Array.from({ length: 15 }, () => "tri-cell" as const),
  ...Array.from({ length: 14 }, () => "cross" as const),
  ...Array.from({ length: 9 }, () => "shuriken" as const),
  ...Array.from({ length: 8 }, () => "reactor-skull" as const),
  ...Array.from({ length: 6 }, () => "infiltrator" as const),
  ...Array.from({ length: 5 }, () => "signal-runner" as const),
  ...Array.from({ length: 3 }, () => "security-mask" as const)
];

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function index(column: number, row: number): number {
  return row * NEON_SYNDICATE_COLUMNS + column;
}

function pick<T>(random: NeonSyndicateRandom, values: readonly T[]): T {
  const value = values[random.int(values.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty collection");
  return value;
}

function isRegular(symbol: NeonSyndicateSymbol | undefined): symbol is NeonSyndicateRegularSymbol {
  return Boolean(symbol && (NEON_SYNDICATE_REGULAR_SYMBOLS as readonly string[]).includes(symbol));
}

export function isNeonSyndicateAction(value: string): value is NeonSyndicateAction {
  return Object.hasOwn(ACTION_COSTS, value);
}

export function neonSyndicateCostMultiplierForAction(action: string): number {
  if (!isNeonSyndicateAction(action)) throw new Error("Invalid Neon Syndicate action");
  return ACTION_COSTS[action];
}

function drawSymbol(random: NeonSyndicateRandom, rivalChance: number, allowFs: boolean): NeonSyndicateSymbol {
  const roll = random.int(10_000);
  if (roll < rivalChance) return "rival";
  if (allowFs && roll < rivalChance + 190) return "fs";
  if (allowFs && roll < rivalChance + 215) return "triple-trial";
  if (roll < rivalChance + 330) return "wild";
  return pick(random, REGULAR_DRAW);
}

function drawGrid(
  random: NeonSyndicateRandom,
  rivalChance: number,
  allowFs: boolean,
  minimumRivals = 0
): NeonSyndicateSymbol[] {
  const grid = Array.from({ length: NEON_SYNDICATE_CELLS }, () => drawSymbol(random, rivalChance, allowFs));
  for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) {
    const rivals = Array.from({ length: NEON_SYNDICATE_ROWS }, (_, row) => index(reel, row)).filter(
      (position) => grid[position] === "rival"
    );
    for (const position of rivals.slice(1)) grid[position] = pick(random, REGULAR_DRAW);
  }
  const occupied = new Set(
    Array.from({ length: NEON_SYNDICATE_COLUMNS }, (_, reel) => reel).filter((reel) =>
      Array.from({ length: NEON_SYNDICATE_ROWS }, (_, row) => grid[index(reel, row)]).includes("rival")
    )
  );
  while (occupied.size < minimumRivals) {
    const candidates = Array.from({ length: NEON_SYNDICATE_COLUMNS }, (_, reel) => reel).filter(
      (reel) => !occupied.has(reel)
    );
    const reel = pick(random, candidates);
    grid[index(reel, random.int(NEON_SYNDICATE_ROWS))] = "rival";
    occupied.add(reel);
  }
  return grid;
}

function rawLineWin(
  grid: readonly NeonSyndicateSymbol[],
  line: readonly [number, number, number, number, number]
):
  | { readonly symbol: NeonSyndicateRegularSymbol; readonly count: 3 | 4 | 5; readonly positions: readonly number[] }
  | undefined {
  const positions = line.map((row, reel) => index(reel, row));
  const symbols = positions.map((position) => grid[position]);
  const target =
    symbols.find(isRegular) ?? (symbols.slice(0, 3).every((symbol) => symbol === "wild") ? "security-mask" : undefined);
  if (!target) return undefined;
  let count = 0;
  for (const symbol of symbols) {
    if (symbol === target || symbol === "wild") count += 1;
    else break;
  }
  if (count < 3) return undefined;
  return { symbol: target, count: Math.min(5, count) as 3 | 4 | 5, positions: positions.slice(0, count) };
}

export function evaluateNeonSyndicatePaylines(
  grid: readonly NeonSyndicateSymbol[],
  rivals: readonly NeonSyndicateRival[] = []
): readonly NeonSyndicateLineWin[] {
  if (grid.length !== NEON_SYNDICATE_CELLS) throw new Error("Neon Syndicate grid must contain exactly 20 cells");
  return NEON_SYNDICATE_PAYLINES.flatMap((line, lineIndex) => {
    const raw = rawLineWin(grid, line);
    if (!raw) return [];
    const contributingReels = new Set(raw.positions.map((position) => position % NEON_SYNDICATE_COLUMNS));
    const rivalMultiplier =
      rivals
        .filter((rival) => rival.activated && contributingReels.has(rival.reel))
        .reduce((sum, rival) => sum + rival.multiplier, 0) || 1;
    const baseMultiplier = NEON_SYNDICATE_PAYTABLE[raw.symbol][raw.count];
    return [
      {
        line: lineIndex,
        ...raw,
        baseMultiplier,
        rivalMultiplier,
        multiplier: round4(baseMultiplier * rivalMultiplier)
      }
    ];
  });
}

function rivalDetails(random: NeonSyndicateRandom, grid: readonly NeonSyndicateSymbol[]): NeonSyndicateRival[] {
  const rivals: NeonSyndicateRival[] = [];
  for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) {
    const row = Array.from({ length: NEON_SYNDICATE_ROWS }, (_, candidate) => candidate).find(
      (candidate) => grid[index(reel, candidate)] === "rival"
    );
    if (row === undefined) continue;
    const leftMultiplier = pick(random, NEON_SYNDICATE_RIVAL_MULTIPLIERS);
    const rightMultiplier = pick(random, NEON_SYNDICATE_RIVAL_MULTIPLIERS);
    const winningSide = random.int(2) === 0 ? "lime" : "magenta";
    rivals.push({
      reel,
      row,
      leftMultiplier,
      rightMultiplier,
      winningSide,
      multiplier: winningSide === "lime" ? leftMultiplier : rightMultiplier,
      activated: false
    });
  }
  return rivals;
}

function resolveSpin(
  random: NeonSyndicateRandom,
  options: {
    readonly mode?: NeonSyndicateBonusMode;
    readonly rivalChance: number;
    readonly minimumRivals?: number;
  }
): NeonSyndicateSpin {
  const allowFs = options.mode !== "last-contract";
  const grid = drawGrid(random, options.rivalChance, allowFs, options.minimumRivals);
  let rivals = rivalDetails(random, grid);
  const trialGrid = [...grid];
  for (const rival of rivals) {
    for (let row = 0; row < NEON_SYNDICATE_ROWS; row += 1) trialGrid[index(rival.reel, row)] = "wild";
  }
  const trialWins = evaluateNeonSyndicatePaylines(trialGrid);
  const activeReels = new Set(
    rivals
      .filter((rival) => trialWins.some((win) => win.positions.some((position) => position % 5 === rival.reel)))
      .map((rival) => rival.reel)
  );
  rivals = rivals.map((rival) => ({ ...rival, activated: activeReels.has(rival.reel) }));
  const evaluatedGrid = [...grid];
  for (const rival of rivals.filter((candidate) => candidate.activated)) {
    for (let row = 0; row < NEON_SYNDICATE_ROWS; row += 1) evaluatedGrid[index(rival.reel, row)] = "wild";
  }
  const cleave =
    options.mode === "last-contract" || (options.mode === "neon-cleave" && rivals.length > 0 && random.int(100) < 45);
  const cleaveRow = cleave ? random.int(NEON_SYNDICATE_ROWS) : undefined;
  if (cleaveRow !== undefined) {
    for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) evaluatedGrid[index(reel, cleaveRow)] = "wild";
  }
  const allRivals = activeReels.size === 5;
  if (allRivals) evaluatedGrid.fill("wild");
  let lineWins = evaluateNeonSyndicatePaylines(evaluatedGrid, rivals);
  if (allRivals && lineWins.length === 0) {
    lineWins = NEON_SYNDICATE_PAYLINES.map((line, lineIndex) => {
      const positions = line.map((row, reel) => index(reel, row));
      const rivalMultiplier = rivals.reduce((sum, rival) => sum + rival.multiplier, 0);
      return {
        line: lineIndex,
        symbol: "security-mask" as const,
        count: 5 as const,
        positions,
        baseMultiplier: 20,
        rivalMultiplier,
        multiplier: round4(20 * rivalMultiplier)
      };
    });
  }
  const scatterCount = grid.filter((symbol) => symbol === "fs").length;
  const retriggered = options.mode && scatterCount >= 2 ? (scatterCount >= 3 ? 4 : 2) : 0;
  const win = round4(lineWins.reduce((sum, line) => sum + line.multiplier, 0));
  const presentationEvents = [
    "reels:spin",
    ...(scatterCount >= 2 ? ["scatter:anticipation"] : []),
    ...rivals.filter((rival) => rival.activated).map((rival) => `rival:${rival.reel}:${rival.multiplier}`),
    ...(cleaveRow !== undefined ? [`cleave:${cleaveRow}`] : []),
    ...(lineWins.length > 0 ? ["win:lines", "win:count"] : [])
  ];
  return {
    grid,
    evaluatedGrid,
    lineWins,
    rivalReels: rivals,
    scatterCount,
    tripleTrial: grid.includes("triple-trial"),
    ...(cleaveRow !== undefined ? { cleaveRow } : {}),
    win,
    retriggered,
    presentationEvents
  };
}

export function neonSyndicateBonusModeForScatterCount(count: number): NeonSyndicateBonusMode | undefined {
  if (count >= 5) return "last-contract";
  if (count === 4) return "neon-cleave";
  if (count === 3) return "signal-run";
  return undefined;
}

export function capNeonSyndicateMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier < 0)
    throw new Error("Neon Syndicate multiplier must be finite and nonnegative");
  return round4(Math.min(NEON_SYNDICATE_MAX_WIN, multiplier));
}

export function selectBestNeonSyndicateTrial(trials: readonly NeonSyndicateTrial[]): NeonSyndicateBonus | undefined {
  return trials.reduce<NeonSyndicateBonus | undefined>(
    (best, candidate) => (!best || candidate.bonus.win > best.win ? candidate.bonus : best),
    undefined
  );
}

function forcedMode(action: NeonSyndicateAction): NeonSyndicateBonusMode | undefined {
  if (action.endsWith("signal")) return "signal-run";
  if (action.endsWith("cleave")) return "neon-cleave";
  if (action.endsWith("last")) return "last-contract";
  return undefined;
}

function resolveBonus(random: NeonSyndicateRandom, mode: NeonSyndicateBonusMode): NeonSyndicateBonus {
  let awarded = 10;
  const spins: NeonSyndicateSpin[] = [];
  let win = 0;
  for (let spin = 0; spin < awarded && spin < NEON_SYNDICATE_MAX_FREE_SPINS; spin += 1) {
    const result = resolveSpin(random, {
      mode,
      rivalChance: mode === "signal-run" ? 500 : 620,
      minimumRivals: mode === "last-contract" ? 1 : 0
    });
    spins.push(result);
    win = round4(win + result.win);
    awarded = Math.min(NEON_SYNDICATE_MAX_FREE_SPINS, awarded + result.retriggered);
    if (win >= NEON_SYNDICATE_MAX_WIN) break;
  }
  return { mode, awarded, played: spins.length, win, spins };
}

export function resolveNeonSyndicate(
  random: NeonSyndicateRandom,
  rawAction: string
): { readonly multiplier: number; readonly outcome: NeonSyndicateOutcome } {
  if (!isNeonSyndicateAction(rawAction)) throw new Error("Invalid Neon Syndicate action");
  const minimumRivals =
    rawAction === "boost:triple" ? 3 : rawAction === "boost:duo" ? 2 : rawAction === "boost:rival" ? 1 : 0;
  const baseSpin = resolveSpin(random, { rivalChance: minimumRivals ? 700 : 220, minimumRivals });
  const purchasedMode = forcedMode(rawAction);
  const bonusMode = purchasedMode ?? neonSyndicateBonusModeForScatterCount(baseSpin.scatterCount);
  const isTrial = rawAction.startsWith("buy:trial-") || (baseSpin.tripleTrial && bonusMode !== undefined);
  const trials: NeonSyndicateTrial[] = [];
  let bonus: NeonSyndicateBonus | undefined;
  if (bonusMode && isTrial) {
    for (let trial = 0; trial < 3; trial += 1) trials.push({ index: trial, bonus: resolveBonus(random, bonusMode) });
    bonus = selectBestNeonSyndicateTrial(trials);
  } else if (bonusMode) {
    bonus = resolveBonus(random, bonusMode);
  }
  const rawTotal = round4(baseSpin.win + (bonus?.win ?? 0));
  const finalMultiplier = capNeonSyndicateMultiplier(rawTotal);
  const presentationEvents = [
    ...baseSpin.presentationEvents,
    ...(bonusMode ? [`bonus:${bonusMode}`] : []),
    ...(isTrial ? ["trial:start", "trial:scoreboard"] : []),
    ...(finalMultiplier >= NEON_SYNDICATE_MAX_WIN ? ["win:max"] : finalMultiplier >= 100 ? ["win:large"] : [])
  ];
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "neon-syndicate",
      version: 1,
      action: rawAction,
      costMultiplier: ACTION_COSTS[rawAction],
      columns: 5,
      rows: 4,
      paylines: 14,
      baseSpin,
      ...(bonusMode ? { bonusMode } : {}),
      ...(bonus ? { bonus } : {}),
      trials,
      rawTotal,
      finalMultiplier,
      capped: rawTotal > NEON_SYNDICATE_MAX_WIN,
      presentationEvents
    }
  };
}
