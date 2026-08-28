import assert from "node:assert/strict";
import test from "node:test";

const { cookingIngredients, cookingProducts, cookingRecipes } = await import("../dist/content.js");
const {
  CHEF_ANCHOR_SCORE_BY_RARITY,
  CHEF_CULINARY_BASES,
  CHEF_QUALITY_VERSION,
  CHEF_QUALITY_CONTENT,
  CHEF_QUALITY_CONTENT_ERROR,
  CHEF_STRUCTURE_SCORES,
  buildChefAnchorTables,
  chefHardConflict,
  chefStructureScore,
  evaluateChefOriginalQuality,
  chefOriginalRecipeKey,
  loadChefQualityContent,
} = await import("../dist/domain/kitchen/chef-quality.js");

const scoreTables = (pairScore, methodScore, ids = ["salt", "flour"]) => ({
  pairScores: { [[ids[0], ids[1]].sort().join("|")]: pairScore },
  methodScores: Object.fromEntries(ids.map((id) => [`${id}|pan-fry`, methodScore])),
});

const completeScoreTables = (ids, pairScore, methodScore) => ({
  pairScores: Object.fromEntries(ids.flatMap((left, leftIndex) => ids
    .slice(leftIndex + 1)
    .map((right) => [[left, right].sort().join("|"), pairScore]))),
  methodScores: Object.fromEntries(ids.map((id) => [`${id}|pan-fry`, methodScore])),
});

function evaluate(pairScore, methodScore, structureScore, options = {}) {
  return evaluateChefOriginalQuality({
    ingredients: options.ingredients ?? ["salt", "flour"],
    methodId: options.methodId ?? "pan-fry",
    ingredientBases: options.ingredientBases ?? { salt: 1, flour: 1 },
    ...scoreTables(pairScore, methodScore, options.ids ?? ["salt", "flour"]),
    structureScore,
    hardConflict: options.hardConflict ?? false,
  });
}

test("the fixed recipe catalog produces only mechanical rarity/method anchors", () => {
  const anchors = buildChefAnchorTables(cookingRecipes);
  assert.equal(anchors.ok, true);
  assert.equal(anchors.qualityVersion, CHEF_QUALITY_VERSION);
  assert.equal(anchors.pairScores["carrot|chicken_egg"], CHEF_ANCHOR_SCORE_BY_RARITY.N);
  assert.equal(anchors.methodScores["carrot|pan-fry"], CHEF_ANCHOR_SCORE_BY_RARITY.N);
  assert.equal(anchors.methodScores["fish:any|stir-fry"], CHEF_ANCHOR_SCORE_BY_RARITY.SSR);
});

test("the versioned quality content covers every cookable ingredient and snapshots all anchors", () => {
  assert.equal(CHEF_QUALITY_CONTENT_ERROR, null);
  assert.equal(CHEF_QUALITY_CONTENT.version, CHEF_QUALITY_VERSION);
  const cookableIds = new Set([
    ...cookingIngredients.map((item) => item.id),
    ...cookingProducts.filter((item) => item.cookable === true).map((item) => item.id),
    "fish:any",
  ]);
  assert.equal(Object.keys(CHEF_QUALITY_CONTENT.ingredients).length, cookableIds.size);
  for (const id of cookableIds) {
    assert.equal(typeof CHEF_QUALITY_CONTENT.ingredients[id].culinary_base, "number");
    assert.ok(CHEF_QUALITY_CONTENT.ingredients[id].class);
    assert.ok(CHEF_QUALITY_CONTENT.ingredients[id].roles.length > 0);
  }
  assert.deepEqual(Object.keys(CHEF_QUALITY_CONTENT.methods).sort(), [
    "deep-fry", "dessert", "drink", "pan-fry", "roast", "steam", "stew", "stir-fry",
  ].sort());
  const anchors = buildChefAnchorTables(cookingRecipes);
  assert.deepEqual(CHEF_QUALITY_CONTENT.pair_anchors, anchors.pairScores);
  assert.deepEqual(CHEF_QUALITY_CONTENT.method_anchors, anchors.methodScores);
  assert.equal(JSON.stringify(CHEF_QUALITY_CONTENT.pair_anchors), JSON.stringify(anchors.pairScores));
  assert.equal(JSON.stringify(CHEF_QUALITY_CONTENT.method_anchors), JSON.stringify(anchors.methodScores));
  assert.equal(CHEF_QUALITY_CONTENT.anchor_source.recipe_count, 90);
  assert.equal(CHEF_QUALITY_CONTENT.pair_anchors["beef|butter"], 100);
  assert.equal(CHEF_QUALITY_CONTENT.method_anchors["fish:any|stir-fry"], 100);
  const downgraded = structuredClone(CHEF_QUALITY_CONTENT);
  downgraded.pair_anchors["beef|butter"] = 99;
  assert.equal(loadChefQualityContent(downgraded).code, "anchor_mismatch");
});

test("versioned roles compute all eight method structures and unknown anchors fail closed", () => {
  const completeExamples = {
    "stir-fry": ["chicken_egg", "tomato"],
    "pan-fry": ["chicken_egg", "salt"],
    stew: ["beef", "salt"],
    steam: ["chicken_egg", "salt"],
    roast: ["beef", "spice"],
    "deep-fry": ["beef", "salt"],
    dessert: ["fresh_milk", "sugar"],
    drink: ["tea", "honey"],
  };
  for (const [methodId, ingredients] of Object.entries(completeExamples))
    assert.equal(chefStructureScore({ ingredients, methodId }).structureScore, CHEF_STRUCTURE_SCORES.COMPLETE);
  assert.equal(chefStructureScore({ ingredients: ["salt", "vanilla"], methodId: "deep-fry" }).structureScore, CHEF_STRUCTURE_SCORES.CONFLICT_OR_MISSING_ESSENTIAL);
  assert.equal(chefHardConflict({ ingredients: ["cocoa", "fish:any"], methodId: "dessert" }).hardConflict, true);
  assert.equal(evaluateChefOriginalQuality({ ingredients: ["cocoa", "fish:any"], methodId: "dessert" }).odd, true);
  assert.equal(evaluateChefOriginalQuality({ ingredients: ["salt", "vanilla"], methodId: "deep-fry" }).odd, true);
  const unanchoredDeepFry = evaluateChefOriginalQuality({ ingredients: ["chicken_meat", "salt"], methodId: "deep-fry" });
  assert.equal(unanchoredDeepFry.ok, true);
  assert.equal(unanchoredDeepFry.methodScore, 0);
  assert.equal(unanchoredDeepFry.rarity, "N");
  assert.equal(evaluateChefOriginalQuality({
    ingredients: ["unknown", "salt"],
    methodId: "pan-fry",
    ingredientBases: { unknown: 1, salt: 1 },
    pairScores: { "salt|unknown": 60 },
    methodScores: { "unknown|pan-fry": 60, "salt|pan-fry": 60 },
    structureScore: CHEF_STRUCTURE_SCORES.COMPLETE,
    hardConflict: false,
  }).code, "ingredient_content_unavailable");
});

test("recipe shape is 2 to 5 total portions with at least two distinct ingredients", () => {
  assert.equal(evaluateChefOriginalQuality({ ingredients: ["salt"], methodId: "pan-fry" }).code, "recipe_shape_invalid");
  assert.equal(evaluateChefOriginalQuality({ ingredients: ["salt", "salt"], methodId: "pan-fry" }).code, "recipe_shape_invalid");
  assert.equal(evaluateChefOriginalQuality({ ingredients: ["salt", "flour", "sugar", "rice", "tofu", "tea"], methodId: "pan-fry" }).code, "recipe_shape_invalid");
  assert.equal(evaluate(60, 60, 100).ok, true);
  const fiveIngredients = ["salt", "flour", "sugar", "rice", "tofu"];
  const five = evaluateChefOriginalQuality({
    ingredients: fiveIngredients,
    methodId: "pan-fry",
    ingredientBases: Object.fromEntries(fiveIngredients.map((id) => [id, 1])),
    ...completeScoreTables(fiveIngredients, 60, 60),
    structureScore: 100,
    hardConflict: false,
  });
  assert.equal(five.ok, true);
});

test("method, structure, and hard conflict facts fail closed or produce odd cuisine", () => {
  assert.equal(evaluate(60, 60, 100, { methodId: "not-a-method" }).code, "method_unavailable");
  assert.equal(evaluate(60, 60, 55).code, "structure_score_unavailable");
  assert.equal(evaluate(60, 60, 100, { hardConflict: true }).odd, true);
  assert.equal(evaluate(60, 60, 0).odd, true);
  assert.equal(evaluate(80, 80, 100).odd, false);
});

test("B uses the geometric mean with duplicate portions and P keeps the approved weights", () => {
  const result = evaluateChefOriginalQuality({
    ingredients: ["salt", "flour", "sugar"],
    methodId: "pan-fry",
    ingredientBases: { salt: 1, flour: 1.2, sugar: 1 },
    pairScores: { "flour|salt": 80, "salt|sugar": 60, "flour|sugar": 40 },
    methodScores: {
      "salt|pan-fry": 50,
      "flour|pan-fry": 70,
      "sugar|pan-fry": 90,
    },
    structureScore: 70,
    hardConflict: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.pairScore, 60);
  assert.equal(result.methodScore, 70);
  assert.equal(result.structureScore, 70);
  assert.equal(result.P, 65);
  assert.ok(Math.abs(result.B - (1.2 ** (1 / 3))) < 1e-12);
  assert.equal(result.S, result.B * result.P);
});

test("S thresholds and P caps produce N/R/SR/SSR without SP", () => {
  assert.equal(evaluate(50, 50, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL).rarity, "N");
  assert.equal(evaluate(70, 70, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL).rarity, "R");
  assert.equal(evaluate(80, 80, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL, { ingredientBases: { salt: 1.05, flour: 1 } }).rarity, "SR");
  assert.equal(evaluate(100, 100, CHEF_STRUCTURE_SCORES.COMPLETE, { ingredientBases: { salt: 1.2, flour: 1.2 } }).rarity, "SSR");

  assert.equal(evaluate(50, 50, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL, { ingredientBases: { salt: 1.2, flour: 1.2 } }).rarity, "N");
  assert.equal(evaluate(70, 70, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL, { ingredientBases: { salt: 1.2, flour: 1.2 } }).rarity, "R");
  assert.equal(evaluate(80, 80, CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL, { ingredientBases: { salt: 1.2, flour: 1.2 } }).rarity, "SR");
  assert.equal(evaluate(100, 100, CHEF_STRUCTURE_SCORES.COMPLETE, { ingredientBases: { salt: 1, flour: 1 } }).rarity, "SR");
  assert.notEqual(evaluate(100, 100, CHEF_STRUCTURE_SCORES.COMPLETE, { ingredientBases: { salt: 1.2, flour: 1.2 } }).rarity, "SP");
});

test("missing versioned tables are explicit blockers, and equal inputs replay identically", () => {
  const missingPair = evaluateChefOriginalQuality({
    ingredients: ["salt", "flour"],
    methodId: "pan-fry",
    structureScore: 100,
    hardConflict: false,
    pairScores: {},
    methodScores: { "salt|pan-fry": 60, "flour|pan-fry": 60 },
  });
  assert.equal(missingPair.code, "pair_score_unavailable");
  const missingMethod = evaluateChefOriginalQuality({
    ingredients: ["salt", "flour"],
    methodId: "pan-fry",
    pairScores: { "flour|salt": 60 },
    structureScore: 100,
    hardConflict: false,
    methodScores: {},
  });
  assert.equal(missingMethod.code, "method_score_unavailable");
  assert.equal(evaluateChefOriginalQuality({
    ingredients: ["salt", "flour"],
    methodId: "pan-fry",
    pairScores: { "flour|salt": 60 },
    methodScores: { "salt|pan-fry": 60, "flour|pan-fry": 60 },
    structureScore: 100,
    hardConflict: null,
  }).code, "hard_conflict_unavailable");

  assert.equal(chefStructureScore({ ingredients: ["salt", "flour"], methodId: "pan-fry" }).structureScore, 100);
  assert.equal(chefHardConflict({ ingredients: ["cocoa", "fish:any"], methodId: "dessert" }).hardConflict, true);

  const input = {
    ingredients: ["flour", "salt", "salt"],
    methodId: "pan-fry",
    ingredientBases: { salt: 1.05, flour: 1 },
    pairScores: { "flour|salt": 80 },
    methodScores: { "salt|pan-fry": 80, "flour|pan-fry": 80 },
    structureScore: 100,
    hardConflict: false,
  };
  const first = evaluateChefOriginalQuality(input);
  const second = evaluateChefOriginalQuality(structuredClone(input));
  assert.deepEqual(second, first);
  assert.equal(chefOriginalRecipeKey(input.ingredients, input.methodId), "pan-fry|flour:1,salt:2");
  assert.equal(CHEF_CULINARY_BASES.warm_egg, 1.2);
});
