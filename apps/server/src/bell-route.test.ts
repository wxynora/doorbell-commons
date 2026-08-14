import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { BellService } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { MailboxService } from "./mailbox-service.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const TOKEN = `dbb_${"A".repeat(43)}`;

class CurrentMember implements QqGroupMembershipReader {
  async isCurrentMember(): Promise<boolean> {
    return true;
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(): Promise<FarmDirectoryEntry> {
    throw new Error("Bell must not query the farm");
  }
  async lookupFarmByHumanKey(): Promise<FarmDirectoryEntry> {
    throw new Error("Bell must not query the farm");
  }
  async readFarmOverview(): Promise<BoundFarmOverview> {
    throw new Error("Bell must not query the farm");
  }
  async readFarmHumanPage(): Promise<FarmHumanPage> {
    throw new Error("Bell must not query the farm");
  }
  async submitFarmHumanAction(): Promise<FarmHumanActionRedirect> {
    throw new Error("Bell must not query the farm");
  }
}

async function readRecognizedEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expectedCount: number,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  while (events.length < expectedCount) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = /^event: ([^\n]+)$/mu.exec(frame)?.[1];
      const data = /^data: (.+)$/mu.exec(frame)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  }
  return events;
}

test("Bell HTTP surface authenticates SSE without turning human mail into a wake", async () => {
  const database = new CommunityDatabase(":memory:");
  const membership = new CurrentMember();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => 1_000,
  });
  const created = database.createHumanSession("10001", 1_000, {
    residentName: "小机",
    homeName: "小屋",
    farmDoorplate: "FARM-1",
    farmHumanKey: "human-key",
  });
  database.replaceFirstActiveBellCredential(
    "credential-1",
    createHash("sha256").update(TOKEN).digest("hex"),
    1_100,
  );
  const bellService = new BellService({
    database,
    registrationAuth,
    heartbeatIntervalMs: 30_000,
    replayIntervalMs: 60_000,
    now: () => 3_000,
    generateConnectionEpoch: () => "epoch-http",
  });
  const mailbox = new MailboxService({
    database,
    now: () => 2_000,
  });
  mailbox.deliver({
    homeId: created.community.home.homeId,
    idempotencyKey: "system:http-test",
    category: "system",
    title: "private title",
    body: "private body",
    sensitiveValues: [],
  });
  const app = buildApp({
    bellService,
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mailboxService: mailbox,
    secureCookies: false,
    logger: false,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    const denied = await fetch(`${address}/api/bell/stream`, {
      headers: { authorization: `Bearer dbb_${"B".repeat(43)}` },
    });
    assert.equal(denied.status, 401);

    const stream = await fetch(`${address}/api/bell/stream`, {
      headers: { accept: "text/event-stream", authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.ok(stream.body);
    const reader = stream.body.getReader();
    const events = await readRecognizedEvents(reader, 1);
    assert.deepEqual(
      events.map((event) => event.event),
      ["connected"],
    );
    assert.doesNotMatch(JSON.stringify(events), /private title|private body/u);

    const rejectedControl = await fetch(`${address}/api/bell/ack`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        wake_id: "wake-http",
        connection_epoch: "epoch-http",
      }),
    });
    assert.equal(rejectedControl.status, 409);
    await reader.cancel();
  } finally {
    await app.close();
    database.close();
  }
});
