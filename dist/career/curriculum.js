import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CareerDomainError } from "./contracts.js";

const CONTENT_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../content/career-curriculum.json",
);

const curriculum = JSON.parse(readFileSync(CONTENT_PATH, "utf8"));
const ANSWER_VALUES = new Set(["A", "B", "C", "D"]);

function findCourse(career, level, courseIndex) {
    return curriculum.careers[career]?.courses.find((course) =>
        course.level === level && course.courseIndex === courseIndex) ?? null;
}

function findExam(career, level) {
    return curriculum.careers[career]?.exams.find((exam) => exam.level === level) ?? null;
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

function paperFromQuestions(kind, targetKey, questions) {
    return {
        kind,
        targetKey,
        bankVersion: curriculum.version,
        publicPaper: questions.map(publicQuestion),
        answerKey: questions.map((question) => question.answer),
        review: questions.map((question) => ({
            id: question.id,
            correctAnswer: question.answer,
            explanation: question.explanation,
        })),
    };
}

export const CAREER_CURRICULUM_VERSION = curriculum.version;

export function careerCourseAvailability(career, level, courseIndex) {
    return findCourse(career, level, courseIndex)?.available === true;
}

export function careerExamAvailability(career, level) {
    return findExam(career, level)?.available === true;
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
        exam.questions,
    );
}

export function gradeAssessment(answerKey, answers) {
    if (!Array.isArray(answers) || answers.length !== answerKey.length) {
        throw new CareerDomainError("invalid_assessment_answers", "The submitted answer count is invalid");
    }
    const normalized = answers.map((answer) => String(answer).trim().toUpperCase());
    if (normalized.some((answer) => !ANSWER_VALUES.has(answer))) {
        throw new CareerDomainError("invalid_assessment_answers", "Every answer must be A, B, C or D");
    }
    return {
        answers: normalized,
        correctAnswers: normalized.reduce(
            (total, answer, index) => total + Number(answer === answerKey[index]),
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
