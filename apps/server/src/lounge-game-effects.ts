import { extractGameOutcome } from './games/game-outcome.js';
import type { GameOutcome } from './games/game-stakes.js';
import type { GameRoom } from './games/types.js';

export function residentRoundResults(outcome: GameOutcome, seats: GameRoom['seats']) {
  return seats.filter(seat => seat.controllerType === 'resident' && seat.residentId && outcome.playerIds.includes(seat.playerId)).map(seat => {
    const draw = outcome.type === 'mahjong' && outcome.result === 'draw';
    const won = !draw && ('winnerId' in outcome) && (outcome.type === 'doudizhu'
      ? (seat.playerId === outcome.landlordId) === (outcome.winnerId === outcome.landlordId)
      : seat.playerId === outcome.winnerId);
    return { residentId: seat.residentId!, result: draw ? 'draw' : won ? 'win' : 'sad' };
  });
}

/** Only committed public results cross into the lounge, never engine snapshots. */
export function publishLoungeGameEffects(room: GameRoom, createdAt: number, publish: (event: {
  residentId: string; activityId: string; createdAt: number; data: { result: string };
}) => void) {
  const extracted = extractGameOutcome(room.kind, room.snapshot);
  if (!extracted || !room.settlement || room.settlement.settlementId !== room.lastSettlementId ||
    room.lastSettlementId !== `${room.kind}:${room.roomId}:${extracted.settlementId}`) return;
  for (const result of residentRoundResults(extracted.outcome, room.seats)) {
    publish({ residentId: result.residentId, activityId: `game-result:${room.lastSettlementId}:${result.residentId}`, createdAt, data: { result: result.result } });
  }
}
