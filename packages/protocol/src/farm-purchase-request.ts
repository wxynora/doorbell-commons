import { z } from "zod";

const farmPurchaseRequestTextSchema = z.string().trim().min(1).max(256);

export const farmPurchaseRequestShopSchema = z.enum(["field", "ranch", "mystery-merchant"]);
export const farmPurchaseRequestKindSchema = z.enum([
  "seed",
  "potion",
  "potion_set",
  "recipe",
  "animal",
  "pet",
  "item",
  "material",
]);
export const farmPurchaseRequestStatusSchema = z.enum(["requested", "expired", "failed"]);
export const farmPurchaseRequestIdempotencyKeySchema = z.uuid();

const farmPurchaseRequestLineFields = {
  kind: farmPurchaseRequestKindSchema,
  item_id: farmPurchaseRequestTextSchema,
  qty: z.number().int().positive(),
};

function validateLineQuantity(
  line: { kind: z.infer<typeof farmPurchaseRequestKindSchema>; qty: number },
  context: z.RefinementCtx,
) {
  if (["potion_set", "recipe", "animal", "pet"].includes(line.kind) && line.qty !== 1) {
    context.addIssue({
      code: "custom",
      path: ["qty"],
      message: "This purchase-request item must have quantity one",
    });
  }
}

export const farmPurchaseRequestLineSchema = z
  .object(farmPurchaseRequestLineFields)
  .strict()
  .superRefine(validateLineQuantity);

const farmPurchaseRequestLinesSchema = z
  .array(farmPurchaseRequestLineSchema)
  .min(1)
  .max(32)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const key = `${item.kind}\u0000${item.item_id}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "A purchase request cannot contain duplicate kind and item_id pairs",
        });
      }
      seen.add(key);
    });
  });

export const boundFarmPurchaseRequestCreateSchema = z
  .object({
    shop: farmPurchaseRequestShopSchema,
    shop_revision: farmPurchaseRequestTextSchema,
    items: farmPurchaseRequestLinesSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const allowedKinds =
      request.shop === "field"
        ? new Set(["seed", "potion", "potion_set", "recipe"])
        : request.shop === "mystery-merchant"
          ? new Set(["seed", "material", "potion_set"])
          : new Set(["animal", "pet", "item"]);
    request.items.forEach((item, index) => {
      if (request.shop === "mystery-merchant" && item.qty !== 1) {
        context.addIssue({ code: "custom", path: ["items", index, "qty"], message: "Each merchant offer is limited to one per visit" });
      }
      if (!allowedKinds.has(item.kind)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "kind"],
          message: `The ${item.kind} kind does not belong to the ${request.shop} shop`,
        });
      }
    });
  });

export const farmPurchaseRequestSummarySchema = z
  .object({
    shop: farmPurchaseRequestShopSchema,
    shop_revision: farmPurchaseRequestTextSchema,
    items: farmPurchaseRequestLinesSchema,
    status: farmPurchaseRequestStatusSchema,
    expires_at: z.iso.datetime(),
  })
  .strict();

export const boundFarmPurchaseRequestCreateSuccessSchema = z
  .object({
    data: farmPurchaseRequestSummarySchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmPurchaseRequestErrorCodeSchema = z.enum([
  "shop_changed",
  "idempotency_conflict",
  "operation_not_allowed",
  "state_conflict",
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

export const boundFarmPurchaseRequestErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmPurchaseRequestErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmPurchaseRequestTextSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmPurchaseRequestShop = z.infer<typeof farmPurchaseRequestShopSchema>;
export type FarmPurchaseRequestKind = z.infer<typeof farmPurchaseRequestKindSchema>;
export type FarmPurchaseRequestStatus = z.infer<typeof farmPurchaseRequestStatusSchema>;
export type FarmPurchaseRequestLine = z.infer<typeof farmPurchaseRequestLineSchema>;
export type BoundFarmPurchaseRequestCreate = z.infer<typeof boundFarmPurchaseRequestCreateSchema>;
export type BoundFarmPurchaseRequestCreateSuccess = z.infer<
  typeof boundFarmPurchaseRequestCreateSuccessSchema
>;
export type BoundFarmPurchaseRequestError = z.infer<typeof boundFarmPurchaseRequestErrorSchema>;
