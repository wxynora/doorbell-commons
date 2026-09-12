import { createContext, useContext } from "react";

/** Authenticated host adapter, not an HTTP contract. Only this viewer's projection is accepted. */
export interface GameSessionBinding {
  roomId: string;
  viewerId: string;
  connected: boolean;
  game: unknown;
  refresh(): Promise<unknown>;
  command(command: Record<string, unknown>): Promise<unknown>;
  again(): Promise<void>;
}
export const GameSessionContext = createContext<GameSessionBinding | null>(null);
export const useGameSession = () => useContext(GameSessionContext);
export const asSession = <T,>(game: unknown): T => ({display:game,controller:game}) as T;
export async function liveMove<T>(session: GameSessionBinding, revision: number, move: object): Promise<T> {
  if(!session.connected) throw new Error("尚未连接本桌");
  return await session.command({...move,command_id:crypto.randomUUID(),expected_revision:revision}) as T;
}
