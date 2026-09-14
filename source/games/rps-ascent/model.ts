export const RPS_MOVES = ["rock", "paper", "scissors"] as const;
export type RpsMove = (typeof RPS_MOVES)[number];
// Fits the sealed recovery transcript's 128-entry limit, including opening.
export const RPS_MAX_THROWS = 120;
export const RPS_MULTIPLIERS = [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76, 1003.52, 2007.04, 4014.08, 8028.16, 10000] as const;
export function isRpsMove(value: string): value is RpsMove {
  return (RPS_MOVES as readonly string[]).includes(value);
}
export function rpsThrowResult(player: RpsMove, opponent: RpsMove) {
  if (player === opponent) return "draw";
  return ({rock: "scissors", paper: "rock", scissors: "paper"} as const)[player] === opponent ? "win" : "loss";
}
