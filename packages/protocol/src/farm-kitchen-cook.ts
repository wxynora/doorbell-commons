import { z } from "zod";
import { farmKitchenDataSchema, farmKitchenInventoryRevisionSchema } from "./farm-kitchen.js";

const farmKitchenCookDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmKitchenCookHumanKeySchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "farm_human_key must not contain only whitespace",
  });
const farmKitchenCookRawItemRefSchema = z.string().regex(/^\S(?:.{0,127})$/u);
export const farmKitchenCookRecipeIdSchema = farmKitchenCookRawItemRefSchema;

export const farmKitchenCookIdempotencyKeySchema = z.uuid();
export const farmKitchenCookRevisionSchema = farmKitchenInventoryRevisionSchema;
export const farmKitchenCookItemsSchema = z.array(farmKitchenCookRawItemRefSchema).min(2).max(5);

const farmKitchenCookActionBaseFields = {
  expected_kitchen_inventory_revision: farmKitchenCookRevisionSchema,
};

const farmHumanKitchenCookIdentityFields = {
  farm_human_key: farmKitchenCookHumanKeySchema,
  expected_farm_doorplate: farmKitchenCookDoorplateSchema,
  idempotency_key: farmKitchenCookIdempotencyKeySchema,
};

export const farmHumanKitchenCookRequestSchema = z.union([
  z
    .object({
      ...farmHumanKitchenCookIdentityFields,
      ...farmKitchenCookActionBaseFields,
      items: farmKitchenCookItemsSchema,
    })
    .strict(),
  z
    .object({
      ...farmHumanKitchenCookIdentityFields,
      ...farmKitchenCookActionBaseFields,
      recipe_id: farmKitchenCookRecipeIdSchema,
    })
    .strict(),
]);

/** Browser body: the Doorbell session supplies farm identity and idempotency. */
export const boundFarmKitchenCookRequestSchema = z.union([
  z
    .object({
      ...farmKitchenCookActionBaseFields,
      items: farmKitchenCookItemsSchema,
    })
    .strict(),
  z
    .object({
      ...farmKitchenCookActionBaseFields,
      recipe_id: farmKitchenCookRecipeIdSchema,
    })
    .strict(),
]);

export const farmKitchenCookRaritySchema = z.enum(["N", "R", "SR", "SSR", "SP"]);

const farmKitchenCookQixiProgressSchema = z
  .object({
    taskId: z.string().min(1),
    cropId: z.string().min(1),
    cropName: z.string().min(1).optional(),
    progress: z.number().int().nonnegative(),
    target: z.number().int().positive(),
    completed: z.boolean(),
    submitted: z.number().int().positive().optional(),
  })
  .strict();

export const farmKitchenCookOutcomeSchema = z
  .object({
    kind: z.literal("cook"),
    item_refs: farmKitchenCookItemsSchema,
    dish_instance_id: z.string().min(1),
    recipe_id: z.string().min(1),
    name: z.string().min(1),
    rarity: farmKitchenCookRaritySchema,
    value_gold: z.number().int().nonnegative(),
    recycle_silver: z.number().int().nonnegative(),
    odd: z.boolean(),
    discovered: z.boolean(),
    qixi: farmKitchenCookQixiProgressSchema.nullable(),
  })
  .strict();

export const farmKitchenCookResultSchema = z
  .object({
    receipt_id: farmKitchenCookIdempotencyKeySchema,
    outcome: farmKitchenCookOutcomeSchema,
  })
  .strict();

export const farmHumanKitchenCookSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmKitchenCookResultSchema,
        resource: farmKitchenDataSchema,
      })
      .strict(),
    kitchen_inventory_revision: farmKitchenCookRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmKitchenCookSuccessSchema = farmHumanKitchenCookSuccessSchema;
export const boundKitchenCookSuccessSchema = boundFarmKitchenCookSuccessSchema;

const farmHumanKitchenCookErrorCodes = [
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
  "cook_rejected",
] as const;

export const farmHumanKitchenCookErrorCodeSchema = z.enum(farmHumanKitchenCookErrorCodes);

export const farmHumanKitchenCookErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenCookErrorCodeSchema,
        message: z.string(),
        current_kitchen_inventory_revision: farmKitchenCookRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

const boundKitchenCookErrorCodes = [
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
  "cook_rejected",
] as const;

export const boundFarmKitchenCookErrorCodeSchema = z.enum(boundKitchenCookErrorCodes);

export const boundFarmKitchenCookErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenCookErrorCodeSchema,
        message: z.string(),
        current_kitchen_inventory_revision: farmKitchenCookRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

// Action-specific aliases keep this standalone contract compatible with the
// naming used by the other farm action modules without widening the payload.
export const farmKitchenCookActionIdempotencyKeySchema = farmKitchenCookIdempotencyKeySchema;
export const farmKitchenCookActionRevisionSchema = farmKitchenCookRevisionSchema;
export const farmKitchenCookActionItemsSchema = farmKitchenCookItemsSchema;
export const farmKitchenCookActionOutcomeSchema = farmKitchenCookOutcomeSchema;
export const farmKitchenCookActionResultSchema = farmKitchenCookResultSchema;
export const farmKitchenCookActionSuccessSchema = farmHumanKitchenCookSuccessSchema;
export const farmKitchenCookActionErrorSchema = farmHumanKitchenCookErrorSchema;

export type FarmKitchenCookIdempotencyKey = z.infer<typeof farmKitchenCookIdempotencyKeySchema>;
export type FarmKitchenCookRevision = z.infer<typeof farmKitchenCookRevisionSchema>;
export type FarmKitchenCookItems = z.infer<typeof farmKitchenCookItemsSchema>;
export type FarmHumanKitchenCookRequest = z.infer<typeof farmHumanKitchenCookRequestSchema>;
export type BoundFarmKitchenCookRequest = z.infer<typeof boundFarmKitchenCookRequestSchema>;
export type FarmKitchenCookOutcome = z.infer<typeof farmKitchenCookOutcomeSchema>;
export type FarmKitchenCookResult = z.infer<typeof farmKitchenCookResultSchema>;
export type FarmHumanKitchenCookSuccess = z.infer<typeof farmHumanKitchenCookSuccessSchema>;
export type BoundFarmKitchenCookSuccess = z.infer<typeof boundFarmKitchenCookSuccessSchema>;
export type FarmHumanKitchenCookErrorCode = z.infer<typeof farmHumanKitchenCookErrorCodeSchema>;
export type FarmHumanKitchenCookError = z.infer<typeof farmHumanKitchenCookErrorSchema>;
export type BoundFarmKitchenCookErrorCode = z.infer<typeof boundFarmKitchenCookErrorCodeSchema>;
export type BoundFarmKitchenCookError = z.infer<typeof boundFarmKitchenCookErrorSchema>;
