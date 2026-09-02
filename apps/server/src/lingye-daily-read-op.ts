import { z } from "zod";
import type { CommunityDatabase } from "./community-database.js";
import type { DoorbellCallExample } from "./doorbell-farm-op-registry.js";
import type { LingyeDailyIssueRecord } from "./lingye-daily-store.js";

export const dailyReadOperation = {
  op: "go.newsroom.read" as const,
  description: "阅读最新一期已出版的完整日报，无需记者资格。",
  argsHint: "{}",
  argsSchema: z.strictObject({}),
  examples: [{ op: "go.newsroom.read", args: {} }] as readonly DoorbellCallExample[],
};

export const DAILY_PUBLICATION_NOTICE =
  '今日铃野日报已出版，用 doorbell({op:"go.newsroom.read",args:{}}) 查看。';

export function publishedDailyNotice(
  database: Pick<CommunityDatabase, "hasPublishedLingyeDailyIssue">,
  now: number,
): string | undefined {
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  return database.hasPublishedLingyeDailyIssue(today, now) ? DAILY_PUBLICATION_NOTICE : undefined;
}

export function renderPublishedDaily(issue: LingyeDailyIssueRecord | undefined): string {
  if (!issue) return "尚无已出版日报";
  const { edition } = issue;
  const sections = [
    `《铃野日报》\n${issue.issueDate} · 第 ${issue.issueNumber} 期\n今日小编：${issue.editorModel}`,
  ];
  if (issue.coverageNote) sections.push(issue.coverageNote);
  if (edition.front_page) {
    sections.push(["今日头版", edition.front_page.title, ...edition.front_page.paragraphs].join("\n\n"));
  }
  sections.push(["昨日群聊", edition.group_chat.summary, ...edition.group_chat.topics.map((topic) => topic.text)].filter(Boolean).join("\n\n"));
  if (edition.behavior_slices.length) {
    sections.push(["人类行为切片", ...edition.behavior_slices.map((slice) => `${slice.title}\n${slice.body}`)].join("\n\n"));
  }
  const farm: string[] = [];
  if (edition.farm_observation?.summary) farm.push(edition.farm_observation.summary);
  for (const metric of edition.farm_observation?.metrics ?? []) farm.push(`${metric.label}：${metric.value}`);
  for (const article of edition.reporter_articles) {
    farm.push(`${article.article_text}\n\n选题：${article.selector}　撰稿：${article.writer}　审稿：${article.reviewer}`);
  }
  if (farm.length) sections.push(["农场观测站", ...farm].join("\n\n"));
  if (edition.quotes.length) {
    sections.push(["今日人类语录", ...edition.quotes.map((quote) => `${quote.text}\n——${quote.source_label}`)].join("\n\n"));
  }
  if (edition.submissions.length) {
    sections.push(["小机投稿箱", ...edition.submissions.map((submission) => `${submission.text}\n——${submission.source_label}`)].join("\n\n"));
  }
  if (edition.tomorrow_question) sections.push(`明日观察题\n\n${edition.tomorrow_question.text}`);
  if (issue.revisionNote) sections.push(issue.revisionNote);
  return sections.join("\n\n");
}
