import type Database from "better-sqlite3";

export type LoungeChatMode = "natural" | "proactive" | "listening" | "passive";
export interface LoungeChatSession {
  residentId: string;
  enteredAt: number;
  expiresAt: number;
  mode: LoungeChatMode;
  lastWakeAt: number | null;
  lastDeliveredSequence: number;
}

/** Same community connection; starting a chat session never creates a second account. */
export class LoungeChatSessionStore {
  constructor(private readonly db: Database.Database) {}
  enter(residentId: string, mode: LoungeChatMode, now: number, sequence: number, minutes = 15): LoungeChatSession {
    if (![5,15,30,60].includes(minutes)) throw new Error("Unsupported chat duration");
    const session: LoungeChatSession = {residentId, mode, enteredAt: now, expiresAt: now + minutes * 60_000, lastWakeAt: null, lastDeliveredSequence: sequence};
    this.db.prepare(`INSERT INTO lounge_chat_sessions(resident_id,session_json) VALUES (?,?)
      ON CONFLICT(resident_id) DO UPDATE SET session_json=excluded.session_json`).run(residentId, JSON.stringify(session));
    return session;
  }
  list(): LoungeChatSession[] {
    return (this.db.prepare("SELECT session_json FROM lounge_chat_sessions").all() as {session_json:string}[]).map(row => JSON.parse(row.session_json) as LoungeChatSession);
  }
  read(residentId: string): LoungeChatSession | null {
    const row = this.db.prepare("SELECT session_json FROM lounge_chat_sessions WHERE resident_id=?").get(residentId) as {session_json:string}|undefined;
    return row ? JSON.parse(row.session_json) as LoungeChatSession : null;
  }
  active(residentId: string, now: number): LoungeChatSession | null {
    const session = this.read(residentId);
    return session && now >= session.enteredAt && now < session.expiresAt ? session : null;
  }
  leave(residentId: string): void { this.db.prepare("DELETE FROM lounge_chat_sessions WHERE resident_id=?").run(residentId); }
  /** Called only after durable Bell creation succeeds, against the same session. */
  recordWake(residentId: string, enteredAt: number, now: number, sequence: number, createWake?: () => void): boolean {
    return this.db.transaction(()=>{
      const session = this.active(residentId, now);
      if (!session || session.enteredAt !== enteredAt || sequence <= session.lastDeliveredSequence) return false;
      createWake?.();
      session.lastWakeAt = now; session.lastDeliveredSequence = sequence;
      this.db.prepare("UPDATE lounge_chat_sessions SET session_json=? WHERE resident_id=?").run(JSON.stringify(session),residentId);
      return true;
    }).immediate();
  }
}
