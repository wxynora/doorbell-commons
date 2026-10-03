import type Database from "better-sqlite3";
import { extractGameOutcome } from "./game-outcome.js";
import type { GameOutcome } from "./game-stakes.js";
import type { GameRoom, GameSeat } from "./types.js";

function lost(outcome: GameOutcome, playerId: string): boolean {
  if (outcome.type === "doudizhu") {
    const landlordWon = outcome.winnerId === outcome.landlordId;
    return (playerId === outcome.landlordId) !== landlordWon;
  }
  if (outcome.type === "mahjong") {
    if (outcome.result === "draw") return false;
    if (outcome.result !== "self_draw") return playerId === outcome.sourceId;
  }
  return playerId !== outcome.winnerId;
}

/** Shared connection, called only inside the successful room CAS transaction. */
export class AnnualGameStatisticsStore {
  constructor(private readonly database: Database.Database) {}

  recordSettlement(room: GameRoom, previousMarker: string | null, at: number): void {
    if (!room.lastSettlementId || room.lastSettlementId === previousMarker) return;
    const extracted = extractGameOutcome(room.kind, room.snapshot);
    // Forfeit penalties without a completed engine round are not played rounds.
    if (!extracted) return;
    const marker = `${room.kind}:${room.roomId}:${extracted.settlementId}`;
    if (room.lastSettlementId !== marker || room.settlement?.settlementId !== marker) return;
    const seats = extracted.outcome.playerIds.map(id => {
      const seat = room.seats.find(seat => seat.playerId === id);
      if (!seat) throw new Error("Missing settled game participant");
      return seat;
    });
    const year = new Date(at + 8 * 60 * 60 * 1000).getUTCFullYear();
    const write = this.database.prepare(`INSERT INTO annual_game_statistics
      (year,player_id,controller_type,resident_id,game_kind,scope,companion_id,
       companion_controller_type,companion_resident_id,games,losses,first_at,last_at)
      VALUES (@year,@playerId,@controllerType,@residentId,@kind,@scope,@companionId,
              @companionControllerType,@companionResidentId,1,@loss,@at,@at)
      ON CONFLICT(year,player_id,controller_type,game_kind,scope,companion_id,companion_controller_type)
      DO UPDATE SET games=games+1,losses=losses+excluded.losses,
        first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at)`);
    for (const seat of seats) {
      const add = (companion?: GameSeat) => write.run({year, playerId: seat.playerId,
        controllerType: seat.controllerType, residentId: seat.residentId ?? null, kind: room.kind,
        scope: companion ? "companion" : "total", companionId: companion?.playerId ?? "",
        companionControllerType: companion?.controllerType ?? "",
        companionResidentId: companion?.residentId ?? null,
        loss: Number(lost(extracted.outcome,seat.playerId)), at});
      add();
      for (const companion of seats) if (companion !== seat) add(companion);
    }
  }

  read(year: number, playerId: string, controllerType: GameSeat["controllerType"]) {
    return this.database.prepare(`SELECT * FROM annual_game_statistics
      WHERE year=? AND player_id=? AND controller_type=?
      ORDER BY game_kind,scope,companion_id,companion_controller_type`).all(year,playerId,controllerType);
  }
}
