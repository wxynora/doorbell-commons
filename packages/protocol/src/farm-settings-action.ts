import { z } from "zod";
import { farmCatalogDataSchema, farmCatalogDoorplateSchema } from "./farm-catalog.js";

const farmHumanKeySchema = z.string().min(1);
export const farmSettingsActionIdempotencyKeySchema = z.uuid();

export const farmSettingsActionFieldSchema = z.enum([
  "farm_name",
  "ai_name",
  "human_name",
  "welcome_message",
  "social.visit",
  "social.steal",
  "social.water",
  "social.message",
  "equip_title",
]);

const settingsTextSchema = z.string();
const settingsValueSchema = z.union([settingsTextSchema, z.boolean(), z.null()]);

const settingsActionFields = {
  field: farmSettingsActionFieldSchema,
  value: settingsValueSchema,
};

function refineSettingsAction(
  request: { field: z.infer<typeof farmSettingsActionFieldSchema>; value: unknown },
  context: z.RefinementCtx,
): void {
  const textFields = new Set(["farm_name", "ai_name", "human_name", "welcome_message"]);
  const booleanFields = new Set(["social.visit", "social.steal", "social.water", "social.message"]);
  const nullableTitleField = request.field === "equip_title";
  const valid = textFields.has(request.field)
    ? typeof request.value === "string"
    : booleanFields.has(request.field)
      ? typeof request.value === "boolean"
      : nullableTitleField
        ? request.value === null || typeof request.value === "string"
        : false;
  if (!valid) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: `value does not match ${request.field}`,
    });
    return;
  }
  if (request.field === "farm_name" && String(request.value).length === 0) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "farm_name must not be empty",
    });
  }
  if (request.field === "farm_name" && String(request.value).length > 12) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "farm_name must not exceed 12 characters",
    });
  }
  if (request.field === "welcome_message" && String(request.value).length === 0) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "welcome_message must not be empty",
    });
  }
  if (request.field === "welcome_message" && String(request.value).length > 60) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "welcome_message must not exceed 60 characters",
    });
  }
}

export const farmHumanFarmSettingsActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
    idempotency_key: farmSettingsActionIdempotencyKeySchema,
    expected_catalog_revision: z.string().min(1),
    ...settingsActionFields,
  })
  .strict()
  .superRefine(refineSettingsAction);

export const boundFarmSettingsActionRequestSchema = z
  .object({
    expected_catalog_revision: z.string().min(1),
    ...settingsActionFields,
  })
  .strict()
  .superRefine(refineSettingsAction);

export const farmSettingsActionResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    field: farmSettingsActionFieldSchema,
  })
  .strict();

export const farmHumanFarmSettingsActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmSettingsActionResultSchema,
        resource: farmCatalogDataSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmSettingsActionSuccessSchema = farmHumanFarmSettingsActionSuccessSchema;

export const farmHumanFarmSettingsActionErrorCodeSchema = z.enum([
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

export const farmHumanFarmSettingsActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanFarmSettingsActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmSettingsActionErrorCodeSchema = z.enum([
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

export const boundFarmSettingsActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmSettingsActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type FarmSettingsActionField = z.infer<typeof farmSettingsActionFieldSchema>;
export type FarmSettingsActionValue = z.infer<typeof settingsValueSchema>;
export type FarmSettingsActionIdempotencyKey = z.infer<
  typeof farmSettingsActionIdempotencyKeySchema
>;
export type FarmHumanFarmSettingsActionRequest = z.infer<
  typeof farmHumanFarmSettingsActionRequestSchema
>;
export type BoundFarmSettingsActionRequest = z.infer<typeof boundFarmSettingsActionRequestSchema>;
export type FarmSettingsActionResult = z.infer<typeof farmSettingsActionResultSchema>;
export type FarmHumanFarmSettingsActionSuccess = z.infer<
  typeof farmHumanFarmSettingsActionSuccessSchema
>;
export type BoundFarmSettingsActionSuccess = z.infer<typeof boundFarmSettingsActionSuccessSchema>;
export type FarmHumanFarmSettingsActionError = z.infer<
  typeof farmHumanFarmSettingsActionErrorSchema
>;
export type BoundFarmSettingsActionError = z.infer<typeof boundFarmSettingsActionErrorSchema>;
export type BoundFarmSettingsActionErrorCode = z.infer<
  typeof boundFarmSettingsActionErrorCodeSchema
>;
