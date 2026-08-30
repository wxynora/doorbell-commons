/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./farm-page.css", import.meta.url), "utf8");

test("all native farm selects share the same compact text sizing", () => {
  assert.match(
    styles,
    /:where\(\.farm-game\) select,\s*:where\(\.farm-game\) select option\s*\{[^}]*font-size:\s*clamp\(0\.44rem, 1\.55cqw, 0\.52rem\)[^}]*line-height:\s*1\.15/,
  );
});
