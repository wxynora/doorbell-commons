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
import { activeCertificateLevel, EXAM_SESSION_DURATION_MS, isBeijingExamSessionOpen, isBeijingHour, nextExamSessionAt, nextInterviewSessionAt, recordFinancialReceipt, requireCareerTrack, runInTransaction, } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
const DEFAULT_CURRICULUM = Object.freeze({
    careerCourseAvailability,
    careerCourseContent,
    careerExamAvailability,
    createCoursePracticePaper,
    createWrittenExamPaper,
});
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1_000;
const THIRTY_MINUTES_MS = 30 * 60 * 1_000;
const PUBLIC_NOTICE_MS = 24 * 60 * 60 * 1_000;
const CONSTABLE_INTERVIEW_DIMENSIONS = Object.freeze([
    "facts",
    "restraint",
    "procedure",
    "explanation",
]);

function snapshotJson(value, field) {
    if (value === null || typeof value !== "object")
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    if ((Array.isArray(value) && value.length === 0) ||
        (!Array.isArray(value) && Object.keys(value).length === 0))
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    let serialized;
    try {
        serialized = JSON.stringify(value);
        if (!serialized)
            throw new Error("empty_snapshot");
        JSON.parse(serialized);
    }
    catch {
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    }
    return serialized;
}

function freezeConstableInterviewMaterial(provider, input) {
    if (!provider || typeof provider.getConstableInterviewPaper !== "function")
        return null;
    let material;
    try {
        material = provider.getConstableInterviewPaper(input);
    }
    catch {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
    }
    if (!material || typeof material !== "object" || Array.isArray(material) ||
        typeof material.bankVersion !== "string" || material.bankVersion.trim().length === 0) {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
    }
    const scoringStandard = material.scoringStandard;
    if (!scoringStandard || typeof scoringStandard !== "object" || Array.isArray(scoringStandard) ||
        typeof scoringStandard.version !== "string" || scoringStandard.version.trim().length === 0 ||
        !Array.isArray(scoringStandard.dimensions) ||
        scoringStandard.dimensions.length !== CONSTABLE_INTERVIEW_DIMENSIONS.length ||
        scoringStandard.dimensions.some((dimension, index) => dimension !== CONSTABLE_INTERVIEW_DIMENSIONS[index]) ||
        scoringStandard.minimumDimensionAverage !== 3 ||
        scoringStandard.minimumTotalAverage !== 16) {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview scoring standard is unavailable");
    }
    return {
        bankVersion: material.bankVersion,
        paperSnapshotJson: snapshotJson(material.paper, "paper"),
        factMaterialSnapshotJson: snapshotJson(material.factMaterial, "fact material"),
        scoringStandardSnapshotJson: snapshotJson(scoringStandard, "scoring standard"),
    };
}

export class CareerSchoolService {
    #database;
    #now;
    #generateId;
    #curriculum;
    #constableInterviewBank;
    constructor(options) {
        this.#database = options.database;
        this.#now = options.now ?? Date.now;
        this.#generateId = options.generateId ?? randomUUID;
        this.#curriculum = options.curriculum ?? DEFAULT_CURRICULUM;
        this.#constableInterviewBank = options.constableInterviewBank ?? null;
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
    courseAvailable(career, level, courseIndex) {
        return this.#curriculum.careerCourseAvailability(career, level, courseIndex);
    }
    examAvailable(career, level) {
        return this.#curriculum.careerExamAvailability(career, level);
    }
    enrollCourse(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
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
            const existing = this.#database
                .prepare(`SELECT tuition_receipt_id, content_bank_version, content_snapshot_json,
                         content_read_at, completed_at
           FROM career_courses
           WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                .get(input.residentId, input.career, input.level, input.courseIndex);
            if (existing) {
                if (existing.tuition_receipt_id !== input.tuitionReceipt.receiptId) {
                    throw new CareerDomainError("course_enrollment_conflict", "The course is already enrolled with another receipt");
                }
                recordFinancialReceipt(this.#database, input.tuitionReceipt, {
                    amount: COURSE_TUITION_GOLD[input.level],
                    businessReference,
                    currency: "gold",
                    kind: "system_gold_charge",
                    residentId: input.residentId,
                }, now);
                const snapshot = this.#courseSnapshot(existing, input);
                const paper = this.#requireCoursePaper(input, snapshot.bankVersion);
                return {
                    completed: existing.completed_at !== null,
                    contentRead: existing.content_read_at !== null,
                    paperId: paper.paper_id,
                    bankVersion: snapshot.bankVersion,
                };
            }
            if (!this.#curriculum.careerCourseAvailability(input.career, input.level, input.courseIndex)) {
                throw new CareerDomainError("assessment_content_not_available", "This course is not available");
            }
            const content = this.#curriculum.careerCourseContent(input.career, input.level, input.courseIndex);
            const paperBlueprint = this.#curriculum.createCoursePracticePaper(input.career, input.level, input.courseIndex, input.residentId);
            if (content.bankVersion !== paperBlueprint.bankVersion) {
                throw new CareerDomainError("assessment_content_not_available", "The course content and practice bank do not match");
            }
            recordFinancialReceipt(this.#database, input.tuitionReceipt, {
                amount: COURSE_TUITION_GOLD[input.level],
                businessReference,
                currency: "gold",
                kind: "system_gold_charge",
                residentId: input.residentId,
            }, now);
            this.#database
                .prepare(`INSERT INTO career_courses (
             resident_id, career, qualification_level, course_index,
             tuition_receipt_id, enrolled_at, content_bank_version, content_snapshot_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(input.residentId, input.career, input.level, input.courseIndex,
                input.tuitionReceipt.receiptId, now, content.bankVersion, JSON.stringify(content));
            const paper = this.#ensureCoursePaper(input, now, content.bankVersion, paperBlueprint);
            return {
                completed: false,
                contentRead: false,
                paperId: paper.paperId,
                bankVersion: paper.bankVersion,
            };
        });
    }
    getCourseContent(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const course = this.#requireCourse(input);
            const content = this.#courseSnapshot(course, input);
            const paper = this.#requireCoursePaper(input, content.bankVersion);
            const contentDeliveryId = course.content_delivery_id ?? this.#generateId();
            const deliveredAt = course.content_delivered_at ?? now;
            if (course.content_delivery_id === null || course.content_delivered_at === null) {
                this.#database
                    .prepare(`UPDATE career_courses
             SET content_delivery_id = ?, content_delivered_at = ?
             WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                    .run(contentDeliveryId, deliveredAt, input.residentId, input.career, input.level, input.courseIndex);
            }
            return {
                ...content,
                contentDeliveryId,
                deliveredAt,
                paperId: paper.paper_id,
                practiceQuestions: JSON.parse(paper.public_paper_json),
            };
        });
    }
    markCourseContentRead(input) {
        return runInTransaction(this.#database, () => {
            const course = this.#requireCourse(input);
            const snapshot = this.#courseSnapshot(course, input);
            this.#requireCoursePaper(input, snapshot.bankVersion);
            if (typeof input.contentDeliveryId !== "string" ||
                input.contentDeliveryId.length === 0 ||
                course.content_delivery_id !== input.contentDeliveryId ||
                course.content_delivered_at === null) {
                throw new CareerDomainError("course_content_delivery_mismatch", "The course read confirmation does not match a delivered content snapshot");
            }
            this.#database
                .prepare(`UPDATE career_courses
         SET content_read_at = COALESCE(content_read_at, ?)
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
                .run(this.#now(), input.residentId, input.career, input.level, input.courseIndex);
        });
    }
    submitCoursePractice(input) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const course = this.#requireCourse(input);
            if (course.content_read_at === null) {
                throw new CareerDomainError("course_content_not_read", "The approved teaching units must be read before practice");
            }
            const snapshot = this.#courseSnapshot(course, input);
            const paper = this.#requireCoursePaper(input, snapshot.bankVersion);
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
                review: answerData.review.map((entry, index) => {
                    const selectedAnswer = graded.answers[index];
                    const correct = selectedAnswer === entry.correctAnswer;
                    if (passed)
                        return { ...entry, selectedAnswer, correct };
                    const { correctAnswer: _correctAnswer, ...learningFeedback } = entry;
                    return { ...learningFeedback, selectedAnswer, correct };
                }),
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
            if (["registered", "active"].includes(attempt.registration_status) &&
                !isBeijingExamSessionOpen(now, attempt.scheduled_at)) {
                throw new CareerDomainError("exam_session_closed", "The assigned exam session is closed");
            }
            if (attempt.registration_status === "active") {
                if (attempt.settlement_receipt_id !== settlementReceipt.receiptId) {
                    throw new CareerDomainError("exam_start_conflict", "The exam already started");
                }
                return this.#publicExamPaper(attemptId);
            }
            if (attempt.registration_status !== "registered") {
                throw new CareerDomainError("exam_not_registered", "The exam is not awaiting its session");
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
            if (now >= attempt.scheduled_at + EXAM_SESSION_DURATION_MS) {
                throw new CareerDomainError("exam_fee_not_releasable", "A missed exam fee cannot be released");
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
    expireMissedExam(attemptId, settlementReceipt = null) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const attempt = this.#requireExamAttempt(attemptId);
            const missedAt = attempt.scheduled_at + EXAM_SESSION_DURATION_MS;
            if (now < missedAt)
                return { attemptId, expired: false, missedAt: null };
            if (attempt.missed_session_at !== null) {
                return { attemptId, expired: true, missedAt: attempt.missed_session_at };
            }
            if (!["registered", "active"].includes(attempt.registration_status)) {
                return { attemptId, expired: false, missedAt: null };
            }
            let settlementReceiptId = attempt.settlement_receipt_id;
            if (attempt.registration_status === "registered") {
                if (!settlementReceipt) {
                    throw new CareerDomainError("exam_expiry_settlement_required", "A missed registration fee must be settled");
                }
                const reservationReceipt = this.#requireEconomyFinancialReceipt(attempt.reservation_receipt_id);
                recordFinancialReceipt(this.#database, settlementReceipt, {
                    amount: reservationReceipt.amount,
                    businessReference: `career-exam:${attemptId}:expire`,
                    currency: "gold",
                    kind: "system_gold_settle",
                    residentId: attempt.resident_id,
                    reserveReceiptId: attempt.reservation_receipt_id,
                }, now);
                settlementReceiptId = settlementReceipt.receiptId;
            }
            this.#database
                .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'failed',
               settlement_receipt_id = COALESCE(settlement_receipt_id, ?),
               correct_answers = NULL,
               ended_at = ?,
               missed_session_at = ?
           WHERE attempt_id = ?`)
                .run(settlementReceiptId, missedAt, missedAt, attemptId);
            return { attemptId, expired: true, missedAt };
        });
    }
    getWrittenExamPaper(attemptId) {
        const now = this.#now();
        const attempt = this.#requireExamAttempt(attemptId);
        if (attempt.registration_status !== "active")
            throw new CareerDomainError("exam_not_active", "The exam is not active");
        if (!isBeijingExamSessionOpen(now, attempt.scheduled_at))
            throw new CareerDomainError("exam_session_closed", "The assigned exam session is closed");
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
            if (!isBeijingExamSessionOpen(now, attempt.scheduled_at)) {
                const missedAt = attempt.scheduled_at + EXAM_SESSION_DURATION_MS;
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'failed', correct_answers = NULL,
                 ended_at = ?, missed_session_at = ?
             WHERE attempt_id = ?`)
                    .run(missedAt, missedAt, input.attemptId);
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
                this.scheduleConstableInterview(input.attemptId, nextInterviewSessionAt(now));
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
                .prepare(`SELECT interview_id, scheduled_at, status, candidate_resident_id,
                         interview_bank_version, interview_paper_snapshot_json,
                         interview_fact_material_snapshot_json,
                         interview_scoring_standard_snapshot_json
                  FROM career_constable_interviews WHERE attempt_id = ?`)
                .get(attemptId);
            if (existing?.status === "postponed") {
                const material = freezeConstableInterviewMaterial(this.#constableInterviewBank, {
                    interviewId: existing.interview_id,
                    candidateResidentId: existing.candidate_resident_id,
                    scheduledAt,
                });
                this.#database
                    .prepare("DELETE FROM career_constable_examiner_signups WHERE interview_id = ?")
                    .run(existing.interview_id);
                this.#database
                    .prepare("DELETE FROM career_constable_scores WHERE interview_id = ?")
                    .run(existing.interview_id);
                this.#database
                    .prepare(`UPDATE career_constable_interviews
             SET scheduled_at = ?, interview_bank_version = ?,
                 interview_paper_snapshot_json = ?,
                 interview_fact_material_snapshot_json = ?,
                 interview_scoring_standard_snapshot_json = ?,
                 status = 'signup_open', finalized_at = NULL
             WHERE interview_id = ?`)
                    .run(scheduledAt, material?.bankVersion ?? existing.interview_bank_version ?? null,
                    material?.paperSnapshotJson ?? existing.interview_paper_snapshot_json ?? null,
                    material?.factMaterialSnapshotJson ?? existing.interview_fact_material_snapshot_json ?? null,
                    material?.scoringStandardSnapshotJson ?? existing.interview_scoring_standard_snapshot_json ?? null,
                    existing.interview_id);
                this.#database
                    .prepare(`UPDATE career_exam_attempts
             SET registration_status = 'written_passed' WHERE attempt_id = ?`)
                    .run(attemptId);
                return existing.interview_id;
            }
            if (existing) {
                if (!existing.interview_bank_version && this.#constableInterviewBank) {
                    const material = freezeConstableInterviewMaterial(this.#constableInterviewBank, {
                        interviewId: existing.interview_id,
                        candidateResidentId: existing.candidate_resident_id,
                        scheduledAt: existing.scheduled_at,
                    });
                    this.#database
                        .prepare(`UPDATE career_constable_interviews
                     SET interview_bank_version = ?,
                         interview_paper_snapshot_json = ?,
                         interview_fact_material_snapshot_json = ?,
                         interview_scoring_standard_snapshot_json = ?
                     WHERE interview_id = ?`)
                        .run(material.bankVersion, material.paperSnapshotJson,
                        material.factMaterialSnapshotJson,
                        material.scoringStandardSnapshotJson,
                        existing.interview_id);
                }
                return existing.interview_id;
            }
            const interviewId = this.#generateId();
            const material = freezeConstableInterviewMaterial(this.#constableInterviewBank, {
                interviewId,
                candidateResidentId: attempt.resident_id,
                scheduledAt,
            });
            this.#database
                .prepare(`INSERT INTO career_constable_interviews (
             interview_id, attempt_id, candidate_resident_id, scheduled_at,
             interview_bank_version, interview_paper_snapshot_json,
             interview_fact_material_snapshot_json,
             interview_scoring_standard_snapshot_json, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signup_open', ?)`)
                .run(interviewId, attemptId, attempt.resident_id, scheduledAt,
                material?.bankVersion ?? null,
                material?.paperSnapshotJson ?? null,
                material?.factMaterialSnapshotJson ?? null,
                material?.scoringStandardSnapshotJson ?? null,
                now);
            return interviewId;
        });
    }
    getConstableInterviewMaterial(interviewId) {
        return this.#readInterviewMaterial(this.#requireInterview(interviewId));
    }
    constableExaminerEligible(interviewId, residentId) {
        const interview = this.#requireInterview(interviewId);
        try {
            this.#requireConstableExaminerEligibility(interview, residentId);
            return true;
        }
        catch (error) {
            if (error instanceof CareerDomainError && error.code === "examiner_not_eligible")
                return false;
            throw error;
        }
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
            if (!input.eligibilityReference) {
                throw new CareerDomainError("examiner_not_eligible", "The examiner eligibility and conflict check failed");
            }
            this.#requireConstableExaminerEligibility(interview, input.examinerResidentId);
            const existing = this.#database
                .prepare(`SELECT signup_order FROM career_constable_examiner_signups
           WHERE interview_id = ? AND examiner_account_id = ?`)
                .get(input.interviewId, input.examinerAccountId);
            const residentExisting = this.#database
                .prepare(`SELECT examiner_account_id FROM career_constable_examiner_signups
           WHERE interview_id = ? AND examiner_resident_id = ?`)
                .get(input.interviewId, input.examinerResidentId);
            if (residentExisting && residentExisting.examiner_account_id !== input.examinerAccountId) {
                throw new CareerDomainError("examiner_account_identity_conflict", "The examiner resident is bound to another account");
            }
            if (existing) {
                const identity = this.#database
                    .prepare(`SELECT examiner_resident_id FROM career_constable_examiner_signups
             WHERE interview_id = ? AND examiner_account_id = ?`)
                    .get(input.interviewId, input.examinerAccountId);
                if (identity.examiner_resident_id !== input.examinerResidentId) {
                    throw new CareerDomainError("examiner_account_identity_conflict", "The examiner account is bound to another resident");
                }
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
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(input.interviewId);
            if (interview.status !== "signup_open" ||
                now < interview.scheduled_at - THIRTY_MINUTES_MS ||
                now >= interview.scheduled_at) {
                throw new CareerDomainError("examiner_confirmation_window_closed", "Attendance confirmation is only available in the last 30 minutes");
            }
            if (!input.eligibilityReference) {
                throw new CareerDomainError("examiner_not_eligible", "Attendance requires a fresh eligibility and conflict check");
            }
            const signup = this.#database
                .prepare(`SELECT examiner_resident_id FROM career_constable_examiner_signups
             WHERE interview_id = ? AND examiner_account_id = ?`)
                .get(input.interviewId, input.examinerAccountId);
            if (!signup)
                throw new CareerDomainError("examiner_not_signed_up", "The examiner did not sign up");
            if (input.examinerResidentId !== undefined &&
                input.examinerResidentId !== signup.examiner_resident_id) {
                throw new CareerDomainError("examiner_account_identity_conflict", "The examiner account is bound to another resident");
            }
            this.#requireConstableExaminerEligibility(interview, signup.examiner_resident_id);
            this.#database
                .prepare(`UPDATE career_constable_examiner_signups
             SET attendance_confirmed_at = COALESCE(attendance_confirmed_at, ?),
                 attendance_eligibility_reference = COALESCE(attendance_eligibility_reference, ?)
             WHERE interview_id = ? AND examiner_account_id = ?`)
                .run(now, input.eligibilityReference, input.interviewId, input.examinerAccountId);
        });
    }
    finalizeConstableExaminerPanel(interviewId) {
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(interviewId);
            if (interview.status === "panel_ready" || interview.status === "scoring")
                return "panel_ready";
            if (interview.status === "postponed")
                return { status: "postponed", nextScheduledAt: null };
            if (interview.status !== "signup_open" || now < interview.scheduled_at) {
                throw new CareerDomainError("interview_not_ready", "The interview has not started");
            }
            const confirmed = this.#database
                .prepare(`SELECT examiner_account_id, examiner_resident_id
           FROM career_constable_examiner_signups
           WHERE interview_id = ? AND attendance_confirmed_at IS NOT NULL
             AND attendance_eligibility_reference IS NOT NULL
           ORDER BY signup_order
           `)
                .all(interviewId);
            const eligibleConfirmed = confirmed.filter((examiner) => {
                try {
                    this.#requireConstableExaminerEligibility(interview, examiner.examiner_resident_id);
                    return true;
                }
                catch (error) {
                    if (error instanceof CareerDomainError && error.code === "examiner_not_eligible")
                        return false;
                    throw error;
                }
            }).slice(0, 3);
            if (eligibleConfirmed.length < 3) {
                const scheduledAt = nextInterviewSessionAt(now);
                const attempt = this.#requireExamAttempt(interview.attempt_id);
                if ((attempt.ended_at ?? now) + THIRTY_DAYS_MS < scheduledAt) {
                    this.#database
                        .prepare(`UPDATE career_constable_interviews
                     SET status = 'postponed', finalized_at = ?,
                         last_postponed_at = ?, postponed_count = postponed_count + 1
                     WHERE interview_id = ?`)
                        .run(now, now, interviewId);
                    this.#database
                        .prepare(`UPDATE career_exam_attempts SET registration_status = 'postponed'
                     WHERE attempt_id = ?`)
                        .run(interview.attempt_id);
                    return { status: "postponed", nextScheduledAt: null };
                }
                const material = freezeConstableInterviewMaterial(this.#constableInterviewBank, {
                    interviewId,
                    candidateResidentId: interview.candidate_resident_id,
                    scheduledAt,
                });
                this.#database
                    .prepare("DELETE FROM career_constable_examiner_signups WHERE interview_id = ?")
                    .run(interviewId);
                this.#database
                    .prepare("DELETE FROM career_constable_scores WHERE interview_id = ?")
                    .run(interviewId);
                this.#database
                    .prepare(`UPDATE career_constable_interviews
             SET scheduled_at = ?, interview_bank_version = ?,
                 interview_paper_snapshot_json = ?,
                 interview_fact_material_snapshot_json = ?,
                 interview_scoring_standard_snapshot_json = ?,
                 status = 'signup_open', finalized_at = NULL,
                 last_postponed_at = ?, postponed_count = postponed_count + 1
                     WHERE interview_id = ?`)
                    .run(scheduledAt, material?.bankVersion ?? interview.interview_bank_version ?? null,
                    material?.paperSnapshotJson ?? interview.interview_paper_snapshot_json ?? null,
                    material?.factMaterialSnapshotJson ?? interview.interview_fact_material_snapshot_json ?? null,
                    material?.scoringStandardSnapshotJson ?? interview.interview_scoring_standard_snapshot_json ?? null,
                    now,
                    interviewId);
                this.#database
                    .prepare(`UPDATE career_exam_attempts SET registration_status = 'written_passed'
             WHERE attempt_id = ?`)
                    .run(interview.attempt_id);
                return { status: "postponed", nextScheduledAt: scheduledAt };
            }
            const select = this.#database.prepare(`UPDATE career_constable_examiner_signups SET selected = 1
         WHERE interview_id = ? AND examiner_account_id = ?`);
            for (const examiner of eligibleConfirmed)
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
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(input.interviewId);
            const selected = this.#database
                .prepare(`SELECT examiner_resident_id FROM career_constable_examiner_signups
           WHERE interview_id = ? AND examiner_account_id = ? AND selected = 1`)
                .get(input.interviewId, input.examinerAccountId);
            if (!selected) {
                throw new CareerDomainError("examiner_not_selected", "Only the final three examiners may score");
            }
            if (input.examinerResidentId !== undefined &&
                input.examinerResidentId !== selected.examiner_resident_id) {
                throw new CareerDomainError("examiner_account_identity_conflict", "The examiner account is bound to another resident");
            }
            this.#requireConstableExaminerEligibility(interview, selected.examiner_resident_id);
            this.#requireInterviewMaterial(interview);
            const existing = this.#database
                .prepare(`SELECT facts_score, restraint_score, procedure_score, explanation_score
             FROM career_constable_scores
             WHERE interview_id = ? AND examiner_account_id = ?`)
                .get(input.interviewId, input.examinerAccountId);
            if (existing) {
                if (existing.facts_score !== input.facts ||
                    existing.restraint_score !== input.restraint ||
                    existing.procedure_score !== input.procedure ||
                    existing.explanation_score !== input.explanation) {
                    throw new CareerDomainError("interview_score_conflict", "The examiner score is immutable");
                }
                return { status: interview.status, replay: true };
            }
            if (interview.status !== "panel_ready" && interview.status !== "scoring") {
                throw new CareerDomainError("interview_not_scoring", "The final examiner panel is not ready");
            }
            this.#database
                .prepare(`INSERT INTO career_constable_scores (
             interview_id, examiner_account_id, facts_score, restraint_score,
             procedure_score, explanation_score, scored_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(input.interviewId, input.examinerAccountId, input.facts, input.restraint, input.procedure, input.explanation, now);
            this.#database
                .prepare("UPDATE career_constable_interviews SET status = 'scoring' WHERE interview_id = ?")
                .run(input.interviewId);
            return { status: "scoring", replay: false };
        });
    }
    openConstablePublicNotice(interviewId, eligibleVoterResidentIds, candidateResidentName) {
        if (typeof candidateResidentName !== "string" || candidateResidentName.trim().length === 0) {
            throw new CareerDomainError("invalid_public_notice_candidate", "The public notice candidate name is invalid");
        }
        const now = this.#now();
        return runInTransaction(this.#database, () => {
            const interview = this.#requireInterview(interviewId);
            if (interview.status === "public_notice") {
                const existing = this.#database
                    .prepare("SELECT notice_id FROM career_constable_public_notices WHERE interview_id = ?")
                    .get(interviewId);
                return { status: "public_notice", noticeId: existing.notice_id };
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
                return { status: "failed", noticeId: null };
            }
            this.#requireInterviewMaterial(interview);
            const voters = [
                ...new Set(eligibleVoterResidentIds.filter((residentId) => residentId && residentId !== interview.candidate_resident_id)),
            ];
            const noticeId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO career_constable_public_notices (
             notice_id, interview_id, candidate_resident_id, candidate_resident_name,
             opened_at, closes_at, status, eligible_voter_count
           ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`)
                .run(noticeId, interviewId, interview.candidate_resident_id, candidateResidentName,
                now, now + PUBLIC_NOTICE_MS, voters.length);
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
            return { status: "public_notice", noticeId };
        });
    }
    voteConstablePublicNotice(noticeId, residentId, choice) {
        const now = this.#now();
        if (!['no_objection', 'review_request'].includes(choice))
            throw new CareerDomainError("invalid_public_notice_choice", "The public notice choice is invalid");
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
            const count = this.#database
                .prepare(`SELECT COUNT(*) AS count FROM career_constable_notice_voters
           WHERE notice_id = ? AND choice = 'review_request'`)
                .get(noticeId);
            if (!reviewPolicy && count.count > 0) {
                this.#setPublicNoticeStatus(noticeId, notice.interview_id, attempt, "pending_review_configuration", now);
                return "pending_review_configuration";
            }
            if (!reviewPolicy)
                return this.#activateConstablePublicNotice(noticeId, notice.interview_id, attempt, now);
            if (!Number.isInteger(reviewPolicy.minimumReviewVotes) ||
                reviewPolicy.minimumReviewVotes < 1 ||
                !Number.isInteger(reviewPolicy.ratioNumerator) ||
                reviewPolicy.ratioNumerator < 1 ||
                !Number.isInteger(reviewPolicy.ratioDenominator) ||
                reviewPolicy.ratioDenominator < reviewPolicy.ratioNumerator) {
                throw new CareerDomainError("invalid_review_policy", "The review policy is invalid");
            }
            const reviewRequired = count.count >= reviewPolicy.minimumReviewVotes &&
                count.count * reviewPolicy.ratioDenominator >=
                    notice.eligible_voter_count * reviewPolicy.ratioNumerator;
            if (reviewRequired) {
                this.#setPublicNoticeStatus(noticeId, notice.interview_id, attempt, "review_required", now);
                return "review_required";
            }
            return this.#activateConstablePublicNotice(noticeId, notice.interview_id, attempt, now);
        });
    }
    advanceConstableInterviews(now = this.#now()) {
        const progressed = [];
        const duePanels = this.#database
            .prepare(`SELECT interview_id FROM career_constable_interviews
          WHERE status = 'signup_open' AND scheduled_at <= ?
          ORDER BY scheduled_at, interview_id`)
            .all(now);
        for (const row of duePanels) {
            const result = this.finalizeConstableExaminerPanel(row.interview_id);
            progressed.push({ interviewId: row.interview_id, result });
        }
        const dueNotices = this.#database
            .prepare(`SELECT notice_id FROM career_constable_public_notices
          WHERE status = 'open' AND closes_at <= ?
          ORDER BY closes_at, notice_id`)
            .all(now);
        for (const row of dueNotices) {
            const result = this.finalizeConstablePublicNotice(row.notice_id);
            progressed.push({ noticeId: row.notice_id, result });
        }
        return progressed;
    }
    #readInterviewMaterial(interview) {
        if (!interview?.interview_bank_version ||
            !interview.interview_paper_snapshot_json ||
            !interview.interview_fact_material_snapshot_json ||
            !interview.interview_scoring_standard_snapshot_json) {
            throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
        }
        let paper;
        let factMaterial;
        let scoringStandard;
        try {
            paper = JSON.parse(interview.interview_paper_snapshot_json);
            factMaterial = JSON.parse(interview.interview_fact_material_snapshot_json);
            scoringStandard = JSON.parse(interview.interview_scoring_standard_snapshot_json);
        }
        catch {
            throw new CareerDomainError("interview_material_not_configured", "The constable interview material is invalid");
        }
        const validStandard = scoringStandard && typeof scoringStandard === "object" &&
            !Array.isArray(scoringStandard) &&
            typeof scoringStandard.version === "string" && scoringStandard.version.length > 0 &&
            Array.isArray(scoringStandard.dimensions) &&
            scoringStandard.dimensions.length === CONSTABLE_INTERVIEW_DIMENSIONS.length &&
            scoringStandard.dimensions.every((dimension, index) => dimension === CONSTABLE_INTERVIEW_DIMENSIONS[index]) &&
            scoringStandard.minimumDimensionAverage === 3 &&
            scoringStandard.minimumTotalAverage === 16;
        if (paper === null || typeof paper !== "object" ||
            factMaterial === null || typeof factMaterial !== "object" ||
            (Array.isArray(paper) && paper.length === 0) ||
            (!Array.isArray(paper) && Object.keys(paper).length === 0) ||
            (Array.isArray(factMaterial) && factMaterial.length === 0) ||
            (!Array.isArray(factMaterial) && Object.keys(factMaterial).length === 0) ||
            !validStandard) {
            throw new CareerDomainError("interview_material_not_configured", "The constable interview material is invalid");
        }
        return {
            bankVersion: interview.interview_bank_version,
            paper,
            factMaterial,
            scoringStandard,
        };
    }
    #requireInterviewMaterial(interview) {
        return this.#readInterviewMaterial(interview);
    }
    #requireConstableExaminerEligibility(interview, examinerResidentId) {
        if (typeof examinerResidentId !== "string" || examinerResidentId.trim().length === 0 ||
            examinerResidentId === interview.candidate_resident_id) {
            throw new CareerDomainError("examiner_not_eligible", "The examiner eligibility and conflict check failed");
        }
        if (this.#sameConstableHousehold(interview.candidate_resident_id, examinerResidentId) ||
            this.#hasCurrentConstableRelationship(interview.candidate_resident_id, examinerResidentId)) {
            throw new CareerDomainError("examiner_not_eligible", "The examiner eligibility and conflict check failed");
        }
    }
    #sameConstableHousehold(candidateResidentId, examinerResidentId) {
        const columns = new Set(this.#database
            .prepare("PRAGMA table_info(residents)")
            .all()
            .map((column) => column.name));
        for (const column of ["household_id", "home_id", "farm_id"]) {
            if (!columns.has(column))
                continue;
            const rows = this.#database
                .prepare(`SELECT ${column} AS household FROM residents WHERE resident_id IN (?, ?)`)
                .all(candidateResidentId, examinerResidentId);
            if (rows.length === 2 && rows[0].household && rows[0].household === rows[1].household)
                return true;
        }
        return false;
    }
    #hasCurrentConstableRelationship(candidateResidentId, examinerResidentId) {
        const loan = this.#database
            .prepare(`SELECT 1 FROM economy_player_loans
          WHERE status NOT IN ('repaid', 'cancelled')
            AND ((lender_resident_id = ? AND borrower_resident_id = ?)
              OR (lender_resident_id = ? AND borrower_resident_id = ?))
          LIMIT 1`)
            .get(candidateResidentId, examinerResidentId, examinerResidentId, candidateResidentId);
        if (loan)
            return true;
        const trade = this.#database
            .prepare(`SELECT 1 FROM economy_trades
          WHERE state IN ('pending', 'frozen')
            AND ((payer_resident_id = ? AND payee_resident_id = ?)
              OR (payer_resident_id = ? AND payee_resident_id = ?))
          LIMIT 1`)
            .get(candidateResidentId, examinerResidentId, examinerResidentId, candidateResidentId);
        if (trade)
            return true;
        const jobs = this.#database
            .prepare(`SELECT job_id, source_type, source_id, owner_resident_id, worker_resident_id
          FROM career_jobs
          WHERE career = ? AND status IN ('available', 'accepted', 'assigned', 'active')`)
            .all("constable");
        for (const job of jobs) {
            if (!String(job.source_type).toLowerCase().includes("complaint"))
                continue;
            const parties = new Set([job.owner_resident_id, job.worker_resident_id].filter(Boolean));
            for (const row of this.#database
                .prepare("SELECT resident_id FROM career_job_assignment_exclusions WHERE job_id = ?")
                .all(job.job_id))
                parties.add(row.resident_id);
            const source = this.#database
                .prepare(`SELECT fact_json FROM career_commission_source_facts
             WHERE source_type = ? AND source_id = ?`)
                .get(job.source_type, job.source_id);
            if (source) {
                try {
                    const collect = (value) => {
                        if (typeof value === "string") {
                            parties.add(value);
                            return;
                        }
                        if (Array.isArray(value)) {
                            for (const item of value)
                                collect(item);
                            return;
                        }
                        if (value && typeof value === "object") {
                            for (const item of Object.values(value))
                                collect(item);
                        }
                    };
                    collect(JSON.parse(source.fact_json));
                }
                catch {
                    // An unreadable source fact cannot establish a relationship.
                }
            }
            if (parties.has(candidateResidentId) && parties.has(examinerResidentId))
                return true;
        }
        return false;
    }
    #requireCourse(input) {
        const course = this.#database
            .prepare(`SELECT * FROM career_courses
         WHERE resident_id = ? AND career = ? AND qualification_level = ? AND course_index = ?`)
            .get(input.residentId, input.career, input.level, input.courseIndex);
        if (!course)
            throw new CareerDomainError("course_not_enrolled", "The course is not enrolled");
        return course;
    }
    #courseSnapshot(course, input) {
        if (typeof course.content_bank_version !== "string" ||
            course.content_bank_version.length === 0 ||
            typeof course.content_snapshot_json !== "string" ||
            course.content_snapshot_json.length === 0) {
            throw new CareerDomainError("assessment_content_not_available", "The enrolled course has no frozen content snapshot");
        }
        let snapshot;
        try {
            snapshot = JSON.parse(course.content_snapshot_json);
        }
        catch {
            throw new CareerDomainError("assessment_content_not_available", "The enrolled course content snapshot is invalid");
        }
        if (snapshot === null ||
            typeof snapshot !== "object" ||
            snapshot.career !== input.career ||
            snapshot.level !== input.level ||
            snapshot.courseIndex !== input.courseIndex ||
            snapshot.bankVersion !== course.content_bank_version ||
            typeof snapshot.title !== "string" ||
            typeof snapshot.contentMarkdown !== "string") {
            throw new CareerDomainError("assessment_content_not_available", "The enrolled course content snapshot is invalid");
        }
        return snapshot;
    }
    #ensureCoursePaper(input, now, bankVersion, blueprint) {
        if (blueprint.bankVersion !== bankVersion) {
            throw new CareerDomainError("assessment_content_not_available", "The course content and practice bank do not match");
        }
        const existing = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE target_key = ?")
            .get(blueprint.targetKey);
        if (existing) {
            if (existing.bank_version !== bankVersion) {
                throw new CareerDomainError("assessment_paper_mismatch", "The course paper bank does not match the enrolled content");
            }
            return { paperId: existing.paper_id, bankVersion: existing.bank_version };
        }
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
        const blueprint = this.#curriculum.createWrittenExamPaper(
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
    #requireCoursePaper(input, bankVersion) {
        const targetKey = `course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
        const paper = this.#database
            .prepare("SELECT * FROM career_assessment_papers WHERE target_key = ? AND kind = 'course_practice'")
            .get(targetKey);
        if (!paper)
            throw new CareerDomainError("assessment_paper_not_found", "The course paper is unavailable");
        if (paper.bank_version !== bankVersion) {
            throw new CareerDomainError("assessment_paper_mismatch", "The course paper bank does not match the enrolled content");
        }
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
            deadlineAt: attempt.scheduled_at + EXAM_SESSION_DURATION_MS,
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
        if (!this.#curriculum.careerExamAvailability(career, level)) {
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
           AND registration_status = 'failed' AND missed_session_at IS NULL
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
    #activateConstablePublicNotice(noticeId, interviewId, attempt, now) {
        this.#database
            .prepare(`UPDATE career_constable_public_notices
           SET status = 'certificate_activated', finalized_at = ? WHERE notice_id = ?`)
            .run(now, noticeId);
        this.#database
            .prepare(`UPDATE career_constable_interviews
           SET status = 'certificate_activated', finalized_at = ? WHERE interview_id = ?`)
            .run(now, interviewId);
        this.#database
            .prepare(`UPDATE career_certificates
           SET status = 'active', effective_at = ? WHERE source_attempt_id = ?`)
            .run(now, attempt.attempt_id);
        this.#database
            .prepare(`UPDATE career_exam_attempts
           SET registration_status = 'passed', ended_at = ? WHERE attempt_id = ?`)
            .run(now, attempt.attempt_id);
        return "certificate_activated";
    }
}
