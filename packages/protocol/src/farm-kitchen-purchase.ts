import { z } from "zod";
import { farmKitchenDataSchema, farmKitchenShopRevisionSchema } from "./farm-kitchen.js";

const farmKitchenPurchaseDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

export const farmKitchenPurchaseKindSchema = z.enum(["ingredient", "recipe", "tool"]);
export const farmKitchenPurchaseIdempotencyKeySchema = z.uuid();

const farmKitchenPurchaseLineFields = {
  kind: farmKitchenPurchaseKindSchema,
  item_id: z.string().min(1),
  quantity: z.number().int().positive(),
};

function validatePurchaseLine(value: { kind: string; quantity: number }, context: z.RefinementCtx) {
  if ((value.kind === "recipe" || value.kind === "tool") && value.quantity !== 1) {
    context.addIssue({
      code: "custom",
      path: ["quantity"],
      message: "A recipe or tool purchase quantity must be exactly one",
    });
  }
}

function validateUniquePurchaseLines(
  value: Array<{ kind: string; item_id: string }>,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  value.forEach((line, index) => {
    const key = `${line.kind}\u0000${line.item_id}`;
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "A purchase cart cannot contain duplicate kind and item_id pairs",
      });
    }
    seen.add(key);
  });
}

export const farmKitchenPurchaseLineSchema = z
  .object(farmKitchenPurchaseLineFields)
  .strict()
  .superRefine(validatePurchaseLine);

export const farmKitchenPurchaseItemsSchema = z
  .array(farmKitchenPurchaseLineSchema)
  .min(1)
  .superRefine(validateUniquePurchaseLines);

export const farmHumanKitchenPurchaseRequestSchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmKitchenPurchaseDoorplateSchema,
    idempotency_key: farmKitchenPurchaseIdempotencyKeySchema,
    expected_shop_revision: farmKitchenShopRevisionSchema,
    items: farmKitchenPurchaseItemsSchema,
  })
  .strict();

/** Browser body: identity and idempotency stay in the server/session layer. */
export const boundFarmKitchenPurchaseRequestSchema = z
  .object({
    expected_shop_revision: farmKitchenShopRevisionSchema,
    items: farmKitchenPurchaseItemsSchema,
  })
  .strict();

const farmKitchenPurchaseReceiptItemSchema = z
  .object({
    ...farmKitchenPurchaseLineFields,
    total_price_silver: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(validatePurchaseLine);

const farmKitchenPurchaseReceiptItemsSchema = z
  .array(farmKitchenPurchaseReceiptItemSchema)
  .min(1)
  .superRefine(validateUniquePurchaseLines);

export const farmKitchenPurchaseResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    items: farmKitchenPurchaseReceiptItemsSchema,
    total_price_silver: z.number().int().nonnegative(),
    silver_balance: z.number().int().nonnegative(),
  })
  .strict();

export const farmHumanKitchenPurchaseSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmKitchenPurchaseResultSchema,
        resource: farmKitchenDataSchema,
      })
      .strict(),
    shop_revision: farmKitchenShopRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmKitchenPurchaseSuccessSchema = farmHumanKitchenPurchaseSuccessSchema;
export const boundKitchenPurchaseSuccessSchema = farmHumanKitchenPurchaseSuccessSchema;

export const farmHumanKitchenPurchaseErrorCodeSchema = z.enum([
  "shop_changed",
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "purchase_rejected",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanKitchenPurchaseErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanKitchenPurchaseErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmKitchenPurchaseErrorCodeSchema = z.enum([
  "shop_changed",
  "shop_unavailable",
  "state_conflict",
  "idempotency_conflict",
  "purchase_rejected",
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

export const boundFarmKitchenPurchaseErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmKitchenPurchaseErrorCodeSchema,
        message: z.string(),
        current_shop_revision: farmKitchenShopRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmKitchenPurchaseKind = z.infer<typeof farmKitchenPurchaseKindSchema>;
export type FarmKitchenPurchaseLine = z.infer<typeof farmKitchenPurchaseLineSchema>;
export type FarmKitchenPurchaseItems = z.infer<typeof farmKitchenPurchaseItemsSchema>;
export type FarmHumanKitchenPurchaseRequest = z.infer<typeof farmHumanKitchenPurchaseRequestSchema>;
export type BoundFarmKitchenPurchaseRequest = z.infer<typeof boundFarmKitchenPurchaseRequestSchema>;
export type FarmKitchenPurchaseResult = z.infer<typeof farmKitchenPurchaseResultSchema>;
export type FarmHumanKitchenPurchaseSuccess = z.infer<typeof farmHumanKitchenPurchaseSuccessSchema>;
export type BoundFarmKitchenPurchaseSuccess = z.infer<typeof boundFarmKitchenPurchaseSuccessSchema>;
export type FarmHumanKitchenPurchaseErrorCode = z.infer<
  typeof farmHumanKitchenPurchaseErrorCodeSchema
>;
export type FarmHumanKitchenPurchaseError = z.infer<typeof farmHumanKitchenPurchaseErrorSchema>;
export type BoundFarmKitchenPurchaseErrorCode = z.infer<
  typeof boundFarmKitchenPurchaseErrorCodeSchema
>;
export type BoundFarmKitchenPurchaseError = z.infer<typeof boundFarmKitchenPurchaseErrorSchema>;
