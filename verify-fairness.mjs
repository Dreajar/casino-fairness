#!/usr/bin/env node

// verifier/verify-fairness.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// packages/dice-proof/src/usd.mjs
var USD_SCALE = 8;
var USD_FACTOR = 100000000n;
function parseUsdAtoms(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(String(value).trim());
  if (!match) throw new Error("Amount must be a non-negative USD value with at most eight decimal places");
  return BigInt(match[1]) * USD_FACTOR + BigInt((match[2] ?? "").padEnd(USD_SCALE, "0"));
}

// packages/fairness-core/src/baccarat-markets.ts
var BACCARAT_MARKETS = [
  "player",
  "tie",
  "banker",
  "player-pair",
  "banker-pair",
  "either-pair",
  "perfect-pair",
  "player-bonus",
  "banker-bonus"
];
var BACCARAT_BONUS_RETURNS = [0, 0, 0, 0, 2, 3, 5, 7, 11, 31];
function parseBaccaratBets(action) {
  const text = action.match(/^bets:v2:((?:\d+,){8}\d+)$/)?.[1];
  if (!text) throw new Error("Invalid baccarat bet allocation");
  const amounts = text.split(",").map(Number);
  if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1e12) || !amounts.some((n) => n > 0))
    throw new Error("Invalid baccarat bet allocation");
  return Object.fromEntries(BACCARAT_MARKETS.map((market, i) => [market, amounts[i] ?? 0]));
}
function baccaratMarketReturns(player, banker) {
  const p = baccaratTotal(player), b = baccaratTotal(banker);
  const winner = baccaratWinner(p, b);
  const natural2 = baccaratTotal(player.slice(0, 2)) >= 8 || baccaratTotal(banker.slice(0, 2)) >= 8;
  const pair = (cards2) => cards2.length >= 2 && cards2[0]?.rank === cards2[1]?.rank;
  const perfect = (cards2) => pair(cards2) && cards2[0]?.suit === cards2[1]?.suit;
  const pp = pair(player), bp = pair(banker);
  const bonus = (side) => natural2 ? winner === "tie" ? 1 : winner === side ? 2 : 0 : winner === side ? BACCARAT_BONUS_RETURNS[Math.abs(p - b)] ?? 0 : 0;
  return {
    player: winner === "tie" ? 1 : winner === "player" ? 2 : 0,
    banker: winner === "tie" ? 1 : winner === "banker" ? 1.95 : 0,
    tie: winner === "tie" ? 9 : 0,
    "player-pair": pp ? 12 : 0,
    "banker-pair": bp ? 12 : 0,
    "either-pair": pp || bp ? 6 : 0,
    "perfect-pair": perfect(player) || perfect(banker) ? 26 : 0,
    "player-bonus": bonus("player"),
    "banker-bonus": bonus("banker")
  };
}
function resolveBaccaratV2(random, action) {
  const bets = parseBaccaratBets(action);
  const dealOrder = [];
  const draw2 = () => {
    const index2 = random.int(52);
    const rank = BACCARAT_RANKS[index2 % 13];
    const suit = BACCARAT_SUITS[Math.floor(index2 / 13)];
    const card2 = {
      id: `draw-${dealOrder.length}-${suit}-${rank}`,
      deck: 0,
      rank,
      suit,
      value: baccaratCardValue(rank)
    };
    dealOrder.push(card2);
    return card2;
  };
  const player = [draw2()], banker = [draw2()];
  player.push(draw2());
  banker.push(draw2());
  const natural2 = baccaratTotal(player) >= 8 || baccaratTotal(banker) >= 8;
  if (!natural2) {
    if (baccaratTotal(player) <= 5) player.push(draw2());
    if (baccaratBankerDraws(baccaratTotal(banker), player[2]?.value)) banker.push(draw2());
  }
  const returns = baccaratMarketReturns(player, banker);
  const legs = BACCARAT_MARKETS.filter((market) => (bets[market] ?? 0) > 0).map((market) => ({
    market,
    weight: bets[market],
    multiplier: returns[market]
  }));
  const denominator = legs.reduce((sum, leg) => sum + BigInt(leg.weight) * 100n, 0n);
  const numerator = legs.reduce((sum, leg) => sum + BigInt(leg.weight) * BigInt(Math.round(leg.multiplier * 100)), 0n);
  return {
    multiplier: Number(numerator) / Number(denominator),
    outcome: {
      kind: "baccarat",
      version: 2,
      deckModel: "independent-52",
      bet: legs.length === 1 ? legs[0].market : "multiple",
      bets: legs,
      marketReturns: returns,
      payoutRatio: { numerator: numerator.toString(), denominator: denominator.toString() },
      winner: baccaratWinner(baccaratTotal(player), baccaratTotal(banker)),
      natural: natural2,
      player: { cards: player, total: baccaratTotal(player), drewThird: player.length === 3 },
      banker: { cards: banker, total: baccaratTotal(banker), drewThird: banker.length === 3 },
      dealOrder
    }
  };
}
function baccaratPayoutMinor(outcome, wagerMinor, rounding = "half-up") {
  const ratio = outcome.payoutRatio;
  const n = BigInt(ratio.numerator), d = BigInt(ratio.denominator);
  if (d <= 0n || n < 0n || n > 31n * d || wagerMinor < 0n) throw new Error("Invalid baccarat payout ratio");
  return rounding === "floor-minor-v1" ? wagerMinor * n / d : (wagerMinor * n * 2n + d) / (2n * d);
}

// packages/fairness-core/src/constants.ts
var TARGET_RTP_BPS = 9700;
var TARGET_RTP = TARGET_RTP_BPS / 1e4;
var RAINBET_LIMBO_RTP_BPS = 9900;
var RAINBET_LIMBO_RTP = RAINBET_LIMBO_RTP_BPS / 1e4;
var MULTIPLIER_DECIMAL_PLACES = 4;
var MULTIPLIER_SCALE = 10 ** MULTIPLIER_DECIMAL_PLACES;
var SLOT_MULTIPLIER_DECIMAL_PLACES = 2;
var SLOT_MULTIPLIER_SCALE = 10 ** SLOT_MULTIPLIER_DECIMAL_PLACES;
var SLOT_RTP_ROUNDING_ERROR = 0.5 / SLOT_MULTIPLIER_SCALE;
var SLOT_MAX_SETTLED_MULTIPLIER = 20;
function quantizeMultiplier(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Multiplier must be a finite non-negative number");
  return Math.round(value * MULTIPLIER_SCALE) / MULTIPLIER_SCALE;
}
function quantizeSlotMultiplier(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Slot multiplier must be a finite non-negative number");
  return Math.round(value * SLOT_MULTIPLIER_SCALE) / SLOT_MULTIPLIER_SCALE;
}

// packages/fairness-core/src/slot-20x-profiles.ts
var SLOT_20X_PROFILES = {
  "american-aurora": {
    spin: {
      factor: 1.0882352941176472,
      cost: 1
    }
  },
  "fist-of-destruction": {
    spin: {
      factor: 0.048583333333333326,
      cost: 1
    }
  },
  "fruit-party": {
    spin: {
      factor: 1.1357142857142855,
      cost: 1
    }
  },
  "gates-of-olympus-super-scatter": {
    spin: {
      factor: 5.682545336788,
      cost: 1,
      preserveV2: true
    },
    "ante-spin": {
      factor: 2.127939429716,
      cost: 1.5,
      preserveV2: true
    },
    "buy-free-spins": {
      factor: 1.492556019899,
      cost: 100,
      preserveV2: true
    },
    "buy-super-free-spins": {
      factor: 2.704331864634,
      cost: 500,
      preserveV2: true
    }
  },
  "midas-feast": {
    spin: {
      factor: 0.9986301933361,
      cost: 1,
      preserveV2: true
    }
  },
  "midnight-train-heist": {
    spin: {
      factor: 1.050323744198,
      cost: 1,
      preserveV2: true
    }
  },
  "neon-syndicate": {
    spin: {
      factor: 0.047499999999999994,
      cost: 1
    },
    "boost:rival": {
      factor: 0.0051571428571428575,
      cost: 3
    },
    "boost:duo": {
      factor: 0.02582048346078,
      cost: 25,
      preserveV2: true
    },
    "boost:triple": {
      factor: 0.02450132549062,
      cost: 75,
      preserveV2: true
    },
    "buy:signal": {
      factor: 0.02284858790989,
      cost: 80,
      preserveV2: true
    },
    "buy:cleave": {
      factor: 0.01730010233745,
      cost: 150,
      preserveV2: true
    },
    "buy:last": {
      factor: 0.04002113139888,
      cost: 500,
      preserveV2: true
    },
    "buy:trial-signal": {
      factor: 0.03443334864134,
      cost: 240,
      preserveV2: true
    },
    "buy:trial-cleave": {
      factor: 0.03344966666332,
      cost: 450,
      preserveV2: true
    },
    "buy:trial-last": {
      factor: 0.09849966666667,
      cost: 1500,
      preserveV2: true
    }
  },
  "odins-vault": {
    spin: {
      factor: 2.40121193309,
      cost: 1,
      preserveV2: true
    },
    "enhancer:bonus": {
      factor: 2.413038056949,
      cost: 3,
      preserveV2: true
    },
    "enhancer:degen": {
      factor: 2.566808887041,
      cost: 25,
      preserveV2: true
    },
    "enhancer:trickster": {
      factor: 2.370341505429,
      cost: 75,
      preserveV2: true
    },
    "enhancer:fu": {
      factor: 1.623083080609,
      cost: 5e3,
      preserveV2: true
    },
    "buy:bonus": {
      factor: 1.215246197479,
      cost: 200,
      preserveV2: true
    },
    "buy:super": {
      factor: 1.200953519133,
      cost: 1e3,
      preserveV2: true
    }
  },
  "poseidons-abyssal-crown": {
    spin: {
      factor: 1.187280393416,
      cost: 1,
      preserveV2: true
    }
  },
  "rip-city": {
    spin: {
      factor: 0.3194444444444444,
      cost: 1
    },
    "spin:force-cat": {
      factor: 6632251188759e-16,
      cost: 1,
      preserveV2: true
    },
    "spin:force-mouse": {
      factor: 0.001310624931726,
      cost: 1,
      preserveV2: true
    }
  },
  "sands-of-sekhmet": {
    spin: {
      factor: 1.09088890683,
      cost: 1,
      preserveV2: true
    }
  },
  sixsixsix: {
    spin: {
      factor: 5.813014517129,
      cost: 1,
      preserveV2: true
    }
  },
  "sweet-bonanza-2500": {
    spin: {
      factor: 5.78421052631579,
      cost: 1
    },
    feature: {
      factor: 0.024541284403669723,
      cost: 1
    },
    "spin:feature": {
      factor: 0.024541284403669723,
      cost: 1
    }
  },
  "wanted-dead-or-wild": {
    spin: {
      factor: 0.0030454545454545456,
      cost: 1
    },
    "feature:train": {
      factor: 0.13456178551986933,
      cost: 80
    },
    "feature:duel": {
      factor: 0.01575960000158,
      cost: 200,
      preserveV2: true
    },
    "feature:dead": {
      factor: 0.06671959999333,
      cost: 400,
      preserveV2: true
    }
  },
  "witch-blood-megaways": {
    spin: {
      factor: 1.181287852286,
      cost: 1,
      preserveV2: true
    }
  },
  "xmas-drop": {
    spin: {
      factor: 0.22518610421836227,
      cost: 1
    },
    "spin:bonus-hunt": {
      factor: 0.22518610421836227,
      cost: 1
    },
    "spin:two-santas": {
      factor: 0.041319882303488854,
      cost: 1
    },
    "spin:three-santas": {
      factor: 0.013564939847778047,
      cost: 1
    },
    "spin:force-night": {
      factor: 6606853732622e-16,
      cost: 1,
      preserveV2: true
    },
    "spin:force-town": {
      factor: 0.001244570749729,
      cost: 1,
      preserveV2: true
    }
  }
};

// packages/fairness-core/src/slot-payout-scales.ts
var SLOT_PAYOUT_SCALES = {
  "american-aurora": {
    "spin": 1.027777777675
  },
  "fist-of-destruction": {
    "spin": 0.01641399096012
  },
  "fruit-party": {
    "spin": 0.7974158276418
  },
  "gates-of-olympus-super-scatter": {
    "spin": 5.682545336788,
    "ante-spin": 2.127939429716,
    "buy-free-spins": 1.492556019899,
    "buy-super-free-spins": 2.704331864634
  },
  "midas-feast": {
    "spin": 0.9986301933361
  },
  "midnight-train-heist": {
    "spin": 1.050323744198
  },
  "neon-syndicate": {
    "spin": 0.01123338870432,
    "boost:rival": 0.00481107062122,
    "boost:duo": 0.02582048346078,
    "boost:triple": 0.02450132549062,
    "buy:signal": 0.02284858790989,
    "buy:cleave": 0.01730010233745,
    "buy:last": 0.04002113139888,
    "buy:trial-signal": 0.03443334864134,
    "buy:trial-cleave": 0.03344966666332,
    "buy:trial-last": 0.09849966666667
  },
  "odins-vault": {
    "spin": 2.40121193309,
    "enhancer:bonus": 2.413038056949,
    "enhancer:degen": 2.566808887041,
    "enhancer:trickster": 2.370341505429,
    "enhancer:fu": 1.623083080609,
    "buy:bonus": 1.215246197479,
    "buy:super": 1.200953519133
  },
  "poseidons-abyssal-crown": {
    "spin": 1.187280393416
  },
  "rip-city": {
    "spin": 0.02629484726063,
    "spin:force-cat": 6632251188759e-16,
    "spin:force-mouse": 0.001310624931726
  },
  "sands-of-sekhmet": {
    "spin": 1.09088890683
  },
  "sixsixsix": {
    "spin": 5.813014517129
  },
  "sweet-bonanza-2500": {
    "spin": 3.197003638001,
    "feature": 0.02142773299946,
    "spin:feature": 0.02142773299946
  },
  "wanted-dead-or-wild": {
    "spin": 0.001910799999809,
    "feature:train": 0.1354118441358,
    "feature:duel": 0.01575960000158,
    "feature:dead": 0.06671959999333
  },
  "witch-blood-megaways": {
    "spin": 1.181287852286
  },
  "xmas-drop": {
    "spin": 0.02295476412491,
    "spin:bonus-hunt": 0.02295476412491,
    "spin:two-santas": 0.01914505468455,
    "spin:three-santas": 0.01099575394067,
    "spin:force-night": 6606853732622e-16,
    "spin:force-town": 0.001244570749729
  }
};

// packages/fairness-core/src/slot-payout-calibration.ts
var SLOT_PAYOUT_MATH_VERSION = "slot-payout-calibration-v1";
var SLOT_20X_MATH_VERSION = "slot-payout-20x-v3";
var SLOT_MAX_CHARGED_MULTIPLIER = 20;
var isTwentyX = (version) => version === void 0 || version === SLOT_20X_MATH_VERSION;
var correctionBpsFor = (gameId, version) => version === "slot-payout-calibration-v1" ? 1e4 : gameId === "sweet-bonanza-2500" ? 9800 : gameId === "american-aurora" || gameId === "rip-city" ? 9700 : 1e4;
function correctMultiplier(value, bps) {
  if (bps === 1e4) return value;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents * bps + 5e3)) throw new Error("Payout correction exceeds exact integer range");
  return Math.floor((cents * bps + 5e3) / 1e4) / 100;
}
function calibratedSlotMultiplier(gameId, action, value, cap, version) {
  const scales = SLOT_PAYOUT_SCALES[gameId];
  if (!scales) return value;
  if (isTwentyX(version)) {
    const profile = SLOT_20X_PROFILES[gameId]?.[action];
    if (!profile) throw new Error(`Missing 20x slot profile: ${gameId}/${action}`);
    if (profile.preserveV2)
      return Math.min(
        SLOT_MAX_CHARGED_MULTIPLIER * profile.cost,
        calibratedSlotMultiplier(gameId, action, value, cap, "slot-payout-calibration-v2")
      );
    return quantizeSlotMultiplier(Math.min(SLOT_MAX_CHARGED_MULTIPLIER * profile.cost, value * profile.factor));
  }
  const factor = scales[action];
  if (factor === void 0) throw new Error(`Invalid ${gameId} action`);
  return correctMultiplier(quantizeSlotMultiplier(Math.min(cap, value * factor)), correctionBpsFor(gameId, version));
}
var payoutKeys = /* @__PURE__ */ new Set([
  "payout",
  "basePay",
  "rewardMultiplier",
  "win",
  "totalWin",
  "rawWin",
  "baseGameWin",
  "scatterAward",
  "superScatterAward",
  "rawTotal",
  "uncappedTotal",
  "uncappedMultiplier",
  "winMultiplier",
  "accumulatedMultiplier",
  "lineMultiplier",
  "coinMultiplier",
  "baseMultiplier",
  "bonusMultiplier"
]);
function monetaryField(gameId, path) {
  const key = path.at(-1);
  if (payoutKeys.has(key)) return true;
  if (gameId === "american-aurora") return key.endsWith("WinCents") || key === "winCents";
  if (key === "finalMultiplier") return path.length === 1;
  if (key === "totalMultiplier") return gameId !== "gates-of-olympus-super-scatter";
  if (key === "featureMultiplier") return gameId === "wanted-dead-or-wild" && path.length === 1;
  if (key === "rate") return gameId === "witch-blood-megaways";
  if (key !== "multiplier") return false;
  return path.some((part) => ["wins", "lineWins", "waysWins", "evaluatedWins", "scatterWin"].includes(part)) || ["midnight-train-heist", "midas-feast", "sands-of-sekhmet", "poseidons-abyssal-crown", "sixsixsix"].includes(
    gameId
  ) && path[0] === "cascades" || ["wanted-dead-or-wild", "rip-city", "xmas-drop"].includes(gameId) && path.length === 3 && ["featureSpins", "bonusSpins"].includes(path[0]);
}
function visibleAwardTotal(gameId, outcome, fallback) {
  const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const record2 = (value) => value !== null && typeof value === "object" ? value : {};
  const sum = (value, key) => Array.isArray(value) ? value.reduce((total2, item) => total2 + number(record2(item)[key]), 0) : 0;
  let total = fallback;
  if (["fruit-party", "sweet-bonanza-2500", "neon-syndicate"].includes(gameId)) total = number(outcome.rawTotal);
  if (gameId === "rip-city") total = sum(outcome.wins, "multiplier") + sum(outcome.bonusSpins, "multiplier");
  if (gameId === "xmas-drop") total = sum(outcome.wins, "multiplier") + sum(outcome.featureSpins, "multiplier");
  if (gameId === "wanted-dead-or-wild") total = number(outcome.baseMultiplier) + number(outcome.featureMultiplier);
  if (gameId === "fist-of-destruction") total = number(outcome.win) + number(record2(outcome.bonus).win);
  if (gameId === "american-aurora") {
    const ticket = record2(outcome.ticket);
    if (number(ticket.betCents) > 0) total = number(ticket.uncappedWinCents) / number(ticket.betCents);
  }
  return Math.max(fallback, total);
}
function calibrateSlotPayout(gameId, action, resolved, rawCap, version) {
  const scales = SLOT_PAYOUT_SCALES[gameId];
  if (!scales) return resolved;
  const factor = isTwentyX(version) ? SLOT_20X_PROFILES[gameId]?.[action]?.factor : scales[action];
  if (factor === void 0) throw new Error(`Invalid ${gameId} action`);
  const correctionBps = isTwentyX(version) ? 1e4 : correctionBpsFor(gameId, version);
  const multiplier = calibratedSlotMultiplier(gameId, action, resolved.multiplier, rawCap, version);
  const payoutCap = isTwentyX(version) ? SLOT_MAX_CHARGED_MULTIPLIER * SLOT_20X_PROFILES[gameId][action].cost : rawCap;
  const effectiveMaximum = isTwentyX(version) ? payoutCap : correctMultiplier(quantizeSlotMultiplier(Math.min(rawCap, rawCap * factor)), correctionBps);
  const displayTotal = isTwentyX(version) ? visibleAwardTotal(gameId, resolved.outcome, resolved.multiplier) : resolved.multiplier;
  const displayFactor = isTwentyX(version) && displayTotal > 0 ? multiplier / displayTotal : factor;
  const convert = (value, path) => {
    if (typeof value === "number" && monetaryField(gameId, path)) {
      const scaled = correctionBps === 1e4 ? value * displayFactor : value * displayFactor * correctionBps / 1e4;
      if (path.at(-1)?.endsWith("Cents")) return Math.round(scaled);
      return path.at(-1) === "multiplier" ? quantizeSlotMultiplier(scaled) : scaled;
    }
    if (Array.isArray(value)) return value.map((item, index2) => convert(item, [...path, String(index2)]));
    if (value !== null && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item, [...path, key])]));
    return value;
  };
  const outcome = convert(resolved.outcome, []);
  if ("finalMultiplier" in outcome) outcome.finalMultiplier = multiplier;
  if ("totalMultiplier" in outcome) outcome.totalMultiplier = multiplier;
  if (gameId === "american-aurora") {
    const ticket = outcome.ticket;
    ticket.totalWinCents = Math.round(multiplier * Number(ticket.betCents));
    ticket.maxWinReached = multiplier >= (correctionBps === 1e4 ? payoutCap : effectiveMaximum);
  }
  if ("capped" in outcome)
    outcome.capped = resolved.outcome.capped === true || resolved.multiplier * factor > payoutCap;
  for (const key of ["maxMultiplier", "maxWin", "maxWinCap"]) if (key in outcome) outcome[key] = effectiveMaximum;
  if ("winTier" in outcome)
    outcome.winTier = multiplier >= 20 ? "legendary" : multiplier >= 10 ? "epic" : multiplier >= 5 ? "big" : multiplier > 0 ? "win" : "none";
  outcome.payoutCalibration = {
    version: isTwentyX(version) ? SLOT_20X_MATH_VERSION : correctionBps === 1e4 ? SLOT_PAYOUT_MATH_VERSION : "slot-payout-calibration-v2",
    ...correctionBps === 1e4 ? {} : { correctionBps },
    ...isTwentyX(version) && SLOT_20X_PROFILES[gameId]?.[action]?.preserveV2 ? { preservedMathVersion: "slot-payout-calibration-v2" } : {},
    factor,
    cap: payoutCap,
    effectiveMaximum,
    finalMultiplier: multiplier
  };
  return { multiplier, outcome };
}

// games/rps-ascent/model.ts
var RPS_MOVES = ["rock", "paper", "scissors"];
var RPS_MAX_THROWS = 120;
var RPS_MULTIPLIERS = [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76, 1003.52, 2007.04, 4014.08, 8028.16, 1e4];
function isRpsMove(value) {
  return RPS_MOVES.includes(value);
}
function rpsThrowResult(player, opponent) {
  if (player === opponent) return "draw";
  return { rock: "scissors", paper: "rock", scissors: "paper" }[player] === opponent ? "win" : "loss";
}

// apps/server/src/payments/money.ts
var MoneyError = class extends Error {
};
function decimalRatio(value) {
  const normalized = value.trim();
  const match = normalized.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new MoneyError(`Invalid non-negative decimal ${value}`);
  const whole = match[1];
  if (whole === void 0) throw new MoneyError(`Invalid decimal ${value}`);
  const fraction = match[2] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  return { numerator: BigInt(whole) * denominator + BigInt(fraction || "0"), denominator };
}
function floorMinorByDecimal(minor, decimal) {
  if (minor < 0n) throw new MoneyError("Cannot multiply a negative money amount");
  const { numerator, denominator } = decimalRatio(decimal);
  return minor * numerator / denominator;
}

// enclave/oracle/rps-ascent-round.ts
var RpsAscentRoundKernel = class {
  #input;
  #step = 0;
  #sequence = 0;
  #status = "ACTIVE";
  #payout = 0n;
  #throws = [];
  #replies = /* @__PURE__ */ new Map();
  constructor(input) {
    if (input.gameId !== "rps-ascent" || input.action !== "start:run" || !/^[a-f\d-]{1,128}$/i.test(input.roundId) || typeof input.wagerMinor !== "bigint" || input.wagerMinor <= 0n || typeof input.maximumPayoutMinor !== "bigint" || input.wagerMinor * 10000n > input.maximumPayoutMinor) throw new Error("Invalid RPS Ascent opening or exposure");
    this.#input = Object.freeze({ ...input });
  }
  view() {
    const last = this.#throws.at(-1);
    const multiplier = this.#status === "LOST" ? 0 : this.#step === 0 ? this.#status === "COMPLETED" ? 1 : 0 : RPS_MULTIPLIERS[this.#step - 1];
    return structuredClone({
      roundId: this.#input.roundId,
      gameId: "rps-ascent",
      sequence: this.#sequence,
      status: this.#status,
      multiplier,
      payoutMinor: this.#payout.toString(),
      outcome: {
        kind: "rps-ascent",
        rules: "rps-ladder-v1",
        roundId: this.#input.roundId,
        phase: this.#status === "CASHED_OUT" ? "cashed-out" : this.#status.toLowerCase(),
        step: this.#step,
        currentMultiplier: multiplier,
        throws: this.#throws,
        player: last?.player ?? null,
        opponent: last?.opponent ?? null,
        success: last?.result === "win",
        draw: last?.result === "draw"
      }
    });
  }
  advance(command) {
    if (command.roundId !== this.#input.roundId || typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 || !Number.isSafeInteger(command.sequence) || typeof command.action !== "string" || command.action.length > 1024) throw new Error("Invalid RPS command");
    const fingerprint = JSON.stringify([command.roundId, command.sequence, command.action]);
    const previous = this.#replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("RPS idempotency conflict");
      return structuredClone(previous.view);
    }
    if (this.#status !== "ACTIVE" || command.sequence !== this.#sequence + 1) throw new Error("RPS sequence conflict");
    if (command.action === `cashout:${this.#input.roundId}` && this.#step > 0) {
      this.#status = "CASHED_OUT";
    } else {
      const parts = command.action.split(":");
      if (parts.length !== 3 || parts[0] !== "throw" || parts[1] !== this.#input.roundId || !isRpsMove(parts[2])) throw new Error("Invalid RPS throw or premature cashout");
      const player = parts[2];
      const opponent = new FairRandom(this.#input.serverSeed, {
        gameId: "rps-ascent",
        clientSeed: this.#input.clientSeed,
        nonce: this.#input.nonce,
        action: `rps-ladder-v1:throw:${command.sequence}`
      }).pick(RPS_MOVES);
      const result = rpsThrowResult(player, opponent);
      this.#throws.push({ player, opponent, result });
      if (result === "loss") this.#status = "LOST";
      if (result === "win" && ++this.#step === RPS_MULTIPLIERS.length) this.#status = "COMPLETED";
      if (this.#status === "ACTIVE" && this.#throws.length === RPS_MAX_THROWS) this.#status = "COMPLETED";
    }
    if (this.#status === "CASHED_OUT" || this.#status === "COMPLETED") this.#payout = floorMinorByDecimal(this.#input.wagerMinor, String(this.#step ? RPS_MULTIPLIERS[this.#step - 1] : 1));
    this.#sequence = command.sequence;
    const view = this.view();
    this.#replies.set(command.requestId, { fingerprint, view });
    return structuredClone(view);
  }
};

// rainbet-war/engine.js
var WAR_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
var WAR_SUITS = ["clubs", "diamonds", "hearts", "spades"];
var TIE_ODDS = [10, 30, 60, 300];
var COLOURED_TIE_ODDS = [20, 125, 400, 1e3];
var suitSymbols = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};
function makeCard(rank, suit, deck = 0) {
  if (!WAR_RANKS.includes(rank) || !WAR_SUITS.includes(suit)) throw new Error("Invalid War card");
  return {
    id: `${deck}-${rank}-${suit}`,
    deck,
    rank,
    suit,
    symbol: suitSymbols[suit],
    red: suit === "diamonds" || suit === "hearts",
    value: WAR_RANKS.indexOf(rank) + 2
  };
}
function compareWarCards(player, dealer) {
  return player.value === dealer.value ? "tie" : player.value > dealer.value ? "player" : "dealer";
}
function isColouredTie(player, dealer) {
  return compareWarCards(player, dealer) === "tie" && player.red === dealer.red;
}
function tieSideBetMultiplier(tieCount) {
  if (!Number.isSafeInteger(tieCount) || tieCount < 1) return 0;
  const odds = TIE_ODDS[Math.min(tieCount, TIE_ODDS.length) - 1] ?? 0;
  return odds + 1;
}
function colouredTieSideBetMultiplier(tieCount, allTiesColoured) {
  if (!allTiesColoured || !Number.isSafeInteger(tieCount) || tieCount < 1) return 0;
  const odds = COLOURED_TIE_ODDS[Math.min(tieCount, COLOURED_TIE_ODDS.length) - 1] ?? 0;
  return odds + 1;
}
function settleLegacyWarRound({ battles, mainWager, tieWager = 0, colouredTieWager = 0, surrendered = false }) {
  if (!Array.isArray(battles) || battles.length === 0) throw new Error("A War round needs at least one battle");
  for (const amount of [mainWager, tieWager, colouredTieWager]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("War wagers must be non-negative finite numbers");
  }
  const ties = battles.filter((battle) => compareWarCards(battle.player, battle.dealer) === "tie");
  const tieCount = ties.length;
  const allTiesColoured = tieCount > 0 && ties.every((battle) => isColouredTie(battle.player, battle.dealer));
  const finalBattle = battles.at(-1);
  const finalOutcome = finalBattle ? compareWarCards(finalBattle.player, finalBattle.dealer) : "dealer";
  const investedMain = mainWager * battles.length;
  let resolution = finalOutcome;
  let mainPayout = 0;
  if (tieCount >= 4 && finalOutcome === "tie") {
    resolution = "four-ties";
    mainPayout = investedMain + mainWager * 10;
  } else if (surrendered) {
    resolution = "surrender";
    mainPayout = investedMain * 0.5;
  } else if (finalOutcome === "player") {
    mainPayout = investedMain + mainWager;
  }
  const tiePayout = tieWager * tieSideBetMultiplier(tieCount);
  const colouredTiePayout = colouredTieWager * colouredTieSideBetMultiplier(tieCount, allTiesColoured);
  const totalStake = investedMain + tieWager + colouredTieWager;
  const totalPayout = mainPayout + tiePayout + colouredTiePayout;
  return {
    resolution,
    tieCount,
    allTiesColoured,
    investedMain,
    mainPayout,
    tiePayout,
    colouredTiePayout,
    totalStake,
    totalPayout,
    multiplier: totalStake > 0 ? totalPayout / totalStake : 0
  };
}

// games/rainbet-war/model.ts
function warShoe(random) {
  const cards2 = [];
  for (let deck = 0; deck < 8; deck++)
    for (const suit of WAR_SUITS) for (const rank of WAR_RANKS) cards2.push(makeCard(rank, suit, deck));
  for (let i = cards2.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    const a = cards2[i], b = cards2[j];
    if (!a || !b) throw new Error("Invalid War shuffle index");
    [cards2[i], cards2[j]] = [b, a];
  }
  return cards2;
}
function warDraws(random) {
  return Array.from({ length: 4 }, () => warShoe(random).slice(0, 2)).flat();
}
function warOpeningBets(action, base, usdScale = 2) {
  const factor = usdScale === 8 ? 1000000n : 1n;
  if (base < 10n * factor || base > 5000000n * factor) throw new Error("Main bet must be between 0.10 and 50,000.00");
  if (action === "start:deal") return [0n, 0n];
  const match = /^start:deal:(0|[1-9]\d{0,14}):(0|[1-9]\d{0,14})$/.exec(action);
  if (!match) throw new Error("Invalid War side bets");
  const amounts = [BigInt(match[1] ?? "0"), BigInt(match[2] ?? "0")];
  for (const amount of amounts)
    if (amount !== 0n && (amount < 10n * factor || amount > 1000000n * factor))
      throw new Error("Side bets must be zero or between 0.10 and 10,000.00");
  return amounts;
}
function nextBattle(state) {
  const index2 = state.battles.length * 2;
  const player = state.shoe[index2], dealer = state.shoe[index2 + 1];
  if (!player || !dealer) throw new Error("War shoe exhausted");
  const battles = [...state.battles, { player, dealer }];
  return { ...state, battles, phase: player.rank === dealer.rank && battles.length < 4 ? "player" : "settled" };
}
function dealWar(shoe) {
  return nextBattle({
    rules: "eight-deck-war-v1",
    shoe,
    battles: [],
    phase: "player",
    revision: 0,
    actions: [],
    tieMinor: "0",
    colouredMinor: "0"
  });
}
function withWarSideBets(state, action, base, usdScale = 2) {
  const [tie, coloured] = warOpeningBets(action, base, usdScale);
  return { ...state, ...usdScale === 8 ? { usdScale } : {}, tieMinor: tie.toString(), colouredMinor: coloured.toString() };
}
function actWar(state, action) {
  if (state.phase !== "player" || !["war", "surrender"].includes(action))
    throw new Error("War decision is not available");
  const next = { ...state, actions: [...state.actions, action], revision: state.revision + 1 };
  return action === "war" ? nextBattle(next) : { ...next, phase: "settled" };
}
var warUnits = (state) => 2 ** (state.battles.length - 1);
var warCommitted = (state, base) => base * BigInt(warUnits(state)) + BigInt(state.tieMinor) + BigInt(state.colouredMinor);
var warStartAction = (state) => `start:deal:${state.tieMinor}:${state.colouredMinor}`;
function receipt(state, base) {
  const ties = state.battles.filter((b) => b.player.rank === b.dealer.rank);
  const tieCount = ties.length;
  const colouredTieCount = ties.filter((b) => b.player.red === b.dealer.red).length;
  const allTiesColoured = tieCount > 0 && colouredTieCount === tieCount;
  const last = state.battles.at(-1);
  if (!last) throw new Error("War round has no battles");
  const investedMain = base * BigInt(warUnits(state));
  const resolution = state.phase === "player" ? "tie" : state.actions.at(-1) === "surrender" ? "surrender" : tieCount === 4 ? "four-ties" : last.player.value > last.dealer.value ? "player" : "dealer";
  const main2 = resolution === "surrender" ? investedMain / 2n : resolution === "four-ties" ? investedMain + 10n * base : resolution === "player" ? investedMain + base : 0n;
  const tie = BigInt(state.tieMinor) * BigInt([0, 11, 31, 61, 301][tieCount] ?? 0);
  const coloured = BigInt(state.colouredMinor) * BigInt([0, 21, 126, 401, 1001][colouredTieCount] ?? 0);
  return { resolution, tieCount, colouredTieCount, allTiesColoured, investedMain, main: main2, tie, coloured };
}
function warPayout(state, base) {
  if (state.phase !== "settled") return 0n;
  const r = receipt(state, base), payout = r.main + r.tie + r.coloured;
  const cap = state.usdScale === 8 ? 50000000000000n : 50000000n;
  return payout < cap ? payout : cap;
}
function warOutcome(state, roundId, base) {
  const factor = state.usdScale === 8 ? 1e8 : 100;
  const r = receipt(state, base), committed = warCommitted(state, base), payout = warPayout(state, base);
  return {
    kind: "rainbet-war",
    ...state.usdScale === 8 ? { usdScale: 8 } : {},
    rules: state.rules,
    roundId,
    baseWagerMinor: base.toString(),
    tieWagerMinor: state.tieMinor,
    colouredWagerMinor: state.colouredMinor,
    phase: state.phase,
    revision: state.revision,
    actions: [...state.actions],
    battles: state.battles.map((b) => ({ player: { ...b.player }, dealer: { ...b.dealer } })),
    resolution: r.resolution,
    tieCount: r.tieCount,
    colouredTieCount: r.colouredTieCount,
    allTiesColoured: r.allTiesColoured,
    investedMain: Number(r.investedMain) / factor,
    mainPayout: Number(r.main) / factor,
    tiePayout: Number(r.tie) / factor,
    colouredTiePayout: Number(r.coloured) / factor,
    totalStake: Number(committed) / factor,
    totalPayout: Number(payout) / factor,
    multiplier: Number(payout) / Number(committed),
    availableActions: state.phase === "player" ? ["war", "surrender"] : []
  };
}

// games/blackjack/model.ts
var BLACKJACK_RULES = "six-deck-s17-v2";
function blackjackOpeningBets(action, base, usdScale = 2) {
  if (action === "start:deal") return [0n, 0n];
  const match = /^start:deal:(0|[1-9]\d{0,14}):(0|[1-9]\d{0,14})$/.exec(action);
  if (!match) throw new Error("Invalid Blackjack side bets");
  const pair = BigInt(match[1] ?? "0"), three = BigInt(match[2] ?? "0");
  for (const amount of [pair, three])
    if (amount !== 0n && (amount < (usdScale === 8 ? 10000000n : 10n) || amount > base))
      throw new Error("Each side bet must be zero or between $0.10 and the base bet");
  if (pair === 0n && three === 0n) throw new Error("Use start:deal when side bets are zero");
  return [pair, three];
}
function blackjackSideResults(cards2, dealer) {
  const [a, b] = cards2;
  if (!a || !b) throw new Error("Opening cards required");
  const red = (card2) => ["hearts", "diamonds"].includes(card2.suit);
  const pair = a.rank !== b.rank ? { result: "No pair", odds: 0 } : a.suit === b.suit ? { result: "Perfect pair", odds: 25 } : red(a) === red(b) ? { result: "Coloured pair", odds: 12 } : { result: "Mixed pair", odds: 6 };
  const triple = [a, b, dealer];
  const sameRank = triple.every((c) => c.rank === a.rank);
  const flush = triple.every((c) => c.suit === a.suit);
  const values = triple.map((c) => ["J", "Q", "K", "A"].includes(c.rank) ? ["J", "Q", "K", "A"].indexOf(c.rank) + 11 : Number(c.rank)).sort((x, y) => x - y);
  const straight = values[0] === 2 && values[1] === 3 && values[2] === 14 || values[1] === (values[0] ?? 0) + 1 && values[2] === (values[1] ?? 0) + 1;
  const three = sameRank && flush ? { result: "Suited trips", odds: 100 } : straight && flush ? { result: "Straight flush", odds: 40 } : sameRank ? { result: "Three of a kind", odds: 30 } : straight ? { result: "Straight", odds: 10 } : flush ? { result: "Flush", odds: 5 } : { result: "No winning combination", odds: 0 };
  return { pair, three };
}
function withBlackjackSideBets(state, action, base, usdScale = 2) {
  const [pair, three] = blackjackOpeningBets(action, base, usdScale);
  if (pair === 0n && three === 0n) return state;
  const dealer = state.dealer[0];
  if (!dealer) throw new Error("Dealer upcard missing");
  const results = blackjackSideResults(state.hands[0]?.cards ?? [], dealer);
  const receipt2 = (amount, result) => ({
    wagerMinor: amount.toString(),
    payoutMinor: (result.odds ? amount * BigInt(result.odds + 1) : 0n).toString(),
    ...result
  });
  return {
    ...state,
    sideBets: {
      version: "pairs-21plus3-v1",
      perfectPair: receipt2(pair, results.pair),
      twentyOneThree: receipt2(three, results.three)
    }
  };
}
function blackjackSideStake(state) {
  return state.sideBets ? BigInt(state.sideBets.perfectPair.wagerMinor) + BigInt(state.sideBets.twentyOneThree.wagerMinor) : 0n;
}
function blackjackCommitted(state, base) {
  return base * BigInt(blackjackUnits(state)) + blackjackSideStake(state);
}
function blackjackStartAction(state) {
  return state.sideBets ? `start:deal:${state.sideBets.perfectPair.wagerMinor}:${state.sideBets.twentyOneThree.wagerMinor}` : "start:deal";
}
function blackjackTotal(cards2) {
  let aces = 0;
  let value = 0;
  for (const card2 of cards2) {
    if (card2.rank === "A") {
      aces++;
      value += 11;
    } else value += ["K", "Q", "J"].includes(card2.rank) ? 10 : Number(card2.rank);
  }
  while (value > 21 && aces-- > 0) value -= 10;
  return value;
}
var cardValue = (card2) => card2.rank === "A" ? 11 : ["K", "Q", "J"].includes(card2.rank) ? 10 : Number(card2.rank);
var natural = (cards2) => cards2.length === 2 && blackjackTotal(cards2) === 21;
function blackjackShoe(random) {
  const shoe = [];
  for (let deck = 0; deck < 6; deck++) {
    for (const suit of ["clubs", "diamonds", "hearts", "spades"]) {
      for (const rank of ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]) {
        shoe.push({ id: `${deck}-${rank}-${suit}`, rank, suit });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    const current = shoe[i];
    const replacement = shoe[j];
    if (!current || !replacement) throw new Error("Invalid Blackjack shuffle index");
    [shoe[i], shoe[j]] = [replacement, current];
  }
  return shoe;
}
function draw(state) {
  const card2 = state.shoe[state.cursor++];
  if (!card2) throw new Error("Blackjack shoe exhausted");
  return card2;
}
function settle(state) {
  if (state.hands.some((hand) => blackjackTotal(hand.cards) <= 21)) {
    while (blackjackTotal(state.dealer) < 17) state.dealer.push(draw(state));
  }
  const dealer = blackjackTotal(state.dealer);
  for (const hand of state.hands) {
    const player = blackjackTotal(hand.cards);
    hand.status = player > 21 ? "bust" : dealer > 21 || player > dealer ? "win" : player === dealer ? "push" : "lose";
  }
  state.phase = "settled";
}
function advance(state) {
  while (state.active < state.hands.length) {
    const hand = state.hands[state.active];
    if (!hand) throw new Error("Blackjack active hand missing");
    if (hand.status !== "playing") {
      state.active++;
      continue;
    }
    if (state.rules === "six-deck-s17-v2" && hand.cards.length === 1) {
      const splitAce = hand.cards[0]?.rank === "A";
      hand.cards.push(draw(state));
      if (splitAce || blackjackTotal(hand.cards) === 21) {
        hand.status = "stand";
        state.active++;
        continue;
      }
    }
    break;
  }
  if (state.active === state.hands.length) settle(state);
}
function dealBlackjack(shoe, rules = BLACKJACK_RULES) {
  if (rules !== "six-deck-s17-v1" && rules !== "six-deck-s17-v2") throw new Error("Unknown Blackjack rules");
  if (shoe.length !== 312 || new Set(shoe.map((card2) => card2.id)).size !== 312)
    throw new Error("Invalid six-deck shoe");
  const state = {
    rules,
    shoe: [...shoe],
    cursor: 0,
    dealer: [],
    hands: [{ cards: [], units: 1, status: "playing" }],
    active: 0,
    phase: "player",
    revision: 0,
    actions: []
  };
  const hand = state.hands[0];
  if (!hand) throw new Error("Blackjack opening hand missing");
  hand.cards.push(draw(state));
  state.dealer.push(draw(state));
  hand.cards.push(draw(state));
  state.dealer.push(draw(state));
  if (natural(hand.cards) || natural(state.dealer)) {
    hand.status = natural(hand.cards) ? natural(state.dealer) ? "push" : "blackjack" : "lose";
    state.phase = "settled";
  }
  return state;
}
function blackjackAllowed(state) {
  const hand = state.hands[state.active];
  if (state.phase !== "player" || !hand || hand.status !== "playing") return [];
  const choices = ["hit", "stand"];
  if (hand.cards.length === 2) choices.push("double");
  const [first, second] = hand.cards;
  if (state.hands.length === 1 && hand.cards.length === 2 && first && second && cardValue(first) === cardValue(second))
    choices.push("split");
  return choices;
}
function actBlackjack(previous, action) {
  if (!blackjackAllowed(previous).includes(action)) throw new Error("Action is not allowed for this hand");
  const state = structuredClone(previous);
  state.actions.push(action);
  state.revision++;
  const hand = state.hands[state.active];
  if (!hand) throw new Error("Blackjack active hand missing");
  if (action === "split") {
    const [first, second] = hand.cards;
    if (!first || !second) throw new Error("Blackjack split cards missing");
    if (state.rules === "six-deck-s17-v1") {
      const aces = first.rank === "A";
      state.hands = [first, second].map((card2) => ({ cards: [card2, draw(state)], units: 1, status: "playing" }));
      for (const split of state.hands) if (aces || blackjackTotal(split.cards) === 21) split.status = "stand";
    } else {
      state.hands = [first, second].map((card2) => ({ cards: [card2], units: 1, status: "playing" }));
    }
  } else if (action === "stand") hand.status = "stand";
  else {
    if (action === "double") hand.units *= 2;
    hand.cards.push(draw(state));
    const total = blackjackTotal(hand.cards);
    if (total > 21) hand.status = "bust";
    else if (action === "double" || total === 21) hand.status = "stand";
  }
  advance(state);
  return state;
}
var blackjackUnits = (state) => state.hands.reduce((sum, hand) => sum + hand.units, 0);
function blackjackPayout(state, baseMinor) {
  if (state.phase !== "settled") return 0n;
  return state.hands.reduce(
    (sum, hand) => sum + (hand.status === "blackjack" ? baseMinor * 5n / 2n : hand.status === "win" ? baseMinor * BigInt(hand.units) * 2n : hand.status === "push" ? baseMinor * BigInt(hand.units) : 0n),
    state.sideBets ? BigInt(state.sideBets.perfectPair.payoutMinor) + BigInt(state.sideBets.twentyOneThree.payoutMinor) : 0n
  );
}
function blackjackOutcome(state, roundId, baseMinor) {
  return {
    kind: "blackjack",
    ...state.sideBets ? { sideBets: state.sideBets } : {},
    rules: state.rules,
    roundId,
    baseWagerMinor: baseMinor.toString(),
    phase: state.phase,
    revision: state.revision,
    active: state.active,
    dealer: state.phase === "settled" ? state.dealer : [state.dealer[0], null],
    hands: state.hands,
    committedUnits: blackjackUnits(state),
    allowedActions: blackjackAllowed(state),
    actions: state.actions
  };
}

// node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
  if (h.outputLen < 1 || h.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new TypeError("string expected");
  const encoded = new TextEncoder().encode(str);
  try {
    return new Uint8Array(encoded);
  } finally {
    clean(encoded);
  }
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = false;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const buf = out.subarray(0, this.outputLen);
    this.iHash.digestInto(buf);
    this.oHash.update(buf);
    this.oHash.digestInto(buf);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.canXOF = canXOF;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = /* @__PURE__ */ (() => {
  const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
  hmac_.create = (hash, key) => new _HMAC(hash, key);
  return hmac_;
})();

// node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// packages/contracts/src/identifiers.ts
var PUNTCLUB_RESERVED_SLUGS = [
  "analytics",
  "earnings",
  "manage",
  "notifications",
  "owner",
  "promotions",
  "r",
  "rewards",
  "staff",
  "support",
  "vip"
];
var RESERVED_SLUGS = /* @__PURE__ */ new Set([
  "about",
  "account",
  "admin",
  "api",
  "assets",
  "auth",
  "billing",
  "blog",
  "cashier",
  "clubs",
  "contact",
  "dashboard",
  "docs",
  "embed",
  "faq",
  "games",
  "help",
  "home",
  "join",
  "legal",
  "lobby",
  "login",
  "logout",
  "me",
  "messages",
  "new",
  "payouts",
  "press",
  "privacy",
  "profile",
  "public",
  "responsible-gaming",
  "search",
  "settings",
  "signup",
  "static",
  "terms",
  "treasury",
  "verify",
  "welcome",
  "wins",
  ...PUNTCLUB_RESERVED_SLUGS
]);

// packages/contracts/src/index.ts
var FLOOR_LAVA_STARTING_PLATFORMS = 49;
var FLOOR_LAVA_LEVELS = 1;
var FLOOR_LAVA_DIFFICULTIES = {
  easy: { safeCounts: [42, 35, 28, 21, 14, 7], levels: FLOOR_LAVA_LEVELS },
  medium: { safeCounts: [38, 27, 16, 5], levels: FLOOR_LAVA_LEVELS },
  hard: { safeCounts: [26, 3], levels: FLOOR_LAVA_LEVELS },
  toxic: { safeCounts: [1], levels: FLOOR_LAVA_LEVELS }
};
function isFloorLavaDifficulty(value) {
  return typeof value === "string" && value in FLOOR_LAVA_DIFFICULTIES;
}
var DRAGON_TOWER_DIFFICULTIES = {
  easy: { safeTiles: 3, tiles: 4 },
  medium: { safeTiles: 2, tiles: 3 },
  hard: { safeTiles: 1, tiles: 2 },
  expert: { safeTiles: 1, tiles: 3 },
  master: { safeTiles: 1, tiles: 4 }
};
var DRAGON_TOWER_PAYTABLE = {
  easy: [1.29, 1.72, 2.3, 3.07, 4.09, 5.45, 7.27, 9.69, 12.92],
  medium: [1.46, 2.18, 3.27, 4.91, 7.37, 11.05, 16.57, 24.86, 37.29],
  hard: [1.94, 3.88, 7.76, 15.52, 31.04, 62.08, 124.16, 248.32, 496.64],
  expert: [2.91, 8.73, 26.19, 78.57, 235.71, 707.13, 2121.39, 6364.17, 19092.51],
  master: [3.88, 15.52, 62.08, 248.32, 993.28, 3973.12, 15892.48, 63569.92, 254279.68]
};
var DRAGON_TOWER_FLOORS = 9;
function isDragonTowerDifficulty(value) {
  return typeof value === "string" && value in DRAGON_TOWER_DIFFICULTIES;
}
var TOWER_DIFFICULTIES = {
  easy: { safeTiles: 3, tiles: 4 },
  medium: { safeTiles: 2, tiles: 3 },
  hard: { safeTiles: 1, tiles: 2 },
  expert: { safeTiles: 1, tiles: 3 },
  master: { safeTiles: 1, tiles: 4 }
};
var TOWER_FLOORS = 8;
var TOWER_PAYTABLE = {
  easy: [1.28, 1.7, 2.27, 3.03, 4.04, 5.39, 7.19, 9.58],
  medium: [1.44, 2.16, 3.24, 4.86, 7.29, 10.93, 16.4, 24.6],
  hard: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76],
  expert: [2.88, 8.64, 25.92, 77.76, 233.28, 699.84, 2099.52, 6298.56],
  master: [3.84, 15.36, 61.44, 245.76, 983.04, 3932.16, 15728.64, 62914.56]
};
function isTowerDifficulty(value) {
  return typeof value === "string" && value in TOWER_DIFFICULTIES;
}

// packages/dice-proof/src/index.mjs
var encoder = new TextEncoder();
var DICE_PROOF_TICKET_TTL_MS = 5 * 60 * 1e3;

// packages/game-registry/src/enabled-games.ts
var ENABLED_GAME_IDS = [
  "stake-pump",
  "moonbound",
  "stake-crash",
  "packs",
  "drill",
  "rps-ascent",
  "midnight-train-heist",
  "wanted-dead-or-wild",
  "midas-feast",
  "sands-of-sekhmet",
  "poseidons-abyssal-crown",
  "gates-of-olympus-super-scatter",
  "odins-vault",
  "witch-blood-megaways",
  "rip-city",
  "xmas-drop",
  "sixsixsix",
  "fruit-party",
  "sweet-bonanza-2500",
  "fist-of-destruction",
  "neon-syndicate",
  "moles",
  "prism-deck",
  "thirteen-card-flip",
  "baccarat",
  "nullfield",
  "chicken-cross",
  "floor-is-lava",
  "tower",
  "dragon-tower",
  "rock-paper-scissors",
  "limbo",
  "keno",
  "plinko",
  "dice",
  "video-poker",
  "blackjack",
  "rainbet-mines",
  "rainbet-wheel",
  "rainbet-roulette",
  "rainbet-war",
  "stake-darts",
  "stake-darts-enhanced",
  "stake-flip",
  "stake-wheel",
  "stake-snakes",
  "tarot",
  "american-aurora",
  "neon-pulse-pinball"
];

// american-aurora/aurora-engine.js
var COLUMNS = 5;
var ROWS = 3;
var CELL_COUNT = COLUMNS * ROWS;
var MIN_CLUSTER = 3;
var MAX_CLUSTER = 10;
var MAX_WIN_MULTIPLIER = 5e3;
var BASE_BETS_CENTS = Object.freeze([10, 50, 100, 200, 500, 1e3]);
var REGULAR_SYMBOLS = Object.freeze([
  "parchment",
  "ship",
  "compass",
  "gear",
  "microphone",
  "capsule",
  "satellite"
]);
var SYMBOL_LABELS = Object.freeze({
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
var SYMBOL_WEIGHTS = Object.freeze({
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
var SPLITTABLE = /* @__PURE__ */ new Set(["parchment", "ship", "compass", "gear", "microphone", "beacon"]);
var PAYTABLE_BPS = Object.freeze({
  parchment: Object.freeze([900, 1500, 2400, 3900, 6e3, 9e3, 12e3, 18e3]),
  ship: Object.freeze([1080, 1800, 3e3, 4800, 7200, 10800, 15e3, 22800]),
  compass: Object.freeze([1320, 2280, 3600, 5700, 9e3, 13200, 19200, 28800]),
  gear: Object.freeze([1680, 2700, 4500, 7200, 10800, 16800, 25200, 39e3]),
  microphone: Object.freeze([2100, 3600, 5700, 9e3, 14400, 22800, 36e3, 54e3]),
  capsule: Object.freeze([2700, 4500, 7200, 12e3, 19200, 3e4, 48e3, 75e3]),
  satellite: Object.freeze([3600, 6e3, 10500, 16800, 27e3, 45e3, 72e3, 108e3])
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
function createCell(type, count = 1) {
  return { type, count: Math.max(1, Math.min(2, Math.trunc(count) || 1)) };
}
function cloneGrid(grid) {
  return grid.map((cell) => ({ ...cell }));
}
function createSymbolSource(rng, { mode = "base", weights: weights2 = SYMBOL_WEIGHTS } = {}) {
  assertRng(rng);
  const entries = Object.entries(weights2).filter(([type]) => mode === "base" || type !== "beacon");
  return function nextCell() {
    const type = weightedPick(entries, rng);
    const splitChance = type === "beacon" ? 0.075 : 0.14;
    const count = SPLITTABLE.has(type) && boundedFloat(rng) < splitChance ? 2 : 1;
    return createCell(type, count);
  };
}
function generateGrid(nextCell) {
  if (typeof nextCell !== "function") throw new TypeError("A symbol source is required");
  return Array.from({ length: CELL_COUNT }, nextCell);
}
function neighbors(index2) {
  const row = Math.floor(index2 / COLUMNS);
  const column = index2 % COLUMNS;
  const adjacent = [];
  if (row > 0) adjacent.push(index2 - COLUMNS);
  if (row < ROWS - 1) adjacent.push(index2 + COLUMNS);
  if (column > 0) adjacent.push(index2 - 1);
  if (column < COLUMNS - 1) adjacent.push(index2 + 1);
  return adjacent;
}
function clusterOccurrences(grid, positions, symbol) {
  return positions.reduce((sum, index2) => {
    const cell = grid[index2];
    return sum + (cell.type === "wild" ? 1 : cell.type === symbol ? cell.count : 0);
  }, 0);
}
function findClusters(grid) {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) {
    throw new RangeError(`Grid must contain exactly ${CELL_COUNT} cells`);
  }
  return REGULAR_SYMBOLS.flatMap((symbol) => {
    const visited = /* @__PURE__ */ new Set();
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
      if (!positions.some((index2) => grid[index2].type === symbol)) continue;
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
function evaluateClusters(grid, betCents, multiplier = 1) {
  if (!Number.isInteger(betCents) || betCents <= 0) throw new RangeError("Bet must be positive cents");
  const clusters = findClusters(grid).map((cluster) => ({
    ...cluster,
    baseWinCents: Math.round(betCents * cluster.rateBps / 1e4)
  }));
  const rawWinCents = clusters.reduce((sum, cluster) => sum + cluster.baseWinCents, 0);
  return {
    clusters,
    rawWinCents,
    winCents: rawWinCents * multiplier
  };
}
function collapseGrid(grid, removedPositions, nextCell) {
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
      const index2 = row * COLUMNS + column;
      if (!removed.has(index2)) survivors.push({ cell: grid[index2], row });
    }
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const index2 = row * COLUMNS + column;
      const survivor = survivors.shift();
      if (survivor) {
        nextGrid[index2] = { ...survivor.cell };
        movements[index2] = Math.max(0, row - survivor.row);
      } else {
        nextGrid[index2] = nextCell();
        movements[index2] = row + 1;
      }
    }
  }
  return { grid: nextGrid, movements };
}
function countBeacons(grid) {
  return grid.reduce((sum, cell) => sum + (cell.type === "beacon" ? cell.count : 0), 0);
}
function featureTurns(beaconCount) {
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
function playGrid({
  rng,
  betCents,
  mode = "base",
  turnMultiplier = 1,
  initialGrid: initialGrid2 = null,
  forceWin = false,
  maxCascades = 12
}) {
  assertRng(rng);
  if (!BASE_BETS_CENTS.includes(betCents)) throw new RangeError("Unsupported ticket cost");
  if (!["base", "bonus"].includes(mode)) throw new RangeError("Mode must be base or bonus");
  const nextCell = createSymbolSource(rng, { mode });
  let grid = initialGrid2 ? cloneGrid(initialGrid2) : generateGrid(nextCell);
  if (forceWin && findClusters(grid).length === 0) grid = forceOpeningCluster(grid);
  const openingGrid = cloneGrid(grid);
  const cascades = [];
  let totalWinCents = 0;
  for (let cascadeIndex = 0; cascadeIndex < maxCascades; cascadeIndex += 1) {
    const multiplier = mode === "base" ? Math.min(5, cascadeIndex + 1) : Math.min(15, turnMultiplier + cascadeIndex);
    const evaluation = evaluateClusters(grid, betCents, multiplier);
    if (!evaluation.clusters.length) break;
    const removedPositions = [...new Set(evaluation.clusters.flatMap((cluster) => cluster.positions))].sort((a, b) => a - b);
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
function buildTicket({ rng, betCents, forceBonusTurns = 0 }) {
  assertRng(rng);
  if (!BASE_BETS_CENTS.includes(betCents)) throw new RangeError("Unsupported ticket cost");
  const base = playGrid({ rng, betCents, mode: "base", forceWin: forceBonusTurns > 0 });
  if (forceBonusTurns > 0) {
    const previewBeacons = forceBonusTurns >= 10 ? 5 : 4;
    base.finalGrid = base.finalGrid.map((cell) => cell.type === "beacon" ? createCell("ship") : cell);
    for (let index2 = 0; index2 < previewBeacons; index2 += 1) {
      base.finalGrid[index2] = createCell("beacon");
    }
  }
  const beaconCount = forceBonusTurns > 0 ? forceBonusTurns >= 10 ? 5 : 4 : base.beaconCount;
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

// games/thirteen-card-flip/model.ts
var THIRTEEN_CARD_FLIP_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
var THIRTEEN_CARD_FLIP_SUITS = ["clubs", "diamonds", "hearts", "spades"];
var THIRTEEN_CARD_FLIP_PAYOUT = 1.96;
var THIRTEEN_CARD_FLIP_TIE_PAYOUT = 1;
var categoryNames = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush"
];
var rankWords = {
  2: "Twos",
  3: "Threes",
  4: "Fours",
  5: "Fives",
  6: "Sixes",
  7: "Sevens",
  8: "Eights",
  9: "Nines",
  10: "Tens",
  11: "Jacks",
  12: "Queens",
  13: "Kings",
  14: "Aces"
};
var rankLabels = Object.fromEntries(
  THIRTEEN_CARD_FLIP_RANKS.map((rank, index2) => [index2 + 2, rank])
);
function score(category, tiebreakers) {
  const primary = tiebreakers[0] ?? 0;
  const secondary = tiebreakers[1] ?? 0;
  let label = categoryNames[category] ?? "High Card";
  if (category === 0) label = `${rankLabels[primary] ?? "—"} High`;
  else if (category === 1) label = `Pair of ${rankWords[primary] ?? "Cards"}`;
  else if (category === 2) label = `Two Pair, ${rankWords[primary] ?? "Cards"} and ${rankWords[secondary] ?? "Cards"}`;
  else if (category === 3) label = `Three ${rankWords[primary] ?? "Cards"}`;
  else if (category === 4) label = `${rankLabels[primary] ?? "—"}-high Straight`;
  else if (category === 5) label = `${rankLabels[primary] ?? "—"}-high Flush`;
  else if (category === 6) label = `${rankWords[primary] ?? "Cards"} full of ${rankWords[secondary] ?? "Cards"}`;
  else if (category === 7) label = `Four ${rankWords[primary] ?? "Cards"}`;
  else if (category === 8) label = `${rankLabels[primary] ?? "—"}-high Straight Flush`;
  return { category, categoryName: categoryNames[category] ?? "High Card", label, tiebreakers };
}
function straightHigh(cards2) {
  const ranks = [...new Set(cards2.map((card2) => card2.rankValue))].sort((left, right) => right - left);
  if (ranks.includes(14)) ranks.push(1);
  let run = 1;
  for (let index2 = 1; index2 < ranks.length; index2 += 1) {
    if ((ranks[index2 - 1] ?? 0) - (ranks[index2] ?? 0) === 1) run += 1;
    else run = 1;
    if (run >= 5) return ranks[index2 - 4];
  }
  return void 0;
}
function evaluateGroupHand(cards2) {
  const counts = /* @__PURE__ */ new Map();
  for (const card2 of cards2) counts.set(card2.rankValue, (counts.get(card2.rankValue) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) => rightCount - leftCount || rightRank - leftRank
  );
  const quads = groups.find(([, count]) => count === 4)?.[0];
  if (quads !== void 0)
    return score(7, [
      quads,
      ...groups.filter(([rank]) => rank !== quads).map(([rank]) => rank).sort((a, b) => b - a)
    ]);
  const trips = groups.filter(([, count]) => count >= 3).map(([rank]) => rank).sort((a, b) => b - a);
  const pairs = groups.filter(([, count]) => count >= 2).map(([rank]) => rank).sort((a, b) => b - a);
  if (trips.length > 0)
    return score(3, [
      trips[0] ?? 0,
      ...groups.filter(([rank]) => rank !== trips[0]).map(([rank]) => rank).sort((a, b) => b - a)
    ]);
  if (pairs.length >= 2) {
    const first = pairs[0] ?? 0;
    const second = pairs[1] ?? 0;
    const kickers = groups.filter(([rank]) => rank !== first && rank !== second).map(([rank]) => rank).sort((a, b) => b - a);
    return score(2, [first, second, ...kickers]);
  }
  if (pairs.length === 1) {
    const pair = pairs[0] ?? 0;
    return score(1, [
      pair,
      ...groups.filter(([rank]) => rank !== pair).map(([rank]) => rank).sort((a, b) => b - a)
    ]);
  }
  return score(
    0,
    groups.map(([rank]) => rank).sort((a, b) => b - a)
  );
}
function evaluateFive(cards2) {
  const groups = /* @__PURE__ */ new Map();
  for (const card2 of cards2) groups.set(card2.rankValue, (groups.get(card2.rankValue) ?? 0) + 1);
  const grouped = [...groups.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) => rightCount - leftCount || rightRank - leftRank
  );
  const flush = cards2.every((card2) => card2.suit === cards2[0]?.suit);
  const straight = straightHigh(cards2);
  if (flush && straight !== void 0) return score(8, [straight]);
  const quads = grouped.find(([, count]) => count === 4)?.[0];
  if (quads !== void 0) {
    const kicker = grouped.find(([rank]) => rank !== quads)?.[0] ?? 0;
    return score(7, [quads, kicker]);
  }
  const trips = grouped.find(([, count]) => count === 3)?.[0];
  const pair = grouped.find(([rank, count]) => count >= 2 && rank !== trips)?.[0];
  if (trips !== void 0 && pair !== void 0) return score(6, [trips, pair]);
  const descending = cards2.map((card2) => card2.rankValue).sort((left, right) => right - left);
  if (flush) return score(5, descending);
  if (straight !== void 0) return score(4, [straight]);
  if (trips !== void 0) return score(3, [trips, ...descending.filter((rank) => rank !== trips)]);
  const pairs = grouped.filter(([, count]) => count === 2).map(([rank]) => rank).sort((a, b) => b - a);
  if (pairs.length >= 2) {
    const first = pairs[0] ?? 0;
    const second = pairs[1] ?? 0;
    return score(2, [first, second, descending.find((rank) => rank !== first && rank !== second) ?? 0]);
  }
  if (pairs.length === 1) {
    const paired = pairs[0] ?? 0;
    return score(1, [paired, ...descending.filter((rank) => rank !== paired)]);
  }
  return score(0, descending);
}
function combinationsOfFive(cards2) {
  const combinations = [];
  for (let first = 0; first < cards2.length - 4; first += 1)
    for (let second = first + 1; second < cards2.length - 3; second += 1)
      for (let third = second + 1; third < cards2.length - 2; third += 1)
        for (let fourth = third + 1; fourth < cards2.length - 1; fourth += 1)
          for (let fifth = fourth + 1; fifth < cards2.length; fifth += 1) {
            const hand = [cards2[first], cards2[second], cards2[third], cards2[fourth], cards2[fifth]];
            if (hand.every((card2) => card2 !== void 0)) combinations.push(hand);
          }
  return combinations;
}
function compareThirteenCardFlipScores(left, right) {
  if (left.category !== right.category) return left.category - right.category;
  const length = Math.max(left.tiebreakers.length, right.tiebreakers.length);
  for (let index2 = 0; index2 < length; index2 += 1) {
    const difference = (left.tiebreakers[index2] ?? 0) - (right.tiebreakers[index2] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
function evaluateThirteenCardFlipHand(cards2) {
  if (cards2.length < 5) return evaluateGroupHand(cards2);
  let best = score(0, []);
  for (const hand of combinationsOfFive(cards2)) {
    const candidate = evaluateFive(hand);
    if (compareThirteenCardFlipScores(candidate, best) > 0) best = candidate;
  }
  return best;
}
function combinationsOfSizeIndexes(cardCount, size) {
  const combinations = [];
  const candidate = [];
  const collect = (start) => {
    if (candidate.length === size) {
      combinations.push([...candidate]);
      return;
    }
    for (let index2 = start; index2 <= cardCount - (size - candidate.length); index2 += 1) {
      candidate.push(index2);
      collect(index2 + 1);
      candidate.pop();
    }
  };
  collect(0);
  return combinations;
}
function straightRanks(high) {
  return high === 5 ? [14, 5, 4, 3, 2] : [high, high - 1, high - 2, high - 3, high - 4];
}
function canThirteenCardFlipHousePossiblyReach(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore, includeTie) {
  const reachesLeader = (candidate) => {
    const comparison = compareThirteenCardFlipScores(candidate, leaderScore);
    return includeTie ? comparison >= 0 : comparison > 0;
  };
  if (remainingHouseCards <= 0) return reachesLeader(evaluateThirteenCardFlipHand(visibleHouse));
  const deck = createThirteenCardFlipDeck();
  const houseIds = new Set(visibleHouse.map((card2) => card2.id));
  const playerIds = new Set(visiblePlayer.map((card2) => card2.id));
  const ranksDescending = Array.from({ length: 13 }, (_, index2) => 14 - index2);
  const reachesLeaderScore = (category, tiebreakers) => reachesLeader(score(category, tiebreakers));
  const canReachExactCards = (cards2) => {
    if (cards2.some((card2) => playerIds.has(card2.id))) return false;
    return cards2.filter((card2) => !houseIds.has(card2.id)).length <= remainingHouseCards;
  };
  const canReachRankCounts = (requirements) => {
    let missing = 0;
    for (const [rank, required] of requirements) {
      const held = visibleHouse.filter((card2) => card2.rankValue === rank).length;
      const blocked = visiblePlayer.filter((card2) => card2.rankValue === rank).length;
      if (4 - blocked < required) return false;
      missing += Math.max(0, required - held);
    }
    return missing <= remainingHouseCards;
  };
  const rankCombinations = (values, count) => combinationsOfSizeIndexes(values.length, count).map(
    (indexes) => indexes.map((index2) => values[index2]).filter((rank) => rank !== void 0)
  );
  for (let high = 14; high >= 5; high -= 1) {
    for (const suit of THIRTEEN_CARD_FLIP_SUITS) {
      const cards2 = straightRanks(high).map((rank) => deck.find((card2) => card2.rankValue === rank && card2.suit === suit)).filter((card2) => card2 !== void 0);
      if (cards2.length === 5 && canReachExactCards(cards2) && reachesLeaderScore(8, [high])) return true;
    }
  }
  for (const quads of ranksDescending) {
    for (const kicker of ranksDescending) {
      if (kicker === quads) continue;
      if (canReachRankCounts(
        /* @__PURE__ */ new Map([
          [quads, 4],
          [kicker, 1]
        ])
      ) && reachesLeaderScore(7, [quads, kicker]))
        return true;
    }
  }
  for (const trips of ranksDescending) {
    for (const paired of ranksDescending) {
      if (paired === trips) continue;
      if (canReachRankCounts(
        /* @__PURE__ */ new Map([
          [trips, 3],
          [paired, 2]
        ])
      ) && reachesLeaderScore(6, [trips, paired]))
        return true;
    }
  }
  for (const suit of THIRTEEN_CARD_FLIP_SUITS) {
    for (const ranks of rankCombinations(ranksDescending, 5)) {
      const cards2 = ranks.map((rank) => deck.find((card2) => card2.rankValue === rank && card2.suit === suit)).filter((card2) => card2 !== void 0);
      if (cards2.length === 5 && canReachExactCards(cards2) && reachesLeaderScore(5, ranks)) return true;
    }
  }
  for (let high = 14; high >= 5; high -= 1) {
    if (canReachRankCounts(new Map(straightRanks(high).map((rank) => [rank, 1]))) && reachesLeaderScore(4, [high]))
      return true;
  }
  for (const trips of ranksDescending) {
    const kickers = ranksDescending.filter((rank) => rank !== trips);
    for (const [first, second] of rankCombinations(kickers, 2)) {
      if (first === void 0 || second === void 0) continue;
      if (canReachRankCounts(
        /* @__PURE__ */ new Map([
          [trips, 3],
          [first, 1],
          [second, 1]
        ])
      ) && reachesLeaderScore(3, [trips, first, second]))
        return true;
    }
  }
  for (const [firstPair, secondPair] of rankCombinations(ranksDescending, 2)) {
    if (firstPair === void 0 || secondPair === void 0) continue;
    for (const kicker of ranksDescending) {
      if (kicker === firstPair || kicker === secondPair) continue;
      if (canReachRankCounts(
        /* @__PURE__ */ new Map([
          [firstPair, 2],
          [secondPair, 2],
          [kicker, 1]
        ])
      ) && reachesLeaderScore(2, [firstPair, secondPair, kicker]))
        return true;
    }
  }
  for (const paired of ranksDescending) {
    const kickers = ranksDescending.filter((rank) => rank !== paired);
    for (const [first, second, third] of rankCombinations(kickers, 3)) {
      if (first === void 0 || second === void 0 || third === void 0) continue;
      if (canReachRankCounts(
        /* @__PURE__ */ new Map([
          [paired, 2],
          [first, 1],
          [second, 1],
          [third, 1]
        ])
      ) && reachesLeaderScore(1, [paired, first, second, third]))
        return true;
    }
  }
  return leaderScore.category <= 0;
}
function canThirteenCardFlipHousePossiblyOvertake(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore) {
  return canThirteenCardFlipHousePossiblyReach(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore, false);
}
function canThirteenCardFlipHousePossiblyMatchOrOvertake(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore) {
  return canThirteenCardFlipHousePossiblyReach(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore, true);
}
function createThirteenCardFlipDeck() {
  return THIRTEEN_CARD_FLIP_SUITS.flatMap(
    (suit) => THIRTEEN_CARD_FLIP_RANKS.map((rank, rankIndex) => ({
      id: `${rank}-${suit}`,
      rank,
      rankValue: rankIndex + 2,
      suit,
      red: suit === "diamonds" || suit === "hearts"
    }))
  );
}
function other(player) {
  return player === "a" ? "b" : "a";
}
function resolveThirteenCardFlipFromHands(hands, selected) {
  return resolveThirteenCardFlipWithChoices(hands, selected);
}
function resolveThirteenCardFlipWithChoices(hands, selected, playerChoices) {
  if (hands.a.length !== 13 || hands.b.length !== 13)
    throw new Error("13 Card Flip requires exactly 13 cards per player");
  if (new Set([...hands.a, ...hands.b].map((card2) => card2.id)).size !== 26)
    throw new Error("13 Card Flip hands must not contain duplicate cards");
  if (playerChoices && (new Set(playerChoices).size !== playerChoices.length || playerChoices.some((choice) => !Number.isSafeInteger(choice) || choice < 0 || choice >= 13)))
    throw new Error("13 Card Flip choices must be unique card indexes from 0 to 12");
  const visible = { a: [], b: [] };
  const visibleIndexes = { a: [], b: [] };
  const reveals = [];
  let turn = 0;
  const reveal = (player, cardIndex, leader2, drawIndex = cardIndex) => {
    if (visibleIndexes[player].includes(cardIndex)) throw new Error("13 Card Flip cannot reveal the same card twice");
    const card2 = hands[player][drawIndex];
    if (!card2) return evaluateThirteenCardFlipHand(visible[player]);
    visible[player].push(card2);
    visibleIndexes[player].push(cardIndex);
    const handScore = evaluateThirteenCardFlipHand(visible[player]);
    reveals.push({
      ordinal: reveals.length,
      turn,
      player,
      playerIndex: cardIndex + 1,
      card: card2,
      score: handScore,
      takesLead: false,
      leader: leader2
    });
    return handScore;
  };
  let leader = "a";
  let leaderScore = evaluateThirteenCardFlipHand([]);
  while (visible.a.length < hands.a.length) {
    const nextIndex = Array.from({ length: 13 }, (_, index2) => index2).find(
      (index2) => !visibleIndexes.a.includes(index2)
    );
    if (nextIndex === void 0) break;
    leaderScore = reveal("a", nextIndex, leader);
    if (leaderScore.category >= 1) break;
  }
  const opening = reveals.at(-1);
  if (opening) {
    opening.takesLead = true;
    opening.leader = "a";
  }
  let challenger = "b";
  let winner = leader;
  let choiceCursor = 0;
  let awaitingChoice;
  let completed = true;
  roundLoop: while (true) {
    turn += 1;
    let overtook = false;
    while (visible[challenger].length < hands[challenger].length) {
      if (challenger === "a" && (() => {
        const remaining = hands.a.length - visible.a.length;
        const currentComparison = compareThirteenCardFlipScores(evaluateThirteenCardFlipHand(visible.a), leaderScore);
        if (currentComparison === 0) {
          if (canThirteenCardFlipHousePossiblyOvertake(visible.a, visible.b, remaining, leaderScore)) return false;
          winner = "tie";
          return true;
        }
        return !canThirteenCardFlipHousePossiblyMatchOrOvertake(visible.a, visible.b, remaining, leaderScore);
      })()) {
        if (winner !== "tie") winner = leader;
        break roundLoop;
      }
      const nextIndex = challenger === "b" ? playerChoices?.[choiceCursor] ?? (playerChoices === void 0 ? visible.b.length : void 0) : Array.from({ length: 13 }, (_, index2) => index2).find((index2) => !visibleIndexes.a.includes(index2));
      if (nextIndex === void 0) {
        completed = false;
        awaitingChoice = "b";
        break;
      }
      if (challenger === "b") choiceCursor += 1;
      const challengerScore = reveal(
        challenger,
        nextIndex,
        leader,
        challenger === "b" && playerChoices !== void 0 ? visible.b.length : nextIndex
      );
      if (compareThirteenCardFlipScores(challengerScore, leaderScore) > 0) {
        overtook = true;
        leader = challenger;
        leaderScore = challengerScore;
        const leadReveal = reveals.at(-1);
        if (leadReveal) {
          leadReveal.takesLead = true;
          leadReveal.leader = leader;
        }
        break;
      }
    }
    if (!completed) break;
    if (!overtook) {
      winner = compareThirteenCardFlipScores(evaluateThirteenCardFlipHand(visible[challenger]), leaderScore) === 0 ? "tie" : leader;
      break;
    }
    const next = other(challenger);
    if (visible[next].length >= hands[next].length) {
      winner = leader;
      break;
    }
    challenger = next;
  }
  const finalScores = {
    a: evaluateThirteenCardFlipHand(visible.a),
    b: evaluateThirteenCardFlipHand(visible.b)
  };
  const displayHands = playerChoices === void 0 ? hands : {
    a: hands.a,
    b: (() => {
      const displayed = Array(13).fill(void 0);
      for (let index2 = 0; index2 < visibleIndexes.b.length; index2 += 1) {
        const slot = visibleIndexes.b[index2];
        if (slot !== void 0) displayed[slot] = visible.b[index2];
      }
      const remaining = hands.b.slice(visible.b.length);
      let remainingIndex = 0;
      for (let slot = 0; slot < displayed.length; slot += 1) {
        if (displayed[slot] === void 0) {
          displayed[slot] = remaining[remainingIndex];
          remainingIndex += 1;
        }
      }
      return displayed;
    })()
  };
  return {
    kind: "thirteen-card-flip",
    selected,
    winner,
    won: completed && selected === winner,
    tied: completed && winner === "tie",
    payout: !completed ? 0 : winner === "tie" ? THIRTEEN_CARD_FLIP_TIE_PAYOUT : selected === winner ? THIRTEEN_CARD_FLIP_PAYOUT : 0,
    hands: displayHands,
    reveals,
    revealedCounts: { a: visible.a.length, b: visible.b.length },
    finalScores,
    ...playerChoices === void 0 ? {} : {
      phase: completed ? "completed" : "active",
      ...awaitingChoice ? { awaitingChoice } : {},
      playerChoices: playerChoices.slice(0, choiceCursor)
    }
  };
}
function resolveInteractiveThirteenCardFlipFromHands(hands, selected, playerChoices) {
  return resolveThirteenCardFlipWithChoices(hands, selected, playerChoices);
}
function resolveThirteenCardFlip(random, selected) {
  const deck = [...createThirteenCardFlipDeck()];
  for (let index2 = deck.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    [deck[index2], deck[swap]] = [deck[swap], deck[index2]];
  }
  const hands = { a: [], b: [] };
  for (let index2 = 0; index2 < 13; index2 += 1) {
    const first = deck[index2 * 2];
    const second = deck[index2 * 2 + 1];
    if (!first || !second) throw new Error("13 Card Flip deck ended unexpectedly");
    hands.a.push(first);
    hands.b.push(second);
  }
  return resolveThirteenCardFlipFromHands(hands, selected);
}

// games/video-poker/model.ts
var VIDEO_POKER_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
var VIDEO_POKER_SUITS = ["C", "D", "H", "S"];
var VIDEO_POKER_PAYTABLE = [
  { key: "royal-flush", label: "Royal Flush", multiplier: 800 },
  { key: "straight-flush", label: "Straight Flush", multiplier: 60 },
  { key: "four-of-a-kind", label: "4 of a Kind", multiplier: 22 },
  { key: "full-house", label: "Full House", multiplier: 9 },
  { key: "flush", label: "Flush", multiplier: 6 },
  { key: "straight", label: "Straight", multiplier: 4 },
  { key: "three-of-a-kind", label: "3 of a Kind", multiplier: 3 },
  { key: "two-pair", label: "2 Pair", multiplier: 2 },
  { key: "jacks-or-better", label: "Pair of Jacks or Better", multiplier: 1 }
];
var VIDEO_POKER_MAX_MULTIPLIER = 800;
var cardPattern = /^(10|[2-9JQKA])([CDHS])$/;
function isVideoPokerCardCode(value) {
  return typeof value === "string" && cardPattern.test(value);
}
function createVideoPokerDeck() {
  return VIDEO_POKER_SUITS.flatMap((suit) => VIDEO_POKER_RANKS.map((rank) => `${rank}${suit}`));
}
function shuffleVideoPokerDeck(random) {
  const deck = [...createVideoPokerDeck()];
  for (let index2 = deck.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    const current = deck[index2];
    const replacement = deck[swap];
    if (!current || !replacement) throw new Error("Video Poker shuffle failed");
    deck[index2] = replacement;
    deck[swap] = current;
  }
  return deck;
}
function dealVideoPoker(random) {
  const deck = shuffleVideoPokerDeck(random);
  return { deck, initialCards: deck.slice(0, 5) };
}
function cardRank(card2) {
  return card2.slice(0, -1);
}
function cardSuit(card2) {
  return card2.at(-1);
}
function rankValue(rank) {
  return VIDEO_POKER_RANKS.indexOf(rank) + 2;
}
function handResult(key, winningIndexes, label = "No Win", multiplier = 0) {
  const pay = VIDEO_POKER_PAYTABLE.find((row) => row.key === key);
  return {
    key,
    label: pay?.label ?? label,
    multiplier: pay?.multiplier ?? multiplier,
    isWin: Boolean(pay),
    winningIndexes: [...winningIndexes].sort((left, right) => left - right)
  };
}
function evaluateVideoPokerHand(cards2) {
  if (cards2.length !== 5 || cards2.some((card2) => !isVideoPokerCardCode(card2)) || new Set(cards2).size !== 5) {
    throw new Error("A Video Poker hand must contain five unique cards");
  }
  const counts = /* @__PURE__ */ new Map();
  for (const card2 of cards2) {
    const rank = cardRank(card2);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) => rightCount - leftCount || rankValue(rightRank) - rankValue(leftRank)
  );
  const uniqueValues = [...new Set(cards2.map((card2) => rankValue(cardRank(card2))))].sort((a, b) => a - b);
  const aceLow = uniqueValues.join(",") === "2,3,4,5,14";
  const straight = uniqueValues.length === 5 && (aceLow || (uniqueValues[4] ?? 0) - (uniqueValues[0] ?? 0) === 4);
  const flush = cards2.every((card2) => cardSuit(card2) === cardSuit(cards2[0]));
  const all = [0, 1, 2, 3, 4];
  const indexesFor = (ranks) => {
    const wanted = new Set(ranks);
    return cards2.flatMap((card2, index2) => wanted.has(cardRank(card2)) ? [index2] : []);
  };
  if (flush && uniqueValues.join(",") === "10,11,12,13,14") return handResult("royal-flush", all);
  if (straight && flush) return handResult("straight-flush", all);
  const four = groups.find(([, count]) => count === 4);
  if (four) return handResult("four-of-a-kind", indexesFor([four[0]]));
  const three = groups.find(([, count]) => count === 3);
  const pairs = groups.filter(([, count]) => count === 2);
  if (three && pairs.length === 1) return handResult("full-house", all);
  if (flush) return handResult("flush", all);
  if (straight) return handResult("straight", all);
  if (three) return handResult("three-of-a-kind", indexesFor([three[0]]));
  if (pairs.length === 2) return handResult("two-pair", indexesFor(pairs.map(([rank]) => rank)));
  if (pairs.length === 1 && rankValue(pairs[0]?.[0] ?? "2") >= rankValue("J")) {
    return handResult("jacks-or-better", indexesFor([pairs[0]?.[0] ?? "J"]));
  }
  return handResult("loss", []);
}
function normalizeVideoPokerHolds(value) {
  if (value.some((index2) => !Number.isSafeInteger(index2) || index2 < 0 || index2 > 4) || new Set(value).size !== value.length) {
    throw new Error("Video Poker holds must be unique card indexes from 0 through 4");
  }
  return [...value].sort((left, right) => left - right);
}
function drawVideoPoker(deck, requestedHolds) {
  if (deck.length !== 52 || deck.some((card2) => !isVideoPokerCardCode(card2)) || new Set(deck).size !== 52) {
    throw new Error("Stored Video Poker deck is invalid");
  }
  const held = normalizeVideoPokerHolds(requestedHolds);
  const heldSet = new Set(held);
  const initialCards = deck.slice(0, 5);
  let cursor = 5;
  const replacementCards = [];
  const finalCards = initialCards.map((card2, index2) => {
    if (heldSet.has(index2)) return card2;
    const replacement = deck[cursor];
    if (!replacement) throw new Error("Video Poker deck ran out of replacement cards");
    cursor += 1;
    replacementCards.push(replacement);
    return replacement;
  });
  return { initialCards, finalCards, held, replacementCards, result: evaluateVideoPokerHand(finalCards) };
}

// lucky-pinball/game/config.js
var BOARD = Object.freeze({ width: 1024, height: 1536 });
var BET_STEPS = Object.freeze([
  0.1,
  0.2,
  0.3,
  0.5,
  0.7,
  1,
  1.5,
  2,
  2.5,
  3,
  5,
  10,
  20,
  30,
  50,
  100,
  200,
  350
]);
var SPEEDS = Object.freeze([
  { id: "turbo", label: "Lightning", glyph: "ϟ", factor: 2.4 },
  { id: "fast", label: "Hare", glyph: "➤", factor: 1.55 },
  { id: "normal", label: "Walk", glyph: "●", factor: 1 },
  { id: "slow", label: "Turtle", glyph: "◆", factor: 0.68 }
]);
var PHASES = Object.freeze({
  LOADING: "loading",
  IDLE: "idle",
  REQUESTED: "requested",
  ANTICIPATION: "anticipation",
  ACTIVE: "active",
  DESCENT: "descent",
  REVEAL: "reveal",
  SETTLEMENT: "settlement"
});
var BUMPERS = Object.freeze([
  // The upper two rows are registered from the authenticated 1408×629
  // reference capture. Their previous positions were 30–40 screen pixels too
  // high and pulled the first rebound into a repeated roof loop.
  { id: "divide-left", x: 249, y: 460, radius: 35, label: "÷2", kind: "divide", value: 2, asset: "red-divider" },
  { id: "plus-a", x: 457, y: 476, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  { id: "plus-b", x: 571, y: 476, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-radial" },
  {
    id: "divide-right",
    x: 774,
    y: 460,
    radius: 35,
    label: "÷2",
    kind: "divide",
    value: 2,
    asset: "red-radial"
  },
  { id: "plus-c", x: 355, y: 618, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-radial" },
  { id: "plus-d", x: 671, y: 618, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  { id: "plus-e", x: 315, y: 825, radius: 35, label: "+2", kind: "add", value: 2, asset: "blue-core" },
  { id: "plus-f", x: 512, y: 825, radius: 33, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  {
    id: "plus-g",
    x: 710,
    y: 825,
    radius: 35,
    label: "+3",
    kind: "add",
    value: 3,
    asset: "blue-swirl",
    winRestitution: 0.595,
    winTangentRetention: 1.074,
    winKick: 0.22
  },
  { id: "multiply-two", x: 512, y: 1010, radius: 38, label: "×2", kind: "multiply", value: 2, asset: "amber-multiply" },
  { id: "plus-h", x: 300, y: 1175, radius: 35, label: "+4", kind: "add", value: 4, asset: "violet-star" },
  { id: "plus-i", x: 512, y: 1175, radius: 36, label: "+5", kind: "add", value: 5, asset: "amber-multiply" },
  { id: "plus-j", x: 725, y: 1175, radius: 35, label: "+4", kind: "add", value: 4, asset: "violet-star" }
]);
var POCKETS = Object.freeze([
  // The authenticated lower-board frames show the side receivers spread much
  // farther from the center pedestal than the former compact button row. At
  // the matched 1408 px crop their measured screen centers are about
  // 459/706/952 px; 212/512/812 board px project to those centers. The side
  // capture mouths remain deliberately wide because the resolved rigid body
  // enters their inner edge before the selected receiver contact guides it to
  // the optical center behind the foreground gate.
  { id: "left", x: 212, y: 1470, multiplier: 1, label: "×1", captureHalfWidth: 108, housingWidth: 188, baseWidth: 220 },
  { id: "center", x: 512, y: 1470, multiplier: 7, label: "×7", captureHalfWidth: 98, housingWidth: 176, baseWidth: 204 },
  { id: "right", x: 812, y: 1470, multiplier: 1, label: "×1", captureHalfWidth: 108, housingWidth: 188, baseWidth: 220 }
]);
var PEGS = Object.freeze([
  { id: "peg-u1", x: 145, y: 438, radius: 8.5 },
  { id: "peg-u2", x: 357, y: 474, radius: 8.5 },
  {
    id: "peg-u3",
    x: 662,
    y: 457,
    radius: 8.5,
    spring: "guide",
    // The resolved win uses the measured lower face of the same visible
    // crown rubber. Other outcomes retain the shared launch-field position.
    winX: 660.8053311757743,
    winY: 463.2346932247281,
    winRestitution: 0.6357584127045756,
    winTangentRetention: 0.4542580958202564,
    winKick: 0.12493801914906655
  },
  // A retractable crown pin remains part of the safe/loss/collision field.
  // The resolved win visibly withdraws it before the ball reaches the crown,
  // exposing the played reference's rail-first return lane.
  {
    id: "peg-u4",
    x: 883,
    y: 416,
    radius: 8.5,
    retractForWin: true,
    winRestitution: 0.05,
    winTangentRetention: 0.8,
    winKick: 0
  },
  { id: "peg-01", x: 145, y: 575, radius: 8.5 },
  { id: "peg-02", x: 260, y: 575, radius: 8.5 },
  { id: "peg-03", x: 405, y: 575, radius: 8.5 },
  // After the exposed outer crown lip performs the first reversal, this
  // visible rubber stud returns the same body into the validated right-wall
  // descent. The fitted response is passive and strictly outward: no hidden
  // accelerator or free-flight velocity assignment is used.
  {
    id: "peg-06",
    x: 824.0911689768545,
    y: 495.81272715702653,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.7874838033691047,
    tangentRetention: 1.0614810852799565,
    kick: 0.33517771870829166,
    winRestitution: 0.12719992116762815,
    winTangentRetention: 3.630478656527395,
    winKick: 0
  },
  // A lower crown return rubber receives the gravity-led win exit after the
  // authenticated 2.4 s traverse. It is rendered as distinctive hardware,
  // not another scoring lamp, and remains a real collider in every mode.
  {
    id: "peg-return",
    x: 810.11,
    y: 609.53,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.52,
    tangentRetention: 0.99,
    kick: 0,
    winX: 811.4505951007834,
    winY: 609.6859717660851,
    winRestitution: 0.9541213275705049,
    winTangentRetention: 2.351046779781396,
    winKick: 0.015171117528475766
  },
  // The upper-left return stud sits clear of the cabinet rail and turns the
  // first shallow rail rebound into the second measured left-side descent.
  // Its rendered center is the same center used by the rigid-body solver.
  { id: "peg-07", x: 190, y: 800, radius: 8.5 },
  { id: "peg-08", x: 250, y: 735, radius: 8.5 },
  { id: "peg-09", x: 380, y: 735, radius: 8.5 },
  {
    id: "peg-10",
    x: 512,
    y: 735,
    radius: 8.5,
    // The authenticated win visibly commits +3 at the first central return.
    // This is still the same solid rubber contact used by the fixed-step
    // trajectory; the scoring metadata only registers its already-physical
    // hit to the multiplier/effect timeline.
    scoringKind: "add",
    scoringValue: 3,
    scoringCooldownMs: 900,
    label: "+3",
    // The fast first strike keeps the established upper return. The slower
    // re-contact compresses the rubber more deeply and creates the long,
    // weighted leftward arc visible in the first-party sequence.
    winSlowThreshold: 0.6,
    winSlowRestitution: 1,
    winSlowTangentRetention: 1.52,
    winSlowKick: 0
  },
  // The next visible stud absorbs the rail-return's excess lateral energy and
  // rejoins the broad measured descent without an invisible convergence step.
  {
    id: "peg-11",
    x: 575,
    y: 680,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.7008710579946638,
    tangentRetention: 0.21186247086152435,
    kick: 0.08786168112419546,
    winRestitution: 0.496,
    winTangentRetention: 0.27
  },
  { id: "peg-12", x: 775, y: 735, radius: 8.5 },
  // Raised into the visible right-lane stud row so the descending ball can
  // glance outward once, then clear underneath it after the rail return.
  {
    id: "peg-13",
    x: 892,
    y: 720,
    radius: 8.5,
    winRestitution: 0.05,
    winTangentRetention: 1.1,
    winKick: 0
  },
  // Keep the lower stud a full ball radius away from the cabinet wall. The
  // prior half-pixel overlap could resolve a wall and stud in one step.
  { id: "peg-14", x: 190, y: 950, radius: 8.5 },
  { id: "peg-15", x: 235, y: 910, radius: 8.5 },
  { id: "peg-16", x: 385, y: 910, radius: 8.5 },
  { id: "peg-18", x: 790, y: 910, radius: 8.5 },
  {
    id: "peg-19",
    x: 905,
    y: 910,
    radius: 8.5,
    winRestitution: 1.1,
    winTangentRetention: 0,
    winKick: 0.125,
    winSlowThreshold: 1.2,
    winSlowTangentRetention: 1
  },
  {
    id: "peg-20",
    x: 112,
    y: 1070,
    radius: 8.5,
    winRestitution: 5e-3,
    winTangentRetention: 1.015
  },
  // Registered lower-left sleeve: its tangential carry produces the measured
  // lower return before the final cabinet-wall chain and left pocket.
  {
    id: "peg-21",
    x: 252.36062218993902,
    y: 1088.4131172555499,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.6582856208551675,
    tangentRetention: 0.17549020862206816,
    kick: 0.30064227181719616,
    winRestitution: 0.4,
    winTangentRetention: 0,
    winKick: 0.68
  },
  { id: "peg-25", x: 775, y: 1070, radius: 8.5 },
  { id: "peg-26", x: 912, y: 1070, radius: 8.5 },
  // This post is kept well inside the cabinet rail so the 22 px ball cannot
  // overlap the wall and stud in one solver step. The spacing removes the
  // double-contact catapult while preserving a visible lower-field actor.
  { id: "peg-27", x: 300, y: 1260, radius: 8.5 },
  // The lower-left sleeve stores more of the incoming tangential motion than
  // a bare steel post. Together with the cabinet rake it creates a physical
  // left-rail return rather than the former straight fall.
  {
    id: "peg-28",
    x: 230,
    y: 1260,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.37285596850328145,
    tangentRetention: 3.237501077679917,
    kick: 0.1547829019278288
  },
  { id: "peg-29", x: 365, y: 1260, radius: 8.5 },
  // Registered to the measured lower-board reversal. Its passive rubber face
  // turns the first cabinet return back toward the same damped rail while
  // retaining depth. The second rail contact exits rightward into the apron
  // camera track and settles at the left pocket center.
  {
    id: "peg-34",
    x: 180.289952440653,
    y: 1367,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.2236686628893949,
    tangentRetention: 0.05869007967412472,
    kick: 0.22365331488894297,
    winRestitution: 0.208,
    winTangentRetention: 0.258
  },
  { id: "peg-35", x: 390, y: 1350, radius: 8.5 },
  { id: "peg-36", x: 635, y: 1350, radius: 8.5 },
  { id: "peg-37", x: 846, y: 1350, radius: 8.5 }
]);
var ROLLOVERS = Object.freeze([
  // The accepted win body crosses this lower insert at the measured final +4
  // beat. A rollover senses that crossing without applying an impulse, so the
  // settled route and receiver entry remain the same rigid-body solution.
  { id: "rollover-plus-four", x: 254, y: 1354, radius: 13, label: "+4", kind: "add", value: 4 }
]);
var SCENARIOS = Object.freeze({
  safe: {
    id: "safe",
    label: "Right pocket win",
    pocket: "right",
    payout: "multiplier",
    plungerSpeed: 1.147
  },
  win: {
    id: "win",
    label: "Bumper-chain left-pocket win",
    pocket: "left",
    payout: "multiplier",
    // This launch remains inside the shared rigid-body solver. Its contact
    // itinerary is the closest retained fit to the authenticated motion trace:
    // it traverses the broad field, reaches the registered left-pocket center,
    // and terminates in the measured 5.25–5.54 s reference window.
    plungerSpeed: 1.3792769868134485
  },
  loss: {
    id: "loss",
    label: "Rail-chain miss",
    pocket: null,
    payout: "none",
    plungerSpeed: 1.13,
    // Every retained miss crosses the broad table. Physical contacts remain
    // continuous while rapid scoring contacts are committed as one readable
    // visual/audio beat by the shared simulation event layer. These energies
    // also drain through the visible gaps around the widened receiver mouths;
    // no loss body harmlessly overlaps a foreground gate.
    plungerSpeeds: Object.freeze([
      1.1308,
      1.1394,
      1.172,
      1.1894,
      1.192,
      1.193,
      1.2274,
      1.2822,
      1.2844,
      1.2888,
      1.292,
      1.2954,
      1.3112,
      1.3404,
      1.3432,
      1.35
    ])
  },
  collision: {
    id: "collision",
    label: "Divider collision win",
    pocket: "center",
    payout: "multiplier",
    plungerSpeed: 1.207
  }
});
var TIMING = Object.freeze({
  requestEnd: 140,
  chargeStart: 240,
  chargeEnd: 620,
  physicsStart: 720,
  plungerReleaseEnd: 960,
  anticipationEnd: 1020,
  activeEnd: 4200,
  descentEnd: 5600,
  revealEnd: 6500,
  // The preserved result sequence keeps the lower receiver camera fixed
  // through count-up and result dwell. The plaque fades first, then the
  // cabinet returns, and only the completed return unlocks controls.
  resultFadeStart: 6200,
  resultFadeEnd: 6800,
  cameraReturnStart: 6800,
  cameraReturnEnd: 7400,
  settleAt: 7400,
  cameraFollowStart: 2900,
  cameraLookAheadEnd: 3400,
  // The played reference presents the mechanical hit first, then commits the
  // multiplier on the following visual beat. Keeping that delay in the shared
  // timeline makes frozen debug playback and live playback agree exactly.
  multiplierCommitDelay: 92,
  effectDuration: 340
});
var ASSETS = Object.freeze({
  board: "assets/generated/kinetic-cabinet-v2.webp",
  arcCircuitBoard: "assets/generated/boards/arc-circuit-v2.webp",
  vintageVegasBoard: "assets/generated/boards/vintage-vegas.webp",
  ball: "assets/generated/effects/ball-steel-v2.webp",
  impactFlare: "assets/generated/effects/impact-flare-v2.webp",
  impactRing: "assets/generated/effects/impact-ring.webp",
  starburst: "assets/generated/effects/starburst.webp",
  sparks: "assets/generated/effects/sparks.webp",
  streak: "assets/generated/effects/streak.webp",
  glow: "assets/generated/effects/glow.webp",
  titlePlaque: "assets/generated/ui/title-plaque.webp",
  crown: "assets/generated/ui/crown.webp",
  playBezel: "assets/generated/ui/play-bezel.webp",
  autoplayBezel: "assets/generated/ui/autoplay-bezel.webp",
  receiverChassis: "assets/generated/ui/receiver-chassis-v1.webp",
  receiverChassisArc: "assets/generated/ui/receiver-chassis-arc-v1.webp",
  bumpers: Object.fromEntries(
    ["green-swirl", "green-radial", "blue-core", "blue-swirl", "red-divider", "red-radial", "amber-multiply", "violet-star"].map(
      (name) => [name, `assets/generated/bumpers/${name}.webp`]
    )
  )
});

// lucky-pinball/game/physics.js
var BALL_RADIUS = 22;
var FIXED_STEP_MS = 4;
var LEFT_RAIL = 92;
var RIGHT_RAIL = 932;
var GUIDE_START = Object.freeze({ x: 930, y: 614 });
var GUIDE_CENTER_CLEARANCE = 4;
var GUIDE_PATH = Object.freeze([
  GUIDE_START,
  Object.freeze({ x: 930, y: 500 }),
  Object.freeze({ x: 930, y: 410 }),
  Object.freeze({ x: 930, y: 380 }),
  Object.freeze({ x: 925, y: 345 }),
  Object.freeze({ x: 910, y: 315 }),
  Object.freeze({ x: 890, y: 292 }),
  Object.freeze({ x: 865, y: 277 }),
  Object.freeze({ x: 835, y: 270 }),
  Object.freeze({ x: 805, y: 278 })
]);
var WIN_GUIDE_EXTENSION = { x: 784.6373589119409, y: 296.57014116994105 };
var WIN_GUIDE_GATE_POINT = { x: 764.4961879068985, y: 319.3390411586035 };
var WIN_GUIDE_PATH = Object.freeze([
  ...GUIDE_PATH,
  WIN_GUIDE_EXTENSION,
  WIN_GUIDE_GATE_POINT
]);
var GUIDE_GATE = GUIDE_PATH.at(-1);
var WIN_GUIDE_GATE = WIN_GUIDE_PATH.at(-1);
var MOTION_SCHEDULE_KNOTS = Object.freeze([
  Object.freeze({ physicsAt: 720, timelineAt: 720 }),
  // The earlier two-point interpolation ran several rendered pixels ahead of
  // the authenticated ball while it was still inside the vertical sleeve.
  // These measured 100 ms beats preserve one continuously increasing clock
  // but remove that small launch-boundary surge.
  Object.freeze({ physicsAt: 876, timelineAt: 900 }),
  Object.freeze({ physicsAt: 944, timelineAt: 1e3 }),
  Object.freeze({ physicsAt: 996, timelineAt: 1100 }),
  Object.freeze({ physicsAt: 1052, timelineAt: 1200 }),
  Object.freeze({ physicsAt: 1100, timelineAt: 1300 }),
  Object.freeze({ physicsAt: 1156, timelineAt: 1400 }),
  Object.freeze({ physicsAt: 1220, timelineAt: 1500 }),
  Object.freeze({ physicsAt: 1292, timelineAt: 1600 }),
  // Visually confirmed crown samples. These knots preserve the free body's
  // measured positions; they do not assign velocity or steer between them.
  Object.freeze({ physicsAt: 1376, timelineAt: 1700 }),
  Object.freeze({ physicsAt: 1432, timelineAt: 1800 }),
  Object.freeze({ physicsAt: 1544, timelineAt: 1900 }),
  Object.freeze({ physicsAt: 1692, timelineAt: 2e3 }),
  Object.freeze({ physicsAt: 1764, timelineAt: 2100 }),
  Object.freeze({ physicsAt: 1864, timelineAt: 2200 }),
  // The reference begins its one-way camera handoff as the crown exit drops
  // under the first right-lane stud, briefly dwelling at the physical hit.
  Object.freeze({ physicsAt: 2128, timelineAt: 2300 }),
  // After the first crown reversal the reference holds the ball in a lower
  // tracking band while it traverses to the visible return rubber. These
  // anchors sample that uninterrupted gravity arc instead of freezing on the
  // old, prematurely placed stud.
  Object.freeze({ physicsAt: 2316, timelineAt: 2400 }),
  Object.freeze({ physicsAt: 2356, timelineAt: 2500 }),
  // The authenticated return advances slightly farther during the rightward
  // approach, then crosses the physical wall/peg reversal between the 2.7 and
  // 2.8 second rendered beats. These remain samples of the same solved body.
  Object.freeze({ physicsAt: 2424, timelineAt: 2600 }),
  Object.freeze({ physicsAt: 2444, timelineAt: 2700 }),
  // The lower crown strike rejoins the exact V51 board-space state 52 ms
  // later. Shifting every later sample by that measured physical offset keeps
  // the validated pin itinerary and terminal approach unchanged on screen.
  Object.freeze({ physicsAt: 2604, timelineAt: 2800 }),
  Object.freeze({ physicsAt: 2705, timelineAt: 2900 }),
  Object.freeze({ physicsAt: 2812, timelineAt: 3e3 }),
  Object.freeze({ physicsAt: 2916, timelineAt: 3100 }),
  Object.freeze({ physicsAt: 3036, timelineAt: 3200 }),
  Object.freeze({ physicsAt: 3468, timelineAt: 3300 }),
  Object.freeze({ physicsAt: 3712, timelineAt: 3400 }),
  Object.freeze({ physicsAt: 3884, timelineAt: 3500 }),
  Object.freeze({ physicsAt: 4020, timelineAt: 3600 }),
  Object.freeze({ physicsAt: 4156, timelineAt: 3700 }),
  Object.freeze({ physicsAt: 4292, timelineAt: 3800 }),
  Object.freeze({ physicsAt: 4404, timelineAt: 3900 }),
  Object.freeze({ physicsAt: 4496, timelineAt: 4e3 }),
  Object.freeze({ physicsAt: 4588, timelineAt: 4100 }),
  Object.freeze({ physicsAt: 4696, timelineAt: 4200 }),
  Object.freeze({ physicsAt: 4772, timelineAt: 4300 }),
  Object.freeze({ physicsAt: 4848, timelineAt: 4400 }),
  Object.freeze({ physicsAt: 4940, timelineAt: 4500 }),
  // Hold the first wall strike for one beat, then advance through the visible
  // stud return to the second left-side contact. These are immutable samples
  // from the same fixed-step body, not authored screen-space positions.
  Object.freeze({ physicsAt: 4984, timelineAt: 4600 }),
  Object.freeze({ physicsAt: 5244, timelineAt: 4700 }),
  Object.freeze({ physicsAt: 5376, timelineAt: 4800 }),
  Object.freeze({ physicsAt: 5584, timelineAt: 4900 }),
  Object.freeze({ physicsAt: 5660, timelineAt: 5e3 }),
  Object.freeze({ physicsAt: 5808, timelineAt: 5100 }),
  Object.freeze({ physicsAt: 5928, timelineAt: 5200 }),
  Object.freeze({ physicsAt: 6012, timelineAt: 5300 }),
  Object.freeze({ physicsAt: 6252, timelineAt: 5600 }),
  Object.freeze({ physicsAt: 7e3, timelineAt: 7e3 })
]);
var PHYSICS_RESPONSE = {
  tableGravity: 165e-5,
  guideRailRestitution: 0.12,
  guideRailTangentRetention: 0.9975,
  guidePostRestitution: 1.12,
  guidePostKick: 0.14,
  guidePostTangentRetention: 0.28,
  winGuidePostRestitution: 0.638,
  winGuidePostKick: 0.14,
  winGuidePostTangentRetention: 0.378,
  passiveRestitution: 0.52,
  passiveTangentRetention: 0.99,
  dividerRestitution: 0.25,
  dividerTangentRetention: 1.05,
  winDividerTangentRetention: 1,
  activeRestitution: 0.72,
  activeKick: 0.22,
  activeTangentRetention: 0.99,
  railRetention: 0.82,
  railMinimumRebound: 0.58,
  // The launch sleeve and the cabinet crown are visibly separate in the
  // played reference. The ordinary right rail remains registered to the
  // narrow launch lane; the resolved win can roll across the exposed crown
  // before the outer rubber returns it toward the divider field.
  crownRailX: 949,
  crownRailEndY: 420,
  crownRailRestitution: 0.5,
  crownRailNormalY: 0.025,
  crownRailMinimumRebound: 0.617,
  crownRailTangentRetention: 1,
  // The exposed crown lip is a softer, more steeply raked material than the
  // long outer return wall below it. Keeping this response local to the first
  // high contact lets the ball roll off the crown naturally without changing
  // the already-registered lower right-wall rebound.
  crownEntryEndY: 470,
  crownEntryRestitution: 0.2665916561209489,
  // The authenticated exit carries less leftward speed and more gravity-led
  // descent than the earlier hard lateral snap. This softer vector is solved
  // by the visible crown rubber; it brings the 2.3 s optical center onto the
  // measured drop without assigning any in-flight position or velocity.
  crownEntryNormalY: 0.4167659058619215,
  crownEntryMinimumRebound: 0.23540600511364995,
  crownEntryTangentRetention: 0.34594939138899927,
  lowerCrownRailStartY: 600,
  // The relocated visible return stud reaches this lower crown segment with
  // a different incoming tangent. Its paired retention reproduces the exact
  // previously validated wall state before the body re-enters the pin field.
  lowerCrownRailTangentRetention: 1.6070148124663226,
  lowerRailStartY: 1280,
  // The lower return is visibly raked in the cabinet. This measured normal
  // produces the two lateral reversals in the authenticated late-win trace;
  // it redirects the rigid body at contact instead of accelerating it along a
  // authored path.
  lowerRailNormalY: 0.2194304170459509,
  lowerRailRestitution: 1.2357749476935713,
  winLowerRailRestitution: 0.99,
  winLowerRailMinimumRebound: 0.52,
  winDeepLowerRailStartY: 1380,
  winDeepLowerRailMinimumRebound: 0.92,
  lowerRailTangentRetention: 0.14021843974478543,
  lowerRailMinimumRebound: 0.6137297969846985,
  // The measured apron flattens near the drain. Tapering its normal here keeps
  // the second reversal lateral while preserving downward pocket entry.
  lowerRailTaperStartY: 1353.9501530919224,
  lowerRailTaperEndY: 1373.6455487450585,
  lowerRailDeepNormalY: 0.08765220835339278
};
function monotoneEndpointSlope(h0, h1, delta0, delta1) {
  let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(slope) !== Math.sign(delta0)) return 0;
  if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > Math.abs(3 * delta0)) {
    slope = 3 * delta0;
  }
  return slope;
}
function buildMonotoneClock(inputKey, outputKey) {
  const points = MOTION_SCHEDULE_KNOTS.map((point) => ({
    x: point[inputKey],
    y: point[outputKey]
  }));
  const intervals = points.slice(0, -1).map((point, index2) => points[index2 + 1].x - point.x);
  const secants = intervals.map(
    (interval, index2) => (points[index2 + 1].y - points[index2].y) / interval
  );
  const slopes = new Array(points.length);
  slopes[0] = monotoneEndpointSlope(intervals[0], intervals[1], secants[0], secants[1]);
  for (let index2 = 1; index2 < points.length - 1; index2 += 1) {
    const before = secants[index2 - 1];
    const after = secants[index2];
    if (before * after <= 0) {
      slopes[index2] = 0;
      continue;
    }
    const beforeInterval = intervals[index2 - 1];
    const afterInterval = intervals[index2];
    const weightBefore = 2 * afterInterval + beforeInterval;
    const weightAfter = afterInterval + 2 * beforeInterval;
    slopes[index2] = (weightBefore + weightAfter) / (weightBefore / before + weightAfter / after);
  }
  const final = points.length - 1;
  slopes[final] = monotoneEndpointSlope(
    intervals.at(-1),
    intervals.at(-2),
    secants.at(-1),
    secants.at(-2)
  );
  return Object.freeze({ points, intervals, slopes });
}
var WIN_MOTION_CLOCK = buildMonotoneClock("timelineAt", "physicsAt");
var PHYSICS = Object.freeze({
  ballRadius: BALL_RADIUS,
  gravity: PHYSICS_RESPONSE.tableGravity,
  fixedStepMs: FIXED_STEP_MS,
  launchReleaseAt: TIMING.physicsStart,
  guide: {
    path: GUIDE_PATH,
    winPath: WIN_GUIDE_PATH,
    centerClearance: GUIDE_CENTER_CLEARANCE,
    gate: GUIDE_GATE,
    winGate: WIN_GUIDE_GATE
  },
  rails: { left: LEFT_RAIL, right: RIGHT_RAIL, winCrownRight: PHYSICS_RESPONSE.crownRailX },
  motionSchedule: MOTION_SCHEDULE_KNOTS
});

// lucky-pinball/game/timeline.js
var WIN_CAMERA_TRACK = Object.freeze([
  // The first-party cabinet begins translating under the right-lane traverse,
  // then gives back a small amount of travel as the registered peg sends the
  // ball upward. Anchoring these observed beats removes the former late camera
  // catch without changing the board-space trajectory.
  Object.freeze({ at: 2300, y: 1.2 }),
  Object.freeze({ at: 2400, y: 100.94 }),
  Object.freeze({ at: 2500, y: 129.46 }),
  Object.freeze({ at: 2600, y: 199.15 }),
  Object.freeze({ at: 2700, y: 221.05 }),
  // Intermediate anchors retain a finite camera velocity through the fast
  // cabinet dolly instead of allowing a cubic tangent spike at the endpoint.
  Object.freeze({ at: 2720, y: 237.6 }),
  Object.freeze({ at: 2740, y: 277.2 }),
  Object.freeze({ at: 2760, y: 316.8 }),
  Object.freeze({ at: 2780, y: 356.4 }),
  Object.freeze({ at: 2800, y: 396 }),
  Object.freeze({ at: 2900, y: 353 }),
  Object.freeze({ at: 3e3, y: 403 }),
  Object.freeze({ at: 3100, y: 455 }),
  Object.freeze({ at: 3200, y: 473 }),
  Object.freeze({ at: 3300, y: 486 }),
  Object.freeze({ at: 3400, y: 509 }),
  Object.freeze({ at: 3500, y: 508 }),
  Object.freeze({ at: 3600, y: 502 }),
  Object.freeze({ at: 3700, y: 515 }),
  Object.freeze({ at: 3800, y: 541 }),
  Object.freeze({ at: 3900, y: 522 }),
  Object.freeze({ at: 4e3, y: 511 }),
  Object.freeze({ at: 4100, y: 489 }),
  Object.freeze({ at: 4200, y: 473 }),
  Object.freeze({ at: 4300, y: 458 }),
  Object.freeze({ at: 4400, y: 441 }),
  Object.freeze({ at: 4500, y: 418 }),
  Object.freeze({ at: 4600, y: 420 }),
  Object.freeze({ at: 4700, y: 430 }),
  Object.freeze({ at: 4800, y: 524 }),
  Object.freeze({ at: 4900, y: 663 }),
  Object.freeze({ at: 5e3, y: 697 }),
  Object.freeze({ at: 5100, y: 789 }),
  Object.freeze({ at: 5200, y: 889 }),
  Object.freeze({ at: 5300, y: 973 })
]);

// lucky-pinball/game/logic.js
var TARGET_RTP2 = 0.96;
var PAYOUT_MULTIPLIERS = Object.freeze({
  safe: 10.2,
  win: 9.1,
  collision: 30.1,
  loss: 0
});
var SAFE_PROBABILITY = 0.04;
var WIN_PROBABILITY = 0.01;
var COLLISION_PROBABILITY = (TARGET_RTP2 - SAFE_PROBABILITY * PAYOUT_MULTIPLIERS.safe - WIN_PROBABILITY * PAYOUT_MULTIPLIERS.win) / PAYOUT_MULTIPLIERS.collision;
var LOSS_PROBABILITY = 1 - SAFE_PROBABILITY - WIN_PROBABILITY - COLLISION_PROBABILITY;
var OUTCOME_PROBABILITIES = Object.freeze({
  safe: SAFE_PROBABILITY,
  win: WIN_PROBABILITY,
  collision: COLLISION_PROBABILITY,
  loss: LOSS_PROBABILITY
});
var RTP_MODEL = Object.freeze({
  targetRtp: TARGET_RTP2,
  houseEdge: 1 - TARGET_RTP2,
  probabilities: OUTCOME_PROBABILITIES,
  payoutMultipliers: PAYOUT_MULTIPLIERS,
  theoreticalRtp: Object.entries(OUTCOME_PROBABILITIES).reduce(
    (total, [scenarioId, probability]) => total + probability * PAYOUT_MULTIPLIERS[scenarioId],
    0
  )
});

// originals-lab/plinko-paytables.js
var RAINBET_PLINKO_RISKS = Object.freeze(["low", "medium", "high", "rain"]);
var PLINKO_TARGET_RTP_BPS = 9900;
var PLINKO_TARGET_RTP = PLINKO_TARGET_RTP_BPS / 1e4;
var RAINBET_PLINKO_PAYTABLES = Object.freeze({
  low: Object.freeze({
    8: Object.freeze([5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6]),
    9: Object.freeze([5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6]),
    10: Object.freeze([8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9]),
    11: Object.freeze([8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4]),
    12: Object.freeze([10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10]),
    13: Object.freeze([8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1]),
    14: Object.freeze([7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1]),
    15: Object.freeze([15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15]),
    16: Object.freeze([16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16])
  }),
  medium: Object.freeze({
    8: Object.freeze([13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13]),
    9: Object.freeze([18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18]),
    10: Object.freeze([22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22]),
    11: Object.freeze([24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24]),
    12: Object.freeze([33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33]),
    13: Object.freeze([43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43]),
    14: Object.freeze([58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58]),
    15: Object.freeze([88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88]),
    16: Object.freeze([110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110])
  }),
  high: Object.freeze({
    8: Object.freeze([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]),
    9: Object.freeze([43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43]),
    10: Object.freeze([76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]),
    11: Object.freeze([120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120]),
    12: Object.freeze([170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]),
    13: Object.freeze([260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260]),
    14: Object.freeze([420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420]),
    15: Object.freeze([620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620]),
    16: Object.freeze([1e3, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1e3])
  }),
  rain: Object.freeze({
    8: Object.freeze([22, 2, 0.9, 0.4, 0.2, 0.4, 0.9, 2, 22]),
    9: Object.freeze([30, 2, 2.2, 0.7, 0.2, 0.2, 0.7, 2.2, 2, 30]),
    10: Object.freeze([45, 2, 3.1, 1.2, 0.4, 0.2, 0.4, 1.2, 3.1, 2, 45]),
    11: Object.freeze([65, 10, 2, 1.4, 0.5, 0.2, 0.2, 0.5, 1.4, 2, 10, 65]),
    12: Object.freeze([100, 15, 2, 3.1, 0.6, 0.3, 0.2, 0.3, 0.6, 3.1, 2, 15, 100]),
    13: Object.freeze([175, 25, 4, 2, 1, 0.3, 0.2, 0.2, 0.3, 1, 2, 4, 25, 175]),
    14: Object.freeze([250, 35, 11, 2, 1.8, 0.5, 0.3, 0.2, 0.3, 0.5, 1.8, 2, 11, 35, 250]),
    15: Object.freeze([400, 40, 17, 2, 2.3, 1.3, 0.4, 0.2, 0.2, 0.4, 1.3, 2.3, 2, 17, 40, 400]),
    16: Object.freeze([500, 42, 22, 4, 2, 2, 0.3, 0.2, 0.2, 0.2, 0.3, 2, 2, 4, 22, 42, 500])
  })
});

// rainbet-mines/engine.js
var GRID_SIZES = Object.freeze([25, 36, 49, 64]);
var ROUND_PHASES = Object.freeze({
  idle: "idle",
  configuring: "configuring",
  starting: "round-starting",
  active: "active",
  safeReveal: "safe-reveal",
  lossReveal: "loss-reveal",
  cashout: "cashout",
  settlement: "settlement",
  reset: "reset"
});
var DEFAULT_GRID_SIZE = 25;
var DEFAULT_MINE_COUNT = 8;
var HOUSE_RETURN = 0.96;
function integer(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeGridSize(value) {
  const parsed = integer(value, DEFAULT_GRID_SIZE);
  return GRID_SIZES.includes(parsed) ? parsed : DEFAULT_GRID_SIZE;
}
function clampMineCount(value, gridSize = DEFAULT_GRID_SIZE) {
  const size = normalizeGridSize(gridSize);
  return Math.min(size - 1, Math.max(1, integer(value, DEFAULT_MINE_COUNT)));
}
function multiplierFor({ gridSize, mineCount, revealedCount }) {
  const size = normalizeGridSize(gridSize);
  const mines = clampMineCount(mineCount, size);
  const reveals = Math.min(size - mines, Math.max(0, integer(revealedCount, 0)));
  if (reveals === 0) return 1;
  let probability = 1;
  for (let index2 = 0; index2 < reveals; index2 += 1) {
    probability *= (size - mines - index2) / (size - index2);
  }
  return HOUSE_RETURN / probability;
}
var MINES_RAW_MAX_MULTIPLIER = Math.max(
  ...GRID_SIZES.flatMap(
    (gridSize) => Array.from({ length: gridSize - 1 }, (_, index2) => {
      const mineCount = index2 + 1;
      return multiplierFor({ gridSize, mineCount, revealedCount: gridSize - mineCount });
    })
  )
);
var MINES_MAX_MULTIPLIER = 1e4;

// rainbet-roulette/engine.js
var EUROPEAN_WHEEL = Object.freeze([
  0,
  32,
  15,
  19,
  4,
  21,
  2,
  25,
  17,
  34,
  6,
  27,
  13,
  36,
  11,
  30,
  8,
  23,
  10,
  5,
  24,
  16,
  33,
  1,
  20,
  14,
  31,
  9,
  22,
  18,
  29,
  7,
  28,
  12,
  35,
  3,
  26
]);
var RED_NUMBERS = /* @__PURE__ */ new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
function rouletteColor(number) {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}
function winningBetKeys(number) {
  if (!Number.isInteger(number) || number < 0 || number > 36) throw new RangeError("Roulette result must be an integer from 0 through 36");
  const keys = /* @__PURE__ */ new Set([`number:${number}`]);
  if (number === 0) return keys;
  keys.add(`color:${rouletteColor(number)}`);
  keys.add(number % 2 ? "parity:odd" : "parity:even");
  keys.add(number <= 18 ? "range:low" : "range:high");
  keys.add(`dozen:${Math.ceil(number / 12)}`);
  keys.add(`column:${number % 3 || 3}`);
  return keys;
}
function multiplierForBet(key) {
  if (key.startsWith("number:")) return 36;
  if (key.startsWith("dozen:") || key.startsWith("column:")) return 3;
  if (key.startsWith("color:") || key.startsWith("parity:") || key.startsWith("range:")) return 2;
  return 0;
}
function settleRouletteBets(bets, result) {
  const winners = winningBetKeys(result);
  let stake = 0;
  let payout = 0;
  const paid = [];
  for (const [key, rawAmount] of bets) {
    const amount = Math.max(0, Number(rawAmount) || 0);
    stake += amount;
    if (!winners.has(key)) continue;
    const multiplier = multiplierForBet(key);
    const win = amount * multiplier;
    payout += win;
    paid.push({ key, amount, multiplier, payout: win });
  }
  return {
    result,
    stake,
    payout,
    multiplier: stake ? payout / stake : 0,
    winners,
    paid
  };
}

// rainbet-wheel/engine.js
var RISKS = Object.freeze(["low", "medium", "high", "risky"]);
var SECTOR_COUNT = 25;
var MAX_SPINS = 10;
var MIN_WAGER = 0.1;
var MAX_WAGER = 12500;
var MAX_MULTIPLIER = 1e4;
var MAX_CASH_PAYOUT = 5e5;
var PUBLISHED_MAX_RTP = 0.964;
var ROUND_PHASES2 = Object.freeze({
  idle: "idle",
  spinning: "spinning",
  revealing: "revealing",
  active: "active",
  maxed: "maxed",
  cashing: "cashing",
  cashed: "cashed",
  lost: "lost"
});
var AUTO_RULES = Object.freeze({
  reset: "reset",
  increase: "increase"
});
var OUTCOME_CATEGORIES = Object.freeze(["loss", "gold", "green", "blue", "orange"]);
var CURRENCY_SCALE = 1e8;
var MULTIPLIER_SCALE2 = 1e12;
function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}
var RISK_DISTRIBUTIONS = Object.freeze({
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
var RISK_TABLES = Object.freeze({
  low: Object.freeze([
    0,
    1.1,
    1.2,
    1.4,
    1.1,
    0,
    1.2,
    1.1,
    1.1,
    1.2,
    0,
    1.1,
    1.1,
    2,
    1.2,
    0,
    1.1,
    1.2,
    1.4,
    1.1,
    0,
    1.1,
    1.2,
    1.1,
    1.1
  ]),
  medium: Object.freeze([
    0,
    1.5,
    0,
    1.2,
    2.2,
    0,
    1.2,
    0,
    1.5,
    4,
    0,
    1.2,
    0,
    1.2,
    1.5,
    0,
    1.2,
    0,
    1.2,
    2.2,
    0,
    1.2,
    0,
    1.5,
    1.2
  ]),
  high: Object.freeze([
    0,
    1.5,
    0,
    3,
    0,
    0,
    2,
    0,
    1.5,
    0,
    0,
    2,
    0,
    6,
    0,
    0,
    1.5,
    0,
    3,
    0,
    0,
    2,
    0,
    0,
    1.5
  ]),
  risky: Object.freeze([
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    15,
    0,
    0
  ])
});
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
  if (value && typeof value === "object" && value.numerator !== void 0) {
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
var EXACT_ZERO_MULTIPLIER = Object.freeze({ numerator: "0", decimalPower: 0 });
var EXACT_ONE_MULTIPLIER = Object.freeze({ numerator: "1", decimalPower: 0 });
var EXACT_MAX_MULTIPLIER = Object.freeze({ numerator: String(MAX_MULTIPLIER), decimalPower: 0 });
function compareExactMultipliers(left, right) {
  const a = parsedExactMultiplier(left, "left multiplier");
  const b = parsedExactMultiplier(right, "right multiplier");
  const power = Math.max(a.decimalPower, b.decimalPower);
  const aNumerator = BigInt(a.numerator) * powerOfTen(power - a.decimalPower);
  const bNumerator = BigInt(b.numerator) * powerOfTen(power - b.decimalPower);
  return aNumerator < bNumerator ? -1 : aNumerator > bNumerator ? 1 : 0;
}
function createExactMultiplier(value = 1) {
  const exact = parsedExactMultiplier(value);
  return compareExactMultipliers(exact, EXACT_MAX_MULTIPLIER) > 0 ? EXACT_MAX_MULTIPLIER : exact;
}
function exactMultiplierToString(value) {
  const exact = parsedExactMultiplier(value);
  if (exact.decimalPower === 0) return exact.numerator;
  const digits = exact.numerator.padStart(exact.decimalPower + 1, "0");
  const split = digits.length - exact.decimalPower;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}
function exactMultiplierToNumber(value) {
  return Number(exactMultiplierToString(value));
}
function multiplyExactMultiplier(current, factor) {
  const left = parsedExactMultiplier(current, "current multiplier");
  const right = parsedExactMultiplier(factor, "outcome multiplier");
  if (left.numerator === "0" || right.numerator === "0") return EXACT_ZERO_MULTIPLIER;
  const product = normalizedExactMultiplier(
    BigInt(left.numerator) * BigInt(right.numerator),
    left.decimalPower + right.decimalPower
  );
  return compareExactMultipliers(product, EXACT_MAX_MULTIPLIER) >= 0 ? EXACT_MAX_MULTIPLIER : product;
}
function roundToScale(value, scale) {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * scale) / scale;
}
function normalizedRisk(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function validateRisk(value) {
  const risk = normalizedRisk(value);
  if (!RISKS.includes(risk)) throw new RangeError(`Unsupported Wheel risk: ${value}`);
  return risk;
}
function riskTableFor(risk) {
  return RISK_TABLES[validateRisk(risk)];
}
function countOutcomes(table) {
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
var RISK_COUNTS = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [risk, countOutcomes(RISK_TABLES[risk])])
));
function meanMultiplier(table) {
  if (!Array.isArray(table) || table.length === 0) {
    throw new TypeError("Wheel table must be a non-empty array");
  }
  const total = table.reduce((sum, raw) => {
    const multiplier = finiteNumber(raw, "sector multiplier");
    if (multiplier < 0) throw new RangeError("sector multipliers must be non-negative");
    return sum + multiplier;
  }, 0);
  return roundToScale(total / table.length, MULTIPLIER_SCALE2);
}
function rtpForRisk(risk) {
  return meanMultiplier(riskTableFor(risk));
}
var RTP_BY_RISK = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [risk, rtpForRisk(risk)])
));
function nonzeroMultipliersFor(risk) {
  return Object.freeze([...new Set(riskTableFor(risk).filter((value) => value > 0))].sort((a, b) => a - b));
}
function categoryForMultiplier(risk, multiplier) {
  const numeric = finiteNumber(multiplier, "multiplier");
  if (numeric === 0) return OUTCOME_CATEGORIES[0];
  const rank = nonzeroMultipliersFor(risk).indexOf(numeric);
  if (rank < 0) throw new RangeError(`${numeric}x is not present in the ${risk} table`);
  return OUTCOME_CATEGORIES[rank + 1];
}
var SECTOR_CATEGORIES = Object.freeze(Object.fromEntries(
  RISKS.map((risk) => [
    risk,
    Object.freeze(RISK_TABLES[risk].map((multiplier) => categoryForMultiplier(risk, multiplier)))
  ])
));
function assertRiskTables(tables = RISK_TABLES) {
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
function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return roundToScale(numeric, CURRENCY_SCALE);
}
function isValidWager(value) {
  const amount = roundCurrency(value);
  return amount >= MIN_WAGER && amount <= MAX_WAGER;
}
function cappedMultiplier(value) {
  return exactMultiplierToNumber(createExactMultiplier(value ?? 0));
}
function payoutFor(wager, multiplier) {
  const amount = roundCurrency(wager);
  const product = roundCurrency(amount * cappedMultiplier(multiplier));
  return Math.min(MAX_CASH_PAYOUT, product);
}
function validSectorIndex(index2) {
  const numeric = Number(index2);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= SECTOR_COUNT) {
    throw new RangeError(`Wheel sector index must be between 0 and ${SECTOR_COUNT - 1}`);
  }
  return numeric;
}
function outcomeForIndex(risk, index2) {
  const normalized = validateRisk(risk);
  const sectorIndex = validSectorIndex(index2);
  return Object.freeze({
    risk: normalized,
    index: sectorIndex,
    multiplier: RISK_TABLES[normalized][sectorIndex],
    probability: 1 / SECTOR_COUNT
  });
}
function freezeRoundState(state) {
  return Object.freeze({ ...state });
}
function normalizedRoundNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}
function normalizedRoundId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function createRoundState(options = {}) {
  const risk = validateRisk(options.risk ?? "low");
  const demo = options.demo === true;
  const requestedWager = roundCurrency(options.wager);
  const wager = isValidWager(requestedWager) || demo && requestedWager === 0 ? requestedWager : 0;
  return freezeRoundState({
    risk,
    demo,
    phase: ROUND_PHASES2.idle,
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
function canSpin(state, options = {}) {
  if (!state) return false;
  if (state.phase === ROUND_PHASES2.idle) {
    const demo = options.demo ?? state.demo;
    const wager = roundCurrency(options.wager ?? state.wager);
    return demo === true ? wager === 0 || isValidWager(wager) : isValidWager(wager);
  }
  if (!state.demo && !isValidWager(state.wager)) return false;
  return state.phase === ROUND_PHASES2.active && state.spinsCompleted < MAX_SPINS;
}
function startSpin(state, options = {}) {
  if (!canSpin(state, options)) return state;
  const firstSpin = state.phase === ROUND_PHASES2.idle;
  const demo = firstSpin ? (options.demo ?? state.demo) === true : state.demo;
  const risk = firstSpin ? validateRisk(options.risk ?? state.risk) : state.risk;
  const requestedWager = firstSpin ? options.wager ?? state.wager : state.wager;
  if (!demo && !isValidWager(requestedWager)) return state;
  if (demo && roundCurrency(requestedWager) !== 0 && !isValidWager(requestedWager)) return state;
  return freezeRoundState({
    ...state,
    risk,
    demo,
    phase: ROUND_PHASES2.spinning,
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
function assertEngineInvariants() {
  assertRiskTables();
  if (SECTOR_COUNT !== 25 || MAX_SPINS !== 10) throw new Error("Wheel cardinality invariants changed");
  if (MAX_MULTIPLIER !== 1e4 || MAX_CASH_PAYOUT !== 5e5) {
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
  if (demo.phase !== ROUND_PHASES2.spinning || demo.wager !== 0 || demo.demo !== true) {
    throw new Error("explicit zero-value demo rounds must remain playable");
  }
  const paidZero = startSpin(createRoundState({ risk: "low" }), { wager: 0 });
  if (paidZero.phase !== ROUND_PHASES2.idle) throw new Error("paid zero-value rounds must remain invalid");
  return true;
}
assertEngineInvariants();

// shuffle-keno/engine.js
var PAYOUTS = {
  Classic: {
    1: ["0.00x", "3.96x"],
    2: ["0.00x", "1.90x", "4.50x"],
    3: ["0.00x", "1.00x", "3.10x", "10.40x"],
    4: ["0.00x", "0.80x", "1.80x", "5.00x", "22.50x"],
    5: ["0.00x", "0.25x", "1.40x", "4.10x", "16.50x", "36.00x"],
    6: ["0.00x", "0.00x", "1.00x", "3.68x", "7.00x", "16.50x", "40.00x"],
    7: ["0.00x", "0.00x", "0.47x", "3.00x", "4.50x", "14.00x", "31.00x", "60.00x"],
    8: ["0.00x", "0.00x", "0.00x", "2.20x", "4.00x", "13.00x", "22.00x", "55.00x", "70.00x"],
    9: ["0.00x", "0.00x", "0.00x", "1.55x", "3.00x", "8.00x", "15.00x", "44.00x", "60.00x", "85.00x"],
    10: ["0.00x", "0.00x", "0.00x", "1.40x", "2.25x", "4.50x", "8.00x", "17.00x", "50.00x", "80.00x", "100.0x"]
  },
  Low: {
    1: ["0.70x", "1.85x"],
    2: ["0.00x", "2.00x", "3.80x"],
    3: ["0.00x", "1.10x", "1.38x", "26.00x"],
    4: ["0.00x", "0.00x", "2.20x", "7.90x", "90.00x"],
    5: ["0.00x", "0.00x", "1.50x", "4.20x", "13.00x", "300.0x"],
    6: ["0.00x", "0.00x", "1.10x", "2.00x", "6.20x", "100.0x", "700.0x"],
    7: ["0.00x", "0.00x", "1.10x", "1.60x", "3.50x", "15.00x", "225.0x", "700.0x"],
    8: ["0.00x", "0.00x", "1.10x", "1.50x", "2.00x", "5.50x", "39.00x", "100.0x", "800.0x"],
    9: ["0.00x", "0.00x", "1.10x", "1.30x", "1.70x", "2.50x", "7.50x", "50.00x", "250.0x", "1,000.0x"],
    10: ["0.00x", "0.00x", "1.10x", "1.20x", "1.30x", "1.80x", "3.50x", "13.00x", "50.00x", "250.0x", "1,000.0x"]
  },
  Medium: {
    1: ["0.40x", "2.75x"],
    2: ["0.00x", "1.80x", "5.10x"],
    3: ["0.00x", "0.00x", "2.80x", "50.00x"],
    4: ["0.00x", "0.00x", "1.70x", "10.00x", "100.0x"],
    5: ["0.00x", "0.00x", "1.40x", "4.00x", "14.00x", "390.0x"],
    6: ["0.00x", "0.00x", "0.00x", "3.00x", "9.00x", "180.0x", "710.0x"],
    7: ["0.00x", "0.00x", "0.00x", "2.00x", "7.00x", "30.00x", "400.0x", "800.0x"],
    8: ["0.00x", "0.00x", "0.00x", "2.00x", "4.00x", "11.00x", "67.00x", "400.0x", "900.0x"],
    9: ["0.00x", "0.00x", "0.00x", "2.00x", "2.50x", "5.00x", "15.00x", "100.0x", "500.0x", "1,000.0x"],
    10: ["0.00x", "0.00x", "0.00x", "1.60x", "2.00x", "4.00x", "7.00x", "26.00x", "100.0x", "500.0x", "1,000.0x"]
  },
  High: {
    1: ["0.00x", "3.96x"],
    2: ["0.00x", "0.00x", "17.10x"],
    3: ["0.00x", "0.00x", "0.00x", "81.50x"],
    4: ["0.00x", "0.00x", "0.00x", "10.00x", "259.0x"],
    5: ["0.00x", "0.00x", "0.00x", "4.50x", "48.00x", "450.0x"],
    6: ["0.00x", "0.00x", "0.00x", "0.00x", "11.00x", "350.0x", "710.0x"],
    7: ["0.00x", "0.00x", "0.00x", "0.00x", "7.00x", "90.00x", "400.0x", "800.0x"],
    8: ["0.00x", "0.00x", "0.00x", "0.00x", "5.00x", "20.00x", "270.0x", "600.0x", "900.0x"],
    9: ["0.00x", "0.00x", "0.00x", "0.00x", "4.00x", "11.00x", "56.00x", "500.0x", "800.0x", "1,000.0x"],
    10: ["0.00x", "0.00x", "0.00x", "0.00x", "3.50x", "8.00x", "13.00x", "63.00x", "500.0x", "800.0x", "1,000.0x"]
  },
  Extreme: {
    1: ["0.00x", "3.96x"],
    2: ["0.00x", "0.00x", "17.10x"],
    3: ["0.00x", "0.00x", "0.00x", "81.50x"],
    4: ["0.00x", "0.00x", "0.00x", "10.00x", "259.0x"],
    5: ["0.00x", "0.00x", "0.00x", "4.50x", "48.00x", "450.0x"],
    6: ["0.00x", "0.00x", "0.00x", "0.00x", "11.00x", "350.0x", "710.0x"],
    7: ["0.00x", "0.00x", "0.00x", "0.00x", "7.00x", "90.00x", "400.0x", "800.0x"],
    8: ["0.00x", "0.00x", "0.00x", "0.00x", "5.00x", "20.00x", "270.0x", "600.0x", "900.0x"],
    9: ["0.00x", "0.00x", "0.00x", "0.00x", "4.00x", "11.00x", "56.00x", "500.0x", "800.0x", "1,000.0x"],
    10: ["0.00x", "0.00x", "0.00x", "0.00x", "3.50x", "8.00x", "13.00x", "63.00x", "500.0x", "800.0x", "10,000.0x"]
  }
};

// stake-darts/engine.js
var TAU = Math.PI * 2;
var BOARD_RADIUS = 0.5;
var SEGMENT_COUNT = 18;
var SEGMENT_ROTATION = 0;
var ZONES = Object.freeze([
  Object.freeze({ index: 0, id: "outer-core", color: "slate" }),
  Object.freeze({ index: 1, id: "inner-ring", color: "silver" }),
  Object.freeze({ index: 2, id: "yellow", color: "yellow" }),
  Object.freeze({ index: 3, id: "orange", color: "orange" }),
  Object.freeze({ index: 4, id: "red", color: "red" }),
  Object.freeze({ index: 5, id: "bull", color: "green" })
]);
var DIFFICULTY_SOURCE = Object.freeze({
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
  return (value % modulus + modulus) % modulus;
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
      const desired = counts[candidate] * (position + 1) / SEGMENT_COUNT;
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
var DIFFICULTIES = Object.freeze(
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
function classificationResult(config, index2, normalizedRadius, rotationFloat, segment = null) {
  const zone = ZONES[index2];
  return Object.freeze({
    difficulty: config.id,
    index: index2,
    zone: zone.id,
    color: zone.color,
    multiplier: config.multipliers[index2],
    probability: config.probabilities[index2],
    chance: config.chances[index2],
    normalizedRadius,
    rotationFloat,
    segment
  });
}
function pointFromFloats(rotationFloat, distanceFloat) {
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
function classifyPoint(difficulty, point) {
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
function resolveDart({ difficulty = "medium", rotationFloat = 0, distanceFloat = 0 } = {}) {
  const point = pointFromFloats(rotationFloat, distanceFloat);
  const outcome = classifyPoint(difficulty, point);
  return Object.freeze({ ...outcome, point });
}

// stake-darts-enhanced/engine.js
var TAU2 = Math.PI * 2;
var BOARD_RADIUS2 = 0.5;
var SEGMENT_COUNT2 = 18;
var SEGMENT_ROTATION2 = 0;
var ZONES2 = Object.freeze([
  Object.freeze({ index: 0, id: "outer-core", color: "slate" }),
  Object.freeze({ index: 1, id: "inner-ring", color: "silver" }),
  Object.freeze({ index: 2, id: "yellow", color: "yellow" }),
  Object.freeze({ index: 3, id: "orange", color: "orange" }),
  Object.freeze({ index: 4, id: "red", color: "red" }),
  Object.freeze({ index: 5, id: "bull", color: "green" })
]);
var DIFFICULTY_SOURCE2 = Object.freeze({
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
function positiveModulo2(value, modulus) {
  return (value % modulus + modulus) % modulus;
}
function distributeSegments2(counts) {
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
  for (let position = 0; position < SEGMENT_COUNT2; position += 1) {
    let selected = 0;
    let greatestNeed = Number.NEGATIVE_INFINITY;
    for (let candidate = 0; candidate < counts.length; candidate += 1) {
      const desired = counts[candidate] * (position + 1) / SEGMENT_COUNT2;
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
function createDifficulty2(id, source) {
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
    segmentPattern: distributeSegments2(source.segmentCounts),
    geometry: Object.freeze({
      bullRadius,
      coreRadius: source.coreRadius,
      innerRadius,
      outerRadius
    })
  });
}
var DIFFICULTIES2 = Object.freeze(
  Object.fromEntries(
    Object.entries(DIFFICULTY_SOURCE2).map(([id, source]) => [id, createDifficulty2(id, source)])
  )
);
function difficultyConfig2(difficulty) {
  return DIFFICULTIES2[difficulty] ?? DIFFICULTIES2.medium;
}
function clampUnit2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}
function normalizeRotation2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return positiveModulo2(numeric, 1);
}
function rotationFromPoint2(point) {
  if (Number.isFinite(point.rotationFloat)) return normalizeRotation2(point.rotationFloat);
  const angle = Number.isFinite(point.angle) ? point.angle : Math.atan2(Number(point.y) || 0, Number(point.x) || 0);
  return normalizeRotation2((angle + Math.PI / 2) / TAU2);
}
function normalizedRadiusFromPoint2(point) {
  if (Number.isFinite(point.normalizedRadius)) return Math.max(0, Number(point.normalizedRadius));
  if (Number.isFinite(point.radius)) return Math.max(0, Number(point.radius)) / BOARD_RADIUS2;
  return Math.hypot(Number(point.x) || 0, Number(point.y) || 0) / BOARD_RADIUS2;
}
function segmentForRotation2(rotationFloat) {
  return Math.min(
    SEGMENT_COUNT2 - 1,
    Math.floor(normalizeRotation2(rotationFloat + SEGMENT_ROTATION2) * SEGMENT_COUNT2)
  );
}
function classificationResult2(config, index2, normalizedRadius, rotationFloat, segment = null) {
  const zone = ZONES2[index2];
  return Object.freeze({
    difficulty: config.id,
    index: index2,
    zone: zone.id,
    color: zone.color,
    multiplier: config.multipliers[index2],
    probability: config.probabilities[index2],
    chance: config.chances[index2],
    normalizedRadius,
    rotationFloat,
    segment
  });
}
function pointFromFloats2(rotationFloat, distanceFloat) {
  const rotation = normalizeRotation2(rotationFloat);
  const distance = clampUnit2(distanceFloat);
  const normalizedRadius = Math.sqrt(distance);
  const radius = normalizedRadius * BOARD_RADIUS2;
  const angle = rotation * TAU2 - Math.PI / 2;
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
    boardX: BOARD_RADIUS2 + x,
    boardY: BOARD_RADIUS2 + y,
    xPercent: (BOARD_RADIUS2 + x) * 100,
    yPercent: (BOARD_RADIUS2 + y) * 100
  });
}
function classifyPoint2(difficulty, point) {
  const config = difficultyConfig2(difficulty);
  const normalizedRadius = normalizedRadiusFromPoint2(point ?? {});
  const rotationFloat = rotationFromPoint2(point ?? {});
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
    return classificationResult2(config, 5, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < coreRadius) {
    return classificationResult2(config, 0, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < innerRadius) {
    return classificationResult2(config, 1, normalizedRadius, rotationFloat);
  }
  if (normalizedRadius < outerRadius) {
    const segment = segmentForRotation2(rotationFloat);
    return classificationResult2(config, config.segmentPattern[segment], normalizedRadius, rotationFloat, segment);
  }
  return classificationResult2(config, 0, normalizedRadius, rotationFloat);
}
function resolveDart2({ difficulty = "medium", rotationFloat = 0, distanceFloat = 0 } = {}) {
  const point = pointFromFloats2(rotationFloat, distanceFloat);
  const outcome = classifyPoint2(difficulty, point);
  return Object.freeze({ ...outcome, point });
}

// stake-flip/engine.js
var HOUSE_RETURN2 = 0.98;
var MAX_FLIPS = 20;
var SIDES = Object.freeze({
  heads: "heads",
  tails: "tails"
});
var PHASES2 = Object.freeze({
  idle: "idle",
  active: "active",
  lost: "lost",
  won: "won",
  cashed: "cashed"
});
var MULTIPLIERS = Object.freeze(
  Array.from({ length: MAX_FLIPS }, (_, index2) => Number((HOUSE_RETURN2 * 2 ** (index2 + 1)).toFixed(2)))
);
function multiplierForStreak(streak) {
  const count = Math.max(0, Math.min(MAX_FLIPS, Math.floor(Number(streak) || 0)));
  return count === 0 ? 1 : MULTIPLIERS[count - 1];
}

// stake-snakes/engine.js
var DICE_WEIGHTS = Object.freeze({
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
var multiplierMap = (values) => Object.freeze(Object.fromEntries(
  Object.entries(values).map(([total, multiplier]) => [Number(total), multiplier])
));
var DIFFICULTIES3 = Object.freeze({
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
var PHASES3 = Object.freeze({
  idle: "idle",
  ready: "ready",
  rolling: "rolling",
  active: "active",
  lost: "lost",
  cashed: "cashed",
  won: "won"
});
function normalizeDifficulty(value) {
  return DIFFICULTIES3[value] ? value : "medium";
}
function firstMultiplierFor(difficulty, total) {
  return DIFFICULTIES3[normalizeDifficulty(difficulty)].firstMultipliers[Number(total)] ?? 0;
}

// stake-wheel/engine.js
var RISKS2 = Object.freeze(["low", "medium", "high"]);
var SEGMENT_COUNTS = Object.freeze([10, 20, 30, 40, 50]);
var HOUSE_RETURN3 = 0.99;
var ROUND_PHASES3 = Object.freeze({
  idle: "idle",
  spinning: "spinning",
  settling: "settling",
  settled: "settled"
});
var LOW_PATTERN = Object.freeze([1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0]);
var MEDIUM_PAYOUTS = Object.freeze({
  10: Object.freeze([0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3]),
  20: Object.freeze([
    1.5,
    0,
    2,
    0,
    2,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.8,
    0,
    2,
    0,
    2,
    0,
    2,
    0
  ]),
  30: Object.freeze([
    1.5,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    2,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    2,
    0,
    2,
    0,
    1.7,
    0,
    4,
    0,
    1.5,
    0,
    2,
    0
  ]),
  40: Object.freeze([
    2,
    0,
    3,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    2,
    0,
    2,
    0,
    1.6,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0
  ]),
  50: Object.freeze([
    2,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    2,
    0,
    2,
    0,
    1.5,
    0,
    3,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0,
    1.5,
    0,
    5,
    0,
    1.5,
    0,
    2,
    0,
    1.5,
    0
  ])
});
function repeatedLowPayouts(segments) {
  return Object.freeze(Array.from({ length: segments }, (_, index2) => LOW_PATTERN[index2 % LOW_PATTERN.length]));
}
function highPayouts(segments) {
  return Object.freeze([...Array.from({ length: segments - 1 }, () => 0), HOUSE_RETURN3 * segments]);
}
var PAYOUTS2 = Object.freeze(Object.fromEntries(
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
function normalizedRisk2(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function normalizedSegments(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : Number.NaN;
}
function validateConfiguration(riskOrConfiguration, segments) {
  const candidate = configurationParts(riskOrConfiguration, segments);
  const risk = normalizedRisk2(candidate.risk);
  const segmentCount = normalizedSegments(candidate.segments);
  if (!RISKS2.includes(risk)) throw new RangeError(`Unsupported Wheel risk: ${candidate.risk}`);
  if (!SEGMENT_COUNTS.includes(segmentCount)) {
    throw new RangeError(`Unsupported Wheel segment count: ${candidate.segments}`);
  }
  return Object.freeze({ risk, segments: segmentCount });
}
function payoutsFor(riskOrConfiguration, segments) {
  const configuration = validateConfiguration(riskOrConfiguration, segments);
  return PAYOUTS2[configuration.segments][configuration.risk];
}
function meanPayout(payouts) {
  if (!Array.isArray(payouts) || payouts.length === 0) {
    throw new TypeError("Payouts must be a non-empty array");
  }
  const total = payouts.reduce((sum, payout) => {
    const numeric = Number(payout);
    if (!Number.isFinite(numeric) || numeric < 0) throw new RangeError("Payouts must be finite and non-negative");
    return sum + numeric;
  }, 0);
  return Math.round((total / payouts.length + Number.EPSILON) * 1e12) / 1e12;
}
function assertPayoutTables(tables = PAYOUTS2) {
  for (const segments of SEGMENT_COUNTS) {
    const configuration = tables?.[segments];
    if (!configuration) throw new Error(`Missing Wheel payout configuration for ${segments} segments`);
    for (const risk of RISKS2) {
      const payouts = configuration[risk];
      if (!Array.isArray(payouts) || payouts.length !== segments) {
        throw new Error(`Wheel ${risk}/${segments} must contain exactly ${segments} payouts`);
      }
      if (meanPayout(payouts) !== HOUSE_RETURN3) {
        throw new Error(`Wheel ${risk}/${segments} must return exactly ${HOUSE_RETURN3}`);
      }
    }
  }
  return true;
}
function outcomeForIndex2(riskOrConfiguration, segmentsOrIndex, maybeIndex) {
  const objectConfiguration = riskOrConfiguration && typeof riskOrConfiguration === "object";
  const configuration = validateConfiguration(
    riskOrConfiguration,
    objectConfiguration ? void 0 : segmentsOrIndex
  );
  const index2 = Number(objectConfiguration ? segmentsOrIndex : maybeIndex);
  if (!Number.isInteger(index2) || index2 < 0 || index2 >= configuration.segments) {
    throw new RangeError(`Wheel result index must be between 0 and ${configuration.segments - 1}`);
  }
  const multiplier = payoutsFor(configuration)[index2];
  return Object.freeze({ ...configuration, index: index2, multiplier });
}
assertPayoutTables(PAYOUTS2);

// tarot/engine.js
var DIFFICULTIES4 = Object.freeze({
  easy: {
    label: "Easy",
    background: "assets/easy.CqLb1Wyc.svg",
    lamp: "#b8cedc"
  },
  medium: {
    label: "Medium",
    background: "assets/medium.Binj_FZn.svg",
    lamp: "#5dafff"
  },
  hard: {
    label: "Hard",
    background: "assets/hard.D3ou34V-.svg",
    lamp: "#00e701"
  },
  expert: {
    label: "Expert",
    background: "assets/expert.BEfPvW7t.svg",
    lamp: "#ff9d2e"
  }
});
var MAJOR_CARDS = Object.freeze([
  { asset: "assets/cards/01.ByUZIozK.svg", name: "The Fool", multiplier: 1 },
  { asset: "assets/cards/02.P4SZjMFu.svg", name: "The Lovers", multiplier: 1 },
  { asset: "assets/cards/03.DXahyrtO.svg", name: "The Chariot", multiplier: 1 },
  { asset: "assets/cards/04.BEBCyRTH.svg", name: "Strength", multiplier: 1 },
  { asset: "assets/cards/05.bWArhvTa.svg", name: "The Hanged Man", multiplier: 1 },
  { asset: "assets/cards/07.BkiKLKbs.svg", name: "Temperance", multiplier: 1 },
  { asset: "assets/cards/08.CjKwrdWm.svg", name: "The Devil", multiplier: 1 },
  { asset: "assets/cards/10.DBGo4fzG.svg", name: "Judgement", multiplier: 2 },
  { asset: "assets/14.Cgxq3qPd.svg", name: "The Star", multiplier: 2 },
  { asset: "assets/cards/19.DKSa7KOv.svg", name: "The Emperor", multiplier: 5 },
  { asset: "assets/cards/20.BGrQQl-A.svg", name: "Justice", multiplier: 4 },
  { asset: "assets/cards/21.CK8-Deqf.svg", name: "The Sun", multiplier: 4 }
]);
var easyMinor = [
  ["assets/cards/26.BuUdUnts.svg", "Ace of Pentacles", 0],
  ["assets/cards/28.CMPXQ205.svg", "Four of Cups", 0.4],
  ["assets/cards/29.CqdpNQlR.svg", "Five of Swords", 0],
  ["assets/cards/30.C4FX1mEU.svg", "Five of Pentacles", 0],
  ["assets/cards/34.gE0LjtTY.svg", "Six of Pentacles", 0.4],
  ["assets/cards/36.yoZ2HaJA.svg", "Seven of Cups", 0.4],
  ["assets/cards/38.2NMyPnEh.svg", "Eight of Pentacles", 0.4],
  ["assets/cards/41.BwY7S9wG.svg", "Nine of Wands", 0.4],
  ["assets/cards/48.B90JHsDV.svg", "Ten of Cups", 0.4],
  ["assets/cards/49.B7loTNXl.svg", "Ten of Wands", 0.4],
  ["assets/cards/50.BIotBrph.svg", "Ten of Pentacles", 0.4],
  ["assets/cards/54.DIvq08-b.svg", "Knight of Pentacles", 0.6],
  ["assets/cards/56.Bliq8FXP.svg", "Queen of Cups", 0.6],
  ["assets/cards/57.CIodXICT.svg", "Queen of Swords", 0.6],
  ["assets/cards/58.w-0OWbj2.svg", "Queen of Pentacles", 0.6],
  ["assets/cards/63.LdmQXbKp.svg", "Page of Wands", 1.5],
  ["assets/cards/65.fcTt4gNq.svg", "Page of Swords", 1.5],
  ["assets/cards/65.C1fIZItV.svg", "Page of Swords", 2],
  ["assets/cards/67.CkzvuA3F.svg", "Knight of Wands", 1.5],
  ["assets/cards/67.CvmnWSJl.svg", "Knight of Wands", 2],
  ["assets/cards/77.CoLsaU2Q.svg", "King of Swords", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4],
  ["assets/27.BZdK_FNr.svg", "Two of Wands", 0.4],
  ["assets/37.C8ue4Axp.svg", "Four of Swords", 0.4]
];
var mediumMinor = [
  ["assets/27.DU3cjgiK.svg", "Two of Wands", 0],
  ["assets/37.C4AvW7Qo.svg", "Four of Swords", 0.3],
  ["assets/cards/36.DIX_vy7L.svg", "Seven of Cups", 0.3],
  ["assets/cards/38.CBNDkFPy.svg", "Eight of Pentacles", 0.3],
  ["assets/cards/43.CvcftE46.svg", "Nine of Cups", 0.3],
  ["assets/cards/46.B78NVlSY.svg", "Ten of Pentacles", 0.3],
  ["assets/cards/47.aUtsL9ai.svg", "Ten of Wands", 0.3],
  ["assets/cards/49.C-ab6vrX.svg", "Ten of Wands", 0.3],
  ["assets/cards/54.DIvq08-b.svg", "Knight of Pentacles", 0.6],
  ["assets/cards/63.LdmQXbKp.svg", "Page of Wands", 1.5],
  ["assets/cards/65.C1fIZItV.svg", "Page of Swords", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4]
];
var hardMinor = [
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/cards/43.CvcftE46.svg", "Nine of Cups", 0.3],
  ["assets/cards/58.w-0OWbj2.svg", "Queen of Pentacles", 0.6],
  ["assets/cards/67.CvmnWSJl.svg", "Knight of Wands", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4]
];
var expertMinor = [
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/cards/65.C1fIZItV.svg", "Page of Swords", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4]
];
var card = ([asset, name, multiplier]) => Object.freeze({ asset, name, multiplier });
var MINOR_CARDS = Object.freeze({
  easy: Object.freeze(easyMinor.map(card)),
  medium: Object.freeze(mediumMinor.map(card)),
  hard: Object.freeze(hardMinor.map(card)),
  expert: Object.freeze(expertMinor.map(card))
});
function pickCard(cards2, random = Math.random) {
  const value = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  return cards2[Math.floor(value * cards2.length)];
}
function settleTarot(left, major, right) {
  return Math.round(left.multiplier * major.multiplier * right.multiplier * 100) / 100;
}
function drawLegacyTarot(difficulty = "easy", random = Math.random) {
  const minorCards = MINOR_CARDS[difficulty] || MINOR_CARDS.easy;
  const left = pickCard(minorCards, random);
  const major = pickCard(MAJOR_CARDS, random);
  const right = pickCard(minorCards, random);
  return { left, major, right, multiplier: settleTarot(left, major, right) };
}
var TAROT_MATH_VERSION = "tarot-house-edge-v2";
var zeroWeights = { easy: 30036, medium: 36464, hard: 21695, expert: 14578 };
var TAROT_MINOR_WEIGHTS = Object.freeze(Object.fromEntries(
  Object.entries(MINOR_CARDS).map(([difficulty, cards2]) => [
    difficulty,
    Object.freeze(cards2.map((card2) => card2.multiplier === 0 ? zeroWeights[difficulty] : 1e4))
  ])
));
function weightedCard(cards2, weights2, integer2) {
  const total = weights2.reduce((sum, weight) => sum + weight, 0);
  let draw2 = integer2(total);
  if (!Number.isSafeInteger(draw2) || draw2 < 0 || draw2 >= total) throw new RangeError("Invalid Tarot random index");
  for (let index2 = 0; index2 < cards2.length; index2++) {
    if (draw2 < weights2[index2]) return cards2[index2];
    draw2 -= weights2[index2];
  }
  throw new Error("Invalid Tarot draw weights");
}
function drawTarot(difficulty = "easy", random = Math.random, boundedInteger = null) {
  const selected = Object.hasOwn(MINOR_CARDS, difficulty) ? difficulty : "easy";
  const cards2 = MINOR_CARDS[selected];
  const weights2 = TAROT_MINOR_WEIGHTS[selected];
  const integer2 = boundedInteger ?? ((bound) => Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0)) * bound));
  const left = weightedCard(cards2, weights2, integer2);
  const major = weightedCard(MAJOR_CARDS, MAJOR_CARDS.map(() => 1), integer2);
  const right = weightedCard(cards2, weights2, integer2);
  return { mathVersion: TAROT_MATH_VERSION, left, major, right, multiplier: settleTarot(left, major, right) };
}

// packages/fairness-core/src/drill.ts
var DRILL_RTP = 0.98;
var DRILL_TARGET_MINIMUM = 1.01;
var DRILL_TARGET_MAXIMUM = 2e6;
var DRILL_RESULT_MAXIMUM = 2e6;
function normalizeDrillTarget(value) {
  if (!Number.isFinite(value)) return 2;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Math.min(DRILL_TARGET_MAXIMUM, Math.max(DRILL_TARGET_MINIMUM, rounded));
}
function drillWinChance(targetValue) {
  const target = normalizeDrillTarget(targetValue);
  return Math.round(DRILL_RTP / target * 100 * 1e8) / 1e8;
}
function parseDrillAction(action) {
  const targetMatch = action.match(/(?:^|:)target:(\d+(?:\.\d+)?)/i);
  const laneMatch = action.match(/(?:^|:)lane:([012])(?:$|:)/i);
  const lane = Number(laneMatch?.[1] ?? 1);
  return {
    target: normalizeDrillTarget(Number(targetMatch?.[1] ?? 2)),
    selectedLane: lane === 0 || lane === 2 ? lane : 1
  };
}
function drillResultFromFloat(value) {
  const bounded = Math.min(1, Math.max(Number.EPSILON, value));
  const inverse = DRILL_RTP / bounded;
  return Math.min(DRILL_RESULT_MAXIMUM, Math.floor((inverse + Number.EPSILON) * 100) / 100);
}
function evaluateDrillResults(resultsValue, snapshot) {
  const results = resultsValue.map(
    (value) => Math.min(DRILL_RESULT_MAXIMUM, Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100))
  );
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
function resolveDrill(random, action) {
  const results = [
    drillResultFromFloat(random.float()),
    drillResultFromFloat(random.float()),
    drillResultFromFloat(random.float())
  ];
  return evaluateDrillResults(results, parseDrillAction(action));
}

// packages/fairness-core/src/fist-of-destruction.ts
var FIST_OF_DESTRUCTION_COLUMNS = 5;
var FIST_OF_DESTRUCTION_ROWS = 4;
var FIST_OF_DESTRUCTION_MAX_WIN = 1e4;
var FIST_OF_DESTRUCTION_MAX_FREE_SPINS = 40;
var FIST_OF_DESTRUCTION_RTP_CALIBRATION_PENDING = true;
var FIST_OF_DESTRUCTION_WAYS = 1024;
var FIST_OF_DESTRUCTION_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200];
var FIST_OF_DESTRUCTION_PAYTABLE = {
  "blue-vanguard": [0.6, 1.8, 6],
  "blue-specter": [0.4, 1.2, 4],
  "red-blaze": [0.6, 1.8, 6],
  "red-titan": [0.4, 1.2, 4],
  A: [0.2, 0.5, 1.2],
  K: [0.18, 0.45, 1],
  Q: [0.16, 0.4, 0.9],
  J: [0.14, 0.35, 0.8],
  "10": [0.12, 0.3, 0.7],
  wild: [0.8, 2.5, 10]
};
var weightedSymbols = [
  { symbol: "10", weight: 118 },
  { symbol: "J", weight: 112 },
  { symbol: "Q", weight: 106 },
  { symbol: "K", weight: 100 },
  { symbol: "A", weight: 94 },
  { symbol: "blue-specter", weight: 55 },
  { symbol: "red-titan", weight: 55 },
  { symbol: "blue-vanguard", weight: 40 },
  { symbol: "red-blaze", weight: 40 },
  { symbol: "wild", weight: 18 },
  { symbol: "scatter", weight: 16 },
  { symbol: "blue-fist", weight: 15 },
  { symbol: "red-fist", weight: 15 }
];
var multiplierWeights = [80, 62, 48, 38, 30, 24, 20, 17, 14, 10, 8, 6, 3, 2, 1];
function weightedPick2(random, values) {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  let cursor = random.int(total);
  for (const value of values) {
    if (cursor < value.weight) return value;
    cursor -= value.weight;
  }
  return values[0];
}
function symbolFor(random) {
  return weightedPick2(random, weightedSymbols).symbol;
}
function multiplierFor2(random) {
  const values = FIST_OF_DESTRUCTION_MULTIPLIERS.map((value, index2) => ({
    value,
    weight: multiplierWeights[index2] ?? 1
  }));
  return weightedPick2(random, values).value;
}
function gridFor(random) {
  const grid = [];
  for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
    const fistReels = /* @__PURE__ */ new Set();
    for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
      let symbol = symbolFor(random);
      if ((symbol === "blue-fist" || symbol === "red-fist") && fistReels.has(reel)) symbol = "10";
      if (symbol === "blue-fist" || symbol === "red-fist") fistReels.add(reel);
      grid.push({ symbol });
    }
  }
  for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
    let seen = false;
    for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
      const position = row * FIST_OF_DESTRUCTION_COLUMNS + reel;
      const cell = grid[position];
      if (cell?.symbol !== "blue-fist" && cell?.symbol !== "red-fist") continue;
      if (seen) grid[position] = { symbol: "10" };
      seen = true;
    }
  }
  return grid;
}
function regularSymbol(symbol) {
  return symbol !== "wild" && symbol !== "scatter" && symbol !== "blue-fist" && symbol !== "red-fist";
}
function expandedMap(events) {
  const result = /* @__PURE__ */ new Map();
  for (const event of events.filter((candidate) => candidate.activated)) {
    for (const position of event.expandedPositions) result.set(position, event);
  }
  return result;
}
function evaluateFistWays(grid, events = []) {
  const expanded = expandedMap(events);
  const firstReel = Array.from({ length: FIST_OF_DESTRUCTION_ROWS }, (_, row) => row * FIST_OF_DESTRUCTION_COLUMNS);
  const candidates = /* @__PURE__ */ new Set();
  for (const position of firstReel) {
    const symbol = expanded.has(position) ? "wild" : grid[position]?.symbol;
    if (symbol && regularSymbol(symbol)) candidates.add(symbol);
  }
  if (candidates.size === 0 && firstReel.some((position) => expanded.has(position) || grid[position]?.symbol === "wild")) {
    candidates.add("wild");
  }
  return [...candidates].flatMap((candidate) => {
    const positionsByReel = [];
    const wildEvents = /* @__PURE__ */ new Map();
    for (let reel = 0; reel < FIST_OF_DESTRUCTION_COLUMNS; reel += 1) {
      const matches = [];
      for (let row = 0; row < FIST_OF_DESTRUCTION_ROWS; row += 1) {
        const position = row * FIST_OF_DESTRUCTION_COLUMNS + reel;
        const event = expanded.get(position);
        const symbol = event ? "wild" : grid[position]?.symbol;
        if (symbol === candidate || symbol === "wild") {
          matches.push(position);
          if (event) wildEvents.set(event.reel, event);
        }
      }
      if (matches.length === 0) break;
      positionsByReel.push(matches);
    }
    if (positionsByReel.length < 3) return [];
    const basePayout = FIST_OF_DESTRUCTION_PAYTABLE[candidate][Math.min(2, positionsByReel.length - 3)] ?? 0;
    if (basePayout <= 0) return [];
    const ways = positionsByReel.reduce((total, positions) => total * positions.length, 1);
    const multiplied = [...wildEvents.values()].filter((event) => event.reelMultiplier > 1);
    const multiplier = multiplied.length > 0 ? multiplied.reduce((sum, event) => sum + event.reelMultiplier, 0) : 1;
    return [
      {
        symbol: candidate,
        count: positionsByReel.length,
        ways,
        positions: positionsByReel.flat(),
        basePayout,
        wildReels: [...wildEvents.keys()].sort((left, right) => left - right),
        multiplier,
        payout: quantizeSlotMultiplier(basePayout * ways * multiplier)
      }
    ];
  });
}
function opposingSymbol(team, symbol) {
  if (symbol === "wild") return true;
  return team === "blue" ? symbol === "red-blaze" || symbol === "red-titan" : symbol === "blue-vanguard" || symbol === "blue-specter";
}
function fistEventsFor(random, grid) {
  const active = [];
  const candidates = grid.flatMap(
    (cell, position) => cell.symbol === "blue-fist" || cell.symbol === "red-fist" ? [{ cell, position }] : []
  );
  for (const candidate of candidates) {
    const reel = candidate.position % FIST_OF_DESTRUCTION_COLUMNS;
    const row = Math.floor(candidate.position / FIST_OF_DESTRUCTION_COLUMNS);
    const team = candidate.cell.symbol === "blue-fist" ? "blue" : "red";
    const expandedPositions = Array.from(
      { length: FIST_OF_DESTRUCTION_ROWS },
      (_, expandedRow) => expandedRow * FIST_OF_DESTRUCTION_COLUMNS + reel
    );
    const crossedPositions = expandedPositions.filter((position) => position !== candidate.position).filter((position) => opposingSymbol(team, grid[position]?.symbol ?? "10"));
    const provisional = {
      team,
      position: candidate.position,
      reel,
      row,
      activated: true,
      expandedPositions,
      crossedPositions,
      collectedMultipliers: crossedPositions.map(() => multiplierFor2(random)),
      reelMultiplier: 1
    };
    const withMultiplier = {
      ...provisional,
      reelMultiplier: provisional.collectedMultipliers.reduce((sum, value) => sum + value, 0) || 1
    };
    const without = evaluateFistWays(grid, active).reduce((sum, win) => sum + win.payout, 0);
    const withCandidate = evaluateFistWays(grid, [...active, withMultiplier]);
    const affected = withCandidate.some(
      (win) => win.positions.some((position) => expandedPositions.includes(position))
    );
    const withTotal = withCandidate.reduce((sum, win) => sum + win.payout, 0);
    active.push(affected && withTotal > without ? withMultiplier : { ...withMultiplier, activated: false });
  }
  return active;
}
function spinFor(random) {
  const initialGrid2 = gridFor(random);
  const fistEvents = fistEventsFor(random, initialGrid2);
  const activePositions = expandedMap(fistEvents);
  const finalGrid = initialGrid2.map(
    (cell, position) => activePositions.has(position) ? { symbol: "wild" } : cell
  );
  const waysWins = evaluateFistWays(initialGrid2, fistEvents);
  return {
    initialGrid: initialGrid2,
    finalGrid,
    fistEvents,
    waysWins,
    scatterCount: initialGrid2.filter((cell) => cell.symbol === "scatter").length,
    win: quantizeSlotMultiplier(waysWins.reduce((sum, win) => sum + win.payout, 0))
  };
}
function guaranteedFistGrid(random, count) {
  const grid = [...gridFor(random)];
  const reels = Array.from({ length: FIST_OF_DESTRUCTION_COLUMNS }, (_, index2) => index2);
  for (let index2 = reels.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    [reels[index2], reels[swap]] = [reels[swap], reels[index2]];
  }
  for (let index2 = 0; index2 < Math.min(count, reels.length); index2 += 1) {
    const reel = reels[index2] ?? index2;
    for (let row2 = 0; row2 < FIST_OF_DESTRUCTION_ROWS; row2 += 1) {
      const position = row2 * FIST_OF_DESTRUCTION_COLUMNS + reel;
      if (grid[position]?.symbol === "blue-fist" || grid[position]?.symbol === "red-fist")
        grid[position] = { symbol: "10" };
    }
    const row = 1 + random.int(FIST_OF_DESTRUCTION_ROWS - 1);
    grid[row * FIST_OF_DESTRUCTION_COLUMNS + reel] = { symbol: index2 % 2 === 0 ? "blue-fist" : "red-fist" };
  }
  return grid;
}
function spinFromGrid(random, grid) {
  const fistEvents = fistEventsFor(random, grid);
  const activePositions = expandedMap(fistEvents);
  const finalGrid = grid.map((cell, position) => activePositions.has(position) ? { symbol: "wild" } : cell);
  const waysWins = evaluateFistWays(grid, fistEvents);
  return {
    initialGrid: grid,
    finalGrid,
    fistEvents,
    waysWins,
    scatterCount: grid.filter((cell) => cell.symbol === "scatter").length,
    win: quantizeSlotMultiplier(waysWins.reduce((sum, win) => sum + win.payout, 0))
  };
}
function resolveFistOfDestruction(random, action = "spin") {
  if (action !== "spin") throw new Error("Invalid Fist of Destruction action");
  const baseSpin = spinFor(random);
  const bonusType = baseSpin.scatterCount >= 4 ? "ultimate-throwdown" : baseSpin.scatterCount >= 3 ? "throwdown" : null;
  let awardedSpins = bonusType ? 10 : 0;
  let victoryLevel = bonusType === "ultimate-throwdown" ? 4 : 3;
  const victoryPoints = { blue: 0, red: 0 };
  const bonusSpins = [];
  let bonusWin = 0;
  for (let spin = 0; spin < awardedSpins && spin < FIST_OF_DESTRUCTION_MAX_FREE_SPINS; spin += 1) {
    const resolved = spinFor(random);
    let epicDrop = null;
    for (const event of resolved.fistEvents.filter((candidate) => candidate.activated)) {
      victoryPoints[event.team] += Math.max(1, event.crossedPositions.length);
    }
    const winningTeam = victoryPoints.blue >= 3 ? "blue" : victoryPoints.red >= 3 ? "red" : null;
    if (winningTeam) {
      victoryPoints[winningTeam] -= 3;
      victoryLevel = Math.min(5, victoryLevel + 1);
      epicDrop = spinFromGrid(random, guaranteedFistGrid(random, victoryLevel));
    }
    const retriggeredSpins = resolved.scatterCount >= 3 ? 4 : resolved.scatterCount === 2 ? 2 : 0;
    awardedSpins = Math.min(FIST_OF_DESTRUCTION_MAX_FREE_SPINS, awardedSpins + retriggeredSpins);
    const spinWin = quantizeSlotMultiplier(resolved.win + (epicDrop?.win ?? 0));
    bonusWin = quantizeSlotMultiplier(bonusWin + spinWin);
    bonusSpins.push({
      spin: spin + 1,
      ...resolved,
      victoryPoints: { ...victoryPoints },
      victoryLevel,
      retriggeredSpins,
      epicDrop,
      win: spinWin
    });
    if (baseSpin.win + bonusWin >= FIST_OF_DESTRUCTION_MAX_WIN) break;
  }
  const finalMultiplier = quantizeSlotMultiplier(Math.min(FIST_OF_DESTRUCTION_MAX_WIN, baseSpin.win + bonusWin));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "fist-of-destruction",
      action,
      columns: FIST_OF_DESTRUCTION_COLUMNS,
      rows: FIST_OF_DESTRUCTION_ROWS,
      ways: FIST_OF_DESTRUCTION_WAYS,
      ...baseSpin,
      bonusTriggered: bonusType !== null,
      bonusType,
      bonus: {
        awardedSpins,
        playedSpins: bonusSpins.length,
        finalVictoryLevel: victoryLevel,
        finalVictoryPoints: victoryPoints,
        win: bonusWin,
        spins: bonusSpins
      },
      maxWinCap: FIST_OF_DESTRUCTION_MAX_WIN,
      rtpCalibrationPending: FIST_OF_DESTRUCTION_RTP_CALIBRATION_PENDING,
      finalMultiplier
    }
  };
}

// packages/fairness-core/src/fruit-party.ts
var FRUIT_PARTY_COLUMNS = 7;
var FRUIT_PARTY_ROWS = 7;
var FRUIT_PARTY_CELLS = FRUIT_PARTY_COLUMNS * FRUIT_PARTY_ROWS;
var FRUIT_PARTY_MIN_CLUSTER = 5;
var FRUIT_PARTY_MAX_TUMBLES = 12;
var FRUIT_PARTY_MAX_FREE_SPINS = 50;
var FRUIT_PARTY_MAX_WIN = 5e3;
var FRUIT_PARTY_PAYTABLE = {
  strawberry: [0.2, 0.35, 0.6, 1, 2],
  plum: [0.25, 0.45, 0.75, 1.25, 2.5],
  orange: [0.3, 0.55, 0.9, 1.5, 3],
  apple: [0.4, 0.7, 1.1, 2, 4],
  grapes: [0.55, 0.9, 1.5, 3, 6],
  star: [0.8, 1.4, 2.5, 5, 10]
};
var DRAW_TABLE = [
  { symbol: "strawberry", weight: 22 },
  { symbol: "plum", weight: 20 },
  { symbol: "orange", weight: 18 },
  { symbol: "apple", weight: 16 },
  { symbol: "grapes", weight: 13 },
  { symbol: "star", weight: 9 },
  { symbol: "scatter", weight: 1 }
];
var FRUIT_PARTY_MULTIPLIER_WEIGHTS = [
  { value: 2, weight: 45 },
  { value: 4, weight: 26 },
  { value: 8, weight: 13 },
  { value: 16, weight: 7 },
  { value: 32, weight: 4 },
  { value: 64, weight: 3 },
  { value: 128, weight: 1 },
  { value: 256, weight: 1 }
];
function roundSlot(value) {
  return Math.round(value * 1e4) / 1e4;
}
function weighted(random, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(total);
  for (const entry of entries) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  throw new Error("Weighted selection failed");
}
function drawSymbol(random) {
  return weighted(
    random,
    DRAW_TABLE.map((entry) => ({ value: entry.symbol, weight: entry.weight }))
  );
}
function fruitPartyClusterPayout(symbol, count) {
  if (count < FRUIT_PARTY_MIN_CLUSTER) return 0;
  const tier = count >= 15 ? 4 : count >= 12 ? 3 : count >= 9 ? 2 : count >= 7 ? 1 : 0;
  return FRUIT_PARTY_PAYTABLE[symbol][tier];
}
function findFruitPartyClusters(grid) {
  if (grid.length !== FRUIT_PARTY_CELLS) throw new Error("Fruit Party grid must contain 49 cells");
  const visited = /* @__PURE__ */ new Set();
  const clusters = [];
  for (let start = 0; start < grid.length; start += 1) {
    if (visited.has(start) || grid[start] === "scatter") continue;
    const symbol = grid[start];
    const positions = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const position = queue.shift();
      if (position === void 0) break;
      positions.push(position);
      const row = Math.floor(position / FRUIT_PARTY_COLUMNS);
      const column = position % FRUIT_PARTY_COLUMNS;
      const neighbors2 = [
        row > 0 ? position - FRUIT_PARTY_COLUMNS : -1,
        row + 1 < FRUIT_PARTY_ROWS ? position + FRUIT_PARTY_COLUMNS : -1,
        column > 0 ? position - 1 : -1,
        column + 1 < FRUIT_PARTY_COLUMNS ? position + 1 : -1
      ];
      for (const neighbor of neighbors2) {
        if (neighbor >= 0 && !visited.has(neighbor) && grid[neighbor] === symbol) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const payout = fruitPartyClusterPayout(symbol, positions.length);
    if (payout > 0)
      clusters.push({ symbol, positions: positions.sort((a, b) => a - b), count: positions.length, payout });
  }
  return clusters;
}
function applyFruitPartyGravity(grid, removedPositions, random) {
  const removed = new Set(removedPositions);
  const nextGrid = Array(FRUIT_PARTY_CELLS);
  const drops = [];
  const newCells = [];
  for (let column = 0; column < FRUIT_PARTY_COLUMNS; column += 1) {
    const survivors = [];
    for (let row = FRUIT_PARTY_ROWS - 1; row >= 0; row -= 1) {
      const position = row * FRUIT_PARTY_COLUMNS + column;
      const symbol = grid[position];
      if (!removed.has(position) && symbol) survivors.push({ from: position, symbol });
    }
    let targetRow = FRUIT_PARTY_ROWS - 1;
    for (const survivor of survivors) {
      const to = targetRow * FRUIT_PARTY_COLUMNS + column;
      nextGrid[to] = survivor.symbol;
      if (survivor.from !== to) drops.push({ from: survivor.from, to });
      targetRow -= 1;
    }
    while (targetRow >= 0) {
      const position = targetRow * FRUIT_PARTY_COLUMNS + column;
      const symbol = drawSymbol(random);
      nextGrid[position] = symbol;
      newCells.push({ position, symbol });
      targetRow -= 1;
    }
  }
  return { nextGrid, drops, newCells };
}
function multiplierForTumble(random, removedPositions) {
  if (removedPositions.length === 0 || random.int(100) >= 24) return [];
  const count = random.int(100) < 18 ? 2 : 1;
  const available = [...removedPositions];
  const multipliers = [];
  for (let index2 = 0; index2 < count && available.length > 0; index2 += 1) {
    const selected = random.int(available.length);
    const [position] = available.splice(selected, 1);
    if (position === void 0) continue;
    multipliers.push({ position, value: weighted(random, FRUIT_PARTY_MULTIPLIER_WEIGHTS) });
  }
  return multipliers;
}
function resolveFruitPartySpin(random) {
  const initialGrid2 = Array.from({ length: FRUIT_PARTY_CELLS }, () => drawSymbol(random));
  let grid = initialGrid2;
  let totalWin = 0;
  const tumbles = [];
  for (let index2 = 0; index2 < FRUIT_PARTY_MAX_TUMBLES; index2 += 1) {
    const clusters = findFruitPartyClusters(grid);
    if (clusters.length === 0) break;
    const removedPositions = [...new Set(clusters.flatMap((cluster) => cluster.positions))].sort((a, b) => a - b);
    const multipliers = multiplierForTumble(random, removedPositions);
    const combinedMultiplier = multipliers.reduce((sum, multiplier) => sum + multiplier.value, 0) || 1;
    const baseWin = roundSlot(clusters.reduce((sum, cluster) => sum + cluster.payout, 0));
    const win = roundSlot(baseWin * combinedMultiplier);
    const gravity = applyFruitPartyGravity(grid, removedPositions, random);
    tumbles.push({
      index: index2,
      grid,
      clusters,
      removedPositions,
      multipliers,
      baseWin,
      multiplier: combinedMultiplier,
      win,
      ...gravity
    });
    totalWin = roundSlot(totalWin + win);
    grid = gravity.nextGrid;
  }
  return {
    initialGrid: initialGrid2,
    scatterCount: initialGrid2.filter((symbol) => symbol === "scatter").length,
    tumbles,
    win: totalWin
  };
}
function resolveFruitParty(random, action) {
  const baseSpin = resolveFruitPartySpin(random);
  const bonusTriggered = baseSpin.scatterCount >= 3;
  let awarded = bonusTriggered ? 10 : 0;
  let bonusWin = 0;
  const spins = [];
  for (let index2 = 0; index2 < awarded && index2 < FRUIT_PARTY_MAX_FREE_SPINS; index2 += 1) {
    const spin = resolveFruitPartySpin(random);
    const retriggered = spin.scatterCount >= 3 ? 5 : 0;
    awarded = Math.min(FRUIT_PARTY_MAX_FREE_SPINS, awarded + retriggered);
    bonusWin = roundSlot(bonusWin + spin.win);
    spins.push({ index: index2, retriggered, ...spin });
    if (baseSpin.win + bonusWin >= FRUIT_PARTY_MAX_WIN) break;
  }
  const rawTotal = roundSlot(baseSpin.win + bonusWin);
  const finalMultiplier = roundSlot(Math.min(FRUIT_PARTY_MAX_WIN, rawTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "fruit-party",
      version: 1,
      action,
      baseSpin,
      bonusTriggered,
      freeSpins: { awarded, played: spins.length, win: bonusWin, spins },
      rawTotal,
      uncappedMultiplier: rawTotal,
      maxWinCap: FRUIT_PARTY_MAX_WIN,
      finalMultiplier,
      presentation: { presentationMs: Math.min(3e4, 1100 + baseSpin.tumbles.length * 850 + spins.length * 180) }
    }
  };
}

// packages/fairness-core/src/neon-syndicate.ts
var NEON_SYNDICATE_COLUMNS = 5;
var NEON_SYNDICATE_ROWS = 4;
var NEON_SYNDICATE_CELLS = NEON_SYNDICATE_COLUMNS * NEON_SYNDICATE_ROWS;
var NEON_SYNDICATE_MAX_WIN = 15e3;
var NEON_SYNDICATE_MAX_FREE_SPINS = 50;
var NEON_SYNDICATE_REGULAR_SYMBOLS = [
  "prism",
  "scan-bars",
  "shield",
  "tri-cell",
  "cross",
  "shuriken",
  "reactor-skull",
  "infiltrator",
  "signal-runner",
  "security-mask"
];
var NEON_SYNDICATE_PAYTABLE = {
  prism: { 3: 0.2, 4: 1, 5: 2 },
  "scan-bars": { 3: 0.2, 4: 1, 5: 2 },
  shield: { 3: 0.2, 4: 1, 5: 2 },
  "tri-cell": { 3: 0.2, 4: 1, 5: 2 },
  cross: { 3: 0.2, 4: 1, 5: 2 },
  shuriken: { 3: 1, 4: 3, 5: 6 },
  "reactor-skull": { 3: 1, 4: 3, 5: 6 },
  infiltrator: { 3: 2, 4: 6, 5: 12 },
  "signal-runner": { 3: 2, 4: 6, 5: 12 },
  "security-mask": { 3: 4, 4: 10, 5: 20 }
};
var NEON_SYNDICATE_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0],
  [3, 2, 1, 2, 3],
  [0, 0, 1, 0, 0],
  [3, 3, 2, 3, 3],
  [1, 0, 1, 0, 1],
  [2, 3, 2, 3, 2],
  [0, 1, 1, 1, 0],
  [3, 2, 2, 2, 3],
  [0, 1, 2, 3, 2],
  [3, 2, 1, 0, 1]
];
var NEON_SYNDICATE_RIVAL_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 250, 500];
var ACTION_COSTS = {
  spin: 1,
  "boost:rival": 3,
  "boost:duo": 25,
  "boost:triple": 75,
  "buy:signal": 80,
  "buy:cleave": 150,
  "buy:last": 500,
  "buy:trial-signal": 240,
  "buy:trial-cleave": 450,
  "buy:trial-last": 1500
};
var REGULAR_DRAW = [
  ...Array.from({ length: 16 }, () => "prism"),
  ...Array.from({ length: 16 }, () => "scan-bars"),
  ...Array.from({ length: 15 }, () => "shield"),
  ...Array.from({ length: 15 }, () => "tri-cell"),
  ...Array.from({ length: 14 }, () => "cross"),
  ...Array.from({ length: 9 }, () => "shuriken"),
  ...Array.from({ length: 8 }, () => "reactor-skull"),
  ...Array.from({ length: 6 }, () => "infiltrator"),
  ...Array.from({ length: 5 }, () => "signal-runner"),
  ...Array.from({ length: 3 }, () => "security-mask")
];
function round4(value) {
  return Math.round(value * 1e4) / 1e4;
}
function index(column, row) {
  return row * NEON_SYNDICATE_COLUMNS + column;
}
function pick(random, values) {
  const value = values[random.int(values.length)];
  if (value === void 0) throw new Error("Cannot pick from an empty collection");
  return value;
}
function isRegular(symbol) {
  return Boolean(symbol && NEON_SYNDICATE_REGULAR_SYMBOLS.includes(symbol));
}
function isNeonSyndicateAction(value) {
  return Object.hasOwn(ACTION_COSTS, value);
}
function neonSyndicateCostMultiplierForAction(action) {
  if (!isNeonSyndicateAction(action)) throw new Error("Invalid Neon Syndicate action");
  return ACTION_COSTS[action];
}
function drawSymbol2(random, rivalChance, allowFs) {
  const roll = random.int(1e4);
  if (roll < rivalChance) return "rival";
  if (allowFs && roll < rivalChance + 190) return "fs";
  if (allowFs && roll < rivalChance + 215) return "triple-trial";
  if (roll < rivalChance + 330) return "wild";
  return pick(random, REGULAR_DRAW);
}
function drawGrid(random, rivalChance, allowFs, minimumRivals = 0) {
  const grid = Array.from({ length: NEON_SYNDICATE_CELLS }, () => drawSymbol2(random, rivalChance, allowFs));
  for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) {
    const rivals = Array.from({ length: NEON_SYNDICATE_ROWS }, (_, row) => index(reel, row)).filter(
      (position) => grid[position] === "rival"
    );
    for (const position of rivals.slice(1)) grid[position] = pick(random, REGULAR_DRAW);
  }
  const occupied = new Set(
    Array.from({ length: NEON_SYNDICATE_COLUMNS }, (_, reel) => reel).filter(
      (reel) => Array.from({ length: NEON_SYNDICATE_ROWS }, (_, row) => grid[index(reel, row)]).includes("rival")
    )
  );
  while (occupied.size < minimumRivals) {
    const candidates = Array.from({ length: NEON_SYNDICATE_COLUMNS }, (_, reel2) => reel2).filter(
      (reel2) => !occupied.has(reel2)
    );
    const reel = pick(random, candidates);
    grid[index(reel, random.int(NEON_SYNDICATE_ROWS))] = "rival";
    occupied.add(reel);
  }
  return grid;
}
function rawLineWin(grid, line) {
  const positions = line.map((row, reel) => index(reel, row));
  const symbols = positions.map((position) => grid[position]);
  const target = symbols.find(isRegular) ?? (symbols.slice(0, 3).every((symbol) => symbol === "wild") ? "security-mask" : void 0);
  if (!target) return void 0;
  let count = 0;
  for (const symbol of symbols) {
    if (symbol === target || symbol === "wild") count += 1;
    else break;
  }
  if (count < 3) return void 0;
  return { symbol: target, count: Math.min(5, count), positions: positions.slice(0, count) };
}
function evaluateNeonSyndicatePaylines(grid, rivals = []) {
  if (grid.length !== NEON_SYNDICATE_CELLS) throw new Error("Neon Syndicate grid must contain exactly 20 cells");
  return NEON_SYNDICATE_PAYLINES.flatMap((line, lineIndex) => {
    const raw = rawLineWin(grid, line);
    if (!raw) return [];
    const contributingReels = new Set(raw.positions.map((position) => position % NEON_SYNDICATE_COLUMNS));
    const rivalMultiplier = rivals.filter((rival) => rival.activated && contributingReels.has(rival.reel)).reduce((sum, rival) => sum + rival.multiplier, 0) || 1;
    const baseMultiplier = NEON_SYNDICATE_PAYTABLE[raw.symbol][raw.count];
    return [
      {
        line: lineIndex,
        ...raw,
        baseMultiplier,
        rivalMultiplier,
        multiplier: round4(baseMultiplier * rivalMultiplier)
      }
    ];
  });
}
function rivalDetails(random, grid) {
  const rivals = [];
  for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) {
    const row = Array.from({ length: NEON_SYNDICATE_ROWS }, (_, candidate) => candidate).find(
      (candidate) => grid[index(reel, candidate)] === "rival"
    );
    if (row === void 0) continue;
    const leftMultiplier = pick(random, NEON_SYNDICATE_RIVAL_MULTIPLIERS);
    const rightMultiplier = pick(random, NEON_SYNDICATE_RIVAL_MULTIPLIERS);
    const winningSide = random.int(2) === 0 ? "lime" : "magenta";
    rivals.push({
      reel,
      row,
      leftMultiplier,
      rightMultiplier,
      winningSide,
      multiplier: winningSide === "lime" ? leftMultiplier : rightMultiplier,
      activated: false
    });
  }
  return rivals;
}
function resolveSpin(random, options) {
  const allowFs = options.mode !== "last-contract";
  const grid = drawGrid(random, options.rivalChance, allowFs, options.minimumRivals);
  let rivals = rivalDetails(random, grid);
  const trialGrid = [...grid];
  for (const rival of rivals) {
    for (let row = 0; row < NEON_SYNDICATE_ROWS; row += 1) trialGrid[index(rival.reel, row)] = "wild";
  }
  const trialWins = evaluateNeonSyndicatePaylines(trialGrid);
  const activeReels = new Set(
    rivals.filter((rival) => trialWins.some((win2) => win2.positions.some((position) => position % 5 === rival.reel))).map((rival) => rival.reel)
  );
  rivals = rivals.map((rival) => ({ ...rival, activated: activeReels.has(rival.reel) }));
  const evaluatedGrid = [...grid];
  for (const rival of rivals.filter((candidate) => candidate.activated)) {
    for (let row = 0; row < NEON_SYNDICATE_ROWS; row += 1) evaluatedGrid[index(rival.reel, row)] = "wild";
  }
  const cleave = options.mode === "last-contract" || options.mode === "neon-cleave" && rivals.length > 0 && random.int(100) < 45;
  const cleaveRow = cleave ? random.int(NEON_SYNDICATE_ROWS) : void 0;
  if (cleaveRow !== void 0) {
    for (let reel = 0; reel < NEON_SYNDICATE_COLUMNS; reel += 1) evaluatedGrid[index(reel, cleaveRow)] = "wild";
  }
  const allRivals = activeReels.size === 5;
  if (allRivals) evaluatedGrid.fill("wild");
  let lineWins = evaluateNeonSyndicatePaylines(evaluatedGrid, rivals);
  if (allRivals && lineWins.length === 0) {
    lineWins = NEON_SYNDICATE_PAYLINES.map((line, lineIndex) => {
      const positions = line.map((row, reel) => index(reel, row));
      const rivalMultiplier = rivals.reduce((sum, rival) => sum + rival.multiplier, 0);
      return {
        line: lineIndex,
        symbol: "security-mask",
        count: 5,
        positions,
        baseMultiplier: 20,
        rivalMultiplier,
        multiplier: round4(20 * rivalMultiplier)
      };
    });
  }
  const scatterCount2 = grid.filter((symbol) => symbol === "fs").length;
  const retriggered = options.mode && scatterCount2 >= 2 ? scatterCount2 >= 3 ? 4 : 2 : 0;
  const win = round4(lineWins.reduce((sum, line) => sum + line.multiplier, 0));
  const presentationEvents = [
    "reels:spin",
    ...scatterCount2 >= 2 ? ["scatter:anticipation"] : [],
    ...rivals.filter((rival) => rival.activated).map((rival) => `rival:${rival.reel}:${rival.multiplier}`),
    ...cleaveRow !== void 0 ? [`cleave:${cleaveRow}`] : [],
    ...lineWins.length > 0 ? ["win:lines", "win:count"] : []
  ];
  return {
    grid,
    evaluatedGrid,
    lineWins,
    rivalReels: rivals,
    scatterCount: scatterCount2,
    tripleTrial: grid.includes("triple-trial"),
    ...cleaveRow !== void 0 ? { cleaveRow } : {},
    win,
    retriggered,
    presentationEvents
  };
}
function neonSyndicateBonusModeForScatterCount(count) {
  if (count >= 5) return "last-contract";
  if (count === 4) return "neon-cleave";
  if (count === 3) return "signal-run";
  return void 0;
}
function capNeonSyndicateMultiplier(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier < 0)
    throw new Error("Neon Syndicate multiplier must be finite and nonnegative");
  return round4(Math.min(NEON_SYNDICATE_MAX_WIN, multiplier));
}
function selectBestNeonSyndicateTrial(trials) {
  return trials.reduce(
    (best, candidate) => !best || candidate.bonus.win > best.win ? candidate.bonus : best,
    void 0
  );
}
function forcedMode(action) {
  if (action.endsWith("signal")) return "signal-run";
  if (action.endsWith("cleave")) return "neon-cleave";
  if (action.endsWith("last")) return "last-contract";
  return void 0;
}
function resolveBonus(random, mode) {
  let awarded = 10;
  const spins = [];
  let win = 0;
  for (let spin = 0; spin < awarded && spin < NEON_SYNDICATE_MAX_FREE_SPINS; spin += 1) {
    const result = resolveSpin(random, {
      mode,
      rivalChance: mode === "signal-run" ? 500 : 620,
      minimumRivals: mode === "last-contract" ? 1 : 0
    });
    spins.push(result);
    win = round4(win + result.win);
    awarded = Math.min(NEON_SYNDICATE_MAX_FREE_SPINS, awarded + result.retriggered);
    if (win >= NEON_SYNDICATE_MAX_WIN) break;
  }
  return { mode, awarded, played: spins.length, win, spins };
}
function resolveNeonSyndicate(random, rawAction) {
  if (!isNeonSyndicateAction(rawAction)) throw new Error("Invalid Neon Syndicate action");
  const minimumRivals = rawAction === "boost:triple" ? 3 : rawAction === "boost:duo" ? 2 : rawAction === "boost:rival" ? 1 : 0;
  const baseSpin = resolveSpin(random, { rivalChance: minimumRivals ? 700 : 220, minimumRivals });
  const purchasedMode = forcedMode(rawAction);
  const bonusMode = purchasedMode ?? neonSyndicateBonusModeForScatterCount(baseSpin.scatterCount);
  const isTrial = rawAction.startsWith("buy:trial-") || baseSpin.tripleTrial && bonusMode !== void 0;
  const trials = [];
  let bonus;
  if (bonusMode && isTrial) {
    for (let trial = 0; trial < 3; trial += 1) trials.push({ index: trial, bonus: resolveBonus(random, bonusMode) });
    bonus = selectBestNeonSyndicateTrial(trials);
  } else if (bonusMode) {
    bonus = resolveBonus(random, bonusMode);
  }
  const rawTotal = round4(baseSpin.win + (bonus?.win ?? 0));
  const finalMultiplier = capNeonSyndicateMultiplier(rawTotal);
  const presentationEvents = [
    ...baseSpin.presentationEvents,
    ...bonusMode ? [`bonus:${bonusMode}`] : [],
    ...isTrial ? ["trial:start", "trial:scoreboard"] : [],
    ...finalMultiplier >= NEON_SYNDICATE_MAX_WIN ? ["win:max"] : finalMultiplier >= 100 ? ["win:large"] : []
  ];
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "neon-syndicate",
      version: 1,
      action: rawAction,
      costMultiplier: ACTION_COSTS[rawAction],
      columns: 5,
      rows: 4,
      paylines: 14,
      baseSpin,
      ...bonusMode ? { bonusMode } : {},
      ...bonus ? { bonus } : {},
      trials,
      rawTotal,
      finalMultiplier,
      capped: rawTotal > NEON_SYNDICATE_MAX_WIN,
      presentationEvents
    }
  };
}

// packages/fairness-core/src/odins-vault.ts
var ODINS_VAULT_COLUMNS = 5;
var ODINS_VAULT_ROWS = 6;
var ODINS_VAULT_MAX_MULTIPLIER = SLOT_MAX_SETTLED_MULTIPLIER;
var ODINS_VAULT_MAX_COIN_VALUE = 5e5;
var ODINS_VAULT_RTP_CALIBRATION = TARGET_RTP / 0.967;
var ODINS_VAULT_ACTION_CALIBRATION = {
  spin: 1,
  "enhancer:bonus": 2.0296953620360245,
  "enhancer:degen": 8.439683886898873,
  "enhancer:trickster": 15.667952629090827,
  "enhancer:fu": 403,
  "buy:bonus": 5.477282860062938,
  "buy:super": 15.29579389447073
};
var ODINS_VAULT_REGULAR_SYMBOLS = [
  "clubs",
  "spades",
  "diamonds",
  "hearts",
  "horn",
  "axe",
  "mask",
  "horse",
  "falcon"
];
var ODINS_VAULT_PAYTABLE = {
  clubs: { 3: 0.1, 4: 0.2, 5: 0.4 },
  spades: { 3: 0.1, 4: 0.2, 5: 0.5 },
  diamonds: { 3: 0.1, 4: 0.2, 5: 0.7 },
  hearts: { 3: 0.2, 4: 0.5, 5: 1 },
  horn: { 3: 1, 4: 2, 5: 3 },
  axe: { 3: 1, 4: 2, 5: 4 },
  mask: { 3: 1, 4: 2, 5: 5 },
  horse: { 3: 2, 4: 3, 5: 10 },
  falcon: { 3: 2.5, 4: 10, 5: 25 }
};
var ODINS_VAULT_COIN_VALUES = {
  bronze: [1, 2, 3, 4],
  silver: [5, 10, 15],
  gold: [25, 50, 100],
  sapphire: [150, 200, 250, 500],
  ruby: [750, 1e3, 2500, 5e3],
  diamond: [1e4, 25e3, 5e4]
};
var ODINS_VAULT_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [5, 5, 5, 5, 5],
  [0, 1, 2, 1, 0],
  [5, 4, 3, 4, 5],
  [0, 0, 1, 0, 0],
  [5, 5, 4, 5, 5],
  [1, 2, 3, 2, 1],
  [4, 3, 2, 3, 4],
  [2, 1, 0, 1, 2],
  [3, 4, 5, 4, 3],
  [0, 1, 1, 1, 0],
  [5, 4, 4, 4, 5],
  [1, 0, 1, 0, 1],
  [4, 5, 4, 5, 4],
  [0, 2, 4, 2, 0],
  [5, 3, 1, 3, 5],
  [2, 0, 2, 0, 2],
  [3, 5, 3, 5, 3],
  [0, 1, 2, 3, 4],
  [5, 4, 3, 2, 1],
  [1, 2, 3, 4, 5],
  [4, 3, 2, 1, 0],
  [0, 2, 3, 2, 0],
  [5, 3, 2, 3, 5]
];
var MYTHIC_PATTERNS = [
  ...ODINS_VAULT_PAYLINES.slice(0, 6),
  ODINS_VAULT_PAYLINES[6],
  ODINS_VAULT_PAYLINES[7],
  ODINS_VAULT_PAYLINES[22],
  ODINS_VAULT_PAYLINES[23],
  ODINS_VAULT_PAYLINES[24],
  ODINS_VAULT_PAYLINES[25]
].filter((line) => line !== void 0);
var REGULAR_WEIGHTS = [
  ...Array.from({ length: 18 }, () => "clubs"),
  ...Array.from({ length: 17 }, () => "spades"),
  ...Array.from({ length: 16 }, () => "diamonds"),
  ...Array.from({ length: 15 }, () => "hearts"),
  ...Array.from({ length: 9 }, () => "horn"),
  ...Array.from({ length: 8 }, () => "axe"),
  ...Array.from({ length: 7 }, () => "mask"),
  ...Array.from({ length: 6 }, () => "horse"),
  ...Array.from({ length: 4 }, () => "falcon")
];
var BONUS_TIERS = ["free", "super", "legendary", "mythic"];
var COIN_TIERS = [
  "bronze",
  "silver",
  "gold",
  "sapphire",
  "ruby",
  "diamond"
];
var actionCosts = {
  spin: 1,
  "enhancer:bonus": 3,
  "enhancer:degen": 25,
  "enhancer:trickster": 75,
  "enhancer:fu": 5e3,
  "buy:bonus": 200,
  "buy:super": 1e3
};
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
function isOdinsVaultAction(value) {
  return Object.hasOwn(actionCosts, value);
}
function odinsVaultCostMultiplierForAction(action) {
  if (!isOdinsVaultAction(action)) throw new Error("Invalid Odin's Vault action");
  return actionCosts[action];
}
function odinsVaultRawCapForAction(action) {
  return ODINS_VAULT_MAX_MULTIPLIER * odinsVaultCostMultiplierForAction(action);
}
function upgradeOdinsVaultBonusTier(tier) {
  const index2 = BONUS_TIERS.indexOf(tier);
  return BONUS_TIERS[Math.min(BONUS_TIERS.length - 1, index2 + 1)] ?? tier;
}
function gridIndex(column, row) {
  return row * ODINS_VAULT_COLUMNS + column;
}
function paySymbol(cell) {
  if (!cell) return void 0;
  if (cell.symbol === "mystery") return cell.resolvedSymbol;
  return ODINS_VAULT_REGULAR_SYMBOLS.includes(cell.symbol) ? cell.symbol : void 0;
}
function evaluateOdinsVaultPaylines(grid) {
  if (grid.length !== ODINS_VAULT_COLUMNS * ODINS_VAULT_ROWS) {
    throw new Error("Odin's Vault grid must contain exactly 30 cells");
  }
  const wins = [];
  for (const [lineIndex, rows] of ODINS_VAULT_PAYLINES.entries()) {
    const first = paySymbol(grid[gridIndex(0, rows[0])]);
    if (!first) continue;
    let count = 1;
    const positions = [gridIndex(0, rows[0])];
    for (let column = 1; column < ODINS_VAULT_COLUMNS; column += 1) {
      const row = rows[column];
      if (row === void 0) break;
      const position = gridIndex(column, row);
      if (paySymbol(grid[position]) !== first) break;
      count += 1;
      positions.push(position);
    }
    if (count >= 3) {
      const paidCount = Math.min(5, count);
      wins.push({
        line: lineIndex + 1,
        symbol: first,
        count: paidCount,
        positions,
        multiplier: ODINS_VAULT_PAYTABLE[first][paidCount]
      });
    }
  }
  return wins;
}
function odinsVaultFreeSpinTierForGrid(grid) {
  const scatters = grid.flatMap((cell, index2) => cell.symbol === "scatter" ? [index2] : []);
  if (scatters.length < 3) return void 0;
  if (scatters.length >= 5) {
    const mythic = MYTHIC_PATTERNS.some(
      (rows) => rows.every((row, column) => grid[gridIndex(column, row)]?.symbol === "scatter")
    );
    return mythic ? "mythic" : "legendary";
  }
  return scatters.length === 4 ? "super" : "free";
}
function modeBoost(action, tier) {
  const actionBoost = {
    spin: 0,
    "enhancer:bonus": 55,
    "enhancer:degen": 140,
    "enhancer:trickster": 230,
    "enhancer:fu": 480,
    "buy:bonus": 90,
    "buy:super": 170
  }[action];
  const tierBoost = tier ? (BONUS_TIERS.indexOf(tier) + 1) * 45 : 0;
  return actionBoost + tierBoost;
}
function randomCoin(random, boost) {
  if (random.int(1e8) === 0) {
    return { symbol: "max-coin", coinTier: "max", coinValue: ODINS_VAULT_MAX_COIN_VALUE };
  }
  const tierRoll = random.int(1e9);
  const thresholds = [
    Math.max(9e8, 979e6 - boost * 3e4),
    997e6 - boost * 1e4,
    9997e5 - boost * 2e3,
    99999e4 - boost * 200,
    999999990,
    1e9
  ];
  const index2 = thresholds.findIndex((threshold) => tierRoll < threshold);
  const tier = COIN_TIERS[Math.max(0, index2)] ?? "bronze";
  return { symbol: "coin", coinTier: tier, coinValue: random.pick(ODINS_VAULT_COIN_VALUES[tier]) };
}
function randomCell(random, action, tier) {
  const boost = modeBoost(action, tier);
  const roll = random.int(1e4);
  let edge = 115 + Math.floor(boost * 0.12);
  if (roll < edge) return { symbol: "scatter" };
  edge += 559 + Math.floor(boost * 0.8);
  if (roll < edge) return randomCoin(random, boost);
  edge += 90 + Math.floor(boost * 0.12);
  if (roll < edge) return { symbol: "eye" };
  edge += 34 + Math.floor(boost * 0.06);
  if (roll < edge) return { symbol: "key" };
  edge += 34 + Math.floor(boost * 0.06);
  if (roll < edge) return { symbol: "bard" };
  edge += 22 + Math.floor(boost * 0.04);
  if (roll < edge) return { symbol: "upgrader" };
  edge += 34 + Math.floor(boost * 0.05);
  if (roll < edge) return { symbol: "redrop" };
  edge += 16 + Math.floor(boost * 0.1);
  if (roll < edge) return { symbol: "collector" };
  edge += 2 + Math.floor(boost * 0.025);
  if (roll < edge) return { symbol: "super-collector" };
  return { symbol: random.pick(REGULAR_WEIGHTS) };
}
function forceScatterCount(grid, count, random) {
  const positions = Array.from({ length: grid.length }, (_, index2) => index2);
  for (let index2 = positions.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    [positions[index2], positions[swap]] = [positions[swap] ?? index2, positions[index2] ?? swap];
  }
  for (const position of positions.slice(0, count)) grid[position] = { symbol: "scatter" };
}
function upgradeCoins(grid, random) {
  let changed = false;
  for (let index2 = 0; index2 < grid.length; index2 += 1) {
    const cell = grid[index2];
    if (!cell || cell.symbol !== "coin" && cell.symbol !== "max-coin" || !cell.coinTier || cell.coinTier === "max") {
      continue;
    }
    const tierIndex = COIN_TIERS.indexOf(cell.coinTier);
    const nextTier = COIN_TIERS[Math.min(COIN_TIERS.length - 1, tierIndex + 1)] ?? cell.coinTier;
    grid[index2] = { symbol: "coin", coinTier: nextTier, coinValue: random.pick(ODINS_VAULT_COIN_VALUES[nextTier]) };
    changed = true;
  }
  return changed;
}
function resolveOdinsVaultGrid(random, action, options = {}) {
  const grid = Array.from(
    { length: ODINS_VAULT_COLUMNS * ODINS_VAULT_ROWS },
    () => randomCell(random, action, options.tier)
  );
  if (options.forcedScatterCount) forceScatterCount(grid, options.forcedScatterCount, random);
  if (options.forceUpgrader && !grid.some((cell) => cell.symbol === "upgrader")) {
    const position = grid.findIndex((cell) => cell.symbol !== "scatter");
    if (position >= 0) grid[position] = { symbol: "upgrader" };
  }
  if (options.forceUpgrader && !grid.some((cell) => cell.symbol === "coin" || cell.symbol === "max-coin")) {
    const position = grid.findIndex((cell) => cell.symbol !== "scatter" && cell.symbol !== "upgrader");
    if (position >= 0) grid[position] = { symbol: "coin", coinTier: "bronze", coinValue: 1 };
  }
  const events = [];
  const redropPositions = [];
  const redropReplacements = [];
  if (grid.some((cell) => cell.symbol === "redrop")) {
    for (let index2 = 0; index2 < grid.length; index2 += 1) {
      if (!paySymbol(grid[index2])) continue;
      const replacement = random.pick(REGULAR_WEIGHTS);
      grid[index2] = { symbol: replacement };
      redropPositions.push(index2);
      redropReplacements.push(replacement);
    }
    if (redropPositions.length > 0) events.push("redrop");
  }
  const eyeCells = grid.flatMap((cell, index2) => cell.symbol === "eye" ? [index2] : []);
  const eyeTarget = options.persistentEyeTarget ?? (eyeCells.length > 0 ? random.pick(ODINS_VAULT_REGULAR_SYMBOLS) : void 0);
  if (eyeTarget && (eyeCells.length > 0 || options.persistentEyeTarget)) {
    const candidates = grid.flatMap((cell, index2) => paySymbol(cell) ? [index2] : []);
    const conversions = Math.min(candidates.length, Math.max(1, eyeCells.length * 2 || 1));
    for (let index2 = 0; index2 < conversions; index2 += 1) {
      const candidateIndex = random.int(candidates.length);
      const [position] = candidates.splice(candidateIndex, 1);
      if (position !== void 0) grid[position] = { symbol: "mystery", resolvedSymbol: eyeTarget };
    }
    events.push("eye-awakens");
  }
  const upgraded = grid.some((cell) => cell.symbol === "upgrader") && upgradeCoins(grid, random);
  if (upgraded) events.push("coin-upgrade");
  const keyCount = grid.filter((cell) => cell.symbol === "key").length;
  const globalMultiplier = keyCount > 0 ? random.pick([2, 3, 4, 5, 10]) : 1;
  const globalSide = keyCount > 0 ? random.pick(["red", "white"]) : void 0;
  if (globalSide) events.push(`global-${globalSide}`);
  const bardCount = grid.filter((cell) => cell.symbol === "bard").length;
  const bardMultiplier = bardCount > 0 ? random.pick([2, 3, 5, 10, 20]) : 1;
  if (bardMultiplier > 1) events.push("bard-multiplier");
  const collectorActivations = grid.filter((cell) => cell.symbol === "collector").length + grid.filter((cell) => cell.symbol === "super-collector").length * 2;
  const coinValue = grid.reduce((sum, cell) => sum + (cell.coinValue ?? 0), 0);
  const coinMultiplier = round6(
    coinValue * collectorActivations * bardMultiplier * globalMultiplier * ODINS_VAULT_RTP_CALIBRATION * ODINS_VAULT_ACTION_CALIBRATION[action]
  );
  if (collectorActivations > 0 && coinValue > 0) {
    events.push(collectorActivations > 1 ? "super-collect" : "collect");
  }
  const lineWins = evaluateOdinsVaultPaylines(grid);
  const lineMultiplier = round6(
    lineWins.reduce((sum, win) => sum + win.multiplier, 0) * globalMultiplier * ODINS_VAULT_RTP_CALIBRATION * ODINS_VAULT_ACTION_CALIBRATION[action]
  );
  if (lineWins.length > 0) events.push("line-win");
  if (grid.some((cell) => cell.symbol === "max-coin")) events.push("max-win-coin");
  return {
    grid,
    lineWins,
    lineMultiplier,
    coinMultiplier,
    totalMultiplier: Math.min(odinsVaultRawCapForAction(action), round6(lineMultiplier + coinMultiplier)),
    scatterCount: grid.filter((cell) => cell.symbol === "scatter").length,
    eyeMeterGain: eyeCells.length,
    ...eyeTarget ? { eyeTarget } : {},
    globalMultiplier,
    ...globalSide ? { globalSide } : {},
    bardMultiplier,
    collectorActivations,
    ...redropPositions.length > 0 ? { redrop: { positions: redropPositions, replacements: redropReplacements } } : {},
    upgraded,
    presentationEvents: events
  };
}
function forcedTierForAction(action) {
  if (action === "buy:bonus") return "free";
  if (action === "buy:super") return "super";
  return void 0;
}
function resolveOdinsVaultSpin(random, rawAction) {
  if (!isOdinsVaultAction(rawAction)) throw new Error("Invalid Odin's Vault action");
  const action = rawAction;
  const forcedTier = forcedTierForAction(action);
  const base = resolveOdinsVaultGrid(random, action, {
    ...forcedTier ? { forcedScatterCount: forcedTier === "super" ? 4 : 3 } : {}
  });
  const initialBonusTier = forcedTier ?? odinsVaultFreeSpinTierForGrid(base.grid);
  let bonusTier = initialBonusTier;
  const bonusSpins = [];
  let persistentEyeTarget;
  if (bonusTier) {
    for (let spin = 1; spin <= 10; spin += 1) {
      const tierAtStart = bonusTier;
      const persistent = tierAtStart !== "free";
      const resolved = resolveOdinsVaultGrid(random, action, {
        tier: tierAtStart,
        ...persistent && persistentEyeTarget ? { persistentEyeTarget } : {},
        ...tierAtStart === "mythic" && spin === 1 ? { forceUpgrader: true } : {}
      });
      if (persistent && resolved.eyeTarget) persistentEyeTarget = resolved.eyeTarget;
      const upgradedTo = resolved.scatterCount > 0 ? upgradeOdinsVaultBonusTier(tierAtStart) : void 0;
      if (upgradedTo) bonusTier = upgradedTo;
      bonusSpins.push({
        ...resolved,
        spin,
        tier: tierAtStart,
        ...upgradedTo && upgradedTo !== tierAtStart ? { upgradedTo } : {}
      });
    }
  }
  const uncapped = round6(base.totalMultiplier + bonusSpins.reduce((sum, spin) => sum + spin.totalMultiplier, 0));
  const rawCap = odinsVaultRawCapForAction(action);
  const totalMultiplier = quantizeSlotMultiplier(capOdinsVaultMultiplier(uncapped, action));
  const presentationEvents = [
    ...base.presentationEvents,
    ...bonusSpins.length > 0 ? ["bonus-transition", "free-spins"] : [],
    ...bonusSpins.flatMap((spin) => spin.presentationEvents),
    ...uncapped >= rawCap ? ["max-win"] : []
  ];
  return {
    kind: "odins-vault",
    action,
    costMultiplier: odinsVaultCostMultiplierForAction(action),
    columns: 5,
    rows: 6,
    paylines: 28,
    base,
    ...initialBonusTier ? { bonusTier: initialBonusTier } : {},
    bonusSpins,
    totalMultiplier,
    capped: uncapped > rawCap,
    presentationEvents
  };
}
function capOdinsVaultMultiplier(value, action = "spin") {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(odinsVaultRawCapForAction(action), round6(value));
}

// packages/fairness-core/src/packs.ts
var PACK_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "stake"];
var rarityBlueprints = {
  common: {
    adjectives: ["Copper", "Moss", "Cloud", "Pebble", "Dawn", "Harbor", "Quiet", "Paper", "Lunar", "Pocket"],
    nouns: ["Finch", "Compass", "Lantern", "Acorn", "Kite", "Cove", "Key", "Sprout", "Button", "Glider"],
    multipliers: [0.01, 0.02, 0.03, 0.04]
  },
  uncommon: {
    adjectives: ["Verdant", "Cobalt", "Amber", "Silver", "Saffron", "Electric", "Nova", "Glass", "Mint", "Coral"],
    nouns: ["Mantis", "Wayfinder", "Orchid", "Tern", "Relic", "Grove"],
    multipliers: [0.1, 0.2, 0.3, 0.4, 0.6, 0.8]
  },
  rare: {
    adjectives: [
      "Azure",
      "Runic",
      "Frosted",
      "Solar",
      "Velvet",
      "Aerial",
      "Neon",
      "Tidal",
      "Orbit",
      "Stellar",
      "Midnight"
    ],
    nouns: ["Voyager", "Chimera", "Comet", "Oracle", "Monument"],
    multipliers: [1, 2, 3, 5, 8, 10, 15]
  },
  epic: {
    adjectives: ["Violet", "Astral", "Tempest", "Prismatic", "Eclipse"],
    nouns: ["Sentinel", "Phoenix", "Labyrinth"],
    multipliers: [50, 75, 100, 150]
  },
  legendary: {
    adjectives: [
      "Golden",
      "Celestial",
      "Infinite",
      "Crimson",
      "Sovereign",
      "Radiant",
      "Imperial",
      "Eternal",
      "Starborn"
    ],
    nouns: ["Crown"],
    multipliers: [500, 600, 700, 800, 1e3]
  },
  stake: {
    adjectives: ["Prismatic"],
    nouns: ["Singularity"],
    multipliers: [1e4]
  }
};
var rarityNumberStarts = {
  stake: 1,
  legendary: 2,
  epic: 11,
  rare: 26,
  uncommon: 81,
  common: 141
};
var rarityHues = {
  common: 188,
  uncommon: 213,
  rare: 344,
  epic: 133,
  legendary: 176,
  stake: 42
};
var glyphs = ["✦", "◆", "⬡", "✧", "◈", "❖", "✺", "✤", "⌁", "⟡"];
function buildCards() {
  return PACK_RARITIES.flatMap((rarity, rarityIndex) => {
    const blueprint = rarityBlueprints[rarity];
    return blueprint.adjectives.flatMap(
      (adjective, adjectiveIndex) => blueprint.nouns.map((noun, nounIndex) => {
        const withinTier = adjectiveIndex * blueprint.nouns.length + nounIndex;
        return {
          id: `${rarity}-${String(withinTier + 1).padStart(3, "0")}`,
          collectionNumber: rarityNumberStarts[rarity] + withinTier,
          name: `${adjective} ${noun}`,
          rarity,
          multiplier: blueprint.multipliers[(withinTier * 5 + rarityIndex) % blueprint.multipliers.length] ?? 0.01,
          glyph: glyphs[(withinTier + rarityIndex * 2) % glyphs.length] ?? "✦",
          hue: (rarityHues[rarity] + withinTier * 7) % 360,
          artVariant: withinTier % 8
        };
      })
    );
  });
}
var PACK_CARDS = buildCards();
var PACKS_MAX_MULTIPLIER = 5e4;
var LEGACY_PACK_RARITY_WEIGHTS = {
  common: 83e5,
  uncommon: 15e5,
  rare: 195e3,
  epic: 4500,
  legendary: 499,
  stake: 1
};
var PACK_RARITY_WEIGHTS = Object.freeze({
  common: 88e5,
  uncommon: 105e4,
  rare: 148e3,
  epic: 1800,
  legendary: 199,
  stake: 1
});
var PACKS_PRESENTATION_MS = 1883;
function roundPackMultiplier(value) {
  return Math.round(value * 100) / 100;
}
function packCardsForRarity(rarity) {
  return PACK_CARDS.filter((card2) => card2.rarity === rarity);
}
function pickRarity(random, weights2) {
  const total = PACK_RARITIES.reduce((sum, rarity) => sum + weights2[rarity], 0);
  let cursor = random.int(total);
  for (const rarity of PACK_RARITIES) {
    const weight = weights2[rarity];
    if (cursor < weight) return rarity;
    cursor -= weight;
  }
  return "common";
}
function resolvePacks(random, mathVersion = "packs-house-edge-v2") {
  const weights2 = mathVersion === "legacy" ? LEGACY_PACK_RARITY_WEIGHTS : PACK_RARITY_WEIGHTS;
  const cards2 = Array.from({ length: 5 }, (_, index2) => {
    const rarity = pickRarity(random, weights2);
    const candidates = packCardsForRarity(rarity);
    const card2 = candidates[random.int(candidates.length)];
    if (!card2) throw new Error("Packs card selection failed");
    const rarityIndex = PACK_RARITIES.indexOf(rarity);
    return {
      ...card2,
      revealPosition: index2 + 1,
      presentation: {
        accent: `hsl(${card2.hue} 82% ${rarityIndex >= 4 ? 62 : 54}%)`,
        foil: rarityIndex >= 3,
        glow: rarityIndex >= 5 ? "radiant" : rarityIndex >= 3 ? "bright" : "soft",
        tilt: random.int(11) - 5
      }
    };
  });
  const summedMultiplier = roundPackMultiplier(cards2.reduce((sum, card2) => sum + card2.multiplier, 0));
  return {
    multiplier: summedMultiplier,
    outcome: {
      kind: "packs",
      ...mathVersion === "legacy" ? {} : { mathVersion: "packs-house-edge-v2" },
      collectionSize: 240,
      cardsPerPack: 5,
      cards: cards2,
      summedMultiplier,
      presentation: {
        sequence: "five-card-pack",
        presentationMs: PACKS_PRESENTATION_MS,
        rarityOrder: PACK_RARITIES
      }
    }
  };
}

// packages/fairness-core/src/rip-city.ts
var RIP_CITY_MAX_MULTIPLIER = 12500;
var RIP_CITY_COLUMNS = 5;
var RIP_CITY_ROWS = 5;
var RIP_CITY_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [0, 0, 1, 0, 0],
  [4, 4, 3, 4, 4],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [1, 0, 0, 0, 1],
  [3, 4, 4, 4, 3],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [0, 1, 1, 1, 0],
  [4, 3, 3, 3, 4],
  [1, 1, 2, 1, 1],
  [3, 3, 2, 3, 3]
];
var RIP_CITY_WILD_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200];
var provisionalWeights = [
  ["ten", 14],
  ["jack", 14],
  ["queen", 13],
  ["king", 12],
  ["ace", 11],
  ["dice", 9],
  ["banana", 8],
  ["candle", 7],
  ["eightball", 7],
  ["smiley", 6],
  ["mouse", 5],
  ["cat", 4],
  ["wild", 5],
  ["bonus", 3]
];
var basePays = {
  ten: [0.1, 0.25, 0.75],
  jack: [0.12, 0.3, 0.9],
  queen: [0.14, 0.35, 1],
  king: [0.16, 0.4, 1.2],
  ace: [0.18, 0.5, 1.5],
  dice: [0.22, 0.65, 1.8],
  banana: [0.25, 0.75, 2.1],
  candle: [0.3, 0.9, 2.6],
  eightball: [0.35, 1.1, 3],
  smiley: [0.4, 1.25, 3.5],
  mouse: [0.5, 1.5, 4],
  cat: [0, 0, 0],
  wild: [0, 0, 0],
  bonus: [0, 0, 0]
};
function pick2(random) {
  const total = provisionalWeights.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = random.int(total);
  for (const [symbol, weight] of provisionalWeights) {
    if (ticket < weight) return symbol;
    ticket -= weight;
  }
  return "ten";
}
function makeGrid(random, bonus, idOffset = 0, activatedReels = /* @__PURE__ */ new Set()) {
  const grid = Array.from({ length: RIP_CITY_COLUMNS * RIP_CITY_ROWS }, (_, index2) => {
    const reel = Math.floor(index2 / RIP_CITY_ROWS);
    const row = index2 % RIP_CITY_ROWS;
    let symbol = pick2(random);
    if (bonus === "cat" && random.int(6) === 0) symbol = random.int(3) === 0 ? "wild" : "cat";
    return { id: idOffset + index2 + 1, symbol, reel, row, wildMultiplier: 1, expanded: false };
  });
  for (let reel = 0; reel < RIP_CITY_COLUMNS; reel += 1) {
    const cats = grid.filter((cell) => cell.reel === reel && cell.symbol === "cat");
    for (const duplicate of cats.slice(1)) grid[duplicate.id - idOffset - 1] = { ...duplicate, symbol: "mouse" };
    if (activatedReels.has(reel) && cats.length === 0) {
      const row = random.int(RIP_CITY_ROWS);
      const index2 = reel * RIP_CITY_ROWS + row;
      const cell = grid[index2];
      grid[index2] = { ...cell, symbol: "cat" };
    }
  }
  return grid;
}
function cellAt(grid, reel, row) {
  return grid.find((cell) => cell.reel === reel && cell.row === row);
}
function isSubstitute(cell) {
  return cell?.symbol === "wild" || cell?.symbol === "cat";
}
function expandRipCityWilds(grid, random) {
  const original = grid.map((cell) => ({ ...cell, expanded: false, wildMultiplier: 1 }));
  const cats = original.filter((cell) => cell.symbol === "cat");
  if (!cats.length) return { grid: original, positions: [] };
  const candidates = cats.map((cat) => {
    const covered = original.filter((cell) => cell.reel === cat.reel && cell.row >= cat.row);
    const crossedWilds = covered.filter((cell) => cell.symbol === "wild");
    const multiplier = crossedWilds.length ? crossedWilds.reduce(
      (sum) => sum + RIP_CITY_WILD_MULTIPLIERS[random?.int(RIP_CITY_WILD_MULTIPLIERS.length) ?? 0],
      0
    ) : 1;
    return { cat, covered, multiplier };
  });
  const expandedAll = original.map((cell) => {
    const candidate = candidates.find(({ covered }) => covered.some(({ id }) => id === cell.id));
    return candidate ? { ...cell, symbol: "cat", expanded: true, wildMultiplier: candidate.multiplier } : cell;
  });
  const provisionalWins = evaluateRipCityWins(expandedAll);
  const winningIds = new Set(provisionalWins.flatMap((win) => win.positions));
  const active = candidates.filter(({ covered }) => covered.some(({ id }) => winningIds.has(id)));
  const positions = active.flatMap(({ covered }) => covered.map(({ id }) => id));
  const activeIds = new Set(positions);
  const finalGrid = original.map((cell) => {
    const candidate = active.find(({ covered }) => covered.some(({ id }) => id === cell.id));
    return candidate && activeIds.has(cell.id) ? { ...cell, symbol: "cat", expanded: true, wildMultiplier: candidate.multiplier } : cell;
  });
  return { grid: finalGrid, positions };
}
function evaluateRipCityWins(grid) {
  const wins = [];
  for (const payline of RIP_CITY_PAYLINES) {
    const line = payline.map((row, reel) => cellAt(grid, reel, row));
    const anchor = line.find((cell) => cell && !isSubstitute(cell) && cell.symbol !== "bonus")?.symbol;
    if (!anchor) continue;
    const positions = [];
    const appliedMultipliers = [];
    for (const cell of line) {
      if (!cell || cell.symbol !== anchor && !isSubstitute(cell)) break;
      positions.push(cell.id);
      if (cell.symbol === "cat" && cell.expanded && cell.wildMultiplier > 1)
        appliedMultipliers.push(cell.wildMultiplier);
    }
    if (positions.length < 3) continue;
    const wildMultiplier = appliedMultipliers.length ? appliedMultipliers.reduce((sum, value) => sum + value, 0) : 1;
    const pay = (basePays[anchor][Math.min(2, positions.length - 3)] ?? 0) * wildMultiplier;
    wins.push({
      symbol: anchor,
      positions,
      count: positions.length,
      wildMultiplier,
      multiplier: quantizeSlotMultiplier(pay)
    });
  }
  return wins;
}
function resolveGrid(random, variant, offset, activatedReels = /* @__PURE__ */ new Set()) {
  const initialGrid2 = makeGrid(random, variant, offset, activatedReels);
  const landed = expandRipCityWilds(initialGrid2, random);
  const wins = evaluateRipCityWins(landed.grid);
  const multiplier = wins.reduce((sum, win) => sum + win.multiplier, 0);
  return {
    initialGrid: initialGrid2,
    grid: landed.grid,
    positions: landed.positions,
    wins,
    multiplier: quantizeSlotMultiplier(multiplier)
  };
}
function resolveRipCity(random, action = "spin") {
  const base = resolveGrid(random, "none", 0);
  const bonusCount = base.initialGrid.filter((cell) => cell.symbol === "bonus").length;
  const forced = action.includes("force-cat") ? "cat" : action.includes("force-mouse") ? "mouse" : void 0;
  const bonusVariant = forced ?? (bonusCount >= 4 ? "mouse" : bonusCount === 3 ? "cat" : "none");
  const bonusSpins = [];
  let total = base.multiplier;
  if (bonusVariant !== "none") {
    let currentVariant = bonusVariant;
    let spinsRemaining = 10;
    let spin = 0;
    const activatedReels = /* @__PURE__ */ new Set();
    while (spinsRemaining > 0 && spin < 50) {
      spin += 1;
      spinsRemaining -= 1;
      const activeBeforeSpin = new Set(activatedReels);
      const resolved = resolveGrid(random, currentVariant, spin * 100, activeBeforeSpin);
      const scatterCount2 = resolved.initialGrid.filter((cell) => cell.symbol === "bonus").length;
      if (currentVariant === "mouse") {
        for (const cell of resolved.initialGrid) if (cell.symbol === "cat") activatedReels.add(cell.reel);
      }
      if (scatterCount2 >= 3) spinsRemaining += 4;
      if (currentVariant === "cat" && scatterCount2 >= 4) {
        currentVariant = "mouse";
        if (spinsRemaining < 10) spinsRemaining = 10;
      }
      bonusSpins.push({
        spin,
        variant: currentVariant,
        initialGrid: resolved.initialGrid,
        grid: resolved.grid,
        expandedPositions: resolved.positions,
        activatedReels: [...activatedReels].sort(),
        wins: resolved.wins,
        multiplier: resolved.multiplier
      });
      total += resolved.multiplier;
    }
  }
  total = Math.min(RIP_CITY_MAX_MULTIPLIER, quantizeSlotMultiplier(total));
  return {
    multiplier: total,
    outcome: {
      kind: "rip-city",
      mathModel: "provisional-clean-room-v2",
      columns: RIP_CITY_COLUMNS,
      rows: RIP_CITY_ROWS,
      initialGrid: base.initialGrid,
      grid: base.grid,
      expandedPositions: base.positions,
      wins: base.wins,
      bonusTriggered: bonusVariant !== "none",
      bonusVariant,
      bonusSpins,
      totalMultiplier: total,
      maxMultiplier: RIP_CITY_MAX_MULTIPLIER,
      replacementNote: "Temporary deterministic demo weights and payouts; replace this resolver during RTP calibration."
    }
  };
}

// packages/fairness-core/src/gravity.ts
function buildGravityCascade(grid, removed, columns, rows, draw2) {
  if (grid.length !== columns * rows) throw new Error("Gravity grid dimensions do not match");
  const removedSet = new Set(removed);
  if ([...removedSet].some((position) => !Number.isInteger(position) || position < 0 || position >= grid.length)) {
    throw new Error("Gravity removal position is out of range");
  }
  const reels = Array(grid.length);
  const movements = [];
  const newPositions = [];
  for (let column = 0; column < columns; column += 1) {
    const survivors = Array.from({ length: rows }, (_, row) => row * columns + column).filter(
      (position) => !removedSet.has(position)
    );
    const newCount = rows - survivors.length;
    for (let row = 0; row < newCount; row += 1) {
      const position = row * columns + column;
      reels[position] = draw2(column);
      newPositions.push(position);
    }
    survivors.forEach((from, survivorIndex) => {
      const to = (newCount + survivorIndex) * columns + column;
      const symbol = grid[from];
      if (symbol === void 0) throw new Error("Gravity survivor is missing");
      reels[to] = symbol;
      movements.push({ symbol, from, to, distance: Math.floor(to / columns) - Math.floor(from / columns) });
    });
  }
  if (reels.some((symbol) => symbol === void 0)) throw new Error("Gravity cascade left an empty cell");
  return { reels, movements, newPositions };
}

// packages/fairness-core/src/slots.ts
var rotate = (strip, offset) => strip.map((_symbol, index2) => strip[(index2 + offset) % strip.length] ?? strip[0] ?? "wild");
var strips = (base, columns, stride) => Array.from({ length: columns }, (_unused, column) => rotate(base, column * stride));
var weightedStrip = (weights2) => {
  const maximumWeight = Math.max(...weights2.map(({ weight }) => weight));
  return Array.from(
    { length: maximumWeight },
    (_unused, pass) => weights2.flatMap(({ symbol, weight }) => pass < weight ? [symbol] : [])
  ).flat();
};
var FAIR_SLOT_SYMBOL_WEIGHTS = {
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
var MIDNIGHT_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["midnight-train-heist"]);
var MIDAS_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["midas-feast"]);
var SANDS_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["sands-of-sekhmet"]);
var POSEIDON_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS["poseidons-abyssal-crown"]);
var SIXSIXSIX_BASE_STRIP = weightedStrip(FAIR_SLOT_SYMBOL_WEIGHTS.sixsixsix);
var PAYTABLE_25 = {
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
  15: 1e3,
  16: 1e3,
  17: 1e3,
  18: 1e3,
  19: 1e3,
  20: 1e3,
  21: 1e3,
  22: 1e3,
  23: 1e3,
  24: 1e3,
  25: 1e3
};
var SANDS_PAYTABLE = {
  6: 0.65,
  7: 2.6,
  8: 6.5,
  9: 16.25,
  10: 39,
  11: 78,
  12: 162.5,
  13: 325,
  14: 650,
  15: 1e3,
  16: 1e3,
  17: 1e3,
  18: 1e3,
  19: 1e3,
  20: 1e3,
  21: 1e3,
  22: 1e3,
  23: 1e3,
  24: 1e3,
  25: 1e3,
  26: 1e3,
  27: 1e3,
  28: 1e3,
  29: 1e3,
  30: 1e3
};
var POSEIDON_PAYTABLE = {
  8: 2.2,
  9: 5.5,
  10: 13.2,
  11: 40,
  12: 80,
  13: 110,
  14: 220,
  15: 440,
  16: 880,
  17: 1e3,
  18: 1e3,
  19: 1e3,
  20: 1e3,
  21: 1e3,
  22: 1e3,
  23: 1e3,
  24: 1e3,
  25: 1e3,
  26: 1e3,
  27: 1e3,
  28: 1e3,
  29: 1e3,
  30: 1e3
};
var MIDAS_PAYTABLE_36 = {
  ...POSEIDON_PAYTABLE,
  31: 1e3,
  32: 1e3,
  33: 1e3,
  34: 1e3,
  35: 1e3,
  36: 1e3
};
var scaledPaytable = (paytable, factor) => Object.fromEntries(Object.entries(paytable).map(([count, pay]) => [count, Math.round(pay * factor * 100) / 100]));
var MIDAS_SYMBOL_PAYTABLES = {
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
var sharedBonusPaytable = { 3: 1, 4: 2, 5: 4, 6: 7, 7: 11, 8: 16 };
var FAIR_SLOT_DEFINITIONS = {
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
var payoutAt = (paytable, count) => paytable[count] ?? 0;
var SIXSIXSIX_WHEEL_AWARDS = [2, 5, 10, 20, 250, 4, 2, 100];
function sixSixSixWheelMultiplier(reels, cascadeIndex) {
  const wilds = reels.filter((symbol) => symbol === "wild").length;
  if (wilds < 3) return 1;
  return SIXSIXSIX_WHEEL_AWARDS[(wilds + cascadeIndex) % SIXSIXSIX_WHEEL_AWARDS.length] ?? 1;
}
function initialGrid(random, definition) {
  if (definition.independentCells) {
    return Array.from({ length: definition.columns * definition.rows }, (_unused, index2) => {
      const column = index2 % definition.columns;
      const strip = definition.reelStrips[column];
      if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
      return strip[random.int(strip.length)] ?? strip[0] ?? "wild";
    });
  }
  const stops = [];
  for (let column = 0; column < definition.columns; column += 1) {
    const strip = definition.reelStrips[column];
    if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
    stops.push(random.int(strip.length));
  }
  return Array.from({ length: definition.columns * definition.rows }, (_unused, index2) => {
    const row = Math.floor(index2 / definition.columns);
    const column = index2 % definition.columns;
    const strip = definition.reelStrips[column];
    if (!strip?.length) throw new Error(`Missing reel strip ${column}`);
    return strip[((stops[column] ?? 0) + row) % strip.length] ?? strip[0] ?? "wild";
  });
}
function winsFor(reels, definition) {
  return definition.payingSymbols.flatMap((symbol) => {
    const positions = reels.flatMap((candidate, index2) => candidate === symbol ? [index2] : []);
    const pay = payoutAt(definition.symbolPaytables?.[symbol] ?? definition.paytable, positions.length);
    return pay > 0 ? [{ symbol, positions, pay }] : [];
  });
}
var LEGACY_MIDAS_DEFINITION = {
  ...FAIR_SLOT_DEFINITIONS["midas-feast"],
  reelStrips: strips(weightedStrip([
    { symbol: "midas", weight: 1 },
    ...FAIR_SLOT_SYMBOL_WEIGHTS["midas-feast"].filter(({ symbol }) => ["grapes", "amphora", "coin", "laurel", "feast", "wild"].includes(symbol))
  ]), 6, 7),
  payingSymbols: ["grapes", "amphora", "coin", "laurel", "feast", "wild"],
  calibration: 0.022332841081829487,
  independentCells: false
};
function resolveFairSlot(random, gameId, midasMathVersion) {
  const definition = gameId === "midas-feast" && midasMathVersion === "legacy" ? LEGACY_MIDAS_DEFINITION : FAIR_SLOT_DEFINITIONS[gameId];
  const reels = initialGrid(random, definition);
  const bonusCount = reels.filter((symbol) => symbol === definition.bonusSymbol).length;
  const bonusTriggered = bonusCount >= definition.bonusThreshold;
  const bonusPay = bonusTriggered ? payoutAt(definition.bonusPaytable, bonusCount) : 0;
  let current = reels;
  let rawWin = bonusPay;
  let firstWinningSymbol = "";
  let firstWinningPositions = [];
  const cascades = [];
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
      featureCharge: Math.min(100, Math.round((cascadeIndex + 1) / definition.maxCascades * 100)),
      goldenPositions: removed.filter((_position, index2) => index2 % 3 === cascadeIndex % 3),
      multiplier: quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, cascadeWin * effectMultiplier * definition.calibration))
    });
  }
  const multiplier = quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, rawWin * definition.calibration));
  return {
    multiplier,
    outcome: {
      kind: "reels",
      theme: gameId,
      ...gameId === "midas-feast" && midasMathVersion !== "legacy" ? { mathVersion: "midas-grid-v2" } : {},
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
      winTier: multiplier >= 20 ? "legendary" : multiplier >= 10 ? "epic" : multiplier >= 5 ? "big" : multiplier > 0 ? "win" : "none",
      winRule: "Eight or more matching symbols anywhere pay; winners break and remaining symbols cascade.",
      rawWin,
      finalReels: current
    }
  };
}
var FAIR_SLOT_MAX_MULTIPLIERS = Object.fromEntries(
  Object.entries(FAIR_SLOT_DEFINITIONS).map(([gameId, definition]) => {
    const cells = definition.columns * definition.rows;
    const maximumPayForCount = (count) => Math.max(
      payoutAt(definition.paytable, count),
      ...definition.payingSymbols.map(
        (symbol) => payoutAt(definition.symbolPaytables?.[symbol] ?? definition.paytable, count)
      )
    );
    const maximumCascadePay = maximumPayForCount(cells);
    const maximumInitialPay = Math.max(
      maximumCascadePay,
      ...Array.from({ length: cells - definition.bonusThreshold + 1 }, (_unused, index2) => {
        const bonusCount = definition.bonusThreshold + index2;
        return payoutAt(definition.bonusPaytable, bonusCount) + maximumPayForCount(cells - bonusCount);
      })
    );
    const maximumRawWin = maximumInitialPay + maximumCascadePay * (definition.maxCascades - 1);
    return [
      gameId,
      quantizeSlotMultiplier(Math.min(SLOT_MAX_SETTLED_MULTIPLIER, maximumRawWin * definition.calibration))
    ];
  })
);

// packages/fairness-core/src/sweet-bonanza-2500.ts
var SWEET_BONANZA_COLUMNS = 6;
var SWEET_BONANZA_ROWS = 5;
var SWEET_BONANZA_CELLS = SWEET_BONANZA_COLUMNS * SWEET_BONANZA_ROWS;
var SWEET_BONANZA_MIN_MATCH = 8;
var SWEET_BONANZA_MAX_TUMBLES = 12;
var SWEET_BONANZA_MAX_FREE_SPINS = 50;
var SWEET_BONANZA_MAX_WIN = 25e3;
var SWEET_BONANZA_PLACEHOLDER_MATH = {
  symbols: [
    { symbol: "purple", weight: 18 },
    { symbol: "blue", weight: 17 },
    { symbol: "green", weight: 16 },
    { symbol: "heart", weight: 15 },
    { symbol: "grapes", weight: 12 },
    { symbol: "melon", weight: 10 },
    { symbol: "apple", weight: 8 },
    { symbol: "banana", weight: 7 },
    { symbol: "plum", weight: 6 },
    { symbol: "scatter", weight: 2 }
  ],
  paytable: {
    purple: [0.25, 0.5, 1, 2, 4],
    blue: [0.3, 0.6, 1.2, 2.4, 5],
    green: [0.35, 0.7, 1.4, 2.8, 6],
    heart: [0.4, 0.8, 1.6, 3.2, 8],
    grapes: [0.5, 1, 2, 4, 10],
    melon: [0.6, 1.2, 2.4, 5, 12],
    apple: [0.8, 1.6, 3.2, 7, 16],
    banana: [1, 2, 4, 10, 24],
    plum: [1.2, 2.5, 5, 12, 30]
  },
  bombChancePercent: 28,
  bombsPerLanding: 3,
  bombWeights: [
    { value: 2, weight: 28 },
    { value: 3, weight: 22 },
    { value: 5, weight: 18 },
    { value: 10, weight: 12 },
    { value: 25, weight: 8 },
    { value: 50, weight: 5 },
    { value: 100, weight: 3 },
    { value: 250, weight: 2 },
    { value: 500, weight: 1 },
    { value: 2500, weight: 1 }
  ]
};
function roundSlot2(value) {
  return Math.round(value * 1e4) / 1e4;
}
function weighted2(random, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(total);
  for (const entry of entries) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  throw new Error("Sweet Bonanza weighted selection failed");
}
function drawRegular(random) {
  return weighted2(
    random,
    SWEET_BONANZA_PLACEHOLDER_MATH.symbols.map((entry) => ({ value: entry.symbol, weight: entry.weight }))
  );
}
function sweetBonanzaPayout(symbol, count) {
  if (count < SWEET_BONANZA_MIN_MATCH) return 0;
  const tier = count >= 20 ? 4 : count >= 15 ? 3 : count >= 12 ? 2 : count >= 10 ? 1 : 0;
  return SWEET_BONANZA_PLACEHOLDER_MATH.paytable[symbol][tier];
}
function findSweetBonanzaWins(grid) {
  if (grid.length !== SWEET_BONANZA_CELLS) throw new Error("Sweet Bonanza grid must contain 30 cells");
  return Object.keys(SWEET_BONANZA_PLACEHOLDER_MATH.paytable).flatMap(
    (symbol) => {
      const positions = grid.flatMap((cell, position) => cell === symbol ? [position] : []);
      const payout = sweetBonanzaPayout(symbol, positions.length);
      return payout > 0 ? [{ symbol, positions, count: positions.length, payout }] : [];
    }
  );
}
function drawBomb(random) {
  return weighted2(random, SWEET_BONANZA_PLACEHOLDER_MATH.bombWeights);
}
function applySweetBonanzaGravity(grid, removedPositions, random, bonus) {
  const removed = new Set(removedPositions);
  const nextGrid = Array(SWEET_BONANZA_CELLS);
  const drops = [];
  const newCells = [];
  const bombs = [];
  let bombsRemaining = bonus && random.int(100) < SWEET_BONANZA_PLACEHOLDER_MATH.bombChancePercent ? 1 + random.int(SWEET_BONANZA_PLACEHOLDER_MATH.bombsPerLanding) : 0;
  for (let column = 0; column < SWEET_BONANZA_COLUMNS; column += 1) {
    const survivors = [];
    for (let row = SWEET_BONANZA_ROWS - 1; row >= 0; row -= 1) {
      const position = row * SWEET_BONANZA_COLUMNS + column;
      const symbol = grid[position];
      if (!removed.has(position) && symbol && symbol !== "bomb") survivors.push({ from: position, symbol });
    }
    let targetRow = SWEET_BONANZA_ROWS - 1;
    for (const survivor of survivors) {
      const to = targetRow * SWEET_BONANZA_COLUMNS + column;
      nextGrid[to] = survivor.symbol;
      if (survivor.from !== to) drops.push({ from: survivor.from, to });
      targetRow -= 1;
    }
    while (targetRow >= 0) {
      const position = targetRow * SWEET_BONANZA_COLUMNS + column;
      if (bombsRemaining > 0) {
        const multiplier = drawBomb(random);
        nextGrid[position] = "bomb";
        bombs.push({ position, value: multiplier });
        newCells.push({ position, symbol: "bomb", multiplier });
        bombsRemaining -= 1;
      } else {
        const symbol = drawRegular(random);
        nextGrid[position] = symbol;
        newCells.push({ position, symbol });
      }
      targetRow -= 1;
    }
  }
  return { nextGrid, drops, newCells, bombs };
}
function forceFeatureScatters(grid) {
  for (const position of [3, 10, 19, 26]) grid[position] = "scatter";
}
function resolveSweetBonanzaSpin(random, options = {}) {
  const initialGrid2 = Array.from({ length: SWEET_BONANZA_CELLS }, () => drawRegular(random));
  if (options.forceFeature) forceFeatureScatters(initialGrid2);
  let grid = initialGrid2;
  let totalWin = 0;
  let scatterCount2 = grid.filter((symbol) => symbol === "scatter").length;
  const tumbles = [];
  for (let index2 = 0; index2 < SWEET_BONANZA_MAX_TUMBLES; index2 += 1) {
    const wins = findSweetBonanzaWins(grid);
    if (wins.length === 0) break;
    const removedPositions = [...new Set(wins.flatMap((win2) => win2.positions))].sort((a, b) => a - b);
    const baseWin = roundSlot2(wins.reduce((sum, win2) => sum + win2.payout, 0));
    const gravity = applySweetBonanzaGravity(grid, removedPositions, random, options.bonus === true);
    const multiplier = gravity.bombs.reduce((sum, bomb) => sum + bomb.value, 0) || 1;
    const win = roundSlot2(baseWin * multiplier);
    tumbles.push({ index: index2, grid, wins, removedPositions, baseWin, multiplier, win, ...gravity });
    totalWin = roundSlot2(totalWin + win);
    grid = gravity.nextGrid;
    scatterCount2 = Math.max(scatterCount2, grid.filter((symbol) => symbol === "scatter").length);
  }
  return { initialGrid: initialGrid2, scatterCount: scatterCount2, tumbles, win: totalWin };
}
function resolveSweetBonanza2500(random, action) {
  const forceFeature = action.includes("feature");
  const baseSpin = resolveSweetBonanzaSpin(random, { forceFeature });
  const bonusTriggered = baseSpin.scatterCount >= 4;
  let awarded = bonusTriggered ? 10 : 0;
  let bonusWin = 0;
  const spins = [];
  for (let index2 = 0; index2 < awarded && index2 < SWEET_BONANZA_MAX_FREE_SPINS; index2 += 1) {
    const spin = resolveSweetBonanzaSpin(random, { bonus: true });
    const retriggered = spin.scatterCount >= 3 ? 5 : 0;
    awarded = Math.min(SWEET_BONANZA_MAX_FREE_SPINS, awarded + retriggered);
    bonusWin = roundSlot2(bonusWin + spin.win);
    spins.push({ index: index2, retriggered, ...spin });
    if (baseSpin.win + bonusWin >= SWEET_BONANZA_MAX_WIN) break;
  }
  const rawTotal = roundSlot2(baseSpin.win + bonusWin);
  const finalMultiplier = roundSlot2(Math.min(SWEET_BONANZA_MAX_WIN, rawTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "sweet-bonanza-2500",
      version: 1,
      action,
      baseSpin,
      bonusTriggered,
      freeSpins: { awarded, played: spins.length, win: bonusWin, spins },
      rawTotal,
      uncappedMultiplier: rawTotal,
      maxWinCap: SWEET_BONANZA_MAX_WIN,
      mathStatus: "provisional-demo-only",
      presentation: { presentationMs: Math.min(45e3, 1400 + baseSpin.tumbles.length * 1050 + spins.length * 220) }
    }
  };
}

// packages/fairness-core/src/wanted-dead-or-wild.ts
var WANTED_MAX_WIN = 12500;
var WANTED_PAYLINES = [
  [2, 2, 2, 2, 2],
  [1, 1, 1, 1, 1],
  [3, 3, 3, 3, 3],
  [0, 0, 0, 0, 0],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [0, 1, 0, 1, 0],
  [4, 3, 4, 3, 4],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [1, 0, 1, 0, 1],
  [3, 4, 3, 4, 3]
];
var WANTED_DUEL_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 25, 50, 100];
var WANTED_COLLECT_MULTIPLIERS = [1, 2, 3, 5, 10];
var WANTED_PAYTABLE = {
  "10": { 3: 0.1, 4: 0.5, 5: 1 },
  J: { 3: 0.1, 4: 0.5, 5: 1 },
  Q: { 3: 0.1, 4: 0.5, 5: 1 },
  K: { 3: 0.1, 4: 0.5, 5: 1 },
  A: { 3: 0.1, 4: 0.5, 5: 1 },
  boot: { 3: 0.5, 4: 2.5, 5: 5 },
  skull: { 3: 0.5, 4: 2.5, 5: 5 },
  bottle: { 3: 1, 4: 5, 5: 10 },
  money: { 3: 1, 4: 5, 5: 10 },
  cylinder: { 3: 2, 4: 10, 5: 20 },
  wild: { 5: 20 },
  train: {},
  duel: {},
  dead: {},
  vs: {},
  collect: {}
};
var WANTED_PROVISIONAL_MODEL = {
  base: [
    "10",
    "10",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "A",
    "boot",
    "boot",
    "boot",
    "skull",
    "skull",
    "skull",
    "bottle",
    "bottle",
    "money",
    "money",
    "cylinder",
    "wild",
    "wild",
    "train",
    "duel",
    "dead",
    "vs"
  ],
  duel: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild",
    "vs",
    "vs",
    "vs",
    "vs"
  ],
  train: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild",
    "wild",
    "wild"
  ],
  showdown: [
    "10",
    "10",
    "J",
    "J",
    "Q",
    "Q",
    "K",
    "K",
    "A",
    "A",
    "boot",
    "boot",
    "skull",
    "skull",
    "bottle",
    "money",
    "cylinder",
    "wild"
  ]
};
function wantedCostMultiplierForAction(action) {
  if (action === "feature:train") return 80;
  if (action === "feature:duel") return 200;
  if (action === "feature:dead") return 400;
  return 1;
}
var round = (value) => Math.round(value * 100) / 100;
var capWantedMultiplier = (value) => Math.min(WANTED_MAX_WIN, Math.max(0, round(value)));
var isScatter = (symbol) => symbol === "train" || symbol === "duel" || symbol === "dead";
var isSpecial = (symbol) => isScatter(symbol) || symbol === "vs" || symbol === "collect";
function drawGrid2(random, symbols = WANTED_PROVISIONAL_MODEL.base) {
  return Array.from({ length: 25 }, () => symbols[random.int(symbols.length)] ?? "10");
}
function evaluateWantedLines(grid, vsReels = []) {
  const wins = [];
  const vsByReel = new Map(vsReels.map((entry) => [entry.reel, entry.multiplier]));
  WANTED_PAYLINES.forEach((rows, line) => {
    const positions = rows.map((row, reel) => row * 5 + reel);
    const sequence = positions.map((position) => grid[position] ?? "10");
    const target = sequence.find((symbol) => symbol !== "wild") ?? "wild";
    if (isSpecial(target)) return;
    let count = 0;
    for (const symbol of sequence) {
      if (symbol !== target && symbol !== "wild") break;
      count += 1;
    }
    const baseMultiplier = WANTED_PAYTABLE[target][count] ?? 0;
    if (baseMultiplier <= 0) return;
    const contributingVsReels = positions.slice(0, count).map((position) => position % 5).filter((reel) => vsByReel.has(reel));
    const appliedMultiplier = contributingVsReels.length ? contributingVsReels.reduce((sum, reel) => sum + (vsByReel.get(reel) ?? 0), 0) : 1;
    wins.push({
      line: line + 1,
      symbol: target,
      count,
      positions: positions.slice(0, count),
      baseMultiplier,
      appliedMultiplier,
      contributingVsReels,
      multiplier: round(baseMultiplier * appliedMultiplier)
    });
  });
  return wins;
}
var winTotal = (wins) => round(wins.reduce((sum, win) => sum + win.multiplier, 0));
function expandReels(grid, reels) {
  const expanded = [...grid];
  for (const reel of reels) for (let row = 0; row < 5; row += 1) expanded[row * 5 + reel] = "wild";
  return expanded;
}
function qualifyingWantedVsReels(grid) {
  const candidates = [...new Set(grid.flatMap((symbol, position) => symbol === "vs" ? [position % 5] : []))].sort();
  if (!candidates.length) return [];
  let qualifying = candidates;
  while (qualifying.length) {
    const expanded = expandReels(grid, qualifying);
    const used = new Set(evaluateWantedLines(expanded).flatMap((win) => win.positions.map((position) => position % 5)));
    const next = qualifying.filter((reel) => used.has(reel));
    if (next.length === qualifying.length) return next;
    qualifying = next;
  }
  return [];
}
function duelCards(random) {
  return [
    WANTED_DUEL_MULTIPLIERS[random.int(WANTED_DUEL_MULTIPLIERS.length)] ?? 2,
    WANTED_DUEL_MULTIPLIERS[random.int(WANTED_DUEL_MULTIPLIERS.length)] ?? 2
  ];
}
function resolveWantedVs(grid, random) {
  const reels = qualifyingWantedVsReels(grid);
  const vsReels = reels.map((reel) => {
    const cards2 = duelCards(random);
    const survivor = random.int(2);
    return { reel, cards: cards2, survivor, multiplier: cards2[survivor] };
  });
  const expanded = expandReels(grid, reels);
  return { grid: [...grid], wins: evaluateWantedLines(expanded, vsReels), vsReels };
}
function triggeredWantedFeatures(grid) {
  const counts = { train: 0, duel: 0, dead: 0 };
  for (const symbol of grid) if (isScatter(symbol)) counts[symbol] += 1;
  return ["dead", "duel", "train"].filter((feature) => counts[feature] >= 3);
}
function trainFeature(random) {
  const sticky = /* @__PURE__ */ new Set();
  return Array.from({ length: 10 }, (_unused, index2) => {
    const grid = drawGrid2(random, WANTED_PROVISIONAL_MODEL.train);
    grid.forEach((symbol, position) => {
      if (symbol === "wild") sticky.add(position);
    });
    for (const position of sticky) grid[position] = "wild";
    const wins = evaluateWantedLines(grid);
    return { index: index2 + 1, grid, wins, multiplier: winTotal(wins), stickyWilds: [...sticky].sort((a, b) => a - b) };
  });
}
function duelFeature(random) {
  return Array.from({ length: 10 }, (_unused, index2) => {
    const resolved = resolveWantedVs(drawGrid2(random, WANTED_PROVISIONAL_MODEL.duel), random);
    return {
      index: index2 + 1,
      grid: resolved.grid,
      wins: resolved.wins,
      multiplier: winTotal(resolved.wins),
      vsReels: resolved.vsReels
    };
  });
}
function deadFeature(random) {
  const collected = /* @__PURE__ */ new Set();
  const spins = [];
  let collectedMultiplier = 1;
  let remaining = 3;
  let index2 = 0;
  while (remaining > 0) {
    index2 += 1;
    if (index2 > 100) throw new Error("Dead Man collect phase exceeded deterministic safety bound");
    const grid = drawGrid2(random, WANTED_PROVISIONAL_MODEL.showdown);
    const newWilds = [];
    const newMultipliers = [];
    for (let position = 0; position < 25; position += 1) {
      if (!collected.has(position) && random.int(16) === 0) {
        collected.add(position);
        newWilds.push(position);
      }
    }
    if (random.int(5) === 0) {
      const value = WANTED_COLLECT_MULTIPLIERS[random.int(WANTED_COLLECT_MULTIPLIERS.length)] ?? 1;
      newMultipliers.push(value);
      collectedMultiplier += value;
    }
    if (index2 === 1 && collected.size === 0 && newMultipliers.length === 0) {
      const position = random.int(25);
      collected.add(position);
      newWilds.push(position);
    }
    remaining = newWilds.length || newMultipliers.length ? 3 : remaining - 1;
    for (const position of collected) grid[position] = "money";
    for (let item = 0; item < newMultipliers.length; item += 1) {
      const slot = (random.int(25) + item) % 25;
      if (!collected.has(slot)) grid[slot] = "collect";
    }
    spins.push({
      index: index2,
      grid,
      wins: [],
      multiplier: 0,
      collected: [...collected].sort((a, b) => a - b),
      newWilds,
      newMultipliers,
      collectedMultiplier,
      respinsRemaining: remaining,
      phase: "collect"
    });
  }
  for (let showdown = 1; showdown <= 3; showdown += 1) {
    const grid = drawGrid2(random, WANTED_PROVISIONAL_MODEL.showdown);
    for (const position of collected) grid[position] = "wild";
    const wins = evaluateWantedLines(grid).map((win) => ({
      ...win,
      appliedMultiplier: round(win.appliedMultiplier * collectedMultiplier),
      multiplier: round(win.multiplier * collectedMultiplier)
    }));
    spins.push({
      index: showdown,
      grid,
      wins,
      multiplier: winTotal(wins),
      collected: [...collected].sort((a, b) => a - b),
      collectedMultiplier,
      respinsRemaining: 3 - showdown,
      phase: "showdown"
    });
  }
  return spins;
}
function featureSpins(random, feature) {
  if (feature === "train") return trainFeature(random);
  if (feature === "duel") return duelFeature(random);
  return deadFeature(random);
}
function resolveWantedDeadOrWild(random, action = "spin") {
  const rawGrid = drawGrid2(random);
  const featurePriority = triggeredWantedFeatures(rawGrid);
  const base = resolveWantedVs(rawGrid, random);
  const requested = /^feature:(train|duel|dead)$/.exec(action)?.[1];
  const feature = requested ?? featurePriority[0] ?? null;
  const spins = feature ? featureSpins(random, feature) : [];
  const baseMultiplier = winTotal(base.wins);
  const featureMultiplier = round(spins.reduce((sum, spin) => sum + spin.multiplier, 0));
  const totalMultiplier = capWantedMultiplier(baseMultiplier + featureMultiplier);
  return {
    kind: "wanted-dead-or-wild",
    grid: base.grid,
    wins: base.wins,
    vsReels: base.vsReels,
    feature,
    featureSpins: spins,
    featurePriority,
    baseMultiplier,
    featureMultiplier,
    totalMultiplier,
    maxWin: WANTED_MAX_WIN,
    paylineCount: 15,
    columns: 5,
    rows: 5
  };
}

// packages/fairness-core/src/witch-blood.ts
var WITCH_BLOOD_SYMBOLS = [
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
];
var PAY_SYMBOLS = WITCH_BLOOD_SYMBOLS.filter(
  (symbol) => symbol !== "wild" && symbol !== "scatter"
);
var PAYTABLE = {
  rune: { 3: 3e-3, 4: 6e-3, 5: 0.012, 6: 0.024 },
  potion: { 3: 4e-3, 4: 8e-3, 5: 0.016, 6: 0.032 },
  lantern: { 3: 5e-3, 4: 0.01, 5: 0.02, 6: 0.04 },
  spellbook: { 3: 7e-3, 4: 0.014, 5: 0.028, 6: 0.056 },
  owl: { 3: 9e-3, 4: 0.018, 5: 0.036, 6: 0.072 },
  cat: { 3: 0.012, 4: 0.024, 5: 0.048, 6: 0.096 },
  amulet: { 3: 0.016, 4: 0.032, 5: 0.064, 6: 0.128 },
  "blood-moon": { 3: 0.022, 4: 0.044, 5: 0.088, 6: 0.176 }
};
var PAY_MIN_REELS = {
  rune: 6,
  potion: 6,
  lantern: 6,
  spellbook: 6,
  owl: 6,
  cat: 6,
  amulet: 6,
  "blood-moon": 6
};
var BASE_POOL = [
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
var SCATTER_DENOMINATOR = 96;
var WILD_DENOMINATOR = 4096;
var WITCH_BLOOD_MAX_TUMBLES = 5;
var WITCH_BLOOD_MAX_FREE_SPINS = 30;
var WITCH_BLOOD_MAX_MULTIPLIER = SLOT_MAX_SETTLED_MULTIPLIER;
var WITCH_BLOOD_PAYOUT_SCALE = 5.184;
function round2(value) {
  return Math.round(value * 1e6) / 1e6;
}
function cloneCell(cell) {
  return { ...cell };
}
function cloneBoard(board2) {
  return {
    reelHeights: [...board2.reelHeights],
    main: board2.main.map((reel) => reel.map(cloneCell)),
    top: board2.top.map(cloneCell),
    ways: board2.ways
  };
}
function makeCell(random, ids, reel, options = {}) {
  const wildEligible = reel !== 0 || options.top === true;
  const symbol = options.symbol ?? (random.int(SCATTER_DENOMINATOR) === 0 ? "scatter" : wildEligible && random.int(WILD_DENOMINATOR) === 0 ? "wild" : random.pick(BASE_POOL));
  const cell = { id: ids.value, symbol, wildCharge: 0, spawned: false };
  ids.value += 1;
  return cell;
}
function witchBloodWays(reelHeights) {
  if (reelHeights.length !== 6 || reelHeights.some((height) => !Number.isSafeInteger(height) || height < 2 || height > 7)) {
    throw new Error("Witch Blood requires six reel heights between 2 and 7");
  }
  return reelHeights.reduce((ways, height, reel) => ways * (height + (reel >= 1 && reel <= 4 ? 1 : 0)), 1);
}
function witchBloodFreeSpins(scatterCount2) {
  if (scatterCount2 >= 6) return 30;
  if (scatterCount2 === 5) return 20;
  if (scatterCount2 === 4) return 15;
  if (scatterCount2 === 3) return 10;
  return 0;
}
function witchBloodScatterMultiplier(scatterCount2) {
  if (scatterCount2 >= 6) return 5;
  if (scatterCount2 === 5) return 2;
  if (scatterCount2 === 4) return 1;
  if (scatterCount2 === 3) return 0.5;
  if (scatterCount2 === 2) return 0.1;
  return 0;
}
function witchBloodExplosionBoost(explodingWilds) {
  if (explodingWilds >= 3) return 4;
  if (explodingWilds === 2) return 2;
  if (explodingWilds === 1) return 1;
  return 0;
}
function witchBloodRetrigger(scatterCount2, alreadyScheduled) {
  if (scatterCount2 < 3) return 0;
  return Math.max(0, Math.min(3, WITCH_BLOOD_MAX_FREE_SPINS - alreadyScheduled));
}
function witchBloodNextFeatureMultiplier(current, explodingWilds) {
  return current + 1 + witchBloodExplosionBoost(explodingWilds);
}
function capWitchBloodMultiplier(multiplier) {
  return Math.min(WITCH_BLOOD_MAX_MULTIPLIER, Math.max(0, round2(multiplier)));
}
function boardReels(board2) {
  return board2.main.map((reel, index2) => {
    if (index2 < 1 || index2 > 4) return reel;
    const topCell = board2.top[index2 - 1];
    return topCell ? [...reel, topCell] : reel;
  });
}
function evaluateWitchBloodWaysWins(board2) {
  const reels = boardReels(board2);
  const wins = [];
  for (const symbol of PAY_SYMBOLS) {
    const matchesByReel = [];
    for (const reel of reels) {
      const matches = reel.filter((cell) => cell.symbol === symbol || cell.symbol === "wild");
      if (matches.length === 0) break;
      matchesByReel.push(matches);
    }
    if (matchesByReel.length < PAY_MIN_REELS[symbol]) continue;
    const reelCount = matchesByReel.length;
    const ways = matchesByReel.reduce((product, matches) => product * matches.length, 1);
    const rate = round2((PAYTABLE[symbol][reelCount] ?? 0) * WITCH_BLOOD_PAYOUT_SCALE);
    const positions = matchesByReel.flat();
    wins.push({
      symbol,
      reelCount,
      ways,
      rate,
      multiplier: round2(ways * rate),
      positionIds: [...new Set(positions.map((cell) => cell.id))],
      contributingWildIds: [...new Set(positions.filter((cell) => cell.symbol === "wild").map((cell) => cell.id))]
    });
  }
  return wins;
}
function chargeWitchBloodWilds(board2, contributingWildIds) {
  const contributing = new Set(contributingWildIds);
  const explodedIds = [];
  const charge = (cell) => {
    if (cell.symbol !== "wild" || !contributing.has(cell.id)) return cloneCell(cell);
    const wildCharge = Math.min(3, cell.wildCharge + 1);
    if (wildCharge === 3) explodedIds.push(cell.id);
    return { ...cell, wildCharge };
  };
  return {
    board: {
      reelHeights: [...board2.reelHeights],
      main: board2.main.map((reel) => reel.map(charge)),
      top: board2.top.map(charge),
      ways: board2.ways
    },
    explodedIds: [...new Set(explodedIds)]
  };
}
function applyWitchBloodGravity(board2, removedIds, replacements) {
  const removed = new Set(removedIds);
  const main2 = board2.main.map((reel, index2) => {
    const survivors = reel.filter((cell) => !removed.has(cell.id)).map(cloneCell);
    const refill = replacements.main[index2]?.map(cloneCell) ?? [];
    if (survivors.length + refill.length !== reel.length) {
      throw new Error(`Witch Blood reel ${index2 + 1} received an invalid refill`);
    }
    return [...refill, ...survivors];
  });
  const top = board2.top.map((cell, index2) => {
    if (!removed.has(cell.id)) return cloneCell(cell);
    const replacement = replacements.top[index2];
    if (!replacement) throw new Error(`Witch Blood top reel ${index2 + 1} is missing a refill`);
    return cloneCell(replacement);
  });
  return { reelHeights: [...board2.reelHeights], main: main2, top, ways: board2.ways };
}
function spawnWitchBloodWilds(board2, targetIds) {
  const targets = new Set(targetIds);
  const spawn = (cell) => targets.has(cell.id) ? { ...cell, symbol: "wild", wildCharge: 0, spawned: true } : cloneCell(cell);
  return {
    reelHeights: [...board2.reelHeights],
    main: board2.main.map((reel, index2) => reel.map((cell) => index2 === 0 ? cloneCell(cell) : spawn(cell))),
    top: board2.top.map(spawn),
    ways: board2.ways
  };
}
function createBoard(random, ids) {
  const reelHeights = Array.from({ length: 6 }, () => 2 + random.int(6));
  const main2 = reelHeights.map(
    (height, reel) => Array.from({ length: height ?? 2 }, () => makeCell(random, ids, reel))
  );
  const top = Array.from({ length: 4 }, (_, index2) => makeCell(random, ids, index2 + 1, { top: true }));
  return { reelHeights, main: main2, top, ways: witchBloodWays(reelHeights) };
}
function scatterCount(board2) {
  return boardReels(board2).flat().filter((cell) => cell.symbol === "scatter").length;
}
function scatterWin(board2, featureMultiplier) {
  const positions = boardReels(board2).flat().filter((cell) => cell.symbol === "scatter");
  const multiplier = round2(witchBloodScatterMultiplier(positions.length) * featureMultiplier);
  return multiplier > 0 ? { count: positions.length, multiplier, positionIds: positions.map((cell) => cell.id) } : void 0;
}
function refillBoard(board2, removedIds, random, ids) {
  const removed = new Set(removedIds);
  const refilledIds = [];
  const main2 = board2.main.map((reel, index2) => {
    const count = reel.filter((cell) => removed.has(cell.id)).length;
    return Array.from({ length: count }, () => {
      const cell = makeCell(random, ids, index2);
      refilledIds.push(cell.id);
      return cell;
    });
  });
  const top = board2.top.map((cell, index2) => {
    if (!removed.has(cell.id)) return void 0;
    const replacement = makeCell(random, ids, index2 + 1, { top: true });
    refilledIds.push(replacement.id);
    return replacement;
  });
  return { board: applyWitchBloodGravity(board2, removedIds, { main: main2, top }), refilledIds };
}
function spawnWitchBloodAfterExplosions(board2, explosions, random) {
  if (explosions === 0) return { board: cloneBoard(board2), spawnedIds: [] };
  const eligible = [
    ...board2.main.slice(1).flat().filter((cell) => cell.symbol !== "wild"),
    ...board2.top.filter((cell) => cell.symbol !== "wild")
  ];
  const requested = Array.from({ length: explosions }, () => 1 + random.int(3)).reduce((sum, count) => sum + count, 0);
  const spawnedIds = [];
  while (spawnedIds.length < Math.min(requested, eligible.length)) {
    const [cell] = eligible.splice(random.int(eligible.length), 1);
    if (cell) spawnedIds.push(cell.id);
  }
  return { board: spawnWitchBloodWilds(board2, spawnedIds), spawnedIds };
}
function simulateSpin(random, ids, featureMultiplierBefore, feature) {
  const initialBoard = createBoard(random, ids);
  let board2 = cloneBoard(initialBoard);
  let wins = evaluateWitchBloodWaysWins(board2);
  const evaluatedWins = wins;
  const evaluatedScatterWin = scatterWin(initialBoard, featureMultiplierBefore);
  const tumbles = [];
  let accumulatedMultiplier = evaluatedScatterWin?.multiplier ?? 0;
  let featureMultiplier = featureMultiplierBefore;
  for (let index2 = 0; wins.length > 0 && index2 < WITCH_BLOOD_MAX_TUMBLES; index2 += 1) {
    const winMultiplier = round2(wins.reduce((sum, win) => sum + win.multiplier, 0));
    const appliedMultiplier = round2(winMultiplier * featureMultiplier);
    accumulatedMultiplier = capWitchBloodMultiplier(accumulatedMultiplier + appliedMultiplier);
    const chargedIds = [...new Set(wins.flatMap((win) => win.contributingWildIds))];
    const charged = chargeWitchBloodWilds(board2, chargedIds);
    const regularWinningIds = wins.flatMap((win) => win.positionIds.filter((id) => !chargedIds.includes(id)));
    const removedIds = [.../* @__PURE__ */ new Set([...regularWinningIds, ...charged.explodedIds])];
    const refilled = refillBoard(charged.board, removedIds, random, ids);
    const spawned = spawnWitchBloodAfterExplosions(refilled.board, charged.explodedIds.length, random);
    const multiplierBoost = feature ? witchBloodExplosionBoost(charged.explodedIds.length) : 0;
    const featureMultiplierAfter = feature ? witchBloodNextFeatureMultiplier(featureMultiplier, charged.explodedIds.length) : featureMultiplier;
    const wildEvent = {
      chargedIds,
      explodedIds: charged.explodedIds,
      spawnedIds: spawned.spawnedIds,
      multiplierBoost
    };
    tumbles.push({
      index: index2,
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
    board2 = spawned.board;
    wins = evaluateWitchBloodWaysWins(board2);
  }
  return {
    initialBoard: cloneBoard(initialBoard),
    evaluatedWins,
    scatterCount: scatterCount(initialBoard),
    ...evaluatedScatterWin ? { scatterWin: evaluatedScatterWin } : {},
    ways: initialBoard.ways,
    tumbles,
    finalBoard: cloneBoard(board2),
    winMultiplier: capWitchBloodMultiplier(accumulatedMultiplier),
    featureMultiplierBefore,
    featureMultiplierAfter: featureMultiplier
  };
}
function createWitchBloodOutcome(random) {
  const ids = { value: 1 };
  const base = simulateSpin(random, ids, 1, false);
  const freeSpinsAwarded = witchBloodFreeSpins(base.scatterCount);
  const freeSpins = [];
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
  const multiplierChanges = freeSpins.flatMap(
    (freeSpin) => freeSpin.tumbles.map((tumble) => tumble.featureMultiplierAfter)
  );
  const outcome = {
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
    ...base.scatterWin ? { scatterWin: base.scatterWin } : {},
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

// packages/fairness-core/src/xmas-drop.ts
var XMAS_DROP_MAX_MULTIPLIER = 12500;
var XMAS_DROP_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [0, 0, 1, 0, 0],
  [4, 4, 3, 4, 4],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [1, 0, 0, 0, 1],
  [3, 4, 4, 4, 3],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [0, 1, 1, 1, 0],
  [4, 3, 3, 3, 4],
  [1, 1, 2, 1, 1],
  [3, 3, 2, 3, 3]
];
var XMAS_DROP_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 200];
var weights = [
  ["ten", 14],
  ["jack", 14],
  ["queen", 13],
  ["king", 12],
  ["ace", 11],
  ["candy", 9],
  ["stocking", 8],
  ["bell", 7],
  ["tree", 7],
  ["teddy", 6],
  ["gift", 5],
  ["santa", 4],
  ["scatter", 3]
];
var pays = {
  ten: [0.1, 0.25, 0.75],
  jack: [0.12, 0.3, 0.9],
  queen: [0.14, 0.35, 1],
  king: [0.16, 0.4, 1.2],
  ace: [0.18, 0.5, 1.5],
  candy: [0.22, 0.65, 1.8],
  stocking: [0.25, 0.75, 2.1],
  bell: [0.3, 0.9, 2.6],
  tree: [0.35, 1.1, 3],
  teddy: [0.5, 1.5, 4],
  gift: [0, 0, 0],
  santa: [0, 0, 0],
  scatter: [0, 0, 0]
};
function pick3(random) {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = random.int(total);
  for (const [symbol, weight] of weights) {
    if (ticket < weight) return symbol;
    ticket -= weight;
  }
  return "ten";
}
function cellAt2(grid, reel, row) {
  return grid.find((cell) => cell.reel === reel && cell.row === row);
}
var substitute = (cell) => cell?.symbol === "gift" || cell?.symbol === "santa";
function makeGrid2(random, feature, offset = 0, activated = /* @__PURE__ */ new Set(), minimumSantas = 0) {
  const grid = Array.from({ length: 25 }, (_, index2) => {
    const reel = Math.floor(index2 / 5);
    const row = index2 % 5;
    let symbol = pick3(random);
    if (feature === "night" && random.int(6) === 0) symbol = random.int(3) === 0 ? "gift" : "santa";
    return { id: offset + index2 + 1, symbol, reel, row, multiplier: 1, expanded: false };
  });
  const ensureSanta = (reel) => {
    const cells = grid.filter((cell) => cell.reel === reel);
    const existing = cells.filter((cell) => cell.symbol === "santa");
    for (const duplicate of existing.slice(1)) {
      const index2 = duplicate.id - offset - 1;
      grid[index2] = { ...duplicate, symbol: "teddy" };
    }
    if (!existing.length) {
      const index2 = reel * 5 + random.int(5);
      const cell = grid[index2];
      if (cell) {
        grid[index2] = { ...cell, symbol: "santa" };
      }
    }
  };
  for (const reel of activated) ensureSanta(reel);
  const reelsWithSanta = new Set(grid.filter((cell) => cell.symbol === "santa").map((cell) => cell.reel));
  for (let reel = 0; reel < 5 && reelsWithSanta.size < minimumSantas; reel++)
    if (!reelsWithSanta.has(reel)) {
      ensureSanta(reel);
      reelsWithSanta.add(reel);
    }
  for (let reel = 0; reel < 5; reel++) {
    const santas = grid.filter((cell) => cell.reel === reel && cell.symbol === "santa");
    for (const duplicate of santas.slice(1)) {
      const index2 = duplicate.id - offset - 1;
      grid[index2] = { ...duplicate, symbol: "teddy" };
    }
  }
  return grid;
}
function evaluateXmasDropWins(grid) {
  const wins = [];
  for (const payline of XMAS_DROP_PAYLINES) {
    const line = payline.map((row, reel) => cellAt2(grid, reel, row));
    const anchor = line.find((cell) => cell && !substitute(cell) && cell.symbol !== "scatter")?.symbol;
    if (!anchor) continue;
    const positions = [];
    const multipliers = [];
    for (const cell of line) {
      if (!cell || cell.symbol !== anchor && !substitute(cell)) break;
      positions.push(cell.id);
      if (cell.symbol === "santa" && cell.expanded && cell.multiplier > 1) multipliers.push(cell.multiplier);
    }
    if (positions.length < 3) continue;
    const wildMultiplier = multipliers.length ? multipliers.reduce((sum, value) => sum + value, 0) : 1;
    wins.push({
      symbol: anchor,
      positions,
      count: positions.length,
      wildMultiplier,
      multiplier: quantizeSlotMultiplier((pays[anchor][Math.min(2, positions.length - 3)] ?? 0) * wildMultiplier)
    });
  }
  return wins;
}
function expandXmasDropSantas(grid, random) {
  const original = grid.map((cell) => ({ ...cell, expanded: false, multiplier: 1 }));
  const candidates = original.filter((cell) => cell.symbol === "santa").map((santa) => {
    const covered = original.filter((cell) => cell.reel === santa.reel && cell.row >= santa.row);
    const gifts = covered.filter((cell) => cell.symbol === "gift");
    const multiplier = gifts.length ? gifts.reduce((sum) => sum + (XMAS_DROP_MULTIPLIERS[random.int(XMAS_DROP_MULTIPLIERS.length)] ?? 2), 0) : 1;
    return { santa, covered, gifts, multiplier };
  });
  const expanded = original.map((cell) => {
    const candidate = candidates.find((item) => item.covered.some((covered) => covered.id === cell.id));
    return candidate ? { ...cell, symbol: "santa", expanded: true, multiplier: candidate.multiplier } : cell;
  });
  const winningIds = new Set(evaluateXmasDropWins(expanded).flatMap((win) => win.positions));
  const active = candidates.filter((item) => item.covered.some((cell) => winningIds.has(cell.id)));
  const activeById = new Map(active.flatMap((item) => item.covered.map((cell) => [cell.id, item])));
  return {
    grid: original.map((cell) => {
      const item = activeById.get(cell.id);
      return item ? { ...cell, symbol: "santa", expanded: true, multiplier: item.multiplier } : cell;
    }),
    positions: [...activeById.keys()],
    crossedGifts: active.flatMap((item) => item.gifts.map((gift) => gift.id))
  };
}
function resolveGrid2(random, feature, offset, activated = /* @__PURE__ */ new Set(), minimumSantas = 0) {
  const initialGrid2 = makeGrid2(random, feature, offset, activated, minimumSantas);
  const landed = expandXmasDropSantas(initialGrid2, random);
  const wins = evaluateXmasDropWins(landed.grid);
  return {
    initialGrid: initialGrid2,
    grid: landed.grid,
    positions: landed.positions,
    crossedGifts: landed.crossedGifts,
    wins,
    multiplier: quantizeSlotMultiplier(wins.reduce((sum, win) => sum + win.multiplier, 0))
  };
}
function resolveXmasDrop(random, action = "spin") {
  const minimumSantas = action.includes("three-santas") ? 3 : action.includes("two-santas") ? 2 : 0;
  const base = resolveGrid2(random, "none", 0, /* @__PURE__ */ new Set(), minimumSantas);
  const scatterCount2 = base.initialGrid.filter((cell) => cell.symbol === "scatter").length;
  const forced = action.includes("force-night") ? "night" : action.includes("force-town") ? "town" : void 0;
  const feature = forced ?? (scatterCount2 >= 4 ? "town" : scatterCount2 === 3 ? "night" : "none");
  const featureSpins2 = [];
  let total = base.multiplier;
  if (feature !== "none") {
    let current = feature;
    let remaining = 10;
    let spin = 0;
    const activated = /* @__PURE__ */ new Set();
    while (remaining > 0 && spin < 50) {
      spin++;
      remaining--;
      const resolved = resolveGrid2(random, current, spin * 100, new Set(activated));
      const landedScatters = resolved.initialGrid.filter((cell) => cell.symbol === "scatter").length;
      if (current === "town") {
        for (const cell of resolved.initialGrid) if (cell.symbol === "santa") activated.add(cell.reel);
      }
      if (landedScatters >= 3) remaining += 4;
      if (current === "night" && landedScatters >= 4) {
        current = "town";
        if (remaining < 10) remaining = 10;
      }
      featureSpins2.push({
        spin,
        feature: current,
        initialGrid: resolved.initialGrid,
        grid: resolved.grid,
        expandedPositions: resolved.positions,
        crossedGifts: resolved.crossedGifts,
        activatedReels: [...activated].sort(),
        wins: resolved.wins,
        multiplier: resolved.multiplier
      });
      total += resolved.multiplier;
    }
  }
  total = Math.min(XMAS_DROP_MAX_MULTIPLIER, quantizeSlotMultiplier(total));
  return {
    multiplier: total,
    outcome: {
      kind: "xmas-drop",
      mathModel: "provisional-clean-room-v1",
      columns: 5,
      rows: 5,
      initialGrid: base.initialGrid,
      grid: base.grid,
      expandedPositions: base.positions,
      crossedGifts: base.crossedGifts,
      wins: base.wins,
      feature,
      featureSpins: featureSpins2,
      totalMultiplier: total,
      maxMultiplier: XMAS_DROP_MAX_MULTIPLIER,
      replacementNote: "Provisional deterministic demo weights and payouts; RTP calibration intentionally deferred."
    }
  };
}

// packages/fairness-core/src/index.ts
var FAIRNESS_VERSION = "replicate-fairness-v1";
var STAKE_CRASH_MAX_MULTIPLIER = 1e3;
var MINES_GRID_SIZES = GRID_SIZES;
var MINES_MAX_MULTIPLIER2 = MINES_MAX_MULTIPLIER;
function minesMultiplierFor(gridSize, mineCount, revealedCount) {
  return multiplierFor({ gridSize, mineCount, revealedCount });
}
var CHICKEN_RTP = 0.98;
var CHICKEN_PATHS = {
  easy: [1.03, 1.09, 1.15, 1.23, 1.31, 1.4, 1.51, 1.63, 1.78, 1.96, 2.18, 2.45, 2.8, 3.27, 3.92, 4.9, 6.53, 9.8, 19.6],
  medium: [1.15, 1.37, 1.64, 2, 2.46, 3.07, 3.91, 5.08, 6.77, 9.31, 13.3, 19.95, 31.92, 55.86, 111.72, 279.3, 1117.2],
  hard: [1.31, 1.77, 2.46, 3.48, 5.06, 7.59, 11.81, 19.18, 32.89, 60.29, 120.59, 271.32, 723.52, 2532.32, 15193.92],
  expert: [1.96, 4.14, 9.31, 22.61, 60.29, 180.88, 633.08, 2743.35, 16460.08, 181060.88]
};
var FLOOR_LAVA_RTP = 0.98;
function floorLavaProgress(difficulty, step) {
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const stagesPerLevel = config.safeCounts.length;
  const totalSteps = stagesPerLevel * config.levels;
  const boundedStep = Math.max(0, Math.min(totalSteps, Math.trunc(step)));
  const completedLevels = Math.floor(boundedStep / stagesPerLevel);
  const atTerminalStep = boundedStep === totalSteps;
  return {
    level: atTerminalStep ? config.levels : completedLevels + 1,
    stage: atTerminalStep ? stagesPerLevel : boundedStep % stagesPerLevel,
    levelComplete: boundedStep > 0 && boundedStep % stagesPerLevel === 0,
    totalSteps
  };
}
function floorLavaMultiplier(difficulty, step) {
  if (step < 1) return 0;
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const progress = floorLavaProgress(difficulty, step);
  if (step > progress.totalSteps) return 0;
  const stageIndex = (step - 1) % config.safeCounts.length;
  const safeCount = config.safeCounts[stageIndex];
  const finalSafeCount = config.safeCounts.at(-1);
  if (!safeCount || !finalSafeCount) return 0;
  const completedLevels = Math.floor((step - 1) / config.safeCounts.length);
  const cumulativeSurvivalProbability = safeCount / FLOOR_LAVA_STARTING_PLATFORMS * (finalSafeCount / FLOOR_LAVA_STARTING_PLATFORMS) ** completedLevels;
  return quantizeMultiplier(FLOOR_LAVA_RTP / cumulativeSurvivalProbability);
}
function floorLavaMaximumMultiplier(difficulty) {
  return floorLavaMultiplier(difficulty, floorLavaProgress(difficulty, Number.MAX_SAFE_INTEGER).totalSteps);
}
var FLOOR_LAVA_MAX_MULTIPLIER = Math.max(
  ...Object.keys(FLOOR_LAVA_DIFFICULTIES).map(floorLavaMaximumMultiplier)
);
function floorLavaAvailablePlatforms(difficulty, safeStages, clearedSteps) {
  const stagesPerLevel = FLOOR_LAVA_DIFFICULTIES[difficulty].safeCounts.length;
  if (clearedSteps === 0 || clearedSteps % stagesPerLevel === 0) {
    return Array.from({ length: FLOOR_LAVA_STARTING_PLATFORMS }, (_, index2) => index2);
  }
  return safeStages[clearedSteps - 1] ?? [];
}
function commitmentFor(serverSeed) {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)));
}
function equalHex(left, right) {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  let difference = 0;
  for (let index2 = 0; index2 < leftBytes.length; index2 += 1) {
    difference |= (leftBytes[index2] ?? 0) ^ (rightBytes[index2] ?? 0);
  }
  return difference === 0;
}
function hmacBlock(serverSeed, context, block) {
  const message = [
    FAIRNESS_VERSION,
    context.gameId,
    context.clientSeed,
    String(context.nonce),
    context.action,
    String(block)
  ].join("\0");
  return hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(message));
}
var FairRandom = class {
  #serverSeed;
  #context;
  #block = 0;
  #buffer = new Uint8Array(0);
  #offset = 0;
  constructor(serverSeed, context) {
    this.#serverSeed = serverSeed;
    this.#context = context;
  }
  #take(length) {
    while (this.#buffer.length - this.#offset < length) {
      const remainder = this.#buffer.subarray(this.#offset);
      this.#buffer = concatBytes(remainder, hmacBlock(this.#serverSeed, this.#context, this.#block));
      this.#offset = 0;
      this.#block += 1;
    }
    const value = this.#buffer.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }
  uint32() {
    const bytes = this.#take(4);
    return (bytes[0] ?? 0) * 16777216 + ((bytes[1] ?? 0) << 16) + ((bytes[2] ?? 0) << 8) + (bytes[3] ?? 0);
  }
  int(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 4294967296) {
      throw new Error("maxExclusive must be an integer between 1 and 2^32");
    }
    const rejectionLimit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
    let value = this.uint32();
    while (value >= rejectionLimit) value = this.uint32();
    return value % maxExclusive;
  }
  float() {
    const bytes = this.#take(6);
    let integer2 = 0;
    for (const byte of bytes) integer2 = integer2 * 256 + byte;
    return integer2 / 281474976710656;
  }
  pick(values) {
    if (values.length === 0) throw new Error("Cannot pick from an empty array");
    const value = values[this.int(values.length)];
    if (value === void 0) throw new Error("Random selection failed");
    return value;
  }
};
var GATES_SUPER_SCATTER_PAYTABLE = {
  blue: [0.25, 0.75, 2],
  green: [0.4, 0.9, 4],
  yellow: [0.5, 1, 5],
  purple: [0.8, 1.2, 8],
  red: [1, 1.5, 10],
  chalice: [1.5, 2, 12],
  ring: [2, 5, 15],
  hourglass: [2.5, 10, 25],
  crown: [10, 25, 50]
};
var GATES_SUPER_SCATTER_MAX_WIN = SLOT_MAX_SETTLED_MULTIPLIER;
var GATES_SUPER_SCATTER_MAX_TUMBLES = 64;
var GATES_SUPER_SCATTER_MAX_FREE_SPINS = 100;
var GATES_SUPER_SCATTER_RTP_CALIBRATION = 1;
function gatesSuperScatterCostMultiplierForAction(action) {
  if (action === "buy-free-spins") return 100;
  if (action === "buy-super-free-spins") return 500;
  if (action === "ante-spin") return 1.5;
  return 1;
}
function gatesSuperScatterRawCapForAction(action) {
  return GATES_SUPER_SCATTER_MAX_WIN * gatesSuperScatterCostMultiplierForAction(action);
}
var gatesWeightedSymbols = [
  { symbol: "blue", weight: 130 },
  { symbol: "green", weight: 125 },
  { symbol: "yellow", weight: 120 },
  { symbol: "purple", weight: 115 },
  { symbol: "red", weight: 110 },
  { symbol: "chalice", weight: 105 },
  { symbol: "ring", weight: 100 },
  { symbol: "hourglass", weight: 95 },
  { symbol: "crown", weight: 90 },
  { symbol: "scatter", weight: 25 },
  { symbol: "super-scatter", weight: 1 },
  { symbol: "multiplier", weight: 5 }
];
var gatesWeightedMultipliers = [
  { value: 2, weight: 5010 },
  { value: 3, weight: 2500 },
  { value: 4, weight: 1200 },
  { value: 5, weight: 600 },
  { value: 6, weight: 300 },
  { value: 8, weight: 150 },
  { value: 10, weight: 100 },
  { value: 12, weight: 50 },
  { value: 15, weight: 30 },
  { value: 20, weight: 20 },
  { value: 25, weight: 15 },
  { value: 50, weight: 10 },
  { value: 100, weight: 8 },
  { value: 250, weight: 5 },
  { value: 500, weight: 2 }
];
function roundedMultiplier(value) {
  return Math.round(value * 1e4) / 1e4;
}
function gatesWeightedSymbol(random, allowSuperScatter, ante = false) {
  const candidates = allowSuperScatter ? gatesWeightedSymbols : gatesWeightedSymbols.filter((entry) => entry.symbol !== "super-scatter");
  const weightFor = (entry) => ante && (entry.symbol === "scatter" || entry.symbol === "super-scatter") ? entry.weight * 2 : entry.weight;
  const totalWeight = candidates.reduce((sum, entry) => sum + weightFor(entry), 0);
  let cursor = random.int(totalWeight);
  for (const entry of candidates) {
    const weight = weightFor(entry);
    if (cursor < weight) return entry.symbol;
    cursor -= weight;
  }
  return "blue";
}
function gatesCell(random, allowSuperScatter, ante = false, minimumMultiplier = 2) {
  const symbol = gatesWeightedSymbol(random, allowSuperScatter, ante);
  if (symbol !== "multiplier") return { symbol };
  const totalWeight = gatesWeightedMultipliers.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.int(totalWeight);
  for (const entry of gatesWeightedMultipliers) {
    if (cursor < entry.weight) return { symbol, multiplier: Math.max(minimumMultiplier, entry.value) };
    cursor -= entry.weight;
  }
  return { symbol, multiplier: 2 };
}
function gatesGrid(random, allowSuperScatter, ante = false, minimumMultiplier = 2) {
  return Array.from({ length: 30 }, () => gatesCell(random, allowSuperScatter, ante, minimumMultiplier));
}
function gatesFeatureTriggerGrid(random, superFeature) {
  const grid = [...gatesGrid(random, true, false, superFeature ? 10 : 2)];
  const scatterCount2 = 4 + random.int(3);
  const available = Array.from({ length: 30 }, (_, index2) => index2);
  for (let index2 = 0; index2 < scatterCount2; index2 += 1) {
    const selected = random.int(available.length);
    const position = available.splice(selected, 1)[0] ?? index2;
    grid[position] = { symbol: superFeature && index2 === 0 ? "super-scatter" : "scatter" };
  }
  return grid;
}
function gatesSymbolPayout(symbol, count) {
  if (count < 8) return 0;
  const tier = count >= 12 ? 2 : count >= 10 ? 1 : 0;
  return GATES_SUPER_SCATTER_PAYTABLE[symbol][tier];
}
function gatesWins(grid) {
  return Object.keys(GATES_SUPER_SCATTER_PAYTABLE).flatMap((symbol) => {
    const positions = grid.flatMap((cell, index2) => cell.symbol === symbol ? [index2] : []);
    const payout = gatesSymbolPayout(symbol, positions.length);
    return payout > 0 ? [{ symbol, count: positions.length, payout, positions }] : [];
  });
}
function gatesTumbleSequence(random, initialGrid2, allowSuperScatter, ante = false, minimumMultiplier = 2) {
  let current = [...initialGrid2];
  const tumbles = [];
  let rawWin = 0;
  let multiplierSum = 0;
  for (let index2 = 0; index2 < GATES_SUPER_SCATTER_MAX_TUMBLES; index2 += 1) {
    const winningSymbols = gatesWins(current);
    if (winningSymbols.length === 0) break;
    const multiplierOrbs = current.flatMap(
      (cell, position) => cell.symbol === "multiplier" && typeof cell.multiplier === "number" ? [{ position, value: cell.multiplier }] : []
    );
    const removedPositions = [
      .../* @__PURE__ */ new Set([...winningSymbols.flatMap((win) => win.positions), ...multiplierOrbs.map((orb) => orb.position)])
    ].sort((left, right) => left - right);
    const tumbleWin = roundedMultiplier(winningSymbols.reduce((sum, win) => sum + win.payout, 0));
    rawWin = roundedMultiplier(rawWin + tumbleWin);
    multiplierSum += multiplierOrbs.reduce((sum, orb) => sum + orb.value, 0);
    const removed = new Set(removedPositions);
    const nextGrid = Array(30);
    const drops = [];
    const newPositions = [];
    for (let column = 0; column < 6; column += 1) {
      const survivors = Array.from({ length: 5 }, (_, row) => row * 6 + column).filter(
        (position) => !removed.has(position)
      );
      const refillCount = 5 - survivors.length;
      for (let row = 0; row < refillCount; row += 1) {
        const position = row * 6 + column;
        nextGrid[position] = gatesCell(random, allowSuperScatter, ante, minimumMultiplier);
        newPositions.push(position);
      }
      survivors.forEach((from, survivorIndex) => {
        const to = (refillCount + survivorIndex) * 6 + column;
        nextGrid[to] = current[from];
        drops.push({ from, to });
      });
    }
    tumbles.push({
      index: index2,
      grid: current,
      winningSymbols,
      removedPositions,
      rawWin: tumbleWin,
      multiplierOrbs,
      drops,
      newPositions,
      nextGrid
    });
    current = nextGrid;
  }
  return {
    initialGrid: initialGrid2,
    tumbles,
    finalGrid: current,
    rawWin,
    multiplierSum,
    totalWin: roundedMultiplier(rawWin * (multiplierSum > 0 ? multiplierSum : 1))
  };
}
function gatesScatterPayout(scatterCount2) {
  return scatterCount2 >= 6 ? 100 : scatterCount2 === 5 ? 5 : scatterCount2 === 4 ? 3 : 0;
}
function gatesSuperScatterPayout(superScatterCount) {
  return [0, 100, 500, 5e3, 5e4][Math.min(4, Math.max(0, superScatterCount))] ?? 0;
}
function resolveGatesSuperScatter(random, action = "spin") {
  const ante = action === "ante-spin";
  const boughtFeature = action === "buy-free-spins" || action === "buy-super-free-spins";
  const superFeature = action === "buy-super-free-spins";
  const minimumMultiplier = superFeature ? 10 : 2;
  const rawCap = gatesSuperScatterRawCapForAction(action);
  const initialGrid2 = boughtFeature ? gatesFeatureTriggerGrid(random, superFeature) : gatesGrid(random, true, ante, minimumMultiplier);
  const sequence = gatesTumbleSequence(random, initialGrid2, true, ante, minimumMultiplier);
  const regularScatterCount = initialGrid2.filter((cell) => cell.symbol === "scatter").length;
  const superScatterCount = initialGrid2.filter((cell) => cell.symbol === "super-scatter").length;
  const qualifyingScatterCount = regularScatterCount + superScatterCount;
  const bonusTriggered = qualifyingScatterCount >= 4;
  const scatterAward = bonusTriggered ? gatesScatterPayout(qualifyingScatterCount) : 0;
  const superScatterAward = bonusTriggered ? gatesSuperScatterPayout(superScatterCount) : 0;
  const freeSpinTranscripts = [];
  let awardedFreeSpins = bonusTriggered ? 15 : 0;
  let persistentMultiplier = 1;
  let bonusWin = 0;
  for (let spin = 0; spin < awardedFreeSpins && spin < GATES_SUPER_SCATTER_MAX_FREE_SPINS; spin += 1) {
    const freeInitialGrid = gatesGrid(random, false, false, minimumMultiplier);
    const freeSequence = gatesTumbleSequence(random, freeInitialGrid, false, false, minimumMultiplier);
    const freeScatterCount = freeInitialGrid.filter((cell) => cell.symbol === "scatter").length;
    const retriggeredSpins = freeScatterCount >= 3 ? 5 : 0;
    awardedFreeSpins = Math.min(GATES_SUPER_SCATTER_MAX_FREE_SPINS, awardedFreeSpins + retriggeredSpins);
    persistentMultiplier += freeSequence.multiplierSum;
    const freeScatterAward = gatesScatterPayout(freeScatterCount);
    const spinWin = roundedMultiplier(freeSequence.rawWin * persistentMultiplier + freeScatterAward);
    bonusWin = roundedMultiplier(bonusWin + spinWin);
    freeSpinTranscripts.push({
      spin: spin + 1,
      initialGrid: freeSequence.initialGrid,
      tumbles: freeSequence.tumbles,
      finalGrid: freeSequence.finalGrid,
      rawWin: freeSequence.rawWin,
      landedMultiplier: freeSequence.multiplierSum,
      totalMultiplier: persistentMultiplier,
      scatterCount: freeScatterCount,
      retriggeredSpins,
      win: spinWin
    });
    if (sequence.totalWin + scatterAward + superScatterAward + bonusWin >= rawCap) break;
  }
  const rawTotal = roundedMultiplier(sequence.totalWin + scatterAward + superScatterAward + bonusWin);
  const uncappedTotal = roundedMultiplier(rawTotal * GATES_SUPER_SCATTER_RTP_CALIBRATION);
  const finalMultiplier = quantizeSlotMultiplier(Math.min(rawCap, uncappedTotal));
  return {
    multiplier: finalMultiplier,
    outcome: {
      kind: "gates-super-scatter",
      action,
      ante,
      boughtFeature,
      superFeature,
      columns: 6,
      rows: 5,
      initialGrid: sequence.initialGrid,
      tumbles: sequence.tumbles,
      finalGrid: sequence.finalGrid,
      rawWin: sequence.rawWin,
      multiplierSum: sequence.multiplierSum,
      baseGameWin: sequence.totalWin,
      regularScatterCount,
      superScatterCount,
      qualifyingScatterCount,
      scatterAward,
      superScatterAward,
      bonusTriggered,
      bonus: {
        awardedSpins: awardedFreeSpins,
        playedSpins: freeSpinTranscripts.length,
        finalMultiplier: persistentMultiplier,
        win: bonusWin,
        spins: freeSpinTranscripts
      },
      rawTotal,
      rtpCalibration: GATES_SUPER_SCATTER_RTP_CALIBRATION,
      uncappedTotal,
      maxWinCap: rawCap,
      finalMultiplier
    }
  };
}
var MOLES_HOLE_COUNT = 7;
var MOLES_MIN_COUNT = 1;
var MOLES_MAX_COUNT = 6;
var MOLES_MAX_STEPS = 6;
var MOLES_RTP = 0.96;
function molesMultiplier(moles, step) {
  const count = Math.min(MOLES_MAX_COUNT, Math.max(MOLES_MIN_COUNT, Math.round(moles)));
  const completedSteps = Math.min(MOLES_MAX_STEPS, Math.max(0, Math.floor(step)));
  if (completedSteps === 0) return 0;
  return Math.floor((MOLES_RTP * (MOLES_HOLE_COUNT / count) ** completedSteps + Number.EPSILON) * 100) / 100;
}
var MOLES_MAX_MULTIPLIER = Math.max(
  ...Array.from(
    { length: MOLES_MAX_COUNT - MOLES_MIN_COUNT + 1 },
    (_, index2) => molesMultiplier(index2 + MOLES_MIN_COUNT, index2 + MOLES_MIN_COUNT)
  )
);
function molesCountFromAction(action) {
  const count = Number(action.match(/^start:([1-6])$/)?.[1]);
  if (!Number.isSafeInteger(count) || count < MOLES_MIN_COUNT || count > MOLES_MAX_COUNT) {
    throw new Error("Invalid Moles count");
  }
  return count;
}
function minesConfigurationFromAction(action) {
  const match = /^start:(25|36|49|64):(\d+)$/.exec(action);
  const gridSize = Number(match?.[1]);
  const mineCount = Number(match?.[2]);
  if (!MINES_GRID_SIZES.includes(gridSize) || !Number.isSafeInteger(mineCount) || mineCount < 1 || mineCount >= gridSize) {
    throw new Error("Invalid Midnight Mines configuration");
  }
  return { gridSize, mineCount };
}
function generateMinesLayout(serverSeed, context) {
  if (context.gameId !== "rainbet-mines") {
    throw new Error("Midnight Mines layout requires the rainbet-mines game ID");
  }
  const { gridSize, mineCount } = minesConfigurationFromAction(context.action);
  const random = new FairRandom(serverSeed, context);
  const positions = Array.from({ length: gridSize }, (_, index2) => index2);
  for (let index2 = positions.length - 1; index2 > 0; index2 -= 1) {
    const target = random.int(index2 + 1);
    const current = positions[index2];
    const replacement = positions[target];
    if (current === void 0 || replacement === void 0) throw new Error("Midnight Mines shuffle failed");
    positions[index2] = replacement;
    positions[target] = current;
  }
  return positions.slice(0, mineCount).sort((left, right) => left - right);
}
function generateMolesLayout(serverSeed, context) {
  if (context.gameId !== "moles") throw new Error("Moles layout requires the moles game ID");
  const count = molesCountFromAction(context.action);
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: MOLES_MAX_STEPS }, () => {
    const holes = Array.from({ length: MOLES_HOLE_COUNT }, (_, index2) => index2);
    for (let index2 = holes.length - 1; index2 > 0; index2 -= 1) {
      const swap = random.int(index2 + 1);
      const current = holes[index2];
      const replacement = holes[swap];
      if (current === void 0 || replacement === void 0) throw new Error("Moles shuffle failed");
      holes[index2] = replacement;
      holes[swap] = current;
    }
    return holes.slice(0, count).sort((left, right) => left - right);
  });
}
function isChickenDifficulty(value) {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert";
}
function chickenDifficultyFromAction(action) {
  const difficulty = action.match(/^start:(easy|medium|hard|expert)$/)?.[1] ?? action.match(/:difficulty:(easy|medium|hard|expert)(?::|$)/)?.[1];
  if (action.includes(":difficulty:") && difficulty === void 0) throw new Error("Invalid Chicken difficulty");
  return isChickenDifficulty(difficulty) ? difficulty : "medium";
}
function generateChickenPath(serverSeed, context) {
  if (context.gameId !== "chicken-cross") throw new Error("Chicken path requires the chicken-cross game ID");
  const difficulty = chickenDifficultyFromAction(context.action);
  const multipliers = CHICKEN_PATHS[difficulty];
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  return multipliers.map((multiplier, index2) => {
    const successChance = index2 === 0 ? CHICKEN_RTP / multiplier : (multipliers[index2 - 1] ?? 1) / multiplier;
    return {
      lane: index2 + 1,
      multiplier,
      successChance,
      success: random.float() < successChance
    };
  });
}
function floorLavaDifficultyFromAction(action) {
  const difficulty = action.match(/^start:(easy|medium|hard|toxic)$/)?.[1] ?? action.match(/:difficulty:(easy|medium|hard|toxic)(?::|$)/)?.[1];
  if (!isFloorLavaDifficulty(difficulty)) throw new Error("Invalid Floor Is Lava difficulty");
  return difficulty;
}
function generateFloorLavaField(serverSeed, context) {
  if (context.gameId !== "floor-is-lava") throw new Error("Floor Is Lava field requires its canonical game ID");
  const difficulty = floorLavaDifficultyFromAction(context.action);
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  const config = FLOOR_LAVA_DIFFICULTIES[difficulty];
  const stages = [];
  for (let level = 0; level < config.levels; level += 1) {
    const platforms = Array.from({ length: FLOOR_LAVA_STARTING_PLATFORMS }, (_, index2) => index2);
    for (let index2 = platforms.length - 1; index2 > 0; index2 -= 1) {
      const swap = random.int(index2 + 1);
      const current = platforms[index2];
      const replacement = platforms[swap];
      if (current === void 0 || replacement === void 0) throw new Error("Floor Is Lava shuffle failed");
      platforms[index2] = replacement;
      platforms[swap] = current;
    }
    for (const count of config.safeCounts) {
      stages.push(platforms.slice(0, count).sort((left, right) => left - right));
    }
  }
  return stages;
}
function dragonTowerDifficultyFromAction(action) {
  const difficulty = action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
  if (!isDragonTowerDifficulty(difficulty)) throw new Error("Invalid Dragon Tower difficulty");
  return difficulty;
}
function generateDragonTowerLayout(serverSeed, context) {
  if (context.gameId !== "dragon-tower") throw new Error("Dragon Tower layout requires the dragon-tower game ID");
  const difficulty = dragonTowerDifficultyFromAction(context.action);
  const config = DRAGON_TOWER_DIFFICULTIES[difficulty];
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: DRAGON_TOWER_FLOORS }, () => {
    const columns = Array.from({ length: config.tiles }, (_, column) => column);
    for (let index2 = columns.length - 1; index2 > 0; index2 -= 1) {
      const swap = random.int(index2 + 1);
      const current = columns[index2];
      const replacement = columns[swap];
      if (current === void 0 || replacement === void 0) throw new Error("Dragon Tower shuffle failed");
      columns[index2] = replacement;
      columns[swap] = current;
    }
    return columns.slice(0, config.safeTiles).sort((left, right) => left - right);
  });
}
function towerDifficultyFromAction(action) {
  const difficulty = action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
  if (!isTowerDifficulty(difficulty)) throw new Error("Invalid Tower difficulty");
  return difficulty;
}
function generateTowerLayout(serverSeed, context) {
  if (context.gameId !== "tower") throw new Error("Tower layout requires the tower game ID");
  const difficulty = towerDifficultyFromAction(context.action);
  const config = TOWER_DIFFICULTIES[difficulty];
  const random = new FairRandom(serverSeed, context);
  return Array.from({ length: TOWER_FLOORS }, () => {
    const columns = Array.from({ length: config.tiles }, (_, column) => column);
    for (let index2 = columns.length - 1; index2 > 0; index2 -= 1) {
      const swap = random.int(index2 + 1);
      const current = columns[index2];
      const replacement = columns[swap];
      if (current === void 0 || replacement === void 0) throw new Error("Tower shuffle failed");
      columns[index2] = replacement;
      columns[swap] = current;
    }
    return columns.slice(0, config.safeTiles).sort((left, right) => left - right);
  });
}
var KENO_RISKS = ["Classic", "Low", "Medium", "High", "Extreme"];
var KENO_PAYTABLES = Object.fromEntries(
  KENO_RISKS.map((risk) => [
    risk,
    Object.fromEntries(
      Object.entries(PAYOUTS[risk]).map(([picks, row]) => [
        Number(picks),
        row.map((multiplier) => Number(multiplier.replaceAll(",", "").replace("x", "")))
      ])
    )
  ])
);
var KENO_PAYTABLE = KENO_PAYTABLES.Classic;
function kenoConfiguration(action) {
  const configured = /^numbers:(classic|low|medium|high|extreme):(.*)$/i.exec(action);
  const risk = configured ? KENO_RISKS.find((candidate) => candidate.toLowerCase() === configured[1]?.toLowerCase()) ?? "Classic" : "Classic";
  const numberSource = configured?.[2] ?? (action.startsWith("numbers:") ? action.slice("numbers:".length) : "");
  const selected = numberSource ? numberSource.split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 40).slice(0, 10) : [Number(action.match(/tile:(\d+)/)?.[1] ?? 0) + 1];
  return { risk, selected: [...new Set(selected)] };
}
var PLINKO_PAYTABLE = RAINBET_PLINKO_PAYTABLES.low[8];
var RAINBET_PLINKO_PAYTABLES2 = RAINBET_PLINKO_PAYTABLES;
var RAINBET_PLINKO_MAX_MULTIPLIER = Math.max(
  ...Object.values(RAINBET_PLINKO_PAYTABLES2).flatMap((tables) => Object.values(tables).flat())
);
function rainbetPlinkoPaytable(risk, rows) {
  const paytable = RAINBET_PLINKO_PAYTABLES2[risk][rows];
  if (!paytable) throw new Error("Rainbet Plinko rows must be an integer from 8 through 16");
  return paytable;
}
function settleRainbetPlinkoPath(risk, rows, path) {
  if (path.length !== rows) throw new Error("Rainbet Plinko paths must contain one decision per row");
  const slot = path.filter((turn) => turn === "right").length;
  const multiplier = rainbetPlinkoPaytable(risk, rows)[slot];
  if (multiplier === void 0) throw new Error("Rainbet Plinko path resolved outside the configured board");
  return { multiplier, outcome: { kind: "plinko", slot, path, rows, risk } };
}
function rainbetPlinkoConfiguration(action) {
  const match = /^drop:(low|medium|high|rain):(8|9|10|11|12|13|14|15|16)$/.exec(action);
  if (!match?.[1] || !match[2]) return void 0;
  return { risk: match[1], rows: Number(match[2]) };
}
var slots = (random, gameId, midasMathVersion) => resolveFairSlot(random, gameId, midasMathVersion);
var board = (random, gameId, action) => {
  if (gameId === "keno") {
    const pool = Array.from({ length: 40 }, (_, index2) => index2 + 1);
    const draw2 = [];
    while (draw2.length < 10) {
      const index2 = random.int(pool.length);
      const [number] = pool.splice(index2, 1);
      if (number !== void 0) draw2.push(number);
    }
    const { risk, selected: uniqueSelected } = kenoConfiguration(action);
    const matchedNumbers = uniqueSelected.filter((number) => draw2.includes(number));
    const payoutByMatches = KENO_PAYTABLES[risk][uniqueSelected.length] ?? [];
    const multiplier = payoutByMatches[matchedNumbers.length] ?? 0;
    return {
      multiplier,
      outcome: { kind: "keno", risk, selected: uniqueSelected, draw: draw2, matchedNumbers, matches: matchedNumbers.length }
    };
  }
  const requestedTile = Number(action.match(/tile:(\d+)/)?.[1] ?? 0);
  const boardSize = gameId === "moles" ? MOLES_HOLE_COUNT : 25;
  const hazardsNeeded = gameId === "moles" ? 3 : 5;
  const hazardLocations = [];
  while (hazardLocations.length < hazardsNeeded) {
    const location = random.int(boardSize);
    if (!hazardLocations.includes(location)) hazardLocations.push(location);
  }
  const safe = gameId === "moles" ? hazardLocations.includes(requestedTile) : !hazardLocations.includes(requestedTile);
  return {
    multiplier: safe ? gameId === "moles" ? molesMultiplier(3, 1) : TARGET_RTP / 0.8 : 0,
    outcome: {
      kind: gameId === "moles" ? "moles" : "nullfield",
      safe,
      tile: requestedTile,
      ...gameId === "moles" ? { moleLocations: hazardLocations } : { nullLocations: hazardLocations }
    }
  };
};
var climb = (random, gameId, action) => {
  if (gameId === "rps-ascent") {
    const choices = ["rock", "paper", "scissors"];
    const player = choices.find((choice) => action.toLowerCase().includes(choice)) ?? "rock";
    const opponent = random.pick(choices);
    const draw2 = player === opponent;
    const success2 = player === "rock" && opponent === "scissors" || player === "paper" && opponent === "rock" || player === "scissors" && opponent === "paper";
    const step2 = success2 ? 1 : 0;
    return {
      multiplier: draw2 ? 1 : success2 ? 1.91 : 0,
      outcome: {
        kind: "rps-ascent",
        success: success2,
        draw: draw2,
        player,
        opponent,
        step: step2,
        ascent: Array.from({ length: step2 }, (_, index2) => index2 + 1)
      }
    };
  }
  const difficulty = chickenDifficultyFromAction(action);
  const nextMultiplier = CHICKEN_PATHS[difficulty][0];
  const successChance = CHICKEN_RTP / nextMultiplier;
  const success = random.float() < successChance;
  const step = success ? 1 : 0;
  return {
    multiplier: success ? nextMultiplier : 0,
    outcome: {
      kind: "chicken-cross",
      difficulty,
      success,
      successChance,
      step,
      collisionLane: success ? null : 1
    }
  };
};
var PRISM_DECK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var PRISM_DECK_SUITS = ["spades", "hearts", "diamonds", "clubs"];
var PRISM_DECK_TARGET_RTP = 0.96;
function prismDeckCard(index2) {
  const value = index2 % PRISM_DECK_RANKS.length + 1;
  const rank = PRISM_DECK_RANKS[value - 1];
  const suit = PRISM_DECK_SUITS[Math.floor(index2 / PRISM_DECK_RANKS.length)];
  if (!rank || !suit) throw new Error("Prism Deck card index is out of range");
  return {
    id: `${rank}-${suit}`,
    rank,
    value,
    suit,
    red: suit === "hearts" || suit === "diamonds"
  };
}
var PRISM_DECK_OPENING_CARD = prismDeckCard(45);
function prismDeckCardIndex(card2) {
  const rankIndex = PRISM_DECK_RANKS.indexOf(card2.rank);
  const suitIndex = PRISM_DECK_SUITS.indexOf(card2.suit);
  if (rankIndex < 0 || suitIndex < 0) throw new Error("Prism Deck card is invalid");
  return suitIndex * PRISM_DECK_RANKS.length + rankIndex;
}
function parsePrismDeckAction(action) {
  const match = /^prism:v4:(higher|lower):(0|[1-9][0-9]?)$/.exec(action);
  if (!match || Number(match[2]) > 51) throw new Error("Invalid committed Prism Deck action");
  return { direction: match[1], currentIndex: Number(match[2]) };
}
function nextPrismDeckCard(serverSeed, clientSeed, position, current) {
  const random = new FairRandom(serverSeed, {
    gameId: "prism-deck",
    clientSeed,
    nonce: position - 1,
    action: "prism-deck-sequence-v3"
  });
  const currentIndex = prismDeckCardIndex(current);
  const candidate = random.int(PRISM_DECK_RANKS.length * PRISM_DECK_SUITS.length - 1);
  return prismDeckCard(candidate >= currentIndex ? candidate + 1 : candidate);
}
function prismDeckCardAt(serverSeed, clientSeed, position) {
  if (!Number.isSafeInteger(position) || position < 0)
    throw new Error("Prism Deck position must be a non-negative integer");
  let card2 = PRISM_DECK_OPENING_CARD;
  for (let nextPosition = 1; nextPosition <= position; nextPosition += 1)
    card2 = nextPrismDeckCard(serverSeed, clientSeed, nextPosition, card2);
  return card2;
}
function prismDeckWinProbability(direction, currentValue) {
  if (!Number.isInteger(currentValue) || currentValue < 1 || currentValue > PRISM_DECK_RANKS.length)
    throw new Error("Prism Deck rank value must be an integer from 1 through 13");
  const winningRanks = direction === "higher" ? PRISM_DECK_RANKS.length + 1 - currentValue : currentValue;
  const winningCards = winningRanks * PRISM_DECK_SUITS.length - 1;
  return winningCards / (PRISM_DECK_RANKS.length * PRISM_DECK_SUITS.length - 1);
}
function evaluatePrismDeckChoice(direction, currentCard, nextCard) {
  return direction === "higher" ? nextCard.value >= currentCard.value : nextCard.value <= currentCard.value;
}
var cards = (serverSeed, context) => {
  const committed = context.action.startsWith("prism:") ? parsePrismDeckAction(context.action) : void 0;
  const currentCard = committed ? prismDeckCard(committed.currentIndex) : prismDeckCardAt(serverSeed, context.clientSeed, context.nonce);
  let nextCard;
  if (committed) {
    const random = new FairRandom(serverSeed, { ...context, action: `prism-deck-committed-card-v4:${committed.currentIndex}` });
    const candidate = random.int(51);
    nextCard = prismDeckCard(candidate >= committed.currentIndex ? candidate + 1 : candidate);
  } else {
    nextCard = prismDeckCardAt(serverSeed, context.clientSeed, context.nonce + 1);
  }
  const direction = committed?.direction ?? (context.action.toLowerCase().includes("lower") ? "lower" : "higher");
  const won = evaluatePrismDeckChoice(direction, currentCard, nextCard);
  const draw2 = nextCard.value === currentCard.value;
  const probability = prismDeckWinProbability(direction, currentCard.value);
  const stepPayout = quantizeMultiplier(PRISM_DECK_TARGET_RTP / probability);
  return {
    multiplier: won ? stepPayout : 0,
    outcome: {
      kind: "cards",
      current: currentCard.value,
      next: nextCard.value,
      currentCard,
      nextCard,
      direction,
      won,
      draw: draw2,
      probability,
      stepPayout,
      deck: [currentCard, nextCard]
    }
  };
};
var BACCARAT_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var BACCARAT_SUITS = ["clubs", "diamonds", "hearts", "spades"];
function baccaratCardValue(rank) {
  if (rank === "A") return 1;
  const value = Number(rank);
  return Number.isInteger(value) && value >= 2 && value <= 9 ? value : 0;
}
function baccaratTotal(cards2) {
  return cards2.reduce((sum, card2) => sum + card2.value, 0) % 10;
}
function baccaratPlayerDraws(total) {
  return total >= 0 && total <= 5;
}
function baccaratBankerDraws(total, playerThirdValue) {
  if (total < 0 || total > 7) return false;
  if (playerThirdValue === void 0) return total <= 5;
  if (total <= 2) return true;
  if (total === 3) return playerThirdValue !== 8;
  if (total === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (total === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (total === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}
function baccaratWinner(playerTotal, bankerTotal) {
  if (playerTotal === bankerTotal) return "tie";
  return playerTotal > bankerTotal ? "player" : "banker";
}
function baccaratMultiplier(bet, winner) {
  if (winner === "tie") return bet === "tie" ? 9 : 1;
  if (bet !== winner) return 0;
  return winner === "banker" ? 1.95 : 2;
}
function createBaccaratShoe(random) {
  const shoe = [];
  for (let deck = 0; deck < 8; deck += 1) {
    for (const suit of BACCARAT_SUITS) {
      for (const rank of BACCARAT_RANKS) {
        shoe.push({ id: `deck-${deck}-${suit}-${rank}`, deck, rank, suit, value: baccaratCardValue(rank) });
      }
    }
  }
  for (let index2 = shoe.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    const currentCard = shoe[index2];
    const swapCard = shoe[swap];
    if (!currentCard || !swapCard) throw new Error("Baccarat shoe shuffle failed");
    shoe[index2] = swapCard;
    shoe[swap] = currentCard;
  }
  return shoe;
}
var baccarat = (random, action) => {
  const actionBet = action.match(/^bet:(player|tie|banker)$/)?.[1];
  const bet = actionBet === "tie" || actionBet === "banker" ? actionBet : "player";
  const shoe = createBaccaratShoe(random);
  let cursor = 0;
  const dealOrder = [];
  const draw2 = () => {
    const card2 = shoe[cursor];
    if (!card2) throw new Error("Baccarat shoe exhausted");
    cursor += 1;
    dealOrder.push(card2);
    return card2;
  };
  const playerCards = [draw2()];
  const bankerCards = [draw2()];
  playerCards.push(draw2());
  bankerCards.push(draw2());
  const initialPlayerTotal = baccaratTotal(playerCards);
  const initialBankerTotal = baccaratTotal(bankerCards);
  const natural2 = initialPlayerTotal >= 8 || initialBankerTotal >= 8;
  let playerThird;
  if (!natural2 && baccaratPlayerDraws(initialPlayerTotal)) {
    playerThird = draw2();
    playerCards.push(playerThird);
  }
  if (!natural2 && baccaratBankerDraws(initialBankerTotal, playerThird?.value)) bankerCards.push(draw2());
  const playerTotal = baccaratTotal(playerCards);
  const bankerTotal = baccaratTotal(bankerCards);
  const winner = baccaratWinner(playerTotal, bankerTotal);
  return {
    multiplier: baccaratMultiplier(bet, winner),
    outcome: {
      kind: "baccarat",
      bet,
      winner,
      natural: natural2,
      player: { cards: playerCards, total: playerTotal, drewThird: playerCards.length === 3 },
      banker: { cards: bankerCards, total: bankerTotal, drewThird: bankerCards.length === 3 },
      dealOrder
    }
  };
};
var PUMP_MULTIPLIERS = {
  easy: [
    1,
    1.02,
    1.07,
    1.11,
    1.17,
    1.23,
    1.29,
    1.36,
    1.44,
    1.53,
    1.63,
    1.75,
    1.88,
    2.04,
    2.23,
    2.45,
    2.72,
    3.06,
    3.5,
    4.08,
    4.9,
    6.13,
    8.17,
    12.25,
    24.5
  ],
  medium: [
    1,
    1.11,
    1.27,
    1.46,
    1.69,
    1.98,
    2.33,
    2.76,
    3.31,
    4.03,
    4.95,
    6.19,
    7.88,
    10.25,
    13.66,
    18.78,
    26.83,
    40.25,
    64.4,
    112.7,
    225.4,
    563.5,
    2254
  ],
  hard: [
    1,
    1.23,
    1.55,
    1.98,
    2.56,
    3.36,
    4.48,
    6.08,
    8.41,
    11.92,
    17.34,
    26.01,
    40.46,
    65.74,
    112.7,
    206.62,
    413.23,
    929.77,
    2479.4,
    8677.9,
    52067.4
  ],
  expert: [
    1,
    1.63,
    2.8,
    4.95,
    9.08,
    17.34,
    34.68,
    73.21,
    164.72,
    400.02,
    1066.73,
    3200.18,
    11200.65,
    48536.13,
    291216.8,
    32033848e-1
  ]
};
var PUMP_DANGER_COUNTS = {
  easy: 1,
  medium: 3,
  hard: 5,
  expert: 10
};
var PUMP_POSITION_COUNT = 25;
function isPumpDifficulty(value) {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert";
}
function pumpDifficultyFromAction(action) {
  const difficulty = action.match(/^start:(easy|medium|hard|expert)$/)?.[1];
  if (!isPumpDifficulty(difficulty)) throw new Error("Invalid Pump difficulty");
  return difficulty;
}
function pumpMultiplier(difficulty, step) {
  const ladder = PUMP_MULTIPLIERS[difficulty];
  return ladder[Math.max(0, Math.min(ladder.length - 1, step))] ?? 1;
}
function pumpChance(difficulty, step) {
  const available = PUMP_POSITION_COUNT - PUMP_DANGER_COUNTS[difficulty] - step;
  return Math.max(0, Math.min(100, available / PUMP_POSITION_COUNT * 100));
}
function generatePumpPopPoint(serverSeed, context) {
  if (context.gameId !== "stake-pump") throw new Error("Pump layout requires the stake-pump game ID");
  const difficulty = pumpDifficultyFromAction(context.action);
  const random = new FairRandom(serverSeed, { ...context, action: `start:${difficulty}` });
  const positions = Array.from({ length: PUMP_POSITION_COUNT }, (_, index2) => index2 + 1);
  for (let index2 = positions.length - 1; index2 > 0; index2 -= 1) {
    const swap = random.int(index2 + 1);
    const current = positions[index2];
    const replacement = positions[swap];
    if (current === void 0 || replacement === void 0) throw new Error("Pump shuffle failed");
    positions[index2] = replacement;
    positions[swap] = current;
  }
  return Math.min(...positions.slice(0, PUMP_DANGER_COUNTS[difficulty]));
}
function pumpAction(action) {
  const parsed = action.match(/^pumps:(\d+)(?::(easy|medium|hard|expert))?$/i);
  const difficulty = parsed?.[2]?.toLowerCase() ?? "hard";
  const ladder = PUMP_MULTIPLIERS[difficulty];
  const requested = Number(parsed?.[1] ?? 1);
  const pumps = Math.max(1, Math.min(ladder.length - 1, Number.isSafeInteger(requested) ? requested : 1));
  return { difficulty, pumps, action: `pumps:${pumps}:${difficulty}` };
}
function pump(random, action) {
  const { difficulty, pumps } = pumpAction(action);
  const positions = Array.from({ length: PUMP_POSITION_COUNT }, (_, index2) => index2 + 1);
  for (let index2 = positions.length - 1; index2 > 0; index2 -= 1) {
    const target2 = random.int(index2 + 1);
    const currentPosition = positions[index2];
    const targetPosition = positions[target2];
    if (currentPosition === void 0 || targetPosition === void 0) throw new Error("Pump shuffle failed");
    positions[index2] = targetPosition;
    positions[target2] = currentPosition;
  }
  const dangerPositions = positions.slice(0, PUMP_DANGER_COUNTS[difficulty]).sort((left, right) => left - right);
  const popPoint = dangerPositions[0] ?? null;
  const burst = popPoint !== null && popPoint <= pumps;
  const target = PUMP_MULTIPLIERS[difficulty][pumps] ?? 1;
  const attemptedPumps = burst && popPoint !== null ? popPoint : pumps;
  const successfulPumps = burst ? Math.max(0, attemptedPumps - 1) : pumps;
  return {
    multiplier: burst ? 0 : target,
    outcome: {
      kind: "pump",
      result: burst ? 0 : target,
      target,
      popPoint,
      attemptedPumps,
      successfulPumps,
      dangerPositions,
      burst,
      difficulty
    }
  };
}
function crashTarget(gameId, action) {
  if (gameId === "stake-crash") {
    if (action.startsWith("crash:v")) {
      const match = /^crash:v2:target:([0-9]+(?:\.[0-9]{1,2})?)$/.exec(action);
      const parsed3 = Number(match?.[1]);
      if (!match || parsed3 < 1.01 || parsed3 > STAKE_CRASH_MAX_MULTIPLIER) throw new Error("Invalid Crash v2 target");
      return Math.round(parsed3 * 100) / 100;
    }
    const parsed2 = Number(action.match(/^crash:target:(\d+(?:\.\d+)?)/)?.[1] ?? 2);
    return Math.max(1.01, Math.min(STAKE_CRASH_MAX_MULTIPLIER, Math.floor(parsed2 * 100) / 100));
  }
  const parsed = Number(action.match(/target:(\d+(?:\.\d+)?)/)?.[1] ?? 2);
  return Math.max(1.01, Math.min(1e5, parsed));
}
function stakeCrashV2Point(draw2) {
  const size = 1n << 48n;
  if (draw2 < 0n || draw2 >= size) throw new Error("Invalid Crash draw");
  const cents = 99n * size / (size - draw2);
  return Number(cents < 100n ? 100n : cents > 100000n ? 100000n : cents) / 100;
}
var crash = (random, gameId, action) => {
  if (gameId === "stake-crash") {
    const raw2 = action.startsWith("crash:v2:") ? stakeCrashV2Point(BigInt(random.float() * 281474976710656)) : Math.min(
      STAKE_CRASH_MAX_MULTIPLIER,
      Math.max(1, Math.floor(0.99 / Math.max(1e-3, 1 - random.float()) * 100) / 100)
    );
    const target2 = crashTarget(gameId, action);
    const won = target2 <= raw2;
    return {
      multiplier: won ? target2 : 0,
      outcome: { kind: "stake-crash", crashAt: raw2, target: target2, won }
    };
  }
  if (gameId === "stake-pump" || gameId === "moonbound") return pump(random, action);
  const raw = Math.min(1e5, Math.floor(RAINBET_LIMBO_RTP / (1 - random.float()) * 100) / 100);
  const target = crashTarget(gameId, action);
  return {
    multiplier: raw >= target ? target : 0,
    outcome: { kind: "limbo", result: raw, target }
  };
};
var instant = (random, gameId, action) => {
  if (gameId === "rock-paper-scissors") {
    const choices = ["rock", "paper", "scissors"];
    const player = choices.find((choice) => action.toLowerCase().includes(choice)) ?? "rock";
    const opponent = random.pick(choices);
    const draw2 = player === opponent;
    const won = player === "rock" && opponent === "scissors" || player === "paper" && opponent === "rock" || player === "scissors" && opponent === "paper";
    return {
      multiplier: draw2 ? 1 : won ? 1.91 : 0,
      outcome: { kind: "rps", player, opponent, won, draw: draw2 }
    };
  }
  if (gameId === "dice") {
    const rollBasisPoints = random.int(1e4);
    const roll = rollBasisPoints / 100;
    const match = action.match(/^(over|under):(\d+(?:\.\d+)?)$/);
    const direction = match?.[1] === "under" ? "under" : "over";
    const targetBasisPoints = Math.max(200, Math.min(9800, Math.round(Number(match?.[2] ?? 50) * 100)));
    const target = targetBasisPoints / 100;
    const won = direction === "over" ? rollBasisPoints >= targetBasisPoints : rollBasisPoints < targetBasisPoints;
    const chanceBasisPoints = direction === "over" ? 1e4 - targetBasisPoints : targetBasisPoints;
    const multiplierMicros = Math.floor(9900 * 1e6 / chanceBasisPoints);
    return {
      multiplier: won ? multiplierMicros / 1e6 : 0,
      outcome: { kind: "dice", roll, rollBasisPoints, target, targetBasisPoints, direction, won, multiplierMicros }
    };
  }
  const configuration = rainbetPlinkoConfiguration(action);
  if (!configuration && action !== "drop") throw new Error("Invalid Plinko action");
  const rows = configuration?.rows ?? 8;
  const path = Array.from({ length: rows }, () => random.int(2) === 0 ? "left" : "right");
  if (!configuration) {
    const slot = path.filter((turn) => turn === "right").length;
    return { multiplier: PLINKO_PAYTABLE[slot] ?? 0, outcome: { kind: "plinko", slot, path } };
  }
  return settleRainbetPlinkoPath(configuration.risk, configuration.rows, path);
};
function settledStandalone(random, gameId, action, tarotMathVersion) {
  if (gameId === "rainbet-mines") {
    const { gridSize, mineCount } = minesConfigurationFromAction(action);
    const positions = Array.from({ length: gridSize }, (_, index2) => index2);
    for (let index2 = positions.length - 1; index2 > 0; index2 -= 1) {
      const target = random.int(index2 + 1);
      [positions[index2], positions[target]] = [positions[target] ?? index2, positions[index2] ?? target];
    }
    const mineLocations = positions.slice(0, mineCount).sort((left, right) => left - right);
    return {
      multiplier: 1,
      outcome: { kind: "rainbet-mines", gridSize, mineCount, mineLocations }
    };
  }
  if (gameId === "rainbet-wheel") {
    const risk = action.match(/^spin:(low|medium|high|risky)$/)?.[1];
    if (!risk) throw new Error("Invalid Rainbet Wheel action");
    if (!RISKS.includes(risk)) throw new Error("Invalid Rainbet Wheel risk");
    const table = riskTableFor(risk);
    const resolved = outcomeForIndex(risk, random.int(table.length));
    return { multiplier: resolved.multiplier, outcome: { kind: "rainbet-wheel", ...resolved } };
  }
  if (gameId === "rainbet-roulette") {
    if (!action.startsWith("spin:")) throw new Error("Invalid Roulette action");
    const entries = action.slice(5).split("|").filter(Boolean).map((entry) => {
      const separator = entry.lastIndexOf("@");
      const key = entry.slice(0, separator);
      const amount = Number(entry.slice(separator + 1));
      if (!/^(?:number:(?:[0-9]|[12]\d|3[0-6])|dozen:[1-3]|column:[1-3]|range:(?:low|high)|parity:(?:even|odd)|color:(?:red|black))$/.test(
        key
      )) {
        throw new Error("Invalid Roulette bet");
      }
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Roulette wager allocation");
      return [key, amount];
    });
    if (entries.length === 0) throw new Error("Roulette requires at least one bet");
    const pocket = EUROPEAN_WHEEL[random.int(EUROPEAN_WHEEL.length)] ?? 0;
    const settlement = settleRouletteBets(new Map(entries), pocket);
    return {
      multiplier: settlement.stake > 0 ? settlement.payout / settlement.stake : 0,
      outcome: {
        kind: "rainbet-roulette",
        pocket,
        color: rouletteColor(pocket),
        ...settlement,
        winners: [...settlement.winners]
      }
    };
  }
  if (gameId === "rainbet-war") {
    const match = /^deal:(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(action);
    if (!match?.[1] || !match[2] || !match[3]) throw new Error("Invalid War action");
    const mainWager = Number(match[1]);
    const tieWager = Number(match[2]);
    const colouredTieWager = Number(match[3]);
    const openingStake = mainWager + tieWager + colouredTieWager;
    if (!Number.isFinite(openingStake) || openingStake <= 0) throw new Error("War requires a wager");
    const deck = [];
    for (const suit of WAR_SUITS) for (const rank of WAR_RANKS) deck.push(makeCard(rank, suit));
    for (let index2 = deck.length - 1; index2 > 0; index2 -= 1) {
      const target = random.int(index2 + 1);
      const currentCard = deck[index2];
      const targetCard = deck[target];
      if (!currentCard || !targetCard) throw new Error("War deck shuffle failed");
      deck[index2] = targetCard;
      deck[target] = currentCard;
    }
    const battles = [];
    for (let index2 = 0; index2 < 4; index2 += 1) {
      const player = deck[index2 * 2];
      const dealer = deck[index2 * 2 + 1];
      if (!player || !dealer) throw new Error("War deck exhausted");
      battles.push({ player, dealer });
      if (player.value !== dealer.value) break;
    }
    const settlement = settleLegacyWarRound({ battles, mainWager, tieWager, colouredTieWager });
    return {
      multiplier: settlement.totalPayout / openingStake,
      outcome: { kind: "rainbet-war", battles, openingStake, ...settlement }
    };
  }
  if (gameId === "stake-darts" || gameId === "stake-darts-enhanced") {
    const difficulty = action.match(/^throw:(easy|medium|hard|expert)$/)?.[1];
    if (!difficulty) throw new Error("Invalid Darts action");
    const resolved = (gameId === "stake-darts" ? resolveDart : resolveDart2)({
      difficulty,
      rotationFloat: random.float(),
      distanceFloat: random.float()
    });
    return { multiplier: resolved.multiplier, outcome: { kind: gameId, ...resolved } };
  }
  if (gameId === "stake-flip") {
    const selected = action.match(/^flip:(heads|tails)$/)?.[1];
    if (!selected) throw new Error("Invalid Flip action");
    const landed = random.int(2) === 0 ? "heads" : "tails";
    const won = landed === selected;
    return {
      multiplier: won ? multiplierForStreak(1) ?? 0 : 0,
      outcome: { kind: "stake-flip", selected, landed, won, streak: 1 }
    };
  }
  if (gameId === "stake-wheel") {
    const match = /^spin:(low|medium|high):(10|20|30|40|50)$/.exec(action);
    if (!match?.[1] || !match[2]) throw new Error("Invalid Stake Wheel action");
    const configuration = validateConfiguration(match[1], Number(match[2]));
    const resolved = outcomeForIndex2(configuration, random.int(configuration.segments));
    return { multiplier: resolved.multiplier, outcome: { kind: "stake-wheel", ...resolved } };
  }
  if (gameId === "stake-snakes") {
    const requestedDifficulty = action.match(/^roll:(easy|medium|hard|expert|master)$/)?.[1];
    if (!requestedDifficulty) throw new Error("Invalid Snakes action");
    const difficulty = normalizeDifficulty(requestedDifficulty);
    const dieA = random.int(6) + 1;
    const dieB = random.int(6) + 1;
    const total = dieA + dieB;
    const multiplier = firstMultiplierFor(difficulty, total);
    return {
      multiplier,
      outcome: { kind: "stake-snakes", difficulty, dieA, dieB, total, safe: multiplier > 0 }
    };
  }
  if (gameId === "tarot") {
    const difficulty = action.match(/^draw:(easy|medium|hard|expert)$/)?.[1];
    if (!difficulty) throw new Error("Invalid Tarot action");
    const resolved = tarotMathVersion === "legacy" ? drawLegacyTarot(difficulty, () => random.float()) : drawTarot(
      difficulty,
      () => random.float(),
      (bound) => random.int(bound)
    );
    return { multiplier: resolved.multiplier, outcome: { kind: "tarot", difficulty, ...resolved } };
  }
  if (gameId === "american-aurora") {
    if (action !== "spin") throw new Error("Invalid American Aurora action");
    const ticket = buildTicket({ rng: () => random.float(), betCents: 100 });
    return { multiplier: ticket.totalWinCents / ticket.betCents, outcome: { kind: "american-aurora", ticket } };
  }
  if (gameId === "neon-pulse-pinball") {
    if (action !== "launch") throw new Error("Invalid Neon Pulse Pinball action");
    const unit = random.float();
    const probabilities = RTP_MODEL.probabilities;
    const scenarioId = unit < probabilities.safe ? "safe" : unit < probabilities.safe + probabilities.win ? "win" : unit < probabilities.safe + probabilities.win + probabilities.collision ? "collision" : "loss";
    const multiplier = RTP_MODEL.payoutMultipliers[scenarioId];
    return { multiplier, outcome: { kind: "neon-pulse-pinball", scenarioId } };
  }
  throw new Error(`Unsupported settled standalone game: ${gameId}`);
}
var FAIRNESS_ADAPTERS = {
  blackjack: "blackjack",
  "stake-pump": "crash",
  moonbound: "crash",
  "stake-crash": "stake-crash",
  packs: "packs",
  drill: "drill",
  "rps-ascent": "climb",
  "midnight-train-heist": "slots",
  "wanted-dead-or-wild": "wanted-dead-or-wild",
  "midas-feast": "slots",
  "sands-of-sekhmet": "slots",
  "poseidons-abyssal-crown": "slots",
  "witch-blood-megaways": "witch-blood-megaways",
  "rip-city": "rip-city",
  "xmas-drop": "xmas-drop",
  sixsixsix: "slots",
  "gates-of-olympus-super-scatter": "gates-super-scatter",
  "fruit-party": "fruit-party",
  "sweet-bonanza-2500": "sweet-bonanza-2500",
  "neon-syndicate": "neon-syndicate",
  "fist-of-destruction": "fist-of-destruction",
  "odins-vault": "odins-vault",
  moles: "board",
  "prism-deck": "cards",
  "thirteen-card-flip": "thirteen-card-flip",
  "video-poker": "video-poker",
  baccarat: "baccarat",
  nullfield: "board",
  "chicken-cross": "climb",
  "floor-is-lava": "floor-is-lava",
  tower: "tower",
  "dragon-tower": "dragon-tower",
  "rock-paper-scissors": "instant",
  limbo: "crash",
  keno: "board",
  plinko: "instant",
  dice: "instant",
  "rainbet-mines": "settled-standalone",
  "rainbet-wheel": "settled-standalone",
  "rainbet-roulette": "settled-standalone",
  "rainbet-war": "settled-standalone",
  "stake-darts": "settled-standalone",
  "stake-darts-enhanced": "settled-standalone",
  "stake-flip": "settled-standalone",
  "stake-wheel": "settled-standalone",
  "stake-snakes": "settled-standalone",
  tarot: "settled-standalone",
  "american-aurora": "settled-standalone",
  "neon-pulse-pinball": "settled-standalone"
};
var FAIRNESS_MAX_MULTIPLIERS = {
  blackjack: 135,
  "stake-pump": quantizeMultiplier(PUMP_MULTIPLIERS.expert.at(-1) ?? 0),
  moonbound: quantizeMultiplier(PUMP_MULTIPLIERS.expert.at(-1) ?? 0),
  "stake-crash": quantizeMultiplier(STAKE_CRASH_MAX_MULTIPLIER),
  packs: quantizeMultiplier(PACKS_MAX_MULTIPLIER),
  drill: quantizeMultiplier(DRILL_RESULT_MAXIMUM),
  "rps-ascent": quantizeMultiplier(1.91),
  "midnight-train-heist": FAIR_SLOT_MAX_MULTIPLIERS["midnight-train-heist"],
  "wanted-dead-or-wild": quantizeSlotMultiplier(WANTED_MAX_WIN),
  "midas-feast": FAIR_SLOT_MAX_MULTIPLIERS["midas-feast"],
  "sands-of-sekhmet": FAIR_SLOT_MAX_MULTIPLIERS["sands-of-sekhmet"],
  "poseidons-abyssal-crown": FAIR_SLOT_MAX_MULTIPLIERS["poseidons-abyssal-crown"],
  "witch-blood-megaways": WITCH_BLOOD_MAX_MULTIPLIER,
  "rip-city": quantizeSlotMultiplier(RIP_CITY_MAX_MULTIPLIER),
  "xmas-drop": quantizeSlotMultiplier(XMAS_DROP_MAX_MULTIPLIER),
  sixsixsix: FAIR_SLOT_MAX_MULTIPLIERS.sixsixsix,
  "gates-of-olympus-super-scatter": GATES_SUPER_SCATTER_MAX_WIN,
  "fruit-party": quantizeSlotMultiplier(FRUIT_PARTY_MAX_WIN),
  "sweet-bonanza-2500": quantizeSlotMultiplier(SWEET_BONANZA_MAX_WIN),
  "neon-syndicate": quantizeSlotMultiplier(NEON_SYNDICATE_MAX_WIN),
  "fist-of-destruction": quantizeMultiplier(FIST_OF_DESTRUCTION_MAX_WIN),
  "odins-vault": SLOT_MAX_SETTLED_MULTIPLIER,
  moles: quantizeMultiplier(MOLES_MAX_MULTIPLIER),
  "prism-deck": quantizeMultiplier(PRISM_DECK_TARGET_RTP / (3 / 51)),
  "thirteen-card-flip": quantizeMultiplier(THIRTEEN_CARD_FLIP_PAYOUT),
  "video-poker": VIDEO_POKER_MAX_MULTIPLIER,
  baccarat: quantizeMultiplier(31),
  nullfield: quantizeMultiplier(TARGET_RTP / 0.8),
  "chicken-cross": quantizeMultiplier(Math.max(...Object.values(CHICKEN_PATHS).flat())),
  "floor-is-lava": FLOOR_LAVA_MAX_MULTIPLIER,
  tower: quantizeMultiplier(TOWER_PAYTABLE.master[TOWER_FLOORS - 1] ?? 0),
  "dragon-tower": quantizeMultiplier(DRAGON_TOWER_PAYTABLE.master[DRAGON_TOWER_FLOORS - 1] ?? 0),
  "rock-paper-scissors": quantizeMultiplier(1.91),
  limbo: quantizeMultiplier(1e5),
  keno: quantizeMultiplier(
    Math.max(...Object.values(KENO_PAYTABLES).flatMap((tables) => Object.values(tables).flat()))
  ),
  plinko: quantizeMultiplier(RAINBET_PLINKO_MAX_MULTIPLIER),
  dice: quantizeMultiplier(49.5),
  "rainbet-mines": quantizeMultiplier(MINES_MAX_MULTIPLIER2),
  "rainbet-wheel": quantizeMultiplier(1e4),
  "rainbet-roulette": quantizeMultiplier(36),
  "rainbet-war": quantizeMultiplier(1001),
  "stake-darts": quantizeMultiplier(500),
  "stake-darts-enhanced": quantizeMultiplier(500),
  "stake-flip": quantizeMultiplier(1.96),
  "stake-wheel": quantizeMultiplier(49.5),
  "stake-snakes": quantizeMultiplier(17.64),
  tarot: quantizeMultiplier(80),
  "american-aurora": quantizeMultiplier(5e3),
  "neon-pulse-pinball": quantizeMultiplier(30.1)
};
function isEnabledGameId(value) {
  return ENABLED_GAME_IDS.includes(value);
}
function randomActionFor(context) {
  switch (context.gameId) {
    case "rps-ascent":
      return context.action.match(/rock|paper|scissors/i)?.[0]?.toLowerCase() ?? "rock";
    case "chicken-cross":
      return `start:${chickenDifficultyFromAction(context.action)}`;
    case "moles":
    case "nullfield":
      return "single-step";
    case "stake-pump":
    case "moonbound":
      return pumpAction(context.action).action;
    case "prism-deck":
      return "deal";
    case "thirteen-card-flip":
      return "deal";
    case "blackjack":
    case "video-poker":
      return "deal";
    case "drill":
      return "drill-results";
    default:
      return context.action;
  }
}
function unquantizedOutcomeFor(serverSeed, context) {
  const random = new FairRandom(serverSeed, { ...context, action: randomActionFor(context) });
  switch (FAIRNESS_ADAPTERS[context.gameId]) {
    case "drill": {
      const resolved = resolveDrill(random, context.action);
      return {
        multiplier: resolved.multiplier,
        outcome: resolved.outcome
      };
    }
    case "packs": {
      const resolved = resolvePacks(
        new FairRandom(serverSeed, { ...context, action: "open-pack" }),
        context.packsMathVersion
      );
      const presentationMs = context.action.includes(":reduced") ? 1 : context.action.includes(":instant") ? 1 : context.action.includes(":fast") ? 706 : resolved.outcome.presentation.presentationMs;
      return {
        multiplier: resolved.multiplier,
        outcome: {
          ...resolved.outcome,
          presentation: { ...resolved.outcome.presentation, presentationMs }
        }
      };
    }
    case "odins-vault": {
      const outcome = resolveOdinsVaultSpin(random, context.action);
      return {
        multiplier: outcome.totalMultiplier,
        outcome
      };
    }
    case "dragon-tower": {
      const difficulty = dragonTowerDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "dragon-tower-layout",
          difficulty,
          safeRows: generateDragonTowerLayout(serverSeed, context)
        }
      };
    }
    case "tower": {
      const difficulty = towerDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "tower-layout",
          difficulty,
          safeRows: generateTowerLayout(serverSeed, context)
        }
      };
    }
    case "floor-is-lava": {
      const difficulty = floorLavaDifficultyFromAction(context.action);
      return {
        multiplier: 0,
        outcome: {
          kind: "floor-is-lava-layout",
          difficulty,
          safeStages: generateFloorLavaField(serverSeed, context)
        }
      };
    }
    case "slots":
      return slots(random, context.gameId, context.midasMathVersion);
    case "wanted-dead-or-wild": {
      const outcome = resolveWantedDeadOrWild(random, context.action);
      return { multiplier: outcome.totalMultiplier, outcome };
    }
    case "witch-blood-megaways":
      return createWitchBloodOutcome(random);
    case "rip-city":
      return resolveRipCity(random, context.action);
    case "xmas-drop":
      return resolveXmasDrop(random, context.action);
    case "gates-super-scatter":
      return resolveGatesSuperScatter(random, context.action);
    case "fruit-party":
      return resolveFruitParty(random, context.action);
    case "sweet-bonanza-2500":
      return resolveSweetBonanza2500(random, context.action);
    case "neon-syndicate":
      return resolveNeonSyndicate(random, context.action);
    case "fist-of-destruction":
      return resolveFistOfDestruction(random, context.action);
    case "board":
      return board(random, context.gameId, context.action);
    case "climb":
      return climb(random, context.gameId, context.action);
    case "cards":
      return cards(serverSeed, context);
    case "thirteen-card-flip": {
      const resolved = resolveThirteenCardFlip(random, "b");
      return {
        multiplier: resolved.payout,
        outcome: resolved
      };
    }
    case "blackjack": {
      let state = dealBlackjack(blackjackShoe(random), context.blackjackRules);
      while (state.phase === "player") state = actBlackjack(state, "stand");
      return {
        multiplier: Number(blackjackPayout(state, 100n)) / 100,
        outcome: blackjackOutcome(state, "verification", 100n)
      };
    }
    case "video-poker": {
      const dealt = dealVideoPoker(random);
      return {
        multiplier: 0,
        outcome: {
          kind: "video-poker",
          phase: "hold",
          initialCards: dealt.initialCards
        }
      };
    }
    case "baccarat":
      return context.action.startsWith("bets:") ? resolveBaccaratV2(random, context.action) : baccarat(random, context.action);
    case "crash":
      return crash(random, context.gameId, context.action);
    case "stake-crash":
      return crash(random, context.gameId, context.action);
    case "instant":
      return instant(random, context.gameId, context.action);
    case "settled-standalone":
      return settledStandalone(random, context.gameId, context.action, context.tarotMathVersion);
  }
  throw new Error(`Missing fairness adapter for ${context.gameId}`);
}
function quantizeSettlementMultiplier(gameId, multiplier) {
  const adapter = FAIRNESS_ADAPTERS[gameId];
  return adapter === "slots" || adapter === "wanted-dead-or-wild" || adapter === "witch-blood-megaways" || adapter === "rip-city" || adapter === "xmas-drop" || adapter === "gates-super-scatter" || adapter === "fruit-party" || adapter === "sweet-bonanza-2500" || adapter === "neon-syndicate" || adapter === "fist-of-destruction" || adapter === "odins-vault" ? quantizeSlotMultiplier(multiplier) : quantizeMultiplier(multiplier);
}
function outcomeFor(serverSeed, context) {
  const raw = unquantizedOutcomeFor(serverSeed, context);
  const resolved = context.slotMathVersion === "legacy" ? raw : calibrateSlotPayout(context.gameId, context.action, raw, slotRawPayoutCap(context.gameId, context.action), context.slotMathVersion);
  const multiplier = quantizeSettlementMultiplier(context.gameId, resolved.multiplier);
  return { ...resolved, multiplier };
}
function slotRawPayoutCap(gameId, action) {
  if (gameId === "odins-vault") return odinsVaultRawCapForAction(action);
  if (gameId === "gates-of-olympus-super-scatter") return gatesSuperScatterRawCapForAction(action);
  return FAIRNESS_MAX_MULTIPLIERS[gameId];
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberRows(value) {
  if (!Array.isArray(value)) return void 0;
  const rows = [];
  for (const row of value) {
    if (!Array.isArray(row) || !row.every((column) => Number.isSafeInteger(column))) return void 0;
    rows.push([...row]);
  }
  return rows;
}
function chickenCrossings(value) {
  if (!Array.isArray(value)) return void 0;
  const crossings = [];
  for (const item of value) {
    if (!recordValue(item)) return void 0;
    if (!Number.isSafeInteger(item.lane) || typeof item.multiplier !== "number" || !Number.isFinite(item.multiplier) || typeof item.successChance !== "number" || !Number.isFinite(item.successChance) || typeof item.success !== "boolean") {
      return void 0;
    }
    crossings.push({
      lane: item.lane,
      multiplier: item.multiplier,
      successChance: item.successChance,
      success: item.success
    });
  }
  return crossings;
}
function verificationFactor(request) {
  return request.usdScale === 8 ? 1e8 : 100;
}
function verificationPayout(request, multiplier) {
  if (request.usdScale !== 8) return Math.round(request.wager * multiplier * 100) / 100;
  const wager = parseUsdAtoms(request.wager.toFixed(8));
  const ratio = parseUsdAtoms(multiplier.toFixed(8));
  return Number(wager * ratio / USD_FACTOR) / Number(USD_FACTOR);
}
function chickenVerification(request) {
  const fairnessAction = request.fairnessAction ?? `start:${chickenDifficultyFromAction(request.action)}`;
  const difficulty = chickenDifficultyFromAction(fairnessAction);
  const lanes = generateChickenPath(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = {
    kind: "chicken-cross",
    difficulty,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    collisionLane: null,
    crossings: []
  };
  if (recordValue(expected)) {
    const crossings = chickenCrossings(expected.crossings);
    const phase = expected.phase;
    let transcriptValid = crossings !== void 0 && crossings.length > 0;
    let step = 0;
    if (crossings) {
      for (const [index2, crossing] of crossings.entries()) {
        const lane = lanes[index2];
        if (!lane || crossing.lane !== index2 + 1 || stableJson(crossing) !== stableJson(lane)) {
          transcriptValid = false;
          break;
        }
        if (crossing.success) step += 1;
        else if (index2 !== crossings.length - 1) transcriptValid = false;
      }
    }
    if (phase === "lost") {
      transcriptValid &&= crossings?.at(-1)?.success === false && crossings.length === step + 1;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= Boolean(crossings?.every((crossing) => crossing.success));
      transcriptValid &&= step > 0 && step < lanes.length && crossings?.length === step;
      terminalMultiplier = CHICKEN_PATHS[difficulty][step - 1] ?? 0;
    } else if (phase === "completed") {
      transcriptValid &&= Boolean(crossings?.every((crossing) => crossing.success));
      transcriptValid &&= step === lanes.length && crossings?.length === lanes.length;
      terminalMultiplier = CHICKEN_PATHS[difficulty][lanes.length - 1] ?? 0;
    } else {
      transcriptValid = false;
    }
    const latest = crossings?.at(-1);
    const collisionLane = phase === "lost" ? latest?.lane ?? step + 1 : null;
    transcriptValid &&= expected.kind === "chicken-cross";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= expected.step === step;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.collisionLane === collisionLane;
    transcriptValid &&= expected.success === (phase !== "lost");
    transcriptValid &&= expected.successChance === (latest?.successChance ?? 0);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "chicken-cross",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      success: phase !== "lost",
      successChance: latest?.successChance ?? 0,
      step,
      currentMultiplier: terminalMultiplier,
      collisionLane,
      crossings: crossings ?? []
    };
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function floorLavaVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = floorLavaDifficultyFromAction(fairnessAction);
  const safeStages = generateFloorLavaField(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = {
    kind: "floor-is-lava",
    difficulty,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    nextMultiplier: 0,
    level: 1,
    stage: 0,
    levelComplete: false,
    picks: [],
    remainingPlatforms: [],
    revealedSafePlatforms: [],
    lastPick: null,
    safeStages
  };
  if (recordValue(expected)) {
    const expectedStages = numberRows(expected.safeStages);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks = [];
    let cleared = 0;
    let lost = false;
    let transcriptValid = true;
    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const step = rawPick.step;
      const platform = rawPick.platform;
      const declaredSafe = rawPick.safe;
      const available = floorLavaAvailablePlatforms(difficulty, safeStages, cleared);
      if (!Number.isSafeInteger(step) || step !== cleared + 1 || !Number.isSafeInteger(platform) || !available.includes(platform) || typeof declaredSafe !== "boolean") {
        transcriptValid = false;
        break;
      }
      const safe = safeStages[cleared]?.includes(platform) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ step, platform, safe });
      if (safe) cleared += 1;
      else lost = true;
    }
    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < safeStages.length && picks.length === cleared;
      terminalMultiplier = floorLavaMultiplier(difficulty, cleared);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === safeStages.length && picks.length === safeStages.length;
      terminalMultiplier = floorLavaMultiplier(difficulty, cleared);
    } else {
      transcriptValid = false;
    }
    const terminalStage = lost ? safeStages[cleared] ?? [] : safeStages[Math.max(0, cleared - 1)] ?? [];
    const expectedReveal = phase === "lost" || phase === "completed" ? terminalStage : [];
    const progress = floorLavaProgress(difficulty, cleared);
    transcriptValid &&= expected.kind === "floor-is-lava";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= expected.step === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.nextMultiplier === 0;
    transcriptValid &&= expected.level === progress.level;
    transcriptValid &&= expected.stage === progress.stage;
    transcriptValid &&= expected.levelComplete === progress.levelComplete;
    transcriptValid &&= stableJson(expected.remainingPlatforms) === stableJson(terminalStage);
    transcriptValid &&= stableJson(expected.revealedSafePlatforms) === stableJson(expectedReveal);
    transcriptValid &&= stableJson(expected.lastPick) === stableJson(picks.at(-1) ?? null);
    transcriptValid &&= stableJson(expectedStages) === stableJson(safeStages);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "floor-is-lava",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      step: cleared,
      currentMultiplier: terminalMultiplier,
      nextMultiplier: 0,
      level: progress.level,
      stage: progress.stage,
      levelComplete: progress.levelComplete,
      picks,
      remainingPlatforms: terminalStage,
      revealedSafePlatforms: expectedReveal,
      lastPick: picks.at(-1) ?? null,
      safeStages
    };
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function dragonTowerVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = dragonTowerDifficultyFromAction(fairnessAction);
  const safeRows = generateDragonTowerLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = {
    kind: "dragon-tower",
    difficulty,
    phase: "unverified",
    floor: 0,
    currentMultiplier: 0,
    picks: [],
    safeRows
  };
  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks = [];
    let cleared = 0;
    let transcriptValid = true;
    let lost = false;
    const config = DRAGON_TOWER_DIFFICULTIES[difficulty];
    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const floor = rawPick.floor;
      const column = rawPick.column;
      const declaredSafe = rawPick.safe;
      if (!Number.isSafeInteger(floor) || floor !== cleared + 1 || !Number.isSafeInteger(column) || column < 0 || column >= config.tiles || typeof declaredSafe !== "boolean") {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[floor - 1]?.includes(column) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ floor, column, safe });
      if (safe) cleared += 1;
      else lost = true;
    }
    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < DRAGON_TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(DRAGON_TOWER_PAYTABLE[difficulty][cleared - 1] ?? 0);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === DRAGON_TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(DRAGON_TOWER_PAYTABLE[difficulty][DRAGON_TOWER_FLOORS - 1] ?? 0);
    } else {
      transcriptValid = false;
    }
    transcriptValid &&= expected.kind === "dragon-tower";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= expected.floor === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "dragon-tower",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      floor: cleared,
      currentMultiplier: terminalMultiplier,
      picks,
      safeRows
    };
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function towerVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = towerDifficultyFromAction(fairnessAction);
  const safeRows = generateTowerLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = {
    kind: "tower",
    difficulty,
    phase: "unverified",
    floor: 0,
    currentMultiplier: 0,
    picks: [],
    safeRows
  };
  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks = [];
    let cleared = 0;
    let transcriptValid = true;
    let lost = false;
    const config = TOWER_DIFFICULTIES[difficulty];
    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const floor = rawPick.floor;
      const column = rawPick.column;
      const declaredSafe = rawPick.safe;
      if (!Number.isSafeInteger(floor) || floor !== cleared + 1 || !Number.isSafeInteger(column) || column < 0 || column >= config.tiles || typeof declaredSafe !== "boolean") {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[floor - 1]?.includes(column) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ floor, column, safe });
      if (safe) cleared += 1;
      else lost = true;
    }
    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(TOWER_PAYTABLE[difficulty][cleared - 1] ?? 0);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === TOWER_FLOORS;
      terminalMultiplier = quantizeMultiplier(TOWER_PAYTABLE[difficulty][TOWER_FLOORS - 1] ?? 0);
    } else {
      transcriptValid = false;
    }
    transcriptValid &&= expected.kind === "tower";
    transcriptValid &&= expected.difficulty === difficulty;
    transcriptValid &&= expected.floor === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "tower",
      difficulty,
      phase: typeof phase === "string" ? phase : "invalid",
      floor: cleared,
      currentMultiplier: terminalMultiplier,
      picks,
      safeRows
    };
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function molesVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const moles = molesCountFromAction(fairnessAction);
  const safeRows = generateMolesLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = {
    kind: "moles",
    moles,
    phase: "unverified",
    step: 0,
    currentMultiplier: 0,
    nextMultiplier: 0,
    picks: [],
    revealedMoles: [],
    lastPick: null,
    safeRows
  };
  if (recordValue(expected)) {
    const expectedRows = numberRows(expected.safeRows);
    const rawPicks = Array.isArray(expected.picks) ? expected.picks : [];
    const picks = [];
    let cleared = 0;
    let lost = false;
    let transcriptValid = true;
    for (const rawPick of rawPicks) {
      if (!recordValue(rawPick) || lost) {
        transcriptValid = false;
        break;
      }
      const step = rawPick.step;
      const tile = rawPick.tile;
      const declaredSafe = rawPick.safe;
      if (!Number.isSafeInteger(step) || step !== cleared + 1 || !Number.isSafeInteger(tile) || tile < 0 || tile >= MOLES_HOLE_COUNT || typeof declaredSafe !== "boolean") {
        transcriptValid = false;
        break;
      }
      const safe = safeRows[step - 1]?.includes(tile) === true;
      if (safe !== declaredSafe) transcriptValid = false;
      picks.push({ step, tile, safe });
      if (safe) cleared += 1;
      else lost = true;
    }
    const phase = expected.phase;
    if (phase === "lost") {
      transcriptValid &&= lost && picks.length > 0 && picks.at(-1)?.safe === false;
      terminalMultiplier = 0;
    } else if (phase === "cashed-out") {
      transcriptValid &&= !lost && cleared > 0 && cleared < moles;
      terminalMultiplier = molesMultiplier(moles, cleared);
    } else if (phase === "completed") {
      transcriptValid &&= !lost && cleared === moles;
      terminalMultiplier = molesMultiplier(moles, moles);
    } else {
      transcriptValid = false;
    }
    const expectedReveal = phase === "lost" || phase === "completed" ? safeRows[picks.length - 1] ?? [] : [];
    transcriptValid &&= expected.kind === "moles";
    transcriptValid &&= expected.moles === moles;
    transcriptValid &&= expected.step === cleared;
    transcriptValid &&= expected.currentMultiplier === terminalMultiplier;
    transcriptValid &&= expected.nextMultiplier === 0;
    transcriptValid &&= stableJson(expected.revealedMoles) === stableJson(expectedReveal);
    transcriptValid &&= stableJson(expected.lastPick) === stableJson(picks.at(-1) ?? null);
    transcriptValid &&= stableJson(expectedRows) === stableJson(safeRows);
    outcomeMatches = transcriptValid;
    canonicalOutcome = {
      kind: "moles",
      moles,
      phase: typeof phase === "string" ? phase : "invalid",
      step: cleared,
      currentMultiplier: terminalMultiplier,
      nextMultiplier: 0,
      picks,
      revealedMoles: expectedReveal,
      lastPick: picks.at(-1) ?? null,
      safeRows
    };
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function thirteenCardFlipVerification(request) {
  const dealt = resolveThirteenCardFlip(
    new FairRandom(request.serverSeed, {
      gameId: "thirteen-card-flip",
      clientSeed: request.clientSeed,
      nonce: request.nonce,
      action: "deal"
    }),
    "b"
  );
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let canonicalOutcome = dealt;
  if (recordValue(expected)) {
    const choices = Array.isArray(expected.playerChoices) ? expected.playerChoices.filter((item) => Number.isSafeInteger(item)) : [];
    const choicesValid = Array.isArray(expected.playerChoices) && choices.length === expected.playerChoices.length && choices.every((choice) => choice >= 0 && choice < 13) && new Set(choices).size === choices.length;
    const resolved = resolveInteractiveThirteenCardFlipFromHands(dealt.hands, "b", choicesValid ? choices : []);
    const roundId = typeof expected.roundId === "string" ? expected.roundId : "";
    canonicalOutcome = {
      ...resolved,
      ...roundId ? { roundId } : {}
    };
    outcomeMatches = choicesValid && roundId.length > 0 && resolved.phase === "completed" && stableJson(expected) === stableJson(canonicalOutcome);
    terminalMultiplier = resolved.phase === "completed" ? resolved.payout : 0;
  }
  const computed = { multiplier: terminalMultiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function warVerification(request) {
  let state = dealWar(
    warDraws(
      new FairRandom(request.serverSeed, {
        gameId: "rainbet-war",
        clientSeed: request.clientSeed,
        nonce: request.nonce,
        action: "deal"
      })
    )
  );
  let outcome = {};
  let multiplier = 0;
  let payout = 0;
  let wager = 0;
  let matches = false;
  try {
    const expected = request.expectedOutcome;
    if (!recordValue(expected) || !Array.isArray(expected.actions) || expected.actions.length > 3 || typeof expected.baseWagerMinor !== "string" || !/^[1-9]\d{0,14}$/.test(expected.baseWagerMinor) || typeof expected.roundId !== "string" || !expected.roundId)
      throw new Error("Invalid War receipt");
    const base = BigInt(expected.baseWagerMinor);
    state = withWarSideBets(state, `start:deal:${expected.tieWagerMinor}:${expected.colouredWagerMinor}`, base, request.usdScale);
    for (const action of expected.actions) state = actWar(state, action);
    outcome = warOutcome(state, expected.roundId, base);
    const committed = warCommitted(state, base);
    const paid = warPayout(state, base);
    payout = Number(paid) / verificationFactor(request);
    wager = Number(committed) / verificationFactor(request);
    multiplier = Number((Number(paid) / Number(committed)).toFixed(4));
    const last = state.actions.at(-1);
    const expectedAction = last ? `${last}:${expected.roundId}:${state.revision - 1}` : request.action === "start:deal" && state.tieMinor === "0" && state.colouredMinor === "0" ? "start:deal" : warStartAction(state);
    matches = state.phase === "settled" && request.action === expectedAction && stableJson(expected) === stableJson(outcome);
  } catch {
    matches = false;
  }
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    outcomeMatches: matches,
    settlementMatches: matches && request.wager === wager && request.expectedPayout === payout && request.expectedMultiplier === multiplier,
    computed: { outcome, multiplier }
  };
}
function blackjackVerification(request) {
  let state = dealBlackjack(
    blackjackShoe(
      new FairRandom(request.serverSeed, {
        gameId: "blackjack",
        clientSeed: request.clientSeed,
        nonce: request.nonce,
        action: "deal"
      })
    ),
    request.expectedOutcome?.rules === "six-deck-s17-v1" ? "six-deck-s17-v1" : "six-deck-s17-v2"
  );
  let outcome = {};
  let multiplier = 0;
  let payout = 0;
  let wager = 0;
  let matches = false;
  try {
    const expected = request.expectedOutcome;
    if (!recordValue(expected) || !Array.isArray(expected.actions) || expected.actions.length > 100 || typeof expected.baseWagerMinor !== "string" || !/^[1-9]\d{0,14}$/.test(expected.baseWagerMinor) || typeof expected.roundId !== "string" || !expected.roundId)
      throw new Error("Invalid Blackjack receipt");
    const base = BigInt(expected.baseWagerMinor);
    if (recordValue(expected.sideBets)) {
      const sides = expected.sideBets;
      if (!recordValue(sides.perfectPair) || !recordValue(sides.twentyOneThree)) throw new Error("Invalid side bets");
      state = withBlackjackSideBets(
        state,
        `start:deal:${sides.perfectPair.wagerMinor}:${sides.twentyOneThree.wagerMinor}`,
        base
      );
    }
    for (const action of expected.actions) state = actBlackjack(state, action);
    outcome = blackjackOutcome(state, expected.roundId, base);
    const committed = blackjackCommitted(state, base);
    const paid = blackjackPayout(state, base);
    payout = Number(paid) / verificationFactor(request);
    wager = Number(committed) / verificationFactor(request);
    multiplier = Number((Number(paid) / Number(committed)).toFixed(4));
    const last = state.actions.at(-1);
    const expectedAction = last ? `${last}:${expected.roundId}:${state.revision - 1}` : blackjackStartAction(state);
    matches = state.phase === "settled" && request.action === expectedAction && stableJson(expected) === stableJson(outcome);
  } catch {
    matches = false;
  }
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    outcomeMatches: matches,
    settlementMatches: matches && request.wager === wager && request.expectedPayout === payout && request.expectedMultiplier === multiplier,
    computed: { outcome, multiplier }
  };
}
function videoPokerVerification(request) {
  const dealt = dealVideoPoker(
    new FairRandom(request.serverSeed, {
      gameId: "video-poker",
      clientSeed: request.clientSeed,
      nonce: request.nonce,
      action: "deal"
    })
  );
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let multiplier = 0;
  let canonicalOutcome = {
    kind: "video-poker",
    phase: "hold",
    initialCards: dealt.initialCards
  };
  if (recordValue(expected)) {
    const held = Array.isArray(expected.held) ? expected.held.filter((index2) => Number.isSafeInteger(index2)) : [];
    try {
      const drawn = drawVideoPoker(dealt.deck, held);
      multiplier = drawn.result.multiplier;
      const roundId = typeof expected.roundId === "string" ? expected.roundId : "";
      canonicalOutcome = {
        kind: "video-poker",
        phase: "settled",
        ...roundId ? { roundId } : {},
        initialCards: drawn.initialCards,
        finalCards: drawn.finalCards,
        held: drawn.held,
        replacementCards: drawn.replacementCards,
        result: drawn.result
      };
      outcomeMatches = roundId.length > 0 && stableJson(expected) === stableJson(canonicalOutcome);
    } catch {
      outcomeMatches = false;
    }
  }
  const computed = { multiplier, outcome: canonicalOutcome };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, multiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === multiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function pumpVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const difficulty = pumpDifficultyFromAction(fairnessAction);
  const popPoint = generatePumpPopPoint(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  const maximumStep = PUMP_MULTIPLIERS[difficulty].length - 1;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let step = 0;
  let attemptedMultiplier = 1;
  let phase = "invalid";
  if (recordValue(expected)) {
    phase = typeof expected.phase === "string" ? expected.phase : "invalid";
    step = Number.isSafeInteger(expected.step) ? expected.step : -1;
    if (phase === "lost") {
      terminalMultiplier = 0;
      attemptedMultiplier = pumpMultiplier(difficulty, step);
      outcomeMatches = step === popPoint - 1;
    } else if (phase === "cashed-out") {
      terminalMultiplier = pumpMultiplier(difficulty, step);
      attemptedMultiplier = terminalMultiplier;
      outcomeMatches = step > 0 && step < maximumStep && step < popPoint;
    } else if (phase === "completed") {
      terminalMultiplier = pumpMultiplier(difficulty, maximumStep);
      attemptedMultiplier = terminalMultiplier;
      outcomeMatches = step === maximumStep && popPoint > maximumStep;
    }
    outcomeMatches &&= expected.kind === "pump";
    outcomeMatches &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    outcomeMatches &&= expected.difficulty === difficulty;
    outcomeMatches &&= expected.currentMultiplier === terminalMultiplier;
    outcomeMatches &&= expected.attemptedMultiplier === attemptedMultiplier;
    outcomeMatches &&= expected.nextMultiplier === 0;
    outcomeMatches &&= expected.chance === pumpChance(difficulty, step);
    outcomeMatches &&= expected.popPoint === popPoint;
  }
  const computed = {
    multiplier: terminalMultiplier,
    outcome: {
      kind: "pump",
      difficulty,
      phase,
      step,
      currentMultiplier: terminalMultiplier,
      attemptedMultiplier,
      nextMultiplier: 0,
      chance: pumpChance(difficulty, Math.max(0, step)),
      popPoint
    }
  };
  const computedPayout = request.wager === void 0 ? void 0 : verificationPayout(request, terminalMultiplier);
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function minesVerification(request) {
  const fairnessAction = request.fairnessAction ?? request.action;
  const { gridSize, mineCount } = minesConfigurationFromAction(fairnessAction);
  const mineLocations = generateMinesLayout(request.serverSeed, { ...request, action: fairnessAction });
  const expected = request.expectedOutcome;
  let outcomeMatches = false;
  let terminalMultiplier = 0;
  let phase = "invalid";
  let revealed = [];
  let computedPayout;
  if (recordValue(expected)) {
    phase = typeof expected.phase === "string" ? expected.phase : "invalid";
    const suppliedRevealed = Array.isArray(expected.revealed) ? expected.revealed : [];
    revealed = suppliedRevealed.filter((value) => Number.isSafeInteger(value));
    const uniqueRevealed = new Set(revealed);
    let transcriptValid = suppliedRevealed.length === revealed.length && uniqueRevealed.size === revealed.length;
    transcriptValid &&= revealed.every((index2) => index2 >= 0 && index2 < gridSize && !mineLocations.includes(index2));
    const reveal = /^reveal:([a-f\d-]+):(\d+)$/i.exec(request.action);
    const cashout = /^cashout:([a-f\d-]+)$/i.exec(request.action);
    const rawMultiplier = revealed.length ? quantizeMultiplier(minesMultiplierFor(gridSize, mineCount, revealed.length)) : 0;
    const rawPayout = request.wager === void 0 ? void 0 : verificationPayout(request, rawMultiplier);
    const capped = rawPayout !== void 0 && request.maxPayout !== void 0 && Number.isFinite(request.maxPayout) && request.maxPayout > 0 && rawPayout >= request.maxPayout;
    computedPayout = rawPayout === void 0 ? void 0 : capped && request.maxPayout !== void 0 ? request.maxPayout : rawPayout;
    if (phase === "lost") {
      const index2 = Number(reveal?.[2]);
      transcriptValid &&= Boolean(reveal) && mineLocations.includes(index2);
      terminalMultiplier = 0;
      computedPayout = request.wager === void 0 ? void 0 : 0;
    } else if (phase === "cashed-out") {
      const index2 = Number(reveal?.[2]);
      transcriptValid &&= revealed.length > 0 && revealed.length <= gridSize - mineCount && (Boolean(cashout) || Boolean(reveal) && capped && revealed.at(-1) === index2);
      terminalMultiplier = capped && request.maxPayout !== void 0 && request.wager !== void 0 ? quantizeMultiplier(request.maxPayout / request.wager) : rawMultiplier;
    } else if (phase === "completed") {
      const index2 = Number(reveal?.[2]);
      transcriptValid &&= Boolean(reveal) && !capped && revealed.length === gridSize - mineCount && revealed.at(-1) === index2;
      terminalMultiplier = rawMultiplier;
    } else {
      transcriptValid = false;
    }
    transcriptValid &&= expected.kind === "rainbet-mines";
    transcriptValid &&= typeof expected.roundId === "string" && expected.roundId.length > 0;
    transcriptValid &&= (reveal?.[1] ?? cashout?.[1]) === expected.roundId;
    transcriptValid &&= expected.gridSize === gridSize;
    transcriptValid &&= expected.mineCount === mineCount;
    transcriptValid &&= stableJson(expected.mineLocations) === stableJson(mineLocations);
    outcomeMatches = transcriptValid;
  }
  const computed = {
    multiplier: terminalMultiplier,
    outcome: { kind: "rainbet-mines", gridSize, mineCount, phase, revealed, mineLocations }
  };
  return {
    commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: outcomeMatches && request.expectedMultiplier === terminalMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}
function verify(request) {
  if (request.gameId === "rps-ascent" && request.expectedOutcome?.rules === "rps-ladder-v1") {
    let computed2 = { multiplier: 0, outcome: { kind: "rps-ascent" } };
    let outcomeMatches = false, settlementMatches = false;
    try {
      const expected = request.expectedOutcome, base = BigInt(Math.round((request.wager ?? 1) * verificationFactor(request)));
      const roundId = String(expected.roundId);
      const kernel = new RpsAscentRoundKernel({
        roundId,
        gameId: "rps-ascent",
        wagerMinor: base,
        maximumPayoutMinor: base * 10000n,
        action: "start:run",
        serverSeed: request.serverSeed,
        clientSeed: request.clientSeed,
        nonce: request.nonce
      });
      if (!Array.isArray(expected.throws) || expected.throws.length > 120) throw new Error("Invalid RPS transcript");
      let sequence = 0;
      for (const move of expected.throws) {
        if (!move || typeof move !== "object" || !("player" in move)) throw new Error("Invalid RPS throw");
        kernel.advance({ roundId, sequence: ++sequence, requestId: `replay-${sequence}`, action: `throw:${roundId}:${move.player}` });
      }
      if (expected.phase === "cashed-out") kernel.advance({ roundId, sequence: ++sequence, requestId: "replay-cashout", action: `cashout:${roundId}` });
      const view = kernel.view();
      computed2 = { multiplier: view.multiplier, outcome: view.outcome };
      const lastThrow = expected.throws.at(-1);
      const finalAction = expected.phase === "cashed-out" ? `cashout:${roundId}` : lastThrow ? `throw:${roundId}:${lastThrow.player}` : "start:run";
      outcomeMatches = request.action === finalAction && (request.fairnessAction ?? "start:run") === "start:run" && stableJson(view.outcome) === stableJson(expected);
      settlementMatches = outcomeMatches && request.expectedMultiplier === view.multiplier && request.expectedPayout === Number(view.payoutMinor) / verificationFactor(request);
    } catch {
    }
    return {
      commitmentValid: equalHex(commitmentFor(request.serverSeed), request.serverSeedHash),
      outcomeMatches,
      ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : { settlementMatches },
      computed: computed2
    };
  }
  if (request.gameId === "rainbet-war" && request.fairnessAction === "start:deal") return warVerification(request);
  if (request.gameId === "blackjack" && request.fairnessAction === "start:deal") return blackjackVerification(request);
  if (request.gameId === "stake-pump" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return pumpVerification(request);
  }
  if (request.gameId === "chicken-cross") return chickenVerification(request);
  if (request.gameId === "floor-is-lava") return floorLavaVerification(request);
  if (request.gameId === "dragon-tower") return dragonTowerVerification(request);
  if (request.gameId === "tower") return towerVerification(request);
  if (request.gameId === "moles" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return molesVerification(request);
  }
  if (request.gameId === "rainbet-mines" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return minesVerification(request);
  }
  if (request.gameId === "thirteen-card-flip" && (request.fairnessAction ?? request.action).startsWith("start:")) {
    return thirteenCardFlipVerification(request);
  }
  if (request.gameId === "video-poker" && (request.fairnessAction ?? request.action) === "start:deal") {
    return videoPokerVerification(request);
  }
  const replayContext = {
    ...request,
    ...request.gameId === "blackjack" && request.blackjackRules === void 0 && request.expectedOutcome?.rules === "six-deck-s17-v1" ? { blackjackRules: "six-deck-s17-v1" } : {},
    ...request.gameId === "packs" && request.packsMathVersion === void 0 && request.expectedOutcome !== void 0 && !("mathVersion" in request.expectedOutcome) ? { packsMathVersion: "legacy" } : {},
    ...request.gameId === "midas-feast" && request.midasMathVersion === void 0 && request.expectedOutcome !== void 0 && !("mathVersion" in request.expectedOutcome) ? { midasMathVersion: "legacy" } : {},
    ...request.slotMathVersion === void 0 && request.expectedOutcome !== void 0 && !("payoutCalibration" in request.expectedOutcome) ? { slotMathVersion: "legacy" } : {},
    ...request.slotMathVersion === void 0 && request.expectedOutcome?.payoutCalibration !== null && typeof request.expectedOutcome?.payoutCalibration === "object" && request.expectedOutcome.payoutCalibration.version === "slot-payout-calibration-v1" ? { slotMathVersion: "slot-payout-calibration-v1" } : {},
    ...request.slotMathVersion === void 0 && request.expectedOutcome?.payoutCalibration !== null && typeof request.expectedOutcome?.payoutCalibration === "object" && request.expectedOutcome.payoutCalibration.version === "slot-payout-calibration-v2" ? { slotMathVersion: "slot-payout-calibration-v2" } : {},
    ...request.gameId === "tarot" && request.tarotMathVersion === void 0 && request.expectedOutcome !== void 0 && !("mathVersion" in request.expectedOutcome) ? { tarotMathVersion: "legacy" } : {}
  };
  let computed = outcomeFor(request.serverSeed, replayContext);
  if (request.gameId === "midas-feast" && request.midasMathVersion === void 0 && request.expectedOutcome !== void 0 && !("mathVersion" in request.expectedOutcome) && stableJson(computed.outcome) !== stableJson(request.expectedOutcome)) {
    const candidate = outcomeFor(request.serverSeed, { ...replayContext, midasMathVersion: "midas-grid-v2" });
    const { mathVersion: _version, ...historicalOutcome } = candidate.outcome;
    if (stableJson(historicalOutcome) === stableJson(request.expectedOutcome)) {
      computed = { ...candidate, outcome: historicalOutcome };
    }
  }
  const commitmentValid = equalHex(commitmentFor(request.serverSeed), request.serverSeedHash);
  const costMultiplier = request.gameId === "odins-vault" ? odinsVaultCostMultiplierForAction(request.action) : request.gameId === "gates-of-olympus-super-scatter" ? gatesSuperScatterCostMultiplierForAction(request.action) : request.gameId === "wanted-dead-or-wild" ? wantedCostMultiplierForAction(request.action) : request.gameId === "neon-syndicate" ? neonSyndicateCostMultiplierForAction(request.action) : 1;
  const settlementMultiplier = quantizeSettlementMultiplier(request.gameId, computed.multiplier / costMultiplier);
  const computedPayout = request.wager === void 0 ? void 0 : request.gameId === "baccarat" && request.action.startsWith("bets:v2:") ? Number(baccaratPayoutMinor(computed.outcome, BigInt(Math.round(request.wager * verificationFactor(request))), request.usdScale === 8 ? "floor-minor-v1" : "half-up")) / verificationFactor(request) : verificationPayout(request, settlementMultiplier);
  return {
    commitmentValid,
    ...request.expectedOutcome === void 0 ? {} : { outcomeMatches: stableJson(request.expectedOutcome) === stableJson(computed.outcome) },
    ...request.expectedMultiplier === void 0 && request.expectedPayout === void 0 ? {} : {
      settlementMatches: request.expectedMultiplier === settlementMultiplier && request.wager !== void 0 && request.expectedPayout === computedPayout
    },
    computed
  };
}

// verifier/verify-fairness.mjs
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var finiteNumber2 = (value) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : void 0;
};
function roundsFrom(value) {
  if (Array.isArray(value)) return value;
  if (record(value) && Array.isArray(value.rounds)) return value.rounds;
  return [value];
}
function printChecks(index2, id, checks) {
  console.log(`Round ${index2 + 1}${id ? ` (${id})` : ""}`);
  for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
}
function verifyFairnessExport(value, { print = false } = {}) {
  const results = roundsFrom(value).map((candidate, index2) => {
    const schemaValid = record(candidate) && typeof candidate.gameId === "string" && isEnabledGameId(candidate.gameId) && typeof candidate.clientSeed === "string" && Number.isSafeInteger(candidate.nonce) && candidate.nonce >= 0 && typeof candidate.action === "string" && record(candidate.outcome) && typeof candidate.serverSeedHash === "string";
    const wager = record(candidate) ? finiteNumber2(candidate.wager) : void 0;
    const payout = record(candidate) ? finiteNumber2(candidate.payout) : void 0;
    const multiplier = record(candidate) ? finiteNumber2(candidate.multiplier) : void 0;
    const revealed = record(candidate) ? candidate.revealedServerSeed : void 0;
    let checks = {
      schema: schemaValid && wager !== void 0 && payout !== void 0 && multiplier !== void 0,
      "serverSeed.revealed": typeof revealed === "string" && revealed.length > 0,
      commitment: false,
      outcome: false,
      multiplier: false,
      payout: false
    };
    if (checks.schema && checks["serverSeed.revealed"] && record(candidate) && typeof revealed === "string") {
      const result = verify({
        serverSeed: revealed,
        serverSeedHash: candidate.serverSeedHash,
        gameId: candidate.gameId,
        clientSeed: candidate.clientSeed,
        nonce: candidate.nonce,
        action: candidate.action,
        ...typeof candidate.fairnessAction === "string" ? { fairnessAction: candidate.fairnessAction } : {},
        expectedOutcome: candidate.outcome,
        expectedMultiplier: multiplier,
        wager,
        expectedPayout: payout
      });
      const costMultiplier = candidate.gameId === "odins-vault" ? odinsVaultCostMultiplierForAction(candidate.action) : 1;
      const computedMultiplier = quantizeSettlementMultiplier(
        candidate.gameId,
        result.computed.multiplier / costMultiplier
      );
      const computedPayout = Math.round(wager * computedMultiplier * 100) / 100;
      checks = {
        ...checks,
        commitment: result.commitmentValid,
        outcome: result.outcomeMatches === true,
        multiplier: multiplier === computedMultiplier,
        payout: payout === computedPayout
      };
    }
    const id = record(candidate) && typeof candidate.id === "string" ? candidate.id : "";
    if (print) printChecks(index2, id, checks);
    return { id, ok: Object.values(checks).every(Boolean), checks };
  });
  return { ok: results.length > 0 && results.every((result) => result.ok), rounds: results };
}
function usage() {
  return "Usage: node verifier/verify-fairness.mjs <round-or-history.json>";
}
function main(argv) {
  const inputPath = argv[0];
  if (!inputPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  try {
    const value = JSON.parse(readFileSync(inputPath, "utf8"));
    const result = verifyFairnessExport(value, { print: true });
    console.log(`
${result.ok ? "VERIFIED" : "REJECTED"}: ${result.rounds.length} round${result.rounds.length === 1 ? "" : "s"}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error("REJECTED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
export {
  verifyFairnessExport
};
