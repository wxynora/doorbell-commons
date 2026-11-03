import type Database from "better-sqlite3";

export interface PublishedAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: number;
}

export type UpdateKind = "new_mechanic" | "new_event" | "numeric_change";

export interface AnnouncementReview {
  // Keep the exact input with the result so a review cannot be applied to a
  // different announcement revision or to another reading of the source.
  source: PublishedAnnouncement;
  findings: readonly { kind: UpdateKind; excerpt: string }[];
}

export interface UpdateMaterial {
  announcementId: string;
  title: string;
  publishedAt: number;
  kind: UpdateKind;
  excerpt: string;
}

export interface UpdateProjection {
  materials: UpdateMaterial[];
  unresolved: { id: string; reason: "not_reviewed" | "invalid_review" }[];
}

export function dailyMaterialWindow(issueDate: string): { start: number; end: number } {
  const end = /^\d{4}-\d{2}-\d{2}$/u.test(issueDate)
    ? Date.parse(`${issueDate}T05:00:00+08:00`) : NaN;
  if (!Number.isFinite(end) || new Date(end + 8 * 3_600_000).toISOString().slice(0, 10) !== issueDate) {
    throw new RangeError("invalid_issue_date");
  }
  return { start: end - 24 * 3_600_000, end };
}

export class PublishedAnnouncementStore {
  constructor(private readonly database: Database.Database) {}

  readIssueWindow(issueDate: string, now: number) {
    return this.readWindow(dailyMaterialWindow(issueDate), now);
  }

  readWindow(window: { start: number; end: number }, now: number): {
    start: number;
    end: number;
    windowClosed: boolean;
    announcements: PublishedAnnouncement[];
  } {
    const { start, end } = window;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new RangeError("invalid_window");
    }
    const rows = this.database.prepare(`SELECT announcement_id, title, body, published_at
      FROM human_bulletin_announcements
      WHERE published_at >= ? AND published_at < ? AND published_at <= ?`)
      .all(start, end, now) as { announcement_id: string; title: string; body: string; published_at: number }[];
    return {
      start, end, windowClosed: now >= end,
      announcements: rows.map((row) => ({
        id: row.announcement_id, title: row.title, body: row.body, publishedAt: row.published_at,
      })),
    };
  }
}

/** Bind Gateway's ID-based findings to the exact sources sent for review.
 * Read current sources again before delivery; a changed source stays unresolved.
 */
export function projectAnnouncementReviewResponse(
  sourcesAtRequest: readonly PublishedAnnouncement[],
  currentSources: readonly PublishedAnnouncement[],
  response: unknown,
): UpdateProjection {
  if (!response || typeof response !== "object" ||
    !("announcements" in response) || !Array.isArray(response.announcements)) {
    return {
      materials: [],
      unresolved: currentSources.map((source) => ({ id: source.id, reason: "invalid_review" })),
    };
  }
  const reviews: AnnouncementReview[] = [];
  for (const raw of response.announcements as unknown[]) {
    if (!raw || typeof raw !== "object" || !("id" in raw)) continue;
    const source = sourcesAtRequest.find((item) => item.id === raw.id);
    if (!source) continue;
    // The existing projection validates the complete findings shape and text.
    reviews.push({
      source,
      findings: ("findings" in raw ? raw.findings : undefined) as AnnouncementReview["findings"],
    });
  }
  return projectReviewedUpdates(currentSources, reviews);
}

/** Review is external to this projection; no classification is inferred from keywords. */
export function projectReviewedUpdates(
  announcements: readonly PublishedAnnouncement[],
  reviews: readonly AnnouncementReview[],
): UpdateProjection {
  const result: UpdateProjection = { materials: [], unresolved: [] };
  const shownExcerpts = new Set<string>();
  for (const source of announcements) {
    const candidates = reviews.filter((review) => review.source.id === source.id);
    if (candidates.length === 0) {
      result.unresolved.push({ id: source.id, reason: "not_reviewed" });
      continue;
    }
    const review = candidates[0]!;
    if (candidates.length !== 1 || review.source.title !== source.title ||
      review.source.body !== source.body || review.source.publishedAt !== source.publishedAt ||
      !Array.isArray(review.findings) || review.findings.some((finding) =>
        !finding || !["new_mechanic", "new_event", "numeric_change"].includes(finding.kind) ||
        typeof finding.excerpt !== "string" || !finding.excerpt.trim() || !source.body.includes(finding.excerpt))) {
      result.unresolved.push({ id: source.id, reason: "invalid_review" });
      continue;
    }
    for (const finding of review.findings) {
      // Every source is validated above before identical excerpts are merged for reporters.
      if (shownExcerpts.has(finding.excerpt)) continue;
      shownExcerpts.add(finding.excerpt);
      result.materials.push({
        announcementId: source.id, title: source.title, publishedAt: source.publishedAt,
        kind: finding.kind, excerpt: finding.excerpt,
      });
    }
  }
  return result;
}
