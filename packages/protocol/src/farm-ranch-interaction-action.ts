import { z } from "zod";
import { farmRanchDataSchema } from "./farm-ranch.js";

const ranchIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmHumanKeySchema = z.string().min(1);

export const farmRanchInteractionActionSchema = z.enum(["dispatch", "catch", "remit", "send"]);
export const farmRanchInteractionActionIdempotencyKeySchema = z.uuid();
export const farmRanchInteractionActionRevisionSchema = z.string().min(1);

const positiveIntegerSchema = z.number().int().safe().positive();
const nonnegativeIntegerSchema = z.number().int().safe().nonnegative();
const safeIntegerSchema = z.number().int().safe();
const ranchTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Ranch interaction text must not contain HTML or URLs",
  });

const internalCommonFields = {
  farm_human_key: farmHumanKeySchema,
  expected_farm_doorplate: farmDoorplateSchema,
  idempotency_key: farmRanchInteractionActionIdempotencyKeySchema,
  expected_revision: farmRanchInteractionActionRevisionSchema,
};

const boundCommonFields = {
  expected_revision: farmRanchInteractionActionRevisionSchema,
};

const dispatchFields = {
  action: z.literal("dispatch"),
  target_farm_doorplate: farmDoorplateSchema,
  animal_kind_id: ranchIdSchema,
  duration_hours: positiveIntegerSchema,
};

const catchFields = {
  action: z.literal("catch"),
  raid_id: ranchIdSchema,
};

const remitFields = {
  action: z.literal("remit"),
  amount: positiveIntegerSchema,
};

const sendFields = {
  action: z.literal("send"),
  amount: positiveIntegerSchema,
};

export const farmHumanRanchInteractionActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...internalCommonFields, ...dispatchFields }).strict(),
  z.object({ ...internalCommonFields, ...catchFields }).strict(),
  z.object({ ...internalCommonFields, ...remitFields }).strict(),
  z.object({ ...internalCommonFields, ...sendFields }).strict(),
]);

export const boundFarmRanchInteractionActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...boundCommonFields, ...dispatchFields }).strict(),
  z.object({ ...boundCommonFields, ...catchFields }).strict(),
  z.object({ ...boundCommonFields, ...remitFields }).strict(),
  z.object({ ...boundCommonFields, ...sendFields }).strict(),
]);

const dispatchOutcomeSchema = z
  .object({
    kind: z.literal("dispatch"),
    raid_id: ranchIdSchema,
    animal_kind_id: ranchIdSchema,
    animal_name: ranchTextSchema,
    target_farm_doorplate: farmDoorplateSchema,
    reserved_coins: nonnegativeIntegerSchema,
    started_at: safeIntegerSchema,
    ends_at: safeIntegerSchema,
  })
  .strict();

const catchOutcomeSchema = z
  .object({
    kind: z.literal("catch"),
    raid_id: ranchIdSchema,
    owner: ranchTextSchema,
    animal_name: ranchTextSchema,
    compensation: nonnegativeIntegerSchema,
  })
  .strict();

const remitOutcomeSchema = z
  .object({
    kind: z.literal("remit"),
    amount: positiveIntegerSchema,
    ranch_coins_remaining: nonnegativeIntegerSchema,
  })
  .strict();

const sendOutcomeSchema = z
  .object({
    kind: z.literal("send"),
    amount: positiveIntegerSchema,
    farm_coins_remaining: nonnegativeIntegerSchema,
    ranch_coins: nonnegativeIntegerSchema,
  })
  .strict();

export const farmRanchInteractionActionOutcomeSchema = z.discriminatedUnion("kind", [
  dispatchOutcomeSchema,
  catchOutcomeSchema,
  remitOutcomeSchema,
  sendOutcomeSchema,
]);

export const farmHumanRanchInteractionActionResultSchema = z
  .object({
    receipt_id: farmRanchInteractionActionIdempotencyKeySchema,
    action: farmRanchInteractionActionSchema,
    outcome: farmRanchInteractionActionOutcomeSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.action !== result.outcome.kind) {
      context.addIssue({
        code: "custom",
        path: ["outcome", "kind"],
        message: "outcome kind must match action",
      });
    }
  });

export const farmHumanRanchInteractionActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanRanchInteractionActionResultSchema,
        resource: farmRanchDataSchema,
      })
      .strict(),
    revision: farmRanchInteractionActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmRanchInteractionActionSuccessSchema =
  farmHumanRanchInteractionActionSuccessSchema;
export const boundRanchInteractionActionSuccessSchema =
  farmHumanRanchInteractionActionSuccessSchema;
export const boundRanchInteractionActionRequestSchema =
  boundFarmRanchInteractionActionRequestSchema;

export const farmHumanRanchInteractionActionErrorCodeSchema = z.enum([
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

export const farmHumanRanchInteractionActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanRanchInteractionActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmRanchInteractionActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmRanchInteractionActionErrorCodeSchema = z.enum([
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

export const boundFarmRanchInteractionActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmRanchInteractionActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmRanchInteractionActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmRanchInteractionAction = z.infer<typeof farmRanchInteractionActionSchema>;
export type FarmRanchInteractionActionIdempotencyKey = z.infer<
  typeof farmRanchInteractionActionIdempotencyKeySchema
>;
export type FarmRanchInteractionActionRevision = z.infer<
  typeof farmRanchInteractionActionRevisionSchema
>;
export type FarmHumanRanchInteractionActionRequest = z.infer<
  typeof farmHumanRanchInteractionActionRequestSchema
>;
export type BoundFarmRanchInteractionActionRequest = z.infer<
  typeof boundFarmRanchInteractionActionRequestSchema
>;
export type FarmRanchInteractionActionOutcome = z.infer<
  typeof farmRanchInteractionActionOutcomeSchema
>;
export type FarmHumanRanchInteractionActionResult = z.infer<
  typeof farmHumanRanchInteractionActionResultSchema
>;
export type FarmHumanRanchInteractionActionSuccess = z.infer<
  typeof farmHumanRanchInteractionActionSuccessSchema
>;
export type BoundFarmRanchInteractionActionSuccess = z.infer<
  typeof boundFarmRanchInteractionActionSuccessSchema
>;
export type FarmHumanRanchInteractionActionErrorCode = z.infer<
  typeof farmHumanRanchInteractionActionErrorCodeSchema
>;
export type FarmHumanRanchInteractionActionError = z.infer<
  typeof farmHumanRanchInteractionActionErrorSchema
>;
export type BoundFarmRanchInteractionActionErrorCode = z.infer<
  typeof boundFarmRanchInteractionActionErrorCodeSchema
>;
export type BoundFarmRanchInteractionActionError = z.infer<
  typeof boundFarmRanchInteractionActionErrorSchema
>;
