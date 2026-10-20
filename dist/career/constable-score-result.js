import { CareerDomainError } from "./contracts.js";

export function validateConstableScore(input) {
    if (!Number.isInteger(input.score) || input.score < 0 || input.score > 20 ||
        !input.stars || Object.keys(input.stars).sort().join(",") !== "clarity,fairness,reliability" ||
        Object.values(input.stars).some(value => !Number.isInteger(value) || value < 1 || value > 5) ||
        typeof input.comment !== "string") {
        throw new CareerDomainError("invalid_interview_score", "Invalid score, stars or comment");
    }
}

export function scoreResult(scores) {
    if (scores.length !== 3) return null;
    const legacy = scores.every(score => score.total_score == null);
    const sum = scores.reduce((total, score) => total + (score.total_score ??
        score.facts_score + score.restraint_score + score.procedure_score + score.explanation_score), 0);
    const passed = legacy
        ? sum >= 48 && ["facts_score", "restraint_score", "procedure_score", "explanation_score"]
            .every(key => scores.reduce((total, score) => total + score[key], 0) >= 9)
        : sum >= 36;
    return { average: sum / 3, passed, formal: sum > 48, legacy };
}

export function applyConstableRank(database, interview, now) {
    const result = scoreResult(database.prepare("SELECT * FROM career_constable_scores WHERE interview_id = ?").all(interview.interview_id));
    if (!result?.passed || result.legacy) return;
    const certificate = database.prepare("SELECT * FROM career_certificates WHERE source_attempt_id = ?").get(interview.attempt_id);
    if (!certificate || certificate.qualification_level !== 1 || certificate.status !== "active") return;
    if (result.formal) {
        database.prepare("UPDATE career_certificates SET qualification_level = 2 WHERE source_attempt_id = ?").run(interview.attempt_id);
    } else {
        database.prepare(`INSERT OR IGNORE INTO career_constable_training
            (attempt_id, resident_id, started_at) VALUES (?, ?, ?)`)
            .run(interview.attempt_id, certificate.resident_id, certificate.effective_at ?? now);
    }
}

export function promoteConstableTraining(database, residentId, now) {
    const training = database.prepare(`SELECT training.* FROM career_constable_training training
        JOIN career_certificates certificate ON certificate.source_attempt_id = training.attempt_id
        JOIN career_exam_attempts attempt ON attempt.attempt_id = training.attempt_id
        JOIN career_tracks track ON track.resident_id = training.resident_id AND track.career = 'constable'
        WHERE training.resident_id = ? AND training.promoted_at IS NULL AND training.started_at <= ?
          AND certificate.status = 'active' AND certificate.qualification_level = 1
          AND track.track_order IS NOT NULL AND track.generation = attempt.learning_generation`).get(residentId, now);
    if (!training) return false;
    const { count } = database.prepare(`SELECT COUNT(DISTINCT job_id) AS count FROM career_work_records
        WHERE resident_id = ? AND career = 'constable' AND qualification_level = 1
          AND record_kind IN ('completed', 'qualified_transfer') AND recorded_at >= ?`)
        .get(residentId, training.started_at);
    if (count < 3) return false;
    database.prepare("UPDATE career_certificates SET qualification_level = 2 WHERE source_attempt_id = ?").run(training.attempt_id);
    database.prepare("UPDATE career_constable_training SET promoted_at = ? WHERE attempt_id = ?").run(now, training.attempt_id);
    return true;
}

export function constableResultMessage(database, interviewId) {
    const interview = database.prepare(`SELECT interview.*, attempt.qualification_level FROM career_constable_interviews interview
        JOIN career_exam_attempts attempt ON attempt.attempt_id = interview.attempt_id WHERE interview_id = ?`).get(interviewId);
    if (!interview || !["failed", "public_notice", "certificate_activated"].includes(interview.status)) return null;
    const result = scoreResult(database.prepare("SELECT * FROM career_constable_scores WHERE interview_id = ?").all(interviewId));
    if (!result) return null;
    const score = Number(result.average.toFixed(2));
    if (!result.passed) return `面试平均分：${score}／20分。面试未通过。`;
    const formal = interview.qualification_level > 1 || (!result.legacy && result.formal);
    return `面试平均分：${score}／20分。面试通过，公示结束后${formal ? "正式任职" : "以见习身份任职"}。`;
}
