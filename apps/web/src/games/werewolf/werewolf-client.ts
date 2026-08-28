export type WerewolfRole = "wolf" | "seer" | "witch" | "hunter" | "villager";
export type WerewolfPhase =
  | "night_wolf"
  | "night_seer"
  | "night_witch"
  | "hunter_shot"
  | "discussion"
  | "day_vote"
  | "round_over";

export type WerewolfMove =
  | { action: "wolf_vote"; target_id: string; label: string }
  | { action: "inspect"; target_id: string; label: string }
  | { action: "witch"; use: "pass" | "heal" | "poison"; target_id?: string; label: string }
  | { action: "hunter_shot"; target_id: string; label: string }
  | { action: "hunter_pass"; label: string }
  | { action: "speak"; text?: string; label: string }
  | { action: "pass_speech"; label: string }
  | { action: "vote"; target_id: string; label: string };

export type WerewolfPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: "human" | "resident";
  accent: string;
  alive: boolean;
  death: { period: "night" | "day" | "hunter"; number: number } | null;
  role: WerewolfRole | null;
  role_name: string | null;
};

export type WerewolfPrivate = {
  role: WerewolfRole;
  role_name: string;
  team: "wolves" | "villagers";
  wolf_allies?: string[];
  seer_checks?: Array<{ night: number; target_id: string; is_wolf: boolean }>;
  witch?: {
    antidote_available: boolean;
    poison_available: boolean;
    night_target_id: string | null;
  };
};

export type WerewolfView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active" | "finished";
  phase: WerewolfPhase;
  day: number;
  night: number;
  viewer_id: string | null;
  current_player_id: string | null;
  winner: "wolves" | "villagers" | null;
  result: {
    winner: "wolves" | "villagers";
    winner_label: string;
    day: number;
    night: number;
    players: Array<{
      player_id: string;
      name: string;
      role: WerewolfRole;
      role_name: string;
      alive: boolean;
    }>;
  } | null;
  players: WerewolfPlayer[];
  private: WerewolfPrivate | null;
  last_deaths: string[];
  rules: {
    min_player_count: 6;
    max_player_count: 12;
    player_count: number;
    role_deck: WerewolfRole[];
  };
  legal_actions: string[];
  legal_moves: WerewolfMove[];
  recent_events: Array<{
    seq: number;
    revision: number;
    type: string;
    text: string;
    player_id?: string;
    target_id?: string;
    speech?: string | null;
  }>;
};

export type WerewolfSession = {
  display: WerewolfView;
  controller: WerewolfView;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8771").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

export function previewApiAddress(): string {
  return apiBase;
}

export function getWerewolfGame(gameId: string, viewerId: string): Promise<WerewolfView> {
  return request<WerewolfView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

function getPreviewController(gameId: string): Promise<WerewolfView> {
  return request<WerewolfView>(`/api/games/${encodeURIComponent(gameId)}/controller`);
}

async function attachControllerView(display: WerewolfView): Promise<WerewolfSession> {
  if (
    display.phase !== "round_over" &&
    display.current_player_id &&
    display.current_player_id !== display.viewer_id
  ) {
    return {
      display,
      controller: await getWerewolfGame(display.game_id, display.current_player_id),
    };
  }
  if (
    display.phase !== "round_over" &&
    !display.current_player_id &&
    display.phase.startsWith("night_")
  ) {
    return { display, controller: await getPreviewController(display.game_id) };
  }
  return { display, controller: display };
}

export async function createWerewolfGame(
  seed: number,
  playerCount: number,
): Promise<WerewolfSession> {
  const display = await request<WerewolfView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed, player_count: playerCount, viewer_id: "player-1" }),
  });
  return attachControllerView(display);
}

export async function sendWerewolfMove(
  session: WerewolfSession,
  move: WerewolfMove,
): Promise<WerewolfSession> {
  const returnViewerId = session.display.viewer_id ?? "player-1";
  const actorId =
    session.controller.viewer_id ?? session.controller.current_player_id ?? returnViewerId;
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: session.controller.revision,
    actor_id: actorId,
    action: move.action,
  };
  if ("target_id" in move && move.target_id) command.target_id = move.target_id;
  if (move.action === "witch") command.use = move.use;
  if (move.action === "speak") command.text = move.text;
  const result = await request<{ command: { duplicate: boolean }; view: WerewolfView }>(
    `/api/games/${encodeURIComponent(session.controller.game_id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command, viewer_id: returnViewerId }),
    },
  );
  return attachControllerView(result.view);
}
