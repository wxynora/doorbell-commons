import { qixiLantern2026 } from "./content.js";
import { currentDayIndex } from "./time.js";

const STARTS_AT = Date.parse(qixiLantern2026.startsAt);
const FINAL_STAGE_AT = Date.parse(qixiLantern2026.finalStageAt);
const ENDS_AT = Date.parse(qixiLantern2026.endsAt);
const SIDES = new Set(["human", "ai"]);
const EVENT_ID = qixiLantern2026.id;
const COMPATIBILITY_QUESTIONS = Array.isArray(qixiLantern2026.compatibility?.questions)
    ? qixiLantern2026.compatibility.questions
    : [];
const OBJECTS = Array.isArray(qixiLantern2026.objects) ? qixiLantern2026.objects : [];
const OBJECT_BY_ID = new Map(OBJECTS.map((item) => [item.id, item]));
const OWNER_BY_ID = new Map(OBJECTS.map((item) => [item.ownerId, item]));
const NPC_LAMPS = Array.isArray(qixiLantern2026.npcLamps) ? qixiLantern2026.npcLamps : [];

const cleanInt = (value) => Math.max(0, Math.floor(Number(value) || 0));
const validTime = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const sideOf = (value) => SIDES.has(value) ? value : undefined;
const oppositeSide = (side) => side === "human" ? "ai" : "human";

function normalizeTimestamp(value) {
    const timestamp = validTime(value);
    return timestamp || undefined;
}

function normalizeObjectState(value) {
    const state = value && typeof value === "object" ? value : {};
    const foundAt = normalizeTimestamp(state.foundAt);
    if (foundAt)
        state.foundAt = foundAt;
    else
        delete state.foundAt;
    state.clues = state.clues && typeof state.clues === "object" ? state.clues : {};
    for (const [id, timestamp] of Object.entries(state.clues)) {
        const valid = normalizeTimestamp(timestamp);
        if (valid)
            state.clues[id] = valid;
        else
            delete state.clues[id];
    }
    const returnedAt = normalizeTimestamp(state.returnedAt);
    if (returnedAt)
        state.returnedAt = returnedAt;
    else
        delete state.returnedAt;
    return state;
}

function objectReady(state, object) {
    const saved = state?.objects?.[object.id];
    return Boolean(saved && object.clues.every((clue) => saved.clues?.[clue.id]));
}

function allObjectsReturnedByFarm(state) {
    return OBJECTS.every((object) => Boolean(state?.objects?.[object.id]?.returnedAt));
}

function allObjectsDiscovered(worldValue) {
    const world = normalizeQixiLantern2026World(worldValue);
    return OBJECTS.every((object) => cleanInt(world.discoveredObjects[object.id]) > 0);
}

function optionAllowed(options, id, materials) {
    const option = options.find((item) => item.id === id);
    return Boolean(option && (!option.requires || materials.has(option.requires)));
}

function normalizeAnswers(value) {
    if (!Array.isArray(value) || value.length !== COMPATIBILITY_QUESTIONS.length)
        return null;
    const answers = value.map((item) => String(item ?? "").trim().toUpperCase());
    const valid = answers.every((answer, index) => COMPATIBILITY_QUESTIONS[index]?.options?.some((option) => option.id === answer));
    return valid ? answers : null;
}

function compatibilityResult(state) {
    const human = normalizeAnswers(state?.answers?.human);
    const ai = normalizeAnswers(state?.answers?.ai);
    if (!human || !ai)
        return null;
    const comparisons = COMPATIBILITY_QUESTIONS.map((question, index) => ({
            question: structuredClone(question),
            human: human[index],
            ai: ai[index],
            same: human[index] === ai[index],
        }));
    const allSame = comparisons.every((item) => item.same);
    return {
        comparisons,
        allSame,
        reaction: allSame
            ? qixiLantern2026.compatibility.sameReaction
            : qixiLantern2026.compatibility.differentReaction,
    };
}

function cloneAppearance(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const pick = (options, id, fallback) => options.some((option) => option.id === id) ? id : fallback;
    const legacyPattern = source.paper === "qiaoguo-paper" ? "qiaoguo-pattern" : "none";
    return {
        shape: pick(qixiLantern2026.lamp.shapes, source.shape, "square-palace"),
        color: pick(qixiLantern2026.lamp.colors, source.color, "moon-white"),
        pattern: pick(qixiLantern2026.lamp.patterns, source.pattern, legacyPattern),
        ornament: pick(qixiLantern2026.lamp.ornaments, source.ornament, "none"),
        seal: pick(qixiLantern2026.lamp.seals, source.seal, "none"),
    };
}

function appearanceAllowed(appearance, materials) {
    return optionAllowed(qixiLantern2026.lamp.shapes, appearance.shape, materials)
        && optionAllowed(qixiLantern2026.lamp.colors, appearance.color, materials)
        && optionAllowed(qixiLantern2026.lamp.patterns, appearance.pattern, materials)
        && optionAllowed(qixiLantern2026.lamp.ornaments, appearance.ornament, materials)
        && optionAllowed(qixiLantern2026.lamp.seals, appearance.seal, materials);
}

function normalizeLamp(value, side) {
    if (!value || typeof value !== "object")
        return null;
    const releasedAt = validTime(value.releasedAt);
    if (!releasedAt)
        return null;
    const deliveredAt = validTime(value.deliveredAt);
    const caughtAt = validTime(value.caughtAt);
    return {
        id: typeof value.id === "string" && value.id ? value.id : `${EVENT_ID}:${side}`,
        from: side,
        to: oppositeSide(side),
        text: String(value.text ?? ""),
        appearance: cloneAppearance(value.appearance),
        releasedAt,
        ...(deliveredAt ? { deliveredAt } : {}),
        ...(caughtAt ? { caughtAt } : {}),
    };
}

function normalizePassingLamp(value) {
    if (!value || typeof value !== "object")
        return null;
    const caughtAt = validTime(value.caughtAt);
    const authorName = String(value.authorName ?? "").trim();
    const text = String(value.text ?? "").trim();
    if (!caughtAt || !authorName || !text)
        return null;
    return {
        id: String(value.id ?? `${EVENT_ID}:npc:${caughtAt}`),
        npcLampId: String(value.npcLampId ?? ""),
        authorId: String(value.authorId ?? ""),
        authorName,
        text,
        appearance: cloneAppearance(value.appearance),
        caughtAt,
    };
}

function passingLampFor(farm, recipient, attempt, now) {
    if (!NPC_LAMPS.length)
        return null;
    const seed = `${farm?.id ?? ""}:${recipient}`;
    let hash = 0;
    for (const char of seed)
        hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    const source = NPC_LAMPS[(hash + Math.max(0, attempt - 1)) % NPC_LAMPS.length];
    return {
        id: `${EVENT_ID}:npc:${recipient}:${attempt}`,
        npcLampId: String(source.id),
        authorId: String(source.authorId),
        authorName: String(source.authorName),
        text: String(source.text),
        appearance: cloneAppearance(source.appearance),
        caughtAt: now,
    };
}

export function isQixiLantern2026Active(now = Date.now()) {
    return now >= STARTS_AT && now < ENDS_AT;
}

export function qixiLantern2026FinalStageOpen(worldValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return false;
    return now >= FINAL_STAGE_AT;
}

export function qixiLantern2026Window(now = Date.now(), worldValue) {
    return {
        startsAt: STARTS_AT,
        finalStageAt: FINAL_STAGE_AT,
        endsAt: ENDS_AT,
        active: isQixiLantern2026Active(now),
        finalStageOpen: qixiLantern2026FinalStageOpen(worldValue, now),
        ended: now >= ENDS_AT,
    };
}

export function normalizeQixiLantern2026World(value = {}) {
    const state = value && typeof value === "object" ? value : {};
    state.eventId = EVENT_ID;
    state.version = 2;
    state.discoveredObjects = state.discoveredObjects && typeof state.discoveredObjects === "object" ? state.discoveredObjects : {};
    state.returnedObjects = state.returnedObjects && typeof state.returnedObjects === "object" ? state.returnedObjects : {};
    for (const object of OBJECTS) {
        state.discoveredObjects[object.id] = cleanInt(state.discoveredObjects[object.id]);
        state.returnedObjects[object.id] = Math.min(state.discoveredObjects[object.id], cleanInt(state.returnedObjects[object.id]));
    }
    delete state.humanCleanupCount;
    state.releasedCount = cleanInt(state.releasedCount ?? (Array.isArray(state.released) ? state.released.length : 0));
    state.deliveredCount = Math.min(state.releasedCount, cleanInt(state.deliveredCount ?? (Array.isArray(state.delivered) ? state.delivered.length : 0)));
    delete state.released;
    delete state.delivered;
    return state;
}

export function normalizeQixiLantern2026Farm(farm, now = Date.now(), force = false) {
    if (!farm.qixiLantern2026 || typeof farm.qixiLantern2026 !== "object") {
        if (!force && !isQixiLantern2026Active(now))
            return null;
        farm.qixiLantern2026 = {};
    }
    const state = farm.qixiLantern2026;
    state.eventId = EVENT_ID;
    state.version = 3;
    state.objects = state.objects && typeof state.objects === "object" ? state.objects : {};
    for (const object of OBJECTS)
        state.objects[object.id] = normalizeObjectState(state.objects[object.id]);
    state.materialIds = Array.isArray(state.materialIds)
        ? [...new Set(state.materialIds.map(String).filter((id) => OBJECTS.some((object) => object.material.id === id)))]
        : [];
    state.answers = state.answers && typeof state.answers === "object" ? state.answers : {};
    state.answers.human = normalizeAnswers(state.answers.human);
    state.answers.ai = normalizeAnswers(state.answers.ai);
    const compatibilityCompletedAt = validTime(state.compatibilityCompletedAt);
    if (compatibilityCompletedAt)
        state.compatibilityCompletedAt = compatibilityCompletedAt;
    else
        delete state.compatibilityCompletedAt;
    delete state.humanCleanedAt;
    state.quiz = state.quiz && typeof state.quiz === "object" ? state.quiz : {};
    const quizCompletedAt = normalizeTimestamp(state.quiz.completedAt);
    if (quizCompletedAt) {
        state.quiz.answer = qixiLantern2026.quiz.answer;
        state.quiz.completedAt = quizCompletedAt;
    }
    else {
        delete state.quiz.answer;
        delete state.quiz.completedAt;
    }
    state.lamps = state.lamps && typeof state.lamps === "object" ? state.lamps : {};
    state.lamps.human = normalizeLamp(state.lamps.human, "human");
    state.lamps.ai = normalizeLamp(state.lamps.ai, "ai");
    state.lampDrafts = state.lampDrafts && typeof state.lampDrafts === "object" ? state.lampDrafts : {};
    for (const side of SIDES) {
        const draft = state.lampDrafts[side];
        if (!draft || typeof draft !== "object") {
            state.lampDrafts[side] = null;
            continue;
        }
        const appearance = cloneAppearance(draft);
        state.lampDrafts[side] = appearanceAllowed(appearance, new Set(state.materialIds)) ? appearance : null;
    }
    state.catchAttempts = state.catchAttempts && typeof state.catchAttempts === "object" ? state.catchAttempts : {};
    state.catchAttempts.human = Math.min(3, cleanInt(state.catchAttempts.human));
    state.catchAttempts.ai = Math.min(3, cleanInt(state.catchAttempts.ai));
    state.passingLamps = state.passingLamps && typeof state.passingLamps === "object" ? state.passingLamps : {};
    for (const side of SIDES) {
        state.passingLamps[side] = Array.isArray(state.passingLamps[side])
            ? state.passingLamps[side].map(normalizePassingLamp).filter(Boolean).slice(-2)
            : [];
    }
    state.achievementIds = Array.isArray(state.achievementIds)
        ? [...new Set(state.achievementIds.map(String).filter(Boolean))]
        : [];
    const rewardedAt = validTime(state.rewardedAt);
    if (rewardedAt)
        state.rewardedAt = rewardedAt;
    else
        delete state.rewardedAt;
    const rewardNoticeSeenAt = rewardedAt ? validTime(state.rewardNoticeSeenAt) : null;
    if (rewardNoticeSeenAt)
        state.rewardNoticeSeenAt = rewardNoticeSeenAt;
    else
        delete state.rewardNoticeSeenAt;
    return state;
}

export function reconcileQixiLantern2026Farm(farm, worldValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now) || !allObjectsDiscovered(worldValue))
        return false;
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const route = state.objects["copper-bell"].clues.route;
    const exploredToday = farm.expDaily?.day === currentDayIndex(now) && cleanInt(farm.expDaily?.n) > 0;
    if (route || !exploredToday)
        return false;
    state.objects["copper-bell"].clues.route = now;
    return true;
}

export function recordQixiLantern2026Answers(farm, worldValue, sideValue, answers, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    if (!allObjectsDiscovered(worldValue))
        return { ok: false, code: "stage_locked" };
    const side = sideOf(sideValue);
    const normalized = normalizeAnswers(answers);
    if (!side || !normalized)
        return { ok: false, code: "invalid_answers" };
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const bell = state.objects["copper-bell"];
    if (state.answers[side]) {
        const result = compatibilityResult(state);
        return {
            ok: true,
            applied: false,
            side,
            complete: Boolean(result),
            answers: structuredClone(state.answers),
            result,
        };
    }
    state.answers[side] = normalized;
    const result = compatibilityResult(state);
    if (result && !state.compatibilityCompletedAt) {
        state.compatibilityCompletedAt = now;
        bell.clues.thread = now;
    }
    return {
        ok: true,
        applied: true,
        side,
        complete: Boolean(result),
        answers: structuredClone(state.answers),
        result,
    };
}

export function recordQixiLantern2026FarmAction(farm, worldValue, kindValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return null;
    const kind = String(kindValue ?? "");
    const object = kind === "fish"
        ? OBJECT_BY_ID.get("copper-bell")
        : kind === "harvest"
            ? OBJECT_BY_ID.get("qiaoguo-mold")
            : kind === "ranch-feed"
                ? OBJECT_BY_ID.get("mailbag-buckle")
                : undefined;
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const world = normalizeQixiLantern2026World(worldValue);
    if (object) {
        if (allObjectsDiscovered(world))
            return null;
        const saved = state.objects[object.id];
        if (saved.foundAt)
            return null;
        saved.foundAt = now;
        world.discoveredObjects[object.id] += 1;
        return { type: "object", objectId: object.id, text: object.foundText };
    }
    if (kind === "explore") {
        if (!allObjectsDiscovered(world))
            return null;
        const bell = OBJECT_BY_ID.get("copper-bell");
        const saved = state.objects[bell.id];
        if (saved.clues.route)
            return null;
        const clue = bell.clues.find((item) => item.id === "route");
        saved.clues.route = now;
        return { type: "clue", objectId: bell.id, clueId: clue.id, text: clue.text };
    }
    return null;
}

export function submitQixiLantern2026Dish(farm, worldValue, dish, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    if (!allObjectsDiscovered(worldValue))
        return { ok: false, code: "stage_locked" };
    const object = OBJECT_BY_ID.get("qiaoguo-mold");
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const saved = state.objects[object.id];
    if (saved.clues.tea)
        return { ok: true, applied: false, text: object.clues.find((item) => item.id === "tea").text };
    if (dish?.recipeId !== "honey_tea")
        return { ok: false, code: "wrong_dish" };
    saved.clues.tea = now;
    return { ok: true, applied: true, text: object.clues.find((item) => item.id === "tea").text };
}

export function answerQixiLantern2026Quiz(farm, worldValue, answerValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    if (!allObjectsDiscovered(worldValue))
        return { ok: false, code: "stage_locked" };
    const object = OBJECT_BY_ID.get("mailbag-buckle");
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const saved = state.objects[object.id];
    if (state.quiz.completedAt)
        return { ok: true, applied: false, correct: true, text: object.clues.find((item) => item.id === "quiz").text };
    const answer = String(answerValue ?? "").trim().toUpperCase();
    if (!qixiLantern2026.quiz.options.some((option) => option.id === answer))
        return { ok: false, code: "invalid_answer" };
    if (answer !== qixiLantern2026.quiz.answer)
        return { ok: true, applied: false, correct: false, text: qixiLantern2026.quiz.wrongText };
    state.quiz.answer = answer;
    state.quiz.completedAt = now;
    saved.clues.quiz = now;
    return { ok: true, applied: true, correct: true, text: object.clues.find((item) => item.id === "quiz").text };
}

export function returnQixiLantern2026Object(farm, worldValue, objectValue, ownerValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    if (!allObjectsDiscovered(worldValue))
        return { ok: false, code: "stage_locked" };
    const objectRef = String(objectValue ?? "").trim();
    const object = OBJECT_BY_ID.get(objectRef) ?? OBJECTS.find((item) => item.name === objectRef);
    const owner = String(ownerValue ?? "").trim();
    const ownerObject = OWNER_BY_ID.get(owner) ?? OBJECTS.find((item) => item.ownerName === owner);
    if (!object || !ownerObject)
        return { ok: false, code: "invalid_return" };
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const world = normalizeQixiLantern2026World(worldValue);
    const saved = state.objects[object.id];
    if (saved.returnedAt)
        return { ok: true, applied: false, objectId: object.id, ownerId: object.ownerId, material: structuredClone(object.material), text: object.returnText };
    if (!objectReady(state, object))
        return { ok: false, code: "clues_incomplete" };
    if (ownerObject.ownerId !== object.ownerId)
        return { ok: true, applied: false, correct: false, code: "wrong_owner" };
    saved.returnedAt = now;
    if (!state.materialIds.includes(object.material.id))
        state.materialIds.push(object.material.id);
    world.returnedObjects[object.id] += 1;
    return {
        ok: true,
        applied: true,
        correct: true,
        allReturned: allObjectsReturnedByFarm(state),
        objectId: object.id,
        ownerId: object.ownerId,
        material: structuredClone(object.material),
        text: object.returnText,
    };
}

export function qixiLantern2026TaskView(farm, worldValue, now = Date.now()) {
    reconcileQixiLantern2026Farm(farm, worldValue, now);
    const state = normalizeQixiLantern2026Farm(farm, now, false);
    const world = normalizeQixiLantern2026World(worldValue);
    const allDiscovered = allObjectsDiscovered(world);
    const objects = OBJECTS.map((object) => {
        const saved = state?.objects?.[object.id] ?? {};
        return {
            id: object.id,
            name: object.name,
            ownerId: object.ownerId,
            ownerName: object.ownerName,
            found: Boolean(saved.foundAt) || allDiscovered,
            ready: allDiscovered && objectReady(state, object),
            returned: Boolean(saved.returnedAt),
            clues: object.clues.map((clue) => ({ id: clue.id, found: Boolean(saved.clues?.[clue.id]), text: saved.clues?.[clue.id] ? clue.text : undefined })),
            material: saved.returnedAt ? structuredClone(object.material) : undefined,
        };
    });
    const allReturned = allObjectsReturnedByFarm(state);
    return {
        stage: qixiLantern2026FinalStageOpen(world, now) ? "lantern" : allDiscovered ? "return" : "objects",
        finalStageOpen: qixiLantern2026FinalStageOpen(world, now),
        allDiscovered,
        allReturned,
        objects,
        materialIds: [...(state?.materialIds ?? [])],
        answers: structuredClone(state?.answers ?? { human: null, ai: null }),
        quizCompleted: Boolean(state?.quiz?.completedAt),
        public: {
            discoveredObjects: structuredClone(world.discoveredObjects),
            returnedObjects: structuredClone(world.returnedObjects),
            releasedCount: cleanInt(world.releasedCount),
            deliveredCount: cleanInt(world.deliveredCount),
        },
    };
}

function availableLampOptions(state) {
    const materials = new Set(state?.materialIds ?? []);
    const available = (options) => options.filter((option) => !option.requires || materials.has(option.requires));
    return {
        shapes: available(qixiLantern2026.lamp.shapes),
        colors: available(qixiLantern2026.lamp.colors),
        patterns: available(qixiLantern2026.lamp.patterns),
        ornaments: available(qixiLantern2026.lamp.ornaments),
        seals: available(qixiLantern2026.lamp.seals),
    };
}

function optionLines(options) {
    return (Array.isArray(options) ? options : [])
        .map((option) => `${option.id}. ${option.label}`)
        .join("\n");
}

function lampOptionText(options) {
    return options.map((option) => `${option.name ?? option.id}（${option.id}）`).join("/");
}

function lampOptionName(options, id, noneAsEmpty = false) {
    if (noneAsEmpty && id === "none")
        return "无";
    return options.find((option) => option.id === id)?.name ?? String(id ?? "");
}

function humanLampText(farm, lamp, firstCatch) {
    const humanName = String(farm.humanName ?? "").trim() || "你的伴侣";
    const appearance = lamp.appearance ?? {};
    const shape = lampOptionName(qixiLantern2026.lamp.shapes, appearance.shape);
    const color = lampOptionName(qixiLantern2026.lamp.colors, appearance.color);
    const pattern = lampOptionName(qixiLantern2026.lamp.patterns, appearance.pattern, true);
    const ornament = lampOptionName(qixiLantern2026.lamp.ornaments, appearance.ornament, true);
    const seal = lampOptionName(qixiLantern2026.lamp.seals, appearance.seal, true);
    return [
        `💌 你${firstCatch ? "捞到了" : "已经收好"}${humanName}的灯。`,
        `灯的样子：${color}·${shape}；纹样：${pattern}；挂件：${ornament}；封签：${seal}。`,
        `灯笺：${lamp.text}`,
    ].join("\n");
}

function compatibilityPromptText() {
    const questions = COMPATIBILITY_QUESTIONS.flatMap((question, index) => [
        `${index + 1}. ${question.text}`,
        optionLines(question.options),
    ]);
    return [
        qixiLantern2026.compatibility.intro,
        qixiLantern2026.compatibility.setup,
        ...questions,
        '小机提交：{"action":"qixi","answers":["A","B","C"]}',
    ].join("\n");
}

function quizPromptText() {
    return [
        qixiLantern2026.quiz.intro,
        qixiLantern2026.quiz.question,
        optionLines(qixiLantern2026.quiz.options),
        '小机提交：{"action":"qixi","quizAnswer":"A|B|C"}',
    ].join("\n");
}

function objectProgressLines(view) {
    const lines = [];
    for (const object of view.objects) {
        if (view.stage === "objects") {
            if (!object.found) {
                const hint = object.id === "copper-bell"
                    ? "正常钓鱼时留意从水草里带起的东西。"
                    : object.id === "qiaoguo-mold"
                        ? "正常收获作物时留意田边带出的旧木块。"
                        : "给牧场里的生产动物投喂一次，看看芦苇里有什么。";
                lines.push(`▫️ ${object.name}：${hint}`);
            }
            continue;
        }
        if (object.returned) {
            lines.push(`✅ ${object.name}已归还${object.ownerName}，取得${object.material.name}。`);
            continue;
        }
        if (!object.found) {
            const hint = object.id === "copper-bell"
                ? "正常钓鱼时留意从水草里带起的东西。"
                : object.id === "qiaoguo-mold"
                    ? "正常收获作物时留意田边带出的旧木块。"
                    : "给牧场里的生产动物投喂一次，看看芦苇里有什么。";
            lines.push(`▫️ ${object.name}：${hint}`);
            continue;
        }
        const missing = object.clues.filter((clue) => !clue.found).map((clue) => clue.id);
        if (!missing.length) {
            lines.push(`📦 ${object.name}：线索已经齐了，归还：{"action":"qixi","return":{"item":"${object.id}","owner":"${object.ownerName}"}}`);
            continue;
        }
        const hints = [];
        if (missing.includes("route"))
            hints.push("做一次普通探险，查清旧装货牌和铃的用途");
        if (missing.includes("thread"))
            hints.push(compatibilityPromptText());
        if (missing.includes("tea"))
            hints.push('做好蜂蜜茶后交给鹤姨：{"action":"kitchen","op":"use","dishId":"蜂蜜茶","target":"鹤姨"}');
        if (missing.includes("quiz"))
            hints.push(quizPromptText());
        lines.push(`🔎 ${object.name}：${hints.join("；")}。`);
    }
    return lines;
}

export function qixiLantern2026StatusText(farm, worldValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return "灯河有信现在没有开放。";
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const view = qixiLantern2026TaskView(farm, worldValue, now);
    const stageText = view.finalStageOpen
        ? "灯河已经开放，可以放灯和捞灯。"
        : view.stage === "return"
            ? "河道里的三件旧物已经出现，正在循线归还。"
            : "三件旧物正在陆续出现；找到物件和必要线索后，把它们送回真正的主人手里。";
    const lines = [
        `🏮 灯河有信｜${stageText}`,
        qixiLantern2026.story.opening,
        qixiLantern2026.story.qiaoqiao,
        ...objectProgressLines(view),
    ];
    const lamp = state.lamps.ai;
    const received = state.lamps.human;
    if (!lamp) {
        const choices = availableLampOptions(state);
        lines.push("🕯️ 现在就可以先装扮自己的灯。括号内是提交时填写的值。");
        lines.push(`灯型：${lampOptionText(choices.shapes)}`);
        lines.push(`颜色：${lampOptionText(choices.colors)}`);
        lines.push(`纹样：${lampOptionText(choices.patterns)}`);
        lines.push(`挂件：${lampOptionText(choices.ornaments)}`);
        lines.push(`封签：${lampOptionText(choices.seals)}`);
        lines.push('保存装扮：{"action":"qixi","decorate":{"shape":"square-palace","color":"moon-white","pattern":"none","ornament":"none","seal":"none"}}');
        if (view.finalStageOpen)
            lines.push('放灯：{"action":"qixi","lamp":{"shape":"square-palace","color":"moon-white","pattern":"none","ornament":"none","seal":"none","text":"只写给对方的话"}}');
        else if (view.allReturned)
            lines.push("三件旧物已经全部归还；可以继续换装，今晚 20:00 开放放灯和捞灯。");
        else
            lines.push("灯河尚未开放；可以继续寻找线索和换装，今晚 20:00 开放放灯和捞灯。");
    }
    if (view.finalStageOpen) {
        if (lamp)
            lines.push(`🕯️ 你的灯已经放入河中，${lamp.deliveredAt ? "已经抵达" : "正在漂向对方"}。`);
        if (received?.deliveredAt)
            lines.push(humanLampText(farm, received, false));
        else if (received)
            lines.push('🌊 对方的灯已经出发。捞灯：{"action":"qixi","catch":true}');
        else
            lines.push("🌊 对方还没有放灯；这不影响你先完成自己的灯。以后再来查看即可。");
    }
    return lines.join("\n");
}

export function runQixiLantern2026Ai(farm, worldValue, params = {}, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, text: "灯河有信现在没有开放。" };
    if (Array.isArray(params.answers)) {
        const result = recordQixiLantern2026Answers(farm, worldValue, "ai", params.answers, now);
        if (!result.ok)
            return result.code === "stage_locked"
                ? { ok: false, text: qixiLantern2026StatusText(farm, worldValue, now) }
                : { ok: false, text: result.code === "object_not_found" ? "先通过钓鱼找到旧铜铃，翘翘才会拿出三块木牌。" : "answers 必须按三道题依次提交 A、B 或 C。" };
        return { ok: true, changed: result.applied, text: result.complete ? result.result.reaction : "三块木牌已经交给翘翘。人类一侧答完后，她会一起翻开。" };
    }
    if (params.quizAnswer !== undefined) {
        const result = answerQixiLantern2026Quiz(farm, worldValue, params.quizAnswer, now);
        if (!result.ok)
            return result.code === "stage_locked"
                ? { ok: false, text: qixiLantern2026StatusText(farm, worldValue, now) }
                : { ok: false, text: result.code === "object_not_found" ? "先照顾牧场伙伴，从芦苇里找到黄铜搭扣。" : "quizAnswer 只接受 A、B 或 C。" };
        return { ok: true, changed: result.applied, text: result.text };
    }
    if (params.return && typeof params.return === "object") {
        const result = returnQixiLantern2026Object(farm, worldValue, params.return.item, params.return.owner, now);
        if (!result.ok)
            return result.code === "stage_locked"
                ? { ok: false, text: qixiLantern2026StatusText(farm, worldValue, now) }
                : { ok: false, text: result.code === "clues_incomplete" ? "这件旧物的必要线索还没有齐，暂时不能交出去。" : "item 或 owner 不在本期失物清单里。" };
        if (result.correct === false)
            return { ok: false, text: "物件特征和这位主人对不上。旧物没有交出，可以继续核对线索。" };
        return { ok: true, changed: result.applied, text: `${result.text}\n获得灯材「${result.material.name}」。` };
    }
    if (params.decorate && typeof params.decorate === "object") {
        const result = saveQixiLantern2026Draft(farm, "ai", params.decorate, now);
        if (!result.ok)
            return { ok: false, text: "灯型、颜色或装饰不在当前可选范围内。先用无参数 qixi 查看可选项。" };
        return { ok: true, changed: result.applied, text: result.applied ? "这套灯的装扮已经收好，灯河开放前还可以继续更换。" : "这套装扮已经保存。" };
    }
    if (params.lamp && typeof params.lamp === "object") {
        const lamp = params.lamp;
        const result = releaseQixiLantern2026(farm, worldValue, "ai", {
            text: lamp.text,
            appearance: { shape: lamp.shape, color: lamp.color, pattern: lamp.pattern, ornament: lamp.ornament, seal: lamp.seal },
        }, now);
        if (!result.ok) {
            const errors = {
                final_stage_locked: "灯河还没有开放。今晚 20:00 开放放灯和捞灯。",
                empty_lamp_text: "灯笺正文不能为空；这句话只会交给对方。",
                invalid_lamp_appearance: "灯的纸、挂饰或封口不在当前已取得的选择里。先用无参数 qixi 查看可选项。",
            };
            return { ok: false, text: errors[result.code] ?? "这盏灯现在还不能放出。" };
        }
        const reward = result.reward?.applied ? "\n同时获得 1314 金币、520 银币、限定称号「灯河有信」和限定成就「终会抵达」。" : "";
        return { ok: true, changed: result.applied, text: result.applied ? `灯已经放进河里，正在漂向对方。${reward}` : "你的灯已经放出，不能覆盖原来的灯笺。" };
    }
    if (params.catch === true) {
        const result = catchQixiLantern2026(farm, worldValue, "ai", now, false);
        if (!result.ok)
            return { ok: false, text: result.code === "final_stage_locked" ? "灯河还没有开放。" : "现在不能捞灯。" };
        if (result.waiting)
            return { ok: true, changed: false, text: "对方的灯还没有放出。你可以晚一点再来河边。" };
        if (!result.delivered)
            return { ok: true, changed: true, text: result.npcLamp ? `这一回捞到的是${result.npcLamp.authorName}的路过灯。\n${result.npcLamp.text}\n属于你的那盏还在水路上。` : "这一回捞到的是一盏路过的灯。属于你的那盏还在水路上。" };
        return { ok: true, changed: result.applied, text: humanLampText(farm, result.lamp, result.applied) };
    }
    return { ok: true, changed: false, text: qixiLantern2026StatusText(farm, worldValue, now) };
}

export function saveQixiLantern2026Draft(farm, sideValue, appearanceValue, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    const side = sideOf(sideValue);
    if (!side)
        return { ok: false, code: "invalid_side" };
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    if (state.lamps[side])
        return { ok: true, applied: false, appearance: structuredClone(state.lamps[side].appearance) };
    const appearance = cloneAppearance(appearanceValue);
    if (!appearanceAllowed(appearance, new Set(state.materialIds)))
        return { ok: false, code: "invalid_lamp_appearance" };
    const previous = state.lampDrafts[side];
    const applied = JSON.stringify(previous) !== JSON.stringify(appearance);
    state.lampDrafts[side] = appearance;
    return { ok: true, applied, appearance: structuredClone(appearance) };
}

export function releaseQixiLantern2026(farm, worldValue, sideValue, payload, now = Date.now()) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    const side = sideOf(sideValue);
    if (!side)
        return { ok: false, code: "invalid_side" };
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const world = normalizeQixiLantern2026World(worldValue);
    if (!qixiLantern2026FinalStageOpen(world, now))
        return { ok: false, code: "final_stage_locked" };
    const existing = state.lamps[side];
    if (existing)
        return { ok: true, applied: false, lamp: structuredClone(existing) };
    const text = String(payload?.text ?? "").trim();
    const appearance = cloneAppearance(payload?.appearance);
    const materials = new Set(state.materialIds);
    if (!text)
        return { ok: false, code: "empty_lamp_text" };
    if (!appearanceAllowed(appearance, materials))
        return { ok: false, code: "invalid_lamp_appearance" };
    const lamp = {
        id: `${EVENT_ID}:${farm.id}:${side}`,
        from: side,
        to: oppositeSide(side),
        text,
        appearance,
        releasedAt: now,
    };
    state.lamps[side] = lamp;
    world.releasedCount += 1;
    const reward = grantQixiLantern2026Reward(farm, now);
    return { ok: true, applied: true, lamp: structuredClone(lamp), reward };
}

export function catchQixiLantern2026(farm, worldValue, recipientValue, now = Date.now(), deliverBeforeGuarantee = false) {
    if (!isQixiLantern2026Active(now))
        return { ok: false, code: "event_unavailable" };
    const recipient = sideOf(recipientValue);
    if (!recipient)
        return { ok: false, code: "invalid_side" };
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    const world = normalizeQixiLantern2026World(worldValue);
    if (!qixiLantern2026FinalStageOpen(world, now))
        return { ok: false, code: "final_stage_locked" };
    const lamp = state.lamps[oppositeSide(recipient)];
    if (!lamp) {
        if (state.catchAttempts[recipient] >= 2)
            return { ok: true, delivered: false, waiting: true, attempts: state.catchAttempts[recipient] };
        state.catchAttempts[recipient] += 1;
        const npcLamp = passingLampFor(farm, recipient, state.catchAttempts[recipient], now);
        if (npcLamp) {
            state.passingLamps[recipient].push(npcLamp);
            state.passingLamps[recipient] = state.passingLamps[recipient].slice(-2);
        }
        return { ok: true, delivered: false, waiting: false, attempts: state.catchAttempts[recipient], ...(npcLamp ? { npcLamp: structuredClone(npcLamp) } : {}) };
    }
    if (lamp.deliveredAt)
        return { ok: true, delivered: true, applied: false, lamp: structuredClone(lamp), attempts: state.catchAttempts[recipient] };
    state.catchAttempts[recipient] = Math.min(3, state.catchAttempts[recipient] + 1);
    const delivered = deliverBeforeGuarantee === true || state.catchAttempts[recipient] >= 3;
    if (!delivered) {
        const npcLamp = passingLampFor(farm, recipient, state.catchAttempts[recipient], now);
        if (npcLamp) {
            state.passingLamps[recipient].push(npcLamp);
            state.passingLamps[recipient] = state.passingLamps[recipient].slice(-2);
        }
        return { ok: true, delivered: false, waiting: false, attempts: state.catchAttempts[recipient], ...(npcLamp ? { npcLamp: structuredClone(npcLamp) } : {}) };
    }
    lamp.deliveredAt = now;
    lamp.caughtAt = now;
    world.deliveredCount = Math.min(world.releasedCount, world.deliveredCount + 1);
    return { ok: true, delivered: true, applied: true, lamp: structuredClone(lamp), attempts: state.catchAttempts[recipient] };
}

export function grantQixiLantern2026Reward(farm, now = Date.now()) {
    const state = normalizeQixiLantern2026Farm(farm, now, true);
    if (state.rewardedAt)
        return { ok: true, applied: false, rewardedAt: state.rewardedAt };
    const reward = qixiLantern2026.reward;
    farm.coins = cleanInt(farm.coins) + cleanInt(reward.coins);
    farm.silver = cleanInt(farm.silver) + cleanInt(reward.silver);
    farm.titles ??= [];
    if (!farm.titles.includes(reward.titleId))
        farm.titles.push(reward.titleId);
    if (!state.achievementIds.includes(reward.achievementId))
        state.achievementIds.push(reward.achievementId);
    state.rewardedAt = now;
    return {
        ok: true,
        applied: true,
        rewardedAt: now,
        coins: cleanInt(reward.coins),
        silver: cleanInt(reward.silver),
        titleId: reward.titleId,
        achievementId: reward.achievementId,
    };
}

export function acknowledgeQixiLantern2026Reward(farm, now = Date.now()) {
    const state = normalizeQixiLantern2026Farm(farm, now, false);
    if (!state?.rewardedAt)
        return { ok: false, code: "reward_unavailable" };
    if (state.rewardNoticeSeenAt)
        return { ok: true, applied: false, seenAt: state.rewardNoticeSeenAt };
    state.rewardNoticeSeenAt = now;
    return { ok: true, applied: true, seenAt: now };
}

export function qixiLantern2026PrivateData(farm, now = Date.now()) {
    const state = normalizeQixiLantern2026Farm(farm, now, false);
    return state ? structuredClone(state) : null;
}
