import { readFarm } from "../store.js";
import { animalById } from "../content.js";
import { reachable } from "../server/farm/social.js";
import { observationText } from "../server/bulletin-health-notices.js";
import { serviceProposalSources, recordServiceProposalSource, boundSourceCanPublish, publicCommissionSource } from "./p3-commission-runtime.js";

function required(value) {
    if (typeof value !== "string" || !value) throw new TypeError("proposal identity required");
    return value;
}
function proposalRow(database, proposalId) {
    return database.prepare("SELECT * FROM career_service_proposals WHERE proposal_id=?").get(required(proposalId));
}
function residentForFarm(database, farm) {
    const binding = farm?.doorbellMcpMigration?.migrationId;
    if (!binding) return null;
    return database.prepare("SELECT resident_id FROM residents WHERE binding_reference=?").get(binding)?.resident_id ?? null;
}
function projectProposal(database, row, residentId, knownObservations) {
    if (!row || ![row.owner_resident_id, row.actor_resident_id].includes(residentId))
        throw new Error("proposal_not_available");
    const observations = knownObservations ?? database.prepare(`SELECT observation FROM career_service_proposal_observations
      WHERE proposal_id=? ORDER BY observation`).all(row.proposal_id).map(entry => entry.observation);
    return { proposalId: row.proposal_id, ownerFarmId: row.owner_farm_id, actorFarmId: row.actor_farm_id,
        ownerResidentId: row.owner_resident_id, actorResidentId: row.actor_resident_id,
        career: row.career, sourceId: row.source_id, currency: row.currency, amount: row.amount,
        status: row.status, statusReason: row.status_reason, jobId: row.job_id, observations,
        subjectText: row.subject_text, observationText: row.observation_text };
}
function queueFact(database, proposalId, recipient, kind, now) {
    database.prepare(`INSERT OR IGNORE INTO career_service_proposal_notification_facts
      (notification_id,proposal_id,recipient_resident_id,kind,occurred_at) VALUES (?,?,?,?,?)`)
      .run(`proposal:${proposalId}:${kind}:${recipient}`, proposalId, recipient, kind, now);
}
function quoteFor(source, quote, now) {
    const price = quote(source, now);
    const currency = source.career === "veterinarian" ? "gold" : "silver";
    const amount = currency === "gold" ? price.baseFeeGold : price.laborSilver;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("proposal_quote_unavailable");
    return { currency, amount };
}

export function createServiceProposalRuntime({ database, transaction, authorizeVisit, qualified, quote, publish }) {
    if (!database || ![transaction, authorizeVisit, qualified, quote, publish].every(fn => typeof fn === "function"))
        throw new TypeError("proposal authority is incomplete");
    function sourceFor(ownerFarm, ownerResidentId, career, sourceId, now) {
        return serviceProposalSources(ownerFarm, ownerResidentId)
            .find(source => source.career === career && source.sourceId === sourceId) ?? null;
    }
    function proposalFacts(ownerFarm, source) {
        const observations = publicCommissionSource(source).fact.observations;
        const visible = observationText(observations).slice(1, -1);
        if (!visible) throw new Error("proposal_source_unavailable");
        if (source.career === "agronomist") return { observations, subjectText: String(source.fact.plotId), observationText: visible };
        const animal = ownerFarm.ranch?.animals?.[source.fact.animalIndex];
        const animalName = animal?.name || animalById.get(animal?.kindId)?.name || "牧场动物";
        return { observations, subjectText: animalName, observationText: visible };
    }
    function create(input, now) {
        const proposalId = required(input?.proposalId);
        const actorResidentId = required(input.actorResidentId);
        const ownerResidentId = required(input.ownerResidentId);
        const actorFarmId = required(input.actorFarmId);
        const ownerFarmId = required(input.ownerFarmId);
        const sourceId = required(input.sourceId);
        const career = input.career;
        if (!Number.isSafeInteger(now) || !["agronomist", "veterinarian"].includes(career))
            throw new TypeError("proposal time or career invalid");
        return transaction(() => {
            const prior = proposalRow(database, proposalId);
            if (prior) {
                if (prior.actor_resident_id !== actorResidentId || prior.owner_resident_id !== ownerResidentId ||
                    prior.actor_farm_id !== actorFarmId || prior.owner_farm_id !== ownerFarmId ||
                    prior.source_id !== sourceId || prior.career !== career) throw new Error("proposal_identity_conflict");
                return { ...projectProposal(database, prior, actorResidentId), replayed: true };
            }
            const actorFarm = readFarm(actorFarmId);
            const ownerFarm = readFarm(ownerFarmId);
            if (!actorFarm || !ownerFarm || actorFarmId === ownerFarmId || !reachable(actorFarm) || !reachable(ownerFarm) ||
                residentForFarm(database, actorFarm) !== actorResidentId ||
                residentForFarm(database, ownerFarm) !== ownerResidentId ||
                authorizeVisit(actorFarm, ownerFarm, input, now) !== true)
                throw new Error("proposal_actor_not_authorized");
            const source = sourceFor(ownerFarm, ownerResidentId, career, sourceId, now);
            if (!source || source.status !== "open" || !boundSourceCanPublish(database, source))
                throw new Error("proposal_source_unavailable");
            if (!qualified(actorResidentId, career, now, source.requiredLevel)) throw new Error("proposal_actor_not_authorized");
            const { currency, amount } = quoteFor(source, quote, now);
            const { subjectText, observationText, observations } = proposalFacts(ownerFarm, source);
            database.prepare(`INSERT INTO career_service_proposals
              (proposal_id,owner_farm_id,actor_farm_id,owner_resident_id,actor_resident_id,career,source_id,
               currency,amount,subject_text,observation_text,status,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
              .run(proposalId, ownerFarmId, actorFarmId, ownerResidentId, actorResidentId, career, sourceId,
                currency, amount, subjectText, observationText, now, now);
            const insert = database.prepare(`INSERT OR IGNORE INTO career_service_proposal_observations
              (proposal_id,observation) VALUES (?,?)`);
            for (const observation of observations) insert.run(proposalId, observation);
            queueFact(database, proposalId, ownerResidentId, "offer", now);
            const row = { proposal_id: proposalId, owner_farm_id: ownerFarmId, actor_farm_id: actorFarmId,
                owner_resident_id: ownerResidentId, actor_resident_id: actorResidentId, career, source_id: sourceId,
                currency, amount, status: "pending", status_reason: null, job_id: null,
                subject_text: subjectText, observation_text: observationText };
            return { ...projectProposal(database, row, actorResidentId, [...observations].sort()), replayed: false };
        });
    }
    function decide(input, now) {
        const proposalId = required(input?.proposalId);
        const residentId = required(input.residentId);
        if (!Number.isSafeInteger(now) || !["accept", "reject"].includes(input.decision))
            throw new TypeError("proposal decision invalid");
        return transaction(() => {
            const current = proposalRow(database, proposalId);
            if (!current || current.owner_resident_id !== residentId ||
                (input.career !== undefined && current.career !== input.career)) throw new Error("proposal_not_available");
            if (current.status !== "pending") return { ...projectProposal(database, current, residentId), replayed: true };
            if (input.decision === "reject") {
                database.prepare("UPDATE career_service_proposals SET status='rejected',updated_at=? WHERE proposal_id=? AND status='pending'")
                    .run(now, proposalId);
                queueFact(database, proposalId, current.actor_resident_id, "rejected", now);
                return { ...projectProposal(database, { ...current, status: "rejected" }, residentId), replayed: false };
            }
            const actorFarm = readFarm(current.actor_farm_id);
            const ownerFarm = readFarm(current.owner_farm_id);
            if (!actorFarm || !ownerFarm || !reachable(actorFarm) || !reachable(ownerFarm) ||
                residentForFarm(database, actorFarm) !== current.actor_resident_id ||
                residentForFarm(database, ownerFarm) !== residentId ||
                authorizeVisit(actorFarm, ownerFarm, current, now) !== true)
                throw new Error("proposal_actor_not_authorized");
            const source = sourceFor(ownerFarm, residentId, current.career, current.source_id, now);
            const available = source && source.status === "open" && boundSourceCanPublish(database, source);
            const updatedQuote = available ? quoteFor(source, quote, now) : null;
            const reason = !available ? "source_unavailable" :
                updatedQuote.currency !== current.currency || updatedQuote.amount !== current.amount ? "quote_changed" : null;
            if (reason) {
                database.prepare(`UPDATE career_service_proposals SET status='expired',status_reason=?,updated_at=?
                  WHERE proposal_id=? AND status='pending'`).run(reason, now, proposalId);
                return { ...projectProposal(database, { ...current, status: "expired", status_reason: reason }, residentId), replayed: false };
            } else {
                if (!qualified(current.actor_resident_id, current.career, now, source.requiredLevel))
                    throw new Error("proposal_actor_not_authorized");
                recordServiceProposalSource(database, source, now);
                const job = publish(source, { audience: "targeted", targetResidentId: current.actor_resident_id },
                    `proposal:${proposalId}:accept`, now);
                database.prepare(`UPDATE career_service_proposals SET status='accepted',job_id=?,updated_at=?
                  WHERE proposal_id=? AND status='pending'`).run(job.jobId, now, proposalId);
                queueFact(database, proposalId, current.actor_resident_id, "accepted", now);
                return { ...projectProposal(database, { ...current, status: "accepted", job_id: job.jobId }, residentId), replayed: false };
            }
        });
    }
    return Object.freeze({ create, decide, read: (id, residentId) => projectProposal(database, proposalRow(database, id), residentId) });
}
