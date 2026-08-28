export type FlyingMove =
  | { action: "roll" }
  | { action: "move"; piece_id: string; piece_number: number }
  | { action: "penalty_return"; piece_id: string; piece_number: number };

export type SeatControllerType = "human" | "resident";

export type FlyingPiece = {
  id: string;
  number: number;
  progress: number;
  zone: "hangar" | "launch" | "track" | "home" | "goal";
  finished: boolean;
  outer_index?: number;
  home_step?: number;
};

export type FlyingPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: SeatControllerType;
  accent: "coral" | "gold" | "sky" | "mint";
  wins: number;
  hangar_count: number;
  goal_count: number;
  pieces: FlyingPiece[];
};

export type FlyingLastMove = {
  player_id: string;
  piece_id: string;
  piece_number: number;
  dice: number;
  from_progress: number;
  to_progress: number;
  effects: string[];
  captured_piece_ids: string[];
};

export type FlyingView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active" | "finished";
  phase: "awaiting_roll" | "awaiting_move" | "awaiting_penalty" | "round_over";
  round: number;
  viewer_id: string | null;
  current_player_id: string | null;
  dice: number | null;
  last_roll: { player_id: string; dice: number; revision: number } | null;
  consecutive_sixes: number;
  winner_id: string | null;
  players: FlyingPlayer[];
  board: {
    outer_length: number;
    main_steps: number;
    home_steps: number;
    goal_progress: number;
    start_indices: number[];
    own_color_progress: number[];
    flight_source_progress: number;
    flight_dest_progress: number;
    home_cross_progress: number;
  };
  last_move: FlyingLastMove | null;
  legal_actions: string[];
  legal_piece_ids: string[];
  legal_moves: FlyingMove[];
  recent_events: Array<{
    type: string;
    text: string;
    player_id?: string;
    dice?: number;
  }>;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8768").replace(/\/$/, "");

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

export function getFlyingChessGame(gameId: string, viewerId: string): Promise<FlyingView> {
  return request<FlyingView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

async function viewForCurrentController(view: FlyingView): Promise<FlyingView> {
  if (
    view.phase !== "round_over" &&
    view.current_player_id &&
    view.current_player_id !== view.viewer_id
  ) {
    return getFlyingChessGame(view.game_id, view.current_player_id);
  }
  return view;
}

export async function createFlyingChessGame(seed: number): Promise<FlyingView> {
  const view = await request<FlyingView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed, viewer_id: "player-1" }),
  });
  return viewForCurrentController(view);
}

export async function sendFlyingChessMove(
  controllerView: FlyingView,
  move: FlyingMove,
  returnViewerId: string,
): Promise<FlyingView> {
  const actorId = controllerView.current_player_id ?? returnViewerId;
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: controllerView.revision,
    actor_id: actorId,
    action: move.action,
  };
  if (move.action === "move" || move.action === "penalty_return") {
    command.piece_id = move.piece_id;
  }
  const result = await request<{ command: { duplicate: boolean }; view: FlyingView }>(
    `/api/games/${encodeURIComponent(controllerView.game_id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command, viewer_id: returnViewerId }),
    },
  );
  return viewForCurrentController(result.view);
}
