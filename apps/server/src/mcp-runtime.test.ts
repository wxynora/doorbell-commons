import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LingyeActionResult } from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import {
  doorbellToolDefinition as farmDoorbellToolDefinition,
  farmOperationByName,
  farmOperationNames,
  farmOperations,
  stripDetail,
} from "./doorbell-farm-op-registry.js";
import { modelVisibleLingyeOperationByName } from "./doorbell-lingye-op-registry.js";
import { doorbellOperationNames } from "./doorbell-op-registry.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { hashMcpCredential } from "./mcp-access-service.js";
import {
  FarmMcpActionClient,
  type FarmMcpActionExecutor,
  type FarmMcpActionInput,
  FarmMcpActionMigrationRequiredError,
  FarmMcpActionUnavailableError,
} from "./mcp-farm-action-client.js";
import {
  LingyeMcpActionClient,
  type LingyeMcpActionExecutor,
  type LingyeMcpActionInput,
  LingyeMcpActionUnavailableError,
} from "./mcp-lingye-action-client.js";
import { DoorbellMcpRuntime } from "./mcp-runtime.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 13, 10, 0, 0);
const RESIDENT_QQ = "10001";
const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-farm-human-key";
const MCP_CREDENTIAL = `dbm_${"A".repeat(43)}`;
const MIGRATION_ID = "10000000-0000-4000-8000-000000000001";
const CONFIRMATION_ID = "20000000-0000-4000-8000-000000000001";
const CREDENTIAL_ID = "30000000-0000-4000-8000-000000000001";

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  calls = 0;
  unavailable = false;

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    this.calls += 1;
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(): Promise<FarmDirectoryEntry> {
    throw new Error("MCP runtime tests must not use the public farm directory");
  }
  async lookupFarmByHumanKey(): Promise<FarmDirectoryEntry> {
    throw new Error("MCP runtime tests must not verify a farm human credential");
  }
  async readFarmOverview(): Promise<BoundFarmOverview> {
    throw new Error("MCP runtime tests must not read a farm overview");
  }
  async readFarmHumanPage(): Promise<FarmHumanPage> {
    throw new Error("MCP runtime tests must not proxy a farm page");
  }
  async submitFarmHumanAction(): Promise<FarmHumanActionRedirect> {
    throw new Error("MCP runtime tests must not submit a human farm action");
  }
}

class FakeFarmActions implements FarmMcpActionExecutor {
  readonly calls: FarmMcpActionInput[] = [];
  nextFailure: Error | undefined;
  nextResult: { ok: boolean; text: string; farm?: Record<string, unknown> } | undefined;

  async execute(input: FarmMcpActionInput) {
    this.calls.push(structuredClone(input));
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = undefined;
      throw failure;
    }
    if (this.nextResult) {
      const result = this.nextResult;
      this.nextResult = undefined;
      return result;
    }
    return input.action === "status"
      ? { ok: true, text: "FARM STATUS" }
      : {
          ok: true,
          text: `${input.action} OK`,
          ...(input.detail ? { farm: { id: FARM_DOORPLATE } } : {}),
        };
  }
}

class FakeLingyeActions implements LingyeMcpActionExecutor {
  readonly calls: LingyeMcpActionInput[] = [];
  nextFailure: Error | undefined;
  nextResult: LingyeActionResult | undefined;

  async execute(input: LingyeMcpActionInput) {
    this.calls.push(structuredClone(input));
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = undefined;
      throw failure;
    }
    if (this.nextResult) {
      const result = this.nextResult;
      this.nextResult = undefined;
      return result;
    }
    return { ok: true as const, text: `${input.op} OK`, data: { options: [] } };
  }
}

interface RuntimeHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  residentId: string;
  homeId: string;
  membership: FakeGroupMembership;
  farmActions: FakeFarmActions;
  lingyeActions: FakeLingyeActions;
  lingyeNotifications: unknown[];
  careerExamReconciliations: unknown[];
  notificationErrors: unknown[];
  mcpRuntime: DoorbellMcpRuntime;
  now: { value: number };
  close(): Promise<void>;
}

function openRuntimeHarness(
  databasePath: string,
  options: { lingyeNotificationFailure?: Error } = {},
): RuntimeHarness {
  const database = new CommunityDatabase(databasePath);
  const membership = new FakeGroupMembership();
  membership.members.add(RESIDENT_QQ);
  const registrationAuth = new RegistrationAuthService({
    database,
    groupMembership: membership,
    farmDirectory: new UnusedFarmDirectory(),
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => NOW,
  });
  const created = database.createHumanSession(RESIDENT_QQ, NOW, {
    residentName: "小一",
    homeName: "门铃小屋",
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
  });
  database.beginMcpFarmMigration(
    created.community.resident.residentId,
    FARM_DOORPLATE,
    MIGRATION_ID,
    NOW,
  );
  database.confirmMcpFarmRevoked(
    created.community.resident.residentId,
    MIGRATION_ID,
    CONFIRMATION_ID,
    NOW + 1,
  );
  database.replaceMcpCredential(
    created.community.resident.residentId,
    CREDENTIAL_ID,
    hashMcpCredential(MCP_CREDENTIAL),
    NOW + 2,
  );
  const farmActions = new FakeFarmActions();
  const lingyeActions = new FakeLingyeActions();
  const careerExamReconciliations: unknown[] = [];
  const lingyeNotifications: unknown[] = [];
  const notificationErrors: unknown[] = [];
  const now = { value: NOW };
  const mcpRuntime = new DoorbellMcpRuntime({
    database,
    registrationAuth,
    farmActions,
    lingyeActions,
    careerExamReminders: {
      reconcile: (input) => careerExamReconciliations.push(structuredClone(input)),
    },
    mcpEndpoint: "https://doorbell.example/mcp",
    now: () => now.value,
    onNotificationDeliveryError: (error) => notificationErrors.push(error),
    onLingyeNotification: (notification, sourceResidentId) => {
      lingyeNotifications.push({
        notification: structuredClone(notification),
        sourceResidentId,
      });
      if (options.lingyeNotificationFailure) throw options.lingyeNotificationFailure;
    },
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mcpRuntime,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    residentId: created.community.resident.residentId,
    homeId: created.community.home.homeId,
    membership,
    farmActions,
    lingyeActions,
    lingyeNotifications,
    careerExamReconciliations,
    notificationErrors,
    mcpRuntime,
    now,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

function postMcpRuntime(harness: RuntimeHarness, payload: unknown, protocolVersion: string | null) {
  return harness.mcpRuntime.handlePost({
    authorization: `Bearer ${MCP_CREDENTIAL}`,
    body: payload,
    protocolVersion,
  });
}

function rpc(method: string, params?: Record<string, unknown>, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
}

function call(op: string, args: Record<string, unknown>, id: number | string = 1) {
  return rpc("tools/call", { name: "doorbell", arguments: { op, args } }, id);
}

function postMcp(
  harness: RuntimeHarness,
  payload: object,
  options: {
    credential?: string | null;
    origin?: string;
    protocolVersion?: string | null;
  } = {},
) {
  const credential = options.credential === undefined ? MCP_CREDENTIAL : options.credential;
  const protocolVersion =
    options.protocolVersion === undefined ? "2025-06-18" : options.protocolVersion;
  return harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      ...(credential === null ? {} : { authorization: `Bearer ${credential}` }),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(protocolVersion === null ? {} : { "mcp-protocol-version": protocolVersion }),
    },
    payload,
  });
}

test("MCP school view exposes the authoritative interview and public notice sections", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-school-sections-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const initialized = await postMcpRuntime(
      harness,
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "school-section-test", version: "1" },
      }),
      null,
    );
    assert.equal(initialized.statusCode, 200);
    for (const section of ["interviews", "publicNotices"] as const) {
      const result = await postMcpRuntime(
        harness,
        call("go.school.view", { section }),
        "2025-06-18",
      );
      assert.equal(result.statusCode, 200);
      const body = result.body as { result?: { isError?: boolean } };
      assert.equal(body.result?.isError, false);
      assert.deepEqual(harness.lingyeActions.calls.at(-1)?.args, { section });
    }
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the farm registry has 58 canonical operations, strict args, examples, and one thin tool", () => {
  assert.equal(farmOperations.length, 58);
  assert.equal(farmOperationByName.size, 58);
  assert.equal(new Set(farmOperationNames).size, 58);
  assert.equal(farmDoorbellToolDefinition.name, "doorbell");
  assert.deepEqual(farmDoorbellToolDefinition.inputSchema.required, ["op", "args"]);
  assert.equal(farmDoorbellToolDefinition.inputSchema.additionalProperties, false);
  assert.deepEqual(farmDoorbellToolDefinition.inputSchema.properties.op.enum, farmOperationNames);
  assert.deepEqual(farmDoorbellToolDefinition.inputSchema.properties.args, { type: "object" });

  for (const removed of [
    "farm.buy-recipe",
    "farm.buy-seed",
    "farm.buy-item",
    "farm.buy-potion-set",
    "farm.buy-animal",
    "farm.buy-pet",
    "farm.buy-patrol-goose",
    "farm.kitchen.recipes",
    "farm.fish.basket",
    "farm.fish.codex",
    "farm.fish.spots",
    "farm.together.status",
    "farm.together.history",
    "ranking",
    "adventure",
    "exp",
    "npc",
    "hot",
    "new-token",
  ]) {
    assert.equal(farmOperationByName.has(removed), false, removed);
  }

  for (const operation of farmOperations) {
    assert.equal(operation.description.includes(operation.op), false, operation.op);
    assert.ok(operation.examples.length > 0, operation.op);
    for (const example of operation.examples) {
      assert.equal(example.op, operation.op);
      const parsed = operation.argsSchema.safeParse(example.args);
      assert.equal(parsed.success, true, `${operation.op}: ${JSON.stringify(example.args)}`);
      if (parsed.success) {
        const { businessArgs } = stripDetail(parsed.data);
        operation.adapt(businessArgs);
      }
    }
    const firstExample = operation.examples[0];
    assert.ok(firstExample);
    assert.equal(
      operation.argsSchema.safeParse({ ...firstExample.args, agentKey: "forbidden" }).success,
      false,
      operation.op,
    );
    assert.equal(
      operation.argsSchema.safeParse({ ...firstExample.args, detail: true }).success,
      operation.op !== "farm.help",
      operation.op,
    );
  }

  const expectedLegacyActions: Record<string, readonly string[]> = {
    "farm.status": ["status"],
    "farm.shop": ["shop"],
    "farm.bag": ["bag"],
    "farm.market": ["market"],
    "farm.encyclopedia": ["encyclopedia"],
    "farm.ledger": ["ledger"],
    "farm.leaderboard": ["leaderboard"],
    "farm.plant": ["plant"],
    "farm.water": ["water"],
    "farm.ripen": ["ripen"],
    "farm.harvest": ["harvest"],
    "farm.run": ["run"],
    "farm.upgrade-land": ["upgrade-land"],
    "farm.buy": ["buy", "buy-item", "buy-potion-set", "buy-recipe", "buy-seed"],
    "farm.list": ["list"],
    "farm.unlist": ["unlist"],
    "farm.craft": ["craft"],
    "farm.design": ["design"],
    "farm.report": ["report"],
    "farm.accept-task": ["accept-task"],
    "farm.set-welcome": ["set-welcome"],
    "farm.rename": ["rename"],
    "farm.wander": ["wander"],
    "farm.visit": ["visit"],
    "farm.steal": ["steal"],
    "farm.message": ["message"],
    "farm.guestbook": ["guestbook"],
    "farm.delete-message": ["delete-message"],
    "farm.block": ["block"],
    "farm.unblock": ["unblock"],
    "farm.explore": ["explore"],
    "farm.choose": ["choose"],
    "farm.roll": ["roll"],
    "farm.retreat": ["retreat"],
    "farm.expedition": ["expedition"],
    "farm.buy-companion": ["buy-animal", "buy-patrol-goose", "buy-pet"],
    "farm.send-ranch": ["send-ranch"],
    "farm.ranch-feed": ["ranch-feed"],
    "farm.kitchen.view": ["kitchen"],
    "farm.kitchen.buy": ["kitchen"],
    "farm.kitchen.cook": ["kitchen"],
    "farm.kitchen.use": ["kitchen"],
    "farm.kitchen.bribe": ["kitchen"],
    "farm.kitchen.sell": ["kitchen"],
    "farm.fish.cast": ["fish"],
    "farm.fish.view": ["fish"],
    "farm.fish.sell": ["fish"],
    "farm.fish.open": ["fish"],
    "farm.fish.leave": ["fish"],
    "farm.glimmer.status": ["glimmer"],
    "farm.glimmer.ticket": ["glimmer"],
    "farm.glimmer.explore": ["glimmer"],
    "farm.glimmer.catch": ["glimmer"],
    "farm.glimmer.assist": ["glimmer"],
    "farm.glimmer.choose": ["glimmer"],
    "farm.together.view": ["together"],
    "farm.together.choose": ["together"],
  };
  assert.equal(Object.keys(expectedLegacyActions).length, 57);
  for (const [op, expectedActions] of Object.entries(expectedLegacyActions)) {
    const operation = farmOperationByName.get(op);
    assert.ok(operation, op);
    const actualActions = new Set<string>();
    for (const example of operation.examples) {
      const parsed = operation.argsSchema.parse(example.args);
      const plan = operation.adapt(stripDetail(parsed).businessArgs);
      assert.equal(plan.kind, "farm", op);
      if (plan.kind === "farm") {
        actualActions.add(plan.action);
      }
    }
    assert.deepEqual([...actualActions].sort(), [...expectedActions].sort(), op);
  }
  const helpPlan = farmOperationByName.get("farm.help")?.adapt({});
  assert.deepEqual(helpPlan, { kind: "help" });

  assert.equal(farmOperationByName.has("farm.use"), false);
  const ripen = farmOperationByName.get("farm.ripen");
  assert.ok(ripen);
  assert.equal(ripen.argsSchema.safeParse({ plots: [1, 3, 5] }).success, true);
  assert.equal(ripen.argsSchema.safeParse({ auto: true }).success, true);
  assert.equal(ripen.argsSchema.safeParse({ auto: true, detail: true }).success, true);
  assert.equal(ripen.argsSchema.safeParse({ plots: [] }).success, false);
  assert.equal(ripen.argsSchema.safeParse({ plots: [1, 1] }).success, false);
  assert.equal(ripen.argsSchema.safeParse({ plots: ["1"] }).success, false);
  assert.equal(ripen.argsSchema.safeParse({ auto: false }).success, false);
  assert.equal(ripen.argsSchema.safeParse({ auto: true, plots: [1] }).success, false);
  assert.equal(ripen.argsSchema.safeParse({}).success, false);
  assert.deepEqual(ripen.adapt({ plots: [1, 3, 5] }), {
    kind: "farm",
    action: "ripen",
    params: { plots: [1, 3, 5] },
  });
  assert.deepEqual(ripen.adapt({ auto: true }), {
    kind: "farm",
    action: "ripen",
    params: { auto: true },
  });

  const run = farmOperationByName.get("farm.run");
  assert.ok(run);
  assert.equal(run.argsSchema.safeParse({ potion: "auto" }).success, false);

  const glimmerCatch = farmOperationByName.get("farm.glimmer.catch");
  assert.ok(glimmerCatch);
  assert.equal(glimmerCatch.argsSchema.safeParse({ animal: 2, dish: "料理名称" }).success, true);
  assert.equal(
    glimmerCatch.argsSchema.safeParse({ animal: "动物名称", dish: "料理名称" }).success,
    true,
  );
  assert.equal(glimmerCatch.argsSchema.safeParse({ animal: "2", dish: "料理名称" }).success, false);
  assert.equal(glimmerCatch.argsSchema.safeParse({ animal: 5, dish: "料理名称" }).success, false);

  const sell = farmOperationByName.get("farm.kitchen.sell");
  assert.ok(sell);
  assert.equal(sell.argsSchema.safeParse({ to: "system", itemId: "dish-id" }).success, false);
  const sellParsed = sell.argsSchema.parse({
    destination: "market",
    itemId: "dish-id",
    price: 10,
  });
  assert.deepEqual(sell.adapt(stripDetail(sellParsed).businessArgs), {
    kind: "farm",
    action: "kitchen",
    params: { op: "sell", to: "market", itemId: "dish-id", price: 10 },
  });

  const buy = farmOperationByName.get("farm.buy");
  assert.ok(buy);
  assert.deepEqual(
    buy.adapt(
      stripDetail(
        buy.argsSchema.parse({ source: "shop", kind: "item", id: "speed_potion", qty: 2 }),
      ).businessArgs,
    ),
    { kind: "farm", action: "buy-item", params: { item: "speed_potion", qty: 2 } },
  );
});

test("farm action client sends only server identity and accepts business rejection separately", async () => {
  const requests: Array<{ url: string; authorization: string | null; body: unknown }> = [];
  let responseStatus = 200;
  let responseBody: unknown = { ok: true, text: "visited", farm: { id: FARM_DOORPLATE } };
  const client = new FarmMcpActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "private-service-token",
    fetchImplementation: (async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  const success = await client.execute({
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    action: "visit",
    params: { to: "6" },
    detail: true,
  });
  assert.equal(success.ok, true);
  assert.deepEqual(requests, [
    {
      url: "https://farm.example/farm/internal/doorbell/farm-actions/execute",
      authorization: "Bearer private-service-token",
      body: {
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        action: "visit",
        params: { to: "6" },
        detail: true,
      },
    },
  ]);

  responseStatus = 400;
  responseBody = { ok: false, text: "没有成熟作物" };
  assert.deepEqual(
    await client.execute({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "harvest",
      params: {},
    }),
    { ok: false, text: "没有成熟作物" },
  );

  responseStatus = 409;
  responseBody = {
    ok: false,
    error: { code: "farm_migration_required", message: "migration required" },
  };
  await assert.rejects(
    client.execute({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "status",
      params: {},
    }),
    FarmMcpActionMigrationRequiredError,
  );

  responseStatus = 503;
  responseBody = { ok: false, text: "maintenance" };
  await assert.rejects(
    client.execute({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "status",
      params: {},
    }),
    FarmMcpActionUnavailableError,
  );
});

test("farm action client aborts a stalled request as unavailable", async () => {
  const observed: { signal: AbortSignal | undefined } = { signal: undefined };
  const client = new FarmMcpActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 20,
    serviceToken: "private-service-token",
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
    client.execute({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "status",
      params: {},
    }),
    FarmMcpActionUnavailableError,
  );
  assert.equal(observed.signal?.aborted, true);
});

test("Lingye action client sends only server-resolved identity and preserves business errors", async () => {
  const requests: Array<{ url: string; authorization: string | null; body: unknown }> = [];
  let responseStatus = 200;
  let responseBody: unknown = {
    ok: true,
    text: "账户事实",
    data: { options: [] },
  };
  const client = new LingyeMcpActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "private-service-token",
    fetchImplementation: (async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  assert.deepEqual(
    await client.execute({
      residentId: "10000000-0000-4000-8000-000000000009",
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      op: "go.bank.view",
      args: { section: "loans" },
    }),
    responseBody,
  );
  assert.deepEqual(requests, [
    {
      url: "https://farm.example/farm/internal/doorbell/lingye-actions/execute",
      authorization: "Bearer private-service-token",
      body: {
        resident_id: "10000000-0000-4000-8000-000000000009",
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        op: "go.bank.view",
        args: { section: "loans" },
      },
    },
  ]);

  responseStatus = 409;
  responseBody = {
    ok: false,
    error: {
      code: "INSUFFICIENT_FUNDS",
      message: "可用余额不足，本次操作没有执行。",
    },
  };
  assert.deepEqual(
    await client.execute({
      residentId: "10000000-0000-4000-8000-000000000009",
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      op: "go.bank.choose",
      args: { option: "returned-option", amount: 500 },
    }),
    responseBody,
  );

  responseStatus = 503;
  responseBody = {
    ok: false,
    error: { code: "lingye_unavailable", message: "unavailable" },
  };
  await assert.rejects(
    client.execute({
      residentId: "10000000-0000-4000-8000-000000000009",
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      op: "go.bank.view",
      args: {},
    }),
    LingyeMcpActionUnavailableError,
  );
});

test("Lingye readiness requires all public operations, matched private exam levels, and configured rules", async () => {
  let status = 200;
  let body: unknown = {
    ok: true,
    schema_version: 1,
    ready: true,
    operations: [
      "go.bank.view",
      "go.bank.choose",
      "go.school.view",
      "go.school.choose",
      "go.farm.commission",
      "go.hospital.commission",
      "go.newsroom.commission",
      "go.security.commission",
    ],
    exams: {
      public_ready_levels: [
        { career: "chef", level: 1 },
        { career: "chef", level: 2 },
        { career: "agronomist", level: 1 },
        { career: "veterinarian", level: 1 },
        { career: "veterinarian", level: 2 },
        { career: "constable", level: 1 },
        { career: "constable", level: 2 },
        { career: "constable", level: 3 },
      ],
      private_ready_levels: [
        { career: "chef", level: 1, question_count: 20, pass_count: 18 },
        { career: "chef", level: 2, question_count: 20, pass_count: 18 },
        { career: "agronomist", level: 1, question_count: 20, pass_count: 18 },
        { career: "veterinarian", level: 1, question_count: 20, pass_count: 18 },
        { career: "veterinarian", level: 2, question_count: 20, pass_count: 18 },
        { career: "constable", level: 1, question_count: 20, pass_count: 18 },
        { career: "constable", level: 2, question_count: 20, pass_count: 18 },
        { career: "constable", level: 3, question_count: 20, pass_count: 18 },
      ],
    },
    economy_rules: {
      minimum_system_loan_credit_days: 7,
      restricted_daily_gold_limit: 200_000,
      restricted_daily_silver_limit: 400,
    },
    capabilities: {
      player_loans: true,
      multi_select_assessments: true,
      kitchen_methods: true,
      kitchen_tools: true,
      chef_original_recipes: true,
      chef_store: true,
      commission_messages: true,
      commission_npc_transfer: true,
      commission_notifications: true,
    },
    nature_runtime: {
      adapter_version: 1,
      configured: true,
      ready: true,
      status: "ready",
      activation_date: "2026-09-01",
      activation_day: 20_332,
      persisted_status: "inactive",
    },
    missing: [],
  };
  const requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  const client = new LingyeMcpActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "private-service-token",
    fetchImplementation: (async (input, init) => {
      requests.push({ url: String(input), method: init?.method, body: init?.body });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  assert.equal(await client.isRuntimeReady(), true);
  assert.deepEqual(requests, [
    {
      url: "https://farm.example/farm/internal/doorbell/lingye-actions/readiness",
      method: "GET",
      body: undefined,
    },
  ]);

  body = {
    ...(body as Record<string, unknown>),
    operations: ["go.bank.view", "go.bank.choose"],
  };
  assert.equal(await client.isRuntimeReady(), false);

  body = {
    ...(body as Record<string, unknown>),
    operations: [
      "go.bank.view",
      "go.bank.choose",
      "go.school.view",
      "go.school.choose",
      "go.farm.commission",
      "go.hospital.commission",
      "go.security.commission",
    ],
    exams: {
      public_ready_levels: [{ career: "chef", level: 1 }],
      private_ready_levels: [],
    },
  };
  assert.equal(await client.isRuntimeReady(), false);

  body = {
    ...(body as Record<string, unknown>),
    exams: {
      public_ready_levels: [{ career: "chef", level: 1 }],
      private_ready_levels: [{ career: "chef", level: 1, question_count: 20, pass_count: 18 }],
    },
    nature_runtime: {
      adapter_version: 1,
      configured: false,
      ready: false,
      status: "not_configured",
      persisted_status: "inactive",
    },
  };
  assert.equal(await client.isRuntimeReady(), false);

  status = 503;
  assert.equal(await client.isRuntimeReady(), false);
});

test("MCP transport authenticates dbm credentials and exposes one thin doorbell tool", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-runtime-transport-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const missing = await postMcp(harness, rpc("tools/list"), { credential: null });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.headers["www-authenticate"], "Bearer");
    assert.equal(missing.json().error.code, "AUTH_REQUIRED");
    assert.equal(harness.membership.calls, 0);

    const invalid = await postMcp(harness, rpc("tools/list"), {
      credential: `dbm_${"Z".repeat(43)}`,
    });
    assert.equal(invalid.statusCode, 401);
    assert.equal(invalid.json().error.code, "AUTH_INVALID");
    assert.equal(harness.membership.calls, 0);

    const wrongOrigin = await postMcp(harness, rpc("tools/list"), {
      origin: "https://attacker.example",
    });
    assert.equal(wrongOrigin.statusCode, 403);
    assert.equal(wrongOrigin.body, "");

    const initialized = await postMcp(
      harness,
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
      { protocolVersion: null },
    );
    assert.equal(initialized.statusCode, 200);
    assert.equal(initialized.json().result.protocolVersion, "2025-06-18");
    assert.equal(initialized.json().result.capabilities.tools instanceof Object, true);

    const negotiatedFallback = await postMcp(
      harness,
      rpc("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "older-test", version: "1" },
      }),
      { protocolVersion: null },
    );
    assert.equal(negotiatedFallback.statusCode, 200);
    assert.equal(negotiatedFallback.json().result.protocolVersion, "2025-06-18");

    for (const [protocolVersion, expectedCode] of [
      [null, "MCP_PROTOCOL_VERSION_REQUIRED"],
      ["not-a-version", "MCP_PROTOCOL_VERSION_INVALID"],
      ["2025-03-26", "MCP_PROTOCOL_VERSION_UNSUPPORTED"],
    ] as const) {
      const rejectedVersion = await postMcp(harness, rpc("tools/list"), {
        protocolVersion,
      });
      assert.equal(rejectedVersion.statusCode, 400);
      assert.equal(rejectedVersion.json().error.code, expectedCode);
      assert.equal("jsonrpc" in rejectedVersion.json(), false);
      assert.equal("structuredContent" in rejectedVersion.json(), false);
    }

    const listed = await postMcp(harness, rpc("tools/list"));
    const tools = listed.json().result.tools;
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "doorbell");
    assert.deepEqual(tools[0].inputSchema.properties.op.enum, doorbellOperationNames);
    assert.equal(tools[0].inputSchema.properties.op.enum.length, 65);
    assert.deepEqual(
      tools[0].inputSchema.properties.op.enum.filter((op: string) => op.startsWith("go.")),
      [
        "go.bank.view",
        "go.bank.choose",
        "go.school.view",
        "go.school.choose",
        "go.farm.commission",
        "go.hospital.commission",
        "go.security.commission",
      ],
    );
    assert.deepEqual(tools[0].inputSchema.properties.args, { type: "object" });

    const notification = await postMcp(harness, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.equal(notification.statusCode, 202);
    assert.equal(notification.body, "");

    const batchPayload = [
      rpc("ping", undefined, 1),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      rpc("tools/list", undefined, 2),
      call("farm.status", {}, 3),
    ];
    const membershipCallsBeforeBatch = harness.membership.calls;
    const farmCallsBeforeBatch = harness.farmActions.calls.length;
    const missingVersionBatch = await postMcp(harness, batchPayload, {
      protocolVersion: null,
    });
    assert.equal(missingVersionBatch.statusCode, 400);
    assert.equal(missingVersionBatch.json().error.code, "MCP_PROTOCOL_VERSION_REQUIRED");
    assert.equal(harness.membership.calls, membershipCallsBeforeBatch);
    assert.equal(harness.farmActions.calls.length, farmCallsBeforeBatch);

    const batch = await postMcp(harness, batchPayload);
    assert.equal(batch.statusCode, 200);
    assert.equal(batch.json().id, null);
    assert.equal(batch.json().error.code, -32600);
    assert.equal(Array.isArray(batch.json()), false);
    assert.equal(harness.membership.calls, membershipCallsBeforeBatch);
    assert.equal(harness.farmActions.calls.length, farmCallsBeforeBatch);

    const get = await harness.app.inject({ method: "GET", url: "/mcp" });
    assert.equal(get.statusCode, 405);
    assert.equal(get.headers.allow, "POST");
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("MCP runtime rejects missing, invalid, and unsupported subsequent protocol versions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-runtime-version-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const initialized = await postMcpRuntime(
      harness,
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "version-test", version: "1" },
      }),
      null,
    );
    assert.equal(initialized.statusCode, 200);
    assert.equal(
      (initialized.body as { result: { protocolVersion: string } }).result.protocolVersion,
      "2025-06-18",
    );

    for (const [protocolVersion, expectedCode] of [
      [null, "MCP_PROTOCOL_VERSION_REQUIRED"],
      ["not-a-version", "MCP_PROTOCOL_VERSION_INVALID"],
      ["2025-03-26", "MCP_PROTOCOL_VERSION_UNSUPPORTED"],
    ] as const) {
      const rejected = await postMcpRuntime(harness, call("farm.status", {}), protocolVersion);
      assert.equal(rejected.statusCode, 400);
      assert.equal((rejected.body as { error: { code: string } }).error.code, expectedCode);
      assert.equal("jsonrpc" in (rejected.body as Record<string, unknown>), false);
    }
    assert.equal(harness.farmActions.calls.length, 0);

    const accepted = await postMcpRuntime(harness, rpc("tools/list"), "2025-06-18");
    assert.equal(accepted.statusCode, 200);
    assert.equal((accepted.body as { result: { tools: unknown[] } }).result.tools.length, 1);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("MCP calls validate strict args, self-correct, preserve status cadence, and recheck eligibility", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-runtime-call-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const first = await postMcp(harness, call("farm.visit", { to: "6", detail: true }));
    const firstResult = first.json().result;
    assert.equal(firstResult.isError, false);
    assert.equal(
      firstResult.content[0].text,
      `visit OK\n\nFARM STATUS\n\n农场详情：\nid：${FARM_DOORPLATE}`,
    );
    assert.equal("structuredContent" in firstResult, false);
    assert.deepEqual(harness.farmActions.calls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        action: "visit",
        params: { to: "6" },
        detail: true,
      },
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        action: "status",
        params: {},
      },
    ]);

    const second = await postMcp(harness, call("farm.message", { to: "6", text: "hello" }));
    assert.equal(second.json().result.content[0].text, "message OK");
    assert.equal(harness.farmActions.calls.at(-1)?.action, "message");

    const invalid = await postMcp(harness, call("farm.visit", { to: 6 }));
    const invalidResult = invalid.json().result;
    assert.equal(invalidResult.isError, true);
    assert.match(invalidResult.content[0].text, /参数不符合 farm\.visit/u);
    assert.match(invalidResult.content[0].text, /需要修正：/u);
    assert.match(
      invalidResult.content[0].text,
      /doorbell\(\{"op":"farm\.visit","args":\{"to":"6"\}\}\)/u,
    );
    assert.equal(invalidResult.content[0].text.includes('\\"'), false);
    assert.equal("structuredContent" in invalidResult, false);
    assert.equal(harness.farmActions.calls.at(-1)?.action, "message");

    const unknown = await postMcp(harness, call("status", {}));
    assert.match(unknown.json().result.content[0].text, /未开放的操作：status/u);
    assert.equal("structuredContent" in unknown.json().result, false);

    const unknownTool = await postMcp(
      harness,
      rpc("tools/call", { name: "farm", arguments: { op: "farm.status", args: {} } }),
    );
    assert.equal(unknownTool.json().error.code, -32602);
    assert.equal(unknownTool.json().error.message, "Invalid params");

    const oldField = await postMcp(harness, call("farm.visit", { action: "visit" }));
    assert.equal(oldField.json().result.isError, true);
    assert.match(oldField.json().result.content[0].text, /必须只包含 op 和 args|不符合/u);
    assert.equal("structuredContent" in oldField.json().result, false);

    const farmCallsBeforeMethodlessCook = harness.farmActions.calls.length;
    const methodlessCook = await postMcp(
      harness,
      call("farm.kitchen.cook", { items: ["egg", "tomato"] }),
    );
    assert.equal(methodlessCook.json().result.isError, true);
    assert.match(methodlessCook.json().result.content[0].text, /可参考：/u);
    assert.equal(harness.farmActions.calls.length, farmCallsBeforeMethodlessCook);

    const toolPurchase = await postMcp(
      harness,
      call("farm.kitchen.buy", { kind: "tool", id: "steam" }),
    );
    assert.equal(toolPurchase.json().result.isError, false);
    assert.deepEqual(harness.farmActions.calls.at(-1), {
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "kitchen",
      params: { op: "buy", kind: "tool", id: "steam" },
      detail: false,
    });

    const originalResearch = await postMcp(
      harness,
      call("farm.kitchen.cook", {
        items: ["egg", "tomato"],
        method: "stir-fry",
        name: "门铃番茄蛋",
      }),
    );
    assert.equal(originalResearch.json().result.isError, false);
    assert.deepEqual(harness.farmActions.calls.at(-1), {
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      action: "kitchen",
      params: {
        op: "cook",
        items: ["egg", "tomato"],
        method: "stir-fry",
        name: "门铃番茄蛋",
      },
      detail: false,
    });

    const help = await postMcp(harness, call("farm.help", { operation: "farm.kitchen.sell" }));
    assert.match(help.json().result.content[0].text, /destination/);
    assert.match(help.json().result.content[0].text, /farm\.kitchen\.sell/);

    harness.now.value += 10 * 60 * 1000;
    const afterIdle = await postMcp(harness, call("farm.water", {}));
    assert.equal(afterIdle.json().result.content[0].text, "water OK\n\nFARM STATUS");

    harness.farmActions.nextResult = { ok: false, text: "没有成熟作物" };
    const rejected = await postMcp(harness, call("farm.harvest", {}));
    const rejectedResult = rejected.json().result;
    assert.equal(rejectedResult.isError, true);
    assert.equal(rejectedResult.content[0].text, "没有成熟作物");
    assert.equal("structuredContent" in rejectedResult, false);

    const farmCallsBeforeLingye = harness.farmActions.calls.length;
    const bankView = await postMcp(harness, call("go.bank.view", { section: "loans" }));
    const bankViewResult = bankView.json().result;
    assert.equal(bankViewResult.isError, false);
    assert.match(bankViewResult.content[0].text, /^🏦 铃野银行/u);
    assert.equal("structuredContent" in bankViewResult, false);
    assert.deepEqual(harness.lingyeActions.calls.at(-1), {
      residentId: harness.residentId,
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      op: "go.bank.view",
      args: { section: "loans" },
    });

    harness.lingyeActions.nextResult = {
      ok: true,
      text: "已读取职业学校当前事实。",
      data: {
        section: "courses",
        value: [{ career: "chef", qualificationLevel: 1, courseIndex: 1 }],
        options: [{ option: "school:course-read:1:chef:1:1:course-v1" }],
      },
    };
    const schoolView = await postMcp(harness, call("go.school.view", { section: "courses" }));
    const schoolViewResult = schoolView.json().result;
    assert.equal(schoolViewResult.isError, false);
    assert.match(schoolViewResult.content[0].text, /^🏫 铃野职业学校/u);
    assert.match(schoolViewResult.content[0].text, /课程进度/u);
    assert.match(schoolViewResult.content[0].text, /料理师/u);
    assert.match(schoolViewResult.content[0].text, /school:course-read:1:chef:1:1:course-v1/u);
    assert.equal(schoolViewResult.content[0].text.includes('\\"'), false);
    assert.equal("structuredContent" in schoolViewResult, false);

    const lingyeCallsBeforeInvalidSchool = harness.lingyeActions.calls.length;
    const invalidSchool = await postMcp(
      harness,
      call("go.school.choose", {
        option: "returned-option",
        answers: [[" a "], ["b"], ["C"], ["d"], ["E"]],
      }),
    );
    assert.equal(invalidSchool.json().result.isError, true);
    assert.match(invalidSchool.json().result.content[0].text, /可参考：/u);
    assert.match(invalidSchool.json().result.content[0].text, /go\.school\.choose/u);
    assert.equal("structuredContent" in invalidSchool.json().result, false);
    assert.equal(harness.lingyeActions.calls.length, lingyeCallsBeforeInvalidSchool);

    const school = await postMcp(
      harness,
      call("go.school.choose", {
        option: "returned-option",
        answers: [[" a "], ["b", " d "], [" C"], ["d "], ["A"]],
      }),
    );
    assert.equal(school.json().result.isError, false);
    assert.deepEqual(harness.lingyeActions.calls.at(-1)?.args, {
      option: "returned-option",
      answers: [["A"], ["B", "D"], ["C"], ["D"], ["A"]],
    });
    assert.equal(harness.careerExamReconciliations.length, 2);
    assert.deepEqual(harness.careerExamReconciliations[1], {
      residentId: harness.residentId,
      homeId: harness.homeId,
      result: {
        ok: true,
        text: "go.school.choose OK",
        data: { options: [] },
      },
    });

    harness.lingyeActions.nextResult = {
      ok: true,
      text: "委托回复已记录。",
      data: { message: { body: "我先检查一下。" } },
      notifications: [
        {
          notification_id: "commission-reply:test",
          kind: "commission_reply",
          recipient_resident_id: harness.residentId,
          message_text: "我先检查一下。",
        },
      ],
    };
    const commissionReply = await postMcp(
      harness,
      call("go.farm.commission", { option: "returned-option", text: "我先检查一下。" }),
    );
    assert.equal(commissionReply.json().result.isError, false);
    assert.deepEqual(harness.lingyeNotifications, [
      {
        notification: {
          notification_id: "commission-reply:test",
          kind: "commission_reply",
          recipient_resident_id: harness.residentId,
          message_text: "我先检查一下。",
        },
        sourceResidentId: harness.residentId,
      },
    ]);
    assert.equal("structuredContent" in commissionReply.json().result, false);

    harness.lingyeActions.nextResult = {
      ok: false,
      error: {
        code: "INSUFFICIENT_FUNDS",
        message: "可用余额不足，本次操作没有执行。",
      },
    };
    const insufficient = await postMcp(
      harness,
      call("go.hospital.commission", { option: "returned-option", amount: 500 }),
    );
    assert.equal(insufficient.json().result.isError, true);
    assert.equal(insufficient.json().result.content[0].text, "可用余额不足，本次操作没有执行。");
    assert.equal("structuredContent" in insufficient.json().result, false);

    const newsroom = await postMcp(harness, call("go.newsroom.commission", {}));
    assert.equal(newsroom.json().result.isError, true);
    assert.match(newsroom.json().result.content[0].text, /未开放的操作/u);
    assert.equal(harness.farmActions.calls.length, farmCallsBeforeLingye);

    harness.farmActions.nextFailure = new FarmMcpActionMigrationRequiredError();
    const migrationRequired = await postMcp(harness, call("farm.status", {}));
    assert.equal(migrationRequired.json().result.isError, true);
    assert.match(migrationRequired.json().result.content[0].text, /尚未完成 Doorbell 迁移/u);

    harness.membership.unavailable = true;
    const unavailable = await postMcp(harness, call("farm.status", {}));
    assert.equal(unavailable.json().result.isError, true);
    assert.match(unavailable.json().result.content[0].text, /暂时无法核验社区资格/u);
    assert.ok(harness.database.authenticateMcpCredentialHash(hashMcpCredential(MCP_CREDENTIAL)));

    harness.membership.unavailable = false;
    harness.membership.members.clear();
    const revoked = await postMcp(harness, call("farm.status", {}));
    assert.equal(revoked.json().result.isError, true);
    assert.match(revoked.json().result.content[0].text, /社区资格已经失效/u);
    assert.equal(
      harness.database.authenticateMcpCredentialHash(hashMcpCredential(MCP_CREDENTIAL)),
      undefined,
    );
    const invalidAfterRevocation = await postMcp(harness, call("farm.status", {}));
    assert.equal(invalidAfterRevocation.statusCode, 401);
    assert.equal(invalidAfterRevocation.json().error.code, "AUTH_INVALID");
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all 65 model-visible operations return one readable text without structured content", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-result-presentation-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    for (const op of doorbellOperationNames) {
      const args = op.startsWith("farm.")
        ? farmOperationByName.get(op)?.examples[0]?.args
        : modelVisibleLingyeOperationByName.get(op)?.examples[0]?.args;
      assert.ok(args, op);
      const response = await postMcp(harness, call(op, args));
      const result = response.json().result;
      assert.equal(result.isError, false, op);
      assert.equal(result.content.length, 1, op);
      assert.equal(typeof result.content[0].text, "string", op);
      assert.ok(result.content[0].text.length > 0, op);
      assert.equal(result.content[0].text.includes('\\"'), false, op);
      assert.equal("structuredContent" in result, false, op);
    }
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("any valid doorbell call delivers resident system notifications once without reading human mail", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-notification-piggyback-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const binding = harness.database.authenticateMcpCredentialHash(
      hashMcpCredential(MCP_CREDENTIAL),
    );
    assert(binding);
    const homeId = harness.database.findHomeIdByResidentId(binding.residentId);
    assert(homeId);
    harness.database.deliverMailboxLetter({
      letterId: "40000000-0000-4000-8000-000000000001",
      homeId,
      idempotencyKey: "system:resident-notice-1",
      category: "system",
      title: "只给人类信箱展示的标题一",
      body: "第一条系统通知。",
      createdAt: NOW + 10,
      attachment: null,
    });
    harness.database.deliverMailboxLetter({
      letterId: "40000000-0000-4000-8000-000000000002",
      homeId,
      idempotencyKey: "system:resident-notice-2",
      category: "system",
      title: "只给人类信箱展示的标题二",
      body: "第二条系统通知。",
      createdAt: NOW + 20,
      attachment: null,
    });

    const delivered = await postMcp(harness, call("farm.help", {}));
    const deliveredResult = delivered.json().result;
    assert.match(deliveredResult.content[0].text, /第一条系统通知。\n\n第二条系统通知。$/u);
    assert.equal("structuredContent" in deliveredResult, false);
    assert.doesNotMatch(deliveredResult.content[0].text, /只给人类信箱展示的标题/u);
    assert.deepEqual(
      harness.database
        .listMailboxLetters(homeId, "human", 1, 8)
        .letters.map((letter) => letter.isNew),
      [true, true],
    );
    assert.deepEqual(
      harness.database
        .listMailboxLetters(homeId, "resident", 1, 8)
        .letters.map((letter) => letter.isNew),
      [false, false],
    );

    const repeated = await postMcp(harness, call("farm.help", {}));
    assert.doesNotMatch(repeated.json().result.content[0].text, /系统通知/u);

    harness.database.deliverMailboxLetter({
      letterId: "40000000-0000-4000-8000-000000000003",
      homeId,
      idempotencyKey: "system:resident-notice-3",
      category: "system",
      title: "失败结果也不展示标题",
      body: "失败结果里的系统通知。",
      createdAt: NOW + 30,
      attachment: null,
    });
    harness.farmActions.nextResult = { ok: false, text: "没有成熟作物" };
    const rejected = await postMcp(harness, call("farm.harvest", {}));
    const rejectedResult = rejected.json().result;
    assert.match(rejectedResult.content[0].text, /^没有成熟作物/u);
    assert.match(rejectedResult.content[0].text, /失败结果里的系统通知。$/u);
    assert.equal("structuredContent" in rejectedResult, false);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("notification delivery failure cannot overturn a completed farm action", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-notification-fail-soft-"));
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"));
  try {
    const binding = harness.database.authenticateMcpCredentialHash(
      hashMcpCredential(MCP_CREDENTIAL),
    );
    assert(binding);
    const homeId = harness.database.findHomeIdByResidentId(binding.residentId);
    assert(homeId);
    const cadencePriming = await postMcp(harness, call("farm.status", {}));
    assert.equal(cadencePriming.statusCode, 200);
    harness.farmActions.calls.length = 0;
    harness.database.deliverMailboxLetter({
      letterId: "40000000-0000-4000-8000-000000000004",
      homeId,
      idempotencyKey: "system:resident-notice-fail-soft",
      category: "system",
      title: "不进入小机结果的标题",
      body: "稍后补送的系统通知。",
      createdAt: NOW + 40,
      attachment: null,
    });

    const takeNotifications = harness.database.takeResidentMailboxNotifications.bind(
      harness.database,
    );
    harness.database.takeResidentMailboxNotifications = () => {
      throw new Error("simulated notification database failure");
    };

    const completed = await postMcp(harness, call("farm.harvest", {}));
    assert.equal(completed.statusCode, 200);
    assert.equal(completed.json().result.content[0].text, "harvest OK");
    assert.equal(harness.farmActions.calls.length, 1);
    assert.equal(harness.farmActions.calls[0]?.action, "harvest");
    assert.equal(harness.notificationErrors.length, 1);
    assert.equal(
      harness.notificationErrors[0] instanceof Error
        ? harness.notificationErrors[0].name
        : "UnknownError",
      "Error",
    );
    assert.equal(
      harness.database.listMailboxLetters(homeId, "resident", 1, 8).letters[0]?.isNew,
      true,
    );

    harness.database.takeResidentMailboxNotifications = takeNotifications;
    const recovered = await postMcp(harness, call("farm.help", {}));
    assert.match(recovered.json().result.content[0].text, /稍后补送的系统通知。$/u);
    assert.equal(harness.farmActions.calls.length, 1);
    assert.equal(harness.notificationErrors.length, 1);
    assert.equal(
      harness.database.listMailboxLetters(homeId, "resident", 1, 8).letters[0]?.isNew,
      false,
    );
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("career notification delivery failure cannot overturn a completed Lingye action", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-lingye-notification-fail-soft-"));
  const failure = new Error("simulated Lingye notification failure");
  const harness = openRuntimeHarness(join(directory, "doorbell.sqlite"), {
    lingyeNotificationFailure: failure,
  });
  try {
    harness.lingyeActions.nextResult = {
      ok: true,
      text: "委托回复已记录。",
      data: { message: { body: "继续处理。" } },
      notifications: [
        {
          notification_id: "commission-reply:fail-soft",
          kind: "commission_reply",
          recipient_resident_id: harness.residentId,
          message_text: "继续处理。",
        },
      ],
    };
    const completed = await postMcp(
      harness,
      call("go.farm.commission", { option: "returned-option", text: "继续处理。" }),
    );
    assert.equal(completed.statusCode, 200);
    assert.equal(completed.json().result.isError, false);
    assert.match(completed.json().result.content[0].text, /^📋 铃野委托/u);
    assert.match(completed.json().result.content[0].text, /委托消息：\n {2}body：继续处理。/u);
    assert.equal(completed.json().result.content[0].text.includes('\\"'), false);
    assert.equal(harness.lingyeActions.calls.length, 1);
    assert.deepEqual(harness.notificationErrors, [failure]);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
