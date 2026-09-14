export const HOUSE_RETURN = 0.98;
export const MAX_ROLLS = 5;

export const DICE_WEIGHTS = Object.freeze({
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
});

const multiplierMap = (values) => Object.freeze(Object.fromEntries(
  Object.entries(values).map(([total, multiplier]) => [Number(total), multiplier])
));

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    label: "Easy",
    accent: "#55dfff",
    snakeTotals: Object.freeze([7]),
    firstMultipliers: multiplierMap({ 2: 2, 3: 1.3, 4: 1.2, 5: 1.1, 6: 1.01, 8: 1.01, 9: 1.1, 10: 1.2, 11: 1.3, 12: 2 })
  }),
  medium: Object.freeze({
    label: "Medium",
    accent: "#047bff",
    snakeTotals: Object.freeze([6, 7, 8]),
    firstMultipliers: multiplierMap({ 2: 4, 3: 2.5, 4: 1.4, 5: 1.11, 9: 1.11, 10: 1.4, 11: 2.5, 12: 4 })
  }),
  hard: Object.freeze({
    label: "Hard",
    accent: "#02e700",
    snakeTotals: Object.freeze([5, 6, 7, 8, 9]),
    firstMultipliers: multiplierMap({ 2: 7.5, 3: 3, 4: 1.38, 10: 1.38, 11: 3, 12: 7.5 })
  }),
  expert: Object.freeze({
    label: "Expert",
    accent: "#be8fff",
    snakeTotals: Object.freeze([4, 5, 6, 7, 8, 9, 10]),
    firstMultipliers: multiplierMap({ 2: 10, 3: 3.82, 11: 3.82, 12: 10 })
  }),
  master: Object.freeze({
    label: "Master",
    accent: "#ffc200",
    snakeTotals: Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11]),
    firstMultipliers: multiplierMap({ 2: 17.64, 12: 17.64 })
  })
});

export const PHASES = Object.freeze({
  idle: "idle",
  ready: "ready",
  rolling: "rolling",
  active: "active",
  lost: "lost",
  cashed: "cashed",
  won: "won"
});

export function clampBet(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(numeric, 1_000_000);
}

export function normalizeDifficulty(value) {
  return DIFFICULTIES[value] ? value : "medium";
}

export function diceTotal(dieA, dieB) {
  const normalizeDie = (value) => Math.min(6, Math.max(1, Math.floor(Number(value) || 1)));
  return normalizeDie(dieA) + normalizeDie(dieB);
}

export function boardIndexForTotal(total) {
  return Math.min(11, Math.max(1, Math.floor(Number(total) || 2) - 1));
}

export function isSnakeTotal(difficulty, total) {
  return DIFFICULTIES[normalizeDifficulty(difficulty)].snakeTotals.includes(Number(total));
}

export function firstMultiplierFor(difficulty, total) {
  return DIFFICULTIES[normalizeDifficulty(difficulty)].firstMultipliers[Number(total)] ?? 0;
}

export function continuationFactorFor(difficulty, total) {
  const firstMultiplier = firstMultiplierFor(difficulty, total);
  return firstMultiplier ? firstMultiplier / HOUSE_RETURN : 0;
}

export function firstRollReturnFor(difficulty) {
  const config = DIFFICULTIES[normalizeDifficulty(difficulty)];
  return Object.entries(DICE_WEIGHTS).reduce((sum, [total, weight]) => (
    sum + weight * (config.firstMultipliers[total] ?? 0)
  ), 0) / 36;
}

export function maximumMultiplierFor(difficulty, rolls = MAX_ROLLS) {
  const config = DIFFICULTIES[normalizeDifficulty(difficulty)];
  const first = Math.max(...Object.values(config.firstMultipliers));
  return first * ((first / HOUSE_RETURN) ** Math.max(0, Math.min(MAX_ROLLS, rolls) - 1));
}

export function payoutFor(bet, multiplier) {
  return clampBet(bet) * Math.max(0, Number(multiplier) || 0);
}

export function profitFor(bet, multiplier) {
  return clampBet(bet) * Math.max(0, (Number(multiplier) || 0) - 1);
}

export function formatMultiplier(value, suffix = "×") {
  const numeric = Number(value) || 0;
  return `${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}

export function createGameState(options = {}) {
  return {
    difficulty: normalizeDifficulty(options.difficulty),
    phase: PHASES.idle,
    bet: clampBet(options.bet ?? 0),
    rolls: 0,
    maxRolls: Math.min(MAX_ROLLS, Math.max(1, Math.floor(Number(options.maxRolls) || MAX_ROLLS))),
    multiplier: 1,
    lastSafeMultiplier: 1,
    markerIndex: 0,
    lastDice: null,
    lastTotal: null,
    result: null,
    history: Object.freeze([]),
    round: Math.max(0, Math.floor(Number(options.round) || 0))
  };
}

export function startGame(state, bet = state.bet) {
  if ([PHASES.ready, PHASES.rolling, PHASES.active].includes(state.phase)) return state;
  return {
    ...state,
    phase: PHASES.ready,
    bet: clampBet(bet),
    rolls: 0,
    multiplier: 1,
    lastSafeMultiplier: 1,
    markerIndex: 0,
    lastDice: null,
    lastTotal: null,
    result: null,
    history: Object.freeze([]),
    round: state.round + 1
  };
}

export function markRolling(state) {
  if (![PHASES.ready, PHASES.active].includes(state.phase) || state.rolls >= state.maxRolls) return state;
  return { ...state, phase: PHASES.rolling, result: null };
}

export function resolveRoll(state, dieA, dieB) {
  if (state.phase !== PHASES.rolling) return state;
  const a = Math.min(6, Math.max(1, Math.floor(Number(dieA) || 1)));
  const b = Math.min(6, Math.max(1, Math.floor(Number(dieB) || 1)));
  const total = diceTotal(a, b);
  const markerIndex = boardIndexForTotal(total);
  const nextHistory = Object.freeze([...state.history, Object.freeze({ dieA: a, dieB: b, total, markerIndex })]);

  if (isSnakeTotal(state.difficulty, total)) {
    return {
      ...state,
      phase: PHASES.lost,
      rolls: state.rolls + 1,
      multiplier: 0,
      markerIndex,
      lastDice: Object.freeze([a, b]),
      lastTotal: total,
      result: "loss",
      history: nextHistory
    };
  }

  const firstMultiplier = firstMultiplierFor(state.difficulty, total);
  const multiplier = state.rolls === 0
    ? firstMultiplier
    : state.multiplier * continuationFactorFor(state.difficulty, total);
  const rolls = state.rolls + 1;
  const complete = rolls >= state.maxRolls;
  return {
    ...state,
    phase: complete ? PHASES.won : PHASES.active,
    rolls,
    multiplier,
    lastSafeMultiplier: multiplier,
    markerIndex,
    lastDice: Object.freeze([a, b]),
    lastTotal: total,
    result: complete ? "max-win" : "success",
    history: nextHistory
  };
}

export function cashOutGame(state) {
  if (state.phase !== PHASES.active || state.rolls < 1) return state;
  return { ...state, phase: PHASES.cashed, result: "cashout" };
}

export function resetGame(state) {
  return {
    ...state,
    phase: PHASES.idle,
    rolls: 0,
    multiplier: 1,
    lastSafeMultiplier: 1,
    markerIndex: 0,
    lastDice: null,
    lastTotal: null,
    result: null,
    history: Object.freeze([])
  };
}
