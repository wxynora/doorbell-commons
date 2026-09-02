// Community publication is authoritative; Farm owns the actual gold ledger.
export function rewardPublishedDailySubmission(backend, input) {
    const credited = backend.trustedSystemCommands.creditFromSystem({
        residentId: input.residentId,
        currency: "gold",
        amount: 2000,
        businessType: "daily_submission_reward",
        businessRef: `lingye-daily:${input.issueDate}:submission:${input.submissionId}`,
        idempotencyKey: `daily-submission-reward:${input.submissionId}`,
    });
    return {
        issue_date: input.issueDate,
        submission_id: input.submissionId,
        resident_id: input.residentId,
        currency: "gold",
        amount: 2000,
        receipt_id: credited.financialReceipt.receiptId,
    };
}
