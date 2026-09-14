export const HOUSE_RETURN = 0.98;
export const MAX_FLIPS = 20;
export const LOCAL_STARTING_BALANCE = 1000;
export const MINIMUM_BET = 0.1;
const CURRENCY_SCALE = 100_000_000;

export const SIDES = Object.freeze({
  heads: "heads",
  tails: "tails"
});

export const PHASES = Object.freeze({
  idle: "idle",
  active: "active",
  lost: "lost",
  won: "won",
  cashed: "cashed"
});

export const MULTIPLIERS = Object.freeze(
  Array.from({ length: MAX_FLIPS }, (_, index) => Number((HOUSE_RETURN * (2 ** (index + 1))).toFixed(2)))
);

export function isSide(value) {
  return value === SIDES.heads || value === SIDES.tails;
}

export function oppositeSide(side) {
  return side === SIDES.tails ? SIDES.heads : SIDES.tails;
}

export function sideFromUnit(value) {
  return Number(value) > 0.5 ? SIDES.heads : SIDES.tails;
}

export function clampBet(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(numeric, 1_000_000);
}

export function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round((numeric + Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

function roundSignedCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

export function multiplierForStreak(streak) {
  const count = Math.max(0, Math.min(MAX_FLIPS, Math.floor(Number(streak) || 0)));
  return count === 0 ? 1 : MULTIPLIERS[count - 1];
}

export function winChanceForFlips(flips) {
  const count = Math.max(0, Math.min(MAX_FLIPS, Math.floor(Number(flips) || 0)));
  return 0.5 ** count;
}

export function returnForFlips(flips) {
  const count = Math.max(1, Math.min(MAX_FLIPS, Math.floor(Number(flips) || 1)));
  return winChanceForFlips(count) * multiplierForStreak(count);
}

export function profitFor(bet, multiplier) {
  return roundCurrency(clampBet(bet) * Math.max(0, Number(multiplier) - 1));
}

export function payoutFor(bet, multiplier) {
  return roundCurrency(clampBet(bet) * Math.max(0, Number(multiplier) || 0));
}

export function formatMultiplier(value) {
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

export function createRoundState(options = {}) {
  return {
    phase: PHASES.idle,
    round: Math.max(0, Math.floor(Number(options.round) || 0)),
    bet: clampBet(options.bet ?? 0),
    selectedSide: isSide(options.selectedSide) ? options.selectedSide : SIDES.heads,
    streak: 0,
    multiplier: 1,
    lastOutcome: null,
    lastResult: null,
    history: Array.isArray(options.history) ? options.history.filter(isSide).slice(-MAX_FLIPS) : []
  };
}

export function selectSide(state, side) {
  if (!isSide(side) || ![PHASES.idle, PHASES.active].includes(state.phase)) return state;
  return { ...state, selectedSide: side };
}

export function startRound(state, bet = state.bet) {
  if (state.phase !== PHASES.idle) return state;
  const wager = clampBet(bet);
  if (wager <= 0) return state;
  return {
    ...state,
    phase: PHASES.active,
    round: state.round + 1,
    bet: wager,
    streak: 0,
    multiplier: 1,
    lastOutcome: null,
    lastResult: null,
    history: []
  };
}

export function resolveFlip(state, outcome) {
  if (state.phase !== PHASES.active || !isSide(outcome)) return state;
  const history = [...state.history, outcome].slice(-MAX_FLIPS);
  if (state.selectedSide !== outcome) {
    return {
      ...state,
      phase: PHASES.lost,
      multiplier: 0,
      lastOutcome: outcome,
      lastResult: "loss",
      history
    };
  }

  const streak = Math.min(MAX_FLIPS, state.streak + 1);
  return {
    ...state,
    phase: streak === MAX_FLIPS ? PHASES.won : PHASES.active,
    streak,
    multiplier: multiplierForStreak(streak),
    lastOutcome: outcome,
    lastResult: streak === MAX_FLIPS ? "max-win" : "win",
    history
  };
}

export function cashOutRound(state) {
  if (![PHASES.active, PHASES.won].includes(state.phase) || state.streak < 1) return state;
  return { ...state, phase: PHASES.cashed, lastResult: "cashout" };
}

export function resetRound(state) {
  return {
    ...state,
    phase: PHASES.idle,
    bet: 0,
    streak: 0,
    multiplier: 1,
    lastOutcome: null,
    lastResult: null
  };
}

export function placeLocalWager(balance, wager) {
  const available = roundCurrency(balance);
  const amount = roundCurrency(clampBet(wager));
  if (amount < MINIMUM_BET || amount > available) {
    return Object.freeze({ accepted: false, balance: available, wager: amount });
  }
  return Object.freeze({
    accepted: true,
    balance: roundCurrency(available - amount),
    wager: amount
  });
}

export function settleLocalWager(balance, wager, multiplier, won = true) {
  const available = roundCurrency(balance);
  const payout = won ? payoutFor(wager, multiplier) : 0;
  return Object.freeze({ balance: roundCurrency(available + payout), payout });
}

export function autoRoundProfit(wager, multiplier, won) {
  const amount = roundCurrency(wager);
  if (!won) return roundSignedCurrency(-amount);
  return roundSignedCurrency(payoutFor(amount, multiplier) - amount);
}

export function nextAutoWager({
  baseWager,
  currentWager,
  won,
  onWin = "reset",
  onLoss = "reset",
  winIncrease = 0,
  lossIncrease = 0
}) {
  const base = roundCurrency(baseWager);
  const current = roundCurrency(currentWager);
  const rule = won ? onWin : onLoss;
  if (rule !== "increase") return base;
  const rawPercent = won ? winIncrease : lossIncrease;
  const percent = Math.min(1_000_000, Math.max(0, Number(rawPercent) || 0));
  return roundCurrency(current * (1 + percent / 100));
}

export function autoStopReason({
  completed = 0,
  betLimit = 0,
  sessionProfit = 0,
  stopOnProfit = 0,
  stopOnLoss = 0
} = {}) {
  const profitTarget = roundCurrency(stopOnProfit);
  const lossLimit = roundCurrency(stopOnLoss);
  const signedProfit = roundSignedCurrency(sessionProfit);
  if (profitTarget > 0 && signedProfit >= profitTarget) return "profit";
  if (lossLimit > 0 && signedProfit <= -lossLimit) return "loss";
  const finiteLimit = Math.max(0, Math.floor(Number(betLimit) || 0));
  if (finiteLimit > 0 && Math.max(0, Math.floor(Number(completed) || 0)) >= finiteLimit) return "count";
  return null;
}

export function normalizedFlipCount(value) {
  return Math.max(1, Math.min(MAX_FLIPS, Math.floor(Number(value) || 1)));
}
