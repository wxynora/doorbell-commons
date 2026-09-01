import { Rng } from "../../rng.js";
import { currentDayIndex } from "../../time.js";
import { bumpDaily } from "../../daily.js";
import {
    accessories,
    accessoryById,
    decorations,
    decorationById,
    expDecorById,
} from "../../content.js";
import { aiDisplay } from "./display.js";

const RANCH_SHOP_ACC_PER_DAY = 2; // 牧场商店每天随机刷几件配饰
const RANCH_SHOP_DECOR_PER_DAY = 2; // 牧场商店每天随机刷几件装饰

function pickN(rng, pool, n) {
    const a = [...pool], out = [];
    for (let i = 0; i < n && a.length; i++)
        out.push(a.splice(rng.int(a.length), 1)[0]);
    return out;
}

/** 牧场商店：每天随机刷新 2 件配饰 + 2 件装饰（装饰只从还没买过的里挑）。当天已刷过则不动。 */
export function refreshRanchShop(farm, now) {
    const ranch = farm.ranch;
    if (!ranch)
        return;
    const day = currentDayIndex(now);
    if (ranch.shop && ranch.shop.day === day)
        return;
    const rng = new Rng(farm.rngState);
    const accPool = accessories.map((a) => a.id);
    const owned = new Set([...(ranch.decor ?? []), ...(ranch.decorStore ?? [])]); // 已摆 + 仓库里的，都算已拥有，不再上架
    const decoPool = decorations.filter((d) => !owned.has(d.id)).map((d) => d.id);
    ranch.shop = { day, acc: pickN(rng, accPool, RANCH_SHOP_ACC_PER_DAY), decor: pickN(rng, decoPool, RANCH_SHOP_DECOR_PER_DAY) };
    farm.rngState = rng.state;
}

/** 买一件配饰进仓库（花牧场金币；必须是今日商店上架的）。穿戴到动物/宠物在仓库页做。 */
export function ranchBuyAccessory(farm, accId, now) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: `还没有牧场（先让${aiDisplay(farm)}买只动物送进来）。` };
    refreshRanchShop(farm, now);
    const acc = accessoryById.get(String(accId));
    if (!acc)
        return { ok: false, error: `没有这件配饰：${accId}` };
    if (!ranch.shop?.acc.includes(acc.id))
        return { ok: false, error: `${acc.name}不在今天的牧场商店里（每天随机刷 2 件，明天再看看）。` };
    if (ranch.coins < acc.price)
        return { ok: false, error: `牧场金币不足（${acc.name}要 ${acc.price}，现有 ${ranch.coins}）。` };
    ranch.coins -= acc.price;
    bumpDaily(farm, now, "coinSpend", acc.price);
    (ranch.wardrobe ??= []).push(acc.id);
    return { ok: true, name: acc.name, cost: acc.price };
}

/** 买一件装饰进仓库（花牧场金币；必须是今日商店上架的）。摆出展示在仓库页做。 */
export function ranchBuyDecoration(farm, decoId, now) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: `还没有牧场（先让${aiDisplay(farm)}买只动物送进来）。` };
    refreshRanchShop(farm, now);
    const deco = decorationById.get(String(decoId));
    if (!deco)
        return { ok: false, error: `没有这个装饰：${decoId}` };
    if ((ranch.decor ?? []).includes(deco.id) || (ranch.decorStore ?? []).includes(deco.id))
        return { ok: false, error: `「${deco.name}」你已经有了。` };
    if (!ranch.shop?.decor.includes(deco.id))
        return { ok: false, error: `「${deco.name}」不在今天的牧场商店里（每天随机刷 2 件，明天再看看）。` };
    if (ranch.coins < deco.price)
        return { ok: false, error: `牧场金币不足（${deco.name}要 ${deco.price}，现有 ${ranch.coins}）。` };
    ranch.coins -= deco.price;
    bumpDaily(farm, now, "coinSpend", deco.price);
    (ranch.decorStore ??= []).push(deco.id);
    return { ok: true, name: deco.name, cost: deco.price };
}

/** 从仓库把一件装饰摆出来展示（别人 visit 时可见）。decoId 可为商店装饰或秘境装饰。 */
export function ranchPlaceDecoration(farm, decoId) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const id = String(decoId);
    const deco = decorationById.get(id) ?? expDecorById.get(id);
    const store = ranch.decorStore ?? [];
    if (!store.includes(id))
        return { ok: false, error: `仓库里没有「${deco?.name ?? id}」。` };
    store.splice(store.indexOf(id), 1);
    ranch.decorStore = store;
    (ranch.decor ??= []).push(id);
    return { ok: true, name: deco?.name ?? id };
}

/** 把已摆出的装饰收回仓库。 */
export function ranchUnplaceDecoration(farm, decoId) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const id = String(decoId);
    const deco = decorationById.get(id) ?? expDecorById.get(id);
    const decor = ranch.decor ?? [];
    if (!decor.includes(id))
        return { ok: false, error: `「${deco?.name ?? id}」没在展示。` };
    decor.splice(decor.indexOf(id), 1);
    ranch.decor = decor;
    (ranch.decorStore ??= []).push(id);
    return { ok: true, name: deco?.name ?? id };
}
