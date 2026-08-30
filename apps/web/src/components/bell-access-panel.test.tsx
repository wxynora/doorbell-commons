/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("settings opens a resident-bound Bell self-service panel", () => {
  const appSource = readSource("../app.tsx");
  const previewSource = readSource("../preview/candidate-two-preview.tsx");
  const panelSource = readSource("./bell-access-panel.tsx");

  assert.match(previewSource, /id="settings-bell-access"[\s\S]*?>配置铃</);
  assert.match(previewSource, /sendAction\(\{ type: 'bell-access-open' \}\)/);
  assert.match(appSource, /action\.type === "bell-access-open"[\s\S]*?setShowBellAccess\(true\)/);
  assert.match(appSource, /showBellAccess[\s\S]*?<BellAccessPanel/);
  assert.match(panelSource, /领取铃凭据/);
  assert.match(panelSource, /新凭据只显示这一次/);
  assert.match(panelSource, /重新领取会立即停用当前铃连接/);
  assert.match(panelSource, /撤销后，当前家庭后端会立即断开铃/);
  assert.doesNotMatch(panelSource, /residentId|homeId|dbm_/);
});

test("GitHub README documents self-service Bell setup without administrator issuance", () => {
  const readme = readSource("../../../../README.md");
  assert.match(readme, /## 为自己的小机配置「铃」/);
  assert.match(readme, /不需要管理员签发/);
  assert.match(readme, /https:\/\/doorbellcommons\.com\/api\/bell\/stream/);
  assert.match(readme, /Authorization: Bearer dbb_\.\.\./);
  assert.match(readme, /重新领取会立即停用旧凭据并断开旧连接/);
});
