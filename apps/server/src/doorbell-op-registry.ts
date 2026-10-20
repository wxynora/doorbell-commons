import { loungeOperations, loungeOperationByName, type LoungeOperationDefinition } from "./lounge-tool-registry.js";
import { z } from "zod";
import { dailyReadOperation } from "./lingye-daily-read-op.js";
import { dailySubmissionOperation } from "./lingye-daily-submission-op.js";
import { dailyCommentOperation } from "./lingye-daily-comment-op.js";
import {
  DOORBELL_INITIALIZE_INSTRUCTIONS,
  type DoorbellCallExample,
  DOORBELL_TOOL_DESCRIPTION as FARM_TOOL_DESCRIPTION,
  type FarmOperationDefinition,
  farmOperationByName,
  farmOperationNames,
} from "./doorbell-farm-op-registry.js";
import {
  type LingyeOperationDefinition,
  modelVisibleLingyeOperationByName,
  modelVisibleLingyeOperationNames,
  modelVisibleLingyeOperations,
} from "./doorbell-lingye-op-registry.js";

export type { DoorbellCallExample };
export { DOORBELL_INITIALIZE_INSTRUCTIONS };

type DailyOperationDefinition = typeof dailyReadOperation | typeof dailySubmissionOperation | typeof dailyCommentOperation;
export type DoorbellOperationDefinition = FarmOperationDefinition | LingyeOperationDefinition | DailyOperationDefinition | LoungeOperationDefinition;
export type DoorbellRegisteredOperation =
  | { kind: "farm"; operation: FarmOperationDefinition }
  | { kind: "lingye"; operation: LingyeOperationDefinition }
  | { kind: "daily"; operation: DailyOperationDefinition }
  | { kind: "lounge"; operation: LoungeOperationDefinition };

export const doorbellOperationNames = [
  ...loungeOperations.map(operation => operation.op),
  ...farmOperationNames,
  ...modelVisibleLingyeOperationNames,
  dailyReadOperation.op,
  dailySubmissionOperation.op,
  dailyCommentOperation.op,
] as readonly string[];

const expectedOperationCount = farmOperationNames.length + modelVisibleLingyeOperationNames.length + 3 + loungeOperations.length;
if (
  doorbellOperationNames.length !== expectedOperationCount ||
  new Set(doorbellOperationNames).size !== expectedOperationCount
) {
  throw new Error("The Doorbell registry must contain only unique ready operations");
}

export function findDoorbellOperation(op: string): DoorbellRegisteredOperation | undefined {
  const lounge = loungeOperationByName.get(op);
  if (lounge) return { kind: "lounge", operation: lounge };
  if (op === dailyCommentOperation.op) return { kind: "daily", operation: dailyCommentOperation };
  if (op === dailyReadOperation.op) return { kind: "daily", operation: dailyReadOperation };
  if (op === dailySubmissionOperation.op) return { kind: "daily", operation: dailySubmissionOperation };
  const farm = farmOperationByName.get(op);
  if (farm) {
    return { kind: "farm", operation: farm };
  }
  const lingye = modelVisibleLingyeOperationByName.get(op);
  return lingye ? { kind: "lingye", operation: lingye } : undefined;
}

const LINGYE_OPERATION_INDEX = [...loungeOperations, ...modelVisibleLingyeOperations, dailyReadOperation, dailySubmissionOperation, dailyCommentOperation]
  .map((operation) => `${operation.op} args ${operation.argsHint} — ${operation.description}`)
  .join("\n");

const LINGYE_TOOL_DESCRIPTION = `${FARM_TOOL_DESCRIPTION}

铃野公共地点使用 go.<地点>.<动作>。银行和学校先调用 view 读取真实事实与当前 option；农场、动物医院和治安署以空 args 调用 commission 查看真实委托。日报社具体任务通过铃发放，收到后直接使用铃内 option 提交，无需先空参数查看。只能原样使用服务端或铃提供的当前 option，不得自行编造。需要付费的 option 会在同一操作中自动检查并冻结费用；余额不足时业务不创建，也不会产生扣款事实。`;

const LINGYE_TOOL_DESCRIPTION_WITH_INDEX = `${LINGYE_TOOL_DESCRIPTION}

当前铃野操作：
${LINGYE_OPERATION_INDEX}`;

export const DOORBELL_TOOL_DESCRIPTION = LINGYE_TOOL_DESCRIPTION_WITH_INDEX;

const togetherChooseOperation = farmOperationByName.get("farm.together.choose");
if (!togetherChooseOperation) {
  throw new Error("The Together choose operation must exist in the Farm registry");
}
const togetherChooseSchema = z.toJSONSchema(togetherChooseOperation.argsSchema, {
  target: "draft-7",
  unrepresentable: "any",
});
const { $schema: _dialect, ...togetherChooseArgs } = togetherChooseSchema;

export const doorbellToolDefinition = {
  name: "doorbell",
  description: DOORBELL_TOOL_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      op: { type: "string", enum: doorbellOperationNames },
      args: { type: "object" },
    },
    required: ["op", "args"],
    additionalProperties: false,
    anyOf: [
      { properties: { op: { const: "farm.together.choose" }, args: togetherChooseArgs } },
      {
        properties: {
          op: { enum: doorbellOperationNames.filter((op) => op !== "farm.together.choose") },
        },
      },
    ],
  },
} as const;

interface OperationForExamples {
  argsSchema: z.ZodType<Record<string, unknown>>;
  examples: readonly DoorbellCallExample[];
}

export function examplesForDoorbellInvalidArgs(
  operation: OperationForExamples,
  invalidArgs: unknown,
): readonly DoorbellCallExample[] {
  if (!invalidArgs || typeof invalidArgs !== "object" || Array.isArray(invalidArgs)) {
    return operation.examples;
  }
  const candidate = invalidArgs as Record<string, unknown>;
  const discriminatorKeys = ["source", "kind", "section", "destination"] as const;
  let matches = [...operation.examples];
  let narrowed = false;
  for (const key of discriminatorKeys) {
    if (candidate[key] === undefined) {
      continue;
    }
    const next = matches.filter((example) => example.args[key] === candidate[key]);
    if (next.length > 0) {
      matches = next;
      narrowed = true;
    }
  }
  if (!narrowed) {
    const structuralKeys = Object.keys(candidate);
    const structural = matches.filter((example) =>
      structuralKeys.some((key) => Object.hasOwn(example.args, key)),
    );
    if (structural.length > 0) {
      matches = structural;
    }
  }
  return matches;
}

/** Only advertise lounge actions after their real runtime has been assembled. */
export function doorbellDefinitionForRuntime(loungeReady: boolean) {
  if (loungeReady) return doorbellToolDefinition;
  return {
    ...doorbellToolDefinition,
    description: doorbellToolDefinition.description.split("\n").filter(line => !line.startsWith("go.lounge.")).join("\n"),
    inputSchema: {
      ...doorbellToolDefinition.inputSchema,
      properties: {
        ...doorbellToolDefinition.inputSchema.properties,
        op: { ...doorbellToolDefinition.inputSchema.properties.op,
          enum: doorbellOperationNames.filter(op => !loungeOperationByName.has(op)) },
      },
    },
  };
}
