import { z } from "zod";

export const serviceHealthSchema = z.object({
  service: z.literal("doorbell-commons"),
  status: z.literal("ok"),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

const qqIdentifierSchema = z.string().regex(/^[1-9][0-9]*$/);

export const qqGroupEligibilityRequestSchema = z
  .object({
    qq_number: qqIdentifierSchema,
  })
  .strict();

export const qqGroupEligibilitySuccessSchema = z
  .object({
    eligible: z.literal(true),
    qq_number: qqIdentifierSchema,
    group_id: qqIdentifierSchema,
  })
  .strict();

export const qqGroupEligibilityErrorCodeSchema = z.enum([
  "invalid_request",
  "qq_not_group_member",
  "onebot_unavailable",
]);

export const qqGroupEligibilityErrorSchema = z
  .object({
    error: z
      .object({
        code: qqGroupEligibilityErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type QqGroupEligibilityRequest = z.infer<typeof qqGroupEligibilityRequestSchema>;
export type QqGroupEligibilitySuccess = z.infer<typeof qqGroupEligibilitySuccessSchema>;
export type QqGroupEligibilityError = z.infer<typeof qqGroupEligibilityErrorSchema>;
