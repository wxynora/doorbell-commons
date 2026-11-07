import { z } from "zod";

const timestampSchema = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const teamSchema = z.object({
  id: z.string(), name: z.string(), captainId: z.string().nullable(),
  members: z.array(z.object({ id: z.string(), name: z.string(), npc:z.literal(true).optional() })),
  status: z.enum(["forming", "registered", "withdrawn"]), drawOrder: z.number().int().nullable(),
});
const matchSchema = z.object({
  id: z.string(), stage: z.enum(["round_robin", "semifinal", "final"]), round: z.number().int(),
  teamAId: z.string().nullable(), teamBId: z.string().nullable(),
  attackerTeamId: z.string().nullable(), defenderTeamId: z.string().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "forfeit", "cancelled"]),
  scheduledAt: timestampSchema.nullable(), score: z.tuple([z.number().int(), z.number().int()]).nullable(),
  winnerTeamId: z.string().nullable(),
  replays:z.array(z.object({gameIndex:z.number().int().min(1).max(3),voidedBattleId:z.string(),replayBattleId:z.string(),
    randomSeed:z.number().int().positive(),reason:z.literal("invalid_save"),at:timestampSchema})).optional(),
  roundResults: z.array(z.object({
    index: z.number().int().positive(), attackerTeamId: z.string(), defenderTeamId: z.string(),
    winnerTeamId: z.string(), coreHp: z.number(), endTick: z.number().int(),
    endReason: z.enum(["core_broken", "time_limit", "surrender"]),
  })).default([]),
});
export const snowTournamentResponseSchema = z.object({
  edition: z.object({
    id: z.string(), title: z.string(),
    phase: z.enum(["registration", "team_formation", "round_robin", "knockout", "completed", "cancelled"]),
    registrationOpenAt: timestampSchema, registrationCloseAt: timestampSchema, rulesVersion: z.string(),
    teamFormationCloseAt:timestampSchema.optional(),
    enrolledCount:z.number().int().nonnegative().optional(),teamLimit:z.number().int().nonnegative().optional(),
    calendar: z.object({
      roundRobinAt: z.array(timestampSchema), semifinalAt: timestampSchema, finalAt: timestampSchema,
    }).optional(),
    teams: z.array(teamSchema), matches: z.array(matchSchema),
    standings: z.array(z.object({
      teamId: z.string(), rank: z.number().int(), points: z.number().int(),
      wins: z.number().int(), losses: z.number().int(), gameDifference: z.number().int(),
      averageCoreDamage: z.number().nullable(), averageBreakTimeRemaining: z.number().nullable(),
    })),
    bracket: z.object({ semifinalMatchIds: z.array(z.string()), finalMatchId: z.string().nullable(), championTeamId: z.string().nullable() }),
    rewards: z.array(z.object({ teamId: z.string(), kind: z.enum(["match", "attendance", "champion"]), status: z.enum(["pending", "confirmed", "ineligible"]) })),
  }).nullable(),
});
export type SnowTournamentResponse = z.infer<typeof snowTournamentResponseSchema>;
export type SnowTournamentEdition = NonNullable<SnowTournamentResponse["edition"]>;

// Human pixel stream is separate from the original strict v1 spectator envelope.
const pixelRole = z.enum(["attack", "defend"]);
const pixelPoint = z.object({
  id: z.string(), type: z.string(), role: pixelRole,
  lane: z.number().int().min(1).max(3), position: z.number().min(1).max(13),
}).strict();
export const snowPixelEventSchema = z.object({
  id: z.string(), tick: z.number().int().nonnegative(),
  kind: z.enum(["attack", "heal", "death", "breakthrough"]),
  source: pixelPoint, targets: z.array(pixelPoint),
}).strict();
const snowPixelUnitSchema = z.object({
    id: z.string(), type: z.string(), name: z.string(), role: pixelRole, ground: z.boolean(),
    lane: z.number().int().min(1).max(3), position: z.number().int().min(1).max(12),
    hp: z.number().nonnegative(), maxHp: z.number().positive(), shield: z.number().nonnegative(),
    blockedBy: z.string().nullable(), blocking: z.array(z.string()),
    motion: z.object({ moving: z.boolean(), secondsPerCell: z.number().positive().nullable(), speedMultiplier: z.number().positive() }).strict(),
}).strict();
export const snowPixelBattleSchema = z.object({
  id: z.string(), tick: z.number().int().nonnegative(), started: z.boolean(),
  status: z.enum(["running", "attack_win", "defend_win"]),
  coreHp: z.number().nonnegative(), coreMaxHp: z.number().positive(),
  groundSlots: z.array(z.number().int()), highSlots: z.array(z.number().int()),
  units: z.array(snowPixelUnitSchema),
  effects: z.array(z.object({ id: z.string(), kind: z.string(), role: pixelRole,
    lane: z.number().int().min(1).max(3), untilTick: z.number().int().nonnegative() }).strict()),
  events: z.array(snowPixelEventSchema),
}).strict();
export type SnowPixelBattle = z.infer<typeof snowPixelBattleSchema>;
export type SnowPixelEvent = z.infer<typeof snowPixelEventSchema>;

// Connection-local sequence numbers, not a persisted snapshot/replay log.
const sequence = z.number().int().positive();
const replicaUnitSchema=z.object({
  id:z.string(),side:pixelRole,typeKey:z.string(),lane:z.number().int().min(1).max(3),pos:z.number().int().min(1).max(12),ground:z.boolean(),
  hp:z.number().nonnegative(),maxHp:z.number().positive(),armor:z.number(),spellResist:z.number(),
  attackInterval:z.number().positive(),attack:z.number(),damageType:z.enum(["physical","spell"]).nullable(),heal:z.number(),healRadius:z.number(),range:z.number(),splash:z.number(),
  attackTimer:z.number(),alive:z.literal(true),blocking:z.array(z.string()).optional(),blockedBy:z.string().nullable().optional(),blockCapacity:z.number().optional(),
  moveSeconds:z.number().positive().optional(),moveProgress:z.number().optional(),breakthrough:z.number().optional(),stealth:z.boolean().optional(),
  sprintUntilTick:z.number().optional(),sprintMult:z.number().nullable().optional(),fireFocusUntilTick:z.number().optional(),silencedUntilTick:z.number().optional(),
  decayStartTick:z.number().optional(),systemWave:z.boolean().optional(),shield:z.object({amount:z.number(),untilTick:z.number()}).strict().nullable().optional(),
}).strict();
export const snowReplicaBattleSchema=z.object({id:z.string(),rulesVersion:z.string(),tick:z.number().int().min(0).max(600),started:z.boolean(),
  status:z.enum(["running","attack_win","defend_win"]),endReason:z.string().nullable(),coreHp:z.number().nonnegative(),untilNextTick:z.number().nullable(),
  units:z.array(replicaUnitSchema),effects:z.array(z.object({id:z.union([z.string(),z.number()]),kind:z.string(),side:pixelRole,lane:z.number(),value:z.number().optional(),untilTick:z.number()}).strict()),
  visual:z.array(snowPixelEventSchema),
}).strict();
export type SnowReplicaBattle=z.infer<typeof snowReplicaBattleSchema>;
export type SnowReplicaUnit=z.infer<typeof replicaUnitSchema>;
export const snowBattleStreamSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("snapshot"),revision:sequence,battle:snowReplicaBattleSchema.nullable()}).strict(),
  z.object({kind:z.literal("patch"),base:sequence,revision:sequence,id:z.string(),tick:z.number().int().min(0).max(600),
    changes:snowReplicaBattleSchema.omit({id:true,tick:true,units:true}).partial(),
    units:z.object({add:z.array(replicaUnitSchema),remove:z.array(z.string()),
      update:z.array(z.object({id:z.string(),changes:replicaUnitSchema.omit({id:true}).partial()}).strict())}).strict(),
  }).strict(),
]);
export const snowEditionStreamSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("snapshot"),revision:sequence,data:snowTournamentResponseSchema}).strict(),
  z.object({kind:z.literal("patch"),base:sequence,revision:sequence,id:z.string(),
    changes:snowTournamentResponseSchema.shape.edition.unwrap().omit({id:true,teams:true,matches:true}).partial(),
    teams:z.object({put:z.array(teamSchema),remove:z.array(z.string())}).strict(),
    matches:z.object({put:z.array(matchSchema),remove:z.array(z.string())}).strict(),
  }).strict(),
]);
export type SnowBattleStream = z.infer<typeof snowBattleStreamSchema>;
export type SnowEditionStream = z.infer<typeof snowEditionStreamSchema>;
