/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getLiveRanchResidents,
  getLiveRanchSceneResidents,
  getLiveRanchVisitors,
} from "./ranch-resident-detail";

const baseVariant = {
  current_variant_id: "base",
  available_variant_ids: ["base"],
  available_variants: [
    {
      variant_id: "base",
      name: "原始外观",
      atlas: null,
      set: null,
      sprite_index: null,
    },
  ],
};

function resident(kindId: string, name: string, dispatch: "home" | "active" | null) {
  return {
    status: "known",
    identity: { status: "known", kind_id: kindId, name, custom_name: null },
    variants: baseVariant,
    dispatch:
      dispatch === null ? null : { state: dispatch, raid_id: dispatch === "home" ? null : "raid" },
  };
}

test("Ranch scene excludes dispatched residents and keeps incoming visitors separate", () => {
  const ranch = {
    data: {
      residents: {
        status: "available",
        animals: [resident("chicken", "外出的鸡", "active"), resident("cow", "在家的牛", "home")],
        pets: [resident("cat", "在家的猫", null)],
        patrol_goose: resident("patrol_goose", "鹅队长", null),
      },
      scene: {
        status: "available",
        resident_count: 3,
        visitor_count: 1,
        visitors: [
          {
            status: "known",
            raid_id: "visitor-raid",
            animal_kind_id: "chicken",
            animal_name: "来客鸡",
            variant: baseVariant.available_variants[0],
          },
        ],
      },
    },
  } as never;

  assert.equal(getLiveRanchResidents(ranch).length, 4);
  assert.deepEqual(
    getLiveRanchSceneResidents(ranch).map((entry) => entry.resident.identity.kind_id),
    ["cow", "cat", "patrol_goose"],
  );
  assert.deepEqual(
    getLiveRanchVisitors(ranch).map((entry) => ({ id: entry.id, name: entry.name })),
    [{ id: "visitor:visitor-raid", name: "来客鸡" }],
  );
});

test("Ranch scene renders authority counts and non-interactive visitor markers", () => {
  const fieldSource = readFileSync(new URL("./farm-field-content.tsx", import.meta.url), "utf8");
  const sceneSource = readFileSync(
    new URL("../scenes/ranch/ranch-scene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(fieldSource, /getLiveRanchSceneResidents\(ranch\)/);
  assert.match(fieldSource, /getLiveRanchVisitors\(ranch\)/);
  assert.match(fieldSource, /visitor: true/);
  assert.match(fieldSource, /residentCount=\{ranchSceneResidentCount\}/);
  assert.match(fieldSource, /visitorCount=\{ranchSceneVisitorCount\}/);
  assert.match(
    sceneSource,
    /在场动物 \{residentCount \?\? "—"\} 只 · 来客 \{visitorCount \?\? "—"\} 只/,
  );
  assert.match(sceneSource, /return animal\.visitor \? \(\s*<span[\s\S]*牧场来客[\s\S]*role="img"/);
});
