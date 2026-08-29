import {
    PET_NAME_MAX,
    RANCH_PATROL_GOOSE_BUY_COST,
    RANCH_PATROL_GOOSE_ID,
    RANCH_PATROL_GOOSE_NAME,
} from "../../config.js";
import { accessoryById, animalById, petById, ranchSkinById } from "../../content.js";
import { pushLog } from "../shared/notifications.js";
import { pushLedger } from "./ledger.js";
import { ensureRanch } from "./state.js";

const ACC_PER_ANIMAL_MAX = 3;

/** 聚合当前农场所有宠物的 buff：luck=收获额外运气（累加）、dropMult=素材/药水掉落倍率（连乘）、foil=偷菜被吓退概率（取最大）。 */
export function petBuffs(farm, now = Date.now()) {
    let luck = 0, dropMult = 1, foil = 0;
    for (const p of farm.ranch?.pets ?? []) {
        const k = petById.get(p.kindId);
        if (!k)
            continue;
        const skinBonus = ranchSkinById.get(p.variantId)?.bonus ?? {};
        luck += (k.params.luck ?? 0) + (Number(skinBonus.luckAdd) || 0);
        if (k.params.dropMult)
            dropMult *= k.params.dropMult + (Number(skinBonus.dropMultAdd) || 0);
        foil = Math.max(foil, (k.params.foil ?? 0) + (Number(skinBonus.foilAdd) || 0));
        const dishBuff = p.dishBuff;
        if (dishBuff?.endsAt > now) {
            if (k.buff === "luck") {
                luck *= 1 + dishBuff.bonus;
                dropMult *= 1 + dishBuff.bonus;
            }
            if (k.buff === "guard")
                foil += dishBuff.bonus;
        }
    }
    return { luck, dropMult, foil: Math.min(1, foil) };
}

/** AI 给伴侣的牧场请一只独立常驻巡逻鹅；无图鉴门槛，只检查余额和是否已拥有。 */
export function buyPatrolGoose(farm, now) {
    if (farm.ranch?.patrolGoose)
        return { ok: false, error: `${RANCH_PATROL_GOOSE_NAME}已经在牧场常驻巡逻了，不需要重复购买。` };
    if (farm.coins < RANCH_PATROL_GOOSE_BUY_COST)
        return { ok: false, error: `金币不足，${RANCH_PATROL_GOOSE_NAME}要 ${RANCH_PATROL_GOOSE_BUY_COST} 金（你有 ${farm.coins}）` };
    farm.coins -= RANCH_PATROL_GOOSE_BUY_COST;
    const ranch = ensureRanch(farm);
    ranch.patrolGoose = { boughtAt: now };
    pushLedger(farm, "buy-patrol-goose", RANCH_PATROL_GOOSE_BUY_COST, `给牧场请来${RANCH_PATROL_GOOSE_NAME}`, now);
    pushLog(farm, `给伴侣的牧场请来${RANCH_PATROL_GOOSE_NAME}（-${RANCH_PATROL_GOOSE_BUY_COST}）`);
    return { ok: true, name: RANCH_PATROL_GOOSE_NAME, cost: RANCH_PATROL_GOOSE_BUY_COST };
}

/** 伴侣在前端 pin / 取消 pin 一只动物、宠物或巡逻鹅：被 pin 的才会出现在农场氛围句里。 */
export function ranchTogglePin(farm, kindId) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const id = String(kindId);
    const owns = (ranch.animals ?? []).some((a) => a.kindId === id)
        || (ranch.pets ?? []).some((p) => p.kindId === id)
        || (id === RANCH_PATROL_GOOSE_ID && !!ranch.patrolGoose);
    if (!owns)
        return { ok: false, error: "你还没养这只，不能 pin。" };
    ranch.pinned ??= [];
    let pinned;
    if (ranch.pinned.includes(id)) {
        ranch.pinned = ranch.pinned.filter((x) => x !== id);
        pinned = false;
    }
    else {
        ranch.pinned.push(id);
        pinned = true;
    }
    const name = id === RANCH_PATROL_GOOSE_ID
        ? ranch.patrolGoose?.name || RANCH_PATROL_GOOSE_NAME
        : animalById.get(id)?.name ?? petById.get(id)?.name ?? id;
    return { ok: true, pinned, name };
}

/** 伴侣在人类前端给动物改名（每只独特名字；和宠物一样）。 */
export function ranchNameAnimal(farm, animalIdx, name) {
    const ranch = farm.ranch;
    if (!ranch?.animals?.length)
        return { ok: false, error: "牧场还没有动物。" };
    const a = ranch.animals[Math.floor(Number(animalIdx))];
    if (!a)
        return { ok: false, error: "选的动物不存在。" };
    const nm = String(name).trim().slice(0, PET_NAME_MAX);
    if (!nm)
        return { ok: false, error: "名字不能为空。" };
    a.name = nm;
    return { ok: true, name: nm, kind: animalById.get(a.kindId)?.name ?? a.kindId };
}

/** 伴侣在人类前端给宠物改名（每只独特名字）。 */
export function ranchNamePet(farm, petIdx, name) {
    const ranch = farm.ranch;
    if (!ranch?.pets?.length)
        return { ok: false, error: "牧场还没有宠物。" };
    const p = ranch.pets[Math.floor(Number(petIdx))];
    if (!p)
        return { ok: false, error: "选的宠物不存在。" };
    const nm = String(name).trim().slice(0, PET_NAME_MAX);
    if (!nm)
        return { ok: false, error: "名字不能为空。" };
    p.name = nm;
    return { ok: true, name: nm, kind: petById.get(p.kindId)?.name ?? p.kindId };
}

/** 伴侣给独立常驻的巡逻鹅改名。 */
export function ranchNamePatrolGoose(farm, name) {
    const goose = farm.ranch?.patrolGoose;
    if (!goose)
        return { ok: false, error: `牧场还没有${RANCH_PATROL_GOOSE_NAME}。` };
    const nm = String(name).trim().slice(0, PET_NAME_MAX);
    if (!nm)
        return { ok: false, error: "名字不能为空。" };
    goose.name = nm;
    return { ok: true, name: nm, kind: RANCH_PATROL_GOOSE_NAME };
}

function ranchAccessoryHost(ranch, target, idx) {
    if (target === "goose")
        return ranch.patrolGoose;
    if (target === "pet")
        return ranch.pets?.[Math.floor(Number(idx))];
    return ranch.animals?.[Math.floor(Number(idx))];
}

function ranchAccessoryHostName(host, target) {
    if (target === "goose")
        return host.name || RANCH_PATROL_GOOSE_NAME;
    return host.name || (target === "pet" ? petById.get(host.kindId)?.name : animalById.get(host.kindId)?.name) || host.kindId;
}

/** 从仓库取一件配饰，戴到某只动物、宠物或巡逻鹅身上。 */
export function ranchWearAccessory(farm, target, idx, accId) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const acc = accessoryById.get(String(accId));
    if (!acc)
        return { ok: false, error: `没有这件配饰：${accId}` };
    const wd = ranch.wardrobe ?? [];
    if (!wd.includes(acc.id))
        return { ok: false, error: `仓库里没有${acc.name}，先去牧场商店买一件。` };
    const host = ranchAccessoryHost(ranch, target, idx);
    if (!host)
        return { ok: false, error: "选的对象不存在。" };
    const nm = ranchAccessoryHostName(host, target);
    host.acc ??= [];
    if (host.acc.includes(acc.id))
        return { ok: false, error: `${nm}已经戴着${acc.name}了。` };
    if (host.acc.length >= ACC_PER_ANIMAL_MAX)
        return { ok: false, error: `${nm}最多戴 ${ACC_PER_ANIMAL_MAX} 件。` };
    wd.splice(wd.indexOf(acc.id), 1); // 从仓库移走这一件
    ranch.wardrobe = wd;
    host.acc.push(acc.id);
    return { ok: true, name: acc.name, wearer: nm };
}

/** 把某只动物、宠物或巡逻鹅身上的一件配饰脱下，放回仓库。 */
export function ranchTakeOffAccessory(farm, target, idx, accId) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const acc = accessoryById.get(String(accId));
    if (!acc)
        return { ok: false, error: `没有这件配饰：${accId}` };
    const host = ranchAccessoryHost(ranch, target, idx);
    if (!host || !(host.acc ?? []).includes(acc.id))
        return { ok: false, error: `没穿着${acc.name}。` };
    const nm = ranchAccessoryHostName(host, target);
    host.acc.splice(host.acc.indexOf(acc.id), 1);
    (ranch.wardrobe ??= []).push(acc.id);
    return { ok: true, name: acc.name, wearer: nm };
}
