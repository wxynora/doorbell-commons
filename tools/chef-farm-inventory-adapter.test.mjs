import assert from "node:assert/strict";
import test from "node:test";

const {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const {
    CHEF_FARM_INVENTORY_RECEIPTS_FIELD,
    createChefFarmInventoryAdapter,
    resolveChefFarmForResident,
} = await import("../dist/career/chef-farm-inventory-adapter.js");
const {
    ensureChefRecipeSchema,
    researchChefRecipe,
} = await import("../dist/career/chef-recipe-service.js");

const NOW = Date.parse("2026-08-28T04:00:00.000Z");

function makeFarm(id, migrationId, { tool = "fryer" } = {}) {
    return {
        id,
        name: `${id} farm`,
        humanKey: `browser-human-key-${id}`,
        doorbellMcpMigration: { migrationId },
        ranch: {
            kitchen: {
                ownedTools: tool ? [tool] : [],
                products: [
                    { id: `${id}-beef-1`, itemId: "beef", name: "牛肉", value: 10 },
                ],
                ingredients: { salt: 2, spice: 1, butter: 1 },
                dishes: [],
                knownRecipes: [],
            },
        },
        fishing: {
            catchInventory: [
                { id: `${id}-fish-1`, fishId: "mud_carp", size: 20, rawValue: 8, sellSilver: 2 },
            ],
        },
    };
}

function setup({ residentId = "chef-adapter-1", migrationId = "migration:chef-adapter", farmOptions } = {}) {
    const database = openLingyeWorldDatabase(":memory:");
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference: migrationId,
        registeredAt: NOW,
    });
    const farm = makeFarm("FARM-A", migrationId, farmOptions);
    const farms = new Map([[farm.id, farm]]);
    let replaceCalls = 0;
    let throwAfterCommit = false;
    const adapter = createChefFarmInventoryAdapter({
        database,
        residentId,
        now: () => NOW,
        listFarms: () => [...farms.values()],
        replaceFarm: (id, next) => {
            replaceCalls++;
            farms.set(id, next);
            if (throwAfterCommit) {
                throwAfterCommit = false;
                throw new Error("simulated process loss after durable farm commit");
            }
        },
    });
    return {
        database,
        farm,
        farms,
        adapter,
        setThrowAfterCommit: () => { throwAfterCommit = true; },
        replaceCalls: () => replaceCalls,
        currentFarm: () => farms.get(farm.id),
    };
}

function consumeInput(operationId = "research-adapter-1", idempotencyKey = "research-adapter-idem-1") {
    return {
        operationId,
        idempotencyKey,
        residentId: "chef-adapter-1",
        methodId: "deep-fry",
        ingredients: [
            { id: "beef", quantity: 1 },
            { id: "fish:any", quantity: 1 },
            { id: "salt", quantity: 1 },
        ],
    };
}

function close(harness) {
    harness.database.close();
}

function activateChef(database) {
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES ('chef-adapter-1', 'chef', 1, ?)
    `).run(NOW - 2);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES ('chef-adapter-1', 'chef', 4, 'active', 'chef-adapter-attempt', ?, ?)
    `).run(NOW - 1, NOW - 1);
}

test("server resident binding and current kitchen tools determine the farm", () => {
    const harness = setup();
    try {
        assert.equal(resolveChefFarmForResident(harness.database, "chef-adapter-1", () => [harness.farm]), harness.farm);
        assert.equal(harness.adapter.isMethodAvailable("deep-fry"), true);
        assert.equal(harness.adapter.hasTool("fryer"), true);
        assert.equal(harness.adapter.hasMethod("deep-fry"), true);

        assert.throws(
            () => harness.adapter.consumeIngredients({
                ...consumeInput(),
                farmId: harness.farm.id,
            }),
            (error) => error?.code === "chef_inventory_client_identity_forbidden",
        );

        harness.farms.set(harness.farm.id, { ...harness.currentFarm(), ranch: { kitchen: {
            ...harness.currentFarm().ranch.kitchen,
            ownedTools: [],
        } } });
        assert.equal(harness.adapter.isMethodAvailable("deep-fry"), false);
        assert.equal(harness.adapter.hasTool("fryer"), false);
    }
    finally {
        close(harness);
    }
});

test("consumption uses product, fish, and stacked ingredient authorities and replays one receipt", () => {
    const harness = setup();
    try {
        const input = consumeInput();
        const first = harness.adapter.consumeIngredients(input);
        assert.equal(first.ok, true);
        assert.equal(first.alreadyConsumed, undefined);
        assert.equal(first.receipt.kind, "chef_recipe_research_consume");
        assert.deepEqual(first.receipt.consumed.ingredients, [{ id: "salt", quantity: 1 }]);
        assert.deepEqual(first.receipt.consumed.products[0].instanceIds, ["FARM-A-beef-1"]);
        assert.deepEqual(first.receipt.consumed.fish[0].instanceIds, ["FARM-A-fish-1"]);

        const afterConsume = harness.currentFarm();
        assert.equal(afterConsume.ranch.kitchen.ingredients.salt, 1);
        assert.equal(afterConsume.ranch.kitchen.products.length, 0);
        assert.equal(afterConsume.fishing.catchInventory.length, 0);
        assert.ok(afterConsume[CHEF_FARM_INVENTORY_RECEIPTS_FIELD]);

        const replay = harness.adapter.consumeIngredients(input);
        assert.equal(replay.ok, true);
        assert.equal(replay.alreadyConsumed, true);
        assert.deepEqual(replay.receipt, first.receipt);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 1);
        assert.equal(harness.replaceCalls(), 1);

        const productRefund = harness.adapter.refundIngredient({
            operationId: input.operationId,
            idempotencyKey: `${input.operationId}:refund`,
            residentId: input.residentId,
            methodId: input.methodId,
            ingredientId: "beef",
            quantity: 1,
        });
        assert.equal(productRefund.ok, false);
        assert.equal(productRefund.code, "refund_not_eligible");

        const refund = harness.adapter.refundIngredient({
            operationId: input.operationId,
            idempotencyKey: `${input.operationId}:refund`,
            residentId: input.residentId,
            methodId: input.methodId,
            ingredientId: "salt",
            quantity: 1,
        });
        assert.equal(refund.ok, true);
        assert.equal(refund.receipt.kind, "chef_recipe_research_refund");
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 2);

        const refundReplay = harness.adapter.refundIngredient({
            operationId: input.operationId,
            idempotencyKey: `${input.operationId}:refund`,
            residentId: input.residentId,
            methodId: input.methodId,
            ingredientId: "salt",
            quantity: 1,
        });
        assert.equal(refundReplay.alreadyApplied, true);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 2);
        assert.equal(harness.replaceCalls(), 2);
    }
    finally {
        close(harness);
    }
});

test("the resident-scoped adapter plugs into ChefRecipeService without a browser farm credential", () => {
    const harness = setup();
    try {
        activateChef(harness.database);
        ensureChefRecipeSchema(harness.database);
        const result = researchChefRecipe(harness.database, {
            residentId: "chef-adapter-1",
            operationId: "research-adapter-service",
            idempotencyKey: "research-adapter-service-idem",
            methodId: "deep-fry",
            recipeName: "adapter service recipe",
            ingredients: ["beef", "spice"],
        }, {
            inventory: harness.adapter,
            now: NOW,
            random: () => 0,
            generateId: () => "adapter-service-recipe",
        });
        assert.equal(result.status, "succeeded");
        assert.equal(result.recipe.methodId, "deep-fry");
        assert.equal(result.quality.methodScore, 0);
        assert.equal(harness.currentFarm().ranch.kitchen.products.length, 0);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.spice, 1);
        assert.equal(harness.replaceCalls(), 2);
    }
    finally {
        close(harness);
    }
});

test("a durable save followed by process loss replays without a second consume or refund", () => {
    const harness = setup();
    try {
        const input = consumeInput("research-adapter-crash", "research-adapter-crash-idem");
        harness.setThrowAfterCommit();
        assert.throws(
            () => harness.adapter.consumeIngredients(input),
            (error) => error?.code === "chef_inventory_unavailable",
        );
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 1);
        assert.equal(harness.currentFarm().ranch.kitchen.products.length, 0);
        assert.equal(harness.replaceCalls(), 1);

        const recovered = harness.adapter.consumeIngredients(input);
        assert.equal(recovered.alreadyConsumed, true);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 1);
        assert.equal(harness.replaceCalls(), 1);

        harness.setThrowAfterCommit();
        assert.throws(
            () => harness.adapter.refundIngredient({
                operationId: input.operationId,
                idempotencyKey: `${input.operationId}:refund`,
                residentId: input.residentId,
                methodId: input.methodId,
                ingredientId: "salt",
                quantity: 1,
            }),
            (error) => error?.code === "chef_inventory_unavailable",
        );
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 2);
        const refundRecovered = harness.adapter.refundIngredient({
            operationId: input.operationId,
            idempotencyKey: `${input.operationId}:refund`,
            residentId: input.residentId,
            methodId: input.methodId,
            ingredientId: "salt",
            quantity: 1,
        });
        assert.equal(refundRecovered.alreadyApplied, true);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 2);
        assert.equal(harness.replaceCalls(), 2);
    }
    finally {
        close(harness);
    }
});

test("insufficient, unknown, non-cookable, and unowned-tool actions fail before mutation", () => {
    const harness = setup({ farmOptions: { tool: null } });
    try {
        const noTool = harness.adapter.consumeIngredients(consumeInput("research-no-tool", "research-no-tool-idem"));
        assert.deepEqual(noTool, { ok: false, code: "chef_recipe_method_tool_required" });
        assert.equal(harness.replaceCalls(), 0);

        const insufficient = harness.adapter.consumeIngredients({
            operationId: "research-insufficient",
            idempotencyKey: "research-insufficient-idem",
            residentId: "chef-adapter-1",
            methodId: "pan-fry",
            ingredients: [{ id: "salt", quantity: 3 }, { id: "butter", quantity: 1 }],
        });
        assert.deepEqual(insufficient, { ok: false, code: "inventory_insufficient" });
        assert.equal(harness.replaceCalls(), 0);

        assert.throws(
            () => harness.adapter.consumeIngredients({
                operationId: "research-unknown",
                idempotencyKey: "research-unknown-idem",
                residentId: "chef-adapter-1",
                methodId: "pan-fry",
                ingredients: [{ id: "not-an-approved-item", quantity: 1 }, { id: "salt", quantity: 1 }],
            }),
            (error) => error?.code === "chef_inventory_item_unavailable",
        );
        assert.equal(harness.replaceCalls(), 0);
        assert.equal(harness.currentFarm().ranch.kitchen.ingredients.salt, 2);
    }
    finally {
        close(harness);
    }
});

test("a resident with zero or multiple migration-bound farms is rejected", () => {
    const database = openLingyeWorldDatabase(":memory:");
    try {
        registerLingyeResidentReference(database, {
            residentId: "chef-unbound",
            bindingReference: "migration:missing",
            registeredAt: NOW,
        });
        assert.throws(
            () => resolveChefFarmForResident(database, "chef-unbound", () => []),
            (error) => error?.code === "chef_inventory_binding_required",
        );
        const first = makeFarm("FARM-1", "migration:duplicate");
        const second = makeFarm("FARM-2", "migration:duplicate");
        registerLingyeResidentReference(database, {
            residentId: "chef-duplicate",
            bindingReference: "migration:duplicate",
            registeredAt: NOW,
        });
        assert.throws(
            () => resolveChefFarmForResident(database, "chef-duplicate", () => [first, second]),
            (error) => error?.code === "chef_inventory_binding_conflict",
        );
    }
    finally {
        database.close();
    }
});
