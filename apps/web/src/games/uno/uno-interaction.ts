import type { UnoColor, UnoMove, UnoView } from "./uno-client";

export const UNO_COLORS: UnoColor[] = ["R", "G", "B", "Y"];

export function playsForCard(
  view: UnoView,
  cardId: string,
): Extract<UnoMove, { action: "play" }>[] {
  return view.legal_moves.filter(
    (move): move is Extract<UnoMove, { action: "play" }> =>
      move.action === "play" && move.card_id === cardId,
  );
}

export function colorChoicesForCard(view: UnoView, cardId: string): UnoColor[] {
  return playsForCard(view, cardId)
    .map((move) => move.color)
    .filter((color): color is UnoColor => color !== undefined);
}

export function playForCard(
  view: UnoView,
  cardId: string,
  color?: UnoColor,
): Extract<UnoMove, { action: "play" }> | null {
  return (
    playsForCard(view, cardId).find((move) =>
      color === undefined ? move.color === undefined : move.color === color,
    ) ?? null
  );
}

function preferredWildColor(view: UnoView, cardId: string): UnoColor {
  const current = view.players.find((player) => player.id === view.viewer_id);
  const counts = new Map<UnoColor, number>(UNO_COLORS.map((color) => [color, 0]));
  for (const card of current?.hand ?? []) {
    if (card.id !== cardId && card.color) {
      counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
    }
  }
  return (
    UNO_COLORS.toSorted(
      (first, second) => (counts.get(second) ?? 0) - (counts.get(first) ?? 0),
    )[0] ?? "R"
  );
}

export function chooseResidentMove(view: UnoView): UnoMove | null {
  if (view.phase !== "playing") return null;
  const plays = view.legal_moves.filter(
    (move): move is Extract<UnoMove, { action: "play" }> => move.action === "play",
  );
  if (plays.length) {
    const ordinary = plays.find((move) => move.color === undefined);
    if (ordinary) return ordinary;
    const first = plays[0];
    if (!first) return null;
    const color = preferredWildColor(view, first.card_id);
    return plays.find((move) => move.card_id === first.card_id && move.color === color) ?? first;
  }
  return (
    view.legal_moves.find((move) => move.action === "draw") ??
    view.legal_moves.find((move) => move.action === "keep") ??
    null
  );
}
