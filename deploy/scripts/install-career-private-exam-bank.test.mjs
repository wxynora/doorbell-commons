import assert from "node:assert/strict";
import test from "node:test";
import { validatePrivateExamBank } from "./install-career-private-exam-bank.mjs";

const careers = ["chef", "agronomist", "veterinarian", "reporter", "constable"];

function curriculum(ready = [["chef", 1]]) {
  const readyKeys = new Set(ready.map(([career, level]) => `${career}:${level}`));
  return {
    careers: Object.fromEntries(
      careers.map((career) => [
        career,
        {
          exams: [1, 2, 3, 4].map((level) => ({
            level,
            available: readyKeys.has(`${career}:${level}`),
          })),
        },
      ]),
    ),
  };
}

function questions() {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `question-${index + 1}`,
    stem: `完整题目 ${index + 1}`,
    options: { A: "选项甲", B: "选项乙", C: "选项丙", D: "选项丁" },
    answer: ["A"],
    explanation: "完整解析",
  }));
}

function bank(examQuestions = questions(), exams = [{ career: "chef", level: 1 }]) {
  return {
    schemaVersion: 1,
    version: "private-test",
    exams: exams.map((exam) => ({ ...exam, questions: structuredClone(examQuestions) })),
  };
}

test("private exam installer accepts only complete unique model-visible question papers", () => {
  assert.deepEqual(validatePrivateExamBank(bank(), curriculum()), {
    bankVersion: "private-test",
    examCount: 1,
    readyExamCount: 1,
  });

  const cases = [
    ["missing option", (value) => delete value.exams[0].questions[0].options.D],
    ["empty option", (value) => (value.exams[0].questions[0].options.D = "")],
    ["duplicate option", (value) => (value.exams[0].questions[0].options.D = "选项甲")],
    ["missing stem", (value) => delete value.exams[0].questions[0].stem],
    ["empty explanation", (value) => (value.exams[0].questions[0].explanation = "")],
    ["duplicate question id", (value) => (value.exams[0].questions[1].id = "question-1")],
    ["internal token", (value) => (value.exams[0].questions[0].options.A = "resident_id")],
  ];
  for (const [name, mutate] of cases) {
    const value = bank();
    mutate(value);
    assert.throws(() => validatePrivateExamBank(value, curriculum()), /rejected/u, name);
  }
});

test("private exam levels must exactly match public ready levels", () => {
  assert.throws(
    () =>
      validatePrivateExamBank(
        bank(questions(), [
          { career: "chef", level: 1 },
          { career: "chef", level: 2 },
        ]),
        curriculum([["chef", 1]]),
      ),
    /not publicly ready/u,
  );
});
