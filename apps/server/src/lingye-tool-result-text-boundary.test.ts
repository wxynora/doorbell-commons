import assert from "node:assert/strict";
import test from "node:test";
import type { LingyeActionResult } from "@doorbell/protocol";
import { renderLingyeToolText } from "./lingye-tool-result-text.js";

function success(text: string, data: Record<string, unknown>) {
  return { ok: true, text, data } as Extract<LingyeActionResult, { ok: true }>;
}

test("farm and hospital output keeps the check result, current work, inquiry, and every option", () => {
  const fixtures = [
    {
      op: "go.farm.commission",
      resultText: "检查结果：叶片边缘可见新鲜咬痕，土面未见连续虫路。",
      currentObject: { plotId: 4 },
      currentObservation: "leaf_damage",
      currentLine: "地块：第 4 号地",
      historyObjects: ["第 1 号地", "第 2 号地"],
      hiddenSecrets: ["local_pest", "pest-net", "局部虫害", "防虫网"],
    },
    {
      op: "go.hospital.commission",
      resultText: "检查结果：近期进食节奏异常，腹部触诊有不适反应。",
      currentObject: { animalKindId: "cloud_sheep", animalIndex: 1 },
      currentObservation: "abdominal_discomfort",
      currentLine: "动物：云绵羊（第 2 只）",
      historyObjects: ["鸡（第 1 只）", "鸭子（第 1 只）"],
      hiddenSecrets: ["indigestion", "stomach-powder", "食滞", "理胃粉"],
    },
  ] as const;

  for (const fixture of fixtures) {
    const historicalJob = (
      jobId: string,
      status: "completed" | "cancelled",
      farmDoorplate: string,
      object: Record<string, unknown>,
    ) => ({
      jobId,
      difficultyLevel: 1,
      status,
      sourceFacts: {
        initialFact: {
          farmDoorplate,
          observations: ["soil_surface_dry"],
          ...object,
        },
      },
    });
    const currentJob = {
      jobId: "current-job",
      difficultyLevel: 2,
      status: "active",
      sourceFacts: {
        initialFact: {
          farmDoorplate: "NOW123",
          observations: [fixture.currentObservation],
          condition: fixture.hiddenSecrets[0],
          correctMaterial: fixture.hiddenSecrets[1],
          ...fixture.currentObject,
        },
      },
    };
    const jobs = [
      historicalJob(
        "completed-job",
        "completed",
        "OLD111",
        fixture.op === "go.farm.commission"
          ? { plotId: 1 }
          : { animalKindId: "chicken", animalIndex: 0 },
      ),
      historicalJob(
        "cancelled-job",
        "cancelled",
        "OLD222",
        fixture.op === "go.farm.commission"
          ? { plotId: 2 }
          : { animalKindId: "duck", animalIndex: 0 },
      ),
      currentJob,
    ];
    const options = [
      { option: "opt_RRRRRRRRRRRR", label: "回复委托消息", requires: ["text"] },
      { option: "opt_CCCCCCCCCCCC", label: "检查当前情况", requires: [] },
      { option: "opt_TTTTTTTTTTTT", label: "选择一种处理方法", requires: [] },
    ];
    const text = renderLingyeToolText(
      fixture.op,
      {},
      success(fixture.resultText, {
        workNotice: "委托方询问：检查后请告诉我你观察到了什么。",
        acceptedJobCount: 1,
        currentWorkerJobId: "current-job",
        result: {
          world: {
            finding: "internal_finding",
            condition: fixture.hiddenSecrets[0],
            correctMaterial: fixture.hiddenSecrets[1],
          },
        },
        jobs,
        sources: [{
          sourceId: "unaccepted-source",
          status: "open",
          difficultyLevel: 4,
          fact: { farmDoorplate: "OPEN999", observations: ["abnormal_breathing"] },
        }],
        current: { jobs: [currentJob], options },
        options,
      }),
    );

    assert.match(text, new RegExp(fixture.resultText, "u"));
    assert.match(text, /委托方询问：检查后请告诉我你观察到了什么。/u);
    assert.match(text, /已接委托：1/u);
    assert.doesNotMatch(text, /已接委托：3/u);
    assert.match(text, /当前委托：/u);
    assert.match(text, /委托方公开农场：门牌 NOW123/u);
    assert.match(text, new RegExp(fixture.currentLine, "u"));
    assert.match(text, /状态：处理中/u);
    for (const option of options) {
      assert.match(text, new RegExp(option.label, "u"));
      assert.equal(text.match(new RegExp(option.option, "gu"))?.length, 1);
    }
    assert.doesNotMatch(text, /OPEN999|OLD111|OLD222|地块委托 \d|病例 \d|状态：已完成|状态：已取消/u);
    for (const hiddenObject of fixture.historyObjects) {
      assert.doesNotMatch(text, new RegExp(hiddenObject, "u"));
    }
    for (const hiddenSecret of fixture.hiddenSecrets) {
      assert.doesNotMatch(text, new RegExp(hiddenSecret, "u"));
    }
  }
});
