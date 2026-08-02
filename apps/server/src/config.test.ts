import assert from "node:assert/strict";
import { test } from "node:test";
import { readFarmApiBaseUrl } from "./config.js";

test("farm API base URL is required and accepts only HTTP or HTTPS", () => {
  assert.equal(
    readFarmApiBaseUrl({ DOORBELL_FARM_API_BASE_URL: "https://doorbellcommons.com/farm" }),
    "https://doorbellcommons.com/farm",
  );
  assert.throws(() => readFarmApiBaseUrl({}), /DOORBELL_FARM_API_BASE_URL is required/);
  assert.throws(
    () => readFarmApiBaseUrl({ DOORBELL_FARM_API_BASE_URL: "file:///tmp/farm" }),
    /must use http or https/,
  );
});
