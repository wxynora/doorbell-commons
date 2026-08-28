import assert from "node:assert/strict";
import test from "node:test";

const {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const {
    CHEF_RECIPE_LEVEL_RULES,
    ChefRecipeService,
    activeChefQualificationLevel,
    ensureChefRecipeSchema,
    getChefRecipeResearch,
    listChefRecipes,
    researchChefRecipe,
} = await import("../dist/career/chef-recipe-service.js");

const NOW = Date.parse("2026-08-28T04:00:00.000Z");

class FakeInventory {
    #stock;
    #consumed = new Map();
    #refunds = new Map();
    #throwAfterConsume;
    #throwAfterRefund;

    constructor(stock, { throwAfterConsume = false, throwAfterRefund = false } = {}) {
        this.#stock = { ...stock };
        this.#throwAfterConsume = throwAfterConsume;
        this.#throwAfterRefund = throwAfterRefund;
    }

    hasTool() {
        return true;
    }

    consumeIngredients(input) {
        const previous = this.#consumed.get(input.operationId);
        if (previous)
            return { ok: true, alreadyConsumed: true, receipt: previous };
        for (const ingredient of input.ingredients) {
            if ((this.#stock[ingredient.id] ?? 0) < ingredient.quantity)
                return { ok: false, code: "inventory_insufficient" };
        }
        for (const ingredient of input.ingredients)
            this.#stock[ingredient.id] -= ingredient.quantity;
        const receipt = { kind: "consume", operationId: input.operationId };
        this.#consumed.set(input.operationId, receipt);
        if (this.#throwAfterConsume) {
            this.#throwAfterConsume = false;
            throw new Error("simulated process loss after inventory commit");
        }
        return { ok: true, receipt };
    }

    refundIngredient(input) {
        const previous = this.#refunds.get(input.operationId);
        if (previous)
            return { ok: true, alreadyApplied: true, receipt: previous };
        this.#stock[input.ingredientId] = (this.#stock[input.ingredientId] ?? 0) + input.quantity;
        const receipt = { kind: "refund", operationId: input.operationId, ingredientId: input.ingredientId };
        this.#refunds.set(input.operationId, receipt);
        if (this.#throwAfterRefund) {
            this.#throwAfterRefund = false;
            throw new Error("simulated process loss after refund commit");
        }
        return { ok: true, receipt };
    }

    stock(id) {
        return this.#stock[id] ?? 0;
    }

    consumeCalls() {
        return this.#consumed.size;
    }

    refundCalls() {
        return this.#refunds.size;
    }
}

function seedChef(database, residentId, level = 1) {
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference: `binding:${residentId}`,
        registeredAt: NOW - 10,
    });
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'chef', 1, ?)
    `).run(residentId, NOW - 9);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'chef', ?, 'active', ?, ?, ?)
    `).run(residentId, level, `attempt:${residentId}`, NOW - 8, NOW - 7);
}

function researchInput(residentId, operationId, idempotencyKey, ingredients = ["beef", "butter"], methodId = "pan-fry") {
    return {
        residentId,
        operationId,
        idempotencyKey,
        ingredients,
        methodId,
        recipeName: `原创-${operationId}`,
    };
}

function setup(residentId = "chef-1", level = 1, inventoryOptions = {}) {
    const database = openLingyeWorldDatabase(":memory:");
    ensureChefRecipeSchema(database);
    seedChef(database, residentId, level);
    const inventory = new FakeInventory({
        beef: 100,
        butter: 100,
        spice: 100,
        salt: 100,
        tomato: 100,
        chicken_egg: 100,
        cocoa: 100,
        "fish:any": 100,
    }, inventoryOptions);
    return { database, inventory };
}

function close(database) {
    database.close();
}

test("active chef level is authoritative and derives the four approved research rules", () => {
    const { database } = setup("level-4", 4);
    try {
        assert.equal(activeChefQualificationLevel(database, "level-4", NOW), 4);
        assert.deepEqual(CHEF_RECIPE_LEVEL_RULES, {
            1: { maxRecipes: 2, successChance: 0.2, refundChance: 0.05 },
            2: { maxRecipes: 5, successChance: 0.3, refundChance: 0.1 },
            3: { maxRecipes: 10, successChance: 0.45, refundChance: 0.15 },
            4: { maxRecipes: 20, successChance: 0.6, refundChance: 0.2 },
        });
    }
    finally {
        close(database);
    }
});

test("a successful research consumes real inventory, applies only the approved refund, and records immutable quality facts", () => {
    const { database, inventory } = setup("successful-chef", 4);
    try {
        const result = researchChefRecipe(database, researchInput("successful-chef", "research-1", "idem-1"), {
            inventory,
            now: NOW,
            random: () => 0,
            generateId: () => "recipe-1",
        });
        assert.equal(result.status, "succeeded");
        assert.equal(result.consumed, true);
        assert.equal(result.qualificationLevel, 4);
        assert.equal(result.researchLimit, 20);
        assert.equal(result.successChance, 0.6);
        assert.equal(result.refundChance, 0.2);
        assert.equal(result.quality.qualityVersion, "chef-original-v1");
        assert.equal(result.quality.identity, "pan-fry|beef:1,butter:1");
        assert.equal(result.quality.rarity, "SSR");
        assert.equal(result.recipe.identityKey, result.quality.identity);
        assert.equal(result.recipe.residentId, "successful-chef");
        assert.equal(result.recipe.authorResidentId, "successful-chef");
        assert.equal(result.recipe.recipeVersion, 1);
        assert.equal(result.recipe.qualityVersion, "chef-original-v1");
        assert.deepEqual(result.inventoryReceipt, { kind: "consume", operationId: "research-1" });
        assert.equal(inventory.stock("beef"), 99);
        assert.equal(inventory.stock("butter"), 100);
        assert.equal(result.refund.ingredientId, "butter");
        assert.equal(inventory.refundCalls(), 1);
        assert.equal(listChefRecipes(database, "successful-chef").length, 1);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_chef_original_recipes").get().count, 1);
    }
    finally {
        close(database);
    }
});

test("a failed quality roll still consumes the full input and replays without another debit", () => {
    const { database, inventory } = setup("failed-chef", 1);
    try {
        const input = researchInput("failed-chef", "research-fail", "idem-fail", ["chicken_egg", "tomato"]);
        const first = researchChefRecipe(database, input, {
            inventory,
            now: NOW,
            random: () => 1,
        });
        assert.equal(first.status, "failed");
        assert.equal(first.failureCode, "research_failed");
        assert.equal(first.consumed, true);
        assert.equal(first.refund.applied, false);
        assert.equal(inventory.stock("chicken_egg"), 99);
        assert.equal(inventory.stock("tomato"), 99);
        assert.equal(inventory.consumeCalls(), 1);

        const replay = researchChefRecipe(database, input, {
            inventory,
            now: NOW + 100,
            random: () => 0,
        });
        assert.deepEqual(replay, first);
        assert.equal(inventory.consumeCalls(), 1);
        assert.equal(inventory.refundCalls(), 0);
        assert.equal(listChefRecipes(database, "failed-chef").length, 0);
    }
    finally {
        close(database);
    }
});

test("a process loss after consumption resumes from the persisted operation and does not double-consume", () => {
    const { database, inventory } = setup("recovery-chef", 4, { throwAfterConsume: true });
    try {
        const input = researchInput("recovery-chef", "research-recover", "idem-recover");
        let firstRoll = true;
        assert.throws(() => researchChefRecipe(database, input, {
            inventory,
            now: NOW,
            random: () => firstRoll ? (firstRoll = false, 0) : 1,
            generateId: () => "recipe-recover",
        }), (error) => error.code === "chef_inventory_unavailable");
        assert.equal(getChefRecipeResearch(database, "research-recover").status, "pending");
        assert.equal(inventory.stock("beef"), 99);
        assert.equal(inventory.stock("butter"), 99);

        const recovered = researchChefRecipe(database, input, {
            inventory,
            now: NOW + 100,
            random: () => 1,
            generateId: () => "recipe-recover",
        });
        assert.equal(recovered.status, "succeeded");
        assert.equal(inventory.consumeCalls(), 1);
        assert.equal(inventory.stock("beef"), 99);
        assert.equal(inventory.stock("butter"), 99);
        assert.equal(listChefRecipes(database, "recovery-chef").length, 1);
    }
    finally {
        close(database);
    }
});

test("a process loss after the approved refund resumes without a second refund", () => {
    const { database, inventory } = setup("refund-recovery-chef", 4, { throwAfterRefund: true });
    try {
        const input = researchInput("refund-recovery-chef", "research-refund-recover", "idem-refund-recover");
        assert.throws(() => researchChefRecipe(database, input, {
            inventory,
            now: NOW,
            random: () => 0,
            generateId: () => "recipe-refund-recover",
        }), (error) => error.code === "chef_inventory_refund_unavailable");
        assert.equal(getChefRecipeResearch(database, "research-refund-recover").status, "consumed");
        assert.equal(getChefRecipeResearch(database, "research-refund-recover").refund.applied, false);

        const recovered = researchChefRecipe(database, input, {
            inventory,
            now: NOW + 100,
            random: () => 1,
            generateId: () => "recipe-refund-recover",
        });
        assert.equal(recovered.status, "succeeded");
        assert.equal(recovered.refund.applied, true);
        assert.equal(inventory.consumeCalls(), 1);
        assert.equal(inventory.refundCalls(), 1);
        assert.equal(inventory.stock("butter"), 100);
    }
    finally {
        close(database);
    }
});

test("the same normalized ingredients and method cannot create a second original recipe or consume again", () => {
    const { database, inventory } = setup("duplicate-chef", 4);
    try {
        const firstInput = researchInput("duplicate-chef", "research-a", "idem-a", ["butter", "beef"]);
        const first = researchChefRecipe(database, firstInput, {
            inventory,
            now: NOW,
            random: () => 0,
            generateId: () => "recipe-a",
        });
        assert.equal(first.status, "succeeded");
        const consumedAfterFirst = inventory.consumeCalls();

        const duplicate = researchChefRecipe(database, researchInput("duplicate-chef", "research-b", "idem-b"), {
            inventory,
            now: NOW + 1,
            random: () => 0,
            generateId: () => "recipe-b",
        });
        assert.equal(duplicate.ok, false);
        assert.equal(duplicate.status, "rejected");
        assert.equal(duplicate.failureCode, "chef_recipe_identity_exists");
        assert.equal(inventory.consumeCalls(), consumedAfterFirst);
        assert.equal(listChefRecipes(database, "duplicate-chef").length, 1);

        const official = researchChefRecipe(database, researchInput(
            "duplicate-chef",
            "research-official",
            "idem-official",
            ["chicken_egg", "salt"],
        ), {
            inventory,
            now: NOW + 2,
            random: () => 0,
        });
        assert.equal(official.ok, false);
        assert.equal(official.failureCode, "chef_recipe_identity_exists");
        assert.equal(inventory.consumeCalls(), consumedAfterFirst);
    }
    finally {
        close(database);
    }
});

test("a legal method with no existing anchor uses zero rather than inventing quality facts", () => {
    const { database, inventory } = setup("deep-fry-chef", 1);
    try {
        const result = new ChefRecipeService({
            database,
            inventory,
            now: () => NOW,
            random: () => 0,
            generateId: () => "deep-fry-recipe",
        }).research(researchInput(
            "deep-fry-chef",
            "research-deep-fry",
            "idem-deep-fry",
            ["beef", "spice"],
            "deep-fry",
        ));
        assert.equal(result.status, "succeeded");
        assert.equal(result.quality.methodScore, 0);
        assert.equal(result.quality.pairScore, 100);
        assert.equal(result.quality.P, 70);
        assert.equal(result.recipe.methodId, "deep-fry");
    }
    finally {
        close(database);
    }
});

test("a failed odd combination consumes input but excludes fish from the approved refund pool", () => {
    const { database, inventory } = setup("odd-chef", 4);
    try {
        const result = researchChefRecipe(database, researchInput(
            "odd-chef",
            "research-odd",
            "idem-odd",
            ["cocoa", "fish:any"],
            "dessert",
        ), {
            inventory,
            now: NOW,
            random: () => 0,
        });
        assert.equal(result.status, "failed");
        assert.equal(result.failureCode, "odd_recipe");
        assert.equal(result.quality.odd, true);
        assert.equal(result.successRoll, null);
        assert.equal(result.refund.ingredientId, "cocoa");
        assert.equal(inventory.stock("fish:any"), 99);
        assert.equal(inventory.consumeCalls(), 1);
    }
    finally {
        close(database);
    }
});

test("farm products are real inputs but do not enter the ordinary-ingredient refund pool", () => {
    const { database, inventory } = setup("product-refund-chef", 4);
    try {
        const result = researchChefRecipe(database, researchInput(
            "product-refund-chef",
            "research-products",
            "idem-products",
            [
                { id: "beef", quantity: 1, source: "product" },
                { id: "chicken_egg", quantity: 1, source: "product" },
            ],
        ), {
            inventory,
            now: NOW,
            random: () => 0,
        });
        assert.equal(result.status, "failed");
        assert.equal(result.consumed, true);
        assert.equal(result.refund.applied, false);
        assert.equal(result.refund.ingredientId, null);
        assert.equal(inventory.refundCalls(), 0);
    }
    finally {
        close(database);
    }
});

test("missing active chef qualification is rejected before touching inventory", () => {
    const { database, inventory } = setup("unqualified-chef", 1);
    try {
        database.prepare("UPDATE career_certificates SET status = 'pending_review_configuration' WHERE resident_id = ?").run("unqualified-chef");
        assert.throws(() => researchChefRecipe(database, researchInput(
            "unqualified-chef",
            "research-unqualified",
            "idem-unqualified",
        ), { inventory, now: NOW, random: () => 0 }), (error) => error.code === "chef_active_qualification_required");
        assert.equal(inventory.consumeCalls(), 0);
        assert.equal(listChefRecipes(database, "unqualified-chef").length, 0);
    }
    finally {
        close(database);
    }
});

test("level one cannot register a third successful original recipe", () => {
    const { database, inventory } = setup("cap-chef", 1);
    try {
        for (const [index, ingredients] of [
            ["beef", "butter"],
            ["beef", "spice"],
        ].entries()) {
            const result = researchChefRecipe(database, researchInput(
                "cap-chef",
                `research-cap-${index}`,
                `idem-cap-${index}`,
                ingredients,
            ), {
                inventory,
                now: NOW + index,
                random: () => 0,
                generateId: () => `recipe-cap-${index}`,
            });
            assert.equal(result.status, "succeeded");
        }
        const before = inventory.consumeCalls();
        const rejected = researchChefRecipe(database, researchInput(
            "cap-chef",
            "research-cap-2",
            "idem-cap-2",
            ["beef", "soy_sauce"],
        ), {
            inventory,
            now: NOW + 2,
            random: () => 0,
        });
        assert.equal(rejected.ok, false);
        assert.equal(rejected.failureCode, "chef_recipe_limit_reached");
        assert.equal(inventory.consumeCalls(), before);
        assert.equal(listChefRecipes(database, "cap-chef").length, 2);
    }
    finally {
        close(database);
    }
});
