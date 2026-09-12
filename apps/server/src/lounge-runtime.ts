import type { LoungeSnapshot } from "@doorbell/protocol";
import type { BellService } from "./bell-service.js";
import type { CommunityDatabase, HumanSettingsChatMode } from "./community-database.js";
import { GameChatService } from "./games/game-chat-service.js";
import type { GameEconomyPort } from "./games/game-economy.js";
import { GameIdentity } from "./games/game-identity.js";
import { GameReactionHub } from "./games/game-reaction-hub.js";
import { GameReactionService, type ReactionCharge } from "./games/game-reaction-service.js";
import { GameService } from "./games/game-service.js";
import { GameSync } from "./games/game-sync.js";
import { type GameTurnWakeFormatter, GameTurnWakeService } from "./games/game-turn-wake-service.js";
import {
  type LoungeGameInvitationFormatter,
  LoungeGameInvitationService,
} from "./games/lounge-game-invitation-service.js";
import { LoungeGameTool } from "./games/lounge-game-tool.js";
import {GameTimeoutScheduler} from './games/game-timeout.js';
import {gameHistory} from './games/game-context.js';
import type { GameEngineAdapter } from "./games/types.js";
import type {
  LoungeChatMode,
  LoungeChatSession,
  LoungeChatSessionStore,
} from "./lounge-chat-session-store.js";
import { LoungeChatTool } from "./lounge-chat-tool.js";
import {
  type LoungeChatDurationMinutes,
  normalizeLoungeChatDurationMinutes,
} from "./lounge-chat-wake-policy.js";
import { LoungeChatWakeService } from "./lounge-chat-wake-service.js";
import { LoungeGamePresenceAdapter } from "./lounge-game-presence.js";
import { LoungeService } from "./lounge-service.js";
import { LoungeTools } from "./lounge-tools.js";
import type { RegistrationAuthService } from "./registration-auth.js";

export type LoungeChatCanChat = (residentId: string) => boolean | Promise<boolean>;

export interface LoungeChatSettingsPort {
  findActiveHumanCommunityByResidentId(
    residentId: string,
  ): { home: { homeId: string } } | undefined;
  getHumanSettings(homeId: string): { chatMode: HumanSettingsChatMode | null };
}

export type LoungeChatSessionStorePort = Pick<
  LoungeChatSessionStore,
  "read" | "active" | "enter" | "leave"
>;

export type LoungeRuntimeBell = Pick<
  BellService,
  "notifyResident" | "notifyWakeCancelled" | "setBeforePendingWakes"
>;

export type LoungeChatRuntimeLoungeService = Pick<LoungeService, "readSnapshotForResident"> & {
  enter(input: Parameters<LoungeService["enter"]>[0]): unknown;
  chooseArea(input: Parameters<LoungeService["chooseArea"]>[0]): unknown;
};

/** Runtime state shared by the chat adapter and the actual lounge scene. */
export interface LoungeChatRuntimePort {
  canChat(residentId: string): Promise<boolean>;
  getLeaseRevision(residentId: string): number;
  expire(residentId: string, at?: number): Promise<boolean>;
  enter(
    residentId: string,
    durationMinutes?: LoungeChatDurationMinutes,
  ): Promise<LoungeChatSession | null>;
  leave(residentId: string): Promise<boolean>;
  activeForSay(residentId: string): Promise<LoungeChatSession | null>;
}

export type LoungeChatSessionChanged = (residentId: string) => void;

function currentPresence(
  snapshot: LoungeSnapshot,
  residentId: string,
): LoungeSnapshot["presence"][number] | undefined {
  return snapshot.presence.find((entry) => entry.resident_id === residentId);
}

function latestSequence(snapshot: LoungeSnapshot): number {
  return snapshot.messages.reduce((latest, message) => Math.max(latest, message.sequence), 0);
}

/**
 * Owns the durable chat lease around the existing lounge scene. It does not
 * schedule Bell work; callers may invoke expire when their own scheduler runs.
 */
export class LoungeChatRuntime implements LoungeChatRuntimePort {
  readonly #loungeService: LoungeChatRuntimeLoungeService;
  readonly #sessionStore: LoungeChatSessionStorePort;
  readonly #settings: LoungeChatSettingsPort;
  readonly #canChat: LoungeChatCanChat;
  readonly #now: () => number;
  readonly #onSessionChanged: LoungeChatSessionChanged | undefined;
  readonly #leaseRevisions = new Map<string, number>();

  constructor(options: {
    loungeService: LoungeChatRuntimeLoungeService;
    sessionStore: LoungeChatSessionStorePort;
    settings: LoungeChatSettingsPort;
    canChat: LoungeChatCanChat;
    now?: () => number;
    onSessionChanged?: LoungeChatSessionChanged;
  }) {
    this.#loungeService = options.loungeService;
    this.#sessionStore = options.sessionStore;
    this.#settings = options.settings;
    this.#canChat = options.canChat;
    this.#now = options.now ?? Date.now;
    this.#onSessionChanged = options.onSessionChanged;
  }

  async canChat(residentId: string): Promise<boolean> {
    return (await this.#canChat(residentId)) === true;
  }

  getLeaseRevision(residentId: string): number {
    return this.#leaseRevisions.get(residentId) ?? 0;
  }

  async expire(residentId: string, at = this.#now()): Promise<boolean> {
    const session = this.#sessionStore.read(residentId);
    if (!session || at < session.enteredAt || at < session.expiresAt) return false;

    this.#sessionStore.leave(residentId);
    this.#bumpLeaseRevision(residentId);
    this.#notifySessionChanged(residentId);
    // A game-owned presence is authoritative and must stay where the game
    // placed it. The trusted guard also covers this expiry path.
    if (await this.canChat(residentId)) this.#moveConversationToIdle(residentId);
    return true;
  }

  async enter(
    residentId: string,
    durationMinutes?: LoungeChatDurationMinutes,
  ): Promise<LoungeChatSession | null> {
    const selectedDuration = normalizeLoungeChatDurationMinutes(durationMinutes);
    const at = this.#now();
    await this.expire(residentId, at);
    if (!(await this.canChat(residentId))) return null;

    const existing = this.#sessionStore.active(residentId, at);
    if (existing) return existing;

    const snapshot = this.#loungeService.readSnapshotForResident(residentId);
    const presence = currentPresence(snapshot, residentId);
    if (!presence) this.#loungeService.enter({ residentId });
    if (presence?.area_id !== "conversation") {
      this.#loungeService.chooseArea({ residentId, areaId: "conversation" });
    }

    const session = this.#sessionStore.enter(
      residentId,
      this.#readChatMode(residentId),
      at,
      latestSequence(snapshot),
      selectedDuration,
    );
    this.#bumpLeaseRevision(residentId);
    this.#notifySessionChanged(residentId);
    return session;
  }

  async leave(residentId: string): Promise<boolean> {
    await this.expire(residentId);
    const hadLease = this.#sessionStore.read(residentId) !== null;
    if (hadLease && !(await this.canChat(residentId))) return false;

    this.#sessionStore.leave(residentId);
    if (hadLease) {
      this.#bumpLeaseRevision(residentId);
      this.#notifySessionChanged(residentId);
    }
    if (await this.canChat(residentId)) this.#moveConversationToIdle(residentId);
    return hadLease;
  }

  async activeForSay(residentId: string): Promise<LoungeChatSession | null> {
    const at = this.#now();
    await this.expire(residentId, at);
    const session = this.#sessionStore.active(residentId, at);
    if (!session) return null;
    const presence = currentPresence(
      this.#loungeService.readSnapshotForResident(residentId),
      residentId,
    );
    return presence?.area_id === "conversation" ? session : null;
  }

  #readChatMode(residentId: string): LoungeChatMode {
    const community = this.#settings.findActiveHumanCommunityByResidentId(residentId);
    if (!community) throw new Error("Lounge chat resident is not active");
    return this.#settings.getHumanSettings(community.home.homeId).chatMode ?? "natural";
  }

  #moveConversationToIdle(residentId: string): void {
    const snapshot = this.#loungeService.readSnapshotForResident(residentId);
    if (currentPresence(snapshot, residentId)?.area_id !== "conversation") return;
    this.#loungeService.chooseArea({ residentId, areaId: "idle" });
  }

  #bumpLeaseRevision(residentId: string): void {
    this.#leaseRevisions.set(residentId, this.getLeaseRevision(residentId) + 1);
  }

  #notifySessionChanged(residentId: string): void {
    this.#onSessionChanged?.(residentId);
  }
}

export interface LoungeRuntimeOptions {
  bell: LoungeRuntimeBell;
  chatWakeMessage: string;
  onError(error: unknown): void;
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
  engine: GameEngineAdapter;
  economy: GameEconomyPort;
  invitationFormatter: LoungeGameInvitationFormatter;
  turnFormatter: GameTurnWakeFormatter;
  reactionCharge: ReactionCharge;
  nameOf(playerId: string): Promise<string>;
  now?: () => number;
  onSessionChanged?: LoungeChatSessionChanged;
}

/** All scene tools share the same authoritative stores and authenticated identity. */
export function createLoungeRuntime(options: LoungeRuntimeOptions) {
  const { database, registrationAuth, engine, economy } = options;
  const now = options.now ?? Date.now;
  const tables = database.loungeGameTableStore;
  const identity = new GameIdentity(registrationAuth);
  const sync = new GameSync(tables, engine);
  let timeouts:GameTimeoutScheduler|undefined;
  const games = new GameService(
    tables,
    engine,
    undefined,
    {publish:(room,changes)=>{sync.publish(room,changes);timeouts?.publish(room);}},
    economy,
    database.gameRoundLimitStore,
    database.residentSocialStore,
    now,
  );
  const gameChat = new GameChatService(tables, database.gameChatStore);
  const canChat = (residentId: string) =>
    tables.listPublicTables().every((table) => {
      if (!table.room) return true;
      const room = tables.read(table.room.room_id);
      return !room?.seats.some(
        (seat) =>
          seat.controllerType === "resident" &&
          (seat.residentId === residentId || seat.playerId === `resident:${residentId}`),
      );
    });
  const lounge = new LoungeService({
    database,
    registrationAuth,
    store: database.loungeStore,
    now,
    gameTables: tables,
    publicSayState: { canSayPublicly: canChat },
  });
  const gamePresence = new LoungeGamePresenceAdapter({ tables, lounge });
  gamePresence.start();
  let chatWakes: LoungeChatWakeService | undefined;
  const chatRuntime = new LoungeChatRuntime({
    loungeService: lounge,
    sessionStore: database.loungeChatSessionStore,
    settings: database,
    canChat,
    now,
    onSessionChanged: (residentId) => {
      chatWakes?.sessionChanged(residentId);
      options.onSessionChanged?.(residentId);
    },
  });
  const say = new LoungeChatTool({ loungeService: lounge, runtime: chatRuntime, canChat, now });
  const invitationService = new LoungeGameInvitationService({
    database,
    tables,
    bell: options.bell,
    formatter: options.invitationFormatter,
    now,
  });
  const game:LoungeGameTool = new LoungeGameTool({
    gameService: games,
    gameIdentity: identity,
    gameTables: tables,
    gameChat,
    invitations: invitationService,
    nameOf: options.nameOf,
    ruleChoices: database.gameRuleChoiceStore,
    history: (roomId,names)=>{const room=tables.read(roomId);return room?gameHistory(room.kind,room.snapshot,names):[];},
    afterSocial: async (residentId,roomId,eventId):Promise<void>=>{try{await turnWakes.remind(residentId,roomId,eventId);}catch(error){options.onError(error);}},
    reactions: { send: (caller, input) => reactionService.send(caller, input) },
  });
  const turnWakes:GameTurnWakeService = new GameTurnWakeService({
    games,
    sync,
    tables,
    identity,
    gameTool: game,
    wakes: database.loungeWakeStore,
    bell: options.bell,
    formatter: options.turnFormatter,
    now,
    onError: options.onError,
  });
  const reactionHub = new GameReactionHub(tables,database.gameReactionStore);
  const reactionService = new GameReactionService(
    tables,
    database.gameReactionStore,
    options.reactionCharge,
    {
      publish: (event) => reactionHub.publish(event),
      bell: async (id, residentId, text) => {
        const wakeId = `game_reaction:${id}`;
        if (database.loungeWakeStore.get(residentId, wakeId)) return;
        const wake = database.loungeWakeStore.enqueue({
          wakeId,
          residentId,
          reason: "game_reaction",
          sourceKey: wakeId,
          text,
          now: now(),
        });
        if (wake.wakeId === wakeId) options.bell.notifyResident(residentId);
      },
    },
    options.nameOf,
  );
  const reactions = {
    read: (caller:Parameters<GameReactionHub['read']>[0],roomId:string)=>reactionHub.read(caller,roomId),
    send: (...args: Parameters<GameReactionService["send"]>) => reactionService.send(...args),
    subscribe: (...args: Parameters<GameReactionHub["subscribe"]>) =>
      reactionHub.subscribe(...args),
  };
  let closed = false;
  options.bell.setBeforePendingWakes((residentId) => {
    if (closed) return;
    invitationService.cancelInvalid(residentId, now());
    turnWakes.cancelInvalid(residentId);
  });
  turnWakes.start();
  timeouts = new GameTimeoutScheduler(tables,(id,key)=>games.runTimeout(id,key),now,options.onError);
  for(const table of tables.listPublicTables()){
    if(!table.room)continue;
    games.armTimeout(table.room.room_id);
    const room=tables.read(table.room.room_id);
    if(room)timeouts.publish(room);
  }
  chatWakes = new LoungeChatWakeService({
    lounge,
    sessions: database.loungeChatSessionStore,
    wakes: database.loungeWakeStore,
    bell: options.bell,
    message: options.chatWakeMessage,
    canChat,
    now,
    onError: options.onError,
  });
  chatWakes.start();
  void reactionService.recoverDelivery().catch(options.onError);
  return {
    chatWakes,
    close: () => {
      if (closed) return;
      closed = true;
      options.bell.setBeforePendingWakes(undefined);
      chatWakes?.close();
      turnWakes.close();
      timeouts?.close();
      invitationService.close();
      reactionHub.close();
      gamePresence.close();
      lounge.close();
    },
    lounge,
    chatRuntime,
    games,
    gameChat,
    sync,
    identity,
    game,
    reactions,
    invitationService,
    turnWakes,
    reactionHub,
    reactionService,
    tools: new LoungeTools(lounge, say, game),
  };
}
