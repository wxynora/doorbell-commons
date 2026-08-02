import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  FarmDirectoryClient,
  FarmDirectoryUnavailableError,
  FarmNotFoundError,
} from "./farm-directory-client.js";

interface FakeFarmServer {
  baseUrl: string;
  paths: string[];
  close(): Promise<void>;
}

async function startFakeFarmServer(
  responseForPath: (path: string) => { statusCode: number; body: unknown },
): Promise<FakeFarmServer> {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    paths.push(path);
    const result = responseForPath(path);
    response.writeHead(result.statusCode, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/farm/`,
    paths,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

test("farm directory uses the existing read-only visit contract and returns id and name", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    body: {
      ok: true,
      text: "public visit",
      farm: { id: "3ET3FE", name: "渡的小农场", plots: [] },
    },
  }));
  try {
    const client = new FarmDirectoryClient({ apiBaseUrl: fakeFarm.baseUrl });
    assert.deepEqual(await client.lookupFarm("3ET3FE"), {
      farmDoorplate: "3ET3FE",
      farmName: "渡的小农场",
    });
    assert.deepEqual(fakeFarm.paths, ["/farm/c?a=visit&farm=3ET3FE&detail=true"]);
  } finally {
    await fakeFarm.close();
  }
});

test("farm directory recognizes only the visit contract's exact missing-farm response", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 400,
    body: { ok: false, text: "找不到农场 3ET3FE" },
  }));
  try {
    const client = new FarmDirectoryClient({ apiBaseUrl: fakeFarm.baseUrl });
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmNotFoundError);
  } finally {
    await fakeFarm.close();
  }
});

test("farm directory treats upstream failures and malformed farm records as unavailable", async () => {
  let mode: "failure" | "malformed" = "failure";
  const fakeFarm = await startFakeFarmServer(() =>
    mode === "failure"
      ? { statusCode: 500, body: { ok: false, text: "upstream failure" } }
      : { statusCode: 200, body: { ok: true, farm: { id: "OTHER", name: 123 } } },
  );
  try {
    const client = new FarmDirectoryClient({ apiBaseUrl: fakeFarm.baseUrl });
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
    mode = "malformed";
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
  } finally {
    await fakeFarm.close();
  }
});
