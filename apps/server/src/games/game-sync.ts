import type { GameCaller } from "./game-identity.js";
import { applyGamePatch, changedGamePatch } from './game-delta.js';
import type { GameChanges, GamePatch } from './types.js';
import { GameAccessError, GameStateError, type GameActor, type GameCommitPublisher, type GameEngineAdapter, type GameRoom, type GameRoomStore, type GameRoomView } from "./types.js";

export type GameRoomDelivery = (view: GameRoomView, delta?: {baseRevision:number; patch:GamePatch}) => void | Promise<void>;

export interface GameSubscription {
  close(): void;
  /** Resolves with null for a normal close, or with the close failure reason. */
  closed: Promise<unknown | null>;
}

function sameActor(left: GameActor, right: GameActor): boolean {
  return left.playerId === right.playerId && left.controllerType === right.controllerType;
}

function requireSeat(room: GameRoom, actor: GameActor): void {
  if (!room.seats.some((seat) => sameActor(seat, actor))) {
    throw new GameAccessError("not_seated");
  }
}

function publicSeat(seat: GameRoom["seats"][number]): GameRoom["seats"][number] {
  return {
    playerId: seat.playerId,
    controllerType: seat.controllerType,
    ...(seat.residentId ? { residentId: seat.residentId } : {}),
    ready: seat.ready,
  };
}

function publicActor(actor: GameActor | null | undefined): GameActor | null {
  return actor
    ? { playerId: actor.playerId, controllerType: actor.controllerType }
    : null;
}

class RoomSubscription {
  readonly closed: Promise<unknown | null>;
  private readonly resolveClosed: (reason: unknown | null) => void;
  private active = true;
  private lastRevision = -1;
  private game: unknown = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly roomId: string,
    private readonly caller: GameCaller,
    private readonly expectedActor: GameActor,
    private readonly engine: GameEngineAdapter,
    private readonly deliver: GameRoomDelivery,
    private readonly remove: (subscription: RoomSubscription) => void,
  ) {
    let resolveClosed!: (reason: unknown | null) => void;
    this.closed = new Promise<unknown | null>((resolve) => {
      resolveClosed = resolve;
    });
    this.resolveClosed = resolveClosed;
  }

  enqueue(room: GameRoom, changes?: GameChanges): void {
    if (!this.active) return;
    this.queue = this.queue
      .then(() => this.deliverRoom(room, changes))
      .catch((reason: unknown) => {
        this.close(reason);
      });
  }

  close(reason: unknown | null = null): void {
    if (!this.active) return;
    this.active = false;
    this.remove(this);
    this.resolveClosed(reason);
  }

  private async deliverRoom(room: GameRoom, changes?: GameChanges): Promise<void> {
    if (!this.active) return;
    if (room.roomId !== this.roomId) {
      throw new GameStateError("game subscription room changed");
    }
    if (room.revision < this.lastRevision) {
      throw new GameStateError("game subscription revision regressed");
    }

    const actor = await this.caller.authenticate();
    if (!this.active) return;
    if (!sameActor(this.expectedActor, actor)) {
      throw new GameAccessError("game subscription identity changed");
    }
    requireSeat(room, actor);

    const patch = changes && this.lastRevision === room.revision - 1 && this.game !== null
      && Object.hasOwn(changes.private, actor.playerId)
      ? changedGamePatch(this.game, [...changes.public, ...changes.private[actor.playerId]!]) : undefined;
    const baseRevision = this.lastRevision;
    const game = patch ? applyGamePatch(this.game, patch) : room.snapshot === null
      ? null
      : await this.engine.project(room.kind, room.snapshot, actor.playerId);
    if (!this.active) return;

    // Re-check immediately before the externally visible delivery.  This also
    // catches a membership/identity change while a slow projection was running.
    const finalActor = await this.caller.authenticate();
    if (!this.active) return;
    if (!sameActor(this.expectedActor, finalActor)) {
      throw new GameAccessError("game subscription identity changed");
    }
    requireSeat(room, finalActor);
    if (!this.active) return;

    const view: GameRoomView = {
      roomId: room.roomId,
      kind: room.kind,
      revision: room.revision,
      phase: room.phase,
      seats: room.seats.map(publicSeat),
      host: publicActor(room.host),
      baseStake: room.baseStake ?? null,
      game,
    };
    this.lastRevision = room.revision;
    this.game = structuredClone(game);
    await this.deliver(view, patch ? {baseRevision, patch} : undefined);
  }
}

/**
 * In-process committed-room synchronisation.  It is intentionally not a
 * network transport and does not provide cross-process fan-out.
 */
export class GameSync implements GameCommitPublisher {
  private readonly subscriptions = new Map<string, Set<RoomSubscription>>();

  constructor(
    private readonly store: GameRoomStore,
    private readonly engine: GameEngineAdapter,
  ) {}

  async subscribe(
    caller: GameCaller,
    roomId: string,
    deliver: GameRoomDelivery,
  ): Promise<GameSubscription> {
    if (typeof deliver !== "function") {
      throw new TypeError("game subscription delivery must be a function");
    }
    const actor = await caller.authenticate();
    const room = this.store.read(roomId);
    if (!room) throw new GameStateError("room_not_found");
    requireSeat(room, actor);

    // No await occurs between this read, registration, and initial enqueue.
    // A later commit therefore either appears in the initial read or is
    // queued after it; it cannot fall between the two.
    const subscription = new RoomSubscription(
      roomId,
      caller,
      { ...actor },
      this.engine,
      deliver,
      (closedSubscription) => this.remove(closedSubscription),
    );
    let roomSubscriptions = this.subscriptions.get(roomId);
    if (!roomSubscriptions) {
      roomSubscriptions = new Set<RoomSubscription>();
      this.subscriptions.set(roomId, roomSubscriptions);
    }
    roomSubscriptions.add(subscription);
    subscription.enqueue(room);
    return { close: () => subscription.close(), closed: subscription.closed };
  }

  publish(room: GameRoom, changes?: GameChanges): void {
    const roomSubscriptions = this.subscriptions.get(room.roomId);
    if (!roomSubscriptions) return;
    const committed = structuredClone(room);
    for (const subscription of [...roomSubscriptions]) {
      subscription.enqueue(committed, changes);
    }
  }

  private remove(subscription: RoomSubscription): void {
    const roomSubscriptions = this.subscriptions.get(subscription.roomId);
    if (!roomSubscriptions) return;
    roomSubscriptions.delete(subscription);
    if (roomSubscriptions.size === 0) this.subscriptions.delete(subscription.roomId);
  }
}
