import { ranchSkinById, ranchSkinByName, ranchSkins } from "../../content.js";
import { bumpDaily } from "../../daily.js";
import { pushLog } from "../shared/notifications.js";
import { pushLedger } from "./ledger.js";
import { ensureRanch } from "./state.js";

export function ranchSkinSaleActive(skin, now = Date.now()) {
    const startsAt = Date.parse(String(skin?.startsAt ?? ""));
    const endsAt = Date.parse(String(skin?.endsAt ?? ""));
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt;
}

export function ranchSkinShop(farm, now = Date.now()) {
    const owned = new Set(Array.isArray(farm?.ranch?.skins) ? farm.ranch.skins : []);
    return ranchSkins
        .filter((skin) => ranchSkinSaleActive(skin, now))
        .map((skin) => ({ ...skin, owned: owned.has(skin.id) }));
}

export function ranchSkinVariantsFor(farm, type, kindId) {
    const owned = new Set(Array.isArray(farm?.ranch?.skins) ? farm.ranch.skins : []);
    return ranchSkins.filter((skin) => skin.targetType === type && skin.targetKindId === kindId && owned.has(skin.id));
}

export function resolveRanchSkin(value) {
    const key = String(value ?? "").trim();
    return ranchSkinById.get(key) ?? ranchSkinByName.get(key);
}

export function buyRanchSkinItem(farm, value, now = Date.now()) {
    const skin = resolveRanchSkin(value);
    if (!skin)
        return { handled: false };
    if (!ranchSkinSaleActive(skin, now))
        return { handled: true, ok: false, error: `「${skin.name}」当前不在售。` };
    const ranch = ensureRanch(farm);
    ranch.skins ??= [];
    if (ranch.skins.includes(skin.id))
        return { handled: true, ok: false, error: `「${skin.name}」已经拥有，不需要重复购买。` };
    if (farm.coins < skin.price)
        return { handled: true, ok: false, error: `金币不足，1 个${skin.name}要 ${skin.price}` };
    farm.coins -= skin.price;
    bumpDaily(farm, now, "coinSpend", skin.price);
    ranch.skins.push(skin.id);
    pushLedger(farm, "buy-item", skin.price, `买下限定皮肤${skin.name}`, now);
    pushLog(farm, `买了 1 个${skin.name}`);
    return { handled: true, ok: true, name: skin.name, qty: 1, left: 1, cost: skin.price };
}
