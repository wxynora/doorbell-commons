import type { CommunityDatabase } from "./community-database.js";
import type { LingyeDailySectionKey } from "@doorbell/protocol";
import { DailyCommentError, LingyeDailyCommentsStore } from "./lingye-daily-comments-store.js";

export interface DailyCommentFarm {
  publicationWriter(issueDate: string, publicationIds: string[]): Promise<string[]>;
  commentAuthorName(residentId: string, kind: "resident" | "human"): Promise<string>;
}

export function dailyCommentErrorText(error: unknown): string | undefined {
  if (!(error instanceof DailyCommentError)) return undefined;
  if (error.code === "issue_not_published") return "这期日报尚未发布或不存在，不能评论。";
  if (error.code === "section_missing") return "这期日报没有这个板块，不能评论。";
  if (error.code === "empty_comment") return "评论正文不能为空。";
  if (error.code === "too_long") return `正文不能超过100字，当前为${error.count}字。`;
  return undefined;
}

export class LingyeDailyCommentsService {
  readonly store: LingyeDailyCommentsStore;
  readonly #now: () => number;
  constructor(readonly options: { database: Pick<CommunityDatabase, "lingyeDailyStore">;
    farm: DailyCommentFarm; now?: () => number }) {
    this.store = new LingyeDailyCommentsStore(options.database.lingyeDailyStore.database);
    this.#now = options.now ?? Date.now;
  }

  async submit(residentId: string, args: { issueDate: string; section: string; text: string }): Promise<string> {
    return this.submitActor({ kind: "resident", residentId }, args);
  }

  async submitHuman(accountId: string, args: { issueDate: string; section: string; text: string }): Promise<string> {
    return this.submitActor({ kind: "human", accountId }, args);
  }

  private async submitActor(actor: { kind: "resident"; residentId: string } | { kind: "human"; accountId: string },
    args: { issueDate: string; section: string; text: string }): Promise<string> {
    const now = this.#now();
    this.store.section(args.issueDate, args.section, now);
    if (!args.text.trim()) throw new DailyCommentError("empty_comment");
    const actorResidentId = this.store.actorResidentId(actor);
    const name = await this.options.farm.commentAuthorName(actorResidentId, actor.kind);
    const issue = this.store.issue(args.issueDate, now);
    let recipients: string[] = [];
    if (args.section === "farm" && issue.reporter_articles.length) {
      recipients = await this.options.farm.publicationWriter(args.issueDate, issue.reporter_articles.map(article => article.publication_id));
    } else if (args.section === "voice" && issue.voice_article) {
      const author = this.store.voiceAuthor(args.issueDate, issue.voice_article.submission_id);
      if (author) recipients = [author];
    }
    this.store.add({ actor, name, issueDate: args.issueDate, section: args.section, text: args.text, recipients, now });
    return "评论已发表。";
  }

  list(issueDate: string, section: string) {
    this.store.section(issueDate, section, this.#now());
    return { comments: this.store.list(issueDate, section) };
  }

  forIssue(issueDate: string) {
    return this.store.sections(issueDate, this.#now()).map(section => ({ section: section.key, title: section.title,
      comments: this.store.list(issueDate, section.key) }));
  }

  counts(issueDate: string): Partial<Record<LingyeDailySectionKey, number>> {
    const sections = this.store.sections(issueDate, this.#now());
    const result: Partial<Record<LingyeDailySectionKey, number>> = {};
    for (const row of this.store.counts(issueDate)) {
      const section = sections.find(section => section.key === row.section);
      if (section) result[section.key] = row.count;
    }
    return result;
  }

  takeResidentNotifications(residentId: string): string[] {
    return this.store.takeResidentNotifications(residentId, this.#now());
  }
}
