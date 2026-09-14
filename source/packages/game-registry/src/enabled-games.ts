/** Browser-safe canonical game identity list. Manifest generation verifies it. */
export const ENABLED_GAME_IDS = [
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
] as const;

export type EnabledGameId = (typeof ENABLED_GAME_IDS)[number];

/** Enabled games that remain available for development/demo but cannot be offered by clubs. */
export const DEVELOPMENT_GAME_IDS = [] as const satisfies readonly EnabledGameId[];

export type DevelopmentGameId = (typeof DEVELOPMENT_GAME_IDS)[number];

export function isDevelopmentGameId(value: string): value is DevelopmentGameId {
  return (DEVELOPMENT_GAME_IDS as readonly string[]).includes(value);
}
