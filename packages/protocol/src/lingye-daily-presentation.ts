export interface DailyPresentationFields {
  issueDate?: string;
  frontPage?: { title?: string; paragraphs: readonly string[] };
  groupChat?: { summary: string; topics?: readonly string[] };
  behaviorSlices?: readonly { title: string; body: string }[];
  quotes?: readonly { text: string; sourceLabel?: string }[];
  tomorrowQuestion?: string;
  revisionNote?: string;
  emphasisText?: string;
  emphasisTexts?: readonly string[];
  submissions?: readonly { text: string; sourceLabel?: string; questionText?: string; questionIssueDate?: string }[];
  submissionReviewer?: string | null;
  submissionQuestions?: readonly { label: string; text: string }[];
  weatherForecast?: { title: string; body: string };
  reporterArticles?: readonly {
    articleText: string;
    sections?: readonly { title: string; body: string; paragraphs?: readonly string[] }[];
  }[];
}

// Both published readers apply the owner's same approved edits.
// The submitted manuscript remains unchanged.
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T): T & DailyPresentationFields;
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T | null): (T & DailyPresentationFields) | null;
export function presentDailyIssue<T extends DailyPresentationFields>(issue: T | null): (T & DailyPresentationFields) | null {
  if (issue && (issue.submissions?.length || issue.submissionReviewer)) {
    const yesterday = issue.issueDate ? new Date(Date.parse(issue.issueDate) - 86_400_000).toISOString().slice(0,10) : undefined;
    const questions = new Map<string, {label:string;text:string}>();
    for (const submission of issue.submissions ?? []) {
      if (!submission.questionText) continue;
      const text = submission.questionIssueDate === "2026-09-02"
        ? submission.questionText.replace("‘违法偷金五次’被送进看守所的倒霉蛋", "偷菜被抓蹲大牢的倒霉蛋")
        : submission.questionText;
      const label = submission.questionIssueDate === yesterday ? "昨日观察题" : `${submission.questionIssueDate ?? "往期"}观察题`;
      questions.set(`${label}:${text}`, { label, text });
    }
    const reviewer = issue.submissionReviewer;
    issue = { ...issue, submissionQuestions: [...questions.values()],
      ...(reviewer?.includes(" & ") ? { submissionReviewer: reviewer.slice(reviewer.indexOf(" & ") + 3) } : {}) };
  }
  if (issue?.issueDate === "2026-09-03") return presentSeptemberThird(issue);
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

function presentSeptemberThird<T extends DailyPresentationFields>(issue: T): T & DailyPresentationFields {
  const shown: T & DailyPresentationFields = { ...issue };
  const name = (text: string) => text.replaceAll("🦊", "初礼");
  if (issue.frontPage) shown.frontPage = {
    ...issue.frontPage,
    ...(issue.frontPage.title !== undefined ? { title: name(issue.frontPage.title) } : {}),
    paragraphs: issue.frontPage.paragraphs.map(name),
  };
  if (issue.groupChat) shown.groupChat = {
    ...issue.groupChat,
    summary: name(issue.groupChat.summary),
    ...(issue.groupChat.topics ? { topics: issue.groupChat.topics.map(name) } : {}),
  };
  if (issue.behaviorSlices) shown.behaviorSlices = issue.behaviorSlices.map(slice => ({
    ...slice, title: name(slice.title), body: name(slice.body),
  }));
  if (issue.quotes) shown.quotes = issue.quotes.map(quote => ({
    ...quote, text: name(quote.text),
    ...(quote.sourceLabel !== undefined ? { sourceLabel: name(quote.sourceLabel) } : {}),
  }));
  const first = "偷了三次，进了一次，账面还少两千";
  const subtitle = "——一份看守所记录与三张榜单的对账";
  const second = "招牌写着「真的不种了！」，当日拿下三个榜首";
  if (issue.reporterArticles) shown.reporterArticles = issue.reporterArticles.map(article => {
    const text = name(article.articleText)
      .replace(/^【铃野日报·农场日常观测】2026-09-02\s*/u, "")
      .replace("她负责让别人的地不干。", "他负责让别人的地不干。");
    const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    const secondAt = lines.indexOf(second);
    if (lines[0] !== first || lines[1] !== subtitle || secondAt < 2) return { ...article, articleText: text };
    const paragraphs = [lines.slice(2, secondAt), lines.slice(secondAt + 1)];
    return {
      ...article, articleText: lines.join("\n"),
      sections: [
        { title: `${first}\n${subtitle}`, body: paragraphs[0]!.join("\n"), paragraphs: paragraphs[0]! },
        { title: second, body: paragraphs[1]!.join("\n"), paragraphs: paragraphs[1]! },
      ],
    };
  });
  shown.emphasisTexts = [
    "原来并非系统故障，而是偷菜当事人顾澄被治安系统逮捕，正处于看守所服刑状态。",
    "自己会用最公正的态度审阅，“绝对不会因为私人恩怨多看两眼”。",
    "并当即表示“我背叛了煎蛋教”。",
    "同一天的看守所记录只有一行字：顾澄因偷菜被关进看守所。",
    "出门三次、进局子一次、回家发现自家少了两千。这不是败家榜那种大手一挥的消费，是一种更细致的亏损",
    "这份行程表里唯一没出现的动作，可能就是「不种」。",
    "不种自己的地，去浇别人的地；不为自己攒金，把十五万花出去。这样看，「真的不种了」也许不是退圈宣言，而是一种分工：种地这件事交给别人，他负责让别人的地不干。",
  ];
  return shown;
}
