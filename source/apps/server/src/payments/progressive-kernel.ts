import {
  DRAGON_TOWER_DIFFICULTIES, DRAGON_TOWER_FLOORS, DRAGON_TOWER_PAYTABLE, type DragonTowerDifficulty,
  TOWER_DIFFICULTIES, TOWER_FLOORS, TOWER_PAYTABLE, type TowerDifficulty,
  isTowerDifficulty, isDragonTowerDifficulty
} from "@replicate/contracts";
import {
  CHICKEN_PATHS, type ChickenDifficulty, type ChickenLaneResolution,
  generateChickenPath, generateDragonTowerLayout, generateMinesLayout, generateMolesLayout,
  generatePumpPopPoint, generateTowerLayout, isPumpDifficulty, MINES_GRID_SIZES,
  MINES_MAX_MULTIPLIER, MOLES_HOLE_COUNT, MOLES_MIN_COUNT, MOLES_MAX_COUNT,
  minesMultiplierFor, molesMultiplier, PUMP_MULTIPLIERS, type PumpDifficulty, pumpMultiplier
} from "@replicate/fairness-core";
import { multiplyMinorByDecimal, floorMinorByDecimal } from "./money.ts";
import { PaymentDomainError } from "./domain-error.ts";

// Pure progressive rules shared by host settlement and the measured enclave.
// State contains secret future outcomes; only an explicit public projection may cross the enclave boundary.
export type ProgressiveGameId = "stake-pump" | "chicken-cross" | "tower" | "dragon-tower" | "moles" | "rainbet-mines";
export type ProgressiveRoundStatus = "ACTIVE" | "LOST" | "CASHED_OUT" | "COMPLETED";

export interface PumpProgressiveState {
  readonly kind: "pump";
  readonly difficulty: PumpDifficulty;
  readonly popPoint: number;
  readonly step: number;
}

export interface ChickenProgressiveState {
  readonly kind: "chicken-cross";
  readonly difficulty: ChickenDifficulty;
  readonly lanes: readonly ChickenLaneResolution[];
  readonly crossings: readonly ChickenLaneResolution[];
  readonly step: number;
}

export interface DragonTowerProgressivePick {
  readonly floor: number;
  readonly column: number;
  readonly safe: boolean;
}

export interface DragonTowerProgressiveState {
  readonly kind: "dragon-tower";
  readonly difficulty: DragonTowerDifficulty;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: readonly DragonTowerProgressivePick[];
  readonly floor: number;
}

export interface TowerProgressiveState {
  readonly kind: "tower";
  readonly difficulty: TowerDifficulty;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: readonly DragonTowerProgressivePick[];
  readonly floor: number;
}

export interface MolesProgressivePick {
  readonly step: number;
  readonly tile: number;
  readonly safe: boolean;
}

export interface MolesProgressiveState {
  readonly kind: "moles";
  readonly moles: number;
  readonly safeRows: readonly (readonly number[])[];
  readonly picks: readonly MolesProgressivePick[];
  readonly step: number;
}

export interface MinesProgressiveState {
  readonly kind: "mines";
  readonly gridSize: 25 | 36 | 49 | 64;
  readonly mineCount: number;
  readonly mines: readonly number[];
  readonly revealed: readonly number[];
  readonly maxPayoutMinor: string;
}

export type ProgressiveGameState =
  | PumpProgressiveState
  | ChickenProgressiveState
  | TowerProgressiveState
  | DragonTowerProgressiveState
  | MolesProgressiveState
  | MinesProgressiveState;

export function isProgressiveGameId(value: string): value is ProgressiveGameId {
  return (
    value === "stake-pump" ||
    value === "chicken-cross" ||
    value === "tower" ||
    value === "dragon-tower" ||
    value === "moles" ||
    value === "rainbet-mines"
  );
}

export function isChickenDifficulty(value: unknown): value is ChickenDifficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert";
}

export function chickenDifficultyFromProgressiveAction(action: string): ChickenDifficulty {
  const value = action.match(/:difficulty:(easy|medium|hard|expert)(?::|$)/)?.[1];
  if (action.includes(":difficulty:") && !isChickenDifficulty(value)) {
    throw new PaymentDomainError("invalid_action", "Invalid Chicken difficulty");
  }
  return isChickenDifficulty(value) ? value : "medium";
}

export function chickenStepFromProgressiveAction(action: string): number {
  const value = action.match(/:step:(\d+)(?::|$)/)?.[1];
  if (action.includes(":step:") && value === undefined) {
    throw new PaymentDomainError("invalid_action", "Invalid Chicken step");
  }
  return value === undefined ? 0 : Number(value);
}

export function minesConfigurationFromProgressiveAction(action: string): {
  readonly gridSize: 25 | 36 | 49 | 64;
  readonly mineCount: number;
} {
  const match = /^start:(25|36|49|64):(\d+)$/.exec(action);
  const gridSize = Number(match?.[1]);
  const mineCount = Number(match?.[2]);
  if (
    !MINES_GRID_SIZES.includes(gridSize as 25 | 36 | 49 | 64) ||
    !Number.isSafeInteger(mineCount) ||
    mineCount < 1 ||
    mineCount >= gridSize
  ) {
    throw new PaymentDomainError("invalid_action", "Invalid Midnight Mines grid or mine count");
  }
  return { gridSize: gridSize as 25 | 36 | 49 | 64, mineCount };
}

export function minesMaximumPayoutMinor(
  wagerMinor: bigint,
  gridSize: 25 | 36 | 49 | 64,
  mineCount: number,
  houseMaxPayoutMinor: bigint
): bigint {
  const fullClearMultiplier = Math.min(
    MINES_MAX_MULTIPLIER,
    minesMultiplierFor(gridSize, mineCount, gridSize - mineCount)
  );
  const productMaximum = multiplyMinorByDecimal(wagerMinor, fullClearMultiplier.toFixed(4));
  return productMaximum < houseMaxPayoutMinor ? productMaximum : houseMaxPayoutMinor;
}

export function multiplierForMinorPayout(wagerMinor: bigint, payoutMinor: bigint): number {
  if (wagerMinor <= 0n || payoutMinor < 0n) throw new Error("Invalid Midnight Mines capped payout");
  const tenThousandths = (payoutMinor * 10_000n + wagerMinor / 2n) / wagerMinor;
  return Number(tenThousandths) / 10_000;
}

export function createProgressiveState(input: {
  readonly gameId: ProgressiveGameId;
  readonly action: string;
  readonly serverSeed: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly maxPayoutMinor?: bigint;
}): { readonly fairnessAction: string; readonly state: ProgressiveGameState; readonly multiplier: number } {
  if (input.gameId === "stake-pump") {
    const difficulty = input.action.match(/^start:(easy|medium|hard|expert)$/)?.[1];
    if (!isPumpDifficulty(difficulty)) throw new PaymentDomainError("invalid_action", "Invalid Pump difficulty");
    return {
      fairnessAction: input.action,
      state: {
        kind: "pump",
        difficulty,
        popPoint: generatePumpPopPoint(input.serverSeed, {
          gameId: input.gameId,
          clientSeed: input.clientSeed,
          nonce: input.nonce,
          action: input.action
        }),
        step: 0
      },
      multiplier: 1
    };
  }
  if (input.gameId === "chicken-cross") {
    if (!input.action.startsWith("cross-next-lane") || chickenStepFromProgressiveAction(input.action) !== 0) {
      throw new PaymentDomainError("invalid_action", "Chicken rounds must begin at lane 1");
    }
    const difficulty = chickenDifficultyFromProgressiveAction(input.action);
    const fairnessAction = `start:${difficulty}`;
    const lanes = generateChickenPath(input.serverSeed, {
      gameId: input.gameId,
      clientSeed: input.clientSeed,
      nonce: input.nonce,
      action: fairnessAction
    });
    const first = lanes[0];
    if (!first) throw new Error("Chicken path is empty");
    const crossings = [first];
    const success = first.success;
    const step = success ? 1 : 0;
    return {
      fairnessAction,
      state: { kind: "chicken-cross", difficulty, lanes, crossings, step },
      multiplier: success ? first.multiplier : 0
    };
  }
  if (input.gameId === "tower") {
    const difficulty = input.action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
    if (!isTowerDifficulty(difficulty)) {
      throw new PaymentDomainError("invalid_action", "Invalid Tower difficulty");
    }
    return {
      fairnessAction: input.action,
      state: {
        kind: "tower",
        difficulty,
        safeRows: generateTowerLayout(input.serverSeed, {
          gameId: input.gameId,
          clientSeed: input.clientSeed,
          nonce: input.nonce,
          action: input.action
        }),
        picks: [],
        floor: 0
      },
      multiplier: 0
    };
  }
  if (input.gameId === "dragon-tower") {
    const difficulty = input.action.match(/^start:(easy|medium|hard|expert|master)$/)?.[1];
    if (!isDragonTowerDifficulty(difficulty)) {
      throw new PaymentDomainError("invalid_action", "Invalid Dragon Tower difficulty");
    }
    return {
      fairnessAction: input.action,
      state: {
        kind: "dragon-tower",
        difficulty,
        safeRows: generateDragonTowerLayout(input.serverSeed, {
          gameId: input.gameId,
          clientSeed: input.clientSeed,
          nonce: input.nonce,
          action: input.action
        }),
        picks: [],
        floor: 0
      },
      multiplier: 1
    };
  }
  if (input.gameId === "rainbet-mines") {
    const { gridSize, mineCount } = minesConfigurationFromProgressiveAction(input.action);
    if (input.maxPayoutMinor === undefined || input.maxPayoutMinor <= 0n) {
      throw new Error("Midnight Mines maximum payout is missing");
    }
    return {
      fairnessAction: input.action,
      state: {
        kind: "mines",
        gridSize,
        mineCount,
        mines: generateMinesLayout(input.serverSeed, {
          gameId: input.gameId,
          clientSeed: input.clientSeed,
          nonce: input.nonce,
          action: input.action
        }),
        revealed: [],
        maxPayoutMinor: input.maxPayoutMinor.toString()
      },
      multiplier: 1
    };
  }
  const moles = Number(input.action.match(/^start:([1-6])$/)?.[1]);
  if (!Number.isSafeInteger(moles) || moles < MOLES_MIN_COUNT || moles > MOLES_MAX_COUNT) {
    throw new PaymentDomainError("invalid_action", "Invalid Moles count");
  }
  return {
    fairnessAction: input.action,
    state: {
      kind: "moles",
      moles,
      safeRows: generateMolesLayout(input.serverSeed, {
        gameId: input.gameId,
        clientSeed: input.clientSeed,
        nonce: input.nonce,
        action: input.action
      }),
      picks: [],
      step: 0
    },
    multiplier: 0
  };
}


export function advanceProgressiveState(
  active: { readonly id: string; readonly game_id: ProgressiveGameId; readonly wager_minor: bigint },
  initialState: ProgressiveGameState,
  request: { readonly action: string },
  rounding: "half-up" | "floor-minor-v1" = "half-up"
) {
  const payoutProduct = rounding === "floor-minor-v1" ? floorMinorByDecimal : multiplyMinorByDecimal;
    let state = initialState;
    let multiplier = 0;
    let attemptedMultiplier: number | undefined;
    let payoutMinor = 0n;
    let status: ProgressiveRoundStatus = "ACTIVE";
    let revealedMoles: readonly number[] = [];
    if (active.game_id === "stake-pump") {
      if (state.kind !== "pump") throw new Error("Stored Pump state kind is invalid");
      const pump = request.action.match(/^pump:([a-f\d-]+):(\d+)$/i);
      const cashout = request.action.match(/^cashout:([a-f\d-]+)$/i);
      if (pump) {
        const roundId = pump[1] ?? "";
        const requestedStep = Number(pump[2]);
        const maximumStep = PUMP_MULTIPLIERS[state.difficulty].length - 1;
        if (roundId !== active.id) throw new PaymentDomainError("stale_round", "Stale Pump round ID", 409);
        if (requestedStep !== state.step + 1 || requestedStep < 1 || requestedStep > maximumStep) {
          throw new PaymentDomainError("invalid_progression", "Pump the next balloon position", 409);
        }
        attemptedMultiplier = pumpMultiplier(state.difficulty, state.step);
        if (requestedStep === state.popPoint) {
          status = "LOST";
        } else {
          state = { ...state, step: requestedStep };
          multiplier = pumpMultiplier(state.difficulty, requestedStep);
          if (requestedStep === maximumStep) {
            status = "COMPLETED";
            payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          }
        }
      } else if (cashout) {
        if (cashout[1] !== active.id) throw new PaymentDomainError("stale_round", "Stale Pump round ID", 409);
        if (state.step < 1) {
          throw new PaymentDomainError("cashout_unavailable", "Pump the balloon before cashing out", 409);
        }
        status = "CASHED_OUT";
        multiplier = pumpMultiplier(state.difficulty, state.step);
        attemptedMultiplier = multiplier;
        payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Pump command");
      }
    } else if (active.game_id === "chicken-cross") {
      if (state.kind !== "chicken-cross") throw new Error("Stored Chicken state kind is invalid");
      const declaredDifficulty = request.action.match(/:difficulty:(easy|medium|hard|expert)(?::|$)/)?.[1];
      if (declaredDifficulty !== undefined && declaredDifficulty !== state.difficulty) {
        throw new PaymentDomainError("difficulty_locked", "The difficulty cannot change during an active round", 409);
      }
      if (request.action.startsWith("cashout:")) {
        if (chickenStepFromProgressiveAction(request.action) !== state.step) {
          throw new PaymentDomainError("invalid_progression", "Cash out from the current Chicken lane", 409);
        }
        if (state.step < 1) throw new PaymentDomainError("cashout_unavailable", "Cross a lane before cashing out", 409);
        status = "CASHED_OUT";
        multiplier = CHICKEN_PATHS[state.difficulty][state.step - 1] ?? 0;
        payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
      } else if (request.action.startsWith("cross-next-lane")) {
        if (chickenStepFromProgressiveAction(request.action) !== state.step) {
          throw new PaymentDomainError("invalid_progression", "Cross the next Chicken lane", 409);
        }
        const lane = state.lanes[state.step];
        if (!lane) throw new PaymentDomainError("round_complete", "Chicken has already cleared every lane", 409);
        const crossings = [...state.crossings, lane];
        state = { ...state, crossings };
        if (!lane.success) {
          status = "LOST";
        } else {
          state = { ...state, step: state.step + 1 };
          multiplier = lane.multiplier;
          if (state.step === state.lanes.length) {
            status = "COMPLETED";
            payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          }
        }
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Chicken command");
      }
    } else if (active.game_id === "tower") {
      if (state.kind !== "tower") throw new Error("Stored Tower state kind is invalid");
      const pick = request.action.match(/^pick:([a-f\d-]+):(\d+):(\d+)$/i);
      const cashout = request.action.match(/^cashout:([a-f\d-]+)$/i);
      if (pick) {
        const roundId = pick[1] ?? "";
        const floor = Number(pick[2]);
        const column = Number(pick[3]);
        if (roundId !== active.id) throw new PaymentDomainError("stale_round", "Stale Tower round ID", 409);
        if (floor !== state.floor + 1 || floor < 1 || floor > TOWER_FLOORS) {
          throw new PaymentDomainError("invalid_progression", "Pick on the next Tower floor", 409);
        }
        const difficulty = TOWER_DIFFICULTIES[state.difficulty];
        if (!Number.isSafeInteger(column) || column < 0 || column >= difficulty.tiles) {
          throw new PaymentDomainError("invalid_column", "That Tower column is unavailable", 409);
        }
        const safe = state.safeRows[floor - 1]?.includes(column) === true;
        state = { ...state, picks: [...state.picks, { floor, column, safe }] };
        if (!safe) {
          status = "LOST";
        } else {
          state = { ...state, floor };
          multiplier = TOWER_PAYTABLE[state.difficulty][floor - 1] ?? 0;
          if (floor === TOWER_FLOORS) {
            status = "COMPLETED";
            payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          }
        }
      } else if (cashout) {
        if (cashout[1] !== active.id) {
          throw new PaymentDomainError("stale_round", "Stale Tower round ID", 409);
        }
        if (state.floor < 1)
          throw new PaymentDomainError("cashout_unavailable", "Clear a floor before cashing out", 409);
        status = "CASHED_OUT";
        multiplier = TOWER_PAYTABLE[state.difficulty][state.floor - 1] ?? 0;
        payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Tower command");
      }
    } else if (active.game_id === "dragon-tower") {
      if (state.kind !== "dragon-tower") throw new Error("Stored Dragon Tower state kind is invalid");
      const pick = request.action.match(/^pick:([a-f\d-]+):(\d+):(\d+)$/i);
      const cashout = request.action.match(/^cashout:([a-f\d-]+)$/i);
      if (pick) {
        const roundId = pick[1] ?? "";
        const floor = Number(pick[2]);
        const column = Number(pick[3]);
        if (roundId !== active.id) throw new PaymentDomainError("stale_round", "Stale Dragon Tower round ID", 409);
        if (floor !== state.floor + 1 || floor < 1 || floor > DRAGON_TOWER_FLOORS) {
          throw new PaymentDomainError("invalid_progression", "Pick on the next Dragon Tower floor", 409);
        }
        const difficulty = DRAGON_TOWER_DIFFICULTIES[state.difficulty];
        if (!Number.isSafeInteger(column) || column < 0 || column >= difficulty.tiles) {
          throw new PaymentDomainError("invalid_column", "That Dragon Tower column is unavailable", 409);
        }
        const safe = state.safeRows[floor - 1]?.includes(column) === true;
        state = { ...state, picks: [...state.picks, { floor, column, safe }] };
        if (!safe) {
          status = "LOST";
        } else {
          state = { ...state, floor };
          multiplier = DRAGON_TOWER_PAYTABLE[state.difficulty][floor - 1] ?? 0;
          if (floor === DRAGON_TOWER_FLOORS) {
            status = "COMPLETED";
            payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          }
        }
      } else if (cashout) {
        if (cashout[1] !== active.id) {
          throw new PaymentDomainError("stale_round", "Stale Dragon Tower round ID", 409);
        }
        if (state.floor < 1)
          throw new PaymentDomainError("cashout_unavailable", "Clear a floor before cashing out", 409);
        status = "CASHED_OUT";
        multiplier = DRAGON_TOWER_PAYTABLE[state.difficulty][state.floor - 1] ?? 0;
        payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Dragon Tower command");
      }
    } else if (active.game_id === "rainbet-mines") {
      if (state.kind !== "mines") throw new Error("Stored Midnight Mines state kind is invalid");
      const reveal = request.action.match(/^reveal:([a-f\d-]+):(\d+)$/i);
      const cashout = request.action.match(/^cashout:([a-f\d-]+)$/i);
      if (reveal) {
        const roundId = reveal[1] ?? "";
        const index = Number(reveal[2]);
        if (roundId !== active.id) {
          throw new PaymentDomainError("stale_round", "Stale Midnight Mines round ID", 409);
        }
        if (!Number.isSafeInteger(index) || index < 0 || index >= state.gridSize || state.revealed.includes(index)) {
          throw new PaymentDomainError("invalid_progression", "Reveal an available Midnight Mines tile", 409);
        }
        if (state.mines.includes(index)) {
          status = "LOST";
        } else {
          state = { ...state, revealed: [...state.revealed, index] };
          multiplier = minesMultiplierFor(state.gridSize, state.mineCount, state.revealed.length);
          const maximumPayout = BigInt(state.maxPayoutMinor);
          const runningPayout = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          if (runningPayout >= maximumPayout) {
            status = "CASHED_OUT";
            payoutMinor = maximumPayout;
            multiplier = multiplierForMinorPayout(active.wager_minor, payoutMinor);
          } else if (state.revealed.length === state.gridSize - state.mineCount) {
            status = "COMPLETED";
            payoutMinor = runningPayout;
          }
        }
      } else if (cashout) {
        if (cashout[1] !== active.id) {
          throw new PaymentDomainError("stale_round", "Stale Midnight Mines round ID", 409);
        }
        if (state.revealed.length === 0) {
          throw new PaymentDomainError("cashout_unavailable", "Reveal a safe tile before cashing out", 409);
        }
        status = "CASHED_OUT";
        multiplier = minesMultiplierFor(state.gridSize, state.mineCount, state.revealed.length);
        const runningPayout = payoutProduct(active.wager_minor, multiplier.toFixed(4));
        const maximumPayout = BigInt(state.maxPayoutMinor);
        payoutMinor = runningPayout < maximumPayout ? runningPayout : maximumPayout;
        multiplier = multiplierForMinorPayout(active.wager_minor, payoutMinor);
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Midnight Mines command");
      }
    } else {
      if (state.kind !== "moles") throw new Error("Stored Moles state kind is invalid");
      const pick = request.action.match(/^pick:([a-f\d-]+):(\d+):(\d+)$/i);
      const cashout = request.action.match(/^cashout:([a-f\d-]+)$/i);
      if (pick) {
        const roundId = pick[1] ?? "";
        const step = Number(pick[2]);
        const tile = Number(pick[3]);
        if (roundId !== active.id) throw new PaymentDomainError("stale_round", "Stale Moles round ID", 409);
        if (step !== state.step + 1 || step < 1 || step > state.moles) {
          throw new PaymentDomainError("invalid_progression", "Pick the next Moles row", 409);
        }
        if (!Number.isSafeInteger(tile) || tile < 0 || tile >= MOLES_HOLE_COUNT) {
          throw new PaymentDomainError("invalid_tile", "That Moles hole is unavailable", 409);
        }
        revealedMoles = state.safeRows[step - 1] ?? [];
        const safe = revealedMoles.includes(tile);
        state = { ...state, picks: [...state.picks, { step, tile, safe }] };
        if (!safe) {
          status = "LOST";
        } else {
          state = { ...state, step };
          multiplier = molesMultiplier(state.moles, step);
          if (step === state.moles) {
            status = "COMPLETED";
            payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
          }
        }
      } else if (cashout) {
        if (cashout[1] !== active.id) throw new PaymentDomainError("stale_round", "Stale Moles round ID", 409);
        if (state.step < 1) throw new PaymentDomainError("cashout_unavailable", "Find a mole before cashing out", 409);
        status = "CASHED_OUT";
        multiplier = molesMultiplier(state.moles, state.step);
        payoutMinor = payoutProduct(active.wager_minor, multiplier.toFixed(4));
      } else {
        throw new PaymentDomainError("invalid_action", "Invalid Moles command");
      }
    }


  return { state, multiplier, attemptedMultiplier, payoutMinor, status, revealedMoles };
}
