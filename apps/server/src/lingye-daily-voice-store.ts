import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { LingyeDailyPublishRequest, LingyeDailyVoiceArticle } from "@doorbell/protocol";
import { LingyeDailyEditorStore } from "./lingye-daily-editor-store.js";

export interface DailyVoiceTask {
  issue_date: string;
  resident_id: string;
  author: string;
  source_id: number;
  read_option: string;
  submit_option: string;
  submission_id: string;
  dispatched_at: number;
  body: string | null;
  submitted_at: number | null;
  submission_synced: number;
  publication_id: string | null;
  published_at: string | null;
}

export class DailyVoiceError extends Error {
  constructor(readonly code: "option_invalid" | "author_mismatch" | "empty" | "too_long" | "closed" | "source_not_ready", readonly count?: number) {
    super(code);
  }
}

export class LingyeDailyVoiceStore {
  constructor(readonly database: Database.Database, readonly editor = new LingyeDailyEditorStore(database)) {}

  task(date: string): DailyVoiceTask | undefined {
    return this.database.prepare("SELECT * FROM lingye_daily_voice_tasks WHERE issue_date=?").get(date) as DailyVoiceTask | undefined;
  }

  taskForOption(option: string): DailyVoiceTask | undefined {
    return this.database.prepare("SELECT * FROM lingye_daily_voice_tasks WHERE read_option=? OR submit_option=?")
      .get(option, option) as DailyVoiceTask | undefined;
  }

  source(date: string): { source_id: number; source_json: string } | undefined {
    return this.database.prepare(`SELECT source_id,source_json FROM lingye_daily_editor_sources
      WHERE issue_date=? AND kind='group' ORDER BY source_id LIMIT 1`).get(date) as
      { source_id: number; source_json: string } | undefined;
  }

  create(date: string, author: { residentId: string; displayName: string }, now: number,
    persistWake: (task: DailyVoiceTask) => void): { status: "created" | "duplicate" | "not_ready" | "closed"; task?: DailyVoiceTask } {
    return this.database.transaction(() => {
      const existing = this.task(date);
      if (existing) return { status: "duplicate" as const, task: existing };
      const source = this.source(date);
      if (!source) return { status: "not_ready" as const };
      if (this.editor.row(date).published_version !== null) return { status: "closed" as const };
      const id = randomUUID();
      this.database.prepare(`INSERT INTO lingye_daily_voice_tasks
        (issue_date,resident_id,author,source_id,read_option,submit_option,submission_id,dispatched_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(date, author.residentId, author.displayName, source.source_id,
          `daily-voice:read:${id}`, `daily-voice:submit:${id}`, `daily-voice:${date}:${id}`, now);
      const task = this.task(date)!;
      // The assignment and its existing Bell mailbox entry commit together.
      persistWake(task);
      return { status: "created" as const, task };
    }).immediate();
  }

  authorize(residentId: string, option: string): DailyVoiceTask {
    const task = this.taskForOption(option);
    if (!task) throw new DailyVoiceError("option_invalid");
    if (task.resident_id !== residentId) throw new DailyVoiceError("author_mismatch");
    return task;
  }

  readSource(task: DailyVoiceTask): LingyeDailyPublishRequest {
    const source = this.database.prepare(`SELECT source_json FROM lingye_daily_editor_sources
      WHERE source_id=? AND issue_date=? AND kind='group'`).get(task.source_id, task.issue_date) as
      { source_json: string } | undefined;
    if (!source) throw new DailyVoiceError("source_not_ready");
    return JSON.parse(source.source_json) as LingyeDailyPublishRequest;
  }

  submit(residentId: string, option: string, text: string | undefined, now: number): DailyVoiceTask {
    return this.database.transaction(() => {
      const task = this.authorize(residentId, option);
      if (task.submit_option !== option) throw new DailyVoiceError("option_invalid");
      const body = text?.trim() ?? "";
      if (!body) throw new DailyVoiceError("empty");
      const count = [...body].length;
      if (count > 200) throw new DailyVoiceError("too_long", count);
      if (task.body !== null) {
        if (task.body !== body) throw new DailyVoiceError("closed");
        return task;
      }
      if (this.editor.row(task.issue_date).published_version !== null) throw new DailyVoiceError("closed");
      this.database.prepare("UPDATE lingye_daily_voice_tasks SET body=?,submitted_at=? WHERE issue_date=?")
        .run(body, now, task.issue_date);
      const article: LingyeDailyVoiceArticle = { submission_id: task.submission_id, author: task.author, text: body };
      this.editor.merge(task.issue_date, { voice_article: article }, ["voice"], now);
      return this.task(task.issue_date)!;
    }).immediate();
  }

  markSubmissionSynced(id: string): void {
    this.database.prepare("UPDATE lingye_daily_voice_tasks SET submission_synced=1 WHERE submission_id=?").run(id);
  }

  markPublished(id: string, publicationId: string, publishedAt: string): void {
    this.database.prepare("UPDATE lingye_daily_voice_tasks SET publication_id=?,published_at=? WHERE submission_id=?")
      .run(publicationId, publishedAt, id);
  }
}
