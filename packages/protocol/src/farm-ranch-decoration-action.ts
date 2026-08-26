import { z } from "zod";
import { farmRanchDataSchema } from "./farm-ranch.js";

const ranchIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const ranchTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0, {
    message: "Ranch display text must not contain only whitespace",
  })
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Ranch display text must not contain HTML or URLs",
  });
const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmHumanKeySchema = z.string().min(1);

export const farmRanchDecorationActionSchema = z.enum(["place", "unplace"]);
export const farmRanchDecorationActionIdempotencyKeySchema = z.uuid();

const decorationActionFields = {
  expected_revision: z.string().min(1),
  action: farmRanchDecorationActionSchema,
  decoration_id: ranchIdSchema,
};

export const farmHumanRanchDecorationActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmRanchDecorationActionIdempotencyKeySchema,
    ...decorationActionFields,
  })
  .strict();

export const boundFarmRanchDecorationActionRequestSchema = z
  .object(decorationActionFields)
  .strict();

export const farmHumanRanchDecorationActionResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    action: farmRanchDecorationActionSchema,
    decoration_id: ranchIdSchema,
    outcome: z
      .object({
        kind: farmRanchDecorationActionSchema,
        decoration_id: ranchIdSchema,
        decoration_name: ranchTextSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.outcome.kind !== result.action) {
      context.addIssue({
        code: "custom",
        path: ["outcome", "kind"],
        message: "outcome kind must match action",
      });
    }
    if (result.outcome.decoration_id !== result.decoration_id) {
      context.addIssue({
        code: "custom",
        path: ["outcome", "decoration_id"],
        message: "outcome decoration must match action decoration",
      });
    }
  });

export const farmHumanRanchDecorationActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanRanchDecorationActionResultSchema,
        resource: farmRanchDataSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmRanchDecorationActionSuccessSchema =
  farmHumanRanchDecorationActionSuccessSchema;
export const boundRanchDecorationActionSuccessSchema = farmHumanRanchDecorationActionSuccessSchema;
export const boundRanchDecorationActionRequestSchema = boundFarmRanchDecorationActionRequestSchema;

export const farmHumanRanchDecorationActionErrorCodeSchema = z.enum([
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

export const farmHumanRanchDecorationActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanRanchDecorationActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmRanchDecorationActionErrorCodeSchema = z.enum([
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

export const boundFarmRanchDecorationActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmRanchDecorationActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type FarmRanchDecorationAction = z.infer<typeof farmRanchDecorationActionSchema>;
export type FarmRanchDecorationActionIdempotencyKey = z.infer<
  typeof farmRanchDecorationActionIdempotencyKeySchema
>;
export type FarmHumanRanchDecorationActionRequest = z.infer<
  typeof farmHumanRanchDecorationActionRequestSchema
>;
export type BoundFarmRanchDecorationActionRequest = z.infer<
  typeof boundFarmRanchDecorationActionRequestSchema
>;
export type FarmHumanRanchDecorationActionResult = z.infer<
  typeof farmHumanRanchDecorationActionResultSchema
>;
export type FarmHumanRanchDecorationActionOutcome = FarmHumanRanchDecorationActionResult["outcome"];
export type FarmHumanRanchDecorationActionSuccess = z.infer<
  typeof farmHumanRanchDecorationActionSuccessSchema
>;
export type BoundFarmRanchDecorationActionSuccess = z.infer<
  typeof boundFarmRanchDecorationActionSuccessSchema
>;
export type FarmHumanRanchDecorationActionErrorCode = z.infer<
  typeof farmHumanRanchDecorationActionErrorCodeSchema
>;
export type FarmHumanRanchDecorationActionError = z.infer<
  typeof farmHumanRanchDecorationActionErrorSchema
>;
export type BoundFarmRanchDecorationActionErrorCode = z.infer<
  typeof boundFarmRanchDecorationActionErrorCodeSchema
>;
export type BoundFarmRanchDecorationActionError = z.infer<
  typeof boundFarmRanchDecorationActionErrorSchema
>;
