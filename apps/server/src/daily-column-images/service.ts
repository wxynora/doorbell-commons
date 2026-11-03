import type Database from "better-sqlite3";
import type { LingyeDailyColumnImagePrompt } from "@doorbell/protocol";
import { DailyColumnImageStore, type DailyColumnImagePromptRow } from "./store.js";

export interface GeneratedDailyColumnImage {
  mediaType: "image/webp";
  data: Buffer;
}

export type DailyColumnImageGenerator = (prompt: string) => Promise<GeneratedDailyColumnImage>;
export type DailyColumnImagePromptParser = (body: string, submissionId: string) => readonly LingyeDailyColumnImagePrompt[];

export class DailyColumnImageService {
  readonly store: DailyColumnImageStore;
  readonly #generate: DailyColumnImageGenerator;
  readonly #parsePrompts: DailyColumnImagePromptParser;
  readonly #now: () => number;
  readonly #onError: (error: unknown) => void;
  readonly #inFlight = new Map<string, Promise<void>>();

  constructor(options: {
    database: Database.Database;
    generate: DailyColumnImageGenerator;
    parsePrompts: DailyColumnImagePromptParser;
    now?: () => number;
    onError?: (error: unknown) => void;
  }) {
    this.store = new DailyColumnImageStore(options.database);
    this.#generate = options.generate;
    this.#parsePrompts = options.parsePrompts;
    this.#now = options.now ?? Date.now;
    this.#onError = options.onError ?? (() => undefined);
  }

  private report(error: unknown): void {
    try { this.#onError(error); } catch { /* A saved column is independent of image generation. */ }
  }

  /** Re-read saved submissions, then process pending/failed image jobs once. Call only from existing submission/startup paths. */
  async process(issueDate: string): Promise<void> {
    try {
      const latestPublished = this.store.latestPublishedIssueDate();
      if (latestPublished && issueDate < latestPublished) return;

      const submissions = this.store.submitted(issueDate);
      for (const submission of submissions) {
        try {
          const prompts = this.#parsePrompts(submission.body, submission.submission_id);
          this.store.enqueue(issueDate, submission.submission_id, prompts);
        } catch (error) {
          this.report(error);
        }
      }

      await Promise.all(this.store.pending(issueDate).map(row => this.processOne(row)));
    } catch (error) {
      this.report(error);
    }
  }

  private processOne(row: DailyColumnImagePromptRow): Promise<void> {
    const existing = this.#inFlight.get(row.imageId);
    if (existing) return existing;
    const operation = this.generateOne(row).finally(() => this.#inFlight.delete(row.imageId));
    this.#inFlight.set(row.imageId, operation);
    return operation;
  }

  private async generateOne(row: DailyColumnImagePromptRow): Promise<void> {
    try {
      const image = await this.#generate(row.prompt);
      if (image.mediaType !== "image/webp" || !Buffer.isBuffer(image.data)) {
        throw new TypeError("daily_column_image_generator_must_return_webp_buffer");
      }
      this.store.saveGenerated(row, image, this.#now());
    } catch (error) {
      try { this.store.markFailed(row); } catch (storeError) { this.report(storeError); }
      this.report(error);
    }
  }

  metadata(issueDate: string) {
    return this.store.readyMetadata(issueDate);
  }

  publishedMetadata(issueDate: string, revision: number) {
    return this.store.publishedMetadata(issueDate, revision);
  }

  editorImage(issueDate: string, imageId: string) {
    return this.store.readyImage(issueDate, imageId);
  }

  acceptsImageReference(issueDate: string, imageId: string): boolean {
    return this.store.hasPrompt(issueDate, imageId);
  }

  publishedImage(issueDate: string, revision: number, imageId: string, now: number) {
    return this.store.publishedImage(issueDate, revision, imageId, now);
  }

  /** Invoke only after the new issue is durably published. Keeps that issue and future drafts. */
  cleanupAfterPublication(issueDate: string): number {
    return this.store.purgeBeforePublishedIssue(issueDate);
  }
}
