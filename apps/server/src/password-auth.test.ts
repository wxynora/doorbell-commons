import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHumanPasswordCredential,
  isValidHumanPassword,
  verifyHumanPassword,
} from "./password-auth.js";

test("human passwords use salted scrypt credentials and exact verification", async () => {
  const first = await createHumanPasswordCredential("correct horse battery staple");
  const second = await createHumanPasswordCredential("correct horse battery staple");

  assert.notEqual(first, second);
  assert.match(first, /^scrypt-v1\$16384\$8\$1\$/);
  assert.equal(await verifyHumanPassword("correct horse battery staple", first), true);
  assert.equal(await verifyHumanPassword("incorrect horse battery staple", first), false);
  assert.equal(await verifyHumanPassword("correct horse battery staple", null), false);
  assert.equal(await verifyHumanPassword("correct horse battery staple", "malformed"), false);
});

test("human password length is exactly 8 through 128 characters", () => {
  assert.equal(isValidHumanPassword("1234567"), false);
  assert.equal(isValidHumanPassword("12345678"), true);
  assert.equal(isValidHumanPassword("x".repeat(128)), true);
  assert.equal(isValidHumanPassword("x".repeat(129)), false);
});
