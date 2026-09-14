export const WAR_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const WAR_SUITS = ["clubs", "diamonds", "hearts", "spades"];

export const TIE_ODDS = [10, 30, 60, 300];
export const COLOURED_TIE_ODDS = [20, 125, 400, 1000];

const suitSymbols = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};

function seedNumber(seed) {
  let value = 2166136261;
  for (const character of String(seed)) {
    value ^= character.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0 || 0x9e3779b9;
}

export function seededRandom(seed) {
  let state = seedNumber(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCard(rank, suit, deck = 0) {
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

export function createWarShoe(seed, decks = 8) {
  if (!Number.isSafeInteger(decks) || decks < 1 || decks > 32) throw new Error("Deck count must be between 1 and 32");
  const cards = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of WAR_SUITS) {
      for (const rank of WAR_RANKS) cards.push(makeCard(rank, suit, deck));
    }
  }
  const random = seededRandom(seed);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

export function compareWarCards(player, dealer) {
  return player.value === dealer.value ? "tie" : player.value > dealer.value ? "player" : "dealer";
}

export function isColouredTie(player, dealer) {
  return compareWarCards(player, dealer) === "tie" && player.red === dealer.red;
}

export function tieSideBetMultiplier(tieCount) {
  if (!Number.isSafeInteger(tieCount) || tieCount < 1) return 0;
  const odds = TIE_ODDS[Math.min(tieCount, TIE_ODDS.length) - 1] ?? 0;
  return odds + 1;
}

export function colouredTieSideBetMultiplier(tieCount, allTiesColoured) {
  if (!allTiesColoured || !Number.isSafeInteger(tieCount) || tieCount < 1) return 0;
  const odds = COLOURED_TIE_ODDS[Math.min(tieCount, COLOURED_TIE_ODDS.length) - 1] ?? 0;
  return odds + 1;
}

export function settleWarRound({ battles, mainWager, tieWager = 0, colouredTieWager = 0, surrendered = false }) {
  if (!Array.isArray(battles) || battles.length === 0) throw new Error("A War round needs at least one battle");
  for (const amount of [mainWager, tieWager, colouredTieWager]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("War wagers must be non-negative finite numbers");
  }

  const ties = battles.filter((battle) => compareWarCards(battle.player, battle.dealer) === "tie");
  const tieCount = ties.length;
  const colouredTieCount = ties.filter((battle) => isColouredTie(battle.player, battle.dealer)).length;
  const allTiesColoured = tieCount > 0 && colouredTieCount === tieCount;
  const finalBattle = battles.at(-1);
  const finalOutcome = finalBattle ? compareWarCards(finalBattle.player, finalBattle.dealer) : "dealer";
  const investedMain = mainWager * 2 ** (battles.length - 1);

  let resolution = finalOutcome;
  let mainPayout = 0;
  if (tieCount >= 4 && finalOutcome === "tie") {
    resolution = "four-ties";
    mainPayout = investedMain + mainWager * 10;
  } else if (surrendered) {
    resolution = "surrender";
    mainPayout = investedMain * 0.5;
  } else if (finalOutcome === "player") {
    // Direct wins return 2x. After War, all committed main stakes return plus
    // one original-stake profit, matching Rainbet's visible 1.50x one-War result.
    mainPayout = investedMain + mainWager;
  }

  const tiePayout = tieWager * tieSideBetMultiplier(tieCount);
  const colouredTiePayout = colouredTieWager * colouredTieSideBetMultiplier(colouredTieCount, true);
  const totalStake = investedMain + tieWager + colouredTieWager;
  // Display and local demo use the same cent precision and payout ceiling as the host.
  mainPayout = Math.floor(Math.round(mainPayout * 10000) / 100) / 100;
  const totalPayout = Math.min(500000, Math.round((mainPayout + tiePayout + colouredTiePayout) * 100) / 100);

  return {
    resolution,
    tieCount,
    colouredTieCount,
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

export function debugBattles(outcome) {
  const card = (rank, suit, deck = 0) => makeCard(rank, suit, deck);
  switch (outcome) {
    case "loss":
      return [{ player: card("5", "clubs"), dealer: card("6", "spades", 1) }];
    case "tie":
      return [{ player: card("7", "hearts"), dealer: card("7", "clubs", 1) }];
    case "coloured-tie":
      return [{ player: card("7", "hearts"), dealer: card("7", "diamonds", 1) }];
    case "repeat-tie":
      return [
        { player: card("7", "hearts"), dealer: card("7", "diamonds", 1) },
        { player: card("9", "hearts"), dealer: card("9", "spades", 1) }
      ];
    case "war-loss":
      return [
        { player: card("7", "hearts"), dealer: card("7", "clubs", 1) },
        { player: card("3", "diamonds"), dealer: card("A", "spades", 1) }
      ];
    case "war-win":
      return [
        { player: card("7", "hearts"), dealer: card("7", "clubs", 1) },
        { player: card("A", "spades"), dealer: card("3", "diamonds", 1) }
      ];
    case "repeat-war-win":
      return [
        { player: card("K", "clubs"), dealer: card("K", "diamonds", 1) },
        { player: card("A", "clubs"), dealer: card("A", "hearts", 1) },
        { player: card("Q", "hearts"), dealer: card("J", "clubs", 1) }
      ];
    case "four-ties":
      return [
        { player: card("7", "hearts"), dealer: card("7", "diamonds", 1) },
        { player: card("9", "clubs"), dealer: card("9", "spades", 1) },
        { player: card("J", "diamonds"), dealer: card("J", "hearts", 1) },
        { player: card("A", "clubs"), dealer: card("A", "spades", 1) }
      ];
    case "win":
    default:
      return [{ player: card("Q", "hearts"), dealer: card("8", "spades", 1) }];
  }
}

export function dealPairs(shoe, cursor = 0, count = 1) {
  if (!Array.isArray(shoe) || shoe.length < 2) throw new Error("War shoe is empty");
  const battles = [];
  let nextCursor = cursor;
  for (let index = 0; index < count; index += 1) {
    const player = shoe[nextCursor % shoe.length];
    const dealer = shoe[(nextCursor + 1) % shoe.length];
    if (!player || !dealer) throw new Error("War shoe could not deal a pair");
    battles.push({ player, dealer });
    nextCursor = (nextCursor + 2) % shoe.length;
  }
  return { battles, cursor: nextCursor };
}

// Frozen for verifying receipts issued by the previous single-request adapter.
export function settleLegacyWarRound({ battles, mainWager, tieWager = 0, colouredTieWager = 0, surrendered = false }) {
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
    // Direct wins return 2x. After War, all committed main stakes return plus
    // one original-stake profit, matching Rainbet's visible 1.50x one-War result.
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
