import { z } from "zod";
import { farmKitchenDataSchema, farmKitchenInventoryRevisionSchema } from "./farm-kitchen.js";

const farmKitchenInventoryDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmKitchenInventoryIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const farmKitchenInventoryHumanKeySchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "farm_human_key must not contain only whitespace",
  });

const safeIntegerSchema = z.number().int().safe();
const positiveIntegerSchema = safeIntegerSchema.positive();
const nonnegativeIntegerSchema = safeIntegerSchema.nonnegative();

export const farmKitchenInventoryActionSchema = z.enum([
  "use",
  "recycle",
  "stall",
  "sell_fish",
  "sell_treasure",
]);
export const farmKitchenInventoryActionTargetSchema = z.enum(["self", "cat", "dog"]);
export const farmKitchenInventoryItemKindSchema = z.enum(["product", "dish"]);
export const farmKitchenInventoryActionIdempotencyKeySchema = z.uuid();
export const farmKitchenInventoryActionRevisionSchema = farmKitchenInventoryRevisionSchema;

// These short aliases keep the inventory contract convenient to consume while
// retaining the action-specific names used by the other farm contracts.
export const farmKitchenInventoryIdempotencyKeySchema =
  farmKitchenInventoryActionIdempotencyKeySchema;

const inventoryActionIdentityFields = {
  farm_human_key: farmKitchenInventoryHumanKeySchema,
  expected_farm_doorplate: farmKitchenInventoryDoorplateSchema,
  idempotency_key: farmKitchenInventoryActionIdempotencyKeySchema,
  expected_kitchen_inventory_revision: farmKitchenInventoryActionRevisionSchema,
};

const boundInventoryActionFields = {
  expected_kitchen_inventory_revision: farmKitchenInventoryActionRevisionSchema,
};

const useActionFields = {
  action: z.literal("use"),
  dish_instance_id: farmKitchenInventoryIdSchema,
  target: farmKitchenInventoryActionTargetSchema,
};

const recycleActionFields = {
  action: z.literal("recycle"),
  item_kind: farmKitchenInventoryItemKindSchema,
  item_instance_ids: z.array(farmKitchenInventoryIdSchema).min(1),
  quantity: positiveIntegerSchema,
};

const stallActionFields = {
  action: z.literal("stall"),
  item_instance_ids: z.array(farmKitchenInventoryIdSchema).min(1),
  quantity: positiveIntegerSchema,
  price: positiveIntegerSchema,
};

const sellFishActionFields = {
  action: z.literal("sell_fish"),
  catch_instance_ids: z.array(farmKitchenInventoryIdSchema).min(1),
  quantity: positiveIntegerSchema,
};

const sellTreasureActionFields = {
  action: z.literal("sell_treasure"),
  treasure_item_id: farmKitchenInventoryIdSchema,
  quantity: positiveIntegerSchema,
};

function validateQuantityWithinIds(
  value: { quantity: number; item_instance_ids: string[] },
  context: z.RefinementCtx,
): void {
  if (value.quantity > value.item_instance_ids.length) {
    context.addIssue({
      code: "custom",
      path: ["quantity"],
      message: "quantity must not exceed the number of supplied item instances",
    });
  }
}

function validateFishQuantity(
  value: { quantity: number; catch_instance_ids: string[] },
  context: z.RefinementCtx,
): void {
  if (value.quantity > value.catch_instance_ids.length) {
    context.addIssue({
      code: "custom",
      path: ["quantity"],
      message: "quantity must not exceed the number of supplied catch instances",
    });
  }
}

const humanUseRequestSchema = z
  .object({ ...inventoryActionIdentityFields, ...useActionFields })
  .strict();
const humanRecycleRequestSchema = z
  .object({ ...inventoryActionIdentityFields, ...recycleActionFields })
  .strict()
  .superRefine(validateQuantityWithinIds);
const humanStallRequestSchema = z
  .object({ ...inventoryActionIdentityFields, ...stallActionFields })
  .strict()
  .superRefine(validateQuantityWithinIds);
const humanSellFishRequestSchema = z
  .object({ ...inventoryActionIdentityFields, ...sellFishActionFields })
  .strict()
  .superRefine(validateFishQuantity);
const humanSellTreasureRequestSchema = z
  .object({ ...inventoryActionIdentityFields, ...sellTreasureActionFields })
  .strict();

export const farmHumanKitchenInventoryActionRequestSchema = z.union([
  humanUseRequestSchema,
  humanRecycleRequestSchema,
  humanStallRequestSchema,
  humanSellFishRequestSchema,
  humanSellTreasureRequestSchema,
]);

const boundUseRequestSchema = z
  .object({ ...boundInventoryActionFields, ...useActionFields })
  .strict();
const boundRecycleRequestSchema = z
  .object({ ...boundInventoryActionFields, ...recycleActionFields })
  .strict()
  .superRefine(validateQuantityWithinIds);
const boundStallRequestSchema = z
  .object({ ...boundInventoryActionFields, ...stallActionFields })
  .strict()
  .superRefine(validateQuantityWithinIds);
const boundSellFishRequestSchema = z
  .object({ ...boundInventoryActionFields, ...sellFishActionFields })
  .strict()
  .superRefine(validateFishQuantity);
const boundSellTreasureRequestSchema = z
  .object({ ...boundInventoryActionFields, ...sellTreasureActionFields })
  .strict();

/** Browser body: identity and idempotency stay in the Doorbell session layer. */
export const boundFarmKitchenInventoryActionRequestSchema = z.union([
  boundUseRequestSchema,
  boundRecycleRequestSchema,
  boundStallRequestSchema,
  boundSellFishRequestSchema,
  boundSellTreasureRequestSchema,
]);
export const boundKitchenInventoryActionRequestSchema =
  boundFarmKitchenInventoryActionRequestSchema;

const useSelfOutcomeSchema = z
  .object({
    kind: z.literal("use"),
    dish_instance_id: farmKitchenInventoryIdSchema,
    dish_name: z.string().min(1),
    target: z.literal("self"),
    debuff_name: z.string().min(1),
    ends_at: safeIntegerSchema,
  })
  .strict();

const useCatOutcomeSchema = z
  .object({
    kind: z.literal("use"),
    dish_instance_id: farmKitchenInventoryIdSchema,
    dish_name: z.string().min(1),
    target: z.literal("cat"),
    bonus: z.number().finite(),
    ends_at: safeIntegerSchema,
  })
  .strict();

const useDogOutcomeSchema = z
  .object({
    kind: z.literal("use"),
    dish_instance_id: farmKitchenInventoryIdSchema,
    dish_name: z.string().min(1),
    target: z.literal("dog"),
    bonus: z.number().finite(),
    ends_at: safeIntegerSchema,
  })
  .strict();

const recycleOutcomeSchema = z
  .object({
    kind: z.literal("recycle"),
    item_kind: farmKitchenInventoryItemKindSchema,
    name: z.string().min(1),
    quantity: positiveIntegerSchema,
    value: nonnegativeIntegerSchema,
    silver: nonnegativeIntegerSchema,
  })
  .strict();

const stallOutcomeSchema = z
  .object({
    kind: z.literal("stall"),
    item_kind: z.null(),
    name: z.string().min(1),
    quantity: positiveIntegerSchema,
    price: positiveIntegerSchema,
  })
  .strict();

const sellFishOutcomeSchema = z
  .object({
    kind: z.literal("sell_fish"),
    name: z.string().min(1),
    quantity: positiveIntegerSchema,
    silver: nonnegativeIntegerSchema,
  })
  .strict();

const sellTreasureOutcomeSchema = z
  .object({
    kind: z.literal("sell_treasure"),
    item_id: farmKitchenInventoryIdSchema,
    name: z.string().min(1),
    quantity: positiveIntegerSchema,
    silver: nonnegativeIntegerSchema,
  })
  .strict();

export const farmKitchenInventoryActionOutcomeSchema = z.union([
  useSelfOutcomeSchema,
  useCatOutcomeSchema,
  useDogOutcomeSchema,
  recycleOutcomeSchema,
  stallOutcomeSchema,
  sellFishOutcomeSchema,
  sellTreasureOutcomeSchema,
]);

export const farmHumanKitchenInventoryActionResultSchema = z
  .object({
    receipt_id: farmKitchenInventoryActionIdempotencyKeySchema,
    action: farmKitchenInventoryActionSchema,
    outcome: farmKitchenInventoryActionOutcomeSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.action !== result.outcome.kind) {
      context.addIssue({
        code: "custom",
        path: ["outcome", "kind"],
        message: "outcome kind must match action",
      });
    }
  });

export const farmHumanKitchenInventoryActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanKitchenInventoryActionResultSchema,
        resource: farmKitchenDataSchema,
      })
      .strict(),
    kitchen_inventory_revision: farmKitchenInventoryActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmKitchenInventoryActionResultSchema = farmHumanKitchenInventoryActionResultSchema;
export const farmKitchenInventoryActionSuccessSchema = farmHumanKitchenInventoryActionSuccessSchema;

export const boundFarmKitchenInventoryActionSuccessSchema =
  farmHumanKitchenInventoryActionSuccessSchema;
export const boundKitchenInventoryActionSuccessSchema =
  boundFarmKitchenInventoryActionSuccessSchema;

const humanKitchenInventoryErrorCodes = [
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
] as const;

export const farmHumanKitchenInventoryActionErrorCodeSchema = z.enum(
  humanKitchenInventoryErrorCodes,
);

export const farmHumanKitchenInventoryActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenInventoryActionErrorCodeSchema,
        message: z.string(),
        current_kitchen_inventory_revision: farmKitchenInventoryActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();
export const farmKitchenInventoryActionErrorCodeSchema =
  farmHumanKitchenInventoryActionErrorCodeSchema;
export const farmKitchenInventoryActionErrorSchema = farmHumanKitchenInventoryActionErrorSchema;

const boundKitchenInventoryErrorCodes = [
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
] as const;

export const boundFarmKitchenInventoryActionErrorCodeSchema = z.enum(
  boundKitchenInventoryErrorCodes,
);

export const boundFarmKitchenInventoryActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenInventoryActionErrorCodeSchema,
        message: z.string(),
        current_kitchen_inventory_revision: farmKitchenInventoryActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmKitchenInventoryAction = z.infer<typeof farmKitchenInventoryActionSchema>;
export type FarmKitchenInventoryActionTarget = z.infer<
  typeof farmKitchenInventoryActionTargetSchema
>;
export type FarmKitchenInventoryItemKind = z.infer<typeof farmKitchenInventoryItemKindSchema>;
export type FarmKitchenInventoryActionIdempotencyKey = z.infer<
  typeof farmKitchenInventoryActionIdempotencyKeySchema
>;
export type FarmKitchenInventoryActionRevision = z.infer<
  typeof farmKitchenInventoryActionRevisionSchema
>;
export type FarmHumanKitchenInventoryActionRequest = z.infer<
  typeof farmHumanKitchenInventoryActionRequestSchema
>;
export type BoundFarmKitchenInventoryActionRequest = z.infer<
  typeof boundFarmKitchenInventoryActionRequestSchema
>;
export type FarmKitchenInventoryActionOutcome = z.infer<
  typeof farmKitchenInventoryActionOutcomeSchema
>;
export type FarmHumanKitchenInventoryActionResult = z.infer<
  typeof farmHumanKitchenInventoryActionResultSchema
>;
export type FarmKitchenInventoryActionResult = z.infer<
  typeof farmKitchenInventoryActionResultSchema
>;
export type FarmHumanKitchenInventoryActionSuccess = z.infer<
  typeof farmHumanKitchenInventoryActionSuccessSchema
>;
export type FarmKitchenInventoryActionSuccess = z.infer<
  typeof farmKitchenInventoryActionSuccessSchema
>;
export type BoundFarmKitchenInventoryActionSuccess = z.infer<
  typeof boundFarmKitchenInventoryActionSuccessSchema
>;
export type FarmHumanKitchenInventoryActionErrorCode = z.infer<
  typeof farmHumanKitchenInventoryActionErrorCodeSchema
>;
export type FarmHumanKitchenInventoryActionError = z.infer<
  typeof farmHumanKitchenInventoryActionErrorSchema
>;
export type BoundFarmKitchenInventoryActionErrorCode = z.infer<
  typeof boundFarmKitchenInventoryActionErrorCodeSchema
>;
export type BoundFarmKitchenInventoryActionError = z.infer<
  typeof boundFarmKitchenInventoryActionErrorSchema
>;
