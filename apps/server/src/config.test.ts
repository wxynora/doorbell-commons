import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readBrowserPushConfig,
  readFarmApiBaseUrl,
  readFarmHumanUiBaseUrl,
  readLingyeDailyPublishToken,
  readQqGroupEligibilityConfig,
  readUpstreamRequestTimeoutMs,
} from "./config.js";

test("browser push stays disabled unless the complete explicit configuration is present", () => {
  assert.equal(readBrowserPushConfig({}), null);
  assert.throws(
    () =>
      readBrowserPushConfig({
        DOORBELL_WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
      }),
    /must provide all VAPID and TTL values/,
  );
  assert.deepEqual(
    readBrowserPushConfig({
      DOORBELL_WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
      DOORBELL_WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
      DOORBELL_WEB_PUSH_VAPID_SUBJECT: "mailto:operator@example.com",
      DOORBELL_WEB_PUSH_TTL_SECONDS: "300",
    }),
    {
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:operator@example.com",
      ttlSeconds: 300,
    },
  );
  assert.throws(
    () =>
      readBrowserPushConfig({
        DOORBELL_WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        DOORBELL_WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
        DOORBELL_WEB_PUSH_VAPID_SUBJECT: "operator@example.com",
        DOORBELL_WEB_PUSH_TTL_SECONDS: "300",
      }),
    /must use mailto or https/,
  );
  assert.throws(
    () =>
      readBrowserPushConfig({
        DOORBELL_WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        DOORBELL_WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
        DOORBELL_WEB_PUSH_VAPID_SUBJECT: "https://doorbellcommons.com",
        DOORBELL_WEB_PUSH_TTL_SECONDS: "0",
      }),
    /must be a positive safe integer/,
  );
});

test("QQ group eligibility uses only the required private deployment value", () => {
  const config = readQqGroupEligibilityConfig({
    ONEBOT_API_BASE_URL: "https://onebot.example/",
    ONEBOT_API_TOKEN: "read-token",
    DOORBELL_QQ_GROUP_ID: "12345",
  });
  assert.equal(config.qqGroupId, "12345");
  assert.throws(
    () =>
      readQqGroupEligibilityConfig({
        ONEBOT_API_BASE_URL: "https://onebot.example/",
        ONEBOT_API_TOKEN: "read-token",
      }),
    /DOORBELL_QQ_GROUP_ID is required/,
  );
  assert.throws(
    () =>
      readQqGroupEligibilityConfig({
        ONEBOT_API_BASE_URL: "https://onebot.example/",
        ONEBOT_API_TOKEN: "read-token",
        DOORBELL_QQ_GROUP_ID: "not-a-group-id",
      }),
    /must be a positive decimal identifier/,
  );
});

test("Lingye Daily publish token is mandatory and remains opaque", () => {
  assert.equal(
    readLingyeDailyPublishToken({ DOORBELL_LINGYE_DAILY_PUBLISH_TOKEN: "daily-secret" }),
    "daily-secret",
  );
  assert.throws(
    () => readLingyeDailyPublishToken({}),
    /DOORBELL_LINGYE_DAILY_PUBLISH_TOKEN is required/,
  );
});

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

test("farm Human UI base URL is a trusted public HTTPS path", () => {
  assert.equal(
    readFarmHumanUiBaseUrl({
      DOORBELL_FARM_HUMAN_UI_BASE_URL: "https://doorbellcommons.com/farm-test",
    }),
    "https://doorbellcommons.com/farm-test/",
  );
  assert.equal(
    readFarmHumanUiBaseUrl({ DOORBELL_FARM_HUMAN_UI_BASE_URL: "http://127.0.0.1:8092/" }),
    "http://127.0.0.1:8092/",
  );
  assert.throws(() => readFarmHumanUiBaseUrl({}), /DOORBELL_FARM_HUMAN_UI_BASE_URL is required/);
  assert.throws(
    () =>
      readFarmHumanUiBaseUrl({
        DOORBELL_FARM_HUMAN_UI_BASE_URL: "http://doorbellcommons.com/farm-test/",
      }),
    /must use https outside loopback development/,
  );
});

test("upstream request timeout is mandatory and accepts only positive integer milliseconds", () => {
  assert.equal(
    readUpstreamRequestTimeoutMs({ DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS: "12000" }),
    12_000,
  );
  assert.throws(
    () => readUpstreamRequestTimeoutMs({}),
    /DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS is required/,
  );
  assert.throws(
    () => readUpstreamRequestTimeoutMs({ DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS: "0" }),
    /must be a positive integer/,
  );
  assert.throws(
    () => readUpstreamRequestTimeoutMs({ DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS: "1.5" }),
    /must be a positive integer/,
  );
});
