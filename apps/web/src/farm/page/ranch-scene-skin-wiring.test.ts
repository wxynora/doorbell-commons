/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./farm-field-content.tsx", import.meta.url), "utf8");

test("moving ranch residents reuse the authoritative current-variant visual resolver", () => {
  assert.match(
    source,
    /getRanchResidentSpriteVisual\(\s*resident\.spriteAnimal,\s*resident\.resident\.variants,\s*resident\.resident\.identity\.kind_id \?\? resident\.spriteAnimal\.id,\s*\)/,
  );
  assert.match(source, /placementStyle: visual\.placementStyle/);
  assert.match(source, /spriteStyle: visual\.spriteStyle/);
  assert.match(source, /staticSprite: visual\.staticSprite/);
  assert.doesNotMatch(source, /RANCH_LIMITED_SKINS\.find/);
});
