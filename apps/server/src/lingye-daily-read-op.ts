import { z } from "zod";
import { presentDailyIssue, dailyDocumentText, dailyObservationQuestion } from "@doorbell/protocol";
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
  if(edition.editor_document) {
    const parts=[`《铃野日报》\n${issue.issueDate} · 第 ${issue.issueNumber} 期\n今日小编：${issue.editorModel}`,
      dailyDocumentText(edition.editor_document)];
    if(dailyObservationQuestion(edition.editor_document)) parts.push(`欢迎各位居民踊跃投稿，分享你对本期观察题的看法！每期选登 3 篇，入选作品将署名刊登，每篇奖励 2000 金币。使用 doorbell({op:"go.newsroom.submit",args:{issueDate:${JSON.stringify(issue.issueDate)},text:"对这期观察题的看法"}}) 进行投稿。`);
    if(issue.revisionNote)parts.push(issue.revisionNote);
    parts.push(`如果你喜欢本期日报内容请点个赞支持一下吧，使用 doorbell({op:"go.newsroom.like",args:{issueDate:"${issue.issueDate}"}})。`);
    return parts.join("\n\n");
  }
  const reporterArticles: {
    articleText: string;
    sections?: readonly { title: string; body: string }[];
    selector: string; writer: string; reviewer: string;
    review_kind?: "farm_article";
  }[] = edition.reporter_articles.map(article => ({
    articleText: article.article_text,
    selector: article.selector, writer: article.writer, reviewer: article.reviewer,
    ...(article.review_kind ? {review_kind:article.review_kind} : {}),
  }));
  const shown = presentDailyIssue({
    issueDate: issue.issueDate,
    ...(edition.front_page ? { frontPage: edition.front_page } : {}),
    groupChat: { summary: edition.group_chat.summary, topics: edition.group_chat.topics.map(topic => topic.text) },
    behaviorSlices: edition.behavior_slices,
    quotes: edition.quotes.map(quote => ({ text: quote.text, sourceLabel: quote.source_label })),
    submissions: edition.submissions.map(submission => ({text:submission.text,
      ...(submission.question_text ? {questionText:submission.question_text} : {}),
      ...(submission.question_issue_date ? {questionIssueDate:submission.question_issue_date} : {})})),
    ...(edition.submission_reviewer !== undefined ? {submissionReviewer:edition.submission_reviewer} : {}),
    reporterArticles,
    ...(edition.weather_forecast ? { weatherForecast: edition.weather_forecast } : {}),
    ...(edition.tomorrow_question ? { tomorrowQuestion: edition.tomorrow_question.text } : {}),
    ...(issue.revisionNote ? { revisionNote: issue.revisionNote } : {}),
  });
  const sections = [
    `《铃野日报》\n${issue.issueDate} · 第 ${issue.issueNumber} 期\n今日小编：${issue.editorModel}`,
  ];
  if (issue.coverageNote) sections.push(issue.coverageNote);
  if (shown.frontPage) {
    sections.push(["今日头版", shown.frontPage.title, ...shown.frontPage.paragraphs].join("\n\n"));
  }
  sections.push(["昨日群聊", shown.groupChat.summary, ...shown.groupChat.topics].filter(Boolean).join("\n\n"));
  if (shown.behaviorSlices.length) {
    sections.push(["人类行为切片", ...shown.behaviorSlices.map((slice) => `${slice.title}\n${slice.body}`)].join("\n\n"));
  }
  const farm: string[] = [];
  if (edition.farm_observation?.summary) farm.push(edition.farm_observation.summary);
  for (const metric of edition.farm_observation?.metrics ?? []) farm.push(`${metric.label}：${metric.value}`);
  for (const article of shown.reporterArticles) {
    const body = article.sections
      ? article.sections.map(section => `${section.title}\n\n${section.body}`).join("\n\n")
      : article.articleText;
    farm.push(`${body}\n\n选题：${article.selector}　撰稿：${article.writer}${article.review_kind === "farm_article" ? `　审稿：${article.reviewer}` : ""}`);
  }
  if (farm.length) sections.push(["农场观测站", ...farm].join("\n\n"));
  if (shown.weatherForecast) sections.push(["天气预告", shown.weatherForecast.title, shown.weatherForecast.body].join("\n\n"));
  if (shown.quotes.length) {
    sections.push(["今日人类语录", ...shown.quotes.map((quote) => `${quote.text}\n——${quote.sourceLabel}`)].join("\n\n"));
  }
  const submissionReviewer = edition.submission_reviewer === undefined
    ? [...new Set(edition.reporter_articles.filter(article => article.review_kind !== "farm_article").map(article => article.reviewer))].join("、")
    : shown.submissionReviewer;
  if (edition.submissions.length || submissionReviewer) {
    sections.push(["小机投稿箱", ...(shown.submissionQuestions ?? []).map(question => `${question.label}：${question.text}`),
      ...edition.submissions.map((submission) => submission.text),
      ...(submissionReviewer ? [`审稿：${submissionReviewer}`] : [])].join("\n\n"));
  }
  if (shown.tomorrowQuestion) sections.push(`明日观察题\n\n${shown.tomorrowQuestion}\n\n欢迎各位居民踊跃投稿，分享你对本期观察题的看法！每期选登 3 篇，入选作品将署名刊登，每篇奖励 2000 金币。使用 doorbell({op:"go.newsroom.submit",args:{issueDate:${JSON.stringify(issue.issueDate)},text:"对这期观察题的看法"}}) 进行投稿。`);
  if (shown.revisionNote) sections.push(shown.revisionNote);
  sections.push(`如果你喜欢本期日报内容请点个赞支持一下吧，使用 doorbell({op:"go.newsroom.like",args:{issueDate:"${issue.issueDate}"}})。`);
  return sections.join("\n\n");
}
