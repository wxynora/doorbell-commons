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
const ranchCountSchema = z.number().int().nonnegative();
const ranchMoneySchema = z.number().int().nonnegative();
const ranchRateSchema = z.number().finite();
const ranchOutcomeTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0, {
    message: "Ranch action outcome text must not contain only whitespace",
  })
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Ranch action outcome text must not contain HTML or URLs",
  });
const ranchRenameSchema = ranchTextSchema.max(12);

export const farmRanchResidentTypeSchema = z.enum(["animal", "pet", "patrol_goose"]);
export const farmRanchResidentActionSchema = z.enum([
  "feed",
  "upgrade",
  "rename",
  "toggle_pin",
  "wear_accessory",
  "takeoff_accessory",
  "set_variant",
]);
export const farmRanchResidentActionIdempotencyKeySchema = z.uuid();

const emptyPayloadSchema = z.object({}).strict();
const renamePayloadSchema = z
  .object({
    name: ranchRenameSchema,
  })
  .strict();
const accessoryPayloadSchema = z
  .object({
    accessory_id: ranchIdSchema,
  })
  .strict();
const variantPayloadSchema = z
  .object({
    variant_id: ranchIdSchema,
  })
  .strict();

export const farmRanchResidentActionPayloadSchema = z.union([
  emptyPayloadSchema,
  renamePayloadSchema,
  accessoryPayloadSchema,
  variantPayloadSchema,
]);

const residentActionFields = {
  action: farmRanchResidentActionSchema,
  resident_type: farmRanchResidentTypeSchema,
  kind_id: ranchIdSchema,
  payload: farmRanchResidentActionPayloadSchema,
};

function refineResidentAction(
  request: {
    action: z.infer<typeof farmRanchResidentActionSchema>;
    resident_type: z.infer<typeof farmRanchResidentTypeSchema>;
    kind_id: string;
    payload: z.infer<typeof farmRanchResidentActionPayloadSchema>;
  },
  context: z.RefinementCtx,
): void {
  if (request.resident_type === "patrol_goose" && request.kind_id !== "patrol_goose") {
    context.addIssue({
      code: "custom",
      path: ["kind_id"],
      message: "patrol_goose must use kind_id patrol_goose",
    });
  }
  if (request.resident_type !== "patrol_goose" && request.kind_id === "patrol_goose") {
    context.addIssue({
      code: "custom",
      path: ["kind_id"],
      message: "animal and pet residents must not use patrol_goose",
    });
  }
  if (
    (request.action === "feed" || request.action === "upgrade") &&
    request.resident_type !== "animal"
  ) {
    context.addIssue({
      code: "custom",
      path: ["resident_type"],
      message: `${request.action} only applies to animal residents`,
    });
  }

  const payloadKeys = Object.keys(request.payload);
  const expectedPayloadKeys =
    request.action === "rename"
      ? ["name"]
      : request.action === "wear_accessory" || request.action === "takeoff_accessory"
        ? ["accessory_id"]
        : request.action === "set_variant"
          ? ["variant_id"]
          : [];
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

export const farmHumanRanchResidentActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmRanchResidentActionIdempotencyKeySchema,
    expected_revision: z.string().min(1),
    ...residentActionFields,
  })
  .strict()
  .superRefine(refineResidentAction);

export const boundFarmRanchResidentActionRequestSchema = z
  .object(residentActionFields)
  .extend({
    expected_revision: z.string().min(1),
  })
  .strict()
  .superRefine(refineResidentAction);

export const farmHumanRanchResidentActionResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    action: farmRanchResidentActionSchema,
    resident_type: farmRanchResidentTypeSchema,
    kind_id: ranchIdSchema,
    outcome: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("feed"),
          cost_silver: ranchMoneySchema,
          bonus_rate: ranchRateSchema,
          remaining_today: ranchCountSchema,
          silver_balance: ranchMoneySchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("upgrade"),
          level: ranchCountSchema.min(1),
          cost_ranch_coins: ranchMoneySchema,
          ranch_coin_balance: ranchMoneySchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("rename"),
          name: ranchRenameSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("toggle_pin"),
          pinned: z.boolean(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("wear_accessory"),
          accessory_id: ranchIdSchema,
          accessory_name: ranchOutcomeTextSchema,
          wearer_name: ranchOutcomeTextSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("takeoff_accessory"),
          accessory_id: ranchIdSchema,
          accessory_name: ranchOutcomeTextSchema,
          wearer_name: ranchOutcomeTextSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("set_variant"),
          variant_id: ranchIdSchema,
          variant_name: ranchOutcomeTextSchema,
        })
        .strict(),
    ]),
  })
  .strict();

const farmRanchResidentActionResourceSchema = farmRanchDataSchema;

export const farmHumanRanchResidentActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanRanchResidentActionResultSchema,
        resource: farmRanchResidentActionResourceSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmRanchResidentActionSuccessSchema = farmHumanRanchResidentActionSuccessSchema;
export const boundRanchResidentActionSuccessSchema = farmHumanRanchResidentActionSuccessSchema;
export const boundRanchResidentActionRequestSchema = boundFarmRanchResidentActionRequestSchema;

export const farmHumanRanchResidentActionErrorCodeSchema = z.enum([
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

export const farmHumanRanchResidentActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanRanchResidentActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmRanchResidentActionErrorCodeSchema = z.enum([
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

export const boundFarmRanchResidentActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmRanchResidentActionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type FarmRanchResidentType = z.infer<typeof farmRanchResidentTypeSchema>;
export type FarmRanchResidentAction = z.infer<typeof farmRanchResidentActionSchema>;
export type FarmRanchResidentActionIdempotencyKey = z.infer<
  typeof farmRanchResidentActionIdempotencyKeySchema
>;
export type FarmRanchResidentActionPayload = z.infer<typeof farmRanchResidentActionPayloadSchema>;
export type FarmHumanRanchResidentActionRequest = z.infer<
  typeof farmHumanRanchResidentActionRequestSchema
>;
export type BoundFarmRanchResidentActionRequest = z.infer<
  typeof boundFarmRanchResidentActionRequestSchema
>;
export type FarmHumanRanchResidentActionResult = z.infer<
  typeof farmHumanRanchResidentActionResultSchema
>;
export type FarmHumanRanchResidentActionOutcome = FarmHumanRanchResidentActionResult["outcome"];
export type FarmHumanRanchResidentActionSuccess = z.infer<
  typeof farmHumanRanchResidentActionSuccessSchema
>;
export type BoundFarmRanchResidentActionSuccess = z.infer<
  typeof boundFarmRanchResidentActionSuccessSchema
>;
export type FarmHumanRanchResidentActionErrorCode = z.infer<
  typeof farmHumanRanchResidentActionErrorCodeSchema
>;
export type FarmHumanRanchResidentActionError = z.infer<
  typeof farmHumanRanchResidentActionErrorSchema
>;
export type BoundFarmRanchResidentActionErrorCode = z.infer<
  typeof boundFarmRanchResidentActionErrorCodeSchema
>;
export type BoundFarmRanchResidentActionError = z.infer<
  typeof boundFarmRanchResidentActionErrorSchema
>;
