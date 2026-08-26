import { randomUUID } from "node:crypto";
import { BASE_WAGE_GOLD, CAREER_INSTITUTION, CareerDomainError, INSTITUTION_SEAT_LIMIT, PERFORMANCE_PAY_GOLD, } from "./contracts.js";
import { activeCertificateLevel, addBeijingDays, beijingDate, beijingTimestamp, recordFinancialReceipt, requireActiveCertificate, runInTransaction, } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
export class CareerEmploymentService {
    #database;
    #now;
    #generateId;
    constructor(options) {
        this.#database = options.database;
        this.#now = options.now ?? Date.now;
        this.#generateId = options.generateId ?? randomUUID;
        installCareerSchema(this.#database);
    }
    hire(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            if (CAREER_INSTITUTION[input.career] !== input.institution) {
                throw new CareerDomainError("institution_career_mismatch", "The career does not work for this institution");
            }
            requireActiveCertificate(this.#database, input.residentId, input.career, 1);
            const existingById = this.#database
                .prepare("SELECT * FROM career_employments WHERE employment_id = ?")
                .get(input.employmentId);
            if (existingById) {
                if (existingById.resident_id !== input.residentId ||
                    existingById.career !== input.career ||
                    existingById.institution !== input.institution) {
                    throw new CareerDomainError("employment_id_conflict", "The employment id is already in use");
                }
                return {
                    employmentId: existingById.employment_id,
                    seatNumber: existingById.seat_number,
                };
            }
            const existingEmployment = this.#database
                .prepare(`SELECT 1 FROM career_employments WHERE resident_id = ? AND status = 'active'`)
                .get(input.residentId);
            if (existingEmployment) {
                throw new CareerDomainError("resident_already_employed", "A resident may hold only one public institution employment");
            }
            const seats = new Set(this.#database
                .prepare(`SELECT seat_number FROM career_employments
               WHERE institution = ? AND status = 'active'`)
                .all(input.institution).map((row) => row.seat_number));
            let seatNumber = null;
            for (let candidate = 1; candidate <= INSTITUTION_SEAT_LIMIT; candidate += 1) {
                if (!seats.has(candidate)) {
                    seatNumber = candidate;
                    break;
                }
            }
            if (seatNumber === null) {
                throw new CareerDomainError("institution_full", "The institution has no open seat");
            }
            this.#database
                .prepare(`INSERT INTO career_employments (
             employment_id, resident_id, career, institution, seat_number,
             status, availability, hired_at
           ) VALUES (?, ?, ?, ?, ?, 'active', 'available', ?)`)
                .run(input.employmentId, input.residentId, input.career, input.institution, seatNumber, now);
            return { employmentId: input.employmentId, seatNumber };
        });
    }
    setAvailability(employmentId, availability) {
        const now = this.#now();
        runInTransaction(this.#database, () => {
            const employment = this.#requireEmployment(employmentId);
            if (employment.status !== "active") {
                throw new CareerDomainError("employment_not_active", "The employment already ended");
            }
            this.#database
                .prepare("UPDATE career_employments SET availability = ? WHERE employment_id = ?")
                .run(availability, employmentId);
            if (availability !== "available") {
                this.#invalidateDutyDays(employmentId, beijingDate(now), now);
            }
        });
    }
    endEmployment(employmentId) {
        const now = this.#now();
        runInTransaction(this.#database, () => {
            const employment = this.#requireEmployment(employmentId);
            if (employment.status === "ended")
                return;
            this.#database
                .prepare(`UPDATE career_employments SET status = 'ended', ended_at = ? WHERE employment_id = ?`)
                .run(now, employmentId);
            this.#invalidateDutyDays(employmentId, beijingDate(now), now);
        });
    }
    generateNextDutyDays() {
        const now = this.#now();
        const dutyDate = addBeijingDays(beijingDate(now), 1);
        return runInTransaction(this.#database, () => {
            const employments = this.#database
                .prepare(`SELECT * FROM career_employments
           WHERE status = 'active' AND availability = 'available'
           ORDER BY institution, seat_number`)
                .all();
            const result = [];
            for (const employment of employments) {
                const existing = this.#database
                    .prepare(`SELECT duty_id, status FROM career_duty_days
             WHERE employment_id = ? AND duty_date = ?`)
                    .get(employment.employment_id, dutyDate);
                if (existing) {
                    if (existing.status === "invalidated") {
                        const level = activeCertificateLevel(this.#database, employment.resident_id, employment.career);
                        if (level === null)
                            continue;
                        this.#database
                            .prepare(`UPDATE career_duty_days
                 SET status = 'scheduled', qualification_level = ?, base_wage_gold = ?,
                     generated_at = ?, invalidated_at = NULL
                 WHERE duty_id = ?`)
                            .run(level, BASE_WAGE_GOLD[level], now, existing.duty_id);
                    }
                    result.push({
                        dutyDate,
                        dutyId: existing.duty_id,
                        residentId: employment.resident_id,
                    });
                    continue;
                }
                const level = activeCertificateLevel(this.#database, employment.resident_id, employment.career);
                if (level === null)
                    continue;
                const dutyId = this.#generateId();
                this.#database
                    .prepare(`INSERT INTO career_duty_days (
               duty_id, employment_id, resident_id, career, institution, duty_date,
               qualification_level, base_wage_gold, status, generated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`)
                    .run(dutyId, employment.employment_id, employment.resident_id, employment.career, employment.institution, dutyDate, level, BASE_WAGE_GOLD[level], now);
                result.push({ dutyDate, dutyId, residentId: employment.resident_id });
            }
            return result;
        });
    }
    hasScheduledDuty(residentId, career, dutyDate) {
        return Boolean(this.#database
            .prepare(`SELECT 1 FROM career_duty_days
           WHERE resident_id = ? AND career = ? AND duty_date = ? AND status = 'scheduled'`)
            .get(residentId, career, dutyDate));
    }
    settleDutyDay(dutyId, wageReceipt) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const duty = this.#requireDuty(dutyId);
            const windowEnd = beijingTimestamp(addBeijingDays(duty.duty_date, 1), 0);
            if (now < windowEnd) {
                throw new CareerDomainError("duty_day_not_finished", "The duty day is not finished");
            }
            if (duty.status === "invalidated") {
                throw new CareerDomainError("duty_day_invalidated", "The duty day is not payable");
            }
            const work = this.#database
                .prepare(`SELECT COALESCE(SUM(w.performance_units), 0) AS units
           FROM career_work_records w
           JOIN career_jobs j ON j.job_id = w.job_id
           WHERE w.resident_id = ? AND w.career = ? AND w.record_kind = 'completed'
             AND j.ended_at >= ? AND j.ended_at < ?`)
                .get(duty.resident_id, duty.career, beijingTimestamp(duty.duty_date, 0), windowEnd);
            const performanceUnits = work.units;
            const performanceGold = performanceUnits * PERFORMANCE_PAY_GOLD[duty.qualification_level];
            const totalGold = duty.base_wage_gold + performanceGold;
            if (duty.status === "settled") {
                if (duty.wage_receipt_id !== wageReceipt.receiptId) {
                    throw new CareerDomainError("duty_wage_conflict", "The duty wage was already settled");
                }
                return {
                    baseGold: duty.base_wage_gold,
                    performanceGold: duty.performance_gold,
                    performanceUnits: duty.performance_units,
                    totalGold: duty.base_wage_gold + duty.performance_gold,
                };
            }
            recordFinancialReceipt(this.#database, wageReceipt, {
                amount: totalGold,
                businessReference: `career-duty:${dutyId}:wage`,
                currency: "gold",
                kind: "system_gold_credit",
                residentId: duty.resident_id,
            }, now);
            this.#database
                .prepare(`UPDATE career_duty_days
           SET status = 'settled', settled_at = ?, performance_units = ?,
               performance_gold = ?, wage_receipt_id = ?
           WHERE duty_id = ?`)
                .run(now, performanceUnits, performanceGold, wageReceipt.receiptId, dutyId);
            return {
                baseGold: duty.base_wage_gold,
                performanceGold,
                performanceUnits,
                totalGold,
            };
        });
    }
    #invalidateDutyDays(employmentId, fromDate, now) {
        this.#database
            .prepare(`UPDATE career_duty_days
         SET status = 'invalidated', invalidated_at = ?
         WHERE employment_id = ? AND duty_date >= ? AND status = 'scheduled'`)
            .run(now, employmentId, fromDate);
    }
    #requireEmployment(employmentId) {
        const employment = this.#database
            .prepare("SELECT * FROM career_employments WHERE employment_id = ?")
            .get(employmentId);
        if (!employment)
            throw new CareerDomainError("employment_not_found", "Employment not found");
        return employment;
    }
    #requireDuty(dutyId) {
        const duty = this.#database
            .prepare("SELECT * FROM career_duty_days WHERE duty_id = ?")
            .get(dutyId);
        if (!duty)
            throw new CareerDomainError("duty_day_not_found", "Duty day not found");
        return duty;
    }
}
