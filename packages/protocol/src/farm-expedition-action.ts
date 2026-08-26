import { z } from "zod";
import {
  farmCatalogDataSchema,
  farmCatalogExpeditionRevisionSchema,
} from "./farm-catalog.js";

const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmHumanKeySchema = z.string().min(1);

export const farmExpeditionActionSchema = z.enum([
  "enter",
  "explore",
  "roll",
  "choose",
  "charm",
  "retreat",
]);
export const farmExpeditionActionIdempotencyKeySchema = z.uuid();
export const farmExpeditionActionRevisionSchema = farmCatalogExpeditionRevisionSchema;

export const farmExpeditionChargesPayloadSchema = z
  .object({ charges: z.number().int().positive() })
  .strict();
export const farmExpeditionEmptyPayloadSchema = z.object({}).strict();
export const farmExpeditionChoosePayloadSchema = z.object({ option: z.string().min(1) }).strict();
export const farmExpeditionCharmPayloadSchema = z
  .object({ kind: z.enum(["check", "hp"]), blessing: z.string() })
  .strict();

export const farmExpeditionActionPayloadSchema = z.union([
  farmExpeditionChargesPayloadSchema,
  farmExpeditionEmptyPayloadSchema,
  farmExpeditionChoosePayloadSchema,
  farmExpeditionCharmPayloadSchema,
]);

const expeditionActionFields = {
  expected_revision: farmExpeditionActionRevisionSchema,
  action: farmExpeditionActionSchema,
  payload: farmExpeditionActionPayloadSchema,
};

function validateExpeditionActionPayload(
  request: {
    action: z.infer<typeof farmExpeditionActionSchema>;
    payload: z.infer<typeof farmExpeditionActionPayloadSchema>;
  },
  context: z.RefinementCtx,
): void {
  const expectedPayloadKeys =
    request.action === "enter" || request.action === "explore"
      ? ["charges"]
      : request.action === "choose"
        ? ["option"]
        : request.action === "charm"
          ? ["kind", "blessing"]
          : [];
  const payloadKeys = Object.keys(request.payload);
  if (
    payloadKeys.length !== expectedPayloadKeys.length ||
    !expectedPayloadKeys.every((key) => payloadKeys.includes(key))
  ) {
    context.addIssue({
      code: "custom",
      path: ["payload"],
      message: `payload does not match ${request.action}`,
    });
  }
}

export const farmHumanExpeditionActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmExpeditionActionIdempotencyKeySchema,
    ...expeditionActionFields,
  })
  .strict()
  .superRefine(validateExpeditionActionPayload);

export const boundFarmExpeditionActionRequestSchema = z
  .object(expeditionActionFields)
  .strict()
  .superRefine(validateExpeditionActionPayload);

export const farmExpeditionActionResultSchema = z
  .object({
    receipt_id: farmExpeditionActionIdempotencyKeySchema,
    action: farmExpeditionActionSchema,
    outcome: z.object({ text: z.string() }).strict(),
  })
  .strict();

export const farmHumanExpeditionActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmExpeditionActionResultSchema,
        resource: farmCatalogDataSchema,
      })
      .strict(),
    revision: farmExpeditionActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmExpeditionActionSuccessSchema = farmHumanExpeditionActionSuccessSchema;
export const boundExpeditionActionSuccessSchema = farmHumanExpeditionActionSuccessSchema;
export const boundExpeditionActionRequestSchema = boundFarmExpeditionActionRequestSchema;

export const farmHumanExpeditionActionErrorCodeSchema = z.enum([
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

export const farmHumanExpeditionActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanExpeditionActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmExpeditionActionErrorCodeSchema = z.enum([
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

export const boundFarmExpeditionActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmExpeditionActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type FarmExpeditionAction = z.infer<typeof farmExpeditionActionSchema>;
export type FarmExpeditionActionIdempotencyKey = z.infer<
  typeof farmExpeditionActionIdempotencyKeySchema
>;
export type FarmExpeditionActionRevision = z.infer<typeof farmExpeditionActionRevisionSchema>;
export type FarmExpeditionActionPayload = z.infer<typeof farmExpeditionActionPayloadSchema>;
export type FarmHumanExpeditionActionRequest = z.infer<
  typeof farmHumanExpeditionActionRequestSchema
>;
export type BoundFarmExpeditionActionRequest = z.infer<
  typeof boundFarmExpeditionActionRequestSchema
>;
export type FarmExpeditionActionResult = z.infer<typeof farmExpeditionActionResultSchema>;
export type FarmHumanExpeditionActionSuccess = z.infer<
  typeof farmHumanExpeditionActionSuccessSchema
>;
export type BoundFarmExpeditionActionSuccess = z.infer<
  typeof boundFarmExpeditionActionSuccessSchema
>;
export type FarmHumanExpeditionActionErrorCode = z.infer<
  typeof farmHumanExpeditionActionErrorCodeSchema
>;
export type FarmHumanExpeditionActionError = z.infer<typeof farmHumanExpeditionActionErrorSchema>;
export type BoundFarmExpeditionActionErrorCode = z.infer<
  typeof boundFarmExpeditionActionErrorCodeSchema
>;
export type BoundFarmExpeditionActionError = z.infer<typeof boundFarmExpeditionActionErrorSchema>;
