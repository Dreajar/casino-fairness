export const EUROPEAN_WHEEL = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
]);

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function rouletteColor(number) {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

export function winningBetKeys(number) {
  if (!Number.isInteger(number) || number < 0 || number > 36) throw new RangeError("Roulette result must be an integer from 0 through 36");
  const keys = new Set([`number:${number}`]);
  if (number === 0) return keys;
  keys.add(`color:${rouletteColor(number)}`);
  keys.add(number % 2 ? "parity:odd" : "parity:even");
  keys.add(number <= 18 ? "range:low" : "range:high");
  keys.add(`dozen:${Math.ceil(number / 12)}`);
  keys.add(`column:${number % 3 || 3}`);
  return keys;
}

export function multiplierForBet(key) {
  if (key.startsWith("number:")) return 36;
  if (key.startsWith("dozen:") || key.startsWith("column:")) return 3;
  if (key.startsWith("color:") || key.startsWith("parity:") || key.startsWith("range:")) return 2;
  return 0;
}

export function settleRouletteBets(bets, result) {
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

export function theoreticalRtp() {
  return 36 / 37;
}
