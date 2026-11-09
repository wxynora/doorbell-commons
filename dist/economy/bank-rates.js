export const TERM_RATE_RANGES = Object.freeze({14: [2000, 3000], 30: [5000, 7500], 60: [11000, 16000]});
export const GOLD_PER_SILVER = 500;
export const RESIDENT_MONTHLY_SILVER_LIMIT = 1_000;
export const GLOBAL_MONTHLY_SILVER_LIMIT = 10_000;
export const DEMAND_DAILY_RATE_DENOMINATOR = 10_000;
export const INTEREST_RATE_DENOMINATOR = 1_000_000;
export const GRACE_DAYS = 3;
export const SYSTEM_LOAN_TERMS = new Set([14, 30, 60]);
export const TERM_DEPOSIT_TERMS = new Set([14, 30, 60]);
export function systemLoanRate(termDays) {
    switch (termDays) {
        case 14:
            return 1000;
        case 30:
            return 800;
        case 60:
            return 600;
    }
}
export function systemLoanLimit(creditPoints) {
    if (creditPoints >= 3)
        return 1_000_000;
    if (creditPoints >= 1)
        return 500_000;
    return 200_000;
}
export function termRateAllowed(termDays, totalRatePpm) {
    const range = TERM_RATE_RANGES[termDays];
    return TERM_DEPOSIT_TERMS.has(termDays) &&
        Number.isInteger(totalRatePpm) &&
        totalRatePpm >= range[0] &&
        totalRatePpm <= range[1];
}
export function exchangeFee(silverAlreadyIssued, silverRequested) {
    let remaining = silverRequested;
    let cursor = silverAlreadyIssued;
    let fee = 0;
    const brackets = [
        { end: 300, percent: 5 },
        { end: 700, percent: 10 },
        { end: 1_000, percent: 20 },
    ];
    for (const bracket of brackets) {
        if (remaining === 0)
            break;
        const available = Math.max(0, bracket.end - cursor);
        const used = Math.min(available, remaining);
        fee += (used * GOLD_PER_SILVER * bracket.percent) / 100;
        cursor += used;
        remaining -= used;
    }
    return fee;
}

export function ratePercentToPpm(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    const ppm = Math.round(value * 10000);
    return Number.isSafeInteger(ppm) && ppm / 10000 === value ? ppm : undefined;
}

export function bankRateFacts() {
    return {
        demandDailyRatePpm: INTEREST_RATE_DENOMINATOR / DEMAND_DAILY_RATE_DENOMINATOR,
        termDepositMinimumGold: 1000000,
        termDeposits: [...TERM_DEPOSIT_TERMS].map(termDays => ({termDays,
            minimumTotalRatePpm: TERM_RATE_RANGES[termDays][0],
            maximumTotalRatePpm: TERM_RATE_RANGES[termDays][1]})),
        systemLoans: [...SYSTEM_LOAN_TERMS].map(termDays => ({termDays, dailyRatePpm: systemLoanRate(termDays)})),
        playerLoans: {minimumTermDays: 1, maximumTermDays: 60, maximumTotalRatePpm: 200000},
        graceDays: GRACE_DAYS,
    };
}
