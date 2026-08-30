import { z } from "zod";
import { farmKitchenDataSchema, farmKitchenShopRevisionSchema } from "./farm-kitchen.js";

const farmKitchenShopOpenDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

export const farmKitchenShopOpenIdempotencyKeySchema = z.uuid();

export const farmHumanKitchenShopOpenRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmKitchenShopOpenDoorplateSchema,
    idempotency_key: farmKitchenShopOpenIdempotencyKeySchema,
    expected_shop_revision: farmKitchenShopRevisionSchema,
  })
  .strict();

export const boundFarmKitchenShopOpenRequestSchema = z
  .object({ expected_shop_revision: farmKitchenShopRevisionSchema })
  .strict();

export const farmKitchenShopOpenResultSchema = z
  .object({
    receipt_id: farmKitchenShopOpenIdempotencyKeySchema,
    refreshed: z.boolean(),
  })
  .strict();

export const farmHumanKitchenShopOpenSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmKitchenShopOpenResultSchema,
        resource: farmKitchenDataSchema,
      })
      .strict(),
    shop_revision: farmKitchenShopRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmKitchenShopOpenSuccessSchema = farmHumanKitchenShopOpenSuccessSchema;

export const farmHumanKitchenShopOpenErrorCodeSchema = z.enum([
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

export const farmHumanKitchenShopOpenErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenShopOpenErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmKitchenShopOpenErrorCodeSchema = z.enum([
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

export const boundFarmKitchenShopOpenErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenShopOpenErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmHumanKitchenShopOpenRequest = z.infer<typeof farmHumanKitchenShopOpenRequestSchema>;
export type BoundFarmKitchenShopOpenRequest = z.infer<typeof boundFarmKitchenShopOpenRequestSchema>;
export type FarmHumanKitchenShopOpenSuccess = z.infer<typeof farmHumanKitchenShopOpenSuccessSchema>;
export type BoundFarmKitchenShopOpenSuccess = z.infer<typeof boundFarmKitchenShopOpenSuccessSchema>;
export type FarmHumanKitchenShopOpenError = z.infer<typeof farmHumanKitchenShopOpenErrorSchema>;
export type BoundFarmKitchenShopOpenError = z.infer<typeof boundFarmKitchenShopOpenErrorSchema>;
