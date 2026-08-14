import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, chown, copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  DELIVERY_GENERATION_AUTHORITY_PATH,
  requireRootExecution,
  writeDeliveryGeneration,
} from "./delivery-generation-authority.mjs";

const DOORBELL_SERVICE = "doorbell-commons.service";
const COMMUNITY_DATABASE_PATH = "/var/lib/doorbell-commons/doorbell.sqlite";
const COMMUNITY_DATABASE_SCHEMA_VERSION = 3;

function runSystemctl(arguments_) {
  return new Promise((resolvePromise, reject) => {
    execFile("systemctl", arguments_, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(`systemctl ${arguments_.join(" ")} failed: ${stderr.trim()}`, { cause: error }),
        );
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function syncDirectory(path) {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function atomicRestoreDatabase(backupPath, databasePath) {
  const source = resolve(backupPath);
  const destination = resolve(databasePath);
  if (source === destination) {
    throw new Error("backup and live database paths must differ");
  }
  const destinationDirectory = dirname(destination);
  await mkdir(destinationDirectory, { mode: 0o700, recursive: true });
  const existingOwner = await stat(destination).catch(() => stat(destinationDirectory));
  const temporaryPath = resolve(
    destinationDirectory,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.restore`,
  );
  let installed = false;
  try {
    await copyFile(source, temporaryPath, fsConstants.COPYFILE_EXCL);
    await chmod(temporaryPath, 0o600);
    await chown(temporaryPath, existingOwner.uid, existingOwner.gid);
    const temporaryDatabase = await open(temporaryPath, "r+");
    try {
      await temporaryDatabase.sync();
    } finally {
      await temporaryDatabase.close();
    }
    await rm(`${destination}-wal`, { force: true });
    await rm(`${destination}-shm`, { force: true });
    await rm(`${destination}-journal`, { force: true });
    await rename(temporaryPath, destination);
    installed = true;
    await syncDirectory(destinationDirectory);
  } finally {
    if (!installed) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export function validateRestoredCommunityDatabase(
  databasePath,
  expectedSchemaVersion = COMMUNITY_DATABASE_SCHEMA_VERSION,
) {
  const database = new DatabaseSync(resolve(databasePath), { readOnly: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0] === null || integrity[0].integrity_check !== "ok") {
      throw new Error("restored community database failed SQLite integrity_check");
    }
    const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyFailures.length !== 0) {
      throw new Error("restored community database failed SQLite foreign_key_check");
    }
    const version = database.prepare("PRAGMA user_version").get();
    if (version?.user_version !== expectedSchemaVersion) {
      throw new Error(
        `restored community database schema version must be ${expectedSchemaVersion}`,
      );
    }
  } finally {
    database.close();
  }
}

export async function restoreCommunityDatabase({
  backupPath,
  authorityPath = DELIVERY_GENERATION_AUTHORITY_PATH,
  authorityOwner = { uid: 0, gid: 0 },
  databasePath = COMMUNITY_DATABASE_PATH,
  generateGeneration = randomUUID,
  runServiceCommand = runSystemctl,
  serviceName = DOORBELL_SERVICE,
} = {}) {
  if (!backupPath) {
    throw new Error("a community SQLite backup path is required");
  }
  const backupMetadata = await stat(resolve(backupPath));
  if (!backupMetadata.isFile()) {
    throw new Error("community SQLite backup path must be a regular file");
  }
  if (resolve(backupPath) === resolve(databasePath)) {
    throw new Error("backup and live database paths must differ");
  }

  await runServiceCommand(["stop", serviceName]);
  const activeState = (
    await runServiceCommand(["show", "--property=ActiveState", "--value", serviceName])
  ).stdout.trim();
  const subState = (
    await runServiceCommand(["show", "--property=SubState", "--value", serviceName])
  ).stdout.trim();
  if (activeState !== "inactive" || subState !== "dead") {
    throw new Error(
      `Doorbell service did not stop cleanly: ActiveState=${activeState} SubState=${subState}`,
    );
  }

  await writeDeliveryGeneration({
    authorityPath,
    generation: generateGeneration(),
    owner: authorityOwner,
    replace: true,
  });
  await atomicRestoreDatabase(backupPath, databasePath);
  validateRestoredCommunityDatabase(databasePath);
  await runServiceCommand(["start", serviceName]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireRootExecution();
  const backupPath = process.argv[2];
  if (!backupPath || process.argv.length !== 3) {
    throw new Error("usage: restore-community-database.mjs <backup.sqlite>");
  }
  await restoreCommunityDatabase({ backupPath });
  process.stdout.write("Doorbell community database restored under a new delivery generation.\n");
}
