import assert from "node:assert/strict";
import test from "node:test";
import {
  getRanchResidentSpriteVisual,
  RANCH_ORDINARY_VARIANT_TARGETS,
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
  availableVariantIds: readonly string[] = ["base", currentVariantId],
): RanchVariantSelection {
  return {
    available_variant_ids: availableVariantIds,
    available_variants: [option],
    current_variant_id: currentVariantId,
  };
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
    assert.equal(visual.staticSprite, false);
  }
});

test("all 57 ordinary variants use their audited target, sheet, and atlas cell", () => {
  assert.equal(RANCH_ORDINARY_VARIANT_TARGETS.size, 57);
  for (const [variantId, target] of RANCH_ORDINARY_VARIANT_TARGETS) {
    const spriteAnimalId = target.kindId === "patrol_goose" ? "goose" : target.kindId;
    const visual = getRanchResidentSpriteVisual(
      animal(spriteAnimalId),
      selection(variantId, {
        variant_id: variantId,
        atlas: "glimmer.variants",
        set: target.set,
        sprite_index: target.spriteIndex,
      }),
      target.kindId,
    );
    assert.equal(visual.kind, "variant", variantId);
    assert.equal(
      visual.spriteStyle.backgroundImage,
      `url("/lingye/glimmer/variants/variant-${target.set}.webp?v=${target.set === 3 ? "20260810a" : "20260809b"}")`,
      variantId,
    );
    assert.equal(
      visual.spriteStyle.backgroundPosition,
      `${(target.spriteIndex % 5) * 25}% ${(Math.floor(target.spriteIndex / 5) * 100) / 3}%`,
      variantId,
    );
    assert.equal(visual.spriteStyle.backgroundSize, "500% 400%", variantId);
  }
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

test("current, ownership, target, and authoritative coordinates must all agree", () => {
  const strawberryOption = {
    variant_id: "dream_cat_strawberry",
    atlas: "glimmer.variants" as const,
    set: 1 as const,
    sprite_index: 15,
  };
  const expected = getRanchResidentSpriteVisual(
    animal("dream_cat"),
    selection("dream_cat_strawberry", strawberryOption),
    "dream_cat",
  );
  const notOwned = getRanchResidentSpriteVisual(
    animal("dream_cat"),
    selection("dream_cat_strawberry", strawberryOption, ["base", "dream_cat_mint"]),
    "dream_cat",
  );
  const wrongSheet = getRanchResidentSpriteVisual(
    animal("dream_cat"),
    selection("dream_cat_strawberry", { ...strawberryOption, set: 3 }),
    "dream_cat",
  );
  const wrongTarget = getRanchResidentSpriteVisual(
    animal("dream_cat"),
    selection("dream_cat_strawberry", strawberryOption),
    "cat",
  );
  assert.equal(expected.kind, "variant");
  assert.match(String(expected.spriteStyle.backgroundImage), /variant-1\.webp\?v=20260809b/);
  assert.equal(notOwned.kind, "base");
  assert.equal(wrongSheet.kind, "base");
  assert.equal(wrongTarget.kind, "base");
});

test("limited skins cannot render on the wrong resident kind", () => {
  const wrongKind = getRanchResidentSpriteVisual(
    animal("cat"),
    selection("pompompurin", {
      variant_id: "pompompurin",
      atlas: null,
      set: null,
      sprite_index: null,
    }),
    "cat",
  );
  assert.equal(wrongKind.kind, "base");
});
