import type { FlyingMove, FlyingPiece, FlyingPlayer, FlyingView } from "./flying-chess-client";

export type BoardPoint = { x: number; y: number };

const STANDARD_TRACK_POINTS: BoardPoint[] = [
  { x: 0.9, y: 4.4 },
  { x: 1.85, y: 4 },
  { x: 2.75, y: 4 },
  { x: 3.7, y: 4.4 },
  { x: 4.45, y: 3.65 },
  { x: 4.05, y: 2.75 },
  { x: 4.05, y: 1.9 },
  { x: 4.45, y: 0.95 },
  { x: 5.4, y: 0.65 },
  { x: 6.3, y: 0.6 },
  { x: 7.2, y: 0.62 },
  { x: 8.15, y: 0.62 },
  { x: 9.05, y: 0.62 },
  { x: 10, y: 0.95 },
  { x: 10.4, y: 1.9 },
  { x: 10.4, y: 2.75 },
  { x: 10, y: 3.65 },
  { x: 10.8, y: 4.4 },
  { x: 11.7, y: 4 },
  { x: 12.6, y: 4 },
  { x: 13.55, y: 4.45 },
  { x: 13.9, y: 5.35 },
  { x: 13.9, y: 6.25 },
  { x: 13.9, y: 7.15 },
  { x: 13.9, y: 8.05 },
  { x: 13.9, y: 8.95 },
  { x: 13.55, y: 9.9 },
  { x: 12.6, y: 10.3 },
  { x: 11.7, y: 10.3 },
  { x: 10.8, y: 9.9 },
  { x: 10, y: 10.65 },
  { x: 10.4, y: 11.55 },
  { x: 10.4, y: 12.4 },
  { x: 10, y: 13.35 },
  { x: 9.05, y: 13.65 },
  { x: 8.15, y: 13.65 },
  { x: 7.2, y: 13.65 },
  { x: 6.3, y: 13.65 },
  { x: 5.4, y: 13.65 },
  { x: 4.45, y: 13.35 },
  { x: 4.05, y: 12.4 },
  { x: 4.05, y: 11.55 },
  { x: 4.45, y: 10.65 },
  { x: 3.7, y: 9.9 },
  { x: 2.75, y: 10.3 },
  { x: 1.85, y: 10.3 },
  { x: 0.9, y: 9.9 },
  { x: 0.55, y: 8.95 },
  { x: 0.55, y: 8.05 },
  { x: 0.55, y: 7.15 },
  { x: 0.55, y: 6.25 },
  { x: 0.55, y: 5.35 },
];

// The public route starts at the lower-left player's first outer cell.
export const TRACK_POINTS: BoardPoint[] = [
  ...STANDARD_TRACK_POINTS.slice(39),
  ...STANDARD_TRACK_POINTS.slice(0, 39),
];

export const HOME_POINTS: BoardPoint[][] = [
  [
    { x: 7.2, y: 12.55 },
    { x: 7.2, y: 11.9 },
    { x: 7.2, y: 11.25 },
    { x: 7.2, y: 10.65 },
    { x: 7.2, y: 9.95 },
    { x: 7.2, y: 8.9 },
  ],
  [
    { x: 1.45, y: 7.15 },
    { x: 2.2, y: 7.15 },
    { x: 2.95, y: 7.15 },
    { x: 3.7, y: 7.15 },
    { x: 4.45, y: 7.15 },
    { x: 5.4, y: 7.15 },
  ],
  [
    { x: 7.2, y: 1.4 },
    { x: 7.2, y: 2.15 },
    { x: 7.2, y: 2.9 },
    { x: 7.2, y: 3.65 },
    { x: 7.2, y: 4.4 },
    { x: 7.2, y: 5.35 },
  ],
  [
    { x: 13, y: 7.15 },
    { x: 12.25, y: 7.15 },
    { x: 11.5, y: 7.15 },
    { x: 10.8, y: 7.15 },
    { x: 10.05, y: 7.15 },
    { x: 9.05, y: 7.15 },
  ],
];

export const HANGAR_POINTS: BoardPoint[][] = [
  [
    { x: 1.7, y: 11.2 },
    { x: 4.2, y: 11.2 },
    { x: 1.7, y: 13.3 },
    { x: 4.2, y: 13.3 },
  ],
  [
    { x: 1.7, y: 1.7 },
    { x: 4.2, y: 1.7 },
    { x: 1.7, y: 4.2 },
    { x: 4.2, y: 4.2 },
  ],
  [
    { x: 10.8, y: 1.7 },
    { x: 13.3, y: 1.7 },
    { x: 10.8, y: 4.2 },
    { x: 13.3, y: 4.2 },
  ],
  [
    { x: 10.8, y: 11.2 },
    { x: 13.3, y: 11.2 },
    { x: 10.8, y: 13.3 },
    { x: 13.3, y: 13.3 },
  ],
];

export const LAUNCH_POINTS: BoardPoint[] = [
  { x: 5.25, y: 13.85 },
  { x: 0.15, y: 5.25 },
  { x: 9.75, y: 0.15 },
  { x: 13.85, y: 9.75 },
];

const GOAL_POINTS: BoardPoint[][] = [
  [
    { x: 6.75, y: 7.7 },
    { x: 7.15, y: 7.7 },
    { x: 6.75, y: 8.08 },
    { x: 7.15, y: 8.08 },
  ],
  [
    { x: 6.15, y: 6.75 },
    { x: 6.53, y: 6.75 },
    { x: 6.15, y: 7.15 },
    { x: 6.53, y: 7.15 },
  ],
  [
    { x: 6.75, y: 6.15 },
    { x: 7.15, y: 6.15 },
    { x: 6.75, y: 6.53 },
    { x: 7.15, y: 6.53 },
  ],
  [
    { x: 7.7, y: 6.75 },
    { x: 8.08, y: 6.75 },
    { x: 7.7, y: 7.15 },
    { x: 8.08, y: 7.15 },
  ],
];

function requiredAt<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing ${label} at index ${index}`);
  return item;
}

export function pointForPiece(player: FlyingPlayer, piece: FlyingPiece): BoardPoint {
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
  return (((seat % 4) + 4) % 4) * 90;
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
