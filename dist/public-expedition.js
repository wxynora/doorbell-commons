// 铃野共行：独立于每家 f.expedition 的全服共享分支故事。
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { currentDayIndex } from "./time.js";
import { crops } from "./content.js";
import { Rng } from "./rng.js";
import { pushInbox, pushRanchNotice } from "./engine.js";
import { checkTitles, titleById } from "./titles.js";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../content");
export const publicExpeditionContent = JSON.parse(readFileSync(resolve(DIR, "public-expedition.json"), "utf8"));
const VALID_OPTIONS = new Set(["A", "B", "C"]);
const CONTRIBUTION_TARGET = 3;
const CHOICE_TARGET = 3;
const MAX_CHOICES_PER_FARM = 2;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;
const ENDING_REWARD_COINS = 1500;
const ENDING_REWARD_SILVER = 150;
const SP_SEEDS = crops.filter((crop) => crop.rarity === "SP" && crop.seedPrice === 3600);
const ENDING_TITLE_ID = {
    second_home: "together_second_home",
    quiet_harvest: "together_quiet_harvest",
    ten_thousand_bottles: "together_ten_thousand_bottles",
    no_address: "together_no_address",
};
const ENDING_ART = {
    second_home: "ending-second-home-v3.webp",
    quiet_harvest: "ending-quiet-harvest-v3.webp",
    ten_thousand_bottles: "ending-ten-thousand-bottles-v3.webp",
    no_address: "ending-river-no-address-v3.webp",
};

const copy = (value) => structuredClone(value);
const cleanIdList = (value) => Array.isArray(value) ? value.map(String) : [];

function initialHistory() {
    return [{ kind: "story", title: publicExpeditionContent.opening.title, text: publicExpeditionContent.opening.text }];
}

function makeRound(round, now, archives = []) {
    return {
        version: 1,
        storyId: publicExpeditionContent.id,
        storyTitle: publicExpeditionContent.title,
        round,
        startedAt: now,
        phase: "choice",
        choiceIndex: 1,
        route: null,
        secondNode: null,
        taskIndex: null,
        tasks: {},
        clues: [],
        history: initialHistory(),
        choiceCounts: {},
        choiceBallot: null,
        lastChooserFarmId: null,
        cooldown: null,
        participants: [],
        endingId: null,
        endedAt: null,
        endedDay: null,
        rewards: [],
        vote: null,
        archives,
    };
}

function normalizeTaskState(value, task) {
    const state = value && typeof value === "object" ? value : {};
    state.id = task.id;
    state.contributions = Array.isArray(state.contributions) ? state.contributions : [];
    state.completedAt = Number.isFinite(state.completedAt) ? state.completedAt : null;
    return state;
}

export function normalizePublicExpeditionWorld(value, now = Date.now()) {
    if (!value || typeof value !== "object")
        return makeRound(1, now);
    if (value.storyId !== publicExpeditionContent.id) {
        const archives = Array.isArray(value.archives) ? value.archives : [];
        const archived = copy(value);
        delete archived.archives;
        archived.storyTitle ??= String(value.storyId ?? "往期故事");
        return makeRound(1, now, [...archives, archived]);
    }
    const world = value;
    world.version = 1;
    world.storyTitle = String(world.storyTitle ?? publicExpeditionContent.title);
    world.round = Math.max(1, Math.floor(Number(world.round) || 1));
    world.startedAt = Number.isFinite(world.startedAt) ? world.startedAt : now;
    world.phase = ["choice", "task", "cooldown", "ended", "vote", "closed"].includes(world.phase) ? world.phase : "choice";
    world.choiceIndex = Math.min(6, Math.max(1, Math.floor(Number(world.choiceIndex) || 1)));
    world.route = ["A", "B", "C"].includes(world.route) ? world.route : null;
    world.secondNode = ["A", "B", "C"].includes(world.secondNode) ? world.secondNode : null;
    world.taskIndex = world.taskIndex == null ? null : Math.min(2, Math.max(0, Math.floor(Number(world.taskIndex) || 0)));
    world.tasks = world.tasks && typeof world.tasks === "object" ? world.tasks : {};
    if (world.route) {
        for (const task of publicExpeditionContent.routes[world.route].tasks)
            if (world.tasks[task.id])
                world.tasks[task.id] = normalizeTaskState(world.tasks[task.id], task);
    }
    world.clues = Array.isArray(world.clues) ? world.clues : [];
    world.history = Array.isArray(world.history) && world.history.length ? world.history : initialHistory();
    world.choiceCounts = world.choiceCounts && typeof world.choiceCounts === "object" ? world.choiceCounts : {};
    world.choiceBallot = world.choiceBallot && typeof world.choiceBallot === "object" ? world.choiceBallot : null;
    if (world.choiceBallot) {
        world.choiceBallot.key = String(world.choiceBallot.key ?? "");
        world.choiceBallot.votes = world.choiceBallot.votes && typeof world.choiceBallot.votes === "object" ? world.choiceBallot.votes : {};
    }
    world.lastChooserFarmId = world.lastChooserFarmId ? String(world.lastChooserFarmId) : null;
    world.cooldown = world.cooldown && typeof world.cooldown === "object" ? world.cooldown : null;
    if (world.cooldown) {
        world.cooldown.taskId = String(world.cooldown.taskId ?? "");
        world.cooldown.text = String(world.cooldown.text ?? "");
        world.cooldown.nextChoiceIndex = Math.min(6, Math.max(1, Math.floor(Number(world.cooldown.nextChoiceIndex) || world.choiceIndex)));
        world.cooldown.readyAt = Number.isFinite(world.cooldown.readyAt)
            ? world.cooldown.readyAt
            : Number.isSafeInteger(world.cooldown.readyDay)
                ? world.cooldown.readyDay * DAY_MS - BEIJING_OFFSET_MS
                : now;
        delete world.cooldown.readyDay;
    }
    world.participants = cleanIdList(world.participants);
    world.endingId = world.endingId && publicExpeditionContent.endings[world.endingId] ? world.endingId : null;
    world.endedAt = Number.isFinite(world.endedAt) ? world.endedAt : null;
    world.endedDay = Number.isSafeInteger(world.endedDay) ? world.endedDay : null;
    world.rewards = Array.isArray(world.rewards) ? world.rewards : [];
    world.vote = world.vote && typeof world.vote === "object" ? world.vote : null;
    if (world.vote) {
        world.vote.day = Number.isSafeInteger(world.vote.day) ? world.vote.day : null;
        world.vote.votes = world.vote.votes && typeof world.vote.votes === "object" ? world.vote.votes : {};
    }
    world.archives = Array.isArray(world.archives) ? world.archives : [];
    return world;
}

function replaceWorld(world, next) {
    for (const key of Object.keys(world))
        delete world[key];
    Object.assign(world, next);
}

function archiveRound(world) {
    const archived = copy(world);
    delete archived.archives;
    return archived;
}

function farmRewardState(farm) {
    const state = (farm.publicExpeditionRewards ??= {});
    state.issues = cleanIdList(state.issues);
    state.endings = cleanIdList(state.endings);
    state.grants = Array.isArray(state.grants) ? state.grants : [];
    return state;
}

export function settlePublicExpeditionRewards(world, farms = [], now = Date.now()) {
    if (!world.endingId)
        return [];
    const issueId = String(world.storyId);
    const eligibleIds = new Set();
    for (const state of Object.values(world.tasks ?? {}))
        for (const contribution of state?.contributions ?? [])
            eligibleIds.add(String(contribution.farmId));
    const grants = [];
    for (const farm of farms) {
        if (!eligibleIds.has(String(farm.id)))
            continue;
        const state = farmRewardState(farm);
        if (state.issues.includes(issueId))
            continue;
        const rng = new Rng(farm.rngState);
        const seed = rng.pick(SP_SEEDS);
        farm.rngState = rng.state;
        farm.coins = Math.max(0, Math.floor(Number(farm.coins) || 0)) + ENDING_REWARD_COINS;
        farm.silver = Math.max(0, Math.floor(Number(farm.silver) || 0)) + ENDING_REWARD_SILVER;
        farm.seeds ??= {};
        farm.seeds[seed.id] = (farm.seeds[seed.id] ?? 0) + 1;
        state.issues.push(issueId);
        if (!state.endings.includes(world.endingId))
            state.endings.push(world.endingId);
        const unlocked = checkTitles(farm).find((title) => title.id === ENDING_TITLE_ID[world.endingId]);
        const title = unlocked ?? titleById(ENDING_TITLE_ID[world.endingId]);
        const grant = {
            issueId,
            storyTitle: publicExpeditionContent.title,
            endingId: world.endingId,
            endingTitle: publicExpeditionContent.endings[world.endingId].title,
            titleId: ENDING_TITLE_ID[world.endingId],
            titleName: title?.name ?? null,
            seedId: seed.id,
            seedName: seed.name,
            coins: ENDING_REWARD_COINS,
            silver: ENDING_REWARD_SILVER,
            at: now,
        };
        state.grants.push(grant);
        const notice = publicExpeditionRewardText(grant);
        pushInbox(farm, notice, now);
        pushRanchNotice(farm, notice, now);
        grants.push({ farm, grant });
    }
    world.rewards = grants.map(({ farm, grant }) => ({ farmId: farm.id, farmName: farm.name, ...grant }));
    return grants;
}

export function publicExpeditionRewardText(grant) {
    return `🎁 你参与的铃野共行《${grant.storyTitle}》已达成结局「${grant.endingTitle}」：获得 ${grant.coins} 金、${grant.silver} 银、SP 种子「${grant.seedName}」×1，并解锁称号「${grant.titleName}」。`;
}

export function advancePublicExpedition(world, farms = [], now = Date.now()) {
    const today = currentDayIndex(now);
    if (world.phase === "cooldown" && world.cooldown && now >= world.cooldown.readyAt) {
        world.phase = "choice";
        world.choiceIndex = world.cooldown.nextChoiceIndex;
        world.cooldown = null;
        world.choiceBallot = null;
    }
    if (world.phase === "ended" && Number.isSafeInteger(world.endedDay) && today > world.endedDay) {
        world.phase = "vote";
        world.vote = { day: world.endedDay + 1, votes: {} };
    }
    if (world.phase === "vote" && Number.isSafeInteger(world.vote?.day) && today > world.vote.day) {
        const votes = Object.values(world.vote.votes ?? {});
        const restart = votes.filter((vote) => vote === "A").length;
        const keep = votes.filter((vote) => vote === "B").length;
        if (restart > keep) {
            const archives = [...world.archives, archiveRound(world)];
            replaceWorld(world, makeRound(world.round + 1, now, archives));
        }
        else {
            world.phase = "closed";
        }
    }
    if (world.phase === "task")
        prepareCurrentTask(world, farms);
    return world;
}

function cooldownReadyAt(task, now) {
    if (task.cooldownNextDay)
        return (currentDayIndex(now) + 1) * DAY_MS - BEIJING_OFFSET_MS;
    return now + Math.max(1, Number(task.cooldownHours) || 6) * HOUR_MS;
}

function cooldownReadyText(cooldown) {
    if (!cooldown?.readyAt)
        return "稍后";
    return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(cooldown.readyAt));
}

function routeDef(world) {
    return world.route ? publicExpeditionContent.routes[world.route] : null;
}

export function currentPublicTask(world) {
    if (world.phase !== "task" || !world.route || world.taskIndex == null)
        return null;
    return routeDef(world)?.tasks?.[world.taskIndex] ?? null;
}

function currentTaskState(world) {
    const task = currentPublicTask(world);
    if (!task)
        return null;
    return (world.tasks[task.id] ??= normalizeTaskState({}, task));
}

function findMarkedCrop(farm, storyId, round, taskId, preferredPlotId) {
    const preferred = farm?.plots?.find((plot) => plot.id === preferredPlotId
        && plot.crop?.publicExpedition?.storyId === storyId
        && plot.crop?.publicExpedition?.round === round
        && plot.crop?.publicExpedition?.taskId === taskId);
    if (preferred)
        return preferred;
    return farm?.plots?.find((plot) => plot.crop?.publicExpedition?.storyId === storyId
        && plot.crop?.publicExpedition?.round === round
        && plot.crop?.publicExpedition?.taskId === taskId);
}

function restoreTrialCrop(world, farms, contribution, ripe) {
    const farm = farms.find((item) => item.id === contribution.farmId);
    if (!farm)
        return null;
    let plot = findMarkedCrop(farm, world.storyId, world.round, "b_plant", contribution.plotId);
    if (!plot) {
        plot = farm.plots.find((item) => !item.crop);
        if (!plot)
            return null;
        plot.crop = copy(contribution.crop ?? { seedType: "common", growTicks: 8, progress: 0, ripe: false, waterCount: 0 });
        plot.crop.publicExpedition = { storyId: world.storyId, round: world.round, taskId: "b_plant" };
        contribution.plotId = plot.id;
    }
    if (ripe) {
        plot.crop.ripe = true;
        plot.crop.progress = plot.crop.growTicks;
    }
    else {
        plot.crop.ripe = false;
        plot.crop.progress = Math.min(plot.crop.progress ?? 0, Math.max(0, plot.crop.growTicks - 1));
    }
    return { farm, plot };
}

function prepareCurrentTask(world, farms) {
    const task = currentPublicTask(world);
    if (!task)
        return;
    currentTaskState(world);
    if (task.id !== "b_water" && task.id !== "b_harvest")
        return;
    const planted = world.tasks.b_plant?.contributions ?? [];
    for (const contribution of planted)
        restoreTrialCrop(world, farms, contribution, false);
}

function choiceOptions(world) {
    if (world.phase === "vote")
        return publicExpeditionContent.vote.options;
    if (world.phase !== "choice")
        return null;
    if (world.choiceIndex === 1)
        return publicExpeditionContent.opening.options;
    if (world.choiceIndex === 2)
        return publicExpeditionContent.secondNodes[world.secondNode]?.options ?? null;
    return routeDef(world)?.choices?.[String(world.choiceIndex)]?.options ?? null;
}

function choiceTitle(world) {
    if (world.phase === "vote")
        return publicExpeditionContent.vote.title;
    if (world.choiceIndex === 1)
        return publicExpeditionContent.opening.title;
    if (world.choiceIndex === 2)
        return publicExpeditionContent.secondNodes[world.secondNode]?.title ?? "选择路线";
    return routeDef(world)?.choices?.[String(world.choiceIndex)]?.title ?? `第 ${world.choiceIndex} 次选择`;
}

function addParticipant(world, farmId) {
    if (!world.participants.includes(farmId))
        world.participants.push(farmId);
}

function choiceBallotKey(world) {
    return `${world.storyId}:${world.round}:${world.choiceIndex}`;
}

function ensureChoiceBallot(world) {
    const key = choiceBallotKey(world);
    if (!world.choiceBallot || world.choiceBallot.key !== key)
        world.choiceBallot = { key, votes: {} };
    return world.choiceBallot;
}

function choiceSupportCounts(world) {
    const counts = { A: 0, B: 0, C: 0 };
    const ballot = world.phase === "choice" ? ensureChoiceBallot(world) : null;
    for (const vote of Object.values(ballot?.votes ?? {})) {
        const option = typeof vote === "string" ? vote : vote?.option;
        if (VALID_OPTIONS.has(option))
            counts[option] += 1;
    }
    return counts;
}

function recordResolvedChoice(world, option, label, votes) {
    const voters = Object.entries(votes)
        .filter(([, vote]) => (typeof vote === "string" ? vote : vote?.option) === option)
        .map(([farmId, vote]) => ({ farmId, farmName: typeof vote === "string" ? farmId : String(vote?.farmName ?? farmId) }));
    world.lastChooserFarmId = voters.at(-1)?.farmId ?? null;
    world.history.push({ kind: "choice", step: world.choiceIndex, option, label, voters, farmName: voters.map((item) => item.farmName).join("、") });
}

function startTask(world, taskIndex, farms) {
    world.phase = "task";
    world.taskIndex = taskIndex;
    const task = currentPublicTask(world);
    world.tasks[task.id] = normalizeTaskState(world.tasks[task.id], task);
    prepareCurrentTask(world, farms);
}

function finishWithEnding(world, endingId, now, farms) {
    const ending = publicExpeditionContent.endings[endingId];
    world.endingId = endingId;
    world.endedAt = now;
    world.endedDay = currentDayIndex(now);
    world.phase = "ended";
    world.history.push({ kind: "ending", title: ending.title, text: ending.text });
    settlePublicExpeditionRewards(world, farms, now);
}

export function runPublicChoice(world, farm, rawOption, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const option = String(rawOption ?? "").trim().toUpperCase();
    const options = choiceOptions(world);
    if (world.phase === "cooldown")
        return { ok: false, text: currentPromptText(world, farm, farms, now) };
    if (!options || !options[option])
        return { ok: false, text: world.phase === "task" ? "当前公共任务尚未完成，还不能进入下一次选择。" : "当前没有这个公共选项。" };
    if (world.phase === "vote") {
        world.vote.votes[farm.id] = option;
        markImmediateAiPhase(world, farm);
        return { ok: true, text: `${option === "A" ? "🔁 已投票开启新一轮" : "📚 已投票保留本轮结局"}。截止前可以改票。\n${publicExpeditionText(world, farm, now, farms)}` };
    }
    const label = options[option];
    const ballot = ensureChoiceBallot(world);
    const previous = ballot.votes[farm.id];
    if (!previous && (world.choiceCounts[farm.id] ?? 0) >= MAX_CHOICES_PER_FARM)
        return { ok: false, text: `你本轮已经提交过 ${MAX_CHOICES_PER_FARM} 次有效选择，可以继续阅读和完成公共任务，但不能再推进选择。` };
    if (!previous) {
        world.choiceCounts[farm.id] = (Math.floor(Number(world.choiceCounts[farm.id])) || 0) + 1;
        addParticipant(world, farm.id);
    }
    ballot.votes[farm.id] = { option, farmName: farm.name, at: now };
    const counts = choiceSupportCounts(world);
    if (counts[option] < CHOICE_TARGET) {
        markImmediateAiPhase(world, farm);
        return {
            ok: true,
            text: `已记录你对 ${option}「${label}」的选择（当前 ${counts[option]}/${CHOICE_TARGET}）。同一选项得到至少 ${CHOICE_TARGET} 名玩家共同选择后，剧情才会推进。\n\n${publicExpeditionText(world, farm, now, farms)}`,
        };
    }
    const resolvedVotes = ballot.votes;
    recordResolvedChoice(world, option, label, resolvedVotes);
    world.choiceBallot = null;
    if (world.choiceIndex === 1) {
        world.secondNode = option;
        const node = publicExpeditionContent.secondNodes[option];
        world.history.push({ kind: "story", title: node.title, text: node.text });
        world.choiceIndex = 2;
    }
    else if (world.choiceIndex === 2) {
        world.route = option;
        startTask(world, 0, farms);
    }
    else if (world.choiceIndex === 3) {
        world.choiceIndex = 4;
    }
    else if (world.choiceIndex === 4) {
        startTask(world, 1, farms);
    }
    else if (world.choiceIndex === 5) {
        startTask(world, 2, farms);
    }
    else if (world.choiceIndex === 6) {
        const endingId = routeDef(world).choices["6"].endings[option];
        finishWithEnding(world, endingId, now, farms);
    }
    markImmediateAiPhase(world, farm);
    return { ok: true, text: `${option}「${label}」已得到 ${CHOICE_TARGET} 名玩家共同选择，成为本阶段决定。\n\n${publicExpeditionText(world, farm, now, farms)}` };
}

function clueId(world, task) {
    return `${world.storyId}:${world.round}:${task.id}`;
}

function reads(farm) {
    const value = (farm.publicExpeditionReads ??= {});
    value.aiOpenings = cleanIdList(value.aiOpenings);
    value.humanOpenings = cleanIdList(value.humanOpenings);
    value.aiClues = cleanIdList(value.aiClues);
    value.humanClues = cleanIdList(value.humanClues);
    value.aiPhases = cleanIdList(value.aiPhases);
    value.humanPhases = cleanIdList(value.humanPhases);
    return value;
}

function markImmediateAiPhase(world, farm) {
    const value = reads(farm);
    const phase = publicPhaseKey(world);
    if (!value.aiPhases.includes(phase))
        value.aiPhases.push(phase);
}

function markImmediateAiContribution(world, farm, task, completed) {
    const value = reads(farm);
    if (completed) {
        const id = clueId(world, task);
        if (!value.aiClues.includes(id))
            value.aiClues.push(id);
    }
    markImmediateAiPhase(world, farm);
}

export function recordPublicContribution(world, farm, meta = {}, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    const state = currentTaskState(world);
    const allowed = checkPublicContribution(world, farm, meta.kind, meta, now, farms);
    if (!allowed.ok)
        return allowed;
    const index = state.contributions.length;
    const fact = task.contributions[index];
    state.contributions.push({ farmId: farm.id, farmName: farm.name, at: now, fact, ...meta });
    addParticipant(world, farm.id);
    let completed = false;
    if (state.contributions.length >= CONTRIBUTION_TARGET) {
        completed = true;
        state.completedAt = now;
        world.history.push({
            kind: "task",
            title: task.name,
            text: task.opening,
            contributions: state.contributions.map((item) => ({ farmId: item.farmId, farmName: item.farmName, fact: item.fact })),
        });
        const clue = { id: clueId(world, task), taskId: task.id, title: task.clueTitle, text: task.clueText, at: now };
        world.clues.push(clue);
        world.history.push({ kind: "clue", title: clue.title, text: clue.text, taskName: task.name });
        const nextChoiceIndex = world.taskIndex === 0 ? 3 : world.taskIndex === 1 ? 5 : 6;
        world.phase = "cooldown";
        world.cooldown = {
            taskId: task.id,
            text: String(task.cooldownText ?? "大家正在整理刚刚得到的线索；下一段剧情准备好后再继续。"),
            nextChoiceIndex,
            readyAt: cooldownReadyAt(task, now),
            startedAt: now,
        };
        world.choiceBallot = null;
        world.taskIndex = null;
    }
    markImmediateAiContribution(world, farm, task, completed);
    let text = taskProgressText(world, task);
    if (completed)
        text += `\n\n🔎 公共线索【${task.clueTitle}】\n${task.clueText}\n\n${currentPromptText(world, farm, farms, now)}`;
    return { ok: true, text, task, completed, fact };
}

export function checkPublicContribution(world, farm, kind, meta = {}, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    const state = currentTaskState(world);
    if (!task || !state)
        return { ok: false, text: "当前没有正在进行的公共任务。" };
    if (kind && kind !== task.kind)
        return { ok: false, text: `当前需要完成【${task.name}】，这次操作不属于任务要求。`, task };
    if (state.completedAt)
        return { ok: false, text: `【${task.name}】已经完成，这次没有消耗任务物品。`, task };
    if (state.contributions.some((item) => item.farmId === farm.id))
        return { ok: false, text: `你已经为【${task.name}】完成过一份关键贡献，这次没有消耗任务物品；等其他农场接棒吧。`, task };
    if (meta.targetFarmId && state.contributions.some((item) => item.targetFarmId === meta.targetFarmId))
        return { ok: false, text: "这块任务试验田已经得到过公共照料，请换另一块。", task };
    return { ok: true, task, state };
}

export function markPublicTrialPlot(world, farm, plot, cropSnapshot, now = Date.now(), farms = []) {
    if (!plot?.crop)
        return { ok: false, text: "剧情试种没有落到有效地块。" };
    plot.crop.publicExpedition = { storyId: world.storyId, round: world.round, taskId: "b_plant" };
    plot.crop.growTicks = Math.max(plot.crop.growTicks ?? 1, 1000000);
    plot.crop.progress = 0;
    plot.crop.ripe = false;
    return recordPublicContribution(world, farm, {
        kind: "plant",
        plotId: plot.id,
        crop: copy(cropSnapshot ?? plot.crop),
    }, now, farms);
}

export function findPublicWaterTarget(world, visitorId, farms = [], now = Date.now()) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    if (task?.id !== "b_water")
        return null;
    const state = currentTaskState(world);
    const usedTargets = new Set(state.contributions.map((item) => item.targetFarmId));
    const today = currentDayIndex(now);
    for (const planted of world.tasks.b_plant?.contributions ?? []) {
        if (planted.farmId === visitorId || usedTargets.has(planted.farmId))
            continue;
        const restored = restoreTrialCrop(world, farms, planted, false);
        if (restored && restored.farm.waterVisits?.[visitorId] !== today)
            return { target: restored.farm, plot: restored.plot };
    }
    return null;
}

export function findPublicHarvestPlot(world, farm, farms = [], now = Date.now()) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    if (task?.id !== "b_harvest")
        return null;
    const planted = world.tasks.b_plant?.contributions?.find((item) => item.farmId === farm.id);
    if (!planted)
        return null;
    return restoreTrialCrop(world, farms, planted, false)?.plot ?? null;
}

export function findPublicDish(farm, requiredName, selector) {
    const dishes = farm.ranch?.kitchen?.dishes ?? [];
    const query = String(selector ?? requiredName).trim();
    return dishes.find((dish) => dish.name === requiredName && (dish.id === query || dish.recipeId === query || dish.name === query));
}

export function takePublicDish(farm, dish) {
    if (!dish || !farm.ranch?.kitchen?.dishes)
        return false;
    const before = farm.ranch.kitchen.dishes.length;
    farm.ranch.kitchen.dishes = farm.ranch.kitchen.dishes.filter((item) => item !== dish);
    return farm.ranch.kitchen.dishes.length === before - 1;
}

function taskProgressText(world, task) {
    const state = world.tasks[task.id] ?? { contributions: [] };
    const rows = state.contributions.map((item) => `· ${item.farmName}：${item.fact}`).join("\n");
    return `【公共任务·${task.name}】${state.contributions.length}/${CONTRIBUTION_TARGET}\n${task.opening}${rows ? `\n\n已完成：\n${rows}` : ""}`;
}

function optionsText(world) {
    const options = choiceOptions(world);
    if (!options)
        return "";
    const counts = world.phase === "choice" ? choiceSupportCounts(world) : null;
    return Object.entries(options).map(([key, label]) => `${key}．${label}${counts ? `（${counts[key] ?? 0}/${CHOICE_TARGET}）` : ""}`).join("\n");
}

function directCallGuide(world, farm, farms, now) {
    if (!farm)
        return "";
    if (world.phase === "choice" || world.phase === "vote") {
        const options = choiceOptions(world);
        if (!options)
            return "";
        const calls = Object.keys(options).map((option) => `${option} → ${JSON.stringify({ action: "together", option })}`);
        return `【可直接调用】\n${calls.join("\n")}`;
    }
    const task = currentPublicTask(world);
    if (!task)
        return "";
    const state = world.tasks[task.id] ?? { contributions: [] };
    if (state.contributions.some((item) => item.farmId === farm.id))
        return `你已经为【${task.name}】完成过一份关键贡献，这次没有消耗任务物品；等其他农场接棒吧。`;
    let call;
    if (task.kind === "explore")
        call = { action: "explore", location: task.location };
    else if (task.id === "c_bottle")
        call = { action: "fish", location: "倒流湾" };
    else if (task.kind === "dish") {
        if (!findPublicDish(farm, task.dish, task.dish))
            return `料理柜里没有任务需要的「${task.dish}」，这次没有消耗料理。`;
        call = { action: "kitchen", op: "use", dishId: task.dish, target: task.npc };
    }
    else if (task.id === "b_plant") {
        const plot = farm.plots.find((item) => !item.crop);
        if (!plot)
            return "没有空地可以进行剧情试种。";
        call = { action: "plant", seedType: "明日试验种", plotId: plot.id };
    }
    else if (task.id === "b_water") {
        const target = findPublicWaterTarget(world, farm.id, farms, now);
        const number = target ? farms.findIndex((item) => item.id === target.target.id) + 1 : 0;
        if (!target || number <= 0)
            return "当前没有可由你照料的任务试验田；可能只剩你自己的地，或其他任务田今天已被你浇过。";
        call = { action: "water", to: String(number), plotId: target.plot.id };
    }
    else if (task.id === "b_harvest") {
        const plot = findPublicHarvestPlot(world, farm, farms, now);
        if (!plot)
            return "你没有可抢收的任务试验田；这项任务要由此前完成试种的三家分别收获。";
        call = { action: "harvest", plotId: plot.id };
    }
    return call ? `【可直接调用】\n${JSON.stringify(call)}` : "";
}

function currentPromptText(world, farm, farms = [], now = Date.now()) {
    const guide = directCallGuide(world, farm, farms, now);
    if (world.phase === "task")
        return `${taskProgressText(world, currentPublicTask(world))}${guide ? `\n\n${guide}` : ""}`;
    if (world.phase === "choice")
        return `【${world.choiceIndex}/6·${choiceTitle(world)}】\n${optionsText(world)}${guide ? `\n\n${guide}` : ""}`;
    if (world.phase === "vote")
        return `🔁 ${publicExpeditionContent.vote.title}\n${publicExpeditionContent.vote.text}\n\n${optionsText(world)}${guide ? `\n\n${guide}` : ""}`;
    if (world.phase === "cooldown")
        return `⏳ 本阶段暂告一段落\n${world.cooldown?.text ?? "大家正在整理刚刚得到的线索。"}\n\n下一段剧情将在北京时间 ${cooldownReadyText(world.cooldown)} 开放。`;
    if (world.phase === "ended")
        return "本轮结局已经产生；次日北京时间 00:00–23:59 开放重开投票。";
    return "本轮结局与实际故事线已归档。";
}

function historyText(world) {
    return world.history.map((entry) => {
        if (entry.kind === "choice") {
            const names = entry.voters?.length ? entry.voters.map((item) => item.farmName).join("、") : entry.farmName;
            return `【共同选择 ${entry.step}】${entry.option}：${entry.label}${names ? `\n由 ${names} 共同决定` : ""}`;
        }
        if (entry.kind === "task") {
            const rows = (entry.contributions ?? []).map((item) => `· ${item.farmName}：${item.fact}`).join("\n");
            return `【公共任务·${entry.title}】${entry.contributions?.length ?? 0}/${CONTRIBUTION_TARGET}\n${entry.text}${rows ? `\n\n已完成：\n${rows}` : ""}`;
        }
        if (entry.kind === "clue")
            return `🔎 公共线索【${entry.title}】\n${entry.text}`;
        return `【${entry.title}】\n${entry.text}`;
    }).join("\n\n");
}

export function publicExpeditionText(world, farm, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const route = routeDef(world);
    const header = `🧭 铃野共行｜本期故事：《${publicExpeditionContent.title}》｜第 ${world.round} 轮${route ? `｜${route.name}` : ""}`;
    const own = farm ? `你本轮已选择 ${world.choiceCounts[farm.id] ?? 0}/${MAX_CHOICES_PER_FARM} 次` : "";
    const ownReward = farm ? (world.rewards ?? []).find((reward) => reward.farmId === farm.id) : null;
    const clues = world.clues.length ? `｜线索 ${world.clues.length}/3` : "";
    return `${header}\n全服进度：${publicExpeditionStatusLine(world, now)}${clues}${own ? `｜${own}` : ""}\n\n${historyText(world)}\n\n${currentPromptText(world, farm, farms, now)}${ownReward ? `\n\n${publicExpeditionRewardText(ownReward)}` : ""}`;
}

export function publicExpeditionStatusLine(world, now = Date.now()) {
    if (world.phase === "task") {
        const task = currentPublicTask(world);
        const progress = world.tasks[task.id]?.contributions?.length ?? 0;
        return `公共任务【${task.name}】${progress}/${CONTRIBUTION_TARGET}`;
    }
    if (world.phase === "choice") {
        const counts = choiceSupportCounts(world);
        return `等待第 ${world.choiceIndex}/6 次全服选择（A ${counts.A}/${CHOICE_TARGET}｜B ${counts.B}/${CHOICE_TARGET}｜C ${counts.C}/${CHOICE_TARGET}）`;
    }
    if (world.phase === "cooldown")
        return `本阶段已完成，等待至北京时间 ${cooldownReadyText(world.cooldown)} 继续`;
    if (world.phase === "vote") {
        const votes = Object.values(world.vote?.votes ?? {});
        return `重开投票中（开启 ${votes.filter((vote) => vote === "A").length}｜保留 ${votes.filter((vote) => vote === "B").length}）`;
    }
    if (world.phase === "ended")
        return `结局【${publicExpeditionContent.endings[world.endingId]?.title ?? "已完成"}】；次日开放重开投票`;
    return `结局【${publicExpeditionContent.endings[world.endingId]?.title ?? "已完成"}】已归档`;
}

export function publicPhaseKey(world) {
    const task = currentPublicTask(world);
    return `${world.storyId}:${world.round}:${world.phase}:${world.choiceIndex}:${task?.id ?? world.cooldown?.taskId ?? "-"}:${world.cooldown?.readyAt ?? "-"}:${world.endingId ?? "-"}`;
}

function takeNotices(world, farm, side, now) {
    const value = reads(farm);
    const openingKey = `${world.storyId}:${world.round}`;
    const openingList = side === "ai" ? value.aiOpenings : value.humanOpenings;
    const clueList = side === "ai" ? value.aiClues : value.humanClues;
    const phaseList = side === "ai" ? value.aiPhases : value.humanPhases;
    const notices = [];
    let opened = false;
    if (!openingList.includes(openingKey)) {
        openingList.push(openingKey);
        notices.push(publicExpeditionContent.openingAnnouncement);
        opened = true;
    }
    for (const clue of world.clues) {
        if (!clueList.includes(clue.id)) {
            clueList.push(clue.id);
            notices.push(`🔎 铃野共行发现公共线索【${clue.title}】\n${clue.text}`);
        }
    }
    const phase = publicPhaseKey(world);
    if (!phaseList.includes(phase)) {
        phaseList.push(phase);
        if (!opened && notices.length === 0)
            notices.push(`🧭 铃野共行进展：${publicExpeditionStatusLine(world, now)}。用 {"action":"together"} 查看完整故事。`);
    }
    return notices;
}

export function takePublicAiNotices(world, farm, now = Date.now()) {
    return takeNotices(world, farm, "ai", now);
}

export function takePublicHumanNotices(world, farm, now = Date.now()) {
    return takeNotices(world, farm, "human", now);
}

export function publicExpeditionHumanData(world, farm, now = Date.now()) {
    let artFile = "river-from-tomorrow-opening-v3.webp";
    const visualTaskId = currentPublicTask(world)?.id ?? world.cooldown?.taskId ?? null;
    const visualTaskIndex = visualTaskId
        ? routeDef(world)?.tasks?.findIndex((task) => task.id === visualTaskId) ?? -1
        : -1;
    if (world.endingId) {
        artFile = ENDING_ART[world.endingId] ?? artFile;
    }
    else if (world.route) {
        if (visualTaskIndex === 0 || (world.phase === "choice" && world.choiceIndex <= 4))
            artFile = "future-wharf-v3.webp";
        else if (visualTaskIndex === 1 || (world.phase === "choice" && world.choiceIndex === 5))
            artFile = "cooperative-investigation-v3.webp";
        else if (visualTaskIndex === 2 || (world.phase === "choice" && world.choiceIndex === 6))
            artFile = "river-fork-v3.webp";
    }
    return {
        title: publicExpeditionContent.title,
        artFile,
        round: world.round,
        routeName: routeDef(world)?.name ?? null,
        status: publicExpeditionStatusLine(world, now),
        history: copy(world.history),
        currentTask: currentPublicTask(world) ? {
            ...copy(currentPublicTask(world)),
            progress: world.tasks[currentPublicTask(world).id]?.contributions?.length ?? 0,
            contributors: copy(world.tasks[currentPublicTask(world).id]?.contributions ?? []),
        } : null,
        currentChoice: world.phase === "choice" || world.phase === "vote" ? {
            index: world.choiceIndex,
            title: choiceTitle(world),
            options: copy(choiceOptions(world)),
            counts: world.phase === "choice" ? choiceSupportCounts(world) : null,
        } : null,
        cooldown: world.phase === "cooldown" ? { ...copy(world.cooldown), readyText: cooldownReadyText(world.cooldown) } : null,
        ending: world.endingId ? copy(publicExpeditionContent.endings[world.endingId]) : null,
        rewards: copy(world.rewards ?? []),
        clues: copy(world.clues),
        ownChoiceCount: farm ? world.choiceCounts[farm.id] ?? 0 : 0,
        archives: copy(world.archives),
    };
}
