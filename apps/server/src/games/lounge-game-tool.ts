import { loungeDisplayName } from "../lounge-display-name.js";
import { randomBytes, randomUUID } from "node:crypto";
import {gameContext} from './game-context.js';
import {GAME_RULES_COPY} from './game-rules-copy.js';
import type {GameRuleChoiceStore} from './game-rule-choice-store.js';

import type { GamePreferences } from "@doorbell/protocol";

import { acceptsGameInvitation } from "./game-invitation-policy.js";
import {
  buildLeafCommand,
  type LeafCommandSelection,
  type LeafCommandView,
} from "./game-leaf-command.js";
import type { GameCaller } from "./game-identity.js";
import type { GameService } from "./game-service.js";
import type { GameReactionService } from "./game-reaction-service.js";
import type { GameKind, GameRoomView } from "./types.js";

export type LoungeTableId = "square" | "round";

export interface LoungeGameToolArgs {
  option?: string;
  to?: string;
  text?: string;
  replyToMessageId?: string;
}

export interface LoungePublicTable {
  table_id: LoungeTableId;
  detached?: boolean;
  room: null | {
    room_id: string;
    kind: GameKind;
    phase: GameRoomView["phase"];
    revision: number;
  };
}

export interface LoungeGameTablePort {
  listPublicTables(): readonly LoungePublicTable[];
}

export type LoungeGameLobbyView = Awaited<ReturnType<GameService["create"]>>;
export type LoungeGamePlayerView = Awaited<ReturnType<GameService["view"]>>;

export interface LoungeGameServicePort {
  create(
    caller: GameCaller,
    kind: GameKind,
    baseStake?: number,
    tableId?: LoungeTableId,
  ): Promise<LoungeGameLobbyView>;
  join(caller: GameCaller, roomId: string, revision: number): Promise<LoungeGameLobbyView>;
  ready(
    caller: GameCaller,
    roomId: string,
    revision: number,
    ready: boolean,
  ): Promise<LoungeGameLobbyView>;
  start(caller: GameCaller, roomId: string, revision: number): Promise<LoungeGamePlayerView>;
  leave?(caller: GameCaller, roomId: string, revision: number): Promise<LoungeGameLobbyView>;
  view(caller: GameCaller, roomId: string): Promise<LoungeGamePlayerView>;
  command(
    caller: GameCaller,
    roomId: string,
    revision: number,
    command: Record<string, unknown>,
  ): Promise<LoungeGamePlayerView>;
}

export interface LoungeGameChatMessage {
  sequence: string | number;
  playerId?: string;
  text?: string;
  replyToMessageId?: string;
}

export interface LoungeGameChatPort {
  send(
    caller: GameCaller,
    roomId: string,
    input: { clientMessageId: string; text: string; replyToMessageId?: string },
  ): Promise<LoungeGameChatMessage>;
  read?(
    caller: GameCaller,
    roomId: string,
  ): Promise<readonly LoungeGameChatMessage[]>;
}

export interface LoungeGameInvitationTarget {
  residentId: string;
  displayName?: string | null;
  preferences: GamePreferences | null | undefined;
}

/**
 * The adapter only chooses recipients using the existing preference policy.
 * Delivery remains the responsibility of the caller's already wired invite
 * service; this boundary deliberately does not mention Bell or invent copy.
 */
export interface LoungeGameInvitationPort {
  listTargets(input: {
    fromResidentId: string;
    roomId: string;
  }): Promise<readonly LoungeGameInvitationTarget[]>;
  broadcast(input: {
    requestId: string;
    fromResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<void>;
  direct(input: {
    requestId: string;
    fromResidentId: string;
    toResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<void>;
}

export interface LoungeGameIdentityPort {
  resident(context: { residentId: string }): GameCaller;
}

export interface LoungeGameToolOptions {
  ruleChoices?:Pick<GameRuleChoiceStore,'set'|'pending'|'shown'|'selected'>;
  history?: (roomId:string,names:Record<string,string>)=>string[];
  afterSocial?: (residentId:string,roomId:string,eventId:string)=>Promise<void>;
  gameService: LoungeGameServicePort;
  gameIdentity: LoungeGameIdentityPort;
  gameTables: LoungeGameTablePort;
  gameChat?: LoungeGameChatPort;
  nameOf?: (playerId: string) => Promise<string>;
  reactions?: Pick<GameReactionService, "send">;
  invitations?: LoungeGameInvitationPort;
  now?: () => number;
  invitationPolicy?: (
    preferences: GamePreferences | null | undefined,
    at: number,
  ) => boolean;
}

export class LoungeGameToolError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "LoungeGameToolError";
    this.code = code;
  }
}

const TABLE_LABELS: Record<LoungeTableId, string> = {
  square: "方桌",
  round: "圆桌",
};

const GAME_LABELS: Record<GameKind, string> = {
  "leaf-game": "叶子戏",
  doudizhu: "斗地主",
  "flying-chess": "飞行棋",
  uno: "UNO",
  monopoly: "大富翁",
  mahjong: "麻将",
};

const PHASE_LABELS: Record<GameRoomView["phase"], string> = {
  waiting: "等待中",
  playing: "进行中",
  finished: "已结束",
};

const ACTION_LABELS: Record<string, string> = {
  act: "执行麻将动作",
  lead: "出牌",
  follow: "跟牌",
  challenge: "质疑",
  concede: "认输",
  bid: "叫分",
  pass: "不叫",
  play: "出牌",
  draw: "摸牌",
  keep: "保留",
  call_uno: "喊 UNO",
  catch_uno: "抓 UNO",
  next_round: "开始下一局",
  roll: "掷骰子",
  move: "移动",
  buy: "购买",
  decline: "放弃购买",
  build: "建造",
  sell_house: "出售房屋",
  end_turn: "结束回合",
  pay_bail: "支付保释金",
  use_jail_card: "使用出狱卡",
  card_ack: "确认卡牌",
  declare_bankrupt: "宣布破产",
  penalty_return: "返回起点",
  discard: "出牌",
  chi: "吃",
  peng: "碰",
  gang: "杠",
  concealed_gang: "暗杠",
  added_gang: "加杠",
  hu: "和牌",
};

const MIN_PLAYERS: Record<GameKind, number> = {
  "leaf-game": 4,
  doudizhu: 3,
  "flying-chess": 2,
  uno: 2,
  monopoly: 2,
  mahjong: 4,
};

const OPTION_PATTERN = /^[A-Za-z0-9_-]{6}$/u;
const ALLOWED_ARGS = new Set(["option", "to", "text", "replyToMessageId"]);
const ISSUED_OPTION_CODES = new Set<string>();

type PendingOption =
  | {kind:'rules';residentId:string;tableId:LoungeTableId;roomId:string;revision:number;roundKey:string;needsRules:boolean}
  | {
      kind: "reaction";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      reactionKind: "flower" | "bomb";
      requestId: string;
    }
  | {
      kind: "create";
      residentId: string;
      tableId: LoungeTableId;
      gameKind: GameKind;
    }
  | {
      kind: "join";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
    }
  | {
      kind: "ready";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      ready: boolean;
    }
  | {
      kind: "start";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
    }
  | {
      kind: "leave";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
    }
  | {
      kind: "leaf-card-toggle";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameRevision: number;
      action: LeafCardAction;
      cardId: string;
      selectedCardIds: readonly string[];
    }
  | {
      kind: "leaf-submit";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameRevision: number;
      action: "lead";
      selectedCardIds: readonly string[];
      declaredRank: number;
    }
  | {
      kind: "leaf-submit";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameRevision: number;
      action: "follow";
      selectedCardIds: readonly string[];
    }
  | {
      kind: "leaf-direct";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameRevision: number;
      action: "challenge" | "concede";
    }
  | {
      kind: "command";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      command: Record<string, unknown>;
    }
  | {
      kind: "invite-broadcast";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameKind: GameKind;
      requestId: string;
    }
  | {
      kind: "invite-direct";
      residentId: string;
      tableId: LoungeTableId;
      roomId: string;
      revision: number;
      gameKind: GameKind;
      targetResidentId: string;
      requestId: string;
    };

type OptionLines = string[];

interface RoomInspection {
  table: LoungePublicTable;
  view: LoungeGamePlayerView | null;
  seated: boolean;
  error?: unknown;
}

interface ResidentRoomReference {
  tableId: LoungeTableId;
  kind: GameKind;
  revision: number;
}

type LeafCardAction = "lead" | "follow";

interface LeafSelectionState {
  tableId: LoungeTableId;
  roomId: string;
  roomRevision: number;
  gameRevision: number;
  action: LeafCardAction;
  handIds: string[];
  cardIds: string[];
}

/**
 * Domain adapter for the public lounge game's single tool entry.
 *
 * The adapter intentionally has no HTTP/MCP registration code. The caller
 * supplies the authenticated identity and already-wired domain services.
 */
export class LoungeGameTool {
  readonly #rulesWakeRounds=new Map<string,string>();
  readonly #extra:LoungeGameToolOptions;
  readonly #gameService: LoungeGameServicePort;
  readonly #gameIdentity: LoungeGameIdentityPort;
  readonly #gameTables: LoungeGameTablePort;
  readonly #gameChat: LoungeGameChatPort | undefined;
  readonly #nameOf: LoungeGameToolOptions["nameOf"];
  readonly #reactions: LoungeGameToolOptions["reactions"];
  readonly #invitations: LoungeGameInvitationPort | undefined;
  readonly #now: () => number;
  readonly #invitationPolicy: (
    preferences: GamePreferences | null | undefined,
    at: number,
  ) => boolean;
  readonly #options = new Map<string, PendingOption>();
  readonly #activeOptionCodes = new Map<string, Set<string>>();
  readonly #previousOptions = new Map<string, Map<string, PendingOption>>();
  readonly #residentRooms = new Map<string, Map<string, ResidentRoomReference>>();
  readonly #leafSelections = new Map<string, LeafSelectionState>();

  constructor(options: LoungeGameToolOptions) {
    this.#extra=options;
    this.#gameService = options.gameService;
    this.#gameIdentity = options.gameIdentity;
    this.#gameTables = options.gameTables;
    this.#gameChat = options.gameChat;
    this.#nameOf = options.nameOf;
    this.#reactions = options.reactions;
    this.#invitations = options.invitations;
    this.#now = options.now ?? Date.now;
    this.#invitationPolicy = options.invitationPolicy ?? acceptsGameInvitation;
  }

  async execute(residentId: string, args: LoungeGameToolArgs = {}): Promise<string> {
    this.#validateResidentId(residentId);
    this.#validateArgs(args);

    const caller = this.#gameIdentity.resident({ residentId });
    if (args.option !== undefined) {
      return this.#executeOption(residentId, caller, args.option, args.to);
    }
    if (args.text !== undefined) {
      return this.#sendChat(residentId, caller, args.text, args.replyToMessageId);
    }
    if (args.replyToMessageId !== undefined) {
      throw new LoungeGameToolError("reply_requires_text");
    }
    return this.#readState(residentId, caller);
  }

  async wakeMessage(residentId: string, roomId: string): Promise<string> {
    this.#validateResidentId(residentId);
    if (typeof roomId !== "string" || roomId.trim().length === 0) {
      throw new LoungeGameToolError("room_required");
    }

    const caller = this.#gameIdentity.resident({ residentId });
    const table = this.#readTables().find(
      (candidate) => candidate.room?.room_id === roomId,
    );
    if (!table) throw new LoungeGameToolError("game_room_not_found");

    let view: LoungeGamePlayerView;
    try {
      view = await this.#gameService.view(caller, roomId);
    } catch (error) {
      if (hasErrorCode(error, "not_seated")) {
        throw new LoungeGameToolError("not_seated");
      }
      if (hasErrorCode(error, "room_not_found")) {
        throw new LoungeGameToolError("game_room_not_found");
      }
      throw error;
    }
    if (view.roomId !== roomId) throw new LoungeGameToolError("game_state_unavailable");

    const actor = await caller.authenticate();
    this.#rememberRoom(residentId, table.table_id, view);
    this.#beginOptionGroup(residentId);
    const lines = await this.#renderSeatedRoom(
      residentId,
      actor.playerId,
      caller,
      table,
      view,
    );
    const roundKey=String(asRecord(view.game)?.round??1);
    this.#rulesWakeRounds.set(residentId+'\0'+roomId,roundKey);
    if(view.phase==='playing'&&this.#extra.ruleChoices?.pending(roomId,actor.playerId,roundKey)){
      lines.unshift(...GAME_RULES_COPY[view.kind]);
    }
    return lines.join("\n");
  }
  async markRulesShown(residentId:string,roomId:string):Promise<void>{
    const actor=await this.#gameIdentity.resident({residentId}).authenticate();
    const roundKey=this.#rulesWakeRounds.get(residentId+'\0'+roomId);
    if(roundKey!==undefined)this.#extra.ruleChoices?.shown(roomId,actor.playerId,roundKey);
  }

  #validateResidentId(residentId: string): void {
    if (typeof residentId !== "string" || residentId.trim().length === 0) {
      throw new LoungeGameToolError("resident_required");
    }
  }

  #validateArgs(args: LoungeGameToolArgs): void {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw new LoungeGameToolError("invalid_args");
    }
    for (const key of Object.keys(args)) {
      if (!ALLOWED_ARGS.has(key)) throw new LoungeGameToolError("invalid_args");
    }

    if (args.option !== undefined && typeof args.option !== "string") {
      throw new LoungeGameToolError("invalid_args");
    }
    if (args.to !== undefined && (typeof args.to !== "string" || !args.to.trim() || args.option === undefined)) {
      throw new LoungeGameToolError("invalid_args");
    }
    if (args.text !== undefined && typeof args.text !== "string") {
      throw new LoungeGameToolError("invalid_args");
    }
    if (
      args.replyToMessageId !== undefined &&
      typeof args.replyToMessageId !== "string"
    ) {
      throw new LoungeGameToolError("invalid_args");
    }
    if (args.option !== undefined && args.text !== undefined) {
      throw new LoungeGameToolError("option_text_mutually_exclusive");
    }
    if (args.option !== undefined && args.option.trim().length === 0) {
      throw new LoungeGameToolError("invalid_option");
    }
    if (args.text !== undefined && args.text.trim().length === 0) {
      throw new LoungeGameToolError("empty_text");
    }
    if (args.replyToMessageId !== undefined && args.text === undefined) {
      throw new LoungeGameToolError("reply_requires_text");
    }
  }

  async #readState(residentId: string, caller: GameCaller): Promise<string> {
    const actor = await caller.authenticate();
    const tables = this.#readTables();
    const inspections = new Map<LoungeTableId, RoomInspection>();
    for (const table of tables) {
      if (!table.room) continue;
      const inspection = await this.#inspectRoom(caller, table);
      if (inspection.error) throw inspection.error;
      if (inspection.seated && inspection.view) {
        this.#rememberRoom(residentId, table.table_id, inspection.view);
      } else if (!inspection.seated) {
        this.#forgetRoom(residentId, table.room.room_id);
      }
      inspections.set(table.table_id, inspection);
    }

    const detachedInspections = await this.#readDetachedRooms(
      residentId,
      caller,
      new Set(tables.flatMap((table) => table.room ? [table.room.room_id] : [])),
    );
    const seatedAtAnotherTable = [...inspections.values(), ...detachedInspections]
      .some((inspection) => inspection.seated);

    this.#beginOptionGroup(residentId);
    const sections: string[] = ["当前游戏状态"];

    for (const table of tables) {
      if (!table.room) {
        sections.push(this.#renderEmptyTable(residentId, table, !seatedAtAnotherTable));
        continue;
      }

      const inspection = inspections.get(table.table_id);
      if (!inspection) throw new LoungeGameToolError("game_state_unavailable");
      if (!inspection.seated) {
        sections.push(this.#renderUnseatedRoom(residentId, table, seatedAtAnotherTable));
        continue;
      }
      if (!inspection.view) {
        throw new LoungeGameToolError("game_state_unavailable");
      }

      const roomLines = await this.#renderSeatedRoom(
        residentId,
        actor.playerId,
        caller,
        table,
        inspection.view,
      );
      sections.push(roomLines.join("\n"));
    }

    for (const inspection of detachedInspections) {
      if (inspection.view) {
        const roomLines = await this.#renderSeatedRoom(
          residentId,
          actor.playerId,
          caller,
          inspection.table,
          inspection.view,
        );
        sections.push(roomLines.join("\n"));
      }
    }

    return sections.join("\n\n");
  }

  #readTables(): LoungePublicTable[] {
    const tables = this.#gameTables.listPublicTables();
    if (!Array.isArray(tables)) {
      throw new LoungeGameToolError("game_table_state_unavailable");
    }
    const byId = new Map<LoungeTableId, LoungePublicTable>();
    for (const table of tables) {
      if (!table || (table.table_id !== "square" && table.table_id !== "round")) {
        throw new LoungeGameToolError("game_table_state_unavailable");
      }
      if (byId.has(table.table_id)) {
        throw new LoungeGameToolError("game_table_state_unavailable");
      }
      if (table.room) {
        if (
          typeof table.room.room_id !== "string" ||
          typeof table.room.revision !== "number" ||
          !Number.isInteger(table.room.revision) ||
          !isGameKind(table.room.kind) ||
          !isPhase(table.room.phase)
        ) {
          throw new LoungeGameToolError("game_table_state_unavailable");
        }
      }
      byId.set(table.table_id, table);
    }
    if (!byId.has("square") || !byId.has("round")) {
      throw new LoungeGameToolError("game_table_state_unavailable");
    }
    return [byId.get("square")!, byId.get("round")!];
  }

  #tableLabel(table: LoungePublicTable): string {
    return table.detached ? `${TABLE_LABELS[table.table_id]}（已结束对局）` : TABLE_LABELS[table.table_id];
  }

  #renderEmptyTable(
    residentId: string,
    table: LoungePublicTable,
    canCreate: boolean,
  ): string {
    if (!canCreate) return `${this.#tableLabel(table)}：空桌；你已在另一桌入座。`;
    const lines = [`${this.#tableLabel(table)}：空桌，可开六种游戏。`];
    for (const kind of gameKinds()) {
      this.#addOption(lines, residentId, {
        kind: "create",
        residentId,
        tableId: table.table_id,
        gameKind: kind,
      }, `开一桌${GAME_LABELS[kind]}`);
    }
    return lines.join("\n");
  }

  #renderUnseatedRoom(
    residentId: string,
    table: LoungePublicTable,
    alreadySeated: boolean,
  ): string {
    const room = table.room!;
    const base = `${this.#tableLabel(table)}：${GAME_LABELS[room.kind]}，${PHASE_LABELS[room.phase]}。`;
    if (room.phase !== "waiting") return `${base}这桌当前不能加入。`;
    if (alreadySeated) return `${base}你已在另一桌入座，不能再加入。`;

    const lines = [base, "可以加入这桌："];
    this.#addOption(lines, residentId, {
      kind: "join",
      residentId,
      tableId: table.table_id,
      roomId: room.room_id,
      revision: room.revision,
    }, "加入这桌");
    return lines.join("\n");
  }

  async #inspectRoom(caller: GameCaller, table: LoungePublicTable): Promise<RoomInspection> {
    const room = table.room!;
    try {
      return { table, view: await this.#gameService.view(caller, room.room_id), seated: true };
    } catch (error) {
      if (hasErrorCode(error, "not_seated")) return { table, view: null, seated: false };
      return { table, view: null, seated: false, error };
    }
  }

  async #readDetachedRooms(
    residentId: string,
    caller: GameCaller,
    publicRoomIds: ReadonlySet<string>,
  ): Promise<RoomInspection[]> {
    const references = this.#residentRooms.get(residentId);
    if (!references) return [];
    const inspections: RoomInspection[] = [];
    for (const [roomId, reference] of references) {
      if (publicRoomIds.has(roomId)) continue;
      try {
        const view = await this.#gameService.view(caller, roomId);
        this.#rememberRoom(residentId, reference.tableId, view);
        inspections.push({
          table: {
            table_id: reference.tableId,
            detached: true,
            room: {
              room_id: view.roomId,
              kind: view.kind,
              phase: view.phase,
              revision: view.revision,
            },
          },
          view,
          seated: true,
        });
      } catch (error) {
        if (hasErrorCode(error, "not_seated") || hasErrorCode(error, "room_not_found")) {
          references.delete(roomId);
          continue;
        }
        throw error;
      }
    }
    if (references.size === 0) this.#residentRooms.delete(residentId);
    return inspections;
  }

  #rememberRoom(residentId: string, tableId: LoungeTableId, view: LoungeGamePlayerView): void {
    let references = this.#residentRooms.get(residentId);
    if (!references) {
      references = new Map();
      this.#residentRooms.set(residentId, references);
    }
    references.set(view.roomId, { tableId, kind: view.kind, revision: view.revision });
  }

  #forgetRoom(residentId: string, roomId: string): void {
    const references = this.#residentRooms.get(residentId);
    if (references) {
      references.delete(roomId);
      if (references.size === 0) this.#residentRooms.delete(residentId);
    }
    if (this.#leafSelections.get(residentId)?.roomId === roomId) {
      this.#leafSelections.delete(residentId);
    }
  }

  async #renderSeatedRoom(
    residentId: string,
    playerId: string,
    caller: GameCaller,
    table: LoungePublicTable,
    view: LoungeGamePlayerView,
    includeChat = true,
  ): Promise<OptionLines> {
    const lines: string[] = [this.#renderRoomSummary(playerId, table, view)];
    const names:Record<string,string>={};
    for(const seat of view.seats)names[seat.playerId]=this.#nameOf?await this.#nameOf(seat.playerId):'同桌';
    if(view.game)lines.push(...gameContext(view.kind,view.game,names));
    const history=this.#extra.history?.(view.roomId,names)??[];
    if(history.length)lines.push('期间行动：',...history);
    lines.push(...privateProjectionLines(view.kind, asRecord(view.game), playerId));
    if (includeChat) await this.#renderChatMessages(lines, caller, view.roomId, playerId);

    if (view.phase === "waiting") {
      const ownSeat = view.seats.find((seat) => seat.playerId === playerId);
      if (!ownSeat) {
        throw new LoungeGameToolError("game_state_unavailable");
      }
      this.#addOption(lines, residentId, {
        kind: "ready",
        residentId,
        tableId: table.table_id,
        roomId: view.roomId,
        revision: view.revision,
        ready: !ownSeat.ready,
      }, ownSeat.ready ? "取消准备" : "准备");

      const readyCount = view.seats.filter((seat) => seat.ready).length;
      if (
        view.seats.length >= MIN_PLAYERS[view.kind] &&
        readyCount === view.seats.length
      ) {
        this.#addOption(lines, residentId, {
          kind: "start",
          residentId,
          tableId: table.table_id,
          roomId: view.roomId,
          revision: view.revision,
        }, "开始游戏");
      }
    } else if (view.phase === "playing") {
      const game=asRecord(view.game);
      const roundKey=String(game?.round??1);
      const ended=['round_over','game_over','finished'].includes(String(game?.phase))||game?.status==='finished'||asRecord(game?.public)?.game_result!=null;
      if(this.#extra.ruleChoices&&!ended&&!this.#extra.ruleChoices.selected(view.roomId,playerId,roundKey)){
        for(const needsRules of [false,true])this.#addOption(lines,residentId,{
          kind:'rules',residentId,tableId:table.table_id,roomId:view.roomId,revision:view.revision,roundKey,needsRules,
        },needsRules?'不了解规则，查看简版':'了解规则');
        return lines;
      }
      this.#addGameActionOptions(lines, residentId, playerId, table, view);
    }

    if (view.phase === "waiting" || view.phase === "finished") {
      if (this.#gameService.leave) {
        this.#addOption(lines, residentId, {
          kind: "leave",
          residentId,
          tableId: table.table_id,
          roomId: view.roomId,
          revision: view.revision,
        }, "退出这桌");
      }
    }

    if (view.phase !== "finished") {
      await this.#addInvitationOptions(lines, residentId, table, view);
    }
    if (this.#reactions && this.#nameOf) {
      if (view.seats.some(target => target.playerId !== playerId)) {
        for (const reactionKind of ["flower", "bomb"] as const) {
          const option = this.#newOption({
            kind: "reaction", residentId, tableId: table.table_id,
            roomId: view.roomId, revision: view.revision,
            reactionKind, requestId: randomUUID(),
          });
          lines.push(`- ${reactionKind === "flower" ? "送 1 个🌹" : "扔 1 个💣"}，50 金币（option ${option}，to 对方名字）`);
        }
      }
    }
    return lines;
  }

  async #renderChatMessages(
    lines: OptionLines,
    caller: GameCaller,
    roomId: string,
    playerId: string,
  ): Promise<void> {
    if (!this.#gameChat?.read) return;
    const messages = await this.#gameChat.read(caller, roomId);
    if (messages.length === 0) return;
    lines.push("游戏聊天：");
    for (const message of messages) {
      const text = safeText(message.text) ?? "";
      const speaker = message.playerId === playerId ? "你"
        : message.playerId && this.#nameOf
          ? safeText(await this.#nameOf(message.playerId)) ?? "同桌" : "同桌";
      const reply = message.replyToMessageId === undefined
        ? ""
        : `（回复序号 ${safeText(message.replyToMessageId) ?? ""}）`;
      lines.push(`- [${String(message.sequence)}] ${speaker}${reply}：${text}`);
    }
  }

  #renderRoomSummary(playerId: string, table: LoungePublicTable, view: LoungeGamePlayerView): string {
    const readyCount = view.seats.filter((seat) => seat.ready).length;
    let summary = `${this.#tableLabel(table)}：${GAME_LABELS[view.kind]}，${PHASE_LABELS[view.phase]}；${view.seats.length} 人，${readyCount} 人已准备。`;
    if (view.phase === "waiting") {
      const missing = Math.max(0, MIN_PLAYERS[view.kind] - view.seats.length);
      summary += missing > 0 ? ` 至少${MIN_PLAYERS[view.kind]}人开局，还差${missing}人入座。`
        : readyCount < view.seats.length ? ` 人数已够，还差${view.seats.length - readyCount}人准备。`
        : " 已全员准备，可以开始游戏。";
    }
    if (view.phase === "playing") {
      const game = asRecord(view.game);
      const currentPlayerId = currentPlayerFor(view.kind, game);
      if (currentPlayerId) {
        summary += currentPlayerId === playerId ? " 轮到你。" : " 等待其他玩家行动。";
      }
    }
    return summary;
  }

  #addGameActionOptions(
    lines: OptionLines,
    residentId: string,
    playerId: string,
    table: LoungePublicTable,
    view: LoungeGamePlayerView,
  ): void {
    if (view.kind === "leaf-game") {
      this.#addLeafActionOptions(lines, residentId, playerId, table, view);
      return;
    }
    const game = asRecord(view.game);
    const moves = legalMovesFor(view.kind, game);
    const engineRevision = engineRevisionFor(game);
    for (const move of moves) {
      const command = commandForLegalMove(view.kind, move, engineRevision);
      if (!command) continue;
      const action = actionKind(view.kind, move);
      const detail = actionDetail(view.kind, move, game, playerId);
      this.#addOption(lines, residentId, {
        kind: "command",
        residentId,
        tableId: table.table_id,
        roomId: view.roomId,
        revision: view.revision,
        command,
      }, detail ? `${actionLabel(action, view.kind)}：${detail}` : actionLabel(action, view.kind));
    }

    if (moves.length === 0) {
      const currentPlayerId = currentPlayerFor(view.kind, game);
      if (!currentPlayerId || currentPlayerId !== playerId) {
        lines.push("当前没有轮到你操作。");
      }
    }
  }

  #addLeafActionOptions(
    lines: OptionLines,
    residentId: string,
    playerId: string,
    table: LoungePublicTable,
    view: LoungeGamePlayerView,
  ): void {
    const game = asRecord(view.game);
    const commandView = leafCommandViewFromGame(game, playerId);
    if (!commandView) {
      this.#leafSelections.delete(residentId);
      return;
    }

    const cardAction = leafCardAction(commandView.legal_actions);
    if (cardAction) {
      const hand = leafHandEntries(game, playerId);
      if (!hand) {
        this.#leafSelections.delete(residentId);
        return;
      }
      const handIds = hand.map((card) => card.id);
      let selection = this.#leafSelections.get(residentId);
      if (
        !selection ||
        selection.tableId !== table.table_id ||
        selection.roomId !== view.roomId ||
        selection.roomRevision !== view.revision ||
        selection.gameRevision !== commandView.revision ||
        selection.action !== cardAction ||
        !sameStringSet(selection.handIds, handIds) ||
        !selection.cardIds.every((cardId) => handIds.includes(cardId))
      ) {
        selection = {
          tableId: table.table_id,
          roomId: view.roomId,
          roomRevision: view.revision,
          gameRevision: commandView.revision,
          action: cardAction,
          handIds: [...handIds],
          cardIds: [],
        };
        this.#leafSelections.set(residentId, selection);
      }

      lines.push(`选牌：已选 ${selection.cardIds.length} 张。`);
      for (const [index, card] of hand.entries()) {
        const selected = selection.cardIds.includes(card.id);
        if (!selected && selection.cardIds.length >= commandView.rules.max_play_size) {
          continue;
        }
        this.#addOption(
          lines,
          residentId,
          {
            kind: "leaf-card-toggle",
            residentId,
            tableId: table.table_id,
            roomId: view.roomId,
            revision: view.revision,
            gameRevision: commandView.revision,
            action: cardAction,
            cardId: card.id,
            selectedCardIds: [...selection.cardIds],
          },
          `${selected ? "取消" : "选择"}第 ${index + 1} 张牌（${readableCard(card.value)}）`,
        );
      }

      if (selection.cardIds.length > 0) {
        if (cardAction === "lead") {
          for (let rank = 1; rank <= 10; rank += 1) {
            this.#addOption(
              lines,
              residentId,
              {
                kind: "leaf-submit",
                residentId,
                tableId: table.table_id,
                roomId: view.roomId,
                revision: view.revision,
                gameRevision: commandView.revision,
                action: "lead",
                selectedCardIds: [...selection.cardIds],
                declaredRank: rank,
              },
              `报 ${rank} 点并出牌`,
            );
          }
        } else {
          this.#addOption(
            lines,
            residentId,
            {
              kind: "leaf-submit",
              residentId,
              tableId: table.table_id,
              roomId: view.roomId,
              revision: view.revision,
              gameRevision: commandView.revision,
              action: "follow",
              selectedCardIds: [...selection.cardIds],
            },
            "确认跟牌",
          );
        }
      }
    } else {
      this.#leafSelections.delete(residentId);
    }

    for (const action of ["challenge", "concede"] as const) {
      if (!commandView.legal_actions.includes(action)) continue;
      this.#addOption(
        lines,
        residentId,
        {
          kind: "leaf-direct",
          residentId,
          tableId: table.table_id,
          roomId: view.roomId,
          revision: view.revision,
          gameRevision: commandView.revision,
          action,
        },
        action === "challenge" ? "质疑" : "认罚",
      );
    }
  }

  async #addInvitationOptions(
    lines: OptionLines,
    residentId: string,
    table: LoungePublicTable,
    view: LoungeGamePlayerView,
  ): Promise<void> {
    if (!this.#invitations || view.phase !== "waiting") return;
    const targets = await this.#eligibleTargets(residentId, view.roomId);
    if (targets.length === 0) lines.push("邀请：当前没有符合邀请设置且未入座的居民。");

    this.#addOption(lines, residentId, {
      kind: "invite-broadcast",
      residentId,
      tableId: table.table_id,
      roomId: view.roomId,
      revision: view.revision,
      gameKind: view.kind,
      requestId: randomUUID(),
    }, "广播邀请");
    for (const target of targets) {
      this.#addOption(lines, residentId, {
        kind: "invite-direct",
        residentId,
        tableId: table.table_id,
        roomId: view.roomId,
        revision: view.revision,
        gameKind: view.kind,
        targetResidentId: target.residentId,
        requestId: randomUUID(),
      }, `邀请${displayName(target)}`);
    }
  }

  async #eligibleTargets(
    residentId: string,
    roomId: string,
  ): Promise<LoungeGameInvitationTarget[]> {
    if (!this.#invitations) return [];
    const targets = await this.#invitations.listTargets({
      fromResidentId: residentId,
      roomId,
    });
    const at = this.#now();
    return targets.filter((target) =>
      target.residentId !== residentId &&
      typeof target.residentId === "string" &&
      target.residentId.length > 0 &&
      this.#invitationPolicy(target.preferences, at),
    );
  }

  #addOption(lines: OptionLines, residentId: string, pending: PendingOption, label: string): string {
    const option = this.#newOption(pending);
    lines.push(`- ${label}（option ${option}）`);
    return option;
  }

  #newOption(pending: PendingOption): string {
    // A read/chat/wake is not a game action. Reuse the same option and its
    // command id only when its complete semantic target is still available.
    const key = JSON.stringify(pending, (field, value) =>
      field === "command_id" || field === "requestId" ? undefined : value);
    const previous = this.#previousOptions.get(pending.residentId);
    for (const [code, existing] of previous ?? []) {
      const existingKey = JSON.stringify(existing, (field, value) =>
        field === "command_id" || field === "requestId" ? undefined : value);
      if (key !== existingKey) continue;
      previous!.delete(code);
      this.#options.set(code, existing);
      this.#activeOptionCodes.get(pending.residentId)!.add(code);
      return code;
    }
    let option = "";
    do {
      option = randomBytes(6).toString("base64url").slice(0, 6);
    } while (ISSUED_OPTION_CODES.has(option));
    ISSUED_OPTION_CODES.add(option);
    this.#options.set(option, pending);
    const group = this.#activeOptionCodes.get(pending.residentId);
    if (!group) throw new LoungeGameToolError("option_group_unavailable");
    group.add(option);
    return option;
  }

  #beginOptionGroup(residentId: string): void {
    const previous = this.#activeOptionCodes.get(residentId);
    const reusable = new Map<string, PendingOption>();
    if (previous) {
      for (const option of previous) {
        const pending = this.#options.get(option);
        if (pending) reusable.set(option, pending);
        this.#options.delete(option);
      }
    }
    this.#previousOptions.set(residentId, reusable);
    this.#activeOptionCodes.set(residentId, new Set());
  }

  async #executeOption(
    residentId: string,
    caller: GameCaller,
    option: string,
    to?: string,
  ): Promise<string> {
    if (!OPTION_PATTERN.test(option)) throw new LoungeGameToolError("invalid_option");
    const pending = this.#options.get(option);
    if (!pending) throw new LoungeGameToolError("option_expired");
    if (pending.residentId !== residentId) throw new LoungeGameToolError("option_identity_mismatch");
    if (to !== undefined && pending.kind !== "reaction") throw new LoungeGameToolError("invalid_args");

    switch (pending.kind) {
      case 'rules': {
        await this.#assertCurrentRoom(caller,pending);
        const actor=await caller.authenticate();
        const view=await this.#gameService.view(caller,pending.roomId);
        if(String(asRecord(view.game)?.round??1)!==pending.roundKey)throw new LoungeGameToolError('option_expired');
        if(!this.#extra.ruleChoices)throw new LoungeGameToolError('option_expired');
        this.#extra.ruleChoices.set(pending.roomId,actor.playerId,pending.needsRules,pending.roundKey);
        const result=await this.#readState(residentId,caller);
        this.#extra.ruleChoices.shown(pending.roomId,actor.playerId,pending.roundKey);
        return (pending.needsRules?GAME_RULES_COPY[view.kind].join('\n')+'\n':'')+result;
      }
      case "reaction":
        await this.#assertCurrentRoom(caller, pending);
        if (!this.#reactions || !this.#nameOf) throw new LoungeGameToolError("game_reaction_unavailable");
        if (!to) throw new LoungeGameToolError("reaction_target_required");
        const current = await this.#gameService.view(caller, pending.roomId);
        const actor = await caller.authenticate();
        const targets = [];
        for (const seat of current.seats) {
          if (seat.playerId === actor.playerId) continue;
          if (await this.#nameOf(seat.playerId) === to) targets.push(seat.playerId);
        }
        if (targets.length !== 1) throw new LoungeGameToolError("reaction_target_unavailable");
        await this.#reactions.send(caller, {
          roomId: pending.roomId, targetId: targets[0]!,
          kind: pending.reactionKind, requestId: pending.requestId,
        });
        this.#options.delete(option);
        await this.#extra.afterSocial?.(residentId,pending.roomId,'gift:'+pending.requestId);
        return this.#readState(residentId, caller);
      case "create":
        return this.#executeCreate(residentId, caller, pending);
      case "join":
        await this.#assertCurrentRoom(caller, pending);
        await this.#assertNoOtherRoomSeat(caller, pending.roomId);
        await this.#gameService.join(caller, pending.roomId, pending.revision);
        return this.#withState("已入座。", residentId, caller);
      case "ready":
        await this.#assertCurrentRoom(caller, pending);
        await this.#gameService.ready(caller, pending.roomId, pending.revision, pending.ready);
        return this.#withState(pending.ready ? "已准备。" : "已取消准备。", residentId, caller);
      case "start":
        await this.#assertCurrentRoom(caller, pending);
        await this.#gameService.start(caller, pending.roomId, pending.revision);
        return this.#withState("已开局。", residentId, caller);
      case "leave":
        await this.#assertCurrentRoom(caller, pending);
        if (!this.#gameService.leave) {
          throw new LoungeGameToolError("game_leave_unavailable");
        }
        await this.#gameService.leave(caller, pending.roomId, pending.revision);
        this.#forgetRoom(residentId, pending.roomId);
        return this.#withState("已离桌。", residentId, caller);
      case "leaf-card-toggle":
        return this.#executeLeafCardToggle(residentId, caller, pending);
      case "leaf-submit":
        return this.#executeLeafSubmit(residentId, caller, pending);
      case "leaf-direct":
        return this.#executeLeafDirect(residentId, caller, pending);
      case "command":
        await this.#assertCurrentRoom(caller, pending);
        await this.#gameService.command(caller, pending.roomId, pending.revision, pending.command);
        return this.#withState("已提交。", residentId, caller);
      case "invite-broadcast":
        return this.#executeBroadcastInvite(residentId, caller, pending);
      case "invite-direct":
        return this.#executeDirectInvite(residentId, caller, pending);
    }
  }

  async #executeLeafCardToggle(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "leaf-card-toggle" }>,
  ): Promise<string> {
    await this.#assertCurrentRoom(caller, pending);
    const current = await this.#gameService.view(caller, pending.roomId);
    const actor = await caller.authenticate();
    const commandView = leafCommandViewFromPlayerView(current, actor.playerId);
    if (
      !commandView ||
      current.revision !== pending.revision ||
      commandView.revision !== pending.gameRevision
    ) {
      throw new LoungeGameToolError("option_stale");
    }

    const handIds = leafHandIds(commandView, actor.playerId);
    const selection = this.#leafSelections.get(residentId);
    if (
      !selection ||
      selection.tableId !== pending.tableId ||
      selection.roomId !== pending.roomId ||
      selection.roomRevision !== pending.revision ||
      selection.gameRevision !== pending.gameRevision ||
      selection.action !== pending.action ||
      !sameStringSet(selection.handIds, handIds) ||
      !sameStringSet(selection.cardIds, pending.selectedCardIds) ||
      !handIds.includes(pending.cardId)
    ) {
      throw new LoungeGameToolError("option_stale");
    }

    const next = new Set(selection.cardIds);
    if (next.has(pending.cardId)) {
      next.delete(pending.cardId);
    } else {
      if (next.size >= commandView.rules.max_play_size) {
        throw new LoungeGameToolError("option_stale");
      }
      next.add(pending.cardId);
    }
    selection.cardIds = [...next];
    return this.#withState("已选牌。", residentId, caller);
  }

  async #executeLeafSubmit(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "leaf-submit" }>,
  ): Promise<string> {
    await this.#assertCurrentRoom(caller, pending);
    const current = await this.#gameService.view(caller, pending.roomId);
    const actor = await caller.authenticate();
    const commandView = leafCommandViewFromPlayerView(current, actor.playerId);
    const selection = this.#leafSelections.get(residentId);
    if (
      !commandView ||
      current.revision !== pending.revision ||
      commandView.revision !== pending.gameRevision ||
      !selection ||
      selection.tableId !== pending.tableId ||
      selection.roomId !== pending.roomId ||
      selection.roomRevision !== pending.revision ||
      selection.gameRevision !== pending.gameRevision ||
      selection.action !== pending.action ||
      !sameStringSet(selection.cardIds, pending.selectedCardIds) ||
      !sameStringSet(selection.handIds, leafHandIds(commandView, actor.playerId))
    ) {
      throw new LoungeGameToolError("option_stale");
    }

    const leafSelection: LeafCommandSelection = pending.action === "lead"
      ? {
          action: "lead",
          cardIds: pending.selectedCardIds,
          declaredRank: pending.declaredRank,
        }
      : { action: "follow", cardIds: pending.selectedCardIds };
    let command: Record<string, unknown>;
    try {
      command = buildLeafCommand(commandView, leafSelection, randomUUID());
    } catch {
      throw new LoungeGameToolError("option_stale");
    }
    await this.#gameService.command(caller, pending.roomId, pending.revision, command);
    this.#leafSelections.delete(residentId);
    return this.#withState("已提交。", residentId, caller);
  }

  async #executeLeafDirect(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "leaf-direct" }>,
  ): Promise<string> {
    await this.#assertCurrentRoom(caller, pending);
    const current = await this.#gameService.view(caller, pending.roomId);
    const actor = await caller.authenticate();
    const commandView = leafCommandViewFromPlayerView(current, actor.playerId);
    if (
      !commandView ||
      current.revision !== pending.revision ||
      commandView.revision !== pending.gameRevision
    ) {
      throw new LoungeGameToolError("option_stale");
    }

    let command: Record<string, unknown>;
    try {
      command = buildLeafCommand(
        commandView,
        { action: pending.action },
        randomUUID(),
      );
    } catch {
      throw new LoungeGameToolError("option_stale");
    }
    await this.#gameService.command(caller, pending.roomId, pending.revision, command);
    this.#leafSelections.delete(residentId);
    return this.#withState("已提交。", residentId, caller);
  }

  async #executeCreate(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "create" }>,
  ): Promise<string> {
    const current = this.#readTables().find((table) => table.table_id === pending.tableId);
    if (!current || current.room) throw new LoungeGameToolError("option_stale");
    await this.#assertNoOtherRoomSeat(caller);
    const created = await this.#gameService.create(caller, pending.gameKind, undefined, pending.tableId);
    await this.#gameService.join(caller, created.roomId, created.revision);
    return this.#withState(`已开桌：${GAME_LABELS[pending.gameKind]}。`, residentId, caller);
  }

  async #executeBroadcastInvite(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "invite-broadcast" }>,
  ): Promise<string> {
    await this.#assertCurrentRoom(caller, pending);
    await this.#assertSeatedInRoom(caller, pending.roomId);
    if (!this.#invitations) throw new LoungeGameToolError("game_invitation_unavailable");
    if ((await this.#eligibleTargets(residentId, pending.roomId)).length === 0) {
      return this.#withState("当前没有可接收邀请的居民，本次未发送。", residentId, caller);
    }
    await this.#invitations.broadcast({
      requestId: pending.requestId,
      fromResidentId: residentId,
      roomId: pending.roomId,
      kind: pending.gameKind,
    });
    return this.#withState("已提交广播邀请。", residentId, caller);
  }

  async #executeDirectInvite(
    residentId: string,
    caller: GameCaller,
    pending: Extract<PendingOption, { kind: "invite-direct" }>,
  ): Promise<string> {
    await this.#assertCurrentRoom(caller, pending);
    await this.#assertSeatedInRoom(caller, pending.roomId);
    if (!this.#invitations) throw new LoungeGameToolError("game_invitation_unavailable");
    const target = (await this.#eligibleTargets(residentId, pending.roomId)).find(
      (candidate) => candidate.residentId === pending.targetResidentId,
    );
    if (!target) throw new LoungeGameToolError("game_invitation_not_allowed");
    await this.#invitations.direct({
      requestId: pending.requestId,
      fromResidentId: residentId,
      toResidentId: target.residentId,
      roomId: pending.roomId,
      kind: pending.gameKind,
    });
    return this.#withState("已提交指定邀请。", residentId, caller);
  }

  async #sendChat(
    residentId: string,
    caller: GameCaller,
    text: string,
    replyToMessageId?: string,
  ): Promise<string> {
    if (!this.#gameChat) throw new LoungeGameToolError("game_chat_unavailable");
    const rooms = await this.#seatedRooms(caller);
    if (rooms.length === 0) throw new LoungeGameToolError("game_chat_requires_game");
    if (rooms.length > 1) throw new LoungeGameToolError("game_chat_room_required");

    const room = rooms[0];
    if (!room) throw new LoungeGameToolError("game_chat_requires_game");
    const message = await this.#gameChat.send(caller, room.roomId, {
      clientMessageId: randomUUID(),
      text,
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
    });
    await this.#extra.afterSocial?.(residentId,room.roomId,'chat:'+message.sequence);
    return this.#withState(`已发送，编号 ${message.sequence}。`, residentId, caller);
  }

  async #seatedRooms(caller: GameCaller): Promise<LoungeGamePlayerView[]> {
    const actor = await caller.authenticate();
    const residentId = actor.residentId;
    const tables = this.#readTables();
    const publicRoomIds = new Set(
      tables.flatMap((table) => table.room ? [table.room.room_id] : []),
    );
    const candidates = new Map<string, LoungeTableId>();
    for (const table of tables) {
      if (table.room) candidates.set(table.room.room_id, table.table_id);
    }
    if (typeof residentId === "string") {
      for (const [roomId, reference] of this.#residentRooms.get(residentId) ?? []) {
        if (!publicRoomIds.has(roomId)) candidates.set(roomId, reference.tableId);
      }
    }

    const rooms: LoungeGamePlayerView[] = [];
    for (const [roomId, tableId] of candidates) {
      try {
        const view = await this.#gameService.view(caller, roomId);
        rooms.push(view);
        if (typeof residentId === "string") this.#rememberRoom(residentId, tableId, view);
      } catch (error) {
        if (hasErrorCode(error, "not_seated") || hasErrorCode(error, "room_not_found")) {
          if (typeof residentId === "string") this.#forgetRoom(residentId, roomId);
          continue;
        }
        throw error;
      }
    }
    return rooms;
  }

  async #assertNoOtherRoomSeat(caller: GameCaller, targetRoomId?: string): Promise<void> {
    const rooms = await this.#seatedRooms(caller);
    if (rooms.some((room) => room.roomId !== targetRoomId)) {
      throw new LoungeGameToolError("already_in_game");
    }
  }

  async #assertSeatedInRoom(caller: GameCaller, roomId: string): Promise<void> {
    const rooms = await this.#seatedRooms(caller);
    if (!rooms.some((room) => room.roomId === roomId)) {
      throw new LoungeGameToolError("not_seated");
    }
  }

  async #withState(receipt: string, residentId: string, caller: GameCaller): Promise<string> {
    return `${receipt}\n\n${await this.#readState(residentId, caller)}`;
  }

  async #assertCurrentRoom(
    caller: GameCaller,
    pending: Extract<PendingOption, {
      kind:
        | "rules"
        | "join"
        | "ready"
        | "start"
        | "leave"
        | "leaf-card-toggle"
        | "leaf-submit"
        | "leaf-direct"
        | "command"
        | "reaction"
        | "invite-broadcast"
        | "invite-direct";
    }>,
  ): Promise<void> {
    const table = this.#readTables().find((candidate) => candidate.table_id === pending.tableId);
    const expectedKind =
      pending.kind === "invite-broadcast" || pending.kind === "invite-direct"
        ? pending.gameKind
        : undefined;
    if (
      table?.room &&
      table.room.room_id === pending.roomId &&
      table.room.revision === pending.revision &&
      (expectedKind === undefined || table.room.kind === expectedKind)
    ) {
      return;
    }

    const reference = this.#residentRooms.get(pending.residentId)?.get(pending.roomId);
    if (!reference || reference.tableId !== pending.tableId || reference.revision !== pending.revision) {
      throw new LoungeGameToolError("option_stale");
    }
    const current = await this.#gameService.view(caller, pending.roomId);
    if (
      current.revision !== pending.revision ||
      (expectedKind !== undefined && current.kind !== expectedKind)
    ) {
      throw new LoungeGameToolError("option_stale");
    }
  }
}

export { LoungeGameTool as LoungeGameToolAdapter };

export function createLoungeGameTool(options: LoungeGameToolOptions): LoungeGameTool {
  return new LoungeGameTool(options);
}

function gameKinds(): readonly GameKind[] {
  return ["leaf-game", "doudizhu", "flying-chess", "uno", "monopoly", "mahjong"];
}

function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && gameKinds().includes(value as GameKind);
}

function isPhase(value: unknown): value is GameRoomView["phase"] {
  return value === "waiting" || value === "playing" || value === "finished";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === "string") ?? null;
}

function actionKind(kind: GameKind, move: Record<string, unknown>): string {
  if (kind === "mahjong") return firstString(move.kind, move.action, move.type) ?? "action";
  return firstString(move.action, move.kind, move.type) ?? "action";
}

function actionLabel(action: string, kind?: GameKind): string {
  if (kind === "mahjong" && action === "pass") return "过";
  return ACTION_LABELS[action] ?? "进行游戏动作";
}

function currentPlayerFor(
  kind: GameKind,
  game: Record<string, unknown> | null,
): string | null {
  if (!game) return null;
  if (kind === "mahjong") {
    return firstString(asRecord(game.public)?.turn_player_id);
  }
  if(kind==='monopoly'&&asRecord(game.pending_debt)?.player_id)return firstString(asRecord(game.pending_debt)?.player_id);
  return firstString(game.current_player_id);
}

function privateProjectionLines(
  kind: GameKind,
  game: Record<string, unknown> | null,
  playerId: string,
): string[] {
  if (!game) return [];
  if (kind === "mahjong") {
    const privateState = asRecord(game.private);
    if (!privateState) return [];
    const lines: string[] = [];
    const hand = privateState.hand;
    if (Array.isArray(hand)) lines.push(`你的手牌：${readableCards(hand)}。`);
    if (typeof privateState.shanten === "number") {
      lines.push(`向听数：${privateState.shanten}。`);
    }
    const melds = privateState.own_melds;
    if (Array.isArray(melds) && melds.length > 0) {
      lines.push(`你的副露：${melds.map(meld=>readableCards(Array.isArray(asRecord(meld)?.tiles)?asRecord(meld)!.tiles as unknown[]:[])).join(' / ')}。`);
    }
    return lines;
  }

  const ownPlayer = ownProjectedPlayer(game, playerId);
  if (!ownPlayer) return [];
  const lines: string[] = [];
  if (Array.isArray(ownPlayer.hand)) {
    lines.push(`你的手牌：${readableCards(ownPlayer.hand)}。`);
  }
  if (kind === "flying-chess" && Array.isArray(ownPlayer.pieces)) {
    lines.push(`你的棋子：${ownPlayer.pieces.length} 枚。`);
  }
  return lines;
}

function ownProjectedPlayer(
  game: Record<string, unknown>,
  playerId: string,
): Record<string, unknown> | null {
  if (!Array.isArray(game.players)) return null;
  return game.players
    .map((player) => asRecord(player))
    .find((player) => player?.id === playerId) ?? null;
}

function readableCards(cards: readonly unknown[]): string {
  if (cards.length === 0) return "无";
  return cards.map(readableCard).join("、");
}

function readableCard(card: unknown): string {
  if (typeof card === "string") return "一张牌";
  const value = asRecord(card);
  if (!value) return "一张牌";
  const label = safeText(value.label) ?? safeText(value.name);
  if (label) return label;
  if (value.kind === "wild") return "通配牌";
  if (typeof value.rank === "number") return `数字牌${value.rank}`;
  return "一张牌";
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\r\n\t]+/gu, " ").trim();
  return text.length > 0 ? text : null;
}

function actionDetail(
  kind: GameKind,
  move: Record<string, unknown>,
  game: Record<string, unknown> | null,
  playerId: string,
): string | null {
  const action = actionKind(kind, move);
  if (kind === "uno" && action === "play") {
    const label = safeText(move.label);
    if (label) return label;
  }
  if (kind === "mahjong") {
    const actionId = firstString(move.action_id, move.id);
    if (!actionId) return null;
    const privateState = asRecord(game?.private);
    const hand = Array.isArray(privateState?.hand) ? privateState.hand : [];
    const labels = hand
      .map((card) => {
        const value = asRecord(card);
        const id = firstString(value?.id);
        return id && actionId.includes(id) ? readableCard(card) : null;
      })
      .filter((label): label is string => label !== null);
    return labels.length > 0 ? [...new Set(labels)].join("、") : null;
  }

  const ownHand = ownProjectedPlayer(game ?? {}, playerId)?.hand;
  const handLabels = new Map<string, string>();
  if (Array.isArray(ownHand)) {
    for (const card of ownHand) {
      const value = asRecord(card);
      const id = firstString(value?.id);
      if (id) handLabels.set(id, readableCard(card));
    }
  }
  const cardIds = Array.isArray(move.card_ids)
    ? move.card_ids.filter((value): value is string => typeof value === "string")
    : typeof move.card_id === "string" ? [move.card_id] : [];
  if (cardIds.length > 0) {
    return cardIds.map((id) => handLabels.get(id) ?? "选中的牌").join("、");
  }
  if (kind === "doudizhu" && typeof move.value === "number") {
    return `${move.value} 分`;
  }
  if (kind === "monopoly") {
    return safeText(move.label);
  }
  if (kind === "flying-chess" && typeof move.piece_number === "number") {
    return `第 ${move.piece_number} 架棋子`;
  }
  return null;
}

function legalMovesFor(kind: GameKind, game: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!game) return [];
  if (kind === "mahjong") {
    const privateState = asRecord(game.private);
    const actions = privateState?.legal_actions;
    if (!Array.isArray(actions)) return [];
    return actions
      .map((action) => asRecord(action))
      .filter((action): action is Record<string, unknown> => action !== null);
  }
  const moves = game.legal_moves;
  if (!Array.isArray(moves)) return [];
  return moves
    .map((move) => asRecord(move))
    .filter((move): move is Record<string, unknown> => move !== null);
}

function leafCardAction(actions: readonly string[]): LeafCardAction | null {
  if (actions.includes("lead")) return "lead";
  if (actions.includes("follow")) return "follow";
  return null;
}

function leafCommandViewFromPlayerView(
  view: LoungeGamePlayerView,
  playerId: string,
): LeafCommandView | null {
  return view.kind === "leaf-game"
    ? leafCommandViewFromGame(asRecord(view.game), playerId)
    : null;
}

function leafCommandViewFromGame(
  game: Record<string, unknown> | null,
  playerId: string,
): LeafCommandView | null {
  if (!game) return null;
  const revision = game.revision;
  const viewerId = game.viewer_id;
  const currentPlayerId = game.current_player_id;
  const legalActions = game.legal_actions;
  const rules = asRecord(game.rules);
  const rawPlayers = game.players;
  const maxPlaySize = rules?.max_play_size;
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof viewerId !== "string" ||
    viewerId !== playerId ||
    (currentPlayerId !== null && typeof currentPlayerId !== "string") ||
    !Array.isArray(legalActions) ||
    !legalActions.every((action): action is string => typeof action === "string") ||
    !rules ||
    typeof maxPlaySize !== "number" ||
    !Number.isSafeInteger(maxPlaySize) ||
    maxPlaySize < 1 ||
    !Array.isArray(rawPlayers)
  ) {
    return null;
  }

  const players: Array<{ id: string; hand?: readonly { id: string }[] }> = [];
  const playerIds = new Set<string>();
  for (const rawPlayer of rawPlayers) {
    const player = asRecord(rawPlayer);
    const id = firstString(player?.id);
    if (!id || playerIds.has(id)) return null;
    playerIds.add(id);
    if (!("hand" in (player ?? {}))) {
      players.push({ id });
      continue;
    }
    const rawHand = player?.hand;
    if (!Array.isArray(rawHand)) return null;
    const hand: Array<{ id: string }> = [];
    const handIds = new Set<string>();
    for (const rawCard of rawHand) {
      const card = asRecord(rawCard);
      const cardId = firstString(card?.id);
      if (!cardId || handIds.has(cardId)) return null;
      handIds.add(cardId);
      hand.push({ id: cardId });
    }
    players.push({ id, hand });
  }

  return {
    revision,
    viewer_id: viewerId,
    current_player_id: currentPlayerId,
    legal_actions: legalActions,
    rules: { max_play_size: maxPlaySize },
    players,
  };
}

function leafHandEntries(
  game: Record<string, unknown> | null,
  playerId: string,
): Array<{ id: string; value: unknown }> | null {
  const player = ownProjectedPlayer(game ?? {}, playerId);
  if (!player || !Array.isArray(player.hand)) return null;
  const entries: Array<{ id: string; value: unknown }> = [];
  const seen = new Set<string>();
  for (const value of player.hand) {
    const card = asRecord(value);
    const id = firstString(card?.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    entries.push({ id, value });
  }
  return entries;
}

function leafHandIds(view: LeafCommandView, playerId: string): string[] {
  return [...(view.players.find((player) => player.id === playerId)?.hand ?? [])].map(
    (card) => card.id,
  );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function engineRevisionFor(game: Record<string, unknown> | null): number | null {
  const revision = game?.revision;
  return typeof revision === "number" && Number.isInteger(revision) && revision >= 0
    ? revision
    : null;
}

function commandForLegalMove(
  kind: GameKind,
  move: Record<string, unknown>,
  revision: number | null,
): Record<string, unknown> | null {
  if (revision === null) return null;
  const action = actionKind(kind, move);
  if (kind === "leaf-game") return null;

  if (kind === "mahjong") {
    const actionId = firstString(move.action_id, move.id);
    return actionId
      ? { command_id: randomUUID(), revision, action_id: actionId }
      : null;
  }

  const command: Record<string, unknown> = {
    command_id: randomUUID(),
    expected_revision: revision,
    action,
  };
  const fields = actionFields(kind);
  for (const field of fields) {
    if (field in move) command[field] = move[field];
  }
  return Object.keys(command).length > 3 || action.length > 0 ? command : null;
}

function actionFields(kind: GameKind): readonly string[] {
  switch (kind) {
    case "doudizhu":
      return ["card_ids", "as", "amount", "value"];
    case "flying-chess":
      return ["piece_id", "piece_number", "steps"];
    case "uno":
      return ["card_id", "color"];
    case "monopoly":
      return ["cell_idx", "amount", "card_id"];
    case "leaf-game":
      return ["card_ids", "declared_rank"];
    case "mahjong":
      return [];
  }
}

function displayName(target: LoungeGameInvitationTarget): string {
  const name = target.displayName?.replace(/[\r\n\t]+/gu, " ").trim();
  return name && name.length > 0 ? loungeDisplayName(name) : "指定玩家";
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === code || error.message.includes(code);
}
