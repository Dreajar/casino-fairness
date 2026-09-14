export const COLUMNS = 5;
export const ROWS = 3;
export const CELL_COUNT = COLUMNS * ROWS;
export const MIN_CLUSTER = 3;
export const MAX_CLUSTER = 10;
export const MAX_WIN_MULTIPLIER = 5000;
export const BASE_BETS_CENTS = Object.freeze([10, 50, 100, 200, 500, 1000]);

export const REGULAR_SYMBOLS = Object.freeze([
  "parchment",
  "ship",
  "compass",
  "gear",
  "microphone",
  "capsule",
  "satellite"
]);

export const SYMBOL_LABELS = Object.freeze({
  parchment: "Founding parchment",
  ship: "Dawn voyager",
  compass: "Navigator compass",
  gear: "Industrial gear",
  microphone: "Broadcast microphone",
  capsule: "Lunar capsule",
  satellite: "Aurora satellite",
  wild: "Torch wild",
  beacon: "Aurora beacon"
});

const SYMBOL_WEIGHTS = Object.freeze({
  parchment: 22,
  ship: 20,
  compass: 18,
  gear: 16,
  microphone: 14,
  capsule: 11,
  satellite: 8,
  wild: 3,
  beacon: 1.8
});

const SPLITTABLE = new Set(["parchment", "ship", "compass", "gear", "microphone", "beacon"]);

// Values are basis points of the ticket cost: 1500 means 0.15x.
export const PAYTABLE_BPS = Object.freeze({
  parchment: Object.freeze([900, 1500, 2400, 3900, 6000, 9000, 12_000, 18_000]),
  ship: Object.freeze([1080, 1800, 3000, 4800, 7200, 10_800, 15_000, 22_800]),
  compass: Object.freeze([1320, 2280, 3600, 5700, 9000, 13_200, 19_200, 28_800]),
  gear: Object.freeze([1680, 2700, 4500, 7200, 10_800, 16_800, 25_200, 39_000]),
  microphone: Object.freeze([2100, 3600, 5700, 9000, 14_400, 22_800, 36_000, 54_000]),
  capsule: Object.freeze([2700, 4500, 7200, 12_000, 19_200, 30_000, 48_000, 75_000]),
  satellite: Object.freeze([3600, 6000, 10_500, 16_800, 27_000, 45_000, 72_000, 108_000])
});

function assertRng(rng) {
  if (typeof rng !== "function") throw new TypeError("A random-number source is required");
}

function boundedFloat(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) throw new TypeError("Random source returned a non-finite value");
  return Math.min(0.999999999999, Math.max(0, value));
}

function weightedPick(entries, rng) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = boundedFloat(rng) * total;
  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return value;
  }
  return entries.at(-1)[0];
}

export function createCell(type, count = 1) {
  return { type, count: Math.max(1, Math.min(2, Math.trunc(count) || 1)) };
}

export function cloneGrid(grid) {
  return grid.map((cell) => ({ ...cell }));
}

export function createSymbolSource(rng, { mode = "base", weights = SYMBOL_WEIGHTS } = {}) {
  assertRng(rng);
  const entries = Object.entries(weights).filter(([type]) => mode === "base" || type !== "beacon");
  return function nextCell() {
    const type = weightedPick(entries, rng);
    const splitChance = type === "beacon" ? 0.075 : 0.14;
    const count = SPLITTABLE.has(type) && boundedFloat(rng) < splitChance ? 2 : 1;
    return createCell(type, count);
  };
}

export function generateGrid(nextCell) {
  if (typeof nextCell !== "function") throw new TypeError("A symbol source is required");
  return Array.from({ length: CELL_COUNT }, nextCell);
}

function neighbors(index) {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  const adjacent = [];
  if (row > 0) adjacent.push(index - COLUMNS);
  if (row < ROWS - 1) adjacent.push(index + COLUMNS);
  if (column > 0) adjacent.push(index - 1);
  if (column < COLUMNS - 1) adjacent.push(index + 1);
  return adjacent;
}

function clusterOccurrences(grid, positions, symbol) {
  return positions.reduce((sum, index) => {
    const cell = grid[index];
    return sum + (cell.type === "wild" ? 1 : cell.type === symbol ? cell.count : 0);
  }, 0);
}

export function findClusters(grid) {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) {
    throw new RangeError(`Grid must contain exactly ${CELL_COUNT} cells`);
  }

  return REGULAR_SYMBOLS.flatMap((symbol) => {
    const visited = new Set();
    const clusters = [];
    for (let start = 0; start < CELL_COUNT; start += 1) {
      if (visited.has(start) || ![symbol, "wild"].includes(grid[start].type)) continue;
      const queue = [start];
      const positions = [];
      visited.add(start);
      while (queue.length) {
        const current = queue.shift();
        positions.push(current);
        for (const adjacent of neighbors(current)) {
          if (visited.has(adjacent) || ![symbol, "wild"].includes(grid[adjacent].type)) continue;
          visited.add(adjacent);
          queue.push(adjacent);
        }
      }
      if (!positions.some((index) => grid[index].type === symbol)) continue;
      const count = clusterOccurrences(grid, positions, symbol);
      if (count < MIN_CLUSTER) continue;
      const paidCount = Math.min(MAX_CLUSTER, count);
      clusters.push({
        symbol,
        count,
        positions: positions.sort((a, b) => a - b),
        rateBps: PAYTABLE_BPS[symbol][paidCount - MIN_CLUSTER]
      });
    }
    return clusters;
  });
}

export function evaluateClusters(grid, betCents, multiplier = 1) {
  if (!Number.isInteger(betCents) || betCents <= 0) throw new RangeError("Bet must be positive cents");
  const clusters = findClusters(grid).map((cluster) => ({
    ...cluster,
    baseWinCents: Math.round((betCents * cluster.rateBps) / 10_000)
  }));
  const rawWinCents = clusters.reduce((sum, cluster) => sum + cluster.baseWinCents, 0);
  return {
    clusters,
    rawWinCents,
    winCents: rawWinCents * multiplier
  };
}

export function collapseGrid(grid, removedPositions, nextCell) {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) {
    throw new RangeError(`Grid must contain exactly ${CELL_COUNT} cells`);
  }
  if (typeof nextCell !== "function") throw new TypeError("A symbol source is required");
  const removed = new Set(removedPositions);
  const nextGrid = Array(CELL_COUNT);
  const movements = Array(CELL_COUNT).fill(0);

  for (let column = 0; column < COLUMNS; column += 1) {
    const survivors = [];
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const index = (row * COLUMNS) + column;
      if (!removed.has(index)) survivors.push({ cell: grid[index], row });
    }
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const index = (row * COLUMNS) + column;
      const survivor = survivors.shift();
      if (survivor) {
        nextGrid[index] = { ...survivor.cell };
        movements[index] = Math.max(0, row - survivor.row);
      } else {
        nextGrid[index] = nextCell();
        movements[index] = row + 1;
      }
    }
  }
  return { grid: nextGrid, movements };
}

export function countBeacons(grid) {
  return grid.reduce((sum, cell) => sum + (cell.type === "beacon" ? cell.count : 0), 0);
}

export function featureTurns(beaconCount) {
  if (beaconCount >= 6) return 0;
  if (beaconCount === 5) return 10;
  if (beaconCount === 4) return 5;
  return 0;
}

function forceOpeningCluster(grid) {
  const forced = cloneGrid(grid);
  const start = (ROWS - 1) * COLUMNS;
  for (let offset = 0; offset < 3; offset += 1) forced[start + offset] = createCell("parchment");
  return forced;
}

export function playGrid({
  rng,
  betCents,
  mode = "base",
  turnMultiplier = 1,
  initialGrid = null,
  forceWin = false,
  maxCascades = 12
}) {
  assertRng(rng);
  if (!BASE_BETS_CENTS.includes(betCents)) throw new RangeError("Unsupported ticket cost");
  if (!['base', 'bonus'].includes(mode)) throw new RangeError("Mode must be base or bonus");
  const nextCell = createSymbolSource(rng, { mode });
  let grid = initialGrid ? cloneGrid(initialGrid) : generateGrid(nextCell);
  if (forceWin && findClusters(grid).length === 0) grid = forceOpeningCluster(grid);
  const openingGrid = cloneGrid(grid);
  const cascades = [];
  let totalWinCents = 0;

  for (let cascadeIndex = 0; cascadeIndex < maxCascades; cascadeIndex += 1) {
    const multiplier = mode === "base"
      ? Math.min(5, cascadeIndex + 1)
      : Math.min(15, turnMultiplier + cascadeIndex);
    const evaluation = evaluateClusters(grid, betCents, multiplier);
    if (!evaluation.clusters.length) break;
    const removedPositions = [...new Set(evaluation.clusters.flatMap((cluster) => cluster.positions))]
      .sort((a, b) => a - b);
    const before = cloneGrid(grid);
    const collapsed = collapseGrid(grid, removedPositions, nextCell);
    grid = collapsed.grid;
    totalWinCents += evaluation.winCents;
    cascades.push({
      index: cascadeIndex,
      grid: before,
      clusters: evaluation.clusters,
      multiplier,
      rawWinCents: evaluation.rawWinCents,
      winCents: evaluation.winCents,
      removedPositions,
      nextGrid: cloneGrid(grid),
      movements: collapsed.movements
    });
  }

  return {
    mode,
    turnMultiplier,
    initialGrid: openingGrid,
    cascades,
    finalGrid: cloneGrid(grid),
    beaconCount: mode === "base" ? countBeacons(grid) : 0,
    totalWinCents
  };
}

export function buildTicket({ rng, betCents, forceBonusTurns = 0 }) {
  assertRng(rng);
  if (!BASE_BETS_CENTS.includes(betCents)) throw new RangeError("Unsupported ticket cost");
  const base = playGrid({ rng, betCents, mode: "base", forceWin: forceBonusTurns > 0 });
  if (forceBonusTurns > 0) {
    const previewBeacons = forceBonusTurns >= 10 ? 5 : 4;
    base.finalGrid = base.finalGrid.map((cell) => cell.type === "beacon" ? createCell("ship") : cell);
    for (let index = 0; index < previewBeacons; index += 1) {
      base.finalGrid[index] = createCell("beacon");
    }
  }
  const beaconCount = forceBonusTurns > 0 ? (forceBonusTurns >= 10 ? 5 : 4) : base.beaconCount;
  const topPrize = forceBonusTurns === 0 && beaconCount >= 6;
  const turnsAwarded = forceBonusTurns || featureTurns(beaconCount);
  const bonusTurns = [];
  for (let turnIndex = 0; turnIndex < turnsAwarded; turnIndex += 1) {
    bonusTurns.push(playGrid({
      rng,
      betCents,
      mode: "bonus",
      turnMultiplier: turnIndex + 1,
      forceWin: turnIndex === Math.min(2, turnsAwarded - 1)
    }));
  }

  const earnedWinCents = base.totalWinCents + bonusTurns.reduce((sum, turn) => sum + turn.totalWinCents, 0);
  const topPrizeCents = topPrize ? betCents * MAX_WIN_MULTIPLIER : 0;
  const uncappedWinCents = Math.max(earnedWinCents, topPrizeCents);
  const totalWinCents = Math.min(uncappedWinCents, betCents * MAX_WIN_MULTIPLIER);
  return {
    betCents,
    base,
    beaconCount,
    turnsAwarded,
    bonusTurns,
    topPrize,
    earnedWinCents,
    uncappedWinCents,
    totalWinCents,
    maxWinReached: totalWinCents === betCents * MAX_WIN_MULTIPLIER
  };
}

export function createSeededSource(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return function nextFloat() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
