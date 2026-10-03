import { animalById } from "../content.js";
import { recoveredPlotNotices } from "../nature/recovery.js";
import { plotAgronomyIssues, agronomyObservationsFor, animalObservationsFor } from "../career/p3-world.js";

const AGRONOMY_STATUS_TEXT = {
    open: "有待处理的农事异常",
    stabilized: "的农事异常已稳定，仍需继续处理",
    treating: "的农事异常正在处理中",
};
const ANIMAL_STATUS_TEXT = {
    open: "需要治疗",
    treating: "正在治疗中",
    recovering: "正在恢复中",
};
const OBSERVATION_TEXT = {
    leaf_wilt: "叶片发蔫",
    soil_surface_dry: "土面干裂",
    soil_surface_saturated: "土面涝渍发亮",
    lower_leaf_yellowing: "下部叶片发黄",
    leaf_damage: "叶片有啃咬痕迹",
    visible_pest_trace: "叶间可见虫迹",
    uneven_leaf_color: "叶色深浅不匀",
    uneven_growth: "长势参差",
    whole_plant_wilt: "整株打蔫",
    root_zone_instability: "根际松动",
    reduced_appetite: "食欲下降",
    abdominal_discomfort: "肚子不舒服",
    reduced_activity: "不太爱动",
    localized_injury_trace: "身上有轻微外伤",
    damp_coat_or_feathers: "毛羽潮湿",
    increased_water_intake: "喝水明显变多",
    abnormal_breathing: "呼吸不太顺畅",
    dehydration_sign: "有脱水迹象",
};
function observationText(observations) {
    const visible = (observations ?? []).map((key) => OBSERVATION_TEXT[key]).filter(Boolean);
    return visible.length ? `（${visible.join("、")}）` : "";
}

/** Read existing cases only; do not advance, diagnose, treat or persist them. */
export function projectHealthBulletinNotices(farm) {
    const notices = recoveredPlotNotices(farm);
    for (const plot of Array.isArray(farm.plots) ? farm.plots : []) {
        if (!Number.isSafeInteger(plot?.id) || plot.id <= 0)
            continue;
        for (const issue of plotAgronomyIssues(plot)) {
            const statusText = AGRONOMY_STATUS_TEXT[issue?.status];
            if (!statusText || typeof issue.sourceId !== "string" || !issue.sourceId)
                continue;
            notices.push({
                text: `第 ${plot.id} 块地${statusText}${observationText(agronomyObservationsFor(issue.condition))}。`,
                at: issue.generatedAt,
                section: "农事提醒",
                identity: { kind: "agronomy", sourceId: issue.sourceId, plotId: plot.id, status: issue.status },
            });
        }
    }
    for (const animal of Array.isArray(farm.ranch?.animals) ? farm.ranch.animals : []) {
        const health = animal?.lingyeHealth;
        const statusText = ANIMAL_STATUS_TEXT[health?.status];
        if (!statusText || typeof health.sourceId !== "string" || !health.sourceId)
            continue;
        const name = animal.name || animalById.get(animal.kindId)?.name || "牧场动物";
        const condition = String(health.condition ?? "").trim();
        notices.push({
            text: `「${name}」${statusText}${observationText(animalObservationsFor(condition))}。`,
            at: health.status === "recovering" ? health.treatedAt ?? health.generatedAt : health.generatedAt,
            section: "动物健康",
            identity: { kind: "animal", sourceId: health.sourceId, status: health.status },
        });
    }
    return notices;
}
