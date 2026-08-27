import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CAREERS = ["chef", "agronomist", "veterinarian", "reporter", "constable"];
const VERSION = "career-curriculum-2026-08-27.1";
const GENERATOR_VERSION = 2;
const LEVELS = [1, 2, 3, 4];
const SOURCE_FILE_NAMES = CAREERS.map((career) => `${career}.md`);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function assertExactKeys(value, expectedKeys, label) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${label} has unexpected keys: ${actual.join(",")}`);
}

function assertNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new Error(`${label} must be a non-empty string`);
}

function approvalFromReadiness(entry) {
    return {
        textApproved: entry.text_approved,
        modelCopyApproved: entry.model_copy_approved,
        runtimeReady: entry.runtime_ready,
        blockedBy: [...entry.blocked_by],
    };
}

function readinessKey(entry) {
    return `${entry.kind}:${entry.career}:${entry.level}:${entry.kind === "course" ? entry.course_index : "exam"}`;
}

function validateReadinessManifest(readiness) {
    assertExactKeys(readiness, ["schema_version", "entries"], "career curriculum readiness");
    if (readiness.schema_version !== 1 || !Array.isArray(readiness.entries))
        throw new Error("career curriculum readiness schema is invalid");

    const seen = new Set();
    for (const [index, entry] of readiness.entries.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error(`career curriculum readiness entry ${index} must be an object`);
        if (entry.kind !== "course" && entry.kind !== "exam")
            throw new Error(`career curriculum readiness entry ${index} has an invalid kind`);
        assertExactKeys(entry, entry.kind === "course"
            ? ["kind", "career", "level", "course_index", "text_approved", "model_copy_approved", "runtime_ready", "blocked_by"]
            : ["kind", "career", "level", "text_approved", "model_copy_approved", "runtime_ready", "blocked_by"], `career curriculum readiness entry ${index}`);
        if (!CAREERS.includes(entry.career) || !LEVELS.includes(entry.level) ||
            (entry.kind === "course" && ![1, 2, 3].includes(entry.course_index)) ||
            typeof entry.text_approved !== "boolean" ||
            typeof entry.model_copy_approved !== "boolean" ||
            typeof entry.runtime_ready !== "boolean" ||
            !Array.isArray(entry.blocked_by) ||
            entry.blocked_by.some((value) => typeof value !== "string" || !value)) {
            throw new Error(`career curriculum readiness entry ${index} is invalid`);
        }
        const key = readinessKey(entry);
        if (seen.has(key)) throw new Error(`career curriculum readiness duplicates ${key}`);
        seen.add(key);
    }

    const expected = new Set();
    for (const career of CAREERS) {
        for (const level of LEVELS) {
            for (const courseIndex of [1, 2, 3])
                expected.add(`course:${career}:${level}:${courseIndex}`);
            expected.add(`exam:${career}:${level}:exam`);
        }
    }
    const missing = [...expected].filter((key) => !seen.has(key));
    const unexpected = [...seen].filter((key) => !expected.has(key));
    if (missing.length > 0 || unexpected.length > 0)
        throw new Error(`career curriculum readiness coverage mismatch: missing=${missing.join(",")} unexpected=${unexpected.join(",")}`);
}

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

function readinessEntry(readiness, kind, career, level, courseIndex) {
    const matches = readiness.entries.filter((entry) => entry.kind === kind &&
        entry.career === career && entry.level === level &&
        (kind === "exam" || entry.course_index === courseIndex));
    if (matches.length !== 1)
        throw new Error(`${kind} readiness must contain exactly one ${career}:${level}:${courseIndex ?? "exam"}`);
    const entry = matches[0];
    if (typeof entry.text_approved !== "boolean" ||
        typeof entry.model_copy_approved !== "boolean" ||
        typeof entry.runtime_ready !== "boolean" ||
        !Array.isArray(entry.blocked_by) || entry.blocked_by.some((value) => typeof value !== "string" || !value)) {
        throw new Error(`${kind} readiness is invalid for ${career}:${level}:${courseIndex ?? "exam"}`);
    }
    return entry;
}

function runtimeAvailable(entry) {
    return entry.text_approved && entry.model_copy_approved && entry.runtime_ready;
}

function parseCareer(career, markdown, readiness) {
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
            const gate = readinessEntry(readiness, "course", career, level, courseIndex);
            courses.push({
                career,
                level,
                courseIndex,
                title: `《${courseMatch[1]}》`,
                available: runtimeAvailable(gate),
                approval: approvalFromReadiness(gate),
                contentMarkdown: body.slice(0, practiceIndex).join("\n").trim(),
                practiceQuestions: questions,
            });
            index = end - 1;
            continue;
        }
    }

    if (courses.length !== 12) throw new Error(`${career} expected 12 courses, got ${courses.length}`);
    for (const examLevel of LEVELS) {
        const gate = readinessEntry(readiness, "exam", career, examLevel);
        exams.push({
            career,
            level: examLevel,
            available: false,
            approval: approvalFromReadiness(gate),
            blockedReason: runtimeAvailable(gate)
                ? "PRIVATE_EXAM_BANK_REQUIRED"
                : "RUNTIME_NOT_READY",
        });
    }
    return { courses, exams };
}

function assertApproval(actual, gate, label) {
    assertExactKeys(actual, ["textApproved", "modelCopyApproved", "runtimeReady", "blockedBy"], `${label} approval`);
    if (JSON.stringify(actual) !== JSON.stringify(approvalFromReadiness(gate)))
        throw new Error(`${label} approval differs from the readiness manifest`);
}

function assertPracticeQuestion(question, career, level, courseIndex, questionIndex) {
    const label = `${career} ${level}:${courseIndex} practice question ${questionIndex}`;
    assertExactKeys(question, ["number", "stem", "options", "answer", "explanation", "id"], label);
    if (question.number !== questionIndex ||
        question.id !== `course.${career}.${level}.${courseIndex}.practice.${questionIndex}` ||
        !["A", "B", "C", "D"].includes(question.answer)) {
        throw new Error(`${label} identity is invalid`);
    }
    assertNonEmptyString(question.stem, `${label} stem`);
    assertNonEmptyString(question.explanation, `${label} explanation`);
    assertExactKeys(question.options, ["A", "B", "C", "D"], `${label} options`);
    for (const key of ["A", "B", "C", "D"])
        assertNonEmptyString(question.options[key], `${label} option ${key}`);
}

function verifyPublicCurriculum(curriculum, readiness, readinessText) {
    validateReadinessManifest(readiness);
    assertExactKeys(curriculum, ["version", "build", "careers"], "public career curriculum");
    if (curriculum.version !== VERSION)
        throw new Error(`public career curriculum version must be ${VERSION}`);
    assertExactKeys(curriculum.build, ["generatorVersion", "sourceRepository", "sourceFiles", "readinessManifestSha256"], "public career curriculum build");
    if (curriculum.build.generatorVersion !== GENERATOR_VERSION ||
        curriculum.build.sourceRepository !== "doorbell-commons/main" ||
        curriculum.build.readinessManifestSha256 !== createHash("sha256").update(readinessText).digest("hex")) {
        throw new Error("public career curriculum build manifest is invalid");
    }
    assertExactKeys(curriculum.build.sourceFiles, SOURCE_FILE_NAMES, "public career curriculum source manifest");
    for (const fileName of SOURCE_FILE_NAMES) {
        if (!SHA256_PATTERN.test(curriculum.build.sourceFiles[fileName]))
            throw new Error(`public career curriculum source hash is invalid for ${fileName}`);
    }
    assertExactKeys(curriculum.careers, CAREERS, "public career curriculum careers");

    let courses = 0;
    let practiceQuestions = 0;
    let exams = 0;
    for (const career of CAREERS) {
        const entry = curriculum.careers[career];
        assertExactKeys(entry, ["courses", "exams"], `${career} public curriculum`);
        if (!Array.isArray(entry.courses) || entry.courses.length !== 12 ||
            !Array.isArray(entry.exams) || entry.exams.length !== 4) {
            throw new Error(`${career} public curriculum coverage is invalid`);
        }
        for (const level of LEVELS) {
            for (const courseIndex of [1, 2, 3]) {
                const course = entry.courses.find((candidate) => candidate.level === level && candidate.courseIndex === courseIndex);
                if (!course) throw new Error(`${career} public curriculum misses course ${level}:${courseIndex}`);
                const label = `${career} public course ${level}:${courseIndex}`;
                assertExactKeys(course, ["career", "level", "courseIndex", "title", "available", "approval", "contentMarkdown", "practiceQuestions"], label);
                const gate = readinessEntry(readiness, "course", career, level, courseIndex);
                if (course.career !== career || course.available !== runtimeAvailable(gate) ||
                    !Array.isArray(course.practiceQuestions) || course.practiceQuestions.length !== 5) {
                    throw new Error(`${label} does not match its manifest or practice contract`);
                }
                assertNonEmptyString(course.title, `${label} title`);
                assertNonEmptyString(course.contentMarkdown, `${label} content`);
                assertApproval(course.approval, gate, label);
                course.practiceQuestions.forEach((question, index) =>
                    assertPracticeQuestion(question, career, level, courseIndex, index + 1));
                courses += 1;
                practiceQuestions += course.practiceQuestions.length;
            }
            const exam = entry.exams.find((candidate) => candidate.level === level);
            if (!exam) throw new Error(`${career} public curriculum misses exam ${level}`);
            const label = `${career} public exam ${level}`;
            assertExactKeys(exam, ["career", "level", "available", "approval", "blockedReason"], label);
            const gate = readinessEntry(readiness, "exam", career, level);
            const expectedBlockedReason = runtimeAvailable(gate)
                ? "PRIVATE_EXAM_BANK_REQUIRED"
                : "RUNTIME_NOT_READY";
            if (exam.career !== career || exam.available !== false || exam.blockedReason !== expectedBlockedReason)
                throw new Error(`${label} must remain a closed questionless stub`);
            assertApproval(exam.approval, gate, label);
            exams += 1;
        }
    }
    return { courses, practiceQuestions, exams, examQuestions: 0 };
}

async function readReadiness(readinessPath) {
    const text = await readFile(readinessPath, "utf8");
    const readiness = JSON.parse(text);
    validateReadinessManifest(readiness);
    return { readiness, text };
}

async function generateCurriculum(sourceDirectory, outputPath, readinessPath) {
    const { readiness, text: readinessText } = await readReadiness(readinessPath);
    const parsed = [];
    const sourceFiles = {};
    for (const career of CAREERS) {
        const fileName = `${career}.md`;
        const source = await readFile(resolve(sourceDirectory, fileName), "utf8");
        sourceFiles[fileName] = createHash("sha256").update(source).digest("hex");
        parsed.push(parseCareer(career, source, readiness));
    }
    const result = {
        version: VERSION,
        build: {
            generatorVersion: GENERATOR_VERSION,
            sourceRepository: "doorbell-commons/main",
            sourceFiles,
            readinessManifestSha256: createHash("sha256").update(readinessText).digest("hex"),
        },
        careers: Object.fromEntries(parsed.map((entry, index) => [CAREERS[index], entry])),
    };
    const counts = verifyPublicCurriculum(result, readiness, readinessText);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ outputPath, version: VERSION, ...counts }));
}

async function verifyCommittedCurriculum(outputPath, readinessPath) {
    const { readiness, text: readinessText } = await readReadiness(readinessPath);
    const curriculum = JSON.parse(await readFile(outputPath, "utf8"));
    const counts = verifyPublicCurriculum(curriculum, readiness, readinessText);
    console.log(JSON.stringify({ outputPath, version: curriculum.version, verified: true, ...counts }));
}

if (process.argv[2] === "--verify-public") {
    await verifyCommittedCurriculum(
        resolve(process.argv[3] ?? "content/career-curriculum.json"),
        resolve(process.argv[4] ?? "content/career-curriculum-readiness.json"),
    );
} else {
    await generateCurriculum(
        resolve(process.argv[2] ?? "docs/career-curriculum-drafts"),
        resolve(process.argv[3] ?? "content/career-curriculum.json"),
        resolve(process.argv[4] ?? "content/career-curriculum-readiness.json"),
    );
}
