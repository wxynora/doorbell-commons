import {
  type SnowDanmaku,
  type SnowDanmakuInput,
  type SnowLiveSnapshot,
  snowDanmakuInputSchema,
  snowLiveSnapshotSchema,
} from "@doorbell/protocol";
import type Database from "better-sqlite3";
import { loungeDisplayName } from "../lounge-display-name.js";
import { projectSnowLive } from "./live-projection.mjs";
import { SnowLiveStore } from "./live-store.js";

export type SnowLiveEvent =
  | { type: "snapshot"; value: SnowLiveSnapshot | null }
  | { type: "danmaku"; value: SnowDanmaku }
  | { type: "unavailable"; value: { error: { code: "service_unavailable" } } };
export class SnowLiveService {
  readonly store: SnowLiveStore;
  private readonly listeners = new Set<(event: SnowLiveEvent) => void>();
  constructor(
    database: Database.Database,
    private readonly now = Date.now,
  ) {
    this.store = new SnowLiveStore(database);
  }
  snapshot(): SnowLiveSnapshot | null {
    const state = this.store.activity();
    if (!state) return null;
    return snowLiveSnapshotSchema.parse(
      projectSnowLive({
        state,
        series: this.store.series(state.activityId),
        loadBattle: (id: string) => this.store.battle(id),
        nameOf: (id: string) => loungeDisplayName(this.store.nameOf(id)),
        now: this.now(),
      }),
    );
  }
  read(after = 0) {
    const snapshot = this.snapshot();
    return { snapshot, messages: snapshot ? this.store.messages(snapshot.activityId, after) : [] };
  }
  notify(): void {
    if (!this.listeners.size) return;
    let event: SnowLiveEvent;
    try {
      event = { type: "snapshot", value: this.snapshot() };
    } catch {
      event = { type: "unavailable", value: { error: { code: "service_unavailable" } } };
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
  subscribe(listener: (event: SnowLiveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  send(identity: { accountId: string; residentName: string }, raw: SnowDanmakuInput) {
    const input = snowDanmakuInputSchema.parse(raw),
      state = this.store.activity();
    if (!state || state.retired) throw Error("activity_unavailable");
    const result = this.store.append(
      state.activityId,
      identity.accountId,
      loungeDisplayName(identity.residentName),
      input,
      this.now(),
    );
    if (!result.replay)
      for (const listener of this.listeners) listener({ type: "danmaku", value: result.message });
    return result;
  }
}
