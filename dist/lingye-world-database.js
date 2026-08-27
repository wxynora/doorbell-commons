import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CareerEmploymentService } from "./career/employment-service.js";
import { CareerAuthorityAssignmentService } from "./career/authority-assignment.js";
import { CareerDomainError } from "./career/contracts.js";
import { CareerJobService } from "./career/job-service.js";
import { installCareerSchema } from "./career/schema.js";
import { CareerSchoolService } from "./career/school-service.js";
import { installEconomySchema } from "./economy/economy-schema.js";
import { EconomyError } from "./economy/economy-errors.js";
import { EconomyService } from "./economy/economy-service.js";

export const LINGYE_WORLD_SCHEMA_VERSION = 1;

const DEFAULT_DATA_DIR = process.env.AIFARM_DATA_DIR
    ? resolve(process.env.AIFARM_DATA_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../data");

export const DEFAULT_LINGYE_WORLD_DATABASE_PATH = resolve(DEFAULT_DATA_DIR, "lingye-world.sqlite");

let lingyeWorldTransactionSequence = 0;

export function runLingyeWorldTransaction(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `lingye_world_tx_${++lingyeWorldTransactionSequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
        return result;
    }
    catch (error) {
        if (nested) {
            database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        else if (database.isTransaction) {
            database.exec("ROLLBACK");
        }
        throw error;
    }
}

export function installLingyeWorldSchema(database) {
    const metadata = database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lingye_world_schema_meta'")
        .get();
    if (metadata === undefined) {
        runLingyeWorldTransaction(database, () => {
            database.exec(`
        CREATE TABLE lingye_world_schema_meta (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          schema_version INTEGER NOT NULL CHECK (schema_version = ${LINGYE_WORLD_SCHEMA_VERSION})
        );
        INSERT INTO lingye_world_schema_meta (singleton_id, schema_version)
        VALUES (1, ${LINGYE_WORLD_SCHEMA_VERSION});

        -- This is only the stable Doorbell identity reference used by the Lingye world.
        -- Human names, QQ numbers, homes and community sessions remain in Doorbell Commons.
        CREATE TABLE residents (
          resident_id TEXT PRIMARY KEY,
          binding_reference TEXT NOT NULL UNIQUE,
          registered_at INTEGER NOT NULL
        );
      `);
        });
    }
    const version = database
        .prepare("SELECT schema_version FROM lingye_world_schema_meta WHERE singleton_id = 1")
        .get();
    if (version?.schema_version !== LINGYE_WORLD_SCHEMA_VERSION)
        throw new Error(`Unsupported Lingye world schema version: ${version?.schema_version ?? "missing"}`);
    database.exec(`
      CREATE TABLE IF NOT EXISTS lingye_school_action_receipts (
        action_key TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lingye_school_action_receipts_resident
        ON lingye_school_action_receipts(resident_id, created_at, action_key);
      CREATE TABLE IF NOT EXISTS lingye_commission_action_receipts (
        action_key TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        career TEXT NOT NULL CHECK (career IN ('agronomist', 'veterinarian', 'reporter', 'constable')),
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lingye_commission_action_receipts_resident
        ON lingye_commission_action_receipts(resident_id, created_at, action_key);
      CREATE TABLE IF NOT EXISTS lingye_cross_store_operations (
        action_key TEXT PRIMARY KEY,
        operation_kind TEXT NOT NULL CHECK (operation_kind IN ('commission_check', 'commission_treatment', 'npc_service')),
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        career TEXT NOT NULL CHECK (career IN ('agronomist', 'veterinarian')),
        job_id TEXT,
        source_json TEXT,
        action_value TEXT NOT NULL,
        option_reference TEXT NOT NULL,
        qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
        payload_hash TEXT NOT NULL,
        reservation_id TEXT,
        gold_amount INTEGER NOT NULL CHECK (gold_amount >= 0),
        world_result_json TEXT,
        result_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'world_applied', 'completed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (
          (operation_kind = 'commission_check' AND job_id IS NOT NULL AND source_json IS NULL
            AND reservation_id IS NULL AND gold_amount = 0)
          OR
          (operation_kind = 'commission_treatment' AND job_id IS NOT NULL AND source_json IS NULL
            AND reservation_id IS NOT NULL AND gold_amount > 0)
          OR
          (operation_kind = 'npc_service' AND job_id IS NULL AND source_json IS NOT NULL
            AND reservation_id IS NOT NULL AND gold_amount > 0)
        ),
        CHECK (
          (status = 'pending' AND world_result_json IS NULL AND result_json IS NULL)
          OR
          (status = 'world_applied' AND world_result_json IS NOT NULL AND result_json IS NULL)
          OR
          (status = 'completed' AND world_result_json IS NOT NULL AND result_json IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS lingye_cross_store_operations_pending
        ON lingye_cross_store_operations(status, created_at, action_key);
    `);
    installEconomySchema(database);
    installCareerSchema(database);
}

export function openLingyeWorldDatabase(databasePath = DEFAULT_LINGYE_WORLD_DATABASE_PATH) {
    const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (resolvedPath !== ":memory:")
        mkdirSync(dirname(resolvedPath), { recursive: true });
    const database = new DatabaseSync(resolvedPath);
    try {
        database.exec("PRAGMA foreign_keys = ON");
        installLingyeWorldSchema(database);
        return database;
    }
    catch (error) {
        database.close();
        throw error;
    }
}

export function registerLingyeResidentReference(database, input) {
    const residentId = String(input.residentId ?? "").trim();
    const bindingReference = String(input.bindingReference ?? "").trim();
    if (!residentId || !bindingReference || !Number.isSafeInteger(input.registeredAt))
        throw new Error("Invalid Lingye resident reference");
    return runLingyeWorldTransaction(database, () => {
        const byResident = database
            .prepare("SELECT resident_id, binding_reference, registered_at FROM residents WHERE resident_id = ?")
            .get(residentId);
        if (byResident !== undefined) {
            if (byResident.binding_reference !== bindingReference)
                throw new Error("Lingye resident binding conflict");
            return {
                residentId: byResident.resident_id,
                bindingReference: byResident.binding_reference,
                registeredAt: byResident.registered_at,
            };
        }
        const byBinding = database
            .prepare("SELECT resident_id FROM residents WHERE binding_reference = ?")
            .get(bindingReference);
        if (byBinding !== undefined)
            throw new Error("Lingye resident binding conflict");
        database
            .prepare("INSERT INTO residents (resident_id, binding_reference, registered_at) VALUES (?, ?, ?)")
            .run(residentId, bindingReference, input.registeredAt);
        return { residentId, bindingReference, registeredAt: input.registeredAt };
    });
}

export function createLingyeWorldBackend(database, options) {
    if (!options?.economyRules)
        throw new Error("Lingye economy rules are required");
    const shared = {
        database,
        ...(options.curriculum === undefined ? {} : { curriculum: options.curriculum }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
    };
    const economy = new EconomyService(database, {
        rules: options.economyRules,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
    });
    const school = new CareerSchoolService(shared);
    const employment = new CareerEmploymentService(shared);
    const jobs = new CareerJobService(shared);
    const authorityAssignment = new CareerAuthorityAssignmentService({ ...shared, jobs });
    const atomic = (operation) => runLingyeWorldTransaction(database, operation);
    const economyCommands = {
            importLegacyBalances: (input) => atomic(() => economy.importLegacyBalances(input)),
            creditFromSystem: (input) => atomic(() => economy.creditFromSystem(input)),
            chargeToSystem: (input) => atomic(() => economy.chargeToSystem(input)),
            reserveSystemGold: (input) => atomic(() => economy.reserveSystemGold(input)),
            settleSystemGoldReservation: (input) => atomic(() => economy.settleSystemGoldReservation(input)),
            releaseSystemGoldReservation: (input) => atomic(() => economy.releaseSystemGoldReservation(input)),
            setSilverAgentLock: (input) => atomic(() => economy.setSilverAgentLock(input)),
            depositDemandGold: (input) => atomic(() => economy.depositDemandGold(input)),
            withdrawDemandGold: (input) => atomic(() => economy.withdrawDemandGold(input)),
            accrueDemandInterest: (input) => atomic(() => economy.accrueDemandInterest(input)),
            openTermDeposit: (input) => atomic(() => economy.openTermDeposit(input)),
            closeTermDeposit: (input) => atomic(() => economy.closeTermDeposit(input)),
            exchangeGoldForSilver: (input) => atomic(() => economy.exchangeGoldForSilver(input)),
            createTrade: (input) => atomic(() => economy.createTrade(input)),
            confirmTrade: (input) => atomic(() => economy.confirmTrade(input)),
            settleTrade: (input) => atomic(() => economy.settleTrade(input)),
            cancelTrade: (input) => atomic(() => economy.cancelTrade(input)),
            refundTrade: (input) => atomic(() => economy.refundTrade(input)),
            openSystemLoan: (input) => atomic(() => economy.openSystemLoan(input)),
            repaySystemLoan: (input) => atomic(() => economy.repaySystemLoan(input)),
            proposePlayerLoan: (input) => atomic(() => economy.proposePlayerLoan(input)),
            confirmPlayerLoan: (input) => atomic(() => economy.confirmPlayerLoan(input)),
            cancelPlayerLoan: (input) => atomic(() => economy.cancelPlayerLoan(input)),
            repayPlayerLoan: (input) => atomic(() => economy.repayPlayerLoan(input)),
            refreshDebtStatus: (input) => atomic(() => economy.refreshDebtStatus(input)),
    };
    const careerCommands = {
            selectCareer: (residentId, career) => atomic(() => school.selectCareer(residentId, career)),
            enrollCourse: (input) => atomic(() => {
                const businessReference = `career-course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
                const charged = economy.chargeToSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    actor: input.actor,
                    businessType: "career_tuition",
                    businessRef: businessReference,
                    idempotencyKey: input.idempotencyKey,
                });
                return school.enrollCourse({
                    residentId: input.residentId,
                    career: input.career,
                    level: input.level,
                    courseIndex: input.courseIndex,
                    tuitionReceipt: charged.financialReceipt,
                });
            }),
            markCourseContentRead: (input) => atomic(() => school.markCourseContentRead(input)),
            submitCoursePractice: (input) => atomic(() => school.submitCoursePractice(input)),
            registerExam: (input) => atomic(() => {
                const businessReference = `career-exam:${input.attemptId}:reserve`;
                const reserved = economy.reserveSystemGold({
                    residentId: input.residentId,
                    amount: input.amount,
                    actor: input.actor,
                    businessReference,
                    idempotencyKey: input.idempotencyKey,
                });
                const registration = school.registerExam({
                    attemptId: input.attemptId,
                    residentId: input.residentId,
                    career: input.career,
                    level: input.level,
                    reservationReceipt: reserved.financialReceipt,
                });
                return {
                    ...registration,
                    reservationId: reserved.reservation_id,
                    reservationReceiptId: reserved.financialReceipt.receiptId,
                };
            }),
            startExam: (input) => atomic(() => {
                const settled = economy.settleSystemGoldReservation({
                    reservationId: input.reservationId,
                    businessReference: `career-exam:${input.attemptId}:settle`,
                    idempotencyKey: input.idempotencyKey,
                });
                const paper = school.startExam(input.attemptId, settled.financialReceipt);
                return {
                    attemptId: input.attemptId,
                    reservationId: input.reservationId,
                    settlementReceiptId: settled.financialReceipt.receiptId,
                    ...paper,
                };
            }),
            releaseUnstartedExam: (input) => atomic(() => {
                const released = economy.releaseSystemGoldReservation({
                    reservationId: input.reservationId,
                    businessReference: `career-exam:${input.attemptId}:release`,
                    idempotencyKey: input.idempotencyKey,
                });
                school.releaseUnstartedExam(input.attemptId, released.financialReceipt);
                return {
                    attemptId: input.attemptId,
                    reservationId: input.reservationId,
                    releaseReceiptId: released.financialReceipt.receiptId,
                };
            }),
            submitWrittenExam: (input) => atomic(() => school.submitWrittenExam(input)),
            scheduleConstableInterview: (attemptId, scheduledAt) => atomic(() => school.scheduleConstableInterview(attemptId, scheduledAt)),
            signupConstableExaminer: (input) => atomic(() => school.signupConstableExaminer(input)),
            confirmConstableExaminerAttendance: (input) => atomic(() => school.confirmConstableExaminerAttendance(input)),
            finalizeConstableExaminerPanel: (interviewId) => atomic(() => school.finalizeConstableExaminerPanel(interviewId)),
            submitConstableInterviewScore: (input) => atomic(() => school.submitConstableInterviewScore(input)),
            openConstablePublicNotice: (interviewId, eligibleVoterResidentIds) => atomic(() => school.openConstablePublicNotice(interviewId, eligibleVoterResidentIds)),
            voteConstablePublicNotice: (noticeId, residentId, choice) => atomic(() => school.voteConstablePublicNotice(noticeId, residentId, choice)),
            finalizeConstablePublicNotice: (noticeId, reviewPolicy) => atomic(() => school.finalizeConstablePublicNotice(noticeId, reviewPolicy)),
            hire: (input) => atomic(() => employment.hire(input)),
            hireResident: (input) => atomic(() => employment.hireResident(input)),
            setAvailability: (employmentId, availability) => atomic(() => employment.setAvailability(employmentId, availability)),
            endEmployment: (employmentId) => atomic(() => employment.endEmployment(employmentId)),
            generateNextDutyDays: () => atomic(() => employment.generateNextDutyDays()),
            settleDutyDay: (input) => atomic(() => {
                const credited = economy.creditFromSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    businessType: "career_wage",
                    businessRef: `career-duty:${input.dutyId}:wage`,
                    idempotencyKey: input.idempotencyKey,
                });
                return employment.settleDutyDay(input.dutyId, credited.financialReceipt);
            }),
            createJob: (input) => atomic(() => jobs.createJob(input)),
            acceptJob: (jobId, workerResidentId) => atomic(() => jobs.acceptJob(jobId, workerResidentId)),
            assignAuthorityJob: (input) => atomic(() => authorityAssignment.assignJob(input)),
            recordDecision: (input) => atomic(() => jobs.recordDecision(input)),
            completeJob: (input) => atomic(() => {
                if (Object.hasOwn(input, "paymentReceipt") || Object.hasOwn(input, "expectedSilverPayment"))
                    throw new Error("Paid jobs must use completePaidJob");
                return jobs.completeJob(input);
            }),
            completePaidJob: (input) => atomic(() => {
                const settled = economy.settleTrade({
                    tradeId: input.tradeId,
                    idempotencyKey: input.tradeSettlementIdempotencyKey,
                });
                return jobs.completeJob({
                    ...input.completion,
                    paymentReceipt: settled.financialReceipt,
                    expectedSilverPayment: input.expectedSilverPayment,
                });
            }),
            cancelJob: (jobId) => atomic(() => jobs.cancelJob(jobId)),
            expireJob: (jobId, demandStillExists) => atomic(() => jobs.expireJob(jobId, demandStillExists)),
            transferJob: (input) => atomic(() => jobs.transferJob(input)),
            addReporterLikePerformance: (input) => atomic(() => {
                if (input.validLikes < 5) {
                    return jobs.addReporterLikePerformance({
                        idempotencyKey: input.idempotencyKey,
                        jobId: input.jobId,
                        validLikes: input.validLikes,
                        sourceReference: input.sourceReference,
                    });
                }
                const credited = economy.creditFromSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    businessType: "career_wage",
                    businessRef: `career-job:${input.jobId}:evaluation-performance`,
                    idempotencyKey: input.idempotencyKey,
                });
                return jobs.addReporterLikePerformance({
                    idempotencyKey: input.idempotencyKey,
                    jobId: input.jobId,
                    validLikes: input.validLikes,
                    sourceReference: input.sourceReference,
                    wageReceipt: credited.financialReceipt,
                });
            }),
    };
    // Only commands whose services already verify an explicit resident actor belong here.
    // Future HTTP/MCP adapters must still inject that actor from authenticated identity.
    const residentCommands = Object.freeze({
        closeTermDeposit: economyCommands.closeTermDeposit,
        confirmTrade: economyCommands.confirmTrade,
        proposePlayerLoan: economyCommands.proposePlayerLoan,
        confirmPlayerLoan: economyCommands.confirmPlayerLoan,
        cancelPlayerLoan: economyCommands.cancelPlayerLoan,
        repayPlayerLoan: economyCommands.repayPlayerLoan,
        repaySystemLoan: economyCommands.repaySystemLoan,
    });
    const trustedSystemCommands = Object.freeze({
        importLegacyBalances: economyCommands.importLegacyBalances,
        creditFromSystem: economyCommands.creditFromSystem,
        chargeToSystem: economyCommands.chargeToSystem,
        reserveSystemGold: economyCommands.reserveSystemGold,
        settleSystemGoldReservation: economyCommands.settleSystemGoldReservation,
        releaseSystemGoldReservation: economyCommands.releaseSystemGoldReservation,
        setSilverAgentLock: economyCommands.setSilverAgentLock,
        depositDemandGold: economyCommands.depositDemandGold,
        withdrawDemandGold: economyCommands.withdrawDemandGold,
        accrueDemandInterest: economyCommands.accrueDemandInterest,
        openTermDeposit: economyCommands.openTermDeposit,
        exchangeGoldForSilver: economyCommands.exchangeGoldForSilver,
        createTrade: economyCommands.createTrade,
        settleTrade: economyCommands.settleTrade,
        cancelTrade: economyCommands.cancelTrade,
        refundTrade: economyCommands.refundTrade,
        openSystemLoan: economyCommands.openSystemLoan,
        refreshDebtStatus: economyCommands.refreshDebtStatus,
        ...careerCommands,
    });
    const trustedQueries = Object.freeze({
        getAccount: (residentId) => economy.getAccount(residentId),
        getFinancialReceipt: (receiptId) => economy.getFinancialReceipt(receiptId),
        previewExchange: (residentId, goldPrincipal, at) => economy.previewExchange(residentId, goldPrincipal, at),
        getCourseContent: (input) => school.getCourseContent(input),
        courseAvailable: (career, level, courseIndex) => school.courseAvailable(career, level, courseIndex),
        examAvailable: (career, level) => school.examAvailable(career, level),
        getWrittenExamPaper: (attemptId) => school.getWrittenExamPaper(attemptId),
        hasScheduledDuty: (residentId, career, dutyDate) => employment.hasScheduledDuty(residentId, career, dutyDate),
        getJob: (jobId) => jobs.getJob(jobId),
    });
    const forResident = (authenticatedResidentId) => {
        if (typeof authenticatedResidentId !== "string" || authenticatedResidentId.length === 0)
            throw new Error("Authenticated resident id is required");
        return Object.freeze({
            acceptOwnJob: (jobId) => careerCommands.acceptJob(jobId, authenticatedResidentId),
            confirmTrade: (input) => residentCommands.confirmTrade({ ...input, actorResidentId: authenticatedResidentId }),
            closeOwnTermDeposit: (input) => residentCommands.closeTermDeposit({ ...input, actorResidentId: authenticatedResidentId }),
            proposePlayerLoan: (input) => residentCommands.proposePlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            confirmPlayerLoan: (input) => residentCommands.confirmPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            cancelPlayerLoan: (input) => residentCommands.cancelPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            repayPlayerLoan: (input) => residentCommands.repayPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            repayOwnSystemLoan: (input) => residentCommands.repaySystemLoan({ ...input, actorResidentId: authenticatedResidentId }),
            recordOwnJobDecision: (input) => careerCommands.recordDecision({ ...input, workerResidentId: authenticatedResidentId }),
            transferOwnJob: (input) => careerCommands.transferJob({ ...input, workerResidentId: authenticatedResidentId }),
            getOwnAccount: () => economy.getAccount(authenticatedResidentId),
            getOwnFinancialReceipt: (receiptId) => {
                const receipt = economy.getFinancialReceipt(receiptId);
                if (receipt.residentId !== authenticatedResidentId)
                    throw new EconomyError("FINANCIAL_RECEIPT_NOT_FOUND", { receiptId });
                return receipt;
            },
            previewOwnExchange: (goldPrincipal, at) => economy.previewExchange(authenticatedResidentId, goldPrincipal, at),
            hasOwnScheduledDuty: (career, dutyDate) => employment.hasScheduledDuty(authenticatedResidentId, career, dutyDate),
            getVisibleJob: (jobId) => {
                const job = jobs.getJob(jobId);
                if (job.ownerResidentId !== authenticatedResidentId &&
                    job.workerResidentId !== authenticatedResidentId) {
                    throw new CareerDomainError("job_not_found", "Job not found");
                }
                return job;
            },
        });
    };
    const backend = { forResident, trustedSystemCommands, trustedQueries };
    if (options.exposeInternalsForTesting) {
        backend.testing = Object.freeze({
            economy,
            career: Object.freeze({ school, employment, jobs }),
        });
    }
    return Object.freeze(backend);
}
