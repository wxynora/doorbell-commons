import { z } from "zod";
import type Database from "better-sqlite3";
import { DailyMaterialStore, materialExpiresAt, type MaterialKind } from "./material-store.js";
import { dailyMaterialWindow, PublishedAnnouncementStore, projectAnnouncementReviewResponse,
  type PublishedAnnouncement } from "./published-announcements.js";
import { PublishedArticleStore, type LegacyPublishedDocument } from "./published-articles.js";
import { publicGlimmer, type FarmMaterialPort } from "./farm-client.js";

const kinds = z.enum(["group", "npc", "announcements", "glimmer"]);
const groupData = z.strictObject({
  issue_date: z.string(), period_start: z.string(), period_end: z.string(),
  coverage_status: z.enum(["complete", "partial"]), coverage_note: z.string(),
  quote_candidates_available: z.boolean(),
  topics: z.array(z.strictObject({ topic: z.string(), summary: z.string() })),
});
const period = z.strictObject({ startMs: z.number(), endMs: z.number(), timeZone: z.literal("Asia/Shanghai") });
const npcData = z.strictObject({
  window: period, recordingStartedAt: z.number().nullable(), unknownEffectsPresent: z.boolean(),
  farms: z.array(z.strictObject({ farmName: z.string().nullable(), summary: z.string(), unknownEffectsPresent: z.boolean() })),
});
const announcementReview = z.strictObject({ announcements: z.array(z.strictObject({
  id: z.string(), findings: z.array(z.strictObject({
    kind: z.enum(["new_mechanic", "new_event", "numeric_change"]), excerpt: z.string(),
  })),
})) });
const submission = z.union([
  z.strictObject({ issue_date: z.string(), kind: kinds, status: z.literal("failed") }),
  z.strictObject({ issue_date: z.string(), kind: z.literal("group"), status: z.literal("ready"), data: groupData }),
  z.strictObject({ issue_date: z.string(), kind: z.literal("npc"), status: z.literal("ready"), data: npcData }),
  z.strictObject({ issue_date: z.string(), kind: z.literal("announcements"), status: z.literal("ready"),
    source_id: z.string().min(1), data: z.unknown() }),
  z.strictObject({ issue_date: z.string(), kind: z.literal("glimmer"), status: z.literal("ready"), source_id: z.string().min(1) }),
]);

export class DailyMaterialError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function sameAnnouncements(left: PublishedAnnouncement[], right: PublishedAnnouncement[]): boolean {
  if (left.length !== right.length) return false;
  const current = new Map(right.map((item) => [item.id, item]));
  return left.every((item) => {
    const other = current.get(item.id);
    return !!other && item.title === other.title && item.body === other.body && item.publishedAt === other.publishedAt;
  });
}

/** Same connection as Main's other stores; no farm events or original chat are saved. */
export class DailyMaterialService {
  readonly #store: DailyMaterialStore;
  readonly #announcements: PublishedAnnouncementStore;
  readonly #articles: PublishedArticleStore;
  readonly #farm: FarmMaterialPort | undefined;
  readonly #now: () => number;

  constructor(options: { database: Database.Database; farm?: FarmMaterialPort | undefined;
    legacyDocument?: LegacyPublishedDocument | undefined; now?: () => number }) {
    this.#store = new DailyMaterialStore(options.database);
    this.#announcements = new PublishedAnnouncementStore(options.database);
    this.#articles = new PublishedArticleStore(options.database, options.legacyDocument);
    this.#farm = options.farm;
    this.#now = options.now ?? Date.now;
    this.prune();
  }

  prune(): void { this.#store.prune(this.#now()); }

  async sources(issueDate: string) {
    const period = dailyMaterialWindow(issueDate);
    const now = this.#now();
    this.prune();
    if (now >= materialExpiresAt(issueDate)) throw new DailyMaterialError(410, "materials_expired");
    if (now < period.end) return { issue_date: issueDate,
      window: { startMs: period.start, endMs: period.end }, windowClosed: false as const };
    const source = this.#announcements.readWindow(period, now);
    let farm: {status: "ready"; glimmer: unknown; npc: unknown} | {status: "unavailable"} = { status: "unavailable" };
    let glimmer: unknown | null = null;
    if (this.#farm) {
      try {
        const received = await this.#farm.read(issueDate);
        if (received.glimmer.window.startMs !== period.start || received.glimmer.window.endMs !== period.end ||
          received.npc.window.startMs !== period.start || received.npc.window.endMs !== period.end) throw new Error("window_mismatch");
        farm = { status: "ready", glimmer: received.glimmer, npc: received.npc };
        glimmer = publicGlimmer(received.glimmer);
      } catch { /* The independent announcement source remains available. */ }
    }
    const sourceId = this.#store.saveSourceSnapshot(issueDate, source.announcements, glimmer, this.#now());
    return { issue_date: issueDate, window: { startMs: period.start, endMs: period.end },
      windowClosed: source.windowClosed, source_id: sourceId, announcements: source.announcements, farm };
  }

  read(issueDate: string) {
    dailyMaterialWindow(issueDate);
    return { issue_date: issueDate, materials: this.#store.read(issueDate, this.#now()) };
  }

  save(input: unknown) {
    const parsed = submission.safeParse(input);
    if (!parsed.success) throw new DailyMaterialError(400, "invalid_request");
    const value = parsed.data;
    const window = dailyMaterialWindow(value.issue_date);
    this.prune();
    if (this.#now() >= materialExpiresAt(value.issue_date)) throw new DailyMaterialError(410, "materials_expired");
    if (value.status === "failed") {
      this.#store.saveFailure(value.issue_date, value.kind, this.#now());
      return { issue_date: value.issue_date, kind: value.kind, status: value.status };
    }
    if (this.#now() < window.end) throw new DailyMaterialError(409, "window_not_closed");
    let data: unknown;
    try {
      if (value.kind === "group") {
        if (value.data.issue_date !== value.issue_date) throw new DailyMaterialError(400, "issue_mismatch");
        if (Date.parse(value.data.period_start) !== window.start || Date.parse(value.data.period_end) !== window.end - 1000) {
          throw new DailyMaterialError(400, "window_mismatch");
        }
        data = value.data;
      } else if (value.kind === "npc") {
        if (value.data.window.startMs !== window.start || value.data.window.endMs !== window.end) {
          throw new DailyMaterialError(400, "window_mismatch");
        }
        data = value.data;
      } else {
        const snapshot = this.#store.sourceSnapshot(value.issue_date, value.source_id, this.#now());
        if (!snapshot) throw new DailyMaterialError(409, "source_missing");
        if (value.kind === "glimmer") {
          if (snapshot.glimmer === null) throw new DailyMaterialError(409, "source_unavailable");
          data = snapshot.glimmer;
        } else {
          const current = this.#announcements.readWindow(window, this.#now()).announcements;
          if (!sameAnnouncements(snapshot.announcements, current)) throw new DailyMaterialError(409, "source_changed");
          const reviewed = announcementReview.safeParse(value.data);
          if (!reviewed.success || reviewed.data.announcements.length !== snapshot.announcements.length ||
            new Set(reviewed.data.announcements.map((item) => item.id)).size !== snapshot.announcements.length ||
            reviewed.data.announcements.some((item) => !snapshot.announcements.some((source) => source.id === item.id))) {
            throw new DailyMaterialError(409, "review_incomplete");
          }
          const projected = projectAnnouncementReviewResponse(snapshot.announcements, current, reviewed.data);
          if (projected.unresolved.length) throw new DailyMaterialError(409, "review_incomplete");
          data = projected.materials;
        }
      }
    } catch (error) {
      if (error instanceof DailyMaterialError && error.status === 409) {
        this.#store.saveFailure(value.issue_date, value.kind, this.#now());
      }
      throw error;
    }
    this.#store.saveReady(value.issue_date, value.kind, data, this.#now(), value.kind === "glimmer" ? value.source_id : null);
    return { issue_date: value.issue_date, kind: value.kind, status: value.status };
  }

  async eligible(residentId: string): Promise<boolean> {
    if (!this.#farm) throw new DailyMaterialError(503, "qualification_unavailable");
    try { return await this.#farm.eligible(residentId); }
    catch { throw new DailyMaterialError(503, "qualification_unavailable"); }
  }

  async reporterMaterials(residentId: string, input: { keyword?: string }) {
    if (!await this.eligible(residentId)) throw new DailyMaterialError(403, "not_reporter");
    if (input.keyword !== undefined) {
      if (!input.keyword.trim()) throw new DailyMaterialError(400, "keyword_required");
      return { kind: "history" as const, keyword: input.keyword, ...this.#articles.search(input.keyword, this.#now()) };
    }
    const issueDate = new Date(this.#now() + 3 * 3_600_000).toISOString().slice(0, 10);
    return { kind: "current" as const, ...this.read(issueDate) };
  }
}

export type { MaterialKind };
