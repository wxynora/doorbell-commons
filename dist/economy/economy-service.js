import { createHash, randomUUID } from "node:crypto";
import { EconomyError } from "./economy-errors.js";
const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const GOLD_PER_SILVER = 500;
const RESIDENT_MONTHLY_SILVER_LIMIT = 1_000;
const GLOBAL_MONTHLY_SILVER_LIMIT = 10_000;
const RESTRICTED_GOLD_SINGLE_LIMIT = 100_000;
const RESTRICTED_SILVER_SINGLE_LIMIT = 200;
const DEMAND_DAILY_RATE_DENOMINATOR = 10_000;
const INTEREST_RATE_DENOMINATOR = 1_000_000;
const GRACE_DAYS = 3;
function runImmediate(database, operation) {
    if (database.isTransaction) {
        return operation();
    }
    database.exec("BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec("COMMIT");
        return result;
    }
    catch (error) {
        try {
            database.exec("ROLLBACK");
        }
        catch {
            // The original error remains authoritative.
        }
        throw error;
    }
}
function stableValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}
function stableJson(value) {
    return JSON.stringify(stableValue(value));
}
function hashPayload(value) {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}
function assertPositiveInteger(value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new EconomyError("AMOUNT_INVALID", { amount: value });
    }
}
function assertNonNegativeInteger(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new EconomyError("AMOUNT_INVALID", { amount: value });
    }
}
export function beijingDay(timestamp) {
    return Math.floor((timestamp + BEIJING_OFFSET_MS) / DAY_MS);
}
export function beijingDate(timestamp) {
    return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
export function beijingMonth(timestamp) {
    return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 7);
}
function beijingDayFromDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new EconomyError("DEPOSIT_CONTRACT_INVALID", { beijingDate: date });
    }
    const parsed = Date.parse(`${date}T00:00:00.000+08:00`);
    if (!Number.isFinite(parsed) || beijingDate(parsed) !== date) {
        throw new EconomyError("DEPOSIT_CONTRACT_INVALID", { beijingDate: date });
    }
    return beijingDay(parsed);
}
function beijingDateFromDay(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
function systemLoanRate(termDays) {
    switch (termDays) {
        case 14:
            return 1000;
        case 30:
            return 800;
        case 60:
            return 600;
    }
}
const SYSTEM_LOAN_TERMS = new Set([14, 30, 60]);
const TERM_DEPOSIT_TERMS = new Set([14, 30, 60]);
function systemLoanLimit(creditPoints) {
    if (creditPoints >= 3)
        return 1_000_000;
    if (creditPoints >= 1)
        return 500_000;
    return 200_000;
}
function termRateAllowed(termDays, totalRatePpm) {
    const ranges = {
        14: [2_000, 3_000],
        30: [5_000, 7_500],
        60: [11_000, 16_000],
    };
    const range = ranges[termDays];
    return TERM_DEPOSIT_TERMS.has(termDays) &&
        Number.isInteger(totalRatePpm) &&
        totalRatePpm >= range[0] &&
        totalRatePpm <= range[1];
}
function assertPlayerLoanParty(loan, actorResidentId) {
    if (actorResidentId !== loan.lender_resident_id && actorResidentId !== loan.borrower_resident_id) {
        throw new EconomyError("UNAUTHORIZED_PARTY");
    }
}
function assertPlayerLoanBorrower(loan, actorResidentId) {
    if (actorResidentId !== loan.borrower_resident_id) {
        throw new EconomyError("UNAUTHORIZED_PARTY");
    }
}
function exchangeFee(silverAlreadyIssued, silverRequested) {
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
export class EconomyService {
    #database;
    #rules;
    #now;
    #generateId;
    constructor(database, options) {
        this.#database = database;
        this.#rules = options.rules;
        this.#now = options.now ?? Date.now;
        this.#generateId = options.generateId ?? randomUUID;
    }
    getAccount(residentId) {
        const account = this.#account(residentId);
        const frozen = this.#database
            .prepare(`SELECT currency, COALESCE(SUM(frozen_amount), 0) AS amount
         FROM economy_trades
         WHERE payer_resident_id = ? AND state = 'frozen'
         GROUP BY currency`)
            .all(residentId);
        const reservedGold = this.#database
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS amount
         FROM economy_system_gold_reservations
         WHERE resident_id = ? AND state = 'reserved'`)
            .get(residentId).amount;
        const term = this.#database
            .prepare("SELECT COALESCE(SUM(principal), 0) AS amount FROM economy_term_deposits WHERE resident_id = ? AND state = 'active'")
            .get(residentId);
        const frozenGold = (frozen.find((item) => item.currency === "gold")?.amount ?? 0) + reservedGold;
        const frozenSilver = frozen.find((item) => item.currency === "silver")?.amount ?? 0;
        return {
            residentId,
            availableGold: account.available_gold,
            availableSilver: account.available_silver,
            frozenGold,
            frozenSilver,
            demandGold: account.demand_gold,
            termGold: term.amount,
            silverAgentLock: account.silver_agent_lock,
            agentSpendableSilver: Math.max(0, account.available_silver - account.silver_agent_lock),
            creditPoints: account.credit_points,
            highSpendRestricted: account.high_spend_restricted === 1,
        };
    }
    importLegacyBalances(input) {
        assertNonNegativeInteger(input.gold);
        assertNonNegativeInteger(input.silver);
        return this.#command("account.import_legacy", input.idempotencyKey, input.migrationId, input, (journal, now) => {
            this.#assertResident(input.residentId);
            const existing = this.#database
                .prepare("SELECT 1 FROM economy_accounts WHERE resident_id = ?")
                .get(input.residentId);
            if (existing !== undefined) {
                throw new EconomyError("ACCOUNT_ALREADY_EXISTS", { residentId: input.residentId });
            }
            this.#database
                .prepare(`INSERT INTO economy_accounts (
              resident_id, available_gold, available_silver, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)`)
                .run(input.residentId, input.gold, input.silver, now, now);
            this.#database
                .prepare(`INSERT INTO economy_demand_deposit_days (
              resident_id, beijing_date, minimum_balance
            ) VALUES (?, ?, 0)`)
                .run(input.residentId, beijingDate(now));
            if (input.gold > 0) {
                this.#residentEntry(journal, input.residentId, "gold", "available", input.gold, input.gold);
                this.#systemEntry(journal, "legacy_import", "gold", -input.gold);
            }
            if (input.silver > 0) {
                this.#residentEntry(journal, input.residentId, "silver", "available", input.silver, input.silver);
                this.#systemEntry(journal, "legacy_import", "silver", -input.silver);
            }
            this.#contractEvent(journal, "account_migration", input.migrationId, "imported", {
                residentId: input.residentId,
                gold: input.gold,
                silver: input.silver,
            });
            return this.getAccount(input.residentId);
        });
    }
    creditFromSystem(input) {
        this.#assertReceiptNotProvided(input);
        assertPositiveInteger(input.amount);
        return this.#command(`system.credit.${input.businessType}`, input.idempotencyKey, input.businessRef, input, (journal, now) => {
            this.#changeAvailable(journal, input.residentId, input.currency, input.amount, now);
            this.#systemEntry(journal, input.businessType, input.currency, -input.amount);
            const account = this.getAccount(input.residentId);
            if (input.currency !== "gold")
                return account;
            return {
                ...account,
                financialReceipt: this.#financialReceipt(journal, {
                    residentId: input.residentId,
                    kind: "system_gold_credit",
                    currency: "gold",
                    amount: input.amount,
                    businessReference: input.businessRef,
                }),
            };
        });
    }
    chargeToSystem(input) {
        this.#assertReceiptNotProvided(input);
        assertPositiveInteger(input.amount);
        return this.#command(`system.charge.${input.businessType}`, input.idempotencyKey, input.businessRef, input, (journal, now) => {
            this.#assertSpendAllowed(input.residentId, input.currency, input.amount, input.actor, input.exemption ?? null, now);
            this.#changeAvailable(journal, input.residentId, input.currency, -input.amount, now);
            this.#systemEntry(journal, input.businessType, input.currency, input.amount);
            this.#recordRestrictedSpend(input.residentId, input.currency, input.amount, input.exemption ?? null, now);
            const account = this.getAccount(input.residentId);
            if (input.currency !== "gold")
                return account;
            return {
                ...account,
                financialReceipt: this.#financialReceipt(journal, {
                    residentId: input.residentId,
                    kind: "system_gold_charge",
                    currency: "gold",
                    amount: input.amount,
                    businessReference: input.businessRef,
                }),
            };
        });
    }
    reserveSystemGold(input) {
        this.#assertReceiptNotProvided(input);
        assertPositiveInteger(input.amount);
        return this.#command("bank.system_gold.reserve", input.idempotencyKey, input.businessReference, input, (journal, now) => {
            const existing = this.#database
                .prepare(`SELECT reservation_id
             FROM economy_system_gold_reservations
             WHERE resident_id = ? AND business_reference = ?`)
                .get(input.residentId, input.businessReference);
            if (existing !== undefined) {
                throw new EconomyError("RESERVATION_CONFLICT", {
                    reservationId: existing.reservation_id,
                });
            }
            this.#assertSpendAllowed(input.residentId, "gold", input.amount, input.actor, input.exemption ?? null, now);
            this.#changeAvailable(journal, input.residentId, "gold", -input.amount, now);
            const reservationId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO economy_system_gold_reservations (
              reservation_id, resident_id, amount, business_reference, state,
              reserve_journal_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)`)
                .run(reservationId, input.residentId, input.amount, input.businessReference, journal.journalId, now, now);
            this.#residentEntry(journal, input.residentId, "gold", "frozen", input.amount, this.#frozenBalance(input.residentId, "gold"));
            this.#recordRestrictedSpend(input.residentId, "gold", input.amount, input.exemption ?? null, now);
            this.#contractEvent(journal, "system_gold_reservation", reservationId, "reserved", {
                amount: input.amount,
                businessReference: input.businessReference,
            });
            const financialReceipt = this.#financialReceipt(journal, {
                residentId: input.residentId,
                kind: "system_gold_reserve",
                currency: "gold",
                amount: input.amount,
                businessReference: input.businessReference,
            });
            return {
                ...this.#systemGoldReservation(reservationId),
                account: this.getAccount(input.residentId),
                financialReceipt,
            };
        });
    }
    settleSystemGoldReservation(input) {
        this.#assertReceiptNotProvided(input);
        return this.#command("bank.system_gold.settle", input.idempotencyKey, input.businessReference, input, (journal, now) => {
            const reservation = this.#systemGoldReservation(input.reservationId);
            if (reservation.state !== "reserved") {
                throw new EconomyError("RESERVATION_CONFLICT", {
                    reservationId: input.reservationId,
                    state: reservation.state,
                });
            }
            this.#database
                .prepare(`UPDATE economy_system_gold_reservations
             SET state = 'settled', settle_journal_id = ?, updated_at = ?, closed_at = ?
             WHERE reservation_id = ?`)
                .run(journal.journalId, now, now, input.reservationId);
            this.#residentEntry(journal, reservation.resident_id, "gold", "frozen", -reservation.amount, this.#frozenBalance(reservation.resident_id, "gold"));
            this.#systemEntry(journal, "system_gold_reservation", "gold", reservation.amount);
            this.#contractEvent(journal, "system_gold_reservation", input.reservationId, "settled", {
                amount: reservation.amount,
                businessReference: input.businessReference,
            });
            const financialReceipt = this.#financialReceipt(journal, {
                residentId: reservation.resident_id,
                kind: "system_gold_settle",
                currency: "gold",
                amount: reservation.amount,
                businessReference: input.businessReference,
            });
            return {
                ...this.#systemGoldReservation(input.reservationId),
                account: this.getAccount(reservation.resident_id),
                financialReceipt,
            };
        });
    }
    releaseSystemGoldReservation(input) {
        this.#assertReceiptNotProvided(input);
        return this.#command("bank.system_gold.release", input.idempotencyKey, input.businessReference, input, (journal, now) => {
            const reservation = this.#systemGoldReservation(input.reservationId);
            if (reservation.state !== "reserved") {
                throw new EconomyError("RESERVATION_CONFLICT", {
                    reservationId: input.reservationId,
                    state: reservation.state,
                });
            }
            this.#database
                .prepare(`UPDATE economy_system_gold_reservations
             SET state = 'released', release_journal_id = ?, updated_at = ?, closed_at = ?
             WHERE reservation_id = ?`)
                .run(journal.journalId, now, now, input.reservationId);
            this.#residentEntry(journal, reservation.resident_id, "gold", "frozen", -reservation.amount, this.#frozenBalance(reservation.resident_id, "gold"));
            this.#changeAvailable(journal, reservation.resident_id, "gold", reservation.amount, now);
            this.#releaseRestrictedSpend(reservation.resident_id, "gold", reservation.amount, reservation.created_at, now);
            this.#contractEvent(journal, "system_gold_reservation", input.reservationId, "released", {
                amount: reservation.amount,
                businessReference: input.businessReference,
            });
            const financialReceipt = this.#financialReceipt(journal, {
                residentId: reservation.resident_id,
                kind: "system_gold_release",
                currency: "gold",
                amount: reservation.amount,
                businessReference: input.businessReference,
            });
            return {
                ...this.#systemGoldReservation(input.reservationId),
                account: this.getAccount(reservation.resident_id),
                financialReceipt,
            };
        });
    }
    getFinancialReceipt(receiptId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_financial_receipts WHERE receipt_id = ?")
            .get(receiptId);
        if (row === undefined)
            throw new EconomyError("FINANCIAL_RECEIPT_NOT_FOUND", { receiptId });
        return this.#financialReceiptRow(row);
    }
    setSilverAgentLock(input) {
        assertNonNegativeInteger(input.amount);
        return this.#command("bank.silver_lock.set", input.idempotencyKey, `silver-lock:${input.residentId}`, input, (journal, now) => {
            const account = this.#account(input.residentId);
            if (input.amount > account.available_silver) {
                throw new EconomyError("BALANCE_INSUFFICIENT", {
                    currency: "silver",
                    available: account.available_silver,
                    requestedLock: input.amount,
                });
            }
            if (input.actor === "agent" && input.amount < account.silver_agent_lock) {
                throw new EconomyError("SILVER_LOCKED", {
                    currentLock: account.silver_agent_lock,
                    requestedLock: input.amount,
                });
            }
            this.#database
                .prepare("UPDATE economy_accounts SET silver_agent_lock = ?, updated_at = ? WHERE resident_id = ?")
                .run(input.amount, now, input.residentId);
            journal.lockEvents.push({
                residentId: input.residentId,
                previousAmount: account.silver_agent_lock,
                nextAmount: input.amount,
                actor: input.actor,
            });
            return this.getAccount(input.residentId);
        });
    }
    depositDemandGold(input) {
        assertPositiveInteger(input.amount);
        return this.#command("bank.demand.deposit", input.idempotencyKey, `demand:${input.residentId}`, input, (journal, now) => {
            const before = this.#account(input.residentId);
            this.#rollDemandDays(input.residentId, beijingDay(now), before.demand_gold);
            this.#touchDemandMinimum(input.residentId, beijingDate(now), before.demand_gold);
            this.#changeAvailable(journal, input.residentId, "gold", -input.amount, now);
            const balance = this.#changeDemandGold(input.residentId, input.amount, now);
            this.#residentEntry(journal, input.residentId, "gold", "demand_deposit", input.amount, balance);
            return this.getAccount(input.residentId);
        });
    }
    withdrawDemandGold(input) {
        assertPositiveInteger(input.amount);
        return this.#command("bank.demand.withdraw", input.idempotencyKey, `demand:${input.residentId}`, input, (journal, now) => {
            const before = this.#account(input.residentId);
            if (before.demand_gold < input.amount) {
                throw new EconomyError("BALANCE_INSUFFICIENT", {
                    partition: "demand_deposit",
                    available: before.demand_gold,
                });
            }
            this.#rollDemandDays(input.residentId, beijingDay(now), before.demand_gold);
            this.#touchDemandMinimum(input.residentId, beijingDate(now), before.demand_gold);
            const balance = this.#changeDemandGold(input.residentId, -input.amount, now);
            this.#touchDemandMinimum(input.residentId, beijingDate(now), balance);
            this.#residentEntry(journal, input.residentId, "gold", "demand_deposit", -input.amount, balance);
            this.#changeAvailable(journal, input.residentId, "gold", input.amount, now);
            return this.getAccount(input.residentId);
        });
    }
    accrueDemandInterest(input) {
        return this.#command("bank.demand.interest", input.idempotencyKey, `demand-interest:${input.residentId}:${input.beijingDate}`, input, (journal, now) => {
            const interestDay = beijingDayFromDate(input.beijingDate);
            if (beijingDay(now) <= interestDay) {
                throw new EconomyError("DEPOSIT_CONTRACT_INVALID", { reason: "day_not_closed" });
            }
            const currentDay = beijingDay(now);
            const currentDayStartedAt = currentDay * DAY_MS - BEIJING_OFFSET_MS;
            if (currentDay === interestDay + 1 && now < currentDayStartedAt + 5 * 60_000) {
                throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                    reason: "interest_time_not_reached",
                });
            }
            const account = this.#account(input.residentId);
            this.#rollDemandDays(input.residentId, currentDay, account.demand_gold);
            const row = this.#database
                .prepare("SELECT minimum_balance, interest_paid FROM economy_demand_deposit_days WHERE resident_id = ? AND beijing_date = ?")
                .get(input.residentId, input.beijingDate);
            if (row === undefined) {
                throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                    reason: "demand_history_unavailable",
                    beijingDate: input.beijingDate,
                });
            }
            if (row.interest_paid !== null) {
                return { interest: row.interest_paid, account: this.getAccount(input.residentId) };
            }
            const earliestPending = this.#database
                .prepare(`SELECT beijing_date
             FROM economy_demand_deposit_days
             WHERE resident_id = ? AND beijing_date < ? AND interest_paid IS NULL
             ORDER BY beijing_date ASC
             LIMIT 1`)
                .get(input.residentId, beijingDate(now));
            if (earliestPending?.beijing_date !== input.beijingDate) {
                throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                    reason: "interest_sequence_gap",
                    expectedBeijingDate: earliestPending?.beijing_date ?? null,
                    requestedBeijingDate: input.beijingDate,
                });
            }
            const minimumBalance = row.minimum_balance;
            const interest = Math.floor(minimumBalance / DEMAND_DAILY_RATE_DENOMINATOR);
            this.#database
                .prepare(`INSERT INTO economy_demand_deposit_days (
              resident_id, beijing_date, minimum_balance, interest_paid, interest_journal_id
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (resident_id, beijing_date) DO UPDATE SET
              interest_paid = excluded.interest_paid,
              interest_journal_id = excluded.interest_journal_id`)
                .run(input.residentId, input.beijingDate, minimumBalance, interest, journal.journalId);
            if (interest > 0) {
                this.#changeAvailable(journal, input.residentId, "gold", interest, now);
                this.#systemEntry(journal, "demand_interest", "gold", -interest);
            }
            this.#contractEvent(journal, "demand_deposit", input.residentId, "daily_interest", {
                beijingDate: input.beijingDate,
                minimumBalance,
                interest,
            });
            return { interest, account: this.getAccount(input.residentId) };
        });
    }
    openTermDeposit(input) {
        assertPositiveInteger(input.principal);
        if (input.principal < 1_000_000 || !termRateAllowed(input.termDays, input.totalRatePpm)) {
            throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                principal: input.principal,
                termDays: input.termDays,
                totalRatePpm: input.totalRatePpm,
            });
        }
        return this.#command("bank.term.open", input.idempotencyKey, `term-deposit:${input.residentId}`, input, (journal, now) => {
            if (this.#account(input.residentId).high_spend_restricted === 1) {
                throw new EconomyError("TERM_DEPOSIT_RESTRICTED");
            }
            const depositId = this.#generateId();
            const openedDay = beijingDay(now);
            this.#changeAvailable(journal, input.residentId, "gold", -input.principal, now);
            this.#database
                .prepare(`INSERT INTO economy_term_deposits (
              deposit_id, resident_id, principal, term_days, total_rate_ppm,
              opened_day, maturity_day, state, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
                .run(depositId, input.residentId, input.principal, input.termDays, input.totalRatePpm, openedDay, openedDay + input.termDays, now);
            this.#residentEntry(journal, input.residentId, "gold", "term_deposit", input.principal, this.#activeTermPrincipal(input.residentId));
            this.#contractEvent(journal, "term_deposit", depositId, "opened", input);
            return this.#termDeposit(depositId);
        });
    }
    closeTermDeposit(input) {
        return this.#command("bank.term.close", input.idempotencyKey, input.depositId, input, (journal, now) => {
            const deposit = this.#termDeposit(input.depositId);
            if (deposit.state !== "active")
                return deposit;
            const matured = beijingDay(now) >= deposit.maturity_day;
            const interest = matured
                ? Math.floor((deposit.principal * deposit.total_rate_ppm) / INTEREST_RATE_DENOMINATOR)
                : 0;
            this.#residentEntry(journal, deposit.resident_id, "gold", "term_deposit", -deposit.principal, this.#activeTermPrincipal(deposit.resident_id) - deposit.principal);
            this.#changeAvailable(journal, deposit.resident_id, "gold", deposit.principal + interest, now);
            if (interest > 0)
                this.#systemEntry(journal, "term_interest", "gold", -interest);
            this.#database
                .prepare("UPDATE economy_term_deposits SET state = ?, interest_paid = ?, ended_at = ? WHERE deposit_id = ?")
                .run(matured ? "matured" : "terminated", interest, now, input.depositId);
            this.#contractEvent(journal, "term_deposit", input.depositId, matured ? "matured" : "terminated_early", { principal: deposit.principal, interest });
            return this.#termDeposit(input.depositId);
        });
    }
    previewExchange(residentId, goldPrincipal, at = this.#now()) {
        assertPositiveInteger(goldPrincipal);
        if (goldPrincipal % GOLD_PER_SILVER !== 0) {
            throw new EconomyError("AMOUNT_INVALID", { multiple: GOLD_PER_SILVER });
        }
        this.#account(residentId);
        const month = beijingMonth(at);
        const silverReceived = goldPrincipal / GOLD_PER_SILVER;
        const residentIssued = this.#residentExchangeIssued(residentId, month);
        const globalIssued = this.#globalExchangeIssued(month);
        const residentRemainingSilver = Math.max(0, RESIDENT_MONTHLY_SILVER_LIMIT - residentIssued);
        const globalRemainingSilver = Math.max(0, GLOBAL_MONTHLY_SILVER_LIMIT - globalIssued);
        return {
            goldPrincipal,
            goldFee: exchangeFee(residentIssued, silverReceived),
            goldTotal: goldPrincipal + exchangeFee(residentIssued, silverReceived),
            silverReceived,
            residentRemainingSilver,
            globalRemainingSilver,
            maximumSilverAvailable: Math.min(residentRemainingSilver, globalRemainingSilver),
        };
    }
    exchangeGoldForSilver(input) {
        return this.#command("bank.exchange.gold_to_silver", input.idempotencyKey, `exchange:${input.residentId}:${beijingMonth(this.#now())}`, input, (journal, now) => {
            if (this.#account(input.residentId).high_spend_restricted === 1) {
                throw new EconomyError("EXCHANGE_RESTRICTED");
            }
            const preview = this.previewExchange(input.residentId, input.goldPrincipal, now);
            if (preview.silverReceived > preview.maximumSilverAvailable) {
                throw new EconomyError("EXCHANGE_LIMIT_EXCEEDED", {
                    requestedSilver: preview.silverReceived,
                    maximumSilverAvailable: preview.maximumSilverAvailable,
                });
            }
            this.#changeAvailable(journal, input.residentId, "gold", -preview.goldTotal, now);
            this.#systemEntry(journal, "exchange_gold_and_fee", "gold", preview.goldTotal);
            this.#changeAvailable(journal, input.residentId, "silver", preview.silverReceived, now);
            this.#systemEntry(journal, "exchange_silver_issuance", "silver", -preview.silverReceived);
            const month = beijingMonth(now);
            this.#database
                .prepare(`INSERT INTO economy_exchange_resident_months (resident_id, beijing_month, silver_issued)
             VALUES (?, ?, ?)
             ON CONFLICT (resident_id, beijing_month) DO UPDATE SET
               silver_issued = silver_issued + excluded.silver_issued`)
                .run(input.residentId, month, preview.silverReceived);
            this.#database
                .prepare(`INSERT INTO economy_exchange_global_months (beijing_month, silver_issued)
             VALUES (?, ?)
             ON CONFLICT (beijing_month) DO UPDATE SET
               silver_issued = silver_issued + excluded.silver_issued`)
                .run(month, preview.silverReceived);
            return { preview, account: this.getAccount(input.residentId) };
        });
    }
    createTrade(input) {
        assertPositiveInteger(input.amount);
        if (input.payerResidentId === input.payeeResidentId) {
            throw new EconomyError("TRADE_STATE_CONFLICT", { reason: "same_party" });
        }
        return this.#command("trade.create", input.idempotencyKey, input.businessRef, input, (journal, now) => {
            this.#account(input.payerResidentId);
            this.#account(input.payeeResidentId);
            const tradeId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO economy_trades (
              trade_id, payer_resident_id, payee_resident_id, currency, amount,
              business_type, business_ref, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
                .run(tradeId, input.payerResidentId, input.payeeResidentId, input.currency, input.amount, input.businessType, input.businessRef, now, now);
            this.#contractEvent(journal, "trade", tradeId, "created", input);
            return this.#trade(tradeId);
        });
    }
    confirmTrade(input) {
        return this.#command("trade.confirm", input.idempotencyKey, input.tradeId, input, (journal, now) => {
            const trade = this.#trade(input.tradeId);
            if (trade.state !== "pending")
                return trade;
            if (input.residentId !== trade.payer_resident_id &&
                input.residentId !== trade.payee_resident_id) {
                throw new EconomyError("UNAUTHORIZED_PARTY");
            }
            const column = input.residentId === trade.payer_resident_id
                ? "payer_confirmed_at"
                : "payee_confirmed_at";
            this.#database
                .prepare(`UPDATE economy_trades SET ${column} = COALESCE(${column}, ?), updated_at = ? WHERE trade_id = ?`)
                .run(now, now, input.tradeId);
            const confirmed = this.#trade(input.tradeId);
            if (confirmed.payer_confirmed_at !== null && confirmed.payee_confirmed_at !== null) {
                this.#assertSpendAllowed(confirmed.payer_resident_id, confirmed.currency, confirmed.amount, "agent", null, now);
                this.#changeAvailable(journal, confirmed.payer_resident_id, confirmed.currency, -confirmed.amount, now);
                this.#database
                    .prepare(`UPDATE economy_trades
             SET state = 'frozen', frozen_amount = amount,
                 frozen_at = COALESCE(frozen_at, ?), updated_at = ?
             WHERE trade_id = ?`)
                    .run(now, now, input.tradeId);
                const frozenBalance = this.#frozenBalance(confirmed.payer_resident_id, confirmed.currency);
                this.#residentEntry(journal, confirmed.payer_resident_id, confirmed.currency, "frozen", confirmed.amount, frozenBalance);
                this.#recordRestrictedSpend(confirmed.payer_resident_id, confirmed.currency, confirmed.amount, null, now);
                this.#contractEvent(journal, "trade", input.tradeId, "funds_frozen", {
                    amount: confirmed.amount,
                    currency: confirmed.currency,
                });
            }
            else {
                this.#contractEvent(journal, "trade", input.tradeId, "party_confirmed", {
                    residentId: input.residentId,
                });
            }
            return this.#trade(input.tradeId);
        });
    }
    settleTrade(input) {
        this.#assertReceiptNotProvided(input);
        return this.#command("trade.settle", input.idempotencyKey, input.tradeId, input, (journal, now) => {
            const trade = this.#trade(input.tradeId);
            if (trade.state === "settled")
                return trade;
            if (trade.state !== "frozen")
                throw new EconomyError("TRADE_STATE_CONFLICT", { state: trade.state });
            this.#database
                .prepare(`UPDATE economy_trades
             SET state = 'settled', frozen_amount = 0, settled_amount = amount, updated_at = ?
             WHERE trade_id = ?`)
                .run(now, input.tradeId);
            this.#residentEntry(journal, trade.payer_resident_id, trade.currency, "frozen", -trade.amount, this.#frozenBalance(trade.payer_resident_id, trade.currency));
            this.#changeAvailable(journal, trade.payee_resident_id, trade.currency, trade.amount, now);
            this.#contractEvent(journal, "trade", input.tradeId, "settled", { amount: trade.amount });
            const settled = this.#trade(input.tradeId);
            if (trade.currency !== "silver")
                return settled;
            return {
                ...settled,
                financialReceipt: this.#financialReceipt(journal, {
                    residentId: trade.payee_resident_id,
                    kind: "player_silver_settle",
                    currency: "silver",
                    amount: trade.amount,
                    businessReference: trade.business_ref,
                }),
            };
        });
    }
    cancelTrade(input) {
        return this.#command("trade.cancel", input.idempotencyKey, input.tradeId, input, (journal, now) => {
            const trade = this.#trade(input.tradeId);
            if (trade.state === "cancelled")
                return trade;
            if (trade.state !== "pending" && trade.state !== "frozen") {
                throw new EconomyError("TRADE_STATE_CONFLICT", { state: trade.state });
            }
            this.#database
                .prepare("UPDATE economy_trades SET state = 'cancelled', frozen_amount = 0, updated_at = ? WHERE trade_id = ?")
                .run(now, input.tradeId);
            if (trade.state === "frozen") {
                this.#releaseRestrictedSpend(trade.payer_resident_id, trade.currency, trade.amount, trade.frozen_at, now);
                this.#residentEntry(journal, trade.payer_resident_id, trade.currency, "frozen", -trade.amount, this.#frozenBalance(trade.payer_resident_id, trade.currency));
                this.#changeAvailable(journal, trade.payer_resident_id, trade.currency, trade.amount, now);
            }
            this.#contractEvent(journal, "trade", input.tradeId, "cancelled", {});
            return this.#trade(input.tradeId);
        });
    }
    refundTrade(input) {
        assertPositiveInteger(input.amount);
        return this.#command("trade.refund", input.idempotencyKey, input.tradeId, input, (journal, now) => {
            const trade = this.#trade(input.tradeId);
            if (trade.state !== "settled" ||
                trade.refunded_amount + input.amount > trade.settled_amount) {
                throw new EconomyError("TRADE_STATE_CONFLICT", {
                    state: trade.state,
                    refundable: trade.settled_amount - trade.refunded_amount,
                });
            }
            this.#changeAvailable(journal, trade.payee_resident_id, trade.currency, -input.amount, now);
            this.#changeAvailable(journal, trade.payer_resident_id, trade.currency, input.amount, now);
            this.#database
                .prepare("UPDATE economy_trades SET refunded_amount = refunded_amount + ?, updated_at = ? WHERE trade_id = ?")
                .run(input.amount, now, input.tradeId);
            this.#contractEvent(journal, "trade", input.tradeId, "refunded", { amount: input.amount });
            return this.#trade(input.tradeId);
        });
    }
    openSystemLoan(input) {
        assertPositiveInteger(input.principal);
        if (!SYSTEM_LOAN_TERMS.has(input.termDays)) {
            throw new EconomyError("LOAN_CONTRACT_INVALID", { termDays: input.termDays });
        }
        if (this.#rules.minimumSystemLoanCreditDays === null) {
            throw new EconomyError("CREDIT_RULE_NOT_CONFIGURED");
        }
        return this.#command("bank.system_loan.open", input.idempotencyKey, `system-loan:${input.borrowerResidentId}`, input, (journal, now) => {
            const account = this.#account(input.borrowerResidentId);
            if (account.high_spend_restricted === 1)
                throw new EconomyError("LOAN_RESTRICTED");
            const existingLoan = this.#database
                .prepare("SELECT loan_id FROM economy_system_loans WHERE borrower_resident_id = ? AND status != 'repaid'")
                .get(input.borrowerResidentId);
            if (existingLoan !== undefined) {
                throw new EconomyError("LOAN_CONTRACT_INVALID", { existingLoanId: existingLoan.loan_id });
            }
            const limit = systemLoanLimit(account.credit_points);
            if (input.principal > limit) {
                throw new EconomyError("LOAN_CONTRACT_INVALID", { maximumPrincipal: limit });
            }
            const loanId = this.#generateId();
            const originatedDay = beijingDay(now);
            this.#database
                .prepare(`INSERT INTO economy_system_loans (
              loan_id, borrower_resident_id, principal_original, principal_outstanding,
              daily_rate_ppm, term_days, originated_day, accrued_through_day, due_day,
              status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
                .run(loanId, input.borrowerResidentId, input.principal, input.principal, systemLoanRate(input.termDays), input.termDays, originatedDay, originatedDay, originatedDay + input.termDays - 1, now);
            this.#changeAvailable(journal, input.borrowerResidentId, "gold", input.principal, now);
            this.#systemEntry(journal, "system_loan_principal", "gold", -input.principal);
            this.#contractEvent(journal, "system_loan", loanId, "disbursed", input);
            return this.#systemLoan(loanId);
        });
    }
    repaySystemLoan(input) {
        assertPositiveInteger(input.amount);
        if (this.#rules.minimumSystemLoanCreditDays === null) {
            throw new EconomyError("CREDIT_RULE_NOT_CONFIGURED");
        }
        return this.#command("bank.system_loan.repay", input.idempotencyKey, input.loanId, input, (journal, now) => {
            let loan = this.#systemLoan(input.loanId);
            if (loan.status === "repaid")
                return loan;
            this.#accrueSystemLoan(journal, loan, beijingDay(now), now);
            this.#refreshSystemLoanStatus(journal, input.loanId, beijingDay(now), now);
            loan = this.#systemLoan(input.loanId);
            const outstanding = loan.accrued_interest + loan.principal_outstanding;
            if (input.amount > outstanding) {
                throw new EconomyError("PAYMENT_EXCEEDS_OUTSTANDING", { outstanding });
            }
            this.#changeAvailable(journal, loan.borrower_resident_id, "gold", -input.amount, now);
            this.#systemEntry(journal, "system_loan_repayment", "gold", input.amount);
            const interestPaid = Math.min(input.amount, loan.accrued_interest);
            const principalPaid = input.amount - interestPaid;
            const nextInterest = loan.accrued_interest - interestPaid;
            const nextPrincipal = loan.principal_outstanding - principalPaid;
            const completed = nextInterest === 0 && nextPrincipal === 0;
            this.#database
                .prepare(`UPDATE economy_system_loans SET
              accrued_interest = ?, principal_outstanding = ?, status = ?, repaid_at = ?
             WHERE loan_id = ?`)
                .run(nextInterest, nextPrincipal, completed ? "repaid" : loan.status, completed ? now : null, input.loanId);
            if (completed) {
                const minimumCreditDays = this.#rules.minimumSystemLoanCreditDays;
                if (minimumCreditDays === null)
                    throw new EconomyError("CREDIT_RULE_NOT_CONFIGURED");
                const heldDays = Math.max(0, beijingDay(now) - loan.originated_day);
                const account = this.#account(loan.borrower_resident_id);
                let creditPoints = account.credit_points;
                if (loan.entered_restriction === 1) {
                    creditPoints = Math.max(0, creditPoints - 2);
                }
                else if (beijingDay(now) <= loan.due_day && heldDays >= minimumCreditDays) {
                    creditPoints += 1;
                }
                this.#database
                    .prepare("UPDATE economy_accounts SET credit_points = ?, updated_at = ? WHERE resident_id = ?")
                    .run(creditPoints, now, loan.borrower_resident_id);
            }
            this.#syncRestriction(loan.borrower_resident_id, now);
            this.#contractEvent(journal, "system_loan", input.loanId, completed ? "repaid" : "partial_repayment", {
                amount: input.amount,
                interestPaid,
                principalPaid,
            });
            return this.#systemLoan(input.loanId);
        });
    }
    proposePlayerLoan(input) {
        assertPositiveInteger(input.principal);
        if ((input.actorResidentId !== input.lenderResidentId &&
            input.actorResidentId !== input.borrowerResidentId)) {
            throw new EconomyError("UNAUTHORIZED_PARTY");
        }
        if (input.lenderResidentId === input.borrowerResidentId ||
            !Number.isInteger(input.termDays) ||
            input.termDays < 1 ||
            input.termDays > 60 ||
            !Number.isInteger(input.totalRatePpm) ||
            input.totalRatePpm < 0 ||
            input.totalRatePpm > 200_000) {
            throw new EconomyError("LOAN_CONTRACT_INVALID");
        }
        return this.#command("bank.player_loan.propose", input.idempotencyKey, `player-loan:${input.lenderResidentId}:${input.borrowerResidentId}`, input, (journal, now) => {
            this.#account(input.lenderResidentId);
            if (this.#account(input.borrowerResidentId).high_spend_restricted === 1) {
                throw new EconomyError("LOAN_RESTRICTED");
            }
            const loanId = this.#generateId();
            this.#database
                .prepare(`INSERT INTO economy_player_loans (
              loan_id, lender_resident_id, borrower_resident_id, principal_original,
              principal_outstanding, total_rate_ppm, term_days, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`)
                .run(loanId, input.lenderResidentId, input.borrowerResidentId, input.principal, input.principal, input.totalRatePpm, input.termDays, now);
            this.#contractEvent(journal, "player_loan", loanId, "proposed", input);
            return this.#playerLoan(loanId);
        });
    }
    confirmPlayerLoan(input) {
        assertPlayerLoanParty(this.#playerLoan(input.loanId), input.actorResidentId);
        return this.#command("bank.player_loan.confirm", input.idempotencyKey, input.loanId, input, (journal, now) => {
            const loan = this.#playerLoan(input.loanId);
            if (loan.status !== "proposed")
                return loan;
            const column = input.actorResidentId === loan.lender_resident_id
                ? "lender_confirmed_at"
                : "borrower_confirmed_at";
            this.#database
                .prepare(`UPDATE economy_player_loans SET ${column} = COALESCE(${column}, ?) WHERE loan_id = ?`)
                .run(now, input.loanId);
            const confirmed = this.#playerLoan(input.loanId);
            if (confirmed.lender_confirmed_at !== null && confirmed.borrower_confirmed_at !== null) {
                if (this.#account(confirmed.borrower_resident_id).high_spend_restricted === 1) {
                    throw new EconomyError("LOAN_RESTRICTED");
                }
                this.#assertSpendAllowed(confirmed.lender_resident_id, "silver", confirmed.principal_original, "agent", null, now);
                this.#changeAvailable(journal, confirmed.lender_resident_id, "silver", -confirmed.principal_original, now);
                this.#changeAvailable(journal, confirmed.borrower_resident_id, "silver", confirmed.principal_original, now);
                this.#recordRestrictedSpend(confirmed.lender_resident_id, "silver", confirmed.principal_original, null, now);
                const day = beijingDay(now);
                this.#database
                    .prepare(`UPDATE economy_player_loans SET
                status = 'active', originated_day = ?, accrued_through_day = ?, due_day = ?
               WHERE loan_id = ?`)
                    .run(day, day, day + confirmed.term_days - 1, input.loanId);
                this.#contractEvent(journal, "player_loan", input.loanId, "disbursed", {
                    principal: confirmed.principal_original,
                });
            }
            else {
                this.#contractEvent(journal, "player_loan", input.loanId, "party_confirmed", {
                    residentId: input.actorResidentId,
                });
            }
            return this.#playerLoan(input.loanId);
        });
    }
    cancelPlayerLoan(input) {
        assertPlayerLoanParty(this.#playerLoan(input.loanId), input.actorResidentId);
        return this.#command("bank.player_loan.cancel", input.idempotencyKey, input.loanId, input, (journal, now) => {
            const loan = this.#playerLoan(input.loanId);
            if (loan.status === "cancelled")
                return loan;
            if (loan.status !== "proposed") {
                throw new EconomyError("LOAN_CONTRACT_INVALID", { status: loan.status });
            }
            this.#database
                .prepare("UPDATE economy_player_loans SET status = 'cancelled' WHERE loan_id = ?")
                .run(input.loanId);
            this.#contractEvent(journal, "player_loan", input.loanId, "cancelled", { at: now });
            return this.#playerLoan(input.loanId);
        });
    }
    repayPlayerLoan(input) {
        assertPositiveInteger(input.amount);
        assertPlayerLoanBorrower(this.#playerLoan(input.loanId), input.actorResidentId);
        return this.#command("bank.player_loan.repay", input.idempotencyKey, input.loanId, input, (journal, now) => {
            let loan = this.#playerLoan(input.loanId);
            if (loan.status === "repaid")
                return loan;
            if (!["active", "overdue", "restricted"].includes(loan.status)) {
                throw new EconomyError("LOAN_CONTRACT_INVALID", { status: loan.status });
            }
            this.#accruePlayerLoan(journal, loan, beijingDay(now), now);
            this.#refreshPlayerLoanStatus(journal, input.loanId, beijingDay(now), now);
            loan = this.#playerLoan(input.loanId);
            const outstanding = loan.accrued_interest + loan.principal_outstanding;
            if (input.amount > outstanding) {
                throw new EconomyError("PAYMENT_EXCEEDS_OUTSTANDING", { outstanding });
            }
            this.#changeAvailable(journal, loan.borrower_resident_id, "silver", -input.amount, now);
            this.#changeAvailable(journal, loan.lender_resident_id, "silver", input.amount, now);
            const interestPaid = Math.min(input.amount, loan.accrued_interest);
            const principalPaid = input.amount - interestPaid;
            const nextInterest = loan.accrued_interest - interestPaid;
            const nextPrincipal = loan.principal_outstanding - principalPaid;
            const completed = nextInterest === 0 && nextPrincipal === 0;
            this.#database
                .prepare(`UPDATE economy_player_loans SET
              accrued_interest = ?, principal_outstanding = ?, status = ?, repaid_at = ?
             WHERE loan_id = ?`)
                .run(nextInterest, nextPrincipal, completed ? "repaid" : loan.status, completed ? now : null, input.loanId);
            if (completed && loan.entered_restriction === 1) {
                const account = this.#account(loan.borrower_resident_id);
                this.#database
                    .prepare("UPDATE economy_accounts SET credit_points = ?, updated_at = ? WHERE resident_id = ?")
                    .run(Math.max(0, account.credit_points - 2), now, loan.borrower_resident_id);
            }
            this.#syncRestriction(loan.borrower_resident_id, now);
            this.#contractEvent(journal, "player_loan", input.loanId, completed ? "repaid" : "partial_repayment", {
                amount: input.amount,
                interestPaid,
                principalPaid,
            });
            return this.#playerLoan(input.loanId);
        });
    }
    refreshDebtStatus(input) {
        return this.#command("bank.debt.refresh", input.idempotencyKey, `debt:${input.residentId}:${beijingDate(this.#now())}`, input, (journal, now) => {
            const day = beijingDay(now);
            const systemLoans = this.#database
                .prepare("SELECT * FROM economy_system_loans WHERE borrower_resident_id = ? AND status != 'repaid'")
                .all(input.residentId);
            for (const loan of systemLoans) {
                this.#accrueSystemLoan(journal, loan, day, now);
                this.#refreshSystemLoanStatus(journal, loan.loan_id, day, now);
            }
            const playerLoans = this.#database
                .prepare(`SELECT * FROM economy_player_loans
             WHERE borrower_resident_id = ? AND status IN ('active', 'overdue', 'restricted')`)
                .all(input.residentId);
            for (const loan of playerLoans) {
                this.#accruePlayerLoan(journal, loan, day, now);
                this.#refreshPlayerLoanStatus(journal, loan.loan_id, day, now);
            }
            this.#syncRestriction(input.residentId, now);
            return this.getAccount(input.residentId);
        });
    }
    #command(commandType, idempotencyKey, businessRef, payload, operation) {
        if (idempotencyKey.length === 0)
            throw new EconomyError("IDEMPOTENCY_CONFLICT");
        const payloadHash = hashPayload(payload);
        const existing = this.#database
            .prepare("SELECT command_type, payload_hash, result_json FROM economy_commands WHERE idempotency_key = ?")
            .get(idempotencyKey);
        if (existing !== undefined)
            return this.#replay(existing, commandType, payloadHash);
        return runImmediate(this.#database, () => {
            const raced = this.#database
                .prepare("SELECT command_type, payload_hash, result_json FROM economy_commands WHERE idempotency_key = ?")
                .get(idempotencyKey);
            if (raced !== undefined)
                return this.#replay(raced, commandType, payloadHash);
            const now = this.#now();
            const journal = {
                journalId: this.#generateId(),
                entries: [],
                contractEvents: [],
                lockEvents: [],
                financialReceipts: [],
            };
            const result = operation(journal, now);
            this.#assertBalanced(journal.entries);
            const resultJson = stableJson(result);
            this.#database
                .prepare(`INSERT INTO economy_journals (
            journal_id, command_type, business_ref, payload_hash, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(journal.journalId, commandType, businessRef, payloadHash, resultJson, now);
            const insertEntry = this.#database.prepare(`INSERT INTO economy_ledger_entries (
          journal_id, entry_index, resident_id, system_account, currency,
          partition_name, delta, balance_after, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            journal.entries.forEach((entry, index) => {
                insertEntry.run(journal.journalId, index, entry.residentId, entry.systemAccount, entry.currency, entry.partition, entry.delta, entry.balanceAfter, now);
            });
            const insertContractEvent = this.#database.prepare(`INSERT INTO economy_contract_events (
          event_id, journal_id, contract_type, contract_id, event_type, event_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            for (const event of journal.contractEvents) {
                insertContractEvent.run(this.#generateId(), journal.journalId, event.contractType, event.contractId, event.eventType, stableJson(event.payload), now);
            }
            const insertLockEvent = this.#database.prepare(`INSERT INTO economy_silver_lock_events (
          event_id, journal_id, resident_id, previous_amount, next_amount, actor, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            for (const event of journal.lockEvents) {
                insertLockEvent.run(this.#generateId(), journal.journalId, event.residentId, event.previousAmount, event.nextAmount, event.actor, now);
            }
            const insertFinancialReceipt = this.#database.prepare(`INSERT INTO economy_financial_receipts (
          receipt_id, resident_id, kind, currency, amount, business_reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            for (const receipt of journal.financialReceipts) {
                insertFinancialReceipt.run(receipt.receiptId, receipt.residentId, receipt.kind, receipt.currency, receipt.amount, receipt.businessReference, now);
            }
            this.#database
                .prepare(`INSERT INTO economy_commands (
            idempotency_key, command_type, payload_hash, journal_id, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(idempotencyKey, commandType, payloadHash, journal.journalId, resultJson, now);
            return result;
        });
    }
    #replay(existing, commandType, payloadHash) {
        if (existing.command_type !== commandType || existing.payload_hash !== payloadHash) {
            throw new EconomyError("IDEMPOTENCY_CONFLICT");
        }
        return JSON.parse(existing.result_json);
    }
    #account(residentId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_accounts WHERE resident_id = ?")
            .get(residentId);
        if (row === undefined)
            throw new EconomyError("ACCOUNT_NOT_FOUND", { residentId });
        return row;
    }
    #assertResident(residentId) {
        if (this.#database.prepare("SELECT 1 FROM residents WHERE resident_id = ?").get(residentId) ===
            undefined) {
            throw new EconomyError("RESIDENT_NOT_FOUND", { residentId });
        }
    }
    #trade(tradeId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_trades WHERE trade_id = ?")
            .get(tradeId);
        if (row === undefined)
            throw new EconomyError("TRADE_NOT_FOUND", { tradeId });
        return row;
    }
    #systemGoldReservation(reservationId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_system_gold_reservations WHERE reservation_id = ?")
            .get(reservationId);
        if (row === undefined)
            throw new EconomyError("RESERVATION_NOT_FOUND", { reservationId });
        return row;
    }
    #termDeposit(depositId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_term_deposits WHERE deposit_id = ?")
            .get(depositId);
        if (row === undefined)
            throw new EconomyError("DEPOSIT_NOT_FOUND", { depositId });
        return row;
    }
    #systemLoan(loanId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_system_loans WHERE loan_id = ?")
            .get(loanId);
        if (row === undefined)
            throw new EconomyError("LOAN_NOT_FOUND", { loanId });
        return row;
    }
    #playerLoan(loanId) {
        const row = this.#database
            .prepare("SELECT * FROM economy_player_loans WHERE loan_id = ?")
            .get(loanId);
        if (row === undefined)
            throw new EconomyError("LOAN_NOT_FOUND", { loanId });
        return row;
    }
    #changeAvailable(journal, residentId, currency, delta, now) {
        const account = this.#account(residentId);
        const previous = currency === "gold" ? account.available_gold : account.available_silver;
        const next = previous + delta;
        if (!Number.isSafeInteger(next) || next < 0) {
            throw new EconomyError("BALANCE_INSUFFICIENT", {
                residentId,
                currency,
                available: previous,
                delta,
            });
        }
        if (currency === "silver" && account.silver_agent_lock > next) {
            this.#database
                .prepare(`UPDATE economy_accounts
           SET available_silver = ?, silver_agent_lock = ?, updated_at = ?
           WHERE resident_id = ?`)
                .run(next, next, now, residentId);
            journal.lockEvents.push({
                residentId,
                previousAmount: account.silver_agent_lock,
                nextAmount: next,
                actor: "system_clamp",
            });
        }
        else {
            const column = currency === "gold" ? "available_gold" : "available_silver";
            this.#database
                .prepare(`UPDATE economy_accounts SET ${column} = ?, updated_at = ? WHERE resident_id = ?`)
                .run(next, now, residentId);
        }
        this.#residentEntry(journal, residentId, currency, "available", delta, next);
        return next;
    }
    #changeDemandGold(residentId, delta, now) {
        const previous = this.#account(residentId).demand_gold;
        const next = previous + delta;
        if (!Number.isSafeInteger(next) || next < 0) {
            throw new EconomyError("BALANCE_INSUFFICIENT", {
                partition: "demand_deposit",
                available: previous,
            });
        }
        this.#database
            .prepare("UPDATE economy_accounts SET demand_gold = ?, updated_at = ? WHERE resident_id = ?")
            .run(next, now, residentId);
        return next;
    }
    #touchDemandMinimum(residentId, date, balance) {
        this.#database
            .prepare(`INSERT INTO economy_demand_deposit_days (resident_id, beijing_date, minimum_balance)
         VALUES (?, ?, ?)
         ON CONFLICT (resident_id, beijing_date) DO UPDATE SET
           minimum_balance = MIN(minimum_balance, excluded.minimum_balance)`)
            .run(residentId, date, balance);
    }
    #rollDemandDays(residentId, currentDay, unchangedBalance) {
        const last = this.#database
            .prepare(`SELECT beijing_date
         FROM economy_demand_deposit_days
         WHERE resident_id = ?
         ORDER BY beijing_date DESC
         LIMIT 1`)
            .get(residentId);
        if (last === undefined) {
            throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                reason: "demand_history_uninitialized",
            });
        }
        const lastDay = beijingDayFromDate(last.beijing_date);
        if (currentDay < lastDay) {
            throw new EconomyError("DEPOSIT_CONTRACT_INVALID", {
                reason: "clock_moved_backwards",
                lastBeijingDate: last.beijing_date,
            });
        }
        const insert = this.#database.prepare(`INSERT INTO economy_demand_deposit_days (
        resident_id, beijing_date, minimum_balance
      ) VALUES (?, ?, ?)`);
        for (let day = lastDay + 1; day <= currentDay; day += 1) {
            insert.run(residentId, beijingDateFromDay(day), unchangedBalance);
        }
    }
    #residentEntry(journal, residentId, currency, partition, delta, balanceAfter) {
        if (delta === 0)
            return;
        journal.entries.push({
            residentId,
            systemAccount: null,
            currency,
            partition,
            delta,
            balanceAfter,
        });
    }
    #systemEntry(journal, systemAccount, currency, delta) {
        if (delta === 0)
            return;
        journal.entries.push({
            residentId: null,
            systemAccount,
            currency,
            partition: "treasury",
            delta,
            balanceAfter: null,
        });
    }
    #contractEvent(journal, contractType, contractId, eventType, payload) {
        journal.contractEvents.push({ contractType, contractId, eventType, payload });
    }
    #assertReceiptNotProvided(input) {
        if (Object.hasOwn(input, "financialReceipt") ||
            Object.hasOwn(input, "receiptId") ||
            Object.hasOwn(input, "kind")) {
            throw new EconomyError("FINANCIAL_RECEIPT_INPUT_FORBIDDEN");
        }
    }
    #financialReceipt(journal, input) {
        const receipt = Object.freeze({
            receiptId: journal.journalId,
            residentId: input.residentId,
            kind: input.kind,
            currency: input.currency,
            amount: input.amount,
            businessReference: input.businessReference,
        });
        journal.financialReceipts.push(receipt);
        return receipt;
    }
    #financialReceiptRow(row) {
        return {
            receiptId: row.receipt_id,
            residentId: row.resident_id,
            kind: row.kind,
            currency: row.currency,
            amount: row.amount,
            businessReference: row.business_reference,
        };
    }
    #assertBalanced(entries) {
        for (const currency of ["gold", "silver"]) {
            const sum = entries
                .filter((entry) => entry.currency === currency)
                .reduce((total, entry) => total + entry.delta, 0);
            if (sum !== 0)
                throw new Error(`Unbalanced ${currency} economy journal: ${sum}`);
        }
    }
    #assertSpendAllowed(residentId, currency, amount, actor, exemption, now) {
        const account = this.#account(residentId);
        const available = currency === "gold" ? account.available_gold : account.available_silver;
        if (available < amount) {
            throw new EconomyError("BALANCE_INSUFFICIENT", { currency, available, amount });
        }
        if (currency === "silver" && actor === "agent" && exemption === null) {
            const agentSpendable = account.available_silver - account.silver_agent_lock;
            if (agentSpendable < amount) {
                throw new EconomyError("SILVER_LOCKED", { agentSpendable, amount });
            }
        }
        if (account.high_spend_restricted === 0 || exemption !== null)
            return;
        const singleLimit = currency === "gold" ? RESTRICTED_GOLD_SINGLE_LIMIT : RESTRICTED_SILVER_SINGLE_LIMIT;
        if (amount > singleLimit) {
            throw new EconomyError("SPEND_LIMIT_EXCEEDED", { currency, singleLimit });
        }
        const dailyLimit = currency === "gold"
            ? this.#rules.restrictedDailyGoldLimit
            : this.#rules.restrictedDailySilverLimit;
        if (dailyLimit === null)
            throw new EconomyError("DAILY_LIMIT_NOT_CONFIGURED", { currency });
        const row = this.#database
            .prepare(`SELECT amount FROM economy_restricted_daily_spend
         WHERE resident_id = ? AND beijing_date = ? AND currency = ?`)
            .get(residentId, beijingDate(now), currency);
        if ((row?.amount ?? 0) + amount > dailyLimit) {
            throw new EconomyError("SPEND_LIMIT_EXCEEDED", {
                currency,
                dailyLimit,
                spent: row?.amount ?? 0,
            });
        }
    }
    #recordRestrictedSpend(residentId, currency, amount, exemption, now) {
        if (this.#account(residentId).high_spend_restricted === 0 || exemption !== null)
            return;
        this.#database
            .prepare(`INSERT INTO economy_restricted_daily_spend (resident_id, beijing_date, currency, amount)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (resident_id, beijing_date, currency) DO UPDATE SET amount = amount + excluded.amount`)
            .run(residentId, beijingDate(now), currency, amount);
    }
    #releaseRestrictedSpend(residentId, currency, amount, recordedAt, releasedAt) {
        if (recordedAt === null || beijingDate(recordedAt) !== beijingDate(releasedAt))
            return;
        const date = beijingDate(recordedAt);
        const changed = this.#database
            .prepare(`UPDATE economy_restricted_daily_spend
         SET amount = amount - ?
         WHERE resident_id = ? AND beijing_date = ? AND currency = ? AND amount >= ?`)
            .run(amount, residentId, date, currency, amount);
        if (changed.changes > 0)
            return;
        const existing = this.#database
            .prepare(`SELECT amount FROM economy_restricted_daily_spend
         WHERE resident_id = ? AND beijing_date = ? AND currency = ?`)
            .get(residentId, date, currency);
        if (existing !== undefined) {
            throw new EconomyError("RESTRICTED_SPEND_ACCOUNTING_CONFLICT", {
                residentId,
                currency,
                recordedAmount: existing.amount,
                releaseAmount: amount,
            });
        }
    }
    #frozenBalance(residentId, currency) {
        const trade = this.#database
            .prepare(`SELECT COALESCE(SUM(frozen_amount), 0) AS amount FROM economy_trades
         WHERE payer_resident_id = ? AND currency = ? AND state = 'frozen'`)
            .get(residentId, currency);
        if (currency !== "gold")
            return trade.amount;
        const reservation = this.#database
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS amount
         FROM economy_system_gold_reservations
         WHERE resident_id = ? AND state = 'reserved'`)
            .get(residentId);
        return trade.amount + reservation.amount;
    }
    #residentExchangeIssued(residentId, month) {
        const row = this.#database
            .prepare("SELECT silver_issued FROM economy_exchange_resident_months WHERE resident_id = ? AND beijing_month = ?")
            .get(residentId, month);
        return row?.silver_issued ?? 0;
    }
    #globalExchangeIssued(month) {
        const row = this.#database
            .prepare("SELECT silver_issued FROM economy_exchange_global_months WHERE beijing_month = ?")
            .get(month);
        return row?.silver_issued ?? 0;
    }
    #activeTermPrincipal(residentId) {
        const row = this.#database
            .prepare("SELECT COALESCE(SUM(principal), 0) AS amount FROM economy_term_deposits WHERE resident_id = ? AND state = 'active'")
            .get(residentId);
        return row.amount;
    }
    #accrueSystemLoan(journal, loan, currentDay, now) {
        const target = Math.min(currentDay, loan.due_day + 1);
        const days = Math.max(0, target - loan.accrued_through_day);
        if (days === 0 || loan.principal_outstanding === 0)
            return;
        const numerator = loan.principal_outstanding * loan.daily_rate_ppm * days + loan.interest_remainder;
        const interest = Math.floor(numerator / INTEREST_RATE_DENOMINATOR);
        const remainder = numerator % INTEREST_RATE_DENOMINATOR;
        this.#database
            .prepare(`UPDATE economy_system_loans SET
          accrued_interest = accrued_interest + ?, interest_remainder = ?, accrued_through_day = ?
         WHERE loan_id = ?`)
            .run(interest, remainder, target, loan.loan_id);
        this.#contractEvent(journal, "system_loan", loan.loan_id, "interest_accrued", {
            throughDay: target,
            days,
            interest,
            at: now,
        });
    }
    #refreshSystemLoanStatus(journal, loanId, currentDay, now) {
        const loan = this.#systemLoan(loanId);
        if (loan.status === "repaid")
            return;
        const overdueStart = loan.due_day + 1;
        let status = loan.status;
        let entered = loan.entered_restriction;
        if (currentDay >= overdueStart + GRACE_DAYS) {
            status = "restricted";
            entered = 1;
        }
        else if (currentDay >= overdueStart) {
            status = "overdue";
        }
        if (status !== loan.status || entered !== loan.entered_restriction) {
            this.#database
                .prepare("UPDATE economy_system_loans SET status = ?, entered_restriction = ? WHERE loan_id = ?")
                .run(status, entered, loanId);
            this.#contractEvent(journal, "system_loan", loanId, status, { at: now });
        }
    }
    #accruePlayerLoan(journal, loan, currentDay, now) {
        if (loan.originated_day === null || loan.accrued_through_day === null || loan.due_day === null)
            return;
        const target = Math.min(currentDay, loan.due_day + 1);
        const days = Math.max(0, target - loan.accrued_through_day);
        if (days === 0 || loan.principal_outstanding === 0)
            return;
        const denominator = INTEREST_RATE_DENOMINATOR * loan.term_days;
        const numerator = loan.principal_outstanding * loan.total_rate_ppm * days + loan.interest_remainder;
        const interest = Math.floor(numerator / denominator);
        const remainder = numerator % denominator;
        this.#database
            .prepare(`UPDATE economy_player_loans SET
          accrued_interest = accrued_interest + ?, interest_remainder = ?, accrued_through_day = ?
         WHERE loan_id = ?`)
            .run(interest, remainder, target, loan.loan_id);
        this.#contractEvent(journal, "player_loan", loan.loan_id, "interest_accrued", {
            throughDay: target,
            days,
            interest,
            at: now,
        });
    }
    #refreshPlayerLoanStatus(journal, loanId, currentDay, now) {
        const loan = this.#playerLoan(loanId);
        if (loan.due_day === null || loan.status === "repaid" || loan.status === "cancelled")
            return;
        const overdueStart = loan.due_day + 1;
        let status = loan.status;
        let entered = loan.entered_restriction;
        if (currentDay >= overdueStart + GRACE_DAYS) {
            status = "restricted";
            entered = 1;
        }
        else if (currentDay >= overdueStart) {
            status = "overdue";
        }
        if (status !== loan.status || entered !== loan.entered_restriction) {
            this.#database
                .prepare("UPDATE economy_player_loans SET status = ?, entered_restriction = ? WHERE loan_id = ?")
                .run(status, entered, loanId);
            this.#contractEvent(journal, "player_loan", loanId, status, { at: now });
        }
    }
    #syncRestriction(residentId, now) {
        const systemRestricted = this.#database
            .prepare("SELECT 1 FROM economy_system_loans WHERE borrower_resident_id = ? AND status = 'restricted' LIMIT 1")
            .get(residentId);
        const playerRestricted = this.#database
            .prepare("SELECT 1 FROM economy_player_loans WHERE borrower_resident_id = ? AND status = 'restricted' LIMIT 1")
            .get(residentId);
        this.#database
            .prepare("UPDATE economy_accounts SET high_spend_restricted = ?, updated_at = ? WHERE resident_id = ?")
            .run(systemRestricted !== undefined || playerRestricted !== undefined ? 1 : 0, now, residentId);
    }
}
