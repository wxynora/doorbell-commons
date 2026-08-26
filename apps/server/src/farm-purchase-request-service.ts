import { createHash, randomUUID } from "node:crypto";
import type {
  CommunityDatabase,
  FarmPurchaseItemInput,
  FarmPurchaseRequestRecord,
  FarmPurchaseShop,
} from "./community-database.js";
import { FarmPurchaseRequestIdempotencyConflictError } from "./community-database.js";

export const FARM_PURCHASE_BELL_REASON = "farm_purchase_request" as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const SHOP_LABELS: Record<FarmPurchaseShop, string> = {
  field: "农场商店",
  ranch: "牧场商店",
};

export interface FarmPurchaseRequestItemInput {
  itemId: string;
  kind: string;
  qty: number;
  displayName: string;
}

export interface FarmPurchaseRequestCreateInput {
  residentId: string;
  homeId: string;
  humanName: string;
  shop: FarmPurchaseShop;
  shopRevision: string;
  idempotencyKey: string;
  items: readonly FarmPurchaseRequestItemInput[];
}

export interface FarmPurchaseRequestServiceOptions {
  database: CommunityDatabase;
  now?: () => number;
  generateRequestId?: () => string;
  generateWakeId?: () => string;
  bellNotifier?: FarmPurchaseBellNotifier;
}

export interface FarmPurchaseBellNotifier {
  notifyResident(residentId: string): void;
  cancelWake(residentId: string, wakeId: string, now?: number): void;
  notifyWakeCancelled?(residentId: string, wakeId: string): void;
}

export interface FarmPurchaseRequestCreateResult {
  request: FarmPurchaseRequestRecord;
  created: boolean;
  notificationText: string;
}

export interface FarmPurchaseRequestReplayInput {
  residentId: string;
  shop: FarmPurchaseShop;
  shopRevision: string;
  idempotencyKey: string;
  items: readonly Pick<FarmPurchaseRequestItemInput, "itemId" | "kind" | "qty">[];
}

export class FarmPurchaseRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmPurchaseRequestInputError";
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeItems(items: readonly FarmPurchaseRequestItemInput[]): FarmPurchaseItemInput[] {
  if (items.length === 0) {
    throw new FarmPurchaseRequestInputError("At least one purchase item is required");
  }
  const seen = new Set<string>();
  const normalized = items.map((item) => {
    if (
      item.kind.length === 0 ||
      item.itemId.length === 0 ||
      item.displayName.length === 0 ||
      !Number.isSafeInteger(item.qty) ||
      item.qty <= 0
    ) {
      throw new FarmPurchaseRequestInputError(
        "Purchase items must have stable IDs, names, and positive quantities",
      );
    }
    const key = `${item.kind}\u0000${item.itemId}`;
    if (seen.has(key)) {
      throw new FarmPurchaseRequestInputError("A purchase item may appear only once per request");
    }
    seen.add(key);
    return {
      itemId: item.itemId,
      kind: item.kind,
      qty: item.qty,
      displayName: item.displayName,
    };
  });
  normalized.sort((left, right) => {
    const kindOrder = compareText(left.kind, right.kind);
    return kindOrder === 0 ? compareText(left.itemId, right.itemId) : kindOrder;
  });
  return normalized;
}

export function farmPurchaseItemStatusKey(
  item: Pick<FarmPurchaseRequestItemInput, "kind" | "itemId">,
): string {
  return `${item.kind}\u0000${item.itemId}`;
}

export function buildFarmPurchaseNotificationText(
  humanName: string,
  shop: FarmPurchaseShop,
  items: readonly FarmPurchaseRequestItemInput[],
): string {
  const itemsText = items.map((item) => `${item.displayName} × ${item.qty}`).join("、");
  return `【📢来自铃野的通知】\n你的人类${humanName}想要你给她买${SHOP_LABELS[shop]}的${itemsText}。`;
}

function canonicalPayloadHash(
  shop: FarmPurchaseShop,
  shopRevision: string,
  items: readonly FarmPurchaseItemInput[],
): string {
  const canonical = JSON.stringify({
    shop,
    shop_revision: shopRevision,
    items: items.map((item) => ({
      kind: item.kind,
      item_id: item.itemId,
      qty: item.qty,
    })),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function normalizeStableItems(
  items: readonly Pick<FarmPurchaseRequestItemInput, "itemId" | "kind" | "qty">[],
): Array<Pick<FarmPurchaseRequestItemInput, "itemId" | "kind" | "qty">> {
  if (items.length === 0) {
    throw new FarmPurchaseRequestInputError("At least one purchase item is required");
  }
  const seen = new Set<string>();
  const normalized = items.map((item) => {
    if (
      item.kind.length === 0 ||
      item.itemId.length === 0 ||
      !Number.isSafeInteger(item.qty) ||
      item.qty <= 0
    ) {
      throw new FarmPurchaseRequestInputError(
        "Purchase items must have stable IDs and positive quantities",
      );
    }
    const key = farmPurchaseItemStatusKey(item);
    if (seen.has(key)) {
      throw new FarmPurchaseRequestInputError("A purchase item may appear only once per request");
    }
    seen.add(key);
    return { itemId: item.itemId, kind: item.kind, qty: item.qty };
  });
  normalized.sort((left, right) => {
    const kindOrder = compareText(left.kind, right.kind);
    return kindOrder === 0 ? compareText(left.itemId, right.itemId) : kindOrder;
  });
  return normalized;
}

export class FarmPurchaseRequestService {
  readonly #database: CommunityDatabase;
  readonly #now: () => number;
  readonly #generateRequestId: () => string;
  readonly #generateWakeId: () => string;
  readonly #bellNotifier: FarmPurchaseBellNotifier | undefined;

  constructor(options: FarmPurchaseRequestServiceOptions) {
    this.#database = options.database;
    this.#now = options.now ?? Date.now;
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
    this.#bellNotifier = options.bellNotifier;
  }

  create(input: FarmPurchaseRequestCreateInput): FarmPurchaseRequestCreateResult {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmPurchaseRequestInputError("Idempotency-Key must be a UUID");
    }
    if (!Object.hasOwn(SHOP_LABELS, input.shop)) {
      throw new FarmPurchaseRequestInputError("Only the field and ranch shops can be requested");
    }
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    if (input.humanName.length === 0 || input.shopRevision.length === 0) {
      throw new FarmPurchaseRequestInputError("Human name and shop revision are required");
    }
    const items = normalizeItems(input.items);
    const notificationText = buildFarmPurchaseNotificationText(input.humanName, input.shop, items);
    const result = this.#database.createFarmPurchaseRequest({
      requestId: this.#generateRequestId(),
      wakeId: this.#generateWakeId(),
      residentId: input.residentId,
      homeId: input.homeId,
      idempotencyKey,
      shop: input.shop,
      shopRevision: input.shopRevision,
      humanName: input.humanName,
      payloadHash: canonicalPayloadHash(input.shop, input.shopRevision, items),
      notificationText,
      items,
      createdAt: this.#now(),
    });
    this.#bellNotifier?.notifyResident(input.residentId);
    const storedWake = result.created
      ? undefined
      : this.#database.getBellWake(input.residentId, result.request.wakeId);
    const storedText = storedWake?.payload?.text;
    return {
      ...result,
      notificationText: typeof storedText === "string" ? storedText : notificationText,
    };
  }

  replay(input: FarmPurchaseRequestReplayInput): FarmPurchaseRequestCreateResult | undefined {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmPurchaseRequestInputError("Idempotency-Key must be a UUID");
    }
    if (!Object.hasOwn(SHOP_LABELS, input.shop)) {
      throw new FarmPurchaseRequestInputError("Only the field and ranch shops can be requested");
    }
    if (input.shopRevision.length === 0) {
      throw new FarmPurchaseRequestInputError("Shop revision is required");
    }

    const existing = this.#database.getFarmPurchaseRequestByIdempotencyKey(
      input.residentId,
      input.idempotencyKey.toLowerCase(),
    );
    if (!existing) {
      return undefined;
    }

    const current = this.get(existing.residentId, existing.requestId);
    if (!current) {
      return undefined;
    }

    const requestedItems = normalizeStableItems(input.items);
    const existingItems = normalizeStableItems(current.items);
    const sameItems =
      requestedItems.length === existingItems.length &&
      requestedItems.every((item, index) => {
        const existingItem = existingItems[index];
        return (
          existingItem !== undefined &&
          existingItem.itemId === item.itemId &&
          existingItem.kind === item.kind &&
          existingItem.qty === item.qty
        );
      });
    if (current.shop !== input.shop || current.shopRevision !== input.shopRevision || !sameItems) {
      throw new FarmPurchaseRequestIdempotencyConflictError();
    }

    const storedWake = this.#database.getBellWake(current.residentId, current.wakeId);
    const storedText = storedWake?.payload?.text;
    return {
      request: current,
      created: false,
      notificationText:
        typeof storedText === "string"
          ? storedText
          : buildFarmPurchaseNotificationText(current.humanName, current.shop, current.items),
    };
  }

  get(
    residentId: string,
    requestId: string,
    now = this.#now(),
  ): FarmPurchaseRequestRecord | undefined {
    const expired = this.#database.expireFarmPurchaseRequest(residentId, requestId, now);
    this.#notifyCancelled(residentId, expired?.cancelledWakeIds ?? []);
    return this.#database.getFarmPurchaseRequest(residentId, requestId);
  }

  #notifyCancelled(residentId: string, wakeIds: readonly string[], now = this.#now()): void {
    for (const wakeId of wakeIds) {
      if (this.#bellNotifier?.notifyWakeCancelled) {
        this.#bellNotifier.notifyWakeCancelled(residentId, wakeId);
      } else {
        this.#bellNotifier?.cancelWake(residentId, wakeId, now);
      }
    }
  }
}
