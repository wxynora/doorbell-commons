#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  exportFarmWorldFromDatabase,
  importFarmWorldToDatabase,
  openFarmWorldDatabaseReadOnly,
  openFarmWorldMigrationDatabase,
  readFarmWorldJson,
  verifyFarmWorldMigration,
  writeFarmWorldJsonAtomic,
} from "../dist/farm-world-sqlite-migration.js";

function usage() {
  return [
    "Usage:",
    "  node tools/farm-world-sqlite-migration.mjs import --world <world.json> --database <lingye-world.sqlite>",
    "  node tools/farm-world-sqlite-migration.mjs verify --world <world.json> --database <lingye-world.sqlite>",
    "  node tools/farm-world-sqlite-migration.mjs export --database <lingye-world.sqlite> --output <world.json>",
  ].join("\n");
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!["import", "verify", "export"].includes(command))
    throw new Error(usage());
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!["--world", "--database", "--output"].includes(flag) || value === undefined)
      throw new Error(usage());
    const name = flag.slice(2);
    if (Object.hasOwn(options, name))
      throw new Error(`Duplicate option: ${flag}`);
    options[name] = value;
  }
  if (!options.database ||
      ((command === "import" || command === "verify") && !options.world) ||
      (command === "export" && !options.output)) {
    throw new Error(usage());
  }
  const allowed = command === "export" ? ["database", "output"] : ["database", "world"];
  if (Object.keys(options).some((key) => !allowed.includes(key)))
    throw new Error(usage());
  return { command, options };
}

export async function runFarmWorldMigrationCli(argv) {
  const { command, options } = parseArguments(argv);
  if (command === "import") {
    // Validate the source before opening or migrating the destination database.
    const world = readFarmWorldJson(options.world);
    const database = openFarmWorldMigrationDatabase(options.database);
    try {
      return importFarmWorldToDatabase(database, world);
    }
    finally {
      database.close();
    }
  }
  const database = openFarmWorldDatabaseReadOnly(options.database);
  try {
    if (command === "verify")
      return verifyFarmWorldMigration(database, readFarmWorldJson(options.world));
    const world = exportFarmWorldFromDatabase(database);
    const output = writeFarmWorldJsonAtomic(options.output, world);
    return { ok: true, output, farms: world.farms.length };
  }
  finally {
    database.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runFarmWorldMigrationCli(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
