import { z } from "zod";

const count = z.number().int().nonnegative();
const side = z.enum(["A", "B"]);
const person = z.object({ name: z.string(), npc: z.boolean() }).strict();
const unit = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    role: z.enum(["attack", "defend"]),
    ground: z.boolean(),
    lane: z.number().int().min(1).max(3),
    position: z.number().int().min(1).max(12),
    hp: count,
    maxHp: count,
    shield: count,
    blockedBy: z.string().nullable(),
    blocking: z.array(z.string()),
  })
  .strict();
const round = z
  .object({ index: count, attack: person, defend: person, winner: side.nullable() })
  .strict();
export const snowLiveSnapshotSchema = z
  .object({
    activityId: z.string(),
    phase: z.enum(["registration", "scheduled", "competition", "complete", "ended"]),
    matches: z.array(
      z
        .object({
          index: count,
          startsAt: z.number().int(),
          attackSide: side,
          score: z.object({ A: count, B: count }).strict(),
          winner: side.nullable(),
          rounds: z.array(round),
        })
        .strict(),
    ),
    champion: side.nullable(),
    battle: z
      .object({
        id: z.string(),
        matchIndex: count,
        roundIndex: count,
        attack: person,
        defend: person,
        attackSide: side,
        started: z.boolean(),
        tick: count,
        ticksLeft: count,
        coreHp: z.number().nonnegative(),
        coreMaxHp: count,
        status: z.enum(["running", "attack_win", "defend_win"]),
        units: z.array(unit),
        groundSlots: z.array(count),
        highSlots: z.array(count),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const snowDanmakuSchema = z
  .object({
    sequence: z.number().int().positive(),
    activityId: z.string(),
    senderName: z.string(),
    text: z.string().min(1),
    createdAt: z.number().int(),
  })
  .strict();
export const snowDanmakuInputSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    text: z.string().trim().min(1),
  })
  .strict();
export const snowLiveResponseSchema = z
  .object({
    snapshot: snowLiveSnapshotSchema.nullable(),
    messages: z.array(snowDanmakuSchema),
  })
  .strict();
export type SnowLiveSnapshot = z.infer<typeof snowLiveSnapshotSchema>;
export type SnowDanmaku = z.infer<typeof snowDanmakuSchema>;
export type SnowDanmakuInput = z.infer<typeof snowDanmakuInputSchema>;
export type SnowLiveResponse = z.infer<typeof snowLiveResponseSchema>;
