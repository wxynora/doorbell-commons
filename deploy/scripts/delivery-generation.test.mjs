import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeDeliveryGeneration } from "./delivery-generation-authority.mjs";
import {
  restoreCommunityDatabase,
  restoreStoppedCommunityDatabase,
} from "./restore-community-database.mjs";

const FIRST_GENERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_GENERATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createDatabase(path, schemaVersion, marker) {
  const database = new DatabaseSync(path);
  try {
    database.exec("CREATE TABLE restore_marker (value TEXT NOT NULL)");
    database.prepare("INSERT INTO restore_marker VALUES (?)").run(marker);
    database.exec(`PRAGMA user_version = ${schemaVersion}`);
  } finally {
    database.close();
  }
}

function readMarker(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return database.prepare("SELECT value FROM restore_marker").get().value;
  } finally {
    database.close();
  }
}

test("generation authority initializes once and rotates atomically with mode 0600", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-generation-authority-"));
  const authorityPath = join(directory, "delivery-generation");
  try {
    await writeDeliveryGeneration({
      authorityPath,
      generation: FIRST_GENERATION,
      owner: null,
    });
    assert.equal(readFileSync(authorityPath, "utf8"), `${FIRST_GENERATION}\n`);
    assert.equal(statSync(authorityPath).mode & 0o777, 0o600);

    await assert.rejects(
      writeDeliveryGeneration({
        authorityPath,
        generation: SECOND_GENERATION,
        owner: null,
      }),
      /EEXIST/,
    );
    assert.equal(readFileSync(authorityPath, "utf8"), `${FIRST_GENERATION}\n`);

    await writeDeliveryGeneration({
      authorityPath,
      generation: SECOND_GENERATION,
      owner: null,
      replace: true,
    });
    assert.equal(readFileSync(authorityPath, "utf8"), `${SECOND_GENERATION}\n`);
    assert.equal(statSync(authorityPath).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("restore keeps Doorbell stopped through rotate, restore, integrity, and schema checks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-generation-restore-"));
  const authorityPath = join(directory, "delivery-generation");
  const databasePath = join(directory, "doorbell.sqlite");
  const backupPath = join(directory, "backup.sqlite");
  const commands = [];
  try {
    await writeDeliveryGeneration({
      authorityPath,
      generation: FIRST_GENERATION,
      owner: null,
    });
    createDatabase(databasePath, 4, "old-live");
    createDatabase(backupPath, 4, "restored-backup");

    await restoreCommunityDatabase({
      authorityOwner: null,
      authorityPath,
      backupPath,
      databasePath,
      generateGeneration: () => {
        commands.push("rotate");
        assert.equal(readMarker(databasePath), "old-live");
        return SECOND_GENERATION;
      },
      runServiceCommand: async (arguments_) => {
        commands.push(arguments_.join(" "));
        if (arguments_[0] === "show" && arguments_[1] === "--property=ActiveState") {
          return { stdout: "inactive\n", stderr: "" };
        }
        if (arguments_[0] === "show" && arguments_[1] === "--property=SubState") {
          return { stdout: "dead\n", stderr: "" };
        }
        if (arguments_[0] === "start") {
          assert.equal(readFileSync(authorityPath, "utf8"), `${SECOND_GENERATION}\n`);
          assert.equal(readMarker(databasePath), "restored-backup");
        }
        return { stdout: "", stderr: "" };
      },
    });

    assert.deepEqual(commands, [
      "stop doorbell-commons.service",
      "show --property=ActiveState --value doorbell-commons.service",
      "show --property=SubState --value doorbell-commons.service",
      "rotate",
      "start doorbell-commons.service",
    ]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("restore never restarts after stop confirmation or restored schema failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-generation-restore-failure-"));
  const authorityPath = join(directory, "delivery-generation");
  const databasePath = join(directory, "doorbell.sqlite");
  const backupPath = join(directory, "backup.sqlite");
  try {
    await writeDeliveryGeneration({
      authorityPath,
      generation: FIRST_GENERATION,
      owner: null,
    });
    createDatabase(databasePath, 4, "old-live");
    createDatabase(backupPath, 3, "wrong-schema");

    const dirtyStopCommands = [];
    await assert.rejects(
      restoreCommunityDatabase({
        authorityOwner: null,
        authorityPath,
        backupPath,
        databasePath,
        generateGeneration: () => {
          throw new Error("generation must not rotate before stop is confirmed");
        },
        runServiceCommand: async (arguments_) => {
          dirtyStopCommands.push(arguments_.join(" "));
          if (arguments_[0] === "show" && arguments_[1] === "--property=ActiveState") {
            return { stdout: "active\n", stderr: "" };
          }
          if (arguments_[0] === "show" && arguments_[1] === "--property=SubState") {
            return { stdout: "running\n", stderr: "" };
          }
          return { stdout: "", stderr: "" };
        },
      }),
      /did not stop cleanly/,
    );
    assert.equal(readFileSync(authorityPath, "utf8"), `${FIRST_GENERATION}\n`);
    assert.equal(readMarker(databasePath), "old-live");
    assert.equal(
      dirtyStopCommands.some((command) => command.startsWith("start ")),
      false,
    );

    const schemaFailureCommands = [];
    await assert.rejects(
      restoreCommunityDatabase({
        authorityOwner: null,
        authorityPath,
        backupPath,
        databasePath,
        generateGeneration: () => SECOND_GENERATION,
        runServiceCommand: async (arguments_) => {
          schemaFailureCommands.push(arguments_.join(" "));
          if (arguments_[0] === "show" && arguments_[1] === "--property=ActiveState") {
            return { stdout: "inactive\n", stderr: "" };
          }
          if (arguments_[0] === "show" && arguments_[1] === "--property=SubState") {
            return { stdout: "dead\n", stderr: "" };
          }
          return { stdout: "", stderr: "" };
        },
      }),
      /schema version must be 4/,
    );
    assert.equal(readFileSync(authorityPath, "utf8"), `${SECOND_GENERATION}\n`);
    assert.equal(readMarker(databasePath), "wrong-schema");
    assert.equal(
      schemaFailureCommands.some((command) => command.startsWith("start ")),
      false,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("failed release rollback rotates generation and restores the pre-release schema while stopped", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-release-rollback-"));
  const authorityPath = join(directory, "delivery-generation");
  const databasePath = join(directory, "doorbell.sqlite");
  const backupPath = join(directory, "pre-release.sqlite");
  const commands = [];
  try {
    await writeDeliveryGeneration({
      authorityPath,
      generation: FIRST_GENERATION,
      owner: null,
    });
    createDatabase(databasePath, 4, "failed-candidate");
    createDatabase(backupPath, 3, "pre-release");

    await restoreStoppedCommunityDatabase({
      authorityOwner: null,
      authorityPath,
      backupPath,
      databasePath,
      expectedSchemaVersion: 3,
      generateGeneration: () => SECOND_GENERATION,
      runServiceCommand: async (arguments_) => {
        commands.push(arguments_.join(" "));
        if (arguments_[1] === "--property=ActiveState") {
          return { stdout: "inactive\n", stderr: "" };
        }
        if (arguments_[1] === "--property=SubState") {
          return { stdout: "dead\n", stderr: "" };
        }
        throw new Error(`unexpected service command: ${arguments_.join(" ")}`);
      },
    });

    assert.deepEqual(commands, [
      "show --property=ActiveState --value doorbell-commons.service",
      "show --property=SubState --value doorbell-commons.service",
    ]);
    assert.equal(readFileSync(authorityPath, "utf8"), `${SECOND_GENERATION}\n`);
    assert.equal(readMarker(databasePath), "pre-release");
    const restored = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(restored.prepare("PRAGMA user_version").get().user_version, 3);
    } finally {
      restored.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("Doorbell systemd unit loads only the fixed root authority credential", () => {
  const unitPath = fileURLToPath(new URL("../systemd/doorbell-commons.service", import.meta.url));
  const unit = readFileSync(unitPath, "utf8");
  assert.match(
    unit,
    /^LoadCredential=delivery-generation:\/etc\/doorbell-commons\/delivery-generation$/m,
  );
  assert.doesNotMatch(unit, /Environment=.*delivery-generation/i);
});
