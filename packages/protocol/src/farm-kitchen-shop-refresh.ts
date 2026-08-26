import { z } from "zod";
import { farmKitchenDataSchema, farmKitchenShopRevisionSchema } from "./farm-kitchen.js";

const farmKitchenShopRefreshDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

export const farmKitchenShopRefreshIdempotencyKeySchema = z.uuid();

export const farmHumanKitchenShopRefreshRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmKitchenShopRefreshDoorplateSchema,
    idempotency_key: farmKitchenShopRefreshIdempotencyKeySchema,
    expected_shop_revision: farmKitchenShopRevisionSchema,
  })
  .strict();

/** Browser body: identity and idempotency stay in the Doorbell session layer. */
export const boundFarmKitchenShopRefreshRequestSchema = z
  .object({
    expected_shop_revision: farmKitchenShopRevisionSchema,
  })
  .strict();

export const farmKitchenShopRefreshResultSchema = z
  .object({
    receipt_id: farmKitchenShopRefreshIdempotencyKeySchema,
    cost_coins: z.number().int().nonnegative(),
    coins_balance: z.number().int().nonnegative(),
    refresh_window_id: z.number().int(),
    refresh_used_count: z.number().int().nonnegative(),
    refresh_remaining_count: z.number().int().nonnegative(),
    refresh_limit: z.number().int().positive(),
    next_cost_coins: z.number().int().nonnegative(),
    can_refresh: z.boolean(),
  })
  .strict();

export const farmHumanKitchenShopRefreshSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmKitchenShopRefreshResultSchema,
        resource: farmKitchenDataSchema,
      })
      .strict(),
    shop_revision: farmKitchenShopRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmKitchenShopRefreshSuccessSchema =
  farmHumanKitchenShopRefreshSuccessSchema;

export const farmHumanKitchenShopRefreshErrorCodeSchema = z.enum([
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "refresh_exhausted",
  "insufficient_coins",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanKitchenShopRefreshErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenShopRefreshErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmKitchenShopRefreshErrorCodeSchema = z.enum([
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "refresh_exhausted",
  "insufficient_coins",
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

export const boundFarmKitchenShopRefreshErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenShopRefreshErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmHumanKitchenShopRefreshRequest = z.infer<
  typeof farmHumanKitchenShopRefreshRequestSchema
>;
export type BoundFarmKitchenShopRefreshRequest = z.infer<
  typeof boundFarmKitchenShopRefreshRequestSchema
>;
export type FarmKitchenShopRefreshResult = z.infer<typeof farmKitchenShopRefreshResultSchema>;
export type FarmHumanKitchenShopRefreshSuccess = z.infer<
  typeof farmHumanKitchenShopRefreshSuccessSchema
>;
export type BoundFarmKitchenShopRefreshSuccess = z.infer<
  typeof boundFarmKitchenShopRefreshSuccessSchema
>;
export type FarmHumanKitchenShopRefreshErrorCode = z.infer<
  typeof farmHumanKitchenShopRefreshErrorCodeSchema
>;
export type FarmHumanKitchenShopRefreshError = z.infer<
  typeof farmHumanKitchenShopRefreshErrorSchema
>;
export type BoundFarmKitchenShopRefreshErrorCode = z.infer<
  typeof boundFarmKitchenShopRefreshErrorCodeSchema
>;
export type BoundFarmKitchenShopRefreshError = z.infer<
  typeof boundFarmKitchenShopRefreshErrorSchema
>;
