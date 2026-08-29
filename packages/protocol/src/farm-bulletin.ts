import { z } from "zod";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const farmBulletinDoorplateSchema = z.string().regex(FARM_DOORPLATE_RE);
export const farmBulletinHumanKeySchema = z.string().min(1);
export const farmBulletinRevisionSchema = z.string().regex(/^farm-bulletin-v1:[0-9a-f]{64}$/);
export const farmBulletinAckIdempotencyKeySchema = z.uuid();

export const farmBulletinUnavailableReasonSchema = z.enum([
  "not_initialized",
  "invalid_persisted_state",
  "invalid_projection",
]);

export const farmBulletinUnavailableSectionSchema = z
  .object({
    reason: farmBulletinUnavailableReasonSchema,
    message: z.string().min(1),
  })
  .strict();

export const farmBulletinTaskEntrySchema = z
  .object({
    kind: z.string().min(1),
    description: z.string().min(1),
    progress: z.number().int().nonnegative(),
    target: z.number().int().nonnegative(),
    reward: z.number().int().nonnegative(),
    currency: z.enum(["coin", "silver"]),
  })
  .strict();

export const farmBulletinMaturePlotEntrySchema = z
  .object({
    plot_id: z.number().int().positive(),
    seed_type: z.enum(["common", "fantasy", "limited"]).nullable(),
    watered: z.number().int().nonnegative(),
  })
  .strict();

export const farmBulletinMessageEntrySchema = z
  .object({
    id: z.string().min(1).nullable(),
    author_farm_doorplate: farmBulletinDoorplateSchema.nullable(),
    author_name: z.string().nullable(),
    text: z.string().min(1),
    at: z.iso.datetime().nullable(),
  })
  .strict();

export const farmBulletinRanchNotificationEntrySchema = z
  .object({
    text: z.string().min(1),
    at: z.iso.datetime().nullable(),
    section: z.string().min(1).nullable(),
  })
  .strict();

/** Sections are partitioned by availability; an unavailable section is not
 * represented in the available object and vice versa. */
export const farmBulletinAvailableSchema = z
  .object({
    tasks: z.array(farmBulletinTaskEntrySchema),
    mature_plots: z.array(farmBulletinMaturePlotEntrySchema),
    messages: z.array(farmBulletinMessageEntrySchema),
    ranch_notifications: z.array(farmBulletinRanchNotificationEntrySchema),
  })
  .partial()
  .strict();

export const farmBulletinUnavailableSchema = z
  .object({
    tasks: farmBulletinUnavailableSectionSchema,
    mature_plots: farmBulletinUnavailableSectionSchema,
    messages: farmBulletinUnavailableSectionSchema,
    ranch_notifications: farmBulletinUnavailableSectionSchema,
  })
  .partial()
  .strict();

export const farmBulletinDataSchema = z
  .object({
    available: farmBulletinAvailableSchema,
    unavailable: farmBulletinUnavailableSchema,
  })
  .strict();

export const farmHumanBulletinReadRequestSchema = z
  .object({
    farm_human_key: farmBulletinHumanKeySchema,
    expected_farm_doorplate: farmBulletinDoorplateSchema,
  })
  .strict();

export const farmHumanBulletinReadSuccessSchema = z
  .object({
    subject: z.object({ farm_doorplate: farmBulletinDoorplateSchema }).strict(),
    data: farmBulletinDataSchema,
    revision: farmBulletinRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanBulletinReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanBulletinReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanBulletinReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundFarmBulletinReadSuccessSchema = farmHumanBulletinReadSuccessSchema;
export const boundFarmBulletinReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);
export const boundFarmBulletinReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmBulletinReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();
export const boundFarmBulletinReadRequestSchema = z.object({}).strict();

export const farmHumanBulletinAckRequestSchema = z
  .object({
    farm_human_key: farmBulletinHumanKeySchema,
    expected_farm_doorplate: farmBulletinDoorplateSchema,
    expected_bulletin_revision: farmBulletinRevisionSchema,
    idempotency_key: farmBulletinAckIdempotencyKeySchema,
  })
  .strict();

export const boundFarmBulletinAckRequestSchema = z
  .object({ expected_revision: farmBulletinRevisionSchema })
  .strict();

export const farmHumanBulletinAckResultSchema = z
  .object({
    receipt_id: farmBulletinAckIdempotencyKeySchema,
    acknowledged_count: z.number().int().nonnegative(),
  })
  .strict();

export const farmHumanBulletinAckSuccessSchema = z
  .object({
    subject: z.object({ farm_doorplate: farmBulletinDoorplateSchema }).strict(),
    data: z
      .object({
        result: farmHumanBulletinAckResultSchema,
        resource: farmBulletinDataSchema,
      })
      .strict(),
    revision: farmBulletinRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmBulletinAckSuccessSchema = farmHumanBulletinAckSuccessSchema;

export const farmHumanBulletinAckErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
  "state_conflict",
  "idempotency_conflict",
]);

export const farmHumanBulletinAckErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanBulletinAckErrorCodeSchema,
        message: z.string(),
        current_revision: farmBulletinRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmBulletinAckErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
  "state_conflict",
  "idempotency_conflict",
]);

export const boundFarmBulletinAckErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmBulletinAckErrorCodeSchema,
        message: z.string(),
        current_revision: farmBulletinRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmBulletinData = z.infer<typeof farmBulletinDataSchema>;
export type FarmHumanBulletinReadRequest = z.infer<typeof farmHumanBulletinReadRequestSchema>;
export type FarmHumanBulletinReadSuccess = z.infer<typeof farmHumanBulletinReadSuccessSchema>;
export type FarmHumanBulletinReadErrorCode = z.infer<typeof farmHumanBulletinReadErrorCodeSchema>;
export type FarmHumanBulletinReadError = z.infer<typeof farmHumanBulletinReadErrorSchema>;
export type BoundFarmBulletinReadSuccess = z.infer<typeof boundFarmBulletinReadSuccessSchema>;
export type BoundFarmBulletinReadErrorCode = z.infer<typeof boundFarmBulletinReadErrorCodeSchema>;
export type BoundFarmBulletinReadError = z.infer<typeof boundFarmBulletinReadErrorSchema>;
export type FarmHumanBulletinAckRequest = z.infer<typeof farmHumanBulletinAckRequestSchema>;
export type BoundFarmBulletinAckRequest = z.infer<typeof boundFarmBulletinAckRequestSchema>;
export type FarmHumanBulletinAckSuccess = z.infer<typeof farmHumanBulletinAckSuccessSchema>;
export type BoundFarmBulletinAckSuccess = z.infer<typeof boundFarmBulletinAckSuccessSchema>;
export type FarmHumanBulletinAckError = z.infer<typeof farmHumanBulletinAckErrorSchema>;
export type BoundFarmBulletinAckError = z.infer<typeof boundFarmBulletinAckErrorSchema>;
