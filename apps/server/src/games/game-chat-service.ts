import type { GameCaller } from "./game-identity.js";
import {
  GameAccessError,
  GameStateError,
  type GameActor,
  type GameRoomStore,
} from "./types.js";
import type { GameChatMessage, GameChatStore } from "./game-chat-store.js";

export interface GameChatSendInput {
  clientMessageId: string;
  text: string;
  replyToMessageId?: string;
}

export type GameChatDeliver = (message: GameChatMessage) => void | Promise<void>;

export interface GameChatSubscription {
  readonly closed: Promise<unknown | null>;
  close(): void;
}

export interface GameChatServiceOptions {
  now?: () => number;
}

function validateAfterSequence(afterSequence: number): void {
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    throw new GameStateError("The game chat sequence must be a non-negative safe integer");
  }
}

function validateSendInput(input: GameChatSendInput): void {
  if (typeof input?.clientMessageId !== "string" || input.clientMessageId.trim().length === 0) {
    throw new GameStateError("The game chat client message id must not be empty");
  }
  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    throw new GameStateError("The game chat text must not be empty");
  }
}

class GameChatSubscriptionImpl implements GameChatSubscription {
  readonly closed: Promise<unknown | null>;
  readonly #pending = new Map<number, GameChatMessage>();
  readonly #resolveClosed!: (reason: unknown | null) => void;
  #cursor: number;
  #active = true;
  #chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly caller: GameCaller,
    private readonly roomId: string,
    afterSequence: number,
    private readonly actor: GameActor,
    private readonly deliver: GameChatDeliver,
    private readonly verifySeat: (caller: GameCaller, roomId: string) => Promise<GameActor>,
    private readonly onClose: (subscription: GameChatSubscriptionImpl) => void,
  ) {
    this.#cursor = afterSequence;
    let resolveClosed: (reason: unknown | null) => void = () => undefined;
    this.closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;
  }

  close(): void {
    this.finish(null);
  }

  fail(reason: unknown): void {
    this.finish(reason);
  }

  enqueue(messages: readonly GameChatMessage[]): Promise<void> {
    if (!this.#active) return Promise.resolve();
    for (const message of messages) {
      if (message.sequence > this.#cursor && !this.#pending.has(message.sequence)) {
        this.#pending.set(message.sequence, { ...message });
      }
    }
    const task = this.#chain.then(() => this.flush());
    this.#chain = task.catch((error) => {
      this.finish(error);
    });
    return task;
  }

  private async flush(): Promise<void> {
    while (this.#active) {
      const next = this.#pending.get(this.#cursor + 1);
      if (!next) return;
      this.#pending.delete(next.sequence);
      const actor = await this.verifySeat(this.caller, this.roomId);
      if (
        actor.playerId !== this.actor.playerId ||
        actor.controllerType !== this.actor.controllerType
      ) {
        throw new GameAccessError("game_chat_actor_changed");
      }
      if (!this.#active) return;
      const sequence = next.sequence;
      await this.deliver({ ...next });
      if (!this.#active) return;
      this.#cursor = sequence;
    }
  }

  private finish(reason: unknown | null): void {
    if (!this.#active) return;
    this.#active = false;
    this.#pending.clear();
    this.onClose(this);
    this.#resolveClosed(reason);
  }
}

export class GameChatService {
  readonly #subscriptions = new Map<string, Set<GameChatSubscriptionImpl>>();
  readonly #now: () => number;

  constructor(
    private readonly roomStore: GameRoomStore,
    private readonly chatStore: GameChatStore,
    options: GameChatServiceOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
  }

  async send(
    caller: GameCaller,
    roomId: string,
    input: GameChatSendInput,
  ): Promise<GameChatMessage> {
    const actor = await this.authenticateSeat(caller, roomId);
    validateSendInput(input);
    if (input.replyToMessageId !== undefined && !this.chatStore.read(roomId, 0).some(message => String(message.sequence) === input.replyToMessageId)) {
      throw new GameStateError("game_chat_reply_not_found");
    }
    const result = this.chatStore.append({
      roomId,
      playerId: actor.playerId,
      controllerType: actor.controllerType,
      clientMessageId: input.clientMessageId,
      text: input.text,
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
      createdAt: this.#now(),
    });
    if (!result.duplicate) {
      this.publish(result.message);
    }
    return result.message;
  }

  async read(
    caller: GameCaller,
    roomId: string,
    afterSequence = 0,
  ): Promise<GameChatMessage[]> {
    await this.authenticateSeat(caller, roomId);
    validateAfterSequence(afterSequence);
    return this.chatStore.read(roomId, afterSequence);
  }

  async subscribe(
    caller: GameCaller,
    roomId: string,
    afterSequence: number,
    deliver: GameChatDeliver,
  ): Promise<GameChatSubscription> {
    const actor = await this.authenticateSeat(caller, roomId);
    validateAfterSequence(afterSequence);
    if (typeof deliver !== "function") {
      throw new GameStateError("The game chat delivery callback is required");
    }

    const subscription = new GameChatSubscriptionImpl(
      caller,
      roomId,
      afterSequence,
      { ...actor },
      deliver,
      (currentCaller, currentRoomId) => this.authenticateSeat(currentCaller, currentRoomId),
      (closed) => this.removeSubscription(roomId, closed),
    );
    let subscriptions = this.#subscriptions.get(roomId);
    if (!subscriptions) {
      subscriptions = new Set();
      this.#subscriptions.set(roomId, subscriptions);
    }
    subscriptions.add(subscription);

    try {
      void subscription
        .enqueue(this.chatStore.read(roomId, afterSequence))
        .catch(() => undefined);
      return subscription;
    } catch (error) {
      subscription.fail(error);
      throw error;
    }
  }

  private async authenticateSeat(caller: GameCaller, roomId: string): Promise<GameActor> {
    const actor = await caller.authenticate();
    const room = this.roomStore.read(roomId);
    if (!room) throw new GameStateError("room_not_found");
    if (
      !room.seats.some(
        (seat) =>
          seat.playerId === actor.playerId && seat.controllerType === actor.controllerType,
      )
    ) {
      throw new GameAccessError("not_seated");
    }
    return actor;
  }

  private publish(message: GameChatMessage): void {
    for (const subscription of this.#subscriptions.get(message.roomId) ?? []) {
      void subscription.enqueue([message]).catch(() => undefined);
    }
  }

  private removeSubscription(roomId: string, subscription: GameChatSubscriptionImpl): void {
    const subscriptions = this.#subscriptions.get(roomId);
    if (!subscriptions) return;
    subscriptions.delete(subscription);
    if (subscriptions.size === 0) this.#subscriptions.delete(roomId);
  }
}
