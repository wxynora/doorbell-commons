import { findDoorbellOperation } from "./doorbell-op-registry.js";

const FARM_OPERATIONS_IN_TOOL_DESCRIPTION = new Set([
  "farm.status",
  "farm.visit",
  "farm.plant",
  "farm.water",
  "farm.message",
  "farm.buy",
]);

export interface FarmActionListToolCall {
  op: string;
  args: Record<string, unknown>;
}

export interface FarmActionListMessageItem {
  text: string;
  toolCalls: readonly FarmActionListToolCall[];
}

export class FarmActionListUnsupportedOperationError extends Error {
  constructor(op: string) {
    super(`The action-list operation ${op} is not exposed by Doorbell`);
    this.name = "FarmActionListUnsupportedOperationError";
  }
}

export class FarmActionListInvalidExampleError extends Error {
  constructor(op: string) {
    super(`The action-list example for ${op} does not match its registered schema`);
    this.name = "FarmActionListInvalidExampleError";
  }
}

export function actionListOperationNeedsExample(op: string): boolean {
  if (op.startsWith("go.")) return false;
  return !FARM_OPERATIONS_IN_TOOL_DESCRIPTION.has(op);
}

export function validateActionListToolCall(call: FarmActionListToolCall): FarmActionListToolCall {
  const registered = findDoorbellOperation(call.op);
  if (!registered) throw new FarmActionListUnsupportedOperationError(call.op);
  const parsed = registered.operation.argsSchema.safeParse(call.args);
  if (!parsed.success) throw new FarmActionListInvalidExampleError(call.op);
  return { op: registered.operation.op, args: parsed.data };
}

export function buildFarmActionListNotificationText(
  humanName: string,
  items: readonly FarmActionListMessageItem[],
): string {
  if (humanName.trim().length === 0 || items.length === 0) {
    throw new TypeError("An action-list notification needs a human name and at least one item");
  }
  const lines = ["【📢来自铃野的通知】", `你的人类${humanName}给你留了这次要做的事：`];
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.text}`);
    const calls = item.toolCalls.map(validateActionListToolCall);
    const examples = calls.filter((call) => actionListOperationNeedsExample(call.op));
    if (examples.length > 0) {
      lines.push(`   工具示例：${examples.map((call) => JSON.stringify(call)).join("\n   ")}`);
    }
  });
  return lines.join("\n");
}
