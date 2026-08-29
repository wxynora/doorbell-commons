/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { getRanchSceneInitialPosition, type RanchSceneAnimalLayout } from "./ranch-scene-position";

const LIVE_LAYOUT: RanchSceneAnimalLayout = {
  x: 18,
  y: 42,
  size: 18,
  roam: { minX: 10, maxX: 88, minY: 32, maxY: 79 },
};

test("live ranch initial positions are stable for one resident during one mount", () => {
  const first = getRanchSceneInitialPosition("resident:cat", LIVE_LAYOUT, 20260830);
  const rerender = getRanchSceneInitialPosition("resident:cat", LIVE_LAYOUT, 20260830);

  assert.deepEqual(rerender, first);
  assert.notDeepEqual(first, { x: LIVE_LAYOUT.x, y: LIVE_LAYOUT.y });
});

test("live ranch initial positions stay inside the resident roam boundary", () => {
  const residentKeys = [
    "resident:cat",
    "resident:dog",
    "resident:cloud-sheep",
    "visitor:patrol-goose",
  ];

  for (let entropy = 0; entropy < 32; entropy += 1) {
    for (const residentKey of residentKeys) {
      const position = getRanchSceneInitialPosition(residentKey, LIVE_LAYOUT, entropy);
      assert.ok(position.x >= LIVE_LAYOUT.roam.minX);
      assert.ok(position.x <= LIVE_LAYOUT.roam.maxX);
      assert.ok(position.y >= LIVE_LAYOUT.roam.minY);
      assert.ok(position.y <= LIVE_LAYOUT.roam.maxY);
    }
  }
});

test("different live residents start dispersed instead of in the fixed layout", () => {
  const positions = [
    "resident:cat",
    "resident:dog",
    "resident:cloud-sheep",
    "visitor:patrol-goose",
  ].map((residentKey) => getRanchSceneInitialPosition(residentKey, LIVE_LAYOUT, 20260830));

  assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, positions.length);
  assert.ok(
    positions.every(({ x, y }) => x !== LIVE_LAYOUT.x || y !== LIVE_LAYOUT.y),
    "no live resident should use the fixed indexed layout as its initial point",
  );
});

test("a fresh ranch mount changes a resident initial position", () => {
  const firstMount = getRanchSceneInitialPosition("resident:cat", LIVE_LAYOUT, 20260830);
  const nextMount = getRanchSceneInitialPosition("resident:cat", LIVE_LAYOUT, 20260831);

  assert.notDeepEqual(nextMount, firstMount);
});
