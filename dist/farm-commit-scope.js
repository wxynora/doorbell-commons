import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { decodeStateRecords, farmRecordPath } from "./farm-state-records.js";

const UNKNOWN = Symbol("unknown before-image");
const dailyKeys = ["day", "tasks", "logins", "messages", "events", "stolen", "watered", "coinSpend", "oddDishes"];
const scalarPaths = [
    ["coins"], ["silver"], ["doorbellMcpMigration", "migrationId"],
    ["doorbellMcpMigration", "residentId"], ["doorbellMcpMigration", "legacyGold"],
    ["doorbellMcpMigration", "legacySilver"], ["doorbellMcpMigration", "revokedAt"],
    ...["authority", "operationId", "gold", "silver"].map(key => ["doorbellMcpMigration", "balanceProjection", key]),
];

function current(farm, path) {
    return path.reduce((value, key) => value?.[key], farm);
}

// Record-backed before-images already contain the exact parent record needed
// for a scalar; do not decode the entire farm or issue another database read.
function previous(before, path) {
    if (!before) return UNKNOWN;
    if (before.state !== undefined) return current(before.state, path);
    if (!(before.records instanceof Map)) return UNKNOWN;
    const exact = before.records.get(farmRecordPath(path));
    if (exact?.kind === "value") return JSON.parse(exact.fieldsJson);
    const parent = before.records.get(farmRecordPath(path.slice(0, -1)));
    if (!parent) return undefined;
    if (parent.kind !== "object") return UNKNOWN;
    return JSON.parse(parent.fieldsJson)[path.at(-1)];
}

function hadEquippedTitle(before, equipped) {
    if (equipped === undefined || equipped === null || equipped === "") return false;
    if (before?.state !== undefined) return (before.state.titles ?? []).includes(equipped);
    if (!(before?.records instanceof Map)) return UNKNOWN;
    if (!before.records.has("/titles")) return false;
    const hash = createHash("sha256").update(JSON.stringify(equipped)).digest("hex");
    return before.records.has(`/titles/value:${hash}#0`);
}

function boardSignature(read, entitled) {
    const equipped = read(["titleEquipped"]);
    return [read(["name"]), equipped, entitled(equipped),
        read(["doorbellMcpMigration", "migrationId"]), read(["doorbellMcpMigration", "residentId"]),
        ...dailyKeys.map(key => read(["daily", key])),
        ...["raidIncome", "raidLoss"].flatMap(kind => [read(["ranch", kind, "day"]), read(["ranch", kind, "n"])])];
}

// Unknown or explicitly forced before-images preserve the original hooks.
export function farmCommitDomains(farm, before, { forceBalance = false, forceBoard = false } = {}) {
    if (!farm || !before || (before.state === undefined && !(before.records instanceof Map)))
        return { balance: true, board: true };
    const oldBalance = scalarPaths.map(path => previous(before, path));
    const newBalance = scalarPaths.map(path => current(farm, path));
    const oldBoard = boardSignature(path => previous(before, path), equipped => hadEquippedTitle(before, equipped));
    const newBoard = boardSignature(path => current(farm, path), equipped => (farm.titles ?? []).includes(equipped));
    return {
        balance: forceBalance || oldBalance.includes(UNKNOWN) || !isDeepStrictEqual(oldBalance, newBalance),
        board: forceBoard || oldBoard.includes(UNKNOWN) || !isDeepStrictEqual(oldBoard, newBoard),
    };
}

// The existing patrol hook can stage a different actor and alter its balance
// only for a newly recorded theft, not for ordinary growth or weather changes.
export function hasNewPatrolTheft(farm, before) {
    const thefts = (farm?.trail ?? []).filter(entry => entry?.kind === "stolen" &&
        typeof entry.eventId === "string" && entry.eventId.length > 0);
    if (thefts.length === 0) return false;
    if (!before) return true;
    let old;
    if (before.state !== undefined) old = before.state.trail ?? [];
    else if (before.records instanceof Map)
        old = before.records.has("/trail") ? decodeStateRecords(before.records, "/trail") : [];
    else return true;
    const oldIds = new Set(old.map(entry => entry?.eventId));
    return thefts.some(entry => !oldIds.has(entry.eventId));
}
