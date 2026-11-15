import { createHash } from "node:crypto";
import { animalById } from "../content.js";
import { reachable } from "../server/farm/social.js";
import { observationText } from "../server/bulletin-health-notices.js";
import { optionHandles } from "../server/doorbell/option-handles.js";
import { serviceProposalSources } from "./p3-commission-runtime.js";

const operationFor = career => career === "agronomist" ? "go.farm.commission" : "go.hospital.commission";
const call = (op, handle) => `doorbell(${JSON.stringify({ op, args: { option: handle } })})`;
const createOption = value => `service-proposal:create:${Buffer.from(JSON.stringify(value)).toString("base64url")}`;

export function appendVisitServiceProposalOptions({ database, actor, target, result, now, residentId }) {
    const ownerResidentId = target?.doorbellMcpMigration?.residentId;
    if (!database || !residentId || !ownerResidentId || !actor || !target || actor.id === target.id ||
        !reachable(actor) || !reachable(target) || result.json?.ok !== true) return result;
    const sources = serviceProposalSources(target, ownerResidentId);
    if (!sources.length) return result;
    const levels = new Map(database.prepare(`SELECT career, MAX(qualification_level) AS level
      FROM career_certificates WHERE resident_id=? AND status='active' AND (effective_at IS NULL OR effective_at<=?)
        AND career IN ('agronomist','veterinarian') GROUP BY career`).all(residentId, now)
        .map(row => [row.career, row.level]));
    const qualified = sources.filter(source => (levels.get(source.career) ?? 0) >= source.requiredLevel &&
        observationText(source.fact.observations));
    if (!qualified.length) return result;
    const ids = JSON.stringify(qualified.map(source => source.sourceId));
    const latestJobs = new Map();
    for (const row of database.prepare(`SELECT source_id,career,status FROM career_jobs
      WHERE source_id IN (SELECT value FROM json_each(?))
      ORDER BY created_at DESC, rowid DESC`).all(ids)) {
        const key = `${row.career}:${row.source_id}`;
        if (!latestJobs.has(key)) latestJobs.set(key, row.status);
    }
    const latestOffers = new Map();
    for (const row of database.prepare(`SELECT source_id,career,proposal_id,status FROM career_service_proposals
      WHERE actor_resident_id=? AND owner_resident_id=? AND source_id IN (SELECT value FROM json_each(?))
      ORDER BY created_at DESC, rowid DESC`).all(residentId, ownerResidentId, ids)) {
        const key = `${row.career}:${row.source_id}`;
        if (!latestOffers.has(key)) latestOffers.set(key, row);
    }
    const candidates = qualified.filter(source => {
        const latest = latestJobs.get(`${source.career}:${source.sourceId}`);
        return !latest || latest === "cancelled";
    }).map(source => {
        const prior = latestOffers.get(`${source.career}:${source.sourceId}`);
        const proposalId = prior?.status === "pending" ? prior.proposal_id : `proposal-${createHash("sha256")
            .update(JSON.stringify([residentId, ownerResidentId, source.career, source.sourceId, prior?.proposal_id ?? null]))
            .digest("hex").slice(0, 32)}`;
        return { source, proposalId, internal: createOption({ proposalId, ownerFarmId: target.id,
            sourceId: source.sourceId, career: source.career }) };
    });
    const lines = [];
    for (const career of ["agronomist", "veterinarian"]) {
        const selected = candidates.filter(candidate => candidate.source.career === career);
        const op = operationFor(career);
        const handles = optionHandles(database, residentId, op, selected.map(candidate => candidate.internal), now);
        for (const [index, { source }] of selected.entries()) {
            const observation = observationText(source.fact.observations);
            const animal = target.ranch?.animals?.[source.fact.animalIndex];
            const name = animal?.name || animalById.get(animal?.kindId)?.name || "牧场动物";
            const subject = career === "agronomist" ? `第${source.fact.plotId}块地` : name;
            const label = career === "agronomist" ? "提出处理" : "提出接诊";
            lines.push(`${subject}${observation}。${label}：${handles[index]}　→ ${call(op, handles[index])}`);
        }
    }
    if (lines.length) result.json.text += `\n\n${lines.join("\n")}`;
    return result;
}
