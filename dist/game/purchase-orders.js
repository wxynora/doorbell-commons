import { randomUUID } from "node:crypto";
import {
  cookingIngredients,
  cookingIngredientById,
  materials,
  materialById,
} from "../content.js";
import { MARKET_FEE } from "../config.js";
import { ensureKitchen } from "../engine.js";

const PURCHASE_ORDER_KINDS = new Set(["material", "ingredient"]);

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function resolveDefinition(kindRaw, idRaw) {
  const kind = String(kindRaw ?? "");
  const key = String(idRaw ?? "").trim();
  if (!PURCHASE_ORDER_KINDS.has(kind) || !key) return null;
  if (kind === "material") {
    const item = materialById.get(key) ?? materials.find((entry) => entry.name === key);
    return item ? { kind, id: item.id, item } : null;
  }
  const item = cookingIngredientById.get(key) ?? cookingIngredients.find((entry) => entry.name === key);
  return item ? { kind, id: item.id, item } : null;
}

function stockSelection(farm, definition, quantity) {
  const stock = definition.kind === "material"
    ? farm.materials
    : ensureKitchen(farm).ingredients;
  const available = stock[definition.id] ?? 0;
  return available >= quantity
    ? { ok: true }
    : { ok: false, error: `「${definition.item.name}」只有 ${available} 份，不够 ${quantity} 份。` };
}

function removeStock(farm, definition, quantity) {
  const stock = definition.kind === "material"
    ? farm.materials
    : ensureKitchen(farm).ingredients;
  stock[definition.id] -= quantity;
  if (stock[definition.id] <= 0) delete stock[definition.id];
}

function addStock(farm, definition, quantity) {
  const stock = definition.kind === "material"
    ? farm.materials
    : ensureKitchen(farm).ingredients;
  stock[definition.id] = (stock[definition.id] ?? 0) + quantity;
}

export function purchaseOrderInventoryCount(farm, kind, itemId) {
  const definition = resolveDefinition(kind, itemId);
  if (!definition) return 0;
  const stock = definition.kind === "material"
    ? (farm.materials ?? {})
    : (farm?.ranch?.kitchen?.ingredients ?? {});
  return Number.isSafeInteger(stock[definition.id]) && stock[definition.id] > 0 ? stock[definition.id] : 0;
}

export function purchaseOrderItemDefinitions(farm) {
  const rows = [];
  for (const item of materials) {
    rows.push({
      kind: "material",
      id: item.id,
      name: item.name,
      rarity: item.rarity ?? null,
      ownedQuantity: purchaseOrderInventoryCount(farm, "material", item.id),
    });
  }
  for (const item of cookingIngredients) {
    rows.push({
      kind: "ingredient",
      id: item.id,
      name: item.name,
      rarity: item.rarity ?? null,
      ownedQuantity: purchaseOrderInventoryCount(farm, "ingredient", item.id),
    });
  }
  return rows;
}

export function humanPurchaseOrders(farm) {
  return Array.isArray(farm.humanPurchaseOrders) ? farm.humanPurchaseOrders : [];
}

export function createPurchaseOrder(farm, kind, itemId, targetQuantityRaw, unitPriceRaw, now = Date.now()) {
  const definition = resolveDefinition(kind, itemId);
  const targetQuantity = positiveInteger(targetQuantityRaw);
  const unitPrice = positiveInteger(unitPriceRaw);
  if (!definition) return { ok: false, error: "请选择集市里真实存在、可以交付的物品。" };
  if (!targetQuantity || !unitPrice) return { ok: false, error: "收购数量和每份单价都要填写正整数。" };
  const order = {
    id: randomUUID(),
    kind: definition.kind,
    itemId: definition.id,
    targetQuantity,
    filledQuantity: 0,
    unitPrice,
    listedAt: now,
  };
  (farm.humanPurchaseOrders ??= []).push(order);
  return { ok: true, order, definition };
}

export function cancelPurchaseOrder(farm, orderId) {
  const orders = humanPurchaseOrders(farm);
  const order = orders.find((entry) => entry.id === String(orderId));
  if (!order) return { ok: false, error: "这张收购单已经完成或撤下了。" };
  farm.humanPurchaseOrders = orders.filter((entry) => entry !== order);
  return { ok: true, order };
}

export function fulfillPurchaseOrder(orderOwner, fulfiller, orderId, requestedQuantityRaw, now = Date.now()) {
  if (orderOwner.id === fulfiller.id) return { ok: false, error: "不能向自己发布的收购单交货。" };
  const orders = humanPurchaseOrders(orderOwner);
  const order = orders.find((entry) => entry.id === String(orderId));
  if (!order) return { ok: false, error: "这张收购单已经完成或撤下了。" };
  const definition = resolveDefinition(order.kind, order.itemId);
  const requestedQuantity = positiveInteger(requestedQuantityRaw);
  const targetQuantity = positiveInteger(order.targetQuantity);
  const filledQuantity = Number.isSafeInteger(order.filledQuantity) && order.filledQuantity >= 0
    ? order.filledQuantity
    : null;
  const unitPrice = positiveInteger(order.unitPrice);
  if (!definition || !requestedQuantity || !targetQuantity || filledQuantity === null || filledQuantity >= targetQuantity || !unitPrice) {
    return { ok: false, error: "这张收购单的数据不完整，暂时不能交货。" };
  }
  const remainingQuantity = targetQuantity - filledQuantity;
  const quantity = Math.min(requestedQuantity, remainingQuantity);
  const selection = stockSelection(fulfiller, definition, quantity);
  if (!selection.ok) return selection;
  const cost = quantity * unitPrice;
  if (!Number.isSafeInteger(orderOwner.silver) || orderOwner.silver < cost) {
    return { ok: false, error: `收购方当前银币不足，本次 ${quantity} 份交货没有执行。` };
  }
  const fee = Math.floor(cost * MARKET_FEE);
  orderOwner.silver -= cost;
  fulfiller.silver += cost - fee;
  removeStock(fulfiller, definition, quantity);
  addStock(orderOwner, definition, quantity);
  order.filledQuantity = filledQuantity + quantity;
  const complete = order.filledQuantity >= targetQuantity;
  if (complete) orderOwner.humanPurchaseOrders = orders.filter((entry) => entry !== order);
  return {
    ok: true,
    order,
    definition,
    quantity,
    remainingQuantity: Math.max(0, targetQuantity - order.filledQuantity),
    complete,
    cost,
    fee,
    unitPrice,
  };
}
