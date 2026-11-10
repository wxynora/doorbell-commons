import type Database from "better-sqlite3";
import { snowDanmakuInputSchema, type SnowDanmaku, type SnowDanmakuInput } from "@doorbell/protocol";
import { loungeDisplayName } from "../../lounge-display-name.js";
import { SnowLiveStore } from "../live-store.js";
import type { SnowTournamentStore } from "./store.js";

type Ref = { editionId: string; matchId: string };
export type SnowDanmakuUpdate = {sequence:number;text:string};
const scopeId = ({editionId,matchId}:Ref) => JSON.stringify(["snow-tournament",editionId,matchId]);

/** Reuses the spectator message table, never a team channel or battle save. */
export class SnowTournamentSpectators {
  private readonly messages: SnowLiveStore;
  private readonly listeners = new Map<string, Set<(update:SnowDanmakuUpdate) => void>>();
  constructor(database: Database.Database, private readonly editions: SnowTournamentStore, private readonly now = Date.now) {
    this.messages = new SnowLiveStore(database);
  }
  private scope(ref: Ref) {
    const match = this.editions.readMatchStatus(ref.editionId,ref.matchId);
    if (!match) throw Error("match_not_found");
    return {id:scopeId(ref),match};
  }
  read(ref: Ref, after = 0): SnowDanmaku[] {
    return this.messages.messages(this.scope(ref).id, after);
  }
  send(ref: Ref, identity: { accountId: string; residentName: string }, raw: SnowDanmakuInput) {
    const input = snowDanmakuInputSchema.parse(raw), scope = this.scope(ref);
    if (scope.match.status === "cancelled") throw Error("activity_unavailable");
    const result = this.messages.append(scope.id, identity.accountId, loungeDisplayName(identity.residentName), input, this.now());
    const listeners=this.listeners.get(scope.id);
    if (!result.replay && listeners?.size) {
      const update={sequence:result.message.sequence,text:JSON.stringify({messages:[result.message]})};
      for (const listener of listeners) listener(update);
    }
    return result;
  }
  // The stream has already checked the match and read the cursor at admission.
  subscribe(ref: Ref, listener: (update:SnowDanmakuUpdate) => void) {
    const id=scopeId(ref), listeners=this.listeners.get(id) ?? new Set<(update:SnowDanmakuUpdate)=>void>();
    this.listeners.set(id, listeners); listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }
}
