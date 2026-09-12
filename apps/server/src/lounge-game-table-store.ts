import type Database from 'better-sqlite3';
import { GameStore } from './games/game-store.js';
import { GameStateError, type GameRoom } from './games/types.js';
export type LoungeTableId = 'square' | 'round';
export class LoungeGameTableStore extends GameStore {
  readonly #db: Database.Database;
  readonly #listeners = new Set<() => void>();
  #notificationDepth = 0;
  constructor(db: Database.Database) { super(db); this.#db = db; }
  subscribe(listener: () => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  /** Run a save path and publish exactly once after its outer transaction returns. */
  withPostCommit<T>(action: () => T): T {
    this.#notificationDepth += 1;
    let succeeded = false;
    try {
      const result = action();
      succeeded = true;
      return result;
    } finally {
      this.#notificationDepth -= 1;
      if (succeeded && this.#notificationDepth === 0) this.#emit();
    }
  }
  #emit() { for (const listener of this.#listeners) listener(); }
  override create(_room: GameRoom): void { throw new GameStateError('table_required'); }
  createAtTable(room: GameRoom, tableId: LoungeTableId): void {
    if (tableId !== 'square' && tableId !== 'round') throw new GameStateError('invalid_table');
    if (room.phase !== 'waiting') throw new GameStateError('new_room_must_wait');
    this.#db.transaction(() => {
      const table = this.#db.prepare('SELECT room_id FROM lounge_game_tables WHERE table_id=?').get(tableId) as {room_id:string|null};
      if (table.room_id !== null) throw new GameStateError('table_occupied');
      super.create(room);
      this.#db.prepare('UPDATE lounge_game_tables SET room_id=? WHERE table_id=?').run(room.roomId, tableId);
    })();
    if (this.#notificationDepth === 0) this.#emit();
  }
  override replace(room: GameRoom, expectedRevision: number): void {
    this.#db.transaction(() => {
      if (room.phase !== 'finished') {
        const others = this.listPublicTables().flatMap(table =>
          table.room && table.room.room_id !== room.roomId ? this.read(table.room.room_id)?.seats ?? [] : []);
        if (room.seats.some(seat => others.some(other => other.playerId === seat.playerId))) {
          throw new GameStateError('already_seated');
        }
      }
      super.replace(room,expectedRevision);
      if (room.phase === 'finished') this.#db.prepare('UPDATE lounge_game_tables SET room_id=NULL WHERE room_id=?').run(room.roomId);
    })();
    if (this.#notificationDepth === 0) this.#emit();
  }
  listPublicTables() {
    const rows = this.#db.prepare(`SELECT t.table_id,r.room_id,r.kind,r.phase,r.revision
      FROM lounge_game_tables t LEFT JOIN game_rooms r ON t.room_id=r.room_id ORDER BY t.table_id`).all() as Array<{table_id:LoungeTableId;room_id:string|null;kind:GameRoom['kind']|null;phase:GameRoom['phase']|null;revision:number|null}>;
    return rows.map(r=>({table_id:r.table_id,room:r.room_id===null?null:{room_id:r.room_id,kind:r.kind!,phase:r.phase!,revision:r.revision!}}));
  }
}
