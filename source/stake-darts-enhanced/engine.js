const TAU = Math.PI * 2;
const UINT32_RANGE = 0x1_0000_0000;
const CURRENCY_SCALE = 100_000_000;

export const HOUSE_RETURN = 0.98;
export const LOCAL_STARTING_BALANCE = 0;
export const MINIMUM_BET = 0.1;
export const BOARD_RADIUS = 0.5;
export const SEGMENT_COUNT = 18;
export const SEGMENT_ROTATION = 0;

export const ZONES = Object.freeze([
  Object.freeze({ index: 0, id: "outer-core", color: "slate" }),
  Object.freeze({ index: 1, id: "inner-ring", color: "silver" }),
  Object.freeze({ index: 2, id: "yellow", color: "yellow" }),
  Object.freeze({ index: 3, id: "orange", color: "orange" }),
  Object.freeze({ index: 4, id: "red", color: "red" }),
  Object.freeze({ index: 5, id: "bull", color: "green" })
]);

const DIFFICULTY_SOURCE = Object.freeze({
  easy: Object.freeze({
    label: "Easy",
    multipliers: Object.freeze([0.5, 0.8, 1.2, 1.5, 2.7, 8.5]),
    probabilities: Object.freeze([47.6875, 26, 12.375, 6.875, 5.5, 1.5625]),
    coreRadius: 0.55,
    segmentCounts: Object.freeze([9, 5, 4])
  }),
  medium: Object.freeze({
    label: "Medium",
    multipliers: Object.freeze([0.4, 0.6, 1.3, 3.1, 6, 16]),
    probabilities: Object.freeze([55.25, 28.75, 7.5, 4.1667, 3.3333, 1]),
    coreRadius: 0.45,
    segmentCounts: Object.freeze([9, 5, 4])
  }),
  hard: Object.freeze({
    label: "Hard",
    multipliers: Object.freeze([0.2, 0.5, 2.5, 3.6, 8.8, 63]),
    probabilities: Object.freeze([59.39, 27.56, 6.345, 4.23, 2.115, 0.36]),
    coreRadius: 0.41,
    segmentCounts: Object.freeze([9, 6, 3])
  }),
  expert: Object.freeze({
    label: "Expert",
    multipliers: Object.freeze([0.1, 0.5, 4.8, 9.6, 42, 500]),
    probabilities: Object.freeze([68.71, 25.41, 3.8933, 1.2978, 0.6489, 0.04]),
    coreRadius: 0.5,
    segmentCounts: Object.freeze([12, 4, 2])
  })
});

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function distributeSegments(counts) {
  const observedPatterns = {
    "9,5,4": "YOYRYOYRYOYRYOYOYR",
    "9,6,3": "YOYOYRYOYOYRYOYOYR",
    "12,4,2": "YOYYRYYOYYOYYRYYOY"
  };
  const observed = observedPatterns[counts.join(",")];
  if (observed) {
    const outcomeByColor = { Y: 2, O: 3, R: 4 };
    return Object.freeze([...observed].map((color) => outcomeByColor[color]));
  }
  const placed = [0, 0, 0];
  const result = [];
  for (let position = 0; position < SEGMENT_COUNT; position += 1) {
    let selected = 0;
    let greatestNeed = Number.NEGATIVE_INFINITY;
    for (let candidate = 0; candidate < counts.length; candidate += 1) {
      const desired = (counts[candidate] * (position + 1)) / SEGMENT_COUNT;
      const need = desired - placed[candidate];
      if (need > greatestNeed) {
        greatestNeed = need;
        selected = candidate;
      }
    }
    placed[selected] += 1;
    result.push(selected + 2);
  }
  return Object.freeze(result);
}

function createDifficulty(id, source) {
  const chances = source.probabilities.map((probability) => probability / 100);
  const bullRadius = Math.sqrt(chances[5]);
  const innerRadius = Math.sqrt(source.coreRadius ** 2 + chances[1]);
  const coloredChance = chances[2] + chances[3] + chances[4];
  const outerRadius = Math.sqrt(innerRadius ** 2 + coloredChance);
  return Object.freeze({
    id,
    label: source.label,
    multipliers: source.multipliers,
    probabilities: source.probabilities,
    chances: Object.freeze(chances),
    coreRadius: source.coreRadius,
    segmentCounts: source.segmentCounts,
    segmentPattern: distributeSegments(source.segmentCounts),
    geometry: Object.freeze({
      bullRadius,
      coreRadius: source.coreRadius,
      innerRadius,
      outerRadius
    })
  });
}

export const DIFFICULTIES = Object.freeze(
  Object.fromEntries(
    Object.entries(DIFFICULTY_SOURCE).map(([id, source]) => [id, createDifficulty(id, source)])
  )
);

function difficultyConfig(difficulty) {
  return DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
}

function clampUnit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return positiveModulo(numeric, 1);
}

function rotationFromPoint(point) {
  if (Number.isFinite(point.rotationFloat)) return normalizeRotation(point.rotationFloat);
  const angle = Number.isFinite(point.angle) ? point.angle : Math.atan2(Number(point.y) || 0, Number(point.x) || 0);
  return normalizeRotation((angle + Math.PI / 2) / TAU);
}

function normalizedRadiusFromPoint(point) {
  if (Number.isFinite(point.normalizedRadius)) return Math.max(0, Number(point.normalizedRadius));
  if (Number.isFinite(point.radius)) return Math.max(0, Number(point.radius)) / BOARD_RADIUS;
  return Math.hypot(Number(point.x) || 0, Number(point.y) || 0) / BOARD_RADIUS;
}

function segmentForRotation(rotationFloat) {
  return Math.min(
    SEGMENT_COUNT - 1,
    Math.floor(normalizeRotation(rotationFloat + SEGMENT_ROTATION) * SEGMENT_COUNT)
  );
}

function classificationResult(config, index, normalizedRadius, rotationFloat, segment = null) {
  const zone = ZONES[index];
  return Object.freeze({
    difficulty: config.id,
    index,
    zone: zone.id,
    color: zone.color,
    multiplier: config.multipliers[index],
    probability: config.probabilities[index],
    chance: config.chances[index],
    normalizedRadius,
    rotationFloat,
    segment
  });
}

export function geometryFor(difficulty = "medium") {
  return difficultyConfig(difficulty).geometry;
}

export function pointFromFloats(rotationFloat, distanceFloat) {
  const rotation = normalizeRotation(rotationFloat);
  const distance = clampUnit(distanceFloat);
  const normalizedRadius = Math.sqrt(distance);
  const radius = normalizedRadius * BOARD_RADIUS;
  const angle = rotation * TAU - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return Object.freeze({
    rotationFloat: rotation,
    distanceFloat: distance,
    angle,
    radius,
    normalizedRadius,
    x,
    y,
    boardX: BOARD_RADIUS + x,
    boardY: BOARD_RADIUS + y,
    xPercent: (BOARD_RADIUS + x) * 100,
    yPercent: (BOARD_RADIUS + y) * 100
  });
}

export function classifyPoint(difficulty, point) {
  const config = difficultyConfig(difficulty);
  const normalizedRadius = normalizedRadiusFromPoint(point ?? {});
  const rotationFloat = rotationFromPoint(point ?? {});
  if (normalizedRadius > 1) {
    return Object.freeze({
      difficulty: config.id,
      index: -1,
      zone: "outside",
      color: "transparent",
      multiplier: 0,
      probability: 0,
      chance: 0,
      normalizedRadius,
      rotationFloat,
      segment: null
    });
  }

  const { bullRadius, coreRadius, innerRadius, outerRadius } = config.geometry;
  if (normalizedRadius <= bullRadius) {
    return classificationResult(config, 5, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < coreRadius) {
    return classificationResult(config, 0, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < innerRadius) {
    return classificationResult(config, 1, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < outerRadius) {
    const segment = segmentForRotation(rotationFloat);
    return classificationResult(config, config.segmentPattern[segment], normalizedRadius, rotationFloat, segment);
  }
  return classificationResult(config, 0, normalizedRadius, rotationFloat);
}

export function resolveDart({ difficulty = "medium", rotationFloat = 0, distanceFloat = 0 } = {}) {
  const point = pointFromFloats(rotationFloat, distanceFloat);
  const outcome = classifyPoint(difficulty, point);
  return Object.freeze({ ...outcome, point });
}

export function theoreticalReturn(difficulty = "medium") {
  const config = difficultyConfig(difficulty);
  return config.multipliers.reduce(
    (returnValue, multiplier, index) => returnValue + multiplier * config.chances[index],
    0
  );
}

export function probabilityTotal(difficulty = "medium") {
  return difficultyConfig(difficulty).probabilities.reduce((total, probability) => total + probability, 0);
}

function hashSeed(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function seededUnit(seed, nonce, stream) {
  return hashSeed(`${String(seed)}\u0000${Math.max(0, Math.floor(Number(nonce) || 0))}\u0000${stream}`) / UINT32_RANGE;
}

export function seededFloats(seed = "stake-darts-debug", nonce = 0) {
  return Object.freeze({
    rotationFloat: seededUnit(seed, nonce, 0),
    distanceFloat: seededUnit(seed, nonce, 1)
  });
}

export function secureFloats(cryptoSource = globalThis.crypto) {
  if (!cryptoSource?.getRandomValues) throw new Error("Secure random values are unavailable");
  const values = new Uint32Array(2);
  cryptoSource.getRandomValues(values);
  return Object.freeze({
    rotationFloat: values[0] / UINT32_RANGE,
    distanceFloat: values[1] / UINT32_RANGE
  });
}

function outcomeIndex(config, outcome) {
  if (Number.isInteger(outcome) && outcome >= 0 && outcome < config.multipliers.length) return outcome;
  const numeric = Number(outcome);
  const multiplierIndex = config.multipliers.indexOf(numeric);
  if (multiplierIndex >= 0) return multiplierIndex;
  const zoneIndex = ZONES.findIndex((zone) => zone.id === outcome || zone.color === outcome);
  if (zoneIndex >= 0) return zoneIndex;
  throw new RangeError(`Unknown Darts outcome: ${String(outcome)}`);
}

function sampleSquaredRadius(minimum, maximum, unit) {
  const insetUnit = 0.04 + clampUnit(unit) * 0.92;
  return minimum + (maximum - minimum) * insetUnit;
}

export function debugFloatsForOutcome(difficulty = "medium", outcome = 0, seed = "stake-darts-debug", nonce = 0) {
  const config = difficultyConfig(difficulty);
  const index = outcomeIndex(config, outcome);
  const { bullRadius, coreRadius, innerRadius, outerRadius } = config.geometry;
  const radialUnit = seededUnit(seed, nonce, 2);
  const selectorUnit = seededUnit(seed, nonce, 3);
  let rotationFloat = seededUnit(seed, nonce, 0);
  let distanceFloat;

  if (index === 5) {
    distanceFloat = sampleSquaredRadius(0, bullRadius ** 2, radialUnit);
  } else if (index === 1) {
    distanceFloat = sampleSquaredRadius(coreRadius ** 2, innerRadius ** 2, radialUnit);
  } else if (index >= 2 && index <= 4) {
    distanceFloat = sampleSquaredRadius(innerRadius ** 2, outerRadius ** 2, radialUnit);
    const matchingSegments = config.segmentPattern
      .map((segmentOutcome, segment) => (segmentOutcome === index ? segment : -1))
      .filter((segment) => segment >= 0);
    const selected = matchingSegments[Math.min(matchingSegments.length - 1, Math.floor(selectorUnit * matchingSegments.length))];
    const withinSegment = 0.12 + seededUnit(seed, nonce, 4) * 0.76;
    rotationFloat = normalizeRotation((selected + withinSegment) / SEGMENT_COUNT - SEGMENT_ROTATION);
  } else {
    const centerArea = coreRadius ** 2 - bullRadius ** 2;
    const outerArea = 1 - outerRadius ** 2;
    if (selectorUnit < centerArea / (centerArea + outerArea)) {
      distanceFloat = sampleSquaredRadius(bullRadius ** 2, coreRadius ** 2, radialUnit);
    } else {
      distanceFloat = sampleSquaredRadius(outerRadius ** 2, 1, radialUnit);
    }
  }

  return Object.freeze({ rotationFloat, distanceFloat, outcomeIndex: index });
}

export function resolveSeededDart({ difficulty = "medium", seed = "stake-darts-debug", nonce = 0 } = {}) {
  return resolveDart({ difficulty, ...seededFloats(seed, nonce) });
}

export function resolveDebugDart({
  difficulty = "medium",
  outcome = 0,
  seed = "stake-darts-debug",
  nonce = 0
} = {}) {
  return resolveDart({ difficulty, ...debugFloatsForOutcome(difficulty, outcome, seed, nonce) });
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
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
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

export function payoutFor(wager, multiplier) {
  return roundCurrency(clampBet(wager) * Math.max(0, Number(multiplier) || 0));
}

export function profitFor(wager, multiplier) {
  const amount = roundCurrency(clampBet(wager));
  return roundSignedCurrency(payoutFor(amount, multiplier) - amount);
}

export function settleLocalWager(balance, wager, multiplier) {
  const available = roundCurrency(balance);
  const payout = payoutFor(wager, multiplier);
  return Object.freeze({
    balance: roundCurrency(available + payout),
    payout,
    profit: profitFor(wager, multiplier)
  });
}

export function formatMultiplier(value) {
  return `${Number(value)}×`;
}

// Standalone Stake Darts mechanics module.
