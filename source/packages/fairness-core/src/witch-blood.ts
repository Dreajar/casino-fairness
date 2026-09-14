import { quantizeSlotMultiplier, SLOT_MAX_SETTLED_MULTIPLIER } from "./constants.ts";

export const WITCH_BLOOD_SYMBOLS = [
  "rune",
  "potion",
  "lantern",
  "spellbook",
  "owl",
  "cat",
  "amulet",
  "blood-moon",
  "wild",
  "scatter"
] as const;

export type WitchBloodSymbol = (typeof WITCH_BLOOD_SYMBOLS)[number];

export interface WitchBloodRandom {
  int(maxExclusive: number): number;
  pick<T>(values: readonly T[]): T;
}

export interface WitchBloodCell {
  readonly id: number;
  readonly symbol: WitchBloodSymbol;
  readonly wildCharge: number;
  readonly spawned: boolean;
}

export interface WitchBloodBoard {
  readonly reelHeights: readonly number[];
  readonly main: readonly (readonly WitchBloodCell[])[];
  readonly top: readonly WitchBloodCell[];
  readonly ways: number;
}

export interface WitchBloodWin {
  readonly symbol: Exclude<WitchBloodSymbol, "wild" | "scatter">;
  readonly reelCount: number;
  readonly ways: number;
  readonly rate: number;
  readonly multiplier: number;
  readonly positionIds: readonly number[];
  readonly contributingWildIds: readonly number[];
}

export interface WitchBloodScatterWin {
  readonly count: number;
  readonly multiplier: number;
  readonly positionIds: readonly number[];
}

export interface WitchBloodWildEvent {
  readonly chargedIds: readonly number[];
  readonly explodedIds: readonly number[];
  readonly spawnedIds: readonly number[];
  readonly multiplierBoost: number;
}

export interface WitchBloodTumble {
  readonly index: number;
  readonly wins: readonly WitchBloodWin[];
  readonly removedIds: readonly number[];
  readonly refilledIds: readonly number[];
  readonly wildEvent: WitchBloodWildEvent;
  readonly winMultiplier: number;
  readonly appliedMultiplier: number;
  readonly accumulatedMultiplier: number;
  readonly featureMultiplierBefore: number;
  readonly featureMultiplierAfter: number;
  readonly after: WitchBloodBoard;
}

export interface WitchBloodSpin {
  readonly initialBoard: WitchBloodBoard;
  readonly evaluatedWins: readonly WitchBloodWin[];
  readonly scatterCount: number;
  readonly scatterWin?: WitchBloodScatterWin;
  readonly ways: number;
  readonly tumbles: readonly WitchBloodTumble[];
  readonly finalBoard: WitchBloodBoard;
  readonly winMultiplier: number;
  readonly featureMultiplierBefore: number;
  readonly featureMultiplierAfter: number;
}

export interface WitchBloodFreeSpin extends WitchBloodSpin {
  readonly spin: number;
  readonly remainingAfter: number;
  readonly retriggered: number;
}

export interface WitchBloodOutcome extends Readonly<Record<string, unknown>> {
  readonly kind: "witch-blood-megaways";
  readonly reelHeights: readonly number[];
  readonly topReel: readonly WitchBloodCell[];
  readonly initialGrid: readonly (readonly WitchBloodCell[])[];
  readonly initialBoard: WitchBloodBoard;
  readonly ways: number;
  readonly evaluatedWins: readonly WitchBloodWin[];
  readonly tumbles: readonly WitchBloodTumble[];
  readonly wildEvents: readonly WitchBloodWildEvent[];
  readonly scatterCount: number;
  readonly scatterWin?: WitchBloodScatterWin;
  readonly freeSpinsAwarded: number;
  readonly retriggers: number;
  readonly freeSpins: readonly WitchBloodFreeSpin[];
  readonly multiplierChanges: readonly number[];
  readonly finalBoard: WitchBloodBoard;
  readonly totalMultiplier: number;
  readonly maxMultiplier: 20;
  readonly mathModel: "clean-room-demo";
}

export interface WitchBloodGameOutcome {
  readonly multiplier: number;
  readonly outcome: WitchBloodOutcome;
}

const PAY_SYMBOLS = WITCH_BLOOD_SYMBOLS.filter(
  (symbol): symbol is Exclude<WitchBloodSymbol, "wild" | "scatter"> => symbol !== "wild" && symbol !== "scatter"
);

const PAYTABLE: Readonly<Record<Exclude<WitchBloodSymbol, "wild" | "scatter">, Readonly<Record<number, number>>>> = {
  rune: { 3: 0.003, 4: 0.006, 5: 0.012, 6: 0.024 },
  potion: { 3: 0.004, 4: 0.008, 5: 0.016, 6: 0.032 },
  lantern: { 3: 0.005, 4: 0.01, 5: 0.02, 6: 0.04 },
  spellbook: { 3: 0.007, 4: 0.014, 5: 0.028, 6: 0.056 },
  owl: { 3: 0.009, 4: 0.018, 5: 0.036, 6: 0.072 },
  cat: { 3: 0.012, 4: 0.024, 5: 0.048, 6: 0.096 },
  amulet: { 3: 0.016, 4: 0.032, 5: 0.064, 6: 0.128 },
  "blood-moon": { 3: 0.022, 4: 0.044, 5: 0.088, 6: 0.176 }
};

const PAY_MIN_REELS: Readonly<Record<Exclude<WitchBloodSymbol, "wild" | "scatter">, number>> = {
  rune: 6,
  potion: 6,
  lantern: 6,
  spellbook: 6,
  owl: 6,
  cat: 6,
  amulet: 6,
  "blood-moon": 6
};

const BASE_POOL: readonly WitchBloodSymbol[] = [
  "rune",
  "rune",
  "rune",
  "rune",
  "rune",
  "potion",
  "potion",
  "potion",
  "potion",
  "lantern",
  "lantern",
  "lantern",
  "spellbook",
  "spellbook",
  "spellbook",
  "owl",
  "owl",
  "cat",
  "cat",
  "amulet",
  "blood-moon"
];

const SCATTER_DENOMINATOR = 96;
const WILD_DENOMINATOR = 4_096;
export const WITCH_BLOOD_MAX_TUMBLES = 5;
export const WITCH_BLOOD_MAX_FREE_SPINS = 30;
export const WITCH_BLOOD_MAX_MULTIPLIER = SLOT_MAX_SETTLED_MULTIPLIER;
// A fixed paytable scale. It is intentionally independent of seed, balance,
// history, and feature state so the published model remains reproducible.
export const WITCH_BLOOD_PAYOUT_SCALE = 5.184;

interface IdState {
  value: number;
}

interface GravityRefill {
  readonly main: readonly (readonly WitchBloodCell[])[];
  readonly top: readonly (WitchBloodCell | undefined)[];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function cloneCell(cell: WitchBloodCell): WitchBloodCell {
  return { ...cell };
}

function cloneBoard(board: WitchBloodBoard): WitchBloodBoard {
  return {
    reelHeights: [...board.reelHeights],
    main: board.main.map((reel) => reel.map(cloneCell)),
    top: board.top.map(cloneCell),
    ways: board.ways
  };
}

function makeCell(
  random: WitchBloodRandom,
  ids: IdState,
  reel: number,
  options: { readonly top?: boolean; readonly symbol?: WitchBloodSymbol } = {}
): WitchBloodCell {
  const wildEligible = reel !== 0 || options.top === true;
  const symbol =
    options.symbol ??
    (random.int(SCATTER_DENOMINATOR) === 0
      ? "scatter"
      : wildEligible && random.int(WILD_DENOMINATOR) === 0
        ? "wild"
        : random.pick(BASE_POOL));
  const cell = { id: ids.value, symbol, wildCharge: 0, spawned: false } satisfies WitchBloodCell;
  ids.value += 1;
  return cell;
}

export function witchBloodWays(reelHeights: readonly number[]): number {
  if (
    reelHeights.length !== 6 ||
    reelHeights.some((height) => !Number.isSafeInteger(height) || height < 2 || height > 7)
  ) {
    throw new Error("Witch Blood requires six reel heights between 2 and 7");
  }
  return reelHeights.reduce((ways, height, reel) => ways * (height + (reel >= 1 && reel <= 4 ? 1 : 0)), 1);
}

export function witchBloodFreeSpins(scatterCount: number): number {
  if (scatterCount >= 6) return 30;
  if (scatterCount === 5) return 20;
  if (scatterCount === 4) return 15;
  if (scatterCount === 3) return 10;
  return 0;
}

export function witchBloodScatterMultiplier(scatterCount: number): number {
  if (scatterCount >= 6) return 5;
  if (scatterCount === 5) return 2;
  if (scatterCount === 4) return 1;
  if (scatterCount === 3) return 0.5;
  if (scatterCount === 2) return 0.1;
  return 0;
}

export function witchBloodExplosionBoost(explodingWilds: number): number {
  if (explodingWilds >= 3) return 4;
  if (explodingWilds === 2) return 2;
  if (explodingWilds === 1) return 1;
  return 0;
}

export function witchBloodRetrigger(scatterCount: number, alreadyScheduled: number): number {
  if (scatterCount < 3) return 0;
  return Math.max(0, Math.min(3, WITCH_BLOOD_MAX_FREE_SPINS - alreadyScheduled));
}

export function witchBloodNextFeatureMultiplier(current: number, explodingWilds: number): number {
  return current + 1 + witchBloodExplosionBoost(explodingWilds);
}

export function capWitchBloodMultiplier(multiplier: number): number {
  return Math.min(WITCH_BLOOD_MAX_MULTIPLIER, Math.max(0, round(multiplier)));
}

function boardReels(board: WitchBloodBoard): readonly (readonly WitchBloodCell[])[] {
  return board.main.map((reel, index) => {
    if (index < 1 || index > 4) return reel;
    const topCell = board.top[index - 1];
    return topCell ? [...reel, topCell] : reel;
  });
}

export function evaluateWitchBloodWaysWins(board: WitchBloodBoard): readonly WitchBloodWin[] {
  const reels = boardReels(board);
  const wins: WitchBloodWin[] = [];
  for (const symbol of PAY_SYMBOLS) {
    const matchesByReel: WitchBloodCell[][] = [];
    for (const reel of reels) {
      const matches = reel.filter((cell) => cell.symbol === symbol || cell.symbol === "wild");
      if (matches.length === 0) break;
      matchesByReel.push(matches);
    }
    if (matchesByReel.length < PAY_MIN_REELS[symbol]) continue;
    const reelCount = matchesByReel.length;
    const ways = matchesByReel.reduce((product, matches) => product * matches.length, 1);
    const rate = round((PAYTABLE[symbol][reelCount] ?? 0) * WITCH_BLOOD_PAYOUT_SCALE);
    const positions = matchesByReel.flat();
    wins.push({
      symbol,
      reelCount,
      ways,
      rate,
      multiplier: round(ways * rate),
      positionIds: [...new Set(positions.map((cell) => cell.id))],
      contributingWildIds: [...new Set(positions.filter((cell) => cell.symbol === "wild").map((cell) => cell.id))]
    });
  }
  return wins;
}

export function chargeWitchBloodWilds(
  board: WitchBloodBoard,
  contributingWildIds: readonly number[]
): { readonly board: WitchBloodBoard; readonly explodedIds: readonly number[] } {
  const contributing = new Set(contributingWildIds);
  const explodedIds: number[] = [];
  const charge = (cell: WitchBloodCell): WitchBloodCell => {
    if (cell.symbol !== "wild" || !contributing.has(cell.id)) return cloneCell(cell);
    const wildCharge = Math.min(3, cell.wildCharge + 1);
    if (wildCharge === 3) explodedIds.push(cell.id);
    return { ...cell, wildCharge };
  };
  return {
    board: {
      reelHeights: [...board.reelHeights],
      main: board.main.map((reel) => reel.map(charge)),
      top: board.top.map(charge),
      ways: board.ways
    },
    explodedIds: [...new Set(explodedIds)]
  };
}

export function applyWitchBloodGravity(
  board: WitchBloodBoard,
  removedIds: readonly number[],
  replacements: GravityRefill
): WitchBloodBoard {
  const removed = new Set(removedIds);
  const main = board.main.map((reel, index) => {
    const survivors = reel.filter((cell) => !removed.has(cell.id)).map(cloneCell);
    const refill = replacements.main[index]?.map(cloneCell) ?? [];
    if (survivors.length + refill.length !== reel.length) {
      throw new Error(`Witch Blood reel ${index + 1} received an invalid refill`);
    }
    return [...refill, ...survivors];
  });
  const top = board.top.map((cell, index) => {
    if (!removed.has(cell.id)) return cloneCell(cell);
    const replacement = replacements.top[index];
    if (!replacement) throw new Error(`Witch Blood top reel ${index + 1} is missing a refill`);
    return cloneCell(replacement);
  });
  return { reelHeights: [...board.reelHeights], main, top, ways: board.ways };
}

export function spawnWitchBloodWilds(board: WitchBloodBoard, targetIds: readonly number[]): WitchBloodBoard {
  const targets = new Set(targetIds);
  const spawn = (cell: WitchBloodCell): WitchBloodCell =>
    targets.has(cell.id) ? { ...cell, symbol: "wild", wildCharge: 0, spawned: true } : cloneCell(cell);
  return {
    reelHeights: [...board.reelHeights],
    main: board.main.map((reel, index) => reel.map((cell) => (index === 0 ? cloneCell(cell) : spawn(cell)))),
    top: board.top.map(spawn),
    ways: board.ways
  };
}

function createBoard(random: WitchBloodRandom, ids: IdState): WitchBloodBoard {
  const reelHeights = Array.from({ length: 6 }, () => 2 + random.int(6));
  const main = reelHeights.map((height, reel) =>
    Array.from({ length: height ?? 2 }, () => makeCell(random, ids, reel))
  );
  const top = Array.from({ length: 4 }, (_, index) => makeCell(random, ids, index + 1, { top: true }));
  return { reelHeights, main, top, ways: witchBloodWays(reelHeights) };
}

function scatterCount(board: WitchBloodBoard): number {
  return boardReels(board)
    .flat()
    .filter((cell) => cell.symbol === "scatter").length;
}

function scatterWin(board: WitchBloodBoard, featureMultiplier: number): WitchBloodScatterWin | undefined {
  const positions = boardReels(board)
    .flat()
    .filter((cell) => cell.symbol === "scatter");
  const multiplier = round(witchBloodScatterMultiplier(positions.length) * featureMultiplier);
  return multiplier > 0
    ? { count: positions.length, multiplier, positionIds: positions.map((cell) => cell.id) }
    : undefined;
}

function refillBoard(
  board: WitchBloodBoard,
  removedIds: readonly number[],
  random: WitchBloodRandom,
  ids: IdState
): { readonly board: WitchBloodBoard; readonly refilledIds: readonly number[] } {
  const removed = new Set(removedIds);
  const refilledIds: number[] = [];
  const main = board.main.map((reel, index) => {
    const count = reel.filter((cell) => removed.has(cell.id)).length;
    return Array.from({ length: count }, () => {
      const cell = makeCell(random, ids, index);
      refilledIds.push(cell.id);
      return cell;
    });
  });
  const top = board.top.map((cell, index) => {
    if (!removed.has(cell.id)) return undefined;
    const replacement = makeCell(random, ids, index + 1, { top: true });
    refilledIds.push(replacement.id);
    return replacement;
  });
  return { board: applyWitchBloodGravity(board, removedIds, { main, top }), refilledIds };
}

export function spawnWitchBloodAfterExplosions(
  board: WitchBloodBoard,
  explosions: number,
  random: WitchBloodRandom
): { readonly board: WitchBloodBoard; readonly spawnedIds: readonly number[] } {
  if (explosions === 0) return { board: cloneBoard(board), spawnedIds: [] };
  const eligible = [
    ...board.main
      .slice(1)
      .flat()
      .filter((cell) => cell.symbol !== "wild"),
    ...board.top.filter((cell) => cell.symbol !== "wild")
  ];
  const requested = Array.from({ length: explosions }, () => 1 + random.int(3)).reduce((sum, count) => sum + count, 0);
  const spawnedIds: number[] = [];
  while (spawnedIds.length < Math.min(requested, eligible.length)) {
    const [cell] = eligible.splice(random.int(eligible.length), 1);
    if (cell) spawnedIds.push(cell.id);
  }
  return { board: spawnWitchBloodWilds(board, spawnedIds), spawnedIds };
}

function simulateSpin(
  random: WitchBloodRandom,
  ids: IdState,
  featureMultiplierBefore: number,
  feature: boolean
): WitchBloodSpin {
  const initialBoard = createBoard(random, ids);
  let board = cloneBoard(initialBoard);
  let wins = evaluateWitchBloodWaysWins(board);
  const evaluatedWins = wins;
  const evaluatedScatterWin = scatterWin(initialBoard, featureMultiplierBefore);
  const tumbles: WitchBloodTumble[] = [];
  let accumulatedMultiplier = evaluatedScatterWin?.multiplier ?? 0;
  let featureMultiplier = featureMultiplierBefore;

  for (let index = 0; wins.length > 0 && index < WITCH_BLOOD_MAX_TUMBLES; index += 1) {
    const winMultiplier = round(wins.reduce((sum, win) => sum + win.multiplier, 0));
    const appliedMultiplier = round(winMultiplier * featureMultiplier);
    accumulatedMultiplier = capWitchBloodMultiplier(accumulatedMultiplier + appliedMultiplier);
    const chargedIds = [...new Set(wins.flatMap((win) => win.contributingWildIds))];
    const charged = chargeWitchBloodWilds(board, chargedIds);
    const regularWinningIds = wins.flatMap((win) => win.positionIds.filter((id) => !chargedIds.includes(id)));
    const removedIds = [...new Set([...regularWinningIds, ...charged.explodedIds])];
    const refilled = refillBoard(charged.board, removedIds, random, ids);
    const spawned = spawnWitchBloodAfterExplosions(refilled.board, charged.explodedIds.length, random);
    const multiplierBoost = feature ? witchBloodExplosionBoost(charged.explodedIds.length) : 0;
    const featureMultiplierAfter = feature
      ? witchBloodNextFeatureMultiplier(featureMultiplier, charged.explodedIds.length)
      : featureMultiplier;
    const wildEvent: WitchBloodWildEvent = {
      chargedIds,
      explodedIds: charged.explodedIds,
      spawnedIds: spawned.spawnedIds,
      multiplierBoost
    };
    tumbles.push({
      index,
      wins,
      removedIds,
      refilledIds: refilled.refilledIds,
      wildEvent,
      winMultiplier,
      appliedMultiplier,
      accumulatedMultiplier,
      featureMultiplierBefore: featureMultiplier,
      featureMultiplierAfter,
      after: cloneBoard(spawned.board)
    });
    featureMultiplier = featureMultiplierAfter;
    board = spawned.board;
    wins = evaluateWitchBloodWaysWins(board);
  }

  return {
    initialBoard: cloneBoard(initialBoard),
    evaluatedWins,
    scatterCount: scatterCount(initialBoard),
    ...(evaluatedScatterWin ? { scatterWin: evaluatedScatterWin } : {}),
    ways: initialBoard.ways,
    tumbles,
    finalBoard: cloneBoard(board),
    winMultiplier: capWitchBloodMultiplier(accumulatedMultiplier),
    featureMultiplierBefore,
    featureMultiplierAfter: featureMultiplier
  };
}

export function createWitchBloodOutcome(random: WitchBloodRandom): WitchBloodGameOutcome {
  const ids = { value: 1 };
  const base = simulateSpin(random, ids, 1, false);
  const freeSpinsAwarded = witchBloodFreeSpins(base.scatterCount);
  const freeSpins: WitchBloodFreeSpin[] = [];
  let scheduled = freeSpinsAwarded;
  let featureMultiplier = 1;
  let freeSpinMultiplier = 0;
  let retriggers = 0;

  for (let spin = 1; spin <= scheduled && spin <= WITCH_BLOOD_MAX_FREE_SPINS; spin += 1) {
    const result = simulateSpin(random, ids, featureMultiplier, true);
    featureMultiplier = result.featureMultiplierAfter;
    freeSpinMultiplier = capWitchBloodMultiplier(freeSpinMultiplier + result.winMultiplier);
    const retriggered = retriggers === 0 ? witchBloodRetrigger(result.scatterCount, scheduled) : 0;
    scheduled += retriggered;
    retriggers += retriggered;
    freeSpins.push({ ...result, spin, remainingAfter: Math.max(0, scheduled - spin), retriggered });
  }

  const multiplier = quantizeSlotMultiplier(capWitchBloodMultiplier(base.winMultiplier + freeSpinMultiplier));
  const wildEvents = [
    ...base.tumbles.map((tumble) => tumble.wildEvent),
    ...freeSpins.flatMap((freeSpin) => freeSpin.tumbles.map((tumble) => tumble.wildEvent))
  ];
  const multiplierChanges = freeSpins.flatMap((freeSpin) =>
    freeSpin.tumbles.map((tumble) => tumble.featureMultiplierAfter)
  );
  const outcome: WitchBloodOutcome = {
    kind: "witch-blood-megaways",
    reelHeights: base.initialBoard.reelHeights,
    topReel: base.initialBoard.top,
    initialGrid: base.initialBoard.main,
    initialBoard: base.initialBoard,
    ways: base.ways,
    evaluatedWins: base.evaluatedWins,
    tumbles: base.tumbles,
    wildEvents,
    scatterCount: base.scatterCount,
    ...(base.scatterWin ? { scatterWin: base.scatterWin } : {}),
    freeSpinsAwarded,
    retriggers,
    freeSpins,
    multiplierChanges,
    finalBoard: freeSpins.at(-1)?.finalBoard ?? base.finalBoard,
    totalMultiplier: multiplier,
    maxMultiplier: WITCH_BLOOD_MAX_MULTIPLIER,
    mathModel: "clean-room-demo"
  };
  return { multiplier, outcome };
}
