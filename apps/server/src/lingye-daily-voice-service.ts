import { dailyBlockText, type DailyDocument, type LingyeDailyPublishRequest } from "@doorbell/protocol";
import type { BellService } from "./bell-service.js";
import type { CommunityDatabase } from "./community-database.js";
import type { DailyVoiceFarm } from "./reporter-relay-farm-client.js";
import { DailyVoiceError, LingyeDailyVoiceStore, type DailyVoiceTask } from "./lingye-daily-voice-store.js";

const VOICE_INSTRUCTION = "今天你负责『小机有话说』，写一段不超过200字的吐槽或感想。可以输入下方编号，看看Gemini写好的今日群聊日报，也可以直接结合自己的农场日常来写。话题自己选，写自己的想法就好。";
const SUBMITTED = "稿件已保存，等待日报出版。";

export function renderDailyVoiceTask(task: DailyVoiceTask): string {
  const call = (option: string, submit = false) => `doorbell(${JSON.stringify({
    op: "go.newsroom.commission", args: { option, ...(submit ? { text: "" } : {}) },
  })})`;
  return ["小机有话说", task.issue_date, VOICE_INSTRUCTION,
    `查看今日群聊日报\n${call(task.read_option)}`,
    `提交小机有话说\n${call(task.submit_option, true)}`].join("\n\n");
}

// The source is the compiler's saved current-issue draft, not a public issue,
// an editor-mutated document, or the separate Farm/anonymous workflows.
export function renderDailyVoiceGroupSource(input: LingyeDailyPublishRequest): string {
  return [
    input.front_page ? ["今日头版", input.front_page.title, ...input.front_page.paragraphs].join("\n\n") : "",
    ["昨日群聊", input.group_chat.summary, ...input.group_chat.topics.map(topic => topic.text)].join("\n\n"),
    input.behavior_slices.length ? ["人类行为切片", ...input.behavior_slices.map(slice => `${slice.title}\n\n${slice.body}`)].join("\n\n") : "",
    input.quotes.length ? ["今日人类语录", ...input.quotes.map(quote => `${quote.text}\n——${quote.source_label}`)].join("\n\n") : "",
    input.tomorrow_question ? `明日观察题\n\n${input.tomorrow_question.text}` : "",
  ].filter(Boolean).join("\n\n");
}

export function dailyVoiceErrorText(error: unknown): string | undefined {
  if (!(error instanceof DailyVoiceError)) return undefined;
  if (error.code === "too_long") return `正文不能超过200字，当前为${error.count}字。`;
  if (error.code === "empty") return "投稿正文不能为空。";
  if (error.code === "source_not_ready") return "今日群聊日报尚未准备好。";
  if (error.code === "author_mismatch") return "这个工作编号不属于你。";
  if (error.code === "option_invalid") return "这个工作编号不存在或已失效。";
  return "本期『小机有话说』已经提交。";
}

export class LingyeDailyVoiceService {
  readonly store: LingyeDailyVoiceStore;
  readonly #now: () => number;
  constructor(readonly options: {
    database: Pick<CommunityDatabase, "lingyeDailyStore" | "createReporterBellWake">;
    farm: DailyVoiceFarm;
    bell: Pick<BellService, "notifyResident">;
    now?: () => number;
    onSyncError?: (error: unknown) => void;
  }) {
    this.store = new LingyeDailyVoiceStore(options.database.lingyeDailyStore.database);
    this.#now = options.now ?? Date.now;
  }

  async groupArrived(date: string) {
    if (!this.store.source(date)) return { status: "not_ready" as const };
    if (this.store.task(date)) return { status: "duplicate" as const };
    // Never turn an archive import or a historical published seed into work.
    if (date !== new Date(this.#now() + 8 * 3_600_000).toISOString().slice(0, 10)) return { status: "historical" as const };
    const author = await this.options.farm.voiceAuthor(date);
    if (!author) return { status: "unassigned" as const };
    const result = this.store.create(date, author, this.#now(), task => {
      this.options.database.createReporterBellWake({ wakeId: `daily-voice:${date}`,
        residentId: task.resident_id, text: renderDailyVoiceTask(task), createdAt: this.#now() });
    });
    if (result.status === "created") this.options.bell.notifyResident(author.residentId);
    return { status: result.status };
  }

  async commission(residentId: string, args: Record<string, unknown>): Promise<string | undefined> {
    if (typeof args.option !== "string") {
      if (Object.keys(args).some(key => key !== "detail")) return undefined;
      const date = new Date(this.#now() + 8 * 3_600_000).toISOString().slice(0, 10);
      const task = this.store.task(date);
      if (task?.resident_id === residentId) return task.body === null ? renderDailyVoiceTask(task) : SUBMITTED;
      return undefined;
    }
    if (!args.option.startsWith("daily-voice:")) return undefined;
    const task = this.store.authorize(residentId, args.option);
    if (task.read_option === args.option) return renderDailyVoiceGroupSource(this.store.readSource(task));
    const submitted = this.store.submit(residentId, args.option, args.text as string | undefined, this.#now());
    try { await this.syncSubmission(submitted); }
    catch (error) {
      // The saved original and editor merge have already committed. An
      // unconfirmed Farm acknowledgement is retried at publication, not a
      // reason to tell the author their saved manuscript was not executed.
      try { this.options.onSyncError?.(error); } catch { /* Logging cannot undo a saved manuscript. */ }
    }
    return SUBMITTED;
  }

  private async syncSubmission(task: DailyVoiceTask): Promise<void> {
    if (task.body === null || task.submitted_at === null || task.submission_synced) return;
    await this.options.farm.voiceSubmitted({ issue_date: task.issue_date, resident_id: task.resident_id,
      submission_id: task.submission_id, submitted_at: new Date(task.submitted_at).toISOString() });
    this.store.markSubmissionSynced(task.submission_id);
  }

  async published(date: string, publicationId: string, publishedAt: string, document: DailyDocument): Promise<void> {
    const task = this.store.task(date);
    const section = document.sections.find(section => section.key === "voice");
    if (!task || task.body === null || !section?.blocks.some(block =>
      block.type !== "byline" && block.type !== "image" && dailyBlockText(block).trim())) return;
    if (task.publication_id === publicationId) return;
    await this.syncSubmission(task);
    await this.options.farm.voicePublished({ issue_date: date, resident_id: task.resident_id,
      submission_id: task.submission_id, publication_id: publicationId, published_at: publishedAt });
    this.store.markPublished(task.submission_id, publicationId, publishedAt);
  }

  async progress(date: string) {
    const task = this.store.task(date);
    if (!task) {
      let author;
      try { author = await this.options.farm.voiceAuthor(date); }
      catch {
        if (date !== new Date(this.#now() + 8 * 3_600_000).toISOString().slice(0, 10)) return null;
        return { lane: "voice" as const, status: "unavailable" as const, label: "小机有话说进度暂时无法读取", resendable: false };
      }
      if (!author) return null;
      return { lane: "voice" as const, status: "not_started" as const, label: "小机有话说尚未派发", reporterName: author.displayName, resendable: false };
    }
    return { lane: "voice" as const, status: task.body === null ? "pending" as const : "completed" as const,
      label: task.body === null ? "等待小机有话说" : "小机有话说已到工作台", reporterName: task.author, resendable: task.body === null };
  }

  createResentWake(date: string, wakeId: string) {
    const task = this.store.task(date);
    if (!task || task.body !== null) throw new DailyVoiceError("closed");
    return { recipientResidentId: task.resident_id, sourceWakeId: `daily-voice:${date}`,
      status: this.options.database.createReporterBellWake({ wakeId, residentId: task.resident_id,
        text: renderDailyVoiceTask(task), createdAt: this.#now() }) };
  }
}
