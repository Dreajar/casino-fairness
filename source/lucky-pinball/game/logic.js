import { BET_STEPS, PHASES, SCENARIOS, SPEEDS } from "./config.js";
import { simulateScenario } from "./physics.js";
import { projectRound } from "./timeline.js";

export const TARGET_RTP = 0.96;

const PAYOUT_MULTIPLIERS = Object.freeze({
  safe: 10.2,
  win: 9.1,
  collision: 30.1,
  loss: 0,
});

const SAFE_PROBABILITY = 0.04;
const WIN_PROBABILITY = 0.01;
const COLLISION_PROBABILITY =
  (TARGET_RTP - SAFE_PROBABILITY * PAYOUT_MULTIPLIERS.safe - WIN_PROBABILITY * PAYOUT_MULTIPLIERS.win) /
  PAYOUT_MULTIPLIERS.collision;
const LOSS_PROBABILITY = 1 - SAFE_PROBABILITY - WIN_PROBABILITY - COLLISION_PROBABILITY;

const OUTCOME_PROBABILITIES = Object.freeze({
  safe: SAFE_PROBABILITY,
  win: WIN_PROBABILITY,
  collision: COLLISION_PROBABILITY,
  loss: LOSS_PROBABILITY,
});

export const RTP_MODEL = Object.freeze({
  targetRtp: TARGET_RTP,
  houseEdge: 1 - TARGET_RTP,
  probabilities: OUTCOME_PROBABILITIES,
  payoutMultipliers: PAYOUT_MULTIPLIERS,
  theoreticalRtp: Object.entries(OUTCOME_PROBABILITIES).reduce(
    (total, [scenarioId, probability]) => total + probability * PAYOUT_MULTIPLIERS[scenarioId],
    0,
  ),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function seededUnit(seed) {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

export function selectScenario(seed) {
  const unit = seededUnit(seed);
  if (unit < OUTCOME_PROBABILITIES.safe) return "safe";
  if (unit < OUTCOME_PROBABILITIES.safe + OUTCOME_PROBABILITIES.win) return "win";
  if (unit < OUTCOME_PROBABILITIES.safe + OUTCOME_PROBABILITIES.win + OUTCOME_PROBABILITIES.collision) {
    return "collision";
  }
  return "loss";
}

export function resolveOutcome({ scenarioId, seed, bet, lastScenarioId, lastOutcome }) {
  if (scenarioId === "replay" && lastOutcome) {
    return Object.freeze({ ...lastOutcome, seed, bet });
  }
  const requested = scenarioId === "replay" ? lastScenarioId || "safe" : scenarioId;
  const id = requested && SCENARIOS[requested] ? requested : selectScenario(seed);
  const scenario = SCENARIOS[id];
  const trajectory = simulateScenario(scenario, seed);
  return Object.freeze({
    id,
    seed,
    bet,
    scenario,
    trajectory,
    path: trajectory.samples,
    events: trajectory.events,
    terminalAt: trajectory.terminalAt,
    revealAt: trajectory.revealAt,
    settleAt: trajectory.settleAt,
    pocket: scenario.pocket,
  });
}

export function createGameState(options = {}) {
  const requestedBet = Number(options.bet ?? 1);
  const betIndex = Math.max(0, BET_STEPS.findIndex((value) => value === requestedBet));
  const speedIndex = Math.max(0, SPEEDS.findIndex((speed) => speed.id === (options.speed || "normal")));
  return {
    phase: options.loading === false ? PHASES.IDLE : PHASES.LOADING,
    balance: Number(options.balance ?? 1000),
    betIndex,
    speedIndex,
    seed: Number(options.seed ?? 0x51f15e) >>> 0,
    multiplier: 0,
    lastWin: 0,
    lastScenarioId: null,
    lastOutcome: null,
    result: null,
    round: null,
    history: [],
    controlsLocked: options.loading !== false,
    autoplayRemaining: 0,
    autoplayInfinite: false,
    ambientOrigin: Number(options.ambientOrigin ?? 0),
  };
}

export function finishLoading(state) {
  if (state.phase !== PHASES.LOADING) return state;
  return { ...state, phase: PHASES.IDLE, controlsLocked: false };
}

export function canPlay(state) {
  return !state.controlsLocked && !state.round && state.balance >= BET_STEPS[state.betIndex];
}

export function startRound(state, options = {}) {
  if (!canPlay(state)) return state;
  const bet = BET_STEPS[state.betIndex];
  const nextSeed = (state.seed + 0x9e3779b9) >>> 0;
  const outcome = resolveOutcome({
    scenarioId: options.scenarioId,
    seed: nextSeed,
    bet,
    lastScenarioId: state.lastScenarioId,
    lastOutcome: state.lastOutcome,
  });
  return {
    ...state,
    phase: PHASES.REQUESTED,
    balance: Number((state.balance - bet).toFixed(2)),
    seed: nextSeed,
    multiplier: 0,
    result: null,
    controlsLocked: true,
    round: {
      id: `${nextSeed.toString(16)}-${state.history.length + 1}`,
      outcome,
      timelineMs: 0,
      settled: false,
      baseBalanceAfterDebit: Number((state.balance - bet).toFixed(2)),
    },
  };
}

export function tickGame(state, deltaMs) {
  if (!state.round) return state;
  const factor = SPEEDS[state.speedIndex].factor;
  const timelineMs = state.round.timelineMs + Math.max(0, deltaMs) * factor;
  const projection = projectRound(state.round.outcome, timelineMs);
  let next = {
    ...state,
    phase: projection.phase,
    multiplier: projection.multiplier,
    controlsLocked: projection.controlsLocked,
    result: projection.result,
    round: { ...state.round, timelineMs },
  };
  if (timelineMs >= state.round.outcome.settleAt && !state.round.settled) {
    const authoritative = state.round.authoritativeSettlement;
    const payout = authoritative?.payout ?? projection.payout;
    const record = {
      id: state.round.id,
      scenarioId: state.round.outcome.id,
      bet: state.round.outcome.bet,
      multiplier: authoritative?.multiplier ?? projection.multiplier,
      payout,
      win: payout > 0,
    };
    next = {
      ...next,
      phase: PHASES.SETTLEMENT,
      balance: authoritative?.balance ?? Number((state.balance + payout).toFixed(2)),
      multiplier: authoritative?.multiplier ?? projection.multiplier,
      lastWin: payout,
      lastScenarioId: state.round.outcome.id,
      lastOutcome: state.round.outcome,
      history: [record, ...state.history].slice(0, 12),
      controlsLocked: false,
      round: null,
    };
  }
  return next;
}

export function setSpeed(state, speedId) {
  const speedIndex = SPEEDS.findIndex((speed) => speed.id === speedId);
  return speedIndex < 0 ? state : { ...state, speedIndex };
}

export function stepBet(state, direction) {
  if (state.controlsLocked) return state;
  const betIndex = clamp(state.betIndex + Math.sign(direction), 0, BET_STEPS.length - 1);
  return { ...state, betIndex };
}

export function resetGame(state) {
  return createGameState({ loading: false, ambientOrigin: state.ambientOrigin });
}

export function debugProjection({ scenarioId = "win", frame = 0, bet = 1, balance = 1000, seed = 1 }) {
  const outcome = resolveOutcome({ scenarioId, seed, bet, lastScenarioId: "win" });
  const projection = projectRound(outcome, Math.max(0, Number(frame) || 0));
  return {
    ...projection,
    outcome,
    balance: Number((balance - bet + (projection.settled ? projection.payout : 0)).toFixed(2)),
    bet,
  };
}
