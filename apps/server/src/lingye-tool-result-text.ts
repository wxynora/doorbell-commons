import type { LingyeActionResult } from "@doorbell/protocol";

type LingyeSuccess = Extract<LingyeActionResult, { ok: true }>;

interface LingyeOption {
  option: string;
  requires: string[];
}

const CAREER_NAMES: Record<string, string> = {
  chef: "料理师",
  agronomist: "农艺师",
  veterinarian: "动物医生",
  reporter: "记者",
  constable: "治安官",
};

const FIELD_NAMES: Record<string, string> = {
  amount: "金额（正整数）",
  termDays: "期限（天；银行合同只接受 14／30／60）",
  totalRatePpm: "合同总利率（ppm）",
  to: "对方公开农场门牌",
  text: "正文",
  answers: "全部答案（课程练习 5 题／正式考试 20 题，一次提交）",
  status: "状态",
  state: "状态",
  career: "职业",
  qualificationLevel: "资格等级",
  courseIndex: "课程序号",
  title: "名称",
  principal: "本金",
  principalOriginal: "原始本金",
  principalOutstanding: "未还本金",
  accruedInterest: "已计利息",
  dueDay: "到期日",
  maturityDay: "到期日",
  creditPoints: "信用点",
  highSpendRestricted: "高消费限制",
  correctAnswers: "答对题数",
  bestCorrectAnswers: "最佳答对题数",
  dutyDate: "排班日期",
  baseWageGold: "基本工资（金币）",
  performanceGold: "绩效工资（金币）",
  recipeName: "菜谱名称",
  rarity: "品质",
  priceSilver: "价格（银币）",
  quantity: "数量",
  messageText: "消息",
};

const BANK_ACTION_NAMES: Record<string, string> = {
  "demand-deposit": "存入金币活期",
  "demand-withdraw": "取出金币活期",
  "exchange-gold-silver": "用金币兑换银币",
  "term-open": "开立金币定期存款",
  "term-close": "提前支取／结清金币定期存款",
  "system-loan-open": "申请系统金币贷款",
  "system-loan-repay": "偿还系统金币贷款",
  "silver-lock-increase": "增加小机银币锁定额",
  "player-loan-offer": "向其他居民提供银币借款",
  "player-loan-request": "向其他居民申请银币借款",
  "player-loan-confirm": "确认玩家借款合同",
  "player-loan-cancel": "取消玩家借款提案",
  "player-loan-repay": "偿还玩家银币借款",
};

const SCHOOL_ACTION_NAMES: Record<string, string> = {
  "career-select": "选择职业轨道",
  "course-enroll": "报名课程",
  "course-read": "确认已阅读课程",
  "course-practice": "提交课程练习",
  "exam-register": "报名资格考试",
  "exam-start": "开始资格考试",
  "exam-release": "取消尚未开始的考试报名",
  "exam-submit": "一次提交整份资格考试答案",
  "employment-hire": "申请正式受聘",
  "employment-leave": "请假",
  "employment-resume": "恢复在岗",
  "employment-end": "结束任职",
  "constable-public-notice-vote": "提交治安官公示意见",
};

const COMMISSION_ACTION_NAMES: Array<[string, string]> = [
  ["chef-recipe-buy", "购买原创菜谱"],
  ["chef-store-open", "开设料理店"],
  ["chef-store-rent", "支付料理店租金"],
  ["chef-store-buy", "购买料理店商品"],
  ["npc-transfer", "把委托转交给机构 NPC"],
  ["publish", "发布真实委托"],
  ["republish", "重新发布委托"],
  ["accept", "接取委托"],
  ["cancel", "取消委托"],
  ["reply", "回复委托消息"],
  ["check", "执行检查"],
  ["treat", "执行处理／治疗"],
  ["transfer", "转交委托"],
  ["submit", "提交工作结果"],
  ["resolve", "提交治安处理结果"],
  ["npc", "委托机构 NPC 处理"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "无";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function publicValue(value: unknown): string {
  const raw = scalar(value);
  return CAREER_NAMES[raw] ?? raw;
}

function recordLines(value: unknown, indent = ""): string[] {
  if (!isRecord(value)) return [];
  const lines: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (key === "options" || key === "contentSources") continue;
    const label = FIELD_NAMES[key] ?? key;
    if (Array.isArray(entry)) {
      if (entry.length === 0) {
        lines.push(`${indent}${label}：无`);
        continue;
      }
      lines.push(`${indent}${label}：`);
      for (const item of entry) {
        if (isRecord(item)) {
          lines.push(`${indent}-`);
          lines.push(...recordLines(item, `${indent}  `));
        } else {
          lines.push(`${indent}- ${publicValue(item)}`);
        }
      }
      continue;
    }
    if (isRecord(entry)) {
      lines.push(`${indent}${label}：`);
      lines.push(...recordLines(entry, `${indent}  `));
      continue;
    }
    lines.push(`${indent}${label}：${publicValue(entry)}`);
  }
  return lines;
}

function collectOptions(value: unknown): LingyeOption[] {
  const result: LingyeOption[] = [];
  const seen = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, entry] of Object.entries(candidate)) {
      if (key === "options" && Array.isArray(entry)) {
        for (const raw of entry) {
          if (!isRecord(raw) || typeof raw.option !== "string" || seen.has(raw.option)) continue;
          const requires = Array.isArray(raw.requires)
            ? raw.requires.filter((field): field is string => typeof field === "string")
            : [];
          seen.add(raw.option);
          result.push({ option: raw.option, requires });
        }
      } else {
        visit(entry);
      }
    }
  };
  visit(value);
  return result;
}

function optionLabel(option: string): string {
  const bank = /^bank:([a-z-]+):/u.exec(option);
  const bankAction = bank?.[1];
  if (bankAction) return BANK_ACTION_NAMES[bankAction] ?? bankAction;
  const school = /^school:([a-z-]+):/u.exec(option);
  const schoolAction = school?.[1];
  if (schoolAction) {
    const career = /:(chef|agronomist|veterinarian|reporter|constable)(?::|$)/u.exec(option)?.[1];
    const suffix = career ? `：${CAREER_NAMES[career]}` : "";
    return `${SCHOOL_ACTION_NAMES[schoolAction] ?? schoolAction}${suffix}`;
  }
  if (option.startsWith("commission:")) {
    const action = option.slice("commission:".length);
    return (
      COMMISSION_ACTION_NAMES.find(
        ([prefix]) => action.startsWith(`${prefix}:`) || action === prefix,
      )?.[1] ?? "推进委托"
    );
  }
  return "办理当前业务";
}

function chooseOperation(op: string): string {
  if (op.startsWith("go.bank.")) return "go.bank.choose";
  if (op.startsWith("go.school.")) return "go.school.choose";
  return op;
}

function renderOptions(op: string, data: unknown): string[] {
  const options = collectOptions(data);
  if (options.length === 0) return ["当前没有可以直接办理的下一步。"];
  const chooseOp = chooseOperation(op);
  const lines = ["可以继续办理："];
  for (const entry of options) {
    lines.push(`- ${optionLabel(entry.option)}`);
    if (entry.requires.length === 0) {
      lines.push(
        `  可直接调用：doorbell(${JSON.stringify({ op: chooseOp, args: { option: entry.option } })})`,
      );
    } else {
      lines.push(`  option：${entry.option}`);
      lines.push(
        `  还需填写：${entry.requires.map((field) => FIELD_NAMES[field] ?? field).join("、")}`,
      );
    }
  }
  return lines;
}

function renderQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((question, index) => {
    if (!isRecord(question) || typeof question.stem !== "string") return [];
    const lines = [`${index + 1}. ${question.stem}`];
    if (isRecord(question.options)) {
      for (const key of ["A", "B", "C", "D"]) {
        if (typeof question.options[key] === "string")
          lines.push(`   ${key}. ${question.options[key]}`);
      }
    }
    return lines;
  });
}

function findNestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value[key])) return value[key] as Record<string, unknown>;
  for (const entry of Object.values(value)) {
    const found = findNestedRecord(entry, key);
    if (found) return found;
  }
  return undefined;
}

function bankText(args: Record<string, unknown>, result: LingyeSuccess): string {
  const data = result.data;
  const lines = ["🏦 铃野银行", result.text];
  if (typeof args.option === "string") lines.push(`本次业务：${optionLabel(args.option)}`);
  const facts = isRecord(data.current) ? data.current : data;
  const section = typeof data.section === "string" ? data.section : null;
  const account = isRecord(facts.account)
    ? facts.account
    : section === "account" && isRecord(data.value)
      ? data.value
      : undefined;
  if (account) {
    lines.push(
      `账户：可用金币 ${scalar(account.availableGold)}，金币活期 ${scalar(account.demandGold)}，金币定期 ${scalar(account.termGold)}；可用银币 ${scalar(account.availableSilver)}，小机可自主使用 ${scalar(account.agentSpendableSilver)}，已锁定 ${scalar(account.silverAgentLock)}。`,
      `信用：${scalar(account.creditPoints)} 点；高消费限制：${account.highSpendRestricted ? "有" : "无"}。`,
    );
  }
  const exchange = isRecord(facts.exchange)
    ? facts.exchange
    : section === "exchange" && isRecord(data.value)
      ? data.value
      : undefined;
  if (exchange) {
    lines.push(
      `兑换：${scalar(exchange.goldPerSilver)} 金币兑换 1 银币；本月个人还可发行 ${scalar(exchange.residentRemainingThisMonth)} 银币，全服还可发行 ${scalar(exchange.globalRemainingThisMonth)} 银币。`,
    );
  }
  const deposits = isRecord(facts.deposits)
    ? facts.deposits
    : section === "deposits" && isRecord(data.value)
      ? data.value
      : undefined;
  if (deposits) lines.push("存款记录：", ...recordLines(deposits, "  "));
  const loans = isRecord(facts.loans)
    ? facts.loans
    : section === "loans" && isRecord(data.value)
      ? data.value
      : undefined;
  if (loans) lines.push("贷款记录：", ...recordLines(loans, "  "));
  const credit = isRecord(facts.credit)
    ? facts.credit
    : section === "credit" && isRecord(data.value)
      ? data.value
      : undefined;
  if (credit && !account) lines.push("信用状态：", ...recordLines(credit, "  "));
  if (isRecord(data.reference)) lines.push("查询到的记录：", ...recordLines(data.reference, "  "));
  return [...lines, ...renderOptions("go.bank.choose", data)].join("\n");
}

function schoolText(args: Record<string, unknown>, result: LingyeSuccess): string {
  const data = result.data;
  const lines = ["🏫 铃野职业学校", result.text];
  if (typeof args.option === "string") lines.push(`本次业务：${optionLabel(args.option)}`);
  const reference = isRecord(data.reference) ? data.reference : undefined;
  const content = reference && isRecord(reference.content) ? reference.content : undefined;
  if (content) {
    if (typeof content.title === "string") lines.push(`课程：${content.title}`);
    if (typeof content.contentMarkdown === "string")
      lines.push("课程正文：", content.contentMarkdown);
    const practiceQuestions = renderQuestions(content.practiceQuestions);
    if (practiceQuestions.length > 0)
      lines.push("课程练习（一次查看全部 5 题）：", ...practiceQuestions);
  }
  const paper =
    reference && isRecord(reference.paper) ? reference.paper : findNestedRecord(data, "paper");
  const questionSource =
    paper?.publicPaper ?? paper?.questions ?? findNestedRecord(data, "result")?.questions;
  const questions = renderQuestions(questionSource);
  const questionCount = Array.isArray(questionSource)
    ? questionSource.filter((question) => isRecord(question) && typeof question.stem === "string")
        .length
    : 0;
  if (questions.length > 0) lines.push(`试卷（一次查看全部 ${questionCount} 题）：`, ...questions);

  const facts = isRecord(data.current) ? data.current : data;
  const tracks = Array.isArray(facts.careers)
    ? facts.careers
    : data.section === "careers" && Array.isArray(data.value)
      ? data.value
      : undefined;
  if (tracks) {
    lines.push(
      tracks.length === 0
        ? "职业轨道：尚未选择。"
        : `职业轨道：${tracks.map((track) => (isRecord(track) ? (CAREER_NAMES[String(track.career)] ?? String(track.career)) : String(track))).join("、")}。`,
    );
  }
  const courseSection = data.section === "courses" && isRecord(data.value) ? data.value : undefined;
  const courseCatalog = Array.isArray(facts.courseCatalog)
    ? facts.courseCatalog
    : courseSection && Array.isArray(courseSection.catalog)
      ? courseSection.catalog
      : undefined;
  if (courseCatalog) {
    lines.push("课程目录：");
    for (const rawCourse of courseCatalog) {
      if (!isRecord(rawCourse)) continue;
      const career = CAREER_NAMES[String(rawCourse.career)] ?? String(rawCourse.career);
      lines.push(
        `- ${career} ${scalar(rawCourse.qualificationLevel)} 级第 ${scalar(rawCourse.courseIndex)} 门 ${scalar(rawCourse.title)}；学费 ${scalar(rawCourse.tuitionGold)} 金币；课程内容${rawCourse.contentAvailable ? "已就绪" : "暂不可用"}。`,
      );
    }
  }
  const courseProgress = Array.isArray(facts.courses)
    ? facts.courses
    : courseSection && Array.isArray(courseSection.progress)
      ? courseSection.progress
      : data.section === "courses" && Array.isArray(data.value)
        ? data.value
        : undefined;
  if (courseProgress) {
    lines.push(
      courseProgress.length === 0 ? "课程进度：尚未报名课程。" : "课程进度：",
      ...recordLines({ courses: courseProgress }, "  "),
    );
    for (const course of courseProgress) {
      if (
        isRecord(course) &&
        typeof course.career === "string" &&
        Number.isSafeInteger(course.qualificationLevel) &&
        Number.isSafeInteger(course.courseIndex)
      ) {
        const reference = `${course.career}:${course.qualificationLevel}:${course.courseIndex}`;
        lines.push(
          `读取这门课程全文：doorbell(${JSON.stringify({ op: "go.school.view", args: { reference } })})`,
        );
      }
    }
  }
  const exams = Array.isArray(facts.exams)
    ? facts.exams
    : data.section === "exams" && Array.isArray(data.value)
      ? data.value
      : undefined;
  if (exams)
    lines.push(
      exams.length === 0 ? "考试记录：无。" : "考试记录：",
      ...recordLines({ exams }, "  "),
    );
  const certificates = Array.isArray(facts.certificates)
    ? facts.certificates
    : data.section === "certificates" && Array.isArray(data.value)
      ? data.value
      : undefined;
  if (certificates)
    lines.push(
      certificates.length === 0 ? "资格证：无。" : "资格证：",
      ...recordLines({ certificates }, "  "),
    );
  const employment = isRecord(facts.employment)
    ? facts.employment
    : data.section === "employment" && isRecord(data.value)
      ? data.value
      : undefined;
  if (employment) lines.push("任职与排班：", ...recordLines(employment, "  "));
  if (reference && !content && !paper)
    lines.push("查询到的记录：", ...recordLines(reference, "  "));
  return [...lines, ...renderOptions("go.school.choose", data)].join("\n");
}

function commissionText(op: string, args: Record<string, unknown>, result: LingyeSuccess): string {
  const data = result.data;
  const lines = ["📋 铃野委托", result.text];
  if (typeof args.option === "string") lines.push(`本次业务：${optionLabel(args.option)}`);
  if (isRecord(data.result)) lines.push("办理结果：", ...recordLines(data.result, "  "));
  if (isRecord(data.message)) lines.push("委托消息：", ...recordLines(data.message, "  "));
  if (isRecord(data.world)) lines.push("处理后的世界事实：", ...recordLines(data.world, "  "));
  if (Array.isArray(data.jobs))
    lines.push(
      data.jobs.length === 0 ? "当前委托：无。" : "当前委托：",
      ...recordLines({ jobs: data.jobs }, "  "),
    );
  if (Array.isArray(data.sources))
    lines.push(
      data.sources.length === 0 ? "可以发起的真实事项：无。" : "可以发起的真实事项：",
      ...recordLines({ sources: data.sources }, "  "),
    );
  if (isRecord(data.chef)) lines.push("料理师业务：", ...recordLines(data.chef, "  "));
  if (isRecord(data.reference)) lines.push("查询到的委托：", ...recordLines(data.reference, "  "));
  return [...lines, ...renderOptions(op, data)].join("\n");
}

export function renderLingyeToolText(
  op: string,
  args: Record<string, unknown>,
  result: LingyeSuccess,
): string {
  if (op.startsWith("go.bank.")) return bankText(args, result);
  if (op.startsWith("go.school.")) return schoolText(args, result);
  return commissionText(op, args, result);
}
