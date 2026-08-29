import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createdFarmHumanSessionSuccessSchema,
  currentHumanSessionSuccessSchema,
  humanAuthenticationErrorSchema,
  humanSessionSuccessSchema,
  humanSettingsErrorSchema,
  humanSettingsSuccessSchema,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
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

const NOW = Date.UTC(2026, 7, 29, 8, 0, 0);
const FIRST_PROFILE = "11111111-1111-4111-8111-111111111111";
const SECOND_PROFILE = "22222222-2222-4222-8222-222222222222";
const OTHER_PROFILE = "33333333-3333-4333-8333-333333333333";
const THIRD_PROFILE = "44444444-4444-4444-8444-444444444444";

class Membership implements QqGroupMembershipReader {
  readonly members = new Set(["10001", "10002"]);

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    return this.members.has(qqNumber);
  }
}

class FarmDirectory implements FarmDirectoryReader {
  async lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    if (farmDoorplate !== "DEF567") throw new Error("unexpected farm");
    return { farmDoorplate, farmName: "第二座农场" };
  }

  async lookupFarmByHumanKey(farmHumanKey: string): Promise<FarmDirectoryEntry> {
    if (farmHumanKey !== "second-human-key") throw new Error("unexpected farm key");
    return { farmDoorplate: "DEF567", farmName: "第二座农场", aiName: "二号机" };
  }

  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    throw new Error("unused");
  }

  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    throw new Error("unused");
  }

  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    throw new Error("unused");
  }
}

function sessionCookie(token: string): string {
  return `doorbell_session=${token}`;
}

test("one Human account creates and switches complete profiles without moving resident credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-multi-profile-"));
  const profileIds = [FIRST_PROFILE, OTHER_PROFILE, SECOND_PROFILE, THIRD_PROFILE];
  const sessionTokens = ["first-session", "parallel-session", "other-session"];
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"), {
    generateProfileId: () => profileIds.shift() ?? crypto.randomUUID(),
    generateSessionToken: () => sessionTokens.shift() ?? crypto.randomUUID(),
  });
  const membership = new Membership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new FarmDirectory(),
    farmCreator: {
      async createFarm(input) {
        return {
          creation_id: input.creationId,
          created: true,
          farm_doorplate: "MNP789",
          farm_name: input.farmName,
          ai_name: input.aiName,
          human_name: input.humanName,
          farm_human_key: "third-human-key",
          created_at: new Date(NOW).toISOString(),
        };
      },
    },
    farmHumanUiBaseUrl: "https://farm.example/farm/",
    groupId: "group",
    groupMembership: membership,
    now: () => NOW,
  });
  const app = buildApp({
    groupId: "group",
    groupMembership: membership,
    registrationAuth,
    secureCookies: false,
    logger: false,
  });
  try {
    const first = database.createHumanSession("10001", NOW, {
      residentName: "辛玥 & 一号机",
      homeName: "第一座家",
      farmDoorplate: "ABC234",
      farmHumanKey: "first-human-key",
      passwordCredential: "stored-password-credential",
    });
    const parallel = database.createExistingHumanSession("10001", NOW + 1);
    const other = database.createHumanSession("10002", NOW, {
      residentName: "另一户 & 小机",
      homeName: "另一座家",
      farmDoorplate: "GHI678",
      farmHumanKey: "other-human-key",
      passwordCredential: "other-password-credential",
    });

    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: { cookie: sessionCookie(first.token) },
      payload: {
        resident_name: "辛玥",
        home_name: "第二座家",
        farm_doorplate: "DEF567",
        farm_human_url: "https://farm.example/farm/ui/second-human-key",
        confirmed_farm_name: "第二座农场",
      },
    });
    assert.equal(createdResponse.statusCode, 200);
    const created = humanSessionSuccessSchema.parse(createdResponse.json());
    assert.equal(created.active_profile_id, SECOND_PROFILE);
    assert.equal(created.resident.resident_name, "辛玥 & 二号机");
    assert.equal(created.profiles.length, 2);
    assert.deepEqual(
      created.profiles.map((profile) => profile.profile_id).sort(),
      [FIRST_PROFILE, SECOND_PROFILE].sort(),
    );
    assert.doesNotMatch(createdResponse.body, /first-human-key|second-human-key/u);

    const firstSessionNow = currentHumanSessionSuccessSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/session",
          headers: { cookie: sessionCookie(first.token) },
        })
      ).json(),
    );
    const parallelSessionStillFirst = currentHumanSessionSuccessSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/session",
          headers: { cookie: sessionCookie(parallel.token) },
        })
      ).json(),
    );
    assert.equal(firstSessionNow.active_profile_id, SECOND_PROFILE);
    assert.equal(parallelSessionStillFirst.active_profile_id, FIRST_PROFILE);
    assert.equal(parallelSessionStillFirst.farm_binding.farm_doorplate, "ABC234");

    const malicious = await app.inject({
      method: "POST",
      url: "/api/settings/active-profile",
      headers: { cookie: sessionCookie(first.token) },
      payload: { profile_id: other.activeProfileId },
    });
    assert.equal(malicious.statusCode, 409);
    assert.equal(
      humanSettingsErrorSchema.parse(malicious.json()).error.code,
      "profile_not_available",
    );

    const switched = await app.inject({
      method: "POST",
      url: "/api/settings/active-profile",
      headers: { cookie: sessionCookie(first.token) },
      payload: { profile_id: FIRST_PROFILE },
    });
    assert.equal(switched.statusCode, 200);
    assert.equal(
      currentHumanSessionSuccessSchema.parse(switched.json()).farm_binding.farm_doorplate,
      "ABC234",
    );
    const settings = humanSettingsSuccessSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/settings",
          headers: { cookie: sessionCookie(first.token) },
        })
      ).json(),
    );
    assert.equal(settings.active_profile_id, FIRST_PROFILE);
    assert.equal(settings.home.home_name, "第一座家");

    const firstResidentId = first.community.resident.residentId;
    const secondResidentId = created.resident.resident_id;
    database.beginMcpFarmMigration(firstResidentId, "ABC234", crypto.randomUUID(), NOW);
    const firstMcp = database.getMcpAccessBinding(firstResidentId);
    assert.ok(firstMcp);
    database.confirmMcpFarmRevoked(firstResidentId, firstMcp.migrationId, crypto.randomUUID(), NOW);
    database.replaceMcpCredential(firstResidentId, crypto.randomUUID(), "a".repeat(64), NOW);
    database.beginMcpFarmMigration(secondResidentId, "DEF567", crypto.randomUUID(), NOW);
    const secondMcp = database.getMcpAccessBinding(secondResidentId);
    assert.ok(secondMcp);
    database.confirmMcpFarmRevoked(
      secondResidentId,
      secondMcp.migrationId,
      crypto.randomUUID(),
      NOW,
    );
    database.replaceMcpCredential(secondResidentId, crypto.randomUUID(), "b".repeat(64), NOW);
    database.replaceBellCredentialForProfile(
      FIRST_PROFILE,
      crypto.randomUUID(),
      "c".repeat(64),
      NOW,
    );
    database.replaceBellCredentialForProfile(
      SECOND_PROFILE,
      crypto.randomUUID(),
      "d".repeat(64),
      NOW,
    );
    assert.equal(
      database.authenticateMcpCredentialHash("a".repeat(64))?.residentId,
      firstResidentId,
    );
    assert.equal(
      database.authenticateMcpCredentialHash("b".repeat(64))?.residentId,
      secondResidentId,
    );
    assert.equal(
      database.authenticateBellCredentialHash("c".repeat(64))?.residentId,
      firstResidentId,
    );
    assert.equal(
      database.authenticateBellCredentialHash("d".repeat(64))?.residentId,
      secondResidentId,
    );

    const createdFarmResponse = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: { cookie: sessionCookie(first.token) },
      payload: {
        resident_name: "辛玥",
        home_name: "第三座家",
        farm_name: "第三座农场",
        ai_name: "三号机",
      },
    });
    assert.equal(createdFarmResponse.statusCode, 200, createdFarmResponse.body);
    const createdFarm = createdFarmHumanSessionSuccessSchema.parse(createdFarmResponse.json());
    assert.equal(createdFarm.active_profile_id, THIRD_PROFILE);
    assert.equal(createdFarm.profiles.length, 3);
    assert.equal(
      createdFarm.created_farm.farm_human_url,
      "https://farm.example/farm/ui/third-human-key",
    );
    assert.equal(
      database.getOrCreateFarmCreationRequest("10001", NOW + 1, {
        farmName: "第四座农场",
        aiName: "四号机",
        humanName: "辛玥",
      }).farmName,
      "第四座农场",
    );

    const unauthenticatedAdd = await app.inject({
      method: "POST",
      url: "/api/profiles",
      payload: {
        resident_name: "越权",
        home_name: "越权",
        farm_doorplate: "DEF567",
        farm_human_url: "https://farm.example/farm/ui/second-human-key",
        confirmed_farm_name: "第二座农场",
      },
    });
    assert.equal(unauthenticatedAdd.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unauthenticatedAdd.json()).error.code,
      "authentication_required",
    );
  } finally {
    await app.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
