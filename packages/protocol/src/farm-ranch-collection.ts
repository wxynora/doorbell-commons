import { z } from "zod";
import { farmRanchDataSchema } from "./farm-ranch.js";

const ranchIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const farmHumanKeySchema = z.string().min(1);

export const farmHumanRanchCollectionIdempotencyKeySchema = z.uuid();

const collectionDestinationSchema = z.enum(["kitchen", "ranch_coins", "debt"]);

/**
 * A receipt row is either a persisted kitchen product / debt item instance,
 * or an aggregate non-cookable output which the authority immediately turns
 * into ranch coins and therefore has no persisted instance id.
 */
export const farmRanchCollectionItemSchema = z
  .object({
    instance_id: ranchIdSchema.nullable(),
    item_id: ranchIdSchema,
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unit_value: z.number().int().nonnegative().nullable(),
    destination: collectionDestinationSchema,
  })
  .strict();

const collectionDetailSchema = z.record(z.string().min(1), z.number().int().positive());

export const farmHumanRanchCollectionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmHumanRanchCollectionIdempotencyKeySchema,
    expected_revision: z.string().min(1),
  })
  .strict();

export const boundFarmRanchCollectionRequestSchema = z.object({}).strict();
export const boundRanchCollectionRequestSchema = boundFarmRanchCollectionRequestSchema;

export const farmHumanRanchCollectionResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    items: z.array(farmRanchCollectionItemSchema),
    gross_value: z.number().int().nonnegative(),
    ranch_coins_gained: z.number().int().nonnegative(),
    debt_paid: z.number().int().nonnegative(),
    stored_count: z.number().int().nonnegative(),
    non_cookable_count: z.number().int().nonnegative(),
    non_cookable_gain: z.number().int().nonnegative(),
    potion_count: z.number().int().nonnegative(),
    detail: collectionDetailSchema,
    non_cookable_detail: collectionDetailSchema,
  })
  .strict();

export const farmHumanRanchCollectionResourceSchema = farmRanchDataSchema;

export const farmHumanRanchCollectionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanRanchCollectionResultSchema,
        resource: farmHumanRanchCollectionResourceSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmRanchCollectionSuccessSchema = farmHumanRanchCollectionSuccessSchema;
export const boundRanchCollectionSuccessSchema = farmHumanRanchCollectionSuccessSchema;
export const boundFarmRanchCollectionResultSchema = farmHumanRanchCollectionResultSchema;
export const boundFarmRanchCollectionResourceSchema = farmHumanRanchCollectionResourceSchema;

export const farmHumanRanchCollectionErrorCodeSchema = z.enum([
  "no_collectable",
  "collection_rejected",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanRanchCollectionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanRanchCollectionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmRanchCollectionErrorCodeSchema = z.enum([
  "no_collectable",
  "collection_rejected",
  "state_conflict",
  "idempotency_conflict",
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

export const boundFarmRanchCollectionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmRanchCollectionErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundRanchCollectionErrorSchema = boundFarmRanchCollectionErrorSchema;

export type FarmHumanRanchCollectionRequest = z.infer<typeof farmHumanRanchCollectionRequestSchema>;
export type BoundFarmRanchCollectionRequest = z.infer<typeof boundFarmRanchCollectionRequestSchema>;
export type FarmHumanRanchCollectionItem = z.infer<typeof farmRanchCollectionItemSchema>;
export type FarmHumanRanchCollectionResult = z.infer<typeof farmHumanRanchCollectionResultSchema>;
export type FarmHumanRanchCollectionSuccess = z.infer<typeof farmHumanRanchCollectionSuccessSchema>;
export type BoundFarmRanchCollectionSuccess = z.infer<typeof boundFarmRanchCollectionSuccessSchema>;
export type FarmHumanRanchCollectionError = z.infer<typeof farmHumanRanchCollectionErrorSchema>;
export type BoundFarmRanchCollectionError = z.infer<typeof boundFarmRanchCollectionErrorSchema>;
export type FarmHumanRanchCollectionErrorCode = z.infer<
  typeof farmHumanRanchCollectionErrorCodeSchema
>;
export type BoundFarmRanchCollectionErrorCode = z.infer<
  typeof boundFarmRanchCollectionErrorCodeSchema
>;
