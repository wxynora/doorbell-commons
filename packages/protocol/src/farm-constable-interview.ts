import { z } from "zod";

const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/u);
const farmHumanKeySchema = z.string().min(1);
const accountIdSchema = z.string().min(1);
const residentIdSchema = z.string().min(1);
const interviewIdSchema = z.string().min(1);
const attemptIdSchema = z.string().min(1);
const scoreSchema = z.number().int().min(0).max(5);
const dateTimeSchema = z.iso.datetime();
const interviewMaterialPartSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => value !== null, "Interview material must be a JSON object");

export const constableInterviewStatusSchema = z.enum([
  "signup_open",
  "panel_ready",
  "postponed",
  "scoring",
  "failed",
  "public_notice",
  "pending_review_configuration",
  "review_required",
  "certificate_activated",
]);

export const constablePublicNoticeStatusSchema = z.enum([
  "open",
  "pending_review_configuration",
  "review_required",
  "certificate_activated",
]);

const constableInterviewSelfSchema = z
  .object({
    signed_up: z.boolean(),
    signup_order: z.number().int().positive().nullable(),
    tentative: z.boolean(),
    attendance_confirmed: z.boolean(),
    selected: z.boolean(),
    score_submitted: z.boolean(),
    signup_eligible: z.boolean(),
  })
  .strict();

export const farmConstableInterviewMaterialSchema = z
  .object({
    bank_version: z.string().min(1),
    paper: interviewMaterialPartSchema,
    fact_material: interviewMaterialPartSchema,
    scoring_standard: interviewMaterialPartSchema,
  })
  .strict();

const constableInterviewPublicNoticeSchema = z
  .object({
    notice_id: z.string().min(1),
    opened_at: dateTimeSchema,
    closes_at: dateTimeSchema,
    status: constablePublicNoticeStatusSchema,
  })
  .strict();

/**
 * The farm response includes identity facts so Doorbell can verify the
 * server-to-server binding. Main strips these facts from the Human response.
 */
export const farmConstableInterviewViewSchema = z
  .object({
    interview_id: interviewIdSchema,
    attempt_id: attemptIdSchema,
    candidate_resident_id: residentIdSchema,
    scheduled_at: dateTimeSchema,
    status: constableInterviewStatusSchema,
    signup_open_at: dateTimeSchema,
    attendance_confirmation_open_at: dateTimeSchema,
    score_count: z.number().int().min(0).max(3),
    self: constableInterviewSelfSchema,
    interview_material: farmConstableInterviewMaterialSchema.nullable(),
    public_notice: constableInterviewPublicNoticeSchema.nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    const materialRequired =
      view.self.selected && (view.status === "panel_ready" || view.status === "scoring");
    if (materialRequired && view.interview_material === null) {
      context.addIssue({
        code: "custom",
        path: ["interview_material"],
        message: "Selected examiners must receive the frozen interview material",
      });
    }
    if (!materialRequired && view.interview_material !== null) {
      context.addIssue({
        code: "custom",
        path: ["interview_material"],
        message: "Interview material is only visible to selected examiners",
      });
    }
  });

export const farmHumanConstableInterviewReadRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    account_id: accountIdSchema,
    resident_id: residentIdSchema,
    interview_id: interviewIdSchema.optional(),
  })
  .strict();

const farmHumanConstableInterviewActionBaseSchema = z.object({
  farm_human_key: farmHumanKeySchema,
  expected_farm_doorplate: farmDoorplateSchema,
  account_id: accountIdSchema,
  resident_id: residentIdSchema,
  interview_id: interviewIdSchema,
});

export const farmHumanConstableInterviewActionRequestSchema = z.discriminatedUnion("action", [
  farmHumanConstableInterviewActionBaseSchema
    .extend({
      action: z.literal("signup"),
    })
    .strict(),
  farmHumanConstableInterviewActionBaseSchema
    .extend({
      action: z.literal("confirm_attendance"),
    })
    .strict(),
  farmHumanConstableInterviewActionBaseSchema
    .extend({
      action: z.literal("score"),
      facts: scoreSchema,
      restraint: scoreSchema,
      procedure: scoreSchema,
      explanation: scoreSchema,
    })
    .strict(),
]);

export const farmConstableInterviewPublicNoticeRequestSchema = z
  .object({
    interview_id: interviewIdSchema,
    eligible_voter_resident_ids: z.array(residentIdSchema),
  })
  .strict();

const farmConstableInterviewDataSchema = z
  .object({
    interviews: z.array(farmConstableInterviewViewSchema),
  })
  .strict();

const farmConstableInterviewSubjectSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
    account_id: accountIdSchema,
    resident_id: residentIdSchema,
  })
  .strict();

export const farmHumanConstableInterviewSuccessSchema = z
  .object({
    subject: farmConstableInterviewSubjectSchema,
    data: farmConstableInterviewDataSchema,
    server_time: dateTimeSchema,
  })
  .strict();

export const farmConstableInterviewPublicNoticeSuccessSchema = z
  .object({
    data: z.object({ notice_id: z.string().min(1) }).strict(),
    server_time: dateTimeSchema,
  })
  .strict();

export const farmConstableInterviewErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
  "interview_material_not_configured",
  "examiner_account_identity_conflict",
  "interview_not_found",
  "constable_written_exam_required",
  "constable_written_result_expired",
  "invalid_interview_session",
  "examiner_signup_closed",
  "examiner_signup_window_closed",
  "examiner_not_eligible",
  "examiner_confirmation_window_closed",
  "examiner_not_signed_up",
  "interview_not_ready",
  "interview_scores_incomplete",
  "constable_interview_failed",
  "invalid_interview_score",
  "interview_not_scoring",
  "examiner_not_selected",
  "public_notice_closed",
  "public_notice_vote_unavailable",
  "public_notice_not_found",
  "public_notice_still_open",
  "invalid_public_notice_choice",
  "invalid_review_policy",
]);

export const farmConstableInterviewErrorSchema = z
  .object({
    error: z
      .object({
        code: farmConstableInterviewErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundConstableInterviewRequestSchema = z
  .object({
    interview_id: interviewIdSchema,
  })
  .strict();

export const boundConstableInterviewReadRequestSchema = z
  .object({
    interview_id: interviewIdSchema.optional(),
  })
  .strict();

export const boundConstableInterviewActionRequestSchema = z
  .object({ interview_id: interviewIdSchema })
  .strict();

export const boundConstableInterviewScoreRequestSchema = z
  .object({
    interview_id: interviewIdSchema,
    facts: scoreSchema,
    restraint: scoreSchema,
    procedure: scoreSchema,
    explanation: scoreSchema,
  })
  .strict();

const boundConstableInterviewSelfSchema = constableInterviewSelfSchema;

const boundConstableInterviewPublicNoticeSchema = constableInterviewPublicNoticeSchema;

export const boundConstableInterviewViewSchema = z
  .object({
    interview_id: interviewIdSchema,
    scheduled_at: dateTimeSchema,
    status: constableInterviewStatusSchema,
    signup_open_at: dateTimeSchema,
    attendance_confirmation_open_at: dateTimeSchema,
    score_count: z.number().int().min(0).max(3),
    self: boundConstableInterviewSelfSchema,
    interview_material: farmConstableInterviewMaterialSchema.nullable(),
    public_notice: boundConstableInterviewPublicNoticeSchema.nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    const materialRequired =
      view.self.selected && (view.status === "panel_ready" || view.status === "scoring");
    if (materialRequired && view.interview_material === null) {
      context.addIssue({
        code: "custom",
        path: ["interview_material"],
        message: "Selected examiners must receive the frozen interview material",
      });
    }
    if (!materialRequired && view.interview_material !== null) {
      context.addIssue({
        code: "custom",
        path: ["interview_material"],
        message: "Interview material is only visible to selected examiners",
      });
    }
  });

export const boundConstableInterviewSuccessSchema = z
  .object({
    interviews: z.array(boundConstableInterviewViewSchema),
  })
  .strict();

export const boundConstableInterviewErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
  "interview_material_not_configured",
  "examiner_account_identity_conflict",
  "interview_not_found",
  "constable_written_exam_required",
  "constable_written_result_expired",
  "invalid_interview_session",
  "examiner_signup_closed",
  "examiner_signup_window_closed",
  "examiner_not_eligible",
  "examiner_confirmation_window_closed",
  "examiner_not_signed_up",
  "interview_not_ready",
  "interview_scores_incomplete",
  "constable_interview_failed",
  "invalid_interview_score",
  "interview_not_scoring",
  "examiner_not_selected",
]);

export const boundConstableInterviewErrorSchema = z
  .object({
    error: z
      .object({
        code: boundConstableInterviewErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type ConstableInterviewStatus = z.infer<typeof constableInterviewStatusSchema>;
export type ConstablePublicNoticeStatus = z.infer<typeof constablePublicNoticeStatusSchema>;
export type FarmConstableInterviewView = z.infer<typeof farmConstableInterviewViewSchema>;
export type FarmHumanConstableInterviewReadRequest = z.infer<
  typeof farmHumanConstableInterviewReadRequestSchema
>;
export type FarmHumanConstableInterviewActionRequest = z.infer<
  typeof farmHumanConstableInterviewActionRequestSchema
>;
export type FarmConstableInterviewPublicNoticeRequest = z.infer<
  typeof farmConstableInterviewPublicNoticeRequestSchema
>;
export type FarmHumanConstableInterviewSuccess = z.infer<
  typeof farmHumanConstableInterviewSuccessSchema
>;
export type FarmConstableInterviewPublicNoticeSuccess = z.infer<
  typeof farmConstableInterviewPublicNoticeSuccessSchema
>;
export type FarmConstableInterviewErrorCode = z.infer<typeof farmConstableInterviewErrorCodeSchema>;
export type FarmConstableInterviewError = z.infer<typeof farmConstableInterviewErrorSchema>;
export type BoundConstableInterviewRequest = z.infer<typeof boundConstableInterviewRequestSchema>;
export type BoundConstableInterviewReadRequest = z.infer<
  typeof boundConstableInterviewReadRequestSchema
>;
export type BoundConstableInterviewActionRequest = z.infer<
  typeof boundConstableInterviewActionRequestSchema
>;
export type BoundConstableInterviewScoreRequest = z.infer<
  typeof boundConstableInterviewScoreRequestSchema
>;
export type BoundConstableInterviewView = z.infer<typeof boundConstableInterviewViewSchema>;
export type BoundConstableInterviewSuccess = z.infer<typeof boundConstableInterviewSuccessSchema>;
export type BoundConstableInterviewErrorCode = z.infer<
  typeof boundConstableInterviewErrorCodeSchema
>;
export type BoundConstableInterviewError = z.infer<typeof boundConstableInterviewErrorSchema>;
