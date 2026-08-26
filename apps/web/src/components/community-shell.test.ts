/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { LingyePlaceId } from "../view-models";
import {
  DOORBELL_INTERNAL_PATHS,
  getLingyePlaceInternalPath,
  openDoorbellInternalPage,
} from "./community-shell";

const lingyePlaceIds: readonly LingyePlaceId[] = [
  "moonlight-pond",
  "crystal-cave",
  "geyser-waterfall",
  "floating-lake",
  "mangrove-shoal",
  "abyssal-trench",
  "glimmer-meadow",
  "doorbell-community",
  "farm-ranch",
  "vocational-school",
  "lingye-daily",
  "animal-hospital",
  "bank",
  "lingye-public-security-office",
  "detention-center",
  "commercial-street",
];

test("farm, Glimmer Meadow, and Lingye Together use same-page Doorbell routes without a human key", () => {
  const opened: string[] = [];
  const navigator = {
    assign(path: string) {
      opened.push(path);
    },
  };

  openDoorbellInternalPage(DOORBELL_INTERNAL_PATHS.farm, navigator);
  openDoorbellInternalPage(DOORBELL_INTERNAL_PATHS.lingyeGlimmer, navigator);
  openDoorbellInternalPage(DOORBELL_INTERNAL_PATHS.lingyeTogether, navigator);

  assert.deepEqual(opened, ["/lingye/farm", "/api/lingye-glimmer", "/api/lingye-together"]);
  assert.equal(
    opened.some((path) => path.includes("humanKey") || path.includes("farm_human_key")),
    false,
  );
  assert.equal(
    opened.every((path) => path.startsWith("/api/") || path === "/lingye/farm"),
    true,
  );
});

test("Glimmer Meadow only resolves an internal path until the click handler opens it", () => {
  const opened: string[] = [];
  const navigator = {
    assign(path: string) {
      opened.push(path);
    },
  };

  const glimmerPath = getLingyePlaceInternalPath("glimmer-meadow");

  assert.equal(glimmerPath, "/api/lingye-glimmer");
  assert.deepEqual(opened, []);

  if (glimmerPath) {
    openDoorbellInternalPage(glimmerPath, navigator);
  }

  assert.deepEqual(opened, ["/api/lingye-glimmer"]);
});

test("only farm and Glimmer Meadow are open map places", () => {
  const availablePlaces = lingyePlaceIds.filter(
    (placeId) => getLingyePlaceInternalPath(placeId) !== null,
  );
  const unavailablePlaces = lingyePlaceIds.filter(
    (placeId) => getLingyePlaceInternalPath(placeId) === null,
  );

  assert.deepEqual(availablePlaces, ["glimmer-meadow", "farm-ranch"]);
  assert.equal(unavailablePlaces.length, 14);
});
