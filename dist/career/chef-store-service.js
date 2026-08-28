import { createHash, randomUUID } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";

export const CHEF_STORE_GRADES = Object.freeze(["high", "special"]);
export const CHEF_STORE_DEPOSIT_GOLD = 500_000;
export const CHEF_STORE_RENT_GOLD = 100_000;
export const CHEF_STORE_RENT_PERIOD_DAYS = 14;
export const CHEF_STORE_OPENING_GOLD = CHEF_STORE_DEPOSIT_GOLD + CHEF_STORE_RENT_GOLD;
export const CHEF_STORE_RENT_GRACE_DAYS = 3;
export const CHEF_STORE_RENT_TERMINATION_DAYS = 7;
export const CHEF_STORE_DAY_MS = 24 * 60 * 60 * 1_000;

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("chef_store_database_required");
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`chef_store_invalid_${field}`);
    return value;
}

function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        fail(`chef_store_invalid_${field}`);
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`chef_store_invalid_${field}`);
    return value;
}

function nowOf(service) {
    return timestamp(service.now(), "timestamp");
}

function canonical(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("chef_store_invalid_payload");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((item) => canonical(item)).join(",")}]`;
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("chef_store_invalid_payload");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("chef_store_invalid_payload");
}

function canonicalJson(value) {
    return canonical(value);
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson(value, code = "chef_store_corrupt_json") {
    try {
        return JSON.parse(value);
    }
    catch {
        fail(code);
    }
}

function normalizeGrade(value) {
    if (!CHEF_STORE_GRADES.includes(value))
        fail("chef_store_grade_forbidden");
    return value;
}

function callbackReceipt(value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.ok === false)
        fail(`chef_store_${field}_rejected`);
    const receiptId = identifier(
        value[`${field}ReceiptId`] ?? value.inventoryReceiptId ?? value.orderReceiptId ?? value.receiptId,
        `${field}_receipt_id`,
    );
    const paymentReceiptId = value.paymentReceiptId === undefined || value.paymentReceiptId === null
        ? null
        : identifier(value.paymentReceiptId, "payment_receipt_id");
    return { receiptId, paymentReceiptId };
}

function mapLease(row) {
    return {
        leaseId: row.lease_id,
        ownerResidentId: row.owner_resident_id,
        grade: row.grade,
        depositGold: row.deposit_gold,
        rentGold: row.rent_gold,
        rentPeriodDays: row.rent_period_days,
        depositRemainingGold: row.deposit_remaining_gold,
        arrearsGold: row.arrears_gold,
        debtGold: row.debt_gold,
        nextRentDueAt: row.next_rent_due_at,
        state: row.state,
        openingPaymentReceiptId: row.opening_payment_receipt_id,
        openingListingReceiptId: row.opening_listing_receipt_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        suspendedAt: row.suspended_at,
        terminatedAt: row.terminated_at,
        terminationReason: row.termination_reason,
        terminationDepositAppliedGold: row.termination_deposit_applied_gold,
        terminationRefundGold: row.termination_refund_gold,
        terminationRefundReceiptId: row.termination_refund_receipt_id,
        terminationDebtReference: row.termination_debt_reference,
    };
}

function mapOrder(row) {
    return {
        orderId: row.order_id,
        leaseId: row.lease_id,
        ownerResidentId: row.owner_resident_id,
        buyerResidentId: row.buyer_resident_id,
        productId: row.product_id,
        quantity: row.quantity,
        inventoryReceiptId: row.inventory_receipt_id,
        paymentReceiptId: row.payment_receipt_id,
        state: row.state,
        createdAt: row.created_at,
    };
}

function ensureActionReplay(database, actionKey, operationKind, residentId, payloadHash) {
    const existing = database.prepare(`
      SELECT operation_kind, resident_id, payload_hash, result_json
      FROM chef_store_action_receipts
      WHERE action_key = ?
    `).get(actionKey);
    if (!existing)
        return null;
    if (existing.operation_kind !== operationKind ||
        existing.resident_id !== residentId ||
        existing.payload_hash !== payloadHash) {
        fail("chef_store_idempotency_conflict");
    }
    return parseJson(existing.result_json);
}

function recordAction(database, actionKey, operationKind, residentId, payloadHash, result, now) {
    database.prepare(`
      INSERT INTO chef_store_action_receipts (
        action_key, operation_kind, resident_id, payload_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(actionKey, operationKind, residentId, payloadHash, canonicalJson(result), now);
}

function assertEconomy(economy) {
    if (!economy || typeof economy.chargeToSystem !== "function" ||
        typeof economy.creditFromSystem !== "function") {
        fail("chef_store_economy_authority_unavailable");
    }
}

function assertNoPromise(value, code) {
    if (value && typeof value.then === "function")
        fail(code);
    return value;
}

export const CHEF_STORE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS chef_store_action_receipts (
    action_key TEXT PRIMARY KEY,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('open', 'rent', 'order')),
    resident_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chef_store_leases (
    lease_id TEXT PRIMARY KEY,
    owner_resident_id TEXT NOT NULL,
    grade TEXT NOT NULL CHECK (grade IN ('high', 'special')),
    deposit_gold INTEGER NOT NULL CHECK (deposit_gold = 500000),
    rent_gold INTEGER NOT NULL CHECK (rent_gold = 100000),
    rent_period_days INTEGER NOT NULL CHECK (rent_period_days = 14),
    deposit_remaining_gold INTEGER NOT NULL CHECK (deposit_remaining_gold >= 0),
    arrears_gold INTEGER NOT NULL DEFAULT 0 CHECK (arrears_gold >= 0),
    debt_gold INTEGER NOT NULL DEFAULT 0 CHECK (debt_gold >= 0),
    next_rent_due_at INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'suspended', 'terminated')),
    opening_payment_receipt_id TEXT NOT NULL,
    opening_listing_receipt_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    suspended_at INTEGER,
    terminated_at INTEGER,
    termination_reason TEXT,
    termination_deposit_applied_gold INTEGER,
    termination_refund_gold INTEGER,
    termination_refund_receipt_id TEXT,
    termination_debt_reference TEXT,
    CHECK ((state IN ('active', 'suspended') AND terminated_at IS NULL AND termination_reason IS NULL
      AND termination_deposit_applied_gold IS NULL AND termination_refund_gold IS NULL
      AND termination_refund_receipt_id IS NULL AND termination_debt_reference IS NULL)
      OR (state = 'terminated' AND terminated_at IS NOT NULL AND termination_reason IS NOT NULL
      AND termination_deposit_applied_gold IS NOT NULL AND termination_refund_gold IS NOT NULL
      AND (termination_refund_gold = 0 OR termination_refund_receipt_id IS NOT NULL)
      AND (debt_gold = 0 OR termination_debt_reference IS NOT NULL)))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS chef_store_one_live_lease
    ON chef_store_leases(owner_resident_id)
    WHERE state IN ('active', 'suspended');

  CREATE INDEX IF NOT EXISTS chef_store_leases_state_due
    ON chef_store_leases(state, next_rent_due_at, lease_id);

  CREATE TABLE IF NOT EXISTS chef_store_rent_payments (
    payment_id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    owner_resident_id TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    amount_gold INTEGER NOT NULL CHECK (amount_gold = 100000),
    financial_receipt_id TEXT NOT NULL,
    paid_at INTEGER NOT NULL,
    UNIQUE (lease_id, due_at)
  );

  CREATE TABLE IF NOT EXISTS chef_store_orders (
    order_id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    owner_resident_id TEXT NOT NULL,
    buyer_resident_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    inventory_receipt_id TEXT NOT NULL,
    payment_receipt_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('completed')),
    created_at INTEGER NOT NULL,
    UNIQUE (lease_id, inventory_receipt_id)
  );

  CREATE INDEX IF NOT EXISTS chef_store_orders_lease
    ON chef_store_orders(lease_id, created_at, order_id);
`;

export function ensureChefStoreSchema(database) {
    assertDatabase(database);
    database.exec(CHEF_STORE_SCHEMA_SQL);
    return database;
}

export class ChefStoreService {
    constructor(database, options = {}) {
        ensureChefStoreSchema(database);
        this.database = database;
        this.economy = options.economy;
        this.now = options.now ?? Date.now;
        this.generateId = options.generateId ?? randomUUID;
        this.prepareOpeningListing = options.prepareOpeningListing;
        this.rollbackOpeningListing = options.rollbackOpeningListing;
        this.isRealResident = options.isRealResident ?? options.resolveResident;
        this.executeOrder = options.executeOrder;
        this.recordDebt = options.recordDebt;
        this.assertActiveChefQualification = options.assertActiveChefQualification;
    }

    openStore(input) {
        assertEconomy(this.economy);
        const ownerResidentId = identifier(input?.ownerResidentId, "owner_resident_id");
        const grade = normalizeGrade(input?.grade);
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const requestedLeaseId = input?.leaseId === undefined
            ? null
            : identifier(input.leaseId, "lease_id");
        const payload = {
            ownerResidentId,
            grade,
            ...(requestedLeaseId === null ? {} : { leaseId: requestedLeaseId }),
            ...(input?.listingReference === undefined ? {} : {
                listingReference: identifier(input.listingReference, "listing_reference"),
            }),
        };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "open", ownerResidentId, payloadHash);
            if (replay)
                return replay;
            if (typeof this.assertActiveChefQualification === "function") {
                const qualified = assertNoPromise(
                    this.assertActiveChefQualification({ ownerResidentId, grade, now }),
                    "chef_store_qualification_authority_unavailable",
                );
                if (!qualified)
                    fail("chef_store_active_qualification_required");
            }
            const existing = this.database.prepare(`
              SELECT * FROM chef_store_leases
              WHERE owner_resident_id = ? AND state IN ('active', 'suspended')
              ORDER BY created_at DESC LIMIT 1
            `).get(ownerResidentId);
            if (existing) {
                this.#reconcileLease(existing, now);
                const live = this.database.prepare(`
                  SELECT * FROM chef_store_leases
                  WHERE owner_resident_id = ? AND state IN ('active', 'suspended')
                  ORDER BY created_at DESC LIMIT 1
                `).get(ownerResidentId);
                if (live)
                    fail("chef_store_one_live_store_per_resident");
            }
            if (typeof this.prepareOpeningListing !== "function" ||
                typeof this.rollbackOpeningListing !== "function") {
                fail("chef_store_opening_listing_authority_unavailable");
            }
            const leaseId = requestedLeaseId ?? identifier(this.generateId(), "lease_id");
            let listing = null;
            try {
                listing = callbackReceipt(assertNoPromise(this.prepareOpeningListing({
                    leaseId,
                    ownerResidentId,
                    grade,
                    listingReference: payload.listingReference ?? null,
                    idempotencyKey,
                    now,
                }), "chef_store_opening_listing_authority_unavailable"), "listing");
                const charged = this.economy.chargeToSystem({
                    residentId: ownerResidentId,
                    currency: "gold",
                    amount: CHEF_STORE_OPENING_GOLD,
                    actor: "agent",
                    businessType: "chef_store_opening",
                    businessRef: `chef-store:${leaseId}:opening`,
                    idempotencyKey: `chef-store:${leaseId}:opening-charge`,
                });
                const openingPaymentReceiptId = charged.financialReceipt?.receiptId ?? null;
                if (!openingPaymentReceiptId)
                    fail("chef_store_opening_payment_receipt_unavailable");
                this.database.prepare(`
                  INSERT INTO chef_store_leases (
                    lease_id, owner_resident_id, grade, deposit_gold, rent_gold,
                    rent_period_days, deposit_remaining_gold, arrears_gold, debt_gold,
                    next_rent_due_at, state, opening_payment_receipt_id,
                    opening_listing_receipt_id, created_at, updated_at,
                    suspended_at, terminated_at, termination_reason,
                    termination_deposit_applied_gold, termination_refund_gold,
                    termination_refund_receipt_id, termination_debt_reference
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?, ?, ?,
                    NULL, NULL, NULL, NULL, NULL, NULL, NULL)
                `).run(leaseId, ownerResidentId, grade, CHEF_STORE_DEPOSIT_GOLD,
                    CHEF_STORE_RENT_GOLD, CHEF_STORE_RENT_PERIOD_DAYS,
                    CHEF_STORE_DEPOSIT_GOLD,
                    now + CHEF_STORE_RENT_PERIOD_DAYS * CHEF_STORE_DAY_MS,
                    openingPaymentReceiptId, listing.receiptId, now, now);
                const result = mapLease(this.database.prepare(
                    "SELECT * FROM chef_store_leases WHERE lease_id = ?",
                ).get(leaseId));
                recordAction(this.database, idempotencyKey, "open", ownerResidentId, payloadHash, result, now);
                return result;
            }
            catch (error) {
                if (listing) {
                    try {
                        this.rollbackOpeningListing({
                            leaseId,
                            ownerResidentId,
                            grade,
                            listingReceiptId: listing.receiptId,
                            idempotencyKey,
                            now,
                        });
                    }
                    catch {
                        // Keep the original failed opening operation authoritative.
                    }
                }
                throw error;
            }
        });
    }

    payRent(input) {
        assertEconomy(this.economy);
        const leaseId = identifier(input?.leaseId, "lease_id");
        const ownerResidentId = identifier(input?.ownerResidentId, "owner_resident_id");
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const payload = { leaseId, ownerResidentId };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "rent", ownerResidentId, payloadHash);
            if (replay)
                return replay;
            let row = this.#requireLease(leaseId);
            if (row.owner_resident_id !== ownerResidentId)
                fail("chef_store_owner_mismatch");
            row = this.#reconcileLease(row, now);
            if (row.state === "terminated")
                fail("chef_store_lease_terminated");
            if (now < row.next_rent_due_at)
                fail("chef_store_rent_not_due");
            const dueAt = row.next_rent_due_at;
            const charged = this.economy.chargeToSystem({
                residentId: ownerResidentId,
                currency: "gold",
                amount: CHEF_STORE_RENT_GOLD,
                actor: "agent",
                exemption: { kind: "existing_chef_store_rent", leaseId },
                businessType: "chef_store_rent",
                businessRef: `chef-store:${leaseId}:rent:${dueAt}`,
                idempotencyKey: `chef-store:${leaseId}:rent-charge:${dueAt}`,
            });
            const financialReceiptId = charged.financialReceipt?.receiptId ?? null;
            if (!financialReceiptId)
                fail("chef_store_rent_payment_receipt_unavailable");
            const paymentId = identifier(this.generateId(), "payment_id");
            this.database.prepare(`
              INSERT INTO chef_store_rent_payments (
                payment_id, lease_id, owner_resident_id, due_at, amount_gold,
                financial_receipt_id, paid_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(paymentId, leaseId, ownerResidentId, dueAt, CHEF_STORE_RENT_GOLD,
                financialReceiptId, now);
            this.database.prepare(`
              UPDATE chef_store_leases
              SET arrears_gold = 0, state = 'active', suspended_at = NULL,
                  next_rent_due_at = ?, updated_at = ?
              WHERE lease_id = ? AND state IN ('active', 'suspended')
            `).run(dueAt + CHEF_STORE_RENT_PERIOD_DAYS * CHEF_STORE_DAY_MS, now, leaseId);
            row = this.#requireLease(leaseId);
            const result = {
                ...mapLease(row),
                rentPaymentId: paymentId,
                rentPaymentReceiptId: financialReceiptId,
            };
            recordAction(this.database, idempotencyKey, "rent", ownerResidentId, payloadHash, result, now);
            return result;
        });
    }

    reconcileLease(input) {
        const leaseId = identifier(typeof input === "string" ? input : input?.leaseId, "lease_id");
        const now = nowOf(this);
        return runInTransaction(this.database, () => mapLease(this.#reconcileLease(this.#requireLease(leaseId), now)));
    }

    placeOrder(input) {
        const leaseId = identifier(input?.leaseId, "lease_id");
        const buyerResidentId = identifier(input?.buyerResidentId, "buyer_resident_id");
        const productId = identifier(input?.productId ?? input?.itemId ?? input?.recipeId, "product_id");
        const quantity = positiveInteger(input?.quantity, "quantity");
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const orderId = identifier(input?.orderId ?? `chef-store-order:${idempotencyKey}`, "order_id");
        const payload = { leaseId, buyerResidentId, productId, quantity, orderId };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "order", buyerResidentId, payloadHash);
            if (replay)
                return replay;
            if (typeof this.executeOrder !== "function")
                fail("chef_store_order_authority_unavailable");
            let lease = this.#requireLease(leaseId);
            lease = this.#reconcileLease(lease, now);
            const existingOrder = this.database.prepare(`
              SELECT lease_id, owner_resident_id, buyer_resident_id, product_id, quantity
              FROM chef_store_orders
              WHERE order_id = ?
            `).get(orderId);
            if (existingOrder !== undefined &&
                (existingOrder.lease_id !== leaseId ||
                    existingOrder.owner_resident_id !== lease.owner_resident_id ||
                    existingOrder.buyer_resident_id !== buyerResidentId ||
                    existingOrder.product_id !== productId ||
                    existingOrder.quantity !== quantity)) {
                fail("chef_store_order_receipt_conflict");
            }
            if (lease.state !== "active" &&
                !(lease.state === "suspended" && existingOrder !== undefined))
                fail("chef_store_new_orders_suspended");
            if (typeof this.isRealResident !== "function")
                fail("chef_store_resident_authority_unavailable");
            const realResident = assertNoPromise(
                this.isRealResident(buyerResidentId),
                "chef_store_resident_authority_unavailable",
            );
            if (!realResident)
                fail("chef_store_real_resident_required");
            const callbackResult = assertNoPromise(this.executeOrder({
                orderId,
                leaseId,
                ownerResidentId: lease.owner_resident_id,
                buyerResidentId,
                productId,
                quantity,
                idempotencyKey,
                now,
            }), "chef_store_order_authority_unavailable");
            const orderReceipt = callbackReceipt(callbackResult, "order");
            if (existingOrder !== undefined) {
                this.database.prepare(`
                  UPDATE chef_store_orders
                  SET payment_receipt_id = COALESCE(?, payment_receipt_id)
                  WHERE order_id = ?
                `).run(orderReceipt.paymentReceiptId, orderId);
                const result = mapOrder(this.database.prepare(
                    "SELECT * FROM chef_store_orders WHERE order_id = ?",
                ).get(orderId));
                recordAction(this.database, idempotencyKey, "order", buyerResidentId, payloadHash, result, now);
                return result;
            }
            try {
                this.database.prepare(`
                  INSERT INTO chef_store_orders (
                    order_id, lease_id, owner_resident_id, buyer_resident_id,
                    product_id, quantity, inventory_receipt_id, payment_receipt_id,
                    state, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
                `).run(orderId, leaseId, lease.owner_resident_id, buyerResidentId,
                    productId, quantity, orderReceipt.receiptId,
                    orderReceipt.paymentReceiptId, now);
            }
            catch (error) {
                if (error instanceof Error && error.message.includes("UNIQUE constraint failed"))
                    fail("chef_store_order_receipt_conflict");
                throw error;
            }
            const result = mapOrder(this.database.prepare(
                "SELECT * FROM chef_store_orders WHERE order_id = ?",
            ).get(orderId));
            recordAction(this.database, idempotencyKey, "order", buyerResidentId, payloadHash, result, now);
            return result;
        });
    }

    getLease(leaseId) {
        return this.reconcileLease(leaseId);
    }

    getOrder(orderId) {
        const id = identifier(orderId, "order_id");
        const row = this.database.prepare("SELECT * FROM chef_store_orders WHERE order_id = ?").get(id);
        return row ? mapOrder(row) : null;
    }

    #requireLease(leaseId) {
        const row = this.database.prepare("SELECT * FROM chef_store_leases WHERE lease_id = ?").get(leaseId);
        if (!row)
            fail("chef_store_lease_not_found");
        return row;
    }

    #reconcileLease(row, now) {
        if (row.state === "terminated" || now < row.next_rent_due_at)
            return row;
        const overdueDays = Math.floor((now - row.next_rent_due_at) / CHEF_STORE_DAY_MS);
        const arrearsGold = Math.max(row.arrears_gold, row.rent_gold);
        if (overdueDays >= CHEF_STORE_RENT_TERMINATION_DAYS)
            return this.#terminateLease(row, arrearsGold, now);
        if (row.arrears_gold !== arrearsGold)
            this.database.prepare(`
              UPDATE chef_store_leases SET arrears_gold = ?, updated_at = ? WHERE lease_id = ?
            `).run(arrearsGold, now, row.lease_id);
        if (overdueDays >= CHEF_STORE_RENT_GRACE_DAYS && row.state === "active") {
            this.database.prepare(`
              UPDATE chef_store_leases
              SET state = 'suspended', suspended_at = ?, updated_at = ?
              WHERE lease_id = ? AND state = 'active'
            `).run(row.next_rent_due_at + CHEF_STORE_RENT_GRACE_DAYS * CHEF_STORE_DAY_MS, now, row.lease_id);
        }
        return this.#requireLease(row.lease_id);
    }

    #terminateLease(row, arrearsGold, now) {
        const depositAppliedGold = Math.min(row.deposit_remaining_gold, arrearsGold);
        const terminationRefundGold = row.deposit_remaining_gold - depositAppliedGold;
        const debtGold = Math.max(0, arrearsGold - depositAppliedGold);
        if (debtGold > 0 && typeof this.recordDebt !== "function")
            fail("chef_store_debt_authority_unavailable");
        let terminationDebtReference = null;
        if (debtGold > 0) {
            const debt = assertNoPromise(this.recordDebt({
                leaseId: row.lease_id,
                ownerResidentId: row.owner_resident_id,
                amountGold: debtGold,
                idempotencyKey: `chef-store:${row.lease_id}:rent-debt`,
                now,
            }), "chef_store_debt_authority_unavailable");
            terminationDebtReference = identifier(
                typeof debt === "string" ? debt : debt?.debtReference ?? debt?.receiptId ?? debt?.id,
                "debt_reference",
            );
        }
        let terminationRefundReceiptId = null;
        if (terminationRefundGold > 0) {
            const credited = this.economy.creditFromSystem({
                residentId: row.owner_resident_id,
                currency: "gold",
                amount: terminationRefundGold,
                businessType: "chef_store_deposit_refund",
                businessRef: `chef-store:${row.lease_id}:deposit-refund`,
                idempotencyKey: `chef-store:${row.lease_id}:deposit-refund`,
            });
            terminationRefundReceiptId = credited.financialReceipt?.receiptId ?? null;
            if (!terminationRefundReceiptId)
                fail("chef_store_deposit_refund_receipt_unavailable");
        }
        this.database.prepare(`
          UPDATE chef_store_leases SET
            state = 'terminated', arrears_gold = 0, debt_gold = ?,
            deposit_remaining_gold = 0, updated_at = ?, terminated_at = ?,
            termination_reason = 'rent_overdue',
            termination_deposit_applied_gold = ?, termination_refund_gold = ?,
            termination_refund_receipt_id = ?, termination_debt_reference = ?
          WHERE lease_id = ? AND state IN ('active', 'suspended')
        `).run(debtGold, now, now, depositAppliedGold, terminationRefundGold,
            terminationRefundReceiptId, terminationDebtReference, row.lease_id);
        return this.#requireLease(row.lease_id);
    }
}

export function createChefStoreService(database, options = {}) {
    return new ChefStoreService(database, options);
}

export function openChefStore(database, input, options = {}) {
    return new ChefStoreService(database, options).openStore(input);
}

export function payChefStoreRent(database, input, options = {}) {
    return new ChefStoreService(database, options).payRent(input);
}

export function reconcileChefStoreLease(database, input, options = {}) {
    return new ChefStoreService(database, options).reconcileLease(input);
}

export function placeChefStoreOrder(database, input, options = {}) {
    return new ChefStoreService(database, options).placeOrder(input);
}
