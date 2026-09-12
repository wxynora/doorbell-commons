import type Database from "better-sqlite3";
export type ReactionKind = "flower" | "bomb";
export interface ReactionRecord {
  id: string; requestId: string; roomId: string; senderId: string; targetId: string;
  senderResidentId: string; targetResidentId: string; senderName: string;
  actor: "human" | "agent"; targetController: "human" | "resident"; kind: ReactionKind; paid: boolean; delivered: boolean;
}
type Row = { payload_json: string; paid: number; delivered: number };
export class GameReactionStore {
  constructor(private readonly db: Database.Database) {}
  find(senderId: string, requestId: string): ReactionRecord | null {
    const row = this.db.prepare("SELECT payload_json,paid,delivered FROM game_reactions WHERE sender_id=? AND request_id=?").get(senderId,requestId) as Row | undefined;
    return row ? this.decode(row) : null;
  }
  put(record: ReactionRecord): ReactionRecord {
    this.db.prepare("INSERT OR IGNORE INTO game_reactions(event_id,sender_id,request_id,payload_json) VALUES(?,?,?,?)").run(record.id,record.senderId,record.requestId,JSON.stringify(record));
    return this.find(record.senderId,record.requestId)!;
  }
  markPaid(id: string) { this.db.prepare("UPDATE game_reactions SET paid=1 WHERE event_id=?").run(id); }
  markCharging(id: string, value: boolean) { this.db.prepare("UPDATE game_reactions SET charging=? WHERE event_id=?").run(value?1:0,id); }
  markDelivered(id: string) { this.db.prepare("UPDATE game_reactions SET delivered=1 WHERE event_id=? AND paid=1").run(id); }
  outstanding(): ReactionRecord[] {
    return (this.db.prepare("SELECT payload_json,paid,delivered FROM game_reactions WHERE (paid=1 OR charging=1) AND delivered=0").all() as Row[]).map(row=>this.decode(row));
  }
  inRoom(roomId:string):ReactionRecord[] {
    return (this.db.prepare("SELECT payload_json,paid,delivered FROM game_reactions WHERE paid=1 AND json_extract(payload_json,'$.roomId')=? ORDER BY rowid").all(roomId) as Row[]).map(row=>this.decode(row));
  }
  private decode(row: Row): ReactionRecord { return {...JSON.parse(row.payload_json),paid:row.paid===1,delivered:row.delivered===1} as ReactionRecord; }
}
