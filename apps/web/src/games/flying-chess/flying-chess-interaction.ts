import type { FlyingMove, FlyingPiece, FlyingPlayer, FlyingView } from "./flying-chess-client";

export type BoardPoint = { x: number; y: number };

export const BOARD_CENTER: BoardPoint = { x: 7, y: 7 };

// One lower-left quarter, continued clockwise by quarter turns.
// Indices still map directly to the engine's 0 / 13 / 26 / 39 starting indices.
// The reference's broad strips and triangular turns share a 360-unit drawing.
// Both artwork and movement use the centers of these same polygons.
const designPoint = (x: number, y: number): BoardPoint => ({
  x: x / 24 - 0.5,
  y: y / 24 - 0.5,
});
const rectangle = (x: number, y: number, width: number, height: number): BoardPoint[] =>
  [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map(([a, b]) => designPoint(a!, b!));
const triangle = (points: [number, number][]): BoardPoint[] => points.map(([x, y]) => designPoint(x, y));
const QUARTER_CELLS = [
  triangle([
    [94, 310],
    [130, 310],
    [130, 346],
  ]),
  rectangle(94, 290, 36, 20),
  rectangle(94, 266, 36, 24),
  triangle([
    [130, 230],
    [130, 266],
    [94, 266],
  ]),
  triangle([
    [94, 230],
    [130, 230],
    [94, 266],
  ]),
  rectangle(70, 230, 24, 36),
  rectangle(50, 230, 20, 36),
  triangle([
    [14, 230],
    [50, 230],
    [50, 266],
  ]),
  rectangle(14, 210, 36, 20),
  rectangle(14, 190, 36, 20),
  rectangle(14, 170, 36, 20),
  rectangle(14, 150, 36, 20),
  rectangle(14, 130, 36, 20),
];

function rotatePoint(point: BoardPoint, quarterTurns: number): BoardPoint {
  let result = point;
  for (let turn = 0; turn < quarterTurns; turn++)
    result = { x: 2 * BOARD_CENTER.x - result.y, y: result.x };
  return result;
}

const SEATS = [0, 1, 2, 3];
export const TRACK_CELLS = SEATS.flatMap((seat) =>
  QUARTER_CELLS.map((polygon) => polygon.map((point) => rotatePoint(point, seat))),
);
export const TRACK_POINTS = TRACK_CELLS.map((polygon) => ({
  x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
  y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
}));
export const HOME_POINTS = SEATS.map((seat) =>
  // Keep authoritative home step 4 exactly on the opposite triangular flight tile.
  [...Array.from({ length: 4 }, (_, step) => 300 - (step * 46) / 3), 236, 218].map((y) =>
    rotatePoint(designPoint(180, y), seat),
  ),
);
export const HANGAR_POINTS = SEATS.map((seat) =>
  [
    [36, 290],
    [70, 290],
    [36, 324],
    [70, 324],
  ].map(([x, y]) => rotatePoint(designPoint(x!, y!), seat)),
);
export const LAUNCH_POINTS = SEATS.map((seat) => rotatePoint(designPoint(98, 334), seat));
// The reference has a short right-triangle tab, not a centered arrowhead.
export const LAUNCH_EXIT_POINTS = SEATS.map((seat) => rotatePoint(designPoint(100, 331), seat));
export const GOAL_POINTS = SEATS.map(() => Array.from({ length: 4 }, () => BOARD_CENTER));

function requiredAt<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing ${label} at index ${index}`);
  return item;
}

export function pointForPiece(player: FlyingPlayer, piece: FlyingPiece): BoardPoint {
  if (piece.finished) {
    const hangar = requiredAt(HANGAR_POINTS, player.seat, "finished plane airport");
    return requiredAt(hangar, piece.number - 1, "finished plane slot");
  }
  if (piece.zone === "hangar") {
    const hangar = requiredAt(HANGAR_POINTS, player.seat, "hangar");
    return requiredAt(hangar, piece.number - 1, "hangar slot");
  }
  if (piece.zone === "launch") {
    return requiredAt(LAUNCH_POINTS, player.seat, "launch point");
  }
  if (piece.zone === "track" && piece.outer_index !== undefined) {
    return requiredAt(TRACK_POINTS, piece.outer_index, "track point");
  }
  if (piece.zone === "home" && piece.home_step !== undefined) {
    const homeLane = requiredAt(HOME_POINTS, player.seat, "home lane");
    return requiredAt(homeLane, piece.home_step - 1, "home point");
  }
  const goals = requiredAt(GOAL_POINTS, player.seat, "goal");
  return requiredAt(goals, piece.number - 1, "goal point");
}

export function moveForPiece(view: FlyingView, pieceId: string): FlyingMove | null {
  return (
    view.legal_moves.find(
      (move) =>
        (move.action === "move" || move.action === "penalty_return") && move.piece_id === pieceId,
    ) ?? null
  );
}

export function launchRotation(seat: number): number {
  const index = ((seat % 4) + 4) % 4;
  const launch = requiredAt(LAUNCH_POINTS, index, "launch point");
  const exit = requiredAt(LAUNCH_EXIT_POINTS, index, "airport exit notch");
  return (Math.atan2(exit.x - launch.x, launch.y - exit.y) * 180) / Math.PI;
}

export function moveActionLabel(
  view: FlyingView,
  move: Extract<FlyingMove, { action: "move" | "penalty_return" }>,
): "起飞" | "前进" | "返航" {
  if (move.action === "penalty_return") return "返航";
  const piece = view.players
    .flatMap((player) => player.pieces)
    .find((candidate) => candidate.id === move.piece_id);
  return piece?.zone === "hangar" ? "起飞" : "前进";
}

export function chooseResidentMove(view: FlyingView): FlyingMove | null {
  const roll = view.legal_moves.find((move) => move.action === "roll");
  if (roll) return roll;
  const player = view.players.find((item) => item.id === view.current_player_id);
  const progress = new Map(player?.pieces.map((piece) => [piece.id, piece.progress]) ?? []);
  const moves = view.legal_moves.filter(
    (move): move is Extract<FlyingMove, { action: "move" }> => move.action === "move",
  );
  if (moves.length) {
    return requiredAt(
      moves.toSorted(
        (first, second) =>
          (progress.get(second.piece_id) ?? -1) - (progress.get(first.piece_id) ?? -1),
      ),
      0,
      "resident move",
    );
  }
  const penalties = view.legal_moves.filter(
    (move): move is Extract<FlyingMove, { action: "penalty_return" }> =>
      move.action === "penalty_return",
  );
  if (penalties.length) {
    return requiredAt(
      penalties.toSorted(
        (first, second) =>
          (progress.get(first.piece_id) ?? 0) - (progress.get(second.piece_id) ?? 0),
      ),
      0,
      "resident penalty",
    );
  }
  return null;
}
