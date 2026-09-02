import { animalById } from "../content.js";
import { plotAgronomyIssues } from "../career/p3-world.js";

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

/** Read existing cases only; do not advance, diagnose, treat or persist them. */
export function projectHealthBulletinNotices(farm) {
    const notices = [];
    for (const plot of Array.isArray(farm.plots) ? farm.plots : []) {
        if (!Number.isSafeInteger(plot?.id) || plot.id <= 0)
            continue;
        for (const issue of plotAgronomyIssues(plot)) {
            const statusText = AGRONOMY_STATUS_TEXT[issue?.status];
            if (!statusText || typeof issue.sourceId !== "string" || !issue.sourceId)
                continue;
            notices.push({
                text: `第 ${plot.id} 块地${statusText}。`,
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
        notices.push({
            text: `「${name}」${statusText}。`,
            at: health.status === "recovering" ? health.treatedAt ?? health.generatedAt : health.generatedAt,
            section: "动物健康",
            identity: { kind: "animal", sourceId: health.sourceId, status: health.status },
        });
    }
    return notices;
}
