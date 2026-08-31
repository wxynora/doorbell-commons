import assert from "node:assert/strict";
import { test } from "node:test";
import { FarmActionListAuthorityClient } from "./farm-action-list-authority-client.js";

test("action-list authority client accepts only the bound structured projection", async () => {
  const client = new FarmActionListAuthorityClient({
    apiBaseUrl: "https://farm.example/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-token",
    fetchImplementation: async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        farm_human_key: "human-key",
        expected_farm_doorplate: "3ET3FE",
      });
      return new Response(
        JSON.stringify({
          data: {
            farm: { farm_doorplate: "3ET3FE" },
            steal: {
              status: "available",
              targets: [
                {
                  target: "2",
                  farm_name: "邻居农场",
                  ripe_plot_ids: [1, 3],
                },
              ],
            },
            fishing: {
              status: "available",
              daily_limit: 20,
              used_today: 17,
              remaining_today: 3,
              available_baits: [{ bait_id: "basic_worm", name: "普通蚯蚓", quantity: 2 }],
            },
            activities: [
              {
                activity_id: "glimmer",
                name: "流光原野",
                completed: false,
                call: { op: "farm.glimmer.status", args: {} },
              },
            ],
          },
          server_time: "2026-08-31T04:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.readActionListAuthority({
    farmDoorplate: "3ET3FE",
    farmHumanKey: "human-key",
  });
  assert.equal(result.data.steal.targets[0]?.target, "2");
  assert.equal(result.data.fishing.remaining_today, 3);
  assert.equal(result.data.activities[0]?.name, "流光原野");
});
