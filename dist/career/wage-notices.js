import { runInTransaction } from "./persistence.js";

const INSTITUTION_NAMES = {
    lingye_daily: "铃野日报社",
    animal_hospital: "动物医院",
    public_security: "治安署",
};

/** Consume only committed, unread duty wages; the payroll remains authoritative. */
export function takeDutyWageNoticeText(database, residentId) {
    return runInTransaction(database, () => {
        const wages = database.prepare(`
          SELECT duty_id, institution, duty_date, base_wage_gold, performance_gold
          FROM career_duty_days
          WHERE resident_id = ? AND status = 'settled'
            AND wage_receipt_id IS NOT NULL AND wage_notice_pending = 1
          ORDER BY duty_date, duty_id
        `).all(residentId);
        const performance = database.prepare(`SELECT adjustment_id, performance_gold
          FROM career_performance_adjustments
          WHERE resident_id = ? AND receipt_id IS NOT NULL AND notice_pending = 1
          ORDER BY recorded_at, adjustment_id`).all(residentId);
        if (wages.length === 0 && performance.length === 0)
            return "";
        let text = wages.map((wage) => [
            "💰 工资到账啦！",
            `${INSTITUTION_NAMES[wage.institution]} · ${wage.duty_date}`,
            `基本工资：${wage.base_wage_gold} 金币`,
            `绩效工资：${wage.performance_gold} 金币`,
            `本次到账：${wage.base_wage_gold + wage.performance_gold} 金币，已计入余额。`,
        ].join("\n")).join("\n\n");
        const markRead = database.prepare(`
          UPDATE career_duty_days SET wage_notice_pending = 0 WHERE duty_id = ?
        `);
        for (const wage of wages)
            markRead.run(wage.duty_id);
        if (performance.length) {
            const total = performance.reduce((sum, item) => sum + item.performance_gold, 0);
            const notice = `💰 绩效到账啦！本次到账 ${total} 金币，已计入余额。`;
            text = text ? `${text}\n\n${notice}` : notice;
            const markPerformanceRead = database.prepare("UPDATE career_performance_adjustments SET notice_pending = 0 WHERE adjustment_id = ?");
            for (const item of performance) markPerformanceRead.run(item.adjustment_id);
        }
        return text;
    });
}
