import {
  lingyeDailyErrorSchema,
  lingyeDailyLatestSuccessSchema,
  lingyeDailyLikeSuccessSchema,
} from "@doorbell/protocol";
import type { LingyeDailyIssue, LingyeDailyReporterPublication } from "./lingye-daily-page";

export class LingyeDailyReadError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Lingye Daily read failed: ${code}`);
    this.name = "LingyeDailyReadError";
    this.status = status;
    this.code = code;
  }
}

function dateLabel(issueDate: string): string {
  const [year, month, day] = issueDate.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function reporterPublications(
  input: ReturnType<typeof lingyeDailyLatestSuccessSchema.parse>["reporter_publications"],
): LingyeDailyReporterPublication[] {
  return input.status === "available"
    ? input.items.map((publication) => ({
        ...(publication.publication_id ? { publicationId: publication.publication_id } : {}),
        likeRef: publication.like_ref,
        articleText: publication.article_text,
        sectionName: publication.section_name,
        authorName: publication.author_name,
        authorFarmName: publication.author_farm_name,
        publishedAt: publication.published_at,
        evaluationClosesAt: publication.evaluation_closes_at,
        validLikes: publication.valid_likes,
        hasLiked: publication.has_liked,
        canLike: publication.can_like,
        ownHousehold: publication.own_household,
        status: publication.status,
      }))
    : [];
}

export async function loadLatestLingyeDaily(fetchImplementation: typeof fetch = fetch): Promise<{
  issue: LingyeDailyIssue | null;
  reporterPublications: LingyeDailyReporterPublication[];
}> {
  const response = await fetchImplementation("/api/lingye-daily/latest", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const parsedError = lingyeDailyErrorSchema.safeParse(body);
    throw new LingyeDailyReadError(
      response.status,
      parsedError.success ? parsedError.data.error.code : "invalid_response",
    );
  }
  const parsed = lingyeDailyLatestSuccessSchema.parse(body);
  const reporterItems = reporterPublications(parsed.reporter_publications);
  if (!parsed.issue) return { issue: null, reporterPublications: reporterItems };
  return {
    issue: {
      issueNumber: String(parsed.issue.issue_number),
      issueDate: parsed.issue.issue_date,
      dateLabel: dateLabel(parsed.issue.issue_date),
      editorName: parsed.issue.editor_model,
      ...(parsed.issue.front_page
        ? {
            frontPage: {
              title: parsed.issue.front_page.title,
              paragraphs: parsed.issue.front_page.paragraphs,
              imageUrls: parsed.issue.front_page.image_urls,
            },
          }
        : {}),
      groupChat: {
        summary: parsed.issue.group_chat.summary,
        topics: parsed.issue.group_chat.topics,
      },
      behaviorSlices: parsed.issue.behavior_slices.map((slice) => ({
        title: slice.title,
        body: slice.body,
        imageUrls: slice.image_urls,
      })),
      quotes: parsed.issue.quotes.map((quote) => ({
        text: quote.text,
        sourceLabel: quote.source_label,
      })),
      ...(parsed.issue.farm_observation
        ? {
            farmObservation: {
              ...(parsed.issue.farm_observation.summary
                ? { summary: parsed.issue.farm_observation.summary }
                : {}),
              metrics: parsed.issue.farm_observation.metrics,
            },
          }
        : {}),
      reporterArticles: parsed.issue.reporter_articles.map((article) => ({
        publicationId: article.publication_id,
        articleText: article.article_text,
        selector: article.selector,
        writer: article.writer,
        reviewer: article.reviewer,
      })),
      submissions: parsed.issue.submissions.map((submission) => ({
        text: submission.text,
        sourceLabel: submission.source_label,
      })),
      ...(parsed.issue.submission_reviewer !== undefined ? { submissionReviewer: parsed.issue.submission_reviewer } : {}),
      ...(parsed.issue.weather_forecast ? { weatherForecast: parsed.issue.weather_forecast } : {}),
      ...(parsed.issue.tomorrow_question
        ? { tomorrowQuestion: parsed.issue.tomorrow_question.text }
        : {}),
      ...(parsed.issue.revision_note ? { revisionNote: parsed.issue.revision_note } : {}),
    },
    reporterPublications: reporterItems,
  };
}

export async function loadLatestLingyeDailyIssue(
  fetchImplementation: typeof fetch = fetch,
): Promise<LingyeDailyIssue | null> {
  return (await loadLatestLingyeDaily(fetchImplementation)).issue;
}

export async function likeLingyeDailyReporterPublication(
  likeRef: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<LingyeDailyReporterPublication[]> {
  const response = await fetchImplementation("/api/lingye-daily/likes", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ like_ref: likeRef }),
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const parsedError = lingyeDailyErrorSchema.safeParse(body);
    throw new LingyeDailyReadError(
      response.status,
      parsedError.success ? parsedError.data.error.code : "invalid_response",
    );
  }
  const parsed = lingyeDailyLikeSuccessSchema.parse(body);
  return reporterPublications(parsed.reporter_publications);
}
