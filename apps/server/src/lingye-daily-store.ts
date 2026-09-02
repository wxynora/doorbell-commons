import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { type LingyeDailyEditionPublish, type LingyeDailyPublishRequest, lingyeDailyEditionPublishSchema } from "@doorbell/protocol";
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
  option: string;
  items: (DailySubmission & { number: number })[];
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
  input: LingyeDailyPublishRequest,
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
          ...issue.edition,
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
      const ids = (this.#database.prepare("SELECT submission_id FROM lingye_daily_submissions WHERE target_issue_date = ? ORDER BY received_at, submission_id")
        .all(issueDate) as { submission_id: string }[]).map(row => row.submission_id);
      this.#database.prepare(`INSERT INTO lingye_daily_submission_batches
        (issue_date, reviewer_resident_id, option_id, candidate_ids_json, selected_ids_json)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(issue_date) DO UPDATE SET reviewer_resident_id = excluded.reviewer_resident_id`)
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
        return item ? [{ ...item, number: index + 1 }] : [];
      });
      return { issueDate: batch.issue_date, option: batch.option_id, items };
  }

  enqueueReviewWake(wake: ReporterRelayWake, persist: (review?: DailySubmissionReview) => ReporterBellWakeCreationStatus) {
    if (wake.stage !== "review") return persist();
    return this.#database.transaction(() => {
      const existingWake = this.#database.prepare("SELECT 1 FROM bell_wakes WHERE wake_id = ?").get(wake.wake_id);
      let review: DailySubmissionReview | undefined;
      if (existingWake) {
        // Replayed old wakes must not undo a subsequent reviewer reassignment.
        const existingOption = this.#database.prepare("SELECT include_candidates FROM lingye_daily_submission_review_options WHERE wake_id = ?").get(wake.wake_id) as { include_candidates: number } | undefined;
        const batch = this.#database.prepare("SELECT * FROM lingye_daily_submission_batches WHERE issue_date = ?").get(wake.issue_date) as DailySubmissionBatch | undefined;
        if (existingOption?.include_candidates && batch) review = this.submissionReview(batch);
      } else {
        const assigned = this.assignSubmissionReviews(wake.issue_date, wake.recipient_resident_id);
        const batch = this.#database.prepare("SELECT selected_ids_json FROM lingye_daily_submission_batches WHERE issue_date = ?").get(wake.issue_date) as { selected_ids_json: string | null };
        if (batch.selected_ids_json === null) review = assigned;
        this.#database.prepare("INSERT INTO lingye_daily_submission_review_options (wake_id, option_id, include_candidates, issue_date) VALUES (?, ?, ?, ?)")
          .run(wake.wake_id, wake.actions.approve.args.option, review ? 1 : 0, wake.issue_date);
      }
      // The candidates, reviewer and original Bell notification commit together.
      return persist(review);
    }).immediate();
  }

  assertArticleReviewReady(option: string, residentId?: string): void {
    const batch = this.#database.prepare(`SELECT b.selected_ids_json, b.reviewer_resident_id FROM lingye_daily_submission_batches b
      JOIN lingye_daily_submission_review_options o USING(issue_date) WHERE o.option_id = ?`)
      .get(option) as { selected_ids_json: string | null; reviewer_resident_id: string } | undefined;
    if (batch && residentId !== undefined && batch.reviewer_resident_id !== residentId) throw new DailySubmissionError("reviewer_mismatch");
    if (batch?.selected_ids_json === null) throw new DailySubmissionError("submission_review_pending");
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
      return { submission_id: row.submission_id, text: row.body, source_label: row.source_label };
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
            JSON.stringify(lingyeDailyEditionFromRequest(input)),
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
            edition: lingyeDailyEditionFromRequest(input),
          },
          status: "revised" as const,
        };
      }

      if (input.revision !== 1) {
        throw new LingyeDailyIdempotencyConflictError();
      }
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
          JSON.stringify(lingyeDailyEditionFromRequest(input)),
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
          edition: lingyeDailyEditionFromRequest(input),
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
    return row ? mapLingyeDailyIssue(row) : undefined;
  }

}
