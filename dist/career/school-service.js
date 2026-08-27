import { createHash, randomUUID } from "node:crypto";
import { CareerDomainError, COURSE_COUNT_PER_LEVEL, COURSE_PRACTICE_PASS_COUNT, COURSE_TUITION_GOLD, EXAM_FEE_GOLD, EXAM_PASS_COUNT, } from "./contracts.js";
import {
    careerCourseAvailability,
    careerCourseContent,
    careerExamAvailability,
    createCoursePracticePaper,
    createWrittenExamPaper,
    gradeAssessment,
} from "./curriculum.js";
import { activeCertificateLevel, isBeijingHour, nextExamSessionAt, nextInterviewSessionAt, recordFinancialReceipt, requireCareerTrack, runInTransaction, } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1_000;
const THIRTY_MINUTES_MS = 30 * 60 * 1_000;
const PUBLIC_NOTICE_MS = 24 * 60 * 60 * 1_000;
export class CareerSchoolService {
    #database;
    #now;
    #generateId;
    constructor(options) {
        this.#database = options.database;
        this.#now = options.now ?? Date.now;
        this.#generateId = options.generateId ?? randomUUID;
        installCareerSchema(this.#database);
    }
    selectCareer(residentId, career) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const existing = this.#database
                .prepare(`SELECT career, track_order
           FROM career_tracks
           WHERE resident_id = ?
           ORDER BY track_order`)
                .all(residentId);
            const same = existing.find((row) => row.career === career);
            if (same)
                return { career: same.career, trackOrder: same.track_order };
            if (existing.length === 0) {
                this.#database
                    .prepare(`INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
             VALUES (?, ?, 1, ?)`)
                    .run(residentId, career, now);
                return { career, trackOrder: 1 };
            }
            if (existing.length >= 2) {
                throw new CareerDomainError("career_track_limit_reached", "Only two careers are allowed");
            }
            const primary = existing[0];
            if (!primary)
                throw new Error("Career track invariant violated");
            const primaryLevel = activeCertificateLevel(this.#database, residentId, primary.career);
            if (primaryLevel === null || primaryLevel < 3) {
                throw new CareerDomainError("secondary_career_locked", "The primary career must hold an advanced certificate first");
            }
            this.#database
                .prepare(`INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
           VALUES (?, ?, 2, ?)`)
                .run(residentId, career, now);
            return { career, trackOrder: 2 };
        });
    }
    enrollCourse(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            if (!careerCourseAvailability(input.career, input.level, input.courseIndex)) {
                throw new CareerDomainError("assessment_content_not_available", "This course is not available");
            }
            requireCareerTrack(this.#database, input.residentId, input.career);
            this.#requireLevelPrerequisite(input.residentId, input.career, input.level);
            if (input.courseIndex > 1) {
                const previous = this.#database
                    .prepare(`SELECT completed_at
             FROM career_courses
             WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                    .get(input.residentId, input.career, input.level, input.courseIndex - 1);
                if (!previous?.completed_at) {
                    throw new CareerDomainError("previous_course_required", "Courses in one qualification level must be completed in order");
                }
            }
            const businessReference = this.#courseBusinessReference(input);
            recordFinancialReceipt(this.#database, input.tuitionReceipt, {
                amount: COURSE_TUITION_GOLD[input.level],
                businessReference,
                currency: "gold",
                kind: "system_gold_charge",
                residentId: input.residentId,
            }, now);
            const existing = this.#database
                .prepare(`SELECT tuition_receipt_id, content_read_at, completed_at
           FROM career_courses
           WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                .get(input.residentId, input.career, input.level, input.courseIndex);
            if (existing) {
                if (existing.tuition_receipt_id !== input.tuitionReceipt.receiptId) {
                    throw new CareerDomainError("course_enrollment_conflict", "The course is already enrolled with another receipt");
                }
                const paper = this.#ensureCoursePaper(input, now);
                return {
                    completed: existing.completed_at !== null,
                    contentRead: existing.content_read_at !== null,
                    paperId: paper.paperId,
                    bankVersion: paper.bankVersion,
                };
            }
            this.#database
                .prepare(`INSERT INTO career_courses (
             resident_id, career, qualification_level, course_index,
             tuition_receipt_id, enrolled_at
           ) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(input.residentId, input.career, input.level, input.courseIndex, input.tuitionReceipt.receiptId, now);
            const paper = this.#ensureCoursePaper(input, now);
            return {
                completed: false,
                contentRead: false,
                paperId: paper.paperId,
                bankVersion: paper.bankVersion,
            };
        });
    }
    getCourseContent(input) {
        const enrolled = this.#database
            .prepare(`SELECT 1 FROM career_courses
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
            .get(input.residentId, input.career, input.level, input.courseIndex);
        if (!enrolled)
            throw new CareerDomainError("course_not_enrolled", "The course is not enrolled");
        const content = careerCourseContent(input.career, input.level, input.courseIndex);
        const paper = this.#requireCoursePaper(input);
        return {
            ...content,
            paperId: paper.paper_id,
            practiceQuestions: JSON.parse(paper.public_paper_json),
        };
    }
    markCourseContentRead(input) {
        const result = this.#database
            .prepare(`UPDATE career_courses
         SET content_read_at = COALESCE(content_read_at, ?)
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
            .run(this.#now(), input.residentId, input.career, input.level, input.courseIndex);
        if (result.changes === 0) {
            throw new CareerDomainError("course_not_enrolled", "The course is not enrolled");
        }
    }
    submitCoursePractice(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const course = this.#database
                .prepare(`SELECT content_read_at, completed_at, best_correct_answers
           FROM career_courses
           WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                .get(input.residentId, input.career, input.level, input.courseIndex);
            if (!course) {
                throw new CareerDomainError("course_not_enrolled", "The course is not enrolled");
            }
            if (course.content_read_at === null) {
                throw new CareerDomainError("course_content_not_read", "The approved teaching units must be read before practice");
            }
            const paper = this.#requireCoursePaper(input);
            if (paper.paper_id !== input.paperId)
                throw new CareerDomainError("assessment_paper_mismatch", "The course paper does not match");
            const answerData = this.#paperAnswerData(paper);
            const graded = gradeAssessment(answerData.answers, input.answers);
            const replay = this.#submissionReplay(input.residentId, input.idempotencyKey, paper.paper_id, graded.answers);
            if (replay !== null)
                return replay;
            const best = Math.max(course.best_correct_answers, graded.correctAnswers);
            const passed = course.completed_at !== null || graded.correctAnswers >= COURSE_PRACTICE_PASS_COUNT;
            this.#database
                .prepare(`UPDATE career_courses
           SET best_correct_answers = ?, completed_at = CASE
             WHEN completed_at IS NOT NULL THEN completed_at
             WHEN ? >= ? THEN ?
             ELSE NULL
           END
           WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                .run(best, graded.correctAnswers, COURSE_PRACTICE_PASS_COUNT, now, input.residentId, input.career, input.level, input.courseIndex);
            const result = {
                bestCorrectAnswers: best,
                correctAnswers: graded.correctAnswers,
                passed,
                review: answerData.review.map((entry, index) => ({
                    ...entry,
                    selectedAnswer: graded.answers[index],
                    correct: graded.answers[index] === entry.correctAnswer,
                })),
            };
            this.#recordSubmission({
                paper,
                residentId: input.residentId,
                idempotencyKey: input.idempotencyKey,
                answers: graded.answers,
                result,
                status: passed ? "passed" : "failed",
                now,
            });
            return result;
        });
    }
    registerExam(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const existing = this.#getExamAttempt(input.attemptId);
            if (existing) {
                if (existing.resident_id !== input.residentId ||
                    existing.career !== input.career ||
                    existing.qualification_level !== input.level ||
                    existing.reservation_receipt_id !== input.reservationReceipt.receiptId) {
                    throw new CareerDomainError("exam_attempt_conflict", "The attempt id is already in use");
                }
                const reservationReceipt = this.#requireEconomyFinancialReceipt(existing.reservation_receipt_id);
                recordFinancialReceipt(this.#database, input.reservationReceipt, {
                    amount: reservationReceipt.amount,
                    businessReference: reservationReceipt.business_reference,
                    currency: reservationReceipt.currency,
                    kind: reservationReceipt.kind,
                    residentId: reservationReceipt.resident_id,
                }, now);
                const paper = this.#ensureExamPaper(existing, now);
                return {
                    attemptId: existing.attempt_id,
                    feeGold: reservationReceipt.amount,
                    scheduledAt: existing.scheduled_at,
                    paperId: paper.paperId,
                    bankVersion: paper.bankVersion,
                };
            }
            this.#requireExamEligibility(input.residentId, input.career, input.level);
            const openAttempt = this.#database
                .prepare(`SELECT 1 FROM career_exam_attempts
           WHERE resident_id = ? AND career = ? AND qualification_level = ?
             AND registration_status IN ('registered', 'active', 'written_passed')`)
                .get(input.residentId, input.career, input.level);
            if (openAttempt) {
                throw new CareerDomainError("exam_attempt_already_open", "An exam attempt is already open");
            }
            const feeGold = this.#examFee(input.residentId, input.career, input.level);
            const businessReference = `career-exam:${input.attemptId}:reserve`;
            recordFinancialReceipt(this.#database, input.reservationReceipt, {
                amount: feeGold,
                businessReference,
                currency: "gold",
                kind: "system_gold_reserve",
                residentId: input.residentId,
            }, now);
            const scheduledAt = nextExamSessionAt(now);
            this.#database
                .prepare(`INSERT INTO career_exam_attempts (
             attempt_id, resident_id, career, qualification_level, scheduled_at,
             registration_status, reservation_receipt_id, registered_at
           ) VALUES (?, ?, ?, ?, ?, 'registered', ?, ?)`)
                .run(input.attemptId, input.residentId, input.career, input.level, scheduledAt, input.reservationReceipt.receiptId, now);
            const paper = this.#ensureExamPaper(this.#requireExamAttempt(input.attemptId), now);
            return {
                attemptId: input.attemptId,
                feeGold,
                scheduledAt,
                paperId: paper.paperId,
                bankVersion: paper.bankVersion,
            };
        });
    }
    startExam(attemptId, settlementReceipt) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const attempt = this.#requireExamAttempt(attemptId);
            if (attempt.registration_status === "active") {
                if (attempt.settlement_receipt_id !== settlementReceipt.receiptId) {
                    throw new CareerDomainError("exam_start_conflict", "The exam already started");
                }
                return this.#publicExamPaper(attemptId);
            }
            if (attempt.registration_status !== "registered") {
                throw new CareerDomainError("exam_not_registered", "The exam is not awaiting its session");
            }
            if (now < attempt.scheduled_at || now >= attempt.scheduled_at + TWO_HOURS_MS) {
                throw new CareerDomainError("exam_session_closed", "The assigned two-hour session is closed");
            }
            const reservationReceipt = this.#requireEconomyFinancialReceipt(attempt.reservation_receipt_id);
            recordFinancialReceipt(this.#database, settlementReceipt, {
                amount: reservationReceipt.amount,
                businessReference: `career-exam:${attemptId}:settle`,
                currency: "gold",
                kind: "system_gold_settle",
                residentId: attempt.resident_id,
                reserveReceiptId: attempt.reservation_receipt_id,
            }, now);
            this.#database
                .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'active', settlement_receipt_id = ?, started_at = ?
           WHERE attempt_id = ?`)
                .run(settlementReceipt.receiptId, now, attemptId);
            return this.#publicExamPaper(attemptId);
        });
    }
    releaseUnstartedExam(attemptId, releaseReceipt) {
        const now = this.#now();
        runInTransaction(this.#database, () => {
            const attempt = this.#requireExamAttempt(attemptId);
            if (attempt.registration_status === "released") {
                if (attempt.release_receipt_id !== releaseReceipt.receiptId) {
                    throw new CareerDomainError("exam_release_conflict", "The exam was already released");
                }
                return;
            }
            if (attempt.registration_status !== "registered") {
                throw new CareerDomainError("exam_fee_not_releasable", "A started exam fee cannot be released");
            }
            const reservationReceipt = this.#requireEconomyFinancialReceipt(attempt.reservation_receipt_id);
            recordFinancialReceipt(this.#database, releaseReceipt, {
                amount: reservationReceipt.amount,
                businessReference: `career-exam:${attemptId}:release`,
                currency: "gold",
                kind: "system_gold_release",
                residentId: attempt.resident_id,
                reserveReceiptId: attempt.reservation_receipt_id,
            }, now);
            this.#database
                .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'released', release_receipt_id = ?, ended_at = ?
           WHERE attempt_id = ?`)
                .run(releaseReceipt.receiptId, now, attemptId);
        });
    }
    getWrittenExamPaper(attemptId) {
        const attempt = this.#requireExamAttempt(attemptId);
        if (attempt.registration_status !== "active")
            throw new CareerDomainError("exam_not_active", "The exam is not active");
        return this.#publicExamPaper(attemptId);
    }
    submitWrittenExam(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const attempt = this.#requireExamAttempt(input.attemptId);
            const paper = this.#requireExamPaper(input.attemptId);
            if (paper.paper_id !== input.paperId)
                throw new CareerDomainError("assessment_paper_mismatch", "The written exam paper does not match");
            const graded = gradeAssessment(this.#paperAnswerData(paper).answers, input.answers);
            const replay = this.#submissionReplay(attempt.resident_id, input.idempotencyKey, paper.paper_id, graded.answers);
            if (replay !== null)
                return replay;
            const prior = this.#database
                .prepare("SELECT 1 FROM career_assessment_submissions WHERE paper_id = ? AND kind = 'written_exam'")
                .get(paper.paper_id);
            if (prior)
                throw new CareerDomainError("exam_already_submitted", "The written exam was already submitted");
            if (attempt.registration_status !== "active") {
                throw new CareerDomainError("exam_not_active", "The exam is not active");
            }
            if (now >= attempt.scheduled_at + TWO_HOURS_MS) {
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'failed', correct_answers = NULL, ended_at = ?
             WHERE attempt_id = ?`)
                    .run(now, input.attemptId);
                const result = { status: "expired", correctAnswers: null, passed: false };
                this.#recordSubmission({
                    paper,
                    residentId: attempt.resident_id,
                    idempotencyKey: input.idempotencyKey,
                    answers: graded.answers,
                    result,
                    status: "expired",
                    now,
                });
                return result;
            }
            if (graded.correctAnswers < EXAM_PASS_COUNT) {
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'failed', correct_answers = ?, ended_at = ?
             WHERE attempt_id = ?`)
                    .run(graded.correctAnswers, now, input.attemptId);
                const result = { status: "failed", correctAnswers: graded.correctAnswers, passed: false };
                this.#recordSubmission({
                    paper,
                    residentId: attempt.resident_id,
                    idempotencyKey: input.idempotencyKey,
                    answers: graded.answers,
                    result,
                    status: "failed",
                    now,
                });
                return result;
            }
            if (attempt.career === "constable") {
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'written_passed', correct_answers = ?, ended_at = ?
             WHERE attempt_id = ?`)
                    .run(graded.correctAnswers, now, input.attemptId);
                const result = { status: "written_passed", correctAnswers: graded.correctAnswers, passed: true };
                this.#recordSubmission({
                    paper,
                    residentId: attempt.resident_id,
                    idempotencyKey: input.idempotencyKey,
                    answers: graded.answers,
                    result,
                    status: "written_passed",
                    now,
                });
                return result;
            }
            this.#activateCertificate(attempt, now);
            this.#database
                .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'passed', correct_answers = ?, ended_at = ?
           WHERE attempt_id = ?`)
                .run(graded.correctAnswers, now, input.attemptId);
            const result = { status: "passed", correctAnswers: graded.correctAnswers, passed: true };
            this.#recordSubmission({
                paper,
                residentId: attempt.resident_id,
                idempotencyKey: input.idempotencyKey,
                answers: graded.answers,
                result,
                status: "passed",
                now,
            });
            return result;
        });
    }
    scheduleConstableInterview(attemptId, scheduledAt = nextInterviewSessionAt(this.#now())) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const attempt = this.#requireExamAttempt(attemptId);
            if (attempt.career !== "constable" ||
                !["written_passed", "postponed"].includes(attempt.registration_status)) {
                throw new CareerDomainError("constable_written_exam_required", "A current passed constable written exam is required");
            }
            if ((attempt.ended_at ?? now) + THIRTY_DAYS_MS < scheduledAt) {
                throw new CareerDomainError("constable_written_result_expired", "The written result expired");
            }
            if (scheduledAt <= now || !isBeijingHour(scheduledAt, 20)) {
                throw new CareerDomainError("invalid_interview_session", "Constable interviews start at 20:00 Beijing time");
            }
            const existing = this.#database
                .prepare("SELECT interview_id, scheduled_at, status FROM career_constable_interviews WHERE attempt_id = ?")
                .get(attemptId);
            if (existing?.status === "postponed") {
                this.#database
                    .prepare("DELETE FROM career_constable_examiner_signups WHERE interview_id = ?")
                    .run(existing.interview_id);
                this.#database
                    .prepare("DELETE FROM career_constable_scores WHERE interview_id = ?")
                    .run(existing.interview_id);
                this.#database
                    .prepare(`UPDATE career_constable_interviews
             SET scheduled_at = ?, status = 'signup_open', finalized_at = NULL
             WHERE interview_id = ?`)
                    .run(scheduledAt, existing.interview_id);
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'written_passed' WHERE attempt_id = ?`)
                    .run(attemptId);
                return existing.interview_id;
            }
            if (existing)
                return existing.interview_id;
            const interviewId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO career_constable_interviews (
             interview_id, attempt_id, candidate_resident_id, scheduled_at, status, created_at
           ) VALUES (?, ?, ?, ?, 'signup_open', ?)`)
                .run(interviewId, attemptId, attempt.resident_id, scheduledAt, now);
            return interviewId;
        });
    }
    signupConstableExaminer(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(input.interviewId);
            if (interview.status !== "signup_open") {
                throw new CareerDomainError("examiner_signup_closed", "Examiner signup is closed");
            }
            if (now < interview.scheduled_at - TWELVE_HOURS_MS || now >= interview.scheduled_at) {
                throw new CareerDomainError("examiner_signup_window_closed", "Examiner signup opens 12 hours before the interview");
            }
            if (!input.eligibilityReference ||
                input.examinerResidentId === interview.candidate_resident_id) {
                throw new CareerDomainError("examiner_not_eligible", "The examiner eligibility and conflict check failed");
            }
            const existing = this.#database
                .prepare(`SELECT signup_order FROM career_constable_examiner_signups
           WHERE interview_id = ? AND examiner_account_id = ?`)
                .get(input.interviewId, input.examinerAccountId);
            if (existing) {
                return { signupOrder: existing.signup_order, tentative: existing.signup_order <= 3 };
            }
            const row = this.#database
                .prepare(`SELECT COALESCE(MAX(signup_order), 0) + 1 AS next_order
           FROM career_constable_examiner_signups WHERE interview_id = ?`)
                .get(input.interviewId);
            this.#database
                .prepare(`INSERT INTO career_constable_examiner_signups (
             interview_id, examiner_account_id, examiner_resident_id, eligibility_reference,
             signup_order, signed_up_at
           ) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(input.interviewId, input.examinerAccountId, input.examinerResidentId, input.eligibilityReference, row.next_order, now);
            return { signupOrder: row.next_order, tentative: row.next_order <= 3 };
        });
    }
    confirmConstableExaminerAttendance(input) {
        const now = this.#now();
        const interview = this.#requireInterview(input.interviewId);
        if (interview.status !== "signup_open" ||
            now < interview.scheduled_at - THIRTY_MINUTES_MS ||
            now >= interview.scheduled_at) {
            throw new CareerDomainError("examiner_confirmation_window_closed", "Attendance confirmation is only available in the last 30 minutes");
        }
        if (!input.eligibilityReference) {
            throw new CareerDomainError("examiner_not_eligible", "Attendance requires a fresh eligibility and conflict check");
        }
        const result = this.#database
            .prepare(`UPDATE career_constable_examiner_signups
         SET attendance_confirmed_at = COALESCE(attendance_confirmed_at, ?),
             attendance_eligibility_reference = COALESCE(attendance_eligibility_reference, ?)
         WHERE interview_id = ? AND examiner_account_id = ?`)
            .run(now, input.eligibilityReference, input.interviewId, input.examinerAccountId);
        if (result.changes === 0) {
            throw new CareerDomainError("examiner_not_signed_up", "The examiner did not sign up");
        }
    }
    finalizeConstableExaminerPanel(interviewId) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(interviewId);
            if (interview.status === "panel_ready" || interview.status === "scoring")
                return "panel_ready";
            if (interview.status === "postponed")
                return "postponed";
            if (interview.status !== "signup_open" || now < interview.scheduled_at) {
                throw new CareerDomainError("interview_not_ready", "The interview has not started");
            }
            const confirmed = this.#database
                .prepare(`SELECT examiner_account_id
           FROM career_constable_examiner_signups
           WHERE interview_id = ? AND attendance_confirmed_at IS NOT NULL
             AND attendance_eligibility_reference IS NOT NULL
           ORDER BY signup_order
           LIMIT 3`)
                .all(interviewId);
            if (confirmed.length < 3) {
                this.#database
                    .prepare(`UPDATE career_constable_interviews
             SET status = 'postponed', finalized_at = ? WHERE interview_id = ?`)
                    .run(now, interviewId);
                this.#database
                    .prepare(`UPDATE career_exam_attempts SET registration_status = 'postponed'
             WHERE attempt_id = ?`)
                    .run(interview.attempt_id);
                return "postponed";
            }
            const select = this.#database.prepare(`UPDATE career_constable_examiner_signups SET selected = 1
         WHERE interview_id = ? AND examiner_account_id = ?`);
            for (const examiner of confirmed)
                select.run(interviewId, examiner.examiner_account_id);
            this.#database
                .prepare("UPDATE career_constable_interviews SET status = 'panel_ready' WHERE interview_id = ?")
                .run(interviewId);
            return "panel_ready";
        });
    }
    submitConstableInterviewScore(input) {
        for (const score of [input.facts, input.restraint, input.procedure, input.explanation]) {
            if (!Number.isInteger(score) || score < 0 || score > 5) {
                throw new CareerDomainError("invalid_interview_score", "Every interview dimension is 0 to 5");
            }
        }
        const now = this.#now();
        runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(input.interviewId);
            if (interview.status !== "panel_ready" && interview.status !== "scoring") {
                throw new CareerDomainError("interview_not_scoring", "The final examiner panel is not ready");
            }
            const selected = this.#database
                .prepare(`SELECT 1 FROM career_constable_examiner_signups
           WHERE interview_id = ? AND examiner_account_id = ? AND selected = 1`)
                .get(input.interviewId, input.examinerAccountId);
            if (!selected) {
                throw new CareerDomainError("examiner_not_selected", "Only the final three examiners may score");
            }
            this.#database
                .prepare(`INSERT INTO career_constable_scores (
             interview_id, examiner_account_id, facts_score, restraint_score,
             procedure_score, explanation_score, scored_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(interview_id, examiner_account_id) DO UPDATE SET
             facts_score = excluded.facts_score,
             restraint_score = excluded.restraint_score,
             procedure_score = excluded.procedure_score,
             explanation_score = excluded.explanation_score,
             scored_at = excluded.scored_at`)
                .run(input.interviewId, input.examinerAccountId, input.facts, input.restraint, input.procedure, input.explanation, now);
            this.#database
                .prepare("UPDATE career_constable_interviews SET status = 'scoring' WHERE interview_id = ?")
                .run(input.interviewId);
        });
    }
    openConstablePublicNotice(interviewId, eligibleVoterResidentIds) {
        const now = this.#now();
        const noticeId = runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(interviewId);
            if (interview.status === "public_notice") {
                const existing = this.#database
                    .prepare("SELECT notice_id FROM career_constable_public_notices WHERE interview_id = ?")
                    .get(interviewId);
                return existing.notice_id;
            }
            if (interview.status !== "scoring") {
                throw new CareerDomainError("interview_scores_incomplete", "The interview is not scored");
            }
            const scores = this.#database
                .prepare(`SELECT facts_score, restraint_score, procedure_score, explanation_score
           FROM career_constable_scores WHERE interview_id = ?`)
                .all(interviewId);
            if (scores.length !== 3) {
                throw new CareerDomainError("interview_scores_incomplete", "Exactly three scores are required");
            }
            const facts = scores.reduce((sum, score) => sum + score.facts_score, 0);
            const restraint = scores.reduce((sum, score) => sum + score.restraint_score, 0);
            const procedure = scores.reduce((sum, score) => sum + score.procedure_score, 0);
            const explanation = scores.reduce((sum, score) => sum + score.explanation_score, 0);
            if (facts < 9 ||
                restraint < 9 ||
                procedure < 9 ||
                explanation < 9 ||
                facts + restraint + procedure + explanation < 48) {
                this.#database
                    .prepare(`UPDATE career_constable_interviews
             SET status = 'failed', finalized_at = ? WHERE interview_id = ?`)
                    .run(now, interviewId);
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'failed', ended_at = ? WHERE attempt_id = ?`)
                    .run(now, interview.attempt_id);
                return null;
            }
            const voters = [
                ...new Set(eligibleVoterResidentIds.filter((residentId) => residentId && residentId !== interview.candidate_resident_id)),
            ];
            const noticeId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO career_constable_public_notices (
             notice_id, interview_id, candidate_resident_id, opened_at, closes_at,
             status, eligible_voter_count
           ) VALUES (?, ?, ?, ?, ?, 'open', ?)`)
                .run(noticeId, interviewId, interview.candidate_resident_id, now, now + PUBLIC_NOTICE_MS, voters.length);
            const insertVoter = this.#database.prepare(`INSERT INTO career_constable_notice_voters (notice_id, resident_id) VALUES (?, ?)`);
            for (const voter of voters)
                insertVoter.run(noticeId, voter);
            const attempt = this.#requireExamAttempt(interview.attempt_id);
            this.#database
                .prepare(`INSERT INTO career_certificates (
             resident_id, career, qualification_level, status, source_attempt_id, issued_at
           ) VALUES (?, 'constable', ?, 'pending_public_notice', ?, ?)`)
                .run(interview.candidate_resident_id, attempt.qualification_level, attempt.attempt_id, now);
            this.#database
                .prepare("UPDATE career_constable_interviews SET status = 'public_notice' WHERE interview_id = ?")
                .run(interviewId);
            return noticeId;
        });
        if (noticeId === null) {
            throw new CareerDomainError("constable_interview_failed", "The interview did not pass");
        }
        return noticeId;
    }
    voteConstablePublicNotice(noticeId, residentId, choice) {
        const now = this.#now();
        const notice = this.#database
            .prepare(`SELECT status, closes_at FROM career_constable_public_notices WHERE notice_id = ?`)
            .get(noticeId);
        if (notice?.status !== "open" || now >= notice.closes_at) {
            throw new CareerDomainError("public_notice_closed", "The public notice is closed");
        }
        const result = this.#database
            .prepare(`UPDATE career_constable_notice_voters
         SET choice = ?, voted_at = ?
         WHERE notice_id = ? AND resident_id = ? AND choice IS NULL`)
            .run(choice, now, noticeId, residentId);
        if (result.changes === 0) {
            throw new CareerDomainError("public_notice_vote_unavailable", "The resident is ineligible or already voted");
        }
    }
    finalizeConstablePublicNotice(noticeId, reviewPolicy) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const notice = this.#database
                .prepare(`SELECT interview_id, status, closes_at, eligible_voter_count
           FROM career_constable_public_notices WHERE notice_id = ?`)
                .get(noticeId);
            if (!notice)
                throw new CareerDomainError("public_notice_not_found", "Notice not found");
            if (now < notice.closes_at) {
                throw new CareerDomainError("public_notice_still_open", "The 24-hour notice is still open");
            }
            if (notice.status === "review_required" || notice.status === "certificate_activated") {
                return notice.status;
            }
            const interview = this.#requireInterview(notice.interview_id);
            const attempt = this.#requireExamAttempt(interview.attempt_id);
            if (!reviewPolicy) {
                this.#setPublicNoticeStatus(noticeId, notice.interview_id, attempt, "pending_review_configuration", now);
                return "pending_review_configuration";
            }
            if (!Number.isInteger(reviewPolicy.minimumReviewVotes) ||
                reviewPolicy.minimumReviewVotes < 1 ||
                !Number.isInteger(reviewPolicy.ratioNumerator) ||
                reviewPolicy.ratioNumerator < 1 ||
                !Number.isInteger(reviewPolicy.ratioDenominator) ||
                reviewPolicy.ratioDenominator < reviewPolicy.ratioNumerator) {
                throw new CareerDomainError("invalid_review_policy", "The review policy is invalid");
            }
            const count = this.#database
                .prepare(`SELECT COUNT(*) AS count FROM career_constable_notice_voters
           WHERE notice_id = ? AND choice = 'review_request'`)
                .get(noticeId);
            const reviewRequired = count.count >= reviewPolicy.minimumReviewVotes &&
                count.count * reviewPolicy.ratioDenominator >=
                    notice.eligible_voter_count * reviewPolicy.ratioNumerator;
            if (reviewRequired) {
                this.#setPublicNoticeStatus(noticeId, notice.interview_id, attempt, "review_required", now);
                return "review_required";
            }
            this.#database
                .prepare(`UPDATE career_constable_public_notices
           SET status = 'certificate_activated', finalized_at = ? WHERE notice_id = ?`)
                .run(now, noticeId);
            this.#database
                .prepare(`UPDATE career_constable_interviews
           SET status = 'certificate_activated', finalized_at = ? WHERE interview_id = ?`)
                .run(now, notice.interview_id);
            this.#database
                .prepare(`UPDATE career_certificates
           SET status = 'active', effective_at = ? WHERE source_attempt_id = ?`)
                .run(now, attempt.attempt_id);
            this.#database
                .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'passed', ended_at = ? WHERE attempt_id = ?`)
                .run(now, attempt.attempt_id);
            return "certificate_activated";
        });
    }
    #ensureCoursePaper(input, now) {
        const blueprint = createCoursePracticePaper(
            input.career,
            input.level,
            input.courseIndex,
            input.residentId,
        );
        const existing = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE target_key = ?")
            .get(blueprint.targetKey);
        if (existing)
            return { paperId: existing.paper_id, bankVersion: existing.bank_version };
        const paperId = this.#generateId();
        const publicPaperJson = JSON.stringify(blueprint.publicPaper);
        const answerKeyJson = JSON.stringify({
            answers: blueprint.answerKey,
            review: blueprint.review,
        });
        const paperHash = createHash("sha256")
            .update(JSON.stringify([blueprint.bankVersion, publicPaperJson, answerKeyJson]))
            .digest("hex");
        this.#database
            .prepare(`INSERT INTO career_assessment_papers (
           paper_id, kind, target_key, resident_id, career, qualification_level,
           course_index, bank_version, public_paper_json, answer_key_json,
           paper_hash, created_at
         ) VALUES (?, 'course_practice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(paperId, blueprint.targetKey, input.residentId, input.career, input.level,
            input.courseIndex, blueprint.bankVersion, publicPaperJson, answerKeyJson, paperHash, now);
        return { paperId, bankVersion: blueprint.bankVersion };
    }
    #ensureExamPaper(attempt, now) {
        const blueprint = createWrittenExamPaper(
            attempt.career,
            attempt.qualification_level,
            attempt.attempt_id,
        );
        const existing = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE target_key = ?")
            .get(blueprint.targetKey);
        if (existing)
            return { paperId: existing.paper_id, bankVersion: existing.bank_version };
        const paperId = this.#generateId();
        const publicPaperJson = JSON.stringify(blueprint.publicPaper);
        const answerKeyJson = JSON.stringify({
            answers: blueprint.answerKey,
            review: blueprint.review,
        });
        const paperHash = createHash("sha256")
            .update(JSON.stringify([blueprint.bankVersion, publicPaperJson, answerKeyJson]))
            .digest("hex");
        this.#database
            .prepare(`INSERT INTO career_assessment_papers (
           paper_id, kind, target_key, resident_id, career, qualification_level,
           exam_attempt_id, bank_version, public_paper_json, answer_key_json,
           paper_hash, created_at
         ) VALUES (?, 'written_exam', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(paperId, blueprint.targetKey, attempt.resident_id, attempt.career,
            attempt.qualification_level, attempt.attempt_id, blueprint.bankVersion,
            publicPaperJson, answerKeyJson, paperHash, now);
        return { paperId, bankVersion: blueprint.bankVersion };
    }
    #requireCoursePaper(input) {
        const targetKey = `course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
        const paper = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE target_key = ? AND kind = 'course_practice'")
            .get(targetKey);
        if (!paper)
            throw new CareerDomainError("assessment_paper_not_found", "The course paper is unavailable");
        return paper;
    }
    #requireExamPaper(attemptId) {
        const paper = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE exam_attempt_id = ? AND kind = 'written_exam'")
            .get(attemptId);
        if (!paper)
            throw new CareerDomainError("assessment_paper_not_found", "The written exam paper is unavailable");
        return paper;
    }
    #publicExamPaper(attemptId) {
        const attempt = this.#requireExamAttempt(attemptId);
        const paper = this.#requireExamPaper(attemptId);
        return {
            attemptId,
            paperId: paper.paper_id,
            bankVersion: paper.bank_version,
            scheduledAt: attempt.scheduled_at,
            deadlineAt: attempt.scheduled_at + TWO_HOURS_MS,
            questions: JSON.parse(paper.public_paper_json),
        };
    }
    #submissionPayloadHash(paperId, answers) {
        return createHash("sha256").update(JSON.stringify([paperId, answers])).digest("hex");
    }
    #paperAnswerData(paper) {
        const parsed = JSON.parse(paper.answer_key_json);
        if (Array.isArray(parsed)) {
            return {
                answers: parsed,
                review: parsed.map((answer, index) => ({
                    id: JSON.parse(paper.public_paper_json)[index]?.id ?? String(index + 1),
                    correctAnswer: answer,
                    explanation: "",
                })),
            };
        }
        return parsed;
    }
    #submissionReplay(residentId, idempotencyKey, paperId, answers) {
        if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
            throw new CareerDomainError("invalid_idempotency_key", "An idempotency key is required");
        }
        const existing = this.#database
            .prepare(`SELECT paper_id, payload_hash, result_json
         FROM career_assessment_submissions
         WHERE resident_id = ? AND idempotency_key = ?`)
            .get(residentId, idempotencyKey);
        if (!existing)
            return null;
        const payloadHash = this.#submissionPayloadHash(paperId, answers);
        if (existing.paper_id !== paperId || existing.payload_hash !== payloadHash) {
            throw new CareerDomainError("assessment_submission_conflict", "The submission key was reused with different answers");
        }
        return JSON.parse(existing.result_json);
    }
    #recordSubmission(input) {
        const correctAnswers = gradeAssessment(
            this.#paperAnswerData(input.paper).answers,
            input.answers,
        ).correctAnswers;
        const resultJson = JSON.stringify(input.result);
        this.#database
            .prepare(`INSERT INTO career_assessment_submissions (
           submission_id, paper_id, kind, resident_id, idempotency_key,
           payload_hash, answers_json, correct_answers, passed,
           result_status, result_json, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(this.#generateId(), input.paper.paper_id, input.paper.kind, input.residentId,
            input.idempotencyKey, this.#submissionPayloadHash(input.paper.paper_id, input.answers),
            JSON.stringify(input.answers), correctAnswers, Number(input.result.passed), input.status,
            resultJson, input.now);
    }
    #courseBusinessReference(input) {
        return `career-course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
    }
    #requireLevelPrerequisite(residentId, career, level) {
        if (level === 1)
            return;
        const previous = this.#database
            .prepare(`SELECT 1 FROM career_certificates
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND status = 'active'`)
            .get(residentId, career, level - 1);
        if (!previous) {
            throw new CareerDomainError("previous_certificate_required", "Qualification certificates must be earned in order");
        }
    }
    #requireExamEligibility(residentId, career, level) {
        if (!careerExamAvailability(career, level)) {
            throw new CareerDomainError("assessment_content_not_available", "This written exam is not available");
        }
        requireCareerTrack(this.#database, residentId, career);
        const activeCertificate = this.#database
            .prepare(`SELECT 1 FROM career_certificates
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND status = 'active'`)
            .get(residentId, career, level);
        if (activeCertificate) {
            throw new CareerDomainError("certificate_already_active", "The qualification certificate is already active");
        }
        this.#requireLevelPrerequisite(residentId, career, level);
        const courses = this.#database
            .prepare(`SELECT COUNT(*) AS count FROM career_courses
         WHERE resident_id = ? AND career = ? AND qualification_level = ?
           AND completed_at IS NOT NULL`)
            .get(residentId, career, level);
        if (courses.count !== COURSE_COUNT_PER_LEVEL) {
            throw new CareerDomainError("courses_incomplete", "All three courses must be completed");
        }
        if (level === 1)
            return;
        const records = this.#database
            .prepare(`SELECT COUNT(*) AS total,
                SUM(CASE WHEN qualification_level = ? THEN 1 ELSE 0 END) AS level_count
         FROM career_work_records
         WHERE resident_id = ? AND career = ?`)
            .get(level - 1, residentId, career);
        const requiredTotal = level === 2 ? 10 : level === 3 ? 30 : 70;
        const requiredLevelCount = level === 2 ? 10 : level === 3 ? 10 : 20;
        if (records.total < requiredTotal || (records.level_count ?? 0) < requiredLevelCount) {
            throw new CareerDomainError("work_record_requirement_not_met", "The real work record requirement is not met");
        }
    }
    #examFee(residentId, career, level) {
        const priorFailure = this.#database
            .prepare(`SELECT 1 FROM career_exam_attempts
         WHERE resident_id = ? AND career = ? AND qualification_level = ?
           AND registration_status = 'failed'
         LIMIT 1`)
            .get(residentId, career, level);
        return priorFailure ? EXAM_FEE_GOLD[level] / 2 : EXAM_FEE_GOLD[level];
    }
    #requireEconomyFinancialReceipt(receiptId) {
        const receipt = this.#database
            .prepare(`SELECT receipt_id, resident_id, kind, currency, amount, business_reference
         FROM economy_financial_receipts WHERE receipt_id = ?`)
            .get(receiptId);
        if (!receipt) {
            throw new CareerDomainError("financial_receipt_unverified", "The original economy receipt is unavailable");
        }
        return receipt;
    }
    #activateCertificate(attempt, now) {
        this.#database
            .prepare(`INSERT INTO career_certificates (
           resident_id, career, qualification_level, status, source_attempt_id, issued_at, effective_at
         ) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
            .run(attempt.resident_id, attempt.career, attempt.qualification_level, attempt.attempt_id, now, now);
    }
    #getExamAttempt(attemptId) {
        return this.#database
            .prepare("SELECT * FROM career_exam_attempts WHERE attempt_id = ?")
            .get(attemptId);
    }
    #requireExamAttempt(attemptId) {
        const attempt = this.#getExamAttempt(attemptId);
        if (!attempt)
            throw new CareerDomainError("exam_attempt_not_found", "Exam attempt not found");
        return attempt;
    }
    #requireInterview(interviewId) {
        const interview = this.#database
            .prepare("SELECT * FROM career_constable_interviews WHERE interview_id = ?")
            .get(interviewId);
        if (!interview)
            throw new CareerDomainError("interview_not_found", "Interview not found");
        return interview;
    }
    #setPublicNoticeStatus(noticeId, interviewId, attempt, status, now) {
        this.#database
            .prepare(`UPDATE career_constable_public_notices SET status = ?, finalized_at = ? WHERE notice_id = ?`)
            .run(status, now, noticeId);
        this.#database
            .prepare(`UPDATE career_constable_interviews SET status = ?, finalized_at = ? WHERE interview_id = ?`)
            .run(status, now, interviewId);
        this.#database
            .prepare(`UPDATE career_certificates SET status = ? WHERE source_attempt_id = ?`)
            .run(status, attempt.attempt_id);
    }
}
