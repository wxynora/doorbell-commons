import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { after, test } from "node:test";
import {
  farmLookupErrorSchema,
  farmLookupSuccessSchema,
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import {
  type FarmDirectoryReader,
  FarmDirectoryUnavailableError,
  FarmNotFoundError,
} from "./farm-directory-client.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const healthDatabase = new CommunityDatabase(":memory:");
const healthMembership = {
  async isCurrentMember() {
    throw new Error("Health-route test must not query OneBot");
  },
};
const unusedFarmDirectory: FarmDirectoryReader = {
  async lookupFarm() {
    throw new Error("This test must not query the farm directory");
  },
  async lookupFarmByHumanKey(): Promise<never> {
    throw new Error("This test must not query a farm human credential");
  },
  async readFarmOverview() {
    throw new Error("This test must not query the farm directory");
  },
  async readFarmHumanPage(): Promise<never> {
    throw new Error("This test must not query a farm human page");
  },
  async submitFarmHumanAction(): Promise<never> {
    throw new Error("This test must not submit a farm human action");
  },
};
const app = buildApp({
  groupId: COMMUNITY_QQ_GROUP_ID,
  groupMembership: healthMembership,
  registrationAuth: new RegistrationAuthService({
    database: healthDatabase,
    farmDirectory: unusedFarmDirectory,
    groupMembership: healthMembership,
    groupId: COMMUNITY_QQ_GROUP_ID,
  }),
  secureCookies: false,
  logger: false,
});

after(async () => {
  await app.close();
  healthDatabase.close();
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
  delayMs?: number;
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
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
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

function buildEligibilityApp(fakeOneBot: FakeOneBot, requestTimeoutMs = 1_000) {
  const database = new CommunityDatabase(":memory:");
  const groupMembership = new OneBotGroupMembershipClient({
    apiBaseUrl: fakeOneBot.baseUrl,
    apiToken: "local-test-token",
    requestTimeoutMs,
  });
  const eligibilityApp = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership,
    registrationAuth: new RegistrationAuthService({
      database,
      farmDirectory: unusedFarmDirectory,
      groupMembership,
      groupId: COMMUNITY_QQ_GROUP_ID,
    }),
    secureCookies: false,
    logger: false,
  });
  eligibilityApp.addHook("onClose", () => {
    database.close();
  });
  return eligibilityApp;
}

class FakeFarmDirectory implements FarmDirectoryReader {
  result: "found" | "missing" | "unavailable" = "found";
  readonly calls: string[] = [];

  async lookupFarm(farmDoorplate: string) {
    this.calls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    return { farmDoorplate, farmName: "渡的小农场" };
  }

  async lookupFarmByHumanKey(): Promise<never> {
    throw new Error("This test must not query a farm human credential");
  }

  async readFarmOverview(farmDoorplate: string) {
    return {
      farmDoorplate,
      farmName: "渡的小农场",
      plots: [],
    };
  }

  async readFarmHumanPage(): Promise<never> {
    throw new Error("This test must not query a farm human page");
  }

  async submitFarmHumanAction(): Promise<never> {
    throw new Error("This test must not submit a farm human action");
  }
}

function buildFarmLookupApp(farmDirectory: FakeFarmDirectory) {
  const database = new CommunityDatabase(":memory:");
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership: healthMembership,
    groupId: COMMUNITY_QQ_GROUP_ID,
  });
  const lookupApp = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: healthMembership,
    registrationAuth,
    secureCookies: false,
    logger: false,
  });
  lookupApp.addHook("onClose", () => {
    database.close();
  });
  return lookupApp;
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

test("malformed OneBot member data is unavailable even after the target member", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [{ user_id: 3877162412 }, {}],
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
});

test("malformed OneBot member data is unavailable before the target member", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [{}, { user_id: 3877162412 }],
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
});

test("a stalled OneBot request is aborted and remains unavailable", async (context) => {
  const fakeOneBot = await startFakeOneBot({
    delayMs: 100,
    responseBody: {
      status: "ok",
      retcode: 0,
      data: [{ user_id: 3877162412 }],
    },
  });
  const eligibilityApp = buildEligibilityApp(fakeOneBot, 20);
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

test("farm lookup returns the exact current farm name without creating registration state", async () => {
  const farmDirectory = new FakeFarmDirectory();
  const lookupApp = buildFarmLookupApp(farmDirectory);
  try {
    const response = await lookupApp.inject({
      method: "POST",
      url: "/api/registration/farm-lookup",
      payload: { farm_doorplate: "3ET3FE" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(farmLookupSuccessSchema.parse(response.json()), {
      farm_doorplate: "3ET3FE",
      farm_name: "渡的小农场",
    });
    assert.deepEqual(farmDirectory.calls, ["3ET3FE"]);
  } finally {
    await lookupApp.close();
  }
});

test("farm lookup keeps missing farms, upstream outages, and invalid input distinct", async () => {
  const farmDirectory = new FakeFarmDirectory();
  const lookupApp = buildFarmLookupApp(farmDirectory);
  try {
    farmDirectory.result = "missing";
    const missing = await lookupApp.inject({
      method: "POST",
      url: "/api/registration/farm-lookup",
      payload: { farm_doorplate: "3ET3FE" },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(farmLookupErrorSchema.parse(missing.json()).error.code, "farm_not_found");

    farmDirectory.result = "unavailable";
    const unavailable = await lookupApp.inject({
      method: "POST",
      url: "/api/registration/farm-lookup",
      payload: { farm_doorplate: "3ET3FE" },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(farmLookupErrorSchema.parse(unavailable.json()).error.code, "farm_unavailable");

    const invalid = await lookupApp.inject({
      method: "POST",
      url: "/api/registration/farm-lookup",
      payload: { farm_doorplate: "3ET3FE", farm_name: "do not accept extras" },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(farmLookupErrorSchema.parse(invalid.json()).error.code, "invalid_request");
    assert.deepEqual(farmDirectory.calls, ["3ET3FE", "3ET3FE"]);
  } finally {
    await lookupApp.close();
  }
});
