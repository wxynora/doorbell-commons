import { z } from "zod";
import { farmCatalogShopAvailableSchema } from "./farm-catalog.js";

const farmShopOpenDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmShopOpenRevisionSchema = z.string().min(1);

export const farmShopOpenIdempotencyKeySchema = z.uuid();

export const farmHumanShopOpenRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmShopOpenDoorplateSchema,
    idempotency_key: farmShopOpenIdempotencyKeySchema,
    expected_shop_revision: farmShopOpenRevisionSchema.nullable(),
  })
  .strict();

/** Browser identity and idempotency are derived from the active Human session. */
export const boundFarmShopOpenRequestSchema = z
  .object({
    expected_shop_revision: farmShopOpenRevisionSchema.nullable(),
  })
  .strict();

export const farmShopOpenResultSchema = z
  .object({
    receipt_id: farmShopOpenIdempotencyKeySchema,
    refreshed: z.boolean(),
  })
  .strict();

export const farmHumanShopOpenSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmShopOpenResultSchema,
        resource: farmCatalogShopAvailableSchema,
      })
      .strict(),
    shop_revision: farmShopOpenRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmShopOpenSuccessSchema = farmHumanShopOpenSuccessSchema;

export const farmHumanShopOpenErrorCodeSchema = z.enum([
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanShopOpenErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanShopOpenErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmShopOpenRevisionSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmShopOpenErrorCodeSchema = z.enum([
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundFarmShopOpenErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmShopOpenErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmShopOpenRevisionSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();

export type FarmHumanShopOpenRequest = z.infer<typeof farmHumanShopOpenRequestSchema>;
export type BoundFarmShopOpenRequest = z.infer<typeof boundFarmShopOpenRequestSchema>;
export type FarmHumanShopOpenSuccess = z.infer<typeof farmHumanShopOpenSuccessSchema>;
export type BoundFarmShopOpenSuccess = z.infer<typeof boundFarmShopOpenSuccessSchema>;
export type FarmHumanShopOpenError = z.infer<typeof farmHumanShopOpenErrorSchema>;
export type BoundFarmShopOpenError = z.infer<typeof boundFarmShopOpenErrorSchema>;
export type BoundFarmShopOpenErrorCode = z.infer<typeof boundFarmShopOpenErrorCodeSchema>;
