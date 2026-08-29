import assert from "node:assert/strict";
import test from "node:test";
import {
  lingyeOperations,
  modelVisibleLingyeOperationNames,
} from "./doorbell-lingye-op-registry.js";
import {
  DOORBELL_TOOL_DESCRIPTION,
  doorbellOperationNames,
  doorbellToolDefinition,
  findDoorbellOperation,
} from "./doorbell-op-registry.js";

test("model-visible registry exposes ready Lingye operations while keeping newsroom excluded", () => {
  const expected = [
    "go.bank.view",
    "go.bank.choose",
    "go.school.view",
    "go.school.choose",
    "go.farm.commission",
    "go.hospital.commission",
    "go.security.commission",
  ];
  assert.equal(lingyeOperations.length, 8);
  assert.deepEqual(modelVisibleLingyeOperationNames, expected);
  assert.deepEqual(
    doorbellOperationNames.filter((op) => op.startsWith("go.")),
    expected,
  );
  assert.deepEqual(
    doorbellToolDefinition.inputSchema.properties.op.enum.filter((op) => op.startsWith("go.")),
    expected,
  );
  for (const op of expected) assert.equal(findDoorbellOperation(op)?.kind, "lingye", op);
  assert.equal(findDoorbellOperation("go.newsroom.commission"), undefined);
  assert.match(DOORBELL_TOOL_DESCRIPTION, /铃野公共地点使用 go\./u);
  assert.match(DOORBELL_TOOL_DESCRIPTION, /go\.bank\.choose args/u);
  assert.match(DOORBELL_TOOL_DESCRIPTION, /go\.farm\.commission args/u);
});
