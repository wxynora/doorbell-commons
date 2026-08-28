import { CareerDomainError, institutionForCareer } from "./contracts.js";
import {
    createCareerAuthorityJobBinder,
    INSTITUTION_ASSIGNED_CONCURRENT_CAPACITY,
} from "./job-service.js";
import { beijingDate, runInTransaction } from "./persistence.js";

export class CareerAuthorityAssignmentService {
    #assignJob;
    #database;
    #jobs;
    #now;
    constructor(options) {
        this.#database = options.database;
        this.#jobs = options.jobs;
        this.#now = options.now ?? Date.now;
        this.#assignJob = createCareerAuthorityJobBinder(options.jobs);
    }
    assignJob(input) {
        this.#assertRequest(input);
        return runInTransaction(this.#database, () => {
            const job = this.#jobs.getJob(input.jobId);
            if (job.assignmentMode !== "assigned" ||
                (job.career !== "veterinarian" && job.career !== "constable")) {
                throw new CareerDomainError("job_not_authority_assignable", "Only veterinarian and constable assigned jobs use authoritative assignment");
            }
            if (job.workerResidentId !== null) {
                return job;
            }
            if (job.status !== "available") {
                throw new CareerDomainError("job_not_bindable", "The job cannot be assigned in its current state");
            }
            const institution = institutionForCareer(job.career);
            const candidates = this.#database
                .prepare(`SELECT duty.resident_id,
                    MAX(certificate.qualification_level) AS qualification_level,
                    (SELECT COUNT(*) FROM career_jobs active_job
                     WHERE active_job.worker_resident_id = duty.resident_id
                       AND active_job.career = duty.career
                       AND active_job.status IN ('assigned', 'active')) AS active_job_count
                 FROM career_duty_days duty
                 JOIN career_certificates certificate
                   ON certificate.resident_id = duty.resident_id
                  AND certificate.career = duty.career
                  AND certificate.status = 'active'
                 WHERE duty.career = ? AND duty.institution = ?
                   AND duty.duty_date = ? AND duty.status = 'scheduled'
                 GROUP BY duty.resident_id
                 HAVING MAX(certificate.qualification_level) >= ?
                ORDER BY active_job_count ASC, duty.resident_id COLLATE BINARY ASC`)
                .all(job.career, institution, beijingDate(this.#now()), job.requiredLevel);
            const excludedResidents = new Set(this.#database
                .prepare(`SELECT worker_resident_id FROM career_jobs
                  WHERE source_id = ? AND worker_resident_id IS NOT NULL`)
                .all(job.sourceId)
                .map((row) => row.worker_resident_id));
            if (job.ownerResidentId !== null)
                excludedResidents.add(job.ownerResidentId);
            const candidate = candidates.find((entry) =>
                !excludedResidents.has(entry.resident_id) &&
                entry.active_job_count < INSTITUTION_ASSIGNED_CONCURRENT_CAPACITY[entry.qualification_level]);
            if (!candidate) {
                throw new CareerDomainError("authoritative_worker_unavailable", "No qualified on-duty institution worker has assignment capacity");
            }
            return this.#assignJob(job.jobId, candidate.resident_id);
        });
    }
    #assertRequest(input) {
        if (!input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            Object.keys(input).length !== 1 ||
            typeof input.jobId !== "string" ||
            input.jobId.trim().length === 0) {
            throw new CareerDomainError("invalid_authority_assignment_request", "Authority assignment accepts only a job id");
        }
    }
}
