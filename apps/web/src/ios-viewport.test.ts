/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("mobile viewport prevents iOS focus zoom without changing control styles", () => {
  assert.match(
    indexSource,
    /content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/u,
  );
  assert.doesNotMatch(indexSource, /user-scalable\s*=\s*no/iu);
});
