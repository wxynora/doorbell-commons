export type SeatControllerType = "human" | "resident";
export type MonopolyAccent = "coral" | "sky" | "gold" | "mint";

export type MonopolyCellType =
  | "go"
  | "prop"
  | "rail"
  | "util"
  | "tax"
  | "luxury_tax"
  | "chance"
  | "community"
  | "jail"
  | "goto_jail"
  | "parking";

export type MonopolyCell = {
  idx: number;
  type: MonopolyCellType;
  name: string;
  short_name: string;
  group?: `g${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
  price?: number;
  rents?: number[];
  house_cost?: number;
  multipliers?: number[];
  amount?: number;
  flavor?: string[];
};

export type MonopolyPlayer = {
  id: string;
  name: string;
  seat: number;
  controller_type: SeatControllerType;
  accent: MonopolyAccent;
  cash: number;
  pos: number;
  in_jail: boolean;
  jail_turns: number;
  get_out_free: number;
  jail_cards: Array<{ deck: "chance" | "community"; id: string }>;
  bankrupt: boolean;
};

export type MonopolyMove =
  | { action: "roll"; label: string }
  | { action: "buy"; cell_idx: number; amount: number; label: string }
  | { action: "decline"; label: string }
  | { action: "build"; cell_idx: number; amount: number; label: string }
  | { action: "sell_house"; cell_idx: number; amount: number; label: string }
  | { action: "end_turn"; label: string }
  | { action: "pay_bail"; amount: number; label: string }
  | { action: "use_jail_card"; label: string }
  | { action: "card_ack"; label: string }
  | { action: "declare_bankrupt"; label: string };

export type MonopolyView = {
  game_id: string;
  rules_version: string;
  revision: number;
  status: "active";
  phase: "awaiting_roll" | "awaiting_buy" | "awaiting_end" | "game_over";
  viewer_id: string | null;
  current_player_id: string;
  players: MonopolyPlayer[];
  board: MonopolyCell[];
  cells: Record<string, { owner: string; houses: number; rent: number }>;
  dice: [number, number] | null;
  doubles_count: number;
  extra_roll: boolean;
  pending_card: {
    deck: "chance" | "community";
    card: { id: string; text: string; effect: Record<string, unknown> };
  } | null;
  pending_debt: { player_id: string; amount: number; creditor: string | null } | null;
  winner_id: string | null;
  rules: {
    start_cash: number;
    salary: number;
    bail: number;
    luxury_tax: number;
    max_houses: number;
    jail_max_turns: number;
    rail_rents: number[];
    util_multipliers: number[];
    jail_cell: number | null;
  };
  legal_actions: string[];
  legal_moves: MonopolyMove[];
  recent_events: Array<{
    seq: number;
    revision: number;
    type: string;
    text: string;
    player_id?: string;
    cell_idx?: number;
    dice?: [number, number];
  }>;
};

export type MonopolySession = {
  display: MonopolyView;
  controller: MonopolyView;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };

const configuredApi = new URLSearchParams(window.location.search).get("api");
const apiBase = (configuredApi || "http://127.0.0.1:8770").replace(/\/$/, "");

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

export function getMonopolyGame(gameId: string, viewerId: string): Promise<MonopolyView> {
  return request<MonopolyView>(
    `/api/games/${encodeURIComponent(gameId)}?viewer=${encodeURIComponent(viewerId)}`,
  );
}

async function attachControllerView(display: MonopolyView): Promise<MonopolySession> {
  const actorId = display.pending_debt?.player_id ?? display.current_player_id;
  if (display.phase !== "game_over" && actorId && actorId !== display.viewer_id) {
    return {
      display,
      controller: await getMonopolyGame(display.game_id, actorId),
    };
  }
  return { display, controller: display };
}

export async function refreshMonopolyGame(display: MonopolyView): Promise<MonopolySession> {
  return attachControllerView(
    await getMonopolyGame(display.game_id, display.viewer_id ?? "player-1"),
  );
}

export async function createMonopolyGame(seed: number): Promise<MonopolySession> {
  const display = await request<MonopolyView>("/api/games", {
    method: "POST",
    body: JSON.stringify({ seed, viewer_id: "player-1" }),
  });
  return attachControllerView(display);
}

export async function sendMonopolyMove(
  session: MonopolySession,
  move: MonopolyMove,
): Promise<MonopolySession> {
  const returnViewerId = session.display.viewer_id ?? "player-1";
  const actorId =
    session.controller.viewer_id ??
    session.controller.pending_debt?.player_id ??
    session.controller.current_player_id;
  const command: Record<string, unknown> = {
    command_id: crypto.randomUUID(),
    expected_revision: session.controller.revision,
    actor_id: actorId,
    action: move.action,
  };
  if (move.action === "build" || move.action === "sell_house") {
    command.cell_idx = move.cell_idx;
  }
  const result = await request<{ command: { duplicate: boolean }; view: MonopolyView }>(
    `/api/games/${encodeURIComponent(session.controller.game_id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command, viewer_id: returnViewerId }),
    },
  );
  return attachControllerView(result.view);
}
