import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CAREERS = ["chef", "agronomist", "veterinarian", "reporter", "constable"];
const VERSION = "career-curriculum-2026-08-27.1";
const BLOCKED = Object.freeze({
    chef: { courses: new Set(["4:3"]), exams: new Set([4]) },
    agronomist: { courses: new Set(), exams: new Set() },
    veterinarian: { courses: new Set(["3:1", "4:2"]), exams: new Set([3, 4]) },
    reporter: { courses: new Set(["4:3"]), exams: new Set([4]) },
    constable: { courses: new Set(["4:2", "4:3"]), exams: new Set([4]) },
});

function levelFromHeading(line) {
    if (!/^#\s+[^#]/u.test(line)) return null;
    if (line.includes("初级")) return 1;
    if (line.includes("中级")) return 2;
    if (line.includes("高级")) return 3;
    if (line.includes("特级")) return 4;
    return null;
}

function cleanExplanation(value) {
    return value.trim().replace(/^解释：/u, "").trim();
}

function parseQuestions(lines, expectedCount, prefix) {
    const questions = [];
    let current = null;
    let currentOption = null;

    const finish = () => {
        if (!current) return;
        current.stem = current.stem.join("\n").trim();
        for (const key of ["A", "B", "C", "D"]) {
            current.options[key] = (current.options[key] ?? []).join("\n").trim();
            if (!current.options[key]) throw new Error(`${prefix} question ${current.number} misses option ${key}`);
        }
        if (!current.answer) throw new Error(`${prefix} question ${current.number} misses its answer`);
        if (!current.explanation) throw new Error(`${prefix} question ${current.number} misses its explanation`);
        current.id = `${prefix}.${current.number}`;
        questions.push(current);
        current = null;
        currentOption = null;
    };

    for (const line of lines) {
        const questionMatch = /^(?:####\s+)?(\d+)\.\s+(.+)$/u.exec(line);
        if (questionMatch) {
            finish();
            current = {
                number: Number(questionMatch[1]),
                stem: [questionMatch[2]],
                options: {},
                answer: null,
                explanation: "",
            };
            continue;
        }
        if (!current) continue;
        const optionMatch = /^\s*(?:-\s*)?(?:\*\*)?([ABCD])\.(?:\*\*)?\s*(.+)$/u.exec(line);
        if (optionMatch) {
            currentOption = optionMatch[1];
            current.options[currentOption] = [optionMatch[2]];
            continue;
        }
        const answerMatch = /^\s*-?\s*\*\*答案：([ABCD])。\*\*\s*(.*)$/u.exec(line);
        if (answerMatch) {
            current.answer = answerMatch[1];
            current.explanation = cleanExplanation(answerMatch[2]);
            currentOption = null;
            continue;
        }
        if (current.answer && line.trim()) {
            current.explanation = `${current.explanation}\n${line.trim()}`.trim();
        } else if (currentOption && line.trim()) {
            current.options[currentOption].push(line.trim());
        } else if (!currentOption) {
            current.stem.push(line);
        }
    }
    finish();

    if (questions.length !== expectedCount) {
        throw new Error(`${prefix} expected ${expectedCount} questions, got ${questions.length}`);
    }
    for (let index = 0; index < questions.length; index += 1) {
        if (questions[index].number !== index + 1) {
            throw new Error(`${prefix} question order is not contiguous at ${questions[index].number}`);
        }
    }
    if (expectedCount === 20) {
        const distribution = Object.fromEntries(["A", "B", "C", "D"].map((key) => [
            key,
            questions.filter((question) => question.answer === key).length,
        ]));
        if (Object.values(distribution).some((count) => count !== 5)) {
            throw new Error(`${prefix} answer distribution is not balanced: ${JSON.stringify(distribution)}`);
        }
    }
    return questions;
}

function nextSectionIndex(lines, start) {
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^#{1,2}\s+/u.test(lines[index])) return index;
    }
    return lines.length;
}

function parseCareer(career, markdown) {
    const lines = markdown.split(/\r?\n/u);
    const courses = [];
    const exams = [];
    const courseCountByLevel = new Map();
    let level = null;

    for (let index = 0; index < lines.length; index += 1) {
        const nextLevel = levelFromHeading(lines[index]);
        if (nextLevel !== null) {
            level = nextLevel;
            continue;
        }
        if (level === null) continue;

        const courseMatch = /^##\s+.*《(.+)》\s*$/u.exec(lines[index]);
        if (courseMatch) {
            const courseIndex = (courseCountByLevel.get(level) ?? 0) + 1;
            courseCountByLevel.set(level, courseIndex);
            const end = nextSectionIndex(lines, index);
            const body = lines.slice(index + 1, end);
            const practiceIndex = body.findIndex((line) => /^###\s+(?:课程练习|依赖边界校核)/u.test(line));
            if (practiceIndex < 0) throw new Error(`${career} ${level}:${courseIndex} misses course practice`);
            const questions = parseQuestions(
                body.slice(practiceIndex + 1),
                5,
                `course.${career}.${level}.${courseIndex}.practice`,
            );
            const available = !BLOCKED[career].courses.has(`${level}:${courseIndex}`);
            courses.push({
                career,
                level,
                courseIndex,
                title: `《${courseMatch[1]}》`,
                available,
                ...(available
                    ? {
                        contentMarkdown: body.slice(0, practiceIndex).join("\n").trim(),
                        practiceQuestions: questions,
                    }
                    : { blockedReason: "PRODUCT_CONTRACT_PENDING" }),
            });
            index = end - 1;
            continue;
        }

        if (/^##\s+.*资格考试（20\s*题）/u.test(lines[index])) {
            const end = nextSectionIndex(lines, index);
            const questions = parseQuestions(
                lines.slice(index + 1, end),
                20,
                `exam.${career}.${level}`,
            );
            const available = !BLOCKED[career].exams.has(level);
            exams.push({
                career,
                level,
                available,
                ...(available ? { questions } : { blockedReason: "PRODUCT_CONTRACT_PENDING" }),
            });
            index = end - 1;
        }
    }

    if (courses.length !== 12) throw new Error(`${career} expected 12 courses, got ${courses.length}`);
    if (exams.length !== 4) throw new Error(`${career} expected four exams, got ${exams.length}`);
    return { courses, exams };
}

const sourceDirectory = resolve(process.argv[2] ?? "docs/career-curriculum-drafts");
const outputPath = resolve(process.argv[3] ?? "content/career-curriculum.json");
const parsed = [];
for (const career of CAREERS) {
    parsed.push(parseCareer(career, await readFile(resolve(sourceDirectory, `${career}.md`), "utf8")));
}

const result = {
    version: VERSION,
    careers: Object.fromEntries(parsed.map((entry, index) => [CAREERS[index], entry])),
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
    outputPath,
    version: VERSION,
    courses: parsed.reduce((total, entry) => total + entry.courses.length, 0),
    practiceQuestions: parsed.reduce((total, entry) => total + entry.courses.reduce((sum, course) => sum + (course.practiceQuestions?.length ?? 0), 0), 0),
    exams: parsed.reduce((total, entry) => total + entry.exams.length, 0),
    examQuestions: parsed.reduce((total, entry) => total + entry.exams.reduce((sum, exam) => sum + (exam.questions?.length ?? 0), 0), 0),
}));
