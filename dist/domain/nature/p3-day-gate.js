// The server binds the existing in-memory nature authority only while the
// upgrade is configured. No farm collection or database is read here.
let natureProvider = null;

export function bindP3NatureDayGate(provider) {
    if (typeof provider !== "function") throw new TypeError("nature provider required");
    natureProvider = provider;
    return () => { if (natureProvider === provider) natureProvider = null; };
}

export function assertP3NatureDayReady(farm, day) {
    if (!natureProvider || !farm?.doorbellMcpMigration?.migrationId) return;
    const world = natureProvider();
    if (!world || world.status !== "active") return;
    if (world.lastAdvancedDay < day) throw new Error("p3_nature_day_pending");
    if (!Number.isSafeInteger(farm.lingyeP3?.lastAdvancedDay) || farm.lingyeP3.lastAdvancedDay < day)
        throw new Error("p3_farm_day_pending");
}
