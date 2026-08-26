import { z } from "zod";

const farmKitchenDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

export const farmKitchenAvailabilitySchema = z.enum(["available", "unavailable"]);

export const farmKitchenUnavailableReasonSchema = z.enum([
  "not_initialized",
  "not_persisted",
  "stale_shop",
  "invalid_shape",
  "invalid_value",
  "unknown_id",
]);

const farmKitchenRaritySchema = z.enum(["N", "R", "SR", "SSR", "SP"]);

export const farmKitchenScalarSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    value: z.number().int().nonnegative().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenBalanceSchema = z
  .object({
    silver: farmKitchenScalarSchema,
    ranch_coins: farmKitchenScalarSchema,
  })
  .strict();

export const farmKitchenToolSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    tool_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    price_silver: z.number().int().nonnegative().nullable(),
    owned: z.boolean().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenStackedIngredientSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    ingredient_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    quantity: z.number().int().nonnegative().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenProductInstanceSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    product_instance_id: z.string().min(1),
    product_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    value_gold: z.number().int().nonnegative().nullable(),
    created_at: z.iso.datetime().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenFishInstanceSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    catch_instance_id: z.string().min(1),
    fish_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    size: z.number().int().positive().nullable(),
    raw_value: z.number().int().nonnegative().nullable(),
    sell_silver: z.number().int().nonnegative().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenTreasureItemSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    item_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    quantity: z.number().int().nonnegative().nullable(),
    sellable: z.boolean().nullable(),
    sell_silver: z.number().int().nonnegative().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenRecipeIngredientSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    ingredient_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    quantity: z.number().int().positive().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenRecipeRequirementSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    id: z.string().min(1).nullable(),
    name: z.string().min(1).nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

const farmKitchenRecipeFields = {
  status: farmKitchenAvailabilitySchema,
  recipe_id: z.string().min(1),
  name: z.string().min(1).nullable(),
  rarity: farmKitchenRaritySchema.nullable(),
  category: z.string().min(1).nullable(),
  ingredients: z.array(farmKitchenRecipeIngredientSchema),
  method: farmKitchenRecipeRequirementSchema,
  tool: farmKitchenRecipeRequirementSchema,
  reason: farmKitchenUnavailableReasonSchema.nullable(),
};

export const farmKitchenRecipeSchema = z.object(farmKitchenRecipeFields).strict();

export const farmKitchenShopIngredientSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    ingredient_id: z.string().min(1),
    name: z.string().min(1).nullable(),
    price_silver: z.number().int().nonnegative().nullable(),
    daily_buy_limit: z.number().int().positive().nullable(),
    bought_quantity: z.number().int().nonnegative().nullable(),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenShopRecipeSchema = z
  .object({
    ...farmKitchenRecipeFields,
    price_silver: z.number().int().nonnegative().nullable(),
    known: z.boolean().nullable(),
  })
  .strict();

function sectionSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      status: farmKitchenAvailabilitySchema,
      items: z.array(itemSchema),
      reason: farmKitchenUnavailableReasonSchema.nullable(),
    })
    .strict();
}

export const farmKitchenToolsSchema = sectionSchema(farmKitchenToolSchema);
export const farmKitchenStackedIngredientsSchema = sectionSchema(
  farmKitchenStackedIngredientSchema,
);
export const farmKitchenProductInstancesSchema = sectionSchema(farmKitchenProductInstanceSchema);
export const farmKitchenFishInstancesSchema = sectionSchema(farmKitchenFishInstanceSchema);
export const farmKitchenTreasureItemsSchema = sectionSchema(farmKitchenTreasureItemSchema);
export const farmKitchenDishesSchema = sectionSchema(
  farmKitchenRecipeSchema.extend({
    dish_instance_id: z.string().min(1),
    value_gold: z.number().int().nonnegative().nullable(),
    recycle_silver: z.number().int().nonnegative().nullable(),
    created_at: z.iso.datetime().nullable(),
  }),
);
export const farmKitchenKnownRecipesSchema = sectionSchema(farmKitchenRecipeSchema);

export const farmKitchenDailyShopSchema = z
  .object({
    status: farmKitchenAvailabilitySchema,
    stored_day_index: z.number().int().nullable(),
    current_day_index: z.number().int(),
    is_current_day: z.boolean(),
    refresh_at: z.iso.datetime(),
    refresh_window_id: z.number().int(),
    refresh_used_count: z.number().int().nonnegative().nullable(),
    refresh_remaining_count: z.number().int().nonnegative().nullable(),
    refresh_limit: z.number().int().positive().nullable(),
    next_cost_coins: z.number().int().nonnegative().nullable(),
    can_refresh: z.boolean(),
    refresh_reset_at: z.iso.datetime(),
    ingredients: z.array(farmKitchenShopIngredientSchema),
    recipes: z.array(farmKitchenShopRecipeSchema),
    reason: farmKitchenUnavailableReasonSchema.nullable(),
  })
  .strict();

export const farmKitchenDataSchema = z
  .object({
    farm: z
      .object({
        farm_doorplate: farmKitchenDoorplateSchema,
        farm_name: z.string().nullable(),
      })
      .strict(),
    balance: farmKitchenBalanceSchema,
    tools: farmKitchenToolsSchema,
    stacked_ingredients: farmKitchenStackedIngredientsSchema,
    product_instances: farmKitchenProductInstancesSchema,
    fish_instances: farmKitchenFishInstancesSchema,
    treasure_items: farmKitchenTreasureItemsSchema,
    dish_instances: farmKitchenDishesSchema,
    known_recipes: farmKitchenKnownRecipesSchema,
    daily_shop: farmKitchenDailyShopSchema,
  })
  .strict();

export const farmHumanKitchenReadRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmKitchenDoorplateSchema,
  })
  .strict();

export const farmKitchenShopRevisionSchema = z.string().regex(/^kitchen-v1:[0-9a-f]{64}$/);
export const farmKitchenInventoryRevisionSchema = z
  .string()
  .regex(/^kitchen-inventory-v1:[0-9a-f]{64}$/);

export const farmHumanKitchenReadSuccessSchema = z
  .object({
    data: farmKitchenDataSchema,
    kitchen_inventory_revision: farmKitchenInventoryRevisionSchema,
    shop_revision: farmKitchenShopRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanKitchenReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanKitchenReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundFarmKitchenReadRequestSchema = z.object({}).strict();
export const boundFarmKitchenReadSuccessSchema = farmHumanKitchenReadSuccessSchema;
export const boundFarmKitchenReadErrorCodeSchema = z.enum([
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
export const boundFarmKitchenReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type FarmKitchenAvailability = z.infer<typeof farmKitchenAvailabilitySchema>;
export type FarmKitchenUnavailableReason = z.infer<typeof farmKitchenUnavailableReasonSchema>;
export type FarmKitchenInventoryRevision = z.infer<typeof farmKitchenInventoryRevisionSchema>;
export type FarmKitchenData = z.infer<typeof farmKitchenDataSchema>;
export type FarmKitchenRecipe = z.infer<typeof farmKitchenRecipeSchema>;
export type FarmHumanKitchenReadRequest = z.infer<typeof farmHumanKitchenReadRequestSchema>;
export type FarmHumanKitchenReadSuccess = z.infer<typeof farmHumanKitchenReadSuccessSchema>;
export type FarmHumanKitchenReadErrorCode = z.infer<typeof farmHumanKitchenReadErrorCodeSchema>;
export type FarmHumanKitchenReadError = z.infer<typeof farmHumanKitchenReadErrorSchema>;
export type BoundFarmKitchenReadRequest = z.infer<typeof boundFarmKitchenReadRequestSchema>;
export type BoundFarmKitchenReadSuccess = z.infer<typeof boundFarmKitchenReadSuccessSchema>;
export type BoundFarmKitchenReadErrorCode = z.infer<typeof boundFarmKitchenReadErrorCodeSchema>;
export type BoundFarmKitchenReadError = z.infer<typeof boundFarmKitchenReadErrorSchema>;
