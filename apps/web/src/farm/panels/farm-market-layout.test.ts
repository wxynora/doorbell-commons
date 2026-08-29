/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./farm-action-panels.css", import.meta.url), "utf8");

test("market product copy and actions keep a balanced readable scale", () => {
  assert.match(
    styles,
    /farm-market__seller-card li > span:first-child[\s\S]*font-size:\s*clamp\(0\.66rem, 2\.65cqw, 0\.8rem\)/,
  );
  assert.match(
    styles,
    /farm-market__seller-card \.farm-market__listing-meta button[\s\S]*min-height:\s*7cqw[\s\S]*font-size:\s*clamp\(0\.58rem, 2\.3cqw, 0\.7rem\)/,
  );
});
