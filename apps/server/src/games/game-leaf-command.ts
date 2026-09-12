/** Builds private commands from an authoritative viewer projection, never from public table data. */
export interface LeafCommandView {
  revision: number;
  viewer_id: string | null;
  current_player_id: string | null;
  legal_actions: readonly string[];
  rules: { max_play_size: number };
  players: readonly { id: string; hand?: readonly { id: string }[] }[];
}
export interface LeafCommandSelection {
  action: "lead" | "follow" | "challenge" | "concede";
  cardIds?: readonly string[];
  declaredRank?: number;
}
export function buildLeafCommand(view: LeafCommandView, selection: LeafCommandSelection, commandId: string): Record<string, unknown> {
  if(!commandId || !Number.isSafeInteger(view.revision) || view.revision<0) throw new Error("invalid_command_identity");
  if(!view.viewer_id || view.viewer_id!==view.current_player_id || !view.legal_actions.includes(selection.action)) throw new Error("action_unavailable");
  const command:Record<string,unknown>={command_id:commandId,expected_revision:view.revision,action:selection.action};
  if(selection.action==="lead" || selection.action==="follow") {
    const cards=selection.cardIds;
    const hand=view.players.find(player=>player.id===view.viewer_id)?.hand;
    if(!hand || !cards || cards.length<1 || cards.length>view.rules.max_play_size || new Set(cards).size!==cards.length || cards.some(id=>!hand.some(card=>card.id===id))) throw new Error("invalid_card_selection");
    command.card_ids=[...cards];
    if(selection.action==="lead") {
      const rank=selection.declaredRank;
      if(!Number.isInteger(rank) || rank===undefined || rank<1 || rank>10) throw new Error("invalid_declared_rank");
      command.declared_rank=rank;
    } else if(selection.declaredRank!==undefined) throw new Error("unexpected_declared_rank");
  } else if(selection.cardIds!==undefined || selection.declaredRank!==undefined) throw new Error("unexpected_card_selection");
  return command;
}
