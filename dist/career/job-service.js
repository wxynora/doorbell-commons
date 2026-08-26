import { randomUUID } from "node:crypto";
import { AGRONOMIST_CONCURRENT_CAPACITY, CareerDomainError, institutionForCareer, JOB_PERFORMANCE_UNITS, PERFORMANCE_PAY_GOLD, } from "./contracts.js";
import { beijingDate, recordFinancialReceipt, requireActiveCertificate, runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
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
                    (input.assignmentMode === "self" &&
                        existing.worker_resident_id !== input.selfWorkerResidentId)) {
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
                requireActiveCertificate(this.#database, input.selfWorkerResidentId, input.career, input.requiredLevel);
                status = "accepted";
                workerResidentId = input.selfWorkerResidentId;
            }
            this.#database
                .prepare(`INSERT INTO career_jobs (
             job_id, career, source_type, source_id, object_type, object_id,
             owner_resident_id, required_level, difficulty_level, assignment_mode,
             status, worker_resident_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(input.jobId, input.career, input.sourceType, input.sourceId, input.objectType, input.objectId, input.ownerResidentId ?? null, input.requiredLevel, input.difficultyLevel, input.assignmentMode, status, workerResidentId, now, now);
            return mapJob(this.#requireJob(input.jobId));
        });
    }
    acceptJob(jobId, workerResidentId) {
        return this.#bindWorker(jobId, workerResidentId, "accepted");
    }
    assignJob(jobId, workerResidentId) {
        return this.#bindWorker(jobId, workerResidentId, "assigned");
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
            if (job.status !== "active" || job.decision_count < 2) {
                throw new CareerDomainError("job_decisions_incomplete", "A completed job needs at least two real decisions");
            }
            if (!input.validationPassed || !input.worldResultReference) {
                throw new CareerDomainError("job_completion_not_validated", "The authoritative world result did not validate completion");
            }
            let paymentReference = input.externalPaymentReference ?? null;
            if (job.career === "agronomist") {
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
            this.#database
                .prepare(`UPDATE career_jobs
           SET status = 'completed', ended_at = ?, updated_at = ?,
               world_result_reference = ?, payment_reference = ?
           WHERE job_id = ?`)
                .run(now, now, input.worldResultReference, paymentReference, job.job_id);
            this.#releaseObjectLock(job.job_id);
            const level = requireActiveCertificate(this.#database, input.workerResidentId, job.career, job.required_level);
            const performanceUnits = institutionForCareer(job.career)
                ? JOB_PERFORMANCE_UNITS[job.difficulty_level]
                : 0;
            this.#database
                .prepare(`INSERT INTO career_work_records (
             work_record_id, job_id, resident_id, career, qualification_level,
             difficulty_level, record_kind, performance_units, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`)
                .run(this.#generateId(), job.job_id, input.workerResidentId, job.career, level, job.difficulty_level, performanceUnits, now);
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
            const level = requireActiveCertificate(this.#database, input.workerResidentId, job.career, job.required_level);
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
             status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`)
                .run(input.successorJobId, job.job_id, job.career, successorSourceType, input.successorSourceId, job.object_type, job.object_id, job.owner_resident_id, job.required_level, job.difficulty_level, job.assignment_mode, now, now);
            return {
                successor: mapJob(this.#requireJob(input.successorJobId)),
                transferred: mapJob(this.#requireJob(job.job_id)),
            };
        });
    }
    addReporterLikePerformance(input) {
        if (!Number.isInteger(input.validLikes) || input.validLikes < 0) {
            throw new CareerDomainError("invalid_like_count", "Valid likes must be a nonnegative integer");
        }
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const job = this.#requireJob(input.jobId);
            if (job.career !== "reporter" || job.status !== "completed" || !job.worker_resident_id) {
                throw new CareerDomainError("reporter_performance_unavailable", "Only a published completed reporter job can receive evaluation performance");
            }
            const units = input.validLikes >= 30 ? 3 : input.validLikes >= 15 ? 2 : input.validLikes >= 5 ? 1 : 0;
            const existing = this.#database
                .prepare(`SELECT units, performance_gold, receipt_id
           FROM career_performance_adjustments WHERE source_reference = ?`)
                .get(input.sourceReference);
            if (existing) {
                if (existing.units !== units || existing.receipt_id !== input.wageReceipt?.receiptId) {
                    throw new CareerDomainError("performance_adjustment_conflict", "The evaluation source was already applied with another result");
                }
                return { performanceGold: existing.performance_gold, units };
            }
            if (units === 0)
                return { performanceGold: 0, units: 0 };
            if (!input.wageReceipt) {
                throw new CareerDomainError("performance_wage_receipt_required", "Reporter evaluation performance needs its authoritative gold wage receipt");
            }
            const workRecord = this.#database
                .prepare(`SELECT qualification_level FROM career_work_records
           WHERE job_id = ? AND resident_id = ? AND record_kind = 'completed'`)
                .get(job.job_id, job.worker_resident_id);
            if (!workRecord) {
                throw new CareerDomainError("reporter_work_record_missing", "The completed reporter work record is missing");
            }
            const performanceGold = units * PERFORMANCE_PAY_GOLD[workRecord.qualification_level];
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
            const workerLevel = requireActiveCertificate(this.#database, workerResidentId, job.career, job.required_level);
            if (job.career === "agronomist") {
                const activeJobs = this.#database
                    .prepare(`SELECT COUNT(*) AS count FROM career_jobs
             WHERE worker_resident_id = ? AND career = 'agronomist'
               AND status IN ('accepted', 'active')`)
                    .get(workerResidentId);
                if (activeJobs.count >= AGRONOMIST_CONCURRENT_CAPACITY[workerLevel]) {
                    throw new CareerDomainError("career_job_capacity_reached", "The agronomist has reached the qualification-level commission capacity");
                }
            }
            const institution = institutionForCareer(job.career);
            if (institution) {
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
                .prepare(`UPDATE career_jobs SET status = ?, worker_resident_id = ?, updated_at = ?
           WHERE job_id = ?`)
                .run(status, workerResidentId, now, jobId);
            return mapJob(this.#requireJob(jobId));
        });
    }
    #assertAssignmentMode(career, mode) {
        const valid = (career === "chef" && mode === "self") ||
            ((career === "agronomist" || career === "reporter") && mode === "accepted") ||
            ((career === "veterinarian" || career === "constable") && mode === "assigned");
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
        sourceId: row.source_id,
        sourceType: row.source_type,
        startedAt: row.started_at,
        status: row.status,
        updatedAt: row.updated_at,
        workerResidentId: row.worker_resident_id,
        worldResultReference: row.world_result_reference,
    };
}
