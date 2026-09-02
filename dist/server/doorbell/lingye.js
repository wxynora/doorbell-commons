import { createHash } from "node:crypto";
import {
    CareerDomainError,
    CAREER_IDS,
    CAREER_INSTITUTION,
    CAREER_TITLES,
    AGRONOMY_COMMISSION_REWARD_GOLD,
    COURSE_TUITION_GOLD,
    EXAM_FEE_GOLD,
    EXAM_PASS_COUNT,
    EXAM_QUESTION_COUNT,
    QUALIFICATION_LEVELS,
} from "../../career/contracts.js";
import { careerExamAvailability, curriculumCatalogAvailability } from "../../career/curriculum.js";
import { courseCatalog } from "../../career/course-catalog.js";
import { careerAdvancementWorkEligibility } from "../../career/school-service.js";
import {
    createReporterStoryWorkflow,
    ensureReporterDutyRoles,
    markReporterWorkflowPublished,
    markReporterWorkflowReviewed,
    markReporterWorkflowSubmitted,
    reporterDutyRole,
    reporterWorkflowForJob,
} from "../../career/reporter-newsroom-service.js";
import {
    beginReporterRelayWriting,
    markReporterRelayArticle,
    markReporterRelayReview,
    reporterRelayIssue,
    reporterRelayIssueForJob,
    reporterRelayWake,
} from "../../career/reporter-relay-service.js";
import {
    applyWorldCheck,
    applyWorldTreatment,
    boundFarmSources,
    commissionSourceFacts,
    completeNpcFallbackService,
    playerServiceCommissionPrice,
    npcServiceGold,
    constableExamTheftEligibility,
    publishBoundSource,
    publicCommissionSource,
    requireStandaloneP3Checkpoint,
    recoverBoundNpcSource,
    recoverPendingNpcFallbackServices,
    reporterMaterialPackForJob,
    startSelfAgronomyWork,
    syncAuthorityJobs,
    treatmentGold,
    veterinarianTreatmentMaterialGold,
    workerOptions,
} from "../../career/p3-commission-runtime.js";
import { EconomyError } from "../../economy/economy-errors.js";
import { SecurityDomainError } from "../../security/index.js";
import { CareerJobService } from "../../career/job-service.js";
import { CHEF_ORIGINAL_RECIPE_SILVER_PRICE } from "../../career/chef-commerce-service.js";
import { CHEF_STORE_LISTINGS_FIELD } from "../../career/chef-store-farm-adapter.js";
import {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    runLingyeWorldTransaction,
} from "../../lingye-world-database.js";
import {
    BEIJING_EXAM_WEEKDAYS,
    EXAM_SESSION_DURATION_MS,
    EXAM_SESSION_START_HOUR,
    beijingDate,
    isBeijingExamSessionOpen,
} from "../../career/persistence.js";
import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { natureRuntimeReadiness } from "../../nature-runtime.js";
import { allFarms, getFarm } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    UUID_RE,
    DOORBELL_SERVICE_TOKEN,
    internalServiceError,
    isPlainObject,
    legacyAgentAccessRevoked,
    requireDoorbellService,
    serviceTokenMatches,
    validateFarmBinding,
} from "./contract.js";

const LINGYE_OPERATIONS = new Set([
    "go.bank.view",
    "go.bank.choose",
    "go.school.view",
    "go.school.choose",
    "go.farm.commission",
    "go.hospital.commission",
    "go.newsroom.commission",
    "go.security.commission",
]);
const LINGYE_READINESS_SCHEMA_VERSION = 1;
const REQUIRED_EXAM_LEVELS = new Set([
    ...CAREER_IDS.flatMap((career) => QUALIFICATION_LEVELS.map((level) => `${career}:${level}`)),
]);
const LINGYE_CAPABILITIES = Object.freeze({
    player_loans: true,
    multi_select_assessments: true,
    kitchen_methods: true,
    kitchen_tools: true,
    chef_original_recipes: true,
    chef_store: true,
    commission_messages: true,
    commission_npc_transfer: true,
    commission_notifications: true,
});

const COMMISSION_CAREERS = Object.freeze({
    "go.farm.commission": "agronomist",
    "go.hospital.commission": "veterinarian",
    "go.newsroom.commission": "reporter",
    "go.security.commission": "constable",
});

const BANK_SECTIONS = new Set(["account", "deposits", "exchange", "loans", "credit"]);
const SCHOOL_SECTIONS = new Set(["careers", "courses", "exams", "certificates", "employment", "interviews", "publicNotices"]);
const TERM_DAYS = new Set([14, 30, 60]);
const INSUFFICIENT_FUNDS_MESSAGE = "可用余额不足，本次操作没有执行。";
const EXAM_PASSED_WORK_NOTICE = "考试通过啦！明天正式上班，今天先休息。";
const WORK_NOT_STARTED_MESSAGE = "还没到上班时间，明天再来吧。";
const LINGYE_ERROR_MESSAGES = Object.freeze({
    INSUFFICIENT_FUNDS: INSUFFICIENT_FUNDS_MESSAGE,
    OPTION_NOT_AVAILABLE: "当前选项已失效或不适用于这项业务；请重新查看当前事实与 option。",
    REFERENCE_NOT_FOUND: "没有找到这条记录，或当前居民无权读取。",
    QUALIFICATION_REQUIRED: "当前职业资格不足，本次操作没有执行。",
    QUALIFICATION_NOT_EFFECTIVE: WORK_NOT_STARTED_MESSAGE,
    CONFLICT: "当前状态已经变化，本次操作没有执行；请重新查看。",
    LINGYE_NOT_READY: "铃野相关能力尚未就绪，本次操作没有执行。",
    OP_REJECTED: "本次操作被铃野规则拒绝，没有产生业务结果。",
});
const DEFAULT_ECONOMY_RULES = Object.freeze({
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
});

class LingyeActionInputError extends Error {
    constructor(message) {
        super(message);
        this.name = "LingyeActionInputError";
    }
}

class LingyeBusinessError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "LingyeBusinessError";
        this.code = code;
    }
}

const success = (text, data, notifications = []) => ({
    ok: true,
    text,
    data,
    ...(notifications.length === 0 ? {} : { notifications }),
});

function commissionNotifications(kind, job, notificationKey, career, actorResidentId, messageText) {
    try {
        const recipients = kind === "commission_reply"
            ? [job.recipientResidentId]
            : kind === "commission_targeted"
                ? [job.targetResidentId]
                : kind === "commission_accepted" || kind === "commission_declined"
                    ? [job.ownerResidentId]
                    : [job.ownerResidentId, job.workerResidentId];
        return [...new Set(recipients
            .filter(Boolean)
            .filter((recipientResidentId) => recipientResidentId !== actorResidentId))]
            .map((recipientResidentId) => ({
                notification_id: `${notificationKey}:${recipientResidentId}`,
                kind,
                recipient_resident_id: recipientResidentId,
                career,
                ...(kind === "commission_reply" ? { message_text: messageText } : {}),
            }));
    }
    catch {
        return [];
    }
}
const failure = (code, _message) => ({
    ok: false,
    error: {
        code,
        message: LINGYE_ERROR_MESSAGES[code] ?? LINGYE_ERROR_MESSAGES.OP_REJECTED,
    },
});

function assertExactKeys(value, branches) {
    if (!isPlainObject(value))
        throw new LingyeActionInputError("args must be an object");
    const actual = Object.keys(value).sort();
    const matches = branches.some((branch) => {
        const expected = [...branch].sort();
        return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
    });
    if (!matches)
        throw new LingyeActionInputError("args do not match this operation");
}

function assertNonEmptyString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new LingyeActionInputError(`${field} must be a non-empty string`);
}

function assertPositiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new LingyeActionInputError(`${field} must be a positive integer`);
}

function validateArgs(op, args) {
    if (op === "go.bank.view") {
        assertExactKeys(args, [[], ["section"], ["reference"]]);
        if (Object.hasOwn(args, "section") && !BANK_SECTIONS.has(args.section))
            throw new LingyeActionInputError("section is invalid");
        if (Object.hasOwn(args, "reference"))
            assertNonEmptyString(args.reference, "reference");
        return;
    }
    if (op === "go.bank.choose") {
        assertExactKeys(args, [
            ["option"],
            ["amount", "option"],
            ["amount", "option", "termDays"],
            ["amount", "option", "termDays", "totalRatePpm"],
            ["amount", "option", "termDays", "to", "totalRatePpm"],
        ]);
        assertNonEmptyString(args.option, "option");
        if (Object.hasOwn(args, "amount"))
            assertPositiveInteger(args.amount, "amount");
        if (Object.hasOwn(args, "termDays") && !TERM_DAYS.has(args.termDays))
            throw new LingyeActionInputError("termDays is invalid");
        if (Object.hasOwn(args, "totalRatePpm"))
            assertPositiveInteger(args.totalRatePpm, "totalRatePpm");
        if (Object.hasOwn(args, "to"))
            assertNonEmptyString(args.to, "to");
        return;
    }
    if (op === "go.school.view") {
        assertExactKeys(args, [[], ["section"], ["reference"]]);
        if (Object.hasOwn(args, "section") && !SCHOOL_SECTIONS.has(args.section))
            throw new LingyeActionInputError("section is invalid");
        if (Object.hasOwn(args, "reference"))
            assertNonEmptyString(args.reference, "reference");
        return;
    }
    if (op === "go.school.choose") {
        assertExactKeys(args, [["option"], ["answers", "option"]]);
        assertNonEmptyString(args.option, "option");
        if (Object.hasOwn(args, "answers")) {
            if (!Array.isArray(args.answers) || ![5, 20].includes(args.answers.length) ||
                args.answers.some((selection) => {
                    if (typeof selection === "string")
                        return selection.trim().length === 0;
                    return !Array.isArray(selection) || selection.length < 1 ||
                        selection.some((answer) => typeof answer !== "string" || !["A", "B", "C", "D"].includes(answer.trim().toUpperCase())) ||
                        new Set(selection.map((answer) => answer.trim().toUpperCase())).size !== selection.length;
                })) {
                throw new LingyeActionInputError("answers must contain five or twenty choice sets or fill-in texts");
            }
        }
        return;
    }
    assertExactKeys(args, [
        [],
        ["reference"],
        ["option"],
        ["amount", "option"],
        ["option", "text"],
        ["amount", "option", "text"],
    ]);
    if (Object.hasOwn(args, "reference"))
        assertNonEmptyString(args.reference, "reference");
    if (Object.hasOwn(args, "option"))
        assertNonEmptyString(args.option, "option");
    if (Object.hasOwn(args, "amount"))
        assertPositiveInteger(args.amount, "amount");
    if (Object.hasOwn(args, "text"))
        assertNonEmptyString(args.text, "text");
}

function mapRows(rows) {
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
        value,
    ])));
}

function isoTime(value) {
    return value === null || value === undefined ? null : new Date(value).toISOString();
}

function option(option, requires = []) {
    return requires.length === 0 ? { option } : { option, requires };
}

const PUBLIC_OPTION_HANDLE_RE = /^opt_[A-Za-z0-9_-]{12}$/u;
const CAREER_LABELS = Object.freeze({
    chef: "料理师",
    agronomist: "农艺师",
    veterinarian: "动物医生",
    reporter: "记者",
    constable: "治安官",
});
const REPORTER_DUTY_TASK_LABELS = Object.freeze({
    selector: "选题",
    writer: "撰稿",
    reviewer: "审稿",
});
const BANK_OPTION_LABELS = Object.freeze({
    "demand-deposit": "存入金币活期",
    "demand-withdraw": "取出金币活期",
    "exchange-gold-silver": "用金币兑换银币",
    "term-open": "开立金币定期存款",
    "term-close": "结清金币定期存款",
    "system-loan-open": "申请系统金币贷款",
    "system-loan-repay": "偿还系统金币贷款",
    "silver-lock-increase": "增加小机银币锁定额",
    "player-loan-offer": "向其他居民提供银币借款",
    "player-loan-request": "向其他居民申请银币借款",
    "player-loan-confirm": "确认玩家借款合同",
    "player-loan-cancel": "取消玩家借款提案",
    "player-loan-repay": "偿还玩家银币借款",
});
const SCHOOL_OPTION_LABELS = Object.freeze({
    "career-select": "选择职业",
    "course-enroll": "报名课程",
    "course-read": "确认已阅读课程",
    "course-practice": "提交课程练习",
    "exam-register": "报名资格考试",
    "exam-start": "开始资格考试",
    "exam-release": "取消尚未开始的考试报名",
    "exam-submit": "提交整份资格考试答案",
    "employment-hire": "申请正式受聘",
    "employment-leave": "请假",
    "employment-resume": "恢复在岗",
    "employment-end": "结束任职",
    "constable-public-notice-vote": "提交治安官公示意见",
});
const COMMISSION_OPTION_LABELS = Object.freeze([
    ["chef-recipe-buy", "购买原创菜谱"],
    ["chef-store-open", "开设料理店"],
    ["chef-store-rent", "支付料理店租金"],
    ["chef-store-buy", "购买料理店商品"],
    ["npc-transfer", "把委托转交给机构 NPC"],
    ["publish", "发布真实委托"],
    ["republish", "重新发布委托"],
    ["accept", "接取委托"],
    ["cancel", "取消委托"],
    ["reply", "回复委托消息"],
    ["check", "执行检查"],
    ["select", "选入本期报道"],
    ["treat", "执行处理／治疗"],
    ["transfer", "转交委托"],
    ["submit", "提交工作结果"],
    ["section-create", "开设新的日报板块"],
    ["submit-section", "向指定日报板块提交稿件"],
    ["like", "为已出版稿件点赞"],
    ["resolve", "提交治安处理结果"],
    ["npc", "委托机构 NPC 处理"],
]);

function optionOperation(op) {
    if (op.startsWith("go.bank."))
        return "go.bank.choose";
    if (op.startsWith("go.school."))
        return "go.school.choose";
    return op;
}

function internalOptionLabel(internalOption) {
    const bank = /^bank:([a-z-]+):/u.exec(internalOption)?.[1];
    if (bank)
        return BANK_OPTION_LABELS[bank] ?? "办理银行业务";
    const school = /^school:([a-z-]+):/u.exec(internalOption)?.[1];
    if (school) {
        const career = /:(chef|agronomist|veterinarian|reporter|constable)(?::|$)/u.exec(internalOption)?.[1];
        return `${SCHOOL_OPTION_LABELS[school] ?? "办理职业学校业务"}${career ? `：${CAREER_LABELS[career]}` : ""}`;
    }
    if (internalOption.startsWith("commission:")) {
        const sectionSubmit = /^commission:submit-section:[^:]+:[^:]+:(.+)$/u.exec(internalOption);
        if (sectionSubmit)
            return `向日报板块「${decodeURIComponent(sectionSubmit[1])}」提交稿件`;
        if (/^commission:resolve:[^:]+:approve$/u.test(internalOption))
            return "审稿通过并出版";
        if (/^commission:resolve:[^:]+:needs_supplement$/u.test(internalOption))
            return "退回撰稿记者补充";
        if (/^commission:resolve:[^:]+:reject$/u.test(internalOption))
            return "退稿";
        const action = internalOption.slice("commission:".length);
        return COMMISSION_OPTION_LABELS.find(([prefix]) => action === prefix || action.startsWith(`${prefix}:`))?.[1]
            ?? "推进委托";
    }
    return "办理当前业务";
}

function optionHandle(database, residentId, operation, internalOption, now) {
    const existing = database.prepare(`
      SELECT handle FROM lingye_option_handles
      WHERE resident_id = ? AND operation = ? AND internal_option = ?
    `).get(residentId, operation, internalOption);
    if (existing)
        return existing.handle;
    const digest = createHash("sha256")
        .update(JSON.stringify([residentId, operation, internalOption]), "utf8")
        .digest("base64url")
        .slice(0, 12);
    const handle = `opt_${digest}`;
    const collision = database.prepare(`
      SELECT resident_id, operation, internal_option FROM lingye_option_handles WHERE handle = ?
    `).get(handle);
    if (collision && (collision.resident_id !== residentId || collision.operation !== operation ||
        collision.internal_option !== internalOption)) {
        throw new Error("Lingye option handle collision");
    }
    database.prepare(`
      INSERT OR IGNORE INTO lingye_option_handles (
        handle, resident_id, operation, internal_option, issued_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(handle, residentId, operation, internalOption, now);
    return handle;
}

function exposeOptionHandles(database, residentId, op, value, now) {
    const operation = optionOperation(op);
    const expose = (candidate) => {
        if (Array.isArray(candidate))
            return candidate.map(expose);
        if (!isPlainObject(candidate))
            return candidate;
        if (typeof candidate.option === "string") {
            if (PUBLIC_OPTION_HANDLE_RE.test(candidate.option))
                return Object.fromEntries(Object.entries(candidate).map(([key, entry]) => [key, expose(entry)]));
            return {
                option: optionHandle(database, residentId, operation, candidate.option, now),
                label: internalOptionLabel(candidate.option),
                requires: Array.isArray(candidate.requires) ? [...candidate.requires] : [],
            };
        }
        return Object.fromEntries(Object.entries(candidate).map(([key, entry]) => {
            if (["optionReference", "option_reference"].includes(key) && typeof entry === "string" &&
                /^(bank|school|commission):/u.test(entry)) {
                return [key, optionHandle(database, residentId, operation, entry, now)];
            }
            return [key, expose(entry)];
        }));
    };
    return expose(value);
}

function selectedCourseCatalog(backend, careers) {
    return courseCatalog(careers).map((course) => ({
        ...course,
        tuitionGold: COURSE_TUITION_GOLD[course.qualificationLevel],
        contentAvailable: backend.trustedQueries.courseAvailable(
            course.career,
            course.qualificationLevel,
            course.courseIndex,
        ),
    }));
}

function resolveOptionHandle(database, residentId, op, args) {
    if (!Object.hasOwn(args, "option"))
        return args;
    if (typeof args.option !== "string" || !PUBLIC_OPTION_HANDLE_RE.test(args.option))
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "当前 option 无效，请重新查看可办理事项。");
    const row = database.prepare(`
      SELECT internal_option FROM lingye_option_handles
      WHERE handle = ? AND resident_id = ? AND operation = ?
    `).get(args.option, residentId, optionOperation(op));
    if (!row)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "当前 option 无效，请重新查看可办理事项。");
    return { ...args, option: row.internal_option };
}

function publicLingyeResult(database, residentId, op, result, now) {
    if (!result.ok)
        return result;
    return { ...result, data: exposeOptionHandles(database, residentId, op, result.data, now) };
}

function bankRevision(database, residentId) {
    const row = database.prepare(`
      SELECT COALESCE(MAX(journal_rowid), 0) AS revision
      FROM (
        SELECT journal.rowid AS journal_rowid
        FROM economy_journals AS journal
        JOIN economy_ledger_entries AS entry ON entry.journal_id = journal.journal_id
        WHERE entry.resident_id = ?
        UNION ALL
        SELECT journal.rowid AS journal_rowid
        FROM economy_journals AS journal
        JOIN economy_silver_lock_events AS event ON event.journal_id = journal.journal_id
        WHERE event.resident_id = ?
      )
    `).get(residentId, residentId);
    return row.revision;
}

function bankOption(database, residentId, action, reference = null) {
    const revision = bankRevision(database, residentId);
    const suffix = reference === null ? "" : `:${reference}`;
    return `bank:${action}:${revision}${suffix}`;
}

function parseBankOption(value) {
    const match = /^bank:([a-z-]+):(\d+)(?::(.+))?$/u.exec(value);
    if (!match)
        return null;
    return { action: match[1], revision: Number(match[2]), reference: match[3] ?? null };
}

function publicFarmForResident(database, residentId) {
    const binding = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?").get(residentId);
    if (!binding?.binding_reference)
        return null;
    const matches = allFarms().filter((farm) => farm?.doorbellMcpMigration?.migrationId === binding.binding_reference);
    if (matches.length !== 1)
        return null;
    return { doorplate: matches[0].id, name: matches[0].name };
}

function residentForPublicFarm(database, value) {
    const doorplate = String(value ?? "").trim().toUpperCase();
    const farm = getFarm(doorplate);
    const bindingReference = farm?.doorbellMcpMigration?.migrationId;
    if (!farm || !bindingReference)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到已迁入铃野的目标居民。");
    const rows = database.prepare("SELECT resident_id FROM residents WHERE binding_reference = ?").all(bindingReference);
    if (rows.length !== 1)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到已迁入铃野的目标居民。");
    return rows[0].resident_id;
}

function publicPlayerLoan(database, loan, residentId) {
    const lenderResidentId = loan.lenderResidentId ?? loan.lender_resident_id;
    const borrowerResidentId = loan.borrowerResidentId ?? loan.borrower_resident_id;
    const isLender = lenderResidentId === residentId;
    const counterpartyResidentId = isLender ? borrowerResidentId : lenderResidentId;
    const {
        lenderResidentId: _lenderResidentId,
        borrowerResidentId: _borrowerResidentId,
        lender_resident_id: _lenderResidentIdSnake,
        borrower_resident_id: _borrowerResidentIdSnake,
        ...facts
    } = loan;
    return {
        ...mapRows([facts])[0],
        role: isLender ? "lender" : "borrower",
        counterparty: publicFarmForResident(database, counterpartyResidentId),
    };
}

function idempotencyKey(residentId, op, args) {
    const digest = createHash("sha256").update(JSON.stringify([residentId, op, args])).digest("hex");
    return `doorbell:${digest}`;
}

function commandExists(database, key) {
    return database.prepare("SELECT 1 FROM economy_commands WHERE idempotency_key = ?").get(key) !== undefined;
}

function readBankFacts(database, backend, rules, residentId) {
    const account = backend.forResident(residentId).getOwnAccount();
    const termDeposits = mapRows(database.prepare(`
      SELECT deposit_id, principal, term_days, total_rate_ppm, opened_day,
             maturity_day, state, interest_paid, created_at, ended_at
      FROM economy_term_deposits
      WHERE resident_id = ?
      ORDER BY created_at DESC, deposit_id
    `).all(residentId));
    const systemLoans = mapRows(database.prepare(`
      SELECT loan_id, principal_original, principal_outstanding, accrued_interest,
             daily_rate_ppm, term_days, originated_day, due_day, status, created_at, repaid_at
      FROM economy_system_loans
      WHERE borrower_resident_id = ?
      ORDER BY created_at DESC, loan_id
    `).all(residentId));
    const playerLoanRows = mapRows(database.prepare(`
      SELECT loan_id, lender_resident_id, borrower_resident_id, principal_original,
             principal_outstanding, accrued_interest, total_rate_ppm, term_days,
             status, lender_confirmed_at, borrower_confirmed_at,
             originated_day, due_day, created_at, repaid_at
      FROM economy_player_loans
      WHERE lender_resident_id = ? OR borrower_resident_id = ?
      ORDER BY created_at DESC, loan_id
    `).all(residentId, residentId));
    const playerLoans = playerLoanRows.map((loan) => publicPlayerLoan(database, loan, residentId));
    const month = new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 7);
    const residentIssued = database.prepare(`
      SELECT COALESCE(silver_issued, 0) AS silver_issued
      FROM economy_exchange_resident_months
      WHERE resident_id = ? AND beijing_month = ?
    `).get(residentId, month)?.silver_issued ?? 0;
    const globalIssued = database.prepare(`
      SELECT COALESCE(silver_issued, 0) AS silver_issued
      FROM economy_exchange_global_months WHERE beijing_month = ?
    `).get(month)?.silver_issued ?? 0;
    const options = [];
    if (account.availableGold > 0)
        options.push(option(bankOption(database, residentId, "demand-deposit"), ["amount"]));
    if (account.demandGold > 0)
        options.push(option(bankOption(database, residentId, "demand-withdraw"), ["amount"]));
    if (!account.highSpendRestricted && account.availableGold >= 525 && residentIssued < 1_000 && globalIssued < 10_000)
        options.push(option(bankOption(database, residentId, "exchange-gold-silver"), ["amount"]));
    if (!account.highSpendRestricted && account.availableGold >= 1_000_000)
        options.push(option(bankOption(database, residentId, "term-open"), ["amount", "termDays", "totalRatePpm"]));
    for (const deposit of termDeposits.filter((item) => item.state === "active"))
        options.push(option(bankOption(database, residentId, "term-close", deposit.depositId)));
    const openSystemLoan = systemLoans.find((loan) => loan.status !== "repaid");
    if (rules.minimumSystemLoanCreditDays !== null && !account.highSpendRestricted && !openSystemLoan)
        options.push(option(bankOption(database, residentId, "system-loan-open"), ["amount", "termDays"]));
    if (rules.minimumSystemLoanCreditDays !== null && openSystemLoan && account.availableGold > 0)
        options.push(option(bankOption(database, residentId, "system-loan-repay", openSystemLoan.loanId), ["amount"]));
    if (account.availableSilver > account.silverAgentLock)
        options.push(option(bankOption(database, residentId, "silver-lock-increase"), ["amount"]));
    if (!account.highSpendRestricted && account.availableSilver > account.silverAgentLock)
        options.push(option(bankOption(database, residentId, "player-loan-offer"), ["to", "amount", "termDays", "totalRatePpm"]));
    if (!account.highSpendRestricted)
        options.push(option(bankOption(database, residentId, "player-loan-request"), ["to", "amount", "termDays", "totalRatePpm"]));
    for (const loan of playerLoanRows) {
        if (loan.status === "proposed") {
            const needsConfirmation = loan.lenderResidentId === residentId
                ? loan.lenderConfirmedAt === null
                : loan.borrowerConfirmedAt === null;
            if (needsConfirmation)
                options.push(option(bankOption(database, residentId, "player-loan-confirm", loan.loanId)));
            options.push(option(bankOption(database, residentId, "player-loan-cancel", loan.loanId)));
        }
        if (loan.borrowerResidentId === residentId &&
            ["active", "overdue", "restricted"].includes(loan.status) && account.availableSilver > 0) {
            options.push(option(bankOption(database, residentId, "player-loan-repay", loan.loanId), ["amount"]));
        }
    }
    return {
        account,
        deposits: { demandGold: account.demandGold, termDeposits },
        exchange: {
            goldPerSilver: 500,
            residentIssuedThisMonth: residentIssued,
            residentRemainingThisMonth: Math.max(0, 1_000 - residentIssued),
            globalIssuedThisMonth: globalIssued,
            globalRemainingThisMonth: Math.max(0, 10_000 - globalIssued),
        },
        loans: { playerLoans, systemLoans },
        credit: {
            creditPoints: account.creditPoints,
            highSpendRestricted: account.highSpendRestricted,
            systemLoanCreditRuleConfigured: rules.minimumSystemLoanCreditDays !== null,
        },
        options,
    };
}

function bankReference(facts, reference) {
    const item = [
        ...facts.deposits.termDeposits.map((value) => ({ type: "term_deposit", value })),
        ...facts.loans.systemLoans.map((value) => ({ type: "system_loan", value })),
        ...facts.loans.playerLoans.map((value) => ({ type: "player_loan", value })),
    ].find(({ value }) => value.depositId === reference || value.loanId === reference);
    if (!item)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到这条银行记录。");
    return item;
}

function bankView(database, backend, rules, residentId, args) {
    const facts = readBankFacts(database, backend, rules, residentId);
    if (args.reference)
        return success("已读取银行记录。", { reference: bankReference(facts, args.reference), options: facts.options });
    const section = args.section ?? null;
    return success("已读取银行当前事实。", section === null
        ? facts
        : { section, value: facts[section], options: facts.options });
}

function activeResidentDetentions(backend, residentId, now) {
    return backend.forResident(residentId).listOwnDetentions({ at: now, activeOnly: true });
}

function detainedBankView(database, backend, rules, residentId, args) {
    const response = bankView(database, backend, rules, residentId, args);
    const options = (response.data?.options ?? []).filter((entry) =>
        parseBankOption(entry.option)?.action === "system-loan-repay");
    return {
        ...response,
        data: {
            ...response.data,
            options,
        },
    };
}

function securityReleaseOption(detentionId) {
    return `security:release:${detentionId}`;
}

function securityCommissionView(database, backend, residentId, args, sources, now, detained = false) {
    const response = commissionView(database, backend, residentId, "constable", args, sources, now);
    const detentions = activeResidentDetentions(backend, residentId, now);
    return {
        ...response,
        data: {
            ...response.data,
            patrol: backend.trustedQueries.getSecurityPatrolStatus({ at: now }),
            detentions: detentions.map((detention) => ({
                ...detention,
                earlyRelease: backend.forResident(residentId).quoteOwnDetentionEarlyRelease({
                    detentionId: detention.detentionId,
                }),
            })),
            options: [
                ...(detained ? [] : (response.data?.options ?? [])),
                ...detentions.map((detention) => option(securityReleaseOption(detention.detentionId))),
            ],
        },
    };
}

function securityRelease(database, backend, residentId, args, now) {
    const match = /^security:release:(.+)$/u.exec(args.option);
    if (!match || Object.keys(args).length !== 1)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个治安 option 当前不可用。");
    const detention = backend.forResident(residentId).listOwnDetentions()
        .find((entry) => entry.detentionId === match[1]);
    if (!detention)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个治安 option 当前不可用。");
    const result = backend.forResident(residentId).releaseOwnDetentionEarly({
        detentionId: detention.detentionId,
        idempotencyKey: idempotencyKey(residentId, "go.security.commission", args),
    });
    return success("已办理提前释放。", {
        result,
        detentions: activeResidentDetentions(backend, residentId, now),
    });
}

function requireCurrentBankOption(database, backend, rules, residentId, optionValue, key) {
    if (!commandExists(database, key) &&
        !readBankFacts(database, backend, rules, residentId).options.some((entry) => entry.option === optionValue)) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 已经不是当前状态。");
    }
}

function bankChoose(database, backend, rules, residentId, args) {
    const parsed = parseBankOption(args.option);
    if (!parsed)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 当前不可用。");
    if (args.to !== undefined && !["player-loan-offer", "player-loan-request"].includes(parsed.action))
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 当前不可用。");
    const key = idempotencyKey(residentId, "go.bank.choose", args);
    requireCurrentBankOption(database, backend, rules, residentId, args.option, key);
    const command = backend.trustedSystemCommands;
    const resident = backend.forResident(residentId);
    let result;
    switch (parsed.action) {
        case "demand-deposit":
            assertPositiveInteger(args.amount, "amount");
            result = command.depositDemandGold({ residentId, amount: args.amount, idempotencyKey: key });
            break;
        case "demand-withdraw":
            assertPositiveInteger(args.amount, "amount");
            result = command.withdrawDemandGold({ residentId, amount: args.amount, idempotencyKey: key });
            break;
        case "exchange-gold-silver":
            assertPositiveInteger(args.amount, "amount");
            result = command.exchangeGoldForSilver({ residentId, goldPrincipal: args.amount, idempotencyKey: key });
            break;
        case "term-open":
            assertPositiveInteger(args.amount, "amount");
            if (!TERM_DAYS.has(args.termDays) || !Number.isSafeInteger(args.totalRatePpm))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个定期存款 option 缺少当前要求的参数。");
            result = command.openTermDeposit({
                residentId,
                principal: args.amount,
                termDays: args.termDays,
                totalRatePpm: args.totalRatePpm,
                idempotencyKey: key,
            });
            break;
        case "term-close":
            if (!parsed.reference || Object.keys(args).length !== 1)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个定期存款 option 当前不可用。");
            result = resident.closeOwnTermDeposit({ depositId: parsed.reference, idempotencyKey: key });
            break;
        case "system-loan-open":
            if (rules.minimumSystemLoanCreditDays === null)
                throw new LingyeBusinessError("LINGYE_NOT_READY", "系统贷款的信用规则尚未配置。");
            assertPositiveInteger(args.amount, "amount");
            if (!TERM_DAYS.has(args.termDays))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个系统贷款 option 缺少当前要求的期限。");
            result = command.openSystemLoan({
                borrowerResidentId: residentId,
                principal: args.amount,
                termDays: args.termDays,
                idempotencyKey: key,
            });
            break;
        case "system-loan-repay":
            if (rules.minimumSystemLoanCreditDays === null)
                throw new LingyeBusinessError("LINGYE_NOT_READY", "系统贷款的信用规则尚未配置。");
            if (!parsed.reference)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个还款 option 当前不可用。");
            assertPositiveInteger(args.amount, "amount");
            result = resident.repayOwnSystemLoan({ loanId: parsed.reference, amount: args.amount, idempotencyKey: key });
            break;
        case "silver-lock-increase":
            assertPositiveInteger(args.amount, "amount");
            result = command.setSilverAgentLock({ residentId, amount: args.amount, actor: "agent", idempotencyKey: key });
            break;
        case "player-loan-offer":
        case "player-loan-request": {
            assertNonEmptyString(args.to, "to");
            assertPositiveInteger(args.amount, "amount");
            if (!TERM_DAYS.has(args.termDays) || !Number.isSafeInteger(args.totalRatePpm))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个玩家借款 option 缺少当前要求的合同参数。");
            const counterpartyResidentId = residentForPublicFarm(database, args.to);
            if (counterpartyResidentId === residentId)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "不能和自己建立玩家借款。");
            result = resident.proposePlayerLoan({
                lenderResidentId: parsed.action === "player-loan-offer" ? residentId : counterpartyResidentId,
                borrowerResidentId: parsed.action === "player-loan-request" ? residentId : counterpartyResidentId,
                principal: args.amount,
                termDays: args.termDays,
                totalRatePpm: args.totalRatePpm,
                idempotencyKey: key,
            });
            break;
        }
        case "player-loan-confirm":
            if (!parsed.reference || Object.keys(args).length !== 1)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个玩家借款确认 option 当前不可用。");
            result = resident.confirmPlayerLoan({ loanId: parsed.reference, idempotencyKey: key });
            break;
        case "player-loan-cancel":
            if (!parsed.reference || Object.keys(args).length !== 1)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个玩家借款取消 option 当前不可用。");
            result = resident.cancelPlayerLoan({ loanId: parsed.reference, idempotencyKey: key });
            break;
        case "player-loan-repay":
            if (!parsed.reference || args.to !== undefined)
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个玩家借款还款 option 当前不可用。");
            assertPositiveInteger(args.amount, "amount");
            result = resident.repayPlayerLoan({ loanId: parsed.reference, amount: args.amount, idempotencyKey: key });
            break;
        default:
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 当前不可用。");
    }
    return success("银行业务已办理。", {
        result: parsed.action.startsWith("player-loan-")
            ? publicPlayerLoan(database, result, residentId)
            : result,
        current: readBankFacts(database, backend, rules, residentId),
    });
}

function schoolRevision(database, residentId) {
    return database
        .prepare("SELECT COUNT(*) AS revision FROM lingye_school_action_receipts WHERE resident_id = ?")
        .get(residentId).revision;
}

function schoolOption(revision, action, reference) {
    return `school:${action}:${revision}:${reference}`;
}

function schoolActionPayloadHash(residentId, args) {
    return createHash("sha256")
        .update(JSON.stringify({ args, op: "go.school.choose", residentId }))
        .digest("hex");
}

function careerSchoolAvailable(backend, career) {
    return backend.trustedQueries.courseAvailable(career, 1, 1);
}

function constableInterviewFacts(database, residentId, optionRevision) {
    const interviews = mapRows(database.prepare(`
      SELECT interview_id, candidate_resident_id, scheduled_at, status,
             last_postponed_at, postponed_count
      FROM career_constable_interviews
      WHERE candidate_resident_id = ?
         OR EXISTS (
           SELECT 1 FROM career_constable_examiner_signups AS signup
           WHERE signup.interview_id = career_constable_interviews.interview_id
             AND signup.examiner_resident_id = ?
         )
      ORDER BY scheduled_at DESC, interview_id
    `).all(residentId, residentId)).map((interview) => {
        const signup = mapRows(database.prepare(`
          SELECT signup_order, attendance_confirmed_at, selected
          FROM career_constable_examiner_signups
          WHERE interview_id = ? AND examiner_resident_id = ?
        `).all(interview.interviewId, residentId))[0] ?? null;
        const notice = mapRows(database.prepare(`
          SELECT notice_id, status, opened_at, closes_at
          FROM career_constable_public_notices WHERE interview_id = ?
        `).all(interview.interviewId))[0] ?? null;
        return {
            interviewId: interview.interviewId,
            scheduledAt: isoTime(interview.scheduledAt),
            status: interview.status,
            role: interview.candidateResidentId === residentId ? "candidate" : "examiner",
            signup: signup ? {
                ...signup,
                attendanceConfirmedAt: isoTime(signup.attendanceConfirmedAt),
            } : null,
            notice: notice ? {
                ...notice,
                openedAt: isoTime(notice.openedAt),
                closesAt: isoTime(notice.closesAt),
            } : null,
            postponed: interview.lastPostponedAt !== null,
            lastPostponedAt: isoTime(interview.lastPostponedAt),
            postponedCount: interview.postponedCount,
        };
    });
    const publicNotices = mapRows(database.prepare(`
      SELECT notice.notice_id, notice.interview_id, notice.status,
             notice.candidate_resident_name, notice.opened_at, notice.closes_at,
             attempt.qualification_level, voter.choice
      FROM career_constable_public_notices AS notice
      JOIN career_constable_interviews AS interview ON interview.interview_id = notice.interview_id
      JOIN career_exam_attempts AS attempt ON attempt.attempt_id = interview.attempt_id
      JOIN career_constable_notice_voters AS voter ON voter.notice_id = notice.notice_id
      WHERE voter.resident_id = ?
      ORDER BY notice.opened_at DESC, notice.notice_id
    `).all(residentId)).map((notice) => ({
        noticeId: notice.noticeId,
        interviewId: notice.interviewId,
        status: notice.status,
        candidate: { residentName: notice.candidateResidentName },
        career: "constable",
        qualificationLevel: notice.qualificationLevel,
        outcome: "interview_passed_pending_public_notice",
        openedAt: isoTime(notice.openedAt),
        closesAt: isoTime(notice.closesAt),
        myChoice: notice.choice,
        options: notice.status === "open" && notice.choice === null
            ? ["no_objection", "review_request"]
            : [],
    }));
    const options = [];
    for (const notice of publicNotices) {
        if (notice.status !== "open" || notice.myChoice !== null)
            continue;
        options.push(option(schoolOption(optionRevision, "constable-public-notice-vote", `${notice.noticeId}:no_objection`)));
        options.push(option(schoolOption(optionRevision, "constable-public-notice-vote", `${notice.noticeId}:review_request`)));
    }
    return { interviews, publicNotices, options };
}

function readSchoolFacts(database, backend, residentId, now, optionRevision = schoolRevision(database, residentId)) {
    backend.trustedSystemCommands.advanceConstableInterviews(now);
    backend.trustedSystemCommands.expireDueExamAttempts(residentId);
    const tracks = mapRows(database.prepare(`
      SELECT career, track_order, selected_at FROM career_tracks
      WHERE resident_id = ? ORDER BY track_order
    `).all(residentId));
    const courses = mapRows(database.prepare(`
      SELECT career, qualification_level, course_index, enrolled_at,
             content_read_at, content_delivery_id, content_delivered_at,
             completed_at, best_correct_answers
      FROM career_courses WHERE resident_id = ?
      ORDER BY career, qualification_level, course_index
    `).all(residentId));
    const exams = mapRows(database.prepare(`
      SELECT attempt.attempt_id, attempt.career, attempt.qualification_level,
             attempt.scheduled_at, attempt.registration_status, attempt.correct_answers,
             attempt.registered_at, attempt.started_at, attempt.ended_at,
             attempt.missed_session_at,
             reservation.reservation_id
      FROM career_exam_attempts AS attempt
      LEFT JOIN economy_system_gold_reservations AS reservation
        ON reservation.reserve_journal_id = attempt.reservation_receipt_id
      WHERE attempt.resident_id = ?
      ORDER BY attempt.registered_at DESC, attempt.attempt_id
    `).all(residentId)).map((exam) => exam.missedSessionAt === null
        ? exam
        : { ...exam, registrationStatus: "expired" });
    const certificates = mapRows(database.prepare(`
      SELECT career, qualification_level, status, source_attempt_id,
             issued_at, effective_at
      FROM career_certificates WHERE resident_id = ?
      ORDER BY career, qualification_level
    `).all(residentId)).map((certificate) => ({
        ...certificate,
        canWork: certificate.status === "active" &&
            (certificate.effectiveAt === null || certificate.effectiveAt <= now),
        title: CAREER_TITLES[certificate.career]?.[certificate.qualificationLevel] ?? null,
    }));
    const employment = mapRows(database.prepare(`
      SELECT employment_id, career, institution, seat_number, employment_class, status,
             availability, hired_at, ended_at
      FROM career_employments WHERE resident_id = ?
      ORDER BY hired_at DESC, employment_id
    `).all(residentId)).map((record) => {
        const activeLevel = Math.max(0, ...certificates
            .filter((certificate) => certificate.career === record.career &&
                certificate.canWork)
            .map((certificate) => certificate.qualificationLevel));
        return {
            ...record,
            seatNumber: record.employmentClass === "staff" ? record.seatNumber : null,
            title: CAREER_TITLES[record.career]?.[activeLevel] ?? null,
        };
    });
    const duties = mapRows(database.prepare(`
      SELECT duty_id, employment_id, career, institution, duty_date,
             qualification_level, base_wage_gold, status, performance_units,
             performance_gold, performance_rate_bps, generated_at, settled_at
      FROM career_duty_days WHERE resident_id = ?
      ORDER BY duty_date DESC, duty_id
    `).all(residentId));
    const institutionStaffing = ["reporter", "veterinarian", "constable"].map((career) => {
        const institution = CAREER_INSTITUTION[career];
        const counts = database.prepare(`SELECT
            SUM(CASE WHEN employment_class = 'staff' THEN 1 ELSE 0 END) AS staff_count,
            SUM(CASE WHEN employment_class = 'external' THEN 1 ELSE 0 END) AS external_count
          FROM career_employments
          WHERE institution = ? AND status = 'active'`).get(institution);
        return {
            career,
            institution,
            staffCapacity: 2,
            staffCount: counts.staff_count ?? 0,
            externalCount: counts.external_count ?? 0,
        };
    });
    const constable = constableInterviewFacts(database, residentId, optionRevision);
    const options = [...constable.options];
    const advancement = [];
    if (tracks.length === 0) {
        for (const career of CAREER_IDS.filter((candidate) => careerSchoolAvailable(backend, candidate)))
            options.push(option(schoolOption(optionRevision, "career-select", career)));
    }
    else if (tracks.length === 1) {
        const primary = tracks[0];
        const primaryLevel = Math.max(0, ...certificates
            .filter((certificate) => certificate.career === primary.career && certificate.canWork)
            .map((certificate) => certificate.qualificationLevel));
        if (primaryLevel >= 3) {
            for (const career of CAREER_IDS.filter((candidate) =>
                candidate !== primary.career && careerSchoolAvailable(backend, candidate)))
                options.push(option(schoolOption(optionRevision, "career-select", career)));
        }
    }
    for (const track of tracks) {
        const activeLevel = Math.max(0, ...certificates
            .filter((certificate) => certificate.career === track.career && certificate.canWork)
            .map((certificate) => certificate.qualificationLevel));
        const issuedLevel = Math.max(0, ...certificates
            .filter((certificate) => certificate.career === track.career && certificate.status === "active")
            .map((certificate) => certificate.qualificationLevel));
        if (issuedLevel > activeLevel)
            continue;
        const nextLevel = activeLevel + 1;
        if (nextLevel > 4)
            continue;
        const workEligibility = careerAdvancementWorkEligibility(database, residentId, track.career, nextLevel);
        advancement.push({
            career: track.career,
            ...workEligibility,
            registrationStatus: workEligibility.eligible ? "eligible" : "work_experience_required",
            message: workEligibility.eligible ? null : "工作经验不足，不能报考。",
        });
        const levelCourses = courses.filter((course) => course.career === track.career && course.qualificationLevel === nextLevel);
        const incomplete = levelCourses.find((course) => course.completedAt === null);
        if (incomplete) {
            const reference = `${incomplete.career}:${incomplete.qualificationLevel}:${incomplete.courseIndex}`;
            if (incomplete.contentReadAt === null) {
                if (incomplete.contentDeliveryId)
                    options.push(option(schoolOption(optionRevision, "course-read",
                        `${reference}:${incomplete.contentDeliveryId}`)));
            }
            else {
                options.push(option(schoolOption(optionRevision, "course-practice", reference), ["answers"]));
            }
            continue;
        }
        const nextCourseIndex = [1, 2, 3].find((courseIndex) => !levelCourses.some((course) => course.courseIndex === courseIndex));
        if (nextCourseIndex !== undefined) {
            if (backend.trustedQueries.courseAvailable(track.career, nextLevel, nextCourseIndex)) {
                options.push(option(schoolOption(optionRevision, "course-enroll", `${track.career}:${nextLevel}:${nextCourseIndex}`)));
            }
            continue;
        }
        const activeExam = exams.find((exam) => exam.career === track.career &&
            exam.qualificationLevel === nextLevel &&
            ["registered", "active", "written_passed"].includes(exam.registrationStatus));
        if (!activeExam) {
            if (workEligibility.eligible && backend.trustedQueries.examAvailable(track.career, nextLevel)) {
                options.push(option(schoolOption(optionRevision, "exam-register", `${track.career}:${nextLevel}`)));
            }
            continue;
        }
        if (activeExam.registrationStatus === "registered") {
            if (isBeijingExamSessionOpen(now, activeExam.scheduledAt)) {
                options.push(option(schoolOption(optionRevision, "exam-start", activeExam.attemptId)));
            }
            options.push(option(schoolOption(optionRevision, "exam-release", activeExam.attemptId)));
        }
        if (activeExam.registrationStatus === "active" &&
            isBeijingExamSessionOpen(now, activeExam.scheduledAt)) {
            options.push(option(schoolOption(optionRevision, "exam-submit", activeExam.attemptId), ["answers"]));
        }
    }
    const activeEmployment = employment.find((item) => item.status === "active");
    if (!activeEmployment) {
        for (const career of ["reporter", "veterinarian", "constable"].filter((candidate) =>
            careerSchoolAvailable(backend, candidate))) {
            const qualified = certificates.some((certificate) => certificate.career === career &&
                certificate.qualificationLevel >= 1 && certificate.canWork);
            if (!qualified)
                continue;
            options.push(option(schoolOption(optionRevision, "employment-hire", career)));
        }
    }
    else {
        if (activeEmployment.availability === "available")
            options.push(option(schoolOption(optionRevision, "employment-leave", activeEmployment.employmentId)));
        if (activeEmployment.availability === "leave")
            options.push(option(schoolOption(optionRevision, "employment-resume", activeEmployment.employmentId)));
        options.push(option(schoolOption(optionRevision, "employment-end", activeEmployment.employmentId)));
    }
    return {
        careers: tracks,
        courses,
        exams,
        certificates,
        advancement,
        examSchedule: {
            timeZone: "Asia/Shanghai",
            weekdays: [...BEIJING_EXAM_WEEKDAYS],
            startHour: EXAM_SESSION_START_HOUR,
            durationMinutes: EXAM_SESSION_DURATION_MS / (60 * 1_000),
        },
        employment: { institutions: institutionStaffing, records: employment, duties },
        interviews: constable.interviews,
        publicNotices: constable.publicNotices,
        ...(certificates.some((certificate) => certificate.status === "active" && !certificate.canWork)
            ? { workNotice: WORK_NOT_STARTED_MESSAGE }
            : {}),
        options,
        contentSources: {
            courseCatalogAvailable: true,
            courseContentAvailable: courseCatalog().some((course) =>
                backend.trustedQueries.courseAvailable(course.career, course.qualificationLevel, course.courseIndex)),
            examQuestionBankAvailable: CAREER_IDS.some((career) =>
                [1, 2, 3, 4].some((level) => backend.trustedQueries.examAvailable(career, level))),
        },
    };
}

function resumableSchoolCourses(database, backend, residentId, now, facts, optionRevision = schoolRevision(database, residentId)) {
    const incomplete = facts.courses.filter((course) => course.completedAt === null);
    if (incomplete.length === 0)
        return { current: facts, currentCourses: [] };
    const currentCourses = incomplete.map((course) => ({
        career: course.career,
        qualificationLevel: course.qualificationLevel,
        courseIndex: course.courseIndex,
        stage: course.contentReadAt === null ? "awaiting_read_confirmation" : "awaiting_practice",
        content: backend.trustedQueries.getCourseContent({
            residentId,
            career: course.career,
            level: course.qualificationLevel,
            courseIndex: course.courseIndex,
        }),
    }));
    return {
        current: readSchoolFacts(database, backend, residentId, now, optionRevision),
        currentCourses,
    };
}

function schoolReference(facts, backend, residentId, reference) {
    const candidates = [
        ...facts.courses.map((value) => ({ type: "course", value })),
        ...facts.exams.map((value) => ({ type: "exam", value })),
        ...facts.certificates.map((value) => ({ type: "certificate", value })),
        ...facts.employment.records.map((value) => ({ type: "employment", value })),
        ...facts.employment.duties.map((value) => ({ type: "duty_day", value })),
        ...facts.interviews.map((value) => ({ type: "interview", value })),
        ...facts.publicNotices.map((value) => ({ type: "public_notice", value })),
    ];
    const item = candidates.find(({ value }) => [
        value.attemptId,
        value.employmentId,
        value.dutyId,
        value.sourceAttemptId,
        value.interviewId,
        value.noticeId,
        value.career && value.qualificationLevel
            ? `${value.career}:${value.qualificationLevel}:${value.courseIndex ?? "certificate"}`
            : null,
    ].includes(reference));
    if (!item)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到这条职业学校记录。");
    if (item.type === "course") {
        return {
            ...item,
            content: backend.trustedQueries.getCourseContent({
                residentId,
                career: item.value.career,
                level: item.value.qualificationLevel,
                courseIndex: item.value.courseIndex,
            }),
        };
    }
    if (item.type === "exam" && item.value.registrationStatus === "active") {
        return {
            ...item,
            paper: backend.trustedQueries.getWrittenExamPaper(item.value.attemptId),
        };
    }
    return item;
}

function schoolView(database, backend, residentId, now, args) {
    let facts = readSchoolFacts(database, backend, residentId, now);
    if (args.reference) {
        const reference = schoolReference(facts, backend, residentId, args.reference);
        const refreshed = readSchoolFacts(database, backend, residentId, now);
        return success("已读取职业学校记录。", {
            reference,
            options: refreshed.options,
            examSchedule: refreshed.examSchedule,
            ...(refreshed.workNotice ? { workNotice: refreshed.workNotice } : {}),
        });
    }
    const section = args.section ?? null;
    let currentCourses = [];
    if (section === null || section === "courses") {
        const resumable = resumableSchoolCourses(database, backend, residentId, now, facts);
        facts = resumable.current;
        currentCourses = resumable.currentCourses;
    }
    const value = section === "courses"
        ? {
            catalog: selectedCourseCatalog(backend, facts.careers.map((track) => track.career)),
            progress: facts.courses,
        }
        : section === null
            ? facts
            : facts[section];
    return success("已读取职业学校当前事实。", section === null
        ? { ...facts, currentCourses }
        : {
            section,
            value,
            options: facts.options,
            contentSources: facts.contentSources,
            currentCourses,
            examSchedule: facts.examSchedule,
            ...(facts.workNotice ? { workNotice: facts.workNotice } : {}),
        });
}

function schoolChoose(database, backend, residentId, now, args) {
    if (Array.isArray(args.answers)) {
        args = {
            ...args,
            answers: args.answers.map((selection) =>
                Array.isArray(selection)
                    ? selection.map((answer) => answer.trim().toUpperCase()).toSorted()
                    : selection.trim().normalize("NFKC")),
        };
    }
    const actionKey = idempotencyKey(residentId, "go.school.choose", args);
    const payloadHash = schoolActionPayloadHash(residentId, args);
    backend.trustedSystemCommands.expireDueExamAttempts(residentId);
    return runLingyeWorldTransaction(database, () => {
        const existing = database.prepare(`
          SELECT resident_id, payload_hash, result_json
          FROM lingye_school_action_receipts WHERE action_key = ?
        `).get(actionKey);
        if (existing) {
            if (existing.resident_id !== residentId || existing.payload_hash !== payloadHash)
                throw new LingyeBusinessError("CONFLICT", "这个职业学校操作已经使用了不同参数。");
            return JSON.parse(existing.result_json);
        }
        const current = readSchoolFacts(database, backend, residentId, now);
        if (!current.options.some((entry) => entry.option === args.option)) {
            const pendingHire = /^school:employment-hire:\d+:(reporter|veterinarian|constable)$/u.exec(args.option);
            if (pendingHire && current.certificates.some((certificate) => certificate.career === pendingHire[1] &&
                certificate.status === "active" && !certificate.canWork)) {
                throw new LingyeBusinessError("QUALIFICATION_NOT_EFFECTIVE", WORK_NOT_STARTED_MESSAGE);
            }
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个职业学校 option 当前不可用。");
        }
        let result;
        const careerMatch = /^school:career-select:(\d+):(chef|agronomist|veterinarian|reporter|constable)$/u.exec(args.option);
        const courseMatch = /^school:course-(enroll|practice):(\d+):(chef|agronomist|veterinarian|reporter|constable):([1-4]):([1-3])$/u.exec(args.option);
        const courseReadMatch = /^school:course-read:(\d+):(chef|agronomist|veterinarian|reporter|constable):([1-4]):([1-3]):([^:]+)$/u.exec(args.option);
        const examMatch = /^school:exam-(register|start|release|submit):(\d+):(.+)$/u.exec(args.option);
        const hireMatch = /^school:employment-hire:(\d+):(reporter|veterinarian|constable)$/u.exec(args.option);
        const availabilityMatch = /^school:employment-(leave|resume|end):(\d+):(.+)$/u.exec(args.option);
        const publicNoticeVoteMatch = /^school:constable-public-notice-vote:(\d+):(.+):(no_objection|review_request)$/u.exec(args.option);
        if (publicNoticeVoteMatch) {
            if (Object.hasOwn(args, "answers"))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个职业学校 option 当前不可用。");
            result = backend.trustedSystemCommands.voteConstablePublicNotice(
                publicNoticeVoteMatch[2], residentId, publicNoticeVoteMatch[3],
            );
        }
        else if (careerMatch) {
            if (Object.hasOwn(args, "answers"))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个 option 不接收答案。");
            result = backend.trustedSystemCommands.selectCareer(residentId, careerMatch[2]);
        }
        else if (courseReadMatch) {
            if (Object.hasOwn(args, "answers"))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "阅读确认不接收答案。");
            const [, , career, levelText, courseIndexText, contentDeliveryId] = courseReadMatch;
            const level = Number(levelText);
            const courseIndex = Number(courseIndexText);
            backend.trustedSystemCommands.markCourseContentRead({
                residentId,
                career,
                level,
                courseIndex,
                contentDeliveryId,
            });
            result = { career, level, courseIndex, contentRead: true };
        }
        else if (courseMatch) {
            const [, action, , career, levelText, courseIndexText] = courseMatch;
            const level = Number(levelText);
            const courseIndex = Number(courseIndexText);
            if (action === "enroll") {
                if (Object.hasOwn(args, "answers"))
                    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "报名课程不接收答案。");
                result = backend.trustedSystemCommands.enrollCourse({
                    residentId,
                    career,
                    level,
                    courseIndex,
                    amount: COURSE_TUITION_GOLD[level],
                    actor: "agent",
                    idempotencyKey: actionKey,
                });
            }
            else {
                if (!Object.hasOwn(args, "answers"))
                    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "课程练习需要提交五个答案。");
                const content = backend.trustedQueries.getCourseContent({
                    residentId,
                    career,
                    level,
                    courseIndex,
                });
                result = backend.trustedSystemCommands.submitCoursePractice({
                    residentId,
                    career,
                    level,
                    courseIndex,
                    paperId: content.paperId,
                    answers: args.answers,
                    idempotencyKey: actionKey,
                });
            }
        }
        else if (examMatch) {
            const [, action, , reference] = examMatch;
            if (action === "register") {
                if (Object.hasOwn(args, "answers"))
                    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "考试报名不接收答案。");
                const registration = /^(chef|agronomist|veterinarian|reporter|constable):([1-4])$/u.exec(reference);
                if (!registration)
                    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "考试报名 option 无效。");
                const career = registration[1];
                const level = Number(registration[2]);
                const priorFailure = database.prepare(`SELECT 1 FROM career_exam_attempts
                  WHERE resident_id = ? AND career = ? AND qualification_level = ?
                    AND registration_status = 'failed' AND missed_session_at IS NULL
                  LIMIT 1`).get(residentId, career, level);
                result = backend.trustedSystemCommands.registerExam({
                    attemptId: `exam-${actionKey.slice(-32)}`,
                    residentId,
                    career,
                    level,
                    amount: priorFailure ? EXAM_FEE_GOLD[level] / 2 : EXAM_FEE_GOLD[level],
                    actor: "agent",
                    idempotencyKey: actionKey,
                });
            }
            else {
                const exam = current.exams.find((entry) => entry.attemptId === reference);
                if (!exam || !exam.reservationId)
                    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "考试记录或冻结合同不可用。");
                if (action === "start") {
                    if (Object.hasOwn(args, "answers"))
                        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "开始考试不接收答案。");
                    result = backend.trustedSystemCommands.startExam({
                        attemptId: exam.attemptId,
                        reservationId: exam.reservationId,
                        idempotencyKey: actionKey,
                    });
                }
                else if (action === "release") {
                    if (Object.hasOwn(args, "answers"))
                        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "释放考试费用不接收答案。");
                    result = backend.trustedSystemCommands.releaseUnstartedExam({
                        attemptId: exam.attemptId,
                        reservationId: exam.reservationId,
                        idempotencyKey: actionKey,
                    });
                }
                else {
                    if (!Object.hasOwn(args, "answers"))
                        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "资格考试需要提交二十个答案。");
                    const paper = backend.trustedQueries.getWrittenExamPaper(exam.attemptId);
                    result = backend.trustedSystemCommands.submitWrittenExam({
                        attemptId: exam.attemptId,
                        paperId: paper.paperId,
                        answers: args.answers,
                        idempotencyKey: actionKey,
                    });
                    if (result.status === "passed" && result.passed === true)
                        result = { ...result, message: EXAM_PASSED_WORK_NOTICE };
                }
            }
        }
        else if (hireMatch) {
            if (Object.hasOwn(args, "answers"))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "任职操作不接收答案。");
            const career = hireMatch[2];
            result = {
                ...backend.trustedSystemCommands.hireResident({
                residentId,
                career,
                institution: CAREER_INSTITUTION[career],
                }),
                career,
                institution: CAREER_INSTITUTION[career],
                title: CAREER_TITLES[career]?.[qualificationLevel(database, residentId, career, now)] ?? null,
            };
        }
        else if (availabilityMatch) {
            if (Object.hasOwn(args, "answers"))
                throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "任职操作不接收答案。");
            const [, action, , employmentId] = availabilityMatch;
            if (action === "end") {
                backend.trustedSystemCommands.endEmployment(employmentId);
                result = { employmentId, status: "ended" };
            }
            else {
                const availability = action === "leave" ? "leave" : "available";
                backend.trustedSystemCommands.setAvailability(employmentId, availability);
                result = { employmentId, availability };
            }
        }
        else {
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个职业学校 option 当前不可用。");
        }
        const nextRevision = schoolRevision(database, residentId) + 1;
        const nextFacts = readSchoolFacts(database, backend, residentId, now, nextRevision);
        const resumable = courseReadMatch || courseMatch
            ? resumableSchoolCourses(database, backend, residentId, now, nextFacts, nextRevision)
            : { current: nextFacts, currentCourses: [] };
        const response = success("职业学校业务已办理。", {
            result,
            current: resumable.current,
            currentCourses: resumable.currentCourses,
        });
        database.prepare(`
          INSERT INTO lingye_school_action_receipts (
            action_key, resident_id, payload_hash, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(actionKey, residentId, payloadHash, JSON.stringify(response), now);
        return response;
    });
}

function serviceCommissionJobs(database, now) {
    return new CareerJobService({ database, now: () => now });
}

function serviceCommissionCandidateIds(database, career, requiredLevel, ownerResidentId, jobId, now) {
    if (!["agronomist", "veterinarian"].includes(career))
        return [];
    const exclusions = jobId === null
        ? []
        : database.prepare(`SELECT resident_id FROM career_job_assignment_exclusions
            WHERE job_id = ?`).all(jobId).map((row) => row.resident_id);
    const candidates = database.prepare(`SELECT DISTINCT certificate.resident_id
      FROM career_certificates AS certificate
      WHERE certificate.career = ? AND certificate.status = 'active'
        AND certificate.qualification_level >= ?
        AND (certificate.effective_at IS NULL OR certificate.effective_at <= ?)
      ORDER BY certificate.resident_id COLLATE BINARY ASC`)
        .all(career, requiredLevel, now)
        .map((row) => row.resident_id)
        .filter((candidateId) => candidateId !== ownerResidentId && !exclusions.includes(candidateId));
    const jobs = serviceCommissionJobs(database, now);
    return candidates.filter((candidateId) => {
        if (career === "veterinarian") {
            const duty = database.prepare(`SELECT 1
              FROM career_duty_days AS duty
              JOIN career_employments AS employment
                ON employment.employment_id = duty.employment_id
              WHERE duty.resident_id = ? AND duty.career = 'veterinarian'
                AND duty.institution = 'animal_hospital' AND duty.duty_date = ?
                AND duty.status = 'scheduled' AND employment.status = 'active'
                AND employment.availability = 'available' LIMIT 1`)
                .get(candidateId, beijingDate(now));
            if (!duty)
                return false;
        }
        return jobs.getServiceCommissionAvailability(candidateId, career).canAccept;
    });
}

function expireUnavailableOwnedServiceCommissions(database, backend, residentId, career, sources, now) {
    if (!["agronomist", "veterinarian"].includes(career))
        return;
    const currentSourceIds = new Set(sources
        .filter((source) => source.career === career && source.ownerResidentId === residentId)
        .map((source) => source.sourceId));
    const stale = database.prepare(`SELECT job.*
      FROM career_jobs AS job
      JOIN career_service_commission_funds AS fund
        ON fund.current_job_id = job.job_id AND fund.state = 'reserved'
      WHERE job.owner_resident_id = ? AND job.career = ?
        AND job.service_commission = 1
        AND job.status IN ('available', 'accepted', 'assigned')
        AND job.has_irreversible_action = 0`).all(residentId, career)
        .filter((job) => !currentSourceIds.has(job.source_id));
    const jobs = serviceCommissionJobs(database, now);
    for (const row of stale) {
        const job = backend.trustedQueries.getJob(row.job_id);
        releaseServiceCommissionFund(database, backend, job,
            `career-service:${job.sourceId}:expire`, now);
        jobs.expireJob(job.jobId, false);
    }
}

function visibleCommissionRows(database, residentId, career) {
    const rows = database.prepare(`
      SELECT * FROM career_jobs
      WHERE career = ? AND (
        worker_resident_id = ?
        OR owner_resident_id = ?
        OR (status = 'available' AND assignment_mode = 'accepted' AND (
          service_commission = 0
          OR service_audience = 'public'
          OR (service_audience = 'targeted' AND target_resident_id = ?)
        ))
      )
      ORDER BY updated_at DESC, job_id
    `).all(career, residentId, residentId, residentId);
    return career === "reporter"
        ? rows.filter((row) => !row.source_type.startsWith("reporter_daily_"))
        : rows;
}

function commissionMessages(database, jobId, residentId) {
    return mapRows(database.prepare(`
      SELECT message_id, sender_resident_id, recipient_resident_id, body, created_at
      FROM career_job_messages
      WHERE job_id = ?
      ORDER BY created_at, message_id
    `).all(jobId)).map(({ senderResidentId, recipientResidentId, ...message }) => ({
        ...message,
        sender: senderResidentId === residentId ? "self" : "counterparty",
        recipient: recipientResidentId === residentId ? "self" : "counterparty",
    }));
}

function publicChefRecipe(database, recipe, residentId, accessible) {
    const authorResidentId = recipe.authorResidentId ?? recipe.residentId;
    const { authorResidentId: _authorResidentId, residentId: _residentId, ...facts } = recipe;
    return {
        ...facts,
        author: authorResidentId === residentId ? { kind: "self" } : {
            kind: "resident",
            farm: publicFarmForResident(database, authorResidentId),
        },
        accessible,
        priceSilver: CHEF_ORIGINAL_RECIPE_SILVER_PRICE[recipe.rarity] ?? null,
    };
}

function publicChefLease(row) {
    const { ownerResidentId: _ownerResidentId, ...lease } = row;
    return lease;
}

function chefStoreListings(database, residentId) {
    const activeLeases = new Map(mapRows(database.prepare(`
      SELECT * FROM chef_store_leases WHERE state = 'active'
    `).all()).map((lease) => [lease.leaseId, lease]));
    const listings = [];
    for (const farm of allFarms()) {
        const receipts = farm?.[CHEF_STORE_LISTINGS_FIELD];
        if (!receipts || typeof receipts !== "object" || Array.isArray(receipts))
            continue;
        for (const receipt of Object.values(receipts)) {
            const lease = activeLeases.get(receipt?.leaseId);
            if (!lease || receipt?.state !== "reserved" || !Number.isSafeInteger(receipt.quantity) || receipt.quantity <= 0)
                continue;
            listings.push({
                leaseId: receipt.leaseId,
                productId: receipt.marketId,
                listingRevision: createHash("sha256").update(JSON.stringify([
                    receipt.receiptId,
                    receipt.quantity,
                    receipt.price,
                    receipt.updatedAt,
                ])).digest("hex"),
                kind: receipt.marketKind,
                quantity: receipt.quantity,
                priceSilver: receipt.price,
                seller: lease.ownerResidentId === residentId ? { kind: "self" } : {
                    kind: "resident",
                    farm: publicFarmForResident(database, lease.ownerResidentId),
                },
            });
        }
    }
    return listings;
}

function chefCommissionFacts(database, backend, residentId, farm, now) {
    const resident = backend.forResident(residentId);
    const accessible = new Set(resident.listOwnChefRecipes().map((recipe) => recipe.recipeId));
    const recipeIds = database.prepare(`
      SELECT recipe_id FROM career_chef_original_recipes ORDER BY created_at, recipe_id
    `).all();
    const recipes = recipeIds.map(({ recipe_id }) => backend.trustedQueries.getChefRecipe(recipe_id))
        .filter(Boolean)
        .map((recipe) => publicChefRecipe(database, recipe, residentId,
            accessible.has(recipe.recipeId) || recipe.authorResidentId === residentId));
    const leases = mapRows(database.prepare(`
      SELECT * FROM chef_store_leases
      WHERE owner_resident_id = ? ORDER BY created_at DESC, lease_id
    `).all(residentId)).map(publicChefLease);
    const listings = chefStoreListings(database, residentId);
    const level = qualificationLevel(database, residentId, "chef", now);
    const options = [];
    for (const recipe of recipes) {
        if (!recipe.accessible && recipe.author.kind !== "self")
            options.push(option(`commission:chef-recipe-buy:${encodeURIComponent(recipe.recipeId)}`));
    }
    const liveLease = leases.find((lease) => ["active", "suspended"].includes(lease.state));
    if (level >= 3 && !liveLease) {
        for (const listing of Array.isArray(farm?.market) ? farm.market : []) {
            if (["dish", "ingredient"].includes(listing?.kind) && typeof listing?.id === "string") {
                const reference = `market:${listing.kind}:${listing.id}`;
                options.push(option(`commission:chef-store-open:${encodeURIComponent(reference)}`));
            }
        }
    }
    for (const lease of leases) {
        if (["active", "suspended"].includes(lease.state) && now >= lease.nextRentDueAt)
            options.push(option(`commission:chef-store-rent:${encodeURIComponent(lease.leaseId)}:${lease.nextRentDueAt}`));
    }
    for (const listing of listings) {
        if (listing.seller.kind !== "self") {
            options.push(option(
                `commission:chef-store-buy:${encodeURIComponent(listing.leaseId)}:${encodeURIComponent(listing.productId)}:${listing.listingRevision}`,
                ["amount"],
            ));
        }
    }
    return { qualificationLevel: level, recipes, leases, listings, options };
}

function chefCommissionReference(facts, reference) {
    return facts.recipes.find((recipe) => recipe.recipeId === reference) ??
        facts.leases.find((lease) => lease.leaseId === reference) ??
        facts.listings.find((listing) => listing.leaseId === reference || listing.productId === reference) ??
        null;
}

function farmCommissionView(database, backend, residentId, args, sources, farm, now) {
    const chef = chefCommissionFacts(database, backend, residentId, farm, now);
    if (args.reference !== undefined) {
        const chefReference = chefCommissionReference(chef, args.reference);
        if (chefReference)
            return success("已读取公共农场职业记录。", {
                reference: chefReference,
                chef,
                options: chef.options,
            });
    }
    const agronomy = commissionView(database, backend, residentId, "agronomist", args,
        sources.filter((source) => source.career === "agronomist"), now);
    return success("已读取公共农场职业事实。", {
        ...agronomy.data,
        chef,
        options: [...agronomy.data.options, ...chef.options],
    });
}

function safeChefActionResult(database, result, residentId) {
    if (!result || typeof result !== "object" || Array.isArray(result))
        return result;
    const {
        ownerResidentId,
        buyerResidentId,
        authorResidentId,
        residentId: resultResidentId,
        ...facts
    } = result;
    return {
        ...facts,
        ...(ownerResidentId ? { owner: ownerResidentId === residentId ? { kind: "self" } : { kind: "resident", farm: publicFarmForResident(database, ownerResidentId) } } : {}),
        ...(buyerResidentId ? { buyer: buyerResidentId === residentId ? { kind: "self" } : { kind: "resident", farm: publicFarmForResident(database, buyerResidentId) } } : {}),
        ...(authorResidentId ? { author: authorResidentId === residentId ? { kind: "self" } : { kind: "resident", farm: publicFarmForResident(database, authorResidentId) } } : {}),
        ...(resultResidentId && !authorResidentId ? { resident: resultResidentId === residentId ? { kind: "self" } : { kind: "resident", farm: publicFarmForResident(database, resultResidentId) } } : {}),
    };
}

function farmChefCommissionAction(database, backend, residentId, args, farm, now) {
    const current = chefCommissionFacts(database, backend, residentId, farm, now);
    const key = idempotencyKey(residentId, "go.farm.commission", args);
    const replayExists = database.prepare(`
      SELECT 1 FROM chef_store_action_receipts WHERE action_key = ?
    `).get(key) !== undefined;
    if (!current.options.some((entry) => entry.option === args.option) && !replayExists)
        return null;
    const resident = backend.forResident(residentId);
    let result;
    const recipeBuy = /^commission:chef-recipe-buy:(.+)$/u.exec(args.option);
    const storeOpen = /^commission:chef-store-open:(.+)$/u.exec(args.option);
    const storeRent = /^commission:chef-store-rent:([^:]+):(\d+)$/u.exec(args.option);
    const storeBuy = /^commission:chef-store-buy:([^:]+):([^:]+):([0-9a-f]{64})$/u.exec(args.option);
    if (recipeBuy) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个原创菜谱购买 option 当前不可用。");
        const recipeId = decodeURIComponent(recipeBuy[1]);
        result = resident.purchaseChefOriginalRecipe({
            recipeId,
            purchaseId: key,
            idempotencyKey: key,
        });
    }
    else if (storeOpen) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个料理店开店 option 当前不可用。");
        result = resident.openChefStore({
            grade: current.qualificationLevel >= 4 ? "special" : "high",
            listingReference: decodeURIComponent(storeOpen[1]),
            idempotencyKey: key,
        });
    }
    else if (storeRent) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个料理店续租 option 当前不可用。");
        result = resident.payChefStoreRent({
            leaseId: decodeURIComponent(storeRent[1]),
            idempotencyKey: key,
        });
    }
    else if (storeBuy) {
        if (!Number.isSafeInteger(args.amount) || args.amount <= 0 || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个料理店购买 option 当前不可用。");
        result = resident.placeChefStoreOrder({
            leaseId: decodeURIComponent(storeBuy[1]),
            productId: decodeURIComponent(storeBuy[2]),
            quantity: args.amount,
            idempotencyKey: key,
        });
    }
    else {
        return null;
    }
    return success("公共农场职业业务已办理。", {
        result: safeChefActionResult(database, result, residentId),
        chef: chefCommissionFacts(database, backend, residentId, farm, now),
    });
}

function reporterNewsroomRoster(database, now) {
    return ensureReporterDutyRoles(database, now).map((assignment) => ({
        dutyDate: assignment.dutyDate,
        role: assignment.role,
        reporter: publicFarmForResident(database, assignment.residentId),
    }));
}

function reporterJobMatchesDuty(database, job, now) {
    if (job.career !== "reporter" || job.status !== "available" ||
        job.sourceType.endsWith(":writing") || job.sourceType.endsWith(":reviewing"))
        return false;
    if (reporterWorkflowForJob(database, job.jobId))
        return false;
    const materialPack = reporterMaterialPackForJob(database, job);
    return materialPack.issueReference === `lingye-daily:${beijingDate(now)}`;
}

function commissionOptions(database, backend, rows, residentId, sources, now) {
    const options = [];
    const newsroomRole = reporterDutyRole(database, residentId, now);
    for (const source of sources) {
        const existing = database.prepare("SELECT 1 FROM career_jobs WHERE source_type = ? AND source_id = ?")
            .get(source.sourceType, source.sourceId);
        if (!existing) {
            if (source.career === "agronomist" && source.ownerResidentId === residentId &&
                qualificationLevel(database, residentId, "agronomist", now) >= source.requiredLevel &&
                serviceCommissionJobs(database, now)
                    .getServiceCommissionAvailability(residentId, "agronomist").canAccept) {
                options.push(option(`commission:self:${source.sourceId}`));
            }
            options.push(option(`commission:publish:${source.sourceId}`));
            if (["agronomist", "veterinarian"].includes(source.career)) {
                for (const targetResidentId of serviceCommissionCandidateIds(database,
                    source.career, source.requiredLevel, source.ownerResidentId, null, now)) {
                    options.push(option(`commission:target:${source.sourceId}:${targetResidentId}`));
                }
                options.push(option(`commission:npc:${source.sourceId}`));
            }
        }
    }
    for (const row of rows) {
        const job = backend.trustedQueries.getJob(row.job_id);
        const workerLevel = qualificationLevel(database, residentId, job.career, now);
        const agronomyPayment = job.career === "agronomist"
            ? database.prepare("SELECT trade_id, silver_amount FROM career_commission_payments WHERE job_id = ?")
                .get(job.jobId)
            : null;
        const newsroomWorkflow = job.career === "reporter"
            ? reporterWorkflowForJob(database, job.jobId)
            : null;
        const originalReporterJob = job.career === "reporter" &&
            !job.sourceType.endsWith(":writing") && !job.sourceType.endsWith(":reviewing") &&
            !newsroomWorkflow;
        if (originalReporterJob && newsroomRole?.role === "selector" &&
            reporterJobMatchesDuty(database, job, now)) {
            options.push(option(`commission:check:${job.jobId}:sources`));
        }
        else if (originalReporterJob && newsroomRole?.role === "selector" &&
            job.workerResidentId === residentId && job.status === "active" &&
            job.decisionCount === 1) {
            options.push(option(`commission:select:${job.jobId}`));
        }
        else if (job.status === "available" && job.ownerResidentId !== residentId &&
            job.assignmentMode === "accepted" &&
            (!job.serviceCommission || job.serviceAudience === "public" ||
                (job.serviceAudience === "targeted" && job.targetResidentId === residentId)) &&
            (!job.serviceCommission || serviceCommissionCandidateIds(database,
                job.career, job.requiredLevel, job.ownerResidentId, job.jobId, now).includes(residentId)) &&
            job.career !== "reporter" &&
            workerLevel >= job.requiredLevel &&
            (job.career !== "agronomist" || agronomyPayment))
            options.push(option(`commission:accept:${job.jobId}`));
        if (job.serviceCommission && job.status === "available" &&
            job.serviceAudience === "targeted" && job.targetResidentId === residentId)
            options.push(option(`commission:decline:${job.jobId}`));
        if (job.serviceCommission && job.status === "available" && job.ownerResidentId === residentId) {
            if (job.serviceAudience === "owner_choice") {
                options.push(option(`commission:reopen:${job.jobId}`));
                for (const targetResidentId of serviceCommissionCandidateIds(database,
                    job.career, job.requiredLevel, job.ownerResidentId, job.jobId, now)) {
                    options.push(option(`commission:retarget:${job.jobId}:${targetResidentId}`));
                }
            }
            options.push(option(`commission:npc-job:${job.jobId}`));
        }
        if (job.career === "agronomist" && job.status === "available" &&
            job.ownerResidentId === residentId && job.parentJobId && !agronomyPayment)
            options.push(option(`commission:republish:${job.jobId}`, ["amount"]));
        if (["agronomist", "veterinarian"].includes(job.career) &&
            job.status === "available" && job.ownerResidentId === residentId && job.parentJobId) {
            options.push(option(`commission:npc-transfer:${job.jobId}`));
        }
        if (job.ownerResidentId === residentId &&
            (job.serviceCommission || ["farm_plot_condition", "animal_health_case"].includes(job.sourceType)) &&
            ["available", "accepted", "assigned"].includes(job.status))
            options.push(option(`commission:cancel:${job.jobId}`));
        if (job.workerResidentId &&
            [job.ownerResidentId, job.workerResidentId].includes(residentId) &&
            ["accepted", "assigned", "active"].includes(job.status)) {
            options.push(option(`commission:reply:${job.jobId}`, ["text"]));
        }
        let currentWorkerOptions = originalReporterJob
            ? []
            : workerOptions(job, residentId, workerLevel);
        if (job.career === "reporter" && job.sourceType.endsWith(":writing") &&
            !["selected", "needs_supplement"].includes(newsroomWorkflow?.status)) {
            currentWorkerOptions = [];
        }
        if (job.career === "reporter" && job.sourceType.endsWith(":reviewing") &&
            newsroomWorkflow?.status !== "pending_review") {
            currentWorkerOptions = [];
        }
        for (const value of currentWorkerOptions) {
            const requires = value.includes(":submit:") ? ["text"] : [];
            options.push(option(value, requires));
        }
        if (job.career === "reporter" &&
            currentWorkerOptions.some((value) => value.includes(":submit:"))) {
            for (const section of backend.trustedQueries.listReporterSections()) {
                options.push(option(`commission:submit-section:${encodeURIComponent(job.jobId)}:${encodeURIComponent(section.sectionId)}:${encodeURIComponent(section.name)}`, ["text"]));
            }
        }
    }
    return options;
}

function commissionView(database, backend, residentId, career, args, sources, now) {
    expireUnavailableOwnedServiceCommissions(database, backend, residentId, career, sources, now);
    const rows = visibleCommissionRows(database, residentId, career);
    const selected = args.reference === undefined
        ? rows
        : rows.filter((row) => row.job_id === args.reference);
    if (args.reference !== undefined && selected.length === 0)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到这条真实委托。");
    const options = commissionOptions(database, backend, selected, residentId,
        sources.filter((source) => source.career === career), now);
    const level = qualificationLevel(database, residentId, career, now);
    if (career === "reporter" && level >= 3)
        options.unshift(option("commission:section-create", ["text"]));
    const reporterPublications = career === "reporter"
        ? backend.trustedQueries.listReporterPublicationsForResident({ residentId })
        : [];
    for (const publication of reporterPublications.filter((entry) => entry.canLike)) {
        options.push(option(`commission:like:${encodeURIComponent(publication.publicationId)}`));
    }
    return success("已读取当前真实委托。", {
        jobs: mapRows(selected).map((job, index) => ({
            ...job,
            sourceFacts: commissionSourceFacts(database, backend.trustedQueries.getJob(selected[index].job_id)),
            messages: commissionMessages(database, selected[index].job_id, residentId),
        })),
        sources: sources
            .filter((source) => source.career === career)
            .map(publicCommissionSource),
        ...(career === "reporter"
            ? {
                newsroom: {
                    dutyDate: beijingDate(now),
                    role: reporterDutyRole(database, residentId, now)?.role ?? null,
                    roster: reporterNewsroomRoster(database, now),
                },
                sections: backend.trustedQueries.listReporterSections(),
                publications: reporterPublications.map((publication) => {
                    const { publicationId, authorResidentId, ...facts } = publication;
                    return {
                        ...facts,
                        author: authorResidentId === residentId
                            ? { kind: "self" }
                            : { kind: "resident", farm: publicFarmForResident(database, authorResidentId) },
                    };
                }),
            }
            : {}),
        ...(level === 0 && hasPendingCertificate(database, residentId, career, now)
            ? { workNotice: WORK_NOT_STARTED_MESSAGE }
            : {}),
        options,
    });
}

function reporterPendingDutyStatus(database, residentId, now) {
    const duty = reporterDutyRole(database, residentId, now);
    if (!duty)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这项记者工作当前不属于你的今日排班。");
    const issue = reporterRelayIssue(database, duty.dutyDate);
    const notIssued = !issue ||
        (duty.role === "writer" && issue.status === "selector_pending" &&
            issue.selectorResidentId !== residentId) ||
        (duty.role === "reviewer" &&
            ["selector_pending", "writer_pending", "supplement_pending"].includes(issue.status));
    if (!notIssued)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    const task = REPORTER_DUTY_TASK_LABELS[duty.role];
    if (!task)
        throw new Error("reporter_duty_role_invalid");
    return success(`今日你在报社进行${task}任务，当前具体任务还未发放。届时会通过 bell 向你发放今日任务。`, {
        newsroom: {
            dutyDate: duty.dutyDate,
            role: duty.role,
            taskStatus: "not_issued",
        },
    });
}

function commissionJob(database, backend, jobId, career) {
    const row = database.prepare("SELECT career FROM career_jobs WHERE job_id = ?").get(jobId);
    if (!row || row.career !== career)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    return backend.trustedQueries.getJob(jobId);
}

function parseReporterRelaySubmitOption(internalOption) {
    const matched = /^commission:submit:(.+):relay-(selection|writing|supplement)-(\d+)$/u
        .exec(internalOption);
    if (!matched)
        return null;
    const sequence = Number(matched[3]);
    if (!Number.isSafeInteger(sequence) || sequence < 1)
        return null;
    return { jobId: matched[1], stage: matched[2], sequence };
}

function reporterRelayActionAvailable(database, residentId, internalOption) {
    const relaySubmit = parseReporterRelaySubmitOption(internalOption);
    const submit = relaySubmit ? null : /^commission:submit:(.+)$/u.exec(internalOption);
    const resolve = /^commission:resolve:(.+):(approve|needs_supplement|reject)$/u.exec(internalOption);
    const jobId = relaySubmit?.jobId ?? submit?.[1] ?? resolve?.[1];
    if (!jobId)
        return false;
    const relay = reporterRelayIssueForJob(database, jobId);
    if (!relay)
        return false;
    if (relaySubmit) {
        if (relaySubmit.stage === "selection") {
            const wake = database.prepare(`SELECT 1 FROM career_reporter_relay_wakes
              WHERE issue_reference = ? AND stage = 'selection' AND wake_sequence = ?
                AND recipient_resident_id = ? AND payload_json IS NOT NULL`)
                .get(relay.issueReference, relaySubmit.sequence, residentId);
            return Boolean(wake) && relay.selectorJobId === jobId &&
                relay.status === "selector_pending" && relay.selectorResidentId === residentId;
        }
        return relay.writerJobId === jobId && relay.writerResidentId === residentId &&
            ((relaySubmit.stage === "writing" && relaySubmit.sequence === 1 &&
                relay.status === "writer_pending") ||
            (relaySubmit.stage === "supplement" && relaySubmit.sequence === relay.supplementCount &&
                relay.status === "supplement_pending"));
    }
    if (submit) {
        if (relay.selectorJobId === jobId) {
            return relay.status === "selector_pending" &&
                relay.selectorResidentId === residentId;
        }
        return relay.writerJobId === jobId && relay.writerResidentId === residentId &&
            ["writer_pending", "supplement_pending"].includes(relay.status);
    }
    return relay.reviewerJobId === jobId && relay.reviewerResidentId === residentId &&
        relay.status === "review_pending" &&
        (resolve[2] !== "needs_supplement" || relay.supplementCount === 0);
}

function qualificationLevel(database, residentId, career, now) {
    return database.prepare(`
      SELECT MAX(qualification_level) AS level FROM career_certificates
      WHERE resident_id = ? AND career = ? AND status = 'active'
        AND (effective_at IS NULL OR effective_at <= ?)
    `).get(residentId, career, now).level ?? 0;
}

function hasPendingCertificate(database, residentId, career, now) {
    return Boolean(database.prepare(`
      SELECT 1 FROM career_certificates
      WHERE resident_id = ? AND career = ? AND status = 'active'
        AND effective_at > ?
      LIMIT 1
    `).get(residentId, career, now));
}

function veterinarianTreatmentChargeGold(database, job, workerResidentId, treatment, workerLevel, now) {
    const materialGold = veterinarianTreatmentMaterialGold(job, treatment);
    if (job.ownerResidentId === workerResidentId)
        return materialGold;
    const fullGold = treatmentGold(job, treatment, workerLevel);
    const ownerIsVeterinarian = qualificationLevel(database, job.ownerResidentId, "veterinarian", now) > 0;
    if (!ownerIsVeterinarian)
        return fullGold;
    const baseGold = fullGold - materialGold;
    return materialGold + baseGold * 3 / 4;
}

function serviceCommissionFund(database, jobId) {
    return database.prepare(`SELECT * FROM career_service_commission_funds
      WHERE current_job_id = ?`).get(jobId);
}

function requireReservedServiceCommissionFund(database, job) {
    const fund = serviceCommissionFund(database, job.jobId);
    if (!fund || fund.source_id !== job.sourceId || fund.owner_resident_id !== job.ownerResidentId ||
        fund.state !== "reserved") {
        throw new LingyeBusinessError("CONFLICT", "委托费用没有保持在可结算状态。");
    }
    return fund;
}

function releaseServiceCommissionFund(database, backend, job, actionKey, now) {
    const fund = requireReservedServiceCommissionFund(database, job);
    if (fund.currency === "silver") {
        backend.trustedSystemCommands.releaseSilverEscrow({
            escrowId: fund.reservation_id,
            idempotencyKey: `${actionKey}:silver:release`,
        });
    }
    else {
        backend.trustedSystemCommands.releaseSystemGoldReservation({
            reservationId: fund.reservation_id,
            businessReference: `career-service:${fund.source_id}:base-fee:release`,
            idempotencyKey: `${actionKey}:gold:release`,
        });
    }
    database.prepare(`UPDATE career_service_commission_funds
      SET state = 'released', updated_at = ? WHERE source_id = ? AND state = 'reserved'`)
        .run(now, fund.source_id);
    return fund;
}

function settleServiceCommissionFund(database, backend, job, workerResidentId, actionKey, now) {
    const fund = requireReservedServiceCommissionFund(database, job);
    const settled = fund.currency === "silver"
        ? backend.trustedSystemCommands.settleSilverEscrowToResident({
            escrowId: fund.reservation_id,
            payeeResidentId: workerResidentId,
            idempotencyKey: `${actionKey}:silver:settle`,
        })
        : backend.trustedSystemCommands.settleSystemGoldReservation({
            reservationId: fund.reservation_id,
            businessReference: `career-service:${fund.source_id}:base-fee:settle`,
            idempotencyKey: `${actionKey}:gold:settle`,
        });
    database.prepare(`UPDATE career_service_commission_funds
      SET state = 'settled', updated_at = ? WHERE source_id = ? AND state = 'reserved'`)
        .run(now, fund.source_id);
    return { fund, settled };
}

function bindCommission(database, backend, residentId, job, actionKey) {
    if (job.ownerResidentId === residentId)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "不能承接自己的委托。");
    if (job.assignmentMode !== "accepted")
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    const result = backend.forResident(residentId).acceptOwnJob(job.jobId);
    if (job.career === "reporter") {
        const materialPack = reporterMaterialPackForJob(database, result);
        backend.forResident(residentId).claimReporterMaterialPack({
            packId: materialPack.packId,
            jobId: result.jobId,
            idempotencyKey: `${actionKey}:reporter:claim`,
        });
    }
    if (job.career === "agronomist") {
        const payment = database.prepare("SELECT trade_id, silver_amount FROM career_commission_payments WHERE job_id = ?")
            .get(job.jobId);
        const fund = job.serviceCommission ? requireReservedServiceCommissionFund(database, job) : null;
        if (!payment || (fund && (fund.currency !== "silver" || fund.amount !== payment.silver_amount)))
            throw new LingyeBusinessError("CONFLICT", "农事委托缺少已确认酬劳。");
        if (!job.serviceCommission) {
            const trade = backend.trustedSystemCommands.createTrade({
            payerResidentId: job.ownerResidentId,
            payeeResidentId: residentId,
            currency: "silver",
            amount: payment.silver_amount,
            businessType: "agronomy_commission",
            businessRef: `career-job:${job.jobId}:settlement`,
            idempotencyKey: `${actionKey}:trade:create`,
        });
            backend.forResident(job.ownerResidentId).confirmTrade({ tradeId: trade.trade_id, idempotencyKey: `${actionKey}:trade:owner` });
            backend.forResident(residentId).confirmTrade({ tradeId: trade.trade_id, idempotencyKey: `${actionKey}:trade:worker` });
            database.prepare("UPDATE career_commission_payments SET trade_id = ? WHERE job_id = ? AND (trade_id IS NULL OR trade_id = ?)")
                .run(trade.trade_id, job.jobId, trade.trade_id);
        }
    }
    return result;
}

function crossStoreOperation(database, actionKey) {
    return database.prepare("SELECT * FROM lingye_cross_store_operations WHERE action_key = ?").get(actionKey);
}

function beginCommissionWorldOperation(database, backend, residentId, career, args, sources, actionKey, payloadHash, now) {
    requireStandaloneP3Checkpoint(database);
    return runLingyeWorldTransaction(database, () => {
        const existing = crossStoreOperation(database, actionKey);
        if (existing)
            return existing;
        const match = /^commission:(check|treat):(.+):([^:]+)$/u.exec(args.option);
        if (!match || args.amount !== undefined || args.text !== undefined ||
            !["agronomist", "veterinarian"].includes(career)) {
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        }
        const rows = visibleCommissionRows(database, residentId, career);
        const options = commissionOptions(database, backend, rows, residentId,
            sources.filter((source) => source.career === career), now);
        if (!options.some((entry) => entry.option === args.option)) {
            if (qualificationLevel(database, residentId, career, now) === 0 &&
                hasPendingCertificate(database, residentId, career, now)) {
                throw new LingyeBusinessError("QUALIFICATION_NOT_EFFECTIVE", WORK_NOT_STARTED_MESSAGE);
            }
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        }
        const [, kind, jobId, actionValue] = match;
        const job = commissionJob(database, backend, jobId, career);
        if (job.workerResidentId !== residentId)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托不属于当前从业者。");
        if (job.decisionCount >= 4)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托已经达到四次决策上限。");
        const level = qualificationLevel(database, residentId, career, now);
        const goldAmount = kind === "treat"
            ? job.career === "veterinarian"
                ? veterinarianTreatmentChargeGold(database, job, residentId, actionValue, level, now)
                : treatmentGold(job, actionValue, level)
            : 0;
        const reservation = kind === "treat"
            ? backend.trustedSystemCommands.reserveSystemGold({
                residentId: job.ownerResidentId,
                amount: goldAmount,
                actor: "agent",
                businessReference: `career-job:${job.jobId}:materials:${actionKey}`,
                idempotencyKey: `${actionKey}:reserve`,
            })
            : null;
        database.prepare(`
          INSERT INTO lingye_cross_store_operations (
            action_key, operation_kind, resident_id, career, job_id,
            action_value, option_reference, qualification_level, payload_hash,
            reservation_id, gold_amount, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(actionKey, kind === "check" ? "commission_check" : "commission_treatment",
            residentId, career, jobId, actionValue, args.option, level, payloadHash,
            reservation?.reservation_id ?? null, goldAmount, now, now);
        return crossStoreOperation(database, actionKey);
    });
}

function completeCommissionWorldOperation(database, backend, row, world) {
    return runLingyeWorldTransaction(database, () => {
        const current = crossStoreOperation(database, row.action_key);
        if (current.status === "completed")
            return JSON.parse(current.result_json);
        if (current.status !== "world_applied")
            throw new Error("commission_world_operation_not_applied");
        const job = backend.trustedQueries.getJob(current.job_id);
        if (current.operation_kind === "commission_treatment") {
            backend.trustedSystemCommands.settleSystemGoldReservation({
                reservationId: current.reservation_id,
                businessReference: `career-job:${job.jobId}:materials:${current.action_key}:settle`,
                idempotencyKey: `${current.action_key}:settle`,
            });
        }
        const decision = backend.forResident(current.resident_id).recordOwnJobDecision({
            jobId: job.jobId,
            idempotencyKey: current.action_key,
            kind: current.operation_kind === "commission_check" ? "check" : "treatment",
            optionReference: current.option_reference,
            resultReference: current.operation_kind === "commission_check" ? world.sourceId : current.action_key,
            consumesResources: current.operation_kind === "commission_treatment",
            changesWorld: true,
        });
        let result = decision;
        if (current.operation_kind === "commission_treatment") {
            if (world.resolved !== true) {
                result = backend.trustedQueries.getJob(job.jobId);
            }
            else {
                const completion = {
                    jobId: job.jobId,
                    workerResidentId: current.resident_id,
                    validationPassed: true,
                    worldResultReference: current.action_key,
                };
                if (job.career === "agronomist") {
                    const payment = database.prepare("SELECT trade_id, silver_amount FROM career_commission_payments WHERE job_id = ?")
                        .get(job.jobId);
                    if (job.serviceCommission) {
                        if (!payment)
                            throw new LingyeBusinessError("CONFLICT", "农事委托没有已冻结的银币酬劳。");
                        const serviceSettlement = settleServiceCommissionFund(database, backend,
                            job, current.resident_id, current.action_key, current.created_at);
                        if (serviceSettlement.fund.amount !== payment.silver_amount)
                            throw new LingyeBusinessError("CONFLICT", "农事委托结算金额不一致。");
                        result = backend.trustedSystemCommands.completeJob({
                            ...completion,
                            externalPaymentReference: serviceSettlement.settled.escrowReceipt.receiptId,
                        });
                        backend.trustedSystemCommands.creditFromSystem({
                            residentId: current.resident_id,
                            currency: "gold",
                            amount: AGRONOMY_COMMISSION_REWARD_GOLD[job.difficultyLevel],
                            businessType: "career_agronomy_reward",
                            businessRef: `career-service:${job.sourceId}:agronomy-reward`,
                            idempotencyKey: `${current.action_key}:agronomy-reward`,
                        });
                    }
                    else if (job.assignmentMode === "self" &&
                        job.ownerResidentId === current.resident_id) {
                        result = backend.trustedSystemCommands.completeJob(completion);
                        backend.trustedSystemCommands.creditFromSystem({
                            residentId: current.resident_id,
                            currency: "gold",
                            amount: AGRONOMY_COMMISSION_REWARD_GOLD[job.difficultyLevel],
                            businessType: "career_agronomy_reward",
                            businessRef: `career-self:${job.sourceId}:agronomy-reward`,
                            idempotencyKey: `${current.action_key}:agronomy-reward`,
                        });
                    }
                    else {
                        if (!payment?.trade_id)
                            throw new LingyeBusinessError("CONFLICT", "农事委托没有已冻结的银币酬劳。");
                        result = backend.trustedSystemCommands.completePaidJob({
                            tradeId: payment.trade_id,
                            tradeSettlementIdempotencyKey: `${current.action_key}:trade:settle`,
                            expectedSilverPayment: payment.silver_amount,
                            completion,
                        });
                    }
                }
                else {
                    if (job.serviceCommission) {
                        const serviceSettlement = settleServiceCommissionFund(database, backend,
                            job, current.resident_id, current.action_key, current.created_at);
                        result = backend.trustedSystemCommands.completeJob({
                            ...completion,
                            externalPaymentReference: serviceSettlement.settled.financialReceipt.receiptId,
                        });
                    }
                    else {
                        result = backend.trustedSystemCommands.completeJob(completion);
                    }
                }
            }
        }
        const finalJob = backend.trustedQueries.getJob(job.jobId);
        const response = current.operation_kind === "commission_check"
            ? success("检查已记录。", { result, world })
            : success(
                "处理已完成。",
                { result, world },
                finalJob.status === "completed"
                    ? commissionNotifications("commission_completed", finalJob,
                        `commission-completed:${current.action_key}`,
                        finalJob.career,
                        current.resident_id)
                    : [],
            );
        database.prepare(`
          UPDATE lingye_cross_store_operations
          SET status = 'completed', result_json = ?, updated_at = ?
          WHERE action_key = ? AND status = 'world_applied'
        `).run(JSON.stringify(response), Date.now(), current.action_key);
        database.prepare(`
          INSERT INTO lingye_commission_action_receipts (
            action_key, resident_id, career, payload_hash, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(current.action_key, current.resident_id, current.career,
            current.payload_hash, JSON.stringify(response), current.created_at);
        return response;
    });
}

function resumeCommissionWorldOperation(database, backend, row, afterWorldApplyForTesting) {
    if (row.status === "completed")
        return JSON.parse(row.result_json);
    requireStandaloneP3Checkpoint(database);
    const job = backend.trustedQueries.getJob(row.job_id);
    let world = row.world_result_json ? JSON.parse(row.world_result_json) : null;
    if (!world) {
        world = row.operation_kind === "commission_check"
            ? applyWorldCheck(job, row.action_value, row.action_key, row.payload_hash, row.created_at)
            : applyWorldTreatment(job, row.action_value, row.qualification_level,
                row.action_key, row.payload_hash, row.created_at);
        runLingyeWorldTransaction(database, () => {
            database.prepare(`
              UPDATE lingye_cross_store_operations
              SET status = 'world_applied', world_result_json = ?, updated_at = ?
              WHERE action_key = ? AND status = 'pending'
            `).run(JSON.stringify(world), Date.now(), row.action_key);
        });
    }
    if (afterWorldApplyForTesting)
        afterWorldApplyForTesting(row.action_key);
    return completeCommissionWorldOperation(database, backend,
        crossStoreOperation(database, row.action_key), world);
}

function recoverCommissionWorldOperations(database, backend) {
    const pending = database.prepare(`
      SELECT * FROM lingye_cross_store_operations
      WHERE status IN ('pending', 'world_applied')
      ORDER BY created_at, action_key
    `).all();
    for (const row of pending) {
        try {
            resumeCommissionWorldOperation(database, backend, row);
        }
        catch {
            console.error("[doorbell-lingye] one pending cross-store operation could not be recovered");
        }
    }
}

function resolveSecurity(database, backend, residentId, job, resultKind, args, now) {
    const allowed = job.sourceType === "bank_overdue_notice"
        ? ["bank_system_loan_refusal"]
        : job.sourceType === "farm_interaction_complaint"
            ? ["farm_crop_theft"]
            : job.sourceType === "complaint_review"
                ? ["review_upheld"]
                : [];
    if (!allowed.includes(resultKind) || job.decisionCount < 1)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个治安处理结果当前不可用。");
    const actionKey = idempotencyKey(residentId, `commission:${job.jobId}:resolve`, args);
    const existing = database.prepare("SELECT * FROM career_security_resolutions WHERE job_id = ?").get(job.jobId);
    if (existing && (existing.resident_id !== residentId || existing.result_kind !== resultKind || existing.note !== null))
        throw new LingyeBusinessError("CONFLICT", "这项治安事项已经以另一结果结案。");
    const enforcement = job.sourceType === "bank_overdue_notice"
        ? backend.trustedSystemCommands.catchPunishableSystemLoan({
            loanId: job.objectId,
            caughtBy: "human_constable",
            actorResidentId: residentId,
            caughtAt: now,
        })
        : job.sourceType === "farm_interaction_complaint"
            ? backend.trustedSystemCommands.catchCropTheft({
                sourceId: job.sourceId,
                caughtBy: "human_constable",
                actorResidentId: residentId,
                caughtAt: now,
            })
            : null;
    if (!existing) {
        database.prepare(`
          INSERT INTO career_security_resolutions (
            resolution_id, job_id, resident_id, result_kind, note, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(actionKey, job.jobId, residentId, resultKind, null, now);
    }
    backend.forResident(residentId).recordOwnJobDecision({
        jobId: job.jobId,
        idempotencyKey: actionKey,
        kind: "question",
        optionReference: args.option,
        resultReference: enforcement?.detention?.detentionId ?? actionKey,
        consumesResources: false,
        changesWorld: true,
    });
    const completed = backend.trustedSystemCommands.completeJob({
        jobId: job.jobId,
        workerResidentId: residentId,
        validationPassed: true,
        worldResultReference: enforcement?.detention?.detentionId ?? actionKey,
    });
    return { completed, enforcement };
}

function requireReporterRelayQualification(database, residentId, job, relay, expectedRole, now) {
    if (qualificationLevel(database, residentId, "reporter", now) < job.requiredLevel) {
        throw new LingyeBusinessError("QUALIFICATION_REQUIRED", "当前记者资格不满足这项工作。");
    }
    const duty = database.prepare(`SELECT role.role
      FROM career_reporter_duty_roles AS role
      JOIN career_duty_days AS duty ON duty.duty_id = role.duty_id
      JOIN career_employments AS employment ON employment.employment_id = duty.employment_id
      WHERE role.duty_date = ? AND role.resident_id = ?
        AND duty.status = 'scheduled' AND employment.status = 'active'
        AND employment.availability = 'available'`).get(relay.issueDate, residentId);
    const combinedSelector = expectedRole === "selector" && duty?.role === "writer" &&
        relay.selectorResidentId === residentId && relay.writerResidentId === residentId;
    if (beijingDate(now) !== relay.issueDate || !duty ||
        (duty.role !== expectedRole && !combinedSelector)) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这项记者工作当前不属于你的今日排班。");
    }
}

function submitReporterRelaySelection(database, backend, residentId, job, args, now) {
    const relay = reporterRelayIssueForJob(database, job.jobId);
    if (!relay || relay.selectorJobId !== job.jobId ||
        relay.selectorResidentId !== residentId || relay.status !== "selector_pending" ||
        job.workerResidentId !== residentId || !["accepted", "active"].includes(job.status)) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份选题当前不属于你的排班。");
    }
    requireReporterRelayQualification(database, residentId, job, relay, "selector", now);
    const actionKey = idempotencyKey(residentId, `commission:${job.jobId}:submit`, args);
    backend.forResident(residentId).recordOwnJobDecision({
        jobId: job.jobId,
        idempotencyKey: actionKey,
        kind: "question",
        optionReference: args.option,
        resultReference: `reporter-selection:${relay.issueReference}`,
        consumesResources: false,
        changesWorld: false,
    });
    const wake = beginReporterRelayWriting(database, backend, {
        issueReference: relay.issueReference,
        residentId,
        jobId: job.jobId,
        selectionText: args.text,
        now,
    });
    backend.trustedSystemCommands.completeJob({
        jobId: job.jobId,
        workerResidentId: residentId,
        validationPassed: true,
        worldResultReference: `reporter-selection:${relay.issueReference}`,
    });
    return {
        issueDate: relay.issueDate,
        status: "writer_pending",
        reporter_wake: wake,
    };
}

function selectReporterWorkflow(database, backend, residentId, job, args, now) {
    const role = reporterDutyRole(database, residentId, now);
    const roster = ensureReporterDutyRoles(database, now);
    if (role?.role !== "selector" || roster.length !== 3 ||
        job.workerResidentId !== residentId || job.status !== "active" ||
        job.decisionCount !== 1 || reporterWorkflowForJob(database, job.jobId)) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这条素材当前不能由你选入本期报道。");
    }
    const writer = roster.find((entry) => entry.role === "writer");
    const reviewer = roster.find((entry) => entry.role === "reviewer");
    if (!writer || !reviewer)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "今日日报社三岗排班尚未完整。");
    const materialPack = reporterMaterialPackForJob(database, job);
    if (materialPack.issueReference !== `lingye-daily:${role.dutyDate}`)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这条素材不属于今天的日报周期。");
    const workflowId = `reporter-workflow:${job.jobId}`;
    const writerJobId = `${job.jobId}:writing`;
    const reviewerJobId = `${job.jobId}:reviewing`;
    const selectionKey = idempotencyKey(residentId, `commission:${job.jobId}:select`, args);
    backend.forResident(residentId).recordOwnJobDecision({
        jobId: job.jobId,
        idempotencyKey: selectionKey,
        kind: "question",
        optionReference: args.option,
        resultReference: workflowId,
        consumesResources: false,
        changesWorld: false,
    });
    backend.trustedSystemCommands.completeJob({
        jobId: job.jobId,
        workerResidentId: residentId,
        validationPassed: true,
        worldResultReference: `reporter-selection:${workflowId}`,
    });
    backend.trustedSystemCommands.createJob({
        jobId: writerJobId,
        career: "reporter",
        sourceType: `${job.sourceType}:writing`,
        sourceId: job.sourceId,
        objectType: "reporter_article",
        objectId: `${workflowId}:article`,
        ownerResidentId: null,
        requiredLevel: job.requiredLevel,
        difficultyLevel: job.difficultyLevel,
        assignmentMode: "accepted",
    });
    backend.trustedSystemCommands.acceptJob(writerJobId, writer.residentId);
    backend.forResident(writer.residentId).claimReporterMaterialPack({
        packId: materialPack.packId,
        jobId: writerJobId,
        idempotencyKey: `${selectionKey}:writer:claim`,
    });
    backend.trustedSystemCommands.createJob({
        jobId: reviewerJobId,
        career: "reporter",
        sourceType: `${job.sourceType}:reviewing`,
        sourceId: job.sourceId,
        objectType: "reporter_review",
        objectId: `${workflowId}:review`,
        ownerResidentId: null,
        requiredLevel: job.requiredLevel,
        difficultyLevel: job.difficultyLevel,
        assignmentMode: "accepted",
    });
    backend.trustedSystemCommands.acceptJob(reviewerJobId, reviewer.residentId);
    const workflow = createReporterStoryWorkflow(database, {
        workflowId,
        issueReference: materialPack.issueReference,
        selectorJobId: job.jobId,
        writerJobId,
        reviewerJobId,
        selectorResidentId: residentId,
        writerResidentId: writer.residentId,
        reviewerResidentId: reviewer.residentId,
        now,
    });
    return {
        workflow: {
            workflowId: workflow.workflowId,
            issueReference: workflow.issueReference,
            status: workflow.status,
        },
        newsroom: {
            dutyDate: role.dutyDate,
            roster: reporterNewsroomRoster(database, now),
        },
    };
}

function submitReporter(database, backend, residentId, job, args, now, sectionId = null) {
    const relay = reporterRelayIssueForJob(database, job.jobId);
    if (!relay && job.decisionCount < 1)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份稿件尚未完成来源核对。");
    if (relay)
        requireReporterRelayQualification(database, residentId, job, relay, "writer", now);
    const submissionKey = idempotencyKey(residentId, `commission:${job.jobId}:submit`, args);
    const sourceFacts = commissionSourceFacts(database, job);
    const citations = sourceFacts.materialPack.sourceSnapshot.map((source, citationIndex) => ({
        sourceId: source.sourceId,
        factDigest: source.factDigest,
        citationIndex,
    }));
    const workflow = reporterWorkflowForJob(database, job.jobId);
    if (!workflow || workflow.writerJobId !== job.jobId ||
        workflow.writerResidentId !== residentId ||
        !["selected", "needs_supplement"].includes(workflow.status) ||
        (relay && !["writer_pending", "supplement_pending"].includes(relay.status))) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份稿件当前不属于你的撰稿班次。");
    }
    const parent = workflow.status === "needs_supplement" && workflow.articleId
        ? backend.trustedQueries.getReporterArticle(workflow.articleId)
        : null;
    const numericClaims = [];
    const numericValues = [...args.text.matchAll(/(?<![\p{L}\p{N}.])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?![\p{L}\p{N}.])/gu)]
        .map((match) => Number(match[0]));
    for (const value of numericValues) {
        const source = sourceFacts.sourceFacts.find((candidate) =>
            candidate.allowedNumbers.some((allowed) => Object.is(allowed, value)));
        if (!source)
            throw new LingyeBusinessError("OP_REJECTED", "稿件中的数字缺少对应公开素材依据。");
        numericClaims.push({ sourceId: source.sourceId, value });
    }
    backend.forResident(residentId).recordOwnJobDecision({
        jobId: job.jobId,
        idempotencyKey: submissionKey,
        kind: "question",
        optionReference: args.option,
        resultReference: `reporter-submission:${workflow.workflowId}:${parent ? parent.version + 1 : 1}`,
        consumesResources: false,
        changesWorld: false,
    });
    const article = parent
        ? backend.forResident(residentId).submitReporterSupplement({
            jobId: job.jobId,
            parentArticleId: parent.articleId,
            articleId: `reporter-article:${job.jobId}:v${parent.version + 1}`,
            idempotencyKey: submissionKey,
            articleText: args.text,
            sectionId,
            citations,
            numericClaims,
        })
        : backend.forResident(residentId).submitReporterArticle({
            jobId: job.jobId,
            articleId: `reporter-article:${job.jobId}:v1`,
            idempotencyKey: submissionKey,
            articleText: args.text,
            sectionId,
            citations,
            numericClaims,
        });
    markReporterWorkflowSubmitted(database, {
        workflowId: workflow.workflowId,
        articleId: article.articleId,
        now,
    });
    const wake = relay
        ? markReporterRelayArticle(database, {
            issueReference: relay.issueReference,
            residentId,
            jobId: job.jobId,
            articleId: article.articleId,
            now,
        })
        : null;
    return {
        submissionId: article.articleId,
        articleId: article.articleId,
        status: article.status,
        ...(wake ? { reporter_wake: wake } : {}),
    };
}

function reviewReporterWorkflow(database, backend, residentId, job, decision, args, now) {
    const workflow = reporterWorkflowForJob(database, job.jobId);
    const relay = reporterRelayIssueForJob(database, job.jobId);
    if (!workflow || workflow.reviewerJobId !== job.jobId ||
        workflow.reviewerResidentId !== residentId ||
        workflow.status !== "pending_review" || !workflow.articleId ||
        (relay && relay.status !== "review_pending")) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份稿件当前不在你的审稿班次里。");
    }
    if (relay)
        requireReporterRelayQualification(database, residentId, job, relay, "reviewer", now);
    const reasonCode = decision === "approve"
        ? "hard_checks_passed"
        : decision === "needs_supplement"
            ? "supplement_required"
            : decision === "reject"
                ? "unsupported_claim"
                : null;
    if (!reasonCode)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个审稿结果当前不可用。");
    const actionKey = idempotencyKey(residentId, `commission:${job.jobId}:review`, args);
    const article = backend.trustedSystemCommands.reviewReporterArticle({
        articleId: workflow.articleId,
        decision,
        reasonCode,
        reviewerReference: `resident:${residentId}`,
    });
    backend.forResident(residentId).recordOwnJobDecision({
        jobId: job.jobId,
        idempotencyKey: actionKey,
        kind: "question",
        optionReference: args.option,
        resultReference: `${article.articleId}:${decision}`,
        consumesResources: false,
        changesWorld: decision !== "needs_supplement",
    });
    const reviewed = markReporterWorkflowReviewed(database, {
        workflowId: workflow.workflowId,
        decision,
        now,
    });
    const wake = relay
        ? markReporterRelayReview(database, {
            issueReference: relay.issueReference,
            residentId,
            jobId: job.jobId,
            decision,
            feedback: args.text,
            now,
        })
        : null;
    if (decision === "needs_supplement") {
        return {
            workflow: reviewed,
            articleId: article.articleId,
            status: article.status,
            ...(wake ? { reporter_wake: wake } : {}),
        };
    }
    if (relay && decision === "approve") {
        return {
            workflow: reviewed,
            articleId: article.articleId,
            publication: null,
            status: "ready",
        };
    }
    let publication = null;
    if (decision === "approve") {
        publication = backend.trustedSystemCommands.publishReporterArticle({
            articleId: article.articleId,
            publicationId: `reporter-publication:${article.articleId}`,
        });
        markReporterWorkflowPublished(database, {
            workflowId: workflow.workflowId,
            publicationId: publication.publicationId,
            now,
        });
    }
    else {
        backend.trustedSystemCommands.completeJob({
            jobId: workflow.writerJobId,
            workerResidentId: workflow.writerResidentId,
            validationPassed: true,
            worldResultReference: `reporter-rejected:${article.articleId}`,
        });
    }
    backend.trustedSystemCommands.completeJob({
        jobId: workflow.reviewerJobId,
        workerResidentId: workflow.reviewerResidentId,
        validationPassed: true,
        worldResultReference: decision === "approve"
            ? `reporter-publication-review:${publication.publicationId}`
            : `reporter-rejection-review:${article.articleId}`,
    });
    return {
        workflow: reporterWorkflowForJob(database, job.jobId),
        articleId: article.articleId,
        publication,
        status: decision === "approve" ? "published" : "rejected",
    };
}

function publishPlayerServiceCommission(database, backend, source, publication, actionKey, now) {
    const price = playerServiceCommissionPrice(source);
    const silverEscrowId = `career-service:${createHash("sha256").update(source.sourceId).digest("hex").slice(0, 32)}`;
    const reserved = source.career === "agronomist"
        ? backend.trustedSystemCommands.reserveSilverEscrow({
            payerResidentId: source.ownerResidentId,
            escrowId: silverEscrowId,
            amount: price.laborSilver,
            idempotencyKey: `${actionKey}:labor:reserve`,
        })
        : backend.trustedSystemCommands.reserveSystemGold({
            residentId: source.ownerResidentId,
            amount: price.baseFeeGold,
            actor: "agent",
            businessReference: `career-service:${source.sourceId}:base-fee`,
            idempotencyKey: `${actionKey}:base-fee:reserve`,
        });
    const job = publishBoundSource(database, backend, source, publication, now);
    database.prepare(`INSERT INTO career_service_commission_funds (
      source_id, current_job_id, owner_resident_id, currency, amount,
      reservation_id, reserve_receipt_id, trade_id, state, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', ?, ?)`)
        .run(source.sourceId, job.jobId, source.ownerResidentId,
            source.career === "agronomist" ? "silver" : "gold",
            source.career === "agronomist" ? price.laborSilver : price.baseFeeGold,
            source.career === "agronomist" ? reserved.escrow_id : reserved.reservation_id,
            source.career === "agronomist"
                ? reserved.escrowReceipt.receiptId
                : reserved.financialReceipt.receiptId,
            now, now);
    return job;
}

function commissionChoose(database, backend, residentId, career, args, sources, now = Date.now()) {
    const npc = /^commission:npc:(.+)$/u.exec(args.option);
    if (npc) {
        const settled = database.prepare(`
          SELECT result_json FROM career_npc_service_settlements
          WHERE source_id = ? AND owner_resident_id = ? AND career = ?
        `).get(npc[1], residentId, career);
        if (settled && args.amount === undefined && args.text === undefined) {
            return success("处理已完成。", {
                result: JSON.parse(settled.result_json),
                jobs: mapRows(visibleCommissionRows(database, residentId, career)),
                options: [],
            });
        }
        const actionKey = idempotencyKey(residentId, "commission:npc", args);
        const source = sources.find((entry) => entry.career === career && entry.sourceId === npc[1]) ??
            recoverBoundNpcSource(database, residentId, career, npc[1], actionKey);
        const existingJob = source
            ? database.prepare("SELECT 1 FROM career_jobs WHERE source_type = ? AND source_id = ?")
                .get(source.sourceType, source.sourceId)
            : undefined;
        if (!source || existingJob || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const payloadHash = createHash("sha256").update(JSON.stringify({
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            career: source.career,
            ownerResidentId: source.ownerResidentId,
        })).digest("hex");
        const result = completeNpcFallbackService(database, backend, source, actionKey, payloadHash, now);
        return success("处理已完成。", {
            result,
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: [],
        }, commissionNotifications(
            "commission_completed",
            { ownerResidentId: source.ownerResidentId, workerResidentId: null },
            `commission-completed:${actionKey}`,
            career,
            residentId,
        ));
    }
    const currentRows = visibleCommissionRows(database, residentId, career);
    const currentOptions = commissionOptions(
        database,
        backend,
        currentRows,
        residentId,
        sources.filter((source) => source.career === career),
        now,
    );
    if (career === "reporter" && qualificationLevel(database, residentId, career, now) >= 3)
        currentOptions.unshift(option("commission:section-create", ["text"]));
    if (career === "reporter") {
        for (const publication of backend.trustedQueries
            .listReporterPublicationsForResident({ residentId })
            .filter((entry) => entry.canLike)) {
            currentOptions.push(option(`commission:like:${encodeURIComponent(publication.publicationId)}`));
        }
    }
    const structuredReporterRelay = career === "reporter" &&
        reporterRelayActionAvailable(database, residentId, args.option);
    if (!structuredReporterRelay && !currentOptions.some((entry) => entry.option === args.option)) {
        if (qualificationLevel(database, residentId, career, now) === 0 &&
            hasPendingCertificate(database, residentId, career, now)) {
            throw new LingyeBusinessError("QUALIFICATION_NOT_EFFECTIVE", WORK_NOT_STARTED_MESSAGE);
        }
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    }
    if (args.option === "commission:section-create") {
        if (args.amount !== undefined || typeof args.text !== "string")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "创建日报板块需要填写板块名称。");
        const actionKey = idempotencyKey(residentId, "commission:section-create", args);
        const section = backend.forResident(residentId).createReporterSection({
            sectionId: `reporter-section:${actionKey.slice(-32)}`,
            name: args.text,
        });
        return success(`已开设日报板块「${section.name}」。现在可以向该板块投稿，具体稿件仍须经过日报社审核。`, {
            section,
            sections: backend.trustedQueries.listReporterSections(),
            options: commissionOptions(database, backend,
                visibleCommissionRows(database, residentId, career), residentId, sources, now),
        });
    }
    const reporterLike = /^commission:like:(.+)$/u.exec(args.option);
    if (reporterLike) {
        if (career !== "reporter" || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个点赞 option 当前不可用。");
        const result = backend.forResident(residentId).recordReporterLike({
            publicationId: decodeURIComponent(reporterLike[1]),
        });
        return success("已为这篇日报稿件点赞。", {
            accepted: result.accepted,
            duplicate: result.duplicate,
            validLikes: backend.trustedQueries
                .listReporterPublicationsForResident({ residentId })
                .find((publication) => publication.publicationId ===
                    decodeURIComponent(reporterLike[1]))?.validLikes ?? null,
        });
    }
    const serviceJobs = serviceCommissionJobs(database, now);
    const npcJob = /^commission:npc-job:(.+)$/u.exec(args.option);
    if (npcJob) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const job = commissionJob(database, backend, npcJob[1], career);
        const source = sources.find((entry) => entry.career === career && entry.sourceId === job.sourceId);
        if (!job.serviceCommission || job.ownerResidentId !== residentId || job.status !== "available" || !source)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const actionKey = idempotencyKey(residentId, "commission:npc-job", args);
        const fund = requireReservedServiceCommissionFund(database, job);
        const account = backend.forResident(residentId).getOwnAccount();
        const availableAfterRelease = account.availableGold +
            (fund.currency === "gold" ? fund.amount : 0);
        const requiredGold = npcServiceGold(source);
        if (availableAfterRelease < requiredGold) {
            throw new EconomyError("BALANCE_INSUFFICIENT", {
                currency: "gold",
                available: availableAfterRelease,
                amount: requiredGold,
            });
        }
        releaseServiceCommissionFund(database, backend, job, actionKey, now);
        backend.trustedSystemCommands.cancelJob(job.jobId);
        const payloadHash = createHash("sha256").update(JSON.stringify({
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            career: source.career,
            ownerResidentId: source.ownerResidentId,
        })).digest("hex");
        const result = completeNpcFallbackService(database, backend, source, actionKey, payloadHash, now);
        return success("处理已完成。", { result, jobs: [] });
    }
    const decline = /^commission:decline:(.+)$/u.exec(args.option);
    if (decline) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const job = commissionJob(database, backend, decline[1], career);
        const result = serviceJobs.declineTargetedServiceCommission({
            jobId: decline[1], workerResidentId: residentId,
        });
        return success("委托已登记。", { result }, commissionNotifications(
            "commission_declined", job,
            `commission-declined:${idempotencyKey(residentId, "commission:decline", args)}`,
            career, residentId,
        ));
    }
    const reopen = /^commission:reopen:(.+)$/u.exec(args.option);
    if (reopen) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const result = serviceJobs.configureServiceCommission({
            jobId: reopen[1], ownerResidentId: residentId, audience: "public",
        });
        return success("委托已登记。", { result });
    }
    const retarget = /^commission:retarget:(.+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u.exec(args.option);
    if (retarget) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const result = serviceJobs.configureServiceCommission({
            jobId: retarget[1], ownerResidentId: residentId,
            audience: "targeted", targetResidentId: retarget[2],
        });
        return success("委托已登记。", { result }, commissionNotifications(
            "commission_targeted", { targetResidentId: retarget[2] },
            `commission-targeted:${idempotencyKey(residentId, "commission:retarget", args)}`,
            career, residentId,
        ));
    }
    const npcTransfer = /^commission:npc-transfer:(.+)$/u.exec(args.option);
    if (npcTransfer) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个 NPC 转交 option 当前不可用。");
        const job = commissionJob(database, backend, npcTransfer[1], career);
        if (job.ownerResidentId !== residentId || job.status !== "available" || !job.parentJobId ||
            !["agronomist", "veterinarian"].includes(job.career)) {
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个 NPC 转交 option 当前不可用。");
        }
        const actionKey = idempotencyKey(residentId, "commission:npc-transfer", args);
        const source = sources.find((entry) => entry.career === career && entry.sourceId === job.sourceId) ??
            recoverBoundNpcSource(database, residentId, career, job.sourceId, actionKey);
        if (!source)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个 NPC 转交 option 当前不可用。");
        const payloadHash = createHash("sha256").update(JSON.stringify({
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            career: source.career,
            ownerResidentId: source.ownerResidentId,
            successorJobId: job.jobId,
        })).digest("hex");
        const result = completeNpcFallbackService(database, backend, source, actionKey, payloadHash, now);
        backend.trustedSystemCommands.cancelJob(job.jobId);
        return success("NPC 已完成转交后的保底处理。", {
            result,
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: commissionOptions(database, backend,
                visibleCommissionRows(database, residentId, career), residentId, sources, now),
        }, commissionNotifications(
            "commission_completed",
            { ownerResidentId: source.ownerResidentId, workerResidentId: null },
            `commission-completed:${actionKey}`,
            career,
            residentId,
        ));
    }
    const selfAgronomy = /^commission:self:(.+)$/u.exec(args.option);
    if (selfAgronomy) {
        const source = sources.find((entry) => entry.career === "agronomist" &&
            entry.sourceId === selfAgronomy[1] && entry.ownerResidentId === residentId);
        if (career !== "agronomist" || !source || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个自家农艺 option 当前不可用。");
        const result = startSelfAgronomyWork(database, backend, source);
        return success("已经开始处理自家地块。", {
            result,
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: commissionOptions(database, backend,
                visibleCommissionRows(database, residentId, career), residentId, sources, now),
        });
    }
    const targetedPublish = /^commission:target:(.+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u.exec(args.option);
    if (targetedPublish) {
        const source = sources.find((entry) => entry.career === career && entry.sourceId === targetedPublish[1]);
        if (!source || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个真实来源当前不能发布委托。");
        const result = publishPlayerServiceCommission(database, backend, source, {
            audience: "targeted", targetResidentId: targetedPublish[2],
        }, idempotencyKey(residentId, "commission:publish", args), now);
        return success("委托已登记。", {
            result,
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: commissionOptions(database, backend,
                visibleCommissionRows(database, residentId, career), residentId, sources, now),
        }, commissionNotifications(
            "commission_targeted", { targetResidentId: targetedPublish[2] },
            `commission-targeted:${idempotencyKey(residentId, "commission:publish", args)}`,
            career, residentId,
        ));
    }
    const publish = /^commission:publish:(.+)$/u.exec(args.option);
    if (publish) {
        const source = sources.find((entry) => entry.career === career && entry.sourceId === publish[1]);
        if (!source || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个真实来源当前不能发布委托。");
        const result = ["agronomist", "veterinarian"].includes(source.career)
            ? publishPlayerServiceCommission(database, backend, source,
                { audience: "public" }, idempotencyKey(residentId, "commission:publish", args), now)
            : publishBoundSource(database, backend, source, undefined, now);
        return success("委托已登记。", {
            result,
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: commissionOptions(database, backend, visibleCommissionRows(database, residentId, career), residentId, sources, now),
        });
    }
    const reporterSelection = /^commission:select:(.+)$/u.exec(args.option);
    if (reporterSelection) {
        if (career !== "reporter" || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这条素材当前不能进入选题。");
        const job = commissionJob(database, backend, reporterSelection[1], career);
        return success("这条素材已选入本期，已经交给今日撰稿记者。",
            selectReporterWorkflow(database, backend, residentId, job, args, now));
    }
    const binding = /^commission:(accept):(.+)$/u.exec(args.option);
    const republish = /^commission:republish:(.+)$/u.exec(args.option);
    if (republish) {
        if (!Number.isSafeInteger(args.amount) || args.amount <= 0 || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const job = commissionJob(database, backend, republish[1], career);
        if (job.career !== "agronomist" || job.ownerResidentId !== residentId ||
            !job.parentJobId || job.status !== "available")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        database.prepare(`
          INSERT INTO career_commission_payments (job_id, trade_id, silver_amount, created_at)
          VALUES (?, NULL, ?, ?)
        `).run(job.jobId, args.amount, now);
        return success("委托已登记。", {
            result: backend.trustedQueries.getJob(job.jobId),
            jobs: mapRows(visibleCommissionRows(database, residentId, career)),
            options: commissionOptions(database, backend,
                visibleCommissionRows(database, residentId, career), residentId, sources, now),
        });
    }
    if (binding) {
        if (args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不接受附加参数。");
        const job = commissionJob(database, backend, binding[2], career);
        if (job.assignmentMode !== "accepted")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const result = bindCommission(database, backend, residentId, job, idempotencyKey(residentId, "commission:bind", args));
        return success("委托已接取。", {
            result, jobs: mapRows(visibleCommissionRows(database, residentId, career)), options: [],
        }, commissionNotifications(
            "commission_accepted", job,
            `commission-accepted:${idempotencyKey(residentId, "commission:bind", args)}`,
            career, residentId,
        ));
    }
    const sectionSubmit = /^commission:submit-section:([^:]+):([^:]+):(.+)$/u.exec(args.option);
    if (sectionSubmit) {
        if (career !== "reporter" || args.amount !== undefined || typeof args.text !== "string")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份稿件当前不可提交。");
        const job = commissionJob(database, backend, decodeURIComponent(sectionSubmit[1]), career);
        if (job.workerResidentId !== residentId)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托不属于当前从业者。");
        return success("稿件已进入审核前状态。", submitReporter(
            database,
            backend,
            residentId,
            job,
            args,
            now,
            decodeURIComponent(sectionSubmit[2]),
        ));
    }
    const actionWithValue = /^commission:(check|treat|resolve):(.+):([^:]+)$/u.exec(args.option);
    const actionWithoutValue = /^commission:(transfer|cancel|submit|reply):(.+)$/u.exec(args.option);
    if (!actionWithValue && !actionWithoutValue)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    const kind = (actionWithValue ?? actionWithoutValue)[1];
    const relaySubmit = kind === "submit" ? parseReporterRelaySubmitOption(args.option) : null;
    const jobId = relaySubmit?.jobId ?? (actionWithValue ?? actionWithoutValue)[2];
    const value = actionWithValue?.[3];
    let job = commissionJob(database, backend, jobId, career);
    if (kind === "cancel") {
        if (job.ownerResidentId !== residentId || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
        const cancelKey = idempotencyKey(residentId, "commission:cancel", args);
        if (job.serviceCommission)
            releaseServiceCommissionFund(database, backend, job, cancelKey, now);
        else {
            const payment = database.prepare("SELECT trade_id FROM career_commission_payments WHERE job_id = ?").get(jobId);
            if (payment?.trade_id)
                backend.trustedSystemCommands.cancelTrade({ tradeId: payment.trade_id, idempotencyKey: `${cancelKey}:trade` });
        }
        return success("委托已取消。", { result: backend.trustedSystemCommands.cancelJob(jobId) });
    }
    if (kind === "reply") {
        if (args.amount !== undefined || typeof args.text !== "string")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这条委托回复当前不可发送。");
        const recipientResidentId = job.ownerResidentId === residentId
            ? job.workerResidentId
            : job.workerResidentId === residentId
                ? job.ownerResidentId
                : null;
        if (!recipientResidentId || !["accepted", "assigned", "active"].includes(job.status))
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这条委托回复当前不可发送。");
        const messageId = idempotencyKey(residentId, `commission:${jobId}:reply`, args);
        const existing = database.prepare("SELECT * FROM career_job_messages WHERE message_id = ?").get(messageId);
        if (existing && (existing.job_id !== jobId || existing.sender_resident_id !== residentId ||
            existing.recipient_resident_id !== recipientResidentId || existing.body !== args.text)) {
            throw new LingyeBusinessError("CONFLICT", "这条委托回复已经使用了不同内容。");
        }
        if (!existing) {
            database.prepare(`
              INSERT INTO career_job_messages (
                message_id, job_id, sender_resident_id, recipient_resident_id, body, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).run(messageId, jobId, residentId, recipientResidentId, args.text, now);
        }
        const messages = commissionMessages(database, jobId, residentId);
        return success("委托回复已记录。", {
            message: messages.find((message) => message.messageId === messageId),
            messages,
        }, commissionNotifications(
            "commission_reply",
            { recipientResidentId },
            `commission-reply:${messageId}`,
            career,
            residentId,
            args.text,
        ));
    }
    if (kind === "check" && career === "reporter" && job.status === "available" &&
        reporterDutyRole(database, residentId, now)?.role === "selector" &&
        reporterJobMatchesDuty(database, job, now)) {
        job = backend.trustedSystemCommands.acceptJob(job.jobId, residentId);
    }
    if (job.workerResidentId !== residentId)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托不属于当前从业者。");
    if (kind === "check") {
        if (!value || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个检查 option 当前不可用。");
        if (["agronomist", "veterinarian"].includes(career))
            throw new Error("commission_world_operation_not_routed");
        const actionKey = idempotencyKey(residentId, `commission:${job.jobId}:check`, args);
        const world = { sourceId: job.sourceId, check: value };
        const result = backend.forResident(residentId).recordOwnJobDecision({
            jobId: job.jobId,
            idempotencyKey: actionKey,
            kind: "check",
            optionReference: args.option,
            resultReference: job.sourceId,
            consumesResources: false,
            changesWorld: false,
        });
        return success("检查已记录。", { result, world });
    }
    if (kind === "treat") {
        if (!value || args.amount !== undefined || args.text !== undefined || !["agronomist", "veterinarian"].includes(career))
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个处理 option 当前不可用。");
        throw new Error("commission_world_operation_not_routed");
    }
    if (kind === "transfer") {
        if (value !== undefined || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个转交 option 当前不可用。");
        const key = idempotencyKey(residentId, `commission:${jobId}:transfer`, args);
        const serviceFund = job.serviceCommission
            ? requireReservedServiceCommissionFund(database, job)
            : null;
        if (job.career === "agronomist" && !job.serviceCommission) {
            const payment = database.prepare("SELECT trade_id FROM career_commission_payments WHERE job_id = ?")
                .get(jobId);
            if (!payment?.trade_id)
                throw new LingyeBusinessError("CONFLICT", "农事委托缺少已确认酬劳。");
            backend.trustedSystemCommands.cancelTrade({
                tradeId: payment.trade_id,
                idempotencyKey: `${key}:trade:release`,
            });
        }
        const transferred = backend.forResident(residentId).transferOwnJob({
            jobId,
            successorJobId: `${jobId}:transfer:${key.slice(-12)}`,
            successorSourceId: job.sourceId,
        });
        if (job.serviceCommission) {
            database.prepare(`UPDATE career_service_commission_funds
              SET current_job_id = ?, updated_at = ?
              WHERE source_id = ? AND current_job_id = ? AND state = 'reserved'`)
                .run(transferred.successor.jobId, now, serviceFund.source_id, job.jobId);
            if (job.career === "agronomist") {
                database.prepare(`UPDATE career_commission_payments SET job_id = ? WHERE job_id = ?`)
                    .run(transferred.successor.jobId, job.jobId);
            }
        }
        if (job.career === "veterinarian" && !job.serviceCommission) {
            try {
                transferred.successor = backend.trustedSystemCommands.assignAuthorityJob({
                    jobId: transferred.successor.jobId,
                });
            }
            catch (error) {
                if (!(error instanceof CareerDomainError) ||
                    error.code !== "authoritative_worker_unavailable")
                    throw error;
            }
        }
        return success("委托已转交。", transferred);
    }
    if (kind === "submit" && career === "reporter") {
        if (value !== undefined || args.amount !== undefined || typeof args.text !== "string")
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这份稿件当前不可提交。");
        const relay = reporterRelayIssueForJob(database, job.jobId);
        if (relay?.selectorJobId === job.jobId) {
            return success("这条素材已选入本期，已经交给今日撰稿记者。",
                submitReporterRelaySelection(database, backend, residentId, job, args, now));
        }
        return success("稿件已进入审核前状态。", submitReporter(database, backend, residentId, job, args, now));
    }
    if (kind === "resolve" && career === "reporter") {
        const relay = reporterRelayIssueForJob(database, job.jobId);
        const feedbackRequired = relay && ["needs_supplement", "reject"].includes(value);
        if (!value || args.amount !== undefined ||
            (feedbackRequired ? typeof args.text !== "string" : args.text !== undefined))
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个审稿结果当前不可用。");
        const result = reviewReporterWorkflow(database, backend, residentId, job, value, args, now);
        return success(value === "approve"
            ? "审稿通过，稿件已准备好，等待早上 9 点并入《铃野日报》。"
            : value === "needs_supplement"
                ? "稿件已退回撰稿记者补充。"
                : "稿件未通过审核，本次报道结束。", result);
    }
    if (kind === "resolve" && career === "constable") {
        if (!value || args.amount !== undefined || args.text !== undefined)
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个处理结果当前不可用。");
        const result = resolveSecurity(database, backend, residentId, job, value, args, now);
        return success(
            "治安事项已结案。",
            result,
            commissionNotifications("commission_completed", backend.trustedQueries.getJob(job.jobId),
                `commission-completed:${idempotencyKey(residentId, `commission:${job.jobId}:resolve`, args)}`,
                career,
                residentId),
        );
    }
    throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
}

function commissionAction(database, backend, residentId, career, args, sources, now, afterWorldApplyForTesting) {
    const actionKey = idempotencyKey(residentId, `go.${career}.commission`, args);
    const payloadHash = createHash("sha256")
        .update(JSON.stringify({ args, career, residentId }))
        .digest("hex");
    const existing = database.prepare(`
      SELECT resident_id, career, payload_hash, result_json
      FROM lingye_commission_action_receipts WHERE action_key = ?
    `).get(actionKey);
    if (existing) {
        if (existing.resident_id !== residentId || existing.career !== career ||
            existing.payload_hash !== payloadHash) {
            throw new LingyeBusinessError("CONFLICT", "这个委托操作已经使用了不同参数。");
        }
        return JSON.parse(existing.result_json);
    }
    if (["agronomist", "veterinarian"].includes(career) &&
        /^commission:(check|treat):/u.test(args.option)) {
        const crossStore = crossStoreOperation(database, actionKey) ??
            beginCommissionWorldOperation(database, backend, residentId, career,
                args, sources, actionKey, payloadHash, now);
        if (crossStore.resident_id !== residentId || crossStore.career !== career ||
            crossStore.payload_hash !== payloadHash) {
            throw new LingyeBusinessError("CONFLICT", "这个委托操作已经使用了不同参数。");
        }
        return resumeCommissionWorldOperation(database, backend, crossStore,
            afterWorldApplyForTesting);
    }
    if (/^commission:npc(?::|-job:|-transfer:)/u.test(args.option)) {
        // NPC fallback owns its pending -> world -> final SQL checkpoints.
        // Keeping it inside the generic receipt transaction would roll back
        // the reservation after the world receipt had already been published.
        const response = commissionChoose(database, backend, residentId, career, args, sources, now);
        return runLingyeWorldTransaction(database, () => {
            database.prepare(`
              INSERT INTO lingye_commission_action_receipts (
                action_key, resident_id, career, payload_hash, result_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).run(actionKey, residentId, career, payloadHash, JSON.stringify(response), now);
            return response;
        });
    }
    return runLingyeWorldTransaction(database, () => {
        const response = commissionChoose(database, backend, residentId, career, args, sources, now);
        database.prepare(`
          INSERT INTO lingye_commission_action_receipts (
            action_key, resident_id, career, payload_hash, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(actionKey, residentId, career, payloadHash, JSON.stringify(response), now);
        return response;
    });
}

function mapDomainError(error) {
    if (error instanceof LingyeBusinessError)
        return failure(error.code, error.message);
    if (error instanceof EconomyError) {
        if (["BALANCE_INSUFFICIENT", "SILVER_LOCKED"].includes(error.code))
            return failure("INSUFFICIENT_FUNDS", INSUFFICIENT_FUNDS_MESSAGE);
        if (["ACCOUNT_NOT_FOUND", "RESIDENT_NOT_FOUND", "CREDIT_RULE_NOT_CONFIGURED", "DAILY_LIMIT_NOT_CONFIGURED"].includes(error.code))
            return failure("LINGYE_NOT_READY", "铃野经济账户或规则尚未完成配置。");
        if (["DEPOSIT_NOT_FOUND", "LOAN_NOT_FOUND", "TRADE_NOT_FOUND"].includes(error.code))
            return failure("REFERENCE_NOT_FOUND", "没有找到对应的银行记录。");
        if (error.code === "IDEMPOTENCY_CONFLICT")
            return failure("CONFLICT", "这个 option 已经以不同参数执行过。");
        return failure("OP_REJECTED", "银行拒绝了本次操作。");
    }
    if (error instanceof SecurityDomainError) {
        if (["detention_not_found", "security_source_not_found"].includes(error.code))
            return failure("REFERENCE_NOT_FOUND", "没有找到对应的治安记录。");
        if (error.code.includes("idempotency") || error.code.includes("conflict"))
            return failure("CONFLICT", "当前治安记录与本次操作发生冲突。");
        return failure("OP_REJECTED", "治安系统拒绝了本次操作。");
    }
    if (error instanceof CareerDomainError) {
        if (error.code === "qualification_not_effective")
            return failure("QUALIFICATION_NOT_EFFECTIVE", WORK_NOT_STARTED_MESSAGE);
        if (error.code === "constable_recent_theft_record")
            return failure("OP_REJECTED", "最近 3 天有偷窃记录，暂时不能报名治安官资格考试。");
        if (["active_certificate_required", "qualification_level_insufficient", "qualification_required"].includes(error.code))
            return failure("QUALIFICATION_REQUIRED", "当前职业资格不满足这项操作。");
        if (["job_not_found", "employment_not_found", "duty_day_not_found", "exam_attempt_not_found"].includes(error.code))
            return failure("REFERENCE_NOT_FOUND", "没有找到对应的职业记录。");
        if (error.code.includes("conflict") || error.code.includes("idempotency"))
            return failure("CONFLICT", "当前职业记录与本次操作发生冲突。");
        if (["job_not_bindable", "career_job_capacity_reached", "active_duty_required", "institution_full"].includes(error.code))
            return failure("OPTION_NOT_AVAILABLE", "这个职业 option 当前不可用。");
        return failure("OP_REJECTED", "职业系统拒绝了本次操作。");
    }
    if (error instanceof Error && /^(agronomy|animal|commission|p3_world)_/u.test(error.message)) {
        if (error.message.includes("qualification"))
            return failure("QUALIFICATION_REQUIRED", "当前职业资格不满足这项操作。");
        if (error.message.includes("not_available") || error.message.includes("required"))
            return failure("OPTION_NOT_AVAILABLE", "这个职业 option 当前不可用。");
        if (error.message.includes("conflict"))
            return failure("CONFLICT", "当前职业记录与本次操作发生冲突。");
        return failure("OP_REJECTED", "职业系统拒绝了本次操作。");
    }
    return null;
}

export function createLingyeActionExecutor(options) {
    const { database, backend } = options;
    const economyRules = options.economyRules ?? DEFAULT_ECONOMY_RULES;
    const now = options.now ?? Date.now;
    recoverPendingNpcFallbackServices(database, backend);
    recoverCommissionWorldOperations(database, backend);
    return Object.freeze({
        execute(input) {
            validateArgs(input.op, input.args);
            const identity = database.prepare(`
              SELECT resident_id, binding_reference FROM residents WHERE resident_id = ?
            `).get(input.residentId);
            if (!identity || identity.binding_reference !== input.bindingReference)
                return failure("LINGYE_NOT_READY", "铃野居民身份或经济账户尚未完成迁移。");
            try {
                backend.forResident(input.residentId).getOwnAccount();
                const actionNow = now();
                const args = resolveOptionHandle(database, input.residentId, input.op, input.args);
                const detained = activeResidentDetentions(backend, input.residentId, actionNow).length > 0;
                let result;
                if (input.op === "go.bank.view")
                    result = detained
                        ? detainedBankView(database, backend, economyRules, input.residentId, args)
                        : bankView(database, backend, economyRules, input.residentId, args);
                else if (input.op === "go.bank.choose") {
                    if (detained && parseBankOption(args.option)?.action !== "system-loan-repay")
                        return failure("RESIDENT_DETAINED", "RESIDENT_DETAINED");
                    result = bankChoose(database, backend, economyRules, input.residentId, args);
                }
                else if (input.op === "go.security.commission" && Object.hasOwn(args, "option") &&
                    args.option.startsWith("security:release:"))
                    result = securityRelease(database, backend, input.residentId, args, actionNow);
                else if (detained && input.op !== "go.security.commission")
                    return failure("RESIDENT_DETAINED", "RESIDENT_DETAINED");
                else if (input.op === "go.school.view")
                    result = schoolView(database, backend, input.residentId, actionNow, args);
                else if (input.op === "go.school.choose")
                    result = schoolChoose(database, backend, input.residentId, actionNow, args);
                if (result !== undefined)
                    return publicLingyeResult(database, input.residentId, input.op, result, actionNow);
                const career = COMMISSION_CAREERS[input.op];
                syncAuthorityJobs(database, backend, actionNow);
                const sources = input.farm
                    ? boundFarmSources(database, input.farm, input.residentId)
                    : [];
                if (input.op === "go.security.commission" && !Object.hasOwn(args, "option"))
                    result = securityCommissionView(database, backend, input.residentId, args,
                        sources, actionNow, detained);
                else if (detained)
                    return failure("RESIDENT_DETAINED", "RESIDENT_DETAINED");
                else if (input.op === "go.farm.commission") {
                    if (Object.hasOwn(args, "option")) {
                        const chefResult = farmChefCommissionAction(
                            database,
                            backend,
                            input.residentId,
                            args,
                            input.farm,
                            actionNow,
                        );
                        if (chefResult)
                            result = chefResult;
                        else
                            result = commissionAction(database, backend, input.residentId, "agronomist", args,
                                sources, actionNow, options.afterWorldApplyForTesting);
                    }
                    else {
                        result = farmCommissionView(database, backend, input.residentId, args, sources, input.farm, actionNow);
                    }
                }
                else if (Object.hasOwn(args, "option")) {
                    result = commissionAction(database, backend, input.residentId, career, args,
                        sources, actionNow, options.afterWorldApplyForTesting);
                }
                else if (input.op === "go.newsroom.commission") {
                    result = reporterPendingDutyStatus(database, input.residentId, actionNow);
                }
                else {
                    result = commissionView(database, backend, input.residentId, career, args, sources, actionNow);
                }
                return publicLingyeResult(database, input.residentId, input.op, result, actionNow);
            }
            catch (error) {
                if (options.rethrowDomainErrorsForTesting === true)
                    throw error;
                const mapped = mapDomainError(error);
                if (mapped)
                    return mapped;
                throw error;
            }
        },
    });
}

export function lingyeRuntimeReadiness(economyRules) {
    const catalog = curriculumCatalogAvailability();
    const publicReadyLevels = [];
    const privateReadyLevels = [];
    for (const career of CAREER_IDS) {
        for (const level of QUALIFICATION_LEVELS) {
            const entry = catalog[career];
            const coursesReady = [1, 2, 3].every((courseIndex) =>
                entry?.courses.some((course) => course.level === level && course.courseIndex === courseIndex && course.available));
            const publicExamReady = entry?.exams.some((exam) => exam.level === level && exam.available) === true;
            if (coursesReady && publicExamReady)
                publicReadyLevels.push({ career, level });
            if (careerExamAvailability(career, level)) {
                privateReadyLevels.push({
                    career,
                    level,
                    question_count: EXAM_QUESTION_COUNT,
                    pass_count: EXAM_PASS_COUNT,
                });
            }
        }
    }
    const missing = [];
    if (publicReadyLevels.length === 0)
        missing.push("public_career_content");
    const publicKeys = new Set(publicReadyLevels.map((entry) => `${entry.career}:${entry.level}`));
    const privateKeys = new Set(privateReadyLevels.map((entry) => `${entry.career}:${entry.level}`));
    if (publicKeys.size !== privateKeys.size ||
        [...publicKeys].some((key) => !privateKeys.has(key)))
        missing.push("private_exam_bank");
    if ([...REQUIRED_EXAM_LEVELS].some((key) => !publicKeys.has(key) || !privateKeys.has(key)))
        missing.push("required_exam_levels");
    const ruleEntries = [
        ["minimum_system_loan_credit_days", economyRules?.minimumSystemLoanCreditDays],
        ["restricted_daily_gold_limit", economyRules?.restrictedDailyGoldLimit],
        ["restricted_daily_silver_limit", economyRules?.restrictedDailySilverLimit],
    ];
    for (const [name, value] of ruleEntries) {
        if (!Number.isSafeInteger(value) || value <= 0)
            missing.push(name);
    }
    const rawNature = natureRuntimeReadiness();
    const natureRuntime = {
        adapter_version: rawNature.adapterVersion,
        configured: rawNature.configured,
        ready: rawNature.ready,
        status: rawNature.status,
        ...(rawNature.activationDate === undefined ? {} : { activation_date: rawNature.activationDate }),
        ...(rawNature.activationDay === undefined ? {} : { activation_day: rawNature.activationDay }),
        ...(rawNature.persistedStatus === undefined ? {} : { persisted_status: rawNature.persistedStatus }),
        ...(rawNature.errorCode === undefined ? {} : { error_code: rawNature.errorCode }),
    };
    if (!natureRuntime.ready)
        missing.push("nature_runtime");
    return {
        ok: true,
        schema_version: LINGYE_READINESS_SCHEMA_VERSION,
        ready: missing.length === 0,
        operations: [...LINGYE_OPERATIONS],
        exams: {
            public_ready_levels: publicReadyLevels,
            private_ready_levels: privateReadyLevels,
        },
        economy_rules: {
            minimum_system_loan_credit_days: economyRules?.minimumSystemLoanCreditDays ?? null,
            restricted_daily_gold_limit: economyRules?.restrictedDailyGoldLimit ?? null,
            restricted_daily_silver_limit: economyRules?.restrictedDailySilverLimit ?? null,
        },
        capabilities: LINGYE_CAPABILITIES,
        nature_runtime: natureRuntime,
        missing,
    };
}

export function handleDoorbellLingyeReadiness(req, res, method, runtime) {
    if (!DOORBELL_SERVICE_TOKEN)
        return internalServiceError(res, 503, "service_not_configured", "Doorbell farm service is not configured");
    if (!serviceTokenMatches(req.headers.authorization))
        return internalServiceError(res, 401, "authentication_required", "A valid Doorbell service credential is required");
    if (method !== "GET")
        return internalServiceError(res, 405, "method_not_allowed", "Use GET for this service endpoint");
    return jsonOut(res, 200, lingyeRuntimeReadiness(runtime?.economyRules));
}

let defaultExecutor;
function getDefaultExecutor() {
    if (defaultExecutor)
        return defaultExecutor;
    const database = openLingyeWorldDatabase();
    const backend = createLingyeWorldBackend(database, {
        economyRules: DEFAULT_ECONOMY_RULES,
        constableExamEligibility: (residentId, now) => constableExamTheftEligibility(database, residentId, now),
    });
    defaultExecutor = createLingyeActionExecutor({ database, backend, economyRules: DEFAULT_ECONOMY_RULES });
    return defaultExecutor;
}

export async function handleDoorbellLingyeAction(req, res, method, injectedExecutor) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        const allowed = ["resident_id", "farm_human_key", "expected_farm_doorplate", "op", "args"];
        if (keys.length !== allowed.length || allowed.some((key) => !keys.includes(key)) ||
            !UUID_RE.test(String(body?.resident_id ?? "")) || !LINGYE_OPERATIONS.has(body?.op) ||
            !isPlainObject(body?.args)) {
            return internalServiceError(res, 400, "invalid_request", "Submit one valid Lingye action request");
        }
        validateArgs(body.op, body.args);
        const binding = validateFarmBinding(body);
        if (binding.error)
            return internalServiceError(res, binding.error.status, binding.error.code, binding.error.message);
        if (!legacyAgentAccessRevoked(binding.farm))
            return internalServiceError(res, 409, "farm_migration_required", "Legacy farm access must be revoked before Lingye execution is enabled");
        const bindingReference = binding.farm.doorbellMcpMigration?.migrationId;
        if (!bindingReference)
            return internalServiceError(res, 409, "farm_migration_required", "The farm migration reference is unavailable");
        const executor = injectedExecutor ?? getDefaultExecutor();
        const result = executor.execute({
            residentId: body.resident_id,
            bindingReference,
            farm: binding.farm,
            op: body.op,
            args: body.args,
        });
        return jsonOut(res, 200, result);
    }
    catch (error) {
        if (error instanceof LingyeActionInputError || error instanceof PublicSyncError)
            return internalServiceError(res, error.status === 413 ? 413 : 400, "invalid_request", "The Lingye action request is invalid");
        console.error("[doorbell-lingye] action failed");
        return internalServiceError(res, 503, "lingye_unavailable", "The Lingye action service is unavailable");
    }
}
