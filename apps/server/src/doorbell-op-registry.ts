import type { z } from "zod";
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
  lingyeOperationByName,
  lingyeOperationNames,
} from "./doorbell-lingye-op-registry.js";

export type { DoorbellCallExample };
export { DOORBELL_INITIALIZE_INSTRUCTIONS };

export type DoorbellOperationDefinition = FarmOperationDefinition | LingyeOperationDefinition;
export type DoorbellRegisteredOperation =
  | { kind: "farm"; operation: FarmOperationDefinition }
  | { kind: "lingye"; operation: LingyeOperationDefinition };

export const doorbellOperationNames = [...farmOperationNames, ...lingyeOperationNames] as const;

if (doorbellOperationNames.length !== 66 || new Set(doorbellOperationNames).size !== 66) {
  throw new Error("The Doorbell registry must contain 66 unique operations");
}

export function findDoorbellOperation(op: string): DoorbellRegisteredOperation | undefined {
  const farm = farmOperationByName.get(op);
  if (farm) {
    return { kind: "farm", operation: farm };
  }
  const lingye = lingyeOperationByName.get(op);
  return lingye ? { kind: "lingye", operation: lingye } : undefined;
}

export const DOORBELL_TOOL_DESCRIPTION = `${FARM_TOOL_DESCRIPTION}

铃野公共地点使用 go.<地点>.<动作>。银行和学校先调用 view 读取真实事实与当前 option；职业地点以空 args 调用 commission 查看真实委托。后续只能原样提交服务端返回的 option，不得自行编造流程名称、身份字段或内部结算命令。需要付费的 option 会在同一操作中自动检查并冻结费用；余额不足时业务不创建，也不会产生扣款事实。`;

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
