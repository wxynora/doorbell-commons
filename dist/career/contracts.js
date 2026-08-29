export const CAREER_IDS = ["chef", "agronomist", "veterinarian", "reporter", "constable"];
export const QUALIFICATION_LEVELS = [1, 2, 3, 4];
export const PUBLIC_INSTITUTIONS = ["lingye_daily", "animal_hospital", "public_security"];
export const INSTITUTION_CAREER = {
    animal_hospital: "veterinarian",
    lingye_daily: "reporter",
    public_security: "constable",
};
export const CAREER_INSTITUTION = {
    constable: "public_security",
    reporter: "lingye_daily",
    veterinarian: "animal_hospital",
};
export const INSTITUTION_SEAT_LIMIT = 2;
export const COURSE_COUNT_PER_LEVEL = 3;
export const COURSE_PRACTICE_QUESTION_COUNT = 5;
export const COURSE_PRACTICE_PASS_COUNT = 4;
export const EXAM_QUESTION_COUNT = 20;
export const EXAM_PASS_COUNT = 18;
export const COURSE_TUITION_GOLD = {
    1: 30_000,
    2: 120_000,
    3: 270_000,
    4: 540_000,
};
export const EXAM_FEE_GOLD = {
    1: 60_000,
    2: 240_000,
    3: 540_000,
    4: 1_080_000,
};
export const BASE_WAGE_GOLD = {
    1: 2_000,
    2: 4_000,
    3: 8_000,
    4: 12_000,
};
export const PERFORMANCE_PAY_GOLD = {
    1: 1_000,
    2: 2_500,
    3: 5_000,
    4: 8_000,
};
export const JOB_PERFORMANCE_UNITS = {
    1: 1,
    2: 2,
    3: 3,
    4: 5,
};
export const AGRONOMIST_CONCURRENT_CAPACITY = {
    1: 1,
    2: 2,
    3: 4,
    4: 8,
};
export class CareerDomainError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CareerDomainError";
    }
}
export function assertCareerId(value) {
    if (!CAREER_IDS.includes(value)) {
        throw new CareerDomainError("invalid_career", `Unknown career: ${value}`);
    }
}
export function assertQualificationLevel(value) {
    if (!QUALIFICATION_LEVELS.includes(value)) {
        throw new CareerDomainError("invalid_qualification_level", `Invalid level: ${value}`);
    }
}
export function institutionForCareer(career) {
    if (career === "reporter" || career === "veterinarian" || career === "constable") {
        return CAREER_INSTITUTION[career];
    }
    return null;
}
