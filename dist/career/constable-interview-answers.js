import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";

export const INTERVIEW_ANSWER_MESSAGES = Object.freeze({
    interview_not_started: "现在还没到本场面试时间。",
    interview_panel_incomplete: "本场面试尚未组成三名人类考官，暂不能提交答卷。",
    interview_candidate_mismatch: "你不是本场面试的考生。",
    interview_answer_required: "请先提交本场面试答卷。",
    interview_answer_conflict: "面试答卷已经提交，不能修改。",
    interview_answer_closed: "本场面试已经结束，不能再提交答卷。",
});
export const INTERVIEW_ANSWER_RECEIPT = "治安官面试答卷已提交，等待三名人类考官评分。";

export class ConstableInterviewAnswers {
    constructor({ database, now, requireInterview, readMaterial }) {
        this.database = database;
        this.now = now;
        this.requireInterview = requireInterview;
        this.readMaterial = readMaterial;
    }
    read(interviewId) {
        const row = this.database.prepare(`SELECT answer_text, submitted_at
            FROM career_constable_answers WHERE interview_id = ?`).get(interviewId);
        return row ? { text: row.answer_text, submittedAt: row.submitted_at } : null;
    }
    require(interviewId) {
        const answer = this.read(interviewId);
        if (!answer) throw new CareerDomainError("interview_answer_required", INTERVIEW_ANSWER_MESSAGES.interview_answer_required);
        return answer;
    }
    candidateView(interviewId, residentId) {
        const interview = this.requireInterview(interviewId);
        if (interview.candidate_resident_id !== residentId)
            throw new CareerDomainError("interview_candidate_mismatch", INTERVIEW_ANSWER_MESSAGES.interview_candidate_mismatch);
        const answer = this.read(interviewId);
        if (answer) return { answer, material: null, canSubmit: false };
        if (this.now() < interview.scheduled_at || !["panel_ready", "scoring"].includes(interview.status))
            return { answer: null, material: null, canSubmit: false };
        this.requirePanel(interviewId);
        const material = this.readMaterial(interview);
        // The candidate never receives the examiners' grading rubric or scores.
        return { answer: null, material: { bankVersion: material.bankVersion, paper: material.paper,
            factMaterial: material.factMaterial }, canSubmit: true };
    }
    requirePanel(interviewId) {
        const count = this.database.prepare(`SELECT COUNT(*) AS count FROM career_constable_examiner_signups
            WHERE interview_id = ? AND selected = 1 AND attendance_confirmed_at IS NOT NULL`).get(interviewId).count;
        if (count !== 3)
            throw new CareerDomainError("interview_panel_incomplete", INTERVIEW_ANSWER_MESSAGES.interview_panel_incomplete);
    }
    submit({ interviewId, residentId, text }) {
        return runInTransaction(this.database, () => {
            const interview = this.requireInterview(interviewId);
            if (residentId !== interview.candidate_resident_id)
                throw new CareerDomainError("interview_candidate_mismatch", INTERVIEW_ANSWER_MESSAGES.interview_candidate_mismatch);
            const existing = this.read(interviewId);
            // Identity and current career are still checked on every replay.
            if (existing) {
                if (existing.text !== text)
                    throw new CareerDomainError("interview_answer_conflict", INTERVIEW_ANSWER_MESSAGES.interview_answer_conflict);
                return { interviewId, ...existing, replay: true };
            }
            if (this.now() < interview.scheduled_at)
                throw new CareerDomainError("interview_not_started", INTERVIEW_ANSWER_MESSAGES.interview_not_started);
            if (interview.status === "signup_open")
                throw new CareerDomainError("interview_panel_incomplete", INTERVIEW_ANSWER_MESSAGES.interview_panel_incomplete);
            if (!["panel_ready", "scoring"].includes(interview.status))
                throw new CareerDomainError("interview_answer_closed", INTERVIEW_ANSWER_MESSAGES.interview_answer_closed);
            this.requirePanel(interviewId);
            this.readMaterial(interview);
            if (typeof text !== "string" || text.trim().length === 0)
                throw new CareerDomainError("interview_answer_required", INTERVIEW_ANSWER_MESSAGES.interview_answer_required);
            const submittedAt = this.now();
            this.database.prepare(`INSERT INTO career_constable_answers
                (interview_id, candidate_resident_id, answer_text, submitted_at) VALUES (?, ?, ?, ?)`)
                .run(interviewId, residentId, text, submittedAt);
            return { interviewId, text, submittedAt, replay: false };
        });
    }
}
