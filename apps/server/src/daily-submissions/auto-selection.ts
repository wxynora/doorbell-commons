import type Database from "better-sqlite3";

interface AutoSelectionBatch {
  issue_date: string;
  frozen_at: number;
  selected_count: number;
}

function issueCutoff(issueDate: string): number {
  return Date.parse(`${issueDate}T05:00:00+08:00`);
}

export class DailySubmissionAutoSelectionStore {
  constructor(readonly database: Database.Database) {}

  freeze(issueDate: string, now: number): boolean {
    return this.database.transaction(() => {
      const cutoff = issueCutoff(issueDate);
      if (now < cutoff) return false;

      const existing = this.batch(issueDate);
      if (existing) return true;

      if (this.database.prepare("SELECT 1 FROM lingye_daily_issues WHERE issue_date=?").get(issueDate)) return false;
      if (this.database.prepare("SELECT 1 FROM lingye_daily_submission_batches WHERE issue_date=?").get(issueDate)) return false;
      if (this.database.prepare("SELECT 1 FROM lingye_daily_editor_sources WHERE issue_date=? AND kind='human-submission-review'")
        .get(issueDate)) return false;

      const ids = (this.database.prepare(`SELECT submission_id FROM lingye_daily_submissions
        WHERE target_issue_date=? AND received_at<? ORDER BY received_at, submission_id`)
        .all(issueDate, cutoff) as { submission_id: string }[]).map(row => row.submission_id);
      if (ids.length > 3) return false;

      this.database.prepare(`INSERT INTO lingye_daily_submission_auto_selection_batches
        (issue_date,frozen_at,selected_count) VALUES (?,?,?)`).run(issueDate, now, ids.length);
      const insert = this.database.prepare(`INSERT INTO lingye_daily_submission_auto_selection_items
        (issue_date,ordinal,submission_id) VALUES (?,?,?)`);
      ids.forEach((id, index) => insert.run(issueDate, index + 1, id));
      return true;
    }).immediate();
  }

  batch(issueDate: string): AutoSelectionBatch | undefined {
    return this.database.prepare(`SELECT issue_date,frozen_at,selected_count
      FROM lingye_daily_submission_auto_selection_batches WHERE issue_date=?`)
      .get(issueDate) as AutoSelectionBatch | undefined;
  }

  selectedIds(issueDate: string): string[] | undefined {
    const batch = this.batch(issueDate);
    if (!batch) return undefined;
    const rows = this.database.prepare(`SELECT ordinal,submission_id
      FROM lingye_daily_submission_auto_selection_items WHERE issue_date=? ORDER BY ordinal`)
      .all(issueDate) as { ordinal: number; submission_id: string }[];
    if (rows.length !== batch.selected_count || rows.some((row, index) => row.ordinal !== index + 1)) {
      throw new Error("automatic_submission_selection_incomplete");
    }
    return rows.map(row => row.submission_id);
  }
}
