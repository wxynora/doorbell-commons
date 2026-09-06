import { randomUUID } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { archiveLearningState, restoreLearningState } from "./learning-state.js";
import { beijingDate, recordFinancialReceipt, runInTransaction } from "./persistence.js";

const RESTORE_WINDOW_MS = 3 * 24 * 60 * 60 * 1_000;

function fail(code) { throw new CareerDomainError(code, code); }
function feeForSequence(sequence) {
    const amount = sequence === 1 ? 0 : 50_000 * 2 ** (sequence - 2);
    if (!Number.isSafeInteger(amount)) fail("invalid_financial_receipt");
    return amount;
}
function publicRecord(row) {
    return {
        resignationId: row.resignation_id,
        career: row.career,
        trackOrder: row.track_order,
        generation: row.generation,
        sequenceNumber: row.sequence_number,
        feeGold: row.fee_gold,
        createdAt: row.created_at,
        confirmedAt: row.confirmed_at,
        restoreUntil: row.restore_until,
        restoredAt: row.restored_at,
        state: row.restored_at !== null ? "restored" : row.confirmed_at !== null ? "confirmed" : "proposed",
    };
}

// This service changes one career slot. Economy receipts and historical career
// records remain authoritative; learning snapshots are the sole undo source.
export class CareerResignationService {
    #database;
    #economy;
    #employment;
    #now;
    #generateId;
    constructor({ database, economy, employment, now = Date.now, generateId = randomUUID }) {
        this.#database = database;
        this.#economy = economy;
        this.#employment = employment;
        this.#now = now;
        this.#generateId = generateId;
    }

    quote(residentId, career) {
        const track = this.#activeTrack(residentId, career);
        const sequence = Number(this.#database.prepare(`SELECT COUNT(*) AS count FROM career_resignations
          WHERE resident_id = ? AND confirmed_at IS NOT NULL`).get(residentId).count) + 1;
        return publicRecord({ resignation_id: null, career, track_order: track.track_order,
            generation: track.generation, sequence_number: sequence, fee_gold: feeForSequence(sequence),
            created_at: null, confirmed_at: null, restore_until: null, restored_at: null });
    }

    prepare(residentId, career) {
        return runInTransaction(this.#database, () => {
            const quote = this.quote(residentId, career);
            const existing = this.#database.prepare(`SELECT * FROM career_resignations
              WHERE resident_id = ? AND career = ? AND track_order = ? AND generation = ?
                AND sequence_number = ? AND fee_gold = ? AND confirmed_at IS NULL
              ORDER BY created_at, resignation_id`).get(residentId, career, quote.trackOrder,
                quote.generation, quote.sequenceNumber, quote.feeGold);
            if (existing) return publicRecord(existing);
            const resignationId = this.#generateId();
            this.#database.prepare(`INSERT INTO career_resignations
              (resignation_id, resident_id, career, track_order, generation, created_at, fee_gold, sequence_number)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(resignationId, residentId, career,
                quote.trackOrder, quote.generation, this.#now(), quote.feeGold, quote.sequenceNumber);
            return publicRecord(this.#owned(residentId, resignationId));
        });
    }

    list(residentId) {
        const now = this.#now();
        return this.#database.prepare(`SELECT resignation.* FROM career_resignations AS resignation
          WHERE resignation.resident_id = ? AND (
            (resignation.confirmed_at IS NULL AND resignation.sequence_number = (
              SELECT COUNT(*) + 1 FROM career_resignations AS successful
              WHERE successful.resident_id = resignation.resident_id AND successful.confirmed_at IS NOT NULL)
              AND EXISTS (SELECT 1 FROM career_tracks AS track
              WHERE track.resident_id = resignation.resident_id AND track.career = resignation.career
                AND track.track_order = resignation.track_order AND track.generation = resignation.generation))
            OR (resignation.confirmed_at IS NOT NULL AND resignation.restored_at IS NULL
              AND resignation.restore_until >= ?
              AND NOT EXISTS (SELECT 1 FROM career_tracks AS moved
                WHERE moved.resident_id = resignation.resident_id AND moved.career = resignation.career
                  AND moved.track_order IS NOT NULL AND moved.track_order <> resignation.track_order)
              AND NOT EXISTS (
                SELECT 1 FROM career_resignations AS newer WHERE newer.resident_id = resignation.resident_id
                  AND newer.track_order = resignation.track_order AND newer.confirmed_at IS NOT NULL
                  AND newer.sequence_number > resignation.sequence_number)))
          ORDER BY resignation.created_at DESC, resignation.resignation_id`).all(residentId, now).map(publicRecord);
    }

    confirm({ residentId, resignationId, actor }) {
        return runInTransaction(this.#database, () => {
            const proposal = this.#owned(residentId, resignationId);
            if (proposal.confirmation_json) return JSON.parse(proposal.confirmation_json);
            const now = this.#now();
            const month = beijingDate(now).slice(0, 7);
            if (this.#database.prepare(`SELECT 1 FROM career_resignations
              WHERE resident_id = ? AND month_key = ?`).get(residentId, month))
                fail("career_resignation_month_limit");
            const current = this.quote(residentId, proposal.career);
            if (current.generation !== proposal.generation || current.trackOrder !== proposal.track_order ||
                current.sequenceNumber !== proposal.sequence_number || current.feeGold !== proposal.fee_gold)
                fail("career_resignation_stale");
            this.#assertNoPendingWork(residentId, proposal.career);
            const refundGold = this.#refundExams(residentId, proposal.career, proposal.generation, resignationId, now);
            if (proposal.fee_gold > 0) {
                const businessRef = `career-resignation:${resignationId}:penalty`;
                const charged = this.#economy.chargeToSystem({ residentId, currency: "gold",
                    amount: proposal.fee_gold, actor, businessType: "career_resignation", businessRef,
                    idempotencyKey: businessRef });
                recordFinancialReceipt(this.#database, charged.financialReceipt, { residentId,
                    currency: "gold", amount: proposal.fee_gold, kind: "system_gold_charge",
                    businessReference: businessRef }, now);
            }
            const archiveId = this.#generateId();
            this.#endEmployment(residentId, proposal.career);
            archiveLearningState(this.#database, residentId, proposal.career, archiveId, now);
            const result = { ...publicRecord({ ...proposal, confirmed_at: now,
                restore_until: now + RESTORE_WINDOW_MS }), refundGold };
            this.#database.prepare(`UPDATE career_resignations SET confirmed_at = ?, restore_until = ?,
              month_key = ?, archive_id = ?, confirmation_json = ? WHERE resignation_id = ?`)
                .run(now, result.restoreUntil, month, archiveId, JSON.stringify(result), resignationId);
            return result;
        });
    }

    restore({ residentId, resignationId }) {
        return runInTransaction(this.#database, () => {
            const resignation = this.#owned(residentId, resignationId);
            if (resignation.restoration_json) return JSON.parse(resignation.restoration_json);
            const now = this.#now();
            if (resignation.confirmed_at === null) fail("career_resignation_stale");
            if (now > resignation.restore_until) fail("career_resignation_restore_expired");
            if (this.#database.prepare(`SELECT 1 FROM career_resignations
              WHERE resident_id = ? AND track_order = ? AND confirmed_at IS NOT NULL
                AND sequence_number > ?`).get(residentId, resignation.track_order, resignation.sequence_number))
                fail("career_resignation_stale");
            if (this.#database.prepare(`SELECT 1 FROM career_tracks WHERE resident_id = ? AND career = ?
              AND track_order IS NOT NULL AND track_order <> ?`).get(residentId, resignation.career, resignation.track_order))
                fail("career_resignation_stale");
            const replacement = this.#database.prepare(`SELECT * FROM career_tracks
              WHERE resident_id = ? AND track_order = ?`).get(residentId, resignation.track_order);
            let refundGold = 0;
            if (replacement) {
                this.#assertNoPendingWork(residentId, replacement.career);
                refundGold = this.#refundExams(residentId, replacement.career, replacement.generation, resignationId, now);
                this.#endEmployment(residentId, replacement.career);
                archiveLearningState(this.#database, residentId, replacement.career, this.#generateId(), now);
            }
            restoreLearningState(this.#database, resignation.archive_id, now);
            const result = { ...publicRecord({ ...resignation, restored_at: now }), refundGold };
            this.#database.prepare(`UPDATE career_resignations SET restored_at = ?, restoration_json = ?
              WHERE resignation_id = ?`).run(now, JSON.stringify(result), resignationId);
            return result;
        });
    }

    #activeTrack(residentId, career) {
        const track = this.#database.prepare(`SELECT * FROM career_tracks
          WHERE resident_id = ? AND career = ? AND track_order IS NOT NULL`).get(residentId, career);
        if (!track) fail("career_not_selected");
        return track;
    }

    #owned(residentId, resignationId) {
        const result = this.#database.prepare(`SELECT * FROM career_resignations
          WHERE resignation_id = ? AND resident_id = ?`).get(resignationId, residentId);
        if (!result) fail("career_resignation_not_found");
        return result;
    }

    #assertNoPendingWork(residentId, career) {
        if (this.#database.prepare(`SELECT 1 FROM career_jobs WHERE worker_resident_id = ? AND career = ?
          AND status IN ('accepted', 'assigned', 'active')`).get(residentId, career))
            fail("career_resignation_pending_work");
    }

    #endEmployment(residentId, career) {
        for (const row of this.#database.prepare(`SELECT employment_id FROM career_employments
          WHERE resident_id = ? AND career = ? AND status = 'active'`).all(residentId, career))
            this.#employment.endEmployment(row.employment_id);
    }

    #refundExams(residentId, career, generation, resignationId, now) {
        const attempts = this.#database.prepare(`SELECT attempt.* FROM career_exam_attempts AS attempt
          WHERE attempt.resident_id = ? AND attempt.career = ? AND attempt.learning_generation = ?
            AND attempt.registration_status IN ('registered', 'active', 'written_passed', 'postponed')
            AND attempt.missed_session_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM career_certificates AS certificate
              WHERE certificate.source_attempt_id = attempt.attempt_id AND certificate.status = 'active')
            AND NOT EXISTS (SELECT 1 FROM career_resignation_exam_refunds AS refund
              WHERE refund.attempt_id = attempt.attempt_id)`).all(residentId, career, generation);
        let total = 0;
        for (const attempt of attempts) {
            const receiptId = attempt.settlement_receipt_id ?? attempt.reservation_receipt_id;
            const original = this.#economy.getFinancialReceipt(receiptId);
            if (!original || original.residentId !== residentId || original.currency !== "gold")
                fail("financial_receipt_mismatch");
            const paid = attempt.settlement_receipt_id !== null;
            if (original.kind !== (paid ? "system_gold_settle" : "system_gold_reserve"))
                fail("financial_receipt_mismatch");
            const businessRef = `career-resignation:${resignationId}:exam:${attempt.attempt_id}:refund`;
            const refunded = paid
                ? this.#economy.creditFromSystem({ residentId, currency: "gold", amount: original.amount,
                    businessType: "career_resignation_exam_refund", businessRef, idempotencyKey: businessRef })
                : this.#economy.releaseSystemGoldReservation({ reservationId: original.reservationId,
                    businessReference: businessRef, idempotencyKey: businessRef });
            const receipt = refunded.financialReceipt;
            recordFinancialReceipt(this.#database, receipt, { residentId, currency: "gold", amount: original.amount,
                kind: paid ? "system_gold_credit" : "system_gold_release", businessReference: businessRef,
                ...(!paid ? { reserveReceiptId: attempt.reservation_receipt_id } : {}) }, now);
            this.#database.prepare(`INSERT INTO career_resignation_exam_refunds
              (attempt_id, resignation_id, receipt_id, amount, refunded_at) VALUES (?, ?, ?, ?, ?)`)
                .run(attempt.attempt_id, resignationId, receipt.receiptId, original.amount, now);
            this.#database.prepare(`UPDATE career_exam_attempts SET registration_status = 'released',
              release_receipt_id = ?, ended_at = ? WHERE attempt_id = ?`).run(receipt.receiptId, now, attempt.attempt_id);
            total += original.amount;
        }
        return total;
    }
}
