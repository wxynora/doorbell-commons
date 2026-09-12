/** Classifies an authenticated viewer projection; does not send bells or play moves. */
export type WakeGameKind = "uno" | "doudizhu" | "leaf-game" | "flying-chess" | "monopoly" | "mahjong";
export interface GameWakeEligibility {
  needsDecision: boolean;
  hasOptionalReaction: boolean;
  roundEnded: boolean;
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

/** viewerId must be the same identity used by the engine to produce projection. */
export function gameWakeEligibility(kind: WakeGameKind, projection: unknown, viewerId: string): GameWakeEligibility {
  const view = record(projection);
  const none = {needsDecision:false, hasOptionalReaction:false, roundEnded:false};
  if (!viewerId || view.viewer_id !== viewerId) return none;
  if (kind === "mahjong") {
    const publicView = record(view.public);
    if (publicView.game_result != null) return {...none, roundEnded:true};
    const actions = record(view.private).legal_actions;
    // Cedar moves turn_player_id to the current queued responder, too.
    return {...none, needsDecision:Array.isArray(actions) && actions.length > 0};
  }
  if (view.phase === "round_over" || view.phase === "game_over" || view.status === "finished") {
    return {...none, roundEnded:true};
  }
  const actions = Array.isArray(view.legal_actions) ? view.legal_actions : [];
  const optional = kind === "uno" && actions.some(action => action === "call_uno" || action === "catch_uno");
  // A Monopoly debtor may differ from current_player_id. The engine's private
  // legal list is authoritative; filtering by the current seat would miss them.
  const decisions = actions.filter(action => typeof action === "string" && action !== "next_round"
    && !(kind === "uno" && (action === "call_uno" || action === "catch_uno")));
  return {needsDecision:decisions.length > 0, hasOptionalReaction:optional, roundEnded:false};
}
