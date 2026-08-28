import { createHash } from "node:crypto";
import { MARKET_FEE } from "../config.js";
import {
    allFarms as defaultListFarms,
    replaceFarm as defaultReplaceFarm,
    replaceFarmsAtomic as defaultReplaceFarmsAtomic,
} from "../store.js";
import { ensureKitchen } from "../domain/ranch/state.js";
import { resolveChefFarmForResident } from "./chef-farm-inventory-adapter.js";
import { CareerDomainError } from "./contracts.js";

export const CHEF_STORE_LISTINGS_FIELD = "chefStoreListings";
export const CHEF_STORE_ORDER_RECEIPTS_FIELD = "chefStoreOrderReceipts";
export const CHEF_STORE_FARM_RECEIPT_VERSION = 1;

const LISTING_RECEIPT_KIND = "chef_store_listing";
const ORDER_RECEIPT_KIND = "chef_store_order";
const LISTING_REFERENCE_PREFIX = "market:";
const ALLOWED_MARKET_KINDS = new Set(["dish", "ingredient"]);
const FORBIDDEN_CLIENT_IDENTITY_FIELDS = new Set([
    "farmId",
    "farm_id",
    "farmDoorplate",
    "farm_doorplate",
    "doorplate",
    "humanKey",
    "human_key",
    "farmHumanKey",
    "farm_human_key",
    "agentKey",
    "agent_key",
    "masterToken",
    "master_token",
    "token",
]);

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value ||
        ["__proto__", "prototype", "constructor"].includes(value)) {
        fail(`chef_store_farm_invalid_${field}`);
    }
    return value;
}

function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        fail(`chef_store_farm_invalid_${field}`);
    return value;
}

function nonNegativeInteger(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`chef_store_farm_invalid_${field}`);
    return value;
}

function timestamp(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail("chef_store_farm_invalid_timestamp");
    return value;
}

function nowOf(clock) {
    return timestamp(typeof clock === "function" ? clock() : clock ?? Date.now());
}

function canonical(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("chef_store_farm_invalid_payload");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((item) => canonical(item)).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("chef_store_farm_invalid_payload");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("chef_store_farm_invalid_payload");
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertNoClientIdentityOverride(input) {
    if (!isRecord(input))
        fail("chef_store_farm_invalid_request");
    for (const field of FORBIDDEN_CLIENT_IDENTITY_FIELDS) {
        if (Object.hasOwn(input, field))
            fail("chef_store_farm_client_identity_forbidden");
    }
}

function parseListingReference(value) {
    const reference = identifier(value, "listing_reference");
    if (!reference.startsWith(LISTING_REFERENCE_PREFIX))
        fail("chef_store_farm_listing_reference_invalid");
    const remainder = reference.slice(LISTING_REFERENCE_PREFIX.length);
    const separator = remainder.indexOf(":");
    if (separator <= 0 || separator === remainder.length - 1)
        fail("chef_store_farm_listing_reference_invalid");
    const kind = remainder.slice(0, separator);
    const id = remainder.slice(separator + 1);
    if (!ALLOWED_MARKET_KINDS.has(kind))
        fail("chef_store_farm_listing_kind_forbidden");
    return { reference, kind, id: identifier(id, "listing_id") };
}

function receiptsOnFarm(farm, field, code) {
    const value = farm?.[field];
    if (value === undefined)
        return {};
    if (!isRecord(value))
        fail(code);
    for (const key of Object.keys(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
            fail(code);
    }
    return value;
}

function cloneReceipts(farm, field, code) {
    return structuredClone(receiptsOnFarm(farm, field, code));
}

function marketEntries(farm) {
    if (!Array.isArray(farm?.market))
        fail("chef_store_farm_market_unavailable");
    return farm.market;
}

function validateMarketListing(entry, expected) {
    if (!isRecord(entry) || entry.kind !== expected.kind || entry.id !== expected.id)
        fail("chef_store_farm_listing_unavailable");
    const quantity = positiveInteger(entry.qty, "listing_quantity");
    const price = positiveInteger(entry.price, "listing_price");
    if (expected.kind === "dish" && !isRecord(entry.dish))
        fail("chef_store_farm_listing_unavailable");
    return {
        ...structuredClone(entry),
        kind: expected.kind,
        id: expected.id,
        qty: quantity,
        price,
    };
}

function findMarketListing(farm, expected) {
    const matches = marketEntries(farm).filter((entry) =>
        isRecord(entry) && entry.kind === expected.kind && entry.id === expected.id);
    if (matches.length !== 1) {
        if (matches.length === 0)
            fail("chef_store_farm_listing_not_found");
        fail("chef_store_farm_listing_conflict");
    }
    return validateMarketListing(matches[0], expected);
}

function sameValue(left, right) {
    return canonical(left) === canonical(right);
}

function ensureFarmOptions(options) {
    const listFarms = options.listFarms ?? defaultListFarms;
    const replaceFarm = options.replaceFarm ?? defaultReplaceFarm;
    const replaceFarmsAtomic = options.replaceFarmsAtomic ?? defaultReplaceFarmsAtomic;
    if (typeof listFarms !== "function" || typeof replaceFarm !== "function" ||
        typeof replaceFarmsAtomic !== "function") {
        fail("chef_store_farm_authority_unavailable");
    }
    return { listFarms, replaceFarm, replaceFarmsAtomic };
}

function resolveFarmById(listFarms, farmId) {
    const farm = [...listFarms()].find((entry) => entry?.id === farmId);
    if (!farm)
        fail("chef_store_farm_binding_required");
    return farm;
}

function leaseRow(database, leaseId) {
    if (!database || typeof database.prepare !== "function")
        fail("chef_store_farm_database_required");
    try {
        return database.prepare("SELECT * FROM chef_store_leases WHERE lease_id = ?").get(leaseId) ?? null;
    }
    catch (error) {
        if (error instanceof Error && /no such table/i.test(error.message))
            return null;
        throw error;
    }
}

function orderReceiptPayload(input, listing, now) {
    const cost = listing.price * input.quantity;
    if (!Number.isSafeInteger(cost) || cost <= 0)
        fail("chef_store_farm_order_amount_invalid");
    const fee = Math.floor(cost * MARKET_FEE);
    const sourceListing = structuredClone(listing.sourceListing);
    const request = {
        orderId: input.orderId,
        leaseId: input.leaseId,
        ownerResidentId: input.ownerResidentId,
        buyerResidentId: input.buyerResidentId,
        productId: input.productId,
        quantity: input.quantity,
        idempotencyKey: input.idempotencyKey,
        listingReceiptId: listing.listingReceiptId,
        listingReference: listing.listingReference,
        marketKind: listing.kind,
        price: listing.price,
        sourceListing,
        cost,
        fee,
    };
    return {
        version: CHEF_STORE_FARM_RECEIPT_VERSION,
        kind: ORDER_RECEIPT_KIND,
        state: "pending",
        ...request,
        requestFingerprint: digest(canonical(request)),
        createdAt: now,
        updatedAt: now,
    };
}

function assertOrderReceiptMatches(receipt, input, expectedFingerprint = null) {
    if (!isRecord(receipt) || receipt.version !== CHEF_STORE_FARM_RECEIPT_VERSION ||
        receipt.kind !== ORDER_RECEIPT_KIND || receipt.orderId !== input.orderId) {
        fail("chef_store_farm_order_receipt_conflict");
    }
    if (receipt.leaseId !== input.leaseId ||
        receipt.ownerResidentId !== input.ownerResidentId ||
        receipt.buyerResidentId !== input.buyerResidentId ||
        receipt.productId !== input.productId ||
        receipt.quantity !== input.quantity ||
        receipt.idempotencyKey !== input.idempotencyKey) {
        fail("chef_store_farm_order_receipt_conflict");
    }
    if (expectedFingerprint !== null && receipt.requestFingerprint !== expectedFingerprint)
        fail("chef_store_farm_order_receipt_conflict");
    if (!["pending", "inventory_applied", "completed"].includes(receipt.state))
        fail("chef_store_farm_order_receipt_invalid");
}

function assertListingReceiptMatches(receipt, input) {
    if (!isRecord(receipt) || receipt.version !== CHEF_STORE_FARM_RECEIPT_VERSION ||
        receipt.kind !== LISTING_RECEIPT_KIND || receipt.state !== "reserved" ||
        receipt.leaseId !== input.leaseId || receipt.ownerResidentId !== input.ownerResidentId) {
        fail("chef_store_farm_listing_receipt_conflict");
    }
}

function restoreMarketListing(farm, sourceListing, quantity) {
    const restored = structuredClone(sourceListing);
    restored.qty = quantity;
    const market = marketEntries(farm);
    const existing = market.find((entry) =>
        isRecord(entry) && entry.kind === restored.kind && entry.id === restored.id &&
        entry.price === restored.price &&
        (restored.kind !== "dish" || sameValue(entry.dish, restored.dish)));
    if (existing) {
        const nextQuantity = Number(existing.qty) + quantity;
        if (!Number.isSafeInteger(nextQuantity) || nextQuantity <= 0)
            fail("chef_store_farm_listing_restore_conflict");
        existing.qty = nextQuantity;
        return;
    }
    market.push(restored);
}

function assertEconomy(economy) {
    if (!economy || typeof economy.createTrade !== "function" ||
        typeof economy.confirmTrade !== "function" ||
        typeof economy.settleTrade !== "function" ||
        typeof economy.chargeToSystem !== "function") {
        fail("chef_store_farm_economy_authority_unavailable");
    }
}

function assertTrade(trade, input, businessReference) {
    if (!isRecord(trade) || typeof trade.trade_id !== "string" ||
        trade.payer_resident_id !== input.buyerResidentId ||
        trade.payee_resident_id !== input.ownerResidentId ||
        trade.currency !== "silver" || trade.amount !== input.cost ||
        trade.business_ref !== businessReference) {
        fail("chef_store_farm_payment_conflict");
    }
    return trade.trade_id;
}

function ensurePayment(economy, receipt) {
    assertEconomy(economy);
    const businessReference = `chef-store:${receipt.orderId}:sale`;
    const trade = economy.createTrade({
        payerResidentId: receipt.buyerResidentId,
        payeeResidentId: receipt.ownerResidentId,
        currency: "silver",
        amount: receipt.cost,
        businessType: "chef_store_sale",
        businessRef: businessReference,
        idempotencyKey: `chef-store:${receipt.orderId}:trade-create`,
    });
    const tradeId = assertTrade(trade, receipt, businessReference);
    economy.confirmTrade({
        tradeId,
        actorResidentId: receipt.buyerResidentId,
        idempotencyKey: `chef-store:${receipt.orderId}:trade-buyer-confirm`,
    });
    economy.confirmTrade({
        tradeId,
        actorResidentId: receipt.ownerResidentId,
        idempotencyKey: `chef-store:${receipt.orderId}:trade-seller-confirm`,
    });
    const settled = economy.settleTrade({
        tradeId,
        idempotencyKey: `chef-store:${receipt.orderId}:trade-settle`,
    });
    if (!isRecord(settled) || settled.state !== "settled")
        fail("chef_store_farm_payment_not_settled");
    const paymentReceiptId = settled.financialReceipt?.receiptId;
    if (typeof paymentReceiptId !== "string" || paymentReceiptId.length === 0)
        fail("chef_store_farm_payment_receipt_unavailable");
    if (receipt.fee > 0) {
        economy.chargeToSystem({
            residentId: receipt.ownerResidentId,
            currency: "silver",
            amount: receipt.fee,
            actor: "human",
            businessType: "chef_store_market_fee",
            businessRef: `chef-store:${receipt.orderId}:market-fee`,
            idempotencyKey: `chef-store:${receipt.orderId}:market-fee`,
        });
    }
    return paymentReceiptId;
}

function createListingReceipt(input, sourceListing, now) {
    const parsed = parseListingReference(input.listingReference);
    return {
        version: CHEF_STORE_FARM_RECEIPT_VERSION,
        kind: LISTING_RECEIPT_KIND,
        state: "reserved",
        receiptId: `chef-store-listing:${input.leaseId}`,
        leaseId: input.leaseId,
        ownerResidentId: input.ownerResidentId,
        listingReference: parsed.reference,
        marketKind: parsed.kind,
        marketId: parsed.id,
        sourceListing: structuredClone(sourceListing),
        quantity: sourceListing.qty,
        price: sourceListing.price,
        createdAt: now,
        updatedAt: now,
    };
}

function listingForLease(farm, leaseId, ownerResidentId) {
    const receipts = receiptsOnFarm(
        farm,
        CHEF_STORE_LISTINGS_FIELD,
        "chef_store_farm_listing_receipts_invalid",
    );
    const matches = Object.values(receipts).filter((entry) =>
        isRecord(entry) && entry.kind === LISTING_RECEIPT_KIND && entry.leaseId === leaseId);
    if (matches.length !== 1)
        fail(matches.length === 0 ? "chef_store_farm_listing_not_found" : "chef_store_farm_listing_receipt_conflict");
    const receipt = matches[0];
    assertListingReceiptMatches(receipt, { leaseId, ownerResidentId });
    return receipt;
}

function orderInput(input) {
    assertNoClientIdentityOverride(input);
    return {
        orderId: identifier(input.orderId, "order_id"),
        leaseId: identifier(input.leaseId, "lease_id"),
        ownerResidentId: identifier(input.ownerResidentId, "owner_resident_id"),
        buyerResidentId: identifier(input.buyerResidentId, "buyer_resident_id"),
        productId: identifier(input.productId, "product_id"),
        quantity: positiveInteger(input.quantity, "quantity"),
        idempotencyKey: identifier(input.idempotencyKey, "idempotency_key"),
    };
}

function listingInput(input) {
    assertNoClientIdentityOverride(input);
    return {
        leaseId: identifier(input.leaseId, "lease_id"),
        ownerResidentId: identifier(input.ownerResidentId, "owner_resident_id"),
        listingReference: identifier(input.listingReference, "listing_reference"),
    };
}

export function createChefStoreFarmAdapter(options = {}) {
    const { listFarms, replaceFarm, replaceFarmsAtomic } = ensureFarmOptions(options);
    const database = options.database;
    const economy = options.economy;
    const clock = options.now ?? Date.now;

    function ownerFarm(residentId) {
        return resolveChefFarmForResident(database, residentId, listFarms);
    }

    function prepareOpeningListing(rawInput) {
        const input = listingInput(rawInput);
        const now = nowOf(rawInput.now ?? clock);
        const farm = ownerFarm(input.ownerResidentId);
        const listings = cloneReceipts(
            farm,
            CHEF_STORE_LISTINGS_FIELD,
            "chef_store_farm_listing_receipts_invalid",
        );
        const receiptId = `chef-store-listing:${input.leaseId}`;
        const existing = listings[receiptId];
        if (existing !== undefined) {
            assertListingReceiptMatches(existing, input);
            if (existing.listingReference !== input.listingReference)
                fail("chef_store_farm_listing_receipt_conflict");
            return { listingReceiptId: receiptId };
        }
        const parsed = parseListingReference(input.listingReference);
        const sourceListing = findMarketListing(farm, parsed);
        const receipt = createListingReceipt(input, sourceListing, now);
        const nextFarm = structuredClone(farm);
        nextFarm.market = marketEntries(nextFarm).filter((entry) => entry !== sourceListing &&
            !(isRecord(entry) && entry.kind === parsed.kind && entry.id === parsed.id));
        nextFarm[CHEF_STORE_LISTINGS_FIELD] = {
            ...listings,
            [receiptId]: receipt,
        };
        try {
            replaceFarm(farm.id, nextFarm);
        }
        catch {
            fail("chef_store_farm_listing_authority_unavailable");
        }
        return { listingReceiptId: receiptId };
    }

    function rollbackOpeningListing(rawInput) {
        assertNoClientIdentityOverride(rawInput);
        const leaseId = identifier(rawInput.leaseId, "lease_id");
        const ownerResidentId = identifier(rawInput.ownerResidentId, "owner_resident_id");
        const listingReceiptId = identifier(rawInput.listingReceiptId, "listing_receipt_id");
        const farm = ownerFarm(ownerResidentId);
        if (leaseRow(database, leaseId))
            return { listingReceiptId };
        const listings = cloneReceipts(
            farm,
            CHEF_STORE_LISTINGS_FIELD,
            "chef_store_farm_listing_receipts_invalid",
        );
        const receipt = listings[listingReceiptId];
        if (receipt === undefined)
            return { listingReceiptId };
        assertListingReceiptMatches(receipt, { leaseId, ownerResidentId });
        const nextFarm = structuredClone(farm);
        restoreMarketListing(nextFarm, receipt.sourceListing, receipt.quantity);
        const nextListings = cloneReceipts(
            nextFarm,
            CHEF_STORE_LISTINGS_FIELD,
            "chef_store_farm_listing_receipts_invalid",
        );
        delete nextListings[listingReceiptId];
        nextFarm[CHEF_STORE_LISTINGS_FIELD] = nextListings;
        try {
            replaceFarm(farm.id, nextFarm);
        }
        catch {
            fail("chef_store_farm_listing_authority_unavailable");
        }
        return { listingReceiptId };
    }

    function applyInventory(input, sellerFarm, buyerFarm, receipt, now) {
        const sellerNext = structuredClone(sellerFarm);
        const buyerNext = structuredClone(buyerFarm);
        const listings = cloneReceipts(
            sellerNext,
            CHEF_STORE_LISTINGS_FIELD,
            "chef_store_farm_listing_receipts_invalid",
        );
        const listing = listings[receipt.listingReceiptId];
        if (listing === undefined)
            fail("chef_store_farm_listing_not_found");
        assertListingReceiptMatches(listing, input);
        if (listing.marketKind !== receipt.marketKind || listing.marketId !== receipt.productId ||
            listing.price !== receipt.price || receipt.quantity > listing.quantity ||
            !sameValue(listing.sourceListing, receipt.sourceListing)) {
            fail("chef_store_farm_order_receipt_conflict");
        }
        const remaining = listing.quantity - receipt.quantity;
        if (remaining === 0)
            delete listings[receipt.listingReceiptId];
        else {
            listings[receipt.listingReceiptId] = {
                ...listing,
                quantity: remaining,
                updatedAt: now,
            };
        }
        if (receipt.marketKind === "ingredient") {
            const kitchen = ensureKitchen(buyerNext);
            kitchen.ingredients[receipt.productId] =
                (kitchen.ingredients[receipt.productId] ?? 0) + receipt.quantity;
        }
        else if (receipt.marketKind === "dish") {
            const kitchen = ensureKitchen(buyerNext);
            for (let index = 0; index < receipt.quantity; index += 1)
                kitchen.dishes.push(structuredClone(receipt.sourceListing.dish));
        }
        else {
            fail("chef_store_farm_listing_kind_forbidden");
        }
        const orders = cloneReceipts(
            sellerNext,
            CHEF_STORE_ORDER_RECEIPTS_FIELD,
            "chef_store_farm_order_receipts_invalid",
        );
        orders[receipt.orderId] = {
            ...receipt,
            state: "inventory_applied",
            inventoryAppliedAt: now,
            updatedAt: now,
        };
        sellerNext[CHEF_STORE_LISTINGS_FIELD] = listings;
        sellerNext[CHEF_STORE_ORDER_RECEIPTS_FIELD] = orders;
        try {
            replaceFarmsAtomic([
                { id: sellerNext.id, farm: sellerNext },
                { id: buyerNext.id, farm: buyerNext },
            ]);
        }
        catch {
            fail("chef_store_farm_inventory_authority_unavailable");
        }
    }

    function completeOrder(input, sellerFarm, receipt, now) {
        const paymentReceiptId = ensurePayment(economy, receipt);
        const currentSeller = resolveFarmById(listFarms, sellerFarm.id);
        const orders = cloneReceipts(
            currentSeller,
            CHEF_STORE_ORDER_RECEIPTS_FIELD,
            "chef_store_farm_order_receipts_invalid",
        );
        const currentReceipt = orders[receipt.orderId];
        assertOrderReceiptMatches(currentReceipt, input, receipt.requestFingerprint);
        if (currentReceipt.state === "completed" && currentReceipt.paymentReceiptId === paymentReceiptId)
            return { orderReceiptId: receipt.orderId, paymentReceiptId };
        const completed = {
            ...currentReceipt,
            state: "completed",
            paymentReceiptId,
            completedAt: now,
            updatedAt: now,
        };
        orders[receipt.orderId] = completed;
        const nextSeller = structuredClone(currentSeller);
        nextSeller[CHEF_STORE_ORDER_RECEIPTS_FIELD] = orders;
        try {
            replaceFarm(currentSeller.id, nextSeller);
        }
        catch {
            fail("chef_store_farm_order_receipt_authority_unavailable");
        }
        return { orderReceiptId: receipt.orderId, paymentReceiptId };
    }

    function executeOrder(rawInput) {
        const input = orderInput(rawInput);
        const now = nowOf(rawInput.now ?? clock);
        const lease = leaseRow(database, input.leaseId);
        const sellerFarm = ownerFarm(input.ownerResidentId);
        const buyerFarm = ownerFarm(input.buyerResidentId);
        if (sellerFarm.id === buyerFarm.id)
            fail("chef_store_farm_self_order_forbidden");
        const orders = receiptsOnFarm(
            sellerFarm,
            CHEF_STORE_ORDER_RECEIPTS_FIELD,
            "chef_store_farm_order_receipts_invalid",
        );
        const existing = orders[input.orderId];
        if (lease && lease.owner_resident_id !== input.ownerResidentId)
            fail("chef_store_farm_lease_owner_mismatch");
        if (lease && lease.state !== "active" &&
            !(lease.state === "suspended" && existing !== undefined))
            fail(lease.state === "terminated" ? "chef_store_farm_lease_terminated" : "chef_store_farm_new_orders_suspended");
        if (existing !== undefined) {
            assertOrderReceiptMatches(existing, input);
            if (existing.state === "pending")
                applyInventory(input, sellerFarm, buyerFarm, existing, now);
            const refreshedSeller = resolveFarmById(listFarms, sellerFarm.id);
            const refreshed = receiptsOnFarm(
                refreshedSeller,
                CHEF_STORE_ORDER_RECEIPTS_FIELD,
                "chef_store_farm_order_receipts_invalid",
            )[input.orderId];
            return completeOrder(input, refreshedSeller, refreshed, now);
        }
        const listing = listingForLease(sellerFarm, input.leaseId, input.ownerResidentId);
        if (listing.marketId !== input.productId)
            fail("chef_store_farm_product_not_listed");
        if (input.quantity > listing.quantity)
            fail("chef_store_farm_inventory_insufficient");
        const receipt = orderReceiptPayload(input, {
            listingReceiptId: listing.receiptId,
            listingReference: listing.listingReference,
            kind: listing.marketKind,
            price: listing.price,
            sourceListing: listing.sourceListing,
        }, now);
        const pendingSeller = structuredClone(sellerFarm);
        const pendingOrders = cloneReceipts(
            pendingSeller,
            CHEF_STORE_ORDER_RECEIPTS_FIELD,
            "chef_store_farm_order_receipts_invalid",
        );
        pendingOrders[input.orderId] = receipt;
        pendingSeller[CHEF_STORE_ORDER_RECEIPTS_FIELD] = pendingOrders;
        try {
            replaceFarm(sellerFarm.id, pendingSeller);
        }
        catch {
            fail("chef_store_farm_order_receipt_authority_unavailable");
        }
        applyInventory(input, resolveFarmById(listFarms, sellerFarm.id), resolveFarmById(listFarms, buyerFarm.id), receipt, now);
        const refreshedSeller = resolveFarmById(listFarms, sellerFarm.id);
        const refreshed = receiptsOnFarm(
            refreshedSeller,
            CHEF_STORE_ORDER_RECEIPTS_FIELD,
            "chef_store_farm_order_receipts_invalid",
        )[input.orderId];
        return completeOrder(input, refreshedSeller, refreshed, now);
    }

    function reconcileTerminatedLeases() {
        if (!database || typeof database.prepare !== "function")
            fail("chef_store_farm_database_required");
        let rows;
        try {
            rows = database.prepare("SELECT * FROM chef_store_leases WHERE state = 'terminated' ORDER BY lease_id").all();
        }
        catch (error) {
            if (error instanceof Error && /no such table/i.test(error.message))
                return { restoredListings: 0 };
            throw error;
        }
        let restoredListings = 0;
        for (const row of rows) {
            const farm = ownerFarm(row.owner_resident_id);
            const listings = cloneReceipts(
                farm,
                CHEF_STORE_LISTINGS_FIELD,
                "chef_store_farm_listing_receipts_invalid",
            );
            const matches = Object.entries(listings).filter(([, receipt]) =>
                isRecord(receipt) && receipt.kind === LISTING_RECEIPT_KIND && receipt.leaseId === row.lease_id);
            if (matches.length === 0)
                continue;
            const nextFarm = structuredClone(farm);
            const nextListings = cloneReceipts(
                nextFarm,
                CHEF_STORE_LISTINGS_FIELD,
                "chef_store_farm_listing_receipts_invalid",
            );
            for (const [receiptId, receipt] of matches) {
                if (receipt.quantity > 0)
                    restoreMarketListing(nextFarm, receipt.sourceListing, receipt.quantity);
                delete nextListings[receiptId];
                restoredListings += 1;
            }
            nextFarm[CHEF_STORE_LISTINGS_FIELD] = nextListings;
            try {
                replaceFarm(farm.id, nextFarm);
            }
            catch {
                fail("chef_store_farm_listing_authority_unavailable");
            }
        }
        return { restoredListings };
    }

    function recoverPendingOrders(options = {}) {
        const completeOrder = options.completeOrder;
        if (completeOrder !== undefined && typeof completeOrder !== "function")
            fail("chef_store_farm_recovery_callback_invalid");
        let recovered = 0;
        for (const initialFarm of listFarms()) {
            const farm = resolveFarmById(listFarms, initialFarm.id);
            const orders = receiptsOnFarm(
                farm,
                CHEF_STORE_ORDER_RECEIPTS_FIELD,
                "chef_store_farm_order_receipts_invalid",
            );
            for (const receipt of Object.values(orders)) {
                if (!isRecord(receipt) || !["pending", "inventory_applied", "completed"].includes(receipt.state))
                    continue;
                const input = {
                    orderId: receipt.orderId,
                    leaseId: receipt.leaseId,
                    ownerResidentId: receipt.ownerResidentId,
                    buyerResidentId: receipt.buyerResidentId,
                    productId: receipt.productId,
                    quantity: receipt.quantity,
                    idempotencyKey: receipt.idempotencyKey,
                };
                const stored = database.prepare(
                    "SELECT order_id FROM chef_store_orders WHERE order_id = ?",
                ).get(receipt.orderId);
                const externalPending = ["pending", "inventory_applied"].includes(receipt.state);
                if (externalPending)
                    executeOrder(input);
                if (stored === undefined && completeOrder)
                    completeOrder(input);
                if (externalPending || (stored === undefined && completeOrder))
                    recovered += 1;
            }
        }
        return { recovered };
    }

    function recoverOrphanedListings() {
        let restoredListings = 0;
        for (const initialFarm of listFarms()) {
            const farm = resolveFarmById(listFarms, initialFarm.id);
            const listings = cloneReceipts(
                farm,
                CHEF_STORE_LISTINGS_FIELD,
                "chef_store_farm_listing_receipts_invalid",
            );
            const orphaned = Object.entries(listings).filter(([, receipt]) =>
                isRecord(receipt) && receipt.kind === LISTING_RECEIPT_KIND &&
                leaseRow(database, receipt.leaseId) === null);
            if (orphaned.length === 0)
                continue;
            const nextFarm = structuredClone(farm);
            const nextListings = cloneReceipts(
                nextFarm,
                CHEF_STORE_LISTINGS_FIELD,
                "chef_store_farm_listing_receipts_invalid",
            );
            for (const [receiptId, receipt] of orphaned) {
                assertListingReceiptMatches(receipt, {
                    leaseId: receipt.leaseId,
                    ownerResidentId: receipt.ownerResidentId,
                });
                if (receipt.quantity > 0)
                    restoreMarketListing(nextFarm, receipt.sourceListing, receipt.quantity);
                delete nextListings[receiptId];
                restoredListings += 1;
            }
            nextFarm[CHEF_STORE_LISTINGS_FIELD] = nextListings;
            try {
                replaceFarm(farm.id, nextFarm);
            }
            catch {
                fail("chef_store_farm_listing_authority_unavailable");
            }
        }
        return { restoredListings };
    }

    return Object.freeze({
        prepareOpeningListing,
        rollbackOpeningListing,
        executeOrder,
        recoverOrphanedListings,
        reconcileTerminatedLeases,
        recoverPendingOrders,
    });
}

export function createChefStoreFarmAuthority(options = {}) {
    return createChefStoreFarmAdapter(options);
}
