/// <reference types="node" />

import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectFarmAssetCoverage } from "./farm-asset-coverage";
import {
  FARM_ASSET_MANIFEST,
  type FarmAssetManifestEntry,
  getFarmAsset,
} from "./farm-asset-manifest";
import { FARM_ASSET_SOURCE_URLS } from "./farm-asset-source-map";

function manifestIdentity(entry: Omit<FarmAssetManifestEntry, "assetKey">): string {
  return [entry.domain, entry.entityKind, entry.entityId, entry.visualState].join("\u0000");
}

test("every manifest declaration has an explicit, readable source asset", () => {
  const report = inspectFarmAssetCoverage();
  const entries = Object.entries(FARM_ASSET_MANIFEST);
  const uniqueSourceUrls = new Set(
    entries.filter(([, entry]) => entry.status !== "missing").map(([, entry]) => entry.url),
  );
  const assetKeys = entries.map(([assetKey]) => assetKey);
  const identities = entries.map(([, entry]) => manifestIdentity(entry));

  assert.equal(new Set(assetKeys).size, assetKeys.length, "manifest keys must be unique");
  assert.equal(report.declarations, entries.length);
  assert.equal(report.sourceFiles, uniqueSourceUrls.size);
  assert.equal(
    new Set(identities).size,
    identities.length,
    "manifest content identities must be unique",
  );

  for (const [assetKey, entry] of entries) {
    const sourceUrl = FARM_ASSET_SOURCE_URLS[entry.url as keyof typeof FARM_ASSET_SOURCE_URLS];
    assert.ok(sourceUrl, `${assetKey} has no explicit source mapping for ${entry.url}`);
    assert.match(sourceUrl, /^file:/, `${assetKey} source must resolve to a local file in tests`);
    const sourcePath = fileURLToPath(sourceUrl);
    assert.ok(statSync(sourcePath).isFile(), `${assetKey} source is not a file: ${sourcePath}`);
    assert.ok(statSync(sourcePath).size > 0, `${assetKey} source is empty: ${sourcePath}`);
    assert.equal(getFarmAsset(assetKey as keyof typeof FARM_ASSET_MANIFEST).assetKey, assetKey);
  }
});

test("manifest output keeps stable asset identities separate from atlas frame coordinates", () => {
  for (const [assetKey, entry] of Object.entries(FARM_ASSET_MANIFEST)) {
    const resolved = getFarmAsset(assetKey as keyof typeof FARM_ASSET_MANIFEST);
    assert.equal(resolved.entityId, entry.entityId);
    assert.equal(resolved.visualState, entry.visualState);
    if (entry.atlasFrame) {
      assert.ok(entry.atlasFrame.column >= 0);
      assert.ok(entry.atlasFrame.row >= 0);
      assert.ok(!entry.entityId.includes(`-${entry.atlasFrame.column}`));
      assert.ok(!entry.entityId.includes(`-${entry.atlasFrame.row}`));
    }
  }
});
