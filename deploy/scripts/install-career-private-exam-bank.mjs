#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CAREERS = new Set(["chef", "agronomist", "veterinarian", "reporter", "constable"]);
const ANSWERS = new Set(["A", "B", "C", "D"]);
const SAFE_PUBLIC_OPTION_PATTERN =
  /^(?:\d+(?:\.\d+)?%?|N|R|SR|SSR|SP|[BPS]=\d+(?:\.\d+)?|`[A-Z]-\d{2}`|\d{2}:\d{2})$/u;
const INTERNAL_TOKEN_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;

function fail(message) {
  throw new Error(`Private career exam bank rejected: ${message}`);
}

function plainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is invalid`);
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(plainObject(value, label)).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} fields are invalid`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} is invalid`);
}

function modelVisibleStem(value, label) {
  nonEmptyString(value, label);
  if (!/\p{Script=Han}/u.test(value) || INTERNAL_TOKEN_PATTERN.test(value)) {
    fail(`${label} is not model-visible player text`);
  }
}

function modelVisibleOption(value, label) {
  nonEmptyString(value, label);
  const text = value.trim();
  if (
    INTERNAL_TOKEN_PATTERN.test(text) ||
    (!/\p{Script=Han}/u.test(text) && !SAFE_PUBLIC_OPTION_PATTERN.test(text))
  ) {
    fail(`${label} is not model-visible player text`);
  }
}

function examKey(career, level) {
  return `${career}:${String(level)}`;
}

function validateStaticQuestion(question, label) {
  exactKeys(question, ["id", "stem", "options", "answer", "explanation"], label);
  nonEmptyString(question.id, `${label}.id`);
  modelVisibleStem(question.stem, `${label}.stem`);
  nonEmptyString(question.explanation, `${label}.explanation`);
  exactKeys(question.options, ["A", "B", "C", "D"], `${label}.options`);
  const optionValues = [];
  for (const answer of ANSWERS) {
    modelVisibleOption(question.options[answer], `${label}.options.${answer}`);
    optionValues.push(question.options[answer].trim().normalize("NFKC"));
  }
  if (new Set(optionValues).size !== ANSWERS.size) fail(`${label}.options duplicates`);
  if (
    !Array.isArray(question.answer) ||
    question.answer.length < 1 ||
    question.answer.length > ANSWERS.size ||
    question.answer.some((answer) => !ANSWERS.has(answer)) ||
    new Set(question.answer).size !== question.answer.length
  ) {
    fail(`${label}.answer is invalid`);
  }
  question.answer.sort();
}

function validateRecipeQuestion(question, label) {
  exactKeys(
    question,
    ["type", "id", "stemTemplate", "explanationTemplate", "optionSeparator", "eligibleRecipeIds"],
    label,
  );
  if (question.type !== "existing_recipe_ingredients") fail(`${label}.type is invalid`);
  nonEmptyString(question.id, `${label}.id`);
  modelVisibleStem(question.stemTemplate.replaceAll("{recipe}", "料理"), `${label}.stemTemplate`);
  modelVisibleStem(
    question.explanationTemplate.replaceAll("{recipe}", "料理").replaceAll("{ingredients}", "食材"),
    `${label}.explanationTemplate`,
  );
  nonEmptyString(question.optionSeparator, `${label}.optionSeparator`);
  if (
    !question.stemTemplate.includes("{recipe}") ||
    !question.explanationTemplate.includes("{recipe}") ||
    !question.explanationTemplate.includes("{ingredients}")
  ) {
    fail(`${label} templates are invalid`);
  }
  if (!Array.isArray(question.eligibleRecipeIds) || question.eligibleRecipeIds.length < 4) {
    fail(`${label}.eligibleRecipeIds is invalid`);
  }
  const ids = new Set();
  for (const id of question.eligibleRecipeIds) {
    nonEmptyString(id, `${label}.eligibleRecipeIds`);
    ids.add(id);
  }
  if (ids.size !== question.eligibleRecipeIds.length) fail(`${label}.eligibleRecipeIds duplicates`);
}

function publicReadyLevels(curriculum) {
  plainObject(curriculum, "public curriculum");
  const careers = plainObject(curriculum.careers, "public curriculum careers");
  const careerNames = new Set(Object.keys(careers));
  if (
    careerNames.size !== CAREERS.size ||
    [...CAREERS].some((career) => !careerNames.has(career))
  ) {
    fail("public curriculum career coverage is invalid");
  }
  const ready = new Set();
  for (const [career, entry] of Object.entries(careers)) {
    if (!CAREERS.has(career)) fail(`public curriculum career ${career} is invalid`);
    if (!Array.isArray(entry?.exams)) fail(`public curriculum ${career} exams are invalid`);
    const levels = new Set();
    for (const exam of entry.exams) {
      if (![1, 2, 3, 4].includes(exam?.level) || typeof exam.available !== "boolean") {
        fail(`public curriculum ${career} exam is invalid`);
      }
      if (levels.has(exam.level)) fail(`public curriculum ${career} exam level duplicates`);
      levels.add(exam.level);
      if (exam.available) ready.add(examKey(career, exam.level));
    }
    if (levels.size !== 4 || [1, 2, 3, 4].some((level) => !levels.has(level))) {
      fail(`public curriculum ${career} exam coverage is invalid`);
    }
  }
  if (ready.size === 0) fail("public curriculum has no ready exams");
  return ready;
}

export function validatePrivateExamBank(bank, curriculum) {
  exactKeys(bank, ["schemaVersion", "version", "exams"], "bank");
  if (bank.schemaVersion !== 1) fail("schemaVersion must be 1");
  nonEmptyString(bank.version, "bank.version");
  if (!Array.isArray(bank.exams)) fail("bank.exams is invalid");

  const bankLevels = new Set();
  for (const [examIndex, exam] of bank.exams.entries()) {
    const label = `bank.exams[${String(examIndex)}]`;
    exactKeys(exam, ["career", "level", "questions"], label);
    if (!CAREERS.has(exam.career) || ![1, 2, 3, 4].includes(exam.level)) {
      fail(`${label} identity is invalid`);
    }
    const key = examKey(exam.career, exam.level);
    if (bankLevels.has(key)) fail(`bank exam ${key} duplicates`);
    bankLevels.add(key);
    if (!Array.isArray(exam.questions) || exam.questions.length !== 20) {
      fail(`bank exam ${key} must contain exactly 20 questions`);
    }
    const questionIds = new Set();
    for (const [questionIndex, question] of exam.questions.entries()) {
      const questionLabel = `${label}.questions[${String(questionIndex)}]`;
      if (question?.type === "existing_recipe_ingredients") {
        validateRecipeQuestion(question, questionLabel);
      } else {
        validateStaticQuestion(question, questionLabel);
      }
      if (questionIds.has(question.id)) fail(`bank exam ${key} question id duplicates`);
      questionIds.add(question.id);
    }
  }

  const required = publicReadyLevels(curriculum);
  const missing = [...required].filter((key) => !bankLevels.has(key));
  const unexpected = [...bankLevels].filter((key) => !required.has(key));
  if (missing.length > 0) fail(`ready exams are missing: ${missing.join(",")}`);
  if (unexpected.length > 0) fail(`private exams are not publicly ready: ${unexpected.join(",")}`);
  return { bankVersion: bank.version, examCount: bank.exams.length, readyExamCount: required.size };
}

async function main() {
  const [sourceArgument, curriculumArgument, destinationArgument] = process.argv.slice(2);
  if (!sourceArgument || !curriculumArgument || process.argv.length > 5) {
    throw new Error(
      "Usage: install-career-private-exam-bank.mjs <private-bank.json> <public-curriculum.json> [destination.json]",
    );
  }
  const sourcePath = resolve(sourceArgument);
  const curriculumPath = resolve(curriculumArgument);
  const sourceText = await readFile(sourcePath, "utf8");
  const curriculumText = await readFile(curriculumPath, "utf8");
  const result = validatePrivateExamBank(JSON.parse(sourceText), JSON.parse(curriculumText));
  if (destinationArgument) {
    const destinationPath = resolve(destinationArgument);
    if (destinationPath === sourcePath) throw new Error("Source and destination must differ");
    await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, sourceText, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, destinationPath);
      await chmod(destinationPath, 0o600);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, installed: Boolean(destinationArgument), ...result })}\n`,
  );
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
