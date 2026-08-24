import { z } from "zod";

/**
 * Structured, read-only Human catalog data for the farm UI.
 *
 * This module intentionally does not describe any write action.  A section can
 * be unavailable when the farm has no authoritative, side-effect-free source
 * for it; an available section may still contain an empty list.
 */

export const farmCatalogDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
export const farmCatalogHumanKeySchema = z.string().min(1);

export const farmCatalogSectionUnavailableReasonSchema = z.enum([
  "not_initialized",
  "no_authoritative_data",
  "unknown_identity",
  "upstream_unavailable",
]);

export const farmCatalogUnavailableSectionSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: farmCatalogSectionUnavailableReasonSchema,
    message: z.string().min(1),
  })
  .strict();

export const farmCatalogItemIdentityStateSchema = z.enum(["known", "unavailable"]);
export const farmCatalogRaritySchema = z.enum(["N", "R", "SR", "SSR", "SP", "OR"]);
export const farmCatalogCurrencySchema = z.enum(["gold", "silver"]);

export const farmCatalogShopItemSchema = z
  .object({
    kind: z.enum(["seed", "potion", "potion_set", "recipe"]),
    item_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    rarity: farmCatalogRaritySchema.nullable(),
    price: z.number().int().nonnegative().nullable(),
    currency: farmCatalogCurrencySchema.nullable(),
    quantity: z.number().int().nonnegative().nullable(),
    available_quantity: z.number().int().nonnegative().nullable(),
    daily_limit: z.number().int().nonnegative().nullable(),
    purchased_today: z.number().int().nonnegative().nullable(),
    condition: z.string().nullable(),
    source: z.enum(["permanent", "persisted"]),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.identity_state === "known" && item.name === null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "a known shop item must have a name",
      });
    }
    if (item.identity_state === "unavailable" && item.name !== null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "an unavailable shop item must not guess a name",
      });
    }
  });

export const farmCatalogShopAvailableSchema = z
  .object({
    status: z.literal("available"),
    initialized: z.literal(true),
    revision: z.string().min(1),
    refreshed_at: z.iso.datetime().nullable(),
    next_refresh_at: z.iso.datetime().nullable(),
    items: z.array(farmCatalogShopItemSchema),
  })
  .strict();

export const farmCatalogShopSchema = z.union([
  farmCatalogShopAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogInventoryItemSchema = z
  .object({
    kind: z.enum(["seed", "material", "item"]),
    item_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    rarity: farmCatalogRaritySchema.nullable(),
    quantity: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.identity_state === "known" && item.name === null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "a known inventory item must have a name",
      });
    }
    if (item.identity_state === "unavailable" && item.name !== null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "an unavailable inventory item must not guess a name",
      });
    }
  });

export const farmCatalogBackpackAvailableSchema = z
  .object({
    status: z.literal("available"),
    items: z.array(farmCatalogInventoryItemSchema),
  })
  .strict();

export const farmCatalogBackpackSchema = z.union([
  farmCatalogBackpackAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogCodexEntrySchema = z
  .object({
    crop_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    latin_name: z.string().nullable(),
    description: z.string().nullable(),
    category: z.enum(["common", "fantasy", "limited", "ugc"]).nullable(),
    rarity: farmCatalogRaritySchema.nullable(),
    grow_ticks: z.number().int().positive().nullable(),
    seed_price: z.number().int().nonnegative().nullable(),
    sell_price: z.number().int().nonnegative().nullable(),
    unlock_condition: z.string().nullable(),
    discovered: z.boolean(),
    discovery_count: z.number().int().nonnegative().nullable(),
    best_quality: z.number().int().nonnegative().nullable(),
    first_discovered_at: z.iso.datetime().nullable(),
    starred: z.boolean(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.identity_state === "known" && entry.name === null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "a known crop must have a name",
      });
    }
    if (entry.identity_state === "unavailable" && entry.name !== null) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "an unavailable crop must not guess a name",
      });
    }
  });

export const farmCatalogCodexAvailableSchema = z
  .object({
    status: z.literal("available"),
    entries: z.array(farmCatalogCodexEntrySchema),
  })
  .strict();

export const farmCatalogCodexSchema = z.union([
  farmCatalogCodexAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogTitleSchema = z.discriminatedUnion("identity_state", [
  z
    .object({
      identity_state: z.literal("known"),
      title_id: z.string().min(1),
      name: z.string().min(1),
    })
    .strict(),
  z
    .object({
      identity_state: z.literal("unavailable"),
      title_id: z.string().min(1),
      name: z.null(),
    })
    .strict(),
]);

export const farmCatalogSocialSettingsSchema = z
  .object({
    visit: z.boolean().nullable(),
    steal: z.boolean().nullable(),
    water: z.boolean().nullable(),
    message: z.boolean().nullable(),
  })
  .strict();

export const farmCatalogSettingsAvailableSchema = z
  .object({
    status: z.literal("available"),
    farm_name: z.string(),
    ai_name: z.string().nullable(),
    human_name: z.string().nullable(),
    welcome_message: z.string().nullable(),
    equipped_title: farmCatalogTitleSchema.nullable(),
    unlocked_titles: z.array(farmCatalogTitleSchema),
    social: farmCatalogSocialSettingsSchema,
  })
  .strict();

export const farmCatalogSettingsSchema = z.union([
  farmCatalogSettingsAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogSmeltingMaterialSchema = z
  .object({
    material_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    rarity: farmCatalogRaritySchema.nullable(),
    quantity: z.number().int().nonnegative(),
  })
  .strict();

export const farmCatalogSmeltingRecipeSchema = z
  .object({
    recipe_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    output_crop_id: z.string().min(1).nullable(),
    output_name: z.string().min(1).nullable(),
    materials: z.array(z.string().min(1)),
    known: z.boolean(),
    can_start: z.boolean(),
  })
  .strict();

export const farmCatalogSmeltingAvailableSchema = z
  .object({
    status: z.literal("available"),
    write_status: z.literal("unavailable"),
    materials: z.array(farmCatalogSmeltingMaterialSchema),
    recipes: z.array(farmCatalogSmeltingRecipeSchema),
  })
  .strict();

export const farmCatalogSmeltingSchema = z.union([
  farmCatalogSmeltingAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogExpeditionLogEntrySchema = z
  .object({
    event_id: z.string().min(1).nullable(),
    title: z.string().min(1).nullable(),
    text: z.string(),
    at: z.iso.datetime().nullable(),
  })
  .strict();

export const farmCatalogExpeditionJourneySchema = z
  .object({
    map_id: z.string().min(1).nullable(),
    map_name: z.string().min(1).nullable(),
    at: z.iso.datetime().nullable(),
    summary: z.string(),
    log: z.array(farmCatalogExpeditionLogEntrySchema),
  })
  .strict();

export const farmCatalogExpeditionPendingSchema = z
  .object({
    kind: z.enum(["choice", "combat"]),
    event_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    title: z.string().min(1).nullable(),
    options: z
      .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).strict())
      .nullable(),
    foe: z.string().nullable(),
    difficulty: z.enum(["easy", "mid", "hard"]).nullable(),
  })
  .strict();

export const farmCatalogExpeditionDropSchema = z
  .object({
    kind: z.enum(["coins", "silver", "potion", "decor"]),
    quantity: z.number().int().nonnegative().nullable(),
    item_id: z.string().min(1).nullable(),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
  })
  .strict();

export const farmCatalogExpeditionAvailableSchema = z
  .object({
    status: z.literal("available"),
    daily_limit: z.number().int().nonnegative(),
    used_today: z.number().int().nonnegative(),
    remaining_today: z.number().int().nonnegative(),
    active: z.boolean(),
    map_id: z.string().min(1).nullable(),
    map_name: z.string().min(1).nullable(),
    step: z.number().int().nonnegative().nullable(),
    hp: z.number().int().nonnegative().nullable(),
    pending: farmCatalogExpeditionPendingSchema.nullable(),
    bag: z.array(farmCatalogExpeditionDropSchema),
    seen_event_ids: z.array(z.string().min(1)),
    log: z.array(farmCatalogExpeditionLogEntrySchema),
    journeys: z.array(farmCatalogExpeditionJourneySchema),
  })
  .strict();

export const farmCatalogExpeditionSchema = z.union([
  farmCatalogExpeditionAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogBulletinMessageSchema = z
  .object({
    id: z.string().min(1).nullable(),
    author_farm_doorplate: farmCatalogDoorplateSchema.nullable(),
    author_name: z.string().nullable(),
    text: z.string().min(1),
    at: z.iso.datetime().nullable(),
  })
  .strict();

export const farmCatalogBulletinNoticeSchema = z
  .object({
    text: z.string().min(1),
    at: z.iso.datetime().nullable(),
    section: z.string().min(1).nullable(),
  })
  .strict();

export const farmCatalogBulletinAvailableSchema = z
  .object({
    status: z.literal("available"),
    messages: z.array(farmCatalogBulletinMessageSchema),
    ranch_notices: z.array(farmCatalogBulletinNoticeSchema),
    tasks: farmCatalogUnavailableSectionSchema,
    mature_broadcast: farmCatalogUnavailableSectionSchema,
  })
  .strict();

export const farmCatalogBulletinSchema = z.union([
  farmCatalogBulletinAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogNeighborhoodRankingRowSchema = z
  .object({
    farm_doorplate: farmCatalogDoorplateSchema,
    farm_name: z.string().min(1),
    value: z.number().int().nonnegative(),
    equipped_title: z.string().nullable(),
  })
  .strict();

export const farmCatalogNeighborhoodOriginalCropSchema = z
  .object({
    crop_id: z.string().min(1),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    designer_name: z.string().nullable(),
    buyers: z.number().int().nonnegative().nullable(),
    banned: z.boolean().nullable(),
  })
  .strict();

export const farmCatalogNeighborhoodAvailableSchema = z
  .object({
    status: z.literal("available"),
    rankings: z.record(z.string(), z.array(farmCatalogNeighborhoodRankingRowSchema)),
    messages: z.array(farmCatalogBulletinMessageSchema),
    original_crops: z.array(farmCatalogNeighborhoodOriginalCropSchema),
  })
  .strict();

export const farmCatalogNeighborhoodSchema = z.union([
  farmCatalogNeighborhoodAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogMarketListingSchema = z
  .object({
    seller_farm_doorplate: farmCatalogDoorplateSchema,
    kind: z.enum(["seed", "material", "ingredient", "dish"]),
    item_id: z.string().min(1).nullable(),
    identity_state: farmCatalogItemIdentityStateSchema,
    name: z.string().min(1).nullable(),
    rarity: farmCatalogRaritySchema.nullable(),
    quantity: z.number().int().nonnegative(),
    price: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const farmCatalogMarketAvailableSchema = z
  .object({
    status: z.literal("available"),
    listings: z.array(farmCatalogMarketListingSchema),
  })
  .strict();

export const farmCatalogMarketSchema = z.union([
  farmCatalogMarketAvailableSchema,
  farmCatalogUnavailableSectionSchema,
]);

export const farmCatalogDataSchema = z
  .object({
    farm: z
      .object({
        farm_doorplate: farmCatalogDoorplateSchema,
        farm_name: z.string(),
      })
      .strict(),
    shop: farmCatalogShopSchema,
    backpack: farmCatalogBackpackSchema,
    codex: farmCatalogCodexSchema,
    settings: farmCatalogSettingsSchema,
    expedition: farmCatalogExpeditionSchema,
    smelting: farmCatalogSmeltingSchema,
    bulletin: farmCatalogBulletinSchema,
    neighborhood: farmCatalogNeighborhoodSchema,
    market: farmCatalogMarketSchema,
  })
  .strict();

export const farmHumanCatalogReadRequestSchema = z
  .object({
    farm_human_key: farmCatalogHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
  })
  .strict();

export const farmHumanCatalogReadSuccessSchema = z
  .object({
    data: farmCatalogDataSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanCatalogReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanCatalogReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanCatalogReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

// The browser façade shares the success payload, but its failures describe
// Doorbell session/eligibility state rather than farm-internal credentials.
export const boundFarmCatalogReadSuccessSchema = farmHumanCatalogReadSuccessSchema;
export const boundFarmCatalogReadErrorCodeSchema = z.enum([
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
export const boundFarmCatalogReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmCatalogReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();
export const boundFarmCatalogReadRequestSchema = z.object({}).strict();

export type FarmCatalogData = z.infer<typeof farmCatalogDataSchema>;
export type FarmHumanCatalogReadRequest = z.infer<typeof farmHumanCatalogReadRequestSchema>;
export type FarmHumanCatalogReadSuccess = z.infer<typeof farmHumanCatalogReadSuccessSchema>;
export type FarmHumanCatalogReadErrorCode = z.infer<typeof farmHumanCatalogReadErrorCodeSchema>;
export type FarmHumanCatalogReadError = z.infer<typeof farmHumanCatalogReadErrorSchema>;
export type BoundFarmCatalogReadRequest = z.infer<typeof boundFarmCatalogReadRequestSchema>;
export type BoundFarmCatalogReadSuccess = z.infer<typeof boundFarmCatalogReadSuccessSchema>;
export type BoundFarmCatalogReadError = z.infer<typeof boundFarmCatalogReadErrorSchema>;
export type BoundFarmCatalogReadErrorCode = z.infer<typeof boundFarmCatalogReadErrorCodeSchema>;
