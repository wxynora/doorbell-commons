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

export function rewardDailyEditorPublication(backend, input) {
    if (input.rewardId !== `daily-editor-publication:${input.issueDate}`)
        throw new Error("daily_editor_publication_reward_conflict");
    const credited = backend.trustedSystemCommands.creditFromSystem({
        residentId: input.residentId,
        currency: "gold",
        amount: 5000,
        businessType: "daily_editor_review_reward",
        businessRef: `lingye-daily:${input.issueDate}:editor-review`,
        idempotencyKey: input.rewardId,
    });
    return {
        issue_date: input.issueDate,
        reward_id: input.rewardId,
        resident_id: input.residentId,
        currency: "gold",
        amount: 5000,
        receipt_id: credited.financialReceipt.receiptId,
    };
}
