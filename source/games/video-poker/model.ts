export const VIDEO_POKER_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const VIDEO_POKER_SUITS = ["C", "D", "H", "S"] as const;

export type VideoPokerRank = (typeof VIDEO_POKER_RANKS)[number];
export type VideoPokerSuit = (typeof VIDEO_POKER_SUITS)[number];
export type VideoPokerCardCode = `${VideoPokerRank}${VideoPokerSuit}`;

export const VIDEO_POKER_PAYTABLE = [
  { key: "royal-flush", label: "Royal Flush", multiplier: 800 },
  { key: "straight-flush", label: "Straight Flush", multiplier: 60 },
  { key: "four-of-a-kind", label: "4 of a Kind", multiplier: 22 },
  { key: "full-house", label: "Full House", multiplier: 9 },
  { key: "flush", label: "Flush", multiplier: 6 },
  { key: "straight", label: "Straight", multiplier: 4 },
  { key: "three-of-a-kind", label: "3 of a Kind", multiplier: 3 },
  { key: "two-pair", label: "2 Pair", multiplier: 2 },
  { key: "jacks-or-better", label: "Pair of Jacks or Better", multiplier: 1 }
] as const;

export const VIDEO_POKER_MAX_MULTIPLIER = 800;

export type VideoPokerHandKey = (typeof VIDEO_POKER_PAYTABLE)[number]["key"] | "loss";

export interface VideoPokerHandResult {
  readonly key: VideoPokerHandKey;
  readonly label: string;
  readonly multiplier: number;
  readonly isWin: boolean;
  readonly winningIndexes: readonly number[];
}

export interface VideoPokerDeal {
  readonly deck: readonly VideoPokerCardCode[];
  readonly initialCards: readonly VideoPokerCardCode[];
}

export interface VideoPokerDraw {
  readonly initialCards: readonly VideoPokerCardCode[];
  readonly finalCards: readonly VideoPokerCardCode[];
  readonly held: readonly number[];
  readonly replacementCards: readonly VideoPokerCardCode[];
  readonly result: VideoPokerHandResult;
}

export interface VideoPokerRandom {
  int(maxExclusive: number): number;
}

const cardPattern = /^(10|[2-9JQKA])([CDHS])$/;

export function isVideoPokerCardCode(value: unknown): value is VideoPokerCardCode {
  return typeof value === "string" && cardPattern.test(value);
}

export function createVideoPokerDeck(): readonly VideoPokerCardCode[] {
  return VIDEO_POKER_SUITS.flatMap((suit) => VIDEO_POKER_RANKS.map((rank) => `${rank}${suit}` as VideoPokerCardCode));
}

export function shuffleVideoPokerDeck(random: VideoPokerRandom): readonly VideoPokerCardCode[] {
  const deck = [...createVideoPokerDeck()];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    const current = deck[index];
    const replacement = deck[swap];
    if (!current || !replacement) throw new Error("Video Poker shuffle failed");
    deck[index] = replacement;
    deck[swap] = current;
  }
  return deck;
}

export function dealVideoPoker(random: VideoPokerRandom): VideoPokerDeal {
  const deck = shuffleVideoPokerDeck(random);
  return { deck, initialCards: deck.slice(0, 5) };
}

function cardRank(card: VideoPokerCardCode): VideoPokerRank {
  return card.slice(0, -1) as VideoPokerRank;
}

function cardSuit(card: VideoPokerCardCode): VideoPokerSuit {
  return card.at(-1) as VideoPokerSuit;
}

function rankValue(rank: VideoPokerRank): number {
  return VIDEO_POKER_RANKS.indexOf(rank) + 2;
}

function handResult(
  key: VideoPokerHandKey,
  winningIndexes: readonly number[],
  label = "No Win",
  multiplier = 0
): VideoPokerHandResult {
  const pay = VIDEO_POKER_PAYTABLE.find((row) => row.key === key);
  return {
    key,
    label: pay?.label ?? label,
    multiplier: pay?.multiplier ?? multiplier,
    isWin: Boolean(pay),
    winningIndexes: [...winningIndexes].sort((left, right) => left - right)
  };
}

export function evaluateVideoPokerHand(cards: readonly VideoPokerCardCode[]): VideoPokerHandResult {
  if (cards.length !== 5 || cards.some((card) => !isVideoPokerCardCode(card)) || new Set(cards).size !== 5) {
    throw new Error("A Video Poker hand must contain five unique cards");
  }
  const counts = new Map<VideoPokerRank, number>();
  for (const card of cards) {
    const rank = cardRank(card);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort(
    ([leftRank, leftCount], [rightRank, rightCount]) =>
      rightCount - leftCount || rankValue(rightRank) - rankValue(leftRank)
  );
  const uniqueValues = [...new Set(cards.map((card) => rankValue(cardRank(card))))].sort((a, b) => a - b);
  const aceLow = uniqueValues.join(",") === "2,3,4,5,14";
  const straight = uniqueValues.length === 5 && (aceLow || (uniqueValues[4] ?? 0) - (uniqueValues[0] ?? 0) === 4);
  const flush = cards.every((card) => cardSuit(card) === cardSuit(cards[0] as VideoPokerCardCode));
  const all = [0, 1, 2, 3, 4];
  const indexesFor = (ranks: readonly VideoPokerRank[]) => {
    const wanted = new Set(ranks);
    return cards.flatMap((card, index) => (wanted.has(cardRank(card)) ? [index] : []));
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

export function normalizeVideoPokerHolds(value: readonly number[]): readonly number[] {
  if (
    value.some((index) => !Number.isSafeInteger(index) || index < 0 || index > 4) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("Video Poker holds must be unique card indexes from 0 through 4");
  }
  return [...value].sort((left, right) => left - right);
}

export function drawVideoPoker(deck: readonly VideoPokerCardCode[], requestedHolds: readonly number[]): VideoPokerDraw {
  if (deck.length !== 52 || deck.some((card) => !isVideoPokerCardCode(card)) || new Set(deck).size !== 52) {
    throw new Error("Stored Video Poker deck is invalid");
  }
  const held = normalizeVideoPokerHolds(requestedHolds);
  const heldSet = new Set(held);
  const initialCards = deck.slice(0, 5);
  let cursor = 5;
  const replacementCards: VideoPokerCardCode[] = [];
  const finalCards = initialCards.map((card, index) => {
    if (heldSet.has(index)) return card;
    const replacement = deck[cursor];
    if (!replacement) throw new Error("Video Poker deck ran out of replacement cards");
    cursor += 1;
    replacementCards.push(replacement);
    return replacement;
  });
  return { initialCards, finalCards, held, replacementCards, result: evaluateVideoPokerHand(finalCards) };
}
