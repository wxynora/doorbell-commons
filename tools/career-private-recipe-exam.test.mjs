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
            { id: "a", name: "A" },
            { id: "b", name: "B" },
            { id: "c", name: "C" },
            { id: "d", name: "D" },
            { id: "e", name: "E" },
        ],
        products: [],
        recipes: [
            { id: "r1", name: "R1", ingredients: ["a", "b"] },
            { id: "r2", name: "R2", ingredients: ["a", "c"] },
            { id: "r3", name: "R3", ingredients: ["b", "d"] },
            { id: "r4", name: "R4", ingredients: ["c", "e"] },
        ],
    }));
    const staticQuestions = Array.from({ length: 19 }, (_, index) => ({
        id: `static-${index + 1}`,
        stem: `Static ${index + 1}`,
        options: { A: "A", B: "B", C: "C", D: "D" },
        answer: "A",
        explanation: "Static explanation",
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
                stemTemplate: "Recipe {recipe}",
                explanationTemplate: "Recipe {recipe}: {ingredients}",
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
        assert.match(dynamic.stem, /^Recipe R[1-4]$/u);
        assert.deepEqual(Object.keys(dynamic.options), ["A", "B", "C", "D"]);
        assert.equal(Object.hasOwn(dynamic, "answer"), false);
        assert.equal(Object.hasOwn(dynamic, "explanation"), false);
        assert.ok(["A+B", "A+C", "B+D", "C+E"].includes(dynamic.options[first.answerKey.at(-1)]));
    }
    finally {
        delete process.env.AIFARM_CAREER_CURRICULUM_PATH;
        delete process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
        delete process.env.AIFARM_COOKING_CONTENT_PATH;
        rmSync(directory, { recursive: true, force: true });
    }
});
