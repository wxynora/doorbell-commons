import { z } from "zod";

const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmHumanKeySchema = z.string().min(1);

export const farmOriginalPlantActionIdempotencyKeySchema = z.uuid();
export const farmOriginalPlantActionRevisionSchema = z
  .string()
  .regex(/^farm-original-plant-v1:[0-9a-f]{64}$/);

const designFields = {
  name: z.string(),
  latin: z.string(),
  desc: z.string(),
  plant: z.string(),
  harvest: z.string(),
};

export const farmOriginalPlantDesignPayloadSchema = z.object(designFields).strict();

export const farmHumanOriginalPlantActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmOriginalPlantActionIdempotencyKeySchema,
    expected_revision: farmOriginalPlantActionRevisionSchema,
    payload: farmOriginalPlantDesignPayloadSchema,
  })
  .strict();

export const boundFarmOriginalPlantActionRequestSchema = z
  .object({
    expected_revision: farmOriginalPlantActionRevisionSchema,
    ...designFields,
  })
  .strict();

export const farmOriginalPlantCropSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    latin: z.string().min(1),
    desc: z.string().min(1),
    category: z.literal("ugc"),
    rarity: z.literal("OR"),
    growTicks: z.number().int().positive(),
    water: z.null(),
    seedPrice: z.number().int().nonnegative(),
    sellPrice: z.number().int().nonnegative(),
    family: z.null(),
    unlockTier: z.null(),
    mechanicText: z.null(),
    mechanicStatus: z.literal("active"),
    mechanicSystem: z.null(),
    unlockType: z.literal("craft"),
    unlockCond: z.literal("自创作物"),
    produce: z.null(),
    designer: z.string().min(1),
    designerId: farmDoorplateSchema,
    plantLine: z.string().min(1).optional(),
    lore: z.string().min(1).optional(),
  })
  .strict();

export const farmOriginalPlantActionResultSchema = z
  .object({
    receipt_id: farmOriginalPlantActionIdempotencyKeySchema,
    crop: farmOriginalPlantCropSchema,
    fee: z.number().int().nonnegative(),
    seeds: z.number().int().positive(),
    coins_balance: z.number().int().nonnegative(),
  })
  .strict();

export const farmHumanOriginalPlantActionSuccessSchema = z
  .object({
    data: z.object({ result: farmOriginalPlantActionResultSchema }).strict(),
    revision: farmOriginalPlantActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmOriginalPlantActionSuccessSchema = farmHumanOriginalPlantActionSuccessSchema;

export const farmHumanOriginalPlantActionErrorCodeSchema = z.enum([
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
  "action_rejected",
]);

export const farmHumanOriginalPlantActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanOriginalPlantActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmOriginalPlantActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmOriginalPlantActionErrorCodeSchema = z.enum([
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
  "action_rejected",
]);

export const boundFarmOriginalPlantActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmOriginalPlantActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmOriginalPlantActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmOriginalPlantActionIdempotencyKey = z.infer<
  typeof farmOriginalPlantActionIdempotencyKeySchema
>;
export type FarmOriginalPlantActionRevision = z.infer<typeof farmOriginalPlantActionRevisionSchema>;
export type FarmOriginalPlantDesignPayload = z.infer<typeof farmOriginalPlantDesignPayloadSchema>;
export type FarmHumanOriginalPlantActionRequest = z.infer<
  typeof farmHumanOriginalPlantActionRequestSchema
>;
export type BoundFarmOriginalPlantActionRequest = z.infer<
  typeof boundFarmOriginalPlantActionRequestSchema
>;
export type FarmOriginalPlantCrop = z.infer<typeof farmOriginalPlantCropSchema>;
export type FarmOriginalPlantActionResult = z.infer<typeof farmOriginalPlantActionResultSchema>;
export type FarmHumanOriginalPlantActionSuccess = z.infer<
  typeof farmHumanOriginalPlantActionSuccessSchema
>;
export type BoundFarmOriginalPlantActionSuccess = z.infer<
  typeof boundFarmOriginalPlantActionSuccessSchema
>;
export type FarmHumanOriginalPlantActionErrorCode = z.infer<
  typeof farmHumanOriginalPlantActionErrorCodeSchema
>;
export type FarmHumanOriginalPlantActionError = z.infer<
  typeof farmHumanOriginalPlantActionErrorSchema
>;
export type BoundFarmOriginalPlantActionErrorCode = z.infer<
  typeof boundFarmOriginalPlantActionErrorCodeSchema
>;
export type BoundFarmOriginalPlantActionError = z.infer<
  typeof boundFarmOriginalPlantActionErrorSchema
>;
