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

export const registrationCodeSchema = z
  .string()
  .regex(/^DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);

export const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

const storedDisplayNameSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "must not contain only whitespace",
});

export const farmLookupRequestSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmLookupSuccessSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
    farm_name: z.string(),
  })
  .strict();

export const farmLookupErrorCodeSchema = z.enum([
  "invalid_request",
  "farm_not_found",
  "farm_unavailable",
]);

export const farmLookupErrorSchema = z
  .object({
    error: z
      .object({
        code: farmLookupErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

const returningHumanSessionRequestSchema = z
  .object({
    qq_number: qqIdentifierSchema,
    registration_code: registrationCodeSchema,
  })
  .strict();

const firstHumanSessionRequestSchema = returningHumanSessionRequestSchema.extend({
  resident_name: storedDisplayNameSchema,
  home_name: storedDisplayNameSchema,
  farm_doorplate: farmDoorplateSchema,
  confirmed_farm_name: z.string(),
});

export const humanSessionRequestSchema = z.union([
  firstHumanSessionRequestSchema,
  returningHumanSessionRequestSchema,
]);

export const humanAccountSchema = z
  .object({
    account_id: z.string().uuid(),
    qq_number: qqIdentifierSchema,
    created_at: z.string(),
    membership_status: z.literal("active"),
  })
  .strict();

export const residentSchema = z
  .object({
    resident_id: z.string().uuid(),
    resident_name: z.string(),
  })
  .strict();

export const homeSchema = z
  .object({
    home_id: z.string().uuid(),
    home_name: z.string(),
  })
  .strict();

export const farmBindingSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const humanSessionSuccessSchema = z
  .object({
    authenticated: z.literal(true),
    account_created: z.boolean(),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
  })
  .strict();

export const currentHumanSessionSuccessSchema = z
  .object({
    authenticated: z.literal(true),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
  })
  .strict();

export const humanLogoutSuccessSchema = z
  .object({
    logged_out: z.literal(true),
  })
  .strict();

export const humanAuthenticationErrorCodeSchema = z.enum([
  "invalid_request",
  "invalid_registration_code",
  "qq_not_group_member",
  "onebot_unavailable",
  "authentication_required",
  "farm_not_found",
  "farm_unavailable",
  "farm_confirmation_mismatch",
  "registration_profile_required",
  "registration_profile_mismatch",
  "farm_already_bound",
]);

export const humanAuthenticationErrorSchema = z
  .object({
    error: z
      .object({
        code: humanAuthenticationErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type HumanSessionRequest = z.infer<typeof humanSessionRequestSchema>;
export type FarmLookupRequest = z.infer<typeof farmLookupRequestSchema>;
export type FarmLookupSuccess = z.infer<typeof farmLookupSuccessSchema>;
export type FarmLookupError = z.infer<typeof farmLookupErrorSchema>;
export type HumanSessionSuccess = z.infer<typeof humanSessionSuccessSchema>;
export type CurrentHumanSessionSuccess = z.infer<typeof currentHumanSessionSuccessSchema>;
export type HumanLogoutSuccess = z.infer<typeof humanLogoutSuccessSchema>;
export type HumanAuthenticationError = z.infer<typeof humanAuthenticationErrorSchema>;
