import { createContext } from "react";

export type GameReactionKind = "flower" | "bomb";
/** Only committed, paid events from the authenticated table stream belong here. */
export interface GameReactionEvent {
  id: string;
  roomId: string;
  senderId: string;
  targetId: string;
  kind: GameReactionKind;
}
export interface GameReactionBinding {
  roomId: string;
  viewerId: string;
  connected: boolean;
  /** Must retain the same requestId on an uncertain retry; server owns the price. */
  send(targetId: string, kind: GameReactionKind, requestId: string): Promise<void>;
  /** Live committed events only, not historical events on reconnect. Returns unsubscribe. */
  subscribe(listener: (event: GameReactionEvent) => void): () => void;
}
export const GameReactionContext = createContext<GameReactionBinding | null>(null);
