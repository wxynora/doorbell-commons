import assert from "node:assert/strict";
import test from "node:test";
import { resolveApprovedPwaRelease } from "./resolve-approved-pwa-release.mjs";

const currentIndex = `
  <script type="module" src="/assets/index-OLDENTRY.js"></script>
  <link rel="stylesheet" href="/assets/index-OLDSTYLE.css">
`;
const builtIndex = `
  <script type="module" src="/assets/index-NEWENTRY.js"></script>
  <link rel="stylesheet" href="/assets/index-NEWSTYLE.css">
`;
const currentWorker = `// approved-pwa-release:2026-08-30.3\nconst strategy = "stable";\n`;
const builtWorker = `// approved-pwa-release:auto\nconst strategy = "stable";\n`;

test("same Web build and deployment retry reuse the current approved number", () => {
  const same = resolveApprovedPwaRelease({
    currentIndexHtml: currentIndex,
    currentWorker,
    builtIndexHtml: currentIndex,
    builtWorker,
  });
  assert.equal(same.release, "2026-08-30.3");
  assert.equal(same.webChanged, false);
  assert.match(same.worker, /^\/\/ approved-pwa-release:2026-08-30\.3$/mu);

  const changed = resolveApprovedPwaRelease({
    currentIndexHtml: currentIndex,
    currentWorker,
    builtIndexHtml: builtIndex,
    builtWorker,
  });
  assert.equal(changed.release, "2026-08-30.4");
  assert.equal(changed.webChanged, true);

  const retry = resolveApprovedPwaRelease({
    currentIndexHtml: builtIndex,
    currentWorker: changed.worker,
    builtIndexHtml: builtIndex,
    builtWorker,
  });
  assert.equal(retry.release, "2026-08-30.4");
  assert.equal(retry.webChanged, false);
});

test("Worker logic changes increment even when Vite entry names do not", () => {
  const changed = resolveApprovedPwaRelease({
    currentIndexHtml: currentIndex,
    currentWorker,
    builtIndexHtml: currentIndex,
    builtWorker: `// approved-pwa-release:auto\nconst strategy = "new";\n`,
  });
  assert.equal(changed.release, "2026-08-30.4");
  assert.equal(changed.webChanged, true);
});

test("invalid or multiple source markers fail closed", () => {
  assert.throws(
    () =>
      resolveApprovedPwaRelease({
        currentIndexHtml: currentIndex,
        currentWorker,
        builtIndexHtml: builtIndex,
        builtWorker: "const strategy = 'missing';\n",
      }),
    /approved-pwa-release:auto/u,
  );
});
