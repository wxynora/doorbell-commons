import type { DdzMove, DdzPlayer, DdzView } from "./doudizhu-client";

function sameCards(first: string[], second: string[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  const expected = new Set(first);
  return second.every((cardId) => expected.has(cardId));
}

export function resolveSelectedMove(view: DdzView, selectedCardIds: string[]): DdzMove | null {
  return (
    view.legal_moves.find(
      (move) => move.action === "play" && sameCards(move.card_ids, selectedCardIds),
    ) ?? null
  );
}

export function chooseResidentMove(view: DdzView): DdzMove | null {
  if (view.phase === "bidding") {
    const bids = view.legal_moves.filter(
      (move): move is Extract<DdzMove, { action: "bid" }> => move.action === "bid",
    );
    const positive = bids.find((move) => move.value > 0 && move.value < 3);
    return positive ?? bids.find((move) => move.value === 0) ?? bids.at(-1) ?? null;
  }
  if (view.phase === "playing") {
    const plays = view.legal_moves.filter(
      (move): move is Extract<DdzMove, { action: "play" }> => move.action === "play",
    );
    const ordinary = plays.find(
      (move) => move.combo.type !== "bomb" && move.combo.type !== "rocket",
    );
    return ordinary ?? plays[0] ?? view.legal_moves.find((move) => move.action === "pass") ?? null;
  }
  return null;
}

export function tableOpponents(view: DdzView): [DdzPlayer | undefined, DdzPlayer | undefined] {
  const viewer = view.players.find((player) => player.id === view.viewer_id);
  if (!viewer) {
    return [view.players[1], view.players[2]];
  }
  const bySeat = new Map(view.players.map((player) => [player.seat, player]));
  return [bySeat.get((viewer.seat + 1) % 3), bySeat.get((viewer.seat + 2) % 3)];
}
