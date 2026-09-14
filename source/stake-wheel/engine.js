export const RISKS = Object.freeze(["low", "medium", "high"]);
export const SEGMENT_COUNTS = Object.freeze([10, 20, 30, 40, 50]);
export const HOUSE_RETURN = 0.99;
export const LOCAL_STARTING_BALANCE = 1000;
export const MINIMUM_WAGER = 0.1;

export const ROUND_PHASES = Object.freeze({
  idle: "idle",
  spinning: "spinning",
  settling: "settling",
  settled: "settled"
});

const CURRENCY_SCALE = 100_000_000;
const MAX_WAGER = 1_000_000;
const UINT32_RANGE = 0x1_0000_0000;
const LOW_PATTERN = Object.freeze([1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0]);

const MEDIUM_PAYOUTS = Object.freeze({
  10: Object.freeze([0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3]),
  20: Object.freeze([
    1.5, 0, 2, 0, 2, 0, 2, 0, 1.5, 0,
    3, 0, 1.8, 0, 2, 0, 2, 0, 2, 0
  ]),
  30: Object.freeze([
    1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0,
    2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0,
    2, 0, 1.7, 0, 4, 0, 1.5, 0, 2, 0
  ]),
  40: Object.freeze([
    2, 0, 3, 0, 2, 0, 1.5, 0, 3, 0,
    1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0,
    1.5, 0, 2, 0, 2, 0, 1.6, 0, 2, 0,
    1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0
  ]),
  50: Object.freeze([
    2, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0,
    1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0,
    1.5, 0, 2, 0, 1.5, 0, 2, 0, 2, 0,
    1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0,
    1.5, 0, 5, 0, 1.5, 0, 2, 0, 1.5, 0
  ])
});

function repeatedLowPayouts(segments) {
  return Object.freeze(Array.from({ length: segments }, (_, index) => LOW_PATTERN[index % LOW_PATTERN.length]));
}

function highPayouts(segments) {
  return Object.freeze([...Array.from({ length: segments - 1 }, () => 0), HOUSE_RETURN * segments]);
}

export const PAYOUTS = Object.freeze(Object.fromEntries(
  SEGMENT_COUNTS.map((segments) => [
    segments,
    Object.freeze({
      low: repeatedLowPayouts(segments),
      medium: MEDIUM_PAYOUTS[segments],
      high: highPayouts(segments)
    })
  ])
));

function configurationParts(riskOrConfiguration, segments) {
  if (riskOrConfiguration && typeof riskOrConfiguration === "object") {
    return {
      risk: riskOrConfiguration.risk,
      segments: riskOrConfiguration.segments
    };
  }
  return { risk: riskOrConfiguration, segments };
}

function normalizedRisk(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedSegments(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : Number.NaN;
}

export function isValidConfiguration(riskOrConfiguration, segments) {
  const candidate = configurationParts(riskOrConfiguration, segments);
  return RISKS.includes(normalizedRisk(candidate.risk))
    && SEGMENT_COUNTS.includes(normalizedSegments(candidate.segments));
}

export function validateConfiguration(riskOrConfiguration, segments) {
  const candidate = configurationParts(riskOrConfiguration, segments);
  const risk = normalizedRisk(candidate.risk);
  const segmentCount = normalizedSegments(candidate.segments);
  if (!RISKS.includes(risk)) throw new RangeError(`Unsupported Wheel risk: ${candidate.risk}`);
  if (!SEGMENT_COUNTS.includes(segmentCount)) {
    throw new RangeError(`Unsupported Wheel segment count: ${candidate.segments}`);
  }
  return Object.freeze({ risk, segments: segmentCount });
}

export function payoutsFor(riskOrConfiguration, segments) {
  const configuration = validateConfiguration(riskOrConfiguration, segments);
  return PAYOUTS[configuration.segments][configuration.risk];
}

export function meanPayout(payouts) {
  if (!Array.isArray(payouts) || payouts.length === 0) {
    throw new TypeError("Payouts must be a non-empty array");
  }
  const total = payouts.reduce((sum, payout) => {
    const numeric = Number(payout);
    if (!Number.isFinite(numeric) || numeric < 0) throw new RangeError("Payouts must be finite and non-negative");
    return sum + numeric;
  }, 0);
  return Math.round((total / payouts.length + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000;
}

export function rtpFor(riskOrConfiguration, segments) {
  return meanPayout(payoutsFor(riskOrConfiguration, segments));
}

export function assertPayoutTables(tables = PAYOUTS) {
  for (const segments of SEGMENT_COUNTS) {
    const configuration = tables?.[segments];
    if (!configuration) throw new Error(`Missing Wheel payout configuration for ${segments} segments`);
    for (const risk of RISKS) {
      const payouts = configuration[risk];
      if (!Array.isArray(payouts) || payouts.length !== segments) {
        throw new Error(`Wheel ${risk}/${segments} must contain exactly ${segments} payouts`);
      }
      if (meanPayout(payouts) !== HOUSE_RETURN) {
        throw new Error(`Wheel ${risk}/${segments} must return exactly ${HOUSE_RETURN}`);
      }
    }
  }
  return true;
}

export function validatePayoutTables(tables = PAYOUTS) {
  try {
    return assertPayoutTables(tables);
  } catch {
    return false;
  }
}

export function segmentIndexFromFloat(float, segments) {
  const segmentCount = validateConfiguration("low", segments).segments;
  const numeric = Number(float);
  if (!Number.isFinite(numeric)) throw new TypeError("Wheel random float must be finite");
  const bounded = Math.min(1, Math.max(0, numeric));
  return Math.min(segmentCount - 1, Math.floor(bounded * segmentCount));
}

export function cryptoFloat(cryptoSource = globalThis.crypto) {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new Error("A cryptographic getRandomValues source is required");
  }
  const sample = new Uint32Array(1);
  cryptoSource.getRandomValues(sample);
  return sample[0] / UINT32_RANGE;
}

export function outcomeForIndex(riskOrConfiguration, segmentsOrIndex, maybeIndex) {
  const objectConfiguration = riskOrConfiguration && typeof riskOrConfiguration === "object";
  const configuration = validateConfiguration(
    riskOrConfiguration,
    objectConfiguration ? undefined : segmentsOrIndex
  );
  const index = Number(objectConfiguration ? segmentsOrIndex : maybeIndex);
  if (!Number.isInteger(index) || index < 0 || index >= configuration.segments) {
    throw new RangeError(`Wheel result index must be between 0 and ${configuration.segments - 1}`);
  }
  const multiplier = payoutsFor(configuration)[index];
  return Object.freeze({ ...configuration, index, multiplier });
}

export function outcomeForFloat(riskOrConfiguration, segmentsOrFloat, maybeFloat) {
  const objectConfiguration = riskOrConfiguration && typeof riskOrConfiguration === "object";
  const configuration = validateConfiguration(
    riskOrConfiguration,
    objectConfiguration ? undefined : segmentsOrFloat
  );
  const float = objectConfiguration ? segmentsOrFloat : maybeFloat;
  return outcomeForIndex(configuration, segmentIndexFromFloat(float, configuration.segments));
}

export function resolveWheelOutcome({ risk, segments, float = null, index = null } = {}) {
  const configuration = validateConfiguration(risk, segments);
  if (index !== null && index !== undefined) return outcomeForIndex(configuration, index);
  const resolvedFloat = float === null || float === undefined ? cryptoFloat() : float;
  return outcomeForFloat(configuration, resolvedFloat);
}

export function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round((numeric + Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

export function roundSignedCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

export function clampWager(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(roundCurrency(numeric), MAX_WAGER);
}

export function placeLocalWager(balance, wager) {
  const available = roundCurrency(balance);
  const amount = clampWager(wager);
  if (amount < MINIMUM_WAGER || amount > available) {
    return Object.freeze({ accepted: false, balance: available, wager: amount });
  }
  return Object.freeze({
    accepted: true,
    balance: roundCurrency(available - amount),
    wager: amount
  });
}

export function payoutFor(wager, multiplier) {
  return roundCurrency(clampWager(wager) * Math.max(0, Number(multiplier) || 0));
}

export function profitFor(wager, multiplier) {
  return roundSignedCurrency(payoutFor(wager, multiplier) - clampWager(wager));
}

export function settleLocalWager(balance, wager, multiplier) {
  const available = roundCurrency(balance);
  const payout = payoutFor(wager, multiplier);
  return Object.freeze({ balance: roundCurrency(available + payout), payout });
}

export function formatMultiplier(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(2)}×`;
}

export function createRoundState(options = {}) {
  const configuration = validateConfiguration(options.risk ?? "medium", options.segments ?? 30);
  return {
    ...configuration,
    phase: ROUND_PHASES.idle,
    round: Math.max(0, Math.floor(Number(options.round) || 0)),
    roundId: null,
    wager: clampWager(options.wager ?? 0),
    index: null,
    multiplier: null,
    payout: 0,
    result: null
  };
}

export function startRound(state, options = {}) {
  if (!state || state.phase !== ROUND_PHASES.idle) return state;
  const configuration = validateConfiguration(options.risk ?? state.risk, options.segments ?? state.segments);
  return {
    ...state,
    ...configuration,
    phase: ROUND_PHASES.spinning,
    round: state.round + 1,
    roundId: typeof options.roundId === "string" && options.roundId ? options.roundId : null,
    wager: clampWager(options.wager ?? state.wager),
    index: null,
    multiplier: null,
    payout: 0,
    result: null
  };
}

export function resolveRound(state, index) {
  if (!state || state.phase !== ROUND_PHASES.spinning) return state;
  const outcome = outcomeForIndex(state, index);
  const payout = payoutFor(state.wager, outcome.multiplier);
  const result = outcome.multiplier === 0 ? "loss" : outcome.multiplier < 1 ? "partial" : "win";
  return {
    ...state,
    phase: ROUND_PHASES.settling,
    index: outcome.index,
    multiplier: outcome.multiplier,
    payout,
    result
  };
}

export function finishRound(state) {
  if (!state || state.phase !== ROUND_PHASES.settling) return state;
  return { ...state, phase: ROUND_PHASES.settled };
}

export function resetRound(state, options = {}) {
  if (!state) return createRoundState(options);
  const configuration = validateConfiguration(options.risk ?? state.risk, options.segments ?? state.segments);
  return {
    ...state,
    ...configuration,
    phase: ROUND_PHASES.idle,
    roundId: null,
    wager: clampWager(options.wager ?? state.wager),
    index: null,
    multiplier: null,
    payout: 0,
    result: null
  };
}

export function controlsLocked(stateOrPhase) {
  const phase = typeof stateOrPhase === "string" ? stateOrPhase : stateOrPhase?.phase;
  return phase === ROUND_PHASES.spinning || phase === ROUND_PHASES.settling;
}

export function roundPhaseLocks(stateOrPhase) {
  const locked = controlsLocked(stateOrPhase);
  return Object.freeze({
    configuration: locked,
    wager: locked,
    mode: locked,
    action: locked
  });
}

export function createWalletState(balance = LOCAL_STARTING_BALANCE) {
  return { version: 1, balance: roundCurrency(balance), openRounds: {} };
}

export function sanitizeWalletState(state, fallbackBalance = LOCAL_STARTING_BALANCE) {
  if (!state || typeof state !== "object") return createWalletState(fallbackBalance);
  const balance = Number.isFinite(Number(state.balance)) && Number(state.balance) >= 0
    ? roundCurrency(state.balance)
    : roundCurrency(fallbackBalance);
  const openRounds = {};
  if (state.openRounds && typeof state.openRounds === "object") {
    for (const [roundId, entry] of Object.entries(state.openRounds)) {
      if (!roundId || !entry || typeof entry !== "object") continue;
      const wager = clampWager(entry.wager);
      if (wager <= 0) continue;
      openRounds[roundId] = {
        owner: typeof entry.owner === "string" ? entry.owner : "",
        wager,
        createdAt: Math.max(0, Math.floor(Number(entry.createdAt) || 0))
      };
    }
  }
  return { version: 1, balance, openRounds };
}

function validRoundId(roundId) {
  if (typeof roundId !== "string" || roundId.trim() === "") {
    throw new TypeError("A non-empty roundId is required");
  }
  return roundId.trim();
}

export function debitRoundOnce(walletState, { roundId, owner = "", wager, createdAt = 0 } = {}) {
  const wallet = sanitizeWalletState(walletState);
  const id = validRoundId(roundId);
  const amount = clampWager(wager);
  const existing = wallet.openRounds[id];
  if (existing) {
    const matches = existing.owner === String(owner) && existing.wager === amount;
    return {
      wallet,
      accepted: matches,
      debited: false,
      conflict: !matches,
      balance: wallet.balance,
      wager: existing.wager
    };
  }
  const placement = placeLocalWager(wallet.balance, amount);
  if (!placement.accepted) {
    return {
      wallet,
      accepted: false,
      debited: false,
      conflict: false,
      balance: wallet.balance,
      wager: amount
    };
  }
  const nextWallet = {
    ...wallet,
    balance: placement.balance,
    openRounds: {
      ...wallet.openRounds,
      [id]: {
        owner: String(owner),
        wager: placement.wager,
        createdAt: Math.max(0, Math.floor(Number(createdAt) || 0))
      }
    }
  };
  return {
    wallet: nextWallet,
    accepted: true,
    debited: true,
    conflict: false,
    balance: nextWallet.balance,
    wager: placement.wager
  };
}

export function creditRoundOnce(walletState, { roundId, multiplier = 0 } = {}) {
  const wallet = sanitizeWalletState(walletState);
  const id = validRoundId(roundId);
  const entry = wallet.openRounds[id];
  if (!entry) {
    return {
      wallet,
      settled: false,
      credited: false,
      balance: wallet.balance,
      payout: 0
    };
  }
  const settlement = settleLocalWager(wallet.balance, entry.wager, multiplier);
  const openRounds = { ...wallet.openRounds };
  delete openRounds[id];
  const nextWallet = { ...wallet, balance: settlement.balance, openRounds };
  return {
    wallet: nextWallet,
    settled: true,
    credited: settlement.payout > 0,
    balance: nextWallet.balance,
    payout: settlement.payout
  };
}

export function recoverInterruptedRounds(walletState, { owner, roundIds } = {}) {
  const wallet = sanitizeWalletState(walletState);
  const wantedIds = Array.isArray(roundIds) ? new Set(roundIds.map(String)) : null;
  const filterByOwner = typeof owner === "string";
  const openRounds = { ...wallet.openRounds };
  const recoveredRoundIds = [];
  let refund = 0;
  for (const [roundId, entry] of Object.entries(wallet.openRounds)) {
    if (wantedIds && !wantedIds.has(roundId)) continue;
    if (filterByOwner && entry.owner !== owner) continue;
    refund = roundCurrency(refund + entry.wager);
    recoveredRoundIds.push(roundId);
    delete openRounds[roundId];
  }
  const nextWallet = {
    ...wallet,
    balance: roundCurrency(wallet.balance + refund),
    openRounds
  };
  return {
    wallet: nextWallet,
    recovered: recoveredRoundIds.length,
    recoveredRoundIds: Object.freeze(recoveredRoundIds),
    refund,
    balance: nextWallet.balance
  };
}

export function recoverInterruptedRound(walletState, roundId) {
  return recoverInterruptedRounds(walletState, { roundIds: [validRoundId(roundId)] });
}

export function autoRoundProfit(wager, multiplier) {
  return profitFor(wager, multiplier);
}

export function nextAutoWager({
  baseWager,
  currentWager,
  won,
  onWin = "reset",
  onLoss = "reset",
  winIncrease = 0,
  lossIncrease = 0
} = {}) {
  const base = clampWager(baseWager);
  const current = clampWager(currentWager);
  const rule = won ? onWin : onLoss;
  if (rule !== "increase") return base;
  const rawPercent = won ? winIncrease : lossIncrease;
  const percent = Math.min(1_000_000, Math.max(0, Number(rawPercent) || 0));
  return clampWager(current * (1 + percent / 100));
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

assertPayoutTables(PAYOUTS);
