import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FarmRewardClient,
  FarmRewardContractUnavailableError,
  FarmRewardCredentialInvalidError,
  FarmRewardUnavailableError,
} from "./farm-reward-client.js";

const INPUT = {
  grantId: "doorbell-mailbox:00000000-0000-4000-8000-000000000001",
  farmDoorplate: "ABC234",
  farmHumanKey: "private-farm-human-key",
};

test("farm reward client uses only configured origin, service auth, and verifies the receipt", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: string }> = [];
  const client = new FarmRewardClient({
    apiBaseUrl: "https://farm.example/farm",
    requestTimeoutMs: 1_000,
    serviceToken: "private-service-token",
    fetchImplementation: async (input, init) => {
      calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        authorization: new Headers(init?.headers).get("authorization"),
        body: String(init?.body ?? ""),
      });
      return Response.json({
        ok: true,
        applied: true,
        grant_id: INPUT.grantId,
        farm_doorplate: INPUT.farmDoorplate,
        reward: {
          seed: { id: "ssr-seed", name: "星河麦", rarity: "SSR", quantity: 1 },
          silver: 200,
        },
      });
    },
  });

  await client.grantWelcomeReward(INPUT);
  assert.deepEqual(calls, [
    {
      url: "https://farm.example/farm/internal/doorbell/welcome-reward",
      authorization: "Bearer private-service-token",
      body: JSON.stringify({ grant_id: INPUT.grantId, human_key: INPUT.farmHumanKey }),
    },
  ]);
  assert.equal(calls[0]?.url.includes(INPUT.farmHumanKey), false);
  assert.equal(calls[0]?.url.includes("private-service-token"), false);
});

test("farm reward client separates invalid credential from an unverifiable receipt", async () => {
  const invalidCredential = new FarmRewardClient({
    apiBaseUrl: "https://farm.example/farm",
    requestTimeoutMs: 1_000,
    serviceToken: "service-token",
    fetchImplementation: async () =>
      Response.json(
        { error: { code: "farm_credential_invalid", message: "invalid" } },
        { status: 404 },
      ),
  });
  await assert.rejects(
    () => invalidCredential.grantWelcomeReward(INPUT),
    FarmRewardCredentialInvalidError,
  );

  const mismatchedReceipt = new FarmRewardClient({
    apiBaseUrl: "https://farm.example/farm",
    requestTimeoutMs: 1_000,
    serviceToken: "service-token",
    fetchImplementation: async () =>
      Response.json({
        ok: true,
        applied: false,
        grant_id: INPUT.grantId,
        farm_doorplate: "DEF567",
        reward: {
          seed: { id: "ssr-seed", name: "星河麦", rarity: "SSR", quantity: 1 },
          silver: 200,
        },
      }),
  });
  await assert.rejects(
    () => mismatchedReceipt.grantWelcomeReward(INPUT),
    FarmRewardContractUnavailableError,
  );
});

test("farm reward aborts a stalled request as unavailable", async () => {
  const observed: { signal: AbortSignal | undefined } = { signal: undefined };
  const client = new FarmRewardClient({
    apiBaseUrl: "https://farm.example/farm",
    requestTimeoutMs: 20,
    serviceToken: "service-token",
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

  await assert.rejects(client.grantWelcomeReward(INPUT), FarmRewardUnavailableError);
  assert.equal(observed.signal?.aborted, true);
});
