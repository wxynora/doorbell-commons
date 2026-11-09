import { bankRateFacts, systemLoanLimit, INTEREST_RATE_DENOMINATOR } from "./bank-rates.js";

const DAY = 86400000;
const currentDay = now => Math.floor((now + 8 * 3600000) / DAY);
export const bankDate = day => Number.isSafeInteger(day) ? new Date(day * DAY).toISOString().slice(0, 10) : null;
const camel = row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));

export function bankLoanFacts(loan, kind, now) {
    const value = { ...loan, dueDate: bankDate(loan.dueDay), asOfDate: bankDate(currentDay(now)) };
    const pending = ["proposed", "cancelled"].includes(loan.status);
    const rate = kind === "system" ? loan.dailyRatePpm * loan.termDays : loan.totalRatePpm;
    value.fullTermInterest = Math.floor(loan.principalOriginal * rate / INTEREST_RATE_DENOMINATOR);
    value.fullTermTotal = loan.principalOriginal + value.fullTermInterest;
    if (pending) {
        value.payoffAmount = 0;
        return value;
    }
    const days = loan.status === "repaid" || !Number.isSafeInteger(loan.accruedThroughDay) ? 0
        : Math.max(0, Math.min(currentDay(now), loan.dueDay + 1) - loan.accruedThroughDay);
    const denominator = INTEREST_RATE_DENOMINATOR * (kind === "player" ? loan.termDays : 1);
    const numerator = loan.principalOutstanding * (kind === "player" ? loan.totalRatePpm : loan.dailyRatePpm) * days
        + (loan.interestRemainder ?? 0);
    value.payoffInterest = loan.accruedInterest + Math.floor(numerator / denominator);
    value.payoffAmount = loan.principalOutstanding + value.payoffInterest;
    return value;
}

export function bankDepositFacts(deposit) {
    const expectedInterest = Math.floor(deposit.principal * deposit.totalRatePpm / INTEREST_RATE_DENOMINATOR);
    return { ...deposit, maturityDate: bankDate(deposit.maturityDay), expectedInterest,
        expectedTotal: deposit.principal + expectedInterest,
        paidTotal: deposit.state === "active" ? null : deposit.principal + deposit.interestPaid };
}

export function projectBankFacts(facts, now) {
    const deposits = facts.deposits.termDeposits.map(bankDepositFacts);
    const systemLoans = facts.loans.systemLoans.map(loan => bankLoanFacts(loan, "system", now));
    const playerLoans = facts.loans.playerLoans.map(loan => bankLoanFacts(loan, "player", now));
    const options = facts.options.map(entry => {
        const match = /^bank:([a-z-]+):\d+(?::(.+))?$/.exec(entry.option);
        if (!match?.[2]) return entry;
        const action = match[1];
        const values = action === "term-close" ? deposits : action.startsWith("system-") ? systemLoans : playerLoans;
        const index = values.findIndex(value => (value.depositId ?? value.loanId) === match[2]);
        if (index < 0) return entry;
        const contract = values[index];
        const labels = {"term-close": "取回定期存款", "system-loan-repay": "偿还系统金币贷款",
            "player-loan-repay": "偿还玩家银币借款", "player-loan-confirm": "确认玩家借款合同",
            "player-loan-cancel": "取消玩家借款提案"};
        const amount = contract.principal ?? contract.principalOriginal;
        const currency = action.startsWith("player-") ? "银币" : "金币";
        const target = action === "term-close" ? `，到期 ${contract.maturityDate}`
            : contract.counterparty?.doorplate ? `，对方门牌 ${contract.counterparty.doorplate}` : "";
        return { ...entry, label: `${labels[action]} ${index + 1}（本金 ${amount.toLocaleString("zh-CN")} ${currency}${target}）` };
    });
    return { ...facts, rates: bankRateFacts(), asOfDate: bankDate(currentDay(now)),
        deposits: { ...facts.deposits, termDeposits: deposits }, loans: { systemLoans, playerLoans },
        credit: { ...facts.credit, systemLoanLimitGold: systemLoanLimit(facts.credit.creditPoints) }, options };
}

export function bankOperationReceipt(database, residentId, key, action, args, rawResult, facts, replayed, now) {
    const result = camel(rawResult);
    const currency = action.startsWith("player-") || action === "silver-lock-increase" ? "silver" : "gold";
    const receipt = { action, currency, replayed, amount: args.amount, operationState: result.status };
    if (action === "exchange-gold-silver") receipt.exchange = result.preview;
    if (action === "silver-lock-increase") {
        let change = result.lockChange;
        // Only historical replays lack the immutable amount embedded by current commands.
        if (!change && replayed) {
            const row = database.prepare(`SELECT previous_amount, next_amount FROM economy_silver_lock_events
                WHERE resident_id = ? AND journal_id = (SELECT journal_id FROM economy_commands WHERE idempotency_key = ?)`)
                .get(residentId, key);
            if (row) change = { previousAmount: row.previous_amount, nextAmount: row.next_amount };
        }
        receipt.lockAmount = result.silverAgentLock;
        if (change) receipt.lockIncrease = change.nextAmount - change.previousAmount;
    }
    if (action.includes("loan")) {
        const isPlayer = action.startsWith("player-");
        const list = isPlayer ? facts.loans.playerLoans : facts.loans.systemLoans;
        receipt.contractIndex = list.findIndex(loan => loan.loanId === result.loanId);
        receipt.contract = list.find(loan => loan.loanId === result.loanId)
            ?? bankLoanFacts(result, isPlayer ? "player" : "system", now);
        if (action.endsWith("repay")) {
            receipt.repayment = result.repayment;
            if (!receipt.repayment && replayed) {
                const event = database.prepare(`SELECT event_json FROM economy_contract_events
                    WHERE contract_type = ? AND contract_id = ?
                      AND journal_id = (SELECT journal_id FROM economy_commands WHERE idempotency_key = ?)
                      AND event_type IN ('repaid', 'partial_repayment')`)
                    .get(isPlayer ? "player_loan" : "system_loan", result.loanId, key);
                if (event) receipt.repayment = JSON.parse(event.event_json);
            }
        }
    }
    if (action === "term-open" || action === "term-close") {
        receipt.contractIndex = facts.deposits.termDeposits.findIndex(deposit => deposit.depositId === result.depositId);
        receipt.contract = action === "term-open" && replayed
            ? facts.deposits.termDeposits[receipt.contractIndex] ?? bankDepositFacts(result)
            : bankDepositFacts(result);
    }
    return receipt;
}

export function bankEconomicError(error, action) {
    const currency = action?.startsWith("player-") ? "银币" : "金币";
    if (error.code === "PAYMENT_EXCEEDS_OUTSTANDING")
        return `本次还款超过当前欠款；当前结清共需 ${error.details.outstanding.toLocaleString("zh-CN")} ${currency}。`;
    if (error.code === "EXCHANGE_LIMIT_EXCEEDED")
        return `本月兑换额度不足，当前最多还能兑换 ${error.details.maximumSilverAvailable.toLocaleString("zh-CN")} 银币；本次没有兑换。`;
    if (error.code === "LOAN_CONTRACT_INVALID" && Number.isSafeInteger(error.details.maximumPrincipal))
        return `当前系统贷款额度为 ${error.details.maximumPrincipal.toLocaleString("zh-CN")} 金币，请调整本金。`;
    if (error.code === "LOAN_CONTRACT_INVALID" && error.details.existingLoanId)
        return "已有一笔未结清系统贷款，请先偿还现有贷款。";
    if (error.code === "AMOUNT_INVALID")
        return "金额必须是正整数；金币兑换银币的本金还必须是 500 的整数倍。";
    if (error.code === "DEPOSIT_CONTRACT_INVALID" && error.details.principal < 1000000)
        return "金币定存：最低 1,000,000 金币。";
    if (error.code === "DEPOSIT_CONTRACT_INVALID" || error.code === "LOAN_CONTRACT_INVALID")
        return "总利率直接填写百分数，最多四位小数。金币定存须符合所选期限的利率区间；玩家借款为 0%～20%。";
    return null;
}
