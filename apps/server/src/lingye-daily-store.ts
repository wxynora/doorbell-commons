import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { type LingyeDailyEditionPublish, type LingyeDailyPublishRequest, type LingyeDailyWeatherForecast, lingyeDailyEditionPublishSchema } from "@doorbell/protocol";
import type { ReporterRelayWake } from "@doorbell/protocol";
import type { ReporterBellWakeCreationStatus } from "./reporter-relay-store.js";

export interface LingyeDailyIssueRecord {
  issueDate: string;
  issueNumber: number;
  revision: number;
  revisionNote: string | null;
  periodStart: string;
  periodEnd: string;
  coverageStatus: LingyeDailyPublishRequest["coverage_status"];
  coverageNote: string;
  generatedAt: string;
  publishedAt: number;
  editorModel: string;
  screeningModel: string;
  edition: LingyeDailyEditionPublish;
}

export type LingyeDailyPublishStatus = "created" | "revised" | "duplicate";

export interface LingyeDailyPublishResult {
  issue: LingyeDailyIssueRecord;
  status: LingyeDailyPublishStatus;
}

export class LingyeDailyIdempotencyConflictError extends Error {
  constructor() {
    super("The Lingye Daily issue date or revision conflicts with the stored issue");
    this.name = "LingyeDailyIdempotencyConflictError";
  }
}

export class DailySubmissionError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface DailySubmission {
  submission_id: string;
  resident_id: string;
  question_issue_date: string;
  question_text: string;
  body: string;
  source_label: string;
  received_at: number;
  target_issue_date: string;
}
interface DailySubmissionBatch {
  issue_date: string;
  reviewer_resident_id: string;
  option_id: string;
  candidate_ids_json: string;
  selected_ids_json: string | null;
}

export interface DailySubmissionReview {
  issueDate: string;
  reviewerResidentId: string;
  option: string;
  items: { number: number; question_issue_date: string; question_text: string; body: string }[];
}

function submissionTargetIssue(now: number): string {
  // Same 05:00 Beijing boundary as the existing Daily edition cycle.
  return new Date(now + 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

interface LingyeDailyIssueRow {
  issue_date: string;
  issue_number: number;
  revision: number;
  revision_note: string | null;
  period_start: string;
  period_end: string;
  coverage_status: LingyeDailyPublishRequest["coverage_status"];
  coverage_note: string;
  generated_at: string;
  published_at: number;
  editor_model: string;
  screening_model: string;
  edition_json: string;
}

function mapLingyeDailyIssue(row: LingyeDailyIssueRow): LingyeDailyIssueRecord {
  const edition = lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
  return {
    issueDate: row.issue_date,
    issueNumber: row.issue_number,
    revision: row.revision,
    revisionNote: row.revision_note,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    coverageStatus: row.coverage_status,
    coverageNote: row.coverage_note,
    generatedAt: row.generated_at,
    publishedAt: row.published_at,
    editorModel: row.editor_model,
    screeningModel: row.screening_model,
    edition,
  };
}

function lingyeDailyEditionFromRequest(
  input: LingyeDailyPublishRequest | LingyeDailyEditionPublish,
): LingyeDailyEditionPublish {
  return {
    front_page: input.front_page,
    group_chat: input.group_chat,
    behavior_slices: input.behavior_slices,
    quotes: input.quotes,
    farm_observation: input.farm_observation,
    reporter_articles: input.reporter_articles,
    submissions: input.submissions,
    tomorrow_question: input.tomorrow_question,
    images: input.images,
  };
}

function lingyeDailyComparableIssue(
  issue: LingyeDailyIssueRecord | LingyeDailyPublishRequest,
): string {
  const normalized =
    "issueDate" in issue
      ? {
          issue_date: issue.issueDate,
          revision: issue.revision,
          revision_note: issue.revisionNote,
          period_start: issue.periodStart,
          period_end: issue.periodEnd,
          coverage_status: issue.coverageStatus,
          coverage_note: issue.coverageNote,
          generated_at: issue.generatedAt,
          editor_model: issue.editorModel,
          screening_model: issue.screeningModel,
          ...lingyeDailyEditionFromRequest(issue.edition),
        }
      : {
          issue_date: issue.issue_date,
          revision: issue.revision,
          revision_note: issue.revision_note,
          period_start: issue.period_start,
          period_end: issue.period_end,
          coverage_status: issue.coverage_status,
          coverage_note: issue.coverage_note,
          generated_at: issue.generated_at,
          editor_model: issue.editor_model,
          screening_model: issue.screening_model,
          ...lingyeDailyEditionFromRequest(issue),
        };
  return JSON.stringify(normalized);
}

export class LingyeDailyStore {
  constructor(readonly database: Database.Database) {}
  get #database(): Database.Database { return this.database; }

  submit(residentId: string, issueDate: string, body: string, now: number) {
    return this.#database.transaction(() => {
      if (!body.trim()) throw new DailySubmissionError("empty_submission");
      const issue = this.#database.prepare("SELECT edition_json, published_at FROM lingye_daily_issues WHERE issue_date = ?")
        .get(issueDate) as { edition_json: string; published_at: number } | undefined;
      if (!issue || issue.published_at > now) throw new DailySubmissionError("issue_not_published");
      const question = lingyeDailyEditionPublishSchema.parse(JSON.parse(issue.edition_json)).tomorrow_question;
      if (!question) throw new DailySubmissionError("question_missing");
      const author = this.#database.prepare("SELECT resident_name FROM residents WHERE resident_id = ?")
        .get(residentId) as { resident_name: string } | undefined;
      if (!author) throw new DailySubmissionError("resident_not_found");
      const existing = this.#database.prepare(`SELECT * FROM lingye_daily_submissions
        WHERE resident_id = ? AND question_issue_date = ? AND question_text = ? AND body = ?`)
        .get(residentId, issueDate, question.text, body) as DailySubmission | undefined;
      if (existing) return { submission: existing, duplicate: true };
      const submission: DailySubmission = {
        submission_id: randomUUID(), resident_id: residentId, question_issue_date: issueDate,
        question_text: question.text, body, source_label: author.resident_name,
        received_at: now, target_issue_date: submissionTargetIssue(now),
      };
      this.#database.prepare(`INSERT INTO lingye_daily_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(submission.submission_id, residentId, issueDate, question.text, body, author.resident_name, now, submission.target_issue_date);
      return { submission, duplicate: false };
    }).immediate();
  }

  assignSubmissionReviews(issueDate: string, reviewerResidentId: string) {
    return this.#database.transaction(() => {
      const cutoff = Date.parse(`${issueDate}T05:00:00+08:00`);
      const ids = (this.#database.prepare("SELECT submission_id FROM lingye_daily_submissions WHERE target_issue_date = ? AND received_at < ? ORDER BY received_at, submission_id")
        .all(issueDate, cutoff) as { submission_id: string }[]).map(row => row.submission_id);
      this.#database.prepare(`INSERT INTO lingye_daily_submission_batches
        (issue_date, reviewer_resident_id, option_id, candidate_ids_json, selected_ids_json)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(issue_date) DO NOTHING`)
        .run(issueDate, reviewerResidentId, `opt_${randomBytes(9).toString("base64url")}`, JSON.stringify(ids), ids.length ? null : "[]");
      const batch = this.#database.prepare("SELECT * FROM lingye_daily_submission_batches WHERE issue_date = ?")
        .get(issueDate) as DailySubmissionBatch;
      return this.submissionReview(batch);
    }).immediate();
  }

  private submissionReview(batch: DailySubmissionBatch): DailySubmissionReview {
      const candidateIds = JSON.parse(batch.candidate_ids_json) as string[];
      const items = candidateIds.flatMap((id, index) => {
        const item = this.#database.prepare("SELECT * FROM lingye_daily_submissions WHERE submission_id = ?").get(id) as DailySubmission | undefined;
        return item ? [{ number: index + 1, question_issue_date: item.question_issue_date,
          question_text: item.question_text, body: item.body }] : [];
      });
      return { issueDate: batch.issue_date, reviewerResidentId: batch.reviewer_resident_id,
        option: batch.option_id, items };
  }

  submissionReviewStatus(issueDate:string):
    | {status:"not_started"}
    | {status:"pending";review:DailySubmissionReview}
    | {status:"completed"|"empty";reviewerResidentId:string} {
    const batch=this.#database.prepare("SELECT * FROM lingye_daily_submission_batches WHERE issue_date=?")
      .get(issueDate) as DailySubmissionBatch|undefined;
    if(!batch) return {status:"not_started"};
    const review=this.submissionReview(batch);
    if(batch.selected_ids_json===null&&review.items.length) return {status:"pending",review};
    return {status:review.items.length?"completed":"empty",reviewerResidentId:batch.reviewer_resident_id};
  }

  enqueueSubmissionReview(issueDate: string, reviewerResidentId: string, now: number,
    persist: (review: DailySubmissionReview) => ReporterBellWakeCreationStatus) {
    if (now < Date.parse(`${issueDate}T05:00:00+08:00`)) return "not_due" as const;
    return this.#database.transaction(() => {
      if (this.#database.prepare("SELECT 1 FROM lingye_daily_issues WHERE issue_date = ?").get(issueDate)) return "completed" as const;
      const review = this.assignSubmissionReviews(issueDate, reviewerResidentId);
      if (!review.items.length) {
        this.#database.prepare("UPDATE lingye_daily_submission_batches SET decided_at = COALESCE(decided_at, ?) WHERE issue_date = ?")
          .run(now, issueDate);
        return "empty" as const;
      }
      const batch = this.#database.prepare("SELECT selected_ids_json FROM lingye_daily_submission_batches WHERE issue_date = ?")
        .get(issueDate) as { selected_ids_json: string | null };
      if (batch.selected_ids_json !== null) return "completed" as const;
      if (this.#database.prepare("SELECT 1 FROM bell_wakes WHERE wake_id = ?").get(`daily-submissions:${issueDate}`)) return "duplicate" as const;
      // Freeze anonymous candidates and persist the ordinary Bell in one transaction.
      return persist(review);
    }).immediate();
  }

  enqueueArticleReviewWake(_wake: ReporterRelayWake,
    persist: () => ReporterBellWakeCreationStatus) {
    // Farm delivery, including a historical replay, never owns or transfers
    // anonymous selection. The ordinary Bell store owns delivery atomicity.
    return persist();
  }

  submissionReviewer(issueDate: string): { resident_id: string; display_name: string } | null {
    const row = this.#database.prepare(`SELECT b.reviewer_resident_id AS resident_id, r.resident_name AS display_name
      FROM lingye_daily_submission_batches b JOIN residents r ON r.resident_id = b.reviewer_resident_id
      WHERE b.issue_date = ? AND b.selected_ids_json IS NOT NULL AND b.decided_at IS NOT NULL
        AND json_array_length(b.candidate_ids_json) > 0`)
      .get(issueDate) as { resident_id: string; display_name: string } | undefined;
    return row ?? null;
  }

  completedSubmissionReview(issueDate: string) {
    return this.#database.prepare(`SELECT issue_date AS issueDate, reviewer_resident_id AS residentId,
      decided_at AS decidedAt, json_array_length(candidate_ids_json) AS candidateCount,
      json_array_length(selected_ids_json) AS selectedCount
      FROM lingye_daily_submission_batches WHERE issue_date = ?
        AND selected_ids_json IS NOT NULL AND decided_at IS NOT NULL
        AND json_array_length(candidate_ids_json) > 0`)
      .get(issueDate) as {issueDate:string;residentId:string;decidedAt:number;candidateCount:number;selectedCount:number} | undefined;
  }

  reviewSubmission(residentId: string, option: string, text: string | undefined, now: number) {
    return this.#database.transaction(() => {
      const batch = this.#database.prepare("SELECT * FROM lingye_daily_submission_batches WHERE option_id = ?")
        .get(option) as DailySubmissionBatch | undefined;
      if (!batch) return undefined;
      if (batch.reviewer_resident_id !== residentId) throw new DailySubmissionError("reviewer_mismatch");
      const selection = text?.trim() ?? "";
      if (!/^(?:0|[1-9]\d*(?:\s*,\s*[1-9]\d*)*)$/u.test(selection))
        throw new DailySubmissionError("selection_numbers_required");
      const numbers = selection === "0" ? [] : selection.split(",").map(value => Number(value.trim()));
      if (numbers.length > 3) throw new DailySubmissionError("three_submissions_selected");
      if (new Set(numbers).size !== numbers.length) throw new DailySubmissionError("selection_numbers_required");
      const candidates = JSON.parse(batch.candidate_ids_json) as string[];
      const selectedIds = numbers.map(number => candidates[number - 1]);
      if (selectedIds.some(id => !id || !this.#database.prepare("SELECT 1 FROM lingye_daily_submissions WHERE submission_id = ?").get(id)))
        throw new DailySubmissionError("selection_numbers_required");
      const selectedJson = JSON.stringify(selectedIds);
      if (batch.selected_ids_json !== null) {
        if (batch.selected_ids_json === selectedJson) return { issueDate: batch.issue_date, duplicate: true };
        throw new DailySubmissionError("review_closed");
      }
      if (this.#database.prepare("SELECT 1 FROM lingye_daily_issues WHERE issue_date = ?").get(batch.issue_date))
        throw new DailySubmissionError("review_closed");
      this.#database.prepare("UPDATE lingye_daily_submission_batches SET selected_ids_json = ?, decided_at = ? WHERE issue_date = ?")
        .run(selectedJson, now, batch.issue_date);
      return { issueDate: batch.issue_date, duplicate: false };
    }).immediate();
  }

  selectedSubmissions(issueDate: string) {
    const batch = this.#database.prepare("SELECT * FROM lingye_daily_submission_batches WHERE issue_date = ?")
      .get(issueDate) as DailySubmissionBatch | undefined;
    if (!batch) {
      const count = this.#database.prepare("SELECT COUNT(*) AS count FROM lingye_daily_submissions WHERE target_issue_date = ?")
        .get(issueDate) as { count: number };
      if (count.count) throw new DailySubmissionError("submission_review_pending");
      return [];
    }
    if (batch.selected_ids_json === null) throw new DailySubmissionError("submission_review_pending");
    return (JSON.parse(batch.selected_ids_json) as string[]).map(id => {
      const row = this.#database.prepare("SELECT * FROM lingye_daily_submissions WHERE submission_id = ?").get(id) as DailySubmission | undefined;
      if (!row) throw new DailySubmissionError("selected_submission_missing");
      return { submission_id: row.submission_id, text: row.body, source_label: row.source_label,
        question_text: row.question_text, question_issue_date: row.question_issue_date };
    });
  }

  pendingSubmissionRewards(issueDate: string) {
    return this.#database.prepare(`SELECT s.submission_id, s.resident_id FROM lingye_daily_submission_rewards rewards
      JOIN lingye_daily_submissions s USING(submission_id) WHERE rewards.issue_date = ? AND paid_at IS NULL`)
      .all(issueDate) as { submission_id: string; resident_id: string }[];
  }

  markSubmissionRewardPaid(submissionId: string, now: number): void {
    this.#database.prepare("UPDATE lingye_daily_submission_rewards SET paid_at = COALESCE(paid_at, ?) WHERE submission_id = ?")
      .run(now, submissionId);
  }

  publishLingyeDailyIssue(
    input: LingyeDailyPublishRequest,
    publishedAt: number,
    weatherForecast: LingyeDailyWeatherForecast | null = null,
  ): LingyeDailyPublishResult {
    const transaction = this.#database.transaction(() => {
      input = { ...input, submissions: this.selectedSubmissions(input.issue_date) };
      const existingRow = this.#database
        .prepare(
          `SELECT issue_date,
                  issue_number,
                  revision,
                  revision_note,
                  period_start,
                  period_end,
                  coverage_status,
                  coverage_note,
                  generated_at,
                  published_at,
                  editor_model,
                  screening_model,
                  edition_json
           FROM lingye_daily_issues
           WHERE issue_date = ?`,
        )
        .get(input.issue_date) as LingyeDailyIssueRow | undefined;

      if (existingRow) {
        const existing = mapLingyeDailyIssue(existingRow);
        if (input.revision === existing.revision) {
          if (lingyeDailyComparableIssue(existing) !== lingyeDailyComparableIssue(input)) {
            throw new LingyeDailyIdempotencyConflictError();
          }
          return { issue: existing, status: "duplicate" as const };
        }
        if (
          input.revision !== existing.revision + 1 ||
          input.period_start !== existing.periodStart ||
          input.period_end !== existing.periodEnd
        ) {
          throw new LingyeDailyIdempotencyConflictError();
        }
        // These fields belong to the edition, not the submitting editor. A text
        // revision must not replace the issue's weather or historical signature.
        const edition: LingyeDailyEditionPublish = {
          ...lingyeDailyEditionFromRequest(input),
          ...(existing.edition.weather_forecast !== undefined ? { weather_forecast: existing.edition.weather_forecast } : {}),
          ...(existing.edition.submission_reviewer !== undefined ? { submission_reviewer: existing.edition.submission_reviewer } : {}),
        };
        this.#database
          .prepare(
            `UPDATE lingye_daily_issues
             SET revision = ?,
                 revision_note = ?,
                 coverage_status = ?,
                 coverage_note = ?,
                 generated_at = ?,
                 published_at = ?,
                 editor_model = ?,
                 screening_model = ?,
                 edition_json = ?
             WHERE issue_date = ?`,
          )
          .run(
            input.revision,
            input.revision_note,
            input.coverage_status,
            input.coverage_note,
            input.generated_at,
            publishedAt,
            input.editor_model,
            input.screening_model,
            JSON.stringify(edition),
            input.issue_date,
          );
        return {
          issue: {
            issueDate: input.issue_date,
            issueNumber: existing.issueNumber,
            revision: input.revision,
            revisionNote: input.revision_note,
            periodStart: input.period_start,
            periodEnd: input.period_end,
            coverageStatus: input.coverage_status,
            coverageNote: input.coverage_note,
            generatedAt: input.generated_at,
            publishedAt,
            editorModel: input.editor_model,
            screeningModel: input.screening_model,
            edition,
          },
          status: "revised" as const,
        };
      }

      if (input.revision !== 1) {
        throw new LingyeDailyIdempotencyConflictError();
      }
      const edition: LingyeDailyEditionPublish = {
        ...lingyeDailyEditionFromRequest(input),
        weather_forecast: weatherForecast,
        submission_reviewer: this.submissionReviewer(input.issue_date)?.display_name ?? null,
      };
      const issueNumber = (
        this.#database
          .prepare(
            "SELECT COALESCE(MAX(issue_number), 0) + 1 AS issue_number FROM lingye_daily_issues",
          )
          .get() as { issue_number: number }
      ).issue_number;
      this.#database
        .prepare(
          `INSERT INTO lingye_daily_issues (
             issue_date,
             issue_number,
             revision,
             revision_note,
             period_start,
             period_end,
             coverage_status,
             coverage_note,
             generated_at,
             published_at,
             editor_model,
             screening_model,
             edition_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.issue_date,
          issueNumber,
          input.revision,
          input.revision_note,
          input.period_start,
          input.period_end,
          input.coverage_status,
          input.coverage_note,
          input.generated_at,
          publishedAt,
          input.editor_model,
          input.screening_model,
          JSON.stringify(edition),
        );
      return {
        issue: {
          issueDate: input.issue_date,
          issueNumber,
          revision: input.revision,
          revisionNote: input.revision_note,
          periodStart: input.period_start,
          periodEnd: input.period_end,
          coverageStatus: input.coverage_status,
          coverageNote: input.coverage_note,
          generatedAt: input.generated_at,
          publishedAt,
          editorModel: input.editor_model,
          screeningModel: input.screening_model,
          edition,
        },
        status: "created" as const,
      };
    });
    return this.#database.transaction(() => {
      const result = transaction.immediate();
      for (const submission of result.issue.edition.submissions) {
        if (submission.submission_id) this.#database.prepare(`INSERT INTO lingye_daily_submission_rewards
          (submission_id, issue_date) VALUES (?, ?) ON CONFLICT(submission_id) DO NOTHING`)
          .run(submission.submission_id, input.issue_date);
      }
      return result;
    }).immediate();
  }

  hasPublishedLingyeDailyIssue(issueDate: string, publishedBy: number): boolean {
    return Boolean(this.#database.prepare(
      "SELECT 1 FROM lingye_daily_issues WHERE issue_date = ? AND published_at <= ?",
    ).get(issueDate, publishedBy));
  }

  getLatestLingyeDailyIssue(publishedBy = Number.MAX_SAFE_INTEGER): LingyeDailyIssueRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT issue_date,
                issue_number,
                revision,
                revision_note,
                period_start,
                period_end,
                coverage_status,
                coverage_note,
                generated_at,
                published_at,
                editor_model,
                screening_model,
                edition_json
         FROM lingye_daily_issues
         WHERE published_at <= ?
         ORDER BY issue_date DESC
         LIMIT 1`,
      )
      .get(publishedBy) as LingyeDailyIssueRow | undefined;
    if (!row) return undefined;
    const issue = mapLingyeDailyIssue(row);
    issue.edition.submissions = issue.edition.submissions.map(submission => {
      if (submission.question_text || !submission.submission_id) return submission;
      const original = this.#database.prepare(
        "SELECT question_text, question_issue_date FROM lingye_daily_submissions WHERE submission_id = ? AND body = ?",
      ).get(submission.submission_id, submission.text) as Pick<DailySubmission, "question_text" | "question_issue_date"> | undefined;
      return original ? { ...submission, ...original } : submission;
    });
    return issue;
  }

  getPublishedImage(issueDate: string, revision: number, imageId: string, now: number): {mediaType:string;dataBase64:string} | undefined {
    return this.#database.prepare(`SELECT json_extract(image.value,'$.media_type') AS mediaType,
      json_extract(image.value,'$.data_base64') AS dataBase64
      FROM lingye_daily_issues issue, json_each(issue.edition_json,'$.images') image
      WHERE issue.issue_date = ? AND issue.revision = ? AND issue.published_at <= ?
        AND json_extract(image.value,'$.image_id') = ?`).get(issueDate,revision,now,imageId) as {mediaType:string;dataBase64:string} | undefined;
  }

}
