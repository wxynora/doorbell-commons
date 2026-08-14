import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-request-store-safety-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const { allFarms, createFarm, load } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

async function request(baseUrl, path, body, contentType = "application/json") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  return { response, payload: await response.json() };
}

test("malformed and oversized request bodies fail without mutating farm state", async (t) => {
  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const malformed = await request(baseUrl, "/farms", "{");
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.payload.error.code, "invalid_json");
  assert.equal(allFarms().length, 0);

  const oversizedJson = await request(
    baseUrl,
    "/farms",
    JSON.stringify({ name: "x".repeat(17 * 1024) }),
  );
  assert.equal(oversizedJson.response.status, 413);
  assert.equal(oversizedJson.payload.error.code, "body_too_large");
  assert.equal(allFarms().length, 0);

  const farm = createFarm("表单上限测试");
  const oversizedForm = await request(
    baseUrl,
    `/ui/${farm.humanKey}/title`,
    `id=${"x".repeat(17 * 1024)}`,
    "application/x-www-form-urlencoded",
  );
  assert.equal(oversizedForm.response.status, 413);
  assert.equal(oversizedForm.payload.error.code, "body_too_large");
  assert.equal(farm.titleEquipped, undefined);
});

test("a corrupt current-format world remains in place and aborts loading", () => {
  const worldFile = join(dataDirectory, "world.json");
  writeFileSync(worldFile, "{malformed", "utf8");

  assert.throws(() => load(), /联机世界存档损坏，拒绝启动/);
  assert.equal(readFileSync(worldFile, "utf8"), "{malformed");
  assert.equal(existsSync(`${worldFile}.corrupt`), false);
});
