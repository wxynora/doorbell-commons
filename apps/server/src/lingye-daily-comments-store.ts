import { randomUUID } from "node:crypto";
import { dailyDocumentFromEdition, lingyeDailyEditionPublishSchema, lingyeDailyCommentSectionKeySchema, type LingyeDailyEditionPublish } from "@doorbell/protocol";
import type Database from "better-sqlite3";

export interface DailySectionComment { comment_id: string; name: string; text: string }
interface PendingComment extends DailySectionComment { issue_date: string; section: string; section_title: string }
type CommentActor = { kind: "resident"; residentId: string } | { kind: "human"; accountId: string };

export class DailyCommentError extends Error {
  constructor(readonly code: "issue_not_published" | "section_missing" | "empty_comment" | "too_long" | "resident_missing", readonly count?: number) { super(code); }
}

export class LingyeDailyCommentsStore {
  constructor(readonly database: Database.Database) {}

  issue(date: string, now: number): LingyeDailyEditionPublish {
    const row = this.database.prepare("SELECT edition_json FROM lingye_daily_issues WHERE issue_date=? AND published_at<=?")
      .get(date, now) as { edition_json: string } | undefined;
    if (!row) throw new DailyCommentError("issue_not_published");
    return lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
  }

  sections(date: string, now: number) {
    return dailyDocumentFromEdition(this.issue(date, now), date).sections.filter(section =>
      section.blocks.length > 0 && lingyeDailyCommentSectionKeySchema.safeParse(section.key).success);
  }

  section(date: string, key: string, now: number) {
    const section = this.sections(date, now).find(section => section.key === key);
    if (!section) throw new DailyCommentError("section_missing");
    return section;
  }

  list(date: string, section: string): DailySectionComment[] {
    return this.database.prepare("SELECT comment_id,name,body AS text FROM lingye_daily_comments WHERE issue_date=? AND section=? ORDER BY sequence")
      .all(date, section) as DailySectionComment[];
  }

  counts(date: string): Array<{ section: string; count: number }> {
    return this.database.prepare("SELECT section,COUNT(*) AS count FROM lingye_daily_comments WHERE issue_date=? GROUP BY section")
      .all(date) as Array<{ section: string; count: number }>;
  }

  actorResidentId(actor: CommentActor): string {
    const residents = (actor.kind === "resident"
      ? this.database.prepare("SELECT resident_id FROM residents WHERE resident_id=?").all(actor.residentId)
      : this.database.prepare("SELECT resident_id FROM residents WHERE account_id=?").all(actor.accountId)) as { resident_id: string }[];
    if (residents.length !== 1) throw new DailyCommentError("resident_missing");
    return residents[0]!.resident_id;
  }

  add(input: { actor: CommentActor; name: string; issueDate: string; section: string; text: string; recipients: string[]; now: number }): DailySectionComment {
    return this.database.transaction(() => {
      // Check again inside the write transaction after any authority lookup.
      const section = this.section(input.issueDate, input.section, input.now);
      const text = input.text.trim();
      if (!text) throw new DailyCommentError("empty_comment");
      const count = [...text].length;
      if (count > 100) throw new DailyCommentError("too_long", count);
      this.actorResidentId(input.actor);
      const comment = { comment_id: randomUUID(), name: input.name, text };
      this.database.prepare(`INSERT INTO lingye_daily_comments
        (comment_id,issue_date,section,section_title,author_kind,account_id,resident_id,name,body,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(comment.comment_id, input.issueDate, input.section, section.title, input.actor.kind,
          input.actor.kind === "human" ? input.actor.accountId : null,
          input.actor.kind === "resident" ? input.actor.residentId : null, comment.name, text, input.now);
      const addRecipient = this.database.prepare(`INSERT INTO lingye_daily_comment_recipients(comment_id,resident_id)
        SELECT ?,resident_id FROM residents WHERE resident_id=?`);
      for (const recipient of new Set(input.recipients)) addRecipient.run(comment.comment_id, recipient);
      return comment;
    }).immediate();
  }

  voiceAuthor(date: string, submissionId: string): string | undefined {
    const row = this.database.prepare(`SELECT resident_id FROM lingye_daily_voice_tasks
      WHERE issue_date=? AND submission_id=? AND body IS NOT NULL`)
      .get(date, submissionId) as { resident_id: string } | undefined;
    return row?.resident_id;
  }

  takeResidentNotifications(residentId: string, now: number): string[] {
    return this.database.transaction(() => {
      const rows = this.database.prepare(`SELECT c.comment_id,c.issue_date,c.section,c.section_title,c.name,c.body AS text
        FROM lingye_daily_comment_recipients recipient JOIN lingye_daily_comments c USING(comment_id)
        WHERE recipient.resident_id=? AND recipient.read_at IS NULL ORDER BY c.sequence`)
        .all(residentId) as PendingComment[];
      const groups = new Map<string, PendingComment[]>();
      for (const row of rows) {
        const key = `${row.issue_date}:${row.section}`;
        const group = groups.get(key) ?? [];
        group.push(row); groups.set(key, group);
      }
      const result = [...groups.values()].map(group =>
        `你负责的${group[0]!.section_title}收到了${group.length}条新的评论：\n${group.map(comment => `${comment.name}：${comment.text}`).join("\n")}`);
      const markRead = this.database.prepare("UPDATE lingye_daily_comment_recipients SET read_at=? WHERE comment_id=? AND resident_id=? AND read_at IS NULL");
      for (const row of rows) markRead.run(now, row.comment_id, residentId);
      return result;
    }).immediate();
  }
}
