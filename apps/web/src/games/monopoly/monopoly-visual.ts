import type { MonopolyMove, MonopolyView } from "./monopoly-client";
import { boardGridPosition } from "./monopoly-interaction";

export const BOARD = { width: 488, height: 488, corner: 64 } as const;
export const PORTRAIT = { width: 504, height: 784 } as const;
export const LANDSCAPE = { width: 780, height: 620 } as const;

export function tileRect(index: number) {
  const { row, column } = boardGridPosition(index);
  const unitX = (BOARD.width - BOARD.corner * 2) / 9;
  const unitY = (BOARD.height - BOARD.corner * 2) / 9;
  const x = column === 1 ? 0 : BOARD.corner + (column - 2) * unitX;
  const y = row === 1 ? 0 : BOARD.corner + (row - 2) * unitY;
  return {
    x,
    y,
    width: column === 1 || column === 11 ? BOARD.corner : unitX,
    height: row === 1 || row === 11 ? BOARD.corner : unitY,
    side: row === 1 ? "top" : row === 11 ? "bottom" : column === 1 ? "left" : "right",
    corner: index % 10 === 0,
  };
}

export function pawnAnchor(index: number, rank: number, count: number) {
  const rect = tileRect(index);
  let x = rect.x + rect.width / 2;
  let y = rect.y + rect.height / 2 + 9;
  if (!rect.corner) {
    if (rect.side === "top") y = rect.y + rect.height + 7;
    if (rect.side === "bottom") y = rect.y + 8;
    if (rect.side === "left") x = rect.x + rect.width - 4;
    if (rect.side === "right") x = rect.x + 4;
  }
  if (count > 1) {
    // Two rows within the same tile; the anchor never shifts toward another tile.
    x += (rank % 2 === 0 ? -1 : 1) * (rect.corner ? 13 : 9);
    y += (Math.floor(rank / 2) - (count > 2 ? 0.5 : 0)) * 18;
  }
  return { x, y, size: count > 1 ? 28 : 42 };
}

export function movementCells(before: MonopolyView, after: MonopolyView, move: MonopolyMove) {
  const actor = before.players.find((player) => player.id === before.current_player_id);
  const nextActor = after.players.find((player) => player.id === actor?.id);
  if (!actor || !nextActor) return null;
  let cells: number[] = [];
  // Only dice movement gets a walking route. Card relocations are direct transfers.
  // The existing public move event proves that the dice actually moved the player
  // (a failed jail roll / third double must not invent a lap).
  const moved = after.recent_events.some(
    (event) =>
      event.revision > before.revision && event.type === "move" && event.player_id === actor.id,
  );
  if (move.action === "roll" && moved && after.dice) {
    const distance = after.dice[0] + after.dice[1];
    cells = Array.from(
      { length: distance },
      (_, step) => (actor.pos + step + 1) % after.board.length,
    );
  }
  if ((cells.at(-1) ?? actor.pos) !== nextActor.pos) cells.push(nextActor.pos);
  return cells.length ? { playerId: actor.id, cells } : null;
}
