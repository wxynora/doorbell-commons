import { createHash } from "node:crypto";
import { CareerDomainError, CAREER_IDS, CAREER_INSTITUTION } from "../../career/contracts.js";
import { EconomyError } from "../../economy/economy-errors.js";
import {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
} from "../../lingye-world-database.js";
import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    UUID_RE,
    internalServiceError,
    isPlainObject,
    legacyAgentAccessRevoked,
    requireDoorbellService,
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

const COMMISSION_CAREERS = Object.freeze({
    "go.farm.commission": "agronomist",
    "go.hospital.commission": "veterinarian",
    "go.newsroom.commission": "reporter",
    "go.security.commission": "constable",
});

const BANK_SECTIONS = new Set(["account", "deposits", "exchange", "loans", "credit"]);
const SCHOOL_SECTIONS = new Set(["careers", "courses", "exams", "certificates", "employment"]);
const TERM_DAYS = new Set([14, 30, 60]);
const INSUFFICIENT_FUNDS_MESSAGE = "可用余额不足，本次操作没有执行。";
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

// Rich model-visible result copy is reviewed separately. Until then, the endpoint
// exposes only the approved structured facts, stable codes and the one locked error.
const success = (_text, data) => ({ ok: true, text: "OK", data });
const failure = (code, _message) => ({
    ok: false,
    error: {
        code,
        message: code === "INSUFFICIENT_FUNDS" ? INSUFFICIENT_FUNDS_MESSAGE : code,
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
                args.answers.some((answer) => typeof answer !== "string" || answer.trim().length === 0)) {
                throw new LingyeActionInputError("answers must contain five or twenty non-empty strings");
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

function option(option, requires = []) {
    return requires.length === 0 ? { option } : { option, requires };
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

function idempotencyKey(residentId, op, args) {
    const digest = createHash("sha256").update(JSON.stringify([residentId, op, args])).digest("hex");
    return `doorbell:${digest}`;
}

function commandExists(database, key) {
    return database.prepare("SELECT 1 FROM economy_commands WHERE idempotency_key = ?").get(key) !== undefined;
}

function readBankFacts(database, backend, rules, residentId) {
    const account = backend.queries.getAccount(residentId);
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
    const playerLoans = mapRows(database.prepare(`
      SELECT loan_id, lender_resident_id, borrower_resident_id, principal_original,
             principal_outstanding, accrued_interest, total_rate_ppm, term_days,
             status, created_at, repaid_at
      FROM economy_player_loans
      WHERE lender_resident_id = ? OR borrower_resident_id = ?
      ORDER BY created_at DESC, loan_id
    `).all(residentId, residentId));
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

function requireCurrentBankOption(database, residentId, parsed, key) {
    if (parsed.revision !== bankRevision(database, residentId) && !commandExists(database, key))
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 已经不是当前状态。");
}

function bankChoose(database, backend, rules, residentId, args) {
    const parsed = parseBankOption(args.option);
    if (!parsed || args.to !== undefined)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 当前不可用。");
    const key = idempotencyKey(residentId, "go.bank.choose", args);
    requireCurrentBankOption(database, residentId, parsed, key);
    const command = backend.trustedSystemCommands;
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
            result = command.closeTermDeposit({ depositId: parsed.reference, idempotencyKey: key });
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
            result = command.repaySystemLoan({ loanId: parsed.reference, amount: args.amount, idempotencyKey: key });
            break;
        case "silver-lock-increase":
            assertPositiveInteger(args.amount, "amount");
            result = command.setSilverAgentLock({ residentId, amount: args.amount, actor: "agent", idempotencyKey: key });
            break;
        default:
            throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个银行 option 当前不可用。");
    }
    return success("银行业务已办理。", {
        result,
        current: readBankFacts(database, backend, rules, residentId),
    });
}

function readSchoolFacts(database, residentId) {
    const tracks = mapRows(database.prepare(`
      SELECT career, track_order, selected_at FROM career_tracks
      WHERE resident_id = ? ORDER BY track_order
    `).all(residentId));
    const courses = mapRows(database.prepare(`
      SELECT career, qualification_level, course_index, enrolled_at,
             content_read_at, completed_at, best_correct_answers
      FROM career_courses WHERE resident_id = ?
      ORDER BY career, qualification_level, course_index
    `).all(residentId));
    const exams = mapRows(database.prepare(`
      SELECT attempt_id, career, qualification_level, scheduled_at,
             registration_status, correct_answers, registered_at, started_at, ended_at
      FROM career_exam_attempts WHERE resident_id = ?
      ORDER BY registered_at DESC, attempt_id
    `).all(residentId));
    const certificates = mapRows(database.prepare(`
      SELECT career, qualification_level, status, source_attempt_id,
             issued_at, effective_at
      FROM career_certificates WHERE resident_id = ?
      ORDER BY career, qualification_level
    `).all(residentId));
    const employment = mapRows(database.prepare(`
      SELECT employment_id, career, institution, seat_number, status,
             availability, hired_at, ended_at
      FROM career_employments WHERE resident_id = ?
      ORDER BY hired_at DESC, employment_id
    `).all(residentId));
    const duties = mapRows(database.prepare(`
      SELECT duty_id, employment_id, career, institution, duty_date,
             qualification_level, base_wage_gold, status, performance_units,
             performance_gold, generated_at, settled_at
      FROM career_duty_days WHERE resident_id = ?
      ORDER BY duty_date DESC, duty_id
    `).all(residentId));
    const options = [];
    if (tracks.length === 0) {
        for (const career of CAREER_IDS)
            options.push(option(`school:career-select:${career}`));
    }
    else if (tracks.length === 1) {
        const primary = tracks[0];
        const primaryLevel = Math.max(0, ...certificates
            .filter((certificate) => certificate.career === primary.career && certificate.status === "active")
            .map((certificate) => certificate.qualificationLevel));
        if (primaryLevel >= 3) {
            for (const career of CAREER_IDS.filter((candidate) => candidate !== primary.career))
                options.push(option(`school:career-select:${career}`));
        }
    }
    const activeEmployment = employment.find((item) => item.status === "active");
    if (!activeEmployment) {
        for (const career of ["reporter", "veterinarian", "constable"]) {
            const qualified = certificates.some((certificate) => certificate.career === career &&
                certificate.qualificationLevel >= 1 && certificate.status === "active");
            if (!qualified)
                continue;
            const institution = CAREER_INSTITUTION[career];
            const occupied = database.prepare(`
              SELECT COUNT(*) AS count FROM career_employments
              WHERE institution = ? AND status = 'active'
            `).get(institution).count;
            if (occupied < 2)
                options.push(option(`school:employment-hire:${career}`));
        }
    }
    else {
        if (activeEmployment.availability === "available")
            options.push(option(`school:employment-leave:${activeEmployment.employmentId}`));
        if (activeEmployment.availability === "leave")
            options.push(option(`school:employment-resume:${activeEmployment.employmentId}`));
        options.push(option(`school:employment-end:${activeEmployment.employmentId}`));
    }
    return {
        careers: tracks,
        courses,
        exams,
        certificates,
        employment: { records: employment, duties },
        options,
        contentSources: { courseContentAvailable: false, examQuestionBankAvailable: false },
    };
}

function schoolReference(facts, reference) {
    const candidates = [
        ...facts.courses.map((value) => ({ type: "course", value })),
        ...facts.exams.map((value) => ({ type: "exam", value })),
        ...facts.certificates.map((value) => ({ type: "certificate", value })),
        ...facts.employment.records.map((value) => ({ type: "employment", value })),
        ...facts.employment.duties.map((value) => ({ type: "duty_day", value })),
    ];
    const item = candidates.find(({ value }) => [
        value.attemptId,
        value.employmentId,
        value.dutyId,
        value.sourceAttemptId,
        value.career && value.qualificationLevel
            ? `${value.career}:${value.qualificationLevel}:${value.courseIndex ?? "certificate"}`
            : null,
    ].includes(reference));
    if (!item)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到这条职业学校记录。");
    return item;
}

function schoolView(database, residentId, args) {
    const facts = readSchoolFacts(database, residentId);
    if (args.reference)
        return success("已读取职业学校记录。", { reference: schoolReference(facts, args.reference), options: facts.options });
    const section = args.section ?? null;
    return success("已读取职业学校当前事实。", section === null
        ? facts
        : { section, value: facts[section], options: facts.options, contentSources: facts.contentSources });
}

function schoolChoose(database, backend, residentId, args) {
    if (Object.hasOwn(args, "answers"))
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "当前没有可作答的真实课程练习或考试。");
    const current = readSchoolFacts(database, residentId);
    if (!current.options.some((entry) => entry.option === args.option))
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个职业学校 option 当前不可用。");
    let result;
    const careerMatch = /^school:career-select:(chef|agronomist|veterinarian|reporter|constable)$/u.exec(args.option);
    const hireMatch = /^school:employment-hire:(reporter|veterinarian|constable)$/u.exec(args.option);
    const availabilityMatch = /^school:employment-(leave|resume|end):(.+)$/u.exec(args.option);
    if (careerMatch) {
        result = backend.trustedSystemCommands.selectCareer(residentId, careerMatch[1]);
    }
    else if (hireMatch) {
        const career = hireMatch[1];
        result = backend.trustedSystemCommands.hire({
            employmentId: `doorbell-employment:${residentId}:${career}`,
            residentId,
            career,
            institution: CAREER_INSTITUTION[career],
        });
    }
    else if (availabilityMatch) {
        const [, action, employmentId] = availabilityMatch;
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
    return success("职业学校业务已办理。", {
        result,
        current: readSchoolFacts(database, residentId),
    });
}

function visibleCommissionRows(database, residentId, career) {
    return database.prepare(`
      SELECT * FROM career_jobs
      WHERE career = ? AND (
        worker_resident_id = ?
        OR owner_resident_id = ?
        OR (status = 'available' AND assignment_mode = 'accepted')
      )
      ORDER BY updated_at DESC, job_id
    `).all(career, residentId, residentId);
}

function commissionOptions(rows, residentId) {
    return rows
        .filter((job) => job.status === "available" && job.assignment_mode === "accepted")
        .map((job) => option(`commission:accept:${job.job_id}`));
}

function commissionView(database, residentId, career, args) {
    const rows = visibleCommissionRows(database, residentId, career);
    const selected = args.reference === undefined
        ? rows
        : rows.filter((row) => row.job_id === args.reference);
    if (args.reference !== undefined && selected.length === 0)
        throw new LingyeBusinessError("REFERENCE_NOT_FOUND", "没有找到这条真实委托。");
    return success("已读取当前真实委托。", {
        jobs: mapRows(selected),
        options: commissionOptions(selected, residentId),
    });
}

function commissionChoose(database, backend, residentId, career, args) {
    if (args.amount !== undefined || args.text !== undefined)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不接受附加参数。");
    const match = /^commission:accept:(.+)$/u.exec(args.option);
    if (!match)
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    const job = database.prepare("SELECT * FROM career_jobs WHERE job_id = ?").get(match[1]);
    if (!job || job.career !== career || job.assignment_mode !== "accepted" ||
        !["available", "accepted"].includes(job.status) ||
        (job.status === "accepted" && job.worker_resident_id !== residentId)) {
        throw new LingyeBusinessError("OPTION_NOT_AVAILABLE", "这个委托 option 当前不可用。");
    }
    const result = backend.trustedSystemCommands.acceptJob(job.job_id, residentId);
    return success("委托已接取。", {
        result,
        jobs: mapRows(visibleCommissionRows(database, residentId, career)),
        options: [],
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
    if (error instanceof CareerDomainError) {
        if (["active_certificate_required", "qualification_level_insufficient"].includes(error.code))
            return failure("QUALIFICATION_REQUIRED", "当前职业资格不满足这项操作。");
        if (["job_not_found", "employment_not_found", "duty_day_not_found", "exam_attempt_not_found"].includes(error.code))
            return failure("REFERENCE_NOT_FOUND", "没有找到对应的职业记录。");
        if (error.code.includes("conflict") || error.code.includes("idempotency"))
            return failure("CONFLICT", "当前职业记录与本次操作发生冲突。");
        if (["job_not_bindable", "career_job_capacity_reached", "active_duty_required", "institution_full"].includes(error.code))
            return failure("OPTION_NOT_AVAILABLE", "这个职业 option 当前不可用。");
        return failure("OP_REJECTED", "职业系统拒绝了本次操作。");
    }
    return null;
}

export function createLingyeActionExecutor(options) {
    const { database, backend } = options;
    const economyRules = options.economyRules ?? DEFAULT_ECONOMY_RULES;
    return Object.freeze({
        execute(input) {
            validateArgs(input.op, input.args);
            const identity = database.prepare(`
              SELECT resident_id, binding_reference FROM residents WHERE resident_id = ?
            `).get(input.residentId);
            if (!identity || identity.binding_reference !== input.bindingReference)
                return failure("LINGYE_NOT_READY", "铃野居民身份或经济账户尚未完成迁移。");
            try {
                backend.queries.getAccount(input.residentId);
                if (input.op === "go.bank.view")
                    return bankView(database, backend, economyRules, input.residentId, input.args);
                if (input.op === "go.bank.choose")
                    return bankChoose(database, backend, economyRules, input.residentId, input.args);
                if (input.op === "go.school.view")
                    return schoolView(database, input.residentId, input.args);
                if (input.op === "go.school.choose")
                    return schoolChoose(database, backend, input.residentId, input.args);
                const career = COMMISSION_CAREERS[input.op];
                if (Object.hasOwn(input.args, "option"))
                    return commissionChoose(database, backend, input.residentId, career, input.args);
                return commissionView(database, input.residentId, career, input.args);
            }
            catch (error) {
                const mapped = mapDomainError(error);
                if (mapped)
                    return mapped;
                throw error;
            }
        },
    });
}

let defaultExecutor;
function getDefaultExecutor() {
    if (defaultExecutor)
        return defaultExecutor;
    const database = openLingyeWorldDatabase();
    const backend = createLingyeWorldBackend(database, { economyRules: DEFAULT_ECONOMY_RULES });
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
