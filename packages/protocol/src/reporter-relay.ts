import { z } from "zod";

const reporterIssueDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const reporterOptionSchema = z.string().regex(/^opt_[A-Za-z0-9_-]{12}$/u);
const reporterNonBlankTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "must contain non-whitespace text",
});

export const reporterRelayMaterialSchema = z
  .object({
    category: z.enum(["today_board", "weather_forecast", "lingye_together"]),
    occurred_at: z.iso.datetime({ offset: true }),
    title: reporterNonBlankTextSchema,
    content: reporterNonBlankTextSchema,
  })
  .strict();

const reporterRelayActionSchema = z
  .object({
    op: z.literal("go.newsroom.commission"),
    args: z.object({ option: reporterOptionSchema }).strict(),
  })
  .strict();

const reporterRelayWakeBaseSchema = z.object({
  wake_id: z.string().min(1),
  recipient_resident_id: z.uuid(),
  issue_date: reporterIssueDateSchema,
});

const reporterRelayWakeMaterialsSchema = {
  materials: z.array(reporterRelayMaterialSchema),
};

export const reporterRelayWakeSchema = z.discriminatedUnion("stage", [
  reporterRelayWakeBaseSchema
    .extend({
      stage: z.literal("selection"),
      ...reporterRelayWakeMaterialsSchema,
      action: reporterRelayActionSchema,
    })
    .strict(),
  reporterRelayWakeBaseSchema
    .extend({
      stage: z.literal("writing"),
      selection_text: reporterNonBlankTextSchema,
      action: reporterRelayActionSchema,
    })
    .strict(),
  reporterRelayWakeBaseSchema
    .extend({
      stage: z.literal("review"),
      ...reporterRelayWakeMaterialsSchema,
      article_text: reporterNonBlankTextSchema,
      review_feedback: reporterNonBlankTextSchema.optional(),
      actions: z
        .object({
          approve: reporterRelayActionSchema,
          supplement: reporterRelayActionSchema.optional(),
          reject: reporterRelayActionSchema,
        })
        .strict(),
    })
    .strict()
    .superRefine((value, context) => {
      const canSupplement = value.actions.supplement !== undefined;
      if (canSupplement && value.review_feedback !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["review_feedback"],
          message: "first review must not include prior review feedback",
        });
      }
      if (!canSupplement && value.review_feedback === undefined) {
        context.addIssue({
          code: "custom",
          path: ["review_feedback"],
          message: "second review must include prior review feedback",
        });
      }
    }),
  reporterRelayWakeBaseSchema
    .extend({
      stage: z.literal("supplement"),
      article_text: reporterNonBlankTextSchema,
      review_feedback: reporterNonBlankTextSchema,
      action: reporterRelayActionSchema,
    })
    .strict(),
]);

export const reporterRelayWakeAcceptanceSchema = z
  .object({
    accepted: z.literal(true),
    status: z.enum(["created", "duplicate"]),
    wake_id: z.string().min(1),
  })
  .strict();

export const reporterRelayStartResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        issue_date: reporterIssueDateSchema,
        status: z.enum(["started", "already_started"]),
        wake: reporterRelayWakeSchema,
      })
      .strict(),
  })
  .strict();

export type ReporterRelayMaterial = z.infer<typeof reporterRelayMaterialSchema>;
export type ReporterRelayWake = z.infer<typeof reporterRelayWakeSchema>;
export type ReporterRelayWakeAcceptance = z.infer<typeof reporterRelayWakeAcceptanceSchema>;
export type ReporterRelayStartResponse = z.infer<typeof reporterRelayStartResponseSchema>;
