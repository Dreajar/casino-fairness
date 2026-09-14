import { CHICKEN_PATHS, PUMP_MULTIPLIERS, molesMultiplier, floorLavaMaximumMultiplier, VIDEO_POKER_MAX_MULTIPLIER,
  THIRTEEN_CARD_FLIP_PAYOUT } from "../../packages/fairness-core/src/index.ts";
import { TOWER_PAYTABLE, DRAGON_TOWER_PAYTABLE, isFloorLavaDifficulty } from "../../packages/contracts/src/index.ts";
import { blackjackOpeningBets } from "../../games/blackjack/model.ts";
import { warOpeningBets } from "../../games/rainbet-war/model.ts";
import { floorMinorByDecimal } from "../../apps/server/src/payments/money.ts";
import { minesConfigurationFromProgressiveAction, minesMaximumPayoutMinor } from "../../apps/server/src/payments/progressive-kernel.ts";

/** Maximum eventual return, including every legal extra-stake action. This
 * depends only on the opening contract, never on hidden cards or layouts. */
export function progressiveMaximumPayoutMinor(gameId: string, action: string, base: bigint, policyCap: bigint, usdScale: 2 | 8 = 2): bigint {
  if (base <= 0n || policyCap <= 0n) throw new Error("Invalid progressive exposure inputs");
  if (gameId === "rps-ascent" && action === "start:run") return base * 10000n;
  if (gameId === "blackjack") {
    const [pair, three] = blackjackOpeningBets(action, base, usdScale);
    return base * 8n + pair * 26n + three * 101n;
  }
  if (gameId === "rainbet-war") {
    const [tie, colour] = warOpeningBets(action, base, usdScale);
    const maximum = base * 18n + tie * 301n + colour * 1001n;
    const cap = usdScale === 8 ? 50000000000000n : 50000000n;
    return maximum < cap ? maximum : cap;
  }
  if (gameId === "rainbet-mines") {
    const { gridSize, mineCount } = minesConfigurationFromProgressiveAction(action);
    return minesMaximumPayoutMinor(base, gridSize, mineCount, policyCap);
  }
  const difficulty = action.split(":")[1] ?? "";
  let multiplier: number | undefined;
  if (gameId === "stake-pump") multiplier = PUMP_MULTIPLIERS[difficulty as keyof typeof PUMP_MULTIPLIERS]?.at(-1);
  if (gameId === "chicken-cross") {
    const chicken = /^cross-next-lane:difficulty:(easy|medium|hard|expert):step:0$/.exec(action)?.[1];
    multiplier = CHICKEN_PATHS[chicken as keyof typeof CHICKEN_PATHS]?.at(-1);
  }
  if (gameId === "tower") multiplier = TOWER_PAYTABLE[difficulty as keyof typeof TOWER_PAYTABLE]?.at(-1);
  if (gameId === "dragon-tower") multiplier = DRAGON_TOWER_PAYTABLE[difficulty as keyof typeof DRAGON_TOWER_PAYTABLE]?.at(-1);
  if (gameId === "moles" && /^start:[1-6]$/.test(action)) multiplier = molesMultiplier(Number(difficulty), Number(difficulty));
  if (gameId === "floor-is-lava" && isFloorLavaDifficulty(difficulty)) multiplier = floorLavaMaximumMultiplier(difficulty);
  if (gameId === "video-poker" && action === "start:deal") multiplier = VIDEO_POKER_MAX_MULTIPLIER;
  if (gameId === "thirteen-card-flip" && action === "start:deal") multiplier = THIRTEEN_CARD_FLIP_PAYOUT;
  if (multiplier === undefined || !Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Invalid progressive opening exposure");
  return floorMinorByDecimal(base, multiplier.toFixed(4));
}
