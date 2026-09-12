import type { LoungeGameTableStore } from "./lounge-game-table-store.js";
import type { LoungeGamePresenceAssignment, LoungeService } from "./lounge-service.js";

export type LoungeGamePresenceTables = Pick<
  LoungeGameTableStore,
  "listPublicTables" | "read" | "subscribe"
>;

export type LoungeGamePresenceLounge = Pick<
  LoungeService,
  "reconcileGamePresence" | "reorderGameTableListener"
>;

/**
 * Projects committed game seats into the single public lounge presence row.
 * The adapter owns no game state and never changes a room; it only re-runs the
 * projection whenever the table store publishes a committed change.
 */
export class LoungeGamePresenceAdapter {
  readonly #tables: LoungeGamePresenceTables;
  readonly #lounge: LoungeGamePresenceLounge;
  #unsubscribe: (() => void) | undefined;
  #started = false;
  #closed = false;

  constructor(options: {
    tables: LoungeGamePresenceTables;
    lounge: LoungeGamePresenceLounge;
  }) {
    this.#tables = options.tables;
    this.#lounge = options.lounge;
  }

  start(): void {
    if (this.#closed || this.#started) return;
    this.#started = true;
    this.#unsubscribe = this.#tables.subscribe(() => this.#reconcileAfterTableChange());
    this.#lounge.reorderGameTableListener();
    this.reconcile();
  }

  reconcile(options: { skipNextTableNotification?: boolean } = {}): void {
    if (this.#closed) return;
    this.#lounge.reconcileGamePresence(this.#readAssignments(), options);
  }

  #readAssignments(): LoungeGamePresenceAssignment[] {
    const assignments: LoungeGamePresenceAssignment[] = [];
    for (const table of this.#tables.listPublicTables()) {
      if (!table.room) continue;
      const room = this.#tables.read(table.room.room_id);
      if (!room || room.phase === "finished") continue;
      for (const seat of room.seats) {
        if (
          typeof seat.residentId !== "string" ||
          seat.residentId.length === 0 ||
          seat.controllerType !== "resident"
        ) {
          continue;
        }
        assignments.push({
          residentId: seat.residentId,
          playerId: seat.playerId,
          controllerType: seat.controllerType,
          roomId: room.roomId,
          tableId: table.table_id,
        });
      }
    }
    return assignments;
  }

  #reconcileAfterTableChange(): void {
    this.reconcile({ skipNextTableNotification: true });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }
}
