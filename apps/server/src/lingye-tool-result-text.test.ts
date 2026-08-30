import assert from "node:assert/strict";
import test from "node:test";
import type { LingyeActionResult } from "@doorbell/protocol";
import { renderLingyeToolText } from "./lingye-tool-result-text.js";

function success(text: string, data: Record<string, unknown>) {
  return { ok: true, text, data } as Extract<LingyeActionResult, { ok: true }>;
}

test("bank view is readable and keeps current options as explicit next actions", () => {
  const text = renderLingyeToolText(
    "go.bank.view",
    { section: "account" },
    success("已读取银行当前事实。", {
      section: "account",
      value: {
        availableGold: 172_536,
        availableSilver: 2_093,
        demandGold: 0,
        termGold: 0,
        silverAgentLock: 0,
        agentSpendableSilver: 2_093,
        creditPoints: 0,
        highSpendRestricted: false,
      },
      options: [
        { option: "bank:demand-deposit:26", requires: ["amount"] },
        {
          option: "bank:player-loan-request:26",
          requires: ["to", "amount", "termDays", "totalRatePpm"],
        },
      ],
    }),
  );

  assert.match(text, /^🏦 铃野银行/u);
  assert.match(text, /可用金币 172536/u);
  assert.match(text, /可用银币 2093/u);
  assert.match(text, /存入金币活期/u);
  assert.match(text, /还需填写：金额（正整数）/u);
  assert.doesNotMatch(text, /\\"|"availableSilver"|\{\s*"section"/u);
});

test("bank choose states the completed business instead of dumping its result object", () => {
  const text = renderLingyeToolText(
    "go.bank.choose",
    { option: "bank:demand-deposit:26", amount: 500 },
    success("银行业务已办理。", {
      result: { journalId: "journal-1" },
      current: {
        account: {
          availableGold: 172_036,
          availableSilver: 2_093,
          demandGold: 500,
          termGold: 0,
          silverAgentLock: 0,
          agentSpendableSilver: 2_093,
          creditPoints: 0,
          highSpendRestricted: false,
        },
        options: [],
      },
    }),
  );
  assert.match(text, /本次业务：存入金币活期/u);
  assert.match(text, /金币活期 500/u);
  assert.doesNotMatch(text, /journalId|\\"/u);
});

test("school view renders course progress and a directly callable current option", () => {
  const text = renderLingyeToolText(
    "go.school.view",
    { section: "courses" },
    success("已读取职业学校当前事实。", {
      section: "courses",
      value: {
        catalog: [
          {
            career: "reporter",
            qualificationLevel: 1,
            courseIndex: 1,
            title: "《消息不是新闻》",
            tuitionGold: 30_000,
            contentAvailable: true,
          },
        ],
        progress: [{ career: "chef", qualificationLevel: 1, courseIndex: 1 }],
      },
      options: [{ option: "school:course-read:1:chef:1:1:course-v1" }],
    }),
  );
  assert.match(text, /^🏫 铃野职业学校/u);
  assert.match(text, /记者 1 级第 1 门 《消息不是新闻》；学费 30000 金币/u);
  assert.match(text, /料理师/u);
  assert.match(text, /读取这门课程全文：doorbell/u);
  assert.match(text, /确认已阅读课程/u);
  assert.match(text, /可直接调用：doorbell\(\{"op":"go\.school\.choose"/u);
  assert.doesNotMatch(text, /\\"|"career"/u);
});

test("school results show the complete course and the complete paper in one response", () => {
  const courseText = renderLingyeToolText(
    "go.school.view",
    { reference: "chef:2:3" },
    success("已读取职业学校记录。", {
      reference: {
        type: "course",
        content: {
          title: "原创菜谱登记学",
          contentMarkdown: "菜谱身份由食材、数量与制作方式共同决定。",
          practiceQuestions: Array.from({ length: 5 }, (_, index) => ({
            id: `q-${index + 1}`,
            stem: `课程练习 ${index + 1}`,
            options: { A: "甲", B: "乙", C: "丙", D: "丁" },
          })),
        },
      },
      options: [],
    }),
  );
  assert.match(courseText, /课程正文：\n菜谱身份由食材、数量与制作方式共同决定/u);
  assert.match(courseText, /课程练习（一次查看全部 5 题）/u);
  assert.match(courseText, /5\. 课程练习 5/u);

  const examText = renderLingyeToolText(
    "go.school.choose",
    { option: "school:exam-start:3:attempt-1" },
    success("职业学校业务已办理。", {
      result: {
        questions: Array.from({ length: 20 }, (_, index) => ({
          id: `exam-${index + 1}`,
          stem: `资格考试 ${index + 1}`,
          options: { A: "甲", B: "乙", C: "丙", D: "丁" },
        })),
      },
      current: { options: [] },
    }),
  );
  assert.match(examText, /试卷（一次查看全部 20 题）/u);
  assert.match(examText, /20\. 资格考试 20/u);
});

for (const op of [
  "go.farm.commission",
  "go.hospital.commission",
  "go.security.commission",
] as const) {
  test(`${op} renders real jobs and readable options without a raw JSON payload`, () => {
    const text = renderLingyeToolText(
      op,
      {},
      success("已读取当前真实委托。", {
        jobs: [{ jobId: "job-1", career: "agronomist", status: "available" }],
        sources: [{ sourceId: "plot-1", condition: "drought" }],
        options: [{ option: "commission:accept:job-1" }],
      }),
    );
    assert.match(text, /^📋 铃野委托/u);
    assert.match(text, /农艺师/u);
    assert.match(text, /接取委托/u);
    assert.match(text, new RegExp(`"op":"${op.replaceAll(".", "\\.")}"`, "u"));
    assert.doesNotMatch(text, /\\"|"jobs"/u);
  });
}
