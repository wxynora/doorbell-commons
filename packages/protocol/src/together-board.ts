import { z } from "zod";

const side = z.enum(["A", "B"]);
const count = z.number().int().nonnegative();
const time = z.number().int();
const person = z
  .object({ name: z.string().nullable(), doorplate: z.string().nullable(), npc: z.boolean() })
  .strict();
const score = z.object({ A: count, B: count }).strict();
const round = z
  .object({
    index: count,
    attack: person,
    defend: person,
    winner: side,
    reason: z.enum(["core_broken", "time_limit"]),
    ticks: count,
  })
  .strict();
export const togetherBoardSchema = z
  .object({
    activityId: z.string().min(1),
    phase: z.enum([
      "scheduled",
      "registration",
      "awaiting_teams",
      "competition",
      "complete",
      "ended",
    ]),
    opensAt: time,
    closesAt: time,
    matchStartsAt: z.tuple([time, time, time]),
    registeredCount: count,
    myRegistration: z.boolean(),
    registrationStatus: z.enum(["not_registered", "pending", "registered"]),
    registrations: z.array(person),
    matches: z.array(
      z
        .object({
          index: count,
          startsAt: time,
          attackSide: side,
          winner: side.nullable(),
          score,
          rounds: z.array(round),
        })
        .strict(),
    ),
    champion: side.nullable(),
    entry: z.object({ op: z.literal("farm.together.view"), args: z.object({}).strict() }).strict(),
  })
  .strict();
export const togetherBoardResponseSchema = z
  .object({ board: togetherBoardSchema.nullable() })
  .strict();
export type TogetherBoard = z.infer<typeof togetherBoardSchema>;
export type TogetherBoardResponse = z.infer<typeof togetherBoardResponseSchema>;
