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
    score: [...BASE_KEYS, "action", "interview_id", "facts", "restraint", "procedure", "explanation"],
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
        return {
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
                scoring_standard: parseSnapshot(row.interview_scoring_standard_snapshot_json),
            } : null,
            public_notice: notice ? {
                notice_id: notice.notice_id,
                status: notice.status,
                opened_at: isoTime(notice.opened_at),
                closes_at: isoTime(notice.closes_at),
            } : null,
        };
    });
    return { interviews };
}

function actionError(error) {
    if (!(error instanceof CareerDomainError))
        return { status: 503, code: "farm_unavailable", message: "The constable interview service is unavailable" };
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
    if (body.action === "score" && [body.facts, body.restraint, body.procedure, body.explanation]
        .some((value) => !Number.isSafeInteger(value) || value < 0 || value > 5)) {
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
                facts: body.facts,
                restraint: body.restraint,
                procedure: body.procedure,
                explanation: body.explanation,
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
