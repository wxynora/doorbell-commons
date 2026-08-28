export type UnoColor = "R" | "G" | "B" | "Y";
export type SeatControllerType = "human" | "resident";

export type UnoCard = {
  id: string;
  color: UnoColor | null;
  value: string;
  kind: "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
  number: number | null;
  points: number;
  wild: boolean;
  label: string;
};

export type UnoMove =
  | { action: "play"; card_id: string; color?: UnoColor; label: string }
  | { action: "draw"; label: string }
  | { action: "keep"; label: string }
  | { action: "call_uno"; label: string }
  | { action: "catch_uno"; offender_id: string; label: string }
  | { action: "next_round"; label: string };

export type UnoPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: SeatControllerType;
  accent: "coral" | "sky" | "gold" | "mint";
  score: number;
  hand_count: number;
  uno: boolean;
  uno_missed: boolean;
  hand?: UnoCard[];
};

export type UnoRoundResult = {
  round: number;
  winner_id: string;
  gain: number;
  players: Array<{
    player_id: string;
    name: string;
    hand_count: number;
    hand_points: number;
    gain: number;
    score: number;
  }>;
};

export type UnoView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active";
  phase: "playing" | "round_over";
  round: number;
  viewer_id: string | null;
  current_player_id: string | null;
  leader_id: string;
  direction: 1 | -1;
  direction_label: "顺时针" | "逆时针";
  players: UnoPlayer[];
  top_card: UnoCard | null;
  active_color: UnoColor;
  active_color_name: string;
  deck_count: number;
  discard_count: number;
  pending: { player_id: string; mine: boolean; card_id: string | null } | null;
  uno_catch: {
    offender_id: string;
    offender_name: string;
    next_player_id: string;
  } | null;
  last_results: UnoRoundResult | null;
  rounds: UnoRoundResult[];
  rules: { stack_draw2: false };
  legal_actions: string[];
  legal_moves: UnoMove[];
  recent_events: Array<{
    seq: number;
    revision: number;
    type: string;
    text: string;
    player_id?: string;
    card_id?: string;
  }>;
};

export type UnoSession = {
  display: UnoView;
  controller: UnoView;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8769").replace(/\/$/, "");

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

export function getUnoGame(gameId: string, viewerId: string): Promise<UnoView> {
  return request<UnoView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

async function attachControllerView(display: UnoView): Promise<UnoSession> {
  if (
    display.phase === "playing" &&
    display.current_player_id &&
    display.current_player_id !== display.viewer_id
  ) {
    return {
      display,
      controller: await getUnoGame(display.game_id, display.current_player_id),
    };
  }
  return { display, controller: display };
}

export async function createUnoGame(seed: number): Promise<UnoSession> {
  const display = await request<UnoView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed, viewer_id: "player-1" }),
  });
  return attachControllerView(display);
}

export async function sendUnoMove(
  session: UnoSession,
  move: UnoMove,
  actorId?: string,
): Promise<UnoSession> {
  const returnViewerId = session.display.viewer_id ?? "player-1";
  const commandActorId =
    actorId ??
    session.controller.viewer_id ??
    session.controller.current_player_id ??
    returnViewerId;
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: session.controller.revision,
    actor_id: commandActorId,
    action: move.action,
  };
  if (move.action === "play") {
    command.card_id = move.card_id;
    if (move.color) command.color = move.color;
  }
  const result = await request<{ command: { duplicate: boolean }; view: UnoView }>(
    `/api/games/${encodeURIComponent(session.controller.game_id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command, viewer_id: returnViewerId }),
    },
  );
  return attachControllerView(result.view);
}
