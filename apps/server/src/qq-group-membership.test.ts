import assert from "node:assert/strict";
import test from "node:test";
import { OneBotGroupMembershipClient, OneBotUnavailableError } from "./qq-group-membership.js";

function clientWithMembers(members: unknown[]) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new OneBotGroupMembershipClient({
    apiBaseUrl: "http://127.0.0.1:3001/",
    apiToken: "test-token",
    requestTimeoutMs: 1_000,
    fetchImplementation: async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({ status: "ok", retcode: 0, data: members }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  return { client, requests };
}

test("a non-empty complete member list distinguishes current membership from real absence", async () => {
  const { client, requests } = clientWithMembers([
    { user_id: 10001 },
    { user_id: "10002" },
  ]);
  assert.equal(await client.isCurrentMember("12345", "10001"), true);
  assert.equal(await client.isCurrentMember("12345", "99999"), false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "http://127.0.0.1:3001/get_group_member_list");
  assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
    group_id: "12345",
    no_cache: true,
  });
  assert.equal(requests[0]?.init.method, "POST");
});

test("an empty successful OneBot member list is an outage and never a mass non-member result", async () => {
  const { client } = clientWithMembers([]);
  await assert.rejects(
    client.isCurrentMember("12345", "10001"),
    (error: unknown) =>
      error instanceof OneBotUnavailableError &&
      /empty member list/u.test(error.message),
  );
});
