import { z } from "zod";
import {
  farmCatalogDataSchema,
  farmCatalogDoorplateSchema,
  farmCatalogMarketPurchaseOrderKindSchema,
  farmCatalogMarketRevisionSchema,
} from "./farm-catalog.js";

export const farmMarketActionSchema = z.enum([
  "browse",
  "list",
  "buy",
  "unlist",
  "barter-list",
  "barter-accept",
  "barter-unlist",
  "purchase-order-list",
  "purchase-order-fulfill",
  "purchase-order-unlist",
  "mystery-merchant-buy",
]);

export const farmMarketSupportedActionSchema = z.enum([
  "browse",
  "list",
  "buy",
  "unlist",
  "barter-list",
  "barter-accept",
  "barter-unlist",
  "purchase-order-list",
  "purchase-order-fulfill",
  "purchase-order-unlist",
  "mystery-merchant-buy",
]);

export const farmMarketListingKindSchema = z.enum(["seed", "material", "ingredient", "dish"]);
export const farmMarketPurchaseOrderKindSchema = farmCatalogMarketPurchaseOrderKindSchema;
export const farmMysteryMerchantKindSchema = z.enum(["material", "seed", "potion_set"]);

export const farmMarketActionIdempotencyKeySchema = z.uuid();
export const farmMarketActionRevisionSchema = farmCatalogMarketRevisionSchema;

const farmHumanKeySchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Farm human key must not contain only whitespace",
});
const marketItemIdSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Market item id must not contain only whitespace",
});
const positiveIntegerSchema = z.number().int().positive();
const mysteryMerchantItemsSchema = z.array(marketItemIdSchema).min(1).superRefine((items, context) => {
  if (new Set(items).size !== items.length) {
    context.addIssue({ code: "custom", message: "mystery merchant items must be unique" });
  }
});

const marketActionFields = {
  expected_revision: farmMarketActionRevisionSchema,
};

const humanIdentityFields = {
  farm_human_key: farmHumanKeySchema,
  expected_farm_doorplate: farmCatalogDoorplateSchema,
  idempotency_key: farmMarketActionIdempotencyKeySchema,
};

const listActionFields = {
  action: z.literal("list"),
  kind: farmMarketListingKindSchema,
  item_id: marketItemIdSchema,
  qty: positiveIntegerSchema,
  price: positiveIntegerSchema.optional(),
};

function validateListPrice(
  value: { kind: z.infer<typeof farmMarketListingKindSchema>; price?: number | undefined },
  context: z.RefinementCtx,
): void {
  const stacked = value.kind === "seed" || value.kind === "material";
  if (stacked && value.price !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["price"],
      message: "stacked market listings must not include a price",
    });
  }
  if (!stacked && value.price === undefined) {
    context.addIssue({
      code: "custom",
      path: ["price"],
      message: "ingredient and dish market listings require a price",
    });
  }
}

const boundBrowseRequestSchema = z
  .object({ ...marketActionFields, action: z.literal("browse") })
  .strict();
const boundListRequestSchema = z
  .object({ ...marketActionFields, ...listActionFields })
  .strict()
  .superRefine(validateListPrice);
const boundBuyRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("buy"),
    seller_doorplate: farmCatalogDoorplateSchema,
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
    qty: positiveIntegerSchema,
  })
  .strict();
const boundUnlistRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("unlist"),
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
  })
  .strict();
const boundBarterListRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("barter-list"),
    give_kind: farmMarketListingKindSchema,
    give_item_id: marketItemIdSchema,
    give_qty: positiveIntegerSchema,
    want_kind: farmMarketListingKindSchema,
    want_item_id: marketItemIdSchema,
    want_qty: positiveIntegerSchema,
  })
  .strict();
const boundBarterAcceptRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("barter-accept"),
    seller_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const boundBarterUnlistRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("barter-unlist"),
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const boundPurchaseOrderListRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("purchase-order-list"),
    kind: farmMarketPurchaseOrderKindSchema,
    item_id: marketItemIdSchema,
    qty: positiveIntegerSchema,
    price: positiveIntegerSchema,
  })
  .strict();
const boundPurchaseOrderFulfillRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("purchase-order-fulfill"),
    order_owner_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
    qty: positiveIntegerSchema,
  })
  .strict();
const boundPurchaseOrderUnlistRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("purchase-order-unlist"),
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const boundMysteryMerchantBuyRequestSchema = z
  .object({
    ...marketActionFields,
    action: z.literal("mystery-merchant-buy"),
    items: mysteryMerchantItemsSchema,
  })
  .strict();
export const boundFarmMarketActionRequestSchema = z.union([
  boundBrowseRequestSchema,
  boundListRequestSchema,
  boundBuyRequestSchema,
  boundUnlistRequestSchema,
  boundBarterListRequestSchema,
  boundBarterAcceptRequestSchema,
  boundBarterUnlistRequestSchema,
  boundPurchaseOrderListRequestSchema,
  boundPurchaseOrderFulfillRequestSchema,
  boundPurchaseOrderUnlistRequestSchema,
  boundMysteryMerchantBuyRequestSchema,
]);

const humanBrowseRequestSchema = z
  .object({ ...humanIdentityFields, ...marketActionFields, action: z.literal("browse") })
  .strict();
const humanListRequestSchema = z
  .object({ ...humanIdentityFields, ...marketActionFields, ...listActionFields })
  .strict()
  .superRefine(validateListPrice);
const humanBuyRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("buy"),
    seller_doorplate: farmCatalogDoorplateSchema,
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
    qty: positiveIntegerSchema,
  })
  .strict();
const humanUnlistRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("unlist"),
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
  })
  .strict();
const humanBarterListRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("barter-list"),
    give_kind: farmMarketListingKindSchema,
    give_item_id: marketItemIdSchema,
    give_qty: positiveIntegerSchema,
    want_kind: farmMarketListingKindSchema,
    want_item_id: marketItemIdSchema,
    want_qty: positiveIntegerSchema,
  })
  .strict();
const humanBarterAcceptRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("barter-accept"),
    seller_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const humanBarterUnlistRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("barter-unlist"),
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const humanPurchaseOrderListRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("purchase-order-list"),
    kind: farmMarketPurchaseOrderKindSchema,
    item_id: marketItemIdSchema,
    qty: positiveIntegerSchema,
    price: positiveIntegerSchema,
  })
  .strict();
const humanPurchaseOrderFulfillRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("purchase-order-fulfill"),
    order_owner_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
    qty: positiveIntegerSchema,
  })
  .strict();
const humanPurchaseOrderUnlistRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("purchase-order-unlist"),
    listing_id: farmMarketActionIdempotencyKeySchema,
  })
  .strict();
const humanMysteryMerchantBuyRequestSchema = z
  .object({
    ...humanIdentityFields,
    ...marketActionFields,
    action: z.literal("mystery-merchant-buy"),
    items: mysteryMerchantItemsSchema,
  })
  .strict();
export const farmHumanMarketActionRequestSchema = z.union([
  humanBrowseRequestSchema,
  humanListRequestSchema,
  humanBuyRequestSchema,
  humanUnlistRequestSchema,
  humanBarterListRequestSchema,
  humanBarterAcceptRequestSchema,
  humanBarterUnlistRequestSchema,
  humanPurchaseOrderListRequestSchema,
  humanPurchaseOrderFulfillRequestSchema,
  humanPurchaseOrderUnlistRequestSchema,
  humanMysteryMerchantBuyRequestSchema,
]);

const marketActionOutcomeItemSchema = z
  .object({
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
    quantity: positiveIntegerSchema,
    name: z.string().min(1),
  })
  .strict();

const marketListOutcomeSchema = marketActionOutcomeItemSchema.extend({
  price: positiveIntegerSchema,
});

const marketBarterListOutcomeSchema = z
  .object({
    listing_id: farmMarketActionIdempotencyKeySchema,
    give: marketActionOutcomeItemSchema,
    want: marketActionOutcomeItemSchema,
  })
  .strict();

const marketBarterUnlistOutcomeSchema = z
  .object({
    listing_id: farmMarketActionIdempotencyKeySchema,
    give: marketActionOutcomeItemSchema,
  })
  .strict();

const marketPurchaseOrderListOutcomeSchema = z
  .object({
    listing_id: farmMarketActionIdempotencyKeySchema,
    kind: farmMarketPurchaseOrderKindSchema,
    item_id: marketItemIdSchema,
    quantity: positiveIntegerSchema,
    filled_quantity: z.number().int().nonnegative(),
    price: positiveIntegerSchema,
    name: z.string().min(1),
  })
  .strict();

const marketPurchaseOrderUnlistOutcomeSchema = z
  .object({
    listing_id: farmMarketActionIdempotencyKeySchema,
    kind: farmMarketPurchaseOrderKindSchema,
    item_id: marketItemIdSchema,
    quantity: positiveIntegerSchema,
    filled_quantity: z.number().int().nonnegative(),
    price: positiveIntegerSchema,
  })
  .strict();

const marketMysteryMerchantBuyOutcomeSchema = z
  .object({
    items: z.array(z.object({
      kind: farmMysteryMerchantKindSchema,
      item_id: marketItemIdSchema,
      name: z.string().min(1),
      granted_quantity: positiveIntegerSchema,
      currency: z.enum(["gold", "silver"]),
      unit_price: positiveIntegerSchema,
      cost: positiveIntegerSchema,
    }).strict()).min(1),
    costs: z.object({
      gold: z.number().int().nonnegative(),
      silver: z.number().int().nonnegative(),
    }).strict(),
    host_farm_doorplate: farmCatalogDoorplateSchema,
  })
  .strict();

export const farmMarketActionResultSchema = z.discriminatedUnion("action", [
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("browse"),
      outcome: z.null(),
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("list"),
      outcome: marketListOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("unlist"),
      outcome: marketActionOutcomeItemSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("barter-list"),
      outcome: marketBarterListOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("barter-unlist"),
      outcome: marketBarterUnlistOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("purchase-order-list"),
      outcome: marketPurchaseOrderListOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("purchase-order-unlist"),
      outcome: marketPurchaseOrderUnlistOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("mystery-merchant-buy"),
      outcome: marketMysteryMerchantBuyOutcomeSchema,
    })
    .strict(),
]);

const farmMarketCrossFarmBuyOutcomeSchema = z
  .object({
    seller_doorplate: farmCatalogDoorplateSchema,
    kind: farmMarketListingKindSchema,
    item_id: marketItemIdSchema,
    quantity: positiveIntegerSchema,
    name: z.string().min(1),
    cost: z.number().int().nonnegative(),
    fee: z.number().int().nonnegative(),
    price: positiveIntegerSchema,
  })
  .strict();

const farmMarketCrossFarmBarterAcceptOutcomeSchema = z
  .object({
    seller_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
    give: marketActionOutcomeItemSchema,
    want: marketActionOutcomeItemSchema,
  })
  .strict();

const farmMarketCrossFarmPurchaseOrderFulfillOutcomeSchema = z
  .object({
    order_owner_doorplate: farmCatalogDoorplateSchema,
    listing_id: farmMarketActionIdempotencyKeySchema,
    kind: farmMarketPurchaseOrderKindSchema,
    item_id: marketItemIdSchema,
    quantity: positiveIntegerSchema,
    remaining_quantity: z.number().int().nonnegative(),
    complete: z.boolean(),
    name: z.string().min(1),
    cost: z.number().int().nonnegative(),
    fee: z.number().int().nonnegative(),
    price: positiveIntegerSchema,
  })
  .strict();

export const farmMarketCrossFarmActionResultSchema = z.discriminatedUnion("action", [
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("buy"),
      outcome: farmMarketCrossFarmBuyOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("barter-accept"),
      outcome: farmMarketCrossFarmBarterAcceptOutcomeSchema,
    })
    .strict(),
  z
    .object({
      receipt_id: farmMarketActionIdempotencyKeySchema,
      action: z.literal("purchase-order-fulfill"),
      outcome: farmMarketCrossFarmPurchaseOrderFulfillOutcomeSchema,
    })
    .strict(),
]);

export const farmHumanMarketSingleFarmActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmMarketActionResultSchema,
        resource: farmCatalogDataSchema,
      })
      .strict(),
    revision: farmMarketActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanMarketCrossFarmActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmMarketCrossFarmActionResultSchema,
        buyer_doorplate: farmCatalogDoorplateSchema,
        seller_doorplate: farmCatalogDoorplateSchema,
      })
      .strict(),
    revision: farmMarketActionRevisionSchema,
    seller_revision: farmMarketActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanMarketPurchaseOrderFulfillSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmMarketCrossFarmActionResultSchema.refine(
          (result) => result.action === "purchase-order-fulfill",
          "expected a purchase-order fulfillment result",
        ),
        fulfiller_doorplate: farmCatalogDoorplateSchema,
        order_owner_doorplate: farmCatalogDoorplateSchema,
      })
      .strict(),
    revision: farmMarketActionRevisionSchema,
    order_owner_revision: farmMarketActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanMarketActionSuccessSchema = z.union([
  farmHumanMarketSingleFarmActionSuccessSchema,
  farmHumanMarketCrossFarmActionSuccessSchema,
  farmHumanMarketPurchaseOrderFulfillSuccessSchema,
]);

export const boundFarmMarketActionSuccessSchema = farmHumanMarketActionSuccessSchema;
export const boundMarketActionSuccessSchema = boundFarmMarketActionSuccessSchema;

const humanMarketErrorCodes = [
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
  "cross_farm_atomicity_unavailable",
  "merchant_not_present",
  "merchant_not_visible",
  "already_bought",
  "offer_not_found",
  "quantity_invalid",
  "insufficient_funds",
] as const;

export const farmHumanMarketActionErrorCodeSchema = z.enum(humanMarketErrorCodes);

export const farmHumanMarketActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanMarketActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmMarketActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

const boundMarketErrorCodes = [
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
  "cross_farm_atomicity_unavailable",
  "merchant_not_present",
  "merchant_not_visible",
  "already_bought",
  "offer_not_found",
  "quantity_invalid",
  "insufficient_funds",
] as const;

export const boundFarmMarketActionErrorCodeSchema = z.enum(boundMarketErrorCodes);

export const boundFarmMarketActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmMarketActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmMarketActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmMarketAction = z.infer<typeof farmMarketActionSchema>;
export type FarmMarketSupportedAction = z.infer<typeof farmMarketSupportedActionSchema>;
export type FarmMarketListingKind = z.infer<typeof farmMarketListingKindSchema>;
export type FarmMarketPurchaseOrderKind = z.infer<typeof farmMarketPurchaseOrderKindSchema>;
export type FarmMysteryMerchantKind = z.infer<typeof farmMysteryMerchantKindSchema>;
export type FarmMarketActionIdempotencyKey = z.infer<typeof farmMarketActionIdempotencyKeySchema>;
export type FarmMarketActionRevision = z.infer<typeof farmMarketActionRevisionSchema>;
export type FarmHumanMarketActionRequest = z.infer<typeof farmHumanMarketActionRequestSchema>;
export type BoundFarmMarketActionRequest = z.infer<typeof boundFarmMarketActionRequestSchema>;
export type FarmMarketActionResult = z.infer<typeof farmMarketActionResultSchema>;
export type FarmMarketCrossFarmActionResult = z.infer<typeof farmMarketCrossFarmActionResultSchema>;
export type FarmHumanMarketSingleFarmActionSuccess = z.infer<
  typeof farmHumanMarketSingleFarmActionSuccessSchema
>;
export type FarmHumanMarketCrossFarmActionSuccess = z.infer<
  typeof farmHumanMarketCrossFarmActionSuccessSchema
>;
export type FarmHumanMarketPurchaseOrderFulfillSuccess = z.infer<
  typeof farmHumanMarketPurchaseOrderFulfillSuccessSchema
>;
export type FarmHumanMarketActionSuccess = z.infer<typeof farmHumanMarketActionSuccessSchema>;
export type BoundFarmMarketActionSuccess = z.infer<typeof boundFarmMarketActionSuccessSchema>;
export type FarmHumanMarketActionErrorCode = z.infer<typeof farmHumanMarketActionErrorCodeSchema>;
export type FarmHumanMarketActionError = z.infer<typeof farmHumanMarketActionErrorSchema>;
export type BoundFarmMarketActionErrorCode = z.infer<typeof boundFarmMarketActionErrorCodeSchema>;
export type BoundFarmMarketActionError = z.infer<typeof boundFarmMarketActionErrorSchema>;
