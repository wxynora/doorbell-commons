import { CareerDomainError } from "./contracts.js";
const CONSTABLE_INTERVIEW_DIMENSIONS = ["facts", "restraint", "procedure", "explanation"];
import { createRequire } from "node:module";

// The question/fact bank stays outside this repository. Deployments may point
// this loader at a private CommonJS provider; absence intentionally leaves the
// interview unable to enter scoring or public notice.
export function loadConstableInterviewBank() {
    const modulePath = process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE;
    if (typeof modulePath !== "string" || modulePath.trim().length === 0)
        return undefined;
    try {
        const loaded = createRequire(import.meta.url)(modulePath);
        const provider = loaded?.default ?? loaded;
        if (!provider || typeof provider.getConstableInterviewPaper !== "function")
            throw new Error("invalid_provider");
        return provider;
    }
    catch {
        throw new Error("Constable interview bank configuration is invalid");
    }
}

function snapshotJson(value, field) {
    if (value === null || typeof value !== "object")
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    if ((Array.isArray(value) && value.length === 0) ||
        (!Array.isArray(value) && Object.keys(value).length === 0))
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    let serialized;
    try {
        serialized = JSON.stringify(value);
        if (!serialized)
            throw new Error("empty_snapshot");
        JSON.parse(serialized);
    }
    catch {
        throw new CareerDomainError("interview_material_not_configured", `The constable interview ${field} is unavailable`);
    }
    return serialized;
}

export function freezeConstableInterviewMaterial(provider, input) {
    if (!provider || typeof provider.getConstableInterviewPaper !== "function")
        return null;
    let material;
    try {
        material = provider.getConstableInterviewPaper(input);
    }
    catch {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
    }
    if (!material || typeof material !== "object" || Array.isArray(material) ||
        typeof material.bankVersion !== "string" || material.bankVersion.trim().length === 0) {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview material is unavailable");
    }
    const scoringStandard = material.scoringStandard;
    if (!scoringStandard || typeof scoringStandard !== "object" || Array.isArray(scoringStandard) ||
        typeof scoringStandard.version !== "string" || scoringStandard.version.trim().length === 0 ||
        !Array.isArray(scoringStandard.dimensions) ||
        scoringStandard.dimensions.length !== CONSTABLE_INTERVIEW_DIMENSIONS.length ||
        scoringStandard.dimensions.some((dimension, index) => dimension !== CONSTABLE_INTERVIEW_DIMENSIONS[index]) ||
        scoringStandard.minimumDimensionAverage !== 3 ||
        scoringStandard.minimumTotalAverage !== 16) {
        throw new CareerDomainError("interview_material_not_configured", "The constable interview scoring standard is unavailable");
    }
    return {
        bankVersion: material.bankVersion,
        paperSnapshotJson: snapshotJson(material.paper, "paper"),
        factMaterialSnapshotJson: snapshotJson(material.factMaterial, "fact material"),
        scoringStandardSnapshotJson: snapshotJson(scoringStandard, "scoring standard"),
    };
}


export function hydrateConstableInterviewMaterial(database, provider) {
    if (!provider) return;
    const rows = database.prepare(`SELECT interview.interview_id, interview.candidate_resident_id,
        interview.scheduled_at, attempt.qualification_level
      FROM career_constable_interviews interview JOIN career_exam_attempts attempt ON attempt.attempt_id = interview.attempt_id
      JOIN career_tracks track ON track.resident_id = attempt.resident_id AND track.career = attempt.career
        AND track.track_order IS NOT NULL AND track.generation = attempt.learning_generation
      WHERE interview.status IN ('signup_open','panel_ready','scoring')
        AND interview.interview_bank_version IS NULL AND interview.interview_paper_snapshot_json IS NULL
        AND interview.interview_fact_material_snapshot_json IS NULL AND interview.interview_scoring_standard_snapshot_json IS NULL
        AND NOT EXISTS (SELECT 1 FROM career_resignation_exam_refunds refund WHERE refund.attempt_id = attempt.attempt_id)`).all();
    for (const row of rows) {
        const material = freezeConstableInterviewMaterial(provider, {
            interviewId: row.interview_id, candidateResidentId: row.candidate_resident_id,
            scheduledAt: row.scheduled_at, qualificationLevel: row.qualification_level,
        });
        database.prepare(`UPDATE career_constable_interviews SET interview_bank_version = ?,
            interview_paper_snapshot_json = ?, interview_fact_material_snapshot_json = ?,
            interview_scoring_standard_snapshot_json = ? WHERE interview_id = ? AND interview_bank_version IS NULL`)
            .run(material.bankVersion, material.paperSnapshotJson, material.factMaterialSnapshotJson,
                material.scoringStandardSnapshotJson, row.interview_id);
    }
}
