import { TOWER_DIFFICULTIES, TOWER_FLOORS, DRAGON_TOWER_DIFFICULTIES, DRAGON_TOWER_FLOORS } from "../../contracts/src/index.ts";
import { CHICKEN_PATHS, PUMP_MULTIPLIERS, MOLES_HOLE_COUNT } from "../../fairness-core/src/index.ts";

/** Validate an action using only the prior signed public view, before reserving
 * its stake or requesting private RNG. Rejection leaves the round untouched. */
export function progressiveActionWagerMinor(view, command) {
  if (!view || view.status !== "ACTIVE" || command.roundId !== view.roundId ||
      !Number.isSafeInteger(command.sequence) || command.sequence !== view.sequence + 1 ||
      typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
      typeof command.action !== "string" || command.action.length > 1024) throw new Error("Invalid progressive action identity or sequence");
  const action = command.action, outcome = view.outcome, id = view.roundId;
  const cashout = action === `cashout:${id}`;
  const parts = action.split(":");
  const number = text => /^(0|[1-9]\d*)$/.test(text ?? "") && Number.isSafeInteger(Number(text)) ? Number(text) : -1;
  let valid = false;
  switch (view.gameId) {
    case "rps-ascent":
      valid = cashout ? outcome.step > 0 : parts.length === 3 && parts[0] === "throw" && parts[1] === id &&
        ["rock", "paper", "scissors"].includes(parts[2]);
      break;
    case "blackjack":
    case "rainbet-war": {
      const allowed = view.gameId === "blackjack" ? outcome.allowedActions : outcome.availableActions;
      const quote = view.nextActionWagersMinor?.[parts[0]];
      if (parts.length !== 3 || parts[1] !== id || number(parts[2]) !== outcome.revision || !allowed?.includes(parts[0]) ||
          typeof quote !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(quote)) throw new Error("Invalid card action or stake quote");
      return BigInt(quote);
    }
    case "video-poker": {
      const holds = parts[2];
      const selected = holds === "" ? [] : (holds ?? "").split(",");
      valid = view.sequence === 0 && parts.length === 3 && parts[0] === "draw" && parts[1] === id &&
        /^(?:[0-4](?:,[0-4])*)?$/.test(holds) && new Set(selected).size === selected.length;
      break;
    }
    case "thirteen-card-flip": {
      const index = number(parts[2]);
      valid = parts.length === 3 && parts[0] === "pick" && parts[1] === id && index >= 0 && index < 13 &&
        !outcome.playerChoices?.includes(index);
      break;
    }
    case "floor-is-lava":
      valid = cashout ? outcome.step > 0 : parts.length === 4 && parts[0] === "pick" && parts[1] === id &&
        number(parts[2]) === outcome.step + 1 && outcome.remainingPlatforms?.includes(number(parts[3]));
      break;
    case "stake-pump":
      valid = cashout ? outcome.step > 0 : parts.length === 3 && parts[0] === "pump" && parts[1] === id &&
        number(parts[2]) === outcome.step + 1 && number(parts[2]) < (PUMP_MULTIPLIERS[outcome.difficulty]?.length ?? 0);
      break;
    case "chicken-cross": {
      const suffix = `:difficulty:${outcome.difficulty}:step:${outcome.step}`;
      valid = action === `cashout${suffix}` ? outcome.step > 0 : action === `cross-next-lane${suffix}` && outcome.step < (CHICKEN_PATHS[outcome.difficulty]?.length ?? 0);
      break;
    }
    case "tower":
    case "dragon-tower": {
      const difficulties = view.gameId === "tower" ? TOWER_DIFFICULTIES : DRAGON_TOWER_DIFFICULTIES;
      const floors = view.gameId === "tower" ? TOWER_FLOORS : DRAGON_TOWER_FLOORS;
      const column = number(parts[3]);
      valid = cashout ? outcome.floor > 0 : parts.length === 4 && parts[0] === "pick" && parts[1] === id &&
        number(parts[2]) === outcome.floor + 1 && number(parts[2]) <= floors && column >= 0 && column < (difficulties[outcome.difficulty]?.tiles ?? 0);
      break;
    }
    case "moles": {
      const tile = number(parts[3]);
      valid = cashout ? outcome.step > 0 : parts.length === 4 && parts[0] === "pick" && parts[1] === id &&
        number(parts[2]) === outcome.step + 1 && number(parts[2]) <= outcome.moles && tile >= 0 && tile < MOLES_HOLE_COUNT;
      break;
    }
    case "rainbet-mines": {
      const tile = number(parts[2]);
      valid = cashout ? outcome.revealed?.length > 0 : parts.length === 3 && parts[0] === "reveal" && parts[1] === id &&
        tile >= 0 && tile < outcome.gridSize && !outcome.revealed?.includes(tile);
      break;
    }
  }
  if (!valid) throw new Error("Invalid progressive action for the current public state");
  return 0n;
}
