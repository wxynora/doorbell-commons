import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CareerDomainError } from "./contracts.js";

const CONTENT_PATH = process.env.AIFARM_CAREER_CURRICULUM_PATH
    ? resolve(process.env.AIFARM_CAREER_CURRICULUM_PATH)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../content/career-curriculum.json");
const COOKING_PATH = process.env.AIFARM_COOKING_CONTENT_PATH
    ? resolve(process.env.AIFARM_COOKING_CONTENT_PATH)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../content/cooking.json");

const curriculum = JSON.parse(readFileSync(CONTENT_PATH, "utf8"));
const cooking = JSON.parse(readFileSync(COOKING_PATH, "utf8"));
const ANSWER_VALUES = new Set(["A", "B", "C", "D"]);
const OPTION_KEYS = ["A", "B", "C", "D"];
const SAFE_PUBLIC_OPTION_PATTERN = /^(?:\d+(?:\.\d+)?%?|N|R|SR|SSR|SP|[BPS]=\d+(?:\.\d+)?|`[A-Z]-\d{2}`|\d{2}:\d{2})$/u;
const INTERNAL_TOKEN_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;

function unavailableAssessmentContent() {
    throw new CareerDomainError("assessment_content_not_available", "The private written exam bank is unavailable");
}

function nonEmptyText(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function modelVisibleStem(value) {
    return nonEmptyText(value) && /\p{Script=Han}/u.test(value) && !INTERNAL_TOKEN_PATTERN.test(value);
}

function modelVisibleOption(value) {
    if (!nonEmptyText(value) || INTERNAL_TOKEN_PATTERN.test(value))
        return false;
    const text = value.trim();
    return /\p{Script=Han}/u.test(text) || SAFE_PUBLIC_OPTION_PATTERN.test(text);
}

function validateFinalQuestion(question) {
    if (!question || typeof question !== "object" || Array.isArray(question) ||
        !nonEmptyText(question.id) || !modelVisibleStem(question.stem) ||
        !nonEmptyText(question.explanation) || !question.options ||
        typeof question.options !== "object" || Array.isArray(question.options) ||
        JSON.stringify(Object.keys(question.options).sort()) !== JSON.stringify([...OPTION_KEYS].sort())) {
        unavailableAssessmentContent();
    }
    const optionValues = OPTION_KEYS.map((key) => question.options[key]);
    if (optionValues.some((value) => !modelVisibleOption(value)) ||
        new Set(optionValues.map((value) => value.trim().normalize("NFKC"))).size !== OPTION_KEYS.length) {
        unavailableAssessmentContent();
    }
    try {
        normalizeAnswerSelection(question.answer);
    }
    catch {
        unavailableAssessmentContent();
    }
    return question;
}

function validateFinalQuestionSet(questions, expectedCount) {
    if (!Array.isArray(questions) || questions.length !== expectedCount)
        unavailableAssessmentContent();
    const ids = new Set();
    for (const question of questions) {
        validateFinalQuestion(question);
        if (ids.has(question.id)) unavailableAssessmentContent();
        ids.add(question.id);
    }
    return questions;
}

function normalizeAnswerSelection(value) {
    const raw = Array.isArray(value) ? value : [value];
    const normalized = raw.map((answer) => String(answer).trim().toUpperCase());
    if (normalized.length < 1 || normalized.length > ANSWER_VALUES.size ||
        normalized.some((answer) => !ANSWER_VALUES.has(answer)) ||
        new Set(normalized).size !== normalized.length) {
        throw new CareerDomainError("invalid_assessment_answers", "Every answer must contain one or more unique A-D choices");
    }
    return normalized.toSorted();
}

function findCourse(career, level, courseIndex) {
    return curriculum.careers[career]?.courses.find((course) =>
        course.level === level && course.courseIndex === courseIndex) ?? null;
}

function privateExamBank() {
    const path = process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
    if (!path)
        return null;
    const bank = JSON.parse(readFileSync(resolve(path), "utf8"));
    if (bank?.schemaVersion !== 1 || typeof bank.version !== "string" || !Array.isArray(bank.exams))
        throw new CareerDomainError("assessment_content_not_available", "The private written exam bank is unavailable");
    return bank;
}

function findExam(career, level) {
    const metadata = curriculum.careers[career]?.exams.find((exam) => exam.level === level) ?? null;
    if (!metadata || metadata.available !== true)
        return null;
    const bank = privateExamBank();
    const matches = bank?.exams.filter((exam) => exam.career === career && exam.level === level) ?? [];
    if (matches.length !== 1 || !Array.isArray(matches[0].questions) || matches[0].questions.length !== 20)
        unavailableAssessmentContent();
    validateFinalQuestionSet(matches[0].questions.map((question) =>
        question?.type === "existing_recipe_ingredients"
            ? expandExistingRecipeQuestion(question, "availability-check")
            : question), 20);
    return { ...metadata, ...matches[0], bankVersion: bank.version };
}

function requireAvailable(entry, kind) {
    if (!entry || entry.available !== true) {
        throw new CareerDomainError(
            "assessment_content_not_available",
            `The approved ${kind} content is not available`,
        );
    }
    return entry;
}

function publicQuestion(question) {
    return {
        id: question.id,
        stem: question.stem,
        options: { ...question.options },
    };
}

function stableOrder(value) {
    return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function expandExistingRecipeQuestion(template, attemptId) {
    if (typeof template.id !== "string" || !template.id ||
        typeof template.stemTemplate !== "string" || !template.stemTemplate.includes("{recipe}") ||
        typeof template.explanationTemplate !== "string" ||
        typeof template.optionSeparator !== "string" ||
        !Array.isArray(template.eligibleRecipeIds) || template.eligibleRecipeIds.length < 4) {
        throw new CareerDomainError("assessment_content_not_available", "The private written exam bank is unavailable");
    }
    const byId = new Map((cooking.recipes ?? []).map((recipe) => [recipe.id, recipe]));
    const ingredientsById = new Map([
        ...(cooking.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
        ...(cooking.products ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
    ]);
    const candidates = [...new Set(template.eligibleRecipeIds)].map((id) => byId.get(id));
    if (candidates.some((recipe) => !recipe || !Array.isArray(recipe.ingredients) ||
        recipe.ingredients.length === 0 || recipe.ingredients.some((id) => !ingredientsById.has(id)))) {
        throw new CareerDomainError("assessment_content_not_available", "The private written exam bank is unavailable");
    }
    const ordered = candidates.toSorted((left, right) =>
        stableOrder(`${attemptId}:${template.id}:target:${left.id}`)
            .localeCompare(stableOrder(`${attemptId}:${template.id}:target:${right.id}`)));
    const target = ordered[0];
    const distinct = [target];
    const targetComposition = target.ingredients.join("\0");
    for (const recipe of ordered.slice(1)) {
        const composition = recipe.ingredients.join("\0");
        if (composition === targetComposition || distinct.some((entry) => entry.ingredients.join("\0") === composition))
            continue;
        distinct.push(recipe);
        if (distinct.length === 4)
            break;
    }
    if (distinct.length !== 4)
        throw new CareerDomainError("assessment_content_not_available", "The private written exam bank is unavailable");
    const choices = distinct.toSorted((left, right) =>
        stableOrder(`${attemptId}:${template.id}:choice:${left.id}`)
            .localeCompare(stableOrder(`${attemptId}:${template.id}:choice:${right.id}`)));
    const labels = ["A", "B", "C", "D"];
    const options = Object.fromEntries(choices.map((recipe, index) => [
        labels[index],
        recipe.ingredients.map((id) => ingredientsById.get(id)).join(template.optionSeparator),
    ]));
    return {
        id: `${template.id}:${target.id}`,
        stem: template.stemTemplate.replaceAll("{recipe}", target.name),
        options,
        answer: labels[choices.indexOf(target)],
        explanation: template.explanationTemplate
            .replaceAll("{recipe}", target.name)
            .replaceAll("{ingredients}", options[labels[choices.indexOf(target)]]),
    };
}

function expandExamQuestion(question, attemptId) {
    if (question?.type === "existing_recipe_ingredients")
        return expandExistingRecipeQuestion(question, attemptId);
    return question;
}

function paperFromQuestions(kind, targetKey, questions, bankVersion = curriculum.version) {
    validateFinalQuestionSet(questions, kind === "written_exam" ? 20 : 5);
    const normalizedAnswers = questions.map((question) => normalizeAnswerSelection(question.answer));
    return {
        kind,
        targetKey,
        bankVersion,
        publicPaper: questions.map(publicQuestion),
        answerKey: normalizedAnswers,
        review: questions.map((question, index) => ({
            id: question.id,
            correctAnswer: normalizedAnswers[index],
            explanation: question.explanation,
        })),
    };
}

export const CAREER_CURRICULUM_VERSION = curriculum.version;

export function careerCourseAvailability(career, level, courseIndex) {
    return findCourse(career, level, courseIndex)?.available === true;
}

export function careerExamAvailability(career, level) {
    try {
        return findExam(career, level) !== null;
    }
    catch {
        return false;
    }
}

export function careerCourseContent(career, level, courseIndex) {
    const course = requireAvailable(findCourse(career, level, courseIndex), "course");
    return {
        career,
        level,
        courseIndex,
        title: course.title,
        contentMarkdown: course.contentMarkdown,
        bankVersion: curriculum.version,
    };
}

export function createCoursePracticePaper(career, level, courseIndex, residentId) {
    const course = requireAvailable(findCourse(career, level, courseIndex), "course practice");
    return paperFromQuestions(
        "course_practice",
        `course:${residentId}:${career}:${level}:${courseIndex}`,
        course.practiceQuestions,
    );
}

export function createWrittenExamPaper(career, level, attemptId) {
    const exam = requireAvailable(findExam(career, level), "written exam");
    return paperFromQuestions(
        "written_exam",
        `exam:${attemptId}`,
        exam.questions.map((question) => expandExamQuestion(question, attemptId)),
        exam.bankVersion,
    );
}

export function gradeAssessment(answerKey, answers) {
    if (!Array.isArray(answers) || answers.length !== answerKey.length) {
        throw new CareerDomainError("invalid_assessment_answers", "The submitted answer count is invalid");
    }
    const normalizedKey = answerKey.map(normalizeAnswerSelection);
    const normalized = answers.map(normalizeAnswerSelection);
    return {
        answers: normalized,
        correctAnswers: normalized.reduce(
            (total, answer, index) => total + Number(
                JSON.stringify(answer) === JSON.stringify(normalizedKey[index]),
            ),
            0,
        ),
    };
}

export function curriculumCatalogAvailability() {
    return Object.fromEntries(Object.entries(curriculum.careers).map(([career, value]) => [
        career,
        {
            courses: value.courses.map((course) => ({
                level: course.level,
                courseIndex: course.courseIndex,
                available: course.available === true,
            })),
            exams: value.exams.map((exam) => ({
                level: exam.level,
                available: exam.available === true,
            })),
        },
    ]));
}
