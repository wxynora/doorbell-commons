import type { MonopolyMove, MonopolyView } from "./monopoly-client";

export function boardGridPosition(cellIndex: number): { row: number; column: number } {
  if (cellIndex === 0) return { row: 11, column: 11 };
  if (cellIndex <= 10) return { row: 11, column: 11 - cellIndex };
  if (cellIndex <= 20) return { row: 21 - cellIndex, column: 1 };
  if (cellIndex <= 30) return { row: 1, column: cellIndex - 19 };
  return { row: cellIndex - 29, column: 11 };
}

export function moveForCell(
  view: MonopolyView,
  action: "build" | "sell_house",
  cellIndex: number,
): Extract<MonopolyMove, { action: "build" | "sell_house" }> | null {
  return (
    view.legal_moves.find(
      (move): move is Extract<MonopolyMove, { action: "build" | "sell_house" }> =>
        move.action === action && move.cell_idx === cellIndex,
    ) ?? null
  );
}

export function chooseResidentMove(view: MonopolyView): MonopolyMove | null {
  if (view.phase === "game_over") return null;
  const priorities: MonopolyMove["action"][] = [
    "declare_bankrupt",
    "card_ack",
    "buy",
    "build",
    "use_jail_card",
    "roll",
    "end_turn",
    "decline",
    "pay_bail",
    "sell_house",
  ];
  return (
    priorities
      .map((action) => view.legal_moves.find((move) => move.action === action))
      .find((move) => move !== undefined) ?? null
  );
}
