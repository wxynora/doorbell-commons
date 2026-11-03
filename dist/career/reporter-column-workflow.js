/** A dated cutover leaves every already-issued roster unchanged. */
export function reporterColumnsDate(issueDate, env = process.env) {
    if (env.LINGYE_DAILY_COLUMNS_ENABLED !== "true") return false;
    const start = env.LINGYE_DAILY_COLUMNS_START_DATE;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(start ?? "") ||
        new Date(start + "T00:00:00Z").toISOString().slice(0, 10) !== start)
        throw new Error("daily_columns_start_date_invalid");
    return issueDate >= start;
}
