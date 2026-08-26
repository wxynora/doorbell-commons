import { z } from "zod";
import {
  farmCatalogCodexRevisionSchema,
  farmCatalogDataSchema,
  farmCatalogDoorplateSchema,
} from "./farm-catalog.js";

const farmHumanKeySchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Farm human key must not contain only whitespace",
  });
const cropIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Crop id must not contain only whitespace",
  });

export const farmCropCodexActionSchema = z.enum(["star", "unstar"]);
export const farmCropCodexActionIdempotencyKeySchema = z.uuid();
export const farmCropCodexActionRevisionSchema = farmCatalogCodexRevisionSchema;

const cropCodexActionFields = {
  crop_id: cropIdSchema,
  action: farmCropCodexActionSchema,
  expected_codex_revision: farmCropCodexActionRevisionSchema,
};

export const farmHumanCropCodexActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
    ...cropCodexActionFields,
    idempotency_key: farmCropCodexActionIdempotencyKeySchema,
  })
  .strict();

/** Browser body: the Human identity and idempotency key stay server-side. */
export const boundFarmCropCodexActionRequestSchema = z.object(cropCodexActionFields).strict();

export const farmCropCodexActionReceiptSchema = z
  .object({
    receipt_id: farmCropCodexActionIdempotencyKeySchema,
    crop_id: cropIdSchema,
    action: farmCropCodexActionSchema,
    starred: z.boolean(),
  })
  .strict()
  .superRefine((receipt, context) => {
    const expectedStarred = receipt.action === "star";
    if (receipt.starred !== expectedStarred) {
      context.addIssue({
        code: "custom",
        path: ["starred"],
        message: "starred must match the requested action",
      });
    }
  });

export const farmHumanCropCodexActionResultSchema = farmCropCodexActionReceiptSchema;

export const farmHumanCropCodexActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanCropCodexActionResultSchema,
        resource: farmCatalogDataSchema,
      })
      .strict(),
    revision: z.string().min(1),
    codex_revision: farmCropCodexActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmCropCodexActionSuccessSchema = farmHumanCropCodexActionSuccessSchema;
export const boundCropCodexActionSuccessSchema = boundFarmCropCodexActionSuccessSchema;

export const farmHumanCropCodexActionErrorCodeSchema = z.enum([
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
]);

export const farmHumanCropCodexActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanCropCodexActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmCropCodexActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmCropCodexActionErrorCodeSchema = z.enum([
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
]);

export const boundFarmCropCodexActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmCropCodexActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmCropCodexActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmCropCodexAction = z.infer<typeof farmCropCodexActionSchema>;
export type FarmCropCodexActionIdempotencyKey = z.infer<
  typeof farmCropCodexActionIdempotencyKeySchema
>;
export type FarmCropCodexActionRevision = z.infer<typeof farmCropCodexActionRevisionSchema>;
export type FarmHumanCropCodexActionRequest = z.infer<typeof farmHumanCropCodexActionRequestSchema>;
export type BoundFarmCropCodexActionRequest = z.infer<typeof boundFarmCropCodexActionRequestSchema>;
export type FarmCropCodexActionReceipt = z.infer<typeof farmCropCodexActionReceiptSchema>;
export type FarmHumanCropCodexActionResult = z.infer<typeof farmHumanCropCodexActionResultSchema>;
export type FarmHumanCropCodexActionSuccess = z.infer<typeof farmHumanCropCodexActionSuccessSchema>;
export type BoundFarmCropCodexActionSuccess = z.infer<typeof boundFarmCropCodexActionSuccessSchema>;
export type FarmHumanCropCodexActionErrorCode = z.infer<
  typeof farmHumanCropCodexActionErrorCodeSchema
>;
export type FarmHumanCropCodexActionError = z.infer<typeof farmHumanCropCodexActionErrorSchema>;
export type BoundFarmCropCodexActionErrorCode = z.infer<
  typeof boundFarmCropCodexActionErrorCodeSchema
>;
export type BoundFarmCropCodexActionError = z.infer<typeof boundFarmCropCodexActionErrorSchema>;
