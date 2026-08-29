import { z } from "zod";

const ranchIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const ranchTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Ranch display text must not contain HTML or URLs",
  });
const ranchStatusSchema = z.enum(["available", "unavailable"]);
const ranchItemStatusSchema = z.enum(["known", "unavailable"]);
const nullableCountSchema = z.number().int().nonnegative().nullable();

export const farmRanchOutputEntrySchema = z
  .object({
    status: ranchItemStatusSchema,
    item_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    pending_count: nullableCountSchema,
    unit_value: nullableCountSchema,
    boosted: z.boolean().nullable(),
  })
  .strict();

export const farmRanchProduceSchema = z
  .object({
    status: ranchStatusSchema,
    item: farmRanchOutputEntrySchema,
    meat: farmRanchOutputEntrySchema.nullable(),
  })
  .strict();

export const farmRanchOwnedAccessorySchema = z
  .object({
    status: ranchItemStatusSchema,
    accessory_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
  })
  .strict();

export const farmRanchResidentIdentitySchema = z
  .object({
    status: ranchItemStatusSchema,
    kind_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    custom_name: ranchTextSchema.nullable(),
  })
  .strict();

const farmRanchActionCurrencySchema = z.enum(["silver", "ranch_coins"]);

export const farmRanchResidentActionCostSchema = z
  .object({
    currency: farmRanchActionCurrencySchema.nullable(),
    amount: nullableCountSchema,
  })
  .strict()
  .superRefine((cost, context) => {
    if ((cost.currency === null) !== (cost.amount === null)) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "a resident action cost must expose both currency and amount, or neither",
      });
    }
  });

export const farmRanchResidentAllowedActionSchema = z
  .object({
    enabled: z.boolean(),
    cost: farmRanchResidentActionCostSchema,
    reason: ranchTextSchema.nullable(),
  })
  .strict()
  .superRefine((action, context) => {
    if (action.enabled && action.reason !== null) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "an enabled resident action must not expose an unavailable reason",
      });
    }
    if (!action.enabled && action.reason === null) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "a disabled resident action must expose an unavailable reason",
      });
    }
  });

export const farmRanchResidentAllowedActionsSchema = z
  .object({
    feed: farmRanchResidentAllowedActionSchema,
    upgrade: farmRanchResidentAllowedActionSchema,
    rename: farmRanchResidentAllowedActionSchema,
    toggle_pin: farmRanchResidentAllowedActionSchema,
    wear_accessory: farmRanchResidentAllowedActionSchema,
    takeoff_accessory: farmRanchResidentAllowedActionSchema,
    set_variant: farmRanchResidentAllowedActionSchema,
  })
  .strict();

export const farmRanchResidentVariantsSchema = z
  .object({
    current_variant_id: ranchIdSchema.nullable(),
    available_variant_ids: z.array(ranchIdSchema).max(16),
    available_variants: z
      .array(
        z
          .object({
            variant_id: ranchIdSchema,
            name: ranchTextSchema,
          })
          .strict(),
      )
      .max(16),
  })
  .strict();

export const farmRanchResidentSchema = z
  .object({
    status: ranchItemStatusSchema,
    identity: farmRanchResidentIdentitySchema,
    level: z.number().int().positive().nullable(),
    pinned: z.boolean().nullable(),
    accessories: z
      .object({
        status: ranchStatusSchema,
        items: z.array(farmRanchOwnedAccessorySchema).max(64),
      })
      .strict(),
    variants: farmRanchResidentVariantsSchema.optional(),
    allowed_actions: farmRanchResidentAllowedActionsSchema.optional(),
    produce: farmRanchProduceSchema.nullable(),
    dispatch: z
      .object({
        state: z.enum(["home", "active", "pending_settlement", "unavailable"]),
        raid_id: ranchIdSchema.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const farmRanchDispatchEntrySchema = z
  .object({
    status: ranchItemStatusSchema,
    state: z.enum(["active", "pending_settlement", "unavailable"]),
    raid_id: ranchIdSchema.nullable(),
    animal_kind_id: ranchIdSchema.nullable(),
    animal_name: ranchTextSchema.nullable(),
    started_at: z.iso.datetime().nullable(),
    ends_at: z.iso.datetime().nullable(),
    remaining_ms: nullableCountSchema,
    reserved_coins: nullableCountSchema,
  })
  .strict();

export const farmRanchShopAnimalSchema = z
  .object({
    status: ranchItemStatusSchema,
    kind_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    category: ranchTextSchema.nullable(),
    price: nullableCountSchema,
    owned: z.boolean().nullable(),
    available_quantity: nullableCountSchema,
  })
  .strict();

export const farmRanchShopPetSchema = farmRanchShopAnimalSchema;

export const farmRanchShopSkinSchema = z
  .object({
    status: ranchItemStatusSchema,
    skin_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    target_type: z.enum(["animal", "pet"]).nullable(),
    target_kind_id: ranchIdSchema.nullable(),
    price: nullableCountSchema,
    owned: z.boolean().nullable(),
    available_quantity: nullableCountSchema,
    starts_at: z.iso.datetime().nullable(),
    ends_at: z.iso.datetime().nullable(),
  })
  .strict();

export const farmRanchShopAccessorySchema = z
  .object({
    status: ranchItemStatusSchema,
    accessory_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    price: nullableCountSchema,
    owned: z.boolean().nullable(),
    available_quantity: nullableCountSchema,
  })
  .strict();

export const farmRanchShopDecorationSchema = z
  .object({
    status: ranchItemStatusSchema,
    decoration_id: ranchIdSchema.nullable(),
    name: ranchTextSchema.nullable(),
    price: nullableCountSchema,
    owned: z.boolean().nullable(),
    available_quantity: nullableCountSchema,
  })
  .strict();

const farmRanchShopSectionBase = {
  status: ranchStatusSchema,
  shop_day: nullableCountSchema,
};

export const farmRanchShopAnimalsSchema = z
  .object({
    ...farmRanchShopSectionBase,
    items: z.array(farmRanchShopAnimalSchema).max(128),
  })
  .strict();

export const farmRanchShopPetsSchema = z
  .object({
    ...farmRanchShopSectionBase,
    items: z.array(farmRanchShopPetSchema).max(128),
  })
  .strict();

export const farmRanchShopSkinsSchema = z
  .object({
    ...farmRanchShopSectionBase,
    items: z.array(farmRanchShopSkinSchema).max(32),
  })
  .strict();

export const farmRanchShopAccessoriesSchema = z
  .object({
    ...farmRanchShopSectionBase,
    items: z.array(farmRanchShopAccessorySchema).max(128),
  })
  .strict();

export const farmRanchShopDecorationsSchema = z
  .object({
    ...farmRanchShopSectionBase,
    items: z.array(farmRanchShopDecorationSchema).max(128),
  })
  .strict();

export const farmRanchDataSchema = z
  .object({
    farm: z
      .object({
        farm_doorplate: z
          .string()
          .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
          .nullable(),
      })
      .strict(),
    balance: z
      .object({
        status: ranchStatusSchema,
        ranch_coins: nullableCountSchema,
        debt_status: ranchStatusSchema,
        debt_coins: nullableCountSchema,
      })
      .strict(),
    residents: z
      .object({
        status: ranchStatusSchema,
        animals: z.array(farmRanchResidentSchema).max(128),
        pets: z.array(farmRanchResidentSchema).max(64),
        patrol_goose: farmRanchResidentSchema.nullable(),
      })
      .strict(),
    collectable: z
      .object({
        status: ranchStatusSchema,
        total_pending_count: nullableCountSchema,
        total_pending_meat_count: nullableCountSchema,
        entries: z
          .array(
            z
              .object({
                resident_type: z.literal("animal"),
                kind_id: ranchIdSchema,
                item_id: ranchIdSchema,
                name: ranchTextSchema,
                pending_count: z.number().int().positive(),
                unit_value: nullableCountSchema,
                meat: z.boolean(),
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
    wardrobe: z
      .object({
        status: ranchStatusSchema,
        items: z.array(farmRanchOwnedAccessorySchema).max(128),
      })
      .strict(),
    decorations: z
      .object({
        status: ranchStatusSchema,
        placed: z
          .array(
            z
              .object({
                status: ranchItemStatusSchema,
                decoration_id: ranchIdSchema.nullable(),
                name: ranchTextSchema.nullable(),
              })
              .strict(),
          )
          .max(128),
        stored: z
          .array(
            z
              .object({
                status: ranchItemStatusSchema,
                decoration_id: ranchIdSchema.nullable(),
                name: ranchTextSchema.nullable(),
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
    dispatch: z
      .object({
        status: ranchStatusSchema,
        active: z.array(farmRanchDispatchEntrySchema).max(128),
      })
      .strict(),
    shop: z
      .object({
        animals: farmRanchShopAnimalsSchema,
        pets: farmRanchShopPetsSchema,
        skins: farmRanchShopSkinsSchema,
        accessories: farmRanchShopAccessoriesSchema,
        decorations: farmRanchShopDecorationsSchema,
      })
      .strict(),
  })
  .strict();

export const farmHumanRanchReadSuccessSchema = z
  .object({
    data: farmRanchDataSchema,
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmRanchSuccessSchema = farmHumanRanchReadSuccessSchema;
export const boundRanchReadSuccessSchema = farmHumanRanchReadSuccessSchema;

export const farmHumanRanchReadRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/),
  })
  .strict();

export const boundFarmRanchReadRequestSchema = z.object({}).strict();
export const boundRanchReadRequestSchema = boundFarmRanchReadRequestSchema;

export const farmHumanRanchReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanRanchReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanRanchReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundFarmRanchErrorCodeSchema = z.enum([
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
export const boundRanchReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmRanchErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();
export const boundFarmRanchErrorSchema = boundRanchReadErrorSchema;

export type FarmRanchData = z.infer<typeof farmRanchDataSchema>;
export type FarmRanchResidentActionCost = z.infer<typeof farmRanchResidentActionCostSchema>;
export type FarmRanchResidentAllowedAction = z.infer<typeof farmRanchResidentAllowedActionSchema>;
export type FarmRanchResidentAllowedActions = z.infer<typeof farmRanchResidentAllowedActionsSchema>;
export type FarmRanchResidentVariants = z.infer<typeof farmRanchResidentVariantsSchema>;
export type FarmHumanRanchReadRequest = z.infer<typeof farmHumanRanchReadRequestSchema>;
export type FarmHumanRanchReadSuccess = z.infer<typeof farmHumanRanchReadSuccessSchema>;
export type FarmHumanRanchReadError = z.infer<typeof farmHumanRanchReadErrorSchema>;
export type BoundFarmRanchSuccess = z.infer<typeof boundFarmRanchSuccessSchema>;
export type BoundFarmRanchError = z.infer<typeof boundFarmRanchErrorSchema>;
