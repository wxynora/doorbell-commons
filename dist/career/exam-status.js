import { farmResidentId } from "./farm-benefits.js";

const CAREER_NAMES = {
    chef: "料理师", agronomist: "农艺师", veterinarian: "动物医生",
    reporter: "记者", constable: "治安官",
};

export function appendCareerStatusNotices(database, backend, farm, result) {
    const residentId = farmResidentId(database, farm);
    if (!residentId) return result;
    const exams = backend.trustedQueries.eligibleAdvancementExams(residentId);
    const notices = exams.map(({ career, level }) =>
        `${CAREER_NAMES[career]}：你现在可以去报考${level}级考试了。`);
    const wages = backend.trustedSystemCommands.takeDutyWageNoticeText(residentId);
    result.json.text = [...notices, wages, result.json.text].filter(Boolean).join("\n\n");
    return result;
}
