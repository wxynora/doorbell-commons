import { RANCH_PATROL_GOOSE_ID, RANCH_PATROL_GOOSE_NAME } from "../../config.js";
import {
    accessoryById,
    animalById,
    decorationById,
    expDecorById,
    petById,
} from "../../content.js";

/** 把一只宠物渲染成一句现身氛围句（名字 + 穿戴 + emoji）。 */
function roamForPet(p) {
    const kind = petById.get(p.kindId);
    if (!kind || !kind.roam.length)
        return "";
    const line = kind.roam[Math.floor(Math.random() * kind.roam.length)];
    const descs = (p.acc ?? []).map((id) => accessoryById.get(id)?.desc).filter(Boolean);
    const acc = descs.length ? descs.join("、") + "的" : "";
    const name = p.name || kind.name;
    return (kind.emoji ? kind.emoji + " " : "") + line.replace("{acc}", acc).replace("{name}", name);
}

function roamForPatrolGoose(goose) {
    const descs = (goose.acc ?? []).map((id) => accessoryById.get(id)?.desc).filter(Boolean);
    const acc = descs.length ? descs.join("、") + "的" : "";
    return `🪿 ${acc}${goose.name || RANCH_PATROL_GOOSE_NAME}：它会常驻牧场巡逻。`;
}

/** 把一只动物渲染成一句现身氛围句（物种 + 穿戴）。 */
function roamForAnimal(a) {
    const kind = animalById.get(a.kindId);
    if (!kind)
        return "";
    const descs = (a.acc ?? []).map((id) => accessoryById.get(id)?.desc).filter(Boolean);
    const acc = descs.length ? descs.join("、") + "的" : "";
    // 和宠物一样：{name} 槽填伴侣起的名字，没起名回落种类名（roam 文案都带 {name} 槽）。
    const name = a.name?.trim() || kind.name;
    return kind.roam.replace("{acc}", acc).replace("{name}", name);
}

/** AI 状态里随机一句宠物现身氛围句（从全部宠物里随机；没养宠物则空串）。 */
export function petRoamLine(farm) {
    const list = farm.ranch?.pets ?? [];
    if (!list.length)
        return "";
    return roamForPet(list[Math.floor(Math.random() * list.length)]);
}

/** 牧场氛围句：从动物 + 宠物 + 独立巡逻鹅里随机出一句（状态里只占一行）。
 *  伴侣 pin 了若干只时，只从被 pin 的里随机（只 pin 一只=固定只出现它）；没 pin 则全部参与。 */
export function ranchRoamLine(farm) {
    const ranch = farm.ranch;
    if (!ranch)
        return "";
    const pinned = ranch.pinned ?? [];
    const usePin = pinned.length > 0;
    const cands = [];
    for (const a of ranch.animals ?? [])
        if (!usePin || pinned.includes(a.kindId))
            cands.push(() => roamForAnimal(a));
    for (const p of ranch.pets ?? [])
        if (!usePin || pinned.includes(p.kindId))
            cands.push(() => roamForPet(p));
    if (ranch.patrolGoose && (!usePin || pinned.includes(RANCH_PATROL_GOOSE_ID)))
        cands.push(() => roamForPatrolGoose(ranch.patrolGoose));
    if (!cands.length)
        return "";
    return cands[Math.floor(Math.random() * cands.length)]();
}

export function animalRoamLine(farm) {
    const list = farm.ranch?.animals ?? [];
    if (!list.length)
        return "";
    return roamForAnimal(list[Math.floor(Math.random() * list.length)]);
}

/** 别人 visit 时展示的装饰物描述（伴侣买的农场装饰）。没有则空串。 */
export function decorLines(farm) {
    return (farm.ranch?.decor ?? []).map((id) => (decorationById.get(id) ?? expDecorById.get(id))?.visitLine).filter(Boolean).join("\n");
}
