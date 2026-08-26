import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { EconomyError } from "../dist/economy/economy-errors.js";
import { ECONOMY_SCHEMA_VERSION, installEconomySchema } from "../dist/economy/economy-schema.js";
import { EconomyService } from "../dist/economy/economy-service.js";
const START = Date.parse("2026-01-01T00:00:00+08:00");
const DAY = 86_400_000;
function createHarness(rules = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 150_000,
    restrictedDailySilverLimit: 300,
}) {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`
    CREATE TABLE residents (
      resident_id TEXT PRIMARY KEY,
      resident_name TEXT NOT NULL
    );
    INSERT INTO residents (resident_id, resident_name) VALUES
      ('resident-a', 'A'),
      ('resident-b', 'B'),
      ('resident-c', 'C');
  `);
    installEconomySchema(database);
    let now = START;
    let nextId = 0;
    const service = new EconomyService(database, {
        rules,
        now: () => now,
        generateId: () => `generated-${++nextId}`,
    });
    return {
        database,
        service,
        setNow(value) {
            now = value;
        },
    };
}
function importAccount(service, residentId, gold, silver) {
    service.importLegacyBalances({
        residentId,
        gold,
        silver,
        migrationId: `migration-${residentId}`,
        idempotencyKey: `import-${residentId}`,
    });
}
function expectEconomyError(code, run) {
    assert.throws(run, (error) => error instanceof EconomyError && error.code === code);
}
test("economy schema upgrades an unintegrated v1 database before receipt commands are used", () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`
      CREATE TABLE residents (resident_id TEXT PRIMARY KEY);
      CREATE TABLE economy_journals (journal_id TEXT PRIMARY KEY);
      CREATE TABLE economy_trades (state TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE economy_schema_meta (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        schema_version INTEGER NOT NULL CHECK (schema_version = 1)
      );
      INSERT INTO economy_schema_meta (singleton_id, schema_version) VALUES (1, 1);
    `);
    installEconomySchema(database);
    assert.equal(database
        .prepare("SELECT schema_version FROM economy_schema_meta WHERE singleton_id = 1")
        .get().schema_version, 3);
    assert.deepEqual(database
        .prepare(`SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN (
            'economy_system_gold_reservations',
            'economy_financial_receipts'
          ) ORDER BY name`)
        .all()
        .map((row) => row.name), [
        "economy_financial_receipts",
        "economy_system_gold_reservations",
    ]);
});
test("economy schema and legacy import create one immutable balanced authority with strict idempotency", () => {
    const { database, service } = createHarness();
    assert.equal(database
        .prepare("SELECT schema_version FROM economy_schema_meta WHERE singleton_id = 1")
        .get().schema_version, ECONOMY_SCHEMA_VERSION);
    installEconomySchema(database);
    const first = service.importLegacyBalances({
        residentId: "resident-a",
        gold: 1_000,
        silver: 50,
        migrationId: "migration-a",
        idempotencyKey: "import-a",
    });
    const replay = service.importLegacyBalances({
        residentId: "resident-a",
        gold: 1_000,
        silver: 50,
        migrationId: "migration-a",
        idempotencyKey: "import-a",
    });
    assert.deepEqual(replay, first);
    assert.equal(first.availableGold, 1_000);
    assert.equal(first.availableSilver, 50);
    database.exec(`CREATE TABLE career_financial_probe (
      receipt_id TEXT PRIMARY KEY REFERENCES economy_financial_receipts(receipt_id) ON DELETE RESTRICT,
      career_write TEXT NOT NULL
    )`);
    database.exec("BEGIN IMMEDIATE");
    const outerCredit = service.creditFromSystem({
        residentId: "resident-a",
        currency: "gold",
        amount: 100,
        businessType: "outer_transaction_probe",
        businessRef: "outer-transaction-probe",
        idempotencyKey: "outer-transaction-probe",
    });
    database
        .prepare("INSERT INTO career_financial_probe (receipt_id, career_write) VALUES (?, ?)")
        .run(outerCredit.financialReceipt.receiptId, "career-write");
    assert.equal(service.getAccount("resident-a").availableGold, 1_100);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM career_financial_probe").get().total, 1);
    database.exec("ROLLBACK");
    assert.equal(service.getAccount("resident-a").availableGold, 1_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM career_financial_probe").get().total, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM economy_financial_receipts").get().total, 0);
    expectEconomyError("IDEMPOTENCY_CONFLICT", () => service.importLegacyBalances({
        residentId: "resident-a",
        gold: 2_000,
        silver: 50,
        migrationId: "migration-a",
        idempotencyKey: "import-a",
    }));
    assert.equal(database
        .prepare(`SELECT currency, SUM(delta) AS total
           FROM economy_ledger_entries GROUP BY currency HAVING total != 0`)
        .all().length, 0);
    assert.throws(() => database.prepare("UPDATE economy_journals SET business_ref = 'tampered'").run());
});
test("system gold commands expose journal-backed receipts and reservations settle or release atomically", () => {
    const { database, service } = createHarness();
    importAccount(service, "resident-a", 2_000, 0);
    const charged = service.chargeToSystem({
        residentId: "resident-a",
        currency: "gold",
        amount: 100,
        actor: "human",
        businessType: "career_tuition",
        businessRef: "career-tuition:resident-a:course-1",
        idempotencyKey: "career-tuition-charge",
    });
    const chargeReplay = service.chargeToSystem({
        residentId: "resident-a",
        currency: "gold",
        amount: 100,
        actor: "human",
        businessType: "career_tuition",
        businessRef: "career-tuition:resident-a:course-1",
        idempotencyKey: "career-tuition-charge",
    });
    assert.deepEqual(chargeReplay.financialReceipt, charged.financialReceipt);
    assert.deepEqual(charged.financialReceipt, {
        receiptId: charged.financialReceipt.receiptId,
        residentId: "resident-a",
        kind: "system_gold_charge",
        currency: "gold",
        amount: 100,
        businessReference: "career-tuition:resident-a:course-1",
    });
    assert.equal(database
        .prepare("SELECT journal_id FROM economy_commands WHERE idempotency_key = ?")
        .get("career-tuition-charge").journal_id, charged.financialReceipt.receiptId);
    assert.deepEqual(service.getFinancialReceipt(charged.financialReceipt.receiptId), charged.financialReceipt);
    expectEconomyError("FINANCIAL_RECEIPT_INPUT_FORBIDDEN", () => service.creditFromSystem({
        residentId: "resident-a",
        currency: "gold",
        amount: 1,
        businessType: "career_wage",
        businessRef: "career-wage:forged",
        idempotencyKey: "career-wage-forged",
        financialReceipt: {
            receiptId: "forged",
            kind: "system_gold_credit",
        },
    }));
    const credited = service.creditFromSystem({
        residentId: "resident-a",
        currency: "gold",
        amount: 50,
        businessType: "career_wage",
        businessRef: "career-wage:resident-a:day-1",
        idempotencyKey: "career-wage-credit",
    });
    assert.equal(credited.financialReceipt.kind, "system_gold_credit");
    const reserved = service.reserveSystemGold({
        residentId: "resident-a",
        amount: 400,
        actor: "human",
        businessReference: "career-exam:resident-a:exam-1:reserve",
        idempotencyKey: "career-exam-reserve",
    });
    const reserveReplay = service.reserveSystemGold({
        residentId: "resident-a",
        amount: 400,
        actor: "human",
        businessReference: "career-exam:resident-a:exam-1:reserve",
        idempotencyKey: "career-exam-reserve",
    });
    assert.deepEqual(reserveReplay.financialReceipt, reserved.financialReceipt);
    assert.equal(reserved.state, "reserved");
    assert.equal(reserved.account.frozenGold, 400);
    assert.equal(reserved.financialReceipt.kind, "system_gold_reserve");
    assert.equal(reserved.financialReceipt.reservationId, reserved.reservation_id);
    assert.equal(reserved.financialReceipt.reserveReceiptId, reserved.financialReceipt.receiptId);
    const settled = service.settleSystemGoldReservation({
        reservationId: reserved.reservation_id,
        businessReference: "career-exam:resident-a:exam-1:settle",
        idempotencyKey: "career-exam-settle",
    });
    const settleReplay = service.settleSystemGoldReservation({
        reservationId: reserved.reservation_id,
        businessReference: "career-exam:resident-a:exam-1:settle",
        idempotencyKey: "career-exam-settle",
    });
    assert.deepEqual(settleReplay.financialReceipt, settled.financialReceipt);
    assert.equal(settled.state, "settled");
    assert.equal(settled.account.frozenGold, 0);
    assert.equal(settled.financialReceipt.kind, "system_gold_settle");
    assert.equal(settled.financialReceipt.reservationId, reserved.reservation_id);
    assert.equal(settled.financialReceipt.reserveReceiptId, reserved.financialReceipt.receiptId);
    assert.deepEqual(service.getFinancialReceipt(settled.financialReceipt.receiptId), settled.financialReceipt);
    const releasable = service.reserveSystemGold({
        residentId: "resident-a",
        amount: 200,
        actor: "human",
        businessReference: "career-exam:resident-a:exam-2:reserve",
        idempotencyKey: "career-exam-2-reserve",
    });
    const released = service.releaseSystemGoldReservation({
        reservationId: releasable.reservation_id,
        businessReference: "career-exam:resident-a:exam-2:release",
        idempotencyKey: "career-exam-2-release",
    });
    assert.equal(released.state, "released");
    assert.equal(released.account.frozenGold, 0);
    assert.equal(released.financialReceipt.kind, "system_gold_release");
    assert.equal(released.financialReceipt.reservationId, releasable.reservation_id);
    assert.equal(released.financialReceipt.reserveReceiptId, releasable.financialReceipt.receiptId);
    assert.equal(released.account.availableGold, 1_550);
    assert.throws(() => database
        .prepare("UPDATE economy_financial_receipts SET amount = 999 WHERE receipt_id = ?")
        .run(charged.financialReceipt.receiptId));
});
test("reservation replay hydrates legacy receipt JSON from the authoritative database", () => {
    const { database, service } = createHarness();
    importAccount(service, "resident-a", 2_000, 0);
    const reserved = service.reserveSystemGold({
        residentId: "resident-a",
        amount: 400,
        actor: "human",
        businessReference: "career-exam:resident-a:legacy-replay:reserve",
        idempotencyKey: "career-exam-legacy-replay-reserve",
    });
    const command = database
        .prepare("SELECT result_json FROM economy_commands WHERE idempotency_key = ?")
        .get("career-exam-legacy-replay-reserve");
    const legacyResult = JSON.parse(command.result_json);
    delete legacyResult.financialReceipt.reservationId;
    delete legacyResult.financialReceipt.reserveReceiptId;
    database
        .prepare("UPDATE economy_commands SET result_json = ? WHERE idempotency_key = ?")
        .run(JSON.stringify(legacyResult), "career-exam-legacy-replay-reserve");
    const replay = service.reserveSystemGold({
        residentId: "resident-a",
        amount: 400,
        actor: "human",
        businessReference: "career-exam:resident-a:legacy-replay:reserve",
        idempotencyKey: "career-exam-legacy-replay-reserve",
    });
    assert.equal(replay.financialReceipt.reservationId, reserved.reservation_id);
    assert.equal(replay.financialReceipt.reserveReceiptId, reserved.financialReceipt.receiptId);
    assert.deepEqual(replay.financialReceipt, service.getFinancialReceipt(reserved.financialReceipt.receiptId));
    assert.equal(JSON.parse(database
        .prepare("SELECT result_json FROM economy_commands WHERE idempotency_key = ?")
        .get("career-exam-legacy-replay-reserve").result_json).financialReceipt.reservationId, undefined);
});
test("same-day hold cancellation restores restricted daily capacity while cross-day history and settlements remain", () => {
    const { database, service, setNow } = createHarness();
    for (const residentId of ["resident-a", "resident-b", "resident-c"]) {
        importAccount(service, residentId, 600_000, 1_000);
        database
            .prepare("UPDATE economy_accounts SET high_spend_restricted = 1 WHERE resident_id = ?")
            .run(residentId);
    }
    const restrictedAmount = (residentId, date, currency) => database
        .prepare(`SELECT amount FROM economy_restricted_daily_spend
          WHERE resident_id = ? AND beijing_date = ? AND currency = ?`)
        .get(residentId, date, currency)?.amount ?? 0;
    const reserve = (residentId, suffix) => service.reserveSystemGold({
        residentId,
        amount: 100_000,
        actor: "human",
        businessReference: `restricted-reserve:${residentId}:${suffix}`,
        idempotencyKey: `restricted-reserve:${residentId}:${suffix}`,
    });
    const freezeTrade = (payerResidentId, suffix) => {
        const trade = service.createTrade({
            payerResidentId,
            payeeResidentId: "resident-b",
            currency: "silver",
            amount: 200,
            businessType: "restricted_trade_probe",
            businessRef: `restricted-trade:${payerResidentId}:${suffix}`,
            idempotencyKey: `restricted-trade-create:${payerResidentId}:${suffix}`,
        });
        service.confirmTrade({
            tradeId: trade.trade_id,
            actorResidentId: "resident-b",
            idempotencyKey: `restricted-trade-payee:${payerResidentId}:${suffix}`,
        });
        service.confirmTrade({
            tradeId: trade.trade_id,
            actorResidentId: payerResidentId,
            idempotencyKey: `restricted-trade-payer:${payerResidentId}:${suffix}`,
        });
        return trade;
    };
    const sameDayReservation = reserve("resident-a", "same-day-release");
    service.releaseSystemGoldReservation({
        reservationId: sameDayReservation.reservation_id,
        businessReference: "restricted-reserve:resident-a:same-day-release:release",
        idempotencyKey: "restricted-reserve:resident-a:same-day-release:release",
    });
    assert.equal(restrictedAmount("resident-a", "2026-01-01", "gold"), 0);
    assert.equal(reserve("resident-a", "after-release").state, "reserved");
    const settledReservation = reserve("resident-b", "settled");
    service.settleSystemGoldReservation({
        reservationId: settledReservation.reservation_id,
        businessReference: "restricted-reserve:resident-b:settled:settle",
        idempotencyKey: "restricted-reserve:resident-b:settled:settle",
    });
    assert.equal(restrictedAmount("resident-b", "2026-01-01", "gold"), 100_000);
    expectEconomyError("SPEND_LIMIT_EXCEEDED", () => reserve("resident-b", "after-settle"));
    const sameDayTrade = freezeTrade("resident-a", "same-day-cancel");
    service.cancelTrade({
        tradeId: sameDayTrade.trade_id,
        idempotencyKey: "restricted-trade-cancel:resident-a:same-day",
    });
    assert.equal(restrictedAmount("resident-a", "2026-01-01", "silver"), 0);
    assert.equal(service.getAccount("resident-a").frozenSilver, 0);
    freezeTrade("resident-a", "after-cancel");
    assert.equal(service.getAccount("resident-a").frozenSilver, 200);
    const crossDayReservation = reserve("resident-c", "cross-day-release");
    const crossDayTrade = freezeTrade("resident-c", "cross-day-cancel");
    setNow(START + DAY);
    service.releaseSystemGoldReservation({
        reservationId: crossDayReservation.reservation_id,
        businessReference: "restricted-reserve:resident-c:cross-day-release:release",
        idempotencyKey: "restricted-reserve:resident-c:cross-day-release:release",
    });
    service.cancelTrade({
        tradeId: crossDayTrade.trade_id,
        idempotencyKey: "restricted-trade-cancel:resident-c:cross-day",
    });
    assert.equal(restrictedAmount("resident-c", "2026-01-01", "gold"), 100_000);
    assert.equal(restrictedAmount("resident-c", "2026-01-01", "silver"), 200);
    assert.equal(restrictedAmount("resident-c", "2026-01-02", "gold"), 0);
    assert.equal(restrictedAmount("resident-c", "2026-01-02", "silver"), 0);
    assert.equal(reserve("resident-c", "new-day-settle").state, "reserved");
    const settledTrade = freezeTrade("resident-c", "new-day-settle");
    service.settleTrade({
        tradeId: settledTrade.trade_id,
        idempotencyKey: "restricted-trade-settle:resident-c:new-day",
    });
    assert.equal(restrictedAmount("resident-c", "2026-01-02", "silver"), 200);
    expectEconomyError("SPEND_LIMIT_EXCEEDED", () => freezeTrade("resident-c", "after-settle"));
});
test("silver lock, demand deposits and negotiated term deposits preserve distinct authority rules", () => {
    const { service, setNow } = createHarness();
    importAccount(service, "resident-a", 3_000_000, 1_000);
    service.setSilverAgentLock({
        residentId: "resident-a",
        amount: 800,
        actor: "human",
        idempotencyKey: "lock-800",
    });
    expectEconomyError("SILVER_LOCKED", () => service.chargeToSystem({
        residentId: "resident-a",
        currency: "silver",
        amount: 201,
        actor: "agent",
        businessType: "optional_shop",
        businessRef: "shop-1",
        idempotencyKey: "agent-over-lock",
    }));
    const humanSpend = service.chargeToSystem({
        residentId: "resident-a",
        currency: "silver",
        amount: 300,
        actor: "human",
        businessType: "human_purchase",
        businessRef: "human-1",
        idempotencyKey: "human-spend",
    });
    assert.equal(humanSpend.availableSilver, 700);
    assert.equal(humanSpend.silverAgentLock, 700);
    service.depositDemandGold({
        residentId: "resident-a",
        amount: 1_000_000,
        idempotencyKey: "demand-in",
    });
    setNow(START + 3 * DAY + 5 * 60_000);
    service.withdrawDemandGold({
        residentId: "resident-a",
        amount: 500_000,
        idempotencyKey: "demand-out-after-downtime",
    });
    expectEconomyError("DEPOSIT_CONTRACT_INVALID", () => service.accrueDemandInterest({
        residentId: "resident-a",
        beijingDate: "2025-12-31",
        idempotencyKey: "demand-before-history",
    }));
    const firstInterest = service.accrueDemandInterest({
        residentId: "resident-a",
        beijingDate: "2026-01-01",
        idempotencyKey: "demand-interest-2026-01-01",
    });
    assert.equal(firstInterest.interest, 0);
    expectEconomyError("DEPOSIT_CONTRACT_INVALID", () => service.accrueDemandInterest({
        residentId: "resident-a",
        beijingDate: "2026-01-03",
        idempotencyKey: "demand-skip-2026-01-02",
    }));
    const secondInterest = service.accrueDemandInterest({
        residentId: "resident-a",
        beijingDate: "2026-01-02",
        idempotencyKey: "demand-interest-2026-01-02",
    });
    const thirdInterest = service.accrueDemandInterest({
        residentId: "resident-a",
        beijingDate: "2026-01-03",
        idempotencyKey: "demand-interest-2026-01-03",
    });
    assert.equal(secondInterest.interest, 100);
    assert.equal(thirdInterest.interest, 100);
    assert.equal(thirdInterest.account.demandGold, 500_000);
    assert.equal(thirdInterest.account.availableGold, 2_500_200);
    const term = service.openTermDeposit({
        residentId: "resident-a",
        principal: 1_000_000,
        termDays: 14,
        totalRatePpm: 2_500,
        idempotencyKey: "term-open",
    });
    const early = service.closeTermDeposit({
        depositId: term.deposit_id,
        idempotencyKey: "term-early",
    });
    assert.equal(early.state, "terminated");
    assert.equal(early.interest_paid, 0);
    const matureTerm = service.openTermDeposit({
        residentId: "resident-a",
        principal: 1_000_000,
        termDays: 14,
        totalRatePpm: 2_000,
        idempotencyKey: "term-open-mature",
    });
    setNow(START + 18 * DAY);
    const matured = service.closeTermDeposit({
        depositId: matureTerm.deposit_id,
        idempotencyKey: "term-mature",
    });
    assert.equal(matured.state, "matured");
    assert.equal(matured.interest_paid, 2_000);
});
test("gold-to-silver exchange applies cumulative monthly brackets and hard resident caps", () => {
    const { service } = createHarness();
    importAccount(service, "resident-a", 1_000_000, 0);
    const first = service.exchangeGoldForSilver({
        residentId: "resident-a",
        goldPrincipal: 150_000,
        idempotencyKey: "exchange-300",
    });
    assert.equal(first.preview.silverReceived, 300);
    assert.equal(first.preview.goldFee, 7_500);
    const second = service.exchangeGoldForSilver({
        residentId: "resident-a",
        goldPrincipal: 200_000,
        idempotencyKey: "exchange-400",
    });
    assert.equal(second.preview.goldFee, 20_000);
    const third = service.exchangeGoldForSilver({
        residentId: "resident-a",
        goldPrincipal: 150_000,
        idempotencyKey: "exchange-300-last",
    });
    assert.equal(third.preview.goldFee, 30_000);
    assert.equal(third.account.availableSilver, 1_000);
    assert.equal(third.account.availableGold, 442_500);
    expectEconomyError("EXCHANGE_LIMIT_EXCEEDED", () => service.exchangeGoldForSilver({
        residentId: "resident-a",
        goldPrincipal: 500,
        idempotencyKey: "exchange-over-cap",
    }));
});
test("real-player trades freeze, settle, cancel and refund without duplicate money", () => {
    const { database, service } = createHarness();
    importAccount(service, "resident-a", 0, 1_000);
    importAccount(service, "resident-b", 0, 20);
    service.setSilverAgentLock({
        residentId: "resident-a",
        amount: 800,
        actor: "human",
        idempotencyKey: "trade-lock",
    });
    const trade = service.createTrade({
        payerResidentId: "resident-a",
        payeeResidentId: "resident-b",
        currency: "silver",
        amount: 200,
        businessType: "player_service",
        businessRef: "service-1",
        idempotencyKey: "trade-create",
    });
    service.confirmTrade({
        tradeId: trade.trade_id,
        actorResidentId: "resident-b",
        idempotencyKey: "trade-payee",
    });
    const frozen = service.confirmTrade({
        tradeId: trade.trade_id,
        actorResidentId: "resident-a",
        idempotencyKey: "trade-payer",
    });
    assert.equal(frozen.state, "frozen");
    assert.equal(service.getAccount("resident-a").frozenSilver, 200);
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmTrade({
        actorResidentId: "resident-c",
        tradeId: trade.trade_id,
        idempotencyKey: "third-party-trade-frozen",
    }));
    const settled = service.settleTrade({ tradeId: trade.trade_id, idempotencyKey: "trade-settle" });
    assert.equal(settled.state, "settled");
    assert.deepEqual(settled.financialReceipt, {
        receiptId: settled.financialReceipt.receiptId,
        residentId: "resident-b",
        kind: "player_silver_settle",
        currency: "silver",
        amount: 200,
        businessReference: "service-1",
    });
    assert.deepEqual(service.settleTrade({
        tradeId: trade.trade_id,
        idempotencyKey: "trade-settle",
    }).financialReceipt, settled.financialReceipt);
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmTrade({
        actorResidentId: "resident-c",
        tradeId: trade.trade_id,
        idempotencyKey: "third-party-trade-settled",
    }));
    assert.equal(service.getAccount("resident-b").availableSilver, 220);
    const refunded = service.refundTrade({
        tradeId: trade.trade_id,
        amount: 50,
        idempotencyKey: "trade-refund-50",
    });
    assert.equal(refunded.refunded_amount, 50);
    assert.equal(service.getAccount("resident-a").availableSilver, 850);
    const cancelledTrade = service.createTrade({
        payerResidentId: "resident-b",
        payeeResidentId: "resident-a",
        currency: "silver",
        amount: 10,
        businessType: "player_item",
        businessRef: "item-1",
        idempotencyKey: "trade-cancel-create",
    });
    service.confirmTrade({
        tradeId: cancelledTrade.trade_id,
        actorResidentId: "resident-a",
        idempotencyKey: "trade-cancel-payee",
    });
    service.confirmTrade({
        tradeId: cancelledTrade.trade_id,
        actorResidentId: "resident-b",
        idempotencyKey: "trade-cancel-payer",
    });
    const beforeCancel = service.getAccount("resident-b").availableSilver;
    const cancelled = service.cancelTrade({
        tradeId: cancelledTrade.trade_id,
        idempotencyKey: "trade-cancel",
    });
    assert.equal(cancelled.state, "cancelled");
    assert.equal(service.getAccount("resident-b").availableSilver, beforeCancel + 10);
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmTrade({
        actorResidentId: "resident-c",
        tradeId: cancelledTrade.trade_id,
        idempotencyKey: "third-party-trade-cancelled",
    }));
    assert.equal(database
        .prepare(`SELECT COUNT(*) AS count FROM economy_commands
          WHERE idempotency_key IN (
            'third-party-trade-frozen',
            'third-party-trade-settled',
            'third-party-trade-cancelled'
          )`)
        .get().count, 0);
});
test("system loans freeze interest at maturity, enforce grace restrictions and cannot farm credit instantly", () => {
    const { service, setNow } = createHarness();
    importAccount(service, "resident-a", 10_000, 0);
    const loan = service.openSystemLoan({
        borrowerResidentId: "resident-a",
        principal: 100_000,
        termDays: 14,
        idempotencyKey: "system-loan-open",
    });
    setNow(START + 14 * DAY);
    service.refreshDebtStatus({ residentId: "resident-a", idempotencyKey: "refresh-overdue" });
    setNow(START + 17 * DAY);
    const restricted = service.refreshDebtStatus({
        residentId: "resident-a",
        idempotencyKey: "refresh-restricted",
    });
    assert.equal(restricted.highSpendRestricted, true);
    expectEconomyError("EXCHANGE_RESTRICTED", () => service.exchangeGoldForSilver({
        residentId: "resident-a",
        goldPrincipal: 500,
        idempotencyKey: "restricted-exchange",
    }));
    const repaid = service.repaySystemLoan({
        loanId: loan.loan_id,
        amount: 101_400,
        idempotencyKey: "system-loan-repay",
    });
    assert.equal(repaid.status, "repaid");
    assert.equal(service.getAccount("resident-a").highSpendRestricted, false);
    assert.equal(service.getAccount("resident-a").creditPoints, 0);
    importAccount(service, "resident-b", 5_000, 0);
    setNow(START);
    const goodLoan = service.openSystemLoan({
        borrowerResidentId: "resident-b",
        principal: 100_000,
        termDays: 14,
        idempotencyKey: "good-loan-open",
    });
    setNow(START + 5 * DAY);
    service.repaySystemLoan({
        loanId: goodLoan.loan_id,
        amount: 100_500,
        idempotencyKey: "good-loan-repay",
    });
    assert.equal(service.getAccount("resident-b").creditPoints, 1);
});
test("unsupported deposit and system-loan terms fail before any command or balance mutation", () => {
    const { database, service } = createHarness();
    importAccount(service, "resident-a", 2_000_000, 0);
    const before = service.getAccount("resident-a");
    const countsBefore = database
        .prepare(`SELECT
          (SELECT COUNT(*) FROM economy_commands) AS commands,
          (SELECT COUNT(*) FROM economy_journals) AS journals`)
        .get();
    expectEconomyError("DEPOSIT_CONTRACT_INVALID", () => service.openTermDeposit({
        idempotencyKey: "invalid-term-deposit",
        principal: 1_000_000,
        residentId: "resident-a",
        termDays: 15,
        totalRatePpm: 2_000,
    }));
    expectEconomyError("LOAN_CONTRACT_INVALID", () => service.openSystemLoan({
        borrowerResidentId: "resident-a",
        idempotencyKey: "invalid-system-loan-term",
        principal: 100_000,
        termDays: 15,
    }));
    assert.deepEqual(service.getAccount("resident-a"), before);
    assert.deepEqual({ ...database
        .prepare(`SELECT
          (SELECT COUNT(*) FROM economy_commands) AS commands,
          (SELECT COUNT(*) FROM economy_journals) AS journals`)
        .get() }, { ...countsBefore });
});
test("player loans require both real parties, transfer existing silver and repay accrued interest", () => {
    const { service, setNow } = createHarness();
    importAccount(service, "resident-a", 0, 1_000);
    importAccount(service, "resident-b", 0, 5);
    const loan = service.proposePlayerLoan({
        actorResidentId: "resident-a",
        lenderResidentId: "resident-a",
        borrowerResidentId: "resident-b",
        principal: 100,
        termDays: 10,
        totalRatePpm: 100_000,
        idempotencyKey: "player-loan-propose",
    });
    service.confirmPlayerLoan({
        actorResidentId: "resident-b",
        loanId: loan.loan_id,
        idempotencyKey: "player-loan-borrower",
    });
    const active = service.confirmPlayerLoan({
        actorResidentId: "resident-a",
        loanId: loan.loan_id,
        idempotencyKey: "player-loan-lender",
    });
    assert.equal(active.status, "active");
    assert.equal(service.getAccount("resident-a").availableSilver, 900);
    assert.equal(service.getAccount("resident-b").availableSilver, 105);
    setNow(START + 5 * DAY);
    const repaid = service.repayPlayerLoan({
        actorResidentId: "resident-b",
        loanId: loan.loan_id,
        amount: 105,
        idempotencyKey: "player-loan-repay",
    });
    assert.equal(repaid.status, "repaid");
    assert.equal(service.getAccount("resident-a").availableSilver, 1_005);
    assert.equal(service.getAccount("resident-b").availableSilver, 0);
    importAccount(service, "resident-c", 0, 0);
    const cancelledProposal = service.proposePlayerLoan({
        actorResidentId: "resident-a",
        lenderResidentId: "resident-a",
        borrowerResidentId: "resident-c",
        principal: 10,
        termDays: 1,
        totalRatePpm: 0,
        idempotencyKey: "cancelled-loan-propose",
    });
    assert.equal(service.cancelPlayerLoan({
        actorResidentId: "resident-c",
        loanId: cancelledProposal.loan_id,
        idempotencyKey: "cancelled-loan-cancel",
    }).status, "cancelled");
});
test("player-loan authorization precedes proposal mutation and every replay state", () => {
    const { service } = createHarness();
    importAccount(service, "resident-a", 0, 1_000);
    importAccount(service, "resident-b", 0, 0);
    importAccount(service, "resident-c", 0, 0);
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.proposePlayerLoan({
        actorResidentId: "resident-c",
        borrowerResidentId: "resident-b",
        idempotencyKey: "unauthorized-proposal",
        lenderResidentId: "resident-a",
        principal: 100,
        termDays: 1,
        totalRatePpm: 0,
    }));
    const loan = service.proposePlayerLoan({
        actorResidentId: "resident-a",
        borrowerResidentId: "resident-b",
        idempotencyKey: "authorized-proposal",
        lenderResidentId: "resident-a",
        principal: 100,
        termDays: 1,
        totalRatePpm: 0,
    });
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmPlayerLoan({
        actorResidentId: "resident-c",
        idempotencyKey: "third-party-confirm-proposed",
        loanId: loan.loan_id,
    }));
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.cancelPlayerLoan({
        actorResidentId: "resident-c",
        idempotencyKey: "third-party-cancel-proposed",
        loanId: loan.loan_id,
    }));
    service.confirmPlayerLoan({
        actorResidentId: "resident-a",
        idempotencyKey: "authorized-lender-confirm",
        loanId: loan.loan_id,
    });
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmPlayerLoan({
        actorResidentId: "resident-c",
        idempotencyKey: "authorized-lender-confirm",
        loanId: loan.loan_id,
    }));
    service.confirmPlayerLoan({
        actorResidentId: "resident-b",
        idempotencyKey: "authorized-borrower-confirm",
        loanId: loan.loan_id,
    });
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmPlayerLoan({
        actorResidentId: "resident-c",
        idempotencyKey: "third-party-confirm-active",
        loanId: loan.loan_id,
    }));
    service.repayPlayerLoan({
        actorResidentId: "resident-b",
        amount: 100,
        idempotencyKey: "authorized-repayment",
        loanId: loan.loan_id,
    });
    expectEconomyError("UNAUTHORIZED_PARTY", () => service.confirmPlayerLoan({
        actorResidentId: "resident-c",
        idempotencyKey: "third-party-confirm-repaid",
        loanId: loan.loan_id,
    }));
});
test("unconfirmed credit and daily restriction values fail closed instead of becoming hidden defaults", () => {
    const { service, setNow } = createHarness({
        minimumSystemLoanCreditDays: null,
        restrictedDailyGoldLimit: null,
        restrictedDailySilverLimit: null,
    });
    importAccount(service, "resident-a", 1_000_000, 1_000);
    expectEconomyError("CREDIT_RULE_NOT_CONFIGURED", () => service.openSystemLoan({
        borrowerResidentId: "resident-a",
        principal: 100_000,
        termDays: 14,
        idempotencyKey: "unconfigured-loan",
    }));
    importAccount(service, "resident-b", 0, 0);
    const playerLoan = service.proposePlayerLoan({
        actorResidentId: "resident-a",
        lenderResidentId: "resident-a",
        borrowerResidentId: "resident-b",
        principal: 100,
        termDays: 1,
        totalRatePpm: 0,
        idempotencyKey: "unconfigured-player-loan",
    });
    service.confirmPlayerLoan({
        actorResidentId: "resident-a",
        loanId: playerLoan.loan_id,
        idempotencyKey: "unconfigured-player-loan-lender",
    });
    service.confirmPlayerLoan({
        actorResidentId: "resident-b",
        loanId: playerLoan.loan_id,
        idempotencyKey: "unconfigured-player-loan-borrower",
    });
    setNow(START + 4 * DAY);
    assert.equal(service.refreshDebtStatus({
        residentId: "resident-b",
        idempotencyKey: "unconfigured-refresh-restriction",
    }).highSpendRestricted, true);
    expectEconomyError("DAILY_LIMIT_NOT_CONFIGURED", () => service.chargeToSystem({
        residentId: "resident-b",
        currency: "silver",
        amount: 1,
        actor: "agent",
        businessType: "optional_shop",
        businessRef: "restricted-shop",
        idempotencyKey: "unconfigured-daily-limit",
    }));
});
