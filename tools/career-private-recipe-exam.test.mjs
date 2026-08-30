import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("private written exams freeze one deterministic question from authoritative recipe data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aifarm-private-recipe-exam-"));
    const curriculumPath = join(directory, "curriculum.json");
    const bankPath = join(directory, "private-bank.json");
    const cookingPath = join(directory, "cooking.json");
    const careers = Object.fromEntries(["chef", "agronomist", "veterinarian", "reporter", "constable"]
        .map((career) => [career, {
            courses: [],
            exams: career === "chef" ? [{ level: 1, available: true }] : [],
        }]));
    writeFileSync(curriculumPath, JSON.stringify({ version: "public-test-v1", careers }));
    writeFileSync(cookingPath, JSON.stringify({
        ingredients: [
            { id: "a", name: "番茄" },
            { id: "b", name: "鸡蛋" },
            { id: "c", name: "土豆" },
            { id: "d", name: "牛奶" },
            { id: "e", name: "蜂蜜" },
        ],
        products: [],
        recipes: [
            { id: "r1", name: "番茄炒蛋", ingredients: ["a", "b"] },
            { id: "r2", name: "番茄炖土豆", ingredients: ["a", "c"] },
            { id: "r3", name: "鸡蛋牛奶羹", ingredients: ["b", "d"] },
            { id: "r4", name: "蜂蜜土豆泥", ingredients: ["c", "e"] },
        ],
    }));
    const staticQuestions = Array.from({ length: 19 }, (_, index) => ({
        id: `static-${index + 1}`,
        stem: `静态题目 ${index + 1}`,
        options: { A: "选项甲", B: "选项乙", C: "选项丙", D: "选项丁" },
        answer: index === 0 ? ["A", "C"] : ["A"],
        explanation: "静态题目解析",
    }));
    writeFileSync(bankPath, JSON.stringify({
        schemaVersion: 1,
        version: "private-test-v1",
        exams: [{
            career: "chef",
            level: 1,
            questions: [...staticQuestions, {
                type: "existing_recipe_ingredients",
                id: "recipe-composition",
                stemTemplate: "料理 {recipe} 的正确食材组合是什么？",
                explanationTemplate: "料理 {recipe} 使用：{ingredients}",
                optionSeparator: "+",
                eligibleRecipeIds: ["r1", "r2", "r3", "r4"],
            }],
        }],
    }));
    process.env.AIFARM_CAREER_CURRICULUM_PATH = curriculumPath;
    process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH = bankPath;
    process.env.AIFARM_COOKING_CONTENT_PATH = cookingPath;
    try {
        const curriculum = await import(`../dist/career/curriculum.js?recipe-test=${Date.now()}`);
        const first = curriculum.createWrittenExamPaper("chef", 1, "attempt-1");
        const replay = curriculum.createWrittenExamPaper("chef", 1, "attempt-1");
        assert.deepEqual(replay, first);
        assert.equal(first.bankVersion, "private-test-v1");
        assert.equal(first.publicPaper.length, 20);
        assert.equal(first.answerKey.length, 20);
        const dynamic = first.publicPaper.at(-1);
        assert.match(dynamic.id, /^recipe-composition:r[1-4]$/u);
        assert.match(dynamic.stem, /^料理 .+ 的正确食材组合是什么？$/u);
        assert.deepEqual(Object.keys(dynamic.options), ["A", "B", "C", "D"]);
        assert.equal(Object.hasOwn(dynamic, "answer"), false);
        assert.equal(Object.hasOwn(dynamic, "explanation"), false);
        assert.ok(["番茄+鸡蛋", "番茄+土豆", "鸡蛋+牛奶", "土豆+蜂蜜"]
            .includes(dynamic.options[first.answerKey.at(-1)[0]]));
    }
    finally {
        delete process.env.AIFARM_CAREER_CURRICULUM_PATH;
        delete process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
        delete process.env.AIFARM_COOKING_CONTENT_PATH;
        rmSync(directory, { recursive: true, force: true });
    }
});

test("all twenty ready levels become available only with matching private papers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aifarm-private-ready-exams-"));
    const bankPath = join(directory, "private-bank.json");
    const questions = Array.from({ length: 20 }, (_, index) => ({
        id: `ready-question-${index + 1}`,
        stem: `就绪题目 ${index + 1}`,
        options: { A: "选项甲", B: "选项乙", C: "选项丙", D: "选项丁" },
        answer: [["A"], ["B"], ["C"], ["D"]][index % 4],
        explanation: "私有试题解析",
    }));
    const openExams = Object.freeze(Object.fromEntries(
        ["chef", "agronomist", "veterinarian", "reporter", "constable"]
            .map((career) => [career, new Set([1, 2, 3, 4])]),
    ));
    const openCareers = Object.keys(openExams);
    writeFileSync(bankPath, JSON.stringify({
        schemaVersion: 1,
        version: "private-ready-v1",
        exams: openCareers.flatMap((career) => [1, 2, 3, 4].map((level) => ({
            career,
            level,
            questions,
        }))),
    }));
    process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH = bankPath;
    try {
        const curriculum = await import(`../dist/career/curriculum.js?ready-test=${Date.now()}`);
        for (const career of openCareers) {
            assert.equal(curriculum.careerCourseAvailability(career, 1, 1), true);
            for (const level of [1, 2, 3, 4]) {
                const available = openExams[career].has(level);
                assert.equal(curriculum.careerExamAvailability(career, level), available);
                if (available) {
                    assert.equal(curriculum.createWrittenExamPaper(career, level,
                        `attempt-${career}-${level}`).publicPaper.length, 20);
                }
            }
        }
        assert.equal(curriculum.careerCourseAvailability("chef", 3, 1), true);
        assert.equal(curriculum.careerCourseAvailability("chef", 3, 2), true);
        assert.equal(curriculum.careerCourseAvailability("agronomist", 2, 1), true);
        assert.equal(curriculum.careerCourseAvailability("agronomist", 2, 3), true);
        assert.equal(curriculum.careerCourseAvailability("veterinarian", 3, 1), true);
        assert.equal(curriculum.careerCourseAvailability("veterinarian", 3, 3), true);
        assert.equal(curriculum.careerCourseAvailability("constable", 4, 1), true);
        assert.equal(curriculum.careerCourseAvailability("constable", 4, 2), true);
        assert.equal(curriculum.careerCourseAvailability("reporter", 1, 1), true);
        assert.equal(Object.entries(openExams).every(([career, levels]) =>
            [...levels].every((level) => curriculum.careerExamAvailability(career, level))), true);
    }
    finally {
        delete process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
        rmSync(directory, { recursive: true, force: true });
    }
});

test("runtime rejects every incomplete or non-displayable private written paper", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aifarm-private-invalid-exams-"));
    const baseQuestions = Array.from({ length: 20 }, (_, index) => ({
        id: `question-${index + 1}`,
        stem: `完整题目 ${index + 1}`,
        options: { A: "选项甲", B: "选项乙", C: "选项丙", D: "选项丁" },
        answer: ["A"],
        explanation: "完整解析",
    }));
    const cases = [
        ["missing-option", (questions) => { delete questions[0].options.D; }],
        ["empty-option", (questions) => { questions[0].options.D = ""; }],
        ["duplicate-option", (questions) => { questions[0].options.D = "选项甲"; }],
        ["missing-stem", (questions) => { delete questions[0].stem; }],
        ["empty-explanation", (questions) => { questions[0].explanation = ""; }],
        ["duplicate-id", (questions) => { questions[1].id = questions[0].id; }],
        ["internal-token", (questions) => { questions[0].options.A = "resident_id"; }],
    ];
    try {
        for (const [name, mutate] of cases) {
            const questions = structuredClone(baseQuestions);
            mutate(questions);
            const bankPath = join(directory, `${name}.json`);
            writeFileSync(bankPath, JSON.stringify({
                schemaVersion: 1,
                version: `private-${name}`,
                exams: [{ career: "chef", level: 1, questions }],
            }));
            process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH = bankPath;
            const curriculum = await import(`../dist/career/curriculum.js?invalid=${name}-${Date.now()}`);
            assert.equal(curriculum.careerExamAvailability("chef", 1), false, name);
            assert.throws(() => curriculum.createWrittenExamPaper("chef", 1, `attempt-${name}`),
                /private written exam bank is unavailable/u, name);
        }
    }
    finally {
        delete process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
        rmSync(directory, { recursive: true, force: true });
    }
});
