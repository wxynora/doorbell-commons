import { randomUUID } from "node:crypto";
import { AGRONOMIST_CONCURRENT_CAPACITY, CareerDomainError, institutionForCareer, JOB_PERFORMANCE_UNITS, PERFORMANCE_PAY_GOLD, SERVICE_COMMISSION_DAILY_ACCEPT_LIMIT, SERVICE_COMMISSION_REST_MS, } from "./contracts.js";
import { beijingDate, recordFinancialReceipt, requireActiveCertificate, runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
const AUTHORITY_ASSIGN_JOB = Symbol("career-authority-assign-job");
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function assignmentExclusions(input) {
    if (input === undefined)
        return [];
    if (!Array.isArray(input))
        throw new CareerDomainError("invalid_assignment_exclusions", "Assignment exclusions must be resident ids");
    const residents = input.map((residentId) => {
        if (typeof residentId !== "string" || residentId.length === 0 || residentId.trim() !== residentId)
            throw new CareerDomainError("invalid_assignment_exclusions", "Assignment exclusions must be resident ids");
        return residentId;
    });
    if (new Set(residents).size !== residents.length)
        throw new CareerDomainError("invalid_assignment_exclusions", "Assignment exclusions must not repeat a resident");
    return residents.sort(compareText);
}
function sameStrings(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function verifyServiceSilverSettlement(database, job, workerResidentId, receiptId) {
    const authority = database.prepare(`SELECT
        fund.source_id, fund.owner_resident_id, fund.amount, fund.reservation_id,
        fund.state AS fund_state,
        escrow.amount AS escrow_amount, escrow.payer_resident_id,
        escrow.payee_resident_id, escrow.state AS escrow_state,
        escrow.settle_journal_id,
        receipt.kind, receipt.currency, receipt.amount AS receipt_amount,
        receipt.business_reference
      FROM career_service_commission_funds AS fund
      JOIN economy_silver_escrows AS escrow
        ON escrow.escrow_id = fund.reservation_id
      JOIN economy_silver_escrow_receipts AS receipt
        ON receipt.receipt_id = escrow.settle_journal_id
       AND receipt.escrow_id = escrow.escrow_id
      WHERE fund.current_job_id = ? AND fund.currency = 'silver'
        AND receipt.receipt_id = ?`)
        .get(job.job_id, receiptId);
    if (!authority || authority.fund_state !== "settled" ||
        authority.escrow_state !== "settled" ||
        authority.owner_resident_id !== job.owner_resident_id ||
        authority.payer_resident_id !== job.owner_resident_id ||
        authority.payee_resident_id !== workerResidentId ||
        authority.kind !== "silver_escrow_settle" ||
        authority.currency !== "silver" ||
        authority.escrow_amount !== authority.amount ||
        authority.receipt_amount !== authority.amount ||
        authority.business_reference !== `silver-escrow:${authority.reservation_id}` ||
        authority.settle_journal_id !== receiptId) {
        throw new CareerDomainError("job_payment_receipt_mismatch", "The settled service escrow does not match this agronomy commission");
    }
    const entries = database.prepare(`SELECT resident_id, partition_name, delta
      FROM economy_ledger_entries WHERE journal_id = ? AND currency = 'silver'`)
        .all(receiptId);
    const paidWorker = entries.some((entry) => entry.resident_id === workerResidentId &&
        entry.partition_name === "available" && entry.delta === authority.amount);
    const releasedOwner = entries.some((entry) => entry.resident_id === job.owner_resident_id &&
        entry.partition_name === "frozen" && entry.delta === -authority.amount);
    if (entries.length !== 2 || !paidWorker || !releasedOwner)
        throw new CareerDomainError("job_payment_receipt_unverified", "The settled service escrow journal is invalid");
    return receiptId;
}
function reporterRelayRolePerformanceRate(database, jobId) {
    return database.prepare(`SELECT duty.performance_rate_bps
      FROM career_reporter_relay_issues AS issue
      JOIN career_reporter_duty_roles AS role
        ON role.duty_date = issue.issue_date
       AND role.role = CASE
         WHEN issue.selector_job_id = ? THEN 'selector'
         WHEN issue.writer_job_id = ? THEN 'writer'
         WHEN issue.reviewer_job_id = ? THEN 'reviewer'
         WHEN issue.submission_reviewer_job_id = ? THEN 'submission_reviewer'
       END
      JOIN career_duty_days AS duty ON duty.duty_id = role.duty_id
      WHERE issue.selector_job_id = ? OR issue.writer_job_id = ? OR issue.reviewer_job_id = ?
        OR issue.submission_reviewer_job_id = ?`)
        .get(jobId, jobId, jobId, jobId, jobId, jobId, jobId, jobId)?.performance_rate_bps ?? null;
}
function serviceCommissionContract(input, excludedResidentIds) {
    if (input.serviceCommission !== true) {
        if (input.serviceAudience !== undefined || input.targetResidentId !== undefined) {
            throw new CareerDomainError("service_commission_contract_invalid", "Only a service commission can declare its audience");
        }
        return { enabled: false, audience: null, targetResidentId: null };
    }
    if (!['agronomist', 'veterinarian'].includes(input.career) ||
        input.assignmentMode !== 'accepted' || !input.ownerResidentId) {
        throw new CareerDomainError("service_commission_contract_invalid", "A real service commission needs an owner and accepted assignment mode");
    }
    const audience = input.serviceAudience ?? 'public';
    if (!['public', 'targeted'].includes(audience)) {
        throw new CareerDomainError("service_commission_contract_invalid", "A new service commission must be public or targeted");
    }
    const targetResidentId = input.targetResidentId ?? null;
    if ((audience === 'targeted') !== (targetResidentId !== null) ||
        (targetResidentId !== null &&
            (typeof targetResidentId !== 'string' || !targetResidentId.length || targetResidentId.trim() !== targetResidentId))) {
        throw new CareerDomainError("service_commission_contract_invalid", "A targeted service commission needs one valid target resident");
    }
    if (targetResidentId === input.ownerResidentId || excludedResidentIds.includes(targetResidentId)) {
        throw new CareerDomainError("service_commission_target_invalid", "The owner or an excluded resident cannot be targeted");
    }
    return { enabled: true, audience, targetResidentId };
}
export const INSTITUTION_ASSIGNED_CONCURRENT_CAPACITY = Object.freeze({
    1: 1,
    2: 2,
    3: 4,
    4: 6,
});
export function createCareerAuthorityJobBinder(jobService) {
    if (!(jobService instanceof CareerJobService)) {
        throw new TypeError("Career authority assignment requires a CareerJobService");
    }
    return (jobId, workerResidentId) => jobService[AUTHORITY_ASSIGN_JOB](jobId, workerResidentId);
}
export class CareerJobService {
    #database;
    #now;
    #generateId;
    constructor(options) {
        this.#database = options.database;
        this.#now = options.now ?? Date.now;
        this.#generateId = options.generateId ?? randomUUID;
        installCareerSchema(this.#database);
    }
    createJob(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const excludedResidentIds = assignmentExclusions(input.excludedResidentIds);
            const serviceCommission = serviceCommissionContract(input, excludedResidentIds);
            const existing = this.#database
                .prepare(`SELECT * FROM career_jobs WHERE job_id = ? OR (source_type = ? AND source_id = ?)`)
                .get(input.jobId, input.sourceType, input.sourceId);
            if (existing) {
                if (existing.job_id !== input.jobId ||
                    existing.career !== input.career ||
                    existing.source_type !== input.sourceType ||
                    existing.source_id !== input.sourceId ||
                    existing.object_type !== input.objectType ||
                    existing.object_id !== input.objectId ||
                    existing.owner_resident_id !== (input.ownerResidentId ?? null) ||
                    existing.required_level !== input.requiredLevel ||
                    existing.difficulty_level !== input.difficultyLevel ||
                    existing.assignment_mode !== input.assignmentMode ||
                    Boolean(existing.service_commission) !== serviceCommission.enabled ||
                    existing.service_audience !== serviceCommission.audience ||
                    existing.target_resident_id !== serviceCommission.targetResidentId ||
                    (input.assignmentMode === "self" &&
                        existing.worker_resident_id !== input.selfWorkerResidentId) ||
                    !sameStrings(excludedResidentIds, this.#assignmentExclusions(existing.job_id))) {
                    throw new CareerDomainError("job_idempotency_conflict", "The job id or real source already belongs to another job");
                }
                return mapJob(existing);
            }
            this.#assertAssignmentMode(input.career, input.assignmentMode);
            let status = "available";
            let workerResidentId = null;
            if (input.assignmentMode === "self") {
                if (!input.selfWorkerResidentId) {
                    throw new CareerDomainError("self_worker_required", "A self-directed job needs its owner");
                }
                if (!input.ownerResidentId || input.ownerResidentId !== input.selfWorkerResidentId) {
                    throw new CareerDomainError("self_owner_mismatch", "A self-directed job must belong to its worker");
                }
                requireActiveCertificate(this.#database, input.selfWorkerResidentId, input.career, input.requiredLevel, now);
                if (input.career === "agronomist") {
                    const availability = this.getServiceCommissionAvailability(input.selfWorkerResidentId, input.career);
                    if (availability.activeJobId) {
                        throw new CareerDomainError("service_commission_active_job", "The agronomist already has unfinished work");
                    }
                    if (availability.acceptedToday >= availability.dailyLimit) {
                        throw new CareerDomainError("service_commission_daily_limit", "The agronomist has reached today's work limit");
                    }
                    if (availability.remainingRestMs > 0) {
                        const error = new CareerDomainError("service_commission_resting", "The agronomist is resting after the last completed work");
                        error.restUntil = availability.restUntil;
                        error.remainingRestMs = availability.remainingRestMs;
                        throw error;
                    }
                }
                status = "accepted";
                workerResidentId = input.selfWorkerResidentId;
            }
            this.#database
                .prepare(`INSERT INTO career_jobs (
             job_id, career, source_type, source_id, object_type, object_id,
             owner_resident_id, required_level, difficulty_level, assignment_mode,
             service_commission, service_audience, target_resident_id,
             status, worker_resident_id, accepted_at, accepted_day, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(input.jobId, input.career, input.sourceType, input.sourceId, input.objectType, input.objectId,
                    input.ownerResidentId ?? null, input.requiredLevel, input.difficultyLevel,
                    input.assignmentMode, Number(serviceCommission.enabled), serviceCommission.audience,
                    serviceCommission.targetResidentId, status, workerResidentId,
                    input.assignmentMode === "self" ? now : null,
                    input.assignmentMode === "self" ? beijingDate(now) : null,
                    now, now);
            const insertExclusion = this.#database.prepare(`INSERT INTO career_job_assignment_exclusions (
              job_id, resident_id, relation_kind, source_reference, recorded_at
            ) VALUES (?, ?, 'source_party', ?, ?)`);
            for (const residentId of excludedResidentIds)
                insertExclusion.run(input.jobId, residentId, input.sourceId, now);
            if (serviceCommission.enabled && serviceCommission.targetResidentId) {
                this.#requireServiceCandidate(this.#requireJob(input.jobId),
                    serviceCommission.targetResidentId, now);
            }
            return mapJob(this.#requireJob(input.jobId));
        });
    }
    acceptJob(jobId, workerResidentId) {
        return this.#bindWorker(jobId, workerResidentId, "accepted");
    }
    assignJob() {
        throw new CareerDomainError("authoritative_assignment_required", "Assigned institution jobs must use the authoritative assignment service");
    }
    [AUTHORITY_ASSIGN_JOB](jobId, workerResidentId) {
        return this.#bindWorker(jobId, workerResidentId, "assigned");
    }
    configureServiceCommission(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(input.jobId);
            if (!job.service_commission || job.owner_resident_id !== input.ownerResidentId ||
                job.status !== "available") {
                throw new CareerDomainError("service_commission_not_configurable", "The service commission cannot be reconfigured");
            }
            if (!["public", "targeted"].includes(input.audience)) {
                throw new CareerDomainError("service_commission_contract_invalid", "The service commission audience is invalid");
            }
            const targetResidentId = input.audience === "targeted" ? input.targetResidentId : null;
            if ((input.audience === "targeted" &&
                (typeof targetResidentId !== "string" || !targetResidentId.length || targetResidentId.trim() !== targetResidentId)) ||
                (input.audience === "public" && input.targetResidentId !== undefined)) {
                throw new CareerDomainError("service_commission_contract_invalid", "A targeted service commission needs one valid target resident");
            }
            if (targetResidentId !== null) {
                if (targetResidentId === job.owner_resident_id ||
                    this.#assignmentExclusions(job.job_id).includes(targetResidentId)) {
                    throw new CareerDomainError("service_commission_target_invalid", "The owner or an excluded resident cannot be targeted");
                }
                this.#requireServiceCandidate({
                    ...job,
                    service_audience: "targeted",
                    target_resident_id: targetResidentId,
                }, targetResidentId, now);
            }
            this.#database.prepare(`UPDATE career_jobs
              SET service_audience = ?, target_resident_id = ?, updated_at = ?
              WHERE job_id = ?`)
                .run(input.audience, targetResidentId, now, job.job_id);
            return mapJob(this.#requireJob(job.job_id));
        });
    }
    declineTargetedServiceCommission(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(input.jobId);
            if (!job.service_commission || job.status !== "available" ||
                job.target_resident_id !== input.workerResidentId ||
                !["targeted", "owner_choice"].includes(job.service_audience)) {
                throw new CareerDomainError("service_commission_not_declineable", "The targeted service commission cannot be declined");
            }
            if (job.service_audience === "targeted") {
                this.#database.prepare(`UPDATE career_jobs
                  SET service_audience = 'owner_choice', updated_at = ? WHERE job_id = ?`)
                    .run(now, job.job_id);
            }
            return mapJob(this.#requireJob(job.job_id));
        });
    }
    getServiceCommissionAvailability(workerResidentId, career) {
        const now = this.#now();
        if (!["agronomist", "veterinarian"].includes(career)) {
            throw new CareerDomainError("service_commission_career_invalid", "This career does not use service commission limits");
        }
        const acceptedDay = beijingDate(now);
        const active = this.#database.prepare(`SELECT job_id FROM career_jobs
          WHERE (service_commission = 1 OR (career = 'agronomist' AND assignment_mode = 'self'))
            AND worker_resident_id = ? AND career = ?
            AND status IN ('accepted', 'active')
          ORDER BY accepted_at, job_id LIMIT 1`)
            .get(workerResidentId, career);
        const acceptedToday = this.#database.prepare(`SELECT COUNT(*) AS count FROM career_jobs
          WHERE (service_commission = 1 OR (career = 'agronomist' AND assignment_mode = 'self'))
            AND worker_resident_id = ? AND career = ?
            AND accepted_day = ?`)
            .get(workerResidentId, career, acceptedDay).count;
        const lastCompleted = this.#database.prepare(`SELECT MAX(ended_at) AS ended_at FROM career_jobs
          WHERE (service_commission = 1 OR (career = 'agronomist' AND assignment_mode = 'self'))
            AND worker_resident_id = ? AND career = ?
            AND status = 'completed'`)
            .get(workerResidentId, career).ended_at;
        const restUntil = Number.isSafeInteger(lastCompleted)
            ? lastCompleted + SERVICE_COMMISSION_REST_MS
            : null;
        return {
            acceptedDay,
            acceptedToday,
            activeJobId: active?.job_id ?? null,
            dailyLimit: SERVICE_COMMISSION_DAILY_ACCEPT_LIMIT,
            restUntil,
            remainingRestMs: restUntil !== null ? Math.max(0, restUntil - now) : 0,
            canAccept: !active && acceptedToday < SERVICE_COMMISSION_DAILY_ACCEPT_LIMIT &&
                (restUntil === null || now >= restUntil),
        };
    }
    recordDecision(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const existing = this.#database
                .prepare(`SELECT sequence, decision_kind, option_reference, result_reference,
                  consumes_resources, changes_world
           FROM career_job_decisions WHERE job_id = ? AND idempotency_key = ?`)
                .get(input.jobId, input.idempotencyKey);
            if (existing) {
                this.#requireWorkerJob(input.jobId, input.workerResidentId);
                if (existing.decision_kind !== input.kind ||
                    existing.option_reference !== input.optionReference ||
                    existing.result_reference !== input.resultReference ||
                    Boolean(existing.consumes_resources) !== input.consumesResources ||
                    Boolean(existing.changes_world) !== input.changesWorld) {
                    throw new CareerDomainError("job_decision_idempotency_conflict", "The decision key has different parameters");
                }
                return { sequence: existing.sequence, status: "active" };
            }
            const job = this.#requireWorkerJob(input.jobId, input.workerResidentId);
            if (!["accepted", "assigned", "active"].includes(job.status)) {
                throw new CareerDomainError("job_not_actionable", "The job is not actionable");
            }
            if (job.decision_count >= 4) {
                throw new CareerDomainError("job_decision_limit_reached", "A job has at most four decisions");
            }
            if (job.status !== "active")
                this.#acquireObjectLock(job, now);
            const sequence = job.decision_count + 1;
            this.#database
                .prepare(`INSERT INTO career_job_decisions (
             decision_id, job_id, sequence, idempotency_key, decision_kind,
             option_reference, result_reference, consumes_resources, changes_world, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(this.#generateId(), job.job_id, sequence, input.idempotencyKey, input.kind, input.optionReference, input.resultReference, Number(input.consumesResources), Number(input.changesWorld), now);
            this.#database
                .prepare(`UPDATE career_jobs
           SET status = 'active', started_at = COALESCE(started_at, ?), updated_at = ?,
               decision_count = ?, has_irreversible_action = CASE
                 WHEN has_irreversible_action = 1 OR ? = 1 OR ? = 1 THEN 1 ELSE 0
               END
           WHERE job_id = ?`)
                .run(now, now, sequence, Number(input.consumesResources), Number(input.changesWorld), job.job_id);
            return { sequence, status: "active" };
        });
    }
    completeJob(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireWorkerJob(input.jobId, input.workerResidentId);
            if (job.status === "completed") {
                if (job.world_result_reference !== input.worldResultReference) {
                    throw new CareerDomainError("job_completion_conflict", "The job was already completed");
                }
                return mapJob(job);
            }
            const requiredDecisions = job.career === "reporter" ? 1 : 2;
            if (job.status !== "active" || job.decision_count < requiredDecisions) {
                throw new CareerDomainError("job_decisions_incomplete", `A completed job needs at least ${requiredDecisions} real decision${requiredDecisions === 1 ? "" : "s"}`);
            }
            if (!input.validationPassed || !input.worldResultReference) {
                throw new CareerDomainError("job_completion_not_validated", "The authoritative world result did not validate completion");
            }
            let paymentReference = input.externalPaymentReference ?? null;
            if (job.career === "agronomist") {
                const selfAgronomyWork = job.assignment_mode === "self" &&
                    job.owner_resident_id === input.workerResidentId;
                if (job.service_commission) {
                    if (typeof input.externalPaymentReference !== "string" || input.externalPaymentReference.length === 0)
                        throw new CareerDomainError("job_payment_required", "A real agronomy commission needs its settled silver escrow");
                    paymentReference = verifyServiceSilverSettlement(this.#database, job,
                        input.workerResidentId, input.externalPaymentReference);
                }
                else if (!selfAgronomyWork) {
                    if (!input.paymentReceipt || !input.expectedSilverPayment) {
                        throw new CareerDomainError("job_payment_required", "A real agronomy commission needs its settled silver receipt");
                    }
                    recordFinancialReceipt(this.#database, input.paymentReceipt, {
                        amount: input.expectedSilverPayment,
                        businessReference: `career-job:${job.job_id}:settlement`,
                        currency: "silver",
                        kind: "player_silver_settle",
                        residentId: input.workerResidentId,
                    }, now);
                    paymentReference = input.paymentReceipt.receiptId;
                }
            }
            this.#database
                .prepare(`UPDATE career_jobs
           SET status = 'completed', ended_at = ?, updated_at = ?,
               world_result_reference = ?, payment_reference = ?
           WHERE job_id = ?`)
                .run(now, now, input.worldResultReference, paymentReference, job.job_id);
            this.#releaseObjectLock(job.job_id);
            const level = requireActiveCertificate(this.#database, input.workerResidentId, job.career, job.required_level, now);
            const selfVeterinarianTreatment = job.career === "veterinarian" &&
                job.owner_resident_id === input.workerResidentId;
            const performanceUnits = institutionForCareer(job.career) &&
                job.career !== "reporter" && !selfVeterinarianTreatment
                ? JOB_PERFORMANCE_UNITS[job.difficulty_level]
                : 0;
            const dutyDate = job.career === "reporter" && Number.isSafeInteger(job.started_at)
                ? beijingDate(job.started_at)
                : beijingDate(now);
            const duty = institutionForCareer(job.career)
                ? this.#database.prepare(`SELECT performance_rate_bps FROM career_duty_days
                    WHERE resident_id = ? AND career = ? AND duty_date = ?
                    ORDER BY generated_at DESC LIMIT 1`)
                    .get(input.workerResidentId, job.career, dutyDate)
                : null;
            const performanceRateBps = job.career === "reporter"
                ? reporterRelayRolePerformanceRate(this.#database, job.job_id) ??
                    duty?.performance_rate_bps ?? 10_000
                : duty?.performance_rate_bps ?? 10_000;
            this.#database
                .prepare(`INSERT INTO career_work_records (
             work_record_id, job_id, resident_id, career, qualification_level,
             difficulty_level, record_kind, performance_units, performance_rate_bps, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`)
                .run(this.#generateId(), job.job_id, input.workerResidentId, job.career, level,
                    job.difficulty_level, performanceUnits, performanceRateBps, now);
            return mapJob(this.#requireJob(job.job_id));
        });
    }
    cancelJob(jobId) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(jobId);
            if (job.status === "cancelled")
                return mapJob(job);
            if (isTerminal(job.status)) {
                throw new CareerDomainError("job_already_terminal", "The job already ended");
            }
            if (job.has_irreversible_action) {
                throw new CareerDomainError("job_cannot_cancel_after_effect", "A job with consumed resources or world changes cannot be cancelled");
            }
            this.#database
                .prepare(`UPDATE career_jobs SET status = 'cancelled', ended_at = ?, updated_at = ? WHERE job_id = ?`)
                .run(now, now, jobId);
            this.#releaseObjectLock(jobId);
            return mapJob(this.#requireJob(jobId));
        });
    }
    expireJob(jobId, demandStillExists) {
        if (demandStillExists) {
            throw new CareerDomainError("job_demand_still_exists", "A real unresolved demand cannot expire only because time passed");
        }
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(jobId);
            if (job.status === "expired")
                return mapJob(job);
            if (isTerminal(job.status)) {
                throw new CareerDomainError("job_already_terminal", "The job already ended");
            }
            this.#database
                .prepare(`UPDATE career_jobs SET status = 'expired', ended_at = ?, updated_at = ? WHERE job_id = ?`)
                .run(now, now, jobId);
            this.#releaseObjectLock(jobId);
            return mapJob(this.#requireJob(jobId));
        });
    }
    transferJob(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireWorkerJob(input.jobId, input.workerResidentId);
            const successorSourceType = `${job.source_type}:transfer`;
            const existingSuccessor = this.#database
                .prepare(`SELECT * FROM career_jobs
           WHERE job_id = ? OR (source_type = ? AND source_id = ?)`)
                .get(input.successorJobId, successorSourceType, input.successorSourceId);
            if (existingSuccessor) {
                if (job.status !== "transferred" ||
                    existingSuccessor.job_id !== input.successorJobId ||
                    existingSuccessor.parent_job_id !== job.job_id ||
                    existingSuccessor.source_type !== successorSourceType ||
                    existingSuccessor.source_id !== input.successorSourceId) {
                    throw new CareerDomainError("job_transfer_conflict", "The transfer successor identity conflicts with another job");
                }
                return {
                    successor: mapJob(existingSuccessor),
                    transferred: mapJob(job),
                };
            }
            if (job.assignment_mode === "self") {
                throw new CareerDomainError("job_not_transferable", "A self-directed job cannot transfer");
            }
            if (job.status !== "active") {
                throw new CareerDomainError("job_not_transferable", "Only an active job can transfer");
            }
            const check = this.#database
                .prepare(`SELECT 1 FROM career_job_decisions
           WHERE job_id = ? AND decision_kind = 'check' LIMIT 1`)
                .get(job.job_id);
            if (!check) {
                throw new CareerDomainError("qualified_transfer_check_required", "The worker must complete a lawful current-level check before transfer");
            }
            const level = requireActiveCertificate(this.#database, input.workerResidentId, job.career, job.required_level, now);
            this.#database
                .prepare(`UPDATE career_jobs SET status = 'transferred', ended_at = ?, updated_at = ?
           WHERE job_id = ?`)
                .run(now, now, job.job_id);
            this.#releaseObjectLock(job.job_id);
            this.#database
                .prepare(`INSERT INTO career_work_records (
             work_record_id, job_id, resident_id, career, qualification_level,
             difficulty_level, record_kind, performance_units, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'qualified_transfer', 0, ?)`)
                .run(this.#generateId(), job.job_id, input.workerResidentId, job.career, level, job.difficulty_level, now);
            this.#database
                .prepare(`INSERT INTO career_jobs (
             job_id, parent_job_id, career, source_type, source_id, object_type, object_id,
             owner_resident_id, required_level, difficulty_level, assignment_mode,
             service_commission, service_audience, target_resident_id,
             status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'available', ?, ?)`)
                .run(input.successorJobId, job.job_id, job.career, successorSourceType,
                    input.successorSourceId, job.object_type, job.object_id, job.owner_resident_id,
                    job.required_level, job.difficulty_level, job.assignment_mode,
                    Number(Boolean(job.service_commission)), job.service_commission ? "owner_choice" : null,
                    now, now);
            this.#database.prepare(`INSERT INTO career_job_assignment_exclusions (
              job_id, resident_id, relation_kind, source_reference, recorded_at
            )
            SELECT ?, resident_id, relation_kind, source_reference, ?
            FROM career_job_assignment_exclusions WHERE job_id = ?`)
                .run(input.successorJobId, now, job.job_id);
            return {
                successor: mapJob(this.#requireJob(input.successorJobId)),
                transferred: mapJob(this.#requireJob(job.job_id)),
            };
        });
    }
    #assignmentExclusions(jobId) {
        return this.#database.prepare(`SELECT resident_id FROM career_job_assignment_exclusions
          WHERE job_id = ? ORDER BY resident_id COLLATE BINARY ASC`)
            .all(jobId)
            .map((row) => row.resident_id);
    }
    quoteReporterLikePerformance(jobId, validLikes) {
        if (!Number.isInteger(validLikes) || validLikes < 0) {
            throw new CareerDomainError("invalid_like_count", "Valid likes must be a nonnegative integer");
        }
        const job = this.#requireJob(jobId);
        if (job.career !== "reporter" || job.status !== "completed" || !job.worker_resident_id) {
            throw new CareerDomainError("reporter_performance_unavailable", "Only a completed reporter job can receive evaluation performance");
        }
        const units = validLikes >= 20 ? 3 : validLikes >= 15 ? 2 : validLikes >= 5 ? 1 : 0;
        const workRecord = this.#database
            .prepare(`SELECT qualification_level, performance_rate_bps FROM career_work_records
         WHERE job_id = ? AND resident_id = ? AND record_kind = 'completed'`)
            .get(job.job_id, job.worker_resident_id);
        if (!workRecord) {
            throw new CareerDomainError("reporter_work_record_missing", "The completed reporter work record is missing");
        }
        return {
            jobId: job.job_id,
            residentId: job.worker_resident_id,
            validLikes,
            units,
            performanceGold: units * PERFORMANCE_PAY_GOLD[workRecord.qualification_level] *
                workRecord.performance_rate_bps / 10_000,
        };
    }
    addReporterLikePerformance(input) {
        if (!Number.isInteger(input.validLikes) || input.validLikes < 0) {
            throw new CareerDomainError("invalid_like_count", "Valid likes must be a nonnegative integer");
        }
        if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length === 0) {
            throw new CareerDomainError("invalid_idempotency_key", "Reporter evaluation needs an idempotency key");
        }
        if (typeof input.sourceReference !== "string" || input.sourceReference.trim().length === 0) {
            throw new CareerDomainError("invalid_source_reference", "Reporter evaluation needs a source reference");
        }
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const quote = this.quoteReporterLikePerformance(input.jobId, input.validLikes);
            const job = this.#requireJob(quote.jobId);
            const { units, performanceGold } = quote;
            const settlements = this.#database
                .prepare(`SELECT * FROM career_reporter_evaluation_settlements
           WHERE job_id = ? OR source_reference = ? OR idempotency_key = ?
           ORDER BY settlement_id`)
                .all(job.job_id, input.sourceReference, input.idempotencyKey);
            if (settlements.length > 0) {
                const existing = settlements[0];
                const expectedReceiptId = input.wageReceipt?.receiptId ?? null;
                if (settlements.some((candidate) => candidate.settlement_id !== existing.settlement_id) ||
                    existing.job_id !== job.job_id ||
                    existing.resident_id !== job.worker_resident_id ||
                    existing.source_reference !== input.sourceReference ||
                    existing.idempotency_key !== input.idempotencyKey ||
                    existing.valid_likes !== input.validLikes ||
                    existing.units !== units ||
                    existing.receipt_id !== expectedReceiptId) {
                    throw new CareerDomainError("reporter_evaluation_conflict", "The reporter evaluation was already settled with another result");
                }
                return { performanceGold: existing.performance_gold, units: existing.units };
            }
            if (units === 0 && input.wageReceipt) {
                throw new CareerDomainError("performance_wage_receipt_unexpected", "A zero reporter evaluation cannot have a wage receipt");
            }
            if (units === 0) {
                this.#database
                    .prepare(`INSERT INTO career_reporter_evaluation_settlements (
               settlement_id, job_id, resident_id, source_reference, idempotency_key,
               valid_likes, units, performance_gold, receipt_id, settled_at
             ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)`)
                    .run(this.#generateId(), job.job_id, job.worker_resident_id, input.sourceReference, input.idempotencyKey, input.validLikes, now);
                return { performanceGold: 0, units: 0 };
            }
            if (!input.wageReceipt) {
                throw new CareerDomainError("performance_wage_receipt_required", "Reporter evaluation performance needs its authoritative gold wage receipt");
            }
            recordFinancialReceipt(this.#database, input.wageReceipt, {
                amount: performanceGold,
                businessReference: `career-job:${job.job_id}:evaluation-performance`,
                currency: "gold",
                kind: "system_gold_credit",
                residentId: job.worker_resident_id,
            }, now);
            this.#database
                .prepare(`INSERT INTO career_performance_adjustments (
             adjustment_id, job_id, resident_id, units, performance_gold,
             receipt_id, source_reference, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(this.#generateId(), job.job_id, job.worker_resident_id, units, performanceGold, input.wageReceipt.receiptId, input.sourceReference, now);
            this.#database
                .prepare(`INSERT INTO career_reporter_evaluation_settlements (
             settlement_id, job_id, resident_id, source_reference, idempotency_key,
             valid_likes, units, performance_gold, receipt_id, settled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(this.#generateId(), job.job_id, job.worker_resident_id, input.sourceReference, input.idempotencyKey, input.validLikes, units, performanceGold, input.wageReceipt.receiptId, now);
            return { performanceGold, units };
        });
    }
    getJob(jobId) {
        return mapJob(this.#requireJob(jobId));
    }
    #bindWorker(jobId, workerResidentId, status) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(jobId);
            if (job.status === status && job.worker_resident_id === workerResidentId)
                return mapJob(job);
            if (job.status !== "available" || job.assignment_mode !== status) {
                throw new CareerDomainError("job_not_bindable", "The job cannot use this binding mode");
            }
            const workerLevel = job.service_commission
                ? this.#requireServiceCandidate(job, workerResidentId, now)
                : requireActiveCertificate(this.#database, workerResidentId, job.career, job.required_level, now);
            if (!job.service_commission && job.career === "agronomist") {
                const activeJobs = this.#database
                    .prepare(`SELECT COUNT(*) AS count FROM career_jobs
             WHERE worker_resident_id = ? AND career = 'agronomist'
               AND status IN ('accepted', 'active')`)
                    .get(workerResidentId);
                if (activeJobs.count >= AGRONOMIST_CONCURRENT_CAPACITY[workerLevel]) {
                    throw new CareerDomainError("career_job_capacity_reached", "The agronomist has reached the qualification-level commission capacity");
                }
            }
            if (!job.service_commission && (job.career === "veterinarian" || job.career === "constable")) {
                const activeJobs = this.#database
                    .prepare(`SELECT COUNT(*) AS count FROM career_jobs
             WHERE worker_resident_id = ? AND career = ?
               AND status IN ('assigned', 'active')`)
                    .get(workerResidentId, job.career);
                if (activeJobs.count >= INSTITUTION_ASSIGNED_CONCURRENT_CAPACITY[workerLevel]) {
                    throw new CareerDomainError("career_job_capacity_reached", "The institution worker has reached the qualification-level assignment capacity");
                }
            }
            const institution = institutionForCareer(job.career);
            if (institution && !job.service_commission) {
                const duty = this.#database
                    .prepare(`SELECT 1 FROM career_duty_days
             WHERE resident_id = ? AND career = ? AND institution = ? AND duty_date = ?
               AND status = 'scheduled'`)
                    .get(workerResidentId, job.career, institution, beijingDate(now));
                if (!duty) {
                    throw new CareerDomainError("active_duty_required", "Public institution work requires a scheduled duty day");
                }
            }
            this.#database
                .prepare(`UPDATE career_jobs SET status = ?, worker_resident_id = ?,
                  accepted_at = CASE WHEN service_commission = 1 THEN ? ELSE accepted_at END,
                  accepted_day = CASE WHEN service_commission = 1 THEN ? ELSE accepted_day END,
                  updated_at = ?
           WHERE job_id = ?`)
                .run(status, workerResidentId, now, beijingDate(now), now, jobId);
            return mapJob(this.#requireJob(jobId));
        });
    }
    #requireServiceCandidate(job, workerResidentId, now) {
        if (!job.service_commission || !["agronomist", "veterinarian"].includes(job.career)) {
            throw new CareerDomainError("service_commission_contract_invalid", "The job is not a real service commission");
        }
        if (job.owner_resident_id === workerResidentId) {
            throw new CareerDomainError("service_commission_owner_cannot_accept", "The owner cannot accept this commission");
        }
        if (this.#assignmentExclusions(job.job_id).includes(workerResidentId)) {
            throw new CareerDomainError("service_commission_worker_excluded", "This resident is excluded from the commission");
        }
        if (job.service_audience === "owner_choice" ||
            (job.service_audience === "targeted" && job.target_resident_id !== workerResidentId)) {
            throw new CareerDomainError("service_commission_target_mismatch", "This commission is not available to the resident");
        }
        if (!["public", "targeted"].includes(job.service_audience)) {
            throw new CareerDomainError("service_commission_contract_invalid", "The service commission audience is invalid");
        }
        const workerLevel = requireActiveCertificate(this.#database, workerResidentId,
            job.career, job.required_level, now);
        const availability = this.getServiceCommissionAvailability(workerResidentId, job.career);
        if (availability.activeJobId) {
            throw new CareerDomainError("service_commission_active_job", "The worker already has an unfinished service commission");
        }
        if (availability.acceptedToday >= availability.dailyLimit) {
            throw new CareerDomainError("service_commission_daily_limit", "The worker has reached today's service commission limit");
        }
        if (availability.remainingRestMs > 0) {
            const error = new CareerDomainError("service_commission_resting", "The worker is resting after the last completed commission");
            error.restUntil = availability.restUntil;
            error.remainingRestMs = availability.remainingRestMs;
            throw error;
        }
        if (job.career === "veterinarian") {
            const duty = this.#database.prepare(`SELECT 1
              FROM career_duty_days AS duty
              JOIN career_employments AS employment
                ON employment.employment_id = duty.employment_id
              WHERE duty.resident_id = ? AND duty.career = 'veterinarian'
                AND duty.institution = 'animal_hospital' AND duty.duty_date = ?
                AND duty.status = 'scheduled' AND employment.status = 'active'
                AND employment.availability = 'available'`)
                .get(workerResidentId, beijingDate(now));
            if (!duty) {
                throw new CareerDomainError("active_duty_required", "Animal hospital work requires a scheduled duty day");
            }
        }
        return workerLevel;
    }
    #assertAssignmentMode(career, mode) {
        const valid = ((career === "chef" || career === "agronomist") && mode === "self") ||
            ((career === "agronomist" || career === "reporter") && mode === "accepted") ||
            (career === "veterinarian" && ["accepted", "assigned"].includes(mode)) ||
            (career === "constable" && mode === "assigned");
        if (!valid) {
            throw new CareerDomainError("invalid_job_assignment_mode", "The assignment mode does not match the confirmed career workflow");
        }
    }
    #acquireObjectLock(job, now) {
        const existing = this.#database
            .prepare(`SELECT job_id FROM career_job_object_locks WHERE object_type = ? AND object_id = ?`)
            .get(job.object_type, job.object_id);
        if (existing) {
            if (existing.job_id === job.job_id)
                return;
            throw new CareerDomainError("job_object_locked", "The real object is already being handled by another job");
        }
        this.#database
            .prepare(`INSERT INTO career_job_object_locks (object_type, object_id, job_id, locked_at)
         VALUES (?, ?, ?, ?)`)
            .run(job.object_type, job.object_id, job.job_id, now);
    }
    #releaseObjectLock(jobId) {
        this.#database.prepare("DELETE FROM career_job_object_locks WHERE job_id = ?").run(jobId);
    }
    #requireWorkerJob(jobId, workerResidentId) {
        const job = this.#requireJob(jobId);
        if (job.worker_resident_id !== workerResidentId) {
            throw new CareerDomainError("job_worker_mismatch", "The job belongs to another worker");
        }
        return job;
    }
    #requireJob(jobId) {
        const job = this.#database.prepare("SELECT * FROM career_jobs WHERE job_id = ?").get(jobId);
        if (!job)
            throw new CareerDomainError("job_not_found", "Job not found");
        return job;
    }
}
function isTerminal(status) {
    return ["completed", "cancelled", "transferred", "expired"].includes(status);
}
function mapJob(row) {
    return {
        acceptedAt: row.accepted_at,
        acceptedDay: row.accepted_day,
        assignmentMode: row.assignment_mode,
        career: row.career,
        createdAt: row.created_at,
        decisionCount: row.decision_count,
        difficultyLevel: row.difficulty_level,
        endedAt: row.ended_at,
        hasIrreversibleAction: Boolean(row.has_irreversible_action),
        jobId: row.job_id,
        objectId: row.object_id,
        objectType: row.object_type,
        ownerResidentId: row.owner_resident_id,
        parentJobId: row.parent_job_id,
        paymentReference: row.payment_reference,
        requiredLevel: row.required_level,
        serviceAudience: row.service_audience,
        serviceCommission: Boolean(row.service_commission),
        sourceId: row.source_id,
        sourceType: row.source_type,
        startedAt: row.started_at,
        status: row.status,
        targetResidentId: row.target_resident_id,
        updatedAt: row.updated_at,
        workerResidentId: row.worker_resident_id,
        worldResultReference: row.world_result_reference,
    };
}
