export type Tile = { id?: string; code?: string; label?: string; back?: boolean };
export type Action = { action_id: string; kind: string; label: string };
export type Meld = { kind: string; tiles: Tile[] };
export type View = {
  game_id: string;
  revision: number;
  viewer_id: string | null;
  participants: { player_id: string; display_name: string; seat_index: number }[];
  public: {
    phase: string;
    turn_player_id: string | null;
    wall_remaining: number;
    seat_winds: Record<string, string>;
    hand_counts: Record<string, number>;
    discards: Record<string, Tile[]>;
    melds: Record<string, Meld[]>;
    terminal_hands?: Record<string, Tile[]>;
    last_discard: { player_id: string; tile: Tile } | null;
    game_result: null | { draw?: boolean; winner_player_id?: string; total_fan?: number; fans?: { name: string; fan: number }[] };
  };
  private: null | { hand: Tile[]; drawn_tile_id: string | null; own_melds: Meld[]; legal_actions: Action[] };
};

const api = new URLSearchParams(location.search).get("api") || "http://127.0.0.1:8772";
export async function request(path: string, payload?: unknown): Promise<View> {
  const response = await fetch(api + path, payload === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "预览连接失败");
  return data;
}
