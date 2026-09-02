import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  detentionAllowsFarmAction,
  detentionBlockedFarmActionText,
} from "../dist/security/presentation.js";

test("detained farm actions return the approved human-readable result", () => {
  const text = detentionBlockedFarmActionText({
    detentionId: "internal-detention-id",
    residentId: "internal-resident-id",
    scheduledReleaseAt: Date.UTC(2026, 8, 2, 0, 43, 37),
  });

  assert.equal(
    text,
    '你目前正在铃野看守所服刑，本次农场操作没有执行。预计北京时间 2026-09-02 08:43 释放；可以调用 doorbell({"op":"go.security.commission","args":{}}) 查看剩余时间或办理提前释放。',
  );
  assert.doesNotMatch(text, /OP_REJECTED|internal-detention-id|internal-resident-id/u);
});

test("all four detention gates reuse the same result without exposing raw detention", () => {
  const source = readFileSync(new URL("../dist/server.js", import.meta.url), "utf8");
  assert.equal(source.match(/detentionBlockedFarmActionText\(detention\)/gu)?.length, 4);
  assert.doesNotMatch(source, /text:\s*["']OP_REJECTED["']/u);
  assert.doesNotMatch(source, /code:\s*["']RESIDENT_DETAINED["'][^\n]*\bdetention\s*[,}]/u);
});

test("detention keeps status and help readable while blocking farm actions", () => {
  assert.equal(detentionAllowsFarmAction(undefined), true);
  assert.equal(detentionAllowsFarmAction(""), true);
  assert.equal(detentionAllowsFarmAction("status"), true);
  assert.equal(detentionAllowsFarmAction("help"), true);
  assert.equal(detentionAllowsFarmAction("water"), false);
  assert.equal(detentionAllowsFarmAction("harvest"), false);
  assert.equal(detentionAllowsFarmAction("visit"), false);
});

test("detention never blocks the security view or its early-release action", () => {
  const source = readFileSync(
    new URL("../dist/server/doorbell/lingye.js", import.meta.url),
    "utf8",
  );
  const earlyRelease = source.indexOf(
    'input.op === "go.security.commission" && Object.hasOwn(args, "option")',
  );
  const detainedGate = source.indexOf(
    'else if (detained && input.op !== "go.security.commission")',
  );
  const securityView = source.indexOf(
    'input.op === "go.security.commission" && !Object.hasOwn(args, "option")',
  );

  assert.ok(earlyRelease >= 0);
  assert.ok(detainedGate > earlyRelease);
  assert.ok(securityView > detainedGate);
});
