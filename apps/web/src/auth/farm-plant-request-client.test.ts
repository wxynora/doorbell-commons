import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoundFarmPlantRequest,
  farmPlantRequestIssueMessage,
} from "./farm-plant-request-client";

const INPUT = {
  fieldRevision: "field-v1:before",
  idempotencyKey: "00000000-0000-4000-8000-000000000101",
};

test("plant request client posts the bound revision and accepts the requested result", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const result = await createBoundFarmPlantRequest({
    ...INPUT,
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        data: {
          field_revision: INPUT.fieldRevision,
          empty_plot_count: 3,
          status: "requested",
          expires_at: "2026-09-01T00:00:00.000Z",
        },
        server_time: "2026-08-31T00:00:00.000Z",
      });
    },
  });
  assert.equal(result.ok, true);
  const request = requests[0];
  assert.ok(request?.init);
  assert.equal(request.url, "/api/farm/plant-requests");
  assert.equal(request.init.method, "POST");
  assert.equal(new Headers(request.init.headers).get("idempotency-key"), INPUT.idempotencyKey);
  assert.deepEqual(JSON.parse(String(request.init.body)), {
    field_revision: INPUT.fieldRevision,
  });
});

test("plant request client rejects mismatched, expired, and no-empty-plot responses", async () => {
  const mismatch = await createBoundFarmPlantRequest({
    ...INPUT,
    fetcher: async () =>
      Response.json({
        data: {
          field_revision: "field-v1:other",
          empty_plot_count: 1,
          status: "requested",
          expires_at: "2026-09-01T00:00:00.000Z",
        },
        server_time: "2026-08-31T00:00:00.000Z",
      }),
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.issue.code, "unexpected_response");

  const expired = await createBoundFarmPlantRequest({
    ...INPUT,
    fetcher: async () =>
      Response.json({
        data: {
          field_revision: INPUT.fieldRevision,
          empty_plot_count: 1,
          status: "expired",
          expires_at: "2026-09-01T00:00:00.000Z",
        },
        server_time: "2026-08-31T00:00:00.000Z",
      }),
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.issue.code, "plant_request_expired");

  const noEmpty = await createBoundFarmPlantRequest({
    ...INPUT,
    fetcher: async () =>
      Response.json(
        {
          error: {
            code: "no_empty_plots",
            message: "no empty plots",
            current_field_revision: INPUT.fieldRevision,
          },
        },
        { status: 409 },
      ),
  });
  assert.equal(noEmpty.ok, false);
  if (!noEmpty.ok) {
    assert.equal(noEmpty.issue.code, "no_empty_plots");
    assert.equal(farmPlantRequestIssueMessage(noEmpty.issue), "现在没有空地可以种菜。");
  }
});
