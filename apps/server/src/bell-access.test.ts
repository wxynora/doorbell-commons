import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bellAccessStatusResponseSchema,
  bellCredentialIssueResponseSchema,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { BellAccessService, hashBellCredential } from "./bell-access-service.js";
import { BellService } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

class CurrentMember implements QqGroupMembershipReader {
  async isCurrentMember(): Promise<boolean> {
    return true;
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(): Promise<FarmDirectoryEntry> {
    throw new Error("Bell access must not query the farm");
  }
  async lookupFarmByHumanKey(): Promise<FarmDirectoryEntry> {
    throw new Error("Bell access must not query the farm");
  }
  async readFarmOverview(): Promise<BoundFarmOverview> {
    throw new Error("Bell access must not query the farm");
  }
  async readFarmHumanPage(): Promise<FarmHumanPage> {
    throw new Error("Bell access must not query the farm");
  }
  async submitFarmHumanAction(): Promise<FarmHumanActionRedirect> {
    throw new Error("Bell access must not query the farm");
  }
}

test("Human sessions self-issue, replace, isolate and revoke their own Bell credential", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-bell-access-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const database = new CommunityDatabase(databasePath);
  const membership = new CurrentMember();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: "1",
    now: () => 1_000,
  });
  const first = database.createHumanSession("10001", 1_000, {
    residentName: "小一",
    homeName: "第一座家",
    farmDoorplate: "ABC234",
    farmHumanKey: "human-first",
  });
  const second = database.createHumanSession("10002", 1_000, {
    residentName: "小二",
    homeName: "第二座家",
    farmDoorplate: "DEF567",
    farmHumanKey: "human-second",
  });
  const credentials = [`dbb_${"A".repeat(43)}`, `dbb_${"B".repeat(43)}`, `dbb_${"C".repeat(43)}`];
  const credentialIds = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  let now = 2_000;
  const bellService = new BellService({
    database,
    registrationAuth,
    heartbeatIntervalMs: 30_000,
    replayIntervalMs: 60_000,
    now: () => now,
  });
  const bellAccessService = new BellAccessService({
    database,
    registrationAuth,
    bellService,
    bellEndpoint: "http://127.0.0.1:3000/api/bell/stream",
    now: () => now,
    generateCredential: () => {
      const credential = credentials.shift();
      if (!credential) throw new Error("credential fixture exhausted");
      return credential;
    },
    generateCredentialId: () => {
      const id = credentialIds.shift();
      if (!id) throw new Error("credential id fixture exhausted");
      return id;
    },
  });
  const app = buildApp({
    bellAccessService,
    bellService,
    groupId: "1",
    groupMembership: membership,
    registrationAuth,
    secureCookies: false,
    logger: false,
  });
  const firstCookie = `doorbell_session=${first.token}`;
  const secondCookie = `doorbell_session=${second.token}`;

  try {
    const initial = await app.inject({
      method: "GET",
      url: "/api/bell-access",
      headers: { cookie: firstCookie },
    });
    assert.equal(initial.statusCode, 200);
    assert.equal(
      bellAccessStatusResponseSchema.parse(initial.json()).credential_status,
      "not_issued",
    );

    const issuedFirstResponse = await app.inject({
      method: "POST",
      url: "/api/bell-access/credential",
      headers: { cookie: firstCookie },
      payload: {},
    });
    assert.equal(issuedFirstResponse.statusCode, 200);
    const issuedFirst = bellCredentialIssueResponseSchema.parse(issuedFirstResponse.json());
    assert.equal(issuedFirst.replaced_previous, false);
    assert.equal(
      database.authenticateBellCredentialHash(hashBellCredential(issuedFirst.bell_credential))
        ?.residentId,
      first.community.resident.residentId,
    );

    const secondStillEmpty = await app.inject({
      method: "GET",
      url: "/api/bell-access",
      headers: { cookie: secondCookie },
    });
    assert.equal(
      bellAccessStatusResponseSchema.parse(secondStillEmpty.json()).credential_status,
      "not_issued",
    );

    const issuedSecondResponse = await app.inject({
      method: "POST",
      url: "/api/bell-access/credential",
      headers: { cookie: secondCookie },
      payload: {},
    });
    const issuedSecond = bellCredentialIssueResponseSchema.parse(issuedSecondResponse.json());
    assert.equal(
      database.authenticateBellCredentialHash(hashBellCredential(issuedSecond.bell_credential))
        ?.residentId,
      second.community.resident.residentId,
    );

    let closed = false;
    await bellService.connect(issuedFirst.bell_credential, {
      send: () => undefined,
      heartbeat: () => undefined,
      close: () => {
        closed = true;
      },
    });
    now = 3_000;
    const replacedResponse = await app.inject({
      method: "POST",
      url: "/api/bell-access/credential",
      headers: { cookie: firstCookie },
      payload: {},
    });
    const replaced = bellCredentialIssueResponseSchema.parse(replacedResponse.json());
    assert.equal(replaced.replaced_previous, true);
    assert.equal(closed, true);
    assert.equal(
      database.authenticateBellCredentialHash(hashBellCredential(issuedFirst.bell_credential)),
      undefined,
    );
    assert.equal(
      database.authenticateBellCredentialHash(hashBellCredential(issuedSecond.bell_credential))
        ?.residentId,
      second.community.resident.residentId,
    );

    now = 4_000;
    const revoked = await app.inject({
      method: "DELETE",
      url: "/api/bell-access/credential",
      headers: { cookie: firstCookie },
      payload: {},
    });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal(bellAccessStatusResponseSchema.parse(revoked.json()).credential_status, "revoked");
    assert.equal(
      database.authenticateBellCredentialHash(hashBellCredential(replaced.bell_credential)),
      undefined,
    );
    assert.doesNotMatch(readFileSync(databasePath).toString("latin1"), /dbb_[A-Za-z0-9_-]{43}/u);
  } finally {
    await app.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
