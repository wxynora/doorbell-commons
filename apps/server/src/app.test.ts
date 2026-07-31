import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { after, test } from "node:test";
import {
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";

const app = buildApp({
  groupId: COMMUNITY_QQ_GROUP_ID,
  groupMembership: {
    async isCurrentMember() {
      throw new Error("Health-route test must not query OneBot");
    },
  },
  logger: false,
});

after(async () => {
  await app.close();
});

test("GET /api/health returns the shared health contract", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(serviceHealthSchema.parse(response.json()), {
    service: "doorbell-commons",
    status: "ok",
  });
});

interface FakeOneBotRequest {
  method: string | undefined;
  path: string | undefined;
  authorization: string | undefined;
  body: unknown;
}

interface FakeOneBot {
  baseUrl: string;
  requests: FakeOneBotRequest[];
  close(): Promise<void>;
}

interface FakeOneBotOptions {
  statusCode?: number;
  responseBody: unknown;
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : undefined;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function startFakeOneBot(options: FakeOneBotOptions): Promise<FakeOneBot> {
  const requests: FakeOneBotRequest[] = [];
  const server = createServer(async (request, response) => {
    requests.push({
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization,
      body: await readRequestBody(request),
    });
    sendJson(response, options.statusCode ?? 200, options.responseBody);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    requests,
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

function buildEligibilityApp(fakeOneBot: FakeOneBot) {
  return buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: new OneBotGroupMembershipClient({
      apiBaseUrl: fakeOneBot.baseUrl,
      apiToken: "local-test-token",
    }),
    logger: false,
  });
}

test("current QQ group member passes registration eligibility", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [{ user_id: 10001 }, { user_id: 3877162412 }],
    },
  });
  const eligibilityApp = buildEligibilityApp(fakeOneBot);
  context.after(async () => {
    await eligibilityApp.close();
    await fakeOneBot.close();
  });

  const response = await eligibilityApp.inject({
    method: "POST",
    url: "/api/registration/qq-group-eligibility",
    payload: { qq_number: "3877162412" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(qqGroupEligibilitySuccessSchema.parse(response.json()), {
    eligible: true,
    qq_number: "3877162412",
    group_id: COMMUNITY_QQ_GROUP_ID,
  });
  assert.deepEqual(fakeOneBot.requests, [
    {
      method: "POST",
      path: "/get_group_member_list",
      authorization: "Bearer local-test-token",
      body: {
        group_id: COMMUNITY_QQ_GROUP_ID,
        no_cache: true,
      },
    },
  ]);
  assert.ok(fakeOneBot.requests.every((request) => !request.path?.includes("send")));
});

test("QQ number absent from the current member list is rejected", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [{ user_id: 10001 }],
    },
  });
  const eligibilityApp = buildEligibilityApp(fakeOneBot);
  context.after(async () => {
    await eligibilityApp.close();
    await fakeOneBot.close();
  });

  const response = await eligibilityApp.inject({
    method: "POST",
    url: "/api/registration/qq-group-eligibility",
    payload: { qq_number: "3877162412" },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(
    qqGroupEligibilityErrorSchema.parse(response.json()).error.code,
    "qq_not_group_member",
  );
  assert.equal(fakeOneBot.requests[0]?.path, "/get_group_member_list");
});

test("OneBot failure is not reported as non-membership", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    statusCode: 500,
    responseBody: {
      status: "failed",
      retcode: 100,
      data: null,
    },
  });
  const eligibilityApp = buildEligibilityApp(fakeOneBot);
  context.after(async () => {
    await eligibilityApp.close();
    await fakeOneBot.close();
  });

  const response = await eligibilityApp.inject({
    method: "POST",
    url: "/api/registration/qq-group-eligibility",
    payload: { qq_number: "3877162412" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(
    qqGroupEligibilityErrorSchema.parse(response.json()).error.code,
    "onebot_unavailable",
  );
  assert.notEqual(
    qqGroupEligibilityErrorSchema.parse(response.json()).error.code,
    "qq_not_group_member",
  );
});

test("invalid registration input is rejected before OneBot is called", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [],
    },
  });
  const eligibilityApp = buildEligibilityApp(fakeOneBot);
  context.after(async () => {
    await eligibilityApp.close();
    await fakeOneBot.close();
  });

  const response = await eligibilityApp.inject({
    method: "POST",
    url: "/api/registration/qq-group-eligibility",
    payload: {
      qq_number: "3877162412",
      group_id: "another-group",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(qqGroupEligibilityErrorSchema.parse(response.json()).error.code, "invalid_request");
  assert.deepEqual(fakeOneBot.requests, []);
});
