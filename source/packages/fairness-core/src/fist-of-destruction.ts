import { quantizeSlotMultiplier } from "./constants.ts";

export type FistTeam = "blue" | "red";
export type FistRegularSymbol =
  | "blue-vanguard"
  | "blue-specter"
  | "red-blaze"
  | "red-titan"
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10";
export type FistSymbol = FistRegularSymbol | "wild" | "scatter" | "blue-fist" | "red-fist";

export interface FistCell {
  readonly symbol: FistSymbol;
}

export interface FistRandomSource {
  int(maxExclusive: number): number;
}

export interface FistWaysWin {
  readonly symbol: FistRegularSymbol | "wild";
  readonly count: number;
  readonly ways: number;
  readonly positions: readonly number[];
  readonly basePayout: number;
  readonly wildReels: readonly number[];
  readonly multiplier: number;
  readonly payout: number;
}

export interface FistWildEvent {
  readonly team: FistTeam;
  readonly position: number;
  readonly reel: number;
  readonly row: number;
  readonly activated: boolean;
  readonly expandedPositions: readonly number[];
  readonly crossedPositions: readonly number[];
  readonly collectedMultipliers: readonly number[];
  readonly reelMultiplier: number;
}

export interface FistSpin {
  readonly initialGrid: readonly FistCell[];
  readonly finalGrid: readonly FistCell[];
  readonly fistEvents: readonly FistWildEvent[];
  readonly waysWins: readonly FistWaysWin[];
  readonly scatterCount: number;
  readonly win: number;
}

export const FIST_OF_DESTRUCTION_COLUMNS = 5;
export const FIST_OF_DESTRUCTION_ROWS = 4;
export const FIST_OF_DESTRUCTION_MAX_WIN = 10_000;
export const FIST_OF_DESTRUCTION_MAX_FREE_SPINS = 40;
export const FIST_OF_DESTRUCTION_RTP_CALIBRATION_PENDING = true;
export const FIST_OF_DESTRUCTION_WAYS = 1_024;

export const FIST_OF_DESTRUCTION_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200] as const;

/**
 * Provisional clean-room paytable. It is intentionally isolated here so a
 * later certified RTP pass can replace the weights and awards without
 * changing the deterministic transcript or runtime contract.
 */
export const FIST_OF_DESTRUCTION_PAYTABLE: Readonly<
  Record<FistRegularSymbol | "wild", readonly [number, number, number]>
> = {
  "blue-vanguard": [0.6, 1.8, 6],
  "blue-specter": [0.4, 1.2, 4],
  "red-blaze": [0.6, 1.8, 6],
  "red-titan": [0.4, 1.2, 4],
  A: [0.2, 0.5, 1.2],
  K: [0.18, 0.45, 1],
  Q: [0.16, 0.4, 0.9],
  J: [0.14, 0.35, 0.8],
  "10": [0.12, 0.3, 0.7],
  wild: [0.8, 2.5, 10]
};

const weightedSymbols = [
  { symbol: "10", weight: 118 },
  { symbol: "J", weight: 112 },
  { symbol: "Q", weight: 106 },
  { symbol: "K", weight: 100 },
  { symbol: "A", weight: 94 },
  { symbol: "blue-specter", weight: 55 },
  { symbol: "red-titan", weight: 55 },
  { symbol: "blue-vanguard", weight: 40 },
  { symbol: "red-blaze", weight: 40 },
  { symbol: "wild", weight: 18 },
  { symbol: "scatter", weight: 16 },
  { symbol: "blue-fist", weight: 15 },
  { symbol: "red-fist", weight: 15 }
] as const satisfies readonly { readonly symbol: FistSymbol; readonly weight: number }[];

const multiplierWeights = [80, 62, 48, 38, 30, 24, 20, 17, 14, 10, 8, 6, 3, 2, 1] as const;

function weightedPick<T extends { readonly weight: number }>(random: FistRandomSource, values: readonly T[]): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  let cursor = random.int(total);
  for (const value of values) {
    if (cursor < value.weight) return value;
    cursor -= value.weight;
  }
  return values[0] as T;
}

function symbolFor(random: FistRandomSource): FistSymbol {
  return weightedPick(random, weightedSymbols).symbol;
}

function multiplierFor(random: FistRandomSource): number {
  const values = FIST_OF_DESTRUCTION_MULTIPLIERS.map((value, index) => ({
    value,
    weight: multiplierWeights[index] ?? 1
  }));
  return weightedPick(random, values).value;
}

function gridFor(random: FistRandomSource): readonly FistCell[] {
  const grid: FistCell[] = [];
  for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
    const fistReels = new Set<number>();
    for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
      let symbol = symbolFor(random);
      if ((symbol === "blue-fist" || symbol === "red-fist") && fistReels.has(reel)) symbol = "10";
      if (symbol === "blue-fist" || symbol === "red-fist") fistReels.add(reel);
      grid.push({ symbol });
    }
  }
  // Enforce one Fist per reel across the complete grid.
  for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
    let seen = false;
    for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
      const position = row * FIST_OF_DESTRUCTION_COLUMNS + reel;
      const cell = grid[position];
      if (cell?.symbol !== "blue-fist" && cell?.symbol !== "red-fist") continue;
      if (seen) grid[position] = { symbol: "10" };
      seen = true;
    }
  }
  return grid;
}

function regularSymbol(symbol: FistSymbol): symbol is FistRegularSymbol {
  return symbol !== "wild" && symbol !== "scatter" && symbol !== "blue-fist" && symbol !== "red-fist";
}

function expandedMap(events: readonly FistWildEvent[]): ReadonlyMap<number, FistWildEvent> {
  const result = new Map<number, FistWildEvent>();
  for (const event of events.filter((candidate) => candidate.activated)) {
    for (const position of event.expandedPositions) result.set(position, event);
  }
  return result;
}

export function evaluateFistWays(
  grid: readonly FistCell[],
  events: readonly FistWildEvent[] = []
): readonly FistWaysWin[] {
  const expanded = expandedMap(events);
  const firstReel = Array.from({ length: FIST_OF_DESTRUCTION_ROWS }, (_, row) => row * FIST_OF_DESTRUCTION_COLUMNS);
  const candidates = new Set<FistRegularSymbol | "wild">();
  for (const position of firstReel) {
    const symbol = expanded.has(position) ? "wild" : grid[position]?.symbol;
    if (symbol && regularSymbol(symbol)) candidates.add(symbol);
  }
  if (candidates.size === 0 && firstReel.some((position) => expanded.has(position) || grid[position]?.symbol === "wild")) {
    candidates.add("wild");
  }

  return [...candidates].flatMap((candidate): FistWaysWin[] => {
    const positionsByReel: number[][] = [];
    const wildEvents = new Map<number, FistWildEvent>();
    for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
      const matches: number[] = [];
      for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
        const position = row * FIST_OF_DESTRUCTION_COLUMNS + reel;
        const event = expanded.get(position);
        const symbol = event ? "wild" : grid[position]?.symbol;
        if (symbol === candidate || symbol === "wild") {
          matches.push(position);
          if (event) wildEvents.set(event.reel, event);
        }
      }
      if (matches.length === 0) break;
      positionsByReel.push(matches);
    }
    if (positionsByReel.length < 3) return [];
    const basePayout = FIST_OF_DESTRUCTION_PAYTABLE[candidate][Math.min(2, positionsByReel.length - 3)] ?? 0;
    if (basePayout <= 0) return [];
    const ways = positionsByReel.reduce((total, positions) => total * positions.length, 1);
    const multiplied = [...wildEvents.values()].filter((event) => event.reelMultiplier > 1);
    const multiplier = multiplied.length > 0 ? multiplied.reduce((sum, event) => sum + event.reelMultiplier, 0) : 1;
    return [
      {
        symbol: candidate,
        count: positionsByReel.length,
        ways,
        positions: positionsByReel.flat(),
        basePayout,
        wildReels: [...wildEvents.keys()].sort((left, right) => left - right),
        multiplier,
        payout: quantizeSlotMultiplier(basePayout * ways * multiplier)
      }
    ];
  });
}

function opposingSymbol(team: FistTeam, symbol: FistSymbol): boolean {
  if (symbol === "wild") return true;
  return team === "blue"
    ? symbol === "red-blaze" || symbol === "red-titan"
    : symbol === "blue-vanguard" || symbol === "blue-specter";
}

function fistEventsFor(random: FistRandomSource, grid: readonly FistCell[]): readonly FistWildEvent[] {
  const active: FistWildEvent[] = [];
  const candidates = grid.flatMap((cell, position) =>
    cell.symbol === "blue-fist" || cell.symbol === "red-fist" ? [{ cell, position }] : []
  );
  for (const candidate of candidates) {
    const reel = candidate.position % FIST_OF_DESTRUCTION_COLUMNS;
    const row = Math.floor(candidate.position / FIST_OF_DESTRUCTION_COLUMNS);
    const team: FistTeam = candidate.cell.symbol === "blue-fist" ? "blue" : "red";
    const expandedPositions = Array.from(
      { length: FIST_OF_DESTRUCTION_ROWS },
      (_, expandedRow) => expandedRow * FIST_OF_DESTRUCTION_COLUMNS + reel
    );
    const crossedPositions = expandedPositions
      .filter((position) => position !== candidate.position)
      .filter((position) => opposingSymbol(team, grid[position]?.symbol ?? "10"));
    const provisional: FistWildEvent = {
      team,
      position: candidate.position,
      reel,
      row,
      activated: true,
      expandedPositions,
      crossedPositions,
      collectedMultipliers: crossedPositions.map(() => multiplierFor(random)),
      reelMultiplier: 1
    };
    const withMultiplier: FistWildEvent = {
      ...provisional,
      reelMultiplier: provisional.collectedMultipliers.reduce((sum, value) => sum + value, 0) || 1
    };
    const without = evaluateFistWays(grid, active).reduce((sum, win) => sum + win.payout, 0);
    const withCandidate = evaluateFistWays(grid, [...active, withMultiplier]);
    const affected = withCandidate.some((win) =>
      win.positions.some((position) => expandedPositions.includes(position))
    );
    const withTotal = withCandidate.reduce((sum, win) => sum + win.payout, 0);
    active.push(affected && withTotal > without ? withMultiplier : { ...withMultiplier, activated: false });
  }
  return active;
}

function spinFor(random: FistRandomSource): FistSpin {
  const initialGrid = gridFor(random);
  const fistEvents = fistEventsFor(random, initialGrid);
  const activePositions = expandedMap(fistEvents);
  const finalGrid = initialGrid.map((cell, position) =>
    activePositions.has(position) ? { symbol: "wild" as const } : cell
  );
  const waysWins = evaluateFistWays(initialGrid, fistEvents);
  return {
    initialGrid,
    finalGrid,
    fistEvents,
    waysWins,
    scatterCount: initialGrid.filter((cell) => cell.symbol === "scatter").length,
    win: quantizeSlotMultiplier(waysWins.reduce((sum, win) => sum + win.payout, 0))
  };
}

function guaranteedFistGrid(random: FistRandomSource, count: number): readonly FistCell[] {
  const grid = [...gridFor(random)];
  const reels = Array.from({ length: FIST_OF_DESTRUCTION_COLUMNS }, (_, index) => index);
  for (let index = reels.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    [reels[index], reels[swap]] = [reels[swap] as number, reels[index] as number];
  }
  for (let index = 0; index < Math.min(count, reels.length); index += 1) {
    const reel = reels[index] ?? index;
    for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
      const position = row * FIST_OF_DESTRUCTION_COLUMNS + reel;
      if (grid[position]?.symbol === "blue-fist" || grid[position]?.symbol === "red-fist")
        grid[position] = { symbol: "10" };
    }
    const row = 1 + random.int(FIST_OF_DESTRUCTION_ROWS - 1);
    grid[row * FIST_OF_DESTRUCTION_COLUMNS + reel] = { symbol: index % 2 === 0 ? "blue-fist" : "red-fist" };
  }
  return grid;
}

function spinFromGrid(random: FistRandomSource, grid: readonly FistCell[]): FistSpin {
  const fistEvents = fistEventsFor(random, grid);
  const activePositions = expandedMap(fistEvents);
  const finalGrid = grid.map((cell, position) => (activePositions.has(position) ? { symbol: "wild" as const } : cell));
  const waysWins = evaluateFistWays(grid, fistEvents);
  return {
    initialGrid: grid,
    finalGrid,
    fistEvents,
    waysWins,
    scatterCount: grid.filter((cell) => cell.symbol === "scatter").length,
    win: quantizeSlotMultiplier(waysWins.reduce((sum, win) => sum + win.payout, 0))
  };
}

/** Clean-room deterministic demo model; weights remain pending RTP calibration. */
export function resolveFistOfDestruction(random: FistRandomSource, action = "spin") {
  if (action !== "spin") throw new Error("Invalid Fist of Destruction action");
  const baseSpin = spinFor(random);
  const bonusType = baseSpin.scatterCount >= 4 ? "ultimate-throwdown" : baseSpin.scatterCount >= 3 ? "throwdown" : null;
  let awardedSpins = bonusType ? 10 : 0;
  let victoryLevel = bonusType === "ultimate-throwdown" ? 4 : 3;
  const victoryPoints: Record<FistTeam, number> = { blue: 0, red: 0 };
  const bonusSpins: Array<Readonly<Record<string, unknown>>> = [];
  let bonusWin = 0;
  for (let spin = 0; spin < awardedSpins && spin < FIST_OF_DESTRUCTION_MAX_FREE_SPINS; spin += 1) {
    const resolved = spinFor(random);
    let epicDrop: FistSpin | null = null;
    for (const event of resolved.fistEvents.filter((candidate) => candidate.activated)) {
      victoryPoints[event.team] += Math.max(1, event.crossedPositions.length);
    }
    const winningTeam: FistTeam | null = victoryPoints.blue >= 3 ? "blue" : victoryPoints.red >= 3 ? "red" : null;
    if (winningTeam) {
      victoryPoints[winningTeam] -= 3;
      victoryLevel = Math.min(5, victoryLevel + 1);
      epicDrop = spinFromGrid(random, guaranteedFistGrid(random, victoryLevel));
    }
    const retriggeredSpins = resolved.scatterCount >= 3 ? 4 : resolved.scatterCount === 2 ? 2 : 0;
    awardedSpins = Math.min(FIST_OF_DESTRUCTION_MAX_FREE_SPINS, awardedSpins + retriggeredSpins);
    const spinWin = quantizeSlotMultiplier(resolved.win + (epicDrop?.win ?? 0));
    bonusWin = quantizeSlotMultiplier(bonusWin + spinWin);
    bonusSpins.push({
      spin: spin + 1,
      ...resolved,
      victoryPoints: { ...victoryPoints },
      victoryLevel,
      retriggeredSpins,
      epicDrop,
      win: spinWin
    });
    if (baseSpin.win + bonusWin >= FIST_OF_DESTRUCTION_MAX_WIN) break;
  }
  const finalMultiplier = quantizeSlotMultiplier(Math.min(FIST_OF_DESTRUCTION_MAX_WIN, baseSpin.win + bonusWin));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "fist-of-destruction",
      action,
      columns: FIST_OF_DESTRUCTION_COLUMNS,
      rows: FIST_OF_DESTRUCTION_ROWS,
      ways: FIST_OF_DESTRUCTION_WAYS,
      ...baseSpin,
      bonusTriggered: bonusType !== null,
      bonusType,
      bonus: {
        awardedSpins,
        playedSpins: bonusSpins.length,
        finalVictoryLevel: victoryLevel,
        finalVictoryPoints: victoryPoints,
        win: bonusWin,
        spins: bonusSpins
      },
      maxWinCap: FIST_OF_DESTRUCTION_MAX_WIN,
      rtpCalibrationPending: FIST_OF_DESTRUCTION_RTP_CALIBRATION_PENDING,
      finalMultiplier
    } as const
  };
}
