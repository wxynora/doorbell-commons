import { mkdir } from "node:fs/promises";
import { backup, DatabaseSync } from "node:sqlite";
import { basename, join, resolve } from "node:path";

const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) {
  throw new Error("usage: backup-community-database.mjs <source.sqlite> <destination-directory>");
}

const source = resolve(sourceArgument);
const destinationDirectory = resolve(destinationArgument);
const timestamp = new Date().toISOString().replaceAll(":", "-");
const destination = join(
  destinationDirectory,
  `${basename(source, ".sqlite")}-${timestamp}.sqlite`,
);

await mkdir(destinationDirectory, { mode: 0o700, recursive: true });
const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, destination);
} finally {
  database.close();
}

console.log(destination);
