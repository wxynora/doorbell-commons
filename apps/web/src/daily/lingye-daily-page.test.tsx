/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type LingyeDailyIssue, LingyeDailyPage } from "./lingye-daily-page";

const ISSUE: LingyeDailyIssue = {
  issueNumber: "测试期",
  dateLabel: "测试日期",
  editorName: "测试小编",
  frontPage: {
    title: "测试头版",
    paragraphs: ["测试导语"],
    imageUrls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
  },
  groupChat: {
    summary: "测试群聊概览",
  },
  behaviorSlices: [
    {
      title: "测试事件",
      body: "测试事件正文",
      imageUrls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
    },
  ],
  quotes: [{ text: "测试语录" }],
  farmObservation: {
    summary: "测试农场事实",
    metrics: [{ label: "测试指标", value: "1" }],
  },
  submissions: [{ text: "测试投稿" }],
  tomorrowQuestion: "测试问题？",
};

test("Lingye Daily keeps the approved sections inside one newspaper", () => {
  const html = renderToStaticMarkup(<LingyeDailyPage issue={ISSUE} />);

  for (const label of [
    "铃野日报",
    "今日头版",
    "今日群聊",
    "人类行为切片",
    "今日人类语录",
    "农场观测站",
    "小机投稿箱",
    "明日观察题",
  ]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /测试头版/);
  assert.match(html, /测试群聊概览/);
  assert.match(html, /测试农场事实/);
  assert.equal((html.match(/本期群聊来源图片/g) ?? []).length, 2);
});

test("Lingye Daily has an honest unpublished state", () => {
  const html = renderToStaticMarkup(<LingyeDailyPage issue={null} />);

  assert.match(html, /尚无已出版日报/);
  assert.doesNotMatch(html, /2023年12月24日|0\.5 能量豆|24°M|多云转晴|暖色调毛衣/);
});

test("Lingye Daily copies the downloaded newspaper grid and mobile collapse", () => {
  const css = readFileSync(new URL("./lingye-daily-page.css", import.meta.url), "utf8");

  assert.match(css, /--daily-bg:\s*#f6f0df/i);
  assert.match(css, /--daily-text:\s*#3a4b5c/i);
  assert.match(css, /max-width:\s*600px/);
  assert.match(css, /grid-template-columns:\s*1fr 140px/);
  assert.match(css, /@media \(max-width:\s*480px\)/);
  assert.match(css, /grid-template-columns:\s*1fr;/);
});

test("Lingye Daily keeps the original quote emphasis and a compact standalone submission invitation", () => {
  const css = readFileSync(new URL("./lingye-daily-page.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.daily-quote-text\s*\{[^}]*font-size:\s*18px;[^}]*font-style:\s*italic;[^}]*font-weight:\s*700;/s,
  );
  assert.match(
    css,
    /\.daily-document-copy\s+\.daily-document-quote\s+\.daily-quote-text\s*\{[^}]*font-size:\s*18px;[^}]*font-style:\s*italic;[^}]*font-weight:\s*700/s,
  );
  assert.match(
    css,
    /\.lingye-daily-page\s*>\s*\.daily-submission-note\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.7;/s,
  );
});

test("Lingye Daily preview opens directly without Vite or TSX", () => {
  const html = readFileSync(new URL("../../lingye-daily-preview.html", import.meta.url), "utf8");

  assert.match(html, /href="\.\/src\/daily\/lingye-daily-page\.css"/);
  assert.match(html, /id="lingye-daily-preview-root"[\s\S]*?尚无已出版日报/);
  assert.doesNotMatch(html, /type="module"|lingye-daily-preview\.tsx|src="\/src\//);
});
