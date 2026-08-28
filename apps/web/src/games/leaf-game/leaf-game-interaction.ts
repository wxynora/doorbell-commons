import type { LeafGameView } from "./leaf-game-client";

export type LeafPlayAction = "lead" | "follow";

export type LeafResidentMove = {
  action: "lead" | "follow" | "challenge" | "concede";
  cardIds: string[];
  declaredRank: number;
};

export function resolveSelectedPlayAction(
  legalActions: readonly string[],
  selectedCount: number,
  maxPlaySize: number,
  pending: boolean,
): LeafPlayAction | null {
  if (pending || selectedCount < 1 || selectedCount > maxPlaySize) {
    return null;
  }
  if (legalActions.includes("lead")) {
    return "lead";
  }
  if (legalActions.includes("follow")) {
    return "follow";
  }
  return null;
}

export function chooseResidentMove(view: LeafGameView): LeafResidentMove | null {
  if (view.legal_actions.includes("lead") || view.legal_actions.includes("follow")) {
    const card = view.players.find((player) => player.id === view.viewer_id)?.hand?.[0];
    if (!card) return null;
    return {
      action: view.legal_actions.includes("lead") ? "lead" : "follow",
      cardIds: [card.id],
      declaredRank: card.kind === "number" ? (card.rank ?? 1) : 1,
    };
  }
  if (view.legal_actions.includes("challenge")) {
    return { action: "challenge", cardIds: [], declaredRank: 1 };
  }
  if (view.legal_actions.includes("concede")) {
    return { action: "concede", cardIds: [], declaredRank: 1 };
  }
  return null;
}
