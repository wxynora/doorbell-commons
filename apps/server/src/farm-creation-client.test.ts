import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmCreationClient,
  FarmCreationConflictError,
  FarmCreationContractUnavailableError,
  FarmCreationRejectedError,
  FarmCreationUnavailableError,
} from "./farm-creation-client.js";

const CREATION_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const RECEIPT = {
  creation_id: CREATION_ID,
  created: true,
  farm_doorplate: "ABC234",
  farm_name: "辛玥的小农场",
  ai_name: "小渡",
  human_name: "辛玥",
  farm_human_key: "server-only-human-key",
  created_at: "2026-08-14T00:00:00.000Z",
};

test("farm creation client uses only the configured service endpoint and validates the receipt", async () => {
  const calls: Array<{ body: string; headers: Headers; url: string }> = [];
  const client = new FarmCreationClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async (input, init) => {
      calls.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
        url: String(input),
      });
      return Response.json(RECEIPT, { status: 201 });
    },
  });

  const receipt = await client.createFarm({
    creationId: CREATION_ID,
    farmName: "辛玥的小农场",
    aiName: "小渡",
    humanName: "辛玥",
  });
  assert.deepEqual(receipt, RECEIPT);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://farm.example/farm/internal/doorbell/farm-creation");
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? ""), {
    creation_id: CREATION_ID,
    farm_name: "辛玥的小农场",
    ai_name: "小渡",
    human_name: "辛玥",
  });
});

test("farm creation client separates rejection, conflict, outage, and invalid contracts", async () => {
  const input = {
    creationId: CREATION_ID,
    farmName: "辛玥的小农场",
    aiName: "小渡",
    humanName: "辛玥",
  };
  const createClient = (response: () => Promise<Response>) =>
    new FarmCreationClient({
      apiBaseUrl: "https://farm.example/farm/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: response,
    });

  await assert.rejects(
    createClient(async () =>
      Response.json(
        { ok: false, error: { code: "invalid_request", message: "bad" } },
        { status: 400 },
      ),
    ).createFarm(input),
    FarmCreationRejectedError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json(
        { ok: false, error: { code: "creation_conflict", message: "conflict" } },
        { status: 409 },
      ),
    ).createFarm(input),
    FarmCreationConflictError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json(
        { ok: false, error: { code: "registration_unavailable", message: "closed" } },
        { status: 503 },
      ),
    ).createFarm(input),
    FarmCreationUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...RECEIPT, creation_id: crypto.randomUUID() }),
    ).createFarm(input),
    FarmCreationContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("offline");
    }).createFarm(input),
    FarmCreationUnavailableError,
  );
});

test("farm creation aborts a stalled request as unavailable", async () => {
  const observed: { signal: AbortSignal | undefined } = { signal: undefined };
  const client = new FarmCreationClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 20,
    serviceToken: "service-secret",
    fetchImplementation: async (_input, init) => {
      const requestSignal = init?.signal ?? null;
      observed.signal = requestSignal ?? undefined;
      if (!requestSignal) {
        throw new Error("missing abort signal");
      }
      return await new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
          once: true,
        });
      });
    },
  });

  await assert.rejects(
    client.createFarm({
      creationId: CREATION_ID,
      farmName: "辛玥的小农场",
      aiName: "小渡",
      humanName: "辛玥",
    }),
    FarmCreationUnavailableError,
  );
  assert.equal(observed.signal?.aborted, true);
});
