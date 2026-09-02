import { animalById } from "../../content.js";
import { allFarms, getFarm } from "../../store.js";

function publicName(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function serviceCommissionWorkerName(database, residentId) {
    const binding = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?")
        .get(residentId);
    if (!binding?.binding_reference)
        return null;
    const matches = allFarms().filter((farm) =>
        farm?.doorbellMcpMigration?.migrationId === binding.binding_reference);
    if (matches.length !== 1)
        return null;
    const farm = matches[0];
    return publicName(farm.aiName) ?? publicName(farm.name) ?? publicName(farm.id);
}

export function serviceCommissionObjectLabel(source) {
    const fact = source.fact ?? {};
    if (source.career === "agronomist") {
        const plotId = fact.plotId ?? Number(/:plot:(\d+)$/u.exec(source.objectId ?? "")?.[1]);
        return Number.isSafeInteger(plotId) && plotId > 0 ? `第${plotId}块地` : "农场地块";
    }
    const object = /^(.*):animal:(\d+)$/u.exec(source.objectId ?? "");
    const index = fact.animalIndex ?? (object ? Number(object[2]) : null);
    const farm = getFarm(fact.farmDoorplate ?? object?.[1]);
    const animal = Number.isSafeInteger(index) ? farm?.ranch?.animals?.[index] : null;
    const currentAnimal = animal?.lingyeHealth?.sourceId === source.sourceId ? animal : null;
    const name = publicName(currentAnimal?.name);
    if (name)
        return name;
    const kind = animalById.get(fact.animalKindId ?? currentAnimal?.kindId);
    const kindName = publicName(kind?.name) ?? "动物";
    return Number.isSafeInteger(index) && index >= 0 ? `${kindName}（牧场第${index + 1}只）` : kindName;
}

export function serviceCommissionTargetLabel(career, workerName, objectLabel, alreadyPublished = false) {
    const action = career === "veterinarian" ? "医生接诊" : "农艺师处理";
    return `${alreadyPublished ? "改为请" : "请"}${workerName}${action}：${objectLabel}`;
}
