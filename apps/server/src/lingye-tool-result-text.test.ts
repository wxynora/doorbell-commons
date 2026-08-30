import assert from "node:assert/strict";
import test from "node:test";
import type { LingyeActionResult } from "@doorbell/protocol";
import { renderLingyeToolText } from "./lingye-tool-result-text.js";

const PRIVATE_UUID = "019ffc05-49cd-7020-84af-3d04fb1ed03d";
const PRIVATE_HEX = "a".repeat(64);
const INTERNAL_FIELD =
  /residentId|sourceId|objectId|ownerId|jobId|loanId|depositId|attemptId|reservationId|employmentId|dutyId|interviewId|noticeId|paperId|contentDeliveryId|journalId|tradeId|actionKey|idempotency|notification_id/iu;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const LONG_HEX = /\b[0-9a-f]{64}\b/iu;
const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;

function success(text: string, data: Record<string, unknown>) {
  return { ok: true, text, data } as Extract<LingyeActionResult, { ok: true }>;
}

function assertNoPrivateLeak(text: string): void {
  assert.doesNotMatch(text, INTERNAL_FIELD);
  assert.doesNotMatch(text, UUID);
  assert.doesNotMatch(text, LONG_HEX);
  assert.doesNotMatch(text, /\\"|\{\s*"/u);
  assert.doesNotMatch(text.replaceAll(/opt_[A-Za-z0-9_-]{12}/gu, "短办理编号"), SNAKE_CASE);
}

test("all seven public Lingye operations render only player-facing Chinese facts", () => {
  const cases = [
    {
      op: "go.bank.view",
      args: {},
      data: {
        account: {
          availableGold: 172_536,
          availableSilver: 2_093,
          demandGold: 500,
          termGold: 20_000,
          silverAgentLock: 10,
          agentSpendableSilver: 2_083,
          creditPoints: 8,
          highSpendRestricted: false,
          residentId: PRIVATE_UUID,
        },
        deposits: {
          demandGold: 500,
          termDeposits: [
            {
              depositId: PRIVATE_UUID,
              principal: 20_000,
              termDays: 30,
              totalRatePpm: 20_000,
              maturityDay: 300,
              state: "active",
            },
          ],
        },
        exchange: {
          goldPerSilver: 500,
          residentRemainingThisMonth: 900,
          globalRemainingThisMonth: 8_000,
        },
        loans: {
          systemLoans: [
            {
              loanId: PRIVATE_UUID,
              principalOriginal: 1_000,
              principalOutstanding: 800,
              accruedInterest: 20,
              termDays: 14,
              dueDay: 220,
              status: "active",
            },
          ],
          playerLoans: [],
        },
        credit: { creditPoints: 8, highSpendRestricted: false },
        options: [{ option: "opt_AAAAAAAAAAAA", label: "存入金币活期", requires: ["amount"] }],
      },
      matches: [/余额/u, /存款/u, /兑换/u, /贷款/u, /信用/u, /办理编号：opt_AAAAAAAAAAAA/u],
    },
    {
      op: "go.bank.choose",
      args: { option: "opt_AAAAAAAAAAAA", amount: 500 },
      data: {
        result: { journalId: PRIVATE_UUID, actionKey: PRIVATE_HEX },
        current: {
          account: {
            availableGold: 172_036,
            availableSilver: 2_093,
            demandGold: 1_000,
            termGold: 20_000,
            silverAgentLock: 10,
            agentSpendableSilver: 2_083,
          },
          deposits: { termDeposits: [{ depositId: PRIVATE_UUID, principal: 20_000 }] },
          loans: { systemLoans: [{ loanId: PRIVATE_UUID, principalOriginal: 1_000 }] },
          credit: { creditPoints: 8, highSpendRestricted: false },
          options: [],
        },
      },
      matches: [/业务已办理/u, /金币活期 1,000/u, /信用：8 点/u],
      excludes: [/定期存款：/u, /贷款：/u],
    },
    {
      op: "go.school.view",
      args: {},
      data: {
        careers: [{ career: "veterinarian", trackOrder: 1, residentId: PRIVATE_UUID }],
        courses: [
          {
            career: "veterinarian",
            qualificationLevel: 1,
            courseIndex: 1,
            enrolledAt: "2026-08-30T00:00:00.000Z",
            contentDeliveryId: PRIVATE_UUID,
          },
        ],
        exams: [],
        certificates: [],
        employment: { records: [], duties: [] },
        courseCatalog: [
          { career: "chef", title: "不应出现在总览里的料理课" },
          { career: "reporter", title: "不应出现在总览里的记者课" },
        ],
        options: [{ option: "opt_BBBBBBBBBBBB", label: "确认已阅读动物诊疗基础课", requires: [] }],
      },
      matches: [/职业轨道：动物医生/u, /课程进度/u, /考试：暂无记录/u, /资格证：暂无/u],
      excludes: [/课程目录/u, /料理课/u, /记者课/u],
    },
    {
      op: "go.school.choose",
      args: { option: "opt_CCCCCCCCCCCC" },
      data: {
        result: {
          attemptId: PRIVATE_UUID,
          questions: Array.from({ length: 20 }, (_, index) => ({
            id: `private-question-${index + 1}`,
            stem: `资格考试第 ${index + 1} 题`,
            options: { A: "甲项", B: "乙项", C: "丙项", D: "丁项" },
          })),
        },
        current: {
          careers: [{ career: "veterinarian" }],
          courses: [],
          exams: [{ career: "veterinarian", qualificationLevel: 1, registrationStatus: "active" }],
          certificates: [],
          employment: { records: [], duties: [] },
          courseCatalog: [{ career: "chef", title: "不应重复显示的超长目录" }],
          options: [
            { option: "opt_DDDDDDDDDDDD", label: "提交整份资格考试答案", requires: ["answers"] },
          ],
        },
      },
      matches: [/试卷（一次查看全部 20 题）/u, /20\. 资格考试第 20 题/u, /还需提供：全部答案/u],
      excludes: [/课程目录/u, /超长目录/u],
    },
    {
      op: "go.farm.commission",
      args: {},
      data: {
        jobs: [
          {
            jobId: PRIVATE_UUID,
            ownerResidentId: PRIVATE_UUID,
            difficultyLevel: 1,
            status: "available",
            sourceFacts: {
              sourceId: PRIVATE_UUID,
              initialFact: {
                farmDoorplate: "A1024",
                plotId: 3,
                observations: ["leaf_wilt", "soil_surface_dry"],
                secret_condition: "drought",
              },
            },
          },
        ],
        chef: {
          qualificationLevel: 2,
          recipes: [
            {
              recipeId: PRIVATE_UUID,
              name: "月光蔬菜汤",
              rarity: "R",
              priceSilver: 80,
              authorResidentId: PRIVATE_UUID,
            },
          ],
          leases: [],
          listings: [],
          options: [],
        },
        options: [{ option: "opt_EEEEEEEEEEEE", label: "接取三号地农艺委托", requires: [] }],
      },
      matches: [/第 3 号地/u, /叶片失去挺度、土面发干/u, /月光蔬菜汤/u, /接取三号地农艺委托/u],
    },
    {
      op: "go.hospital.commission",
      args: {},
      data: {
        sources: [
          {
            sourceId: PRIVATE_UUID,
            objectId: PRIVATE_UUID,
            difficultyLevel: 1,
            status: "open",
            fact: {
              farmDoorplate: "B2048",
              animalKindId: "cloud_sheep",
              observations: ["reduced_activity", "localized_injury_trace"],
              unknown_symptom: "must_not_leak",
            },
          },
        ],
        options: [{ option: "opt_FFFFFFFFFFFF", label: "挂号这只云绵羊", requires: [] }],
      },
      matches: [/动物：云绵羊/u, /活动减少、局部外伤痕迹/u, /状态：待处理/u, /挂号这只云绵羊/u],
    },
    {
      op: "go.security.commission",
      args: {},
      data: {
        sources: [
          {
            sourceId: PRIVATE_UUID,
            excludedResidentIds: [PRIVATE_UUID],
            difficultyLevel: 1,
            status: "open",
            fact: {
              farmDoorplate: "C4096",
              event: {
                eventId: PRIVATE_UUID,
                kind: "stolen",
                plotId: 2,
                actorFarmId: PRIVATE_UUID,
              },
            },
          },
        ],
        options: [{ option: "opt_GGGGGGGGGGGG", label: "提交这起偷菜记录", requires: [] }],
      },
      matches: [/事项：农作物被偷/u, /相关地块：第 2 号地/u, /提交这起偷菜记录/u],
    },
  ] as const;

  for (const fixture of cases) {
    const text = renderLingyeToolText(
      fixture.op,
      fixture.args,
      success(
        fixture.op.includes("choose") ? "业务已办理。" : "已读取当前公开事实。",
        fixture.data,
      ),
    );
    assert.match(text, /[\p{Script=Han}]/u, fixture.op);
    for (const pattern of fixture.matches) assert.match(text, pattern, fixture.op);
    for (const pattern of "excludes" in fixture ? fixture.excludes : []) {
      assert.doesNotMatch(text, pattern, fixture.op);
    }
    assertNoPrivateLeak(text);
  }
});

test("course view keeps the complete body and all five practice questions", () => {
  const body = "菜谱身份由食材、数量与制作方式共同决定。\n\n这一段也必须完整保留。";
  const text = renderLingyeToolText(
    "go.school.view",
    { reference: "chef:2:3" },
    success("已读取职业学校记录。", {
      reference: {
        type: "course",
        content: {
          title: "原创菜谱登记学",
          contentMarkdown: body,
          contentDeliveryId: PRIVATE_UUID,
          practiceQuestions: Array.from({ length: 5 }, (_, index) => ({
            id: `private-${index + 1}`,
            stem: `课程练习第 ${index + 1} 题`,
            options: { A: "甲项", B: "乙项", C: "丙项", D: "丁项" },
          })),
        },
      },
      options: [],
    }),
  );

  assert.match(text, new RegExp(body.replaceAll("\n", "\\n"), "u"));
  assert.match(text, /课程练习（一次查看全部 5 题）/u);
  assert.match(text, /5\. 课程练习第 5 题/u);
  assertNoPrivateLeak(text);
});

test("paid incomplete course resumes with the frozen body, all questions, and the legal next step", () => {
  const text = renderLingyeToolText(
    "go.school.view",
    {},
    success("已读取职业学校当前事实。", {
      careers: [{ career: "chef" }],
      courses: [
        {
          career: "chef",
          qualificationLevel: 1,
          courseIndex: 1,
          enrolledAt: "2026-08-30T04:00:00.000Z",
          contentReadAt: null,
          completedAt: null,
        },
      ],
      exams: [],
      certificates: [],
      employment: { records: [], duties: [] },
      currentCourses: [
        {
          career: "chef",
          qualificationLevel: 1,
          courseIndex: 1,
          stage: "awaiting_read_confirmation",
          content: {
            title: "料理台的第一份判断",
            contentMarkdown: "这一份冻结课程正文必须能够重新读取。",
            contentDeliveryId: PRIVATE_UUID,
            practiceQuestions: Array.from({ length: 5 }, (_, index) => ({
              id: `private-${index + 1}`,
              stem: `恢复练习第 ${index + 1} 题`,
              options: { A: "甲项", B: "乙项", C: "丙项", D: "丁项" },
            })),
          },
        },
      ],
      options: [
        {
          option: "opt_HHHHHHHHHHHH",
          label: "确认已阅读课程：料理师 1 级第 1 门",
          requires: [],
        },
      ],
    }),
  );

  assert.match(text, /课程已经报名并交付；阅读完后确认已阅读/u);
  assert.match(text, /这一份冻结课程正文必须能够重新读取/u);
  assert.match(text, /课程练习（一次查看全部 5 题）/u);
  assert.match(text, /5\. 恢复练习第 5 题/u);
  assert.match(text, /确认已阅读课程/u);
  assertNoPrivateLeak(text);
});

test("course catalog renders only the career rows supplied by the courses section", () => {
  const text = renderLingyeToolText(
    "go.school.view",
    { section: "courses" },
    success("已读取职业学校当前事实。", {
      section: "courses",
      value: {
        catalog: [
          {
            career: "veterinarian",
            qualificationLevel: 1,
            courseIndex: 1,
            title: "动物病例识别",
            tuitionGold: 30_000,
            contentAvailable: true,
          },
        ],
        progress: [],
      },
      options: [],
    }),
  );

  assert.match(text, /课程目录：/u);
  assert.match(text, /动物医生 1 级第 1 门《动物病例识别》/u);
  assert.doesNotMatch(text, /料理师|农艺师|记者|治安官/u);
});

test("unknown player-world enums never fall back to snake case", () => {
  const text = renderLingyeToolText(
    "go.hospital.commission",
    {},
    success("已读取当前真实病例。", {
      sources: [
        {
          difficultyLevel: 2,
          status: "future_unknown_status",
          fact: {
            farmDoorplate: "D8192",
            animalKindId: "future_unknown_animal",
            observations: ["future_unknown_symptom"],
          },
        },
      ],
      options: [{ option: "opt_HHHHHHHHHHHH", label: "查看可办理事项", requires: [] }],
    }),
  );

  assert.match(text, /动物：暂无法读取具体描述/u);
  assert.match(text, /可观察症状：暂无法读取具体描述/u);
  assert.match(text, /状态：暂无法读取具体描述/u);
  assertNoPrivateLeak(text);
});
