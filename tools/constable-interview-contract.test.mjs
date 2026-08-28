import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, test } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "aifarm-constable-contract-"));
process.env.AIFARM_DATA_DIR = dataDir;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "constable-contract-service-token";

const { makeFarm } = await import("../dist/game.js");
const { insertFarm } = await import("../dist/store.js");
const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { createDoorbellInternalHandler } = await import("../dist/server/doorbell/router.js");
const { loadConstableInterviewBank } = await import("../dist/career/constable-interview-bank.js");
const { beijingTimestamp, recordFinancialReceipt } = await import("../dist/career/persistence.js");

const SERVICE_TOKEN = "constable-contract-service-token";
const FARM_HUMAN_KEY = "contract-farm-human-key";
const CANDIDATE = "constable-candidate";
const EXAMINERS = ["examiner-one", "examiner-two", "examiner-three", "examiner-four"];
const UNMIGRATED_EXAMINER = "examiner-without-lingye-row";
const VOTER = "notice-voter";
const BANK = Object.freeze({
    getConstableInterviewPaper: ({ interviewId, candidateResidentId, scheduledAt }) => ({
        bankVersion: "private-constable-bank-test-v1",
        paper: {
            interviewId,
            candidateResidentId,
            scheduledAt,
            questionIds: ["private-question-1"],
        },
        factMaterial: { sourceIds: ["private-fact-1"] },
        scoringStandard: {
            version: "private-constable-rubric-test-v1",
            dimensions: ["facts", "restraint", "procedure", "explanation"],
            minimumDimensionAverage: 3,
            minimumTotalAverage: 16,
        },
    }),
});
let fixtureSequence = 0;

function responseCapture() {
    let resolveResponse;
    const promise = new Promise((resolve) => { resolveResponse = resolve; });
    const response = {
        status: null,
        headers: null,
        body: null,
        writeHead(status, headers) {
            this.status = status;
            this.headers = headers;
        },
        end(payload) {
            this.body = payload === undefined || payload === "" ? null : JSON.parse(String(payload));
            resolveResponse(this);
        },
    };
    return { response, promise };
}

async function callRoute(handler, parts, body, { token = SERVICE_TOKEN, method = "POST" } = {}) {
    const req = Readable.from([Buffer.from(body === undefined ? "" : JSON.stringify(body))]);
    req.headers = token === null ? {} : { authorization: `Bearer ${token}` };
    const { response, promise } = responseCapture();
    await handler(req, response, parts, method);
    return promise;
}

function assertIso(value) {
    assert.equal(typeof value, "string");
    assert.equal(new Date(value).toISOString(), value);
}

function createFixture() {
    const database = openLingyeWorldDatabase(":memory:");
    let now = beijingTimestamp("2026-08-29", 14);
    const backend = createLingyeWorldBackend(database, {
        economyRules: {
            minimumSystemLoanCreditDays: null,
            restrictedDailyGoldLimit: null,
            restrictedDailySilverLimit: null,
        },
        now: () => now,
        generateId: (() => {
            let sequence = 0;
            return () => `contract-generated-${++sequence}`;
        })(),
        constableInterviewBank: BANK,
    });
    const residents = [CANDIDATE, ...EXAMINERS, VOTER];
    for (const residentId of residents) {
        registerLingyeResidentReference(database, {
            residentId,
            bindingReference: `binding-${residentId}`,
            registeredAt: now,
        });
        backend.trustedSystemCommands.importLegacyBalances({
            residentId,
            gold: 100_000,
            silver: 100,
            migrationId: `contract-migration-${residentId}`,
            idempotencyKey: `contract-import-${residentId}`,
        });
    }
    database.prepare(`INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'constable', 1, ?)`).run(CANDIDATE, now);
    const reservation = backend.trustedSystemCommands.reserveSystemGold({
        residentId: CANDIDATE,
        amount: 40_000,
        actor: "human",
        businessReference: "career-exam:contract-attempt:reserve",
        idempotencyKey: "contract-reserve",
    });
    recordFinancialReceipt(database, reservation.financialReceipt, {
        amount: 40_000,
        businessReference: "career-exam:contract-attempt:reserve",
        currency: "gold",
        kind: "system_gold_reserve",
        residentId: CANDIDATE,
    }, now);
    database.prepare(`INSERT INTO career_exam_attempts (
      attempt_id, resident_id, career, qualification_level, scheduled_at,
      registration_status, reservation_receipt_id, registered_at, ended_at
    ) VALUES (?, ?, 'constable', 1, ?, 'written_passed', ?, ?, ?)`)
        .run("contract-attempt", CANDIDATE, now - 1, reservation.financialReceipt.receiptId, now, now - 1);
    const interviewId = backend.trustedSystemCommands.scheduleConstableInterview(
        "contract-attempt",
        beijingTimestamp("2026-08-29", 20),
    );
    const farmDoorplate = fixtureSequence++ === 0 ? "ABC234" : "DEF345";
    const farmHumanKey = `${FARM_HUMAN_KEY}-${farmDoorplate}`;
    const farm = makeFarm("Contract farm", 19);
    farm.id = farmDoorplate;
    farm.humanKey = farmHumanKey;
    delete farm.doorbellMcpMigration;
    insertFarm(farm);
    const handler = createDoorbellInternalHandler(
        () => undefined,
        undefined,
        undefined,
        { database, backend, now: () => now },
    );
    return {
        database,
        backend,
        handler,
        interviewId,
        farmDoorplate,
        farmHumanKey,
        get now() { return now; },
        setNow(value) { now = value; },
    };
}

test("human constable interview routes derive the actor contract and expose material only to selected examiners", async () => {
    const fixture = createFixture();
    try {
        const base = {
            farm_human_key: fixture.farmHumanKey,
            expected_farm_doorplate: fixture.farmDoorplate,
            account_id: "examiner-account-1",
            resident_id: EXAMINERS[0],
        };
        const readParts = ["internal", "doorbell", "human", "constable", "interview", "read"];
        const actionParts = ["internal", "doorbell", "human", "constable", "interview", "action"];
        const read = await callRoute(fixture.handler, readParts, base);
        assert.equal(read.status, 200);
        assertIso(read.body.server_time);
        assert.deepEqual(read.body.subject, {
            farm_doorplate: fixture.farmDoorplate,
            account_id: "examiner-account-1",
            resident_id: EXAMINERS[0],
        });
        const candidateScene = read.body.data.interviews.find((item) => item.interview_id === fixture.interviewId);
        assert.equal(candidateScene.self.signup_eligible, true);
        assert.equal(candidateScene.interview_material, null);
        assertIso(candidateScene.scheduled_at);

        const noMigrationRead = await callRoute(fixture.handler, readParts, {
            ...base,
            interview_id: fixture.interviewId,
        });
        assert.equal(noMigrationRead.status, 200);

        const missingServiceAuth = await callRoute(fixture.handler, readParts, base, { token: "wrong" });
        assert.equal(missingServiceAuth.status, 401);
        assert.equal(missingServiceAuth.body.error.code, "authentication_required");
        const wrongFarm = await callRoute(fixture.handler, readParts, {
            ...base,
            expected_farm_doorplate: "ABC235",
        });
        assert.equal(wrongFarm.status, 409);
        assert.equal(wrongFarm.body.error.code, "farm_doorplate_mismatch");

        const signup = await callRoute(fixture.handler, actionParts, {
            ...base,
            action: "signup",
            interview_id: fixture.interviewId,
        });
        assert.equal(signup.status, 200);
        assert.equal(signup.body.data.interviews[0].self.signed_up, true);
        assert.deepEqual({ ...fixture.database.prepare(`
          SELECT examiner_account_id, examiner_resident_id
          FROM career_constable_examiner_signups WHERE interview_id = ?
        `).get(fixture.interviewId) }, {
            examiner_account_id: "examiner-account-1",
            examiner_resident_id: EXAMINERS[0],
        });

        const unregisteredSignup = await callRoute(fixture.handler, actionParts, {
            ...base,
            account_id: "examiner-account-unmigrated",
            resident_id: UNMIGRATED_EXAMINER,
            action: "signup",
            interview_id: fixture.interviewId,
        });
        assert.equal(unregisteredSignup.status, 200);
        assert.equal(fixture.database.prepare("SELECT 1 FROM residents WHERE resident_id = ?")
            .get(UNMIGRATED_EXAMINER), undefined);
        const mismatchedRead = await callRoute(fixture.handler, readParts, {
            ...base,
            resident_id: EXAMINERS[1],
        });
        assert.equal(mismatchedRead.status, 409);
        assert.equal(mismatchedRead.body.error.code, "examiner_account_identity_conflict");
        const mismatchedAccount = await callRoute(fixture.handler, actionParts, {
            ...base,
            account_id: "examiner-account-2",
            action: "signup",
            interview_id: fixture.interviewId,
        });
        assert.equal(mismatchedAccount.status, 409);
        assert.equal(mismatchedAccount.body.error.code, "examiner_account_identity_conflict");

        const forgedIdentity = await callRoute(fixture.handler, actionParts, {
            ...base,
            action: "signup",
            interview_id: fixture.interviewId,
            examiner_resident_id: EXAMINERS[1],
        });
        assert.equal(forgedIdentity.status, 400);
        const mismatchedResident = await callRoute(fixture.handler, actionParts, {
            ...base,
            resident_id: EXAMINERS[1],
            action: "signup",
            interview_id: fixture.interviewId,
        });
        assert.equal(mismatchedResident.status, 409);
        assert.equal(mismatchedResident.body.error.code, "examiner_account_identity_conflict");

        for (let index = 1; index < EXAMINERS.length; index += 1) {
            fixture.backend.trustedSystemCommands.signupConstableExaminer({
                interviewId: fixture.interviewId,
                examinerAccountId: `examiner-account-${index + 1}`,
                examinerResidentId: EXAMINERS[index],
                eligibilityReference: `main-qq-eligibility-${EXAMINERS[index]}`,
            });
        }
        fixture.setNow(beijingTimestamp("2026-08-29", 19, 30));
        for (let index = 0; index < EXAMINERS.length - 0; index += 1) {
            fixture.backend.trustedSystemCommands.confirmConstableExaminerAttendance({
                interviewId: fixture.interviewId,
                examinerAccountId: `examiner-account-${index + 1}`,
                examinerResidentId: EXAMINERS[index],
                eligibilityReference: `main-qq-confirm-${EXAMINERS[index]}`,
            });
        }
        fixture.backend.trustedSystemCommands.confirmConstableExaminerAttendance({
            interviewId: fixture.interviewId,
            examinerAccountId: "examiner-account-unmigrated",
            examinerResidentId: UNMIGRATED_EXAMINER,
            eligibilityReference: "main-qq-confirm-unmigrated",
        });
        fixture.setNow(beijingTimestamp("2026-08-29", 20));
        assert.deepEqual(fixture.backend.trustedSystemCommands.advanceConstableInterviews(fixture.now), [
            { interviewId: fixture.interviewId, result: "panel_ready" },
        ]);

        const selectedRead = await callRoute(fixture.handler, readParts, {
            ...base,
            interview_id: fixture.interviewId,
        });
        assert.equal(selectedRead.status, 200);
        const selectedScene = selectedRead.body.data.interviews[0];
        assert.equal(selectedScene.self.selected, true);
        assert.deepEqual(selectedScene.interview_material.scoring_standard.dimensions, [
            "facts", "restraint", "procedure", "explanation",
        ]);
        assert.equal(selectedScene.self.attendance_confirmed, true);
        assert.equal(selectedScene.interview_material.paper.questionIds[0], "private-question-1");

        const unselectedRead = await callRoute(fixture.handler, readParts, {
            ...base,
            account_id: "examiner-account-4",
            resident_id: EXAMINERS[3],
            interview_id: fixture.interviewId,
        });
        assert.equal(unselectedRead.status, 200);
        assert.equal(unselectedRead.body.data.interviews[0].self.selected, false);
        assert.equal(unselectedRead.body.data.interviews[0].interview_material, null);

        const candidateRead = await callRoute(fixture.handler, readParts, {
            ...base,
            account_id: "candidate-account",
            resident_id: CANDIDATE,
            interview_id: fixture.interviewId,
        });
        assert.equal(candidateRead.status, 200);
        assert.equal(candidateRead.body.data.interviews[0].self.signup_eligible, false);
        assert.equal(candidateRead.body.data.interviews[0].interview_material, null);

        const score = await callRoute(fixture.handler, actionParts, {
            ...base,
            action: "score",
            interview_id: fixture.interviewId,
            facts: 4,
            restraint: 4,
            procedure: 4,
            explanation: 4,
        });
        assert.equal(score.status, 200);
        assert.equal(score.body.data.interviews[0].self.score_submitted, true);
        const unselectedScore = await callRoute(fixture.handler, actionParts, {
            ...base,
            account_id: "examiner-account-4",
            resident_id: EXAMINERS[3],
            action: "score",
            interview_id: fixture.interviewId,
            facts: 4,
            restraint: 4,
            procedure: 4,
            explanation: 4,
        });
        assert.equal(unselectedScore.status, 409);
        assert.equal(unselectedScore.body.error.code, "examiner_not_selected");
    }
    finally {
        fixture.database.close();
    }
});

test("go.school exposes anonymous notice options and injects the authenticated resident into the vote", async () => {
    const fixture = createFixture();
    try {
        for (let index = 0; index < 3; index += 1) {
            fixture.backend.trustedSystemCommands.signupConstableExaminer({
                interviewId: fixture.interviewId,
                examinerAccountId: `examiner-account-${index + 1}`,
                examinerResidentId: EXAMINERS[index],
                eligibilityReference: `main-qq-eligibility-${EXAMINERS[index]}`,
            });
        }
        fixture.setNow(beijingTimestamp("2026-08-29", 19, 30));
        for (let index = 0; index < 3; index += 1) {
            fixture.backend.trustedSystemCommands.confirmConstableExaminerAttendance({
                interviewId: fixture.interviewId,
                examinerAccountId: `examiner-account-${index + 1}`,
                examinerResidentId: EXAMINERS[index],
                eligibilityReference: `main-qq-confirm-${EXAMINERS[index]}`,
            });
        }
        fixture.setNow(beijingTimestamp("2026-08-29", 20));
        fixture.backend.trustedSystemCommands.advanceConstableInterviews(fixture.now);
        for (let index = 0; index < 3; index += 1) {
            fixture.backend.trustedSystemCommands.submitConstableInterviewScore({
                interviewId: fixture.interviewId,
                examinerAccountId: `examiner-account-${index + 1}`,
                examinerResidentId: EXAMINERS[index],
                facts: 4,
                restraint: 4,
                procedure: 4,
                explanation: 4,
            });
        }
        const open = await callRoute(
            fixture.handler,
            ["internal", "doorbell", "constable", "interview", "public-notice", "open"],
            {
                interview_id: fixture.interviewId,
                eligible_voter_resident_ids: [CANDIDATE, VOTER],
            },
        );
        assert.equal(open.status, 200);
        const noticeId = open.body.data.notice_id;
        assertIso(open.body.server_time);

        const executor = createLingyeActionExecutor({
            database: fixture.database,
            backend: fixture.backend,
            now: () => fixture.now,
        });
        const view = executor.execute({
            residentId: VOTER,
            bindingReference: `binding-${VOTER}`,
            op: "go.school.view",
            args: {},
        });
        const notice = view.data.publicNotices.find((item) => item.noticeId === noticeId);
        assert.ok(notice);
        assert.deepEqual(notice.options, ["no_objection", "review_request"]);
        assertIso(notice.openedAt);
        assertIso(notice.closesAt);
        const voteOption = view.data.options.find((item) => item.option.endsWith(`${noticeId}:no_objection`));
        assert.ok(voteOption);
        assert.throws(() => executor.execute({
            residentId: VOTER,
            bindingReference: `binding-${VOTER}`,
            op: "go.school.choose",
            args: { option: voteOption.option, resident_id: CANDIDATE },
        }), /args do not match this operation/);
        const vote = executor.execute({
            residentId: VOTER,
            bindingReference: `binding-${VOTER}`,
            op: "go.school.choose",
            args: { option: voteOption.option },
        });
        assert.equal(vote.ok, true);
        assert.deepEqual(fixture.database.prepare(`
          SELECT resident_id, choice FROM career_constable_notice_voters
          WHERE notice_id = ?
        `).all(noticeId).map((row) => ({ ...row })), [{ resident_id: VOTER, choice: "no_objection" }]);
    }
    finally {
        fixture.database.close();
    }
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

test("private interview bank configuration is absent-or-valid and fails startup explicitly", () => {
    const previous = process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE;
    try {
        delete process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE;
        assert.equal(loadConstableInterviewBank(), undefined);
        process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE = "/private/constable-bank-that-does-not-exist.cjs";
        assert.throws(() => loadConstableInterviewBank(), /configuration is invalid/);
    }
    finally {
        if (previous === undefined)
            delete process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE;
        else
            process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE = previous;
    }
});
