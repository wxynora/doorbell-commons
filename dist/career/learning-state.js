import { CareerDomainError, COURSE_TUITION_GOLD } from "./contracts.js";
import { runInTransaction } from "./persistence.js";

export function careerLearningGeneration(database, residentId, career) {
    return database.prepare("SELECT generation FROM career_tracks WHERE resident_id = ? AND career = ?")
        .get(residentId, career)?.generation ?? 0;
}

export function careerCourseTuition(database, residentId, career, level) {
    const track = database.prepare(`SELECT tuition_discount FROM career_tracks
      WHERE resident_id = ? AND career = ? AND track_order IS NOT NULL`).get(residentId, career);
    return COURSE_TUITION_GOLD[level] * (level === 1 && track?.tuition_discount === 1 ? 0.5 : 1);
}

export function careerCourseBusinessReference(database, input) {
    const generation = careerLearningGeneration(database, input.residentId, input.career);
    const original = `career-course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
    return generation === 0 ? original : `${original}:generation:${generation}`;
}

// Historical jobs and their settlement stay intact. Tag only at a career boundary;
// work subsequently earned in the active generation remains eligible until that boundary.
function captureProgress(database, residentId, career, generation) {
    database.prepare(`INSERT OR IGNORE INTO career_progress_records
      (resident_id, career, source_kind, record_id, generation)
      SELECT resident_id, career, 'work', work_record_id, ? FROM career_work_records
      WHERE resident_id = ? AND career = ?`).run(generation, residentId, career);
    if (career === "chef" && database.prepare(`SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'chef_recipe_production_commissions'`).get()) {
        database.prepare(`INSERT OR IGNORE INTO career_progress_records
          (resident_id, career, source_kind, record_id, generation)
          SELECT cook_resident_id, 'chef', 'chef_production', cooking_receipt_id, ?
          FROM chef_recipe_production_commissions WHERE cook_resident_id = ?`).run(generation, residentId);
    }
}

export function careerProgressPredicate(alias, kind) {
    if (!/^[a-z_]+$/u.test(alias) || !["work", "chef_production"].includes(kind))
        throw new Error("Invalid career progress query");
    const resident = `${alias}.${kind === "work" ? "resident_id" : "cook_resident_id"}`;
    const career = kind === "work" ? `${alias}.career` : "'chef'";
    const record = `${alias}.${kind === "work" ? "work_record_id" : "cooking_receipt_id"}`;
    return `EXISTS (SELECT 1 FROM career_tracks AS progress_track
      WHERE progress_track.resident_id = ${resident} AND progress_track.career = ${career}
        AND progress_track.track_order IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM career_progress_records AS progress_record
          WHERE progress_record.resident_id = ${resident} AND progress_record.career = ${career}
            AND progress_record.source_kind = '${kind}' AND progress_record.record_id = ${record}
            AND progress_record.generation <> progress_track.generation))`;
}

export function activateCareerTrack(database, residentId, career, trackOrder, now, discount) {
    const old = database.prepare("SELECT * FROM career_tracks WHERE resident_id = ? AND career = ?")
        .get(residentId, career);
    if (old?.track_order !== null && old !== undefined)
        throw new CareerDomainError("career_already_selected", "The career is already active");
    captureProgress(database, residentId, career, -1);
    const archivedGeneration = database.prepare(`SELECT MAX(generation) AS generation
      FROM career_learning_archives WHERE resident_id = ? AND career = ?`).get(residentId, career).generation;
    const generation = old ? Math.max(old.generation, archivedGeneration ?? -1) + 1 : 0;
    database.prepare(`INSERT INTO career_tracks
      (resident_id, career, track_order, selected_at, generation, tuition_discount)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(resident_id, career) DO UPDATE SET track_order = excluded.track_order,
        selected_at = excluded.selected_at, generation = excluded.generation,
        tuition_discount = excluded.tuition_discount`)
        .run(residentId, career, trackOrder, now, generation, discount ? 1 : 0);
    return { career, trackOrder };
}

export function archiveLearningState(database, residentId, career, archiveId, now) {
    return runInTransaction(database, () => {
        const track = database.prepare(`SELECT * FROM career_tracks
          WHERE resident_id = ? AND career = ? AND track_order IS NOT NULL`).get(residentId, career);
        if (!track) throw new CareerDomainError("career_not_selected", "The career track is not selected");
        captureProgress(database, residentId, career, track.generation);
        const snapshot = {
            track,
            courses: database.prepare("SELECT * FROM career_courses WHERE resident_id = ? AND career = ?").all(residentId, career),
            certificates: database.prepare("SELECT * FROM career_certificates WHERE resident_id = ? AND career = ?").all(residentId, career),
            papers: database.prepare(`SELECT * FROM career_assessment_papers
              WHERE resident_id = ? AND career = ? AND kind = 'course_practice'`).all(residentId, career),
            submissions: database.prepare(`SELECT submission.* FROM career_assessment_submissions AS submission
              JOIN career_assessment_papers AS paper ON paper.paper_id = submission.paper_id
              WHERE paper.resident_id = ? AND paper.career = ? AND paper.kind = 'course_practice'`).all(residentId, career),
        };
        database.prepare(`INSERT INTO career_learning_archives
          (archive_id, resident_id, career, generation, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(archiveId, residentId, career, track.generation, JSON.stringify(snapshot), now);
        database.prepare(`DELETE FROM career_assessment_submissions WHERE paper_id IN (
          SELECT paper_id FROM career_assessment_papers
          WHERE resident_id = ? AND career = ? AND kind = 'course_practice')`).run(residentId, career);
        database.prepare(`DELETE FROM career_assessment_papers
          WHERE resident_id = ? AND career = ? AND kind = 'course_practice'`).run(residentId, career);
        database.prepare("DELETE FROM career_courses WHERE resident_id = ? AND career = ?").run(residentId, career);
        database.prepare("DELETE FROM career_certificates WHERE resident_id = ? AND career = ?").run(residentId, career);
        database.prepare("UPDATE career_tracks SET track_order = NULL WHERE resident_id = ? AND career = ?")
            .run(residentId, career);
        return { archiveId, career, trackOrder: track.track_order, generation: track.generation };
    });
}

export function restoreLearningState(database, archiveId, now) {
    return runInTransaction(database, () => {
        const archive = database.prepare("SELECT * FROM career_learning_archives WHERE archive_id = ?").get(archiveId);
        if (!archive) throw new Error("Career learning archive missing");
        const snapshot = JSON.parse(archive.snapshot_json);
        const track = snapshot.track;
        captureProgress(database, track.resident_id, track.career, -1);
        database.prepare(`UPDATE career_tracks SET track_order = ?, selected_at = ?, generation = ?, tuition_discount = ?
          WHERE resident_id = ? AND career = ?`)
            .run(track.track_order, track.selected_at, track.generation, track.tuition_discount, track.resident_id, track.career);
        const rows = [
            ["career_courses", snapshot.courses],
            ["career_assessment_papers", snapshot.papers],
            ["career_assessment_submissions", snapshot.submissions],
            ["career_certificates", snapshot.certificates.filter((certificate) => !database.prepare(`
              SELECT 1 FROM career_resignation_exam_refunds WHERE attempt_id = ?`).get(certificate.source_attempt_id))],
        ];
        for (const [table, records] of rows) {
            for (const record of records) {
                const columns = Object.keys(record);
                database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
                    .run(...columns.map((column) => record[column]));
            }
        }
        return { career: track.career, trackOrder: track.track_order, restoredAt: now };
    });
}
