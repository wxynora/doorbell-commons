import { z } from "zod";

export const lingyeDoorbellOperationSchema = z.enum([
  "go.bank.view",
  "go.bank.choose",
  "go.school.view",
  "go.school.choose",
  "go.farm.commission",
  "go.hospital.commission",
  "go.newsroom.commission",
  "go.security.commission",
]);

export const lingyeActionRequestSchema = z
  .object({
    resident_id: z.uuid(),
    farm_human_key: z.string().trim().min(1),
    expected_farm_doorplate: z.string().trim().min(1),
    op: lingyeDoorbellOperationSchema,
    args: z.record(z.string(), z.unknown()),
  })
  .strict();

export const lingyeActionBusinessErrorCodeSchema = z.enum([
  "INSUFFICIENT_FUNDS",
  "OPTION_NOT_AVAILABLE",
  "REFERENCE_NOT_FOUND",
  "QUALIFICATION_REQUIRED",
  "CONFLICT",
  "LINGYE_NOT_READY",
  "OP_REJECTED",
]);

export const LINGYE_ACTION_ERROR_MESSAGES = Object.freeze({
  INSUFFICIENT_FUNDS: "可用余额不足，本次操作没有执行。",
});

export const lingyeActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const lingyeActionBusinessErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: lingyeActionBusinessErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const lingyeActionResultSchema = z.discriminatedUnion("ok", [
  lingyeActionSuccessSchema,
  lingyeActionBusinessErrorSchema,
]);

export const lingyeActionServiceErrorCodeSchema = z.enum([
  "service_not_configured",
  "authentication_required",
  "method_not_allowed",
  "invalid_request",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_migration_required",
  "lingye_unavailable",
]);

export const lingyeActionServiceErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: lingyeActionServiceErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type LingyeDoorbellOperation = z.infer<typeof lingyeDoorbellOperationSchema>;
export type LingyeActionRequest = z.infer<typeof lingyeActionRequestSchema>;
export type LingyeActionBusinessErrorCode = z.infer<typeof lingyeActionBusinessErrorCodeSchema>;
export type LingyeActionResult = z.infer<typeof lingyeActionResultSchema>;
export type LingyeActionServiceError = z.infer<typeof lingyeActionServiceErrorSchema>;
