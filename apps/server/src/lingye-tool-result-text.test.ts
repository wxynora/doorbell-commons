import assert from "node:assert/strict";
import test from "node:test";
import type { LingyeActionResult } from "@doorbell/protocol";
import { renderLingyeToolText } from "./lingye-tool-result-text.js";

const PRIVATE_UUID = "019ffc05-49cd-7020-84af-3d04fb1ed03d";
const PRIVATE_HEX = "a".repeat(64);
const INTERNAL_FIELD =
  /residentId|sourceId|objectId|ownerId|jobId|loanId|depositId|attemptId|reservationId|employmentId|dutyId|interviewId|noticeId|paperId|contentDeliveryId|journalId|tradeId|detentionId|violationId|actionKey|idempotency|notification_id/iu;
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
        examSchedule: {
          timeZone: "Asia/Shanghai",
          weekdays: [2, 4, 6],
          startHour: 14,
          durationMinutes: 120,
        },
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
      matches: [
        /考试时间：每周二、周四、周六，北京时间 14:00–16:00/u,
        /完成当前等级三门课程后，可以报名下一场考试/u,
        /职业轨道：动物医生/u,
        /课程进度/u,
        /考试：暂无记录/u,
        /资格证：暂无/u,
      ],
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

test("security view renders the resident's active detention and early release entry without private ids", () => {
  const text = renderLingyeToolText(
    "go.security.commission",
    {},
    success("已读取铃野治安署当前事实。", {
      detentions: [
        {
          detentionId: PRIVATE_UUID,
          violationId: "119ffc05-49cd-7020-84af-3d04fb1ed03d",
          residentId: "219ffc05-49cd-7020-84af-3d04fb1ed03d",
          startedAt: "2026-09-02T00:43:37.000Z",
          scheduledReleaseAt: "2026-09-02T04:43:37.000Z",
          hourlyReleaseRateGold: 500,
          status: "active",
          earlyRelease: {
            detentionId: PRIVATE_UUID,
            remainingHours: 3.5,
            costGold: 1_750,
          },
        },
      ],
      options: [
        {
          option: "opt_JJJJJJJJJJJJ",
          label: "办理提前释放",
          requires: [],
        },
      ],
    }),
  );

  assert.match(text, /本人当前状态：正在看守所服刑/u);
  assert.match(text, /预计释放时间：2026\/09\/02 12:43（北京时间）/u);
  assert.match(text, /提前释放：当前需支付 1,750 金币，剩余约 3\.5 小时/u);
  assert.match(text, /办理提前释放/u);
  assert.match(text, /办理编号：opt_JJJJJJJJJJJJ/u);
  assertNoPrivateLeak(text);
});

test("course view keeps the complete body and all five practice questions", () => {
  const body = "菜谱身份由食材、数量与制作方式共同决定。\n\n这一段也必须完整保留。";
  const text = renderLingyeToolText(
    "go.school.view",
    { reference: "chef:2:3" },
    success("已读取职业学校记录。", {
      examSchedule: {
        timeZone: "Asia/Shanghai",
        weekdays: [2, 4, 6],
        startHour: 14,
        durationMinutes: 120,
      },
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
  assert.match(text, /考试时间：每周二、周四、周六，北京时间 14:00–16:00/u);
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
      examSchedule: {
        timeZone: "Asia/Shanghai",
        weekdays: [2, 4, 6],
        startHour: 14,
        durationMinutes: 120,
      },
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
  assert.match(text, /考试时间：每周二、周四、周六，北京时间 14:00–16:00/u);
  assert.match(text, /动物医生 1 级第 1 门《动物病例识别》/u);
  assert.doesNotMatch(text, /料理师|农艺师|记者|治安官/u);
});

test("question choices keep safe game literals, humanize known statuses, and hide internal tokens", () => {
  const text = renderLingyeToolText(
    "go.school.view",
    { reference: "agronomist:1:3" },
    success("已读取职业学校记录。", {
      reference: {
        type: "course",
        content: {
          title: "练习选项可见性",
          contentMarkdown: "安全的游戏数值和状态必须完整显示。",
          practiceQuestions: [
            {
              stem: "哪组数值可见？",
              options: { A: "80", B: "20%", C: "SSR", D: "P=44" },
            },
            {
              stem: "候选 structure_score 为零时如何处理？",
              options: {
                A: "`F-11`",
                B: "09:00",
                C: "completed",
                D: "pending_review_configuration，证书继续待生效",
              },
            },
            {
              stem: "哪组内部值必须隐藏？",
              options: {
                A: "resident_id",
                B: PRIVATE_UUID,
                C: PRIVATE_HEX,
                D: "unknownEnglishToken",
              },
            },
          ],
        },
      },
      options: [],
    }),
  );

  for (const visible of [
    "80",
    "20%",
    "SSR",
    "P=44",
    "`F-11`",
    "09:00",
    "已完成",
    "结构分",
    "等待复核配置，证书继续待生效",
  ]) {
    assert.match(text, new RegExp(visible.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(text, /resident_id|unknownEnglishToken/u);
  assertNoPrivateLeak(text);
});

test("exam registration result says success, frozen fee, and the complete Beijing session", () => {
  const scheduledAt = Date.parse("2026-09-01T14:00:00+08:00");
  const text = renderLingyeToolText(
    "go.school.choose",
    { option: "opt_IIIIIIIIIIII" },
    success("职业学校业务已办理。", {
      result: {
        attemptId: PRIVATE_UUID,
        paperId: PRIVATE_UUID,
        reservationId: PRIVATE_UUID,
        feeGold: 60_000,
        scheduledAt,
      },
      current: {
        careers: [{ career: "agronomist" }],
        courses: [],
        exams: [
          {
            attemptId: PRIVATE_UUID,
            career: "agronomist",
            qualificationLevel: 1,
            registrationStatus: "registered",
            scheduledAt,
          },
        ],
        certificates: [],
        employment: { records: [], duties: [] },
        options: [],
      },
    }),
  );

  assert.match(text, /资格考试报名成功：已冻结报名费 60,000 金币/u);
  assert.match(text, /2026\/09\/01 14:00/u);
  assert.match(text, /2026\/09\/01 16:00/u);
  assertNoPrivateLeak(text);
});

test("formal written paper renders all twenty questions and all eighty choices", () => {
  const text = renderLingyeToolText(
    "go.school.choose",
    { option: "opt_JJJJJJJJJJJJ" },
    success("资格考试已经开始。", {
      result: {
        questions: Array.from({ length: 20 }, (_, index) => ({
          id: `private-${index + 1}`,
          stem: `资格考试第 ${index + 1} 题`,
          options:
            index === 0
              ? { A: "80", B: "20%", C: "SSR", D: "P=44" }
              : { A: "选项甲", B: "选项乙", C: "选项丙", D: "选项丁" },
        })),
      },
      current: {
        careers: [{ career: "chef" }],
        courses: [],
        exams: [{ career: "chef", qualificationLevel: 1, registrationStatus: "active" }],
        certificates: [],
        employment: { records: [], duties: [] },
        options: [
          {
            option: "opt_KKKKKKKKKKKK",
            label: "提交整份资格考试答案",
            requires: ["answers"],
          },
        ],
      },
    }),
  );

  assert.equal(text.match(/^\d+\. /gmu)?.length, 20);
  assert.equal(text.match(/^ {3}[ABCD]\. /gmu)?.length, 80);
  assert.match(text, /20\. 资格考试第 20 题/u);
  assertNoPrivateLeak(text);
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
