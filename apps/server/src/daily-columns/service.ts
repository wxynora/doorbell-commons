import type Database from "better-sqlite3";
import { dailyBlockText, type DailyDocument } from "@doorbell/protocol";
import type { BellService } from "../bell-service.js";
import { LingyeDailyEditorStore } from "../lingye-daily-editor-store.js";
import type { DailyMaterialService } from "../daily-materials/material-service.js";
import { dailyMaterialWindow } from "../daily-materials/published-announcements.js";
import { renderCurrentReporterMaterials } from "../daily-materials/reporter-tool.js";
import { DailyColumnError } from "./errors.js";
import type { ColumnProfile } from "./config.js";
import { DailyColumnStore, type ColumnTask } from "./store.js";
import type { ColumnFarm, ColumnSubmission } from "./farm-client.js";
import { DailyColumnBellSource } from "./bell-source.js";

export interface DailyColumnCopy {
  instructions(task: ColumnTask): string;
  submitted: string;
  rested: string;
  expiredMaterials: string;
}

export function columnIssueDate(now: number): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
}

export class DailyColumnService {
  readonly store: DailyColumnStore;
  readonly editor: LingyeDailyEditorStore;
  readonly wakeSource: DailyColumnBellSource;
  readonly #now: () => number;
  constructor(readonly options: {
    database: Database.Database;
    profiles: readonly ColumnProfile[];
    materials: Pick<DailyMaterialService, "read" | "eligible">;
    farm: ColumnFarm;
    bell: Pick<BellService, "notifyResident" | "notifyWakeCancelled">;
    copy: DailyColumnCopy;
    now?: () => number;
    onError?: (error: unknown) => void;
  }) {
    this.store = new DailyColumnStore(options.database);
    this.editor = new LingyeDailyEditorStore(options.database);
    this.#now = options.now ?? Date.now;
    this.wakeSource = new DailyColumnBellSource(this.store, options.copy.expiredMaterials, this.#now);
    this.prune();
  }
  prune() { this.store.prune(this.#now()); }
  private report(error: unknown) { try { this.options.onError?.(error); } catch { /* Saved work is durable. */ } }

  /** Called only from current-issue writes and the existing daily/startup recovery. */
  async reconcile(issueDate: string) {
    try { await this.dispatch(issueDate); }
    catch (error) { this.report(error); }
  }
  private async dispatch(issueDate: string) {
    this.prune();
    if (!this.options.profiles.length || issueDate !== columnIssueDate(this.#now())) return;
    if (this.#now() < dailyMaterialWindow(issueDate).end) return;
    const source = this.options.database.prepare("SELECT published_version FROM lingye_daily_editor_drafts WHERE issue_date=?")
      .get(issueDate) as {published_version: number | null} | undefined;
    if (!source || source.published_version !== null) return;
    const material = this.options.materials.read(issueDate);
    const pending = this.options.profiles.filter(profile =>
      !this.store.tasks(issueDate).some(task => task.column_key === profile.key) &&
      profile.materials.every(kind => material.materials[kind].status !== "missing"));
    if (!pending.length) return;
    const authors = await this.options.farm.roster(issueDate);
    for (const profile of pending) {
      const author = authors.find(candidate => candidate.residentId === profile.residentId);
      if (!author) continue;
      const result = this.options.database.transaction(() => {
        if (issueDate !== columnIssueDate(this.#now()) || this.editor.row(issueDate).published_version !== null) return;
        return this.store.create({issueDate, columnKey: profile.key, title: profile.title,
          residentId: author.residentId, author: author.displayName,
          materialText: renderCurrentReporterMaterials({kind: "current", ...material}, profile.materials), now: this.#now()},
          this.options.copy.instructions);
      }).immediate();
      if (result?.created) {
        try { this.options.bell.notifyResident(author.residentId); } catch (error) { this.report(error); }
      }
    }
  }

  async commission(residentId: string, args: Record<string, unknown>): Promise<string | undefined> {
    if (typeof args.option !== "string" || !args.option.startsWith("daily-column:")) return undefined;
    try { return await this.decide(residentId, args, args.option); }
    catch (error) {
      if (error instanceof DailyColumnError) throw error;
      this.report(error);
      throw new DailyColumnError("unavailable");
    }
  }
  private async decide(residentId: string, args: Record<string, unknown>, option: string): Promise<string> {
    const initial = this.store.authorize(residentId, option);
    const isSubmission = initial.submit_option === option;
    if (Object.keys(args).some(key => key !== "option" && key !== "text") ||
      (!isSubmission && args.text !== undefined) || (isSubmission && typeof args.text !== "string")) {
      throw new DailyColumnError(isSubmission && args.text === undefined ? "empty" : "option_invalid");
    }
    const body = isSubmission ? (args.text as string).trim() : null;
    if (isSubmission && !body) throw new DailyColumnError("empty");
    const desired = isSubmission ? "submitted" : "rested";
    // A lost successful response can be replayed after expiry/publication without a new action.
    if (initial.state !== "pending") {
      if (initial.state !== desired || initial.body !== body) throw new DailyColumnError("closed");
      return isSubmission ? this.options.copy.submitted : this.options.copy.rested;
    }
    let eligible: boolean;
    try { eligible = await this.options.materials.eligible(residentId); }
    catch { throw new DailyColumnError("qualification_unavailable"); }
    if (!eligible) throw new DailyColumnError("not_reporter");
    const task = this.options.database.transaction(() => {
      const current = this.store.authorize(residentId, option);
      if (current.state !== "pending") {
        if (current.state !== desired || current.body !== body) throw new DailyColumnError("closed");
        return current;
      }
      if (this.editor.row(current.issue_date).published_version !== null) throw new DailyColumnError("published");
      this.store.decide(current.task_id, desired, body, this.#now());
      if (isSubmission) {
        const articles = this.store.tasks(current.issue_date).filter(row => row.state === "submitted").map(row => ({
          column_key: row.column_key, submission_id: row.submission_id, author: row.author, text: row.body!,
        }));
        this.editor.merge(current.issue_date, {column_articles: articles}, [current.column_key], this.#now());
      }
      return this.store.task(current.task_id)!;
    }).immediate();
    try { this.options.bell.notifyWakeCancelled(task.resident_id, task.task_id); } catch (error) { this.report(error); }
    if (isSubmission) {
      try { await this.syncSubmission(task); } catch (error) { this.report(error); }
    }
    return isSubmission ? this.options.copy.submitted : this.options.copy.rested;
  }

  private submission(task: ColumnTask): ColumnSubmission {
    return {issue_date: task.issue_date, resident_id: task.resident_id, column_key: task.column_key,
      submission_id: task.submission_id, submitted_at: new Date(task.decided_at!).toISOString()};
  }
  private async syncSubmission(task: ColumnTask) {
    if (task.state !== "submitted" || task.submission_synced) return;
    await this.options.farm.submitted(this.submission(task));
    this.store.markSubmitted(task.task_id);
  }
  async published(issueDate: string, publicationId: string, publishedAt: string, document: DailyDocument) {
    for (const task of this.store.tasks(issueDate)) {
      const section = document.sections.find(section => section.key === task.column_key);
      if (task.state !== "submitted" || !section?.blocks.some(block =>
        block.type !== "byline" && block.type !== "image" && block.type !== "divider" && dailyBlockText(block).trim())) continue;
      if (task.publication_id === publicationId && task.published_at === publishedAt) continue;
      await this.syncSubmission(task);
      await this.options.farm.published({...this.submission(task), publication_id: publicationId, published_at: publishedAt});
      this.store.markPublished(task.task_id, publicationId, publishedAt);
    }
  }
  progress(issueDate: string) {
    const tasks = this.store.tasks(issueDate);
    const profiles = this.options.profiles;
    const keys = [...new Set([...profiles.map(profile => profile.key), ...tasks.map(task => task.column_key)])];
    return keys.map(key => {
      const task = tasks.find(candidate => candidate.column_key === key);
      const profile = profiles.find(candidate => candidate.key === key);
      const resident = !task && profile ? this.options.database.prepare("SELECT resident_name FROM residents WHERE resident_id=?")
        .get(profile.residentId) as {resident_name: string} | undefined : undefined;
      const status = task?.state ?? "waiting_materials";
      const label = status === "rested" ? "今日休息" : status === "submitted" ? "稿件已到工作台" :
        status === "pending" ? "等待栏目交稿" : "等待栏目素材与派发";
      return {columnKey: key, title: task?.column_title ?? profile!.title,
        reporterName: task?.author ?? resident?.resident_name ?? profile!.title, status, label};
    });
  }
}
