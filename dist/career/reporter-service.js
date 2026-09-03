import { createHash } from "node:crypto";
import { CareerDomainError, PERFORMANCE_PAY_GOLD } from "./contracts.js";
import { recordFinancialReceipt, runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
import { reporterPublicationCredits } from "./reporter-newsroom-service.js";

export const REPORTER_SOURCE_TYPES = Object.freeze([
    "public_farm_fact",
    "public_farm_snapshot",
    "public_farm_ranking",
    "public_event_fact",
    "public_weather_fact",
    "public_disaster_fact",
    "public_submission",
    "public_institution_fact",
]);

export const REPORTER_MAX_SOURCE_FACTS = Object.freeze({
    1: 3,
    2: 6,
    3: 12,
    4: 20,
});

export const REPORTER_MAX_ARTICLES_PER_ISSUE = Object.freeze({
    1: 1,
    2: 1,
    3: 2,
    4: 3,
});

import { reporterEvaluationClosesAt } from "./reporter-evaluation-window.js";

export const REPORTER_EVALUATION_WINDOW_MS = 48 * 60 * 60 * 1_000;

export const REPORTER_REVIEW_DECISIONS = Object.freeze([
    "approve",
    "reject",
    "needs_supplement",
]);

export const REPORTER_REVIEW_REASON_CODES = Object.freeze([
    "hard_checks_passed",
    "source_missing",
    "source_revision",
    "time_inconsistent",
    "public_scope",
    "numeric_inconsistent",
    "format_incomplete",
    "supplement_required",
    "unsupported_claim",
]);

const REPORTER_JOB_STATUSES = new Set(["accepted", "active", "completed"]);
const PUBLICATION_STATUSES = new Set(["open", "closed", "superseded"]);

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("reporter_database_required");
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`reporter_invalid_${field}`);
    return value;
}

function optionalIdentifier(value, field) {
    if (value === undefined || value === null)
        return null;
    return identifier(value, field);
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`reporter_invalid_${field}`);
    return value;
}

function nowOf(input) {
    return timestamp(input?.now ?? Date.now(), "timestamp");
}

function level(value, field = "level") {
    if (!Number.isSafeInteger(value) || value < 1 || value > 4)
        fail(`reporter_invalid_${field}`);
    return value;
}

function plainRecord(value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value))
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
        return `[${value.map((item) => canonical(item)).join(",")}]`;
    if (typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("reporter_invalid_json");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("reporter_invalid_json");
}

function canonicalJson(value) {
    return canonical(value);
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson(value, code = "reporter_corrupt_json") {
    try {
        return JSON.parse(value);
    }
    catch {
        fail(code);
    }
}

function asArray(value, field) {
    if (!Array.isArray(value))
        fail(`reporter_invalid_${field}`);
    return value;
}

function assertUnique(values, code) {
    if (new Set(values).size !== values.length)
        fail(code);
}

function normalizeDecision(value) {
    const aliases = {
        approve: "approve",
        approved: "approve",
        reject: "reject",
        rejected: "reject",
        needs_supplement: "needs_supplement",
    };
    const decision = aliases[value];
    if (!decision || !REPORTER_REVIEW_DECISIONS.includes(decision))
        fail("reporter_invalid_review_decision");
    return decision;
}

function installBase(database) {
    assertDatabase(database);
    installCareerSchema(database);
}

export function installReporterSchema(database) {
    installBase(database);
    return database;
}

function normalizeSource(input, now) {
    const sourceId = identifier(input?.sourceId, "source_id");
    const sourceType = identifier(input?.sourceType, "source_type");
    if (!REPORTER_SOURCE_TYPES.includes(sourceType))
        fail("reporter_source_type_forbidden");
    const producerReference = identifier(input?.producerReference, "producer_reference");
    const occurredAt = timestamp(input?.occurredAt, "occurred_at");
    const recordedAt = timestamp(input?.recordedAt ?? now, "recorded_at");
    if (occurredAt > now)
        fail("reporter_source_in_future");
    if (recordedAt < occurredAt)
        fail("reporter_source_recorded_before_occurrence");
    const publicSubject = identifier(input?.publicSubject, "public_subject");
    if (input?.privacyScope !== "public")
        fail("reporter_source_not_public");
    const fact = plainRecord(input?.fact, "fact");
    const allowedNumbers = input?.allowedNumbers ?? [];
    asArray(allowedNumbers, "allowed_numbers");
    for (const value of allowedNumbers) {
        if (typeof value !== "number" || !Number.isFinite(value))
            fail("reporter_invalid_allowed_number");
    }
    const normalizedAllowedNumbers = [...new Set(allowedNumbers)].sort((left, right) => left - right);
    const revisionReference = optionalIdentifier(input?.revisionReference, "revision_reference");
    const factJson = canonicalJson(fact);
    return {
        sourceId,
        sourceType,
        producerReference,
        occurredAt,
        publicSubject,
        fact,
        factJson,
        factDigest: digest(factJson),
        allowedNumbers: normalizedAllowedNumbers,
        privacyScope: "public",
        revisionReference,
        recordedAt,
    };
}

function mapSource(row) {
    return {
        sourceId: row.source_id,
        sourceType: row.source_type,
        producerReference: row.producer_reference,
        occurredAt: row.occurred_at,
        publicSubject: row.public_subject,
        fact: parseJson(row.fact_json),
        allowedNumbers: parseJson(row.allowed_numbers_json),
        privacyScope: row.privacy_scope,
        revisionReference: row.revision_reference,
        factDigest: row.fact_digest,
        recordedAt: row.recorded_at,
    };
}

function sourceMatches(row, source) {
    return row.source_id === source.sourceId &&
        row.source_type === source.sourceType &&
        row.producer_reference === source.producerReference &&
        row.occurred_at === source.occurredAt &&
        row.public_subject === source.publicSubject &&
        row.fact_json === source.factJson &&
        row.allowed_numbers_json === canonicalJson(source.allowedNumbers) &&
        row.privacy_scope === source.privacyScope &&
        row.revision_reference === source.revisionReference &&
        row.fact_digest === source.factDigest &&
        row.recorded_at === source.recordedAt;
}

export function registerReporterSourceFact(database, input) {
    installBase(database);
    const now = nowOf(input);
    const source = normalizeSource(input, now);
    return runInTransaction(database, () => {
        const existing = database.prepare(`
          SELECT * FROM career_reporter_source_facts WHERE source_id = ?
        `).get(source.sourceId);
        if (existing) {
            if (!sourceMatches(existing, source))
                fail("reporter_source_conflict");
            return mapSource(existing);
        }
        database.prepare(`
          INSERT INTO career_reporter_source_facts (
            source_id, source_type, producer_reference, occurred_at, public_subject,
            fact_json, allowed_numbers_json, privacy_scope, revision_reference,
            fact_digest, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(source.sourceId, source.sourceType, source.producerReference,
            source.occurredAt, source.publicSubject, source.factJson,
            canonicalJson(source.allowedNumbers), source.privacyScope,
            source.revisionReference, source.factDigest, source.recordedAt);
        return mapSource(database.prepare(`
          SELECT * FROM career_reporter_source_facts WHERE source_id = ?
        `).get(source.sourceId));
    });
}

function requireSource(database, sourceId) {
    const row = database.prepare(`
      SELECT * FROM career_reporter_source_facts WHERE source_id = ?
    `).get(sourceId);
    if (!row)
        fail("reporter_source_not_found");
    if (row.privacy_scope !== "public")
        fail("reporter_source_not_public");
    return row;
}

function requireSourceRows(database, sourceIds) {
    return sourceIds.map((sourceId) => requireSource(database, sourceId));
}

function normalizeSourceIds(value) {
    const sourceIds = asArray(value, "source_ids").map((sourceId) => identifier(sourceId, "source_id"));
    if (sourceIds.length === 0)
        fail("reporter_material_empty");
    assertUnique(sourceIds, "reporter_material_duplicate_source");
    return sourceIds;
}

function packSnapshot(rows) {
    return rows.map((row) => ({
        sourceId: row.source_id,
        sourceType: row.source_type,
        occurredAt: row.occurred_at,
        factDigest: row.fact_digest,
    }));
}

function mapPack(row) {
    return {
        packId: row.pack_id,
        issueReference: row.issue_reference,
        requiredLevel: row.required_level,
        difficultyLevel: row.difficulty_level,
        sourceIds: parseJson(row.source_ids_json),
        sourceSnapshot: parseJson(row.source_snapshot_json),
        status: row.status,
        jobId: row.job_id,
        claimedByResidentId: row.claimed_by_resident_id,
        claimIdempotencyKey: row.claim_idempotency_key,
        returnIdempotencyKey: row.return_idempotency_key,
        createdAt: row.created_at,
        claimedAt: row.claimed_at,
        returnedAt: row.returned_at,
        consumedAt: row.consumed_at,
    };
}

function requirePack(database, packId) {
    const row = database.prepare(`
      SELECT * FROM career_reporter_material_packs WHERE pack_id = ?
    `).get(packId);
    if (!row)
        fail("reporter_material_not_found");
    return row;
}

function requireIssueReference(pack) {
    if (typeof pack.issue_reference !== "string" || pack.issue_reference.length === 0 || pack.issue_reference.trim() !== pack.issue_reference)
        fail("reporter_issue_reference_missing");
    return pack.issue_reference;
}

function activeReporterQualification(database, residentId, now) {
    const row = database.prepare(`
      SELECT MAX(qualification_level) AS qualification_level
      FROM career_certificates
      WHERE resident_id = ? AND career = 'reporter' AND status = 'active'
        AND (effective_at IS NULL OR effective_at <= ?)
    `).get(residentId, now);
    if (row?.qualification_level === null || row?.qualification_level === undefined)
        fail("reporter_active_qualification_required");
    return level(row.qualification_level, "qualification_level");
}

function normalizedSectionName(value) {
    const name = identifier(value, "section_name");
    return { name, normalizedName: name.normalize("NFKC").toLocaleLowerCase("zh-CN") };
}

function mapSection(row) {
    return {
        sectionId: row.section_id,
        residentId: row.resident_id,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
    };
}

export function listReporterSections(database) {
    installBase(database);
    return database.prepare(`SELECT * FROM career_reporter_sections
      WHERE status = 'active' ORDER BY created_at, section_id`).all().map(mapSection);
}

export function createReporterSection(database, input) {
    installBase(database);
    const now = nowOf(input);
    const residentId = identifier(input?.residentId, "resident_id");
    const sectionId = identifier(input?.sectionId, "section_id");
    const { name, normalizedName } = normalizedSectionName(input?.name);
    return runInTransaction(database, () => {
        requireResident(database, residentId);
        if (activeReporterQualification(database, residentId, now) < 3)
            fail("reporter_section_level_required");
        const existingById = database.prepare(
            "SELECT * FROM career_reporter_sections WHERE section_id = ?",
        ).get(sectionId);
        if (existingById) {
            if (existingById.resident_id !== residentId ||
                existingById.normalized_name !== normalizedName)
                fail("reporter_section_id_conflict");
            return mapSection(existingById);
        }
        const existingByName = database.prepare(
            "SELECT * FROM career_reporter_sections WHERE normalized_name = ?",
        ).get(normalizedName);
        if (existingByName)
            fail("reporter_section_name_conflict");
        database.prepare(`INSERT INTO career_reporter_sections (
          section_id, resident_id, name, normalized_name, status, created_at
        ) VALUES (?, ?, ?, ?, 'active', ?)`)
            .run(sectionId, residentId, name, normalizedName, now);
        return mapSection(database.prepare(
            "SELECT * FROM career_reporter_sections WHERE section_id = ?",
        ).get(sectionId));
    });
}

function assertIssueArticleCapacity(database, residentId, issueReference, qualificationLevel) {
    const limit = REPORTER_MAX_ARTICLES_PER_ISSUE[qualificationLevel];
    if (!limit)
        fail("reporter_issue_limit_unavailable");
    const row = database.prepare(`
      SELECT COUNT(*) AS count
      FROM career_reporter_articles AS article
      JOIN career_reporter_material_packs AS pack ON pack.pack_id = article.pack_id
      WHERE article.resident_id = ?
        AND pack.issue_reference = ?
        AND article.revision_kind = 'initial'
    `).get(residentId, issueReference);
    if (row.count >= limit)
        fail("reporter_issue_article_limit");
}

export function createReporterMaterialPack(database, input) {
    installBase(database);
    const now = nowOf(input);
    const packId = identifier(input?.packId, "pack_id");
    const issueReference = identifier(input?.issueReference, "issue_reference");
    const requiredLevel = level(input?.requiredLevel, "required_level");
    const difficultyLevel = level(input?.difficultyLevel ?? requiredLevel, "difficulty_level");
    const sourceIds = normalizeSourceIds(input?.sourceIds);
    if (input?.trustedDailyRelay !== true && sourceIds.length > REPORTER_MAX_SOURCE_FACTS[requiredLevel])
        fail("reporter_material_level_limit");
    return runInTransaction(database, () => {
        const rows = requireSourceRows(database, sourceIds);
        if (rows.some((row) => row.occurred_at > now))
            fail("reporter_source_in_future");
        const snapshot = packSnapshot(rows);
        const sourceIdsJson = canonicalJson(sourceIds);
        const snapshotJson = canonicalJson(snapshot);
        const existing = database.prepare(`
          SELECT * FROM career_reporter_material_packs WHERE pack_id = ?
        `).get(packId);
        if (existing) {
            if (existing.issue_reference !== issueReference ||
                existing.required_level !== requiredLevel ||
                existing.difficulty_level !== difficultyLevel ||
                existing.source_ids_json !== sourceIdsJson ||
                existing.source_snapshot_json !== snapshotJson) {
                fail("reporter_material_conflict");
            }
            return mapPack(existing);
        }
        database.prepare(`
          INSERT INTO career_reporter_material_packs (
            pack_id, issue_reference, required_level, difficulty_level, source_ids_json,
            source_snapshot_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?)
        `).run(packId, issueReference, requiredLevel, difficultyLevel, sourceIdsJson, snapshotJson, now);
        return mapPack(requirePack(database, packId));
    });
}

function requireJob(database, jobId) {
    const row = database.prepare("SELECT * FROM career_jobs WHERE job_id = ?").get(jobId);
    if (!row)
        fail("reporter_job_not_found");
    if (row.career !== "reporter")
        fail("reporter_job_career_mismatch");
    return row;
}

function requireResident(database, residentId) {
    const row = database.prepare("SELECT resident_id FROM residents WHERE resident_id = ?").get(residentId);
    if (!row)
        fail("reporter_resident_not_found");
}

function requireWorkerJob(database, jobId, residentId) {
    const job = requireJob(database, jobId);
    if (job.worker_resident_id !== residentId)
        fail("reporter_job_worker_mismatch");
    if (!REPORTER_JOB_STATUSES.has(job.status))
        fail("reporter_job_not_actionable");
    return job;
}

function packForJob(database, jobId) {
    const row = database.prepare(`
      SELECT * FROM career_reporter_material_packs WHERE job_id = ?
    `).get(jobId);
    if (!row)
        fail("reporter_material_not_bound");
    if (!["claimed", "consumed"].includes(row.status))
        fail("reporter_material_not_claimed");
    return row;
}

export function claimReporterMaterialPack(database, input) {
    installBase(database);
    const now = nowOf(input);
    const packId = identifier(input?.packId, "pack_id");
    const jobId = identifier(input?.jobId, "job_id");
    const residentId = identifier(input?.residentId, "resident_id");
    const idempotencyKey = input?.idempotencyKey ?? `reporter:pack:${packId}:claim:${residentId}`;
    identifier(idempotencyKey, "idempotency_key");
    return runInTransaction(database, () => {
        requireResident(database, residentId);
        const job = requireWorkerJob(database, jobId, residentId);
        if (job.assignment_mode !== "accepted")
            fail("reporter_pack_job_assignment_mismatch");
        const keyOwner = database.prepare(`
          SELECT pack_id FROM career_reporter_material_packs WHERE claim_idempotency_key = ?
        `).get(idempotencyKey);
        if (keyOwner && keyOwner.pack_id !== packId)
            fail("reporter_material_claim_conflict");
        const pack = requirePack(database, packId);
        requireIssueReference(pack);
        if (pack.status === "claimed" || pack.status === "consumed") {
            if (pack.job_id !== jobId || pack.claimed_by_resident_id !== residentId ||
                pack.claim_idempotency_key !== idempotencyKey)
                fail("reporter_material_already_claimed");
            return mapPack(pack);
        }
        if (!["available", "returned"].includes(pack.status))
            fail("reporter_material_not_claimable");
        database.prepare(`
          UPDATE career_reporter_material_packs
          SET status = 'claimed', job_id = ?, claimed_by_resident_id = ?,
              claim_idempotency_key = ?, return_idempotency_key = NULL,
              claimed_at = ?, returned_at = NULL
          WHERE pack_id = ?
        `).run(jobId, residentId, idempotencyKey, now, packId);
        return mapPack(requirePack(database, packId));
    });
}

export function returnReporterMaterialPack(database, input) {
    installBase(database);
    const now = nowOf(input);
    const packId = identifier(input?.packId, "pack_id");
    const jobId = identifier(input?.jobId, "job_id");
    const residentId = identifier(input?.residentId, "resident_id");
    const idempotencyKey = input?.idempotencyKey ?? `reporter:pack:${packId}:return:${jobId}:${residentId}`;
    identifier(idempotencyKey, "idempotency_key");
    return runInTransaction(database, () => {
        const pack = requirePack(database, packId);
        requireIssueReference(pack);
        if (pack.status === "returned" && pack.return_idempotency_key === idempotencyKey)
            return mapPack(pack);
        if (pack.status !== "claimed" || pack.job_id !== jobId || pack.claimed_by_resident_id !== residentId)
            fail("reporter_material_return_not_allowed");
        const article = database.prepare(`
          SELECT article_id FROM career_reporter_articles
          WHERE job_id = ? ORDER BY version LIMIT 1
        `).get(jobId);
        if (article)
            fail("reporter_material_has_article");
        database.prepare(`
          UPDATE career_reporter_material_packs
          SET status = 'returned', job_id = NULL, claimed_by_resident_id = NULL,
              claim_idempotency_key = NULL, return_idempotency_key = ?,
              returned_at = ?, claimed_at = NULL
          WHERE pack_id = ?
        `).run(idempotencyKey, now, packId);
        return mapPack(requirePack(database, packId));
    });
}

function normalizeCitations(value) {
    const citations = asArray(value, "citations").map((entry, index) => {
        const citation = plainRecord(entry, "citation");
        const citationIndex = citation.citationIndex ?? index;
        return {
            sourceId: identifier(citation.sourceId, "citation_source_id"),
            factDigest: identifier(citation.factDigest, "citation_fact_digest"),
            citationIndex: timestamp(citationIndex, "citation_index"),
        };
    });
    assertUnique(citations.map((entry) => entry.sourceId), "reporter_duplicate_citation");
    assertUnique(citations.map((entry) => entry.citationIndex), "reporter_duplicate_citation_index");
    const ordered = [...citations].sort((left, right) => left.citationIndex - right.citationIndex);
    if (ordered.some((entry, index) => entry.citationIndex !== index))
        fail("reporter_invalid_citation_index");
    return ordered;
}

function normalizeNumericClaims(value) {
    const claims = value === undefined ? [] : asArray(value, "numeric_claims");
    return claims.map((entry) => {
        const claim = plainRecord(entry, "numeric_claim");
        if (typeof claim.value !== "number" || !Number.isFinite(claim.value))
            fail("reporter_invalid_numeric_claim");
        return {
            sourceId: identifier(claim.sourceId, "numeric_source_id"),
            value: claim.value,
        };
    });
}

function articleCitations(database, articleId) {
    return database.prepare(`
      SELECT source_id, citation_index, fact_digest
      FROM career_reporter_article_citations
      WHERE article_id = ? ORDER BY citation_index
    `).all(articleId).map((row) => ({
        sourceId: row.source_id,
        citationIndex: row.citation_index,
        factDigest: row.fact_digest,
    }));
}

function mapArticle(database, row) {
    return {
        articleId: row.article_id,
        jobId: row.job_id,
        residentId: row.resident_id,
        packId: row.pack_id,
        version: row.version,
        revisionKind: row.revision_kind,
        parentArticleId: row.parent_article_id,
        sectionId: row.section_id,
        articleText: row.article_text,
        numericClaims: parseJson(row.numeric_claims_json),
        citations: articleCitations(database, row.article_id),
        payloadHash: row.payload_hash,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        reviewDecision: row.review_decision,
        reviewReasonCode: row.review_reason_code,
        reviewerReference: row.reviewer_reference,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        publishedAt: row.published_at,
    };
}

function requireArticle(database, articleId) {
    const row = database.prepare(`
      SELECT * FROM career_reporter_articles WHERE article_id = ?
    `).get(articleId);
    if (!row)
        fail("reporter_article_not_found");
    return row;
}

function nextArticleVersion(database, jobId) {
    const row = database.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version
      FROM career_reporter_articles WHERE job_id = ?
    `).get(jobId);
    return row.version + 1;
}

function articlePayloadHash({ articleId, jobId, residentId, packId, version, revisionKind, parentArticleId, sectionId, articleText, citations, numericClaims }) {
    const payload = {
        articleId,
        jobId,
        residentId,
        packId,
        version,
        revisionKind,
        parentArticleId,
        articleText,
        citations,
        numericClaims,
    };
    if (sectionId !== null)
        payload.sectionId = sectionId;
    return digest(canonicalJson(payload));
}

function replayArticleByIdempotency(database, input, revisionKind, parentArticleId = null) {
    const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
    const existing = database.prepare(`
      SELECT * FROM career_reporter_articles WHERE idempotency_key = ?
    `).get(idempotencyKey);
    if (!existing)
        return null;
    const articleId = identifier(input?.articleId ?? `reporter-article:${input.jobId}:v${existing.version}`, "article_id");
    const articleText = identifier(input?.articleText, "article_text");
    const sectionId = input?.sectionId === undefined || input.sectionId === null
        ? null
        : identifier(input.sectionId, "section_id");
    const citations = normalizeCitations(input?.citations);
    const numericClaims = normalizeNumericClaims(input?.numericClaims);
    const payloadHash = articlePayloadHash({
        articleId,
        jobId: input.jobId,
        residentId: input.residentId,
        packId: existing.pack_id,
        version: existing.version,
        revisionKind,
        parentArticleId,
        sectionId,
        articleText,
        citations,
        numericClaims,
    });
    if (existing.payload_hash !== payloadHash)
        fail("reporter_article_idempotency_conflict");
    return mapArticle(database, existing);
}

function insertArticle(database, input) {
    const now = input.now;
    const job = requireWorkerJob(database, input.jobId, input.residentId);
    requireResident(database, input.residentId);
    const pack = packForJob(database, input.jobId);
    const issueReference = requireIssueReference(pack);
    if (pack.claimed_by_resident_id !== input.residentId)
        fail("reporter_material_worker_mismatch");
    if (job.decision_count < 1)
        fail("reporter_source_check_required");
    const articleText = identifier(input.articleText, "article_text");
    const sectionId = input.sectionId === undefined || input.sectionId === null
        ? null
        : identifier(input.sectionId, "section_id");
    if (sectionId) {
        const section = database.prepare(
            "SELECT 1 FROM career_reporter_sections WHERE section_id = ? AND status = 'active'",
        ).get(sectionId);
        if (!section)
            fail("reporter_section_not_found");
    }
    const citations = normalizeCitations(input.citations);
    const numericClaims = normalizeNumericClaims(input.numericClaims);
    if (input.revisionKind === "initial") {
        const qualificationLevel = activeReporterQualification(database, input.residentId, now);
        if (qualificationLevel < pack.required_level)
            fail("reporter_qualification_level_insufficient");
        assertIssueArticleCapacity(database, input.residentId, issueReference, qualificationLevel);
    }
    const idempotencyKey = identifier(input.idempotencyKey, "idempotency_key");
    const articleId = identifier(input.articleId ?? `reporter-article:${input.jobId}:v${input.version}`, "article_id");
    const payloadHash = articlePayloadHash({
        articleId,
        jobId: input.jobId,
        residentId: input.residentId,
        packId: pack.pack_id,
        version: input.version,
        revisionKind: input.revisionKind,
        parentArticleId: input.parentArticleId,
        sectionId,
        articleText,
        citations,
        numericClaims,
    });
    const existingByKey = database.prepare(`
      SELECT * FROM career_reporter_articles WHERE idempotency_key = ?
    `).get(idempotencyKey);
    if (existingByKey) {
        if (existingByKey.payload_hash !== payloadHash)
            fail("reporter_article_idempotency_conflict");
        return mapArticle(database, existingByKey);
    }
    const existingByVersion = database.prepare(`
      SELECT * FROM career_reporter_articles WHERE job_id = ? AND version = ?
    `).get(input.jobId, input.version);
    if (existingByVersion) {
        if (existingByVersion.payload_hash !== payloadHash)
            fail("reporter_article_version_conflict");
        return mapArticle(database, existingByVersion);
    }
    const existingById = database.prepare(`
      SELECT * FROM career_reporter_articles WHERE article_id = ?
    `).get(articleId);
    if (existingById)
        fail("reporter_article_id_conflict");
    database.prepare(`
      INSERT INTO career_reporter_articles (
        article_id, job_id, resident_id, pack_id, version, revision_kind,
        parent_article_id, section_id, article_text, numeric_claims_json, payload_hash,
        idempotency_key, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
    `).run(articleId, input.jobId, input.residentId, pack.pack_id, input.version,
        input.revisionKind, input.parentArticleId, sectionId, articleText,
        canonicalJson(numericClaims), payloadHash, idempotencyKey, now);
    const insertCitation = database.prepare(`
      INSERT INTO career_reporter_article_citations (
        article_id, source_id, citation_index, fact_digest
      ) VALUES (?, ?, ?, ?)
    `);
    for (const citation of citations)
        insertCitation.run(articleId, citation.sourceId, citation.citationIndex, citation.factDigest);
    return mapArticle(database, requireArticle(database, articleId));
}

export function submitReporterArticle(database, input) {
    installBase(database);
    const now = nowOf(input);
    const jobId = identifier(input?.jobId, "job_id");
    const residentId = identifier(input?.residentId, "resident_id");
    return runInTransaction(database, () => {
        const replay = replayArticleByIdempotency(database, {
            ...input,
            jobId,
            residentId,
        }, "initial");
        if (replay)
            return replay;
        const existing = database.prepare(`
          SELECT * FROM career_reporter_articles
          WHERE job_id = ? AND version = 1
        `).get(jobId);
        if (existing) {
            const article = {
                ...input,
                now,
                jobId,
                residentId,
                version: 1,
                revisionKind: "initial",
                parentArticleId: null,
            };
            return insertArticle(database, article);
        }
        return insertArticle(database, {
            ...input,
            now,
            jobId,
            residentId,
            version: 1,
            revisionKind: "initial",
            parentArticleId: null,
        });
    });
}

function validateRevisionParent(database, parentArticleId, kind, jobId, residentId) {
    const parent = requireArticle(database, parentArticleId);
    if (parent.job_id !== jobId || parent.resident_id !== residentId)
        fail("reporter_revision_owner_mismatch");
    if (kind === "supplement" && parent.status !== "needs_supplement")
        fail("reporter_supplement_not_requested");
    if (kind === "correction" && parent.status !== "published")
        fail("reporter_correction_parent_not_published");
    if (kind === "correction") {
        const publication = database.prepare(`
          SELECT publication_id FROM career_reporter_publications WHERE article_id = ?
        `).get(parentArticleId);
        if (!publication)
            fail("reporter_correction_publication_missing");
    }
    const latest = database.prepare(`
      SELECT article_id FROM career_reporter_articles
      WHERE job_id = ? ORDER BY version DESC LIMIT 1
    `).get(jobId);
    if (latest?.article_id !== parentArticleId)
        fail("reporter_revision_parent_not_latest");
    return parent;
}

export function submitReporterSupplement(database, input) {
    installBase(database);
    const now = nowOf(input);
    const jobId = identifier(input?.jobId, "job_id");
    const residentId = identifier(input?.residentId, "resident_id");
    const parentArticleId = identifier(input?.parentArticleId, "parent_article_id");
    return runInTransaction(database, () => {
        const replay = replayArticleByIdempotency(database, {
            ...input,
            jobId,
            residentId,
        }, "supplement", parentArticleId);
        if (replay)
            return replay;
        validateRevisionParent(database, parentArticleId, "supplement", jobId, residentId);
        return insertArticle(database, {
            ...input,
            now,
            jobId,
            residentId,
            parentArticleId,
            version: nextArticleVersion(database, jobId),
            revisionKind: "supplement",
        });
    });
}

export const resubmitReporterArticle = submitReporterSupplement;

export function polishReporterArticle(database, input) {
    installBase(database);
    const now = nowOf(input);
    const parentArticleId = identifier(input?.parentArticleId, "parent_article_id");
    const reviewerResidentId = identifier(input?.reviewerResidentId, "resident_id");
    const reviewerJobId = identifier(input?.reviewerJobId, "job_id");
    if (input?.trustedReview !== true)
        fail("reporter_review_not_trusted");
    return runInTransaction(database, () => {
        const parent = requireArticle(database, parentArticleId);
        const workflow = database.prepare(`SELECT workflow.*
          FROM career_reporter_story_workflows AS workflow
          JOIN career_reporter_relay_issues AS issue ON issue.issue_reference = workflow.issue_reference
          WHERE workflow.reviewer_job_id = ? AND workflow.reviewer_resident_id = ?
            AND workflow.writer_job_id = ? AND workflow.writer_resident_id = ?
            AND issue.submission_reviewer_resident_id IS NOT NULL`)
            .get(reviewerJobId, reviewerResidentId, parent.job_id, parent.resident_id);
        if (!workflow)
            fail("reporter_relay_review_not_actionable");
        const revision = {
            articleId: input?.articleId,
            jobId: parent.job_id,
            residentId: parent.resident_id,
            parentArticleId,
            sectionId: parent.section_id,
            articleText: input?.articleText,
            citations: articleCitations(database, parentArticleId),
            numericClaims: parseJson(parent.numeric_claims_json),
            idempotencyKey: input?.idempotencyKey,
        };
        const replay = replayArticleByIdempotency(database, revision, "polish", parentArticleId);
        if (replay) {
            if (replay.reviewerReference !== `resident:${reviewerResidentId}`)
                fail("reporter_article_idempotency_conflict");
            return replay;
        }
        if (workflow.status !== "pending_review" || workflow.article_id !== parentArticleId ||
            parent.status !== "pending_review" || parent.review_decision !== null)
            fail("reporter_workflow_not_reviewable");
        const issue = database.prepare(`SELECT status, article_id FROM career_reporter_relay_issues
          WHERE issue_reference = ?`).get(workflow.issue_reference);
        if (issue?.status !== "review_pending" || issue.article_id !== parentArticleId)
            fail("reporter_relay_review_not_actionable");
        requireWorkerJob(database, reviewerJobId, reviewerResidentId);
        activeReporterQualification(database, reviewerResidentId, now);
        validateRevisionParent(database, parentArticleId, "polish", parent.job_id, parent.resident_id);
        const article = insertArticle(database, { ...revision, now,
            version: nextArticleVersion(database, parent.job_id), revisionKind: "polish" });
        return reviewReporterArticle(database, { articleId: article.articleId,
            decision: "approve", reviewerReference: `resident:${reviewerResidentId}`,
            trustedReview: true, now });
    });
}

export function createReporterCorrection(database, input) {
    installBase(database);
    const now = nowOf(input);
    const jobId = identifier(input?.jobId, "job_id");
    const residentId = identifier(input?.residentId, "resident_id");
    const parentArticleId = identifier(input?.parentArticleId, "parent_article_id");
    return runInTransaction(database, () => {
        const replay = replayArticleByIdempotency(database, {
            ...input,
            jobId,
            residentId,
        }, "correction", parentArticleId);
        if (replay)
            return replay;
        validateRevisionParent(database, parentArticleId, "correction", jobId, residentId);
        return insertArticle(database, {
            ...input,
            now,
            jobId,
            residentId,
            parentArticleId,
            version: nextArticleVersion(database, jobId),
            revisionKind: "correction",
        });
    });
}

export function reviewReporterArticle(database, input) {
    installBase(database);
    const now = nowOf(input);
    if (input?.trustedReview !== true)
        fail("reporter_review_not_trusted");
    const articleId = identifier(input?.articleId, "article_id");
    const reviewerReference = identifier(input?.reviewerReference, "reviewer_reference");
    const decision = normalizeDecision(input?.decision);
    const reasonCode = input?.reasonCode ?? (decision === "approve" ? "hard_checks_passed" : null);
    if (!REPORTER_REVIEW_REASON_CODES.includes(reasonCode))
        fail("reporter_invalid_review_reason");
    return runInTransaction(database, () => {
        const article = requireArticle(database, articleId);
        if (article.review_decision !== null) {
            if (article.review_decision === decision &&
                article.review_reason_code === reasonCode &&
                article.reviewer_reference === reviewerReference)
                return mapArticle(database, article);
            fail("reporter_article_already_reviewed");
        }
        const pack = packForJob(database, article.job_id);
        requireIssueReference(pack);
        const status = decision === "approve"
            ? "approved"
            : decision === "reject" ? "rejected" : "needs_supplement";
        database.prepare(`
          UPDATE career_reporter_articles
          SET status = ?, review_decision = ?, review_reason_code = ?,
              reviewer_reference = ?, reviewed_at = ?
          WHERE article_id = ?
        `).run(status, decision, reasonCode, reviewerReference, now, articleId);
        return mapArticle(database, requireArticle(database, articleId));
    });
}

function mapPublication(database, row) {
    return {
        publicationId: row.publication_id,
        articleId: row.article_id,
        jobId: row.job_id,
        residentId: row.resident_id,
        articleVersion: row.article_version,
        publishedAt: row.published_at,
        evaluationOpensAt: row.evaluation_opens_at,
        evaluationClosesAt: reporterEvaluationClosesAt(database, row),
        status: row.status,
        validLikes: row.valid_likes,
        performanceUnits: row.performance_units,
        performanceGold: row.performance_gold,
        settlementReceiptId: row.settlement_receipt_id,
        settledAt: row.settled_at,
    };
}

function requirePublication(database, publicationId) {
    const row = database.prepare(`
      SELECT * FROM career_reporter_publications WHERE publication_id = ?
    `).get(publicationId);
    if (!row)
        fail("reporter_publication_not_found");
    if (!PUBLICATION_STATUSES.has(row.status))
        fail("reporter_publication_status_invalid");
    return row;
}

function latestPublication(database, jobId) {
    return database.prepare(`
      SELECT * FROM career_reporter_publications
      WHERE job_id = ? ORDER BY article_version DESC LIMIT 1
    `).get(jobId);
}

function publicationLikeRef(publicationId) {
    return `daily_like_${digest(publicationId).slice(0, 24)}`;
}

function publicationByLikeRef(database, likeRef) {
    const normalized = identifier(likeRef, "like_ref");
    const rows = database.prepare(
        "SELECT * FROM career_reporter_publications ORDER BY publication_id",
    ).all();
    const matches = rows.filter((row) => publicationLikeRef(row.publication_id) === normalized);
    if (matches.length !== 1)
        fail("reporter_publication_not_found");
    return matches[0];
}

function validLikeCount(database, jobId) {
    const publication = latestPublication(database, jobId);
    const closesAt = reporterEvaluationClosesAt(database, publication);
    const resident = database.prepare(`SELECT COUNT(*) AS count
      FROM career_reporter_publication_likes WHERE job_id = ? AND liked_at >= ?
        AND (? IS NULL OR liked_at < ?)`).get(jobId, publication.evaluation_opens_at, closesAt, closesAt).count;
    const human = database.prepare(`SELECT COUNT(*) AS count
      FROM career_reporter_human_likes WHERE job_id = ? AND liked_at >= ?
        AND (? IS NULL OR liked_at < ?)`).get(jobId, publication.evaluation_opens_at, closesAt, closesAt).count;
    return resident + human;
}

export function listReporterPublicationsForHuman(database, input) {
    installBase(database);
    const now = nowOf(input);
    const humanActorKey = identifier(input?.humanActorKey, "human_actor_key");
    const relatedResidentIds = new Set(asArray(input?.relatedResidentIds, "related_resident_ids")
        .map((value) => identifier(value, "related_resident_id")));
    const publications = database.prepare(`SELECT publication.*, article.article_text,
        article.section_id, section.name AS section_name
      FROM career_reporter_publications publication
      JOIN career_reporter_articles article ON article.article_id = publication.article_id
      LEFT JOIN career_reporter_sections section ON section.section_id = article.section_id
      WHERE publication.publication_id = (
        SELECT latest.publication_id FROM career_reporter_publications latest
        WHERE latest.job_id = publication.job_id
        ORDER BY latest.article_version DESC LIMIT 1
      )
      ORDER BY publication.published_at DESC, publication.publication_id`).all();
    return publications.map((publication) => {
        const credits = reporterPublicationCredits(database, publication.publication_id);
        const hasLiked = Boolean(database.prepare(`SELECT 1 FROM career_reporter_human_likes
          WHERE job_id = ? AND human_actor_key = ?`).get(publication.job_id, humanActorKey));
        const creditedResidents = [
            credits?.selectorResidentId,
            credits?.writerResidentId ?? publication.resident_id,
            credits?.reviewerResidentId,
            credits?.submissionReviewerResidentId,
        ].filter(Boolean);
        const ownHousehold = creditedResidents.some((residentId) => relatedResidentIds.has(residentId));
        const closesAt = reporterEvaluationClosesAt(database, publication);
        const open = publication.status === "open" &&
            now >= publication.evaluation_opens_at && (closesAt === null || now < closesAt);
        return {
            likeRef: publicationLikeRef(publication.publication_id),
            publicationId: publication.publication_id,
            authorResidentId: publication.resident_id,
            selectorResidentId: credits?.selectorResidentId ?? publication.resident_id,
            writerResidentId: credits?.writerResidentId ?? publication.resident_id,
            reviewerResidentId: credits?.reviewerResidentId ?? null,
            articleText: publication.article_text,
            sectionName: publication.section_name,
            publishedAt: publication.published_at,
            evaluationClosesAt: closesAt,
            validLikes: validLikeCount(database, publication.job_id),
            hasLiked,
            canLike: open && !hasLiked && !ownHousehold,
            ownHousehold,
            status: open ? "open" : "closed",
        };
    });
}

export function listReporterPublicationsForResident(database, input) {
    installBase(database);
    const now = nowOf(input);
    const residentId = identifier(input?.residentId, "resident_id");
    return database.prepare(`SELECT publication.*, article.article_text,
        section.name AS section_name
      FROM career_reporter_publications publication
      JOIN career_reporter_articles article ON article.article_id = publication.article_id
      LEFT JOIN career_reporter_sections section ON section.section_id = article.section_id
      WHERE publication.publication_id = (
        SELECT latest.publication_id FROM career_reporter_publications latest
        WHERE latest.job_id = publication.job_id
        ORDER BY latest.article_version DESC LIMIT 1
      )
      ORDER BY publication.published_at DESC, publication.publication_id`).all().map((publication) => {
        const credits = reporterPublicationCredits(database, publication.publication_id);
        const hasLiked = Boolean(database.prepare(`SELECT 1
          FROM career_reporter_publication_likes
          WHERE job_id = ? AND resident_id = ?`).get(publication.job_id, residentId));
        const ownArticle = [
            credits?.selectorResidentId,
            credits?.writerResidentId ?? publication.resident_id,
            credits?.reviewerResidentId,
            credits?.submissionReviewerResidentId,
        ].filter(Boolean).includes(residentId);
        const closesAt = reporterEvaluationClosesAt(database, publication);
        const open = publication.status === "open" &&
            now >= publication.evaluation_opens_at && (closesAt === null || now < closesAt);
        return {
            publicationId: publication.publication_id,
            authorResidentId: publication.resident_id,
            selectorResidentId: credits?.selectorResidentId ?? publication.resident_id,
            writerResidentId: credits?.writerResidentId ?? publication.resident_id,
            reviewerResidentId: credits?.reviewerResidentId ?? null,
            articleText: publication.article_text,
            sectionName: publication.section_name,
            publishedAt: publication.published_at,
            evaluationClosesAt: closesAt,
            validLikes: validLikeCount(database, publication.job_id),
            hasLiked,
            canLike: open && !hasLiked && !ownArticle,
            ownArticle,
            status: open ? "open" : "closed",
        };
    });
}

export function recordReporterHumanLike(database, input) {
    installBase(database);
    const now = nowOf(input);
    const humanActorKey = identifier(input?.humanActorKey, "human_actor_key");
    const viaResidentId = identifier(input?.viaResidentId, "via_resident_id");
    const relatedResidentIds = new Set(asArray(input?.relatedResidentIds, "related_resident_ids")
        .map((value) => identifier(value, "related_resident_id")));
    if (!relatedResidentIds.has(viaResidentId))
        fail("reporter_human_actor_mismatch");
    return runInTransaction(database, () => {
        requireResident(database, viaResidentId);
        const publication = publicationByLikeRef(database, input?.likeRef);
        const credits = reporterPublicationCredits(database, publication.publication_id);
        const creditedResidents = [
            credits?.selectorResidentId,
            credits?.writerResidentId ?? publication.resident_id,
            credits?.reviewerResidentId,
            credits?.submissionReviewerResidentId,
        ].filter(Boolean);
        if (creditedResidents.some((residentId) => relatedResidentIds.has(residentId)))
            fail("reporter_author_like_forbidden");
        const existing = database.prepare(`SELECT publication_id
          FROM career_reporter_human_likes
          WHERE job_id = ? AND human_actor_key = ?`)
            .get(publication.job_id, humanActorKey);
        if (existing) {
            return {
                accepted: false,
                duplicate: true,
                likeRef: publicationLikeRef(existing.publication_id),
                validLikes: validLikeCount(database, publication.job_id),
            };
        }
        const closesAt = reporterEvaluationClosesAt(database, publication);
        if (publication.status !== "open" || now < publication.evaluation_opens_at ||
            (closesAt !== null && now >= closesAt))
            fail("reporter_evaluation_window_closed");
        database.prepare(`INSERT INTO career_reporter_human_likes (
          job_id, publication_id, human_actor_key, via_resident_id, liked_at
        ) VALUES (?, ?, ?, ?, ?)`)
            .run(publication.job_id, publication.publication_id, humanActorKey,
                viaResidentId, now);
        return {
            accepted: true,
            duplicate: false,
            likeRef: publicationLikeRef(publication.publication_id),
            validLikes: validLikeCount(database, publication.job_id),
        };
    });
}

export function dueReporterEvaluationJobIds(database, now = Date.now()) {
    installBase(database);
    const pending = database.prepare(`SELECT publication.*
      FROM career_reporter_publications publication
      WHERE NOT EXISTS (
          SELECT 1 FROM career_reporter_evaluation_settlements settlement
          WHERE settlement.job_id = publication.job_id
        )
      ORDER BY publication.job_id`).all();
    return [...new Set(pending.filter(publication => {
        const closesAt = reporterEvaluationClosesAt(database, publication);
        return closesAt !== null && closesAt <= now;
    }).map(publication => publication.job_id))];
}

export function publishReporterArticle(database, input) {
    installBase(database);
    const now = nowOf(input);
    const articleId = identifier(input?.articleId, "article_id");
    return runInTransaction(database, () => {
        const article = requireArticle(database, articleId);
        const expectedPublicationId = input?.publicationId ?? `reporter-publication:${article.article_id}`;
        const publicationId = identifier(expectedPublicationId, "publication_id");
        const existingByArticle = database.prepare(`
          SELECT * FROM career_reporter_publications WHERE article_id = ?
        `).get(articleId);
        if (existingByArticle) {
            if (existingByArticle.publication_id !== publicationId)
                fail("reporter_publication_id_conflict");
            return mapPublication(database, existingByArticle);
        }
        if (article.status !== "approved")
            fail("reporter_article_not_approved");
        const job = requireWorkerJob(database, article.job_id, article.resident_id);
        const pack = packForJob(database, article.job_id);
        requireIssueReference(pack);
        const existingById = database.prepare(`
          SELECT * FROM career_reporter_publications WHERE publication_id = ?
        `).get(publicationId);
        if (existingById)
            fail("reporter_publication_id_conflict");
        const previous = latestPublication(database, article.job_id);
        if (previous && article.revision_kind !== "correction")
            fail("reporter_publication_revision_required");
        if (!previous && article.revision_kind === "correction")
            fail("reporter_correction_publication_missing");
        const evaluationOpensAt = previous?.evaluation_opens_at ?? now;
        const evaluationClosesAt = previous?.evaluation_closes_at ?? now + REPORTER_EVALUATION_WINDOW_MS;
        const effectiveClosesAt = reporterEvaluationClosesAt(database, {
            job_id:article.job_id,evaluation_closes_at:evaluationClosesAt,
        });
        const status = effectiveClosesAt === null || now < effectiveClosesAt ? "open" : "closed";
        if (previous) {
            database.prepare(`
              UPDATE career_reporter_publications
              SET status = CASE WHEN status = 'open' THEN 'superseded' ELSE status END
              WHERE job_id = ? AND publication_id <> ?
            `).run(article.job_id, publicationId);
        }
        database.prepare(`
          INSERT INTO career_reporter_publications (
            publication_id, article_id, job_id, resident_id, article_version,
            published_at, evaluation_opens_at, evaluation_closes_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(publicationId, articleId, article.job_id, article.resident_id,
            article.version, now, evaluationOpensAt, evaluationClosesAt, status);
        database.prepare(`
          UPDATE career_reporter_articles SET status = 'published', published_at = ?
          WHERE article_id = ?
        `).run(now, articleId);
        if (pack.status === "claimed") {
            database.prepare(`
              UPDATE career_reporter_material_packs
              SET status = 'consumed', consumed_at = ? WHERE pack_id = ?
            `).run(now, pack.pack_id);
        }
        return mapPublication(database, requirePublication(database, publicationId));
    });
}

export function recordReporterLike(database, input) {
    installBase(database);
    const now = nowOf(input);
    const publicationId = identifier(input?.publicationId, "publication_id");
    const residentId = identifier(input?.residentId, "resident_id");
    if (input?.actorKind !== "resident")
        fail("reporter_like_actor_forbidden");
    return runInTransaction(database, () => {
        requireResident(database, residentId);
        const publication = requirePublication(database, publicationId);
        const credits = reporterPublicationCredits(database, publication.publication_id);
        const existing = database.prepare(`
          SELECT publication_id FROM career_reporter_publication_likes
          WHERE job_id = ? AND resident_id = ?
        `).get(publication.job_id, residentId);
        if (existing)
            return { accepted: false, duplicate: true, jobId: publication.job_id, publicationId: existing.publication_id, residentId };
        if (publication.status !== "open")
            fail("reporter_evaluation_window_closed");
        if (now < publication.evaluation_opens_at)
            fail("reporter_evaluation_window_not_open");
        const closesAt = reporterEvaluationClosesAt(database, publication);
        if (closesAt !== null && now >= closesAt)
            fail("reporter_evaluation_window_closed");
        if ([
            credits?.selectorResidentId,
            credits?.writerResidentId ?? publication.resident_id,
            credits?.reviewerResidentId,
            credits?.submissionReviewerResidentId,
        ].filter(Boolean).includes(residentId))
            fail("reporter_author_like_forbidden");
        database.prepare(`
          INSERT INTO career_reporter_publication_likes (
            job_id, publication_id, resident_id, actor_kind, liked_at
          ) VALUES (?, ?, ?, 'resident', ?)
        `).run(publication.job_id, publicationId, residentId, now);
        return { accepted: true, duplicate: false, jobId: publication.job_id, publicationId, residentId };
    });
}

function performanceUnitsForLikes(validLikes) {
    if (validLikes >= 20)
        return 3;
    if (validLikes >= 15)
        return 2;
    if (validLikes >= 5)
        return 1;
    return 0;
}

export function quoteReporterEvaluation(database, input) {
    installBase(database);
    const now = nowOf(input);
    const requestedPublicationId = optionalIdentifier(input?.publicationId, "publication_id");
    const requestedJobId = optionalIdentifier(input?.jobId, "job_id");
    if (!requestedPublicationId && !requestedJobId)
        fail("reporter_evaluation_reference_required");
    return runInTransaction(database, () => {
        const requestedPublication = requestedPublicationId
            ? requirePublication(database, requestedPublicationId)
            : null;
        const jobId = requestedJobId ?? requestedPublication.job_id;
        if (requestedPublication && requestedPublication.job_id !== jobId)
            fail("reporter_evaluation_reference_conflict");
        const job = requireJob(database, jobId);
        const existing = database.prepare(`
          SELECT * FROM career_reporter_evaluation_quotes WHERE job_id = ?
        `).get(jobId);
        if (existing) {
            if (requestedPublication && existing.publication_id !== requestedPublication.publication_id)
                fail("reporter_evaluation_reference_conflict");
            if (now < existing.evaluation_closes_at)
                fail("reporter_evaluation_window_open");
            return mapQuote(existing);
        }
        const publication = latestPublication(database, jobId);
        if (!publication)
            fail("reporter_publication_not_found");
        const closesAt = reporterEvaluationClosesAt(database, publication);
        if (closesAt === null || now < closesAt)
            fail("reporter_evaluation_window_open");
        if (job.status !== "completed")
            fail("reporter_job_not_completed");
        const work = database.prepare(`
          SELECT qualification_level, performance_rate_bps FROM career_work_records
          WHERE job_id = ? AND resident_id = ? AND record_kind = 'completed'
        `).get(jobId, job.worker_resident_id);
        if (!work)
            fail("reporter_work_record_missing");
        const validLikes = validLikeCount(database, jobId);
        const performanceUnits = performanceUnitsForLikes(validLikes);
        const performanceGold = performanceUnits * PERFORMANCE_PAY_GOLD[work.qualification_level] *
            work.performance_rate_bps / 10_000;
        const sourceReference = `reporter:evaluation:${jobId}`;
        const idempotencyKey = sourceReference;
        const quote = {
            quoteId: `reporter-quote:${jobId}`,
            publicationId: publication.publication_id,
            jobId,
            residentId: job.worker_resident_id,
            sourceReference,
            idempotencyKey,
            validLikes,
            performanceUnits,
            performanceGold,
            qualificationLevel: work.qualification_level,
            evaluationClosesAt: closesAt,
            status: "quoted",
            quotedAt: now,
        };
        database.prepare(`
          INSERT INTO career_reporter_evaluation_quotes (
            quote_id, publication_id, job_id, resident_id, source_reference,
            idempotency_key, valid_likes, performance_units, performance_gold,
            qualification_level, evaluation_closes_at, quote_json, status, quoted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quoted', ?)
        `).run(quote.quoteId, quote.publicationId, quote.jobId, quote.residentId,
            quote.sourceReference, quote.idempotencyKey, quote.validLikes,
            quote.performanceUnits, quote.performanceGold, quote.qualificationLevel,
            quote.evaluationClosesAt, canonicalJson(quote), quote.quotedAt);
        database.prepare(`
          UPDATE career_reporter_publications
          SET status = 'closed'
          WHERE job_id = ? AND status = 'open'
        `).run(jobId);
        return mapQuote(database.prepare(`
          SELECT * FROM career_reporter_evaluation_quotes WHERE quote_id = ?
        `).get(quote.quoteId));
    });
}

function mapQuote(row) {
    return {
        quoteId: row.quote_id,
        publicationId: row.publication_id,
        jobId: row.job_id,
        residentId: row.resident_id,
        sourceReference: row.source_reference,
        idempotencyKey: row.idempotency_key,
        validLikes: row.valid_likes,
        performanceUnits: row.performance_units,
        performanceGold: row.performance_gold,
        qualificationLevel: row.qualification_level,
        evaluationClosesAt: row.evaluation_closes_at,
        status: row.status,
        receiptId: row.receipt_id,
        quotedAt: row.quoted_at,
        settledAt: row.settled_at,
    };
}

function mapSettlement(row) {
    return {
        settlementId: row.settlement_id,
        jobId: row.job_id,
        residentId: row.resident_id,
        sourceReference: row.source_reference,
        idempotencyKey: row.idempotency_key,
        validLikes: row.valid_likes,
        performanceUnits: row.units,
        performanceGold: row.performance_gold,
        receiptId: row.receipt_id,
        settledAt: row.settled_at,
    };
}

export function settleReporterEvaluation(database, input) {
    installBase(database);
    const now = nowOf(input);
    const jobId = optionalIdentifier(input?.jobId, "job_id");
    const publicationId = optionalIdentifier(input?.publicationId, "publication_id");
    if (!jobId && !publicationId)
        fail("reporter_evaluation_reference_required");
    return runInTransaction(database, () => {
        let quoteRow = jobId
            ? database.prepare(`SELECT * FROM career_reporter_evaluation_quotes WHERE job_id = ?`).get(jobId)
            : null;
        if (!quoteRow) {
            quoteReporterEvaluation(database, { jobId, publicationId, now });
            quoteRow = jobId
                ? database.prepare(`SELECT * FROM career_reporter_evaluation_quotes WHERE job_id = ?`).get(jobId)
                : database.prepare(`
                  SELECT * FROM career_reporter_evaluation_quotes WHERE publication_id = ?
                `).get(publicationId);
        }
        if (!quoteRow)
            fail("reporter_evaluation_quote_missing");
        const quote = mapQuote(quoteRow);
        if (publicationId && quote.publicationId !== publicationId)
            fail("reporter_evaluation_reference_conflict");
        const existing = database.prepare(`
          SELECT * FROM career_reporter_evaluation_settlements WHERE job_id = ?
        `).get(quote.jobId);
        if (existing) {
            if (existing.resident_id !== quote.residentId ||
                existing.valid_likes !== quote.validLikes ||
                existing.units !== quote.performanceUnits ||
                existing.performance_gold !== quote.performanceGold ||
                existing.source_reference !== quote.sourceReference ||
                existing.idempotency_key !== quote.idempotencyKey) {
                fail("reporter_evaluation_settlement_conflict");
            }
            if (input?.financialReceipt && input.financialReceipt.receiptId !== existing.receipt_id)
                fail("reporter_evaluation_receipt_conflict");
            if (quote.status !== "settled") {
                database.prepare(`
                  UPDATE career_reporter_evaluation_quotes
                  SET status = 'settled', receipt_id = ?, settled_at = ?
                  WHERE quote_id = ?
                `).run(existing.receipt_id, existing.settled_at, quote.quoteId);
            }
            return {
                quote: mapQuote(database.prepare(`
                  SELECT * FROM career_reporter_evaluation_quotes WHERE quote_id = ?
                `).get(quote.quoteId)),
                settlement: mapSettlement(existing),
            };
        }
        const job = requireJob(database, quote.jobId);
        if (job.worker_resident_id !== quote.residentId)
            fail("reporter_job_worker_mismatch");
        if (quote.performanceUnits === 0) {
            if (input?.financialReceipt)
                fail("reporter_zero_settlement_receipt_unexpected");
        }
        else {
            if (!input?.financialReceipt)
                fail("reporter_performance_receipt_required");
            recordFinancialReceipt(database, input.financialReceipt, {
                amount: quote.performanceGold,
                businessReference: `career-job:${quote.jobId}:evaluation-performance`,
                currency: "gold",
                kind: "system_gold_credit",
                residentId: quote.residentId,
            }, now);
            database.prepare(`
              INSERT INTO career_performance_adjustments (
                adjustment_id, job_id, resident_id, units, performance_gold,
                receipt_id, source_reference, recorded_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(`${quote.quoteId}:adjustment`, quote.jobId, quote.residentId,
                quote.performanceUnits, quote.performanceGold,
                input.financialReceipt.receiptId, `${quote.sourceReference}:performance`, now);
        }
        const settlementId = `reporter-settlement:${quote.jobId}`;
        database.prepare(`
          INSERT INTO career_reporter_evaluation_settlements (
            settlement_id, job_id, resident_id, source_reference, idempotency_key,
            valid_likes, units, performance_gold, receipt_id, settled_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(settlementId, quote.jobId, quote.residentId, quote.sourceReference,
            quote.idempotencyKey, quote.validLikes, quote.performanceUnits,
            quote.performanceGold, input?.financialReceipt?.receiptId ?? null, now);
        database.prepare(`
          UPDATE career_reporter_evaluation_quotes
          SET status = 'settled', receipt_id = ?, settled_at = ?
          WHERE quote_id = ?
        `).run(input?.financialReceipt?.receiptId ?? null, now, quote.quoteId);
        database.prepare(`
          UPDATE career_reporter_publications
          SET status = 'closed', valid_likes = ?, performance_units = ?,
              performance_gold = ?, settlement_receipt_id = ?, settled_at = ?
          WHERE job_id = ?
        `).run(quote.validLikes, quote.performanceUnits, quote.performanceGold,
            input?.financialReceipt?.receiptId ?? null, now, quote.jobId);
        const settlement = database.prepare(`
          SELECT * FROM career_reporter_evaluation_settlements WHERE settlement_id = ?
        `).get(settlementId);
        return {
            quote: mapQuote(database.prepare(`
              SELECT * FROM career_reporter_evaluation_quotes WHERE quote_id = ?
            `).get(quote.quoteId)),
            settlement: mapSettlement(settlement),
        };
    });
}

export function getReporterSourceFact(database, sourceId) {
    installBase(database);
    return mapSource(requireSource(database, identifier(sourceId, "source_id")));
}

export function getReporterMaterialPack(database, packId) {
    installBase(database);
    return mapPack(requirePack(database, identifier(packId, "pack_id")));
}

export function getReporterArticle(database, articleId) {
    installBase(database);
    return mapArticle(database, requireArticle(database, identifier(articleId, "article_id")));
}

export function getReporterPublication(database, publicationId) {
    installBase(database);
    return mapPublication(database, requirePublication(database, identifier(publicationId, "publication_id")));
}

export function getReporterEvaluationQuote(database, jobId) {
    installBase(database);
    const row = database.prepare(`
      SELECT * FROM career_reporter_evaluation_quotes WHERE job_id = ?
    `).get(identifier(jobId, "job_id"));
    if (!row)
        fail("reporter_evaluation_quote_missing");
    return mapQuote(row);
}
