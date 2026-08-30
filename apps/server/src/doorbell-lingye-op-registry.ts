import { z } from "zod";
import type { DoorbellCallExample } from "./doorbell-farm-op-registry.js";

export interface LingyeOperationDefinition {
  op:
    | "go.bank.view"
    | "go.bank.choose"
    | "go.school.view"
    | "go.school.choose"
    | "go.farm.commission"
    | "go.hospital.commission"
    | "go.newsroom.commission"
    | "go.security.commission";
  modelVisible: boolean;
  description: string;
  argsHint: string;
  argsSchema: z.ZodType<Record<string, unknown>>;
  examples: readonly DoorbellCallExample[];
}

type ArgsShape = Record<string, z.ZodType>;

const nonEmptyString = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const termDays = z.union([z.literal(14), z.literal(30), z.literal(60)]);
const schoolAnswer = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-D]$/u, "答案必须是 A、B、C 或 D");
const schoolSelection = z
  .array(schoolAnswer)
  .min(1)
  .max(4)
  .refine((answers) => new Set(answers).size === answers.length, "同一题不能重复选择同一答案")
  .transform((answers) => answers.toSorted());
const schoolAnswers = z
  .array(schoolSelection)
  .refine((answers) => answers.length === 5 || answers.length === 20, {
    message: "答案数量必须是课程练习的 5 题或正式笔试的 20 题",
  });

function strictArgs(branches: readonly ArgsShape[]): z.ZodType<Record<string, unknown>> {
  const schemas = branches.map((branch) => z.strictObject(branch));
  const first = schemas[0];
  const second = schemas[1];
  if (!first) {
    throw new Error("A Lingye operation must define at least one args branch");
  }
  if (!second) {
    return first as z.ZodType<Record<string, unknown>>;
  }
  return z.union([first, second, ...schemas.slice(2)]) as z.ZodType<Record<string, unknown>>;
}

function defineOperation(
  definition: Omit<LingyeOperationDefinition, "argsSchema" | "examples"> & {
    branches: readonly ArgsShape[];
    exampleArgs: readonly Record<string, unknown>[];
  },
): LingyeOperationDefinition {
  return {
    op: definition.op,
    modelVisible: definition.modelVisible,
    description: definition.description,
    argsHint: definition.argsHint,
    argsSchema: strictArgs(definition.branches),
    examples: definition.exampleArgs.map((args) => ({ op: definition.op, args })),
  };
}

const commissionBranches: readonly ArgsShape[] = [
  {},
  { reference: nonEmptyString },
  { option: nonEmptyString },
  { option: nonEmptyString, amount: positiveInteger },
  { option: nonEmptyString, text: nonEmptyString },
  { option: nonEmptyString, amount: positiveInteger, text: nonEmptyString },
];

export const lingyeOperations = [
  defineOperation({
    op: "go.bank.view",
    modelVisible: true,
    description:
      "查看自己的账户、存款、兑换、贷款和信用事实，以及当前可以办理的 option；只读，不扣款。",
    argsHint: '{} 或 {section:"account"|"deposits"|"exchange"|"loans"|"credit"} 或 {reference}',
    branches: [
      {},
      { section: z.enum(["account", "deposits", "exchange", "loans", "credit"]) },
      { reference: nonEmptyString },
    ],
    exampleArgs: [{ section: "loans" }],
  }),
  defineOperation({
    op: "go.bank.choose",
    modelVisible: true,
    description:
      "提交 go.bank.view 当前返回的 option 办理银行业务。金币兑换银币时 amount 表示投入金币；玩家借款时 amount 表示银币，to 只填写对方公开门牌。",
    argsHint:
      "{option}、{option,amount}、{option,amount,termDays}、{option,amount,termDays,totalRatePpm} 或 {option,to,amount,termDays,totalRatePpm}",
    branches: [
      { option: nonEmptyString },
      { option: nonEmptyString, amount: positiveInteger },
      { option: nonEmptyString, amount: positiveInteger, termDays },
      {
        option: nonEmptyString,
        amount: positiveInteger,
        termDays,
        totalRatePpm: positiveInteger,
      },
      {
        option: nonEmptyString,
        to: nonEmptyString,
        amount: positiveInteger,
        termDays,
        totalRatePpm: positiveInteger,
      },
    ],
    exampleArgs: [{ option: "returned-option", amount: 500 }],
  }),
  defineOperation({
    op: "go.school.view",
    modelVisible: true,
    description:
      "查看自己的职业轨道、课程、考试、证书、任职状态和当前可以办理的 option；只读，不扣款。",
    argsHint:
      '{} 或 {section:"careers"|"courses"|"exams"|"certificates"|"employment"|"interviews"|"publicNotices"} 或 {reference}',
    branches: [
      {},
      {
        section: z.enum([
          "careers",
          "courses",
          "exams",
          "certificates",
          "employment",
          "interviews",
          "publicNotices",
        ]),
      },
      { reference: nonEmptyString },
    ],
    exampleArgs: [{ section: "courses" }],
  }),
  defineOperation({
    op: "go.school.choose",
    modelVisible: true,
    description:
      '提交 go.school.view 当前返回的 option。课程练习和正式笔试必须一次提交整卷 answers；每题用数组表示所选答案，例如 ["A"] 或 ["A","C"]。需要付费时系统自动扣款或冻结，余额不足则业务不创建。',
    argsHint: '{option} 或 {option,answers:[...["A"]|["A","C"]]}',
    branches: [{ option: nonEmptyString }, { option: nonEmptyString, answers: schoolAnswers }],
    exampleArgs: [{ option: "returned-option" }],
  }),
  defineOperation({
    op: "go.farm.commission",
    modelVisible: true,
    description:
      "查看或推进公共农场中的真实农艺委托、料理师原创菜谱交易、料理店经营和已绑定工作的沟通。空 args 查看当前事实与合法 option；后续只提交服务端返回的 option。",
    argsHint: "{}、{reference}、{option}、{option,amount}、{option,text} 或 {option,amount,text}",
    branches: commissionBranches,
    exampleArgs: [{}],
  }),
  defineOperation({
    op: "go.hospital.commission",
    modelVisible: true,
    description:
      "查看或推进真实动物病例的诊疗委托。空 args 用于查看病例委托和合法选项；需要时可以选择真人医生或高价医院 NPC。从业者转交后，动物主人可以选择服务端返回的高价医院 NPC option 完成保底处理。",
    argsHint: "{}、{reference}、{option}、{option,amount}、{option,text} 或 {option,amount,text}",
    branches: commissionBranches,
    exampleArgs: [{ reference: "commission-id" }],
  }),
  defineOperation({
    op: "go.newsroom.commission",
    modelVisible: true,
    description:
      "查看或推进由真实公共素材形成的日报工作、正式板块和已出版稿件评价。空 args 查看当前事实与合法 option；后续只提交服务端返回的 option。三级及以上记者可以使用创建板块 option，并在 text 中填写板块名称。板块创建后立即生效；具体稿件仍须通过日报社的事实、来源、隐私和格式审核。",
    argsHint: "{}、{reference}、{option}、{option,amount}、{option,text} 或 {option,amount,text}",
    branches: commissionBranches,
    exampleArgs: [{ option: "returned-option", text: "稿件正文" }],
  }),
  defineOperation({
    op: "go.security.commission",
    modelVisible: true,
    description:
      "查看或推进由真实投诉、上诉或权威记录形成的治安事项。空 args 用于查看事项和合法选项；治安官不能自行创建案件或跳过程序。",
    argsHint: "{}、{reference}、{option}、{option,amount}、{option,text} 或 {option,amount,text}",
    branches: commissionBranches,
    exampleArgs: [{ option: "returned-option", text: "补充说明" }],
  }),
] as const satisfies readonly LingyeOperationDefinition[];

export const lingyeOperationNames = lingyeOperations.map((operation) => operation.op);
export const lingyeOperationByName = new Map<string, LingyeOperationDefinition>(
  lingyeOperations.map((operation) => [operation.op, operation] as const),
);
export const modelVisibleLingyeOperations = lingyeOperations.filter(
  (operation) => operation.modelVisible,
);
export const modelVisibleLingyeOperationNames = modelVisibleLingyeOperations.map(
  (operation) => operation.op,
);
export const modelVisibleLingyeOperationByName = new Map<string, LingyeOperationDefinition>(
  modelVisibleLingyeOperations.map((operation) => [operation.op, operation] as const),
);

if (lingyeOperations.length !== 8 || lingyeOperationByName.size !== lingyeOperations.length) {
  throw new Error("The initial Doorbell Lingye registry must contain 8 unique operations");
}
if (
  modelVisibleLingyeOperations.length !== 8 ||
  modelVisibleLingyeOperationByName.size !== modelVisibleLingyeOperations.length
) {
  throw new Error("The Doorbell Lingye registry must expose all eight ready operations");
}
