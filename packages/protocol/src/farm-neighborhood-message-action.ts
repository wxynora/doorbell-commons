import { z } from "zod";
import {
  farmCatalogBulletinMessageSchema,
  farmCatalogDoorplateSchema,
  farmCatalogNeighborhoodAvailableSchema,
  farmCatalogNeighborhoodRevisionSchema,
} from "./farm-catalog.js";

const farmHumanKeySchema = z.string().min(1);

/** The farm authority trims this value before persisting the message. */
export const farmNeighborhoodMessageBodySchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "A neighborhood message must not be empty",
  })
  .refine((value) => value.trim().length <= 100, {
    message: "A neighborhood message must not exceed 100 characters",
  });

export const farmNeighborhoodMessageActionIdempotencyKeySchema = z.uuid();
export const farmNeighborhoodMessageActionRevisionSchema = farmCatalogNeighborhoodRevisionSchema;

export const farmHumanNeighborhoodMessageActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
    target_farm_doorplate: farmCatalogDoorplateSchema,
    message: farmNeighborhoodMessageBodySchema,
    expected_neighborhood_revision: farmNeighborhoodMessageActionRevisionSchema,
    idempotency_key: farmNeighborhoodMessageActionIdempotencyKeySchema,
  })
  .strict();

export const boundFarmNeighborhoodMessageActionRequestSchema = z
  .object({
    target_farm_doorplate: farmCatalogDoorplateSchema,
    body: farmNeighborhoodMessageBodySchema,
    expected_revision: farmNeighborhoodMessageActionRevisionSchema,
  })
  .strict();

export const farmHumanNeighborhoodMessageActionResultSchema = z
  .object({
    receipt_id: farmNeighborhoodMessageActionIdempotencyKeySchema,
    target_farm_doorplate: farmCatalogDoorplateSchema,
    message_id: z.string().min(1),
    message: farmCatalogBulletinMessageSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.message.id !== result.message_id) {
      context.addIssue({
        code: "custom",
        path: ["message", "id"],
        message: "message.id must match message_id",
      });
    }
  });

export const farmHumanNeighborhoodMessageActionSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanNeighborhoodMessageActionResultSchema,
        resource: farmCatalogNeighborhoodAvailableSchema,
      })
      .strict(),
    revision: farmNeighborhoodMessageActionRevisionSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmNeighborhoodMessageActionSuccessSchema =
  farmHumanNeighborhoodMessageActionSuccessSchema;

export const farmHumanNeighborhoodMessageActionErrorCodeSchema = z.enum([
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
  "access_closed",
  "guestbook_closed",
  "message_closed",
  "blocked",
]);

export const farmHumanNeighborhoodMessageActionErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanNeighborhoodMessageActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmNeighborhoodMessageActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmNeighborhoodMessageActionErrorCodeSchema = z.enum([
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
  "access_closed",
  "guestbook_closed",
  "message_closed",
  "blocked",
]);

export const boundFarmNeighborhoodMessageActionErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmNeighborhoodMessageActionErrorCodeSchema,
        message: z.string(),
        current_revision: farmNeighborhoodMessageActionRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmNeighborhoodMessageBody = z.infer<typeof farmNeighborhoodMessageBodySchema>;
export type FarmNeighborhoodMessageActionIdempotencyKey = z.infer<
  typeof farmNeighborhoodMessageActionIdempotencyKeySchema
>;
export type FarmNeighborhoodMessageActionRevision = z.infer<
  typeof farmNeighborhoodMessageActionRevisionSchema
>;
export type FarmHumanNeighborhoodMessageActionRequest = z.infer<
  typeof farmHumanNeighborhoodMessageActionRequestSchema
>;
export type BoundFarmNeighborhoodMessageActionRequest = z.infer<
  typeof boundFarmNeighborhoodMessageActionRequestSchema
>;
export type FarmHumanNeighborhoodMessageActionResult = z.infer<
  typeof farmHumanNeighborhoodMessageActionResultSchema
>;
export type FarmHumanNeighborhoodMessageActionSuccess = z.infer<
  typeof farmHumanNeighborhoodMessageActionSuccessSchema
>;
export type BoundFarmNeighborhoodMessageActionSuccess = z.infer<
  typeof boundFarmNeighborhoodMessageActionSuccessSchema
>;
export type FarmHumanNeighborhoodMessageActionErrorCode = z.infer<
  typeof farmHumanNeighborhoodMessageActionErrorCodeSchema
>;
export type FarmHumanNeighborhoodMessageActionError = z.infer<
  typeof farmHumanNeighborhoodMessageActionErrorSchema
>;
export type BoundFarmNeighborhoodMessageActionErrorCode = z.infer<
  typeof boundFarmNeighborhoodMessageActionErrorCodeSchema
>;
export type BoundFarmNeighborhoodMessageActionError = z.infer<
  typeof boundFarmNeighborhoodMessageActionErrorSchema
>;
