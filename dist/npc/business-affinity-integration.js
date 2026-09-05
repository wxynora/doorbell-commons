import { recordLingyeNpcBusinessAffinity } from "./business-affinity.js";
import { advanceLingyeNpcWorld } from "./world-schedule.js";

const BANK_COMMAND_TYPES = new Set([
    "bank.demand.deposit", "bank.demand.withdraw", "bank.term.open", "bank.term.close",
    "bank.exchange.gold_to_silver", "bank.system_loan.open", "bank.system_loan.repay",
    "bank.player_loan.confirm", "bank.player_loan.repay",
]);
const JOB_INSTITUTIONS = Object.freeze({
    veterinarian: "animal_hospital", reporter: "lingye_daily", constable: "public_security",
});

/** Runs before the enclosing original transaction commits; never trusts tool result text. */
export function createLingyeNpcBusinessObserver(database, { now }) {
    function record(institutionId, residentId, sourceReference, occurredAt) {
        if (!residentId || !Number.isSafeInteger(occurredAt))
            return null;
        advanceLingyeNpcWorld(database, { now: occurredAt });
        return recordLingyeNpcBusinessAffinity(database, {
            institutionId, residentId, sourceReference, occurredAt,
            recordedAt: now(), status: "succeeded",
        });
    }
    return Object.freeze({
        bank(commandType, idempotencyKey, residentId) {
            if (!BANK_COMMAND_TYPES.has(commandType) || !residentId)
                return null;
            const journal = database.prepare(`
              SELECT journal.journal_id, journal.created_at
              FROM economy_commands command
              JOIN economy_journals journal ON journal.journal_id = command.journal_id
                AND journal.command_type = command.command_type
                AND journal.payload_hash = command.payload_hash
                AND journal.created_at = command.created_at
              WHERE command.idempotency_key = ? AND command.command_type = ?
                AND EXISTS (SELECT 1 FROM economy_ledger_entries entry
                  WHERE entry.journal_id = journal.journal_id AND entry.resident_id = ? AND entry.delta != 0)
            `).get(idempotencyKey, commandType, residentId);
            return journal ? record("bank", residentId, `economy-journal:${journal.journal_id}`, journal.created_at) : null;
        },
        courseEnrollment(input) {
            const course = database.prepare(`
              SELECT course.resident_id, course.tuition_receipt_id, receipt.created_at
              FROM career_courses course
              JOIN career_financial_receipts career_receipt ON career_receipt.receipt_id = course.tuition_receipt_id
                AND career_receipt.resident_id = course.resident_id
              JOIN economy_financial_receipts receipt ON receipt.receipt_id = career_receipt.receipt_id
                AND receipt.resident_id = course.resident_id
                AND receipt.kind = 'system_gold_charge' AND receipt.currency = 'gold' AND receipt.amount > 0
              JOIN economy_journals journal ON journal.journal_id = receipt.receipt_id
                AND journal.command_type = 'system.charge.career_tuition'
              WHERE course.resident_id = ? AND course.career = ?
                AND course.qualification_level = ? AND course.course_index = ?
                AND EXISTS (SELECT 1 FROM economy_ledger_entries entry
                  WHERE entry.journal_id = journal.journal_id AND entry.resident_id = course.resident_id
                    AND entry.currency = 'gold' AND entry.delta < 0)
            `).get(input.residentId, input.career, input.level, input.courseIndex);
            return course ? record("vocational_school", course.resident_id,
                `course-tuition:${course.tuition_receipt_id}`, course.created_at) : null;
        },
        courseCompletion(input) {
            const course = database.prepare(`
              SELECT course.resident_id, course.tuition_receipt_id, course.completed_at
              FROM career_courses course
              JOIN career_assessment_papers paper ON paper.resident_id = course.resident_id
                AND paper.career = course.career AND paper.qualification_level = course.qualification_level
                AND paper.course_index = course.course_index AND paper.kind = 'course_practice'
              JOIN career_assessment_submissions submission ON submission.paper_id = paper.paper_id
                AND submission.resident_id = course.resident_id AND submission.passed = 1
              WHERE course.resident_id = ? AND course.career = ? AND course.qualification_level = ?
                AND course.course_index = ? AND course.completed_at IS NOT NULL
                AND submission.idempotency_key = ?
            `).get(input.residentId, input.career, input.level, input.courseIndex, input.idempotencyKey);
            return course ? record("vocational_school", course.resident_id,
                `course-completed:${course.tuition_receipt_id}`, course.completed_at) : null;
        },
        examStart(attemptId) {
            const attempt = database.prepare(`
              SELECT attempt.resident_id, receipt.receipt_id, receipt.created_at
              FROM career_exam_attempts attempt
              JOIN economy_financial_receipts receipt ON receipt.receipt_id = attempt.settlement_receipt_id
                AND receipt.resident_id = attempt.resident_id AND receipt.kind = 'system_gold_settle'
              JOIN economy_system_gold_reservations reservation ON reservation.settle_journal_id = receipt.receipt_id
                AND reservation.reserve_journal_id = attempt.reservation_receipt_id
                AND reservation.resident_id = attempt.resident_id AND reservation.state = 'settled'
              WHERE attempt.attempt_id = ? AND attempt.started_at IS NOT NULL
            `).get(attemptId);
            return attempt ? record("vocational_school", attempt.resident_id,
                `exam-start:${attempt.receipt_id}`, attempt.created_at) : null;
        },
        examCompletion(input) {
            const submission = database.prepare(`
              SELECT attempt.resident_id, submission.submission_id, submission.submitted_at
              FROM career_exam_attempts attempt
              JOIN career_assessment_papers paper ON paper.exam_attempt_id = attempt.attempt_id AND paper.kind = 'written_exam'
              JOIN career_assessment_submissions submission ON submission.paper_id = paper.paper_id
                AND submission.resident_id = attempt.resident_id AND submission.passed = 1
              WHERE attempt.attempt_id = ? AND submission.idempotency_key = ?
                AND attempt.registration_status IN ('passed', 'written_passed')
            `).get(input.attemptId, input.idempotencyKey);
            return submission ? record("vocational_school", submission.resident_id,
                `exam-completed:${submission.submission_id}`, submission.submitted_at) : null;
        },
        completedJob(jobId) {
            const job = database.prepare(`
              SELECT job.job_id, job.career, job.owner_resident_id, job.worker_resident_id,
                     work.work_record_id, work.recorded_at
              FROM career_jobs job
              JOIN career_work_records work ON work.job_id = job.job_id AND work.resident_id = job.worker_resident_id
                AND work.career = job.career AND work.record_kind = 'completed'
              WHERE job.job_id = ? AND job.status = 'completed' AND job.world_result_reference IS NOT NULL
                AND job.ended_at = work.recorded_at
            `).get(jobId);
            const institutionId = job && JOB_INSTITUTIONS[job.career];
            if (!institutionId)
                return [];
            return [...new Set([job.owner_resident_id, job.worker_resident_id])].filter(Boolean).map((residentId) =>
                record(institutionId, residentId, `career-work:${job.work_record_id}`, job.recorded_at));
        },
    });
}
