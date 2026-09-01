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
    getLiveRanchVisitors(ranch).map((entry) => ({
      id: entry.id,
      name: entry.name,
      raidId: entry.raidId,
    })),
    [{ id: "visitor:visitor-raid", name: "来客鸡", raidId: "visitor-raid" }],
  );
});

test("Ranch scene renders authority counts and catches visitors from their animal buttons", () => {
  const fieldSource = readFileSync(new URL("./farm-field-content.tsx", import.meta.url), "utf8");
  const sceneSource = readFileSync(
    new URL("../scenes/ranch/ranch-scene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(fieldSource, /getLiveRanchSceneResidents\(ranch\)/);
  assert.match(fieldSource, /getLiveRanchVisitors\(ranch\)/);
  assert.match(fieldSource, /visitor: true/);
  assert.match(fieldSource, /visitorRaidId: visitor\.raidId/);
  assert.match(fieldSource, /action: "catch"/);
  assert.ok(
    fieldSource.indexOf('className="farm-ranch-presence"') > fieldSource.indexOf("<SceneBalance"),
  );
  assert.match(
    fieldSource,
    /在场动物 \{ranchSceneResidentCount \?\? "—"\} 只 · 来客 \{ranchSceneVisitorCount \?\? "—"\} 只/,
  );
  assert.doesNotMatch(sceneSource, /farm-ranch-presence/);
  assert.match(
    sceneSource,
    /return animal\.visitor && animal\.visitorRaidId \? \(\s*<button[\s\S]*抓住来客[\s\S]*onClick/,
  );
});

test("Ranch presence and collection control share one non-overlapping vertical stack", () => {
  const fieldSource = readFileSync(new URL("./farm-field-content.tsx", import.meta.url), "utf8");
  const pageStyles = readFileSync(new URL("../farm-page.css", import.meta.url), "utf8");
  const ranchStyles = readFileSync(
    new URL("../scenes/ranch/ranch-scene.css", import.meta.url),
    "utf8",
  );

  const stackStart = fieldSource.indexOf('className="farm-ranch-status-stack"');
  const presence = fieldSource.indexOf('className="farm-ranch-presence"', stackStart);
  const collection = fieldSource.indexOf("<RanchCollectionControl", stackStart);
  assert.ok(stackStart >= 0);
  assert.ok(presence > stackStart);
  assert.ok(collection > presence);
  assert.match(
    pageStyles,
    /\.farm-ranch-status-stack\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:/s,
  );
  assert.match(
    pageStyles,
    /\.farm-ranch-status-stack \.farm-ranch-collect\s*\{[^}]*position:\s*static[^}]*transform:\s*none/s,
  );
  assert.doesNotMatch(ranchStyles, /\.farm-ranch-presence\s*\{[^}]*position:\s*absolute/s);
});
