import assert from "node:assert/strict";
import test from "node:test";
import {
  OneBotGroupMembershipClient,
  OneBotUnavailableError,
  type QqGroupMemberSnapshotStore,
} from "./qq-group-membership.js";

class MemorySnapshotStore implements QqGroupMemberSnapshotStore {
  readonly snapshots = new Map<
    string,
    { groupId: string; memberIds: string[]; capturedAt: number }
  >();

  replaceQqGroupMemberSnapshot(
    groupId: string,
    memberIds: readonly string[],
    capturedAt: number,
  ): void {
    this.snapshots.set(groupId, { groupId, memberIds: [...memberIds].sort(), capturedAt });
  }

  getQqGroupMemberSnapshot(groupId: string) {
    const snapshot = this.snapshots.get(groupId);
    return snapshot ? { ...snapshot, memberIds: [...snapshot.memberIds] } : undefined;
  }
}

function clientWithMembers(
  members: unknown[],
  snapshotStore: QqGroupMemberSnapshotStore = new MemorySnapshotStore(),
  now = () => 1_000,
) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new OneBotGroupMembershipClient({
    apiBaseUrl: "http://127.0.0.1:3001/",
    apiToken: "test-token",
    requestTimeoutMs: 1_000,
    snapshotStore,
    now,
    fetchImplementation: async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ status: "ok", retcode: 0, data: members }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, requests };
}

test("a non-empty complete member list distinguishes current membership from real absence", async () => {
  const { client, requests } = clientWithMembers([{ user_id: 10001 }, { user_id: "10002" }]);
  assert.equal(await client.isCurrentMember("12345", "10001"), true);
  assert.equal(await client.isCurrentMember("12345", "99999"), false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "http://127.0.0.1:3001/get_group_member_list");
  assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
    group_id: "12345",
    no_cache: true,
  });
  assert.equal(requests[0]?.init.method, "POST");
});

test("an empty successful OneBot member list is an outage and never a mass non-member result", async () => {
  const { client } = clientWithMembers([]);
  await assert.rejects(
    client.isCurrentMember("12345", "10001"),
    (error: unknown) =>
      error instanceof OneBotUnavailableError && /empty member list/u.test(error.message),
  );
});

test("empty and unavailable OneBot responses use the last persisted complete snapshot", async () => {
  const snapshotStore = new MemorySnapshotStore();
  const live = clientWithMembers([{ user_id: 10001 }, { user_id: 10002 }], snapshotStore).client;
  assert.equal(await live.isCurrentMember("12345", "10001"), true);
  assert.deepEqual(snapshotStore.getQqGroupMemberSnapshot("12345"), {
    groupId: "12345",
    memberIds: ["10001", "10002"],
    capturedAt: 1_000,
  });

  const empty = clientWithMembers([], snapshotStore).client;
  assert.equal(await empty.isCurrentMember("12345", "10001"), true);
  assert.equal(await empty.isCurrentMember("12345", "99999"), false);

  const unavailable = new OneBotGroupMembershipClient({
    apiBaseUrl: "http://127.0.0.1:3001/",
    apiToken: "test-token",
    requestTimeoutMs: 1_000,
    snapshotStore,
    fetchImplementation: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(await unavailable.isCurrentMember("12345", "10002"), true);
  assert.deepEqual(snapshotStore.getQqGroupMemberSnapshot("12345")?.memberIds, ["10001", "10002"]);
});

test("live-only admission never uses a persisted snapshot", async () => {
  const snapshotStore = new MemorySnapshotStore();
  snapshotStore.replaceQqGroupMemberSnapshot("12345", ["10001"], 1_000);
  const empty = clientWithMembers([], snapshotStore).client;
  await assert.rejects(
    empty.isCurrentMember("12345", "10001", { allowPersistedSnapshot: false }),
    OneBotUnavailableError,
  );
});

test("a later complete list atomically becomes the only fallback snapshot", async () => {
  const snapshotStore = new MemorySnapshotStore();
  assert.equal(
    await clientWithMembers(
      [{ user_id: 10001 }],
      snapshotStore,
      () => 1_000,
    ).client.isCurrentMember("12345", "10001"),
    true,
  );
  assert.equal(
    await clientWithMembers(
      [{ user_id: 10002 }],
      snapshotStore,
      () => 2_000,
    ).client.isCurrentMember("12345", "10001"),
    false,
  );
  const empty = clientWithMembers([], snapshotStore).client;
  assert.equal(await empty.isCurrentMember("12345", "10001"), false);
  assert.equal(await empty.isCurrentMember("12345", "10002"), true);
  assert.equal(snapshotStore.getQqGroupMemberSnapshot("12345")?.capturedAt, 2_000);
});

test("malformed member data cannot overwrite the last complete snapshot", async () => {
  const snapshotStore = new MemorySnapshotStore();
  const live = clientWithMembers([{ user_id: 10001 }], snapshotStore, () => 1_000).client;
  assert.equal(await live.isCurrentMember("12345", "10001"), true);

  const malformed = clientWithMembers(
    [{ user_id: 10002 }, { nickname: "missing user_id" }],
    snapshotStore,
    () => 2_000,
  ).client;
  assert.equal(await malformed.isCurrentMember("12345", "10001"), true);
  assert.deepEqual(snapshotStore.getQqGroupMemberSnapshot("12345"), {
    groupId: "12345",
    memberIds: ["10001"],
    capturedAt: 1_000,
  });
});
