export interface GravityMovement<T> {
  readonly symbol: T;
  readonly from: number;
  readonly to: number;
  readonly distance: number;
}

export interface GravityCascade<T> {
  readonly reels: readonly T[];
  readonly movements: readonly GravityMovement<T>[];
  readonly newPositions: readonly number[];
}

/**
 * Applies row-major column gravity without changing the order of surviving cells.
 * New cells are drawn only for removed positions and enter at the top of each reel.
 */
export function buildGravityCascade<T>(
  grid: readonly T[],
  removed: readonly number[],
  columns: number,
  rows: number,
  draw: (column: number) => T
): GravityCascade<T> {
  if (grid.length !== columns * rows) throw new Error("Gravity grid dimensions do not match");
  const removedSet = new Set(removed);
  if ([...removedSet].some((position) => !Number.isInteger(position) || position < 0 || position >= grid.length)) {
    throw new Error("Gravity removal position is out of range");
  }

  const reels = Array<T>(grid.length);
  const movements: GravityMovement<T>[] = [];
  const newPositions: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const survivors = Array.from({ length: rows }, (_, row) => row * columns + column).filter(
      (position) => !removedSet.has(position)
    );
    const newCount = rows - survivors.length;
    for (let row = 0; row < newCount; row += 1) {
      const position = row * columns + column;
      reels[position] = draw(column);
      newPositions.push(position);
    }
    survivors.forEach((from, survivorIndex) => {
      const to = (newCount + survivorIndex) * columns + column;
      const symbol = grid[from];
      if (symbol === undefined) throw new Error("Gravity survivor is missing");
      reels[to] = symbol;
      movements.push({ symbol, from, to, distance: Math.floor(to / columns) - Math.floor(from / columns) });
    });
  }
  if (reels.some((symbol) => symbol === undefined)) throw new Error("Gravity cascade left an empty cell");
  return { reels, movements, newPositions };
}
