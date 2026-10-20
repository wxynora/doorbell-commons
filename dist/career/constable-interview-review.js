import { CareerDomainError } from "./contracts.js";
import { nextInterviewSessionAt, nextBeijingDayStart, runInTransaction, recordFinancialReceipt } from "./persistence.js";

export const CONSTABLE_REVIEW_POLICY = Object.freeze({
    minimumReviewVotes: 3, ratioNumerator: 1, ratioDenominator: 3,
});
export const INTERVIEW_REVIEW_MESSAGES = Object.freeze({
    pending: "本场面试进入复核，资格暂不生效。",
    passed: "复核通过，资格将于下一自然日生效。",
    failed: "复核未通过，可按学校当前选项重新报名。",
});

export function validConstableWrittenPass(database, residentId, level, sessionAt) {
    return database.prepare(`SELECT pass.source_attempt_id, pass.passed_at
      FROM career_constable_written_passes pass
      JOIN career_exam_attempts attempt ON attempt.attempt_id = pass.attempt_id
      JOIN career_tracks track ON track.resident_id = attempt.resident_id AND track.career = attempt.career
        AND track.track_order IS NOT NULL AND track.generation = attempt.learning_generation
      WHERE attempt.resident_id = ? AND attempt.career = 'constable' AND attempt.qualification_level = ?
        AND attempt.registration_status IN ('failed','postponed')
        AND NOT EXISTS(SELECT 1 FROM career_exam_attempts current_attempt WHERE current_attempt.resident_id = attempt.resident_id
          AND current_attempt.career = 'constable' AND current_attempt.qualification_level = attempt.qualification_level
          AND current_attempt.learning_generation = attempt.learning_generation
          AND current_attempt.registration_status IN ('registered','active','written_passed'))
        AND pass.passed_at + 2592000000 >= ?
        AND NOT EXISTS(SELECT 1 FROM career_resignation_exam_refunds refund WHERE refund.attempt_id = attempt.attempt_id)
        AND NOT EXISTS(SELECT 1 FROM career_certificates certificate WHERE certificate.resident_id = attempt.resident_id
          AND certificate.career = 'constable' AND certificate.qualification_level = attempt.qualification_level)
      ORDER BY pass.passed_at DESC LIMIT 1`).get(residentId, level, sessionAt) ?? null;
}

// Fees remain an Economy command on the same connection and transaction.
// Missing humans only move the session; they never consume the reservation.
export function settleConstableRetryFees(database, economy, now) {
    const rows = database.prepare(`SELECT attempt.*, reservation.reservation_id,
        interview.status AS interview_status
      FROM career_exam_attempts attempt JOIN career_constable_written_passes pass ON pass.attempt_id = attempt.attempt_id
      JOIN career_constable_interviews interview ON interview.attempt_id = attempt.attempt_id
      JOIN economy_system_gold_reservations reservation ON reservation.reserve_journal_id = attempt.reservation_receipt_id
      WHERE pass.source_attempt_id != pass.attempt_id
        AND attempt.settlement_receipt_id IS NULL AND attempt.release_receipt_id IS NULL
        AND interview.status IN ('panel_ready','scoring','postponed')`).all();
    for (const row of rows) {
        const settle = row.interview_status !== 'postponed';
        const businessReference = `career-exam:${row.attempt_id}:${settle ? "settle" : "release"}`;
        const receipt = (settle
            ? economy.settleSystemGoldReservation({reservationId: row.reservation_id, businessReference, idempotencyKey: businessReference})
            : economy.releaseSystemGoldReservation({reservationId: row.reservation_id, businessReference, idempotencyKey: businessReference})
        ).financialReceipt;
        const reserve = database.prepare("SELECT amount FROM career_financial_receipts WHERE receipt_id = ?")
            .get(row.reservation_receipt_id);
        recordFinancialReceipt(database, receipt, {
            amount: reserve.amount, businessReference, currency: "gold",
            kind: settle ? "system_gold_settle" : "system_gold_release",
            residentId: row.resident_id, reserveReceiptId: row.reservation_receipt_id,
        }, now);
        database.prepare(`UPDATE career_exam_attempts SET ${settle ? "settlement_receipt_id" : "release_receipt_id"} = ?
            WHERE attempt_id = ?`).run(receipt.receiptId, row.attempt_id);
    }
}
export function interviewScoresPass(scores) {
    if (scores.length !== 3) return false;
    const sums = ["facts_score", "restraint_score", "procedure_score", "explanation_score"]
        .map(key => scores.reduce((sum, score) => sum + score[key], 0));
    return sums.every(sum => sum >= 9) && sums.reduce((sum, value) => sum + value, 0) >= 48;
}
export class ConstableInterviewReview {
    constructor({ database, now }) { this.database = database; this.now = now; }
    read(interviewId) {
        return this.database.prepare("SELECT * FROM career_constable_reviews WHERE interview_id = ?").get(interviewId) ?? null;
    }
    excludes(interviewId, residentId, accountId) {
        return Boolean(this.database.prepare(`SELECT 1 FROM career_constable_review_original_scores
            WHERE interview_id = ? AND (examiner_resident_id = ? OR examiner_account_id = ?)`)
            .get(interviewId, residentId, accountId ?? ""));
    }
    begin(interview) {
        if (this.read(interview.interview_id)) return;
        const now = this.now();
        this.database.prepare(`INSERT INTO career_constable_review_original_scores
          (interview_id, examiner_account_id, examiner_resident_id, signup_order,
           facts_score, restraint_score, procedure_score, explanation_score, scored_at)
          SELECT score.interview_id, score.examiner_account_id, signup.examiner_resident_id, signup.signup_order,
            score.facts_score, score.restraint_score, score.procedure_score, score.explanation_score, score.scored_at
          FROM career_constable_scores score JOIN career_constable_examiner_signups signup
          ON signup.interview_id = score.interview_id AND signup.examiner_account_id = score.examiner_account_id
          WHERE score.interview_id = ?`).run(interview.interview_id);
        this.database.prepare(`INSERT INTO career_constable_reviews (interview_id, opened_at, outcome)
          VALUES (?, ?, 'pending')`).run(interview.interview_id, now);
        this.database.prepare("DELETE FROM career_constable_scores WHERE interview_id = ?").run(interview.interview_id);
        this.database.prepare("DELETE FROM career_constable_examiner_signups WHERE interview_id = ?").run(interview.interview_id);
        this.database.prepare(`UPDATE career_constable_interviews SET status = 'signup_open', scheduled_at = ?,
          finalized_at = NULL WHERE interview_id = ?`).run(nextInterviewSessionAt(now), interview.interview_id);
    }
    postpone(interview) {
        const scheduledAt = nextInterviewSessionAt(this.now());
        this.database.prepare("DELETE FROM career_constable_examiner_signups WHERE interview_id = ?").run(interview.interview_id);
        this.database.prepare(`UPDATE career_constable_interviews SET scheduled_at = ?, last_postponed_at = ?,
          postponed_count = postponed_count + 1 WHERE interview_id = ?`)
          .run(scheduledAt, this.now(), interview.interview_id);
        return { status: "postponed", nextScheduledAt: scheduledAt };
    }
    finish(interview) {
        return runInTransaction(this.database, () => {
            const review = this.read(interview.interview_id);
            if (!review) return null;
            if (review.outcome !== "pending") return { status: review.outcome === "passed" ? "certificate_activated" : "failed", noticeId: null };
            const scores = this.database.prepare("SELECT * FROM career_constable_scores WHERE interview_id = ?").all(interview.interview_id);
            if (scores.length !== 3)
                throw new CareerDomainError("interview_scores_incomplete", "Exactly three scores are required");
            const passed = interviewScoresPass(scores), now = this.now();
            this.database.prepare(`UPDATE career_constable_reviews SET outcome = ?, finalized_at = ? WHERE interview_id = ?`)
              .run(passed ? "passed" : "failed", now, interview.interview_id);
            this.database.prepare(`UPDATE career_constable_interviews SET status = ?, finalized_at = ? WHERE interview_id = ?`)
              .run(passed ? "certificate_activated" : "failed", now, interview.interview_id);
            this.database.prepare(`UPDATE career_exam_attempts SET registration_status = ?, ended_at = ? WHERE attempt_id = ?`)
              .run(passed ? "passed" : "failed", now, interview.attempt_id);
            if (passed) {
                this.database.prepare(`UPDATE career_certificates SET status = 'active', effective_at = ? WHERE source_attempt_id = ?`)
                  .run(nextBeijingDayStart(now), interview.attempt_id);
                this.database.prepare(`UPDATE career_constable_public_notices SET status = 'certificate_activated',
                  finalized_at = ? WHERE interview_id = ?`).run(now, interview.interview_id);
            } else {
                // There is no failed certificate; retain the frozen notice/votes and review audit.
                this.database.prepare(`DELETE FROM career_certificates
                  WHERE source_attempt_id = ? AND status = 'review_required'`).run(interview.attempt_id);
            }
            return { status: passed ? "certificate_activated" : "failed", noticeId: null };
        });
    }
}
