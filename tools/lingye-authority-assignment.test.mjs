import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CareerAuthorityAssignmentService } from "../dist/career/authority-assignment.js";
import { CareerDomainError } from "../dist/career/contracts.js";
import { CareerJobService } from "../dist/career/job-service.js";

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const CAPACITY_BY_LEVEL = { 1: 1, 2: 2, 3: 4, 4: 6 };
const INSTITUTION_BY_CAREER = {
    veterinarian: "animal_hospital",
    constable: "public_security",
};

function createHarness() {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    let sequence = 0;
    const jobs = new CareerJobService({
        database,
        generateId: () => `authority-assignment-${++sequence}`,
        now: () => NOW,
    });
    const authority = new CareerAuthorityAssignmentService({ database, jobs, now: () => NOW });
    return { authority, database, jobs };
}

function certify(database, residentId, career, level) {
    database
        .prepare(`INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
       VALUES (?, ?, 1, ?)`)
        .run(residentId, career, NOW);
    for (let qualificationLevel = 1; qualificationLevel <= level; qualificationLevel += 1) {
        database
            .prepare(`INSERT INTO career_certificates (
           resident_id, career, qualification_level, status,
           source_attempt_id, issued_at, effective_at
         ) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
            .run(
                residentId,
                career,
                qualificationLevel,
                `certificate:${residentId}:${career}:${qualificationLevel}`,
                NOW,
                NOW,
            );
    }
}

function scheduleDuty(database, residentId, career, level, seatNumber = 1) {
    const institution = INSTITUTION_BY_CAREER[career];
    const employmentId = `employment:${residentId}:${career}`;
    database
        .prepare(`INSERT INTO career_employments (
       employment_id, resident_id, career, institution, seat_number,
       status, availability, hired_at
     ) VALUES (?, ?, ?, ?, ?, 'active', 'available', ?)`)
        .run(employmentId, residentId, career, institution, seatNumber, NOW);
    database
        .prepare(`INSERT INTO career_duty_days (
       duty_id, employment_id, resident_id, career, institution, duty_date,
       qualification_level, base_wage_gold, status, generated_at
     ) VALUES (?, ?, ?, ?, ?, '2026-09-01', ?, 2000, 'scheduled', ?)`)
        .run(`duty:${residentId}:${career}`, employmentId, residentId, career, institution, level, NOW);
}

function createAssignedJob(jobs, career, suffix, requiredLevel = 1) {
    return jobs.createJob({
        assignmentMode: "assigned",
        career,
        difficultyLevel: requiredLevel,
        jobId: `${career}-job-${suffix}`,
        objectId: `${career}-object-${suffix}`,
        objectType: `${career}_case`,
        requiredLevel,
        sourceId: `${career}-source-${suffix}`,
        sourceType: `${career}_request`,
    });
}

function assertCareerError(code) {
    return (error) => error instanceof CareerDomainError && error.code === code;
}

test("authority assignment rejects a resident-selected worker and deterministically replays its choice", () => {
    const harness = createHarness();
    try {
        for (const [residentId, seatNumber] of [
            ["veterinarian-a", 1],
            ["veterinarian-b", 2],
        ]) {
            certify(harness.database, residentId, "veterinarian", 1);
            scheduleDuty(harness.database, residentId, "veterinarian", 1, seatNumber);
        }
        createAssignedJob(harness.jobs, "veterinarian", "one");

        assert.throws(
            () => harness.jobs.assignJob("veterinarian-job-one", "veterinarian-b"),
            assertCareerError("authoritative_assignment_required"),
        );
        assert.throws(
            () =>
                harness.authority.assignJob({
                    jobId: "veterinarian-job-one",
                    workerResidentId: "veterinarian-b",
                }),
            assertCareerError("invalid_authority_assignment_request"),
        );

        const first = harness.authority.assignJob({ jobId: "veterinarian-job-one" });
        assert.equal(first.workerResidentId, "veterinarian-a");
        assert.deepEqual(harness.authority.assignJob({ jobId: "veterinarian-job-one" }), first);

        createAssignedJob(harness.jobs, "veterinarian", "two");
        assert.equal(
            harness.authority.assignJob({ jobId: "veterinarian-job-two" }).workerResidentId,
            "veterinarian-b",
        );
        createAssignedJob(harness.jobs, "veterinarian", "three");
        assert.throws(
            () => harness.authority.assignJob({ jobId: "veterinarian-job-three" }),
            assertCareerError("authoritative_worker_unavailable"),
        );
    }
    finally {
        harness.database.close();
    }
});

test("veterinarian and constable authority assignment enforce capacities 1, 2, 4, and 6", () => {
    for (const career of ["veterinarian", "constable"]) {
        for (const level of [1, 2, 3, 4]) {
            const harness = createHarness();
            try {
                const residentId = `${career}-level-${level}`;
                certify(harness.database, residentId, career, level);
                scheduleDuty(harness.database, residentId, career, level);
                const capacity = CAPACITY_BY_LEVEL[level];
                for (let index = 1; index <= capacity; index += 1) {
                    createAssignedJob(harness.jobs, career, `${level}-${index}`, level);
                    assert.equal(
                        harness.authority.assignJob({ jobId: `${career}-job-${level}-${index}` })
                            .workerResidentId,
                        residentId,
                    );
                }
                createAssignedJob(harness.jobs, career, `${level}-overflow`, level);
                assert.throws(
                    () =>
                        harness.authority.assignJob({
                            jobId: `${career}-job-${level}-overflow`,
                        }),
                    assertCareerError("authoritative_worker_unavailable"),
                );
            }
            finally {
                harness.database.close();
            }
        }
    }
});

test("authority assignment requires both an active certificate and today's scheduled duty", () => {
    const uncertified = createHarness();
    try {
        scheduleDuty(uncertified.database, "uncertified-vet", "veterinarian", 1);
        createAssignedJob(uncertified.jobs, "veterinarian", "uncertified");
        assert.throws(
            () => uncertified.authority.assignJob({ jobId: "veterinarian-job-uncertified" }),
            assertCareerError("authoritative_worker_unavailable"),
        );
        certify(uncertified.database, "uncertified-vet", "veterinarian", 1);
        assert.equal(
            uncertified.authority.assignJob({ jobId: "veterinarian-job-uncertified" })
                .workerResidentId,
            "uncertified-vet",
        );
    }
    finally {
        uncertified.database.close();
    }

    const offDuty = createHarness();
    try {
        certify(offDuty.database, "off-duty-constable", "constable", 1);
        createAssignedJob(offDuty.jobs, "constable", "off-duty");
        assert.throws(
            () => offDuty.authority.assignJob({ jobId: "constable-job-off-duty" }),
            assertCareerError("authoritative_worker_unavailable"),
        );
        scheduleDuty(offDuty.database, "off-duty-constable", "constable", 1);
        assert.equal(
            offDuty.authority.assignJob({ jobId: "constable-job-off-duty" }).workerResidentId,
            "off-duty-constable",
        );
    }
    finally {
        offDuty.database.close();
    }
});
