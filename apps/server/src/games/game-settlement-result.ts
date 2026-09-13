import type { GameRoom } from './types.js';
import { extractGameOutcome } from './game-outcome.js';
import type { GameEconomyPort } from './game-economy.js';
export type GameSettlementReceipt = Awaited<ReturnType<GameEconomyPort['settle']>>;
export interface GameSettlementView { settlementId: string; accounts: { playerIds: string[]; actualDelta: number }[] }
export function settlementView(room: GameRoom): GameSettlementView | null {
  const receipt = room.settlement;
  if (!receipt || receipt.settlementId !== room.lastSettlementId) return null;
  const outcome = extractGameOutcome(room.kind, room.snapshot);
  if (!outcome || `${room.kind}:${room.roomId}:${outcome.settlementId}` !== receipt.settlementId) return null;
  return { settlementId: receipt.settlementId, accounts: receipt.accounts.map(account => ({
    playerIds: room.seats.filter(seat => seat.residentId === account.residentId).map(seat => seat.playerId),
    actualDelta: account.actualDelta,
  })) };
}
export function ownSettlementText(result: GameSettlementView | null | undefined, playerId: string): string | null {
  const account = result?.accounts.find(account => account.playerIds.includes(playerId));
  if (!account) return null;
  return account.actualDelta > 0 ? `你本局赢得 ${account.actualDelta} 银币。`
    : account.actualDelta < 0 ? `你本局扣除 ${-account.actualDelta} 银币。` : '你本局银币无变化。';
}
