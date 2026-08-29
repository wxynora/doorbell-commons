import assert from "node:assert/strict";
import test from "node:test";
import {
  getRanchResidentSpriteVisual,
  RANCH_SHOP_ANIMALS,
  type RanchVariantSelection,
} from "./ranch-animal-data";

function animal(id: string) {
  const entry = RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === id);
  assert.ok(entry, `missing test animal ${id}`);
  return entry;
}

function selection(
  currentVariantId: string,
  option: RanchVariantSelection["available_variants"][number],
): RanchVariantSelection {
  return { current_variant_id: currentVariantId, available_variants: [option] };
}

test("all four limited skins replace the current resident sprite", () => {
  for (const [kindId, skinId] of [
    ["dog", "pompompurin"],
    ["cat", "hachiware"],
    ["rabbit", "usagi"],
    ["cloud_sheep", "mysweetpiano"],
  ] as const) {
    const visual = getRanchResidentSpriteVisual(
      animal(kindId),
      selection(skinId, {
        variant_id: skinId,
        atlas: null,
        set: null,
        sprite_index: null,
      }),
    );
    assert.equal(visual.kind, "skin");
    assert.match(String(visual.spriteStyle.backgroundImage), new RegExp(`${skinId}\\.png`));
    assert.equal(visual.staticSprite, true);
  }
});

test("an equipped ordinary variant uses its authoritative atlas coordinates", () => {
  const visual = getRanchResidentSpriteVisual(
    animal("chicken"),
    selection("chicken_strawberry", {
      variant_id: "chicken_strawberry",
      atlas: "glimmer.variants",
      set: 1,
      sprite_index: 0,
    }),
  );
  assert.equal(visual.kind, "variant");
  assert.equal(
    visual.spriteStyle.backgroundImage,
    'url("/lingye/glimmer/variants/variant-1.webp")',
  );
  assert.equal(visual.spriteStyle.backgroundPosition, "0% 0%");
  assert.equal(visual.spriteStyle.backgroundSize, "500% 400%");
});

test("base and unverified current variants render the base resident sprite", () => {
  const base = getRanchResidentSpriteVisual(
    animal("cat"),
    selection("base", {
      variant_id: "base",
      atlas: null,
      set: null,
      sprite_index: null,
    }),
  );
  const unverified = getRanchResidentSpriteVisual(
    animal("cat"),
    selection("cat_unknown", {
      variant_id: "cat_unknown",
      atlas: null,
      set: null,
      sprite_index: null,
    }),
  );
  assert.equal(base.kind, "base");
  assert.equal(unverified.kind, "base");
  assert.equal(base.spriteStyle.backgroundImage, unverified.spriteStyle.backgroundImage);
});
