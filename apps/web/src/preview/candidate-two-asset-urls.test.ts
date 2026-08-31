/// <reference types="node" />

import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CANDIDATE_TWO_PUBLIC_ASSET_GLOBS } from "./candidate-two-asset-inventory";
import { buildCandidateTwoRuntimeHtml } from "./candidate-two-preview";

const webRoot = fileURLToPath(new URL("../../", import.meta.url));

function toPublicPath(sourcePath: string): string {
  const normalized = sourcePath.replaceAll("\\", "/");
  assert.match(normalized, /^public\//);
  return `/${normalized.slice("public/".length)}`;
}

test("Candidate Two versions every public asset used by its iframe runtime", () => {
  const mappedPaths = new Set(
    CANDIDATE_TWO_PUBLIC_ASSET_GLOBS.flatMap((pattern) =>
      globSync(pattern, { cwd: webRoot }).map(toPublicPath),
    ),
  );

  const runtimeHtml = buildCandidateTwoRuntimeHtml();
  const requiredPaths = new Set(
    [
      ...runtimeHtml.matchAll(
        /\/(?:lingye|candidate-two|lounge)\/[^'"\s)<>]+\.(?:avif|css|gif|jpe?g|png|svg|webp)/g,
      ),
    ].map((match) => match[0]),
  );
  for (const variantPath of globSync("public/lingye/glimmer/variants/variant-*.webp", {
    cwd: webRoot,
  })) {
    requiredPaths.add(toPublicPath(variantPath));
  }

  assert.deepEqual([...requiredPaths].filter((path) => !mappedPaths.has(path)).sort(), []);
  assert.ok(mappedPaths.size >= 58);

  const viteConfigSource = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(viteConfigSource, /createHash\("sha256"\)/);
  assert.match(viteConfigSource, /\?v=\$\{contentHash\}/);
  assert.match(viteConfigSource, /rewritten = rewritten\.replaceAll\(publicPath, assetUrl\)/);
});
