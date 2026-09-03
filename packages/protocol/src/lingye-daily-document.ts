import { z } from "zod";
import { presentDailyIssue } from "./lingye-daily-presentation.js";
import type { LingyeDailyEditionPublish } from "./index.js";

export const dailyTextRunSchema = z.object({ text: z.string(), bold: z.boolean().optional() }).strict();
export const dailyBlockSchema = z.object({
  type: z.enum(["paragraph", "heading", "quote", "byline", "submission", "question", "image"]),
  runs: z.array(dailyTextRunSchema),
  imageId: z.string().optional(),
  submissionId: z.string().optional(),
}).strict();
export const dailyDocumentSchema = z.object({
  version: z.literal(1),
  sections: z.array(z.object({
    key: z.enum(["front", "group", "slices", "farm", "weather", "quotes", "submissions", "tomorrow"]),
    title: z.string(), blocks: z.array(dailyBlockSchema),
  }).strict()),
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.sections.map(section => section.key)).size !== doc.sections.length)
    ctx.addIssue({code: "custom", message: "栏目不能重复"});
});
export type DailyDocument = z.infer<typeof dailyDocumentSchema>;
export type DailyBlock = z.infer<typeof dailyBlockSchema>;
export type DailyTextRun = z.infer<typeof dailyTextRunSchema>;
export const dailyBlockText = (block: DailyBlock): string => block.runs.map(run => run.text).join("");
export function dailyDocumentText(document: DailyDocument): string {
  return document.sections.filter(section => section.blocks.length).map(section =>
    [section.title, ...section.blocks.filter(block => block.type !== "image").map(dailyBlockText)]
      .filter(Boolean).join("\n\n")).join("\n\n");
}
export function dailyObservationQuestion(document: DailyDocument): string | null {
  const text = document.sections.find(section => section.key === "tomorrow")?.blocks
    .filter(block => block.type !== "image").map(dailyBlockText).join("\n").trim();
  return text || null;
}

// Import happens once. Subsequent human edits are the stored document, not a
// date-specific display patch or a separately rewritten machine edition.
export function dailyDocumentFromEdition(edition: LingyeDailyEditionPublish, issueDate: string): DailyDocument {
  if (edition.editor_document) return structuredClone(edition.editor_document);
  const shown = presentDailyIssue({
    issueDate,
    ...(edition.front_page ? {frontPage: edition.front_page} : {}),
    groupChat: {summary: edition.group_chat.summary, topics: edition.group_chat.topics.map(topic => topic.text)},
    behaviorSlices: edition.behavior_slices,
    quotes: edition.quotes.map(quote => ({text:quote.text,sourceLabel:quote.source_label})),
    reporterArticles: edition.reporter_articles.map(article => ({...article, articleText:article.article_text})),
    submissions: edition.submissions.map(sub => ({text:sub.text,
      ...(sub.question_text ? {questionText:sub.question_text} : {}),
      ...(sub.question_issue_date ? {questionIssueDate:sub.question_issue_date} : {})})),
    ...(edition.submission_reviewer !== undefined ? {submissionReviewer:edition.submission_reviewer} : {}),
    ...(edition.weather_forecast ? {weatherForecast:edition.weather_forecast} : {}),
    ...(edition.tomorrow_question ? {tomorrowQuestion:edition.tomorrow_question.text} : {}),
  });
  const emphasis = [...(shown.emphasisTexts ?? []), ...(shown.emphasisText ? [shown.emphasisText] : [])];
  const block = (type: DailyBlock["type"], text: string, extra = {}): DailyBlock => {
    let runs: DailyTextRun[] = [{text}];
    for (const phrase of emphasis) runs = runs.flatMap(run => {
      if (run.bold || !phrase) return [run];
      return run.text.split(phrase).flatMap((part, index) => [
        ...(index ? [{text:phrase,bold:true}] : []), ...(part ? [{text:part}] : []),
      ]);
    });
    return {type,runs,...extra};
  };
  const paragraphs = (text: string, type: DailyBlock["type"] = "paragraph") => text.split(/\n+/u)
    .map(line => line.trim()).filter(Boolean).map(line => block(type, line));
  const image = (id: string): DailyBlock => ({type:"image",runs:[],imageId:id});
  const sections: DailyDocument["sections"] = [];
  const section = (key: DailyDocument["sections"][number]["key"], title:string, blocks:DailyBlock[]) => {
    if (blocks.length) sections.push({key,title,blocks});
  };
  if (shown.frontPage) section("front","今日头版",[
    block("heading",shown.frontPage.title ?? ""), ...(edition.front_page?.image_ids ?? []).map(image),
    ...shown.frontPage.paragraphs.flatMap(text => paragraphs(text)),
  ]);
  section("group","昨日群聊",[
    ...paragraphs(shown.groupChat.summary), ...shown.groupChat.topics.map(text => block("paragraph",text)),
  ]);
  section("slices","人类行为切片",shown.behaviorSlices.flatMap((slice,index) => [
    block("heading",slice.title), ...(edition.behavior_slices[index]?.image_ids ?? []).map(image), ...paragraphs(slice.body),
  ]));
  const farm:DailyBlock[] = [];
  if(edition.farm_observation?.summary) farm.push(...paragraphs(edition.farm_observation.summary));
  for (const metric of edition.farm_observation?.metrics ?? []) farm.push(block("paragraph",`${metric.label}：${metric.value}`));
  for (const article of shown.reporterArticles) {
    if (article.sections) for (const part of article.sections) farm.push(block("heading",part.title),...paragraphs(part.body));
    else for (const raw of article.articleText.split(/\n+/u).map(line=>line.trim()).filter(Boolean)) {
      if (/^【铃野日报[·・].*】\s*\d*$/u.test(raw)) continue;
      const heading = /^(?:#{1,3}\s+|[一二三四五六七八九十\d]+[、.．]\s*|【(?:头条|二条)】)/u;
      farm.push(block(heading.test(raw) ? "heading" : "paragraph",raw.replace(heading,"")));
    }
    farm.push(block("byline",`选题：${article.selector}　撰稿：${article.writer}${article.review_kind === "farm_article" ? `　审稿：${article.reviewer}` : ""}`));
  }
  section("farm","农场观测站",farm);
  if(shown.weatherForecast) section("weather","天气预告",[
    block("heading",shown.weatherForecast.title),...paragraphs(shown.weatherForecast.body),
  ]);
  section("quotes","今日人类语录",shown.quotes.flatMap(quote=>[
    block("quote",quote.text), block("byline",`——${quote.sourceLabel ?? ""}`),
  ]));
  section("submissions","小机投稿箱",[
    ...(shown.submissionQuestions ?? []).map(question=>block("question",`${question.label}：${question.text}`)),
    ...edition.submissions.map(sub=>block("submission",sub.text,{submissionId:sub.submission_id})),
    ...(shown.submissionReviewer ? [block("byline",`审稿：${shown.submissionReviewer}`)] : []),
  ]);
  if (shown.tomorrowQuestion) section("tomorrow","明日观察题",paragraphs(shown.tomorrowQuestion));
  return dailyDocumentSchema.parse({version:1,sections});
}
