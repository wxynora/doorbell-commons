import type { BellService } from "../bell-service.js";
import type { LoungeGameTableStore } from "../lounge-game-table-store.js";
import type { LoungeWakeStore } from "../lounge-wake-store.js";
import { gameWakeEligibility, type GameWakeEligibility, type WakeGameKind } from "./game-wake-eligibility.js";
import type { GameIdentity } from "./game-identity.js";
import type { GameService } from "./game-service.js";
import type { GameSubscription, GameSync } from "./game-sync.js";
import type { LoungeGameTool } from "./lounge-game-tool.js";
import type { GameKind, GameRoom, GameRoomView } from "./types.js";

const GAME_TURN_WAKE_PREFIX = "game_turn";

export interface GameTurnWakePublicTable {
  table_id: "square" | "round";
  room: null | {
    room_id: string;
    kind: GameKind;
    phase: GameRoomView["phase"];
    revision: number;
  };
}

export interface GameTurnWakeTables {
  listPublicTables(): readonly GameTurnWakePublicTable[];
  read(roomId: string): GameRoom | null;
  subscribe(listener: () => void): () => void;
}

export type GameTurnWakeGameService = Pick<GameService, "view">;
export type GameTurnWakeSync = Pick<GameSync, "subscribe">;
export type GameTurnWakeIdentity = Pick<GameIdentity, "resident">;
export type GameTurnWakeTool = Pick<LoungeGameTool, "wakeMessage"> & Partial<Pick<LoungeGameTool,"markRulesShown">>;
export type GameTurnWakeWakes = Pick<LoungeWakeStore, "enqueue" | "get" | "pending" | "finish">;
export type GameTurnWakeBell = Pick<BellService, "notifyResident" | "notifyWakeCancelled">;

export interface GameTurnWakeFormatInput {
  residentId: string;
  roomId: string;
  kind: WakeGameKind;
  revision: number;
  message: string;
}

export type GameTurnWakeFormatter = (input: GameTurnWakeFormatInput) => string;
export type GameTurnWakeEligibility = (
  kind: WakeGameKind,
  projection: unknown,
  viewerId: string,
) => GameWakeEligibility;

export interface GameTurnWakeServiceOptions {
  games: GameTurnWakeGameService;
  sync: GameTurnWakeSync;
  tables: GameTurnWakeTables | Pick<LoungeGameTableStore, "listPublicTables" | "read" | "subscribe">;
  identity: GameTurnWakeIdentity;
  gameTool: GameTurnWakeTool;
  wakes: GameTurnWakeWakes;
  bell: GameTurnWakeBell;
  formatter: GameTurnWakeFormatter;
  eligibility?: GameTurnWakeEligibility;
  now?: () => number;
  onError: (error: unknown) => void;
}

interface DesiredSubscription {
  key: string;
  residentId: string;
  roomId: string;
}

interface ActiveSubscription extends DesiredSubscription {
  caller: ReturnType<GameTurnWakeIdentity["resident"]>;
  subscription: GameSubscription;
}

interface ParsedTurnWakeKey {
  roomId: string;
  revision: number;
  residentId: string;
}

/**
 * Stable durable identity for one resident's decision state in one room
 * revision. It is used as both the wake id and LoungeWakeStore source key.
 */
export function gameTurnWakeSourceKey(
  roomId: string,
  revision: number,
  residentId: string,
): string {
  if (
    typeof roomId !== "string" || roomId.trim().length === 0 ||
    typeof residentId !== "string" || residentId.trim().length === 0 ||
    !Number.isSafeInteger(revision) || revision < 0
  ) {
    throw new TypeError("invalid game turn wake identity");
  }
  return `${GAME_TURN_WAKE_PREFIX}:${encodeURIComponent(roomId)}:${revision}:${encodeURIComponent(residentId)}`;
}

function parseGameTurnWakeSourceKey(value: string): ParsedTurnWakeKey | null {
  const parts = value.split(":");
  if (![4,5].includes(parts.length) || parts[0] !== GAME_TURN_WAKE_PREFIX) return null;
  const revision = Number(parts[2]);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  try {
    const roomId = decodeURIComponent(parts[1] ?? "");
    const residentId = decodeURIComponent(parts[3] ?? "");
    if (roomId.length === 0 || residentId.length === 0) return null;
    return { roomId, revision, residentId };
  } catch {
    return null;
  }
}

function residentIdForSeat(seat: GameRoom["seats"][number]): string | null {
  if (seat.controllerType !== "resident") return null;
  if (typeof seat.residentId === "string" && seat.residentId.trim().length > 0) {
    return seat.residentId;
  }
  const prefix = "resident:";
  if (!seat.playerId.startsWith(prefix)) return null;
  const residentId = seat.playerId.slice(prefix.length);
  return residentId.trim().length > 0 ? residentId : null;
}

function subscriptionKey(roomId: string, residentId: string): string {
  return `${encodeURIComponent(roomId)}:${encodeURIComponent(residentId)}`;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;
  if (error instanceof Error && /^[a-z][a-z0-9_]*$/u.test(error.message)) return error.message;
  return null;
}

function isStaleWakeReadError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "not_seated" || code === "game_room_not_found" || code === "room_not_found";
}

export class GameTurnWakeService {
  readonly #options: GameTurnWakeServiceOptions;
  readonly #eligibility: GameTurnWakeEligibility;
  readonly #now: () => number;
  readonly #unsubscribe: () => void;
  readonly #subscriptions = new Map<string, ActiveSubscription>();
  readonly #opening = new Set<string>();
  readonly #wakeEnqueueing = new Set<string>();
  readonly #desired = new Map<string, DesiredSubscription>();
  #reconcilePromise: Promise<void> | null = null;
  #reconcileAgain = false;
  #started = false;
  #closed = false;

  constructor(options: GameTurnWakeServiceOptions) {
    this.#options = options;
    this.#eligibility = options.eligibility ?? gameWakeEligibility;
    this.#now = options.now ?? Date.now;
    this.#unsubscribe = options.tables.subscribe(() => this.#scheduleReconcile());
  }

  start(): void {
    if (this.#closed) return;
    this.#started = true;
    void this.reconcile().catch((error) => this.#reportError(error));
  }
  /** One reminder per successful social event, not a timer or model-end guess. */
  async remind(residentId:string,roomId:string,eventId:string):Promise<void>{
    if(this.#closed)return;
    const caller=this.#options.identity.resident({residentId});
    const view=await this.#options.games.view(caller,roomId);
    const actor=await caller.authenticate();
    if(!this.#eligibility(view.kind,view.game,actor.playerId).needsDecision)return;
    const message=await this.#options.gameTool.wakeMessage(residentId,roomId);
    const fresh=await this.#options.games.view(caller,roomId);
    if(fresh.revision!==view.revision||!this.#eligibility(fresh.kind,fresh.game,actor.playerId).needsDecision)return;
    const wakeId=gameTurnWakeSourceKey(roomId,view.revision,residentId)+':'+encodeURIComponent(eventId);
    if(this.#options.wakes.get(residentId,wakeId))return;
    this.#options.wakes.enqueue({wakeId,residentId,reason:'game_turn',sourceKey:wakeId,text:this.#options.formatter({residentId,roomId,kind:view.kind,revision:view.revision,message:'轮到你，尚未行动。\n'+message}),now:this.#now()});
    await this.#options.gameTool.markRulesShown?.(residentId,roomId);
    this.#options.bell.notifyResident(residentId);
  }

  async reconcile(): Promise<void> {
    if (this.#closed) return;
    this.#started = true;
    if (this.#reconcilePromise) {
      this.#reconcileAgain = true;
      return this.#reconcilePromise;
    }

    const run = (async () => {
      do {
        this.#reconcileAgain = false;
        await this.#reconcileOnce();
      } while (this.#reconcileAgain && !this.#closed);
    })();
    let tracked!: Promise<void>;
    tracked = run.finally(() => {
      if (this.#reconcilePromise === tracked) this.#reconcilePromise = null;
    });
    this.#reconcilePromise = tracked;
    return tracked;
  }

  /** Re-check one persisted room wake after restart or a delivery retry. */
  async replay(residentId: string, roomId: string): Promise<void> {
    if (this.#closed) return;
    if (typeof residentId !== "string" || residentId.trim().length === 0) {
      throw new TypeError("resident id is required");
    }
    if (typeof roomId !== "string" || roomId.trim().length === 0) {
      throw new TypeError("room id is required");
    }

    const caller = this.#options.identity.resident({ residentId });
    try {
      const view = await this.#options.games.view(caller, roomId);
      await this.#handleView(residentId, caller, view);
    } catch (error) {
      if (isStaleWakeReadError(error)) {
        this.#cancelRoomWakes(residentId, roomId);
        return;
      }
      throw error;
    }
  }

  /**
   * Cancel persisted turn wakes whose room revision or resident seat is no
   * longer authoritative. This is synchronous so Bell delivery can call it
   * immediately before exposing a pending wake.
   */
  cancelInvalid(residentId: string): void {
    if (typeof residentId !== "string" || residentId.trim().length === 0) {
      throw new TypeError("resident id is required");
    }
    for (const wake of this.#options.wakes.pending(residentId)) {
      if (wake.reason !== "game_turn") continue;
      const parsed = parseGameTurnWakeSourceKey(wake.wakeId);
      const room = parsed ? this.#options.tables.read(parsed.roomId) : null;
      const seated = room?.seats.some((seat) => residentIdForSeat(seat) === residentId) ?? false;
      const valid =
        parsed?.residentId === residentId &&
        room !== null &&
        room.phase !== "finished" &&
        seated &&
        room.revision === parsed.revision;
      if (valid) continue;
      if (this.#options.wakes.finish(residentId, wake.wakeId, "cancelled", this.#now()) === "changed") {
        try {
          this.#options.bell.notifyWakeCancelled(residentId, wake.wakeId);
        } catch (error) {
          this.#reportError(error);
        }
      }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribe();
    this.#desired.clear();
    for (const [key, active] of this.#subscriptions) {
      this.#subscriptions.delete(key);
      active.subscription.close();
    }
    this.#opening.clear();
  }

  #scheduleReconcile(): void {
    if (this.#closed || !this.#started) return;
    void this.reconcile().catch((error) => this.#reportError(error));
  }

  async #reconcileOnce(): Promise<void> {
    const desired = this.#collectDesiredSubscriptions();
    this.#desired.clear();
    for (const target of desired.values()) this.#desired.set(target.key, target);

    for (const [key, active] of [...this.#subscriptions]) {
      if (desired.has(key)) continue;
      this.#subscriptions.delete(key);
      active.subscription.close();
      this.#cancelRoomWakes(active.residentId, active.roomId);
    }

    const opening = [...desired.values()]
      .filter((target) => !this.#subscriptions.has(target.key) && !this.#opening.has(target.key))
      .map((target) => this.#openSubscription(target));
    await Promise.all(opening);
  }

  #collectDesiredSubscriptions(): Map<string, DesiredSubscription> {
    const desired = new Map<string, DesiredSubscription>();
    const tables = this.#options.tables.listPublicTables();
    if (!Array.isArray(tables)) throw new Error("game table state is unavailable");

    for (const table of tables) {
      const roomId = table?.room?.room_id;
      if (typeof roomId !== "string" || roomId.length === 0) continue;
      const room = this.#options.tables.read(roomId);
      if (!room || room.roomId !== roomId || room.phase === "finished") continue;
      for (const seat of room.seats) {
        const residentId = residentIdForSeat(seat);
        if (!residentId) continue;
        const key = subscriptionKey(roomId, residentId);
        desired.set(key, { key, residentId, roomId });
      }
    }
    return desired;
  }

  async #openSubscription(target: DesiredSubscription): Promise<void> {
    if (this.#closed || this.#opening.has(target.key)) return;
    this.#opening.add(target.key);
    try {
      const caller = this.#options.identity.resident({ residentId: target.residentId });
      const subscription = await this.#options.sync.subscribe(
        caller,
        target.roomId,
        async (view) => {
          try {
            await this.#handleView(target.residentId, caller, view);
          } catch (error) {
            this.#reportError(error);
          }
        },
      );
      if (this.#closed || !this.#desired.has(target.key)) {
        subscription.close();
        return;
      }
      const active: ActiveSubscription = { ...target, caller, subscription };
      this.#subscriptions.set(target.key, active);
      void subscription.closed.then(() => {
        if (this.#subscriptions.get(target.key)?.subscription === subscription) {
          this.#subscriptions.delete(target.key);
        }
      });
    } catch (error) {
      if (!this.#closed) this.#reportError(error);
    } finally {
      this.#opening.delete(target.key);
    }
  }

  async #handleView(
    residentId: string,
    caller: ReturnType<GameTurnWakeIdentity["resident"]>,
    view: GameRoomView,
  ): Promise<void> {
    if (this.#closed) return;
    if (view.roomId.length === 0) throw new Error("game room view has no room id");
    const revision = this.#requireRevision(view.revision);
    const actor = await caller.authenticate();
    const decision = this.#eligibility(view.kind, view.game, actor.playerId);
    if (!decision.needsDecision) {
      this.#cancelRoomWakes(residentId, view.roomId, revision, true);
      return;
    }

    // A new decision revision supersedes older persisted turn wakes. A wake
    // at this revision remains eligible for durable deduplication.
    this.#cancelRoomWakes(residentId, view.roomId, revision, false);
    if (this.#options.wakes.get(residentId, gameTurnWakeSourceKey(view.roomId, revision, residentId))) return;
    let message: string;
    try {
      message = await this.#options.gameTool.wakeMessage(residentId, view.roomId);
    } catch (error) {
      if (isStaleWakeReadError(error)) {
        this.#cancelRoomWakes(residentId, view.roomId, revision, true);
        return;
      }
      throw error;
    }
    if (this.#closed) return;

    const fresh = await this.#options.games.view(caller, view.roomId);
    if (this.#closed) return;
    const freshRevision = this.#requireRevision(fresh.revision);
    if (fresh.roomId !== view.roomId || fresh.kind !== view.kind || freshRevision !== revision) {
      this.#cancelRoomWakes(
        residentId,
        fresh.roomId === view.roomId ? fresh.roomId : view.roomId,
        fresh.roomId === view.roomId ? freshRevision : revision,
        true,
      );
      return;
    }
    const finalDecision = this.#eligibility(fresh.kind, fresh.game, actor.playerId);
    if (!finalDecision.needsDecision) {
      this.#cancelRoomWakes(residentId, fresh.roomId, freshRevision, true);
      return;
    }

    const text = this.#options.formatter({
      residentId,
      roomId: fresh.roomId,
      kind: fresh.kind,
      revision: freshRevision,
      message,
    });
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("game turn wake formatter returned empty text");
    }
    await this.#enqueueWake(residentId, fresh.roomId, freshRevision, text);
  }

  async #enqueueWake(
    residentId: string,
    roomId: string,
    revision: number,
    text: string,
  ): Promise<void> {
    const wakeId = gameTurnWakeSourceKey(roomId, revision, residentId);
    if (this.#options.wakes.get(residentId, wakeId)) return;
    if (this.#wakeEnqueueing.has(wakeId)) return;
    this.#wakeEnqueueing.add(wakeId);
    try {
      if (this.#options.wakes.get(residentId, wakeId)) return;
      const record = this.#options.wakes.enqueue({
        wakeId,
        residentId,
        reason: "game_turn",
        sourceKey: wakeId,
        text,
        now: this.#now(),
      });
      await this.#options.gameTool.markRulesShown?.(residentId,roomId);
      if (record.wakeId === wakeId) {
        try {
          this.#options.bell.notifyResident(residentId);
        } catch (error) {
          this.#reportError(error);
        }
      }
    } finally {
      this.#wakeEnqueueing.delete(wakeId);
    }
  }

  #cancelRoomWakes(
    residentId: string,
    roomId: string,
    throughRevision?: number,
    includeEqual = true,
  ): void {
    for (const wake of this.#options.wakes.pending(residentId)) {
      if (wake.reason !== "game_turn") continue;
      const parsed = parseGameTurnWakeSourceKey(wake.wakeId);
      if (!parsed || parsed.roomId !== roomId) continue;
      if (
        throughRevision !== undefined &&
        (parsed.revision > throughRevision || (!includeEqual && parsed.revision === throughRevision))
      ) {
        continue;
      }
      if (this.#options.wakes.finish(residentId, wake.wakeId, "cancelled", this.#now()) === "changed") {
        try {
          this.#options.bell.notifyWakeCancelled(residentId, wake.wakeId);
        } catch (error) {
          this.#reportError(error);
        }
      }
    }
  }

  #requireRevision(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("game room revision is invalid");
    }
    return value;
  }

  #reportError(error: unknown): void {
    try {
      this.#options.onError(error);
    } catch {
      // Error reporting cannot break the game subscription or wake lifecycle.
    }
  }
}

export function createGameTurnWakeService(options: GameTurnWakeServiceOptions): GameTurnWakeService {
  return new GameTurnWakeService(options);
}
