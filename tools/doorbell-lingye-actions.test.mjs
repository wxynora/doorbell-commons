import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-lingye-actions-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "doorbell-lingye-actions-test-token";

const { makeFarm } = await import("../dist/game.js");
const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { createDoorbellInternalHandler } = await import("../dist/server/doorbell/router.js");
const { getFarm, insertFarm } = await import("../dist/store.js");

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const RESIDENT_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const OTHER_RESIDENT_ID = "019ffb01-49cd-7020-94af-3d04fb1ed03d";
const MIGRATION_ID = "019ffb01-49cd-7020-a4af-3d04fb1ed03d";
const FARM_ID = "ABC234";
const OTHER_FARM_ID = "DEF567";
const HUMAN_KEY = "doorbell-lingye-human-key";
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 150_000,
    restrictedDailySilverLimit: 300,
};
const TEST_CURRICULUM_VERSION = "doorbell-lingye-test-bank-v1";
function testPaper(kind, targetKey, count) {
    const questions = Array.from({ length: count }, (_, index) => ({
        id: `${targetKey}:question:${index + 1}`,
        stem: `Test question ${index + 1}`,
        options: { A: "A", B: "B", C: "C", D: "D" },
        answer: index === 0 ? ["A", "C"] : ["A", "B", "C", "D"][index % 4],
        explanation: `Test explanation ${index + 1}`,
    }));
    return {
        kind,
        targetKey,
        bankVersion: TEST_CURRICULUM_VERSION,
        publicPaper: questions.map(({ answer: _answer, explanation: _explanation, ...question }) => question),
        answerKey: questions.map((question) => question.answer),
        review: questions.map((question) => ({
            id: question.id,
            correctAnswer: question.answer,
            explanation: question.explanation,
        })),
    };
}

function answerSelections(answerKey) {
    return answerKey.map((answer) => Array.isArray(answer) ? answer : [answer]);
}
const TEST_CURRICULUM = Object.freeze({
    careerCourseAvailability: () => true,
    careerCourseContent: (career, level, courseIndex) => ({
        career,
        level,
        courseIndex,
        title: `Test ${career} ${level}-${courseIndex}`,
        contentMarkdown: `Test course content for ${career} ${level}-${courseIndex}.`,
        bankVersion: TEST_CURRICULUM_VERSION,
    }),
    careerExamAvailability: () => true,
    createCoursePracticePaper: (career, level, courseIndex, residentId) =>
        testPaper("course_practice", `course:${residentId}:${career}:${level}:${courseIndex}`, 5),
    createWrittenExamPaper: (career, level, attemptId) =>
        testPaper("written_exam", `exam:${attemptId}`, 20),
});

function request(body) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.headers = { authorization: "Bearer doorbell-lingye-actions-test-token" };
    return req;
}

function responseCapture() {
    return {
        body: "",
        headers: undefined,
        status: undefined,
        writeHead(status, headers) {
            this.status = status;
            this.headers = headers;
        },
        end(body = "") {
            this.body = String(body);
        },
    };
}

function execute(executor, op, args, identity = {}) {
    const residentId = identity.residentId ?? RESIDENT_ID;
    return executor.execute({
        residentId,
        bindingReference: identity.bindingReference ?? MIGRATION_ID,
        farm: identity.farm ?? getFarm(residentId === OTHER_RESIDENT_ID ? OTHER_FARM_ID : FARM_ID),
        op,
        args,
    });
}

const OPTION_HANDLE_RE = /^opt_[A-Za-z0-9_-]{12}$/u;

function optionWithLabel(options, label) {
    return options.find((entry) => entry.label === label);
}

function assertPublicOptions(value) {
    if (Array.isArray(value)) {
        for (const entry of value)
            assertPublicOptions(entry);
        return;
    }
    if (!value || typeof value !== "object")
        return;
    if (Object.hasOwn(value, "option")) {
        assert.deepEqual(Object.keys(value).sort(), ["label", "option", "requires"]);
        assert.match(value.option, OPTION_HANDLE_RE);
        assert.match(value.label, /[\u3400-\u9fff]/u);
        assert.ok(Array.isArray(value.requires));
    }
    for (const [key, entry] of Object.entries(value)) {
        if (["optionReference", "option_reference"].includes(key) && typeof entry === "string" &&
            /^(bank|school|commission):/u.test(entry)) {
            assert.fail("public result leaked an internal option reference");
        }
        assertPublicOptions(entry);
    }
}

test("Lingye option handles persist across database reopen and stay resident/op scoped", (t) => {
    const directory = mkdtempSync(join(tmpdir(), "aifarm-lingye-option-handles-"));
    const databasePath = join(directory, "lingye-world.sqlite");
    const residentId = "019ffb01-49cd-7020-b5af-3d04fb1ed03d";
    const otherResidentId = "019ffb01-49cd-7020-c5af-3d04fb1ed03d";
    const bindingReference = "option-handle-resident";
    const otherBindingReference = "option-handle-other-resident";
    let database = openLingyeWorldDatabase(databasePath);
    t.after(() => {
        database?.close();
        rmSync(directory, { recursive: true, force: true });
    });
    let backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        curriculum: TEST_CURRICULUM,
        now: () => NOW,
    });
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference,
        registeredAt: NOW,
    });
    registerLingyeResidentReference(database, {
        residentId: otherResidentId,
        bindingReference: otherBindingReference,
        registeredAt: NOW,
    });
    for (const [targetResidentId, migrationId] of [
        [residentId, bindingReference],
        [otherResidentId, otherBindingReference],
    ]) {
        backend.trustedSystemCommands.importLegacyBalances({
            residentId: targetResidentId,
            gold: 100_000,
            silver: 0,
            migrationId,
            idempotencyKey: `economy:${migrationId}`,
        });
    }
    let executor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => NOW,
    });
    const run = (targetExecutor, targetResidentId, targetBindingReference, op, args) =>
        targetExecutor.execute({
            residentId: targetResidentId,
            bindingReference: targetBindingReference,
            farm: null,
            op,
            args,
        });
    const bankView = run(executor, residentId, bindingReference, "go.bank.view", {});
    const deposit = optionWithLabel(bankView.data.options, "存入金币活期");
    assert.ok(deposit);
    assert.match(deposit.option, OPTION_HANDLE_RE);
    assert.deepEqual(deposit.requires, ["amount"]);
    assert.equal(optionWithLabel(
        run(executor, residentId, bindingReference, "go.bank.view", {}).data.options,
        "存入金币活期",
    ).option, deposit.option);
    assert.equal(run(executor, otherResidentId, otherBindingReference, "go.bank.choose", {
        option: deposit.option,
        amount: 1,
    }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(run(executor, residentId, bindingReference, "go.school.choose", {
        option: deposit.option,
    }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(run(executor, residentId, bindingReference, "go.bank.choose", {
        option: "bank:demand-deposit:0",
        amount: 1,
    }).error.code, "OPTION_NOT_AVAILABLE");

    database.close();
    database = openLingyeWorldDatabase(databasePath);
    backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        curriculum: TEST_CURRICULUM,
        now: () => NOW,
    });
    executor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => NOW,
    });
    const args = { option: deposit.option, amount: 1_000 };
    const applied = run(executor, residentId, bindingReference, "go.bank.choose", args);
    assert.equal(applied.ok, true);
    assert.deepEqual(run(executor, residentId, bindingReference, "go.bank.choose", args), applied);
    assert.equal(backend.forResident(residentId).getOwnAccount().availableGold, 99_000);
});

test("Doorbell Lingye exposes only ready authoritative bank, school and commission state", async (t) => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    let actionNow = NOW;
    const backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        curriculum: TEST_CURRICULUM,
        chefAuthority: { useFarmStore: true },
        generateId: () => `lingye-action-${++sequence}`,
        now: () => actionNow,
    });
    const executor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => actionNow,
    });
    t.after(() => {
        database.close();
        rmSync(dataDirectory, { recursive: true, force: true });
    });

    registerLingyeResidentReference(database, {
        residentId: RESIDENT_ID,
        bindingReference: MIGRATION_ID,
        registeredAt: NOW,
    });
    registerLingyeResidentReference(database, {
        residentId: OTHER_RESIDENT_ID,
        bindingReference: "other-doorbell-migration",
        registeredAt: NOW,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: RESIDENT_ID,
        gold: 2_000_000,
        silver: 600,
        migrationId: `economy:${MIGRATION_ID}`,
        idempotencyKey: `economy:${MIGRATION_ID}`,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: OTHER_RESIDENT_ID,
        gold: 1_000_000,
        silver: 100,
        migrationId: "economy:other-doorbell-migration",
        idempotencyKey: "economy:other-doorbell-migration",
    });

    assert.throws(() => execute(executor, "go.school.choose", {
        option: "school:invalid-answer-contract",
        answers: [["A"], ["B"], ["C"], ["D"], ["E"]],
    }), /answers must contain five or twenty non-empty sets of unique A-D choices/u);

    const farm = makeFarm("Doorbell Lingye Test");
    farm.id = FARM_ID;
    farm.humanKey = HUMAN_KEY;
    farm.agentKey = undefined;
    farm.doorbellMcpMigration = {
        migrationId: MIGRATION_ID,
        confirmationId: "019ffb01-49cd-7020-b4af-3d04fb1ed03d",
        revokedAt: new Date(NOW).toISOString(),
        legacyMcpRevoked: true,
    };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: "real-plot-condition-1",
            condition: "drought",
            status: "open",
            generatedDay: 1,
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: 99_999,
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const otherFarm = makeFarm("Doorbell Lingye Other");
    otherFarm.id = OTHER_FARM_ID;
    otherFarm.humanKey = "doorbell-lingye-other-human-key";
    otherFarm.agentKey = undefined;
    otherFarm.doorbellMcpMigration = {
        migrationId: "other-doorbell-migration",
        confirmationId: "019ffb01-49cd-7020-c4af-3d04fb1ed03d",
        revokedAt: new Date(NOW).toISOString(),
        legacyMcpRevoked: true,
    };
    otherFarm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: "other-plot-condition-1",
            condition: "drought",
            status: "open",
            generatedDay: 1,
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    otherFarm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: 99_999,
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    otherFarm.market = [{ kind: "ingredient", id: "spice", qty: 2, price: 10 }];
    insertFarm(otherFarm);
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'chef', 1, ?)
    `).run(OTHER_RESIDENT_ID, NOW);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'chef', 3, 'active', ?, ?, ?)
    `).run(OTHER_RESIDENT_ID, "doorbell-chef-store-certificate", NOW, NOW);
    database.prepare(`
      INSERT INTO career_chef_original_recipes (
        recipe_id, identity_key, resident_id, recipe_name, ingredients_json,
        method_id, recipe_version, quality_version, base_score, pair_score,
        method_score, structure_score, quality_score, total_score, rarity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        "doorbell-chef-recipe",
        "egg:1|tomato:1|stir-fry",
        OTHER_RESIDENT_ID,
        "门铃番茄蛋",
        JSON.stringify([{ id: "egg", quantity: 1 }, { id: "tomato", quantity: 1 }]),
        "stir-fry",
        "chef-quality-v1",
        1, 70, 80, 80, 74, 74, "N", NOW,
    );

    const router = createDoorbellInternalHandler(() => {
        throw new Error("farm executor must not be called");
    }, executor);
    const res = responseCapture();
    const handled = await router(request({
        resident_id: RESIDENT_ID,
        farm_human_key: HUMAN_KEY,
        expected_farm_doorplate: FARM_ID,
        op: "go.bank.view",
        args: {},
    }), res, ["internal", "doorbell", "lingye-actions", "execute"], "POST");
    assert.equal(handled, true);
    assert.equal(res.status, 200);
    const routedBank = JSON.parse(res.body);
    assert.equal(routedBank.ok, true);
    assert.equal(routedBank.data.account.availableGold, 2_000_000);
    assert.equal(routedBank.data.account.availableSilver, 600);

    const bankView = execute(executor, "go.bank.view", {});
    assertPublicOptions(bankView);
    const depositOption = optionWithLabel(bankView.data.options, "存入金币活期");
    assert.ok(depositOption);
    assert.deepEqual(execute(executor, "go.bank.choose", {
        option: "bank:term-close:0:another-resident-deposit",
    }), {
        ok: false,
        error: {
            code: "OPTION_NOT_AVAILABLE",
            message: "当前选项已失效或不适用于这项业务；请重新查看当前事实与 option。",
        },
    });
    const depositArgs = { option: depositOption.option, amount: 1_000 };
    const firstDeposit = execute(executor, "go.bank.choose", depositArgs);
    const replayedDeposit = execute(executor, "go.bank.choose", depositArgs);
    assert.equal(firstDeposit.ok, true);
    assert.deepEqual(replayedDeposit, firstDeposit);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold, 1_999_000);

    const loanBank = execute(executor, "go.bank.view", {});
    const loanOfferOption = optionWithLabel(loanBank.data.options, "向其他居民提供银币借款");
    assert.deepEqual(loanOfferOption.requires, ["to", "amount", "termDays", "totalRatePpm"]);
    const proposedLoan = execute(executor, "go.bank.choose", {
        option: loanOfferOption.option,
        to: OTHER_FARM_ID,
        amount: 50,
        termDays: 14,
        totalRatePpm: 10_000,
    });
    assert.equal(proposedLoan.ok, true);
    assert.equal(proposedLoan.data.result.role, "lender");
    assert.deepEqual(proposedLoan.data.result.counterparty, {
        doorplate: OTHER_FARM_ID,
        name: otherFarm.name,
    });
    assert.equal("lenderResidentId" in proposedLoan.data.result, false);
    assert.equal("borrowerResidentId" in proposedLoan.data.result, false);
    const lenderConfirm = optionWithLabel(proposedLoan.data.current.options, "确认玩家借款合同");
    assert.ok(lenderConfirm);
    assert.equal(execute(executor, "go.bank.choose", { option: lenderConfirm.option }).ok, true);
    const otherIdentity = {
        residentId: OTHER_RESIDENT_ID,
        bindingReference: "other-doorbell-migration",
    };
    const borrowerView = execute(executor, "go.bank.view", { section: "loans" }, otherIdentity);
    const borrowerConfirm = optionWithLabel(borrowerView.data.options, "确认玩家借款合同");
    assert.ok(borrowerConfirm);
    const activatedLoan = execute(executor, "go.bank.choose", { option: borrowerConfirm.option }, otherIdentity);
    assert.equal(activatedLoan.data.result.status, "active");
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableSilver, 550);
    assert.equal(backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableSilver, 150);
    const borrowerRepay = optionWithLabel(activatedLoan.data.current.options, "偿还玩家银币借款");
    assert.ok(borrowerRepay);
    const repaidLoan = execute(executor, "go.bank.choose", {
        option: borrowerRepay.option,
        amount: 50,
    }, otherIdentity);
    assert.equal(repaidLoan.data.result.status, "repaid");
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableSilver, 600);
    assert.equal(backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableSilver, 100);

    const farmCareerView = execute(executor, "go.farm.commission", {});
    assert.equal(farmCareerView.ok, true);
    assert.equal(farmCareerView.data.chef.recipes[0].author.kind, "resident");
    const recipeBuyOption = optionWithLabel(farmCareerView.data.options, "购买原创菜谱");
    assert.ok(recipeBuyOption);
    const boughtRecipe = execute(executor, "go.farm.commission", { option: recipeBuyOption.option });
    assert.equal(boughtRecipe.ok, true);
    assert.equal(boughtRecipe.data.result.recipeId, "doorbell-chef-recipe");
    assert.equal(boughtRecipe.data.result.author.kind, "resident");
    assert.equal("authorResidentId" in boughtRecipe.data.result, false);

    const chefOwnerView = execute(executor, "go.farm.commission", {}, otherIdentity);
    const storeOpenOption = optionWithLabel(chefOwnerView.data.options, "开设料理店");
    assert.ok(storeOpenOption);
    const openedStore = execute(executor, "go.farm.commission", { option: storeOpenOption.option }, otherIdentity);
    assert.equal(openedStore.ok, true);
    assert.equal(openedStore.data.result.state, "active");
    assert.equal("ownerResidentId" in openedStore.data.result, false);
    const buyerStoreView = execute(executor, "go.farm.commission", {});
    const storeBuyOption = optionWithLabel(buyerStoreView.data.options, "购买料理店商品");
    assert.ok(storeBuyOption);
    assert.match(storeBuyOption.option, OPTION_HANDLE_RE);
    const storeOrder = execute(executor, "go.farm.commission", {
        option: storeBuyOption.option,
        amount: 1,
    });
    assert.equal(storeOrder.ok, true);
    assert.equal(getFarm(FARM_ID).ranch.kitchen.ingredients.spice, 1);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().demandGold, 1_000);
    const firstOrderAccount = backend.forResident(RESIDENT_ID).getOwnAccount();
    assert.deepEqual(execute(executor, "go.farm.commission", {
        option: storeBuyOption.option,
        amount: 1,
    }).data.result, storeOrder.data.result);
    assert.equal(getFarm(FARM_ID).ranch.kitchen.ingredients.spice, 1);
    assert.deepEqual(backend.forResident(RESIDENT_ID).getOwnAccount(), firstOrderAccount);
    const secondStoreBuyOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}).data.options,
        "购买料理店商品",
    );
    assert.ok(secondStoreBuyOption);
    assert.notEqual(secondStoreBuyOption.option, storeBuyOption.option);
    const beforeSecondOrder = backend.forResident(RESIDENT_ID).getOwnAccount().availableSilver;
    const secondStoreOrder = execute(executor, "go.farm.commission", {
        option: secondStoreBuyOption.option,
        amount: 1,
    });
    assert.equal(secondStoreOrder.ok, true);
    assert.notEqual(secondStoreOrder.data.result.orderId, storeOrder.data.result.orderId);
    assert.equal(getFarm(FARM_ID).ranch.kitchen.ingredients.spice, 2);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableSilver, beforeSecondOrder - 10);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chef_store_orders").get().count, 2);

    actionNow = openedStore.data.result.nextRentDueAt;
    const firstRentOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}, otherIdentity).data.options,
        "支付料理店租金",
    );
    assert.ok(firstRentOption);
    assert.match(firstRentOption.option, OPTION_HANDLE_RE);
    const beforeFirstRent = backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableGold;
    const firstRent = execute(executor, "go.farm.commission", { option: firstRentOption.option }, otherIdentity);
    assert.equal(firstRent.ok, true);
    assert.equal(backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableGold, beforeFirstRent - 100_000);
    const afterFirstRent = backend.forResident(OTHER_RESIDENT_ID).getOwnAccount();
    assert.deepEqual(
        execute(executor, "go.farm.commission", { option: firstRentOption.option }, otherIdentity).data.result,
        firstRent.data.result,
    );
    assert.deepEqual(backend.forResident(OTHER_RESIDENT_ID).getOwnAccount(), afterFirstRent);
    actionNow = firstRent.data.result.nextRentDueAt;
    const secondRentOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}, otherIdentity).data.options,
        "支付料理店租金",
    );
    assert.ok(secondRentOption);
    assert.notEqual(secondRentOption.option, firstRentOption.option);
    const beforeSecondRent = backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableGold;
    const secondRent = execute(executor, "go.farm.commission", { option: secondRentOption.option }, otherIdentity);
    assert.equal(secondRent.ok, true);
    assert.equal(backend.forResident(OTHER_RESIDENT_ID).getOwnAccount().availableGold, beforeSecondRent - 100_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chef_store_rent_payments").get().count, 2);
    actionNow = NOW;

    const beforeFailedCommands = database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count;
    const latestBank = execute(executor, "go.bank.view", {});
    const latestDepositOption = optionWithLabel(latestBank.data.options, "存入金币活期");
    const insufficient = execute(executor, "go.bank.choose", {
        option: latestDepositOption.option,
        amount: 9_999_999,
    });
    assert.deepEqual(insufficient, {
        ok: false,
        error: {
            code: "INSUFFICIENT_FUNDS",
            message: "可用余额不足，本次操作没有执行。",
        },
    });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count, beforeFailedCommands);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold, 1_999_000);

    const schoolBefore = execute(executor, "go.school.view", {});
    assert.equal(schoolBefore.ok, true);
    assert.deepEqual(schoolBefore.data.courses, []);
    assert.deepEqual(schoolBefore.data.exams, []);
    assert.deepEqual(schoolBefore.data.contentSources, {
        courseCatalogAvailable: true,
        courseContentAvailable: true,
        examQuestionBankAvailable: true,
    });
    assert.equal(Object.hasOwn(schoolBefore.data, "courseCatalog"), false);
    assert.equal(schoolBefore.data.options.some((entry) =>
        entry.label === "选择职业：记者"), true);
    const courseSection = execute(executor, "go.school.view", { section: "courses" });
    assert.equal(courseSection.ok, true);
    assert.deepEqual(courseSection.data.value.progress, []);
    assert.deepEqual(courseSection.data.value.catalog, []);
    const agronomistOption = optionWithLabel(schoolBefore.data.options, "选择职业：农艺师");
    assert.ok(agronomistOption);
    const selectedCareer = execute(executor, "go.school.choose", { option: agronomistOption.option });
    assert.equal(selectedCareer.ok, true);
    assert.deepEqual(selectedCareer.data.result, { career: "agronomist", trackOrder: 1 });
    assert.equal(Object.hasOwn(selectedCareer.data.current, "courseCatalog"), false);
    assert.ok(selectedCareer.data.current.options.some((entry) => entry.label === "报名课程：农艺师"));
    const selectedCourseSection = execute(executor, "go.school.view", { section: "courses" });
    assert.equal(selectedCourseSection.data.value.catalog.length, 12);
    assert.equal(selectedCourseSection.data.value.catalog.every((entry) => entry.career === "agronomist"), true);
    const otherSchool = execute(executor, "go.school.view", {}, otherIdentity);
    const otherSecondCareer = optionWithLabel(otherSchool.data.options, "选择职业：记者");
    assert.ok(otherSecondCareer);
    assert.equal(execute(executor, "go.school.choose", { option: otherSecondCareer.option }, otherIdentity).ok, true);
    const twoCareerCourseSection = execute(executor, "go.school.view", { section: "courses" }, otherIdentity);
    assert.equal(twoCareerCourseSection.data.value.catalog.length, 24);
    assert.deepEqual(new Set(twoCareerCourseSection.data.value.catalog.map((entry) => entry.career)),
        new Set(["chef", "reporter"]));
    const restartedExecutor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => actionNow,
    });
    assert.deepEqual(execute(restartedExecutor, "go.school.choose", { option: agronomistOption.option }), selectedCareer);
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM lingye_school_action_receipts WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);
    const staleChefOption = optionWithLabel(schoolBefore.data.options, "选择职业：料理师");
    assert.ok(staleChefOption);
    assert.equal(execute(executor, "go.school.choose", { option: staleChefOption.option }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM lingye_school_action_receipts WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM career_tracks WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);

    for (const courseIndex of [1, 2, 3]) {
        const beforeEnroll = execute(executor, "go.school.view", {});
        const enrollOption = optionWithLabel(beforeEnroll.data.options, "报名课程：农艺师");
        assert.ok(enrollOption);
        const goldBeforeEnroll = backend.forResident(RESIDENT_ID).getOwnAccount().availableGold;
        const enrolled = execute(executor, "go.school.choose", { option: enrollOption.option });
        assert.equal(enrolled.ok, true);
        assert.equal(enrolled.data.currentCourses.length, 1);
        assert.equal(enrolled.data.currentCourses[0].stage, "awaiting_read_confirmation");
        assert.equal(enrolled.data.currentCourses[0].content.practiceQuestions.length, 5);
        assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold,
            goldBeforeEnroll - 30_000);
        assert.deepEqual(execute(restartedExecutor, "go.school.choose", { option: enrollOption.option }), enrolled);
        assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold,
            goldBeforeEnroll - 30_000);
        if (courseIndex === 1) {
            database.prepare(`UPDATE career_courses
              SET content_delivery_id = NULL, content_delivered_at = NULL
              WHERE resident_id = ? AND career = 'agronomist'
                AND qualification_level = 1 AND course_index = 1`).run(RESIDENT_ID);
            const commandsBeforeResume = database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count;
            const resumedPaidCourse = execute(restartedExecutor, "go.school.view", {});
            assert.equal(resumedPaidCourse.data.currentCourses[0].stage, "awaiting_read_confirmation");
            assert.deepEqual(resumedPaidCourse.data.currentCourses[0].content.practiceQuestions,
                enrolled.data.currentCourses[0].content.practiceQuestions);
            assert.ok(optionWithLabel(resumedPaidCourse.data.options, "确认已阅读课程：农艺师"));
            assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count,
                commandsBeforeResume);
            assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold,
                goldBeforeEnroll - 30_000);
        }
        const reference = `agronomist:1:${courseIndex}`;
        const courseView = execute(executor, "go.school.view", { reference });
        assert.equal(courseView.ok, true);
        assert.equal(Object.hasOwn(courseView.data, "courseCatalog"), false);
        assert.equal(courseView.data.reference.content.practiceQuestions.length, 5);
        assert.deepEqual(Object.keys(courseView.data.reference.content.practiceQuestions[0]).sort(), [
            "id",
            "options",
            "stem",
        ]);
        const readOption = optionWithLabel(courseView.data.options, "确认已阅读课程：农艺师");
        assert.ok(readOption);
        const read = execute(executor, "go.school.choose", { option: readOption.option });
        assert.equal(read.ok, true);
        assert.equal(read.data.currentCourses[0].stage, "awaiting_practice");
        assert.equal(read.data.currentCourses[0].content.practiceQuestions.length, 5);
        const resumedAfterRead = execute(restartedExecutor, "go.school.view", {});
        assert.equal(resumedAfterRead.data.currentCourses[0].stage, "awaiting_practice");
        assert.equal(resumedAfterRead.data.currentCourses[0].content.practiceQuestions.length, 5);
        let practiceOption = optionWithLabel(read.data.current.options, "提交课程练习：农艺师");
        assert.deepEqual(practiceOption.requires, ["answers"]);
        if (courseIndex === 1) {
            const failedPractice = execute(executor, "go.school.choose", {
                option: practiceOption.option,
                answers: [["A"], ["A"], ["A"], ["A"], ["A"]],
            });
            assert.deepEqual({
                bestCorrectAnswers: failedPractice.data.result.bestCorrectAnswers,
                correctAnswers: failedPractice.data.result.correctAnswers,
                passed: failedPractice.data.result.passed,
            }, {
                bestCorrectAnswers: 1,
                correctAnswers: 1,
                passed: false,
            });
            assert.equal(failedPractice.data.result.review.length, 5);
            assert.equal(failedPractice.data.currentCourses[0].stage, "awaiting_practice");
            assert.equal(failedPractice.data.currentCourses[0].content.practiceQuestions.length, 5);
            practiceOption = optionWithLabel(failedPractice.data.current.options, "提交课程练习：农艺师");
        }
        const answerData = JSON.parse(database.prepare(`SELECT answer_key_json
          FROM career_assessment_papers WHERE target_key = ?`)
            .get(`course:${RESIDENT_ID}:agronomist:1:${courseIndex}`).answer_key_json);
        const passedPractice = execute(executor, "go.school.choose", {
            option: practiceOption.option,
            answers: answerSelections(answerData.answers ?? answerData),
        });
        assert.equal(passedPractice.data.result.correctAnswers, 5);
        assert.equal(passedPractice.data.result.passed, true);
    }

    const examRegistrationView = execute(executor, "go.school.view", {});
    const registerExamOption = optionWithLabel(examRegistrationView.data.options, "报名资格考试：农艺师");
    assert.ok(registerExamOption);
    const firstRegistration = execute(executor, "go.school.choose", { option: registerExamOption.option });
    assert.equal(firstRegistration.ok, true);
    database.prepare("UPDATE career_exam_attempts SET registration_status = 'postponed' WHERE attempt_id = ?")
        .run(firstRegistration.data.result.attemptId);
    const terminalInterviewView = execute(executor, "go.school.view", {});
    assert.ok(terminalInterviewView.data.options.some((entry) =>
        entry.label === "报名资格考试：农艺师"));
    database.prepare("UPDATE career_exam_attempts SET registration_status = 'registered' WHERE attempt_id = ?")
        .run(firstRegistration.data.result.attemptId);
    const staleReleaseOption = optionWithLabel(firstRegistration.data.current.options, "取消尚未开始的考试报名");
    assert.ok(staleReleaseOption);
    actionNow = firstRegistration.data.result.scheduledAt + 2 * 60 * 60 * 1_000;
    const missedView = execute(executor, "go.school.view", {});
    assert.equal(missedView.data.exams.find((exam) =>
        exam.attemptId === firstRegistration.data.result.attemptId).registrationStatus, "expired");
    assert.equal(missedView.data.options.some((entry) =>
        entry.option === staleReleaseOption.option), false);
    assert.deepEqual({ ...database.prepare(`SELECT registration_status, settlement_receipt_id,
             release_receipt_id, ended_at, missed_session_at
        FROM career_exam_attempts WHERE attempt_id = ?`)
        .get(firstRegistration.data.result.attemptId) }, {
        registration_status: "failed",
        settlement_receipt_id: database.prepare(`SELECT settle_journal_id
          FROM economy_system_gold_reservations WHERE reservation_id = ?`)
            .get(firstRegistration.data.result.reservationId).settle_journal_id,
        release_receipt_id: null,
        ended_at: actionNow,
        missed_session_at: actionNow,
    });
    assert.equal(database.prepare(`SELECT state FROM economy_system_gold_reservations
      WHERE reservation_id = ?`).get(firstRegistration.data.result.reservationId).state, "settled");
    const reRegisterOption = optionWithLabel(missedView.data.options, "报名资格考试：农艺师");
    assert.ok(reRegisterOption);
    const registeredExam = execute(executor, "go.school.choose", { option: reRegisterOption.option });
    assert.equal(registeredExam.ok, true);
    assert.equal(registeredExam.data.result.feeGold, 60_000);
    actionNow = registeredExam.data.result.scheduledAt;
    const examSessionView = execute(executor, "go.school.view", {});
    const startExamOption = optionWithLabel(examSessionView.data.options, "开始资格考试");
    assert.ok(startExamOption);
    const startedExam = execute(executor, "go.school.choose", { option: startExamOption.option });
    assert.equal(startedExam.data.result.questions.length, 20);
    assert.deepEqual(Object.keys(startedExam.data.result.questions[0]).sort(), ["id", "options", "stem"]);
    const submitExamOption = optionWithLabel(startedExam.data.current.options, "提交整份资格考试答案");
    assert.deepEqual(submitExamOption.requires, ["answers"]);
    const examAnswerData = JSON.parse(database.prepare(`SELECT answer_key_json
      FROM career_assessment_papers WHERE exam_attempt_id = ?`)
        .get(registeredExam.data.result.attemptId).answer_key_json);
    const passedExam = execute(executor, "go.school.choose", {
        option: submitExamOption.option,
        answers: answerSelections(examAnswerData.answers ?? examAnswerData),
    });
    assert.deepEqual(passedExam.data.result, {
        status: "passed",
        correctAnswers: 20,
        passed: true,
    });
    assert.deepEqual({ ...database.prepare(`SELECT qualification_level, status
      FROM career_certificates WHERE resident_id = ? AND career = 'agronomist'`)
        .get(RESIDENT_ID) }, { qualification_level: 1, status: "active" });

    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'veterinarian', 2, ?)
    `).run(RESIDENT_ID, NOW);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'veterinarian', 1, 'active', ?, ?, ?)
    `).run(RESIDENT_ID, "fixture-veterinarian-certificate", NOW, NOW);
    const firstHireOption = optionWithLabel(execute(executor, "go.school.view", {}).data.options, "申请正式受聘：动物医生");
    assert.ok(firstHireOption);
    const firstHire = execute(executor, "go.school.choose", { option: firstHireOption.option });
    assert.equal(firstHire.ok, true);
    const firstEmploymentId = firstHire.data.result.employmentId;
    const endOption = optionWithLabel(execute(executor, "go.school.view", {}).data.options, "结束任职");
    assert.ok(endOption);
    assert.equal(execute(executor, "go.school.choose", { option: endOption.option }).ok, true);
    const secondHireOption = optionWithLabel(execute(executor, "go.school.view", {}).data.options, "申请正式受聘：动物医生");
    assert.ok(secondHireOption);
    assert.notEqual(secondHireOption.option, firstHireOption.option);
    const secondHire = execute(executor, "go.school.choose", { option: secondHireOption.option });
    assert.equal(secondHire.ok, true);
    assert.notEqual(secondHire.data.result.employmentId, firstEmploymentId);
    assert.deepEqual(database.prepare(`
      SELECT employment_id, status FROM career_employments
      WHERE resident_id = ? ORDER BY hired_at, employment_id
    `).all(RESIDENT_ID).map((row) => ({ ...row })), [
        { employment_id: firstEmploymentId, status: "ended" },
        { employment_id: secondHire.data.result.employmentId, status: "active" },
    ]);

    backend.trustedSystemCommands.createJob({
        jobId: "real-farm-job-1",
        career: "agronomist",
        sourceType: "farm_plot_condition",
        sourceId: "real-plot-condition-1",
        objectType: "farm_plot",
        objectId: `${FARM_ID}:plot:1`,
        ownerResidentId: OTHER_RESIDENT_ID,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    database.prepare(`
      INSERT INTO career_commission_payments (job_id, trade_id, silver_amount, created_at)
      VALUES ('real-farm-job-1', NULL, 10, ?)
    `).run(NOW);
    database.prepare(`
      INSERT OR IGNORE INTO career_commission_source_facts (source_id, source_type, fact_json, recorded_at)
      VALUES ('real-plot-condition-1', 'farm_plot_condition', ?, ?)
    `).run(JSON.stringify({ farmDoorplate: FARM_ID, plotId: 1, condition: "drought", status: "open" }), NOW);
    const farmCommissions = execute(executor, "go.farm.commission", {});
    assert.equal(farmCommissions.ok, true);
    assert.equal(farmCommissions.data.jobs.length, 1);
    assert.equal(farmCommissions.data.jobs[0].sourceId, "real-plot-condition-1");
    assert.equal(farmCommissions.data.options.some((entry) =>
        entry.label === "接取委托"), true);
    const acceptFarmJob = optionWithLabel(farmCommissions.data.options, "接取委托");
    const accepted = execute(executor, "go.farm.commission", {
        option: acceptFarmJob.option,
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.data.result.status, "accepted");
    assert.equal(accepted.data.result.workerResidentId, RESIDENT_ID);
    const workerReplyOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}).data.options,
        "回复委托消息",
    );
    assert.deepEqual(workerReplyOption.requires, ["text"]);
    const workerReply = execute(executor, "go.farm.commission", {
        option: workerReplyOption.option,
        text: "我先检查一下地块。",
    });
    assert.equal(workerReply.data.message.sender, "self");
    assert.equal(workerReply.data.message.recipient, "counterparty");
    assert.deepEqual(workerReply.notifications, [
        {
            notification_id: `commission-reply:${workerReply.data.message.messageId}:${OTHER_RESIDENT_ID}`,
            kind: "commission_reply",
            recipient_resident_id: OTHER_RESIDENT_ID,
            message_text: "我先检查一下地块。",
        },
    ]);
    const ownerReplyView = execute(executor, "go.farm.commission", { reference: "real-farm-job-1" }, otherIdentity);
    assert.equal(ownerReplyView.data.jobs[0].messages[0].sender, "counterparty");
    assert.equal(ownerReplyView.data.jobs[0].messages[0].body, "我先检查一下地块。");
    const residentFacade = backend.forResident(RESIDENT_ID);
    assert.deepEqual(residentFacade.recordOwnJobDecision({
        changesWorld: false,
        consumesResources: false,
        idempotencyKey: "resident-facade-check",
        jobId: "real-farm-job-1",
        kind: "check",
        optionReference: "inspect",
        resultReference: "inspection-complete",
        workerResidentId: OTHER_RESIDENT_ID,
    }), { sequence: 1, status: "active" });
    const transferred = residentFacade.transferOwnJob({
        jobId: "real-farm-job-1",
        successorJobId: "resident-facade-successor",
        successorSourceId: "real-plot-condition-1",
        workerResidentId: OTHER_RESIDENT_ID,
    });
    assert.equal(transferred.transferred.workerResidentId, RESIDENT_ID);
    assert.equal(transferred.transferred.status, "transferred");

    const otherPublishView = execute(executor, "go.farm.commission", {}, otherIdentity);
    assert.equal(otherPublishView.ok, true, JSON.stringify(otherPublishView));
    const otherPublishOption = optionWithLabel(otherPublishView.data.options, "发布真实委托");
    assert.ok(otherPublishOption);
    const otherPublished = execute(executor, "go.farm.commission", {
        option: otherPublishOption.option,
        amount: 10,
    }, otherIdentity);
    const otherJobId = otherPublished.data.result.jobId;
    const acceptOtherOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}).data.options,
        "接取委托",
    );
    assert.ok(acceptOtherOption);
    assert.equal(execute(executor, "go.farm.commission", { option: acceptOtherOption.option }).ok, true);
    const otherCheckOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}).data.options,
        "执行检查",
    );
    assert.ok(otherCheckOption);
    assert.equal(execute(executor, "go.farm.commission", { option: otherCheckOption.option }).ok, true);
    const transferOtherOption = optionWithLabel(
        execute(executor, "go.farm.commission", {}).data.options,
        "转交委托",
    );
    assert.ok(transferOtherOption);
    const otherTransferred = execute(executor, "go.farm.commission", { option: transferOtherOption.option });
    const successorJobId = otherTransferred.data.successor.jobId;
    const npcTransferView = execute(executor, "go.farm.commission", {}, otherIdentity);
    const npcTransferOption = optionWithLabel(npcTransferView.data.options, "把委托转交给机构 NPC");
    assert.ok(npcTransferOption);
    const npcCompleted = execute(executor, "go.farm.commission", {
        option: npcTransferOption.option,
    }, otherIdentity);
    assert.equal(npcCompleted.ok, true, JSON.stringify(npcCompleted));
    assert.equal(npcCompleted.data.result.serviceActor, "system");
    assert.equal(npcCompleted.notifications[0].kind, "commission_completed");
    assert.equal(npcCompleted.notifications[0].recipient_resident_id, OTHER_RESIDENT_ID);
    backend.trustedSystemCommands.createJob({
        jobId: "resident-facade-job",
        career: "agronomist",
        sourceType: "farm_plot_condition",
        sourceId: "resident-facade-source",
        objectType: "farm_plot",
        objectId: `${FARM_ID}:plot:facade`,
        ownerResidentId: OTHER_RESIDENT_ID,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    assert.equal(residentFacade.acceptOwnJob("resident-facade-job").workerResidentId, RESIDENT_ID);

    const noHospitalSource = execute(executor, "go.hospital.commission", {});
    assert.deepEqual(noHospitalSource.data.jobs, []);
    assert.deepEqual(noHospitalSource.data.options, []);

    const notMigrated = execute(executor, "go.bank.view", {}, {
        residentId: OTHER_RESIDENT_ID,
        bindingReference: "missing-migration",
    });
    assert.equal(notMigrated.ok, false);
    assert.equal(notMigrated.error.code, "LINGYE_NOT_READY");
});
