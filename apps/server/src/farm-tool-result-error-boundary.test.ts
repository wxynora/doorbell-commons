import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface FarmResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

const runtimeSource = readFileSync(new URL("./mcp-runtime.ts", import.meta.url), "utf8");
const farmResultSource = runtimeSource
  .slice(
    runtimeSource.indexOf("function farmToolResult("),
    runtimeSource.indexOf("function lingyeToolResult("),
  )
  .replace("text: string", "text")
  .replace("ok: boolean", "ok")
  .replace("farm?: Record<string, unknown>", "farm")
  .replace("): DoorbellCallToolResult", ")");
const farmToolResult = Function(
  "textContent",
  "renderFarmDetail",
  `${farmResultSource}; return farmToolResult;`,
)(
  (text: string) => [{ type: "text", text }],
  (farm: Record<string, unknown>) => [`公开农场：${String(farm.name ?? "暂无法读取")}。`],
) as (text: string, ok: boolean, farm?: Record<string, unknown>) => FarmResult;

test("Farm business failure changes only the MCP error bit", () => {
  const text = "鱼篓里没有可卖的鱼或财宝。";
  const result = farmToolResult(text, false, {
    id: "ABC234",
    name: "不应附加到失败结果",
  });

  assert.deepEqual(result, {
    content: [{ type: "text", text }],
    isError: true,
  });
  assert.equal("structuredContent" in result, false);
});

test("successful Farm result remains non-error and keeps existing content rendering", () => {
  assert.deepEqual(farmToolResult("协作完成。", true), {
    content: [{ type: "text", text: "协作完成。" }],
    isError: false,
  });

  const detailed = farmToolResult("卖出成功。", true, {
    id: "ABC234",
    name: "测试农场",
    coins: 100,
    silver: 20,
  });
  assert.equal(detailed.isError, false);
  assert.deepEqual(Object.keys(detailed).sort(), ["content", "isError"]);
  assert.match(detailed.content[0]?.text ?? "", /^卖出成功。\n\n【农场公开详情】/u);
});
