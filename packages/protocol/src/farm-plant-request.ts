import { z } from "zod";

const farmPlantRequestTextSchema = z.string().trim().min(1).max(256);

export const farmPlantRequestIdempotencyKeySchema = z.uuid();
export const farmPlantRequestStatusSchema = z.enum(["requested", "expired", "failed"]);

export const boundFarmPlantRequestCreateSchema = z
  .object({
    field_revision: farmPlantRequestTextSchema,
  })
  .strict();

export const farmPlantRequestSummarySchema = z
  .object({
    field_revision: farmPlantRequestTextSchema,
    empty_plot_count: z.number().int().positive(),
    status: farmPlantRequestStatusSchema,
    expires_at: z.iso.datetime(),
  })
  .strict();

export const boundFarmPlantRequestCreateSuccessSchema = z
  .object({
    data: farmPlantRequestSummarySchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmPlantRequestErrorCodeSchema = z.enum([
  "field_changed",
  "no_empty_plots",
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

export const boundFarmPlantRequestErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmPlantRequestErrorCodeSchema,
        message: z.string(),
        current_field_revision: farmPlantRequestTextSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmPlantRequestStatus = z.infer<typeof farmPlantRequestStatusSchema>;
export type BoundFarmPlantRequestCreate = z.infer<typeof boundFarmPlantRequestCreateSchema>;
export type BoundFarmPlantRequestCreateSuccess = z.infer<
  typeof boundFarmPlantRequestCreateSuccessSchema
>;
export type BoundFarmPlantRequestError = z.infer<typeof boundFarmPlantRequestErrorSchema>;
