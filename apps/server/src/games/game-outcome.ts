import type { GameOutcome } from "./game-stakes.js";
import type { GameKind } from "./types.js";

/**
 * A terminal outcome read from the complete, server-owned engine snapshot.
 *
 * `settlementId` is only an idempotency key candidate for a later settlement
 * ledger.  This module does not write balances or claim that the key alone
 * provides idempotency.
 */
export interface ExtractedGameOutcome {
  settlementId: string;
  gameId: string;
  roundNumber: number | null;
  outcome: GameOutcome;
}

type SnapshotRecord = Record<string, unknown>;

function recordOf(value: unknown): SnapshotRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as SnapshotRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function positiveInteger(value: unknown): number | null {
  const number = nonNegativeInteger(value);
  return number !== null && number > 0 ? number : null;
}

function playerIdsFromPlayers(raw: SnapshotRecord): string[] | null {
  if (!Array.isArray(raw.players)) return null;
  const ids: string[] = [];
  for (const item of raw.players) {
    const player = recordOf(item);
    const id = player ? nonEmptyString(player.id) : null;
    if (id === null || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function participantIds(raw: SnapshotRecord): string[] | null {
  if (!Array.isArray(raw.participants)) return null;
  const ids: string[] = [];
  for (const item of raw.participants) {
    const participant = recordOf(item);
    const id = participant ? nonEmptyString(participant.player_id) : null;
    if (id === null || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function gameIdOf(raw: SnapshotRecord): string | null {
  return nonEmptyString(raw.game_id);
}

function roundNumberOf(raw: SnapshotRecord): number | null {
  return positiveInteger(raw.round);
}

function settlementId(gameId: string, roundNumber: number | null): string {
  return roundNumber === null ? gameId : `${gameId}:round:${roundNumber}`;
}

function wrap(
  gameId: string,
  roundNumber: number | null,
  outcome: GameOutcome,
): ExtractedGameOutcome {
  return {
    settlementId: settlementId(gameId, roundNumber),
    gameId,
    roundNumber,
    outcome,
  };
}

function singleWinner(
  raw: SnapshotRecord,
  phase: string,
  roundScoped: boolean,
): ExtractedGameOutcome | null {
  if (raw.phase !== phase) return null;
  const gameId = gameIdOf(raw);
  const playerIds = playerIdsFromPlayers(raw);
  const winnerId = nonEmptyString(raw.winner_id);
  if (gameId === null || playerIds === null || winnerId === null || !playerIds.includes(winnerId)) {
    return null;
  }
  const roundNumber = roundScoped ? roundNumberOf(raw) : null;
  if (roundScoped && roundNumber === null) return null;
  return wrap(gameId, roundNumber, { type: "single_winner", playerIds, winnerId });
}

function doudizhuOutcome(raw: SnapshotRecord): ExtractedGameOutcome | null {
  if (raw.phase !== "round_over" && raw.phase !== "game_over") return null;
  const gameId = gameIdOf(raw);
  const playerIds = playerIdsFromPlayers(raw);
  const roundNumber = roundNumberOf(raw);
  const landlordId = nonEmptyString(raw.landlord_id);
  if (gameId === null || playerIds === null || roundNumber === null || landlordId === null) return null;
  if (!playerIds.includes(landlordId)) return null;

  const bid = nonNegativeInteger(raw.base);
  const bombs = nonNegativeInteger(raw.bombs);
  if (bid === null || bid < 1 || bombs === null) return null;

  const winnerSide = nonEmptyString(raw.round_winner);
  let winnerId: string | null = null;
  if (winnerSide === "landlord") {
    winnerId = landlordId;
  } else if (winnerSide === "farmer") {
    const firstFarmer = playerIds.find((id) => id !== landlordId);
    if (firstFarmer === undefined) return null;
    winnerId = firstFarmer;
  }
  if (winnerId === null || !playerIds.includes(winnerId)) return null;

  const spring = (
    raw.spring === true ||
    raw.anti_spring === true
  );
  return wrap(gameId, roundNumber, {
    type: "doudizhu",
    playerIds,
    landlordId,
    winnerId,
    bid,
    bombs,
    spring,
  });
}

function unoOutcome(raw: SnapshotRecord): ExtractedGameOutcome | null {
  if (raw.phase !== "round_over") return null;
  const gameId = gameIdOf(raw);
  const playerIds = playerIdsFromPlayers(raw);
  const result = recordOf(raw.last_results);
  if (result === null) return null;
  const roundNumber = positiveInteger(result.round);
  const snapshotRound = positiveInteger(raw.round);
  const winnerId = nonEmptyString(result.winner_id);
  if (
    gameId === null ||
    playerIds === null ||
    roundNumber === null ||
    snapshotRound === null ||
    roundNumber !== snapshotRound ||
    winnerId === null ||
    !playerIds.includes(winnerId)
  ) {
    return null;
  }
  return wrap(gameId, roundNumber, { type: "single_winner", playerIds, winnerId });
}

function mahjongOutcome(raw: SnapshotRecord): ExtractedGameOutcome | null {
  const state = recordOf(raw.state);
  if (state?.phase !== "finished") return null;
  const gameId = gameIdOf(raw);
  const playerIds = participantIds(raw);
  const result = recordOf(state.game_result);
  if (gameId === null || playerIds === null || result === null) return null;
  const flow = recordOf(state.flow);
  const roundNumber = positiveInteger(flow?.round_number);
  if (roundNumber === null) return null;

  if (result.draw === true) {
    return wrap(gameId, roundNumber, { type: "mahjong", playerIds, result: "draw" });
  }
  if (result.draw !== false) return null;
  const winnerId = nonEmptyString(result.winner_player_id);
  const fan = nonNegativeInteger(result.total_fan);
  const winType = result.win_type;
  if (winnerId === null || fan === null || !playerIds.includes(winnerId)) return null;
  if (winType === "self_draw") {
    return wrap(gameId, roundNumber, {
      type: "mahjong",
      playerIds,
      result: "self_draw",
      winnerId,
      fan,
    });
  }
  if (winType !== "discard" && winType !== "rob_kong") return null;
  const sourceId = nonEmptyString(result.source_player_id);
  if (sourceId === null || sourceId === winnerId || !playerIds.includes(sourceId)) return null;
  return wrap(gameId, roundNumber, {
    type: "mahjong",
    playerIds,
    result: winType === "rob_kong" ? "robbed_kong" : "discard",
    winnerId,
    sourceId,
    fan,
  });
}

/**
 * Extract one settlement input from a complete authoritative snapshot.
 * The caller must obtain `snapshot` from server-owned room storage; this
 * function performs no caller authentication or browser-proofing. Non-
 * terminal or incomplete snapshots return null.
 */
export function extractGameOutcome(
  kind: GameKind,
  snapshot: unknown,
): ExtractedGameOutcome | null {
  const raw = recordOf(snapshot);
  if (raw === null) return null;
  switch (kind) {
    case "leaf-game":
      return singleWinner(raw, "finished", false);
    case "doudizhu":
      return doudizhuOutcome(raw);
    case "flying-chess":
      return singleWinner(raw, "round_over", true);
    case "uno":
      return unoOutcome(raw);
    case "monopoly":
      return singleWinner(raw, "game_over", false);
    case "mahjong":
      return mahjongOutcome(raw);
  }
}
