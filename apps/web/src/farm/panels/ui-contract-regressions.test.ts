/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const field = readFileSync(new URL("../page/farm-field-content.tsx", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("./farm-action-panels.tsx", import.meta.url), "utf8");
const backpack = readFileSync(new URL("./tools/backpack-panel.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("./tools/settings-panel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./tool-panel.css", import.meta.url), "utf8");

test("opening ranch dispatch requests both ranch state and the real farm catalog", () => {
  assert.match(
    field,
    /activeScene === "ranch" && tool\.id === "dispatch"[\s\S]*?onRequireResource\?\.\("farmCatalog"\)[\s\S]*?getToolReadResource\(activeScene, tool\.id\)/,
  );
  assert.match(dispatch, /farmCatalog \? "暂无可派遣的邻居农场" : "正在读取可派遣农场"/);
});

test("ranch backpack combines stored and currently worn authoritative accessories", () => {
  assert.match(backpack, /ranch\.data\.residents\.animals[\s\S]*?resident\.accessories\.items/);
  assert.match(backpack, /穿戴中 · \{wearer\}/);
  assert.match(backpack, /仓库中/);
  assert.doesNotMatch(backpack, /当前没有真实配饰/);
});

test("welcome message grows to its scroll height and keeps following settings below it", () => {
  assert.match(settings, /useLayoutEffect\(\(\) => \{[\s\S]*?style\.height = "auto"[\s\S]*?scrollHeight/);
  assert.match(settings, /ref=\{welcomeMessageRef\}/);
  assert.match(styles, /\.farm-settings__item textarea\s*\{[^}]*overflow-y:\s*hidden/s);
});
