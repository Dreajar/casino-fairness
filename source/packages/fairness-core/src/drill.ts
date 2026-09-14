export const DRILL_RTP = 0.98;
export const DRILL_HOUSE_EDGE = 0.02;
export const DRILL_TARGET_MINIMUM = 1.01;
export const DRILL_TARGET_MAXIMUM = 2_000_000;
export const DRILL_TARGET_STEP = 0.01;
export const DRILL_RESULT_MAXIMUM = 2_000_000;

export type DrillLane = 0 | 1 | 2;

export interface DrillRandomSource {
  float(): number;
}

export interface DrillActionSnapshot {
  readonly target: number;
  readonly selectedLane: DrillLane;
}

export interface DrillOutcome {
  readonly kind: "drill";
  readonly results: readonly [number, number, number];
  readonly selectedLane: DrillLane;
  readonly target: number;
  readonly displayedWinChance: number;
  readonly selectedResult: number;
  readonly won: boolean;
  readonly payoutMultiplier: number;
  readonly presentation: Readonly<{
    sequence: "three-drill-descent";
    resultPrecision: 2;
    targetPrecision: 2;
    maximumResult: number;
  }>;
}

export function isValidDrillTarget(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= DRILL_TARGET_MINIMUM &&
    value <= DRILL_TARGET_MAXIMUM &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
  );
}

export function formatDrillTargetInput(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

export function normalizeDrillTarget(value: number): number {
  if (!Number.isFinite(value)) return 2;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Math.min(DRILL_TARGET_MAXIMUM, Math.max(DRILL_TARGET_MINIMUM, rounded));
}

export function drillWinChance(targetValue: number): number {
  const target = normalizeDrillTarget(targetValue);
  return Math.round((DRILL_RTP / target) * 100 * 100_000_000) / 100_000_000;
}

export function parseDrillAction(action: string): DrillActionSnapshot {
  const targetMatch = action.match(/(?:^|:)target:(\d+(?:\.\d+)?)/i);
  const laneMatch = action.match(/(?:^|:)lane:([012])(?:$|:)/i);
  const lane = Number(laneMatch?.[1] ?? 1);
  return {
    target: normalizeDrillTarget(Number(targetMatch?.[1] ?? 2)),
    selectedLane: lane === 0 || lane === 2 ? lane : 1
  };
}

/**
 * Original deterministic inverse-uniform model matching the displayed
 * P(result >= target) = 0.98 / target relationship. This models the visible
 * probability contract; it is not a claim about Stake's private implementation.
 */
export function drillResultFromFloat(value: number): number {
  const bounded = Math.min(1, Math.max(Number.EPSILON, value));
  const inverse = DRILL_RTP / bounded;
  return Math.min(DRILL_RESULT_MAXIMUM, Math.floor((inverse + Number.EPSILON) * 100) / 100);
}

export function evaluateDrillResults(
  resultsValue: readonly [number, number, number],
  snapshot: DrillActionSnapshot
): Readonly<{ multiplier: number; outcome: DrillOutcome }> {
  const results = resultsValue.map((value) =>
    Math.min(DRILL_RESULT_MAXIMUM, Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100))
  ) as [number, number, number];
  const target = normalizeDrillTarget(snapshot.target);
  const selectedResult = results[snapshot.selectedLane];
  const won = selectedResult >= target;
  const payoutMultiplier = won ? target : 0;
  return {
    multiplier: payoutMultiplier,
    outcome: {
      kind: "drill",
      results,
      selectedLane: snapshot.selectedLane,
      target,
      displayedWinChance: drillWinChance(target),
      selectedResult,
      won,
      payoutMultiplier,
      presentation: {
        sequence: "three-drill-descent",
        resultPrecision: 2,
        targetPrecision: 2,
        maximumResult: DRILL_RESULT_MAXIMUM
      }
    }
  };
}

export function resolveDrill(
  random: DrillRandomSource,
  action: string
): Readonly<{ multiplier: number; outcome: DrillOutcome }> {
  const results = [
    drillResultFromFloat(random.float()),
    drillResultFromFloat(random.float()),
    drillResultFromFloat(random.float())
  ] as const;
  return evaluateDrillResults(results, parseDrillAction(action));
}
