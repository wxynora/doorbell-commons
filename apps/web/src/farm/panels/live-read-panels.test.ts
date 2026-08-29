/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("non-preview tool panels consume structured live reads instead of Demo catalogs", () => {
  const toolPanel = source("./tool-panel.tsx");
  const toolTypes = source("./tools/types.ts");
  const backpackPanel = source("./tools/backpack-panel.tsx");
  const remotePanels = source("./tools/remote-panels.tsx");
  const recipeCatalog = source("./tools/cooking-recipe-catalog.tsx");
  const smeltingPanel = source("./tools/smelting-panel.tsx");
  const actionPanels = source("./farm-action-panels.tsx");

  assert.match(toolTypes, /farmCatalog\?: BoundFarmCatalogRead \| null/);
  assert.match(toolTypes, /kitchen\?: BoundKitchenRead \| null/);
  assert.match(toolTypes, /ranch\?: BoundRanchRead \| null/);
  assert.match(backpackPanel, /farmCatalog\?\.data\.backpack/);
  assert.match(
    backpackPanel,
    /item\.kind === "seed" \|\| \(item\.kind === "item" && item\.item_id === "speed_potion"\)/,
  );
  assert.match(backpackPanel, /item\.kind === "item" && item\.item_id !== "speed_potion"/);
  assert.match(actionPanels, /farmCatalog\?\.data\.codex/);
  assert.match(remotePanels, /farmCatalog\?\.data\.expedition/);
  assert.match(smeltingPanel, /farmCatalog\?\.data\.smelting/);
  assert.match(recipeCatalog, /kitchen\?\.data\.known_recipes/);
  assert.match(remotePanels, /ranch\?\.data\.dispatch/);
  assert.match(
    remotePanels,
    /<RanchDispatchPanelContent[\s\S]*farmCatalog=\{farmCatalog \?\? null\}[\s\S]*ranch=\{ranch\}/,
  );
  assert.match(
    toolPanel,
    /<FarmShopPanelContent[\s\S]*farmCatalog=\{farmCatalog \?\? null\}[\s\S]*kitchen=\{kitchen \?\? null\}[\s\S]*ranch=\{ranch \?\? null\}/,
  );
  assert.match(toolPanel, /<CookingRecipeCatalog[\s\S]*kitchen=\{kitchen \?\? null\}/);
  assert.match(
    toolPanel,
    /<RanchDispatchPanel[\s\S]*farmCatalog=\{farmCatalog \?\? null\}[\s\S]*ranch=\{ranch \?\? null\}/,
  );
});

test("live bulletin and neighborhood render only structured catalog sections", () => {
  const bulletinPanel = source("./bulletin-panel.tsx");
  const neighborhoodScene = source("../scenes/neighborhood/neighborhood-scene.tsx");

  assert.match(bulletinPanel, /bulletin\?: BoundBulletinRead \| null/);
  assert.match(bulletinPanel, /available\.tasks\?\.map/);
  assert.match(bulletinPanel, /available\.mature_plots\?\.map/);
  assert.match(bulletinPanel, /available\.messages\?\.map/);
  assert.match(bulletinPanel, /available\.ranch_notifications\?\.map/);
  assert.match(bulletinPanel, /unavailable\.tasks/);
  assert.match(bulletinPanel, /unavailable\.mature_plots/);
  assert.match(neighborhoodScene, /farmCatalog\?: BoundFarmCatalogRead \| null/);
  assert.match(neighborhoodScene, /liveNeighborhood\.rankings/);
  assert.match(neighborhoodScene, /liveNeighborhood\.messages/);
  assert.match(neighborhoodScene, /liveNeighborhood\.original_crops/);
  assert.match(neighborhoodScene, /暂无真实内容/);
});
