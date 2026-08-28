export type DdzCard = {
  id: string;
  suit: "S" | "H" | "D" | "C" | "X";
  rank: number;
  joker: boolean;
  label: string;
};

export type SeatControllerType = "human" | "resident";

export type DdzCombo = {
  type: string;
  size: number;
  main_rank: number;
  length: number;
  cards: string[];
  label: string;
};

export type DdzMove =
  | { action: "bid"; value: number }
  | { action: "play"; card_ids: string[]; as: string; combo: DdzCombo }
  | { action: "pass" }
  | { action: "next_round" };

export type DdzPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: SeatControllerType;
  accent: string;
  is_landlord: boolean;
  bid: number | null;
  passed: boolean;
  played_count: number;
  score: number;
  hand_count: number;
  hand?: DdzCard[];
};

export type DdzResult = {
  player_id: string;
  name: string;
  is_landlord: boolean;
  delta: number;
  score: number;
};

export type DdzView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active" | "finished";
  phase: "bidding" | "playing" | "round_over" | "game_over";
  round: number;
  viewer_id: string | null;
  current_player_id: string | null;
  leader_id: string | null;
  landlord_id: string | null;
  players: DdzPlayer[];
  bids: Array<{ player_id: string; value: number }>;
  high_bid: { player_id: string; value: number } | null;
  base: number | null;
  bottom_cards: DdzCard[] | null;
  field: { cards: DdzCard[]; by: string; combo: DdzCombo } | null;
  last_to_play: string | null;
  pile_count: number;
  pass_streak: number;
  bombs: number;
  multiplier: number;
  spring: boolean;
  anti_spring: boolean;
  round_winner: "landlord" | "farmer" | null;
  last_results: DdzResult[] | null;
  winner_id: string | null;
  legal_actions: string[];
  legal_bid_values: number[];
  legal_moves: DdzMove[];
  recent_events: Array<{ type: string; text: string; player_id?: string }>;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8767").replace(/\/$/, "");

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

export function previewApiAddress(): string {
  return apiBase;
}

export function getDoudizhuGame(gameId: string, viewerId: string): Promise<DdzView> {
  return request<DdzView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

export function createDoudizhuGame(seed: number): Promise<DdzView> {
  return request<DdzView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed, viewer_id: "player-1" }),
  });
}

export async function sendDoudizhuMove(
  controllerView: DdzView,
  move: DdzMove,
  returnViewerId: string,
): Promise<DdzView> {
  const actorId = controllerView.current_player_id ?? returnViewerId;
  if (!actorId) {
    throw new Error("当前没有可行动玩家。");
  }
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: controllerView.revision,
    actor_id: actorId,
    action: move.action,
  };
  if (move.action === "bid") {
    command.value = move.value;
  }
  if (move.action === "play") {
    command.card_ids = move.card_ids;
    command.as = move.as;
  }
  const result = await request<{ command: { duplicate: boolean }; view: DdzView }>(
    `/api/games/${encodeURIComponent(controllerView.game_id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command, viewer_id: returnViewerId }),
    },
  );
  return result.view;
}
