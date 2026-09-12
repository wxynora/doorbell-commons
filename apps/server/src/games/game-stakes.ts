import { GAME_KINDS, type GameKind } from "./types.js";

export type StakeGameKind = GameKind;

export interface GameStakeInput {
  kind: StakeGameKind;
  baseStake: number;
}

export interface SingleWinnerOutcome {
  type: "single_winner";
  playerIds: readonly string[];
  winnerId: string;
}

export interface DoudizhuOutcome {
  type: "doudizhu";
  playerIds: readonly string[];
  landlordId: string;
  winnerId: string;
  bid: number;
  bombs: number;
  spring: boolean;
}

export interface MahjongDrawOutcome {
  type: "mahjong";
  playerIds: readonly string[];
  result: "draw";
}

export interface MahjongWinOutcome {
  type: "mahjong";
  playerIds: readonly string[];
  result: "self_draw" | "discard" | "robbed_kong";
  winnerId: string;
  sourceId?: string;
  fan: number;
}

export type GameOutcome = SingleWinnerOutcome | DoudizhuOutcome | MahjongDrawOutcome | MahjongWinOutcome;

export interface SeatStakeDelta {
  playerId: string;
  delta: number;
}

export interface ResidentStakeDelta {
  residentId: string;
  delta: number;
}

/** The resolver is supplied by a trusted identity/account boundary. */
export type TrustedResidentIdLookup = (playerId: string) => string;

export class GameStakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameStakeError";
  }
}

const STAKE_OPTIONS: Record<GameKind, readonly number[]> = {
  "leaf-game": [20, 50, 100],
  doudizhu: [5, 10, 20],
  "flying-chess": [20, 50, 100],
  uno: [20, 50, 100],
  monopoly: [20, 50, 100],
  mahjong: [5, 10, 20],
};

const STAKE_DEFAULTS: Record<GameKind, number> = {
  "leaf-game": 50,
  doudizhu: 10,
  "flying-chess": 50,
  uno: 50,
  monopoly: 50,
  mahjong: 10,
};

export function getStakeOptions(kind: GameKind): readonly number[] {
  return [...STAKE_OPTIONS[kind]];
}

export function getDefaultStake(kind: GameKind): number {
  return STAKE_DEFAULTS[kind];
}

function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && (GAME_KINDS as readonly string[]).includes(value);
}

function recordOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GameStakeError("game stake value must be an object");
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GameStakeError(`${field} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new GameStakeError(`${field} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function signedInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new GameStakeError(`${field} must be an integer`);
  return value as number;
}

function playerIds(value: unknown, expectedCount: number, field = "playerIds"): string[] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new GameStakeError(`${field} must contain exactly ${expectedCount} players`);
  }
  const ids = value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) {
    throw new GameStakeError(`${field} must not contain duplicate players`);
  }
  return ids;
}

function playerIdsRange(value: unknown, minimum: number, maximum: number, field = "playerIds"): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new GameStakeError(`${field} must contain ${minimum} to ${maximum} players`);
  }
  const ids = value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) {
    throw new GameStakeError(`${field} must not contain duplicate players`);
  }
  return ids;
}

function includesPlayer(ids: readonly string[], playerId: string, field: string): void {
  if (!ids.includes(playerId)) throw new GameStakeError(`${field} must be seated in the outcome`);
}

function validateStake(input: unknown): GameStakeInput {
  const value = recordOf(input);
  if (!isGameKind(value.kind)) throw new GameStakeError("stake kind is invalid");
  const baseStake = integer(value.baseStake, "baseStake", 1);
  if (!STAKE_OPTIONS[value.kind].includes(baseStake)) {
    throw new GameStakeError(`baseStake is not available for ${value.kind}`);
  }
  return { kind: value.kind, baseStake };
}

export function validateStakeInput(input: unknown): GameStakeInput {
  return validateStake(input);
}

function outcomePlayers(kind: GameKind, outcome: Record<string, unknown>): string[] {
  if (kind === "leaf-game") return playerIds(outcome.playerIds, 4);
  if (kind === "doudizhu") return playerIds(outcome.playerIds, 3);
  if (kind === "mahjong") return playerIds(outcome.playerIds, 4);
  return playerIdsRange(outcome.playerIds, 2, 4);
}

function singleWinnerDeltas(stake: number, ids: readonly string[], winnerId: string): SeatStakeDelta[] {
  includesPlayer(ids, winnerId, "winnerId");
  return ids.map((playerId) => ({ playerId, delta: playerId === winnerId ? stake * (ids.length - 1) : -stake }));
}

function doudizhuMultiplier(bid: number, bombs: number, spring: boolean): number {
  // The cap makes the calculation bounded even if malformed input carries a
  // very large, but still safe, bomb count.
  const boundedBombs = Math.min(bombs, 6);
  return Math.min(24, bid * (spring ? 2 : 1) * 2 ** boundedBombs);
}

function doudizhuDeltas(stake: number, outcome: Record<string, unknown>, ids: readonly string[]): SeatStakeDelta[] {
  const landlordId = nonEmptyString(outcome.landlordId, "landlordId");
  const winnerId = nonEmptyString(outcome.winnerId, "winnerId");
  includesPlayer(ids, landlordId, "landlordId");
  includesPlayer(ids, winnerId, "winnerId");
  const bid = integer(outcome.bid, "bid", 1);
  if (bid > 3) throw new GameStakeError("bid must be between 1 and 3");
  const bombs = integer(outcome.bombs, "bombs");
  if (typeof outcome.spring !== "boolean") throw new GameStakeError("spring must be boolean");
  const unit = stake * doudizhuMultiplier(bid, bombs, outcome.spring);
  const landlordDelta = winnerId === landlordId ? unit * 2 : -unit * 2;
  const farmerDelta = winnerId === landlordId ? -unit : unit;
  return ids.map((playerId) => {
    return { playerId, delta: playerId === landlordId ? landlordDelta : farmerDelta };
  });
}

function mahjongMultiplier(fan: number): number {
  if (fan >= 64) return 8;
  if (fan >= 32) return 4;
  if (fan >= 16) return 2;
  return 1;
}

function mahjongDeltas(stake: number, outcome: Record<string, unknown>, ids: readonly string[]): SeatStakeDelta[] {
  const result = outcome.result;
  if (result === "draw") return ids.map((playerId) => ({ playerId, delta: 0 }));
  if (result !== "self_draw" && result !== "discard" && result !== "robbed_kong") {
    throw new GameStakeError("mahjong result is invalid");
  }
  const winnerId = nonEmptyString(outcome.winnerId, "winnerId");
  includesPlayer(ids, winnerId, "winnerId");
  const fan = integer(outcome.fan, "fan", 8);
  const unit = stake * mahjongMultiplier(fan);
  if (result === "self_draw") {
    return ids.map((playerId) => ({ playerId, delta: playerId === winnerId ? unit * 3 : -unit }));
  }
  const sourceId = nonEmptyString(outcome.sourceId, "sourceId");
  includesPlayer(ids, sourceId, "sourceId");
  if (sourceId === winnerId) throw new GameStakeError("sourceId must differ from winnerId");
  return ids.map((playerId) => ({
    playerId,
    delta: playerId === winnerId ? unit * 3 : playerId === sourceId ? -unit * 3 : 0,
  }));
}

function assertConservation(deltas: readonly SeatStakeDelta[]): void {
  const total = deltas.reduce((sum, item) => sum + item.delta, 0);
  if (!Number.isSafeInteger(total) || total !== 0) {
    throw new GameStakeError("seat stake deltas must conserve exactly");
  }
}

export function settleSeatDeltas(stakeInput: GameStakeInput, rawOutcome: GameOutcome): readonly SeatStakeDelta[] {
  const stake = validateStake(stakeInput);
  const outcome = recordOf(rawOutcome);
  const ids = outcomePlayers(stake.kind, outcome);
  let deltas: SeatStakeDelta[];

  if (stake.kind === "doudizhu") {
    if (outcome.type !== "doudizhu") throw new GameStakeError("doudizhu requires a doudizhu outcome");
    deltas = doudizhuDeltas(stake.baseStake, outcome, ids);
  } else if (stake.kind === "mahjong") {
    if (outcome.type !== "mahjong") throw new GameStakeError("mahjong requires a mahjong outcome");
    deltas = mahjongDeltas(stake.baseStake, outcome, ids);
  } else {
    if (outcome.type !== "single_winner") throw new GameStakeError(`${stake.kind} requires a single-winner outcome`);
    deltas = singleWinnerDeltas(stake.baseStake, ids, nonEmptyString(outcome.winnerId, "winnerId"));
  }
  assertConservation(deltas);
  return deltas;
}

export function aggregateResidentDeltas(
  seatDeltas: readonly SeatStakeDelta[],
  resolveResidentId: TrustedResidentIdLookup,
): readonly ResidentStakeDelta[] {
  if (!Array.isArray(seatDeltas) || typeof resolveResidentId !== "function") {
    throw new GameStakeError("seat deltas and resident resolver are required");
  }
  const seenPlayers = new Set<string>();
  const accounts = new Map<string, number>();
  let total = 0;
  for (const rawDelta of seatDeltas) {
    const delta = recordOf(rawDelta);
    const playerId = nonEmptyString(delta.playerId, "playerId");
    if (seenPlayers.has(playerId)) throw new GameStakeError("seat deltas contain duplicate players");
    seenPlayers.add(playerId);
    const amount = signedInteger(delta.delta, "delta");
    const residentId = nonEmptyString(resolveResidentId(playerId), "residentId");
    const next = (accounts.get(residentId) ?? 0) + amount;
    if (!Number.isSafeInteger(next)) throw new GameStakeError("resident stake delta is outside safe integer range");
    accounts.set(residentId, next);
    total += amount;
    if (!Number.isSafeInteger(total)) throw new GameStakeError("stake total is outside safe integer range");
  }
  if (total !== 0) throw new GameStakeError("seat stake deltas must conserve exactly");
  return [...accounts].filter(([, delta]) => delta !== 0).map(([residentId, delta]) => ({ residentId, delta }));
}
