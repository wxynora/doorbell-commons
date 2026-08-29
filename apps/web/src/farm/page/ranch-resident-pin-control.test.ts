/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ranch-resident-detail.tsx", import.meta.url), "utf8");

test("pin keeps its real atmosphere meaning and retries one stale ranch revision", () => {
  assert.match(source, /residentData\?\.pinned \? "移出氛围" : "加入氛围"/);
  assert.match(source, /已加入农场氛围/);
  assert.match(source, /只影响小机看到的农场描述，不改变动物排序/);
  assert.doesNotMatch(source, /取消置顶|>置顶</);
  assert.match(
    source,
    /result\.issue\.code === "state_conflict"[\s\S]*?expectedRevision: result\.issue\.currentRevision[\s\S]*?result = await onAction\(refreshedAttempt\.input\)/,
  );
});

test("resident detail shows authoritative item and meat unit values without inventing a fallback", () => {
  assert.match(
    source,
    /produce\.item\.unit_value !== null[\s\S]*?单份价值 \$\{residentData\.produce\.item\.unit_value\.toLocaleString\("zh-CN"\)\} 牧场金币/,
  );
  assert.match(
    source,
    /produce\.meat\.unit_value !== null[\s\S]*?单份价值 \$\{residentData\.produce\.meat\.unit_value\.toLocaleString\("zh-CN"\)\} 牧场金币/,
  );
  assert.doesNotMatch(source, /unit_value \?\?/);
});
