import type { LingyeActionResult } from "@doorbell/protocol";

type LingyeSuccess = Extract<LingyeActionResult, { ok: true }>;

interface LingyeOption {
  option: string;
  label?: string;
  requires?: string[];
}

const OPTION_HANDLE = /^opt_[A-Za-z0-9_-]{12}$/u;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const LONG_HEX = /\b[0-9a-f]{64}\b/iu;
const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;
const INTERNAL_NAME =
  /\b(?:residentId|sourceId|objectId|ownerId|jobId|loanId|depositId|attemptId|reservationId|employmentId|dutyId|interviewId|noticeId|paperId|contentDeliveryId|journalId|tradeId|actionKey|idempotency|notification_id)\b/iu;

const CAREER_NAMES: Record<string, string> = {
  chef: "料理师",
  agronomist: "农艺师",
  veterinarian: "动物医生",
  reporter: "记者",
  constable: "治安官",
};

const REQUIRED_FIELD_NAMES: Record<string, string> = {
  amount: "金额",
  termDays: "期限",
  totalRatePpm: "合同总利率",
  to: "对方公开农场门牌",
  text: "说明正文",
  answers: "全部答案",
};

const STATUS_NAMES: Record<string, string> = {
  open: "待处理",
  available: "可接取",
  accepted: "已接取",
  assigned: "已分派",
  active: "处理中",
  completed: "已完成",
  cancelled: "已取消",
  transferred: "已转交",
  expired: "已过期",
  proposed: "等待双方确认",
  overdue: "已逾期",
  restricted: "受限中",
  repaid: "已还清",
  pending_review: "等待审核",
  returned: "已退回",
  rejected: "未通过",
  scheduled: "已安排",
  pending: "等待中",
  approved: "已通过",
  closed: "已结束",
  registered: "已报名",
  postponed: "已延期",
  written_passed: "笔试通过",
  passed: "已通过",
  failed: "未通过",
  ended: "已结束",
  leave: "请假中",
  suspended: "暂停中",
  treating: "处理中",
  recovering: "恢复中",
  resolved: "已解决",
};

const INSTITUTION_NAMES: Record<string, string> = {
  lingye_daily: "铃野日报社",
  animal_hospital: "铃野动物医院",
  public_security_office: "铃野治安所",
  vocational_school: "铃野职业学校",
  bank: "铃野银行",
};

// Names are copied from the Farm ranch catalogue. Unknown IDs are never echoed.
const ANIMAL_NAMES: Record<string, string> = {
  chicken: "鸡",
  duck: "鸭子",
  rabbit: "兔子",
  goose: "鹅",
  sheep: "绵羊",
  cow: "奶牛",
  bee: "蜜蜂",
  pig: "猪",
  silk_moth: "月光蚕",
  ember_hen: "余烬母鸡",
  cloud_sheep: "云绵羊",
  dream_cat: "梦貘猫",
};

const OBSERVATION_NAMES: Record<string, string> = {
  leaf_wilt: "叶片失去挺度",
  soil_surface_dry: "土面发干",
  soil_surface_saturated: "土面有积水",
  lower_leaf_yellowing: "下部叶片发黄",
  leaf_damage: "叶片有缺口",
  visible_pest_trace: "可见虫迹",
  uneven_leaf_color: "叶色不均",
  uneven_growth: "生长不均",
  whole_plant_wilt: "全株萎蔫",
  root_zone_instability: "根区不稳",
  reduced_appetite: "食欲减少",
  abdominal_discomfort: "腹部不适",
  reduced_activity: "活动减少",
  localized_injury_trace: "局部外伤痕迹",
  damp_coat_or_feathers: "皮毛或羽毛潮湿",
  increased_water_intake: "饮水增加",
  abnormal_breathing: "呼吸异常",
  elevated_temperature: "体温升高",
  dehydration_sign: "脱水表现",
};

const SECURITY_EVENT_NAMES: Record<string, string> = {
  stolen: "农作物被偷",
  foiled: "偷菜行为被拦下",
};

const RECIPE_RARITY_NAMES: Record<string, string> = {
  N: "普通",
  R: "稀有",
  SR: "珍贵",
  SSR: "珍稀",
  SP: "特别",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function numberText(value: unknown): string {
  const number = finiteNumber(value);
  return number === undefined ? "暂无法读取" : number.toLocaleString("zh-CN");
}

function percentageFromPpm(value: unknown): string {
  const ppm = finiteNumber(value);
  return ppm === undefined ? "暂无法读取" : `${String(ppm / 10_000)}%`;
}

function safeChineseText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (
    text.length === 0 ||
    !/\p{Script=Han}/u.test(text) ||
    UUID.test(text) ||
    LONG_HEX.test(text) ||
    INTERNAL_NAME.test(text) ||
    SNAKE_CASE.test(text) ||
    text.includes('\\"')
  ) {
    return undefined;
  }
  return text;
}

function resultMessage(value: unknown, fallback: string): string {
  return safeChineseText(value) ?? fallback;
}

function statusText(value: unknown): string {
  return typeof value === "string" ? (STATUS_NAMES[value] ?? "暂无法读取具体描述") : "暂无法读取";
}

function careerText(value: unknown): string {
  return typeof value === "string" ? (CAREER_NAMES[value] ?? "暂无法读取具体描述") : "暂无法读取";
}

function dateText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return dateText(parsed);
  }
  return "暂无法读取";
}

function publicFarmText(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const doorplate = typeof value.doorplate === "string" ? value.doorplate.trim() : "";
  if (
    !doorplate ||
    UUID.test(doorplate) ||
    LONG_HEX.test(doorplate) ||
    SNAKE_CASE.test(doorplate)
  ) {
    return undefined;
  }
  const name = safeChineseText(value.name);
  return name ? `${name}（门牌 ${doorplate}）` : `门牌 ${doorplate}`;
}

function farmDoorplateText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const doorplate = value.trim();
  if (
    !doorplate ||
    UUID.test(doorplate) ||
    LONG_HEX.test(doorplate) ||
    SNAKE_CASE.test(doorplate)
  ) {
    return undefined;
  }
  return `门牌 ${doorplate}`;
}

function collectOptions(data: Record<string, unknown>): LingyeOption[] {
  const candidates: unknown[] = [data.options];
  const current = isRecord(data.current) ? data.current : undefined;
  const chef = isRecord(data.chef) ? data.chef : undefined;
  const currentChef = current && isRecord(current.chef) ? current.chef : undefined;
  candidates.push(current?.options, chef?.options, currentChef?.options);

  const options: LingyeOption[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const raw of candidate) {
      if (!isRecord(raw) || typeof raw.option !== "string" || seen.has(raw.option)) continue;
      seen.add(raw.option);
      options.push({
        option: raw.option,
        ...(typeof raw.label === "string" ? { label: raw.label } : {}),
        ...(Array.isArray(raw.requires)
          ? { requires: raw.requires.filter((field): field is string => typeof field === "string") }
          : {}),
      });
    }
  }
  return options;
}

function chooseOperation(op: string): string {
  if (op.startsWith("go.bank.")) return "go.bank.choose";
  if (op.startsWith("go.school.")) return "go.school.choose";
  return op;
}

function renderOptions(op: string, data: Record<string, unknown>): string[] {
  const options = collectOptions(data);
  if (options.length === 0) return ["下一步：当前没有可办理事项。"];

  const lines = ["下一步可以办理："];
  let hiddenLegacyOption = false;
  for (const entry of options) {
    const label = safeChineseText(entry.label) ?? "办理当前业务";
    if (!OPTION_HANDLE.test(entry.option)) {
      hiddenLegacyOption = true;
      continue;
    }
    lines.push(`- ${label}`);
    lines.push(`  办理编号：${entry.option}`);
    const required = (entry.requires ?? [])
      .map((field) => REQUIRED_FIELD_NAMES[field])
      .filter(Boolean);
    if (required.length > 0) lines.push(`  还需提供：${required.join("、")}`);
    lines.push(
      `  调用 ${chooseOperation(op)}，原样提交这个办理编号${required.length > 0 ? "和上述信息" : ""}。`,
    );
  }
  if (hiddenLegacyOption)
    lines.push("- 有旧式办理编号未展示，请重新读取当前业务取得新的短办理编号。");
  return lines;
}

function renderQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const [index, question] of value.entries()) {
    if (!isRecord(question)) continue;
    const stem = safeChineseText(question.stem);
    if (!stem) continue;
    lines.push(`${index + 1}. ${stem}`);
    const choices = isRecord(question.options) ? question.options : undefined;
    if (!choices) continue;
    for (const key of ["A", "B", "C", "D"]) {
      const answer = safeChineseText(choices[key]);
      if (answer) lines.push(`   ${key}. ${answer}`);
    }
  }
  return lines;
}

function bankPart(data: Record<string, unknown>, key: string): unknown {
  const current = isRecord(data.current) ? data.current : undefined;
  if (current && current[key] !== undefined) return current[key];
  if (data.section === key) return data.value;
  return data[key];
}

function renderBankAccount(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    `余额：可用金币 ${numberText(value.availableGold)}，金币活期 ${numberText(value.demandGold)}，金币定期 ${numberText(value.termGold)}；可用银币 ${numberText(value.availableSilver)}，小机可自主使用 ${numberText(value.agentSpendableSilver)}，已锁定 ${numberText(value.silverAgentLock)}。`,
  ];
}

function renderTermDeposit(value: Record<string, unknown>, index: number): string {
  return `- 定期存款 ${index + 1}：本金 ${numberText(value.principal)} 金币，期限 ${numberText(value.termDays)} 天，合同总利率 ${percentageFromPpm(value.totalRatePpm)}，到期日为第 ${numberText(value.maturityDay)} 天，当前${statusText(value.state)}。`;
}

function renderBankDeposits(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const termDeposits = records(value.termDeposits);
  const lines = [`存款：金币活期 ${numberText(value.demandGold)}。`];
  lines.push(
    termDeposits.length === 0 ? "定期存款：无。" : "定期存款：",
    ...termDeposits.map(renderTermDeposit),
  );
  return lines;
}

function renderBankExchange(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    `兑换：${numberText(value.goldPerSilver)} 金币可兑换 1 银币；本月个人还可兑换 ${numberText(value.residentRemainingThisMonth)} 银币，全服还可兑换 ${numberText(value.globalRemainingThisMonth)} 银币。`,
  ];
}

function renderSystemLoan(value: Record<string, unknown>, index: number): string {
  return `- 系统贷款 ${index + 1}：原始本金 ${numberText(value.principalOriginal)} 金币，未还本金 ${numberText(value.principalOutstanding)}，已计利息 ${numberText(value.accruedInterest)}，期限 ${numberText(value.termDays)} 天，到期日为第 ${numberText(value.dueDay)} 天，当前${statusText(value.status)}。`;
}

function renderPlayerLoan(value: Record<string, unknown>, index: number): string {
  const role = value.role === "lender" ? "出借" : value.role === "borrower" ? "借入" : "往来";
  const counterparty = publicFarmText(value.counterparty) ?? "对方公开农场暂无法读取";
  return `- 玩家贷款 ${index + 1}：${role}给${counterparty}，原始本金 ${numberText(value.principalOriginal)} 银币，未还本金 ${numberText(value.principalOutstanding)}，已计利息 ${numberText(value.accruedInterest)}，合同总利率 ${percentageFromPpm(value.totalRatePpm)}，期限 ${numberText(value.termDays)} 天，当前${statusText(value.status)}。`;
}

function renderBankLoans(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const systemLoans = records(value.systemLoans);
  const playerLoans = records(value.playerLoans);
  return [
    "贷款：",
    ...(systemLoans.length === 0 ? ["- 系统贷款：无。"] : systemLoans.map(renderSystemLoan)),
    ...(playerLoans.length === 0 ? ["- 玩家贷款：无。"] : playerLoans.map(renderPlayerLoan)),
  ];
}

function renderBankCredit(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    `信用：${numberText(value.creditPoints)} 点；高消费限制：${value.highSpendRestricted === true ? "有" : value.highSpendRestricted === false ? "无" : "暂无法读取"}。`,
  ];
}

function renderBankReference(value: unknown): string[] {
  if (!isRecord(value) || !isRecord(value.value)) return [];
  if (value.type === "term_deposit")
    return ["查询到的定期存款：", renderTermDeposit(value.value, 0)];
  if (value.type === "system_loan") return ["查询到的系统贷款：", renderSystemLoan(value.value, 0)];
  if (value.type === "player_loan") return ["查询到的玩家贷款：", renderPlayerLoan(value.value, 0)];
  return ["查询到一条银行记录，具体描述暂无法读取。"];
}

function bankText(op: string, result: LingyeSuccess): string {
  const data = result.data;
  const lines = ["🏦 铃野银行", resultMessage(result.text, "已读取铃野银行当前事实。")];
  lines.push(...renderBankAccount(bankPart(data, "account")));
  if (op === "go.bank.view") {
    lines.push(...renderBankDeposits(bankPart(data, "deposits")));
    lines.push(...renderBankExchange(bankPart(data, "exchange")));
    lines.push(...renderBankLoans(bankPart(data, "loans")));
  }
  lines.push(...renderBankCredit(bankPart(data, "credit")));
  lines.push(...renderBankReference(data.reference));
  return [...lines, ...renderOptions("go.bank.choose", data)].join("\n");
}

function renderCareerTracks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tracks = records(value);
  if (tracks.length === 0) return ["职业轨道：尚未选择。"];
  return [`职业轨道：${tracks.map((track) => careerText(track.career)).join("、")}。`];
}

function courseProgressText(course: Record<string, unknown>): string {
  const state =
    course.completedAt !== null && course.completedAt !== undefined
      ? "已完成"
      : course.contentReadAt !== null && course.contentReadAt !== undefined
        ? "已阅读，等待练习"
        : course.enrolledAt !== null && course.enrolledAt !== undefined
          ? "已报名，等待阅读"
          : "已登记";
  return `${careerText(course.career)} ${numberText(course.qualificationLevel)} 级第 ${numberText(course.courseIndex)} 门：${state}${finiteNumber(course.bestCorrectAnswers) === undefined ? "" : `，最好答对 ${numberText(course.bestCorrectAnswers)} 题`}。`;
}

function renderCourseProgress(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const courses = records(value);
  return courses.length === 0
    ? ["课程进度：尚未报名课程。"]
    : ["课程进度：", ...courses.map((course) => `- ${courseProgressText(course)}`)];
}

function renderCourseCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const courses = records(value);
  if (courses.length === 0) return ["课程目录：当前职业暂时没有可报名课程。"];
  return [
    "课程目录：",
    ...courses.map((course) => {
      const title = safeChineseText(course.title) ?? "课程名称暂无法读取";
      const availability =
        course.contentAvailable === true
          ? "课程内容已就绪"
          : course.contentAvailable === false
            ? "课程内容暂不可用"
            : "课程状态暂无法读取";
      return `- ${careerText(course.career)} ${numberText(course.qualificationLevel)} 级第 ${numberText(course.courseIndex)} 门《${title.replace(/^《|》$/gu, "")}》；学费 ${numberText(course.tuitionGold)} 金币；${availability}。`;
    }),
  ];
}

function renderExams(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const exams = records(value);
  if (exams.length === 0) return ["考试：暂无记录。"];
  return [
    "考试：",
    ...exams.map((exam) => {
      const score = finiteNumber(exam.correctAnswers);
      const scheduled =
        exam.scheduledAt === null || exam.scheduledAt === undefined
          ? ""
          : `，安排在 ${dateText(exam.scheduledAt)}`;
      return `- ${careerText(exam.career)} ${numberText(exam.qualificationLevel)} 级资格考试：${statusText(exam.registrationStatus)}${score === undefined ? "" : `，答对 ${numberText(score)} 题`}${scheduled}。`;
    }),
  ];
}

function renderCertificates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const certificates = records(value);
  if (certificates.length === 0) return ["资格证：暂无。"];
  return [
    "资格证：",
    ...certificates.map(
      (certificate) =>
        `- ${careerText(certificate.career)} ${numberText(certificate.qualificationLevel)} 级：${statusText(certificate.status)}。`,
    ),
  ];
}

function renderEmployment(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const employment = records(value.records);
  const duties = records(value.duties);
  const lines = ["任职："];
  if (employment.length === 0) lines.push("- 暂无任职记录。");
  for (const item of employment) {
    const institution =
      typeof item.institution === "string"
        ? (INSTITUTION_NAMES[item.institution] ?? "铃野机构")
        : "铃野机构";
    const availability =
      item.availability === "available" ? "可到岗" : statusText(item.availability);
    lines.push(
      `- ${careerText(item.career)}，任职于${institution}，当前${statusText(item.status)}，${availability}。`,
    );
  }
  if (duties.length > 0) {
    lines.push("排班与工资：");
    for (const duty of duties) {
      lines.push(
        `- ${careerText(duty.career)}，排班日 ${typeof duty.dutyDate === "string" ? duty.dutyDate : "暂无法读取"}，基本工资 ${numberText(duty.baseWageGold)} 金币，绩效工资 ${numberText(duty.performanceGold)} 金币，当前${statusText(duty.status)}。`,
      );
    }
  }
  return lines;
}

function renderInterviews(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const interviews = records(value);
  if (interviews.length === 0) return ["治安官面试：暂无记录。"];
  return [
    "治安官面试：",
    ...interviews.map((interview) => {
      const role =
        interview.role === "candidate"
          ? "候选人"
          : interview.role === "examiner"
            ? "面试官"
            : "参与者";
      return `- 身份：${role}；时间：${dateText(interview.scheduledAt)}；状态：${statusText(interview.status)}。`;
    }),
  ];
}

function renderPublicNotices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const notices = records(value);
  if (notices.length === 0) return ["治安官任职公示：暂无记录。"];
  return [
    "治安官任职公示：",
    ...notices.map((notice) => {
      const candidate = isRecord(notice.candidate)
        ? (safeChineseText(notice.candidate.residentName) ?? "候选人姓名暂无法读取")
        : "候选人姓名暂无法读取";
      const choice =
        notice.myChoice === "no_objection"
          ? "无异议"
          : notice.myChoice === "review_request"
            ? "申请复核"
            : notice.myChoice === null || notice.myChoice === undefined
              ? "尚未提交意见"
              : "意见暂无法读取";
      return `- ${candidate}，治安官 ${numberText(notice.qualificationLevel)} 级，公示${statusText(notice.status)}，截止时间 ${dateText(notice.closesAt)}，我的意见：${choice}。`;
    }),
  ];
}

function renderCourseContent(reference: Record<string, unknown>): string[] {
  const content = isRecord(reference.content) ? reference.content : undefined;
  if (!content) return [];
  const lines: string[] = [];
  const title = safeChineseText(content.title);
  if (title) lines.push(`课程：${title}`);
  if (typeof content.contentMarkdown === "string")
    lines.push("课程正文：", content.contentMarkdown);
  const practice = renderQuestions(content.practiceQuestions);
  if (practice.length > 0) lines.push("课程练习（一次查看全部 5 题）：", ...practice);
  return lines;
}

function renderCurrentCourses(value: unknown): string[] {
  const currentCourses = records(value);
  const lines: string[] = [];
  for (const course of currentCourses) {
    const stage =
      course.stage === "awaiting_read_confirmation"
        ? "当前阶段：课程已经报名并交付；阅读完后确认已阅读。"
        : course.stage === "awaiting_practice"
          ? "当前阶段：已经确认阅读；请一次提交下面全部 5 题的答案。"
          : undefined;
    if (stage) lines.push(stage);
    lines.push(...renderCourseContent(course));
  }
  return lines;
}

function renderSchoolReference(reference: Record<string, unknown>): string[] {
  if (!isRecord(reference.value)) return [];
  if (reference.type === "exam") return renderExams([reference.value]);
  if (reference.type === "certificate") return renderCertificates([reference.value]);
  if (reference.type === "employment")
    return renderEmployment({ records: [reference.value], duties: [] });
  if (reference.type === "duty_day")
    return renderEmployment({ records: [], duties: [reference.value] });
  if (reference.type === "interview") return renderInterviews([reference.value]);
  if (reference.type === "public_notice") return renderPublicNotices([reference.value]);
  return [];
}

function renderExamPaper(data: Record<string, unknown>): string[] {
  const reference = isRecord(data.reference) ? data.reference : undefined;
  const paper = reference && isRecord(reference.paper) ? reference.paper : undefined;
  const result = isRecord(data.result) ? data.result : undefined;
  const questions =
    paper?.publicPaper ?? paper?.questions ?? result?.publicPaper ?? result?.questions;
  const rendered = renderQuestions(questions);
  if (rendered.length === 0) return [];
  const count = Array.isArray(questions)
    ? questions.filter((question) => isRecord(question) && safeChineseText(question.stem)).length
    : 0;
  return [`试卷（一次查看全部 ${count} 题）：`, ...rendered];
}

function schoolText(result: LingyeSuccess): string {
  const data = result.data;
  const lines = ["🏫 铃野职业学校", resultMessage(result.text, "已读取铃野职业学校当前事实。")];
  const reference = isRecord(data.reference) ? data.reference : undefined;
  if (reference) lines.push(...renderCourseContent(reference), ...renderSchoolReference(reference));
  lines.push(...renderCurrentCourses(data.currentCourses));
  lines.push(...renderExamPaper(data));

  if (data.section === "courses" && isRecord(data.value)) {
    lines.push(...renderCourseCatalog(data.value.catalog));
    lines.push(...renderCourseProgress(data.value.progress));
  } else {
    const facts = isRecord(data.current) ? data.current : data;
    if (data.section === "careers") lines.push(...renderCareerTracks(data.value));
    else if (data.section === "exams") lines.push(...renderExams(data.value));
    else if (data.section === "certificates") lines.push(...renderCertificates(data.value));
    else if (data.section === "employment") lines.push(...renderEmployment(data.value));
    else if (data.section === "interviews") lines.push(...renderInterviews(data.value));
    else if (data.section === "publicNotices") lines.push(...renderPublicNotices(data.value));
    else if (data.section === undefined) {
      lines.push(...renderCareerTracks(facts.careers));
      lines.push(...renderCourseProgress(facts.courses));
      lines.push(...renderExams(facts.exams));
      lines.push(...renderCertificates(facts.certificates));
      lines.push(...renderEmployment(facts.employment));
    }
  }

  return [...lines, ...renderOptions("go.school.choose", data)].join("\n");
}

function commissionTitle(op: string): string {
  if (op === "go.hospital.commission") return "🏥 铃野动物医院";
  if (op === "go.security.commission") return "🛡️ 铃野治安所";
  return "🌾 铃野农场职业";
}

function commissionKind(op: string): string {
  if (op === "go.hospital.commission") return "病例";
  if (op === "go.security.commission") return "治安事项";
  return "地块委托";
}

function publicCommissionFacts(item: Record<string, unknown>): Record<string, unknown>[] {
  const sourceFacts = isRecord(item.sourceFacts) ? item.sourceFacts : undefined;
  return [
    isRecord(item.fact) ? item.fact : undefined,
    sourceFacts && isRecord(sourceFacts.initialFact) ? sourceFacts.initialFact : undefined,
    sourceFacts && isRecord(sourceFacts.currentState) ? sourceFacts.currentState : undefined,
    sourceFacts?.loan && isRecord(sourceFacts.loan) ? sourceFacts.loan : undefined,
    item,
  ].filter((value): value is Record<string, unknown> => value !== undefined);
}

function firstPublicField(facts: Record<string, unknown>[], key: string): unknown {
  for (const fact of facts) {
    if (fact[key] !== undefined && fact[key] !== null) return fact[key];
  }
  return undefined;
}

function observationText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "暂无法读取具体描述";
  const translated = value.map((entry) =>
    typeof entry === "string" ? OBSERVATION_NAMES[entry] : undefined,
  );
  return translated.every((entry): entry is string => entry !== undefined)
    ? translated.join("、")
    : "暂无法读取具体描述";
}

function commissionItemLines(op: string, item: Record<string, unknown>, index: number): string[] {
  const facts = publicCommissionFacts(item);
  const kind = commissionKind(op);
  const lines = [`- ${kind} ${index + 1}`];
  const farm =
    publicFarmText(firstPublicField(facts, "farm")) ??
    farmDoorplateText(firstPublicField(facts, "farmDoorplate"));
  if (farm) lines.push(`  委托方公开农场：${farm}`);

  if (op === "go.farm.commission") {
    const plotId = integer(firstPublicField(facts, "plotId"));
    lines.push(`  地块：${plotId === undefined ? "暂无法读取具体描述" : `第 ${plotId} 号地`}`);
  } else if (op === "go.hospital.commission") {
    const animalKind = firstPublicField(facts, "animalKindId");
    const animal = typeof animalKind === "string" ? ANIMAL_NAMES[animalKind] : undefined;
    lines.push(`  动物：${animal ?? "暂无法读取具体描述"}`);
  } else {
    const event = facts.map((fact) => fact.event).find(isRecord);
    const eventKind =
      event && typeof event.kind === "string" ? SECURITY_EVENT_NAMES[event.kind] : undefined;
    const isOverdueLoan = facts.some((fact) => fact.principalOutstanding !== undefined);
    lines.push(`  事项：${eventKind ?? (isOverdueLoan ? "逾期贷款" : "暂无法读取具体描述")}`);
    if (event) {
      const plotId = integer(event.plotId);
      if (plotId !== undefined) lines.push(`  相关地块：第 ${plotId} 号地`);
    }
  }

  if (op !== "go.security.commission") {
    lines.push(`  可观察症状：${observationText(firstPublicField(facts, "observations"))}`);
  }
  const difficulty =
    integer(firstPublicField(facts, "difficultyLevel")) ??
    integer(firstPublicField(facts, "requiredLevel"));
  lines.push(`  难度：${difficulty === undefined ? "暂无法读取" : `${difficulty} 级`}`);
  lines.push(`  状态：${statusText(firstPublicField(facts, "status"))}`);
  return lines;
}

function commissionRecords(data: Record<string, unknown>): Record<string, unknown>[] {
  const current = isRecord(data.current) ? data.current : undefined;
  const values = [
    ...records(data.jobs),
    ...records(data.sources),
    ...records(current?.jobs),
    ...records(current?.sources),
  ];
  if (values.length === 0 && isRecord(data.reference)) values.push(data.reference);
  if (values.length === 0 && isRecord(data.result)) values.push(data.result);

  const seen = new Set<string>();
  return values.filter((item, index) => {
    const sourceFacts = isRecord(item.sourceFacts) ? item.sourceFacts : undefined;
    const privateKey =
      (typeof item.sourceId === "string" && `source:${item.sourceId}`) ||
      (sourceFacts &&
        typeof sourceFacts.sourceId === "string" &&
        `source:${sourceFacts.sourceId}`) ||
      (typeof item.jobId === "string" && `job:${item.jobId}`) ||
      `public-row:${index}`;
    if (seen.has(privateKey)) return false;
    seen.add(privateKey);
    return true;
  });
}

function renderChefFacts(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const lines = [`料理师资格：${numberText(value.qualificationLevel)} 级。`];
  const recipes = records(value.recipes);
  if (recipes.length > 0) {
    lines.push("原创菜谱：");
    for (const recipe of recipes) {
      const name =
        safeChineseText(recipe.name) ?? safeChineseText(recipe.title) ?? "名称暂无法读取";
      const rarity =
        typeof recipe.rarity === "string"
          ? (RECIPE_RARITY_NAMES[recipe.rarity] ?? "品质暂无法读取")
          : "品质暂无法读取";
      const author = isRecord(recipe.author) ? publicFarmText(recipe.author.farm) : undefined;
      lines.push(
        `- 《${name.replace(/^《|》$/gu, "")}》，${rarity}，价格 ${numberText(recipe.priceSilver)} 银币${author ? `，作者来自${author}` : ""}。`,
      );
    }
  }
  const leases = records(value.leases);
  if (leases.length > 0) {
    lines.push("料理店：");
    for (const lease of leases) {
      lines.push(
        `- 店铺当前${statusText(lease.state)}；下次租金到期时间 ${dateText(lease.nextRentDueAt)}。`,
      );
    }
  }
  const listings = records(value.listings);
  if (listings.length > 0) {
    lines.push("料理店商品：");
    for (const listing of listings) {
      const seller = isRecord(listing.seller) ? publicFarmText(listing.seller.farm) : undefined;
      lines.push(
        `- ${numberText(listing.quantity)} 份，单价 ${numberText(listing.priceSilver)} 银币${seller ? `，来自${seller}` : ""}。`,
      );
    }
  }
  return lines;
}

function commissionText(op: string, result: LingyeSuccess): string {
  const data = result.data;
  const lines = [commissionTitle(op), resultMessage(result.text, "已读取当前公开职业业务。")];
  const items = commissionRecords(data);
  if (items.length === 0) lines.push(`${commissionKind(op)}：当前没有公开记录。`);
  else {
    lines.push(`${commissionKind(op)}：`);
    for (const [index, item] of items.entries())
      lines.push(...commissionItemLines(op, item, index));
  }
  if (op === "go.farm.commission") {
    const current = isRecord(data.current) ? data.current : undefined;
    lines.push(...renderChefFacts(data.chef ?? current?.chef));
  }
  return [...lines, ...renderOptions(op, data)].join("\n");
}

export function renderLingyeToolText(
  op: string,
  _args: Record<string, unknown>,
  result: LingyeSuccess,
): string {
  if (op.startsWith("go.bank.")) return bankText(op, result);
  if (op.startsWith("go.school.")) return schoolText(result);
  return commissionText(op, result);
}
