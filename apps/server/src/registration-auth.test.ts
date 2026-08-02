import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  currentHumanSessionSuccessSchema,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import {
  type FarmDirectoryReader,
  FarmDirectoryUnavailableError,
  FarmNotFoundError,
} from "./farm-directory-client.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { InvalidRegistrationCodeError, RegistrationAuthService } from "./registration-auth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const QQ_NUMBER = "3877162412";
const CURRENT_CODE = "DB-ABCD-2345";
const OTHER_CODE = "DB-WXYZ-6789";
const FARM_DOORPLATE = "3ET3FE";
const FARM_NAME = "渡的小农场";
const RESIDENT_NAME = " 渡 ";
const HOME_NAME = " 渡的小家 ";
const FULL_REGISTRATION_PAYLOAD = {
  qq_number: QQ_NUMBER,
  registration_code: CURRENT_CODE,
  resident_name: RESIDENT_NAME,
  home_name: HOME_NAME,
  farm_doorplate: FARM_DOORPLATE,
  confirmed_farm_name: FARM_NAME,
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
  farmName = FARM_NAME;
  result: "found" | "missing" | "unavailable" = "found";

  async lookupFarm(farmDoorplate: string) {
    this.calls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    return { farmDoorplate, farmName: this.farmName };
  }
}

interface AuthHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  databasePath: string;
  directory: string;
  membership: FakeGroupMembership;
  farmDirectory: FakeFarmDirectory;
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
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new FakeFarmDirectory();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now.value,
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    secureCookies,
    logger: false,
  });
  return {
    app,
    database,
    databasePath,
    directory,
    farmDirectory,
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
      resident_name: RESIDENT_NAME,
    });
    assert.deepEqual(firstBody.home, {
      home_id: "c60a5f78-9e87-4bc4-a06f-50df4e23d42d",
      home_name: HOME_NAME,
    });
    assert.deepEqual(firstBody.farm_binding, { farm_doorplate: FARM_DOORPLATE });
    assert.deepEqual(harness.farmDirectory.calls, [FARM_DOORPLATE]);
    assert.deepEqual(harness.membership.calls, [
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
    ]);

    const setCookie = first.headers["set-cookie"];
    assert.ok(typeof setCookie === "string");
    assert.match(setCookie, /^doorbell_session=opaque-session-token-1;/);
    assert.match(setCookie, /; HttpOnly/);
    assert.match(setCookie, /; SameSite=Lax/);
    assert.match(setCookie, /; Path=\//);
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
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      RESIDENT_NAME,
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

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: code.code },
    });
    assert.equal(returning.statusCode, 200);
    const returningBody = humanSessionSuccessSchema.parse(returning.json());
    assert.equal(returningBody.account_created, false);
    assert.equal(returningBody.account.account_id, firstBody.account.account_id);
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

test("resident and home names are stored verbatim without an added length cap", async () => {
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
    assert.equal(body.resident.resident_name, longResidentName);
    assert.equal(body.home.home_name, longHomeName);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      longResidentName,
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

test("farm lookup failures and changed confirmation create no identity or session rows", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    harness.farmDirectory.result = "missing";
    const missing = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(humanAuthenticationErrorSchema.parse(missing.json()).error.code, "farm_not_found");

    harness.farmDirectory.result = "unavailable";
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

    harness.farmDirectory.result = "found";
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
    assert.deepEqual(harness.farmDirectory.calls, [FARM_DOORPLATE, FARM_DOORPLATE, FARM_DOORPLATE]);
  } finally {
    await harness.close();
  }
});

test("existing registration accepts an exact full replay and rejects every silent overwrite", async () => {
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
    assert.equal(exactReplay.statusCode, 200);
    assert.equal(humanSessionSuccessSchema.parse(exactReplay.json()).account_created, false);

    const changedResident = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, resident_name: "另一个居民" },
    });
    assert.equal(changedResident.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(changedResident.json()).error.code,
      "registration_profile_mismatch",
    );

    const wrongConfirmation = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, confirmed_farm_name: "旧名字" },
    });
    assert.equal(wrongConfirmation.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(wrongConfirmation.json()).error.code,
      "farm_confirmation_mismatch",
    );

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

test("a historical human account must complete the full profile before receiving a session", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const rawDatabase = new Database(harness.databasePath);
    try {
      rawDatabase
        .prepare(
          `INSERT INTO human_accounts (
             account_id,
             qq_number,
             created_at,
             membership_status,
             membership_checked_at
           ) VALUES (?, ?, ?, 'active', ?)`,
        )
        .run(
          "a60a5f78-9e87-4bc4-a06f-50df4e23d42d",
          QQ_NUMBER,
          harness.now.value,
          harness.now.value,
        );
    } finally {
      rawDatabase.close();
    }
    harness.membership.members.add(QQ_NUMBER);

    const incomplete = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE },
    });
    assert.equal(incomplete.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(incomplete.json()).error.code,
      "registration_profile_required",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      0,
    );

    const completed = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(completed.statusCode, 200);
    const completedBody = humanSessionSuccessSchema.parse(completed.json());
    assert.equal(completedBody.account_created, false);
    assert.equal(completedBody.account.account_id, "a60a5f78-9e87-4bc4-a06f-50df4e23d42d");
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
      payload: { qq_number: QQ_NUMBER, registration_code: code.code },
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
    assert.equal(currentBody.resident.resident_name, RESIDENT_NAME);
    assert.equal(currentBody.home.home_name, HOME_NAME);
    assert.equal(currentBody.farm_binding.farm_doorplate, FARM_DOORPLATE);
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
      payload: { qq_number: QQ_NUMBER, registration_code: code.code },
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
    });

    assert.throws(
      () =>
        database.createHumanSession("10002", 2, {
          residentName: "第二台小机",
          homeName: "第二座家",
          farmDoorplate: "ABC234",
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
  } finally {
    database.close();
  }
});
