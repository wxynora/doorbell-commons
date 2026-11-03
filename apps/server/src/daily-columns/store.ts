import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { BellWakeStatus } from "../community-database.js";
import { materialExpiresAt } from "../daily-materials/material-store.js";
import { DailyColumnError } from "./errors.js";
import type { ColumnKey } from "./config.js";

export interface ColumnTask {
  task_id: string;
  issue_date: string;
  column_key: ColumnKey;
  column_title: string;
  resident_id: string;
  author: string;
  submit_option: string;
  rest_option: string;
  submission_id: string;
  instruction_text: string;
  created_at: number;
  state: "pending" | "submitted" | "rested";
  body: string | null;
  decided_at: number | null;
  submission_synced: number;
  publication_id: string | null;
  published_at: string | null;
  wake_status: BellWakeStatus;
  wake_ended_at: number | null;
  block_reason: string | null;
  error_code: string | null;
}

export class DailyColumnStore {
  constructor(readonly database: Database.Database) {}

  tasks(issueDate: string): ColumnTask[] {
    return this.database.prepare("SELECT * FROM lingye_daily_column_tasks WHERE issue_date=? ORDER BY created_at, column_key")
      .all(issueDate) as ColumnTask[];
  }
  task(id: string): ColumnTask | undefined {
    return this.database.prepare("SELECT * FROM lingye_daily_column_tasks WHERE task_id=?").get(id) as ColumnTask | undefined;
  }
  forOption(option: string): ColumnTask | undefined {
    return this.database.prepare("SELECT * FROM lingye_daily_column_tasks WHERE submit_option=? OR rest_option=?")
      .get(option, option) as ColumnTask | undefined;
  }
  authorize(residentId: string, option: string): ColumnTask {
    const task = this.forOption(option);
    if (!task) throw new DailyColumnError("option_invalid");
    if (task.resident_id !== residentId) throw new DailyColumnError("author_mismatch");
    return task;
  }
  create(input: {issueDate: string; columnKey: ColumnKey; title: string; residentId: string; author: string;
    materialText: string; now: number}, instructions: (task: ColumnTask) => string) {
    return this.database.transaction(() => {
      const previous = this.tasks(input.issueDate).find(task => task.column_key === input.columnKey);
      if (previous) return {created: false, task: previous};
      if (input.now >= materialExpiresAt(input.issueDate)) throw new RangeError("materials_expired");
      const id = randomUUID();
      const task: ColumnTask = {
        task_id: `daily-column:${id}`, issue_date: input.issueDate, column_key: input.columnKey,
        column_title: input.title, resident_id: input.residentId, author: input.author,
        submit_option: `daily-column:submit:${id}`, rest_option: `daily-column:rest:${id}`,
        submission_id: `daily-column-submission:${id}`, instruction_text: "", created_at: input.now,
        state: "pending", body: null, decided_at: null, submission_synced: 0, publication_id: null,
        published_at: null, wake_status: "pending", wake_ended_at: null, block_reason: null, error_code: null,
      };
      task.instruction_text = instructions(task);
      this.database.prepare(`INSERT INTO lingye_daily_column_tasks
        (task_id,issue_date,column_key,column_title,resident_id,author,submit_option,rest_option,
         submission_id,instruction_text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(task.task_id, task.issue_date, task.column_key, task.column_title, task.resident_id, task.author,
          task.submit_option, task.rest_option, task.submission_id, task.instruction_text, task.created_at);
      this.database.prepare("INSERT INTO lingye_daily_column_wake_materials(task_id,body,expires_at) VALUES (?,?,?)")
        .run(task.task_id, input.materialText, materialExpiresAt(task.issue_date));
      return {created: true, task};
    }).immediate();
  }
  decide(taskId: string, state: "submitted" | "rested", body: string | null, now: number) {
    this.database.prepare(`UPDATE lingye_daily_column_tasks SET state=?,body=?,decided_at=?,
      wake_status=CASE WHEN wake_status='pending' THEN 'cancelled' ELSE wake_status END,
      wake_ended_at=CASE WHEN wake_status='pending' THEN ? ELSE wake_ended_at END WHERE task_id=? AND state='pending'`)
      .run(state, body, now, now, taskId);
  }
  materialText(taskId: string, now: number): string | undefined {
    return (this.database.prepare("SELECT body FROM lingye_daily_column_wake_materials WHERE task_id=? AND expires_at>?")
      .get(taskId, now) as {body: string} | undefined)?.body;
  }
  prune(now: number) {
    this.database.prepare("DELETE FROM lingye_daily_column_wake_materials WHERE expires_at<=?").run(now);
  }
  markSubmitted(id: string) {
    this.database.prepare("UPDATE lingye_daily_column_tasks SET submission_synced=1 WHERE task_id=?").run(id);
  }
  markPublished(id: string, publicationId: string, publishedAt: string) {
    this.database.prepare("UPDATE lingye_daily_column_tasks SET publication_id=?,published_at=? WHERE task_id=?")
      .run(publicationId, publishedAt, id);
  }
}
