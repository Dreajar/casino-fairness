/**
 * Pure mechanics for the local Rainbet Wheel recreation.
 *
 * This module intentionally has no DOM, storage, timer, or network access. The
 * browser controller owns persistence and presentation; it passes immutable
 * values through the helpers below.
 */

export const RISKS = Object.freeze(["low", "medium", "high", "risky"]);
export const SECTOR_COUNT = 25;
export const MAX_SPINS = 10;
export const MIN_WAGER = 0.1;
export const MAX_WAGER = 12_500;
export const MAX_MULTIPLIER = 10_000;
export const MAX_CASH_PAYOUT = 500_000;
export const LOCAL_STARTING_BALANCE = 1_000;

/*
 * Rainbet's public verifier describes 96.40% as the game's "Max RTP". It is a
 * ceiling, not a claim that every visible risk table has the same mean. The
 * rendered 25-sector counts derive to 0.964 for Low and 0.96 for Medium, High,
 * and Risky. Keep that distinction visible instead of rewriting the tables to
 * force every mode to the published maximum.
 */
export const PUBLISHED_MAX_RTP = 0.964;

export const ROUND_PHASES = Object.freeze({
  idle: "idle",
  spinning: "spinning",
  revealing: "revealing",
  active: "active",
  maxed: "maxed",
  cashing: "cashing",
  cashed: "cashed",
  lost: "lost"
});

export const AUTO_RULES = Object.freeze({
  reset: "reset",
  increase: "increase"
});

export const OUTCOME_CATEGORIES = Object.freeze(["loss", "gold", "green", "blue", "orange"]);

const CURRENCY_SCALE = 100_000_000;
const MULTIPLIER_SCALE = 1_000_000_000_000;
const UINT32_RANGE = 0x1_0000_0000;
const MAX_RANDOM_REJECTIONS = 1_024;

function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

/** Authoritative rendered counts, recorded separately from sector ordering. */
export const RISK_DISTRIBUTIONS = Object.freeze({
  low: freezeEntries([
    { multiplier: 0, count: 5 },
    { multiplier: 1.1, count: 11 },
    { multiplier: 1.2, count: 6 },
    { multiplier: 1.4, count: 2 },
    { multiplier: 2, count: 1 }
  ]),
  medium: freezeEntries([
    { multiplier: 0, count: 10 },
    { multiplier: 1.2, count: 8 },
    { multiplier: 1.5, count: 4 },
    { multiplier: 2.2, count: 2 },
    { multiplier: 4, count: 1 }
  ]),
  high: freezeEntries([
    { multiplier: 0, count: 15 },
    { multiplier: 1.5, count: 4 },
    { multiplier: 2, count: 3 },
    { multiplier: 3, count: 2 },
    { multiplier: 6, count: 1 }
  ]),
  risky: freezeEntries([
    { multiplier: 0, count: 21 },
    { multiplier: 2, count: 1 },
    { multiplier: 3, count: 1 },
    { multiplier: 4, count: 1 },
    { multiplier: 15, count: 1 }
  ])
});

/*
 * Clockwise sector order is explicit so visual selection, deterministic URLs,
 * tests, and the verifier all address the same physical index. Counts are the
 * authoritative public facts; the ordering remains independently auditable.
 */
export const RISK_TABLES = Object.freeze({
  low: Object.freeze([
    0, 1.1, 1.2, 1.4, 1.1,
    0, 1.2, 1.1, 1.1, 1.2,
    0, 1.1, 1.1, 2, 1.2,
    0, 1.1, 1.2, 1.4, 1.1,
    0, 1.1, 1.2, 1.1, 1.1
  ]),
  medium: Object.freeze([
    0, 1.5, 0, 1.2, 2.2,
    0, 1.2, 0, 1.5, 4,
    0, 1.2, 0, 1.2, 1.5,
    0, 1.2, 0, 1.2, 2.2,
    0, 1.2, 0, 1.5, 1.2
  ]),
  high: Object.freeze([
    0, 1.5, 0, 3, 0,
    0, 2, 0, 1.5, 0,
    0, 2, 0, 6, 0,
    0, 1.5, 0, 3, 0,
    0, 2, 0, 0, 1.5
  ]),
  risky: Object.freeze([
    0, 0, 2, 0, 0,
    0, 0, 0, 3, 0,
    0, 0, 0, 0, 0,
    4, 0, 0, 0, 0,
    0, 0, 15, 0, 0
  ])
});

/** Compatibility alias used by renderers that call sector values payouts. */
export const PAYOUTS = RISK_TABLES;

function finiteNumber(value, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError(`${name} must be a finite number`);
  return numeric;
}

function powerOfTen(power) {
  if (!Number.isInteger(power) || power < 0) throw new RangeError("decimalPower must be a non-negative integer");
  return 10n ** BigInt(power);
}

function normalizedExactMultiplier(numerator, decimalPower) {
  let exactNumerator;
  try {
    exactNumerator = BigInt(numerator);
  } catch {
    throw new TypeError("exact multiplier numerator must be an integer string");
  }
  if (exactNumerator < 0n) throw new RangeError("exact multiplier must be non-negative");
  let power = Number(decimalPower);
  if (!Number.isInteger(power) || power < 0) throw new RangeError("decimalPower must be a non-negative integer");
  while (power > 0 && exactNumerator % 10n === 0n) {
    exactNumerator /= 10n;
    power -= 1;
  }
  return Object.freeze({ numerator: exactNumerator.toString(), decimalPower: power });
}

function parsedExactMultiplier(value, name = "multiplier") {
  if (value && typeof value === "object" && value.numerator !== undefined) {
    return normalizedExactMultiplier(value.numerator, value.decimalPower ?? 0);
  }
  if (typeof value === "bigint") return normalizedExactMultiplier(value, 0);
  const numeric = finiteNumber(value, name);
  if (numeric < 0) throw new RangeError(`${name} must be non-negative`);
  const text = String(numeric).toLowerCase();
  const match = text.match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!match) throw new TypeError(`${name} must be a non-negative decimal`);
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  let numerator = BigInt(`${match[1]}${fraction}` || "0");
  let decimalPower = fraction.length - exponent;
  if (decimalPower < 0) {
    numerator *= powerOfTen(-decimalPower);
    decimalPower = 0;
  }
  return normalizedExactMultiplier(numerator, decimalPower);
}

export const EXACT_ZERO_MULTIPLIER = Object.freeze({ numerator: "0", decimalPower: 0 });
export const EXACT_ONE_MULTIPLIER = Object.freeze({ numerator: "1", decimalPower: 0 });
export const EXACT_MAX_MULTIPLIER = Object.freeze({ numerator: String(MAX_MULTIPLIER), decimalPower: 0 });

export function compareExactMultipliers(left, right) {
  const a = parsedExactMultiplier(left, "left multiplier");
  const b = parsedExactMultiplier(right, "right multiplier");
  const power = Math.max(a.decimalPower, b.decimalPower);
  const aNumerator = BigInt(a.numerator) * powerOfTen(power - a.decimalPower);
  const bNumerator = BigInt(b.numerator) * powerOfTen(power - b.decimalPower);
  return aNumerator < bNumerator ? -1 : aNumerator > bNumerator ? 1 : 0;
}

/** JSON-safe exact decimal representation; no BigInt escapes this function. */
export function createExactMultiplier(value = 1) {
  const exact = parsedExactMultiplier(value);
  return compareExactMultipliers(exact, EXACT_MAX_MULTIPLIER) > 0
    ? EXACT_MAX_MULTIPLIER
    : exact;
}

export function exactMultiplierToString(value) {
  const exact = parsedExactMultiplier(value);
  if (exact.decimalPower === 0) return exact.numerator;
  const digits = exact.numerator.padStart(exact.decimalPower + 1, "0");
  const split = digits.length - exact.decimalPower;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

export function exactMultiplierToNumber(value) {
  return Number(exactMultiplierToString(value));
}

export function multiplyExactMultiplier(current, factor) {
  const left = parsedExactMultiplier(current, "current multiplier");
  const right = parsedExactMultiplier(factor, "outcome multiplier");
  if (left.numerator === "0" || right.numerator === "0") return EXACT_ZERO_MULTIPLIER;
  const product = normalizedExactMultiplier(
    BigInt(left.numerator) * BigInt(right.numerator),
    left.decimalPower + right.decimalPower
  );
  return compareExactMultipliers(product, EXACT_MAX_MULTIPLIER) >= 0
    ? EXACT_MAX_MULTIPLIER
    : product;
}

export const accumulateExactMultiplier = multiplyExactMultiplier;

function roundToScale(value, scale) {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * scale) / scale;
}

function normalizedRisk(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateRisk(value) {
  const risk = normalizedRisk(value);
  if (!RISKS.includes(risk)) throw new RangeError(`Unsupported Wheel risk: ${value}`);
  return risk;
}

export function isValidRisk(value) {
  return RISKS.includes(normalizedRisk(value));
}

export function riskTableFor(risk) {
  return RISK_TABLES[validateRisk(risk)];
}

export function riskDistributionFor(risk) {
  return RISK_DISTRIBUTIONS[validateRisk(risk)];
}

export function countOutcomes(table) {
  if (!Array.isArray(table)) throw new TypeError("Wheel table must be an array");
  const counts = {};
  for (const raw of table) {
    const multiplier = finiteNumber(raw, "sector multiplier");
    if (multiplier < 0) throw new RangeError("sector multipliers must be non-negative");
    const key = String(multiplier);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

export const RISK_COUNTS = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [risk, countOutcomes(RISK_TABLES[risk])])
));

export function meanMultiplier(table) {
  if (!Array.isArray(table) || table.length === 0) {
    throw new TypeError("Wheel table must be a non-empty array");
  }
  const total = table.reduce((sum, raw) => {
    const multiplier = finiteNumber(raw, "sector multiplier");
    if (multiplier < 0) throw new RangeError("sector multipliers must be non-negative");
    return sum + multiplier;
  }, 0);
  return roundToScale(total / table.length, MULTIPLIER_SCALE);
}

export function rtpForRisk(risk) {
  return meanMultiplier(riskTableFor(risk));
}

/** Derived from RISK_TABLES rather than duplicated as hand-entered constants. */
export const RTP_BY_RISK = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [risk, rtpForRisk(risk)])
));

export function nonzeroMultipliersFor(risk) {
  return Object.freeze([...new Set(riskTableFor(risk).filter((value) => value > 0))].sort((a, b) => a - b));
}

export function categoryForMultiplier(risk, multiplier) {
  const numeric = finiteNumber(multiplier, "multiplier");
  if (numeric === 0) return OUTCOME_CATEGORIES[0];
  const rank = nonzeroMultipliersFor(risk).indexOf(numeric);
  if (rank < 0) throw new RangeError(`${numeric}x is not present in the ${risk} table`);
  return OUTCOME_CATEGORIES[rank + 1];
}

/** Exact rendered color/category order, derived from the indexed payout table. */
export const SECTOR_CATEGORIES = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [
    risk,
    Object.freeze(RISK_TABLES[risk].map((multiplier) => categoryForMultiplier(risk, multiplier)))
  ])
));

export function assertRiskTables(tables = RISK_TABLES) {
  for (const risk of RISKS) {
    const table = tables?.[risk];
    if (!Array.isArray(table) || table.length !== SECTOR_COUNT) {
      throw new Error(`Wheel ${risk} must contain exactly ${SECTOR_COUNT} sectors`);
    }
    const actualCounts = countOutcomes(table);
    for (const { multiplier, count } of RISK_DISTRIBUTIONS[risk]) {
      if ((actualCounts[String(multiplier)] ?? 0) !== count) {
        throw new Error(`Wheel ${risk} must contain ${count} sectors at ${multiplier}x`);
      }
    }
    if (Object.values(actualCounts).reduce((sum, count) => sum + count, 0) !== SECTOR_COUNT) {
      throw new Error(`Wheel ${risk} contains an unexpected multiplier`);
    }
  }
  if (RTP_BY_RISK.low !== PUBLISHED_MAX_RTP) {
    throw new Error("Low risk must match Rainbet's published Max RTP");
  }
  for (const risk of ["medium", "high", "risky"]) {
    if (RTP_BY_RISK[risk] !== 0.96) throw new Error(`Wheel ${risk} must derive to 0.96 RTP`);
  }
  return true;
}

export function validateRiskTables(tables = RISK_TABLES) {
  try {
    assertRiskTables(tables);
    return true;
  } catch {
    return false;
  }
}

export function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return roundToScale(numeric, CURRENCY_SCALE);
}

/**
 * Round an exact rational amount to the nearest integer unit. Ties move away
 * from zero, matching Math.round for the non-negative payout values used by
 * the Wheel while keeping controller settlement free of floating-point math.
 */
export function roundRationalUnits(numerator, denominator = 1n) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (bottom <= 0n) throw new RangeError("Rational-unit denominator must be positive");
  const negative = top < 0n;
  const absolute = negative ? -top : top;
  const rounded = (absolute + bottom / 2n) / bottom;
  return negative ? -rounded : rounded;
}

export function roundSignedCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  return roundToScale(numeric, CURRENCY_SCALE);
}

export function roundMultiplier(value) {
  const numeric = value && typeof value === "object"
    ? exactMultiplierToNumber(value)
    : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return roundToScale(Math.min(numeric, MAX_MULTIPLIER), MULTIPLIER_SCALE);
}

export function roundDisplayCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return roundToScale(numeric, 100);
}

export function roundDisplayMultiplier(value) {
  const numeric = value && typeof value === "object"
    ? exactMultiplierToNumber(value)
    : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return roundToScale(Math.min(numeric, MAX_MULTIPLIER), 100);
}

export function formatCurrency(value) {
  return `$${roundDisplayCurrency(Math.max(0, Number(value) || 0)).toFixed(2)}`;
}

export function formatBalance(value) {
  return roundCurrency(value).toFixed(8);
}

export function formatMultiplier(value) {
  return `${roundDisplayMultiplier(value).toFixed(2)}×`;
}

export function clampWager(value) {
  const amount = roundCurrency(value);
  if (amount <= 0) return 0;
  return Math.min(MAX_WAGER, Math.max(MIN_WAGER, amount));
}

export function isValidWager(value) {
  const amount = roundCurrency(value);
  return amount >= MIN_WAGER && amount <= MAX_WAGER;
}

export function wagerValidation(value, balance = Number.POSITIVE_INFINITY) {
  const amount = roundCurrency(value);
  const available = Number.isFinite(Number(balance)) ? roundCurrency(balance) : Number.POSITIVE_INFINITY;
  let reason = null;
  if (amount < MIN_WAGER) reason = "minimum";
  else if (amount > MAX_WAGER) reason = "maximum";
  else if (amount > available) reason = "balance";
  return Object.freeze({ valid: reason === null, reason, wager: amount, balance: available });
}

export function cappedMultiplier(value) {
  return exactMultiplierToNumber(createExactMultiplier(value ?? 0));
}

export function accumulateMultiplier(currentMultiplier, outcomeMultiplier) {
  return exactMultiplierToNumber(multiplyExactMultiplier(currentMultiplier, outcomeMultiplier));
}

export function payoutFor(wager, multiplier) {
  const amount = roundCurrency(wager);
  const product = roundCurrency(amount * cappedMultiplier(multiplier));
  return Math.min(MAX_CASH_PAYOUT, product);
}

export function profitFor(wager, multiplier) {
  return roundSignedCurrency(payoutFor(wager, multiplier) - roundCurrency(wager));
}

export function legendMultipliersFor(risk, currentMultiplier = 1) {
  const current = createExactMultiplier(currentMultiplier);
  return Object.freeze(nonzeroMultipliersFor(risk).map((multiplier) => (
    exactMultiplierToNumber(multiplyExactMultiplier(current, multiplier))
  )));
}

export function exactLegendMultipliersFor(risk, currentMultiplier = EXACT_ONE_MULTIPLIER) {
  const current = createExactMultiplier(currentMultiplier);
  return Object.freeze(nonzeroMultipliersFor(risk).map((multiplier) => (
    multiplyExactMultiplier(current, multiplier)
  )));
}

export function placeLocalWager(balance, wager) {
  const available = roundCurrency(balance);
  const validation = wagerValidation(wager, available);
  if (!validation.valid) {
    return Object.freeze({ accepted: false, balance: available, wager: validation.wager, reason: validation.reason });
  }
  return Object.freeze({
    accepted: true,
    balance: roundCurrency(available - validation.wager),
    wager: validation.wager,
    reason: null
  });
}

export function settleLocalWager(balance, wager, multiplier) {
  const available = roundCurrency(balance);
  const payout = payoutFor(wager, multiplier);
  return Object.freeze({ balance: roundCurrency(available + payout), payout });
}

function validSectorIndex(index) {
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= SECTOR_COUNT) {
    throw new RangeError(`Wheel sector index must be between 0 and ${SECTOR_COUNT - 1}`);
  }
  return numeric;
}

export function outcomeForIndex(risk, index) {
  const normalized = validateRisk(risk);
  const sectorIndex = validSectorIndex(index);
  return Object.freeze({
    risk: normalized,
    index: sectorIndex,
    multiplier: RISK_TABLES[normalized][sectorIndex],
    probability: 1 / SECTOR_COUNT
  });
}

/** Uniform bounded selection without modulo bias. */
export function cryptoBoundedIndex(bound = SECTOR_COUNT, cryptoSource = globalThis.crypto) {
  const upperBound = Number(bound);
  if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > UINT32_RANGE) {
    throw new RangeError(`bound must be an integer from 1 to ${UINT32_RANGE}`);
  }
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new Error("A cryptographic getRandomValues source is required");
  }
  const acceptanceLimit = Math.floor(UINT32_RANGE / upperBound) * upperBound;
  const sample = new Uint32Array(1);
  for (let attempt = 0; attempt < MAX_RANDOM_REJECTIONS; attempt += 1) {
    cryptoSource.getRandomValues(sample);
    if (sample[0] < acceptanceLimit) return sample[0] % upperBound;
  }
  throw new Error("Cryptographic source did not produce an in-range sample");
}

export function randomSectorIndex(cryptoSource = globalThis.crypto) {
  return cryptoBoundedIndex(SECTOR_COUNT, cryptoSource);
}

export function selectCryptoOutcome(risk, cryptoSource = globalThis.crypto) {
  return outcomeForIndex(risk, randomSectorIndex(cryptoSource));
}

/** Normal gameplay has no forced-result parameter by design. */
export function resolveWheelOutcome(options = {}) {
  if (options && typeof options === "object") {
    for (const forbidden of ["index", "forcedIndex", "multiplier", "forcedMultiplier"]) {
      if (Object.prototype.hasOwnProperty.call(options, forbidden)) {
        throw new Error("Forced outcomes require resolveForcedOutcome and a debug-only caller");
      }
    }
  }
  const { risk = "low", cryptoSource = globalThis.crypto } = options;
  return selectCryptoOutcome(risk, cryptoSource);
}

/** Explicit debug-only entry point used by fixed states and test tooling. */
export function resolveForcedOutcome({ risk = "low", index } = {}) {
  return outcomeForIndex(risk, index);
}

export const forcedOutcomeForDebug = resolveForcedOutcome;

function freezeRoundState(state) {
  return Object.freeze({ ...state });
}

function normalizedRoundNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizedRoundId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createRoundState(options = {}) {
  const risk = validateRisk(options.risk ?? "low");
  const demo = options.demo === true;
  const requestedWager = roundCurrency(options.wager);
  const wager = isValidWager(requestedWager) || (demo && requestedWager === 0)
    ? requestedWager
    : 0;
  return freezeRoundState({
    risk,
    demo,
    phase: ROUND_PHASES.idle,
    round: normalizedRoundNumber(options.round),
    roundId: null,
    wager,
    spin: 0,
    spinsCompleted: 0,
    exactMultiplier: EXACT_ONE_MULTIPLIER,
    currentMultiplier: 1,
    accumulatedMultiplier: 1,
    sectorIndex: null,
    outcomeMultiplier: null,
    payout: 0,
    result: null,
    terminalReason: null
  });
}

export function canSpin(state, options = {}) {
  if (!state) return false;
  if (state.phase === ROUND_PHASES.idle) {
    const demo = options.demo ?? state.demo;
    const wager = roundCurrency(options.wager ?? state.wager);
    return demo === true ? wager === 0 || isValidWager(wager) : isValidWager(wager);
  }
  if (!state.demo && !isValidWager(state.wager)) return false;
  return state.phase === ROUND_PHASES.active && state.spinsCompleted < MAX_SPINS;
}

export function cashoutEligible(state) {
  if (!state || state.spinsCompleted < 1 || state.currentMultiplier <= 0) return false;
  return state.phase === ROUND_PHASES.active || state.phase === ROUND_PHASES.maxed;
}

export const canCashOut = cashoutEligible;

export function startSpin(state, options = {}) {
  if (!canSpin(state, options)) return state;
  const firstSpin = state.phase === ROUND_PHASES.idle;
  const demo = firstSpin ? (options.demo ?? state.demo) === true : state.demo;
  const risk = firstSpin ? validateRisk(options.risk ?? state.risk) : state.risk;
  const requestedWager = firstSpin ? (options.wager ?? state.wager) : state.wager;
  if (!demo && !isValidWager(requestedWager)) return state;
  if (demo && roundCurrency(requestedWager) !== 0 && !isValidWager(requestedWager)) return state;
  return freezeRoundState({
    ...state,
    risk,
    demo,
    phase: ROUND_PHASES.spinning,
    round: firstSpin ? state.round + 1 : state.round,
    roundId: firstSpin ? normalizedRoundId(options.roundId) : state.roundId,
    wager: roundCurrency(requestedWager),
    spin: state.spinsCompleted + 1,
    sectorIndex: null,
    outcomeMultiplier: null,
    payout: firstSpin ? 0 : state.payout,
    result: null,
    terminalReason: null
  });
}

export const beginSpin = startSpin;

function verifiedOutcomeForState(state, outcome) {
  if (outcome && typeof outcome === "object" && outcome.index !== undefined) {
    const resolved = outcomeForIndex(state.risk, outcome.index);
    if (outcome.multiplier !== undefined && Number(outcome.multiplier) !== resolved.multiplier) {
      throw new RangeError("Outcome multiplier does not match the selected sector");
    }
    return resolved;
  }
  return outcomeForIndex(state.risk, outcome);
}

export function resolveSpin(state, outcome) {
  if (!state || state.phase !== ROUND_PHASES.spinning) return state;
  const resolved = verifiedOutcomeForState(state, outcome);
  const lost = resolved.multiplier === 0;
  const exactMultiplier = lost
    ? EXACT_ZERO_MULTIPLIER
    : multiplyExactMultiplier(
      state.exactMultiplier ?? createExactMultiplier(state.currentMultiplier),
      resolved.multiplier
    );
  const currentMultiplier = exactMultiplierToNumber(exactMultiplier);
  const payout = lost ? 0 : payoutFor(state.wager, exactMultiplier);
  const spinsCompleted = state.spin;
  let terminalReason = null;
  if (lost) terminalReason = "loss";
  else if (currentMultiplier >= MAX_MULTIPLIER) terminalReason = "max-multiplier";
  else if (payout >= MAX_CASH_PAYOUT) terminalReason = "max-payout";
  else if (spinsCompleted >= MAX_SPINS) terminalReason = "max-spins";
  return freezeRoundState({
    ...state,
    phase: ROUND_PHASES.revealing,
    spinsCompleted,
    exactMultiplier,
    currentMultiplier,
    accumulatedMultiplier: currentMultiplier,
    sectorIndex: resolved.index,
    outcomeMultiplier: resolved.multiplier,
    payout,
    result: lost ? "loss" : "safe",
    terminalReason
  });
}

export function finishReveal(state) {
  if (!state || state.phase !== ROUND_PHASES.revealing) return state;
  if (state.result === "loss") return freezeRoundState({ ...state, phase: ROUND_PHASES.lost });
  const phase = state.terminalReason ? ROUND_PHASES.maxed : ROUND_PHASES.active;
  return freezeRoundState({ ...state, phase });
}

export function beginCashout(state) {
  if (!cashoutEligible(state)) return state;
  return freezeRoundState({ ...state, phase: ROUND_PHASES.cashing, result: "cashout" });
}

export function finishCashout(state) {
  if (!state || state.phase !== ROUND_PHASES.cashing) return state;
  return freezeRoundState({
    ...state,
    phase: ROUND_PHASES.cashed,
    payout: payoutFor(state.wager, state.exactMultiplier ?? state.currentMultiplier),
    result: "cashout"
  });
}

export function cashOutRound(state) {
  return finishCashout(beginCashout(state));
}

export function resetRound(state, options = {}) {
  if (!state) return createRoundState(options);
  const unresolved = [
    ROUND_PHASES.spinning,
    ROUND_PHASES.revealing,
    ROUND_PHASES.active,
    ROUND_PHASES.maxed,
    ROUND_PHASES.cashing
  ].includes(state.phase);
  if (unresolved && options.debug !== true) return state;
  const risk = validateRisk(options.risk ?? state.risk);
  const demo = (options.demo ?? state.demo) === true;
  const requestedWager = options.wager ?? state.wager;
  const roundedWager = roundCurrency(requestedWager);
  const wager = isValidWager(roundedWager) || (demo && roundedWager === 0)
    ? roundedWager
    : 0;
  return freezeRoundState({
    ...state,
    risk,
    demo,
    phase: ROUND_PHASES.idle,
    roundId: null,
    wager,
    spin: 0,
    spinsCompleted: 0,
    exactMultiplier: EXACT_ONE_MULTIPLIER,
    currentMultiplier: 1,
    accumulatedMultiplier: 1,
    sectorIndex: null,
    outcomeMultiplier: null,
    payout: 0,
    result: null,
    terminalReason: null
  });
}

export function controlsLocked(stateOrPhase) {
  const phase = typeof stateOrPhase === "string" ? stateOrPhase : stateOrPhase?.phase;
  return [ROUND_PHASES.spinning, ROUND_PHASES.revealing, ROUND_PHASES.cashing].includes(phase);
}

export function roundPhaseLocks(stateOrPhase) {
  const phase = typeof stateOrPhase === "string" ? stateOrPhase : stateOrPhase?.phase;
  const locked = controlsLocked(phase);
  const roundOpen = [ROUND_PHASES.active, ROUND_PHASES.maxed].includes(phase);
  return Object.freeze({
    wager: locked || roundOpen,
    risk: locked || roundOpen,
    mode: locked || roundOpen,
    spin: locked || phase === ROUND_PHASES.maxed || phase === ROUND_PHASES.lost || phase === ROUND_PHASES.cashed,
    cashout: locked || ![ROUND_PHASES.active, ROUND_PHASES.maxed].includes(phase)
  });
}

function validRoundId(roundId) {
  const id = normalizedRoundId(roundId);
  if (!id) throw new TypeError("A non-empty roundId is required");
  return id;
}

function freezeOpenRounds(openRounds) {
  const entries = Object.entries(openRounds).map(([id, entry]) => [id, Object.freeze({ ...entry })]);
  return Object.freeze(Object.fromEntries(entries));
}

function freezeWalletState(state) {
  return Object.freeze({ ...state, openRounds: freezeOpenRounds(state.openRounds ?? {}) });
}

export function createWalletState(balance = LOCAL_STARTING_BALANCE) {
  return freezeWalletState({ version: 1, balance: roundCurrency(balance), openRounds: {} });
}

export function sanitizeWalletState(state, fallbackBalance = LOCAL_STARTING_BALANCE) {
  if (!state || typeof state !== "object") return createWalletState(fallbackBalance);
  const parsedBalance = Number(state.balance);
  const balance = Number.isFinite(parsedBalance) && parsedBalance >= 0
    ? roundCurrency(parsedBalance)
    : roundCurrency(fallbackBalance);
  const openRounds = {};
  if (state.openRounds && typeof state.openRounds === "object") {
    for (const [rawId, entry] of Object.entries(state.openRounds)) {
      const id = normalizedRoundId(rawId);
      if (!id || !entry || typeof entry !== "object" || !isValidWager(entry.wager)) continue;
      openRounds[id] = {
        owner: typeof entry.owner === "string" ? entry.owner : "",
        wager: roundCurrency(entry.wager),
        createdAt: Math.max(0, Math.floor(Number(entry.createdAt) || 0))
      };
    }
  }
  return freezeWalletState({ version: 1, balance, openRounds });
}

export function debitRoundOnce(walletState, { roundId, owner = "", wager, createdAt = 0, demo = false } = {}) {
  const wallet = sanitizeWalletState(walletState);
  if (demo === true) {
    const amount = roundCurrency(wager);
    const accepted = amount === 0 || isValidWager(amount);
    return Object.freeze({
      wallet,
      accepted,
      debited: false,
      conflict: false,
      demo: true,
      balance: wallet.balance,
      wager: amount,
      reason: accepted ? null : "wager"
    });
  }
  const id = validRoundId(roundId);
  const amount = roundCurrency(wager);
  const existing = wallet.openRounds[id];
  if (existing) {
    const matches = existing.owner === String(owner) && existing.wager === amount;
    return Object.freeze({
      wallet,
      accepted: matches,
      debited: false,
      conflict: !matches,
      balance: wallet.balance,
      wager: existing.wager
    });
  }
  const placement = placeLocalWager(wallet.balance, amount);
  if (!placement.accepted) {
    return Object.freeze({
      wallet,
      accepted: false,
      debited: false,
      conflict: false,
      balance: wallet.balance,
      wager: amount,
      reason: placement.reason
    });
  }
  const nextWallet = freezeWalletState({
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
  });
  return Object.freeze({
    wallet: nextWallet,
    accepted: true,
    debited: true,
    conflict: false,
    balance: nextWallet.balance,
    wager: placement.wager,
    reason: null
  });
}

export function creditRoundOnce(walletState, { roundId, multiplier = 0, demo = false } = {}) {
  const wallet = sanitizeWalletState(walletState);
  if (demo === true) {
    return Object.freeze({
      wallet,
      settled: true,
      credited: false,
      demo: true,
      balance: wallet.balance,
      payout: 0
    });
  }
  const id = validRoundId(roundId);
  const entry = wallet.openRounds[id];
  if (!entry) {
    return Object.freeze({
      wallet,
      settled: false,
      credited: false,
      balance: wallet.balance,
      payout: 0
    });
  }
  const settlement = settleLocalWager(wallet.balance, entry.wager, multiplier);
  const openRounds = { ...wallet.openRounds };
  delete openRounds[id];
  const nextWallet = freezeWalletState({ ...wallet, balance: settlement.balance, openRounds });
  return Object.freeze({
    wallet: nextWallet,
    settled: true,
    credited: settlement.payout > 0,
    balance: nextWallet.balance,
    payout: settlement.payout
  });
}

export const settleRoundOnce = creditRoundOnce;

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
  const nextWallet = freezeWalletState({
    ...wallet,
    balance: roundCurrency(wallet.balance + refund),
    openRounds
  });
  return Object.freeze({
    wallet: nextWallet,
    recovered: recoveredRoundIds.length,
    recoveredRoundIds: Object.freeze(recoveredRoundIds),
    refund,
    balance: nextWallet.balance
  });
}

export function recoverInterruptedRound(walletState, roundId) {
  return recoverInterruptedRounds(walletState, { roundIds: [validRoundId(roundId)] });
}

function normalizedAutoRule(value) {
  return value === AUTO_RULES.increase ? AUTO_RULES.increase : AUTO_RULES.reset;
}

function normalizedPercentage(value) {
  return Math.min(1_000_000, Math.max(0, Number(value) || 0));
}

export function normalizeAutoConfig(options = {}) {
  return Object.freeze({
    maxSpins: Math.min(MAX_SPINS, Math.max(1, Math.floor(Number(options.maxSpins ?? options.maxRounds) || 1))),
    betLimit: Math.max(0, Math.floor(Number(options.betLimit ?? options.numberOfBets) || 0)),
    onWin: normalizedAutoRule(options.onWin),
    onLoss: normalizedAutoRule(options.onLoss),
    winIncrease: normalizedPercentage(options.winIncrease),
    lossIncrease: normalizedPercentage(options.lossIncrease),
    stopOnProfit: roundCurrency(options.stopOnProfit),
    stopOnLoss: roundCurrency(options.stopOnLoss)
  });
}

export function autoRoundProfit(wager, multiplier) {
  return profitFor(wager, multiplier);
}

export function nextAutoWager({
  baseWager,
  currentWager,
  won,
  onWin = AUTO_RULES.reset,
  onLoss = AUTO_RULES.reset,
  winIncrease = 0,
  lossIncrease = 0
} = {}) {
  const base = isValidWager(baseWager) ? roundCurrency(baseWager) : clampWager(baseWager);
  const current = isValidWager(currentWager) ? roundCurrency(currentWager) : base;
  const rule = won ? normalizedAutoRule(onWin) : normalizedAutoRule(onLoss);
  if (rule !== AUTO_RULES.increase) return base;
  const percent = normalizedPercentage(won ? winIncrease : lossIncrease);
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

export function autoRoundAction(state, configOptions = {}) {
  const config = normalizeAutoConfig(configOptions);
  if (!state) return "stop";
  if (state.phase === ROUND_PHASES.lost || state.phase === ROUND_PHASES.cashed) return "complete";
  if (state.phase === ROUND_PHASES.maxed) return "cashout";
  if (state.phase === ROUND_PHASES.active) {
    return state.spinsCompleted >= config.maxSpins ? "cashout" : "spin";
  }
  if (state.phase === ROUND_PHASES.idle) return "spin";
  return "wait";
}

export function assertRoundState(state) {
  if (!state || typeof state !== "object") throw new TypeError("round state must be an object");
  validateRisk(state.risk);
  if (typeof state.demo !== "boolean") throw new Error("round state must explicitly identify demo play");
  if (!Object.values(ROUND_PHASES).includes(state.phase)) throw new Error(`Unknown round phase: ${state.phase}`);
  if (!Number.isInteger(state.spinsCompleted) || state.spinsCompleted < 0 || state.spinsCompleted > MAX_SPINS) {
    throw new Error(`spinsCompleted must be between 0 and ${MAX_SPINS}`);
  }
  if (state.currentMultiplier < 0 || state.currentMultiplier > MAX_MULTIPLIER) {
    throw new Error(`currentMultiplier must not exceed ${MAX_MULTIPLIER}`);
  }
  const exactMultiplier = createExactMultiplier(state.exactMultiplier ?? state.currentMultiplier);
  if (exactMultiplierToNumber(exactMultiplier) !== state.currentMultiplier) {
    throw new Error("numeric currentMultiplier must derive from exactMultiplier");
  }
  if (state.payout < 0 || state.payout > MAX_CASH_PAYOUT) {
    throw new Error(`payout must not exceed ${MAX_CASH_PAYOUT}`);
  }
  if (state.phase === ROUND_PHASES.active && state.spinsCompleted < 1) {
    throw new Error("an active round must contain a safe revealed spin");
  }
  if (!state.demo && state.phase !== ROUND_PHASES.idle && !isValidWager(state.wager)) {
    throw new Error("paid rounds require a wager within the published limits");
  }
  if (state.demo && state.wager !== 0 && !isValidWager(state.wager)) {
    throw new Error("demo wager must be zero or within the visible input limits");
  }
  if (state.phase === ROUND_PHASES.lost && state.currentMultiplier !== 0) {
    throw new Error("a lost round must have a zero multiplier");
  }
  return true;
}

export function assertEngineInvariants() {
  assertRiskTables();
  if (SECTOR_COUNT !== 25 || MAX_SPINS !== 10) throw new Error("Wheel cardinality invariants changed");
  if (MAX_MULTIPLIER !== 10_000 || MAX_CASH_PAYOUT !== 500_000) {
    throw new Error("Wheel cap invariants changed");
  }
  const maximum = payoutFor(MAX_WAGER, MAX_MULTIPLIER);
  if (maximum !== MAX_CASH_PAYOUT) throw new Error("cash payout cap is not enforced");
  let exactPath = EXACT_ONE_MULTIPLIER;
  for (let spin = 0; spin < MAX_SPINS; spin += 1) exactPath = multiplyExactMultiplier(exactPath, 1.1);
  if (exactPath.numerator !== "25937424601" || exactPath.decimalPower !== 10) {
    throw new Error("progressive multiplier must not round between spins");
  }
  JSON.stringify(exactPath);
  const demo = startSpin(createRoundState({ risk: "low", demo: true }), { wager: 0, demo: true });
  if (demo.phase !== ROUND_PHASES.spinning || demo.wager !== 0 || demo.demo !== true) {
    throw new Error("explicit zero-value demo rounds must remain playable");
  }
  const paidZero = startSpin(createRoundState({ risk: "low" }), { wager: 0 });
  if (paidZero.phase !== ROUND_PHASES.idle) throw new Error("paid zero-value rounds must remain invalid");
  return true;
}

assertEngineInvariants();
