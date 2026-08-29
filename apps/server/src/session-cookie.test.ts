import assert from "node:assert/strict";
import test from "node:test";
import {
  HUMAN_SESSION_MAX_AGE_SECONDS,
  readHumanSessionToken,
  serializeClearedHumanSessionCookie,
  serializeHumanSessionCookie,
} from "./session-cookie.js";

test("Human login cookies persist for exactly 30 days without weakening existing attributes", () => {
  assert.equal(HUMAN_SESSION_MAX_AGE_SECONDS, 2_592_000);
  assert.equal(
    serializeHumanSessionCookie("opaque-token", true),
    "doorbell_session=opaque-token; HttpOnly; SameSite=Lax; Path=/api; Max-Age=2592000; Secure",
  );
  assert.equal(
    serializeHumanSessionCookie("opaque-token", false),
    "doorbell_session=opaque-token; HttpOnly; SameSite=Lax; Path=/api; Max-Age=2592000",
  );
});

test("logout still expires the same scoped cookie immediately", () => {
  assert.equal(
    serializeClearedHumanSessionCookie(true),
    "doorbell_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0; Secure",
  );
  assert.equal(
    readHumanSessionToken("other=value; doorbell_session=opaque-token; mode=one"),
    "opaque-token",
  );
});
