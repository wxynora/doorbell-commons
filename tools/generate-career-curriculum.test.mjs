import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = resolve(root, "tools/generate-career-curriculum.mjs");
const careers = ["chef", "agronomist", "veterinarian", "reporter", "constable"];
const levelNames = ["初级", "中级", "高级", "特级"];
const committedOpenCourses = Object.freeze({
    chef: new Set(["1:1", "1:2", "1:3", "2:1", "2:2", "2:3", "3:2", "3:3", "4:1", "4:2"]),
    agronomist: new Set(["1:1", "1:2", "1:3", "2:3"]),
    veterinarian: new Set(["1:1", "1:2", "1:3", "2:1", "2:2", "2:3", "3:3", "4:1"]),
    reporter: new Set(),
    constable: new Set(["1:1", "1:2", "1:3", "2:1", "2:2", "2:3", "3:1", "3:2", "3:3", "4:1"]),
});
const committedOpenExams = Object.freeze({
    chef: new Set([1, 2]),
    agronomist: new Set([1]),
    veterinarian: new Set([1, 2]),
    reporter: new Set(),
    constable: new Set([1, 2, 3]),
});

function fixtureMarkdown(career) {
    const sections = [];
    for (const [levelIndex, levelName] of levelNames.entries()) {
        sections.push(`# ${levelName}`);
        for (let courseIndex = 1; courseIndex <= 3; courseIndex += 1) {
            sections.push(`## 课程《${career}-${levelIndex + 1}-${courseIndex}》`);
            sections.push(`这是 ${career} 第 ${levelIndex + 1} 级第 ${courseIndex} 门课程正文。`);
            sections.push("### 课程练习");
            for (let questionIndex = 1; questionIndex <= 5; questionIndex += 1) {
                sections.push(`${questionIndex}. 第 ${questionIndex} 道课程练习`);
                sections.push("A. 选项甲");
                sections.push("B. 选项乙");
                sections.push("C. 选项丙");
                sections.push("D. 选项丁");
                sections.push("**答案：A。** 解释：课程练习解析");
            }
        }
    }
    return `${sections.join("\n")}\n`;
}

function fixtureReadiness() {
    const entries = [];
    for (const career of careers) {
        for (const level of [1, 2, 3, 4]) {
            for (const courseIndex of [1, 2, 3]) {
                entries.push({
                    kind: "course",
                    career,
                    level,
                    course_index: courseIndex,
                    text_approved: true,
                    model_copy_approved: true,
                    runtime_ready: true,
                    blocked_by: [],
                });
            }
            entries.push({
                kind: "exam",
                career,
                level,
                text_approved: career !== "reporter",
                model_copy_approved: career !== "reporter",
                runtime_ready: career !== "reporter",
                blocked_by: career === "reporter" ? ["REPORTER_DAILY_REPORT_DEFERRED"] : [],
            });
        }
    }
    return { schema_version: 1, entries };
}

async function createFixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "aifarm-career-curriculum-"));
    const sourceDirectory = join(directory, "sources");
    const outputPath = join(directory, "career-curriculum.json");
    const readinessPath = join(directory, "readiness.json");
    await mkdir(sourceDirectory);
    await Promise.all(careers.map((career) =>
        writeFile(join(sourceDirectory, `${career}.md`), fixtureMarkdown(career), "utf8")));
    await writeFile(readinessPath, `${JSON.stringify(fixtureReadiness(), null, 2)}\n`, "utf8");
    t.after(() => rm(directory, { force: true, recursive: true }));
    return { directory, sourceDirectory, outputPath, readinessPath };
}

test("career curriculum generation is reproducible without the main checkout and publishes no exam bank", async (t) => {
    const fixture = await createFixture(t);
    await execute(process.execPath, [generator, fixture.sourceDirectory, fixture.outputPath, fixture.readinessPath]);
    const first = await readFile(fixture.outputPath, "utf8");
    await execute(process.execPath, [generator, fixture.sourceDirectory, fixture.outputPath, fixture.readinessPath]);
    const second = await readFile(fixture.outputPath, "utf8");
    assert.equal(second, first);

    const curriculum = JSON.parse(first);
    assert.deepEqual(Object.keys(curriculum.build.sourceFiles).sort(),
        careers.map((career) => `${career}.md`).sort());
    for (const career of careers) {
        assert.equal(curriculum.careers[career].courses.length, 12);
        assert.equal(curriculum.careers[career].courses
            .reduce((count, course) => count + course.practiceQuestions.length, 0), 60);
        assert.equal(curriculum.careers[career].exams.length, 4);
        for (const exam of curriculum.careers[career].exams) {
            assert.deepEqual(Object.keys(exam).sort(),
                ["approval", "available", "blockedReason", "career", "level"].sort());
            assert.equal(exam.available, career !== "reporter");
            assert.equal(exam.blockedReason, career === "reporter" ? "RUNTIME_NOT_READY" : null);
            assert.equal(Object.hasOwn(exam, "questions"), false);
        }
    }
});

test("career curriculum generation rejects duplicate readiness facts", async (t) => {
    const fixture = await createFixture(t);
    const readiness = fixtureReadiness();
    readiness.entries.push({ ...readiness.entries[0] });
    await writeFile(fixture.readinessPath, `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
    await assert.rejects(
        execute(process.execPath, [generator, fixture.sourceDirectory, fixture.outputPath, fixture.readinessPath]),
        /readiness duplicates/u,
    );
});

test("career curriculum generation rejects a ready exam before all three level courses are ready", async (t) => {
    const fixture = await createFixture(t);
    const readiness = fixtureReadiness();
    const blocked = readiness.entries.find((entry) =>
        entry.kind === "course" && entry.career === "chef" && entry.level === 1 && entry.course_index === 3);
    blocked.model_copy_approved = false;
    blocked.runtime_ready = false;
    blocked.blocked_by = ["TEST_RUNTIME_BLOCKER"];
    await writeFile(fixture.readinessPath, `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
    await assert.rejects(
        execute(process.execPath, [generator, fixture.sourceDirectory, fixture.outputPath, fixture.readinessPath]),
        /chef exam 1 cannot be ready before all level courses are ready/u,
    );
});

test("committed public curriculum matches its manifests and rejects exam question fields", async (t) => {
    const publicPath = resolve(root, "content/career-curriculum.json");
    const readinessPath = resolve(root, "content/career-curriculum-readiness.json");
    const verified = await execute(process.execPath, [generator, "--verify-public", publicPath, readinessPath]);
    assert.equal(JSON.parse(verified.stdout).verified, true);

    const committed = JSON.parse(await readFile(publicPath, "utf8"));
    for (const career of careers) {
        for (const course of committed.careers[career].courses) {
            assert.equal(
                course.available,
                committedOpenCourses[career].has(`${course.level}:${course.courseIndex}`),
                `${career} course ${course.level}:${course.courseIndex}`,
            );
        }
        for (const exam of committed.careers[career].exams) {
            assert.equal(
                exam.available,
                committedOpenExams[career].has(exam.level),
                `${career} exam ${exam.level}`,
            );
        }
    }

    const directory = await mkdtemp(join(tmpdir(), "aifarm-career-curriculum-leak-"));
    const leakedPath = join(directory, "career-curriculum.json");
    t.after(() => rm(directory, { force: true, recursive: true }));
    const leaked = JSON.parse(await readFile(publicPath, "utf8"));
    leaked.careers.chef.exams[0].questions = [];
    await writeFile(leakedPath, `${JSON.stringify(leaked, null, 2)}\n`, "utf8");
    await assert.rejects(
        execute(process.execPath, [generator, "--verify-public", leakedPath, readinessPath]),
        /unexpected keys/u,
    );
});
