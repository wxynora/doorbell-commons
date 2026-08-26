import { CareerDomainError, } from "./contracts.js";
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
let savepointSequence = 0;
export function runInTransaction(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `career_tx_${++savepointSequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
        return result;
    }
    catch (error) {
        if (nested) {
            database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        else if (database.isTransaction) {
            database.exec("ROLLBACK");
        }
        throw error;
    }
}
export function recordFinancialReceipt(database, receipt, expected, now) {
    if (!receipt.receiptId || !receipt.businessReference || !Number.isSafeInteger(receipt.amount)) {
        throw new CareerDomainError("invalid_financial_receipt", "Invalid financial receipt");
    }
    let authority;
    let entries;
    try {
        authority = database
            .prepare(`SELECT
               receipt.receipt_id,
               receipt.resident_id,
               receipt.kind,
               receipt.currency,
               receipt.amount,
               receipt.business_reference,
               journal.command_type,
               journal.business_ref AS journal_business_reference,
               reservation.reservation_id,
               reservation.reserve_journal_id
             FROM economy_financial_receipts AS receipt
             JOIN economy_journals AS journal ON journal.journal_id = receipt.receipt_id
             LEFT JOIN economy_system_gold_reservations AS reservation
               ON receipt.receipt_id IN (
                 reservation.reserve_journal_id,
                 reservation.settle_journal_id,
                 reservation.release_journal_id
               )
             WHERE receipt.receipt_id = ?`)
            .get(receipt.receiptId);
        entries = database
            .prepare(`SELECT resident_id, system_account, currency, partition_name, delta
             FROM economy_ledger_entries
             WHERE journal_id = ?
             ORDER BY entry_index`)
            .all(receipt.receiptId);
    }
    catch {
        throw new CareerDomainError("financial_receipt_unverified", "The economy authority is unavailable");
    }
    if (authority === undefined) {
        throw new CareerDomainError("financial_receipt_unverified", "The financial receipt has no economy journal");
    }
    const authoritativeReceipt = {
        receiptId: authority.receipt_id,
        residentId: authority.resident_id,
        kind: authority.kind,
        currency: authority.currency,
        amount: authority.amount,
        businessReference: authority.business_reference,
        ...(authority.reservation_id === null || authority.reservation_id === undefined
            ? {}
            : { reservationId: authority.reservation_id }),
        ...(authority.reserve_journal_id === null || authority.reserve_journal_id === undefined
            ? {}
            : { reserveReceiptId: authority.reserve_journal_id }),
    };
    if (!sameFinancialReceipt(receipt, authoritativeReceipt) ||
        authoritativeReceipt.residentId !== expected.residentId ||
        authoritativeReceipt.kind !== expected.kind ||
        authoritativeReceipt.currency !== expected.currency ||
        authoritativeReceipt.amount !== expected.amount ||
        authoritativeReceipt.businessReference !== expected.businessReference ||
        (expected.reserveReceiptId !== undefined &&
            authoritativeReceipt.reserveReceiptId !== expected.reserveReceiptId)) {
        throw new CareerDomainError("financial_receipt_mismatch", "The authoritative financial receipt does not match the career operation");
    }
    assertFinancialJournal(database, authority, entries);
    const existing = database
        .prepare(`SELECT resident_id, kind, currency, amount, business_reference
       FROM career_financial_receipts
       WHERE receipt_id = ?`)
        .get(receipt.receiptId);
    if (existing) {
        if (existing.resident_id !== receipt.residentId ||
            existing.kind !== receipt.kind ||
            existing.currency !== receipt.currency ||
            existing.amount !== receipt.amount ||
            existing.business_reference !== receipt.businessReference) {
            throw new CareerDomainError("financial_receipt_conflict", "The financial receipt id is already bound to another operation");
        }
        return;
    }
    try {
        database
            .prepare(`INSERT INTO career_financial_receipts (
           receipt_id, resident_id, kind, currency, amount, business_reference, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(receipt.receiptId, receipt.residentId, receipt.kind, receipt.currency, receipt.amount, receipt.businessReference, now);
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
            throw new CareerDomainError("financial_business_reference_conflict", "The career business reference already has a different receipt");
        }
        throw error;
    }
}
function sameFinancialReceipt(left, right) {
    return left.receiptId === right.receiptId &&
        left.residentId === right.residentId &&
        left.kind === right.kind &&
        left.currency === right.currency &&
        left.amount === right.amount &&
        left.businessReference === right.businessReference &&
        (left.reservationId ?? null) === (right.reservationId ?? null) &&
        (left.reserveReceiptId ?? null) === (right.reserveReceiptId ?? null);
}
function assertFinancialJournal(database, authority, entries) {
    const fail = () => {
        throw new CareerDomainError("financial_receipt_unverified", "The financial receipt journal is not a valid balanced economy action");
    };
    if (entries.length !== 2)
        fail();
    const has = (expected) => entries.some((entry) => entry.resident_id === expected.residentId &&
        entry.system_account === expected.systemAccount &&
        entry.currency === authority.currency &&
        entry.partition_name === expected.partition &&
        entry.delta === expected.delta);
    const residentEntry = (partition, delta) => has({
        residentId: authority.resident_id,
        systemAccount: null,
        partition,
        delta,
    });
    const systemEntry = (delta) => entries.some((entry) => entry.resident_id === null &&
        typeof entry.system_account === "string" &&
        entry.system_account.length > 0 &&
        entry.currency === authority.currency &&
        entry.partition_name === "treasury" &&
        entry.delta === delta);
    switch (authority.kind) {
        case "system_gold_charge":
            if (authority.currency !== "gold" ||
                authority.journal_business_reference !== authority.business_reference ||
                !residentEntry("available", -authority.amount) ||
                !systemEntry(authority.amount))
                fail();
            return;
        case "system_gold_credit":
            if (authority.currency !== "gold" ||
                authority.journal_business_reference !== authority.business_reference ||
                !residentEntry("available", authority.amount) ||
                !systemEntry(-authority.amount))
                fail();
            return;
        case "system_gold_reserve":
            if (authority.currency !== "gold" ||
                authority.journal_business_reference !== authority.business_reference ||
                !residentEntry("available", -authority.amount) ||
                !residentEntry("frozen", authority.amount))
                fail();
            return;
        case "system_gold_settle":
            if (authority.currency !== "gold" ||
                authority.journal_business_reference !== authority.business_reference ||
                !residentEntry("frozen", -authority.amount) ||
                !systemEntry(authority.amount))
                fail();
            return;
        case "system_gold_release":
            if (authority.currency !== "gold" ||
                authority.journal_business_reference !== authority.business_reference ||
                !residentEntry("frozen", -authority.amount) ||
                !residentEntry("available", authority.amount))
                fail();
            return;
        case "player_silver_settle": {
            if (authority.currency !== "silver")
                fail();
            const trade = database
                .prepare(`SELECT payer_resident_id, payee_resident_id, currency, amount, business_ref, state
                 FROM economy_trades WHERE trade_id = ?`)
                .get(authority.journal_business_reference);
            if (trade === undefined ||
                trade.state !== "settled" ||
                trade.payee_resident_id !== authority.resident_id ||
                trade.payer_resident_id === authority.resident_id ||
                trade.currency !== authority.currency ||
                trade.amount !== authority.amount ||
                trade.business_ref !== authority.business_reference ||
                !residentEntry("available", authority.amount) ||
                !has({
                    residentId: trade.payer_resident_id,
                    systemAccount: null,
                    partition: "frozen",
                    delta: -authority.amount,
                }))
                fail();
            return;
        }
        default:
            fail();
    }
}
export function beijingDate(timestamp) {
    return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
export function beijingTimestamp(date, hour, minute = 0) {
    return Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}
export function addBeijingDays(date, days) {
    const midnight = Date.parse(`${date}T00:00:00+08:00`);
    return beijingDate(midnight + days * DAY_MS);
}
export function nextExamSessionAt(now) {
    const today = beijingDate(now);
    for (const hour of [12, 20]) {
        const candidate = beijingTimestamp(today, hour);
        if (candidate > now)
            return candidate;
    }
    return beijingTimestamp(addBeijingDays(today, 1), 12);
}
export function nextInterviewSessionAt(now) {
    const todayAt20 = beijingTimestamp(beijingDate(now), 20);
    return todayAt20 > now ? todayAt20 : todayAt20 + DAY_MS;
}
export function isBeijingHour(timestamp, hour, minute = 0) {
    const shifted = new Date(timestamp + BEIJING_OFFSET_MS);
    return (shifted.getUTCHours() === hour &&
        shifted.getUTCMinutes() === minute &&
        shifted.getUTCSeconds() === 0 &&
        shifted.getUTCMilliseconds() === 0);
}
export function activeCertificateLevel(database, residentId, career) {
    const row = database
        .prepare(`SELECT MAX(qualification_level) AS qualification_level
       FROM career_certificates
       WHERE resident_id = ? AND career = ? AND status = 'active'`)
        .get(residentId, career);
    return row.qualification_level;
}
export function requireActiveCertificate(database, residentId, career, requiredLevel) {
    const actualLevel = activeCertificateLevel(database, residentId, career);
    if (actualLevel === null || actualLevel < requiredLevel) {
        throw new CareerDomainError("qualification_required", "The resident does not hold the required active certificate");
    }
    return actualLevel;
}
export function requireCareerTrack(database, residentId, career) {
    const row = database
        .prepare("SELECT 1 FROM career_tracks WHERE resident_id = ? AND career = ?")
        .get(residentId, career);
    if (!row) {
        throw new CareerDomainError("career_not_selected", "The career track is not selected");
    }
}
