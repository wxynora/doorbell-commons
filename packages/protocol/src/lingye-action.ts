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
  OPTION_NOT_AVAILABLE: "当前选项已失效或不适用于这项业务；请重新查看当前事实与 option。",
  REFERENCE_NOT_FOUND: "没有找到这条记录，或当前居民无权读取。",
  QUALIFICATION_REQUIRED: "当前职业资格不足，本次操作没有执行。",
  CONFLICT: "当前状态已经变化，本次操作没有执行；请重新查看。",
  LINGYE_NOT_READY: "铃野相关能力尚未就绪，本次操作没有执行。",
  OP_REJECTED: "本次操作被铃野规则拒绝，没有产生业务结果。",
});

export const lingyeActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    data: z.record(z.string(), z.unknown()),
    notifications: z
      .array(
        z
          .object({
            notification_id: z.string().trim().min(1),
            kind: z.enum(["commission_reply", "commission_completed"]),
            recipient_resident_id: z.uuid(),
            message_text: z.string().trim().min(1).optional(),
          })
          .strict()
          .superRefine((notification, context) => {
            if (
              (notification.kind === "commission_reply") !==
              (notification.message_text !== undefined)
            ) {
              context.addIssue({
                code: "custom",
                message: "Only commission replies carry message_text",
              });
            }
          }),
      )
      .optional(),
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

export const lingyeExamLevelSchema = z
  .object({
    career: z.enum(["chef", "agronomist", "veterinarian", "reporter", "constable"]),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  })
  .strict();

export const REQUIRED_LINGYE_EXAM_LEVELS = Object.freeze([
  { career: "chef", level: 1 },
  { career: "chef", level: 2 },
  { career: "agronomist", level: 1 },
  { career: "veterinarian", level: 1 },
  { career: "veterinarian", level: 2 },
  { career: "constable", level: 1 },
  { career: "constable", level: 2 },
  { career: "constable", level: 3 },
] as const);

export const lingyeRuntimeCapabilitiesSchema = z
  .object({
    player_loans: z.literal(true),
    multi_select_assessments: z.literal(true),
    kitchen_methods: z.literal(true),
    kitchen_tools: z.literal(true),
    chef_original_recipes: z.literal(true),
    chef_store: z.literal(true),
    commission_messages: z.literal(true),
    commission_npc_transfer: z.literal(true),
    commission_notifications: z.literal(true),
  })
  .strict();

export const lingyeRuntimeReadinessSchema = z
  .object({
    ok: z.literal(true),
    schema_version: z.literal(1),
    ready: z.boolean(),
    operations: z.array(lingyeDoorbellOperationSchema),
    exams: z
      .object({
        public_ready_levels: z.array(lingyeExamLevelSchema),
        private_ready_levels: z.array(
          lingyeExamLevelSchema.extend({
            question_count: z.literal(20),
            pass_count: z.literal(18),
          }),
        ),
      })
      .strict(),
    economy_rules: z
      .object({
        minimum_system_loan_credit_days: z.number().int().positive(),
        restricted_daily_gold_limit: z.number().int().positive(),
        restricted_daily_silver_limit: z.number().int().positive(),
      })
      .strict(),
    capabilities: lingyeRuntimeCapabilitiesSchema,
    nature_runtime: z
      .object({
        adapter_version: z.literal(1),
        configured: z.boolean(),
        ready: z.boolean(),
        status: z.string().trim().min(1),
        activation_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u)
          .optional(),
        activation_day: z.number().int().optional(),
        persisted_status: z.string().trim().min(1).optional(),
        error_code: z.string().trim().min(1).optional(),
      })
      .strict(),
    missing: z.array(z.string().trim().min(1)),
  })
  .strict();

export type LingyeDoorbellOperation = z.infer<typeof lingyeDoorbellOperationSchema>;
export type LingyeActionRequest = z.infer<typeof lingyeActionRequestSchema>;
export type LingyeActionBusinessErrorCode = z.infer<typeof lingyeActionBusinessErrorCodeSchema>;
export type LingyeActionResult = z.infer<typeof lingyeActionResultSchema>;
export type LingyeActionServiceError = z.infer<typeof lingyeActionServiceErrorSchema>;
export type LingyeExamLevel = z.infer<typeof lingyeExamLevelSchema>;
export type LingyeRuntimeCapabilities = z.infer<typeof lingyeRuntimeCapabilitiesSchema>;
export type LingyeRuntimeReadiness = z.infer<typeof lingyeRuntimeReadinessSchema>;
