import { z } from "zod";

const farmHarvestRequestTextSchema = z.string().trim().min(1).max(256);

export const farmHarvestRequestIdempotencyKeySchema = z.uuid();
export const farmHarvestRequestStatusSchema = z.enum(["requested", "expired", "failed"]);

export const boundFarmHarvestRequestCreateSchema = z
  .object({
    field_revision: farmHarvestRequestTextSchema,
  })
  .strict();

export const farmHarvestRequestSummarySchema = z
  .object({
    field_revision: farmHarvestRequestTextSchema,
    mature_plot_count: z.number().int().positive(),
    status: farmHarvestRequestStatusSchema,
    expires_at: z.iso.datetime(),
  })
  .strict();

export const boundFarmHarvestRequestCreateSuccessSchema = z
  .object({
    data: farmHarvestRequestSummarySchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmHarvestRequestErrorCodeSchema = z.enum([
  "field_changed",
  "no_ripe_plots",
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

export const boundFarmHarvestRequestErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmHarvestRequestErrorCodeSchema,
        message: z.string(),
        current_field_revision: farmHarvestRequestTextSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type FarmHarvestRequestStatus = z.infer<typeof farmHarvestRequestStatusSchema>;
export type BoundFarmHarvestRequestCreate = z.infer<typeof boundFarmHarvestRequestCreateSchema>;
export type BoundFarmHarvestRequestCreateSuccess = z.infer<
  typeof boundFarmHarvestRequestCreateSuccessSchema
>;
export type BoundFarmHarvestRequestError = z.infer<typeof boundFarmHarvestRequestErrorSchema>;
