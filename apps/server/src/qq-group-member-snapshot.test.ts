import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { COMMUNITY_DATABASE_SCHEMA_VERSION, CommunityDatabase } from "./community-database.js";

function withTemporaryDatabase(run: (databasePath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-qq-member-snapshot-"));
  try {
    run(join(directory, "doorbell.sqlite"));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("the latest complete QQ member snapshot replaces the old set and survives restart", () => {
  withTemporaryDatabase((databasePath) => {
    const first = new CommunityDatabase(databasePath);
    first.replaceQqGroupMemberSnapshot("12345", ["10002", "10001", "10001"], 1_000);
    assert.deepEqual(first.getQqGroupMemberSnapshot("12345"), {
      groupId: "12345",
      memberIds: ["10001", "10002"],
      capturedAt: 1_000,
    });
    first.replaceQqGroupMemberSnapshot("12345", ["10003"], 2_000);
    first.close();

    const reopened = new CommunityDatabase(databasePath);
    try {
      assert.deepEqual(reopened.getQqGroupMemberSnapshot("12345"), {
        groupId: "12345",
        memberIds: ["10003"],
        capturedAt: 2_000,
      });
    } finally {
      reopened.close();
    }
  });
});

test("schema v14 migrates to the persistent QQ member snapshot table", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    current.close();

    const versionFourteen = new Database(databasePath);
    versionFourteen.exec("DROP TABLE qq_group_member_snapshots");
    versionFourteen.pragma("user_version = 14");
    versionFourteen.close();

    const migrated = new CommunityDatabase(databasePath);
    try {
      migrated.replaceQqGroupMemberSnapshot("12345", ["10001"], 1_000);
      assert.deepEqual(migrated.getQqGroupMemberSnapshot("12345")?.memberIds, ["10001"]);
    } finally {
      migrated.close();
    }

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      assert.deepEqual(database.pragma("foreign_key_check"), []);
    } finally {
      database.close();
    }
  });
});
