import { createHash, randomInt, randomUUID } from "node:crypto";
import { installSecuritySchema } from "./schema.js";

export const FARM_CROP_THEFT_VIOLATION = "farm_crop_theft";
export const BANK_SYSTEM_LOAN_REFUSAL_VIOLATION = "bank_system_loan_refusal";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const PATROL_WINDOW_MS = 30 * 60 * 1_000;
const PATROL_BAND_MS = 8 * HOUR_MS;
const THEFT_ROLLING_WINDOW_MS = 72 * HOUR_MS;

const THEFT_PENALTIES = Object.freeze([
    Object.freeze({ maximumOccurrence: 3, durationHours: 4, hourlyReleaseRateGold: 500 }),
    Object.freeze({ maximumOccurrence: 7, durationHours: 12, hourlyReleaseRateGold: 500 }),
    Object.freeze({ maximumOccurrence: 11, durationHours: 48, hourlyReleaseRateGold: 500 }),
    Object.freeze({ maximumOccurrence: Number.POSITIVE_INFINITY, durationHours: 72, hourlyReleaseRateGold: 500 }),
]);

export class SecurityDomainError extends Error {
    constructor(code, details = {}) {
        super(code);
        this.name = "SecurityDomainError";
        this.code = code;
        this.details = details;
    }
}
function fail(code, details) {
    throw new SecurityDomainError(code, details);
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("security_database_required");
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`security_invalid_${field}`);
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`security_invalid_${field}`);
    return value;
}

function canonical(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("security_invalid_payload");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((entry) => canonical(entry)).join(",")}]`;
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    fail("security_invalid_payload");
}

function payloadHash(value) {
    return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        fail("security_corrupt_receipt");
    }
}

let transactionSequence = 0;
function runImmediate(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `security_tx_${++transactionSequence}`;
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

function beijingDate(timestampValue) {
    return new Date(timestampValue + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function beijingDayStart(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        fail("security_invalid_beijing_date");
    const value = Date.parse(`${date}T00:00:00+08:00`);
    if (!Number.isSafeInteger(value) || beijingDate(value) !== date)
        fail("security_invalid_beijing_date");
    return value;
}

function mapViolation(row) {
    return {
        violationId: row.violation_id,
        violationCode: row.violation_code,
        sourceId: row.source_id,
        residentId: row.resident_id,
        occurredAt: row.occurred_at,
        caughtAt: row.caught_at,
        caughtBy: row.caught_by,
        repetitionIndex: row.repetition_index,
        createdAt: row.created_at,
    };
}

function mapDetention(row) {
    return {
        detentionId: row.detention_id,
        violationId: row.violation_id,
        residentId: row.resident_id,
        startedAt: row.started_at,
        scheduledReleaseAt: row.scheduled_release_at,
        hourlyReleaseRateGold: row.hourly_release_rate_gold,
        status: row.status,
        releasedAt: row.released_at,
        releaseKind: row.release_kind,
        releasePaymentReceiptId: row.release_payment_receipt_id,
        earlyReleaseAmountGold: row.early_release_amount_gold,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function assertSyncResult(value, code) {
    if (value && typeof value.then === "function")
        fail(code);
    return value;
}

function normalizeCaughtBy(value) {
    if (value === "npc_patrol" || value === "human_constable")
        return value;
    fail("security_invalid_caught_by");
}

export class LingyeSecurityService {
    #database;
    #now;
    #generateId;
    #randomOffset;
    #getCaughtCropTheftFact;
    #authorizeConstableCatch;
    #listPunishableSystemLoanFacts;
    #getPunishableSystemLoanFact;
    #payDetentionEarlyRelease;

    constructor(database, options = {}) {
        assertDatabase(database);
        installSecuritySchema(database);
        this.#database = database;
        this.#now = options.now ?? (() => Date.now());
        this.#generateId = options.generateId ?? (() => randomUUID());
        this.#randomOffset = options.randomOffset ?? ((maximumInclusive) => randomInt(0, maximumInclusive + 1));
        this.#getCaughtCropTheftFact = options.getCaughtCropTheftFact ?? null;
        this.#authorizeConstableCatch = options.authorizeConstableCatch ?? null;
        this.#listPunishableSystemLoanFacts = options.listPunishableSystemLoanFacts ?? null;
        this.#getPunishableSystemLoanFact = options.getPunishableSystemLoanFact ?? null;
        this.#payDetentionEarlyRelease = options.payDetentionEarlyRelease ?? null;
    }

    getPatrolStatus() {
        const at = timestamp(this.#now(), "timestamp");
        return this.#patrolStatusAt(at);
    }

    #patrolStatusAt(at) {
        const schedule = this.#ensurePatrolDay(beijingDate(at), at);
        const currentWindow = schedule.windows.find((window) => at >= window.startedAt && at < window.endedAt) ?? null;
        const constableAvailable = this.#constableOnDuty(at);
        const patrolling = currentWindow !== null && !constableAvailable;
        return {
            beijingDate: schedule.beijingDate,
            status: patrolling ? "patrolling" : "idle",
            currentWindow: patrolling ? currentWindow : null,
        };
    }

    catchCropTheft(input) {
        const sourceId = identifier(input.sourceId, "source_id");
        const caughtBy = normalizeCaughtBy(input.caughtBy);
        const existing = this.#violationBySource(FARM_CROP_THEFT_VIOLATION, sourceId);
        if (existing)
            return this.#resultForViolation(existing);
        if (typeof this.#getCaughtCropTheftFact !== "function")
            fail("security_crop_theft_authority_unavailable");
        const fact = assertSyncResult(this.#getCaughtCropTheftFact({ sourceId }), "security_async_authority_forbidden");
        if (!fact || fact.sourceId !== sourceId || fact.kind !== "stolen" || fact.successful !== true)
            fail("security_crop_theft_not_caught");
        const residentId = identifier(fact.residentId, "resident_id");
        const occurredAt = timestamp(fact.occurredAt, "occurred_at");
        const caughtAt = timestamp(this.#now(), "caught_at");
        if (occurredAt > caughtAt)
            fail("security_crop_theft_not_caught");
        this.#assertCatchAuthority({ caughtBy, actorResidentId: input.actorResidentId, sourceId, occurredAt, caughtAt });
        return runImmediate(this.#database, () => {
            const replay = this.#violationBySource(FARM_CROP_THEFT_VIOLATION, sourceId);
            if (replay)
                return this.#resultForViolation(replay);
            this.#refreshNaturalRelease(residentId, caughtAt);
            const lowerBound = caughtAt - THEFT_ROLLING_WINDOW_MS;
            const previous = this.#database.prepare(`
              SELECT COUNT(*) AS count
              FROM security_violations
              WHERE resident_id = ? AND violation_code = ?
                AND caught_at > ? AND caught_at <= ?
            `).get(residentId, FARM_CROP_THEFT_VIOLATION, lowerBound, caughtAt).count;
            const repetitionIndex = previous + 1;
            const penalty = THEFT_PENALTIES.find((entry) => repetitionIndex <= entry.maximumOccurrence);
            return this.#createViolationAndDetention({
                violationCode: FARM_CROP_THEFT_VIOLATION,
                sourceId,
                residentId,
                occurredAt,
                caughtAt,
                caughtBy,
                repetitionIndex,
                durationHours: penalty.durationHours,
                hourlyReleaseRateGold: penalty.hourlyReleaseRateGold,
            });
        });
    }

    catchPunishableSystemLoan(input) {
        const loanId = identifier(input.loanId, "loan_id");
        const caughtBy = normalizeCaughtBy(input.caughtBy);
        const existing = this.#violationBySource(BANK_SYSTEM_LOAN_REFUSAL_VIOLATION, loanId);
        if (existing)
            return this.#resultForViolation(existing);
        if (typeof this.#getPunishableSystemLoanFact !== "function")
            fail("security_system_loan_authority_unavailable");
        const fact = assertSyncResult(this.#getPunishableSystemLoanFact({ loanId }), "security_async_authority_forbidden");
        if (!fact || fact.loanId !== loanId || fact.punishable !== true)
            fail("security_system_loan_not_punishable");
        const residentId = identifier(fact.borrowerResidentId ?? fact.residentId, "resident_id");
        const occurredAt = fact.punishableAt === undefined && fact.graceEndedAt === undefined
            ? timestamp(fact.punishableSinceDay, "punishable_since_day") * DAY_MS - BEIJING_OFFSET_MS
            : timestamp(fact.punishableAt ?? fact.graceEndedAt, "occurred_at");
        const caughtAt = timestamp(this.#now(), "caught_at");
        if (occurredAt > caughtAt)
            fail("security_system_loan_not_punishable");
        this.#assertCatchAuthority({ caughtBy, actorResidentId: input.actorResidentId, sourceId: loanId, occurredAt: caughtAt, caughtAt });
        return runImmediate(this.#database, () => {
            const replay = this.#violationBySource(BANK_SYSTEM_LOAN_REFUSAL_VIOLATION, loanId);
            if (replay)
                return this.#resultForViolation(replay);
            this.#refreshNaturalRelease(residentId, caughtAt);
            return this.#createViolationAndDetention({
                violationCode: BANK_SYSTEM_LOAN_REFUSAL_VIOLATION,
                sourceId: loanId,
                residentId,
                occurredAt,
                caughtAt,
                caughtBy,
                repetitionIndex: null,
                durationHours: 12,
                hourlyReleaseRateGold: 1_000,
            });
        });
    }

    runNpcLoanPatrol() {
        const at = timestamp(this.#now(), "timestamp");
        if (this.#patrolStatusAt(at).status !== "patrolling")
            return [];
        if (typeof this.#listPunishableSystemLoanFacts !== "function")
            fail("security_system_loan_authority_unavailable");
        const facts = assertSyncResult(
            this.#listPunishableSystemLoanFacts({}),
            "security_async_authority_forbidden",
        );
        if (!Array.isArray(facts))
            fail("security_invalid_system_loan_authority");
        return facts.map((fact) => this.catchPunishableSystemLoan({
            loanId: identifier(fact?.loanId, "loan_id"),
            caughtBy: "npc_patrol",
        }));
    }

    getResidentDetention(residentIdInput) {
        const residentId = identifier(residentIdInput, "resident_id");
        const at = timestamp(this.#now(), "timestamp");
        return runImmediate(this.#database, () => {
            this.#refreshNaturalRelease(residentId, at);
            const row = this.#database.prepare(`
              SELECT * FROM security_detentions
              WHERE resident_id = ?
              ORDER BY (status = 'active') DESC, started_at DESC, detention_id DESC
              LIMIT 1
            `).get(residentId);
            return row ? mapDetention(row) : null;
        });
    }

    listResidentDetentions(residentIdInput, input = {}) {
        const residentId = identifier(residentIdInput, "resident_id");
        const at = timestamp(this.#now(), "timestamp");
        return runImmediate(this.#database, () => {
            this.#refreshNaturalRelease(residentId, at);
            const activeOnly = input.activeOnly === true;
            return this.#database.prepare(`
              SELECT * FROM security_detentions
              WHERE resident_id = ? ${activeOnly ? "AND status = 'active'" : ""}
              ORDER BY started_at DESC, detention_id DESC
            `).all(residentId).map(mapDetention);
        });
    }

    isResidentDetained(residentId) {
        return this.listResidentDetentions(residentId, { activeOnly: true }).length > 0;
    }

    quoteEarlyRelease(input) {
        const residentId = identifier(input.residentId, "resident_id");
        const detentionId = identifier(input.detentionId, "detention_id");
        const at = timestamp(this.#now(), "timestamp");
        return runImmediate(this.#database, () => {
            this.#refreshNaturalRelease(residentId, at);
            const detention = this.#requiredResidentDetention(residentId, detentionId);
            if (detention.status !== "active")
                return { detention: mapDetention(detention), amountGold: 0 };
            return {
                detention: mapDetention(detention),
                amountGold: this.#earlyReleaseAmount(detention, at),
            };
        });
    }

    releaseEarly(input) {
        const residentId = identifier(input.residentId, "resident_id");
        const detentionId = identifier(input.detentionId, "detention_id");
        const idempotencyKey = identifier(input.idempotencyKey, "idempotency_key");
        const hash = payloadHash({ residentId, detentionId });
        const replay = this.#actionReplay(idempotencyKey, residentId, hash);
        if (replay)
            return replay;
        if (typeof this.#payDetentionEarlyRelease !== "function")
            fail("security_early_release_payment_unavailable");
        return runImmediate(this.#database, () => {
            const insideReplay = this.#actionReplay(idempotencyKey, residentId, hash);
            if (insideReplay)
                return insideReplay;
            const now = timestamp(this.#now(), "timestamp");
            this.#refreshNaturalRelease(residentId, now);
            const detention = this.#requiredResidentDetention(residentId, detentionId);
            if (detention.status !== "active") {
                const result = { detention: mapDetention(detention), amountGold: 0, paymentReceiptId: null };
                this.#recordAction(idempotencyKey, residentId, hash, result, now);
                return result;
            }
            const amountGold = this.#earlyReleaseAmount(detention, now);
            const payment = assertSyncResult(this.#payDetentionEarlyRelease({
                residentId,
                detentionId,
                amount: amountGold,
                idempotencyKey,
            }), "security_async_payment_forbidden");
            const paymentReceiptId = this.#validateEarlyReleasePayment(
                payment,
                residentId,
                detentionId,
                amountGold,
            );
            this.#database.prepare(`
              UPDATE security_detentions
              SET status = 'released', released_at = ?, release_kind = 'paid',
                  release_payment_receipt_id = ?, early_release_amount_gold = ?, updated_at = ?
              WHERE detention_id = ? AND resident_id = ? AND status = 'active'
            `).run(now, paymentReceiptId, amountGold, now, detentionId, residentId);
            const released = this.#requiredResidentDetention(residentId, detentionId);
            const result = { detention: mapDetention(released), amountGold, paymentReceiptId };
            this.#recordAction(idempotencyKey, residentId, hash, result, now);
            return result;
        });
    }

    #ensurePatrolDay(date, generatedAt) {
        let row = this.#database.prepare("SELECT * FROM security_patrol_days WHERE beijing_date = ?").get(date);
        if (!row) {
            row = runImmediate(this.#database, () => {
                const replay = this.#database.prepare("SELECT * FROM security_patrol_days WHERE beijing_date = ?").get(date);
                if (replay)
                    return replay;
                const start = beijingDayStart(date);
                const maximumOffset = PATROL_BAND_MS - PATROL_WINDOW_MS;
                const starts = [0, 1, 2].map((band) => {
                    const offset = this.#randomOffset(maximumOffset);
                    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset)
                        fail("security_invalid_random_offset");
                    return start + band * PATROL_BAND_MS + offset;
                });
                this.#database.prepare(`
                  INSERT INTO security_patrol_days (
                    beijing_date,
                    first_started_at, first_ended_at,
                    second_started_at, second_ended_at,
                    third_started_at, third_ended_at,
                    generated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(date,
                    starts[0], starts[0] + PATROL_WINDOW_MS,
                    starts[1], starts[1] + PATROL_WINDOW_MS,
                    starts[2], starts[2] + PATROL_WINDOW_MS,
                    generatedAt);
                return this.#database.prepare("SELECT * FROM security_patrol_days WHERE beijing_date = ?").get(date);
            });
        }
        return {
            beijingDate: row.beijing_date,
            windows: [
                { startedAt: row.first_started_at, endedAt: row.first_ended_at },
                { startedAt: row.second_started_at, endedAt: row.second_ended_at },
                { startedAt: row.third_started_at, endedAt: row.third_ended_at },
            ],
        };
    }

    #constableOnDuty(at) {
        const row = this.#database.prepare(`
          SELECT 1
          FROM career_employments AS employment
          JOIN career_duty_days AS duty
            ON duty.employment_id = employment.employment_id
           AND duty.resident_id = employment.resident_id
           AND duty.career = employment.career
           AND duty.institution = employment.institution
          WHERE employment.career = 'constable'
            AND employment.institution = 'public_security'
            AND employment.status = 'active'
            AND employment.availability = 'available'
            AND duty.status = 'scheduled'
            AND duty.duty_date = ?
          LIMIT 1
        `).get(beijingDate(at));
        return row !== undefined;
    }

    #assertCatchAuthority(input) {
        if (input.caughtBy === "npc_patrol") {
            if (this.#patrolStatusAt(input.occurredAt).status !== "patrolling")
                fail("security_npc_patrol_inactive");
            return;
        }
        const actorResidentId = identifier(input.actorResidentId, "actor_resident_id");
        if (typeof this.#authorizeConstableCatch !== "function")
            fail("security_constable_authority_unavailable");
        const allowed = assertSyncResult(this.#authorizeConstableCatch({
            actorResidentId,
            sourceId: input.sourceId,
            caughtAt: input.caughtAt,
        }), "security_async_authority_forbidden");
        if (allowed !== true)
            fail("security_constable_catch_forbidden");
    }

    #violationBySource(violationCode, sourceId) {
        return this.#database.prepare(`
          SELECT * FROM security_violations
          WHERE violation_code = ? AND source_id = ?
        `).get(violationCode, sourceId);
    }

    #resultForViolation(violation) {
        const detention = this.#database.prepare("SELECT * FROM security_detentions WHERE violation_id = ?")
            .get(violation.violation_id);
        if (!detention)
            fail("security_violation_without_detention");
        return { violation: mapViolation(violation), detention: mapDetention(detention) };
    }

    #createViolationAndDetention(input) {
        const violationId = identifier(this.#generateId(), "violation_id");
        const detentionId = identifier(this.#generateId(), "detention_id");
        const scheduledReleaseAt = input.caughtAt + input.durationHours * HOUR_MS;
        this.#database.prepare(`
          INSERT INTO security_violations (
            violation_id, violation_code, source_id, resident_id,
            occurred_at, caught_at, caught_by, repetition_index, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(violationId, input.violationCode, input.sourceId, input.residentId,
            input.occurredAt, input.caughtAt, input.caughtBy, input.repetitionIndex, input.caughtAt);
        this.#database.prepare(`
          INSERT INTO security_detentions (
            detention_id, violation_id, resident_id, started_at, scheduled_release_at,
            hourly_release_rate_gold, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(detentionId, violationId, input.residentId, input.caughtAt, scheduledReleaseAt,
            input.hourlyReleaseRateGold, input.caughtAt, input.caughtAt);
        return this.#resultForViolation(this.#violationBySource(input.violationCode, input.sourceId));
    }

    #refreshNaturalRelease(residentId, at) {
        this.#database.prepare(`
          UPDATE security_detentions
          SET status = 'released', released_at = scheduled_release_at,
              release_kind = 'natural', updated_at = ?
          WHERE resident_id = ? AND status = 'active' AND scheduled_release_at <= ?
        `).run(at, residentId, at);
    }

    #requiredResidentDetention(residentId, detentionId) {
        const row = this.#database.prepare(`
          SELECT * FROM security_detentions
          WHERE detention_id = ? AND resident_id = ?
        `).get(detentionId, residentId);
        if (!row)
            fail("security_detention_not_found");
        return row;
    }

    #earlyReleaseAmount(detention, at) {
        const remaining = Math.max(0, detention.scheduled_release_at - at);
        return Math.ceil((remaining * detention.hourly_release_rate_gold) / HOUR_MS);
    }

    #validateEarlyReleasePayment(payment, residentId, detentionId, amountGold) {
        const receipt = payment?.financialReceipt;
        const paymentReceiptId = identifier(payment?.receiptId, "payment_receipt_id");
        if (payment?.detentionId !== detentionId ||
            payment?.paidGold !== amountGold ||
            payment?.account?.residentId !== residentId ||
            !receipt ||
            receipt.receiptId !== paymentReceiptId ||
            receipt.residentId !== residentId ||
            receipt.kind !== "system_gold_charge" ||
            receipt.currency !== "gold" ||
            receipt.amount !== amountGold ||
            receipt.businessReference !== `security:detention:${detentionId}:early-release`) {
            fail("security_early_release_payment_mismatch");
        }
        return paymentReceiptId;
    }

    #actionReplay(idempotencyKey, residentId, hash) {
        const row = this.#database.prepare(`
          SELECT resident_id, payload_hash, result_json
          FROM security_action_receipts WHERE idempotency_key = ?
        `).get(idempotencyKey);
        if (!row)
            return null;
        if (row.resident_id !== residentId || row.payload_hash !== hash)
            fail("security_idempotency_conflict");
        return parseJson(row.result_json);
    }

    #recordAction(idempotencyKey, residentId, hash, result, now) {
        this.#database.prepare(`
          INSERT INTO security_action_receipts (
            idempotency_key, command_type, resident_id, payload_hash, result_json, created_at
          ) VALUES (?, 'detention.early_release', ?, ?, ?, ?)
        `).run(idempotencyKey, residentId, hash, canonical(result), now);
    }
}
