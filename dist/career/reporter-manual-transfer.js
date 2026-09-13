import { CareerDomainError } from "./contracts.js";
import { activeCertificateLevel, runInTransaction } from "./persistence.js";

export function reporterTransferCandidates(database, now) {
    return database.prepare(`SELECT resident_id FROM career_employments
      WHERE career='reporter' AND status='active' AND availability='available'`).all()
        .filter(row => activeCertificateLevel(database, row.resident_id, "reporter", now) >= 1);
}

export function manualReporterAssignment(database, date, lane) {
    return database.prepare(`SELECT * FROM career_reporter_manual_assignments WHERE issue_date=? AND lane=?`).get(date, lane);
}

export function transferReporterTask(database, backend, input, handoffReporterRelayDuty) {
    return runInTransaction(database, () => {
        const {requestId, issueDate, lane, sourceWakeId, previousResidentId, targetResidentId, now} = input;
        const signature = JSON.stringify({issueDate,lane,sourceWakeId,previousResidentId,targetResidentId});
        const replay = database.prepare("SELECT * FROM career_reporter_manual_transfers WHERE request_id=?").get(requestId);
        if (replay) {
            if (replay.signature !== signature) throw new CareerDomainError("transfer_conflict", "Transfer request differs from saved request");
            return JSON.parse(replay.result_json);
        }
        if (targetResidentId === previousResidentId || !reporterTransferCandidates(database, now).some(row => row.resident_id === targetResidentId))
            throw new CareerDomainError("transfer_target_unavailable", "The selected reporter is not available");
        let wake = null;
        if (lane === "farm") {
            const pending = database.prepare("SELECT * FROM career_reporter_relay_wakes WHERE wake_id=?").get(sourceWakeId);
            if (!pending || pending.recipient_resident_id !== previousResidentId)
                throw new CareerDomainError("transfer_conflict", "The reporter task changed");
            const issue = database.prepare("SELECT * FROM career_reporter_relay_issues WHERE issue_date=?").get(issueDate);
            const jobId = pending.stage === "selection" ? issue?.selector_job_id : issue?.writer_job_id;
            const job = jobId && backend.trustedQueries.getJob(jobId);
            if (!job || activeCertificateLevel(database,targetResidentId,"reporter",now) < job.requiredLevel)
                throw new CareerDomainError("transfer_target_unavailable", "The selected reporter lacks the job qualification");
            wake = handoffReporterRelayDuty(database,backend,{issueDate,expectedStage:pending.stage,
                expectedWakeId:sourceWakeId,targetResidentId,requestId,now}).wake;
            if (wake?.recipient_resident_id !== targetResidentId)
                throw new CareerDomainError("transfer_conflict", "The reporter task has already been reassigned");
        } else {
            const override = manualReporterAssignment(database,issueDate,lane);
            const role = lane === "voice" ? "voice" : "submission_reviewer";
            const duty = database.prepare("SELECT * FROM career_reporter_duty_roles WHERE duty_date=? AND role=?").get(issueDate,role);
            const current = override?.resident_id ?? duty?.resident_id;
            if (current !== previousResidentId) throw new CareerDomainError("transfer_conflict", "The reporter assignment changed");
            if (lane === "voice" && database.prepare("SELECT 1 FROM career_reporter_voice_work WHERE issue_date=?").get(issueDate))
                throw new CareerDomainError("transfer_completed", "The reporter already submitted");
            let jobId = null;
            if (lane === "submissions") {
                const issue = database.prepare("SELECT * FROM career_reporter_relay_issues WHERE issue_date=?").get(issueDate);
                const oldJobId = override?.job_id ?? issue?.submission_reviewer_job_id;
                if (oldJobId) {
                    const old = backend.trustedQueries.getJob(oldJobId);
                    if (old && !["accepted","assigned","active"].includes(old.status))
                        throw new CareerDomainError("transfer_completed", "The reporter job is no longer pending");
                    if (old) backend.trustedSystemCommands.cancelJob(oldJobId);
                }
                jobId = `reporter-relay-job:${issueDate}:submission-reviewer:transfer:${requestId}`;
                backend.trustedSystemCommands.createJob({jobId,career:"reporter",sourceType:"reporter_daily_submission_reviewing",
                    sourceId:`lingye-daily:${issueDate}:submission-reviewing:transfer:${requestId}`,
                    objectType:"reporter_submission_batch",objectId:`lingye-daily:${issueDate}`,
                    ownerResidentId:null,requiredLevel:1,difficultyLevel:1,assignmentMode:"accepted"});
                backend.trustedSystemCommands.acceptJob(jobId,targetResidentId);
                database.prepare(`UPDATE career_reporter_relay_issues SET submission_reviewer_resident_id=?,
                  submission_reviewer_job_id=? WHERE issue_date=?`).run(targetResidentId,jobId,issueDate);
            }
            database.prepare(`INSERT INTO career_reporter_manual_assignments(issue_date,lane,resident_id,job_id,transfer_request_id)
              VALUES (?,?,?,?,?) ON CONFLICT(issue_date,lane) DO UPDATE SET resident_id=excluded.resident_id,
                job_id=excluded.job_id,transfer_request_id=excluded.transfer_request_id`)
                .run(issueDate,lane,targetResidentId,jobId,requestId);
        }
        const result = {issueDate,lane,requestId,targetResidentId,wake};
        database.prepare("INSERT INTO career_reporter_manual_transfers(request_id,signature,result_json) VALUES (?,?,?)")
            .run(requestId,signature,JSON.stringify(result));
        return result;
    });
}
