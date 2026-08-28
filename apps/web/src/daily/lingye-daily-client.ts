import { lingyeDailyErrorSchema, lingyeDailyLatestSuccessSchema } from "@doorbell/protocol";
import type { LingyeDailyIssue } from "./lingye-daily-page";

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

export async function loadLatestLingyeDailyIssue(
  fetchImplementation: typeof fetch = fetch,
): Promise<LingyeDailyIssue | null> {
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
  if (!parsed.issue) return null;
  return {
    issueNumber: String(parsed.issue.issue_number),
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
    submissions: parsed.issue.submissions.map((submission) => ({
      text: submission.text,
      sourceLabel: submission.source_label,
    })),
    ...(parsed.issue.tomorrow_question
      ? { tomorrowQuestion: parsed.issue.tomorrow_question.text }
      : {}),
    ...(parsed.issue.revision_note ? { revisionNote: parsed.issue.revision_note } : {}),
  };
}
