/** Internal game boundary; not a browser or model-facing protocol. */
export const GAME_KINDS = ["leaf-game", "doudizhu", "flying-chess", "uno", "monopoly", "mahjong"] as const;
export type GameKind = typeof GAME_KINDS[number];
export type GameActor = Readonly<{
  playerId: string;
  controllerType: "human" | "resident";
  /** Authenticated resident account; absent on legacy unbound seats. */
  residentId?: string | null;
}>;
export interface GameSeat extends GameActor { ready: boolean }
export interface GameRoom {
  deadline?: import('./game-timeout.js').GameDeadline | null;
  roomId: string;
  kind: GameKind;
  revision: number;
  phase: "waiting" | "playing" | "finished";
  seats: GameSeat[];
  /** Null/absent in pre-v13 rooms means that no host was recorded. */
  host?: GameActor | null;
  /** Null/absent in pre-v13 rooms means that no stake was configured. */
  baseStake?: number | null;
  /** Null/absent before settlement-marker migration means no round is recorded. */
  lastSettlementId?: string | null;
  /** Complete engine state including hidden information. Never return to clients. */
  snapshot: unknown | null;
}
export interface GameRoomStore {
  create(room: GameRoom): void;
  createAtTable?(room: GameRoom, tableId: "square" | "round"): void;
  read(roomId: string): GameRoom | null;
  replace(room: GameRoom, expectedRevision: number): void;
}
export interface GameRoomView {
  roomId: string;
  kind: GameKind;
  revision: number;
  phase: GameRoom["phase"];
  seats: GameSeat[];
  host: GameActor | null;
  baseStake: number | null;
  game: unknown | null;
}
/** Internal committed-state signal, not a public broadcast of the snapshot. */
export type GamePatch = Array<{path: Array<string | number>; value?: unknown; remove?: boolean}>;
/** Trusted internal change set. The private map must never cross an HTTP boundary. */
export interface GameChanges { public: GamePatch; private: Record<string, GamePatch> }
export interface GameAppliedUpdate { snapshot: unknown; actorView: unknown; changes: GameChanges }
export interface GameCommitPublisher { publish(room: GameRoom, changes?: GameChanges): void }
export interface GameEngineAdapter {
  create(kind: GameKind, roomId: string, actors: readonly GameActor[]): Promise<unknown>;
  apply(kind: GameKind, snapshot: unknown, actorId: string, command: Record<string, unknown>): Promise<unknown>;
  applyUpdate?(kind: GameKind, snapshot: unknown, actorId: string, command: Record<string, unknown>): Promise<GameAppliedUpdate>;
  project(kind: GameKind, snapshot: unknown, viewerId: string): Promise<unknown>;
  isFinished(kind: GameKind, snapshot: unknown): boolean;
  settleDue?(kind: GameKind, snapshot: unknown): Promise<unknown | null>;
}
export class GameAccessError extends Error {}
export class GameStateError extends Error {}
