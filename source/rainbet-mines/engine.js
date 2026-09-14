export const GRID_SIZES = Object.freeze([25, 36, 49, 64]);

export const ROUND_PHASES = Object.freeze({
  idle: "idle",
  configuring: "configuring",
  starting: "round-starting",
  active: "active",
  safeReveal: "safe-reveal",
  lossReveal: "loss-reveal",
  cashout: "cashout",
  settlement: "settlement",
  reset: "reset"
});

export const DEFAULT_GRID_SIZE = 25;
export const DEFAULT_MINE_COUNT = 8;
export const HOUSE_RETURN = 0.96;

function integer(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeGridSize(value) {
  const parsed = integer(value, DEFAULT_GRID_SIZE);
  return GRID_SIZES.includes(parsed) ? parsed : DEFAULT_GRID_SIZE;
}

export function clampMineCount(value, gridSize = DEFAULT_GRID_SIZE) {
  const size = normalizeGridSize(gridSize);
  return Math.min(size - 1, Math.max(1, integer(value, DEFAULT_MINE_COUNT)));
}

export function safeTileCount(gridSize, mineCount) {
  const size = normalizeGridSize(gridSize);
  return size - clampMineCount(mineCount, size);
}

export function mineCountFromSafeTiles(gridSize, safeTiles) {
  const size = normalizeGridSize(gridSize);
  return size - Math.min(size - 1, Math.max(1, integer(safeTiles, size - DEFAULT_MINE_COUNT)));
}

function xmur3(text) {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function boardFromSeed({ gridSize, mineCount, seed = "midnight-mines" }) {
  const size = normalizeGridSize(gridSize);
  const mines = clampMineCount(mineCount, size);
  const random = mulberry32(xmur3(String(seed))());
  const indices = Array.from({ length: size }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [indices[index], indices[target]] = [indices[target], indices[index]];
  }
  return Object.freeze({
    gridSize: size,
    mineCount: mines,
    seed: String(seed),
    mines: Object.freeze(indices.slice(0, mines).sort((left, right) => left - right))
  });
}

export function boardWithForcedMine({ gridSize, mineCount, seed, forcedMineIndex }) {
  const board = boardFromSeed({ gridSize, mineCount, seed });
  const forced = Math.min(board.gridSize - 1, Math.max(0, integer(forcedMineIndex, 0)));
  if (board.mines.includes(forced)) return board;
  const mines = [...board.mines];
  mines[mines.length - 1] = forced;
  return Object.freeze({ ...board, mines: Object.freeze([...new Set(mines)].sort((a, b) => a - b)) });
}

export function multiplierFor({ gridSize, mineCount, revealedCount }) {
  const size = normalizeGridSize(gridSize);
  const mines = clampMineCount(mineCount, size);
  const reveals = Math.min(size - mines, Math.max(0, integer(revealedCount, 0)));
  if (reveals === 0) return 1;
  let probability = 1;
  for (let index = 0; index < reveals; index += 1) {
    probability *= (size - mines - index) / (size - index);
  }
  return HOUSE_RETURN / probability;
}

export const MINES_RAW_MAX_MULTIPLIER = Math.max(
  ...GRID_SIZES.flatMap((gridSize) =>
    Array.from({ length: gridSize - 1 }, (_, index) => {
      const mineCount = index + 1;
      return multiplierFor({ gridSize, mineCount, revealedCount: gridSize - mineCount });
    })
  )
);

// Club settlement stops and pays a round at this product ceiling. Keeping the
// contract below the house payout limit makes the game addable with practical
// wager limits while the raw probability curve remains available to demo play.
export const MINES_MAX_MULTIPLIER = 10_000;

export function payoutFor(wager, multiplier) {
  const amount = Number.isFinite(Number(wager)) ? Math.max(0, Number(wager)) : 0;
  return Math.round(amount * Number(multiplier) * 100) / 100;
}

export function createInitialState(options = {}) {
  const gridSize = normalizeGridSize(options.gridSize);
  const mineCount = clampMineCount(options.mineCount, gridSize);
  return Object.freeze({
    phase: ROUND_PHASES.idle,
    mode: options.mode === "auto" ? "auto" : "manual",
    gridSize,
    mineCount,
    wager: Math.max(0, Number(options.wager) || 0),
    seed: String(options.seed ?? "midnight-mines-1"),
    board: null,
    revealed: Object.freeze([]),
    selectedAutoTiles: Object.freeze([]),
    hitMine: null,
    terminalResult: null,
    multiplier: 1,
    payout: 0,
    profit: 0,
    lastProfit: 0,
    round: 0,
    authority: null,
    message: "Choose a grid, then start a demo round"
  });
}

export function configure(state, updates = {}) {
  if (![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase)) return state;
  const gridSize = normalizeGridSize(updates.gridSize ?? state.gridSize);
  const mineCount = clampMineCount(updates.mineCount ?? state.mineCount, gridSize);
  const boardConfigurationChanged = gridSize !== state.gridSize || mineCount !== state.mineCount;
  const selectedAutoTiles = state.selectedAutoTiles.filter((index) => index < gridSize);
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.configuring,
    gridSize,
    mineCount,
    wager: updates.wager === undefined ? state.wager : Math.max(0, Number(updates.wager) || 0),
    mode: updates.mode === "auto" ? "auto" : updates.mode === "manual" ? "manual" : state.mode,
    selectedAutoTiles: Object.freeze(selectedAutoTiles),
    board: boardConfigurationChanged ? null : state.board,
    revealed: boardConfigurationChanged ? Object.freeze([]) : state.revealed,
    hitMine: boardConfigurationChanged ? null : state.hitMine,
    terminalResult: boardConfigurationChanged ? null : state.terminalResult,
    multiplier: boardConfigurationChanged ? 1 : state.multiplier,
    payout: boardConfigurationChanged ? 0 : state.payout,
    profit: boardConfigurationChanged ? 0 : state.profit,
    authority: boardConfigurationChanged ? null : state.authority,
    message: "Configuration ready"
  });
}

export function toggleAutoTile(state, tileIndex) {
  if (state.mode !== "auto" || ![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase)) return state;
  const index = integer(tileIndex, -1);
  if (index < 0 || index >= state.gridSize) return state;
  const selected = new Set(state.selectedAutoTiles);
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  const sorted = [...selected].sort((left, right) => left - right);
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.configuring,
    selectedAutoTiles: Object.freeze(sorted),
    message: sorted.length ? `${sorted.length} tile${sorted.length === 1 ? "" : "s"} selected` : "Please select at least one tile"
  });
}

export function startRound(state, options = {}) {
  if (![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase)) return state;
  const seed = String(options.seed ?? `${state.seed}:${state.round + 1}`);
  const board = options.forcedMineIndex === undefined
    ? boardFromSeed({ gridSize: state.gridSize, mineCount: state.mineCount, seed })
    : boardWithForcedMine({ gridSize: state.gridSize, mineCount: state.mineCount, seed, forcedMineIndex: options.forcedMineIndex });
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.starting,
    seed,
    board,
    revealed: Object.freeze([]),
    hitMine: null,
    terminalResult: null,
    multiplier: 1,
    payout: 0,
    profit: 0,
    round: state.round + 1,
    authority: null,
    message: "Round starting"
  });
}

export function startAuthoritativeRound(state, options = {}) {
  if (![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase)) return state;
  const roundId = String(options.roundId ?? "").trim();
  const serverSeedHash = String(options.serverSeedHash ?? "").trim();
  const suppliedMaximumPayout = Number(options.maxPayout);
  const maxPayout = Number.isFinite(suppliedMaximumPayout) && suppliedMaximumPayout > 0
    ? suppliedMaximumPayout
    : null;
  if (!roundId || !/^[a-f\d]{64}$/i.test(serverSeedHash)) return state;
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.starting,
    wager: options.wager === undefined ? 0 : Math.max(0, Number(options.wager) || 0),
    seed: `server:${roundId}`,
    board: Object.freeze({
      gridSize: state.gridSize,
      mineCount: state.mineCount,
      seed: `committed:${serverSeedHash}`,
      mines: Object.freeze([])
    }),
    revealed: Object.freeze([]),
    hitMine: null,
    terminalResult: null,
    multiplier: 1,
    payout: 0,
    profit: 0,
    round: state.round + 1,
    authority: Object.freeze({ roundId, serverSeedHash, maxPayout, receipt: null }),
    message: "Server-authoritative round starting"
  });
}

export function activateRound(state) {
  if (state.phase !== ROUND_PHASES.starting) return state;
  return Object.freeze({ ...state, phase: ROUND_PHASES.active, message: "Select a tile" });
}

export function resolveTile(state, tileIndex) {
  if (state.phase !== ROUND_PHASES.active || !state.board) return Object.freeze({ state, outcome: "ignored" });
  const index = integer(tileIndex, -1);
  if (index < 0 || index >= state.gridSize || state.revealed.includes(index)) return Object.freeze({ state, outcome: "ignored" });
  if (state.board.mines.includes(index)) {
    return Object.freeze({
      outcome: "mine",
      state: Object.freeze({
        ...state,
        phase: ROUND_PHASES.lossReveal,
        hitMine: index,
        profit: -state.wager,
        lastProfit: -state.wager,
        message: "Mine hit"
      })
    });
  }
  const revealed = Object.freeze([...state.revealed, index]);
  const multiplier = multiplierFor({ gridSize: state.gridSize, mineCount: state.mineCount, revealedCount: revealed.length });
  const payout = payoutFor(state.wager, multiplier);
  return Object.freeze({
    outcome: "safe",
    state: Object.freeze({
      ...state,
      phase: ROUND_PHASES.safeReveal,
      revealed,
      multiplier,
      payout,
      profit: Math.round((payout - state.wager) * 100) / 100,
      message: `${multiplier.toFixed(2)}× unlocked`
    })
  });
}

function authoritativeMines(result, state) {
  if (!Array.isArray(result.mines)) return Object.freeze([]);
  const mines = result.mines
    .map((value) => integer(value, -1))
    .filter((value, index, values) => value >= 0 && value < state.gridSize && values.indexOf(value) === index)
    .sort((left, right) => left - right);
  return Object.freeze(mines.length === state.mineCount ? mines : []);
}

function authoritativeMultiplier(result, fallback = 1) {
  const micros = Number.parseInt(String(result.multiplierMicros ?? ""), 10);
  if (Number.isSafeInteger(micros) && micros >= 0) return micros / 1_000_000;
  const multiplier = Number(result.multiplier);
  return Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : fallback;
}

export function restoreAuthoritativeRound(state, result = {}) {
  if (![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase)) return state;
  const gridSize = Number(result.gridSize);
  const mineCount = Number(result.mineCount);
  const revealed = Array.isArray(result.revealed)
    ? result.revealed
      .map((value) => integer(value, -1))
      .filter((value, index, values) => value >= 0 && value < gridSize && values.indexOf(value) === index)
    : [];
  if (
    !GRID_SIZES.includes(gridSize)
    || !Number.isSafeInteger(mineCount)
    || mineCount < 1
    || mineCount >= gridSize
    || revealed.length !== (Array.isArray(result.revealed) ? result.revealed.length : -1)
    || revealed.length > gridSize - mineCount
  ) return state;
  const configured = configure(state, { gridSize, mineCount, wager: result.wager });
  const started = startAuthoritativeRound(configured, {
    roundId: result.roundId,
    serverSeedHash: result.serverSeedHash,
    wager: result.wager,
    maxPayout: result.maxPayout
  });
  if (started === configured) return state;
  const multiplier = authoritativeMultiplier(result, revealed.length
    ? multiplierFor({ gridSize, mineCount, revealedCount: revealed.length })
    : 1);
  const payout = revealed.length ? payoutFor(started.wager, multiplier) : 0;
  return Object.freeze({
    ...started,
    phase: ROUND_PHASES.active,
    revealed: Object.freeze(revealed),
    multiplier,
    payout,
    profit: revealed.length ? Math.round((payout - started.wager) * 100) / 100 : 0,
    message: revealed.length ? "Select a tile or cash out" : "Select a tile"
  });
}

export function resolveAuthoritativeTile(state, tileIndex, result = {}) {
  if (state.phase !== ROUND_PHASES.active || !state.board || !state.authority) {
    return Object.freeze({ state, outcome: "ignored" });
  }
  const index = integer(tileIndex, -1);
  if (index < 0 || index >= state.gridSize || state.revealed.includes(index)) {
    return Object.freeze({ state, outcome: "ignored" });
  }
  if (result.outcome === "loss" && result.status === "settled") {
    const mines = authoritativeMines(result, state);
    if (mines.length !== state.mineCount || !mines.includes(index)) return Object.freeze({ state, outcome: "ignored" });
    return Object.freeze({
      outcome: "mine",
      state: Object.freeze({
        ...state,
        phase: ROUND_PHASES.lossReveal,
        board: Object.freeze({ ...state.board, mines }),
        hitMine: index,
        multiplier: 0,
        payout: 0,
        profit: -state.wager,
        lastProfit: -state.wager,
        authority: Object.freeze({ ...state.authority, receipt: result.proof ?? null }),
        message: "Mine hit"
      })
    });
  }
  if (result.outcome !== "safe" && result.outcome !== "cleared") {
    return Object.freeze({ state, outcome: "ignored" });
  }
  const responseRevealed = Array.isArray(result.revealed) ? result.revealed : [...state.revealed, index];
  const revealed = Object.freeze(
    responseRevealed
      .map((value) => integer(value, -1))
      .filter((value, position, values) => value >= 0 && value < state.gridSize && values.indexOf(value) === position)
  );
  if (!revealed.includes(index) || revealed.length !== state.revealed.length + 1) {
    return Object.freeze({ state, outcome: "ignored" });
  }
  const cleared = result.outcome === "cleared" && result.status === "settled";
  const mines = cleared ? authoritativeMines(result, state) : state.board.mines;
  if (cleared && mines.length !== state.mineCount) return Object.freeze({ state, outcome: "ignored" });
  const multiplier = authoritativeMultiplier(result, multiplierFor({
    gridSize: state.gridSize,
    mineCount: state.mineCount,
    revealedCount: revealed.length
  }));
  const suppliedPayout = Number(result.payout);
  const payout = cleared && Number.isFinite(suppliedPayout) && suppliedPayout >= 0
    ? suppliedPayout
    : payoutFor(state.wager, multiplier);
  return Object.freeze({
    outcome: "safe",
    state: Object.freeze({
      ...state,
      phase: cleared ? ROUND_PHASES.cashout : ROUND_PHASES.safeReveal,
      board: Object.freeze({ ...state.board, mines }),
      revealed,
      multiplier,
      payout,
      profit: Math.round((payout - state.wager) * 100) / 100,
      authority: Object.freeze({ ...state.authority, receipt: cleared ? result.proof ?? null : null }),
      message: `${multiplier.toFixed(2)}× unlocked`
    })
  });
}

export function applyAuthoritativeCashout(state, result = {}) {
  if (![ROUND_PHASES.active, ROUND_PHASES.safeReveal].includes(state.phase) || !state.authority || state.revealed.length === 0) {
    return state;
  }
  if (result.status !== "settled" || result.outcome !== "cashout") return state;
  const mines = authoritativeMines(result, state);
  if (mines.length !== state.mineCount) return state;
  const multiplier = authoritativeMultiplier(result, state.multiplier);
  const suppliedPayout = Number(result.payout);
  const payout = Number.isFinite(suppliedPayout) && suppliedPayout >= 0
    ? suppliedPayout
    : payoutFor(state.wager, multiplier);
  const profit = Math.round((payout - state.wager) * 100) / 100;
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.cashout,
    board: Object.freeze({ ...state.board, mines }),
    multiplier,
    payout,
    profit,
    lastProfit: profit,
    authority: Object.freeze({ ...state.authority, receipt: result.proof ?? null }),
    message: result.payout === undefined
      ? `${multiplier.toFixed(2)}× play-money round completed`
      : `${multiplier.toFixed(2)}× cashed out`
  });
}

export function finishSafeReveal(state) {
  if (state.phase !== ROUND_PHASES.safeReveal) return state;
  const complete = state.revealed.length >= state.gridSize - state.mineCount;
  return complete ? requestCashout(state) : Object.freeze({ ...state, phase: ROUND_PHASES.active, message: "Select a tile or cash out" });
}

export function requestCashout(state) {
  if (![ROUND_PHASES.active, ROUND_PHASES.safeReveal].includes(state.phase) || state.revealed.length === 0) return state;
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.cashout,
    lastProfit: state.profit,
    message: `${state.multiplier.toFixed(2)}× cashed out`
  });
}

export function beginSettlement(state) {
  if (![ROUND_PHASES.cashout, ROUND_PHASES.lossReveal].includes(state.phase)) return state;
  return Object.freeze({ ...state, phase: ROUND_PHASES.settlement });
}

export function resetRound(state) {
  if (![ROUND_PHASES.settlement, ROUND_PHASES.cashout, ROUND_PHASES.lossReveal, ROUND_PHASES.reset].includes(state.phase)) return state;
  return Object.freeze({
    ...state,
    phase: ROUND_PHASES.reset,
    terminalResult: state.hitMine === null ? "cashout" : "loss",
    message: state.mode === "auto" && state.selectedAutoTiles.length === 0
      ? "Please select at least one tile"
      : "Ready for another demo round"
  });
}

export function isControlLocked(state) {
  return ![ROUND_PHASES.idle, ROUND_PHASES.configuring, ROUND_PHASES.reset].includes(state.phase);
}

export function isTileInteractive(state, index) {
  if (state.mode === "auto" && !isControlLocked(state)) return index >= 0 && index < state.gridSize;
  return state.phase === ROUND_PHASES.active && !state.revealed.includes(index);
}

export function debugScenarioFromSearch(searchText) {
  const search = new URLSearchParams(searchText);
  const enabled = search.get("debug") === "1" || search.has("state") || search.has("frame") || search.has("outcome");
  if (!enabled) return Object.freeze({ enabled: false });
  const gridSize = normalizeGridSize(search.get("grid"));
  const mineCount = clampMineCount(search.get("mines"), gridSize);
  const revealed = (search.get("reveals") ?? "")
    .split(",")
    .map((value) => integer(value, -1))
    .filter((value, index, values) => value >= 0 && value < gridSize && values.indexOf(value) === index);
  return Object.freeze({
    enabled: true,
    state: search.get("state") ?? "idle",
    frame: Math.max(0, Number(search.get("frame")) || 0),
    outcome: search.get("outcome") ?? "safe",
    gridSize,
    mineCount,
    seed: search.get("seed") ?? "debug-board",
    forcedMineIndex: Math.min(gridSize - 1, Math.max(0, integer(search.get("mine"), 0))),
    revealed: Object.freeze(revealed),
    mode: search.get("mode") === "auto" ? "auto" : "manual"
  });
}
