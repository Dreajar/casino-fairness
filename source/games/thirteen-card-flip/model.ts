export const THIRTEEN_CARD_FLIP_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const THIRTEEN_CARD_FLIP_SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const THIRTEEN_CARD_FLIP_PAYOUT = 1.96;
export const THIRTEEN_CARD_FLIP_TIE_PAYOUT = 1;

export type ThirteenCardFlipRank = (typeof THIRTEEN_CARD_FLIP_RANKS)[number];
export type ThirteenCardFlipSuit = (typeof THIRTEEN_CARD_FLIP_SUITS)[number];
export type ThirteenCardFlipPlayer = "a" | "b";
export type ThirteenCardFlipWinner = ThirteenCardFlipPlayer | "tie";

export interface ThirteenCardFlipCard {
  readonly id: string;
  readonly rank: ThirteenCardFlipRank;
  readonly rankValue: number;
  readonly suit: ThirteenCardFlipSuit;
  readonly red: boolean;
}

export interface ThirteenCardFlipScore {
  readonly category: number;
  readonly categoryName: string;
  readonly label: string;
  readonly tiebreakers: readonly number[];
}

export interface ThirteenCardFlipReveal {
  readonly ordinal: number;
  readonly turn: number;
  readonly player: ThirteenCardFlipPlayer;
  readonly playerIndex: number;
  readonly card: ThirteenCardFlipCard;
  readonly score: ThirteenCardFlipScore;
  readonly takesLead: boolean;
  readonly leader: ThirteenCardFlipPlayer;
}

export interface ThirteenCardFlipOutcome {
  readonly kind: "thirteen-card-flip";
  readonly roundId?: string;
  readonly phase?: "active" | "completed";
  readonly awaitingChoice?: ThirteenCardFlipPlayer;
  readonly playerChoices?: readonly number[];
  readonly selected: ThirteenCardFlipPlayer;
  readonly winner: ThirteenCardFlipWinner;
  readonly won: boolean;
  readonly tied: boolean;
  readonly payout: number;
  readonly hands: Readonly<Record<ThirteenCardFlipPlayer, readonly ThirteenCardFlipCard[]>>;
  readonly reveals: readonly ThirteenCardFlipReveal[];
  readonly revealedCounts: Readonly<Record<ThirteenCardFlipPlayer, number>>;
  readonly finalScores: Readonly<Record<ThirteenCardFlipPlayer, ThirteenCardFlipScore>>;
}

export interface ThirteenCardFlipRandom {
  int(maxExclusive: number): number;
}

const categoryNames = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush"
] as const;

const rankWords: Readonly<Record<number, string>> = {
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

const rankLabels: Readonly<Record<number, string>> = Object.fromEntries(
  THIRTEEN_CARD_FLIP_RANKS.map((rank, index) => [index + 2, rank])
);

function score(category: number, tiebreakers: readonly number[]): ThirteenCardFlipScore {
  const primary = tiebreakers[0] ?? 0;
  const secondary = tiebreakers[1] ?? 0;
  let label: string = categoryNames[category] ?? "High Card";
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

function straightHigh(cards: readonly ThirteenCardFlipCard[]): number | undefined {
  const ranks = [...new Set(cards.map((card) => card.rankValue))].sort((left, right) => right - left);
  if (ranks.includes(14)) ranks.push(1);
  let run = 1;
  for (let index = 1; index < ranks.length; index += 1) {
    if ((ranks[index - 1] ?? 0) - (ranks[index] ?? 0) === 1) run += 1;
    else run = 1;
    if (run >= 5) return ranks[index - 4];
  }
  return undefined;
}

function evaluateGroupHand(cards: readonly ThirteenCardFlipCard[]): ThirteenCardFlipScore {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rankValue, (counts.get(card.rankValue) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) => rightCount - leftCount || rightRank - leftRank
  );
  const quads = groups.find(([, count]) => count === 4)?.[0];
  if (quads !== undefined)
    return score(7, [
      quads,
      ...groups
        .filter(([rank]) => rank !== quads)
        .map(([rank]) => rank)
        .sort((a, b) => b - a)
    ]);
  const trips = groups
    .filter(([, count]) => count >= 3)
    .map(([rank]) => rank)
    .sort((a, b) => b - a);
  const pairs = groups
    .filter(([, count]) => count >= 2)
    .map(([rank]) => rank)
    .sort((a, b) => b - a);
  if (trips.length > 0)
    return score(3, [
      trips[0] ?? 0,
      ...groups
        .filter(([rank]) => rank !== trips[0])
        .map(([rank]) => rank)
        .sort((a, b) => b - a)
    ]);
  if (pairs.length >= 2) {
    const first = pairs[0] ?? 0;
    const second = pairs[1] ?? 0;
    const kickers = groups
      .filter(([rank]) => rank !== first && rank !== second)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    return score(2, [first, second, ...kickers]);
  }
  if (pairs.length === 1) {
    const pair = pairs[0] ?? 0;
    return score(1, [
      pair,
      ...groups
        .filter(([rank]) => rank !== pair)
        .map(([rank]) => rank)
        .sort((a, b) => b - a)
    ]);
  }
  return score(
    0,
    groups.map(([rank]) => rank).sort((a, b) => b - a)
  );
}

function evaluateFive(cards: readonly ThirteenCardFlipCard[]): ThirteenCardFlipScore {
  const groups = new Map<number, number>();
  for (const card of cards) groups.set(card.rankValue, (groups.get(card.rankValue) ?? 0) + 1);
  const grouped = [...groups.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) => rightCount - leftCount || rightRank - leftRank
  );
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straight = straightHigh(cards);
  if (flush && straight !== undefined) return score(8, [straight]);
  const quads = grouped.find(([, count]) => count === 4)?.[0];
  if (quads !== undefined) {
    const kicker = grouped.find(([rank]) => rank !== quads)?.[0] ?? 0;
    return score(7, [quads, kicker]);
  }
  const trips = grouped.find(([, count]) => count === 3)?.[0];
  const pair = grouped.find(([rank, count]) => count >= 2 && rank !== trips)?.[0];
  if (trips !== undefined && pair !== undefined) return score(6, [trips, pair]);
  const descending = cards.map((card) => card.rankValue).sort((left, right) => right - left);
  if (flush) return score(5, descending);
  if (straight !== undefined) return score(4, [straight]);
  if (trips !== undefined) return score(3, [trips, ...descending.filter((rank) => rank !== trips)]);
  const pairs = grouped
    .filter(([, count]) => count === 2)
    .map(([rank]) => rank)
    .sort((a, b) => b - a);
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

function combinationsOfFive(cards: readonly ThirteenCardFlipCard[]): readonly (readonly ThirteenCardFlipCard[])[] {
  const combinations: ThirteenCardFlipCard[][] = [];
  for (let first = 0; first < cards.length - 4; first += 1)
    for (let second = first + 1; second < cards.length - 3; second += 1)
      for (let third = second + 1; third < cards.length - 2; third += 1)
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1)
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            const hand = [cards[first], cards[second], cards[third], cards[fourth], cards[fifth]];
            if (hand.every((card) => card !== undefined)) combinations.push(hand as ThirteenCardFlipCard[]);
          }
  return combinations;
}

export function compareThirteenCardFlipScores(left: ThirteenCardFlipScore, right: ThirteenCardFlipScore): number {
  if (left.category !== right.category) return left.category - right.category;
  const length = Math.max(left.tiebreakers.length, right.tiebreakers.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.tiebreakers[index] ?? 0) - (right.tiebreakers[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function evaluateThirteenCardFlipHand(cards: readonly ThirteenCardFlipCard[]): ThirteenCardFlipScore {
  if (cards.length < 5) return evaluateGroupHand(cards);
  let best = score(0, []);
  for (const hand of combinationsOfFive(cards)) {
    const candidate = evaluateFive(hand);
    if (compareThirteenCardFlipScores(candidate, best) > 0) best = candidate;
  }
  return best;
}

const comboCardCounts = [1, 2, 4, 3, 5, 5, 5, 4, 5] as const;
const comboTiebreakerCounts = [1, 1, 2, 1, 1, 5, 2, 1, 1] as const;

function combinationsOfSizeIndexes(cardCount: number, size: number): readonly (readonly number[])[] {
  const combinations: number[][] = [];
  const candidate: number[] = [];
  const collect = (start: number) => {
    if (candidate.length === size) {
      combinations.push([...candidate]);
      return;
    }
    for (let index = start; index <= cardCount - (size - candidate.length); index += 1) {
      candidate.push(index);
      collect(index + 1);
      candidate.pop();
    }
  };
  collect(0);
  return combinations;
}

/**
 * Returns the revealed-card indexes that visually make up the current combination.
 * Kickers stay face up in the pile: for example, 2-K-K returns [1, 2], not all
 * three cards. The returned indexes preserve reveal order so physical cards keep
 * stable positions while moving between the pile and the in-play row.
 */
export function bestThirteenCardFlipComboIndexes(cards: readonly ThirteenCardFlipCard[]): readonly number[] {
  if (cards.length === 0) return [];
  const best = evaluateThirteenCardFlipHand(cards);
  const comboSize = comboCardCounts[best.category] ?? 1;
  const comparedTiebreakers = comboTiebreakerCounts[best.category] ?? 1;
  for (const indexes of combinationsOfSizeIndexes(cards.length, comboSize)) {
    const candidateCards = indexes.map((index) => cards[index]).filter((card) => card !== undefined);
    if (candidateCards.length !== comboSize) continue;
    const candidate = evaluateThirteenCardFlipHand(candidateCards);
    if (candidate.category !== best.category) continue;
    if (
      Array.from({ length: comparedTiebreakers }, (_, index) => index).every(
        (index) => candidate.tiebreakers[index] === best.tiebreakers[index]
      )
    )
      return indexes;
  }
  return [];
}

export function thirteenCardFlipInPlayIndexes(cards: readonly ThirteenCardFlipCard[]): readonly number[] {
  if (evaluateThirteenCardFlipHand(cards).category < 1) return cards.map((_, index) => index);
  return bestThirteenCardFlipComboIndexes(cards);
}

function straightRanks(high: number): readonly number[] {
  return high === 5 ? [14, 5, 4, 3, 2] : [high, high - 1, high - 2, high - 3, high - 4];
}

/**
 * Uses public information only. Remaining House cards are treated as unknown
 * wild possibilities from every card that has not already been revealed.
 */
function canThirteenCardFlipHousePossiblyReach(
  visibleHouse: readonly ThirteenCardFlipCard[],
  visiblePlayer: readonly ThirteenCardFlipCard[],
  remainingHouseCards: number,
  leaderScore: ThirteenCardFlipScore,
  includeTie: boolean
): boolean {
  const reachesLeader = (candidate: ThirteenCardFlipScore) => {
    const comparison = compareThirteenCardFlipScores(candidate, leaderScore);
    return includeTie ? comparison >= 0 : comparison > 0;
  };
  if (remainingHouseCards <= 0) return reachesLeader(evaluateThirteenCardFlipHand(visibleHouse));

  const deck = createThirteenCardFlipDeck();
  const houseIds = new Set(visibleHouse.map((card) => card.id));
  const playerIds = new Set(visiblePlayer.map((card) => card.id));
  const ranksDescending = Array.from({ length: 13 }, (_, index) => 14 - index);
  const reachesLeaderScore = (category: number, tiebreakers: readonly number[]) =>
    reachesLeader(score(category, tiebreakers));
  const canReachExactCards = (cards: readonly ThirteenCardFlipCard[]) => {
    if (cards.some((card) => playerIds.has(card.id))) return false;
    return cards.filter((card) => !houseIds.has(card.id)).length <= remainingHouseCards;
  };
  const canReachRankCounts = (requirements: ReadonlyMap<number, number>) => {
    let missing = 0;
    for (const [rank, required] of requirements) {
      const held = visibleHouse.filter((card) => card.rankValue === rank).length;
      const blocked = visiblePlayer.filter((card) => card.rankValue === rank).length;
      if (4 - blocked < required) return false;
      missing += Math.max(0, required - held);
    }
    return missing <= remainingHouseCards;
  };
  const rankCombinations = (values: readonly number[], count: number) =>
    combinationsOfSizeIndexes(values.length, count).map((indexes) =>
      indexes.map((index) => values[index]).filter((rank) => rank !== undefined)
    );

  for (let high = 14; high >= 5; high -= 1) {
    for (const suit of THIRTEEN_CARD_FLIP_SUITS) {
      const cards = straightRanks(high)
        .map((rank) => deck.find((card) => card.rankValue === rank && card.suit === suit))
        .filter((card) => card !== undefined);
      if (cards.length === 5 && canReachExactCards(cards) && reachesLeaderScore(8, [high])) return true;
    }
  }

  for (const quads of ranksDescending) {
    for (const kicker of ranksDescending) {
      if (kicker === quads) continue;
      if (
        canReachRankCounts(
          new Map([
            [quads, 4],
            [kicker, 1]
          ])
        ) &&
        reachesLeaderScore(7, [quads, kicker])
      )
        return true;
    }
  }

  for (const trips of ranksDescending) {
    for (const paired of ranksDescending) {
      if (paired === trips) continue;
      if (
        canReachRankCounts(
          new Map([
            [trips, 3],
            [paired, 2]
          ])
        ) &&
        reachesLeaderScore(6, [trips, paired])
      )
        return true;
    }
  }

  for (const suit of THIRTEEN_CARD_FLIP_SUITS) {
    for (const ranks of rankCombinations(ranksDescending, 5)) {
      const cards = ranks
        .map((rank) => deck.find((card) => card.rankValue === rank && card.suit === suit))
        .filter((card) => card !== undefined);
      if (cards.length === 5 && canReachExactCards(cards) && reachesLeaderScore(5, ranks)) return true;
    }
  }

  for (let high = 14; high >= 5; high -= 1) {
    if (canReachRankCounts(new Map(straightRanks(high).map((rank) => [rank, 1]))) && reachesLeaderScore(4, [high]))
      return true;
  }

  for (const trips of ranksDescending) {
    const kickers = ranksDescending.filter((rank) => rank !== trips);
    for (const [first, second] of rankCombinations(kickers, 2)) {
      if (first === undefined || second === undefined) continue;
      if (
        canReachRankCounts(
          new Map([
            [trips, 3],
            [first, 1],
            [second, 1]
          ])
        ) &&
        reachesLeaderScore(3, [trips, first, second])
      )
        return true;
    }
  }

  for (const [firstPair, secondPair] of rankCombinations(ranksDescending, 2)) {
    if (firstPair === undefined || secondPair === undefined) continue;
    for (const kicker of ranksDescending) {
      if (kicker === firstPair || kicker === secondPair) continue;
      if (
        canReachRankCounts(
          new Map([
            [firstPair, 2],
            [secondPair, 2],
            [kicker, 1]
          ])
        ) &&
        reachesLeaderScore(2, [firstPair, secondPair, kicker])
      )
        return true;
    }
  }

  for (const paired of ranksDescending) {
    const kickers = ranksDescending.filter((rank) => rank !== paired);
    for (const [first, second, third] of rankCombinations(kickers, 3)) {
      if (first === undefined || second === undefined || third === undefined) continue;
      if (
        canReachRankCounts(
          new Map([
            [paired, 2],
            [first, 1],
            [second, 1],
            [third, 1]
          ])
        ) &&
        reachesLeaderScore(1, [paired, first, second, third])
      )
        return true;
    }
  }

  return leaderScore.category <= 0;
}

export function canThirteenCardFlipHousePossiblyOvertake(
  visibleHouse: readonly ThirteenCardFlipCard[],
  visiblePlayer: readonly ThirteenCardFlipCard[],
  remainingHouseCards: number,
  leaderScore: ThirteenCardFlipScore
): boolean {
  return canThirteenCardFlipHousePossiblyReach(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore, false);
}

export function canThirteenCardFlipHousePossiblyMatchOrOvertake(
  visibleHouse: readonly ThirteenCardFlipCard[],
  visiblePlayer: readonly ThirteenCardFlipCard[],
  remainingHouseCards: number,
  leaderScore: ThirteenCardFlipScore
): boolean {
  return canThirteenCardFlipHousePossiblyReach(visibleHouse, visiblePlayer, remainingHouseCards, leaderScore, true);
}

export function createThirteenCardFlipDeck(): readonly ThirteenCardFlipCard[] {
  return THIRTEEN_CARD_FLIP_SUITS.flatMap((suit) =>
    THIRTEEN_CARD_FLIP_RANKS.map((rank, rankIndex) => ({
      id: `${rank}-${suit}`,
      rank,
      rankValue: rankIndex + 2,
      suit,
      red: suit === "diamonds" || suit === "hearts"
    }))
  );
}

function other(player: ThirteenCardFlipPlayer): ThirteenCardFlipPlayer {
  return player === "a" ? "b" : "a";
}

export function resolveThirteenCardFlipFromHands(
  hands: Readonly<Record<ThirteenCardFlipPlayer, readonly ThirteenCardFlipCard[]>>,
  selected: ThirteenCardFlipPlayer
): ThirteenCardFlipOutcome {
  return resolveThirteenCardFlipWithChoices(hands, selected);
}

function resolveThirteenCardFlipWithChoices(
  hands: Readonly<Record<ThirteenCardFlipPlayer, readonly ThirteenCardFlipCard[]>>,
  selected: ThirteenCardFlipPlayer,
  playerChoices?: readonly number[]
): ThirteenCardFlipOutcome {
  if (hands.a.length !== 13 || hands.b.length !== 13)
    throw new Error("13 Card Flip requires exactly 13 cards per player");
  if (new Set([...hands.a, ...hands.b].map((card) => card.id)).size !== 26)
    throw new Error("13 Card Flip hands must not contain duplicate cards");
  if (
    playerChoices &&
    (new Set(playerChoices).size !== playerChoices.length ||
      playerChoices.some((choice) => !Number.isSafeInteger(choice) || choice < 0 || choice >= 13))
  )
    throw new Error("13 Card Flip choices must be unique card indexes from 0 to 12");

  const visible: Record<ThirteenCardFlipPlayer, ThirteenCardFlipCard[]> = { a: [], b: [] };
  const visibleIndexes: Record<ThirteenCardFlipPlayer, number[]> = { a: [], b: [] };
  const reveals: Array<
    Omit<ThirteenCardFlipReveal, "takesLead" | "leader"> & { takesLead: boolean; leader: ThirteenCardFlipPlayer }
  > = [];
  let turn = 0;

  const reveal = (
    player: ThirteenCardFlipPlayer,
    cardIndex: number,
    leader: ThirteenCardFlipPlayer,
    drawIndex = cardIndex
  ): ThirteenCardFlipScore => {
    if (visibleIndexes[player].includes(cardIndex)) throw new Error("13 Card Flip cannot reveal the same card twice");
    const card = hands[player][drawIndex];
    if (!card) return evaluateThirteenCardFlipHand(visible[player]);
    visible[player].push(card);
    visibleIndexes[player].push(cardIndex);
    const handScore = evaluateThirteenCardFlipHand(visible[player]);
    reveals.push({
      ordinal: reveals.length,
      turn,
      player,
      playerIndex: cardIndex + 1,
      card,
      score: handScore,
      takesLead: false,
      leader
    });
    return handScore;
  };

  let leader: ThirteenCardFlipPlayer = "a";
  let leaderScore = evaluateThirteenCardFlipHand([]);
  while (visible.a.length < hands.a.length) {
    const nextIndex = Array.from({ length: 13 }, (_, index) => index).find(
      (index) => !visibleIndexes.a.includes(index)
    );
    if (nextIndex === undefined) break;
    leaderScore = reveal("a", nextIndex, leader);
    if (leaderScore.category >= 1) break;
  }
  const opening = reveals.at(-1);
  if (opening) {
    opening.takesLead = true;
    opening.leader = "a";
  }

  let challenger: ThirteenCardFlipPlayer = "b";
  let winner: ThirteenCardFlipWinner = leader;
  let choiceCursor = 0;
  let awaitingChoice: ThirteenCardFlipPlayer | undefined;
  let completed = true;
  roundLoop: while (true) {
    turn += 1;
    let overtook = false;
    while (visible[challenger].length < hands[challenger].length) {
      if (
        challenger === "a" &&
        (() => {
          const remaining = hands.a.length - visible.a.length;
          const currentComparison = compareThirteenCardFlipScores(evaluateThirteenCardFlipHand(visible.a), leaderScore);
          if (currentComparison === 0) {
            if (canThirteenCardFlipHousePossiblyOvertake(visible.a, visible.b, remaining, leaderScore)) return false;
            winner = "tie";
            return true;
          }
          return !canThirteenCardFlipHousePossiblyMatchOrOvertake(visible.a, visible.b, remaining, leaderScore);
        })()
      ) {
        if (winner !== "tie") winner = leader;
        break roundLoop;
      }
      const nextIndex =
        challenger === "b"
          ? (playerChoices?.[choiceCursor] ?? (playerChoices === undefined ? visible.b.length : undefined))
          : Array.from({ length: 13 }, (_, index) => index).find((index) => !visibleIndexes.a.includes(index));
      if (nextIndex === undefined) {
        completed = false;
        awaitingChoice = "b";
        break;
      }
      if (challenger === "b") choiceCursor += 1;
      const challengerScore = reveal(
        challenger,
        nextIndex,
        leader,
        challenger === "b" && playerChoices !== undefined ? visible.b.length : nextIndex
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
      winner =
        compareThirteenCardFlipScores(evaluateThirteenCardFlipHand(visible[challenger]), leaderScore) === 0
          ? "tie"
          : leader;
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
  } as const;
  const displayHands =
    playerChoices === undefined
      ? hands
      : {
          a: hands.a,
          b: (() => {
            const displayed = Array<ThirteenCardFlipCard | undefined>(13).fill(undefined);
            for (let index = 0; index < visibleIndexes.b.length; index += 1) {
              const slot = visibleIndexes.b[index];
              if (slot !== undefined) displayed[slot] = visible.b[index];
            }
            const remaining = hands.b.slice(visible.b.length);
            let remainingIndex = 0;
            for (let slot = 0; slot < displayed.length; slot += 1) {
              if (displayed[slot] === undefined) {
                displayed[slot] = remaining[remainingIndex];
                remainingIndex += 1;
              }
            }
            return displayed as readonly ThirteenCardFlipCard[];
          })()
        };
  return {
    kind: "thirteen-card-flip",
    selected,
    winner,
    won: completed && selected === winner,
    tied: completed && winner === "tie",
    payout: !completed
      ? 0
      : winner === "tie"
        ? THIRTEEN_CARD_FLIP_TIE_PAYOUT
        : selected === winner
          ? THIRTEEN_CARD_FLIP_PAYOUT
          : 0,
    hands: displayHands,
    reveals,
    revealedCounts: { a: visible.a.length, b: visible.b.length },
    finalScores,
    ...(playerChoices === undefined
      ? {}
      : {
          phase: completed ? ("completed" as const) : ("active" as const),
          ...(awaitingChoice ? { awaitingChoice } : {}),
          playerChoices: playerChoices.slice(0, choiceCursor)
        })
  };
}

export function resolveInteractiveThirteenCardFlipFromHands(
  hands: Readonly<Record<ThirteenCardFlipPlayer, readonly ThirteenCardFlipCard[]>>,
  selected: ThirteenCardFlipPlayer,
  playerChoices: readonly number[]
): ThirteenCardFlipOutcome {
  return resolveThirteenCardFlipWithChoices(hands, selected, playerChoices);
}

export function resolveThirteenCardFlip(
  random: ThirteenCardFlipRandom,
  selected: ThirteenCardFlipPlayer
): ThirteenCardFlipOutcome {
  const deck = [...createThirteenCardFlipDeck()];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    [deck[index], deck[swap]] = [deck[swap] as ThirteenCardFlipCard, deck[index] as ThirteenCardFlipCard];
  }
  const hands: Record<ThirteenCardFlipPlayer, ThirteenCardFlipCard[]> = { a: [], b: [] };
  for (let index = 0; index < 13; index += 1) {
    const first = deck[index * 2];
    const second = deck[index * 2 + 1];
    if (!first || !second) throw new Error("13 Card Flip deck ended unexpectedly");
    hands.a.push(first);
    hands.b.push(second);
  }
  return resolveThirteenCardFlipFromHands(hands, selected);
}
