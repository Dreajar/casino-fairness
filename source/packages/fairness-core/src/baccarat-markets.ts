import {
  BACCARAT_RANKS,
  BACCARAT_SUITS,
  type BaccaratCard,
  baccaratBankerDraws,
  baccaratCardValue,
  baccaratTotal,
  baccaratWinner
} from "./index.ts";

export const BACCARAT_MARKETS = [
  "player",
  "tie",
  "banker",
  "player-pair",
  "banker-pair",
  "either-pair",
  "perfect-pair",
  "player-bonus",
  "banker-bonus"
] as const;
export type BaccaratMarket = (typeof BACCARAT_MARKETS)[number];
export type BaccaratBasket = Readonly<Partial<Record<BaccaratMarket, number>>>;
export const BACCARAT_BONUS_RETURNS = [0, 0, 0, 0, 2, 3, 5, 7, 11, 31] as const;

/** Versioned integer weights, in market order. Old bet:* actions retain their original proofs. */
export function parseBaccaratBets(action: string): BaccaratBasket {
  const text = action.match(/^bets:v2:((?:\d+,){8}\d+)$/)?.[1];
  if (!text) throw new Error("Invalid baccarat bet allocation");
  const amounts = text.split(",").map(Number);
  if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1_000_000_000_000) || !amounts.some((n) => n > 0))
    throw new Error("Invalid baccarat bet allocation");
  return Object.fromEntries(BACCARAT_MARKETS.map((market, i) => [market, amounts[i] ?? 0]));
}
export function baccaratBetAction(bets: BaccaratBasket): string {
  const action = `bets:v2:${BACCARAT_MARKETS.map((market) => bets[market] ?? 0).join(",")}`;
  parseBaccaratBets(action);
  return action;
}
export function baccaratMarketReturns(
  player: readonly Pick<BaccaratCard, "rank" | "suit" | "value">[],
  banker: readonly Pick<BaccaratCard, "rank" | "suit" | "value">[]
): Record<BaccaratMarket, number> {
  const p = baccaratTotal(player),
    b = baccaratTotal(banker);
  const winner = baccaratWinner(p, b);
  const natural = baccaratTotal(player.slice(0, 2)) >= 8 || baccaratTotal(banker.slice(0, 2)) >= 8;
  const pair = (cards: typeof player) => cards.length >= 2 && cards[0]?.rank === cards[1]?.rank;
  const perfect = (cards: typeof player) => pair(cards) && cards[0]?.suit === cards[1]?.suit;
  const pp = pair(player),
    bp = pair(banker);
  const bonus = (side: "player" | "banker") =>
    natural
      ? winner === "tie"
        ? 1
        : winner === side
          ? 2
          : 0
      : winner === side
        ? (BACCARAT_BONUS_RETURNS[Math.abs(p - b)] ?? 0)
        : 0;
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
export function resolveBaccaratV2(random: { int(max: number): number }, action: string) {
  const bets = parseBaccaratBets(action);
  const dealOrder: BaccaratCard[] = [];
  const draw = () => {
    const index = random.int(52);
    const rank = BACCARAT_RANKS[index % 13]!;
    const suit = BACCARAT_SUITS[Math.floor(index / 13)]!;
    const card = {
      id: `draw-${dealOrder.length}-${suit}-${rank}`,
      deck: 0,
      rank,
      suit,
      value: baccaratCardValue(rank)
    };
    dealOrder.push(card);
    return card;
  };
  const player = [draw()],
    banker = [draw()];
  player.push(draw());
  banker.push(draw());
  const natural = baccaratTotal(player) >= 8 || baccaratTotal(banker) >= 8;
  if (!natural) {
    if (baccaratTotal(player) <= 5) player.push(draw());
    if (baccaratBankerDraws(baccaratTotal(banker), player[2]?.value)) banker.push(draw());
  }
  const returns = baccaratMarketReturns(player, banker);
  const legs = BACCARAT_MARKETS.filter((market) => (bets[market] ?? 0) > 0).map((market) => ({
    market,
    weight: bets[market]!,
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
      bet: legs.length === 1 ? legs[0]!.market : "multiple",
      bets: legs,
      marketReturns: returns,
      payoutRatio: { numerator: numerator.toString(), denominator: denominator.toString() },
      winner: baccaratWinner(baccaratTotal(player), baccaratTotal(banker)),
      natural,
      player: { cards: player, total: baccaratTotal(player), drewThird: player.length === 3 },
      banker: { cards: banker, total: baccaratTotal(banker), drewThird: banker.length === 3 },
      dealOrder
    }
  };
}
/** Aggregate the exact rational return, then round once to the wallet's smallest unit. */
export function baccaratPayoutMinor(outcome: Readonly<Record<string, unknown>>, wagerMinor: bigint, rounding: "half-up" | "floor-minor-v1" = "half-up"): bigint {
  const ratio = outcome.payoutRatio as { numerator: string; denominator: string };
  const n = BigInt(ratio.numerator),
    d = BigInt(ratio.denominator);
  if (d <= 0n || n < 0n || n > 31n * d || wagerMinor < 0n) throw new Error("Invalid baccarat payout ratio");
  return rounding === "floor-minor-v1" ? wagerMinor * n / d : (wagerMinor * n * 2n + d) / (2n * d);
}

/** Exact expectation from all 10^6 value sequences (zero has probability 4/13). */
let cachedRtp: Readonly<Record<BaccaratMarket, number>> | undefined;
export function baccaratV2Rtp(): Readonly<Record<BaccaratMarket, number>> {
  if (cachedRtp) return cachedRtp;
  const rtp = Object.fromEntries(BACCARAT_MARKETS.map((m) => [m, 0])) as Record<BaccaratMarket, number>;
  const weights = [4, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const settle = (p: number, b: number, natural: boolean, probability: number) => {
    const winner = baccaratWinner(p, b);
    rtp.player += probability * (winner === "player" ? 2 : winner === "tie" ? 1 : 0);
    rtp.banker += probability * (winner === "banker" ? 1.95 : winner === "tie" ? 1 : 0);
    rtp.tie += probability * (winner === "tie" ? 9 : 0);
    for (const side of ["player", "banker"] as const)
      rtp[`${side}-bonus`] +=
        probability *
        (natural
          ? winner === "tie"
            ? 1
            : winner === side
              ? 2
              : 0
          : winner === side
            ? BACCARAT_BONUS_RETURNS[Math.abs(p - b)]!
            : 0);
  };
  for (let a = 0; a < 10; a++)
    for (let b = 0; b < 10; b++)
      for (let c = 0; c < 10; c++)
        for (let d = 0; d < 10; d++) {
          const p = (a + c) % 10,
            bank = (b + d) % 10,
            prob = (weights[a]! * weights[b]! * weights[c]! * weights[d]!) / 13 ** 4;
          if (p >= 8 || bank >= 8) {
            settle(p, bank, true, prob);
            continue;
          }
          for (let e = 0; e < (p <= 5 ? 10 : 1); e++) {
            const pt = p <= 5 ? e : undefined,
              pp = pt === undefined ? prob : (prob * weights[e]!) / 13;
            const pf = pt === undefined ? p : (p + pt) % 10;
            if (!baccaratBankerDraws(bank, pt)) settle(pf, bank, false, pp);
            else for (let f = 0; f < 10; f++) settle(pf, (bank + f) % 10, false, (pp * weights[f]!) / 13);
          }
        }
  rtp["player-pair"] = rtp["banker-pair"] = 12 / 13;
  rtp["either-pair"] = 6 * (1 - (12 / 13) ** 2);
  rtp["perfect-pair"] = 26 * (1 - (51 / 52) ** 2);
  cachedRtp = rtp;
  return rtp;
}
export function baccaratBasketRtp(action: string): number {
  const bets = parseBaccaratBets(action),
    rtp = baccaratV2Rtp();
  const total = BACCARAT_MARKETS.reduce((s, m) => s + (bets[m] ?? 0), 0);
  return BACCARAT_MARKETS.reduce((s, m) => s + (bets[m] ?? 0) * rtp[m], 0) / total;
}

/** Reporting precision only; this never rounds a wager or a monetary payout. */
export function baccaratBasketRtpBps(action: string): number {
  return Math.round(baccaratBasketRtp(action) * 10_000);
}
