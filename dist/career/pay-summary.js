/** Only committed wage receipts contribute; future schedules are not income. */
export function readCareerPaySummary(database, residentId) {
    const duty = database.prepare(`SELECT COALESCE(SUM(base_wage_gold), 0) AS baseGold,
        COALESCE(SUM(performance_gold), 0) AS performanceGold
        FROM career_duty_days WHERE resident_id = ? AND status = 'settled'
        AND wage_receipt_id IS NOT NULL`).get(residentId);
    const extra = database.prepare(`SELECT COALESCE(SUM(performance_gold), 0) AS gold
        FROM career_performance_adjustments WHERE resident_id = ? AND receipt_id IS NOT NULL`).get(residentId);
    const performanceGold = duty.performanceGold + extra.gold;
    return { baseGold: duty.baseGold, performanceGold, totalGold: duty.baseGold + performanceGold };
}
