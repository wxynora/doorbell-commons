// 铃野共行：全服只维护一份公共故事状态；各农场只保存本人作答、阅读与奖励事实。
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
const SCORE_KEYS = ["cooperation", "independent", "public"];
const CHOICE_TARGET = Number(publicExpeditionContent.choiceTarget) || 3;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;
const ENDING_REWARD_COINS = 1500;
const ENDING_REWARD_SILVER = 150;
const CHOICE_REWARD_COINS = 1000;
const CHOICE_REWARD_SILVER = 100;
const SP_SEEDS = crops.filter((crop) => crop.rarity === "SP" && crop.seedPrice === 3600);
const SSR_SEEDS = crops.filter((crop) => crop.rarity === "SSR");
const LEGACY_ENDINGS = {
    second_home: { title: "泊泊找到了第二个家", titleId: "together_second_home" },
    quiet_harvest: { title: "安静的丰年", titleId: "together_quiet_harvest" },
    ten_thousand_bottles: { title: "一万只发光瓶", titleId: "together_ten_thousand_bottles" },
    no_address: { title: "河没有留下地址", titleId: "together_no_address" },
};

const copy = (value) => structuredClone(value);
const cleanIdList = (value) => Array.isArray(value) ? [...new Set(value.map(String))] : [];
const cleanObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const taskDefs = [
    publicExpeditionContent.stages.recipe.question,
    publicExpeditionContent.stages.recipe.dish,
    publicExpeditionContent.stages.letters.task,
    ...publicExpeditionContent.stages.service.orders,
];
const taskById = new Map(taskDefs.map((task) => [task.id, task]));

function initialHistory() {
    return [{ kind: "story", title: publicExpeditionContent.opening.title, text: publicExpeditionContent.opening.text }];
}

function makeRound(round, now, archives = []) {
    return {
        version: 2,
        storyId: publicExpeditionContent.id,
        storyTitle: publicExpeditionContent.title,
        round,
        startedAt: now,
        phase: "choice",
        choiceIndex: 1,
        stage: "opening",
        currentTaskId: null,
        tasks: {},
        clues: [],
        history: initialHistory(),
        stageOpenings: [],
        completedStages: [],
        choiceBallot: null,
        lastChooserFarmId: null,
        cooldown: null,
        participants: [],
        openingChoice: null,
        letterChoice: null,
        serviceChoice: null,
        score: { cooperation: 0, independent: 0, public: 0 },
        questionAnswers: {},
        encounterMisses: {},
        serviceFarmIds: [],
        endingId: null,
        endingTitle: null,
        endingText: null,
        endingTitleId: null,
        endedAt: null,
        endedDay: null,
        rewards: [],
        vote: null,
        archives,
    };
}

function endingHistoryEntry(world) {
    return [...(world.history ?? [])].reverse().find((entry) => entry?.kind === "ending");
}

function legacyStoryMeta(world) {
    const legacy = LEGACY_ENDINGS[world.endingId];
    const history = endingHistoryEntry(world);
    return {
        storyTitle: String(world.storyTitle ?? (world.storyId === "river_from_tomorrow" ? "河从明天流来" : world.storyId ?? "往期故事")),
        endingTitle: String(world.endingTitle ?? legacy?.title ?? history?.title ?? world.endingId ?? "已完成"),
        endingText: String(world.endingText ?? history?.text ?? ""),
        titleId: String(world.endingTitleId ?? legacy?.titleId ?? ""),
    };
}

function currentStoryMeta(world) {
    const ending = publicExpeditionContent.endings[world.endingId];
    if (!ending)
        return legacyStoryMeta(world);
    return {
        storyTitle: String(world.storyTitle ?? publicExpeditionContent.title),
        endingTitle: String(world.endingTitle ?? ending.title),
        endingText: String(world.endingText ?? ending.text),
        titleId: String(world.endingTitleId ?? ending.rewardTitleId),
    };
}

function archiveRound(world) {
    const archived = copy(world);
    delete archived.archives;
    if (archived.endingId) {
        const meta = archived.storyId === publicExpeditionContent.id ? currentStoryMeta(archived) : legacyStoryMeta(archived);
        archived.storyTitle = meta.storyTitle;
        archived.endingTitle = meta.endingTitle;
        archived.endingText = meta.endingText;
        archived.endingTitleId = meta.titleId;
    }
    return archived;
}

function normalizeTaskState(value, task) {
    const state = cleanObject(value);
    state.id = task.id;
    state.contributions = Array.isArray(state.contributions) ? state.contributions : [];
    state.completedAt = Number.isFinite(state.completedAt) ? state.completedAt : null;
    return state;
}

export function normalizePublicExpeditionWorld(value, now = Date.now()) {
    if (!value || typeof value !== "object" || !value.storyId)
        return makeRound(1, now);
    if (value.storyId !== publicExpeditionContent.id) {
        const previousArchives = Array.isArray(value.archives) ? value.archives : [];
        return makeRound(1, now, [...previousArchives, archiveRound(value)]);
    }
    const world = value;
    world.version = 2;
    world.storyTitle = String(world.storyTitle ?? publicExpeditionContent.title);
    world.round = Math.max(1, Math.floor(Number(world.round) || 1));
    world.startedAt = Number.isFinite(world.startedAt) ? world.startedAt : now;
    world.phase = ["choice", "task", "cooldown", "ended", "vote", "closed"].includes(world.phase) ? world.phase : "choice";
    world.choiceIndex = Math.min(4, Math.max(1, Math.floor(Number(world.choiceIndex) || 1)));
    world.stage = ["opening", "recipe", "letters", "service", "final"].includes(world.stage) ? world.stage : "opening";
    world.currentTaskId = taskById.has(world.currentTaskId) ? world.currentTaskId : null;
    world.tasks = cleanObject(world.tasks);
    for (const task of taskDefs)
        if (world.tasks[task.id])
            world.tasks[task.id] = normalizeTaskState(world.tasks[task.id], task);
    world.clues = Array.isArray(world.clues) ? world.clues : [];
    world.history = Array.isArray(world.history) && world.history.length ? world.history : initialHistory();
    world.stageOpenings = cleanIdList(world.stageOpenings);
    world.completedStages = cleanIdList(world.completedStages);
    world.choiceBallot = cleanObject(world.choiceBallot);
    if (!world.choiceBallot.key)
        world.choiceBallot = null;
    else
        world.choiceBallot.votes = cleanObject(world.choiceBallot.votes);
    world.lastChooserFarmId = world.lastChooserFarmId ? String(world.lastChooserFarmId) : null;
    world.cooldown = world.cooldown && typeof world.cooldown === "object" ? world.cooldown : null;
    if (world.cooldown) {
        world.cooldown.readyAt = Number.isFinite(world.cooldown.readyAt) ? world.cooldown.readyAt : now;
        world.cooldown.next = String(world.cooldown.next ?? "");
        world.cooldown.text = String(world.cooldown.text ?? "");
    }
    world.participants = cleanIdList(world.participants);
    world.openingChoice = VALID_OPTIONS.has(world.openingChoice) ? world.openingChoice : null;
    world.letterChoice = VALID_OPTIONS.has(world.letterChoice) ? world.letterChoice : null;
    world.serviceChoice = VALID_OPTIONS.has(world.serviceChoice) ? world.serviceChoice : null;
    world.score = cleanObject(world.score);
    for (const key of SCORE_KEYS)
        world.score[key] = Math.max(0, Math.floor(Number(world.score[key]) || 0));
    world.questionAnswers = cleanObject(world.questionAnswers);
    world.encounterMisses = cleanObject(world.encounterMisses);
    world.serviceFarmIds = cleanIdList(world.serviceFarmIds);
    world.endingId = publicExpeditionContent.endings[world.endingId] ? world.endingId : null;
    world.endingTitle = world.endingTitle ? String(world.endingTitle) : null;
    world.endingText = world.endingText ? String(world.endingText) : null;
    world.endingTitleId = world.endingTitleId ? String(world.endingTitleId) : null;
    world.endedAt = Number.isFinite(world.endedAt) ? world.endedAt : null;
    world.endedDay = Number.isSafeInteger(world.endedDay) ? world.endedDay : null;
    world.rewards = Array.isArray(world.rewards) ? world.rewards : [];
    world.vote = world.vote && typeof world.vote === "object" ? world.vote : null;
    if (world.vote) {
        world.vote.day = Number.isSafeInteger(world.vote.day) ? world.vote.day : null;
        world.vote.votes = cleanObject(world.vote.votes);
    }
    world.archives = Array.isArray(world.archives) ? world.archives : [];
    if (world.phase === "task" && !world.currentTaskId)
        world.phase = "choice";
    return world;
}

function replaceWorld(world, next) {
    for (const key of Object.keys(world))
        delete world[key];
    Object.assign(world, next);
}

function farmRewardState(farm) {
    const state = (farm.publicExpeditionRewards ??= {});
    state.issues = cleanIdList(state.issues);
    state.endings = cleanIdList(state.endings);
    state.grants = Array.isArray(state.grants) ? state.grants : [];
    return state;
}

export function settlePublicExpeditionRewards(world, farms = [], now = Date.now()) {
    if (!world?.endingId)
        return [];
    const issueId = String(world.storyId);
    const meta = world.storyId === publicExpeditionContent.id ? currentStoryMeta(world) : legacyStoryMeta(world);
    const contributorIds = new Set();
    for (const state of Object.values(world.tasks ?? {}))
        for (const contribution of state?.contributions ?? [])
            contributorIds.add(String(contribution.farmId));
    const participantIds = new Set(cleanIdList(world.participants));
    const grants = [];
    for (const farm of farms) {
        const farmId = String(farm.id);
        const tier = contributorIds.has(farmId) ? "contribution" : participantIds.has(farmId) ? "choice" : null;
        if (!tier)
            continue;
        const state = farmRewardState(farm);
        if (state.issues.includes(issueId))
            continue;
        const rng = new Rng(farm.rngState);
        const seedRarity = tier === "contribution" ? "SP" : "SSR";
        const seed = rng.pick(tier === "contribution" ? SP_SEEDS : SSR_SEEDS);
        const coins = tier === "contribution" ? ENDING_REWARD_COINS : CHOICE_REWARD_COINS;
        const silver = tier === "contribution" ? ENDING_REWARD_SILVER : CHOICE_REWARD_SILVER;
        farm.rngState = rng.state;
        farm.coins = Math.max(0, Math.floor(Number(farm.coins) || 0)) + coins;
        farm.silver = Math.max(0, Math.floor(Number(farm.silver) || 0)) + silver;
        farm.seeds ??= {};
        farm.seeds[seed.id] = (farm.seeds[seed.id] ?? 0) + 1;
        state.issues.push(issueId);
        if (!state.endings.includes(world.endingId))
            state.endings.push(world.endingId);
        const unlocked = checkTitles(farm).find((title) => title.id === meta.titleId);
        const title = unlocked ?? titleById(meta.titleId);
        const grant = {
            issueId,
            tier,
            storyTitle: meta.storyTitle,
            endingId: world.endingId,
            endingTitle: meta.endingTitle,
            titleId: meta.titleId,
            titleName: title?.name ?? null,
            seedId: seed.id,
            seedName: seed.name,
            seedRarity,
            coins,
            silver,
            at: now,
        };
        state.grants.push(grant);
        const notice = publicExpeditionRewardText(grant);
        pushInbox(farm, notice, now);
        pushRanchNotice(farm, notice, now);
        grants.push({ farm, grant });
    }
    const rewardsByFarm = new Map((world.rewards ?? []).map((reward) => [String(reward.farmId), reward]));
    for (const { farm, grant } of grants)
        rewardsByFarm.set(String(farm.id), { farmId: farm.id, farmName: farm.name, ...grant });
    world.rewards = [...rewardsByFarm.values()];
    return grants;
}

export function publicExpeditionRewardText(grant) {
    return `🎁 你参与的铃野共行《${grant.storyTitle}》已达成结局「${grant.endingTitle}」：获得 ${grant.coins} 金、${grant.silver} 银、${grant.seedRarity ?? "SP"} 种子「${grant.seedName}」×1，并解锁称号「${grant.titleName}」。`;
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

function pushStageOpening(world, stage, title, text) {
    world.stage = stage;
    if (world.stageOpenings.includes(stage))
        return;
    world.stageOpenings.push(stage);
    world.history.push({ kind: "story", title, text });
}

function setCurrentTask(world, task) {
    world.phase = "task";
    world.currentTaskId = task.id;
    world.tasks[task.id] = normalizeTaskState(world.tasks[task.id], task);
    world.choiceBallot = null;
}

function startRecipe(world) {
    const stage = publicExpeditionContent.stages.recipe;
    pushStageOpening(world, "recipe", stage.title, stage.opening);
    setCurrentTask(world, stage.question);
}

function startLetters(world) {
    const stage = publicExpeditionContent.stages.letters;
    pushStageOpening(world, "letters", stage.title, stage.opening);
    setCurrentTask(world, stage.task);
}

function openChoice(world, index) {
    world.phase = "choice";
    world.choiceIndex = index;
    world.currentTaskId = null;
    world.choiceBallot = null;
    if (index === 2)
        world.stage = "letters";
    else if (index === 3) {
        const stage = publicExpeditionContent.stages.service;
        pushStageOpening(world, "service", stage.title, stage.opening);
    }
    else if (index === 4) {
        const choice = publicExpeditionContent.choices["4"];
        pushStageOpening(world, "final", choice.title, choice.text);
    }
}

function startService(world) {
    setCurrentTask(world, publicExpeditionContent.stages.service.orders[0]);
}

function addScore(world, key) {
    if (SCORE_KEYS.includes(key))
        world.score[key] = (world.score[key] ?? 0) + 1;
}

function completeStage(world, stage) {
    if (!world.completedStages.includes(stage))
        world.completedStages.push(stage);
}

function addParticipant(world, farmId) {
    const id = String(farmId);
    if (!world.participants.includes(id))
        world.participants.push(id);
}

function taskTarget(task) {
    return Math.max(1, Math.floor(Number(task?.target) || 1));
}

function currentTaskState(world) {
    const task = currentPublicTask(world);
    if (!task)
        return null;
    return (world.tasks[task.id] ??= normalizeTaskState({}, task));
}

export function currentPublicTask(world) {
    if (world.phase !== "task")
        return null;
    return taskById.get(world.currentTaskId) ?? null;
}

function choiceOptions(world) {
    if (world.phase === "vote")
        return publicExpeditionContent.vote.options;
    if (world.phase === "task" && currentPublicTask(world)?.kind === "question")
        return currentPublicTask(world).options;
    if (world.phase !== "choice")
        return null;
    if (world.choiceIndex === 1)
        return publicExpeditionContent.opening.options;
    if (world.choiceIndex === 2)
        return publicExpeditionContent.stages.letters.choice.options;
    if (world.choiceIndex === 3)
        return publicExpeditionContent.stages.service.choice.options;
    return publicExpeditionContent.choices["4"].options;
}

function choiceTitle(world) {
    if (world.phase === "vote")
        return publicExpeditionContent.vote.title;
    if (world.phase === "task" && currentPublicTask(world)?.kind === "question")
        return currentPublicTask(world).name;
    if (world.choiceIndex === 1)
        return publicExpeditionContent.opening.title;
    if (world.choiceIndex === 2)
        return publicExpeditionContent.stages.letters.choice.title;
    if (world.choiceIndex === 3)
        return publicExpeditionContent.stages.service.choice.title;
    return publicExpeditionContent.choices["4"].title;
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

function determineEnding(finalOption) {
    return publicExpeditionContent.endingByFinalChoice[finalOption];
}

function finishWithEnding(world, endingId, now, farms) {
    const ending = publicExpeditionContent.endings[endingId];
    world.endingId = endingId;
    world.endingTitle = ending.title;
    world.endingText = ending.text;
    world.endingTitleId = ending.rewardTitleId;
    world.endedAt = now;
    world.endedDay = currentDayIndex(now);
    world.phase = "ended";
    world.currentTaskId = null;
    world.history.push({ kind: "ending", title: ending.title, text: ending.text });
    settlePublicExpeditionRewards(world, farms, now);
}

function resumeCooldown(world) {
    const next = world.cooldown?.next;
    world.cooldown = null;
    if (next === "letters")
        startLetters(world);
    else if (next === "choice3")
        openChoice(world, 3);
    else if (next === "final")
        openChoice(world, 4);
}

export function advancePublicExpedition(world, farms = [], now = Date.now()) {
    for (const archived of world.archives ?? [])
        if (archived?.endingId)
            settlePublicExpeditionRewards(archived, farms, now);
    if (world.endingId)
        settlePublicExpeditionRewards(world, farms, now);
    const today = currentDayIndex(now);
    if (world.phase === "cooldown" && world.cooldown && now >= world.cooldown.readyAt)
        resumeCooldown(world);
    if (world.phase === "ended" && Number.isSafeInteger(world.endedDay) && today > world.endedDay) {
        world.phase = "vote";
        world.vote = { day: world.endedDay + 1, votes: {} };
    }
    if (world.phase === "vote" && Number.isSafeInteger(world.vote?.day) && today > world.vote.day) {
        const votes = Object.values(world.vote.votes ?? {});
        const restart = votes.filter((vote) => vote === "A").length;
        const keep = votes.filter((vote) => vote === "B").length;
        if (restart > keep)
            replaceWorld(world, makeRound(world.round + 1, now, [...world.archives, archiveRound(world)]));
        else
            world.phase = "closed";
    }
    return world;
}

function markTaskHistory(world, task, state) {
    world.history.push({
        kind: "task",
        title: task.name,
        text: task.opening,
        target: taskTarget(task),
        contributions: state.contributions.map((item) => ({ farmId: item.farmId, farmName: item.farmName, fact: item.fact })),
    });
}

function finishCurrentTask(world, task, state, now) {
    state.completedAt = now;
    markTaskHistory(world, task, state);
    if (task.id === "recipe_question") {
        setCurrentTask(world, publicExpeditionContent.stages.recipe.dish);
        return;
    }
    if (task.id === "recipe_dish") {
        const result = publicExpeditionContent.stages.recipe.result;
        completeStage(world, "recipe");
        addScore(world, result.score);
        world.history.push({ kind: "story", title: result.title, text: result.text });
        world.phase = "cooldown";
        world.currentTaskId = null;
        world.cooldown = {
            taskId: task.id,
            text: result.cooldownText,
            readyAt: now + result.cooldownHours * HOUR_MS,
            startedAt: now,
            next: world.completedStages.includes("letters") ? "choice3" : "letters",
        };
        return;
    }
    if (task.id === "letter_encounter") {
        const stage = publicExpeditionContent.stages.letters;
        const clue = {
            id: `${world.storyId}:${world.round}:${task.id}`,
            taskId: task.id,
            title: task.clueTitle,
            text: task.clueText,
            at: now,
        };
        world.clues.push(clue);
        world.history.push({ kind: "clue", title: clue.title, text: clue.text, taskName: task.name });
        world.history.push({ kind: "story", title: stage.result.title, text: stage.result.text });
        completeStage(world, "letters");
        addScore(world, stage.result.score);
        openChoice(world, 2);
        return;
    }
    const serviceOrders = publicExpeditionContent.stages.service.orders;
    const orderIndex = serviceOrders.findIndex((order) => order.id === task.id);
    if (orderIndex < 0)
        return;
    const needsExtra = world.openingChoice === "C";
    const lastIndex = needsExtra ? serviceOrders.length - 1 : serviceOrders.length - 2;
    if (orderIndex < lastIndex) {
        setCurrentTask(world, serviceOrders[orderIndex + 1]);
        return;
    }
    const service = publicExpeditionContent.stages.service;
    completeStage(world, "service");
    world.history.push({ kind: "story", title: "三班船都已照常离岸", text: service.results[world.serviceChoice] });
    world.phase = "cooldown";
    world.currentTaskId = null;
    world.cooldown = {
        taskId: task.id,
        text: service.cooldownText,
        readyAt: now + service.cooldownHours * HOUR_MS,
        startedAt: now,
        next: "final",
    };
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
        const id = `${world.storyId}:${world.round}:${task.id}`;
        if (!value.aiClues.includes(id))
            value.aiClues.push(id);
    }
    markImmediateAiPhase(world, farm);
}

function answerQuestion(world, farm, option, now, farms) {
    const task = currentPublicTask(world);
    const answers = world.questionAnswers;
    const state = cleanObject(answers[farm.id]);
    answers[farm.id] = state;
    if (state.correctAt)
        return { ok: false, text: "你已经答对这道题；全服推进后，后来加入的玩家不用补题。" };
    if (Number(state.cooldownUntil) > now)
        return { ok: false, text: `这次个人问答仍在冷却中，请在北京时间 ${cooldownReadyText({ readyAt: state.cooldownUntil })} 后再试。` };
    if (option !== task.correct) {
        state.lastOption = option;
        state.cooldownUntil = now + task.wrongCooldownHours * HOUR_MS;
        return { ok: false, text: "答案不对；只让你本人冷却 2 小时，不影响其他玩家或公共任务。" };
    }
    state.correctAt = now;
    state.cooldownUntil = null;
    return recordPublicContribution(world, farm, { kind: "question", answer: option }, now, farms);
}

export function runPublicChoice(world, farm, rawOption, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const option = String(rawOption ?? "").trim().toUpperCase();
    const options = choiceOptions(world);
    if (world.phase === "task" && currentPublicTask(world)?.kind === "question") {
        if (!options?.[option])
            return { ok: false, text: "当前个人问答没有这个选项。" };
        const result = answerQuestion(world, farm, option, now, farms);
        markImmediateAiPhase(world, farm);
        return result;
    }
    if (world.phase === "cooldown")
        return { ok: false, text: currentPromptText(world, farm, farms, now) };
    if (!options?.[option])
        return { ok: false, text: world.phase === "task" ? "当前公共任务尚未完成，还不能进入下一次选择。" : "当前没有这个公共选项。" };
    if (world.phase === "vote") {
        world.vote.votes[farm.id] = option;
        markImmediateAiPhase(world, farm);
        return { ok: true, text: `${option === "A" ? "🔁 已投票开启新一轮" : "📚 已投票保留本轮结局"}。截止前可以改票。\n${publicExpeditionText(world, farm, now, farms)}` };
    }
    const label = options[option];
    const ballot = ensureChoiceBallot(world);
    if (!ballot.votes[farm.id])
        addParticipant(world, farm.id);
    ballot.votes[farm.id] = { option, farmName: farm.name, at: now };
    const counts = choiceSupportCounts(world);
    if (counts[option] < CHOICE_TARGET) {
        markImmediateAiPhase(world, farm);
        return { ok: true, text: `已记录你对 ${option}「${label}」的选择。等其他农场也作出决定后，剧情才会推进。\n\n${publicExpeditionText(world, farm, now, farms)}` };
    }
    const index = world.choiceIndex;
    const resolvedVotes = ballot.votes;
    recordResolvedChoice(world, option, label, resolvedVotes);
    world.choiceBallot = null;
    if (index <= 3)
        addScore(world, publicExpeditionContent.scoreEffects[String(index)][option]);
    if (index === 1) {
        world.openingChoice = option;
        if (option === "C")
            startLetters(world);
        else
            startRecipe(world);
    }
    else if (index === 2) {
        world.letterChoice = option;
        const result = publicExpeditionContent.stages.letters.choice.results[option];
        world.history.push({ kind: "story", title: result.title, text: result.text });
        if (world.completedStages.includes("recipe"))
            openChoice(world, 3);
        else
            startRecipe(world);
    }
    else if (index === 3) {
        world.serviceChoice = option;
        startService(world);
    }
    else {
        finishWithEnding(world, determineEnding(option), now, farms);
    }
    markImmediateAiPhase(world, farm);
    return { ok: true, text: `${option}「${label}」已得到 ${CHOICE_TARGET} 名玩家共同选择，成为本阶段决定。\n\n${publicExpeditionText(world, farm, now, farms)}` };
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
    if (state.contributions.some((item) => String(item.farmId) === String(farm.id)))
        return { ok: false, text: `你已经为【${task.name}】完成过一份关键贡献，这次没有消耗任务物品；等其他农场接棒吧。`, task };
    if (task.id === "service_pancake" || task.id === "service_honey_tea") {
        if (world.serviceFarmIds.includes(String(farm.id)))
            return { ok: false, text: "前三张营业订单需要由三家不同农场依次送回；这次没有消耗料理。", task };
    }
    if (meta.targetFarmId && state.contributions.some((item) => item.targetFarmId === meta.targetFarmId))
        return { ok: false, text: "这块任务目标已经得到过公共照料，请换另一块。", task };
    return { ok: true, task, state };
}

export function recordPublicContribution(world, farm, meta = {}, now = Date.now(), farms = []) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    const state = currentTaskState(world);
    const allowed = checkPublicContribution(world, farm, meta.kind, meta, now, farms);
    if (!allowed.ok)
        return allowed;
    const index = state.contributions.length;
    const fact = task.contributions[index] ?? task.contributions.at(-1) ?? "完成一份公共贡献。";
    state.contributions.push({ farmId: String(farm.id), farmName: farm.name, at: now, fact, ...meta });
    addParticipant(world, farm.id);
    if (["service_rice_ball", "service_pancake", "service_honey_tea"].includes(task.id)
        && !world.serviceFarmIds.includes(String(farm.id)))
        world.serviceFarmIds.push(String(farm.id));
    const completed = state.contributions.length >= taskTarget(task);
    if (completed)
        finishCurrentTask(world, task, state, now);
    markImmediateAiContribution(world, farm, task, completed);
    let text = `${taskProgressText(world, task)}\n\n${publicExpeditionContent.rewardNotice}`;
    if (completed)
        text += `\n\n${currentPromptText(world, farm, farms, now)}`;
    return { ok: true, text, task, completed, fact };
}

export function recordPublicPlantEncounter(world, farm, now = Date.now(), farms = [], random = Math.random) {
    advancePublicExpedition(world, farms, now);
    const task = currentPublicTask(world);
    if (task?.kind !== "plant_encounter")
        return { ok: true, triggered: false, text: "" };
    const allowed = checkPublicContribution(world, farm, "plant_encounter", {}, now, farms);
    if (!allowed.ok)
        return { ok: true, triggered: false, text: "" };
    const beijingHour = new Date(now + BEIJING_OFFSET_MS).getUTCHours();
    if (beijingHour < 8 || beijingHour >= 10)
        return { ok: true, triggered: false, text: "" };
    const misses = Math.max(0, Math.floor(Number(world.encounterMisses[farm.id]) || 0));
    if (misses < 2 && Number(random()) >= 0.7) {
        world.encounterMisses[farm.id] = misses + 1;
        return { ok: true, triggered: false, text: "" };
    }
    delete world.encounterMisses[farm.id];
    const result = recordPublicContribution(world, farm, { kind: "plant_encounter" }, now, farms);
    return { ...result, triggered: result.ok, text: result.ok ? `🫏 普通种子刚落进新土，灰背的旧货车在田边停了下来。\n${result.text}` : "" };
}

// 第一期曾使用的剧情试验田入口继续保留为兼容导出；第二期不会调用或创建任务地块。
export function markPublicTrialPlot(world, farm, plot, cropSnapshot, now = Date.now(), farms = []) {
    if (currentPublicTask(world)?.id !== "b_plant")
        return { ok: false, text: "当前没有剧情试种任务。" };
    return recordPublicContribution(world, farm, { kind: "plant", plotId: plot?.id, crop: copy(cropSnapshot) }, now, farms);
}

export function findPublicWaterTarget() {
    return null;
}

export function findPublicHarvestPlot() {
    return null;
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
    return `【公共任务·${task.name}】${state.contributions.length}/${taskTarget(task)}\n${task.opening}${rows ? `\n\n已完成：\n${rows}` : ""}`;
}

function optionsText(world) {
    const options = choiceOptions(world);
    return options ? Object.entries(options).map(([key, label]) => `${key}．${label}`).join("\n") : "";
}

function directCallGuide(world, farm) {
    if (!farm)
        return "";
    if (world.phase === "choice" || world.phase === "vote" || currentPublicTask(world)?.kind === "question") {
        const options = choiceOptions(world);
        const calls = Object.keys(options ?? {}).map((option) => `${option} → ${JSON.stringify({ action: "together", option })}`);
        return calls.length ? `【可直接调用】\n${calls.join("\n")}` : "";
    }
    const task = currentPublicTask(world);
    if (!task)
        return "";
    const state = world.tasks[task.id] ?? { contributions: [] };
    if (state.contributions.some((item) => String(item.farmId) === String(farm.id)))
        return `你已经为【${task.name}】完成过一份关键贡献；等其他农场接棒吧。`;
    if (task.kind === "plant_encounter")
        return "请把三条公共记录联系起来，直接尝试对应的普通农场行动。";
    if (task.kind === "dish") {
        if (!findPublicDish(farm, task.dish, task.dish))
            return `料理柜里没有任务需要的「${task.dish}」，这次没有消耗料理。`;
        return `【可直接调用】\n${JSON.stringify({ action: "kitchen", op: "use", dishId: task.dish, target: task.npc })}`;
    }
    return "";
}

function currentPromptText(world, farm, farms = [], now = Date.now()) {
    const guide = directCallGuide(world, farm, farms, now);
    if (world.phase === "task") {
        const task = currentPublicTask(world);
        const options = task?.kind === "question" ? optionsText(world) : "";
        return `${taskProgressText(world, task)}${options ? `\n\n${options}` : ""}${guide ? `\n\n${guide}` : ""}`;
    }
    if (world.phase === "choice")
        return `【${world.choiceIndex}/4·${choiceTitle(world)}】\n${optionsText(world)}${guide ? `\n\n${guide}` : ""}`;
    if (world.phase === "vote")
        return `🔁 ${publicExpeditionContent.vote.title}\n${publicExpeditionContent.vote.text}\n\n${optionsText(world)}${guide ? `\n\n${guide}` : ""}`;
    if (world.phase === "cooldown")
        return `⏳ 本阶段暂告一段落\n${world.cooldown?.text ?? "大家正在处理刚刚完成的事情。"}\n\n下一段剧情将在北京时间 ${cooldownReadyText(world.cooldown)} 开放。`;
    if (world.phase === "ended")
        return "本轮结局已经产生；次日北京时间 00:00–23:59 开放重开投票。";
    return "本轮结局与实际故事线已归档。";
}

function historyText(entries) {
    return entries.map((entry) => {
        if (entry.kind === "choice") {
            const names = entry.voters?.length ? entry.voters.map((item) => item.farmName).join("、") : entry.farmName;
            return `【共同选择 ${entry.step}】${entry.option}：${entry.label}${names ? `\n由 ${names} 共同决定` : ""}`;
        }
        if (entry.kind === "task") {
            const rows = (entry.contributions ?? []).map((item) => `· ${item.farmName}：${item.fact}`).join("\n");
            return `【公共任务·${entry.title}】${entry.contributions?.length ?? 0}/${entry.target ?? 3}\n${entry.text}${rows ? `\n\n已完成：\n${rows}` : ""}`;
        }
        if (entry.kind === "clue")
            return `🔎 公共线索【${entry.title}】\n${entry.text}`;
        return `【${entry.title}】\n${entry.text}`;
    }).join("\n\n");
}

export function publicExpeditionText(world, farm, now = Date.now(), farms = [], view = "recent") {
    advancePublicExpedition(world, farms, now);
    const header = `🧭 铃野共行｜本期故事：《${world.storyTitle ?? publicExpeditionContent.title}》｜第 ${world.round} 轮`;
    const ownReward = farm ? (world.rewards ?? []).find((reward) => String(reward.farmId) === String(farm.id)) : null;
    const clues = world.clues.length ? `｜线索 ${world.clues.length}/1` : "";
    const fullHistory = view === "history";
    const visibleHistory = fullHistory ? world.history : world.history.slice(-2);
    const historyTitle = fullHistory ? "📚 前情提要（完整实际路线）" : "📖 最近剧情（当前段＋上一段）";
    return `${header}\n全服进度：${publicExpeditionStatusLine(world, now, false)}${clues}\n\n${historyTitle}\n${historyText(visibleHistory)}\n\n${currentPromptText(world, farm, farms, now)}${ownReward ? `\n\n${publicExpeditionRewardText(ownReward)}` : ""}`;
}

export function publicExpeditionStatusLine(world, now = Date.now(), showChoiceCounts = true) {
    if (world.phase === "task") {
        const task = currentPublicTask(world);
        const progress = world.tasks[task.id]?.contributions?.length ?? 0;
        return `公共任务【${task.name}】${progress}/${taskTarget(task)}`;
    }
    if (world.phase === "choice") {
        if (!showChoiceCounts)
            return `等待第 ${world.choiceIndex}/4 次全服选择`;
        const counts = choiceSupportCounts(world);
        return `等待第 ${world.choiceIndex}/4 次全服选择（A ${counts.A}/${CHOICE_TARGET}｜B ${counts.B}/${CHOICE_TARGET}｜C ${counts.C}/${CHOICE_TARGET}）`;
    }
    if (world.phase === "cooldown")
        return `本阶段已完成，等待至北京时间 ${cooldownReadyText(world.cooldown)} 继续`;
    if (world.phase === "vote") {
        const votes = Object.values(world.vote?.votes ?? {});
        return `重开投票中（开启 ${votes.filter((vote) => vote === "A").length}｜保留 ${votes.filter((vote) => vote === "B").length}）`;
    }
    const title = world.endingTitle ?? publicExpeditionContent.endings[world.endingId]?.title ?? "已完成";
    return world.phase === "ended" ? `结局【${title}】；次日开放重开投票` : `结局【${title}】已归档`;
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
            notices.push(`🧭 铃野共行进展：${publicExpeditionStatusLine(world, now, false)}。用 {"action":"together"} 查看当前剧情。`);
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
    let artFile = publicExpeditionContent.art.opening;
    if (world.endingId)
        artFile = publicExpeditionContent.art[world.endingId] ?? artFile;
    else if (world.stage === "recipe")
        artFile = publicExpeditionContent.art.recipe;
    else if (world.stage === "letters")
        artFile = publicExpeditionContent.art.letters;
    else if (world.stage === "service")
        artFile = publicExpeditionContent.art.service;
    else if (world.stage === "final")
        artFile = publicExpeditionContent.art.final;
    const task = currentPublicTask(world);
    return {
        title: world.storyTitle ?? publicExpeditionContent.title,
        artFile,
        round: world.round,
        routeName: null,
        status: publicExpeditionStatusLine(world, now),
        history: copy(world.history),
        currentTask: task ? {
            ...copy(task),
            target: taskTarget(task),
            progress: world.tasks[task.id]?.contributions?.length ?? 0,
            contributors: copy(world.tasks[task.id]?.contributions ?? []),
        } : null,
        currentChoice: world.phase === "choice" || world.phase === "vote" ? {
            index: world.phase === "choice" ? world.choiceIndex : null,
            total: 4,
            title: choiceTitle(world),
            options: copy(choiceOptions(world)),
            counts: world.phase === "choice" ? choiceSupportCounts(world) : null,
        } : null,
        cooldown: world.phase === "cooldown" ? { ...copy(world.cooldown), readyText: cooldownReadyText(world.cooldown) } : null,
        ending: world.endingId ? { title: world.endingTitle, text: world.endingText, ...copy(publicExpeditionContent.endings[world.endingId]) } : null,
        rewards: copy(world.rewards ?? []),
        clues: copy(world.clues),
        clueTarget: 1,
        archives: copy(world.archives),
    };
}
