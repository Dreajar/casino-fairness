import { makeCard, WAR_RANKS, WAR_SUITS } from "../../rainbet-war/engine.js";

export type WarCard = ReturnType<typeof makeCard>;
export type WarAction = "war" | "surrender";
export interface WarState {
  usdScale?: 8;
  rules: "eight-deck-war-v1";
  shoe: WarCard[];
  battles: { player: WarCard; dealer: WarCard }[];
  phase: "player" | "settled";
  revision: number;
  actions: WarAction[];
  tieMinor: string;
  colouredMinor: string;
}
export function warShoe(random: { int(maximum: number): number }): WarCard[] {
  const cards: WarCard[] = [];
  for (let deck = 0; deck < 8; deck++)
    for (const suit of WAR_SUITS) for (const rank of WAR_RANKS) cards.push(makeCard(rank, suit, deck));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    const a = cards[i],
      b = cards[j];
    if (!a || !b) throw new Error("Invalid War shuffle index");
    [cards[i], cards[j]] = [b, a];
  }
  return cards;
}
// The reference's published P(Tie n) = (31/415)^n * (384/415):
// each battle samples afresh from eight decks, without replacement within a pair.
export function warDraws(random: { int(maximum: number): number }): WarCard[] {
  return Array.from({ length: 4 }, () => warShoe(random).slice(0, 2)).flat();
}
export function warOpeningBets(action: string, base: bigint, usdScale: 2 | 8 = 2): [bigint, bigint] {
  const factor = usdScale === 8 ? 1_000_000n : 1n;
  if (base < 10n * factor || base > 5_000_000n * factor) throw new Error("Main bet must be between 0.10 and 50,000.00");
  if (action === "start:deal") return [0n, 0n];
  const match = /^start:deal:(0|[1-9]\d{0,14}):(0|[1-9]\d{0,14})$/.exec(action);
  if (!match) throw new Error("Invalid War side bets");
  const amounts: [bigint, bigint] = [BigInt(match[1] ?? "0"), BigInt(match[2] ?? "0")];
  for (const amount of amounts)
    if (amount !== 0n && (amount < 10n * factor || amount > 1_000_000n * factor))
      throw new Error("Side bets must be zero or between 0.10 and 10,000.00");
  return amounts;
}
function nextBattle(state: WarState): WarState {
  const index = state.battles.length * 2;
  const player = state.shoe[index],
    dealer = state.shoe[index + 1];
  if (!player || !dealer) throw new Error("War shoe exhausted");
  const battles = [...state.battles, { player, dealer }];
  return { ...state, battles, phase: player.rank === dealer.rank && battles.length < 4 ? "player" : "settled" };
}
export function dealWar(shoe: WarCard[]): WarState {
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
export function withWarSideBets(state: WarState, action: string, base: bigint, usdScale: 2 | 8 = 2): WarState {
  const [tie, coloured] = warOpeningBets(action, base, usdScale);
  return { ...state, ...(usdScale === 8 ? { usdScale } : {}), tieMinor: tie.toString(), colouredMinor: coloured.toString() };
}
export function warCommand(action: string, id: string, revision: number): WarAction {
  const match = /^(war|surrender):([^:]+):(0|[1-9]\d*)$/.exec(action);
  if (!match || match[2] !== id || Number(match[3]) !== revision) throw new Error("Stale or invalid War action");
  return match[1] as WarAction;
}
export function actWar(state: WarState, action: WarAction): WarState {
  if (state.phase !== "player" || !["war", "surrender"].includes(action))
    throw new Error("War decision is not available");
  const next = { ...state, actions: [...state.actions, action], revision: state.revision + 1 };
  return action === "war" ? nextBattle(next) : { ...next, phase: "settled" };
}
export const warUnits = (state: WarState) => 2 ** (state.battles.length - 1);
export const warCommitted = (state: WarState, base: bigint) =>
  base * BigInt(warUnits(state)) + BigInt(state.tieMinor) + BigInt(state.colouredMinor);
export const warStartAction = (state: WarState) => `start:deal:${state.tieMinor}:${state.colouredMinor}`;
function receipt(state: WarState, base: bigint) {
  const ties = state.battles.filter((b) => b.player.rank === b.dealer.rank);
  const tieCount = ties.length;
  const colouredTieCount = ties.filter((b) => b.player.red === b.dealer.red).length;
  const allTiesColoured = tieCount > 0 && colouredTieCount === tieCount;
  const last = state.battles.at(-1);
  if (!last) throw new Error("War round has no battles");
  const investedMain = base * BigInt(warUnits(state));
  const resolution =
    state.phase === "player"
      ? "tie"
      : state.actions.at(-1) === "surrender"
        ? "surrender"
        : tieCount === 4
          ? "four-ties"
          : last.player.value > last.dealer.value
            ? "player"
            : "dealer";
  const main =
    resolution === "surrender"
      ? investedMain / 2n
      : resolution === "four-ties"
        ? investedMain + 10n * base
        : resolution === "player"
          ? investedMain + base
          : 0n;
  const tie = BigInt(state.tieMinor) * BigInt([0, 11, 31, 61, 301][tieCount] ?? 0);
  const coloured = BigInt(state.colouredMinor) * BigInt([0, 21, 126, 401, 1001][colouredTieCount] ?? 0);
  return { resolution, tieCount, colouredTieCount, allTiesColoured, investedMain, main, tie, coloured };
}
export function warMaximumPayout(state: WarState, base: bigint): bigint {
  const maximum = base * 18n + BigInt(state.tieMinor) * 301n + BigInt(state.colouredMinor) * 1001n;
  const cap = state.usdScale === 8 ? 50_000_000_000_000n : 50_000_000n;
  return maximum < cap ? maximum : cap;
}
export const warMaximumLoss = (state: WarState, base: bigint) =>
  warMaximumPayout(state, base) - base - BigInt(state.tieMinor) - BigInt(state.colouredMinor);
export function warPayout(state: WarState, base: bigint): bigint {
  if (state.phase !== "settled") return 0n;
  const r = receipt(state, base),
    payout = r.main + r.tie + r.coloured;
  const cap = state.usdScale === 8 ? 50_000_000_000_000n : 50_000_000n;
  return payout < cap ? payout : cap;
}
export function warOutcome(state: WarState, roundId: string, base: bigint): Record<string, unknown> {
  const factor = state.usdScale === 8 ? 100_000_000 : 100;
  const r = receipt(state, base),
    committed = warCommitted(state, base),
    payout = warPayout(state, base);
  return {
    kind: "rainbet-war",
    ...(state.usdScale === 8 ? { usdScale: 8 } : {}),
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
