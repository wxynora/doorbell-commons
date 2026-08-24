/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("non-preview tool panels consume structured live reads instead of Demo catalogs", () => {
  const toolPanel = source("./tool-panel.tsx");

  assert.match(toolPanel, /farmCatalog\?: BoundFarmCatalogRead \| null/);
  assert.match(toolPanel, /kitchen\?: BoundKitchenRead \| null/);
  assert.match(toolPanel, /ranch\?: BoundRanchRead \| null/);
  assert.match(toolPanel, /if \(preview\)/);
  assert.match(toolPanel, /farmCatalog\?\.data\.backpack/);
  assert.match(
    toolPanel,
    /item\.kind === "seed" \|\| \(item\.kind === "item" && item\.item_id === "speed_potion"\)/,
  );
  assert.match(toolPanel, /item\.kind === "item" && item\.item_id !== "speed_potion"/);
  assert.match(toolPanel, /farmCatalog\?\.data\.codex/);
  assert.match(toolPanel, /farmCatalog\?\.data\.expedition/);
  assert.match(toolPanel, /farmCatalog\?\.data\.smelting/);
  assert.match(toolPanel, /kitchen\?\.data\.known_recipes/);
  assert.match(toolPanel, /ranch\?\.data\.dispatch/);
  assert.match(
    toolPanel,
    /<FarmShopPanelContent[\s\S]*farmCatalog=\{farmCatalog \?\? null\}[\s\S]*kitchen=\{kitchen \?\? null\}[\s\S]*ranch=\{ranch \?\? null\}/,
  );
  assert.match(toolPanel, /身份不可用/);
  assert.match(toolPanel, /if \(!preview\)[\s\S]*kitchen\?\.data\.known_recipes/);
});

test("live bulletin and neighborhood render only structured catalog sections", () => {
  const bulletinPanel = source("./bulletin-panel.tsx");
  const neighborhoodScene = source("../scenes/neighborhood/neighborhood-scene.tsx");

  assert.match(bulletinPanel, /farmCatalog\?: BoundFarmCatalogRead \| null/);
  assert.match(bulletinPanel, /bulletin\.messages/);
  assert.match(bulletinPanel, /bulletin\.ranch_notices/);
  assert.match(bulletinPanel, /bulletin\.tasks\.message/);
  assert.match(bulletinPanel, /bulletin\.mature_broadcast\.message/);
  assert.match(neighborhoodScene, /farmCatalog\?: BoundFarmCatalogRead \| null/);
  assert.match(neighborhoodScene, /liveNeighborhood\.rankings/);
  assert.match(neighborhoodScene, /liveNeighborhood\.messages/);
  assert.match(neighborhoodScene, /liveNeighborhood\.original_crops/);
  assert.match(neighborhoodScene, /暂无真实内容/);
});
