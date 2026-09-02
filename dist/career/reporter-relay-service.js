import { createHash, randomInt } from "node:crypto";
import { readReporterBoardSnapshot } from "./reporter-board-snapshot.js";
import { readReporterDetentionMaterials } from "./reporter-detention-material.js";
import { reporterSelectionWithMaterials } from "./reporter-selection-material.js";
import { cancelUnperformedReporterSubmissionWork } from "./reporter-submission-work.js";
import { currentDayIndex } from "../time.js";
import {
    getPublicExpeditionWorld,
    playerFarms,
} from "../store.js";
import { beijingDayStart } from "../nature.js";
import { CareerDomainError } from "./contracts.js";
import {
    addBeijingDays,
    beijingDate,
    beijingTimestamp,
    runInTransaction,
} from "./persistence.js";
import {
    createReporterStoryWorkflow,
    ensureReporterDutyRoles,
    markReporterWorkflowPublished,
    reassignReporterStoryWorkflowWriter,
    reporterWorkflowForJob,
} from "./reporter-newsroom-service.js";
import { installCareerSchema } from "./schema.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RAW_MATERIAL_RETENTION_MS = 2 * DAY_MS;
const NEWSROOM_OPERATION = "go.newsroom.commission";
const OPTION_HANDLE_RE = /^opt_[A-Za-z0-9_-]{12}$/u;

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

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`reporter_invalid_${field}`);
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`reporter_invalid_${field}`);
    return value;
}

function canonical(value) {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("reporter_invalid_json");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    fail("reporter_invalid_json");
}

function digest(value) {
    return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function parseJson(value) {
    return JSON.parse(value);
}

function normalizeIssueWindow(input) {
    const issueDate = identifier(input?.issueDate, "issue_date");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(issueDate))
        fail("reporter_invalid_issue_date");
    const periodStart = timestamp(input?.periodStart, "period_start");
    const periodEnd = timestamp(input?.periodEnd, "period_end");
    const expectedEnd = beijingTimestamp(issueDate, 5);
    const expectedStart = beijingTimestamp(addBeijingDays(issueDate, -1), 5);
    if (periodStart !== expectedStart || periodEnd !== expectedEnd)
        fail("reporter_issue_window_conflict");
    return {
        issueDate,
        issueReference: `lingye-daily:${issueDate}`,
        periodStart,
        periodEnd,
    };
}

function mapIssue(row) {
    return {
        issueReference: row.issue_reference,
        issueDate: row.issue_date,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        packId: row.pack_id,
        selectorJobId: row.selector_job_id,
        writerJobId: row.writer_job_id,
        reviewerJobId: row.reviewer_job_id,
        selectorResidentId: row.selector_resident_id,
        writerResidentId: row.writer_resident_id,
        reviewerResidentId: row.reviewer_resident_id,
        selectionText: row.selection_text,
        articleId: row.article_id,
        reviewFeedback: row.review_feedback,
        supplementCount: row.supplement_count,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        readyAt: row.ready_at,
        rejectedAt: row.rejected_at,
        publishedAt: row.published_at,
        rawPrunedAt: row.raw_pruned_at,
    };
}

function requireIssue(database, issueReference) {
    const row = database.prepare(`SELECT * FROM career_reporter_relay_issues
      WHERE issue_reference = ?`).get(identifier(issueReference, "issue_reference"));
    if (!row)
        fail("reporter_relay_issue_not_found");
    return row;
}

function issueForJobRow(database, jobId) {
    return database.prepare(`SELECT * FROM career_reporter_relay_issues
      WHERE selector_job_id = ? OR writer_job_id = ? OR reviewer_job_id = ?`)
        .get(jobId, jobId, jobId);
}

export function reporterRelayIssueForJob(database, jobId) {
    installCareerSchema(database);
    const row = issueForJobRow(database, identifier(jobId, "job_id"));
    return row ? mapIssue(row) : null;
}

export function reporterRelayIssue(database, issueDate) {
    installCareerSchema(database);
    const row = database.prepare(`SELECT * FROM career_reporter_relay_issues
      WHERE issue_date = ?`).get(identifier(issueDate, "issue_date"));
    return row ? mapIssue(row) : null;
}

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

function materialSourceType(category) {
    if (category === "today_board")
        return "public_farm_ranking";
    return "public_event_fact";
}

function allowedNumbers(value) {
    const values = new Set();
    const visit = (entry) => {
        if (typeof entry === "number" && Number.isFinite(entry)) {
            values.add(entry);
            return;
        }
        if (typeof entry === "string") {
            for (const match of entry.matchAll(/(?<![\p{L}\p{N}.])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?![\p{L}\p{N}.])/gu))
                values.add(Number(match[0]));
            return;
        }
        if (Array.isArray(entry)) {
            for (const child of entry)
                visit(child);
            return;
        }
        if (entry && typeof entry === "object") {
            for (const child of Object.values(entry))
                visit(child);
        }
    };
    visit(value);
    return [...values].sort((left, right) => left - right);
}

function publicMaterials(database, issueReference) {
    return database.prepare(`SELECT category, occurred_at, title, content_json
      FROM career_reporter_relay_materials
      WHERE issue_reference = ? ORDER BY material_index`)
        .all(issueReference)
        .map((row) => {
            const content = parseJson(row.content_json);
            if (typeof content !== "string" || !content.trim())
                fail("reporter_relay_material_corrupt");
            return {
                category: row.category,
                occurred_at: new Date(row.occurred_at).toISOString(),
                title: row.title,
                content,
            };
        });
}

function reporterOptionHandle(database, residentId, internalOption, now) {
    const existing = database.prepare(`SELECT handle FROM lingye_option_handles
      WHERE resident_id = ? AND operation = ? AND internal_option = ?`)
        .get(residentId, NEWSROOM_OPERATION, internalOption);
    if (existing)
        return existing.handle;
    const handle = `opt_${createHash("sha256")
        .update(JSON.stringify([residentId, NEWSROOM_OPERATION, internalOption]), "utf8")
        .digest("base64url").slice(0, 12)}`;
    if (!OPTION_HANDLE_RE.test(handle))
        throw new Error("reporter_relay_option_handle_invalid");
    const collision = database.prepare(`SELECT resident_id, operation, internal_option
      FROM lingye_option_handles WHERE handle = ?`).get(handle);
    if (collision && (collision.resident_id !== residentId ||
        collision.operation !== NEWSROOM_OPERATION || collision.internal_option !== internalOption)) {
        throw new Error("reporter_relay_option_handle_collision");
    }
    database.prepare(`INSERT OR IGNORE INTO lingye_option_handles (
      handle, resident_id, operation, internal_option, issued_at
    ) VALUES (?, ?, ?, ?, ?)`)
        .run(handle, residentId, NEWSROOM_OPERATION, internalOption, now);
    return handle;
}

function wakeStageForStatus(status) {
    if (status === "selector_pending")
        return "selection";
    if (status === "writer_pending")
        return "writing";
    if (status === "review_pending")
        return "review";
    if (status === "supplement_pending")
        return "supplement";
    return null;
}

function wakeRecipient(issue, stage) {
    if (stage === "selection")
        return issue.selector_resident_id;
    if (stage === "review")
        return issue.reviewer_resident_id;
    return issue.writer_resident_id;
}

function wakeSequence(issue, stage) {
    if (stage === "review")
        return issue.supplement_count + 1;
    if (stage === "supplement")
        return issue.supplement_count;
    return 1;
}

function latestWakeSequence(database, issue, stage) {
    return database.prepare(`SELECT MAX(wake_sequence) AS sequence
      FROM career_reporter_relay_wakes
      WHERE issue_reference = ? AND stage = ?`)
        .get(issue.issue_reference, stage)?.sequence ?? 0;
}

function currentWakeSequence(database, issue, stage) {
    return Math.max(wakeSequence(issue, stage), latestWakeSequence(database, issue, stage));
}

function ensureWakeRow(database, issue, stage, now, sequence = wakeSequence(issue, stage)) {
    const wakeId = `reporter-wake:${issue.issue_date}:${stage}:${sequence}`;
    const recipient = wakeRecipient(issue, stage);
    database.prepare(`INSERT OR IGNORE INTO career_reporter_relay_wakes (
      wake_id, issue_reference, stage, wake_sequence, recipient_resident_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(wakeId, issue.issue_reference, stage, sequence, recipient, now);
    const row = database.prepare(`SELECT * FROM career_reporter_relay_wakes
      WHERE wake_id = ?`).get(wakeId);
    if (!row || row.issue_reference !== issue.issue_reference || row.stage !== stage ||
        row.wake_sequence !== sequence || row.recipient_resident_id !== recipient) {
        fail("reporter_relay_wake_conflict");
    }
    return row;
}

function stageInputs(database, issue, stage, sequence) {
    if (stage === "selection")
        return {};
    if (stage === "writing")
        return { selection_text: reporterSelectionWithMaterials(
            issue.selection_text, publicMaterials(database, issue.issue_reference),
        ) };
    const article = database.prepare(`SELECT article_text FROM career_reporter_articles
      WHERE job_id = ? AND version = ?`).get(issue.writer_job_id, sequence);
    if (stage === "review") {
        return {
            article_text: article?.article_text ?? null,
            ...(sequence > 1 ? { review_feedback: issue.review_feedback } : {}),
        };
    }
    return {
        article_text: article?.article_text ?? null,
        review_feedback: issue.review_feedback,
    };
}

function singleAction(database, issue, stage, sequence, now) {
    const jobId = stage === "selection" ? issue.selector_job_id : issue.writer_job_id;
    if (!jobId)
        fail("reporter_relay_job_not_ready");
    return {
        op: NEWSROOM_OPERATION,
        args: {
            option: reporterOptionHandle(database, wakeRecipient(issue, stage),
                `commission:submit:${jobId}:relay-${stage}-${sequence}`, now),
        },
    };
}

function reviewActions(database, issue, sequence, now) {
    if (!issue.reviewer_job_id)
        fail("reporter_relay_job_not_ready");
    const action = (decision) => ({
        op: NEWSROOM_OPERATION,
        args: {
            option: reporterOptionHandle(database, issue.reviewer_resident_id,
                `commission:resolve:${issue.reviewer_job_id}:${decision}`, now),
        },
    });
    const actions = {
        approve: action("approve"),
        reject: action("reject"),
    };
    if (sequence === 1)
        actions.supplement = action("needs_supplement");
    return actions;
}

export function reporterRelayWake(database, issueReference, now = Date.now(), requestedStage = null,
    requestedSequence = null) {
    installCareerSchema(database);
    const issue = requireIssue(database, issueReference);
    const stage = requestedStage ?? wakeStageForStatus(issue.status);
    // Daily article review is no longer a reporter task. Old delivered wakes
    // remain history, but must never be re-created or returned as actionable.
    if (!stage || stage === "review")
        return null;
    const sequence = requestedSequence ?? currentWakeSequence(database, issue, stage);
    const wakeId = `reporter-wake:${issue.issue_date}:${stage}:${sequence}`;
    const existing = database.prepare(`SELECT * FROM career_reporter_relay_wakes
      WHERE wake_id = ?`).get(wakeId);
    if (existing?.payload_json) {
        const payload = parseJson(existing.payload_json);
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
            fail("reporter_relay_wake_corrupt");
        return payload;
    }
    if (requestedSequence !== null && sequence !== wakeSequence(issue, stage) && !existing)
        fail("reporter_relay_wake_not_found");
    const wake = existing ?? ensureWakeRow(database, issue, stage, now, sequence);
    const payload = {
        wake_id: wake.wake_id,
        recipient_resident_id: wake.recipient_resident_id,
        stage,
        issue_date: issue.issue_date,
        ...(["selection", "review"].includes(stage)
            ? { materials: publicMaterials(database, issue.issue_reference) }
            : {}),
        ...stageInputs(database, issue, stage, sequence),
        ...(stage === "review"
            ? { actions: reviewActions(database, issue, sequence, now) }
            : { action: singleAction(database, issue, stage, sequence, now) }),
    };
    const payloadJson = canonical(payload);
    database.prepare(`UPDATE career_reporter_relay_wakes
      SET payload_json = ? WHERE wake_id = ? AND payload_json IS NULL`)
        .run(payloadJson, wake.wake_id);
    const stored = database.prepare(`SELECT payload_json FROM career_reporter_relay_wakes
      WHERE wake_id = ?`).get(wake.wake_id);
    if (!stored?.payload_json)
        fail("reporter_relay_wake_not_persisted");
    return parseJson(stored.payload_json);
}

function registerMaterials(database, backend, window, materials) {
    return materials.map((material, index) => {
        const contentJson = canonical(material.content);
        const sourceId = `reporter-relay-source:${digest(canonical({
            issueReference: window.issueReference,
            index,
            category: material.category,
            occurredAt: material.occurredAt,
            title: material.title,
            content: material.content,
        }))}`;
        backend.trustedSystemCommands.registerReporterSourceFact({
            sourceId,
            sourceType: materialSourceType(material.category),
            producerReference: `lingye-daily-material:${window.issueDate}:${material.category}`,
            occurredAt: material.occurredAt,
            recordedAt: window.periodEnd,
            publicSubject: material.title,
            fact: { category: material.category, content: material.content },
            allowedNumbers: allowedNumbers([material.title, material.content]),
            privacyScope: "public",
        });
        return {
            ...material,
            sourceId,
            contentJson,
        };
    });
}

export function pruneReporterRelayRawMaterials(database, now = Date.now()) {
    installCareerSchema(database);
    const cutoff = timestamp(now, "timestamp") - RAW_MATERIAL_RETENTION_MS;
    return runInTransaction(database, () => {
        const issues = database.prepare(`SELECT * FROM career_reporter_relay_issues
          WHERE raw_pruned_at IS NULL AND period_end <= ?
          ORDER BY period_end, issue_reference`).all(cutoff);
        for (const issue of issues) {
            if (!["published", "rejected", "expired"].includes(issue.status)) {
                database.prepare(`UPDATE career_reporter_relay_issues
                  SET status = 'expired', updated_at = ? WHERE issue_reference = ?`)
                    .run(now, issue.issue_reference);
                database.prepare(`UPDATE career_reporter_story_workflows
                  SET status = 'rejected', reviewed_at = COALESCE(reviewed_at, ?)
                  WHERE issue_reference = ? AND status <> 'published'`)
                    .run(now, issue.issue_reference);
                for (const jobId of [issue.selector_job_id, issue.writer_job_id, issue.reviewer_job_id].filter(Boolean)) {
                    database.prepare(`UPDATE career_jobs
                      SET status = 'expired', ended_at = COALESCE(ended_at, ?), updated_at = ?
                      WHERE job_id = ? AND status NOT IN ('completed', 'cancelled', 'transferred', 'expired')`)
                        .run(now, now, jobId);
                    database.prepare(`DELETE FROM career_job_object_locks WHERE job_id = ?`).run(jobId);
                }
            }
            const sourceIds = database.prepare(`SELECT source_id
              FROM career_reporter_relay_materials WHERE issue_reference = ?`)
                .all(issue.issue_reference).map((row) => row.source_id);
            const articleIds = database.prepare(`SELECT article_id FROM career_reporter_articles
              WHERE job_id = ?`).all(issue.writer_job_id ?? "").map((row) => row.article_id);
            for (const articleId of articleIds)
                database.prepare(`DELETE FROM career_reporter_article_citations WHERE article_id = ?`).run(articleId);
            database.prepare(`UPDATE career_reporter_material_packs
              SET source_ids_json = '[]', source_snapshot_json = '[]',
                  status = 'consumed', consumed_at = COALESCE(consumed_at, ?)
              WHERE pack_id = ?`).run(now, issue.pack_id);
            database.prepare(`DELETE FROM career_reporter_relay_wakes
              WHERE issue_reference = ?`).run(issue.issue_reference);
            database.prepare(`DELETE FROM career_reporter_relay_materials
              WHERE issue_reference = ?`).run(issue.issue_reference);
            for (const sourceId of sourceIds) {
                database.prepare(`DELETE FROM career_reporter_source_facts
                  WHERE source_id = ? AND NOT EXISTS (
                    SELECT 1 FROM career_reporter_article_citations WHERE source_id = ?
                  )`).run(sourceId, sourceId);
            }
            database.prepare(`UPDATE career_reporter_relay_issues
              SET raw_pruned_at = ?, updated_at = ? WHERE issue_reference = ?`)
                .run(now, now, issue.issue_reference);
        }
        return issues.length;
    });
}

export function startReporterRelayIssue(database, backend, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const window = normalizeIssueWindow(input);
    if (now < window.periodEnd || beijingDate(window.periodEnd) !== window.issueDate)
        fail("reporter_relay_start_too_early");
    return runInTransaction(database, () => {
        pruneReporterRelayRawMaterials(database, now);
        const existing = database.prepare(`SELECT * FROM career_reporter_relay_issues
          WHERE issue_reference = ?`).get(window.issueReference);
        if (existing) {
            if (existing.issue_date !== window.issueDate ||
                existing.period_start !== window.periodStart || existing.period_end !== window.periodEnd)
                fail("reporter_relay_issue_conflict");
            return {
                issueDate: window.issueDate,
                status: "already_started",
                wake: reporterRelayWake(database, window.issueReference, now, "selection"),
            };
        }
        const roster = ensureReporterDutyRoles(database, window.periodEnd, {
            drawInt: input?.drawInt ?? randomInt,
        });
        if (roster.length !== 3)
            fail("reporter_duty_roster_incomplete");
        const role = Object.fromEntries(roster.map((entry) => [entry.role, entry]));
        if (!role.selector || !role.writer || !role.reviewer)
            fail("reporter_duty_roster_incomplete");
        const materials = registerMaterials(database, backend, window, [
            ...todayBoardMaterials(database, window.periodEnd),
            ...togetherMaterials(database, window),
            ...readReporterDetentionMaterials(database, playerFarms(), window.periodEnd),
        ]);
        if (materials.length === 0)
            fail("reporter_relay_material_empty");
        const packId = `reporter-relay-pack:${window.issueDate}`;
        backend.trustedSystemCommands.createReporterMaterialPack({
            packId,
            issueReference: window.issueReference,
            requiredLevel: 1,
            difficultyLevel: 1,
            sourceIds: materials.map((material) => material.sourceId),
            trustedDailyRelay: true,
        });
        const selectorJobId = `reporter-relay-job:${window.issueDate}:selector`;
        backend.trustedSystemCommands.createJob({
            jobId: selectorJobId,
            career: "reporter",
            sourceType: "reporter_daily_selection",
            sourceId: materials[0].sourceId,
            objectType: "reporter_issue",
            objectId: window.issueReference,
            ownerResidentId: null,
            requiredLevel: 1,
            difficultyLevel: 1,
            assignmentMode: "accepted",
        });
        backend.trustedSystemCommands.acceptJob(selectorJobId, role.selector.residentId);
        database.prepare(`INSERT INTO career_reporter_relay_issues (
          issue_reference, issue_date, period_start, period_end, pack_id,
          selector_job_id, selector_resident_id, writer_resident_id, reviewer_resident_id,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'selector_pending', ?, ?)`)
            .run(window.issueReference, window.issueDate, window.periodStart, window.periodEnd,
                packId, selectorJobId, role.selector.residentId, role.writer.residentId,
                role.reviewer.residentId, now, now);
        const insertMaterial = database.prepare(`INSERT INTO career_reporter_relay_materials (
          issue_reference, material_index, source_id, category, occurred_at, title, content_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        materials.forEach((material, index) => insertMaterial.run(
            window.issueReference, index, material.sourceId, material.category,
            material.occurredAt, material.title, material.contentJson,
        ));
        return {
            issueDate: window.issueDate,
            status: "started",
            wake: reporterRelayWake(database, window.issueReference, now, "selection"),
        };
    });
}

function relayDutyAssignment(database, issueDate, role) {
    return database.prepare(`SELECT duty_role.role, duty_role.resident_id,
        duty.performance_rate_bps
      FROM career_reporter_duty_roles AS duty_role
      JOIN career_duty_days AS duty ON duty.duty_id = duty_role.duty_id
      JOIN career_employments AS employment
        ON employment.employment_id = duty.employment_id
      WHERE duty_role.duty_date = ? AND duty_role.role = ?
        AND duty.status = 'scheduled' AND employment.status = 'active'
        AND employment.availability = 'available'`)
        .get(issueDate, role) ?? null;
}

function relayDutyRoleForResident(database, issueDate, residentId) {
    return database.prepare(`SELECT duty_role.role, duty_role.resident_id,
        duty.performance_rate_bps
      FROM career_reporter_duty_roles AS duty_role
      JOIN career_duty_days AS duty ON duty.duty_id = duty_role.duty_id
      WHERE duty_role.duty_date = ? AND duty_role.resident_id = ?`)
        .get(issueDate, residentId) ?? null;
}

function handoffSuccessorWake(database, issue, expectedWake) {
    const successor = database.prepare(`SELECT * FROM career_reporter_relay_wakes
      WHERE issue_reference = ? AND stage = ? AND wake_sequence = ?`)
        .get(issue.issue_reference, expectedWake.stage, expectedWake.wake_sequence + 1);
    if (!successor)
        return null;
    if (!successor.payload_json)
        fail("reporter_relay_handoff_wake_missing");
    return parseJson(successor.payload_json);
}

function createReporterRelayHandoffJob(backend, originalJob, successorJobId, targetRole) {
    backend.trustedSystemCommands.createJob({
        jobId: successorJobId,
        career: "reporter",
        sourceType: `${originalJob.sourceType}:handoff:${targetRole}`,
        sourceId: originalJob.sourceId,
        objectType: originalJob.objectType,
        objectId: originalJob.objectId,
        ownerResidentId: originalJob.ownerResidentId,
        requiredLevel: originalJob.requiredLevel,
        difficultyLevel: originalJob.difficultyLevel,
        assignmentMode: "accepted",
    });
}

export function handoffReporterRelayDuty(database, backend, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const issueDate = identifier(input?.issueDate, "issue_date");
    const expectedStage = input?.expectedStage;
    if (!["selection", "writing"].includes(expectedStage))
        fail("reporter_relay_handoff_stage_invalid");
    const expectedWakeId = identifier(input?.expectedWakeId, "expected_wake_id");
    return runInTransaction(database, () => {
        const issue = database.prepare(`SELECT * FROM career_reporter_relay_issues
          WHERE issue_date = ?`).get(issueDate);
        if (!issue)
            fail("reporter_relay_issue_not_found");
        const expectedWake = database.prepare(`SELECT * FROM career_reporter_relay_wakes
          WHERE wake_id = ?`).get(expectedWakeId);
        if (!expectedWake || expectedWake.issue_reference !== issue.issue_reference ||
            expectedWake.stage !== expectedStage || !expectedWake.payload_json) {
            fail("reporter_relay_handoff_wake_conflict");
        }
        const replayWake = handoffSuccessorWake(database, issue, expectedWake);
        if (replayWake) {
            return { issueDate, status: "already_handed_off", wake: replayWake };
        }
        if (wakeStageForStatus(issue.status) !== expectedStage ||
            currentWakeSequence(database, issue, expectedStage) !== expectedWake.wake_sequence ||
            wakeRecipient(issue, expectedStage) !== expectedWake.recipient_resident_id) {
            fail("reporter_relay_handoff_stage_conflict");
        }
        const currentResidentId = wakeRecipient(issue, expectedStage);
        const currentDuty = relayDutyRoleForResident(database, issueDate, currentResidentId);
        const targetRole = expectedStage === "selection"
            ? currentDuty?.role === "selector"
                ? "writer"
                : currentDuty?.role === "writer"
                    ? "reviewer"
                    : null
            : currentDuty?.role === "writer"
                ? "reviewer"
                : null;
        const targetDuty = targetRole
            ? relayDutyAssignment(database, issueDate, targetRole)
            : null;
        if (!targetDuty || targetDuty.resident_id === currentResidentId)
            fail("reporter_relay_handoff_exhausted");
        const currentJobId = expectedStage === "selection"
            ? issue.selector_job_id
            : issue.writer_job_id;
        const originalJob = backend.trustedQueries.getJob(currentJobId);
        if (!originalJob || originalJob.career !== "reporter" ||
            !["accepted", "active"].includes(originalJob.status) ||
            originalJob.workerResidentId !== currentResidentId) {
            fail("reporter_relay_handoff_job_not_actionable");
        }
        const successorJobId = `reporter-relay-job:${issue.issue_date}:${expectedStage}:handoff:${targetRole}`;
        if (expectedStage === "writing") {
            const workflow = reporterWorkflowForJob(database, currentJobId);
            if (!workflow || workflow.writerJobId !== currentJobId ||
                workflow.writerResidentId !== currentResidentId ||
                workflow.status !== "selected" || workflow.articleId !== null) {
                fail("reporter_relay_handoff_workflow_not_actionable");
            }
            backend.forResident(currentResidentId).returnReporterMaterialPack({
                packId: issue.pack_id,
                jobId: currentJobId,
                idempotencyKey: `reporter-relay:${issue.issue_date}:writer:handoff:return`,
            });
            backend.trustedSystemCommands.cancelJob(currentJobId);
            createReporterRelayHandoffJob(backend, originalJob, successorJobId, targetRole);
            backend.trustedSystemCommands.acceptJob(successorJobId, targetDuty.resident_id);
            backend.forResident(targetDuty.resident_id).claimReporterMaterialPack({
                packId: issue.pack_id,
                jobId: successorJobId,
                idempotencyKey: `reporter-relay:${issue.issue_date}:writer:handoff:${targetRole}:claim`,
            });
            reassignReporterStoryWorkflowWriter(database, {
                workflowId: workflow.workflowId,
                previousJobId: currentJobId,
                previousResidentId: currentResidentId,
                writerJobId: successorJobId,
                writerResidentId: targetDuty.resident_id,
                now,
            });
            const updated = database.prepare(`UPDATE career_reporter_relay_issues
              SET writer_job_id = ?, writer_resident_id = ?, updated_at = ?
              WHERE issue_reference = ? AND status = 'writer_pending'
                AND writer_job_id = ? AND writer_resident_id = ?`)
                .run(successorJobId, targetDuty.resident_id, now, issue.issue_reference,
                    currentJobId, currentResidentId);
            if (updated.changes !== 1)
                fail("reporter_relay_handoff_conflict");
        }
        else {
            backend.trustedSystemCommands.cancelJob(currentJobId);
            createReporterRelayHandoffJob(backend, originalJob, successorJobId, targetRole);
            backend.trustedSystemCommands.acceptJob(successorJobId, targetDuty.resident_id);
            const transfersFutureWriting = currentDuty.role === "writer" && targetRole === "reviewer";
            if (transfersFutureWriting && issue.writer_job_id !== null)
                fail("reporter_relay_handoff_conflict");
            const updated = transfersFutureWriting
                ? database.prepare(`UPDATE career_reporter_relay_issues
                    SET selector_job_id = ?, selector_resident_id = ?,
                        writer_resident_id = ?, updated_at = ?
                    WHERE issue_reference = ? AND status = 'selector_pending'
                      AND selector_job_id = ? AND selector_resident_id = ?
                      AND writer_job_id IS NULL AND writer_resident_id = ?`)
                    .run(successorJobId, targetDuty.resident_id, targetDuty.resident_id,
                        now, issue.issue_reference, currentJobId, currentResidentId,
                        currentResidentId)
                : database.prepare(`UPDATE career_reporter_relay_issues
                    SET selector_job_id = ?, selector_resident_id = ?, updated_at = ?
                    WHERE issue_reference = ? AND status = 'selector_pending'
                      AND selector_job_id = ? AND selector_resident_id = ?`)
                    .run(successorJobId, targetDuty.resident_id, now,
                        issue.issue_reference, currentJobId, currentResidentId);
            if (updated.changes !== 1)
                fail("reporter_relay_handoff_conflict");
        }
        const reassigned = requireIssue(database, issue.issue_reference);
        const sequence = expectedWake.wake_sequence + 1;
        ensureWakeRow(database, reassigned, expectedStage, now, sequence);
        return {
            issueDate,
            status: "handed_off",
            wake: reporterRelayWake(database, issue.issue_reference, now, expectedStage, sequence),
        };
    });
}

export function beginReporterRelayWriting(database, backend, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const selectionText = identifier(input?.selectionText, "selection_text");
    const issue = requireIssue(database, input?.issueReference);
    if (issue.status !== "selector_pending" ||
        issue.selector_resident_id !== input?.residentId ||
        issue.selector_job_id !== input?.jobId)
        fail("reporter_relay_selection_not_actionable");
    const writerJobId = `reporter-relay-job:${issue.issue_date}:writer`;
    const reviewerJobId = `reporter-relay-job:${issue.issue_date}:reviewer`;
    const primarySourceId = backend.trustedQueries.getJob(issue.selector_job_id).sourceId;
    backend.trustedSystemCommands.createJob({
        jobId: writerJobId,
        career: "reporter",
        sourceType: "reporter_daily_writing",
        sourceId: primarySourceId,
        objectType: "reporter_article",
        objectId: `${issue.issue_reference}:article`,
        ownerResidentId: null,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    backend.trustedSystemCommands.acceptJob(writerJobId, issue.writer_resident_id);
    backend.forResident(issue.writer_resident_id).claimReporterMaterialPack({
        packId: issue.pack_id,
        jobId: writerJobId,
        idempotencyKey: `reporter-relay:${issue.issue_date}:writer:claim`,
    });
    backend.trustedSystemCommands.createJob({
        jobId: reviewerJobId,
        career: "reporter",
        sourceType: "reporter_daily_submission_reviewing",
        sourceId: `${issue.issue_reference}:submission-reviewing`,
        objectType: "reporter_submission_batch",
        objectId: issue.issue_reference,
        ownerResidentId: null,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    backend.trustedSystemCommands.acceptJob(reviewerJobId, issue.reviewer_resident_id);
    createReporterStoryWorkflow(database, {
        workflowId: `reporter-relay-workflow:${issue.issue_date}`,
        issueReference: issue.issue_reference,
        selectorJobId: issue.selector_job_id,
        writerJobId,
        reviewerJobId,
        selectorResidentId: issue.selector_resident_id,
        writerResidentId: issue.writer_resident_id,
        reviewerResidentId: issue.reviewer_resident_id,
        allowSelectorWriterCombination:
            issue.selector_resident_id === issue.writer_resident_id,
        now,
    });
    database.prepare(`UPDATE career_reporter_relay_issues
      SET writer_job_id = ?, reviewer_job_id = ?, selection_text = ?,
          status = 'writer_pending', updated_at = ?
      WHERE issue_reference = ?`)
        .run(writerJobId, reviewerJobId, selectionText, now, issue.issue_reference);
    return reporterRelayWake(database, issue.issue_reference, now);
}

export function markReporterRelayArticle(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const issue = requireIssue(database, input?.issueReference);
    const expected = issue.status === "writer_pending" ? "writer_pending" : "supplement_pending";
    if (issue.status !== expected || issue.writer_resident_id !== input?.residentId ||
        issue.writer_job_id !== input?.jobId)
        fail("reporter_relay_writing_not_actionable");
    const articleId = identifier(input?.articleId, "article_id");
    return runInTransaction(database, () => {
        stageReporterRelayArticle(database, issue, articleId, now);
        return null;
    });
}

function stageReporterRelayArticle(database, issue, articleId, now) {
    const article = database.prepare(`SELECT job_id, resident_id, status, review_decision
      FROM career_reporter_articles WHERE article_id = ?`).get(articleId);
    if (!article || article.job_id !== issue.writer_job_id ||
        article.resident_id !== issue.writer_resident_id ||
        !["pending_review", "approved"].includes(article.status))
        fail("reporter_relay_article_missing");
    // "approved" is the existing publication-eligible storage state. No review
    // command is executed and no reviewer, decision or reviewed_at is invented.
    database.prepare(`UPDATE career_reporter_articles SET status = 'approved'
      WHERE article_id = ? AND status = 'pending_review'`).run(articleId);
    database.prepare(`UPDATE career_reporter_relay_issues
      SET article_id = ?, status = 'ready', ready_at = COALESCE(ready_at, ?), updated_at = ?
      WHERE issue_reference = ?`).run(articleId, now, now, issue.issue_reference);
}

export function markReporterRelayReview(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const issue = requireIssue(database, input?.issueReference);
    if (issue.status !== "review_pending" || issue.reviewer_resident_id !== input?.residentId ||
        issue.reviewer_job_id !== input?.jobId)
        fail("reporter_relay_review_not_actionable");
    const decision = input?.decision;
    if (!['approve', 'needs_supplement', 'reject'].includes(decision))
        fail("reporter_invalid_review_decision");
    if (decision === "needs_supplement" && issue.supplement_count >= 1)
        fail("reporter_relay_supplement_limit_reached");
    const feedback = decision === "approve"
        ? null
        : identifier(input?.feedback, "review_feedback");
    if (decision === "approve") {
        database.prepare(`UPDATE career_reporter_relay_issues
          SET status = 'ready', review_feedback = NULL, ready_at = ?, updated_at = ?
          WHERE issue_reference = ?`).run(now, now, issue.issue_reference);
        return null;
    }
    if (decision === "reject") {
        database.prepare(`UPDATE career_reporter_relay_issues
          SET status = 'rejected', review_feedback = ?, rejected_at = ?, updated_at = ?
          WHERE issue_reference = ?`).run(feedback, now, now, issue.issue_reference);
        database.prepare(`UPDATE career_reporter_material_packs
          SET status = 'consumed', consumed_at = COALESCE(consumed_at, ?)
          WHERE pack_id = ?`).run(now, issue.pack_id);
        return null;
    }
    database.prepare(`UPDATE career_reporter_relay_issues
      SET status = 'supplement_pending', review_feedback = ?, supplement_count = 1,
          updated_at = ? WHERE issue_reference = ?`)
        .run(feedback, now, issue.issue_reference);
    return reporterRelayWake(database, issue.issue_reference, now);
}

function reporterName(residentId) {
    const farm = playerFarms().find((candidate) =>
        candidate?.doorbellMcpMigration?.residentId === residentId);
    return String(farm?.aiName || farm?.name || "社区记者");
}

export function publishReadyReporterRelay(database, backend, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const issueDate = identifier(input?.issueDate, "issue_date");
    return runInTransaction(database, () => {
        let issue = database.prepare(`SELECT * FROM career_reporter_relay_issues
          WHERE issue_date = ?`).get(issueDate);
        // Finish the already-written, unpublished daily articles left at the
        // removed review gate. Keep their text and all historical wake records.
        if (issue?.status === "review_pending" && issue.article_id) {
            stageReporterRelayArticle(database, issue, issue.article_id, now);
            issue = requireIssue(database, issue.issue_reference);
        }
        if (!issue || !["ready", "published"].includes(issue.status))
            return { issueDate, status: "pending", publication: null };
        const scheduledPublicationAt = beijingTimestamp(issueDate, 9);
        if (now < scheduledPublicationAt)
            return { issueDate, status: "pending", publication: null };
        const article = database.prepare(`SELECT article_text, version
          FROM career_reporter_articles WHERE article_id = ?`).get(issue.article_id);
        if (!article)
            fail("reporter_relay_article_missing");
        return {
            issueDate,
            status: "ready",
            publication: {
                publication_id: `reporter-publication:${issue.article_id}`,
                scheduled_publication_at: new Date(scheduledPublicationAt).toISOString(),
                selector: reporterName(issue.selector_resident_id),
                writer: reporterName(issue.writer_resident_id),
                reviewer: reporterName(issue.reviewer_resident_id),
                article_text: article.article_text,
                version: article.version,
            },
        };
    });
}

export function acknowledgePublishedReporterRelay(database, backend, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now(), "timestamp");
    const issueDate = identifier(input?.issueDate, "issue_date");
    const publicationId = identifier(input?.publicationId, "publication_id");
    const publishedAt = timestamp(input?.publishedAt, "published_at");
    if (publishedAt < beijingTimestamp(issueDate, 9))
        fail("reporter_relay_publication_too_early");
    return runInTransaction(database, () => {
        const issue = database.prepare(`SELECT * FROM career_reporter_relay_issues
          WHERE issue_date = ?`).get(issueDate);
        if (!issue || !["ready", "published"].includes(issue.status))
            fail("reporter_relay_publication_not_ready");
        const expectedPublicationId = `reporter-publication:${issue.article_id}`;
        if (publicationId !== expectedPublicationId)
            fail("reporter_relay_publication_id_conflict");
        if (issue.status === "published") {
            if (issue.published_at !== publishedAt)
                fail("reporter_relay_publication_ack_conflict");
            return {
                issueDate,
                status: "already_published",
                publicationId,
                publishedAt,
            };
        }
        const publication = backend.trustedSystemCommands.publishReporterArticle({
            articleId: issue.article_id,
            publicationId,
            publishedAt,
        });
        if (publication.publicationId !== publicationId || publication.publishedAt !== publishedAt)
            fail("reporter_relay_publication_ack_conflict");
        const workflow = reporterWorkflowForJob(database, issue.writer_job_id);
        markReporterWorkflowPublished(database, {
            workflowId: workflow.workflowId,
            publicationId,
            now: publishedAt,
        });
        backend.trustedSystemCommands.completeJob({
            jobId: issue.writer_job_id,
            workerResidentId: issue.writer_resident_id,
            validationPassed: true,
            worldResultReference: `reporter-publication:${publicationId}`,
        });
        // Main records any actual anonymous review before publication ACK.
        // An unused empty-batch job is cancelled, never credited as work.
        cancelUnperformedReporterSubmissionWork(database, backend, issue.reviewer_job_id);
        database.prepare(`UPDATE career_reporter_relay_issues
          SET status = 'published', published_at = ?, updated_at = ?
          WHERE issue_reference = ?`).run(publishedAt, now, issue.issue_reference);
        return {
            issueDate,
            status: "published",
            publicationId,
            publishedAt,
        };
    });
}
