export const DIFFICULTIES = Object.freeze({
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

export const MAJOR_CARDS = Object.freeze([
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

const easyMinor = [
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

const mediumMinor = [
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

const hardMinor = [
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/cards/43.CvcftE46.svg", "Nine of Cups", 0.3],
  ["assets/cards/58.w-0OWbj2.svg", "Queen of Pentacles", 0.6],
  ["assets/cards/67.CvmnWSJl.svg", "Knight of Wands", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4]
];

const expertMinor = [
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.IswrYhDZ.svg", "Two of Wands", 0],
  ["assets/27.Bfx7g_6d.svg", "Two of Wands", 0],
  ["assets/37.CsVIVBR7.svg", "Four of Swords", 0.15],
  ["assets/cards/65.C1fIZItV.svg", "Page of Swords", 2],
  ["assets/cards/77.dq_2vLrB.svg", "King of Swords", 4]
];

const card = ([asset, name, multiplier]) => Object.freeze({ asset, name, multiplier });

export const MINOR_CARDS = Object.freeze({
  easy: Object.freeze(easyMinor.map(card)),
  medium: Object.freeze(mediumMinor.map(card)),
  hard: Object.freeze(hardMinor.map(card)),
  expert: Object.freeze(expertMinor.map(card))
});

export function pickCard(cards, random = Math.random) {
  const value = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  return cards[Math.floor(value * cards.length)];
}

export function settleTarot(left, major, right) {
  return Math.round(left.multiplier * major.multiplier * right.multiplier * 100) / 100;
}

/** Historical uniform distribution, retained only to replay old rounds. */
export function drawLegacyTarot(difficulty = "easy", random = Math.random) {
  const minorCards = MINOR_CARDS[difficulty] || MINOR_CARDS.easy;
  const left = pickCard(minorCards, random);
  const major = pickCard(MAJOR_CARDS, random);
  const right = pickCard(minorCards, random);
  return { left, major, right, multiplier: settleTarot(left, major, right) };
}

export const TAROT_MATH_VERSION = "tarot-house-edge-v2";
// Integer draw weights, calibrated by exhaustive three-card enumeration.
// Card payouts stay unchanged; zero-paying minor cards carry greater weight.
const zeroWeights = { easy: 30036, medium: 36464, hard: 21695, expert: 14578 };
export const TAROT_MINOR_WEIGHTS = Object.freeze(Object.fromEntries(
  Object.entries(MINOR_CARDS).map(([difficulty, cards]) => [difficulty,
    Object.freeze(cards.map((card) => card.multiplier === 0 ? zeroWeights[difficulty] : 10000))
  ])
));

function weightedCard(cards, weights, integer) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let draw = integer(total);
  if (!Number.isSafeInteger(draw) || draw < 0 || draw >= total) throw new RangeError("Invalid Tarot random index");
  for (let index = 0; index < cards.length; index++) {
    if (draw < weights[index]) return cards[index];
    draw -= weights[index];
  }
  throw new Error("Invalid Tarot draw weights");
}

/** @param {((bound: number) => number) | null} boundedInteger */
export function drawTarot(difficulty = "easy", random = Math.random, boundedInteger = null) {
  const selected = Object.hasOwn(MINOR_CARDS, difficulty) ? difficulty : "easy";
  const cards = MINOR_CARDS[selected];
  const weights = TAROT_MINOR_WEIGHTS[selected];
  // Real settlement supplies FairRandom.int, which uses rejection sampling.
  const integer = boundedInteger ?? ((bound) => Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0)) * bound));
  const left = weightedCard(cards, weights, integer);
  const major = weightedCard(MAJOR_CARDS, MAJOR_CARDS.map(() => 1), integer);
  const right = weightedCard(cards, weights, integer);
  return { mathVersion: TAROT_MATH_VERSION, left, major, right, multiplier: settleTarot(left, major, right) };
}

export function formatMultiplier(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(2)}×`;
}

export function nextAutoBet(initialBet, currentBet, outcome, rule) {
  if (!rule || rule.mode === "reset") return Math.max(0, Number(initialBet) || 0);
  const percentage = Math.max(0, Number(rule.percentage) || 0) / 100;
  const basis = Math.max(0, Number(currentBet) || 0);
  return Math.round(basis * (1 + percentage) * 1e8) / 1e8;
}

export function shouldStopAutobet({ profit = 0, stopProfit = 0, stopLoss = 0, remaining = Infinity } = {}) {
  if (remaining <= 0) return true;
  if (stopProfit > 0 && profit >= stopProfit) return true;
  if (stopLoss > 0 && profit <= -stopLoss) return true;
  return false;
}
