export type LeafCard = {
  id: string;
  kind: "number" | "wild";
  rank: number | null;
  marked: boolean;
};

export type SeatControllerType = "human" | "resident";

export type LeafPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: SeatControllerType;
  accent: "coral" | "mint" | "sky" | string;
  hand_count: number;
  hand?: LeafCard[];
  drunkenness: number;
  poison_chance: number;
  knocked_out: boolean;
};

export type LeafResolution = {
  type: "challenge" | "concede" | "final_play_uncontested";
  winner_id: string;
  loser_id?: string;
  challenger_id?: string;
  challenged_id?: string;
  declared_rank?: number;
  truthful?: boolean;
  collected_card_count?: number;
  drunkenness_before?: number;
  pile_risk?: number;
  drunkenness_after?: number;
  poison_chance_before?: number;
  poison_chance_after?: number;
  poison_roll_index?: number;
  poison_roll?: number;
  poisoned?: boolean;
  knockout_reason?: "poison" | "drunkenness" | null;
  knocked_out?: boolean;
  revealed_cards: Array<Omit<LeafCard, "id">>;
};

export type LeafGameView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active" | "finished";
  phase: "lead" | "follow" | "final_challenge" | "finished";
  rules: {
    player_count: number;
    initial_hand_size: number;
    max_play_size: number;
    pile_risk_numerator: number;
    pile_risk_denominator: number;
    initial_poison_chance: number;
    poison_chance_step: number;
    knockout_at: number;
    final_challenge_window_ms: number;
    drinking_policy: string;
  };
  players: LeafPlayer[];
  viewer_id: string | null;
  dealer_id: string | null;
  current_player_id: string | null;
  declared_rank: number | null;
  pile: Array<{
    actor_id: string;
    declared_rank: number;
    card_count: number;
  }>;
  pile_card_count: number;
  pile_risk_percent: number;
  pending_winner_id: string | null;
  final_challenge_deadline_ms: number | null;
  final_challenge_remaining_ms: number | null;
  server_now_ms: number;
  winner_id: string | null;
  last_resolution: LeafResolution | null;
  legal_actions: Array<"lead" | "follow" | "challenge" | "concede">;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8765").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!payload.ok) {
    throw new Error(payload.error.message);
  }
  return payload.data;
}

export async function createLeafGame(seed: number): Promise<LeafGameView> {
  return request<LeafGameView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed }),
  });
}

export async function getLeafGame(gameId: string, viewerId: string): Promise<LeafGameView> {
  return request<LeafGameView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

export async function sendLeafCommand(
  view: LeafGameView,
  action: "lead" | "follow" | "challenge" | "concede",
  cardIds: string[],
  declaredRank: number,
): Promise<LeafGameView> {
  if (!view.current_player_id) {
    throw new Error("这局已经没有可行动玩家。 ");
  }
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: view.revision,
    actor_id: view.current_player_id,
    action,
  };
  if (action === "lead" || action === "follow") {
    command.card_ids = cardIds;
  }
  if (action === "lead") {
    command.declared_rank = declaredRank;
  }
  const result = await request<{
    command: { duplicate: boolean; revision: number };
    view: LeafGameView;
  }>(`/api/games/${encodeURIComponent(view.game_id)}/commands`, {
    method: "POST",
    body: JSON.stringify({ command, viewer_id: view.viewer_id }),
  });
  const nextViewer = result.view.current_player_id || result.view.winner_id || view.viewer_id;
  if (!nextViewer) {
    return result.view;
  }
  return getLeafGame(view.game_id, nextViewer);
}

export function previewApiAddress(): string {
  return apiBase;
}
