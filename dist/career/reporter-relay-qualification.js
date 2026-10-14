// The current relay assignment is the authority after a manual handoff.
// The original duty roster remains a wage record, not a submission permission.
export function reporterRelayWorkAllowed(database, residentId, job, relay, role) {
    const assignment = role === "selector"
        ? [relay.selectorJobId, relay.selectorResidentId]
        : role === "writer"
            ? [relay.writerJobId, relay.writerResidentId]
            : role === "reviewer"
                ? [relay.reviewerJobId, relay.reviewerResidentId]
                : null;
    if (!assignment || assignment[0] !== job.jobId || assignment[1] !== residentId ||
        job.workerResidentId !== residentId || !["accepted", "active"].includes(job.status)) {
        return false;
    }
    return Boolean(database.prepare(`SELECT 1 FROM career_employments
      WHERE resident_id = ? AND career = 'reporter' AND status = 'active'
        AND availability = 'available' LIMIT 1`).get(residentId));
}
