import { INTERVIEW_ANSWER_MESSAGES } from "../../career/constable-interview-answers.js";
import { CareerDomainError } from "../../career/contracts.js";
import { MAX_BODY_BYTES } from "../../config.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    humanFieldError,
    internalServiceError,
    isPlainObject,
    requireDoorbellService,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

const BASE_KEYS = ["farm_human_key", "expected_farm_doorplate", "account_id", "resident_id"];
const ACTION_KEYS = {
    signup: [...BASE_KEYS, "action", "interview_id"],
    confirm_attendance: [...BASE_KEYS, "action", "interview_id"],
    score: [...BASE_KEYS, "action", "interview_id", "score", "stars", "comment"],
};
const READ_KEYS = [...BASE_KEYS];
const READ_WITH_INTERVIEW_KEYS = [...BASE_KEYS, "interview_id"];
const OPEN_KEYS = ["interview_id", "eligible_voter_resident_ids", "candidate_resident_name"];

function serviceEligibilityReference(action, farm, residentId, interviewId, now) {
    return `doorbell-service:${action}:${farm.id}:${residentId}:${interviewId}:${now}`;
}

function hasExactKeys(body, expected) {
    const keys = isPlainObject(body) ? Object.keys(body).sort() : [];
    const sorted = [...expected].sort();
    return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isoTime(value) {
    return value === null || value === undefined ? null : new Date(value).toISOString();
}

function parseSnapshot(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}

function interviewFacts(database, backend, residentId, accountId, interviewId, now) {
    backend.trustedSystemCommands.advanceConstableInterviews(now);
    const accountBinding = database
        .prepare(`SELECT examiner_resident_id FROM career_constable_examiner_signups
      WHERE examiner_account_id = ? AND examiner_resident_id != ? LIMIT 1`)
        .get(accountId, residentId);
    if (accountBinding)
        throw new CareerDomainError("examiner_account_identity_conflict", "The examiner account is bound to another resident");
    const interviews = database
        .prepare(`SELECT interview_id, attempt_id, candidate_resident_id, scheduled_at, status,
             interview_bank_version, interview_paper_snapshot_json,
             interview_fact_material_snapshot_json,
             interview_scoring_standard_snapshot_json,
             last_postponed_at, postponed_count
      FROM career_constable_interviews
      WHERE (? IS NULL OR career_constable_interviews.interview_id = ?)
        AND (candidate_resident_id = ?
         OR EXISTS (
           SELECT 1 FROM career_constable_examiner_signups AS own_signup
           WHERE own_signup.interview_id = career_constable_interviews.interview_id
             AND own_signup.examiner_account_id = ?
         )
         OR (
           career_constable_interviews.status = 'signup_open'
           AND career_constable_interviews.scheduled_at > ?
           AND career_constable_interviews.scheduled_at - 43200000 <= ?
           AND candidate_resident_id != ?
         ))
      ORDER BY scheduled_at DESC, interview_id`)
        .all(interviewId ?? null, interviewId ?? null, residentId, accountId, now, now, residentId)
        .map((row) => {
        const signup = database
            .prepare(`SELECT examiner_account_id, signup_order, signed_up_at,
                 attendance_confirmed_at, selected
          FROM career_constable_examiner_signups
          WHERE interview_id = ? AND examiner_account_id = ?`)
            .get(row.interview_id, accountId);
        const score = signup ? database
            .prepare(`SELECT 1 FROM career_constable_scores
          WHERE interview_id = ? AND examiner_account_id = ?`)
            .get(row.interview_id, accountId) : undefined;
        const scoreCount = database
            .prepare("SELECT COUNT(*) AS count FROM career_constable_scores WHERE interview_id = ?")
            .get(row.interview_id).count;
        const notice = database
            .prepare(`SELECT notice_id, status, opened_at, closes_at
          FROM career_constable_public_notices WHERE interview_id = ?`)
            .get(row.interview_id);
        const materialConfigured = ["panel_ready", "scoring"].includes(row.status) &&
            signup?.selected === 1 && Boolean(row.interview_bank_version &&
            row.interview_paper_snapshot_json &&
            row.interview_fact_material_snapshot_json &&
            row.interview_scoring_standard_snapshot_json);
        if (["panel_ready", "scoring"].includes(row.status) && signup?.selected === 1 && !materialConfigured) {
            throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
        }
        const signupOpen = row.status === "signup_open" &&
            now >= row.scheduled_at - 43200000 && now < row.scheduled_at;
        const signupEligible = signupOpen && !signup &&
            backend.trustedQueries.constableExaminerEligible(row.interview_id, residentId);
        const review = database.prepare("SELECT outcome FROM career_constable_reviews WHERE interview_id = ?").get(row.interview_id);
        const answer = materialConfigured ? database.prepare("SELECT answer_text, submitted_at FROM career_constable_answers WHERE interview_id = ?").get(row.interview_id) : null;
        const originalScores = materialConfigured && review ? database.prepare(`SELECT facts_score AS facts, restraint_score AS restraint,
            procedure_score AS procedure, explanation_score AS explanation, total_score AS score, stars_json, comment FROM career_constable_review_original_scores
            WHERE interview_id = ? ORDER BY signup_order`).all(row.interview_id) : null;
        return {
            phase: review ? "review" : "interview",
            review_outcome: review?.outcome ?? null,
            answer: answer ? { text: answer.answer_text, submitted_at: isoTime(answer.submitted_at) } : null,
            original_scores: originalScores?.map(value => value.score === null
                ? { facts: value.facts, restraint: value.restraint, procedure: value.procedure, explanation: value.explanation }
                : { score: value.score, stars: JSON.parse(value.stars_json), comment: value.comment }) ?? null,
            qualification_level: database.prepare("SELECT qualification_level FROM career_exam_attempts WHERE attempt_id = ?").get(row.attempt_id).qualification_level,
            interview_id: row.interview_id,
            attempt_id: row.attempt_id,
            candidate_resident_id: row.candidate_resident_id,
            scheduled_at: isoTime(row.scheduled_at),
            status: row.status,
            signup_open_at: isoTime(row.scheduled_at - 43200000),
            attendance_confirmation_open_at: isoTime(row.scheduled_at - 1800000),
            score_count: scoreCount,
            self: {
                signed_up: Boolean(signup),
                signup_order: signup?.signup_order ?? null,
                tentative: Boolean(signup && signup.signup_order <= 3 && row.status === "signup_open"),
                attendance_confirmed: Boolean(signup?.attendance_confirmed_at),
                selected: signup?.selected === 1,
                score_submitted: Boolean(score),
                signup_eligible: signupEligible,
            },
            interview_material: materialConfigured ? {
                bank_version: row.interview_bank_version,
                paper: parseSnapshot(row.interview_paper_snapshot_json),
                fact_material: parseSnapshot(row.interview_fact_material_snapshot_json),
                scoring_standard: { scoreMaximum: 20, starsMaximum: 5, starsAffectScore: false },
            } : null,
            public_notice: notice ? {
                notice_id: notice.notice_id,
                status: notice.status,
                opened_at: isoTime(notice.opened_at),
                closes_at: isoTime(notice.closes_at),
            } : null,
        };
    });
    const events = database.prepare(`SELECT event.event_id, event.interview_id, event.kind, event.scheduled_at,
        event.next_scheduled_at, interview.candidate_resident_id, attempt.qualification_level
        FROM career_constable_interview_events event
        JOIN career_constable_interviews interview ON interview.interview_id = event.interview_id
        JOIN career_exam_attempts attempt ON attempt.attempt_id = interview.attempt_id
        JOIN career_tracks track ON track.resident_id = attempt.resident_id AND track.career = attempt.career
          AND track.track_order IS NOT NULL AND track.generation = attempt.learning_generation
        WHERE event.examiner_account_id = ? AND event.examiner_resident_id = ?
          AND NOT EXISTS(SELECT 1 FROM career_resignation_exam_refunds refund WHERE refund.attempt_id = attempt.attempt_id)
        ORDER BY event.event_id`).all(accountId, residentId).map(event => ({
            ...event, scheduled_at: isoTime(event.scheduled_at), next_scheduled_at: isoTime(event.next_scheduled_at),
        }));
    return { interviews, events };
}

function actionError(error) {
    if (!(error instanceof CareerDomainError))
        return { status: 503, code: "farm_unavailable", message: "The constable interview service is unavailable" };
    if (Object.hasOwn(INTERVIEW_ANSWER_MESSAGES, error.code))
        return { status: 409, code: error.code, message: INTERVIEW_ANSWER_MESSAGES[error.code] };
    if (error.code === "interview_material_not_configured")
        return { status: 503, code: "interview_material_not_configured", message: "The constable interview material is unavailable" };
    if (error.code === "examiner_not_eligible" || error.code === "examiner_account_identity_conflict")
        return { status: 409, code: error.code, message: "The examiner eligibility and conflict check failed" };
    if (error.code.includes("window") || error.code === "interview_not_ready" || error.code === "examiner_signup_closed")
        return { status: 409, code: error.code, message: "The constable interview is not accepting this action" };
    if (error.code.startsWith("invalid_") || error.code === "interview_not_found" || error.code === "examiner_not_signed_up")
        return { status: 400, code: error.code, message: "The constable interview request is invalid" };
    return { status: 409, code: error.code, message: "The constable interview action was rejected" };
}

async function readBody(req, res, writer = humanFieldError) {
    try {
        return await readJsonBody(req, MAX_BODY_BYTES);
    }
    catch (error) {
        const tooLarge = error?.status === 413;
        writer(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        return null;
    }
}

function validateBinding(body) {
    return validateFarmBinding(body);
}

export async function handleDoorbellHumanConstableInterviewRead(req, res, method, database, backend, now = Date.now()) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    const body = await readBody(req, res, humanFieldError);
    if (body === null)
        return;
    if ((!hasExactKeys(body, READ_KEYS) && !hasExactKeys(body, READ_WITH_INTERVIEW_KEYS)) ||
        !nonEmpty(body.farm_human_key) || !nonEmpty(body.account_id) || !nonEmpty(body.resident_id) ||
        (Object.hasOwn(body, "interview_id") && !nonEmpty(body.interview_id))) {
        humanFieldError(res, 400, "invalid_request", "The constable interview request is invalid");
        return;
    }
    const binding = validateBinding(body);
    if (binding.error) {
        humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return;
    }
    const residentId = body.resident_id;
    try {
        return jsonOut(res, 200, {
            subject: {
                farm_doorplate: binding.farm.id,
                account_id: body.account_id,
                resident_id: residentId,
            },
            data: interviewFacts(database, backend, residentId, body.account_id, body.interview_id, now),
            server_time: new Date(now).toISOString(),
        });
    }
    catch (error) {
        const mapped = actionError(error);
        return humanFieldError(res, mapped.status, mapped.code, mapped.message);
    }
}

export async function handleDoorbellHumanConstableInterviewAction(req, res, method, database, backend, now = Date.now()) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    const body = await readBody(req, res, humanFieldError);
    if (body === null)
        return;
    const expected = ACTION_KEYS[body?.action];
    if (!expected || !hasExactKeys(body, expected) || !nonEmpty(body.farm_human_key) ||
        !nonEmpty(body.account_id) || !nonEmpty(body.resident_id) || !nonEmpty(body.interview_id)) {
        humanFieldError(res, 400, "invalid_request", "The constable interview request is invalid");
        return;
    }
    if (body.action === "score" && (!Number.isInteger(body.score) || body.score < 0 || body.score > 20 ||
        !body.stars || Object.keys(body.stars).sort().join(",") !== "clarity,fairness,reliability" ||
        Object.values(body.stars).some(value => !Number.isInteger(value) || value < 1 || value > 5) ||
        typeof body.comment !== "string")) {
        humanFieldError(res, 400, "invalid_request", "The constable interview request is invalid");
        return;
    }
    const binding = validateBinding(body);
    if (binding.error) {
        humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return;
    }
    const residentId = body.resident_id;
    try {
        if (body.action === "signup") {
            backend.trustedSystemCommands.signupConstableExaminer({
                interviewId: body.interview_id,
                examinerAccountId: body.account_id,
                examinerResidentId: residentId,
                eligibilityReference: serviceEligibilityReference("signup", binding.farm, residentId, body.interview_id, now),
            });
        }
        else if (body.action === "confirm_attendance") {
            backend.trustedSystemCommands.confirmConstableExaminerAttendance({
                interviewId: body.interview_id,
                examinerAccountId: body.account_id,
                examinerResidentId: residentId,
                eligibilityReference: serviceEligibilityReference("confirm", binding.farm, residentId, body.interview_id, now),
            });
        }
        else {
            backend.trustedSystemCommands.submitConstableInterviewScore({
                interviewId: body.interview_id,
                examinerAccountId: body.account_id,
                examinerResidentId: residentId,
                score: body.score,
                stars: body.stars,
                comment: body.comment,
            });
        }
        backend.trustedSystemCommands.advanceConstableInterviews(now);
        return jsonOut(res, 200, {
            subject: {
                farm_doorplate: binding.farm.id,
                account_id: body.account_id,
                resident_id: residentId,
            },
            data: interviewFacts(database, backend, residentId, body.account_id, body.interview_id, now),
            server_time: new Date(now).toISOString(),
        });
    }
    catch (error) {
        const mapped = actionError(error);
        return humanFieldError(res, mapped.status, mapped.code, mapped.message);
    }
}

export async function handleDoorbellConstablePublicNoticeOpen(req, res, method, database, backend, now = Date.now()) {
    if (!requireDoorbellService(req, res, method))
        return;
    const body = await readBody(req, res, internalServiceError);
    if (body === null)
        return;
    if (!hasExactKeys(body, OPEN_KEYS) ||
        !nonEmpty(body.interview_id) || !nonEmpty(body.candidate_resident_name) ||
        !Array.isArray(body.eligible_voter_resident_ids) ||
        body.eligible_voter_resident_ids.some((residentId) => !nonEmpty(residentId)) ||
        new Set(body.eligible_voter_resident_ids).size !== body.eligible_voter_resident_ids.length) {
        internalServiceError(res, 400, "invalid_request", "The public notice request is invalid");
        return;
    }
    try {
        const result = backend.trustedSystemCommands.openConstablePublicNotice(
            body.interview_id,
            body.eligible_voter_resident_ids,
            body.candidate_resident_name,
        );
        return jsonOut(res, 200, {
            data: { status: result.status, notice_id: result.noticeId },
            server_time: new Date(now).toISOString(),
        });
    }
    catch (error) {
        const mapped = actionError(error);
        return internalServiceError(res, mapped.status, mapped.code, mapped.message);
    }
}
