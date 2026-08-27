import assert from "node:assert/strict";
import test from "node:test";
import {
  DOORBELL_TOOL_DESCRIPTION,
  doorbellLingyeOperationsReady,
  doorbellOperationNames,
  doorbellToolDefinition,
  findDoorbellOperation,
} from "./doorbell-op-registry.js";

test("model-visible registry excludes Lingye operations until their authoritative workflows are ready", () => {
  assert.equal(doorbellLingyeOperationsReady, false);
  assert.equal(
    doorbellOperationNames.some((op) => op.startsWith("go.")),
    false,
  );
  assert.equal(
    doorbellToolDefinition.inputSchema.properties.op.enum.some((op) => op.startsWith("go.")),
    false,
  );
  assert.equal(findDoorbellOperation("go.school.choose"), undefined);
  assert.equal(findDoorbellOperation("go.farm.commission"), undefined);
  assert.doesNotMatch(DOORBELL_TOOL_DESCRIPTION, /铃野公共地点使用 go\./u);
});
