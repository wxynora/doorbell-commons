export interface DailyPresentationFields {
  issueDate?: string;
  frontPage?: { paragraphs: readonly string[] };
  groupChat?: { summary: string };
  tomorrowQuestion?: string;
  revisionNote?: string;
  emphasisText?: string;
  weatherForecast?: { title: string; body: string };
  reporterArticles?: readonly {
    articleText: string;
    sections?: readonly { title: string; body: string }[];
  }[];
}

// Both published readers apply the owner's same approved edits.
// The submitted manuscript remains unchanged.
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T): T & DailyPresentationFields;
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T | null): (T & DailyPresentationFields) | null;
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T | null): (T & DailyPresentationFields) | null {
  if (!issue || issue.issueDate !== "2026-09-02") return issue;
  const shown: T & DailyPresentationFields = { ...issue };
  if (issue.groupChat) shown.groupChat = {
    ...issue.groupChat,
    summary: issue.groupChat.summary.replace(/^今日群内话题紧密围绕/u, "昨日群内话题紧密围绕"),
  };
  if (issue.tomorrowQuestion) shown.tomorrowQuestion = issue.tomorrowQuestion.replace(
    "‘违法偷金五次’被送进看守所的倒霉蛋", "偷菜被抓蹲大牢的倒霉蛋",
  );
  const correction = "由于编辑部疏忽，本期排行榜素材采集有误，相关内容存在错漏，谨向读者致歉。";
  shown.revisionNote = issue.revisionNote?.includes(correction) ? issue.revisionNote
    : [issue.revisionNote, correction].filter(Boolean).join("\n");
  const emphasis = issue.frontPage?.paragraphs.join("\n").match(/铃野第一位满分考生[^。]*。/u)?.[0];
  if (emphasis) shown.emphasisText = emphasis;

  const firstTitle = "【头条】一天花掉二十八万九，其余四家合计三千一";
  const secondTitle = "【二条】热心榜第一浇了十一次，大盗榜全服只有两家上榜";
  const weatherText = "【三条·服务版】未来三日连雨，头一天是暴雨\n\n第 20699、20700、20701 日天气预告：春季第 5 日暴雨，第 6 日、第 7 日小雨，连续三天有雨。贵重作物别留在地里过夜。";
  const compact = (text: string) => text.replace(/\n(?:[\t ]*\n)+/gu, "\n");
  if (issue.reporterArticles) shown.reporterArticles = issue.reporterArticles.map(article => {
    if (!article.articleText.startsWith(firstTitle + "\n\n") || !article.articleText.endsWith(weatherText)) return article;
    const text = article.articleText.slice(firstTitle.length + 2, -weatherText.length).trimEnd()
      .replace("本条的批评包括批评自己。", "本条的批评包括批评自己。（某顾性男机如是说）")
      .replaceAll("翘边小田 DQVQ8R", "翘边小田")
      .replaceAll("昭宁小院 YX5AWC", "昭宁小院");
    const bodies = text.split("\n\n" + secondTitle + "\n\n");
    if (bodies.length !== 2) return article;
    shown.weatherForecast = {
      title: "未来三日连雨，头一天是暴雨",
      body: weatherText.split("\n\n")[1]!.replace("第 20699、20700、20701 日天气预告", "9月3日至5日天气预告"),
    };
    return { ...article, sections: [
      { title: "震惊 某家竟一天花掉二十八万九", body: compact(bodies[0]!) },
      { title: "这届邻居，帮忙浇水比偷菜还积极", body: compact(bodies[1]!) },
    ] };
  });
  return shown;
}
