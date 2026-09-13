import type { LoungeGameTableStore } from "../lounge-game-table-store.js";
import type { GameService } from "./game-service.js";
import { GameAccessError, type GameActor } from "./types.js";

export const WAITING_SEAT_ABSENCE_MS = 10 * 60_000;
interface WaitingSeat {
  roomId: string;
  playerId: string;
  connections: Set<symbol>;
  timer?: ReturnType<typeof setTimeout>;
}
const seatKey = (roomId: string, playerId: string) => JSON.stringify([roomId, playerId]);

/** A visible human game stream owns presence; watch/MCP streams do not. */
export class WaitingSeatPresence {
  private readonly seats = new Map<string, WaitingSeat>();
  private readonly unsubscribe: () => void;
  private closed = false;
  constructor(
    private readonly tables: Pick<LoungeGameTableStore, "read" | "listPublicTables" | "subscribe">,
    private readonly games: Pick<GameService, "removeDisconnectedWaitingHumanSeat">,
    private readonly onError: (error: unknown) => void,
  ) {
    this.unsubscribe = tables.subscribe(() => this.reconcile());
    this.reconcile();
  }

  connect(roomId: string, actor: GameActor): () => void {
    if (this.closed || actor.controllerType !== "human") return () => {};
    this.reconcile();
    const room = this.tables.read(roomId);
    if (!room?.seats.some(seat => seat.controllerType === "human" && seat.playerId === actor.playerId)) {
      throw new GameAccessError("not_seated");
    }
    const entry = this.seats.get(seatKey(roomId, actor.playerId));
    if (!entry) return () => {}; // Playing games have no absence deadline.
    const connection = Symbol();
    entry.connections.add(connection);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    delete entry.timer;
    return () => {
      if (!entry.connections.delete(connection) || this.closed) return;
      if (this.seats.get(seatKey(roomId, actor.playerId)) === entry) this.arm(entry);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    for (const entry of this.seats.values()) if (entry.timer !== undefined) clearTimeout(entry.timer);
    this.seats.clear();
  }

  private reconcile(): void {
    if (this.closed) return;
    const wanted = new Map<string, { roomId: string; playerId: string }>();
    for (const table of this.tables.listPublicTables()) {
      if (!table.room) continue;
      const room = this.tables.read(table.room.room_id);
      if (room?.phase !== "waiting") continue;
      for (const seat of room.seats) {
        if (seat.controllerType === "human") wanted.set(seatKey(room.roomId, seat.playerId), { roomId: room.roomId, playerId: seat.playerId });
      }
    }
    for (const [key, entry] of this.seats) {
      if (wanted.has(key)) continue;
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      this.seats.delete(key);
    }
    for (const [key, seat] of wanted) {
      if (this.seats.has(key)) continue;
      const entry: WaitingSeat = { ...seat, connections: new Set() };
      this.seats.set(key, entry);
      this.arm(entry);
    }
  }

  private arm(entry: WaitingSeat): void {
    if (entry.connections.size || entry.timer !== undefined) return;
    entry.timer = setTimeout(() => {
      if (this.closed || this.seats.get(seatKey(entry.roomId, entry.playerId)) !== entry || entry.connections.size) return;
      try {
        this.games.removeDisconnectedWaitingHumanSeat(entry.roomId, entry.playerId);
        this.reconcile();
      } catch (error) { this.onError(error); }
    }, WAITING_SEAT_ABSENCE_MS);
    entry.timer.unref?.();
  }
}
