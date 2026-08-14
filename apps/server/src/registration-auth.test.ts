import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  boundFarmOverviewErrorSchema,
  boundFarmOverviewSuccessSchema,
  createdFarmHumanSessionSuccessSchema,
  currentHumanSessionSuccessSchema,
  farmHumanUiErrorSchema,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import {
  type FarmCreationInput,
  FarmCreationUnavailableError,
  type FarmCreator,
} from "./farm-creation-client.js";
import {
  type FarmDirectoryReader,
  FarmDirectoryUnavailableError,
  FarmHumanCredentialInvalidError,
  FarmNotFoundError,
  FarmNotPubliclyReadableError,
  FarmUpstreamContractUnavailableError,
} from "./farm-directory-client.js";
import { MailboxService } from "./mailbox-service.js";
import { createHumanPasswordCredential, verifyHumanPassword } from "./password-auth.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { InvalidRegistrationCodeError, RegistrationAuthService } from "./registration-auth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const QQ_NUMBER = "3877162412";
const CURRENT_CODE = "DB-ABCD-2345";
const OTHER_CODE = "DB-WXYZ-6789";
const FARM_DOORPLATE = "3ET3FE";
const FARM_NAME = "渡的小农场";
const FARM_AI_NAME = "小渡";
const FARM_HUMAN_KEY = "private-farm-human-key";
const FARM_HUMAN_UI_BASE_URL = "https://doorbellcommons.com/farm";
const FARM_HUMAN_URL = `${FARM_HUMAN_UI_BASE_URL}/ui/${FARM_HUMAN_KEY}`;
const RESIDENT_NAME = " 渡 ";
const RESIDENT_DISPLAY_NAME = `${RESIDENT_NAME} & ${FARM_AI_NAME}`;
const HOME_NAME = " 渡的小家 ";
const PASSWORD = "doorbell password";
const FULL_REGISTRATION_PAYLOAD = {
  qq_number: QQ_NUMBER,
  registration_code: CURRENT_CODE,
  password: PASSWORD,
  resident_name: RESIDENT_NAME,
  home_name: HOME_NAME,
  farm_doorplate: FARM_DOORPLATE,
  farm_human_url: FARM_HUMAN_URL,
  confirmed_farm_name: FARM_NAME,
};
const CREATE_FARM_REGISTRATION_PAYLOAD = {
  qq_number: QQ_NUMBER,
  registration_code: CURRENT_CODE,
  password: PASSWORD,
  resident_name: "辛玥",
  home_name: HOME_NAME,
  farm_name: "辛玥的小农场",
  ai_name: FARM_AI_NAME,
};

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  readonly calls: Array<{ groupId: string; qqNumber: string }> = [];
  unavailable = false;

  async isCurrentMember(groupId: string, qqNumber: string): Promise<boolean> {
    this.calls.push({ groupId, qqNumber });
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class FakeFarmDirectory implements FarmDirectoryReader {
  readonly calls: string[] = [];
  readonly credentialCalls: string[] = [];
  readonly overviewCalls: string[] = [];
  readonly humanPageCalls: Array<{
    farmHumanKey: string;
    pagePath: string;
    query: string;
  }> = [];
  readonly humanActionCalls: Array<{
    actionPath: string;
    farmHumanKey: string;
    form: string;
  }> = [];
  farmName = FARM_NAME;
  aiName = FARM_AI_NAME;
  credentialDoorplate = FARM_DOORPLATE;
  credentialResult: "found" | "invalid" | "unavailable" | "contract" = "found";
  result: "found" | "missing" | "not_public" | "unavailable" = "found";
  humanPageHtml = `<a href="/api/farm/ui/ranch">牧场</a>`;
  humanRedirectLocation = "/api/farm/ui/ranch?flash=done";
  plots = [
    { plotId: 1, state: "ripe" as const, seedType: "common", watered: 2 },
    { plotId: 2, state: "empty" as const, seedType: null, watered: 0 },
  ];

  async lookupFarm(farmDoorplate: string) {
    this.calls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    if (this.result === "not_public") {
      throw new FarmNotPubliclyReadableError(farmDoorplate);
    }
    return { farmDoorplate, farmName: this.farmName };
  }

  async lookupFarmByHumanKey(farmHumanKey: string) {
    this.credentialCalls.push(farmHumanKey);
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human credential lookup unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm identity contract unavailable");
    }
    return {
      aiName: this.aiName,
      farmDoorplate: this.credentialDoorplate,
      farmName: this.farmName,
    };
  }

  async readFarmOverview(farmDoorplate: string) {
    this.overviewCalls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    if (this.result === "not_public") {
      throw new FarmNotPubliclyReadableError(farmDoorplate);
    }
    return {
      farmDoorplate,
      farmName: this.farmName,
      plots: this.plots,
    };
  }

  async readFarmHumanPage(farmHumanKey: string, pagePath: string, query: URLSearchParams) {
    this.humanPageCalls.push({ farmHumanKey, pagePath, query: query.toString() });
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human page unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm page contract unavailable");
    }
    return { html: this.humanPageHtml };
  }

  async submitFarmHumanAction(farmHumanKey: string, actionPath: string, form: URLSearchParams) {
    this.humanActionCalls.push({ farmHumanKey, actionPath, form: form.toString() });
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human action unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm action contract unavailable");
    }
    return { location: this.humanRedirectLocation };
  }
}

class FakeFarmCreator implements FarmCreator {
  readonly calls: FarmCreationInput[] = [];
  unavailableOnce = false;

  async createFarm(input: FarmCreationInput) {
    this.calls.push(input);
    if (this.unavailableOnce) {
      this.unavailableOnce = false;
      throw new FarmCreationUnavailableError();
    }
    return {
      creation_id: input.creationId,
      created: this.calls.length === 1,
      farm_doorplate: FARM_DOORPLATE,
      farm_name: CREATE_FARM_REGISTRATION_PAYLOAD.farm_name,
      ai_name: FARM_AI_NAME,
      human_name: CREATE_FARM_REGISTRATION_PAYLOAD.resident_name,
      farm_human_key: FARM_HUMAN_KEY,
      created_at: "2026-08-14T00:00:00.000Z",
    };
  }
}

interface AuthHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  databasePath: string;
  directory: string;
  membership: FakeGroupMembership;
  farmDirectory: FakeFarmDirectory;
  farmCreator: FakeFarmCreator;
  now: { value: number };
  close(): Promise<void>;
}

function createHarness(secureCookies = false): AuthHarness {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-auth-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const now = { value: Date.UTC(2026, 7, 1, 0, 0, 0) };
  let sessionNumber = 0;
  const database = new CommunityDatabase(databasePath, {
    generateRegistrationCode: () => CURRENT_CODE,
    generateSessionToken: () => {
      sessionNumber += 1;
      return `opaque-session-token-${sessionNumber}`;
    },
    generateAccountId: () => "a60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateResidentId: () => "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateHomeId: () => "c60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateFarmCreationId: () => "019ffb01-49cd-7020-84af-3d04fb1ed03d",
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new FakeFarmDirectory();
  const farmCreator = new FakeFarmCreator();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory,
    farmCreator,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    farmHumanUiBaseUrl: FARM_HUMAN_UI_BASE_URL,
    now: () => now.value,
  });
  const mailboxService = new MailboxService({ database, now: () => now.value });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mailboxService,
    secureCookies,
    logger: false,
  });
  return {
    app,
    database,
    databasePath,
    directory,
    farmDirectory,
    farmCreator,
    membership,
    now,
    async close() {
      await app.close();
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  assert.ok(typeof value === "string");
  return value.split(";", 1)[0] ?? "";
}

function queryScalar(databasePath: string, sql: string): unknown {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.prepare(sql).get() as { value: unknown };
    return row.value;
  } finally {
    database.close();
  }
}

test("current code and current group member create an account and opaque browser session", async () => {
  const harness = createHarness(true);
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    assert.equal(first.statusCode, 200);
    const firstBody = humanSessionSuccessSchema.parse(first.json());
    assert.equal(firstBody.account_created, true);
    assert.equal(firstBody.account.qq_number, QQ_NUMBER);
    assert.equal(firstBody.account.membership_status, "active");
    assert.deepEqual(firstBody.resident, {
      resident_id: "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
      resident_name: RESIDENT_DISPLAY_NAME,
    });
    assert.deepEqual(firstBody.home, {
      home_id: "c60a5f78-9e87-4bc4-a06f-50df4e23d42d",
      home_name: HOME_NAME,
    });
    assert.deepEqual(firstBody.farm_binding, { farm_doorplate: FARM_DOORPLATE });
    assert.deepEqual(harness.farmDirectory.credentialCalls, [FARM_HUMAN_KEY]);
    assert.deepEqual(harness.membership.calls, [
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
    ]);

    const setCookie = first.headers["set-cookie"];
    assert.ok(typeof setCookie === "string");
    assert.match(setCookie, /^doorbell_session=opaque-session-token-1;/);
    assert.match(setCookie, /; HttpOnly/);
    assert.match(setCookie, /; SameSite=Lax/);
    assert.match(setCookie, /; Path=\/api(?:;|$)/);
    assert.doesNotMatch(setCookie, /; Path=\/(?:;|$)/);
    assert.match(setCookie, /; Secure/);
    assert.doesNotMatch(setCookie, /Max-Age/i);
    assert.doesNotMatch(setCookie, /Expires=/i);

    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM mailbox_letters"),
      1,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.doesNotMatch(first.body, new RegExp(FARM_HUMAN_KEY));
    assert.equal(
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      RESIDENT_DISPLAY_NAME,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT home_name AS value FROM homes"),
      HOME_NAME,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "active",
    );
    assert.equal(statSync(harness.databasePath).mode & 0o777, 0o600);
    const storedHash = queryScalar(
      harness.databasePath,
      "SELECT token_hash AS value FROM human_sessions LIMIT 1",
    );
    assert.equal(typeof storedHash, "string");
    assert.notEqual(storedHash, "opaque-session-token-1");
    assert.doesNotMatch(
      readFileSync(harness.databasePath).toString("latin1"),
      /opaque-session-token/,
    );
    const storedPasswordCredential = queryScalar(
      harness.databasePath,
      "SELECT password_credential AS value FROM human_accounts LIMIT 1",
    );
    assert.equal(typeof storedPasswordCredential, "string");
    assert.match(String(storedPasswordCredential), /^scrypt-v1\$/);
    assert.equal(await verifyHumanPassword(PASSWORD, String(storedPasswordCredential)), true);
    assert.doesNotMatch(
      readFileSync(harness.databasePath).toString("latin1"),
      new RegExp(PASSWORD),
    );

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    const returningBody = humanSessionSuccessSchema.parse(returning.json());
    assert.equal(returningBody.account_created, false);
    assert.equal(returningBody.account.account_id, firstBody.account.account_id);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM mailbox_letters"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
  } finally {
    await harness.close();
  }
});

test("password failures from different IPs share one QQ lock and recover after 30 minutes", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const registered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(registered.statusCode, 200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        headers: { "x-forwarded-for": attempt < 5 ? "198.51.100.10" : "203.0.113.20" },
        payload: { qq_number: QQ_NUMBER, password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
      assert.deepEqual(humanAuthenticationErrorSchema.parse(failed.json()), {
        error: {
          code: "invalid_credentials",
          message: "The QQ number or password is incorrect",
        },
      });
    }

    const lockedCorrectPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(lockedCorrectPassword.statusCode, 401);
    assert.deepEqual(humanAuthenticationErrorSchema.parse(lockedCorrectPassword.json()), {
      error: {
        code: "invalid_credentials",
        message: "The QQ number or password is incorrect",
      },
    });

    harness.now.value += 30 * MINUTE_MS;
    const recovered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(recovered.statusCode, 200);
  } finally {
    await harness.close();
  }
});

test("password failure window resets after 15 minutes and a successful login clears prior failures", async () => {
  const harness = createHarness();
  const failNineTimes = async () => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { qq_number: QQ_NUMBER, password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
    }
  };
  try {
    harness.membership.members.add(QQ_NUMBER);
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: FULL_REGISTRATION_PAYLOAD,
        })
      ).statusCode,
      200,
    );

    await failNineTimes();
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      9,
    );
    const clearingSuccess = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(clearingSuccess.statusCode, 200);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      0,
    );

    await failNineTimes();
    harness.now.value += 15 * MINUTE_MS + 1;
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: { qq_number: QQ_NUMBER, password: "wrong password" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      1,
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal(
        (
          await harness.app.inject({
            method: "POST",
            url: "/api/auth/session",
            payload: { qq_number: QQ_NUMBER, password: "wrong password" },
          })
        ).statusCode,
        401,
      );
    }
    const afterNewWindow = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(afterNewWindow.statusCode, 200);
  } finally {
    await harness.close();
  }
});

test("unknown QQ login keeps dummy password work without persisting login-security garbage", async () => {
  const harness = createHarness();
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { qq_number: "1000000000", password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
      assert.equal(
        humanAuthenticationErrorSchema.parse(failed.json()).error.code,
        "invalid_credentials",
      );
    }
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_locks"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("welcome-letter conflicts cannot turn an already-created returning session into a failed login", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: FULL_REGISTRATION_PAYLOAD,
        })
      ).statusCode,
      200,
    );
    const inspection = new Database(harness.databasePath);
    try {
      inspection
        .prepare("UPDATE mailbox_letters SET body = ? WHERE idempotency_key = ?")
        .run("旧版本欢迎信正文", `system:welcome:c60a5f78-9e87-4bc4-a06f-50df4e23d42d`);
    } finally {
      inspection.close();
    }

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT body AS value FROM mailbox_letters WHERE idempotency_key = 'system:welcome:c60a5f78-9e87-4bc4-a06f-50df4e23d42d'",
      ),
      "旧版本欢迎信正文",
    );
  } finally {
    await harness.close();
  }
});

test("qualified first registration creates and binds one authoritative farm with one-time Human URL delivery", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    const body = createdFarmHumanSessionSuccessSchema.parse(response.json());
    assert.equal(body.account_created, true);
    assert.equal(body.resident.resident_name, `辛玥 & ${FARM_AI_NAME}`);
    assert.equal(body.farm_binding.farm_doorplate, FARM_DOORPLATE);
    assert.deepEqual(body.created_farm, {
      farm_doorplate: FARM_DOORPLATE,
      farm_name: CREATE_FARM_REGISTRATION_PAYLOAD.farm_name,
      ai_name: FARM_AI_NAME,
      farm_human_url: FARM_HUMAN_URL,
    });
    assert.equal("farm_human_key" in body.created_farm, false);
    assert.equal("agent_key" in body.created_farm, false);
    assert.equal("token" in body.created_farm, false);
    assert.equal(harness.farmCreator.calls.length, 1);
    assert.equal(harness.farmCreator.calls[0]?.creationId, "019ffb01-49cd-7020-84af-3d04fb1ed03d");
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_creation_requests LIMIT 1",
      ),
      null,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM farm_creation_requests WHERE completed_at IS NOT NULL",
      ),
      1,
    );

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: cookieFrom(response) },
    });
    assert.equal(current.statusCode, 200);
    assert.equal("created_farm" in current.json(), false);
    assert.doesNotMatch(current.body, /farm_human_url|private-farm-human-key/);

    const replay = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(replay.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(replay.json()).error.code,
      "account_already_registered",
    );
    assert.doesNotMatch(replay.body, /farm_human_url|private-farm-human-key/);
    assert.equal(harness.farmCreator.calls.length, 1);
  } finally {
    await harness.close();
  }
});

test("farm creation persists one stable ID before upstream and recovers the same attempt", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);

    const notMember = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(notMember.statusCode, 403);
    assert.equal(harness.farmCreator.calls.length, 0);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_creation_requests"),
      0,
    );

    harness.membership.members.add(QQ_NUMBER);
    harness.farmCreator.unavailableOnce = true;
    const lostResponse = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(lostResponse.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(lostResponse.json()).error.code,
      "farm_creation_unavailable",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_creation_requests"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );

    const conflictingRetry = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...CREATE_FARM_REGISTRATION_PAYLOAD, farm_name: "另一座农场" },
    });
    assert.equal(conflictingRetry.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(conflictingRetry.json()).error.code,
      "farm_creation_conflict",
    );
    assert.equal(harness.farmCreator.calls.length, 1);

    const recovered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(recovered.statusCode, 200);
    assert.equal(harness.farmCreator.calls.length, 2);
    assert.equal(
      harness.farmCreator.calls[0]?.creationId,
      harness.farmCreator.calls[1]?.creationId,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("concurrent create submissions share one creation ID and produce one Doorbell identity", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const responses = await Promise.all([
      harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: CREATE_FARM_REGISTRATION_PAYLOAD,
      }),
      harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: CREATE_FARM_REGISTRATION_PAYLOAD,
      }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal(new Set(harness.farmCreator.calls.map((call) => call.creationId)).size, 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("trusted farm Human URL child paths and query fragments still bind only the extracted key", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const submittedUrl = `${FARM_HUMAN_URL}/together?view=human#current`;
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, farm_human_url: submittedUrl },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(harness.farmDirectory.credentialCalls, [FARM_HUMAN_KEY]);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.doesNotMatch(response.body, /farm\.example/);
  } finally {
    await harness.close();
  }
});

test("invalid farm Human URLs are rejected before any farm request or identity write", async () => {
  const harness = createHarness();
  const invalidUrls = [
    "",
    "not-a-url",
    `ftp://farm.example/farm/ui/${FARM_HUMAN_KEY}`,
    `https://other.example/farm/ui/${FARM_HUMAN_KEY}`,
    `https://farm.example/other/ui/${FARM_HUMAN_KEY}`,
    "https://farm.example/farm/ui/",
    `https://user@farm.example/farm/ui/${FARM_HUMAN_KEY}`,
    "https://farm.example/farm/ui/key%2Fwith-slash",
    `https://farm.example\\farm\\ui\\${FARM_HUMAN_KEY}`,
  ];
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    for (const farmHumanUrl of invalidUrls) {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { ...FULL_REGISTRATION_PAYLOAD, farm_human_url: farmHumanUrl },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        humanAuthenticationErrorSchema.parse(response.json()).error.code,
        "invalid_farm_human_url",
      );
      assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
      assert.doesNotMatch(response.body, /other\.example|user@/);
    }

    const legacyBareKey = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        farm_human_url: undefined,
        farm_human_key: FARM_HUMAN_KEY,
      },
    });
    assert.equal(legacyBareKey.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(legacyBareKey.json()).error.code,
      "invalid_request",
    );
    assert.deepEqual(harness.farmDirectory.credentialCalls, []);
    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(harness.databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 0);
    }
  } finally {
    await harness.close();
  }
});

test("human and home names keep their submitted text while resident display adds the farm AI", async () => {
  const harness = createHarness();
  const longResidentName = `  ${"居民".repeat(3000)}  `;
  const longHomeName = `\n${"家园".repeat(3000)}\t`;
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        resident_name: longResidentName,
        home_name: longHomeName,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = humanSessionSuccessSchema.parse(response.json());
    const combinedResidentName = `${longResidentName} & ${FARM_AI_NAME}`;
    assert.equal(body.resident.resident_name, combinedResidentName);
    assert.equal(body.home.home_name, longHomeName);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      combinedResidentName,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT home_name AS value FROM homes"),
      longHomeName,
    );
  } finally {
    await harness.close();
  }
});

test("registration rejects malformed input, other codes, non-members, and OneBot failures distinctly", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const invalidRequest = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE, extra: true },
    });
    assert.equal(invalidRequest.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidRequest.json()).error.code,
      "invalid_request",
    );

    const partialProfile = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        qq_number: QQ_NUMBER,
        registration_code: CURRENT_CODE,
        resident_name: RESIDENT_NAME,
      },
    });
    assert.equal(partialProfile.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(partialProfile.json()).error.code,
      "invalid_request",
    );

    const whitespaceName = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, home_name: " \n\t " },
    });
    assert.equal(whitespaceName.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(whitespaceName.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.membership.calls.length, 0);
    assert.equal(harness.farmDirectory.calls.length, 0);
    assert.equal(harness.farmDirectory.credentialCalls.length, 0);

    const invalidCode = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: OTHER_CODE },
    });
    assert.equal(invalidCode.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidCode.json()).error.code,
      "invalid_registration_code",
    );
    assert.equal(harness.membership.calls.length, 0);

    harness.membership.members.clear();
    const notMember = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE },
    });
    assert.equal(notMember.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(notMember.json()).error.code,
      "qq_not_group_member",
    );

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("farm credential failures, mismatched doorplates, and changed confirmation create no rows", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    harness.farmDirectory.credentialResult = "invalid";
    const invalidKey = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(invalidKey.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidKey.json()).error.code,
      "invalid_farm_human_key",
    );
    assert.doesNotMatch(invalidKey.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "unavailable";
    const unavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "farm_unavailable",
    );

    harness.farmDirectory.credentialResult = "contract";
    const contractUnavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(contractUnavailable.statusCode, 502);
    assert.equal(
      humanAuthenticationErrorSchema.parse(contractUnavailable.json()).error.code,
      "upstream_contract_unavailable",
    );

    harness.farmDirectory.credentialResult = "found";
    harness.farmDirectory.credentialDoorplate = "ABC234";
    const wrongDoorplate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(wrongDoorplate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(wrongDoorplate.json()).error.code,
      "farm_human_key_mismatch",
    );

    const unknownDoorplate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, farm_doorplate: "ZZZZZZ" },
    });
    assert.equal(unknownDoorplate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unknownDoorplate.json()).error.code,
      "farm_human_key_mismatch",
    );

    harness.farmDirectory.credentialDoorplate = FARM_DOORPLATE;
    harness.farmDirectory.farmName = "已经改名的农场";
    const changed = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(changed.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(changed.json()).error.code,
      "farm_confirmation_mismatch",
    );

    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(harness.databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 0);
    }
    assert.deepEqual(harness.farmDirectory.credentialCalls, [
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
    ]);
  } finally {
    await harness.close();
  }
});

test("existing registration rejects registration-code replay and accepts only the saved password", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(first.statusCode, 200);

    const exactReplay = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(exactReplay.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(exactReplay.json()).error.code,
      "account_already_registered",
    );

    const wrongPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: "wrong password" },
    });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(wrongPassword.json()).error.code,
      "invalid_credentials",
    );

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    assert.equal(humanSessionSuccessSchema.parse(returning.json()).account_created, false);

    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
  } finally {
    await harness.close();
  }
});

test("one farm doorplate cannot be bound to a second human account", async () => {
  const harness = createHarness();
  const secondQqNumber = "12345678";
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    harness.membership.members.add(secondQqNumber);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(first.statusCode, 200);

    const duplicate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        qq_number: secondQqNumber,
        resident_name: "另一台小机",
        home_name: "另一座家",
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(duplicate.json()).error.code,
      "farm_already_bound",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("eligibility query cannot bypass the registration code or create a session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/registration/qq-group-eligibility",
      payload: { qq_number: QQ_NUMBER },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("GET session preserves state on outage and confirmed departure revokes every account session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const secondCreated = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    const secondCookie = cookieFrom(secondCreated);

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(current.statusCode, 200);
    const currentBody = currentHumanSessionSuccessSchema.parse(current.json());
    assert.equal(currentBody.account.qq_number, QQ_NUMBER);
    assert.equal(currentBody.resident.resident_name, RESIDENT_DISPLAY_NAME);
    assert.equal(currentBody.home.home_name, HOME_NAME);
    assert.equal(currentBody.farm_binding.farm_doorplate, FARM_DOORPLATE);
    assert.doesNotMatch(current.body, new RegExp(FARM_HUMAN_KEY));
    assert.equal(harness.membership.calls.length, 3);

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "active",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      2,
    );

    harness.membership.unavailable = false;
    const afterOutage = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(afterOutage.statusCode, 200);

    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "inactive",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );

    harness.membership.members.add(QQ_NUMBER);
    const afterDeparture = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: secondCookie },
    });
    assert.equal(afterDeparture.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(afterDeparture.json()).error.code,
      "authentication_required",
    );

    const restored = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(
      humanSessionSuccessSchema.parse(restored.json()).account.membership_status,
      "active",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_inactive_at AS value FROM human_accounts LIMIT 1",
      ),
      null,
    );
  } finally {
    await harness.close();
  }
});

test("bound farm overview uses the authenticated session binding and returns only public farm facts", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    const response = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(boundFarmOverviewSuccessSchema.parse(response.json()), {
      farm: {
        farm_doorplate: FARM_DOORPLATE,
        farm_name: FARM_NAME,
        plots: [
          { plot_id: 1, state: "ripe", seed_type: "common", watered: 2 },
          { plot_id: 2, state: "empty", seed_type: null, watered: 0 },
        ],
      },
    });
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.overviewCalls, [FARM_DOORPLATE]);
    assert.deepEqual(harness.membership.calls, [
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
    ]);

    const overrideAttempt = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview?farm_doorplate=ZZZZZZ",
      headers: { cookie },
    });
    assert.equal(overrideAttempt.statusCode, 400);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(overrideAttempt.json()).error.code,
      "invalid_request",
    );
    assert.deepEqual(harness.farmDirectory.overviewCalls, [FARM_DOORPLATE]);
    assert.equal(harness.membership.calls.length, 2);
  } finally {
    await harness.close();
  }
});

test("bound farm overview keeps membership, farm privacy, and upstream failures distinct", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    harness.membership.unavailable = true;
    const oneBotUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(oneBotUnavailable.statusCode, 503);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(oneBotUnavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(harness.farmDirectory.overviewCalls.length, 0);

    harness.membership.unavailable = false;
    harness.farmDirectory.result = "not_public";
    const notPublic = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(notPublic.statusCode, 403);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(notPublic.json()).error.code,
      "farm_not_publicly_readable",
    );

    harness.farmDirectory.result = "unavailable";
    const farmUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(farmUnavailable.statusCode, 503);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(farmUnavailable.json()).error.code,
      "farm_unavailable",
    );

    const farmCallsBeforeDeparture = harness.farmDirectory.overviewCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(harness.farmDirectory.overviewCalls.length, farmCallsBeforeDeparture);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("farm human UI proxy derives the credential and keeps independent pages exclusive", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);
    harness.farmDirectory.humanPageHtml =
      '<a href="/api/farm/ui/ranch">牧场</a><form action="/api/farm/ui/ranch/feed"></form>';

    const page = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers["content-type"] ?? "", /^text\/html/);
    assert.doesNotMatch(page.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanPageCalls, [
      { farmHumanKey: FARM_HUMAN_KEY, pagePath: "", query: "" },
    ]);

    const targetOverride = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui?farm_doorplate=ABC234",
      headers: { cookie },
    });
    assert.equal(targetOverride.statusCode, 400);
    assert.equal(farmHumanUiErrorSchema.parse(targetOverride.json()).error.code, "invalid_request");
    assert.equal(harness.farmDirectory.humanPageCalls.length, 1);

    const pathOverride = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui/another-human-key/ranch",
      headers: { cookie },
    });
    assert.equal(pathOverride.statusCode, 400);
    assert.equal(harness.farmDirectory.humanPageCalls.length, 1);

    for (const section of ["glimmer", "together"]) {
      const independentPathOverride = await harness.app.inject({
        method: "GET",
        url: `/api/farm/ui/${section}`,
        headers: { cookie },
      });
      assert.equal(independentPathOverride.statusCode, 400);
      assert.equal(
        farmHumanUiErrorSchema.parse(independentPathOverride.json()).error.code,
        "invalid_request",
      );
      assert.equal(harness.farmDirectory.humanPageCalls.length, 1);
    }

    const action = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ui/ranch/feed",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: "animal=cow",
    });
    assert.equal(action.statusCode, 303);
    assert.equal(action.headers.location, "/api/farm/ui/ranch?flash=done");
    assert.doesNotMatch(action.headers.location ?? "", new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanActionCalls, [
      { farmHumanKey: FARM_HUMAN_KEY, actionPath: "ranch/feed", form: "animal=cow" },
    ]);

    const formOverride = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ui/ranch/feed",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: "animal=cow&farm_doorplate=ABC234",
    });
    assert.equal(formOverride.statusCode, 400);
    assert.equal(harness.farmDirectory.humanActionCalls.length, 1);

    const glimmer = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(glimmer.statusCode, 200);
    assert.doesNotMatch(glimmer.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanPageCalls.at(-1), {
      farmHumanKey: FARM_HUMAN_KEY,
      pagePath: "glimmer",
      query: "",
    });

    const callsAfterGlimmer = harness.farmDirectory.humanPageCalls.length;
    for (const method of ["HEAD", "POST", "PUT"] as const) {
      const rejectedMethod = await harness.app.inject({
        method,
        url: "/api/lingye-glimmer",
        headers: { cookie },
      });
      assert.equal(rejectedMethod.statusCode, 404);
      assert.equal(harness.farmDirectory.humanPageCalls.length, callsAfterGlimmer);
    }

    const together = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-together",
      headers: { cookie },
    });
    assert.equal(together.statusCode, 200);
    assert.deepEqual(harness.farmDirectory.humanPageCalls.at(-1), {
      farmHumanKey: FARM_HUMAN_KEY,
      pagePath: "together",
      query: "",
    });

    const callsBeforeDeparture = harness.farmDirectory.humanPageCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(farmHumanUiErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
    assert.equal(harness.farmDirectory.humanPageCalls.length, callsBeforeDeparture);
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await harness.close();
  }
});

test("farm human UI proxy separates invalid credentials, outage, contract failure, and no binding", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      farmHumanUiErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);

    harness.farmDirectory.credentialResult = "invalid";
    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(invalid.statusCode, 409);
    assert.equal(
      farmHumanUiErrorSchema.parse(invalid.json()).error.code,
      "farm_credential_invalid",
    );
    assert.doesNotMatch(invalid.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "unavailable";
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(farmHumanUiErrorSchema.parse(unavailable.json()).error.code, "farm_unavailable");
    assert.doesNotMatch(unavailable.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "contract";
    const contractUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(contractUnavailable.statusCode, 502);
    assert.equal(
      farmHumanUiErrorSchema.parse(contractUnavailable.json()).error.code,
      "upstream_contract_unavailable",
    );
    assert.doesNotMatch(contractUnavailable.body, new RegExp(FARM_HUMAN_KEY));

    const unbindDatabase = new Database(harness.databasePath);
    try {
      unbindDatabase.prepare("DELETE FROM farm_bindings").run();
    } finally {
      unbindDatabase.close();
    }
    harness.farmDirectory.credentialResult = "found";
    const unbound = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(unbound.statusCode, 409);
    assert.equal(
      farmHumanUiErrorSchema.parse(unbound.json()).error.code,
      "registration_profile_required",
    );
  } finally {
    await harness.close();
  }
});

test("logout revokes only the presented session and clears its cookie", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    const logout = await harness.app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(logout.statusCode, 200);
    assert.deepEqual(humanLogoutSuccessSchema.parse(logout.json()), { logged_out: true });
    assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
    assert.match(String(logout.headers["set-cookie"]), /; Path=\/api(?:;|$)/);
    assert.doesNotMatch(String(logout.headers["set-cookie"]), /; Path=\/(?:;|$)/);

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(current.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(current.json()).error.code,
      "authentication_required",
    );
  } finally {
    await harness.close();
  }
});

test("administrator password reset replaces the credential and revokes every active session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);
    const replacement = await createHumanPasswordCredential("replacement password");

    assert.equal(
      harness.database.resetHumanPassword(QQ_NUMBER, replacement, harness.now.value + 1),
      true,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );
    const oldSession = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(oldSession.statusCode, 401);
    const oldPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(oldPassword.statusCode, 401);
    const replacementPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: "replacement password" },
    });
    assert.equal(replacementPassword.statusCode, 200);
    assert.equal(
      harness.database.resetHumanPassword("987654321", replacement, harness.now.value),
      false,
    );
  } finally {
    await harness.close();
  }
});

test("session persistence failure rolls back the new account, resident, home, and farm binding", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-registration-rollback-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const accountIds = [
    "a60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    "a70a5f78-9e87-4bc4-a06f-50df4e23d42d",
  ];
  const residentIds = [
    "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    "b70a5f78-9e87-4bc4-a06f-50df4e23d42d",
  ];
  const homeIds = ["c60a5f78-9e87-4bc4-a06f-50df4e23d42d", "c70a5f78-9e87-4bc4-a06f-50df4e23d42d"];
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => "same-session-token",
    generateAccountId: () => accountIds.shift() ?? "",
    generateResidentId: () => residentIds.shift() ?? "",
    generateHomeId: () => homeIds.shift() ?? "",
  });
  try {
    database.createHumanSession("10001", 1, {
      residentName: "第一台小机",
      homeName: "第一座家",
      farmDoorplate: "3ET3FE",
      farmHumanKey: "first-private-key",
    });

    assert.throws(
      () =>
        database.createHumanSession("10002", 2, {
          residentName: "第二台小机",
          homeName: "第二座家",
          farmDoorplate: "ABC234",
          farmHumanKey: "second-private-key",
        }),
      /UNIQUE constraint failed: human_sessions.token_hash/,
    );

    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 1);
    }
    assert.equal(
      queryScalar(
        databasePath,
        "SELECT COUNT(*) AS value FROM human_accounts WHERE qq_number = '10002'",
      ),
      0,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("registration code expires at the exact 24-hour boundary and restart cannot extend it", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-code-window-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const start = Date.UTC(2026, 7, 1, 0, 0, 0);
  let database = new CommunityDatabase(databasePath, {
    generateRegistrationCode: () => CURRENT_CODE,
  });
  try {
    const first = database.getCurrentRegistrationCode(start);
    assert.deepEqual(first, {
      code: CURRENT_CODE,
      generatedAt: start,
      expiresAt: start + DAY_MS,
    });
    database.close();

    database = new CommunityDatabase(databasePath, {
      generateRegistrationCode: () => OTHER_CODE,
    });
    assert.deepEqual(database.getCurrentRegistrationCode(start + DAY_MS - 1), first);
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS), false);
    assert.deepEqual(database.getCurrentRegistrationCode(start + DAY_MS), {
      code: OTHER_CODE,
      generatedAt: start + DAY_MS,
      expiresAt: start + 2 * DAY_MS,
    });
    database.close();

    database = new CommunityDatabase(databasePath, {
      generateRegistrationCode: () => "DB-9999-ZZZZ",
    });
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS + 1), false);
    assert.equal(database.getCurrentRegistrationCode(start + DAY_MS + 1).code, OTHER_CODE);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("registration code rotation never keeps the expired code when the generator collides", () => {
  const start = Date.UTC(2026, 7, 1, 0, 0, 0);
  const database = new CommunityDatabase(":memory:", {
    generateRegistrationCode: () => CURRENT_CODE,
  });
  try {
    assert.equal(database.getCurrentRegistrationCode(start).code, CURRENT_CODE);
    const rotated = database.getCurrentRegistrationCode(start + DAY_MS);
    assert.notEqual(rotated.code, CURRENT_CODE);
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS), false);
  } finally {
    database.close();
  }
});

test("administrator CLI returns the same persisted current code and window without OneBot", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-code-cli-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  try {
    const runCli = () =>
      spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/registration-code-cli.ts"], {
        cwd: repositoryRoot,
        env: { ...process.env, DOORBELL_DATABASE_PATH: databasePath },
        encoding: "utf8",
      });
    const first = runCli();
    const second = runCli();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, first.stdout);
    assert.match(
      first.stdout,
      /^code=DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}\n/,
    );

    const fields = Object.fromEntries(
      first.stdout
        .trim()
        .split("\n")
        .map((line) => line.split("=", 2)),
    );
    assert.equal(
      new Date(fields.expires_at ?? 0).getTime() - new Date(fields.generated_at ?? 0).getTime(),
      DAY_MS,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("expired code is rejected by the authentication service before membership lookup", async () => {
  const database = new CommunityDatabase(":memory:", {
    generateRegistrationCode: (() => {
      const codes = [CURRENT_CODE, OTHER_CODE];
      return () => codes.shift() ?? "DB-9999-ZZZZ";
    })(),
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new FakeFarmDirectory();
  const now = { value: Date.UTC(2026, 7, 1, 0, 0, 0) };
  const auth = new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now.value,
  });
  try {
    database.getCurrentRegistrationCode(now.value);
    now.value += DAY_MS;
    await assert.rejects(
      auth.createSession({ qqNumber: QQ_NUMBER, registrationCode: CURRENT_CODE }),
      InvalidRegistrationCodeError,
    );
    assert.equal(membership.calls.length, 0);
    assert.equal(farmDirectory.calls.length, 0);
    assert.equal(farmDirectory.credentialCalls.length, 0);
  } finally {
    database.close();
  }
});
