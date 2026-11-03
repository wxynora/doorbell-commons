import { readReporterBoardSnapshot } from "./reporter-board-snapshot.js";
import { readReporterDetentionMaterials } from "./reporter-detention-material.js";
import { readInterviewReporterMaterials } from "../together-season3/reporter-materials.js";
import { currentDayIndex } from "../time.js";
import { getPublicExpeditionWorld, playerFarms } from "../store.js";
import { beijingDayStart } from "../nature.js";
import { beijingDate } from "./persistence.js";

const BOARD_TITLES = Object.freeze({
    todayTasks: "卷王榜（今日完成任务）",
    todayLogins: "网瘾榜（今日巡视农场）",
    todayMessages: "小纸条榜（今日给人留言）",
    todayEvents: "奇遇榜（今日触发随机事件）",
    todayStolen: "大盗榜（今日成功偷菜）",
    todayWatered: "热心榜（今日成功帮人浇水）",
    todaySpent: "败家榜（今日花掉金币）",
    todayOddDishes: "厨鬼榜（今日做出微妙料理）",
    todayRaidIncome: "摸金榜（今日偷到金币）",
    todayRaidLoss: "漏财榜（今日损失金币）",
});

function todayBoardMaterials(database, now) {
    const day = currentDayIndex(now) - 1;
    const boards = readReporterBoardSnapshot(database, day, now);
    return Object.entries(BOARD_TITLES).flatMap(([key, title]) => {
        const rows = boards[key] ?? [];
        if (rows.length === 0)
            return [];
        return [{
            category: "today_board",
            occurredAt: beijingDayStart(day + 1) - 1,
            title: `${beijingDate(beijingDayStart(day))} ${title}`,
            content: rows.map((row, index) =>
                `${index + 1}. ${row.title ? `✧${publicText(row.title)}✧` : ""}${publicText(row.name)} — ${row.value}`)
                .join("\n"),
        }];
    });
}

function publicText(value) {
    return String(value ?? "").replace(/[<>\r]/gu, "").trim();
}

function togetherPublicMaterial(entry, occurredAt) {
    if (entry?.kind === "choice") {
        const step = Number(entry.step);
        const option = publicText(entry.option);
        const label = publicText(entry.label);
        if (!Number.isSafeInteger(step) || step < 1 || !["A", "B", "C"].includes(option) || !label)
            return null;
        return {
            category: "lingye_together",
            occurredAt,
            title: `铃野共行第 ${step} 次公共选择`,
            content: `${option}：${label}`,
        };
    }
    if (entry?.kind === "task") {
        const title = publicText(entry.title);
        const text = publicText(entry.text);
        const progress = Math.max(0,
            Math.floor(Number(entry.contributions?.length ?? entry.progress) || 0));
        const target = Math.max(1, Math.floor(Number(entry.target) || 1));
        if (!title || !text)
            return null;
        return {
            category: "lingye_together",
            occurredAt,
            title,
            content: `${text}\n公开进度：${progress}/${target}`,
        };
    }
    if (["story", "clue", "ending"].includes(entry?.kind)) {
        const title = publicText(entry.title);
        const text = publicText(entry.text);
        if (!title || !text)
            return null;
        return {
            category: "lingye_together",
            occurredAt,
            title,
            content: text,
        };
    }
    return null;
}

function togetherEventTimestamp(entry, periodStart, periodEnd) {
    const candidates = [
        entry?.at,
        entry?.occurredAt,
        entry?.startedAt,
        entry?.completedAt,
        entry?.endedAt,
        ...(Array.isArray(entry?.voters) ? entry.voters.map((item) => item?.at) : []),
        ...(Array.isArray(entry?.contributions) ? entry.contributions.map((item) => item?.at) : []),
    ].filter((value) => Number.isSafeInteger(value) &&
        value >= periodStart && value <= periodEnd);
    return candidates.length > 0 ? Math.max(...candidates) : periodEnd;
}

function togetherMaterials(database, window) {
    const world = getPublicExpeditionWorld();
    const storyId = String(world?.storyId ?? "").trim();
    const storyRound = Number(world?.round);
    const history = Array.isArray(world?.history) ? world.history : [];
    if (!storyId || !Number.isSafeInteger(storyRound) || storyRound < 1)
        return [];
    const cursor = database.prepare(`SELECT * FROM career_reporter_together_cursors
      WHERE story_id = ? AND story_round = ?`).get(storyId, storyRound);
    const canUseDelta = cursor && cursor.observed_at >= window.periodStart &&
        cursor.observed_at <= window.periodEnd && cursor.history_count <= history.length;
    const startIndex = canUseDelta ? cursor.history_count : history.length;
    database.prepare(`INSERT INTO career_reporter_together_cursors (
      story_id, story_round, history_count, observed_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(story_id, story_round) DO UPDATE SET
      history_count = excluded.history_count,
      observed_at = excluded.observed_at`)
        .run(storyId, storyRound, history.length, window.periodEnd);
    if (!canUseDelta)
        return [];
    return history.slice(startIndex).flatMap((entry) => {
        const material = togetherPublicMaterial(entry,
            togetherEventTimestamp(entry, window.periodStart, window.periodEnd));
        return material ? [material] : [];
    });
}

export function collectReporterFarmFacts(database, window) {
    return [
        ...todayBoardMaterials(database, window.periodEnd),
        ...togetherMaterials(database, window),
        ...readInterviewReporterMaterials(database, window),
        ...readReporterDetentionMaterials(database, playerFarms(), window.periodEnd),
    ];
}
