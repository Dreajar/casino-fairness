/** Versioned rules: six decks, S17, peek, 3:2, one split, DAS, split aces receive one card. */
export const BLACKJACK_RULES = "six-deck-s17-v2";
export type BlackjackRules = "six-deck-s17-v1" | typeof BLACKJACK_RULES;
export type BlackjackAction = "hit" | "stand" | "split" | "double";
export interface BlackjackCard {
  id: string;
  rank: string;
  suit: string;
}
export interface BlackjackHand {
  cards: BlackjackCard[];
  units: number;
  status: "playing" | "stand" | "win" | "lose" | "bust" | "push" | "blackjack";
}
export interface BlackjackState {
  sideBets?: { version: "pairs-21plus3-v1"; perfectPair: BlackjackSideBet; twentyOneThree: BlackjackSideBet };
  rules: BlackjackRules;
  shoe: BlackjackCard[];
  cursor: number;
  dealer: BlackjackCard[];
  hands: BlackjackHand[];
  active: number;
  phase: "player" | "settled";
  revision: number;
  actions: BlackjackAction[];
}

export interface BlackjackSideBet {
  wagerMinor: string;
  payoutMinor: string;
  result: string;
  odds: number;
}
export function blackjackOpeningBets(action: string, base: bigint, usdScale: 2 | 8 = 2): [bigint, bigint] {
  if (action === "start:deal") return [0n, 0n];
  const match = /^start:deal:(0|[1-9]\d{0,14}):(0|[1-9]\d{0,14})$/.exec(action);
  if (!match) throw new Error("Invalid Blackjack side bets");
  const pair = BigInt(match[1] ?? "0"),
    three = BigInt(match[2] ?? "0");
  for (const amount of [pair, three])
    if (amount !== 0n && (amount < (usdScale === 8 ? 10_000_000n : 10n) || amount > base))
      throw new Error("Each side bet must be zero or between $0.10 and the base bet");
  if (pair === 0n && three === 0n) throw new Error("Use start:deal when side bets are zero");
  return [pair, three];
}
export function blackjackSideResults(cards: readonly BlackjackCard[], dealer: BlackjackCard) {
  const [a, b] = cards;
  if (!a || !b) throw new Error("Opening cards required");
  const red = (card: BlackjackCard) => ["hearts", "diamonds"].includes(card.suit);
  const pair =
    a.rank !== b.rank
      ? { result: "No pair", odds: 0 }
      : a.suit === b.suit
        ? { result: "Perfect pair", odds: 25 }
        : red(a) === red(b)
          ? { result: "Coloured pair", odds: 12 }
          : { result: "Mixed pair", odds: 6 };
  const triple = [a, b, dealer];
  const sameRank = triple.every((c) => c.rank === a.rank);
  const flush = triple.every((c) => c.suit === a.suit);
  const values = triple
    .map((c) => (["J", "Q", "K", "A"].includes(c.rank) ? ["J", "Q", "K", "A"].indexOf(c.rank) + 11 : Number(c.rank)))
    .sort((x, y) => x - y);
  const straight =
    (values[0] === 2 && values[1] === 3 && values[2] === 14) ||
    (values[1] === (values[0] ?? 0) + 1 && values[2] === (values[1] ?? 0) + 1);
  const three =
    sameRank && flush
      ? { result: "Suited trips", odds: 100 }
      : straight && flush
        ? { result: "Straight flush", odds: 40 }
        : sameRank
          ? { result: "Three of a kind", odds: 30 }
          : straight
            ? { result: "Straight", odds: 10 }
            : flush
              ? { result: "Flush", odds: 5 }
              : { result: "No winning combination", odds: 0 };
  return { pair, three };
}
export function withBlackjackSideBets(state: BlackjackState, action: string, base: bigint, usdScale: 2 | 8 = 2): BlackjackState {
  const [pair, three] = blackjackOpeningBets(action, base, usdScale);
  if (pair === 0n && three === 0n) return state;
  const dealer = state.dealer[0];
  if (!dealer) throw new Error("Dealer upcard missing");
  const results = blackjackSideResults(state.hands[0]?.cards ?? [], dealer);
  const receipt = (amount: bigint, result: { result: string; odds: number }): BlackjackSideBet => ({
    wagerMinor: amount.toString(),
    payoutMinor: (result.odds ? amount * BigInt(result.odds + 1) : 0n).toString(),
    ...result
  });
  return {
    ...state,
    sideBets: {
      version: "pairs-21plus3-v1",
      perfectPair: receipt(pair, results.pair),
      twentyOneThree: receipt(three, results.three)
    }
  };
}
export function blackjackSideStake(state: BlackjackState): bigint {
  return state.sideBets
    ? BigInt(state.sideBets.perfectPair.wagerMinor) + BigInt(state.sideBets.twentyOneThree.wagerMinor)
    : 0n;
}
export function blackjackCommitted(state: BlackjackState, base: bigint): bigint {
  return base * BigInt(blackjackUnits(state)) + blackjackSideStake(state);
}
export function blackjackStartAction(state: BlackjackState): string {
  return state.sideBets
    ? `start:deal:${state.sideBets.perfectPair.wagerMinor}:${state.sideBets.twentyOneThree.wagerMinor}`
    : "start:deal";
}
export function blackjackMaximumPayout(state: BlackjackState, base: bigint): bigint {
  return (
    base * 8n +
    (state.sideBets
      ? BigInt(state.sideBets.perfectPair.wagerMinor) * 26n + BigInt(state.sideBets.twentyOneThree.wagerMinor) * 101n
      : 0n)
  );
}
export function blackjackMaximumLoss(state: BlackjackState, base: bigint): bigint {
  return blackjackMaximumPayout(state, base) - base * 4n - blackjackSideStake(state);
}

export function blackjackTotal(cards: readonly BlackjackCard[]): number {
  let aces = 0;
  let value = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      value += 11;
    } else value += ["K", "Q", "J"].includes(card.rank) ? 10 : Number(card.rank);
  }
  while (value > 21 && aces-- > 0) value -= 10;
  return value;
}
const cardValue = (card: BlackjackCard) =>
  card.rank === "A" ? 11 : ["K", "Q", "J"].includes(card.rank) ? 10 : Number(card.rank);
const natural = (cards: BlackjackCard[]) => cards.length === 2 && blackjackTotal(cards) === 21;

export function blackjackShoe(random: { int(maxExclusive: number): number }): BlackjackCard[] {
  const shoe: BlackjackCard[] = [];
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
function draw(state: BlackjackState): BlackjackCard {
  const card = state.shoe[state.cursor++];
  if (!card) throw new Error("Blackjack shoe exhausted");
  return card;
}
function settle(state: BlackjackState): void {
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
function advance(state: BlackjackState): void {
  while (state.active < state.hands.length) {
    const hand = state.hands[state.active];
    if (!hand) throw new Error("Blackjack active hand missing");
    if (hand.status !== "playing") { state.active++; continue; }
    if (state.rules === "six-deck-s17-v2" && hand.cards.length === 1) {
      const splitAce = hand.cards[0]?.rank === "A";
      hand.cards.push(draw(state));
      if (splitAce || blackjackTotal(hand.cards) === 21) { hand.status = "stand"; state.active++; continue; }
    }
    break;
  }
  if (state.active === state.hands.length) settle(state);
}
export function dealBlackjack(shoe: readonly BlackjackCard[], rules: BlackjackRules = BLACKJACK_RULES): BlackjackState {
  if (rules !== "six-deck-s17-v1" && rules !== "six-deck-s17-v2") throw new Error("Unknown Blackjack rules");
  if (shoe.length !== 312 || new Set(shoe.map((card) => card.id)).size !== 312)
    throw new Error("Invalid six-deck shoe");
  const state: BlackjackState = {
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
    hand.status = natural(hand.cards) ? (natural(state.dealer) ? "push" : "blackjack") : "lose";
    state.phase = "settled";
  }
  return state;
}
export function blackjackAllowed(state: BlackjackState): BlackjackAction[] {
  const hand = state.hands[state.active];
  if (state.phase !== "player" || !hand || hand.status !== "playing") return [];
  const choices: BlackjackAction[] = ["hit", "stand"];
  if (hand.cards.length === 2) choices.push("double");
  const [first, second] = hand.cards;
  if (state.hands.length === 1 && hand.cards.length === 2 && first && second && cardValue(first) === cardValue(second))
    choices.push("split");
  return choices;
}
export function actBlackjack(previous: BlackjackState, action: BlackjackAction): BlackjackState {
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
      state.hands = [first, second].map((card) => ({ cards: [card, draw(state)], units: 1, status: "playing" }));
      for (const split of state.hands) if (aces || blackjackTotal(split.cards) === 21) split.status = "stand";
    } else {
      // Deal each split hand when it becomes active. Exposing the next hand's
      // replacement card early changes the information available to strategy.
      state.hands = [first, second].map(card => ({ cards: [card], units: 1, status: "playing" }));
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
export const blackjackUnits = (state: BlackjackState) => state.hands.reduce((sum, hand) => sum + hand.units, 0);
/** All transfers are integer minor units. A 3:2 win on an odd-cent stake rounds down once. */
export function blackjackPayout(state: BlackjackState, baseMinor: bigint): bigint {
  if (state.phase !== "settled") return 0n;
  return state.hands.reduce(
    (sum, hand) =>
      sum +
      (hand.status === "blackjack"
        ? (baseMinor * 5n) / 2n
        : hand.status === "win"
          ? baseMinor * BigInt(hand.units) * 2n
          : hand.status === "push"
            ? baseMinor * BigInt(hand.units)
            : 0n),
    state.sideBets
      ? BigInt(state.sideBets.perfectPair.payoutMinor) + BigInt(state.sideBets.twentyOneThree.payoutMinor)
      : 0n
  );
}
export function blackjackOutcome(state: BlackjackState, roundId: string, baseMinor: bigint): Record<string, unknown> {
  return {
    kind: "blackjack",
    ...(state.sideBets ? { sideBets: state.sideBets } : {}),
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
export function blackjackCommand(action: string, roundId: string, revision: number): BlackjackAction {
  // Use the same case-sensitive command vocabulary as the settlement stake gates.
  const parsed = /^(hit|stand|split|double):([a-f\d-]+):(0|[1-9]\d*)$/.exec(action);
  if (!parsed?.[1]) throw new Error("Invalid Blackjack action");
  if (parsed[2] !== roundId || Number(parsed[3]) !== revision)
    throw new Error("Stale Blackjack hand or action revision");
  return parsed[1].toLowerCase() as BlackjackAction;
}
