/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = [
  readFileSync(new URL("./farm-page.css", import.meta.url), "utf8"),
  readFileSync(new URL("./panels/bulletin-panel.css", import.meta.url), "utf8"),
  readFileSync(new URL("./panels/tool-panel.css", import.meta.url), "utf8"),
].join("\n");

test("farm CSS bundles every runtime texture instead of routing it through /farm", () => {
  assert.doesNotMatch(styles, /url\(["']?\/farm\//);
  assert.match(styles, /assets\/ui\/plot-tile\.png/);
  assert.match(styles, /assets\/ui\/panel-parchment\.png/);
  assert.match(styles, /assets\/ui\/scene-tabs-frame-v2\.png/);
  assert.match(styles, /assets\/ui\/tool-cell-textured\.png/);
  assert.match(styles, /assets\/animals\/animal-codex-atlas\.png/);
});
