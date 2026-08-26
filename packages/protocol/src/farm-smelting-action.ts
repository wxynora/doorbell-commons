import { z } from "zod";
import {
  farmCatalogDataSchema,
  farmCatalogDoorplateSchema,
  farmCatalogRaritySchema,
  farmCatalogSmeltingRevisionSchema,
} from "./farm-catalog.js";

const farmHumanKeySchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Farm human key must not contain only whitespace",
  });
const materialIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Material id must not contain only whitespace",
  });

export const farmSmeltingActionIdempotencyKeySchema = z.uuid();
export const farmSmeltingActionRevisionSchema = farmCatalogSmeltingRevisionSchema;
export const farmSmeltingMaterialIdsSchema = z.array(materialIdSchema).length(3);

const smeltingActionFields = {
  material_ids: farmSmeltingMaterialIdsSchema,
  expected_smelting_revision: farmSmeltingActionRevisionSchema,
};

export const farmHumanSmeltingActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
    ...smeltingActionFields,
    idempotency_key: farmSmeltingActionIdempotencyKeySchema,
  })
  .strict();

/** Browser body: Doorbell derives farm identity and owns the idempotency header. */
export const boundFarmSmeltingActionRequestSchema = z.object(smeltingActionFields).strict();

export const farmSmeltingActionReceiptSchema = z
  .object({
    receipt_id: farmSmeltingActionIdempotencyKeySchema,
    material_ids: farmSmeltingMaterialIdsSchema,
    crop_id: z.string().min(1),
    crop_name: z.string().min(1),
    rarity: farmCatalogRaritySchema,
    by_recipe: z.boolean(),
  })
  .strict();

export const farmHumanSmeltingActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmSmeltingActionReceiptSchema,
        resource: farmCatalogDataSchema,
      })
      .strict(),
    revision: z.string().min(1),
    smelting_revision: farmSmeltingActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmSmeltingActionSuccessSchema = farmHumanSmeltingActionSuccessSchema;

export const farmHumanSmeltingActionErrorCodeSchema = z.enum([
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

export const farmHumanSmeltingActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanSmeltingActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmSmeltingActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmSmeltingActionErrorCodeSchema = z.enum([
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

export const boundFarmSmeltingActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmSmeltingActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmSmeltingActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmHumanSmeltingActionRequest = z.infer<typeof farmHumanSmeltingActionRequestSchema>;
export type BoundFarmSmeltingActionRequest = z.infer<typeof boundFarmSmeltingActionRequestSchema>;
export type FarmSmeltingActionReceipt = z.infer<typeof farmSmeltingActionReceiptSchema>;
export type FarmHumanSmeltingActionSuccess = z.infer<typeof farmHumanSmeltingActionSuccessSchema>;
export type BoundFarmSmeltingActionSuccess = z.infer<typeof boundFarmSmeltingActionSuccessSchema>;
export type FarmHumanSmeltingActionError = z.infer<typeof farmHumanSmeltingActionErrorSchema>;
export type BoundFarmSmeltingActionError = z.infer<typeof boundFarmSmeltingActionErrorSchema>;
export type BoundFarmSmeltingActionErrorCode = z.infer<
  typeof boundFarmSmeltingActionErrorCodeSchema
>;
