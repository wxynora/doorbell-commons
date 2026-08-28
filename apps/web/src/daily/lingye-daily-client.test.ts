import assert from "node:assert/strict";
import { test } from "node:test";
import { LingyeDailyReadError, loadLatestLingyeDailyIssue } from "./lingye-daily-client";

test("daily client maps the authenticated latest-issue contract into the copied page", async () => {
  const calls: Array<{ input: string | URL | Request; init: RequestInit | undefined }> = [];
  const issue = await loadLatestLingyeDailyIssue(async (input, init) => {
    calls.push({ input, init });
    return Response.json({
      issue: {
        issue_number: 1,
        issue_date: "2026-08-16",
        revision: 2,
        revision_note: "更正群聊话题表述。",
        period_start: "2026-08-15T05:00:00+08:00",
        period_end: "2026-08-16T04:59:59+08:00",
        coverage_status: "complete",
        coverage_note: "",
        generated_at: "2026-08-16T06:00:00+08:00",
        published_at: "2026-08-15T22:00:00.000Z",
        editor_model: "gpt-5.6-terra",
        front_page: {
          title: "人类郑重宣布不熬夜，然后把宵夜点成双份",
          paragraphs: ["计划刚刚落地，宵夜已经从讨论项变成双份订单。"],
          image_urls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
        },
        group_chat: {
          summary:
            "大家先认真决定不熬夜，随后认真决定宵夜只点一份。人类修订计划时，连夜宵也会跟着过审。",
          topics: ["不熬夜计划无缝切换为一份宵夜"],
        },
        behavior_slices: [
          {
            title: "睡眠计划的存活时间",
            body: "计划宣布完毕，宵夜接管现场。人类修改计划时同样郑重。",
            image_urls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
          },
        ],
        quotes: [{ text: "最后一致决定点两份", source_label: "小满" }],
        farm_observation: {
          summary: "今天没有人把萝卜种反。",
          metrics: [{ label: "成熟作物", value: "12" }],
        },
        submissions: [{ text: "申请给睡眠计划追授纪念章。", source_label: "小机投稿" }],
        tomorrow_question: { text: "下一份计划能坚持到宵夜下单前吗？" },
      },
    });
  });

  assert.deepEqual(calls, [
    {
      input: "/api/lingye-daily/latest",
      init: {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      },
    },
  ]);
  assert.deepEqual(issue, {
    issueNumber: "1",
    dateLabel: "2026年8月16日",
    editorName: "gpt-5.6-terra",
    frontPage: {
      title: "人类郑重宣布不熬夜，然后把宵夜点成双份",
      paragraphs: ["计划刚刚落地，宵夜已经从讨论项变成双份订单。"],
      imageUrls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
    },
    groupChat: {
      summary:
        "大家先认真决定不熬夜，随后认真决定宵夜只点一份。人类修订计划时，连夜宵也会跟着过审。",
      topics: ["不熬夜计划无缝切换为一份宵夜"],
    },
    behaviorSlices: [
      {
        title: "睡眠计划的存活时间",
        body: "计划宣布完毕，宵夜接管现场。人类修改计划时同样郑重。",
        imageUrls: ["data:image/gif;base64,R0lGODlhAQABAAAAACw="],
      },
    ],
    quotes: [{ text: "最后一致决定点两份", sourceLabel: "小满" }],
    farmObservation: {
      summary: "今天没有人把萝卜种反。",
      metrics: [{ label: "成熟作物", value: "12" }],
    },
    submissions: [{ text: "申请给睡眠计划追授纪念章。", sourceLabel: "小机投稿" }],
    tomorrowQuestion: "下一份计划能坚持到宵夜下单前吗？",
    revisionNote: "更正群聊话题表述。",
  });
});

test("daily client preserves honest empty and authentication states", async () => {
  assert.equal(await loadLatestLingyeDailyIssue(async () => Response.json({ issue: null })), null);

  await assert.rejects(
    () =>
      loadLatestLingyeDailyIssue(async () =>
        Response.json(
          {
            error: {
              code: "authentication_required",
              message: "An active human session is required",
            },
          },
          { status: 401 },
        ),
      ),
    (error: unknown) =>
      error instanceof LingyeDailyReadError &&
      error.status === 401 &&
      error.code === "authentication_required",
  );
});
