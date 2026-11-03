import type Database from "better-sqlite3";
import type { LingyeDailyColumnImagePrompt } from "@doorbell/protocol";

function imageIdFor(submissionId: string, ordinal: number): string {
  return `daily-column-image:${encodeURIComponent(submissionId)}:${ordinal}`;
}

export interface SubmittedColumnArticle {
  issue_date: string;
  submission_id: string;
  body: string;
}

export interface DailyColumnImagePromptRow extends LingyeDailyColumnImagePrompt {
  issue_date: string;
  submission_id: string;
  state: "pending" | "failed" | "ready";
  attempt_count: number;
}

export interface DailyColumnImageStatus {
  imageId: string;
  reporterName: string;
  columnTitle: string;
  state: "pending" | "failed" | "ready";
  attemptCount: number;
  attemptedAt: number | null;
  errorCode: string | null;
}

export interface DailyColumnImageMetadata {
  image_id: string;
  media_type: "image/webp";
}

export interface DailyColumnImageBytes {
  mediaType: "image/webp";
  data: Buffer;
}

export class DailyColumnImageStore {
  constructor(readonly database: Database.Database) {}

  latestPublishedIssueDate(): string | undefined {
    return (this.database.prepare(`SELECT MAX(issue_date) AS issue_date FROM lingye_daily_issues
      WHERE published_at IS NOT NULL`).get() as { issue_date: string | null }).issue_date ?? undefined;
  }

  submitted(issueDate: string): SubmittedColumnArticle[] {
    return this.database.prepare(`SELECT issue_date, submission_id, body FROM lingye_daily_column_tasks
      WHERE issue_date=? AND state='submitted' AND body IS NOT NULL ORDER BY decided_at, submission_id`)
      .all(issueDate) as SubmittedColumnArticle[];
  }

  enqueue(issueDate: string, submissionId: string, prompts: readonly LingyeDailyColumnImagePrompt[]): void {
    this.database.transaction(() => {
      const submission = this.database.prepare(`SELECT body FROM lingye_daily_column_tasks
        WHERE issue_date=? AND submission_id=? AND state='submitted' AND body IS NOT NULL`)
        .get(issueDate, submissionId) as { body: string } | undefined;
      if (!submission) throw new Error("daily_column_image_submission_unavailable");

      const select = this.database.prepare(`SELECT prompt FROM lingye_daily_column_images
        WHERE issue_date=? AND submission_id=? AND ordinal=?`);
      const insert = this.database.prepare(`INSERT INTO lingye_daily_column_images
        (issue_date, submission_id, ordinal, image_id, prompt) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(issue_date, submission_id, ordinal) DO NOTHING`);
      for (const item of prompts.slice(0, 1)) {
        if (!Number.isSafeInteger(item.ordinal) || item.ordinal < 0) throw new RangeError("image ordinal must be a non-negative integer");
        if (item.imageId !== imageIdFor(submissionId, item.ordinal)) {
          throw new Error("daily_column_image_id_mismatch");
        }
        const existing = select.get(issueDate, submissionId, item.ordinal) as { prompt: string } | undefined;
        if (existing && existing.prompt !== item.prompt) throw new Error("daily_column_image_prompt_conflict");
        insert.run(issueDate, submissionId, item.ordinal, item.imageId, item.prompt);
      }
    }).immediate();
  }

  pending(issueDate: string): DailyColumnImagePromptRow[] {
    return this.database.prepare(`SELECT issue_date, submission_id, ordinal, image_id AS imageId,
      prompt, state, attempt_count FROM lingye_daily_column_images
      WHERE issue_date=? AND ordinal=0 AND state='pending' AND attempt_count=0
      ORDER BY submission_id, ordinal`).all(issueDate) as DailyColumnImagePromptRow[];
  }

  claim(issueDate: string, imageId: string, expectedAttempt: number, now: number): DailyColumnImagePromptRow | undefined {
    return this.database.prepare(`UPDATE lingye_daily_column_images
      SET state='pending', attempt_count=attempt_count+1, attempted_at=?, error_code=NULL
      WHERE issue_date=? AND image_id=? AND ordinal=0 AND attempt_count=?
        AND state=?
      RETURNING issue_date, submission_id, ordinal, image_id AS imageId, prompt, state, attempt_count`)
      .get(now, issueDate, imageId, expectedAttempt, expectedAttempt===0 ? 'pending' : 'failed') as DailyColumnImagePromptRow | undefined;
  }

  /** Called once by Main startup, after the previous process has stopped. Never resubmits. */
  recoverInterrupted(): void {
    this.database.prepare(`UPDATE lingye_daily_column_images SET state='failed', error_code='request_interrupted'
      WHERE state='pending' AND attempt_count>0`).run();
  }

  statuses(issueDate: string): DailyColumnImageStatus[] {
    return this.database.prepare(`SELECT image.image_id AS imageId, task.author AS reporterName,
      task.column_title AS columnTitle, image.state, image.attempt_count AS attemptCount,
      image.attempted_at AS attemptedAt, image.error_code AS errorCode
      FROM lingye_daily_column_images image JOIN lingye_daily_column_tasks task
        ON task.submission_id=image.submission_id AND task.issue_date=image.issue_date
      WHERE image.issue_date=? AND image.ordinal=0 ORDER BY task.decided_at, image.submission_id`)
      .all(issueDate) as DailyColumnImageStatus[];
  }

  saveGenerated(row: DailyColumnImagePromptRow, image: DailyColumnImageBytes, now: number): boolean {
    const result = this.database.prepare(`UPDATE lingye_daily_column_images
      SET state='ready', media_type=?, image_data=?, generated_at=?, error_code=NULL
      WHERE issue_date=? AND submission_id=? AND ordinal=? AND image_id=? AND prompt=?
        AND state='pending' AND attempt_count=?`)
      .run(image.mediaType, image.data, now, row.issue_date, row.submission_id, row.ordinal, row.imageId, row.prompt, row.attempt_count);
    return result.changes === 1;
  }

  markFailed(row: DailyColumnImagePromptRow, errorCode: string): void {
    this.database.prepare(`UPDATE lingye_daily_column_images
      SET state='failed', media_type=NULL, image_data=NULL, generated_at=NULL, error_code=?
      WHERE issue_date=? AND submission_id=? AND ordinal=? AND image_id=? AND prompt=?
        AND state='pending' AND attempt_count=?`)
      .run(errorCode, row.issue_date, row.submission_id, row.ordinal, row.imageId, row.prompt, row.attempt_count);
  }

  readyMetadata(issueDate: string): DailyColumnImageMetadata[] {
    return this.database.prepare(`SELECT image_id, media_type FROM lingye_daily_column_images
      WHERE issue_date=? AND state='ready' ORDER BY submission_id, ordinal`)
      .all(issueDate) as DailyColumnImageMetadata[];
  }

  hasPrompt(issueDate: string, imageId: string): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM lingye_daily_column_images
      WHERE issue_date=? AND image_id=?`).get(issueDate, imageId));
  }

  readyImage(issueDate: string, imageId: string): DailyColumnImageBytes | undefined {
    const row = this.database.prepare(`SELECT media_type AS mediaType, image_data AS data
      FROM lingye_daily_column_images WHERE issue_date=? AND image_id=? AND state='ready'`)
      .get(issueDate, imageId) as { mediaType: "image/webp"; data: Buffer } | undefined;
    return row ? { mediaType: row.mediaType, data: Buffer.from(row.data) } : undefined;
  }

  publishedMetadata(issueDate: string, revision: number): DailyColumnImageMetadata[] {
    return this.database.prepare(`SELECT image.image_id, image.media_type FROM lingye_daily_column_images image
      JOIN lingye_daily_issues issue ON issue.issue_date=image.issue_date
      WHERE issue.issue_date=? AND issue.revision=? AND issue.published_at IS NOT NULL
        AND image.state='ready' AND EXISTS (
          SELECT 1 FROM json_each(issue.edition_json, '$.editor_document.sections') section,
            json_each(section.value, '$.blocks') block
          WHERE json_extract(block.value, '$.type')='image'
            AND json_extract(block.value, '$.imageId')=image.image_id
        ) ORDER BY image.submission_id, image.ordinal`).all(issueDate, revision) as DailyColumnImageMetadata[];
  }

  publishedImage(issueDate: string, revision: number, imageId: string, now: number): DailyColumnImageBytes | undefined {
    const row = this.database.prepare(`SELECT image.media_type AS mediaType, image.image_data AS data
      FROM lingye_daily_column_images image
      JOIN lingye_daily_issues issue ON issue.issue_date=image.issue_date
      WHERE issue.issue_date=? AND issue.revision=? AND issue.published_at<=?
        AND image.image_id=? AND image.state='ready' AND EXISTS (
          SELECT 1 FROM json_each(issue.edition_json, '$.editor_document.sections') section,
            json_each(section.value, '$.blocks') block
          WHERE json_extract(block.value, '$.type')='image'
            AND json_extract(block.value, '$.imageId')=image.image_id
        )`).get(issueDate, revision, now, imageId) as { mediaType: "image/webp"; data: Buffer } | undefined;
    return row ? { mediaType: row.mediaType, data: Buffer.from(row.data) } : undefined;
  }

  purgeBeforePublishedIssue(issueDate: string): number {
    return this.database.transaction(() => {
      const published = this.database.prepare(`SELECT 1 FROM lingye_daily_issues
        WHERE issue_date=? AND published_at IS NOT NULL`).get(issueDate);
      if (!published) return 0;
      return this.database.prepare("DELETE FROM lingye_daily_column_images WHERE issue_date < ?").run(issueDate).changes;
    }).immediate();
  }
}
