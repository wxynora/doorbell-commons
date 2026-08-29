/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidateSource = readFileSync(new URL("./candidate-two-preview.tsx", import.meta.url), "utf8");
const fontCss = readFileSync(
  new URL("../../public/fonts/doorbell-fonts.v2.css", import.meta.url),
  "utf8",
);
const notoSerifUi = readFileSync(
  new URL("../../public/fonts/noto-serif-sc-ui-400.v2.woff2", import.meta.url),
);

test("Candidate pages load the versioned embedded Chinese serif instead of a Latin-only face", () => {
  assert.match(candidateSource, /href="\/fonts\/doorbell-fonts\.v2\.css"/);
  assert.match(fontCss, /font-family: "Noto Serif SC";/);
  assert.match(fontCss, /url\("\/fonts\/noto-serif-sc-ui-400\.v2\.woff2"\)/);
  assert.doesNotMatch(fontCss, /noto-serif-sc-latin-variable/);
  assert.equal(notoSerifUi.subarray(0, 4).toString("ascii"), "wOF2");
  assert.ok(notoSerifUi.length > 300_000);
});
