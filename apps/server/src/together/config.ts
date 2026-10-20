import { z } from "zod";
import { SNOW_WAR_ECONOMY } from "./snow-fort/snow-war-config.mjs";
import { SNOW_WAR_NOTICE_COPY } from "./snow-fort/snow-war-notice-copy.mjs";

const nonempty = z.string().min(1);
const currency = z.number().int().nonnegative();
const amounts = z.object({ gold: currency, silver: currency }).strict();
export const togetherConfigurationSchema = z
  .object({
    activityId: nonempty,
    opensAt: z.number().int(),
    closesAt: z.number().int(),
    matchStartsAt: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
    rewards: z
      .object({ round: amounts, complete: amounts, champion: amounts })
      .strict()
      .default(SNOW_WAR_ECONOMY.rewards),
    copy: z
      .object({
        registration: nonempty,
        team: nonempty,
        captain: nonempty,
        round: nonempty,
        started: nonempty,
        result: nonempty,
      })
      .strict()
      .default(SNOW_WAR_NOTICE_COPY),
    copyReviewConfirmed: z.literal(true),
    chatEnabled: z.boolean(),
  })
  .strict();
export const togetherAdminSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inspect") }).strict(),
  z.object({ kind: z.literal("configure"), configuration: togetherConfigurationSchema }).strict(),
  z.object({ kind: z.literal("captains"), A: nonempty, B: nonempty }).strict(),
  z.object({ kind: z.literal("retire") }).strict(),
]);
