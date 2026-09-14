import type { EnabledGameId } from "@replicate/game-registry";
import { quantizeSlotMultiplier, SLOT_MAX_SETTLED_MULTIPLIER } from "./constants.ts";
import { buildGravityCascade, type GravityMovement } from "./gravity.ts";

export type FairSlotGameId = Extract<
  EnabledGameId,
  "midnight-train-heist" | "midas-feast" | "sands-of-sekhmet" | "poseidons-abyssal-crown" | "sixsixsix"
>;

interface SlotRandom {
  int(maxExclusive: number): number;
}

export interface SlotDefinition {
  readonly columns: number;
  readonly rows: number;
  readonly reelStrips: readonly (readonly string[])[];
  readonly payingSymbols: readonly string[];
  readonly paytable: Readonly<Record<number, number>>;
  readonly symbolPaytables?: Readonly<Record<string, Readonly<Record<number, number>>>>;
  readonly bonusSymbol: string;
  readonly bonusThreshold: number;
  readonly bonusPaytable: Readonly<Record<number, number>>;
  readonly calibration: number;
  readonly maxCascades: number;
  readonly independentCells?: boolean;
}

interface SlotCascade {
  readonly cascadeIndex: number;
  readonly removed: readonly number[];
  readonly reels: readonly string[];
  readonly movements: readonly GravityMovement<string>[];
  readonly newPositions: readonly number[];
  readonly winningSymbols: readonly string[];
  readonly wins: readonly {
    readonly symbol: string;
    readonly positions: readonly number[];
    readonly count: number;
    readonly basePay: number;
    readonly rewardMultiplier: number;
  }[];
  readonly displayMultiplier: number;
  readonly featureCharge: number;
  readonly goldenPositions: readonly number[];
  readonly multiplier: number;
}

interface SlotResult {
  readonly multiplier: number;
  readonly outcome: Readonly<Record<string, unknown>>;
}

const rotate = (strip: readonly string[], offset: number): readonly string[] =>
  strip.map((_symbol, index) => strip[(index + offset) % strip.length] ?? strip[0] ?? "wild");

const strips = (base: readonly string[], columns: number, stride: number): readonly (readonly string[])[] =>
  Array.from({ length: columns }, (_unused, column) => rotate(base, column * stride));

interface SlotSymbolWeight {
  readonly symbol: string;
  readonly weight: number;
}

const weightedStrip = (weights: readonly SlotSymbolWeight[]): readonly string[] => {
  const maximumWeight = Math.max(...weights.map(({ weight }) => weight));
  return Array.from({ length: maximumWeight }, (_unused, pass) =>
    weights.flatMap(({ symbol, weight }) => (pass < weight ? [symbol] : []))
  ).flat();
};

export const FAIR_SLOT_SYMBOL_WEIGHTS: Readonly<Record<FairSlotGameId, readonly SlotSymbolWeight[]>> = {
  "midnight-train-heist": [
    { symbol: "wheel", weight: 6 },
    { symbol: "skull", weight: 4 },
    { symbol: "hat", weight: 5 },
    { symbol: "guns", weight: 4 },
    { symbol: "badge", weight: 4 },
    { symbol: "wild", weight: 3 },
    { symbol: "fs", weight: 1 },
    { symbol: "vs", weight: 4 },
    { symbol: "outlaw", weight: 4 },
    { symbol: "A", weight: 8 },
    { symbol: "K", weight: 8 },
    { symbol: "Q", weight: 7 },
    { symbol: "10", weight: 7 }
  ],
  "midas-feast": [
    { symbol: "midas", weight: 1 },
    { symbol: "grapes", weight: 8 },
    { symbol: "amphora", weight: 8 },
    { symbol: "coin", weight: 8 },
    { symbol: "laurel", weight: 6 },
    { symbol: "feast", weight: 5 },
    { symbol: "goblet", weight: 7 },
    { symbol: "pomegranate", weight: 7 },
    { symbol: "honey", weight: 7 },
    { symbol: "bread", weight: 7 },
    { symbol: "olives", weight: 7 },
    { symbol: "wild", weight: 4 }
  ],
  "sands-of-sekhmet": [
    { symbol: "lapis", weight: 7 },
    { symbol: "emerald", weight: 7 },
    { symbol: "carnelian", weight: 6 },
    { symbol: "lotus", weight: 7 },
    { symbol: "scarab", weight: 4 },
    { symbol: "eye", weight: 4 },
    { symbol: "lioness", weight: 4 },
    { symbol: "regalia", weight: 4 },
    { symbol: "cobra", weight: 4 },
    { symbol: "wild", weight: 3 },
    { symbol: "scatter", weight: 1 },
    { symbol: "sun", weight: 5 },
    { symbol: "moon", weight: 4 }
  ],
  "poseidons-abyssal-crown": [
    { symbol: "blue", weight: 8 },
    { symbol: "red", weight: 8 },
    { symbol: "purple", weight: 8 },
    { symbol: "green", weight: 8 },
    { symbol: "yellow", weight: 8 },
    { symbol: "ring", weight: 4 },
    { symbol: "cup", weight: 4 },
    { symbol: "hourglass", weight: 4 },
    { symbol: "crown", weight: 4 },
    { symbol: "scatter", weight: 1 },
    { symbol: "multiplier", weight: 3 }
  ],
  sixsixsix: [
    { symbol: "ember", weight: 11 },
    { symbol: "bell", weight: 10 },
    { symbol: "chalice", weight: 9 },
    { symbol: "serpent", weight: 8 },
    { symbol: "goat", weight: 7 },
    { symbol: "devil", weight: 6 },
    { symbol: "wild", weight: 3 },
    { symbol: "six", weight: 2 }
  ]
};

const MIDNIGHT_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["midnight-train-heist"]);
const MIDAS_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["midas-feast"]);
const SANDS_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["sands-of-sekhmet"]);
const POSEIDON_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["poseidons-abyssal-crown"]);
const SIXSIXSIX_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS.sixsixsix);

const PAYTABLE_25: Readonly<Record<number, number>> = {
  5: 0.4,
  6: 2,
  7: 4,
  8: 8,
  9: 40,
  10: 60,
  11: 80,
  12: 200,
  13: 400,
  14: 800,
  15: 1_000,
  16: 1_000,
  17: 1_000,
  18: 1_000,
  19: 1_000,
  20: 1_000,
  21: 1_000,
  22: 1_000,
  23: 1_000,
  24: 1_000,
  25: 1_000
};

const SANDS_PAYTABLE: Readonly<Record<number, number>> = {
  6: 0.65,
  7: 2.6,
  8: 6.5,
  9: 16.25,
  10: 39,
  11: 78,
  12: 162.5,
  13: 325,
  14: 650,
  15: 1_000,
  16: 1_000,
  17: 1_000,
  18: 1_000,
  19: 1_000,
  20: 1_000,
  21: 1_000,
  22: 1_000,
  23: 1_000,
  24: 1_000,
  25: 1_000,
  26: 1_000,
  27: 1_000,
  28: 1_000,
  29: 1_000,
  30: 1_000
};

const POSEIDON_PAYTABLE: Readonly<Record<number, number>> = {
  8: 2.2,
  9: 5.5,
  10: 13.2,
  11: 40,
  12: 80,
  13: 110,
  14: 220,
  15: 440,
  16: 880,
  17: 1_000,
  18: 1_000,
  19: 1_000,
  20: 1_000,
  21: 1_000,
  22: 1_000,
  23: 1_000,
  24: 1_000,
  25: 1_000,
  26: 1_000,
  27: 1_000,
  28: 1_000,
  29: 1_000,
  30: 1_000
};

const MIDAS_PAYTABLE_36: Readonly<Record<number, number>> = {
  ...POSEIDON_PAYTABLE,
  31: 1_000,
  32: 1_000,
  33: 1_000,
  34: 1_000,
  35: 1_000,
  36: 1_000
};

const scaledPaytable = (paytable: Readonly<Record<number, number>>, factor: number): Readonly<Record<number, number>> =>
  Object.fromEntries(Object.entries(paytable).map(([count, pay]) => [count, Math.round(pay * factor * 100) / 100]));

const MIDAS_SYMBOL_PAYTABLES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  goblet: scaledPaytable(MIDAS_PAYTABLE_36, 0.9),
  pomegranate: scaledPaytable(MIDAS_PAYTABLE_36, 0.7),
  honey: scaledPaytable(MIDAS_PAYTABLE_36, 0.75),
  bread: scaledPaytable(MIDAS_PAYTABLE_36, 0.6),
  olives: scaledPaytable(MIDAS_PAYTABLE_36, 0.7),
  grapes: scaledPaytable(MIDAS_PAYTABLE_36, 0.65),
  amphora: scaledPaytable(MIDAS_PAYTABLE_36, 0.8),
  coin: MIDAS_PAYTABLE_36,
  laurel: scaledPaytable(MIDAS_PAYTABLE_36, 1.25),
  feast: scaledPaytable(MIDAS_PAYTABLE_36, 1.6),
  wild: scaledPaytable(MIDAS_PAYTABLE_36, 2.4)
};

const sharedBonusPaytable: Readonly<Record<number, number>> = { 3: 1, 4: 2, 5: 4, 6: 7, 7: 11, 8: 16 };

export const FAIR_SLOT_DEFINITIONS: Readonly<Record<FairSlotGameId, SlotDefinition>> = {
  "midnight-train-heist": {
    columns: 5,
    rows: 5,
    reelStrips: strips(MIDNIGHT_BASE_STRIP, 5, 11),
    payingSymbols: ["wheel", "skull", "hat", "guns", "badge", "wild", "vs", "outlaw", "A", "K", "Q", "10"],
    paytable: PAYTABLE_25,
    bonusSymbol: "fs",
    bonusThreshold: 3,
    bonusPaytable: sharedBonusPaytable,
    calibration: 1.1677079235994345,
    maxCascades: 4
  },
  "midas-feast": {
    columns: 6,
    rows: 6,
    reelStrips: strips(MIDAS_BASE_STRIP, 6, 7),
    payingSymbols: ["grapes", "amphora", "coin", "laurel", "feast", "wild", "goblet", "pomegranate", "honey", "bread", "olives"],
    paytable: MIDAS_PAYTABLE_36,
    symbolPaytables: MIDAS_SYMBOL_PAYTABLES,
    bonusSymbol: "midas",
    bonusThreshold: 3,
    bonusPaytable: sharedBonusPaytable,
    calibration: 1.258,
    independentCells: true,
    maxCascades: 4
  },
  "sands-of-sekhmet": {
    columns: 6,
    rows: 5,
    reelStrips: strips(SANDS_BASE_STRIP, 6, 13),
    payingSymbols: [
      "lapis",
      "emerald",
      "carnelian",
      "lotus",
      "scarab",
      "eye",
      "lioness",
      "regalia",
      "cobra",
      "wild",
      "sun",
      "moon"
    ],
    paytable: SANDS_PAYTABLE,
    bonusSymbol: "scatter",
    bonusThreshold: 4,
    bonusPaytable: sharedBonusPaytable,
    calibration: 1.1127530911018986,
    maxCascades: 4
  },
  "poseidons-abyssal-crown": {
    columns: 6,
    rows: 5,
    reelStrips: strips(POSEIDON_BASE_STRIP, 6, 17),
    payingSymbols: ["blue", "red", "purple", "green", "yellow", "ring", "cup", "hourglass", "crown", "multiplier"],
    paytable: POSEIDON_PAYTABLE,
    bonusSymbol: "scatter",
    bonusThreshold: 4,
    bonusPaytable: sharedBonusPaytable,
    calibration: 0.7610840316013392,
    maxCascades: 4,
    independentCells: true
  },
  sixsixsix: {
    columns: 5,
    rows: 4,
    reelStrips: strips(SIXSIXSIX_BASE_STRIP, 5, 7),
    payingSymbols: ["ember", "bell", "chalice", "serpent", "goat", "devil", "wild"],
    paytable: POSEIDON_PAYTABLE,
    bonusSymbol: "six",
    bonusThreshold: 3,
    bonusPaytable: sharedBonusPaytable,
    calibration: 0.72,
    maxCascades: 3,
    independentCells: true
  }
};

const payoutAt = (paytable: Readonly<Record<number, number>>, count: number): number => paytable[count] ?? 0;
const SIXSIXSIX_WHEEL_AWARDS = [2, 5, 10, 20, 250, 4, 2, 100] as const;

export function sixSixSixWheelMultiplier(reels: readonly string[], cascadeIndex: number): number {
  const wilds = reels.filter((symbol) => symbol === "wild").length;
  if (wilds < 3) return 1;
  return SIXSIXSIX_WHEEL_AWARDS[(wilds + cascadeIndex) % SIXSIXSIX_WHEEL_AWARDS.length] ?? 1;
}

function initialGrid(random: SlotRandom, definition: SlotDefinition): string[] {
  if (definition.independentCells) {
    return Array.from({ length: definition.columns * definition.rows }, (_unused, index) => {
      const column = index % definition.columns;
      const strip = definition.reelStrips[column];
      if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
      return strip[random.int(strip.length)] ?? strip[0] ?? "wild";
    });
  }

  const stops: number[] = [];
  for (let column = 0; column < definition.columns; column += 1) {
    const strip = definition.reelStrips[column];
    if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
    stops.push(random.int(strip.length));
  }
  return Array.from({ length: definition.columns * definition.rows }, (_unused, index) => {
    const row = Math.floor(index / definition.columns);
    const column = index % definition.columns;
    const strip = definition.reelStrips[column];
    if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
    return strip[((stops[column] ?? 0) + row) % strip.length] ?? strip[0] ?? "wild";
  });
}

function winsFor(
  reels: readonly string[],
  definition: SlotDefinition
): readonly { symbol: string; positions: number[]; pay: number }[] {
  return definition.payingSymbols.flatMap((symbol) => {
    const positions = reels.flatMap((candidate, index) => (candidate === symbol ? [index] : []));
    const pay = payoutAt(definition.symbolPaytables?.[symbol] ?? definition.paytable, positions.length);
    return pay > 0 ? [{ symbol, positions, pay }] : [];
  });
}

// Preserve the engine that produced the published v1 vectors. Artwork updates
// changed both the Midas strip and sampling strategy; payout calibration alone
// cannot reproduce those earlier rounds.
const LEGACY_MIDAS_DEFINITION: SlotDefinition = {
  ...FAIR_SLOT_DEFINITIONS["midas-feast"],
  reelStrips: strips(weightedStrip([
    { symbol: "midas", weight: 1 },
    ...FAIR_SLOT_SYMBOL_WEIGHTS["midas-feast"].filter(({ symbol }) =>
      ["grapes", "amphora", "coin", "laurel", "feast", "wild"].includes(symbol))
  ]), 6, 7),
  payingSymbols: ["grapes", "amphora", "coin", "laurel", "feast", "wild"],
  calibration: 0.022332841081829487,
  independentCells: false
};

export function resolveFairSlot(random: SlotRandom, gameId: FairSlotGameId, midasMathVersion?: "legacy" | "midas-grid-v2"): SlotResult {
  const definition = gameId === "midas-feast" && midasMathVersion === "legacy"
    ? LEGACY_MIDAS_DEFINITION : FAIR_SLOT_DEFINITIONS[gameId];
  const reels = initialGrid(random, definition);
  const bonusCount = reels.filter((symbol) => symbol === definition.bonusSymbol).length;
  const bonusTriggered = bonusCount >= definition.bonusThreshold;
  const bonusPay = bonusTriggered ? payoutAt(definition.bonusPaytable, bonusCount) : 0;
  let current = reels;
  let rawWin = bonusPay;
  let firstWinningSymbol = "";
  let firstWinningPositions: readonly number[] = [];
  const cascades: SlotCascade[] = [];

  for (let cascadeIndex = 0; cascadeIndex < definition.maxCascades; cascadeIndex += 1) {
    const wins = winsFor(current, definition);
    if (wins.length === 0) break;
    if (cascadeIndex === 0) {
      firstWinningSymbol = wins[0]?.symbol ?? "";
      firstWinningPositions = wins.flatMap((win) => win.positions);
    }
    const removed = [...new Set(wins.flatMap((win) => win.positions))].sort((left, right) => left - right);
    const cascadeWin = wins.reduce((total, win) => total + win.pay, 0);
    const effectMultiplier = gameId === "sixsixsix" ? sixSixSixWheelMultiplier(current, cascadeIndex) : 1;
    rawWin += cascadeWin * effectMultiplier;
    const gravity = buildGravityCascade(current, removed, definition.columns, definition.rows, (column) => {
      const strip = definition.reelStrips[column];
      if (!strip?.length) throw new Error(`Missing refill strip ${column}`);
      return strip[random.int(strip.length)] ?? strip[0] ?? "wild";
    });
    current = [...gravity.reels];
    cascades.push({
      cascadeIndex,
      removed,
      reels: current,
      movements: gravity.movements,
      newPositions: gravity.newPositions,
      winningSymbols: wins.map((win) => win.symbol),
      wins: wins.map((win) => ({
        symbol: win.symbol,
        positions: win.positions,
        count: win.positions.length,
        basePay: win.pay,
        rewardMultiplier: quantizeSlotMultiplier(
          Math.min(SLOT_MAX_SETTLED_MULTIPLIER, win.pay * definition.calibration)
        )
      })),
      displayMultiplier: effectMultiplier > 1 ? effectMultiplier : [1, 2, 3, 5][cascadeIndex] ?? cascadeIndex + 2,
      featureCharge: Math.min(100, Math.round(((cascadeIndex + 1) / definition.maxCascades) * 100)),
      goldenPositions: removed.filter((_position, index) => index % 3 === cascadeIndex % 3),
      multiplier: quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, cascadeWin * effectMultiplier * definition.calibration))
    });
  }

  const multiplier = quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, rawWin * definition.calibration));
  return {
    multiplier,
    outcome: {
      kind: "reels",
      theme: gameId,
      ...(gameId === "midas-feast" && midasMathVersion !== "legacy" ? { mathVersion: "midas-grid-v2" } : {}),
      reels,
      columns: definition.columns,
      rows: definition.rows,
      winningPositions: firstWinningPositions,
      winningSymbol: firstWinningSymbol,
      cascades,
      bonusTriggered,
      bonusSymbol: definition.bonusSymbol,
      bonusCount,
      bonusMultiplier: quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, bonusPay * definition.calibration)),
      anticipationLevel: Math.min(definition.bonusThreshold, bonusCount),
      cascadeCount: cascades.length,
      maxDisplayMultiplier: cascades.at(-1)?.displayMultiplier ?? 1,
      winTier:
        multiplier >= 20
          ? "legendary"
          : multiplier >= 10
            ? "epic"
            : multiplier >= 5
              ? "big"
              : multiplier > 0
                ? "win"
                : "none",
      winRule: "Eight or more matching symbols anywhere pay; winners break and remaining symbols cascade.",
      rawWin,
      finalReels: current
    }
  };
}

export const FAIR_SLOT_MAX_MULTIPLIERS: Readonly<Record<FairSlotGameId, number>> = Object.fromEntries(
  Object.entries(FAIR_SLOT_DEFINITIONS).map(([gameId, definition]) => {
    const cells = definition.columns * definition.rows;
    const maximumPayForCount = (count: number) =>
      Math.max(
        payoutAt(definition.paytable, count),
        ...definition.payingSymbols.map((symbol) =>
          payoutAt(definition.symbolPaytables?.[symbol] ?? definition.paytable, count)
        )
      );
    const maximumCascadePay = maximumPayForCount(cells);
    const maximumInitialPay = Math.max(
      maximumCascadePay,
      ...Array.from({ length: cells - definition.bonusThreshold + 1 }, (_unused, index) => {
        const bonusCount = definition.bonusThreshold + index;
        return payoutAt(definition.bonusPaytable, bonusCount) + maximumPayForCount(cells - bonusCount);
      })
    );
    const maximumRawWin = maximumInitialPay + maximumCascadePay * (definition.maxCascades - 1);
    return [
      gameId,
      quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, maximumRawWin * definition.calibration))
    ];
  })
) as Readonly<Record<FairSlotGameId, number>>;
