import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import type {
  FarmHumanBulletinAckInput,
  FarmHumanBulletinReader,
  FarmHumanBulletinReadInput,
} from "./farm-bulletin-client.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 30, 6, 0, 0);
const QQ_NUMBER = "123456789";
const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-bulletin-route-key";
const REVISION = `farm-bulletin-v1:${"a".repeat(64)}`;
const IDEMPOTENCY_KEY = "219ffb01-49cd-7020-84af-3d04fb1ed03d";

class AlwaysMember implements QqGroupMembershipReader {
  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    return qqNumber === QQ_NUMBER;
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(_farmDoorplate: string): Promise<FarmDirectoryEntry> {
    throw new Error("unused");
  }
  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    throw new Error("unused");
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

class RecordingBulletinReader implements FarmHumanBulletinReader {
  readonly ackCalls: FarmHumanBulletinAckInput[] = [];

  async readBulletin(_input: FarmHumanBulletinReadInput) {
    return {
      subject: { farm_doorplate: FARM_DOORPLATE },
      data: {
        available: { tasks: [], mature_plots: [], messages: [], ranch_notifications: [] },
        unavailable: {},
        trail: { status: "available" as const, entries: [], has_unread: false },
      },
      revision: REVISION,
      server_time: new Date(NOW).toISOString(),
    };
  }

  async acknowledgeBulletin(input: FarmHumanBulletinAckInput) {
    this.ackCalls.push(input);
    return {
      subject: { farm_doorplate: FARM_DOORPLATE },
      data: {
        result: { receipt_id: input.idempotencyKey, acknowledged_count: 2 },
        resource: {
          available: { tasks: [], mature_plots: [], messages: [], ranch_notifications: [] },
          unavailable: {},
          trail: { status: "available" as const, entries: [], has_unread: false },
        },
      },
      revision: input.expectedRevision,
      server_time: new Date(NOW).toISOString(),
    };
  }
}

test("Human bulletin ACK derives farm identity from the session and forwards revision plus idempotency", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-bulletin-route-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = new CommunityDatabase(join(directory, "community.sqlite"), {
    generateSessionToken: () => "bulletin-route-session",
  });
  t.after(() => database.close());
  const session = database.createHumanSession(QQ_NUMBER, NOW, {
    residentName: "播报测试居民",
    homeName: "播报测试小屋",
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
  });
  const bulletinReader = new RecordingBulletinReader();
  const membership = new AlwaysMember();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    farmBulletinReader: bulletinReader,
    groupMembership: membership,
    groupId: "123456",
    now: () => NOW,
  });
  const app = buildApp({
    groupId: "123456",
    groupMembership: membership,
    registrationAuth,
    secureCookies: false,
    logger: false,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/farm/bulletin/ack",
    headers: {
      cookie: `doorbell_session=${session.token}`,
      "idempotency-key": IDEMPOTENCY_KEY,
    },
    payload: { expected_revision: REVISION, acknowledge: "trail" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.deepEqual(bulletinReader.ackCalls, [
    {
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      expectedRevision: REVISION,
      idempotencyKey: IDEMPOTENCY_KEY,
      acknowledge: "trail",
    },
  ]);
  assert.equal(response.json().data.result.receipt_id, IDEMPOTENCY_KEY);
  assert.equal(response.body.includes(FARM_HUMAN_KEY), false);
});
