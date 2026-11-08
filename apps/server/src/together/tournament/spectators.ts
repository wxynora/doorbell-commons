import type Database from "better-sqlite3";
import { snowDanmakuInputSchema, type SnowDanmaku, type SnowDanmakuInput } from "@doorbell/protocol";
import { loungeDisplayName } from "../../lounge-display-name.js";
import { SnowLiveStore } from "../live-store.js";
import type { SnowTournamentStore } from "./store.js";

type Ref = { editionId: string; matchId: string };

/** Reuses the spectator message table, never a team channel or battle save. */
export class SnowTournamentSpectators {
  private readonly messages: SnowLiveStore;
  private readonly listeners = new Map<string, Set<() => void>>();
  constructor(database: Database.Database, private readonly editions: SnowTournamentStore, private readonly now = Date.now) {
    this.messages = new SnowLiveStore(database);
  }
  private scope(ref: Ref) {
    const edition = this.editions.read(ref.editionId) as { matches: { id: string; status: string }[] } | null;
    const match = edition?.matches.find(entry => entry.id === ref.matchId);
    if (!match) throw Error("match_not_found");
    return { id: JSON.stringify(["snow-tournament", ref.editionId, ref.matchId]), match };
  }
  read(ref: Ref, after = 0): SnowDanmaku[] {
    return this.messages.messages(this.scope(ref).id, after);
  }
  send(ref: Ref, identity: { accountId: string; residentName: string }, raw: SnowDanmakuInput) {
    const input = snowDanmakuInputSchema.parse(raw), scope = this.scope(ref);
    if (scope.match.status === "cancelled") throw Error("activity_unavailable");
    const result = this.messages.append(scope.id, identity.accountId, loungeDisplayName(identity.residentName), input, this.now());
    if (!result.replay) for (const listener of this.listeners.get(scope.id) ?? []) listener();
    return result;
  }
  subscribe(ref: Ref, listener: () => void) {
    const { id } = this.scope(ref), listeners = this.listeners.get(id) ?? new Set<() => void>();
    this.listeners.set(id, listeners); listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }
}
