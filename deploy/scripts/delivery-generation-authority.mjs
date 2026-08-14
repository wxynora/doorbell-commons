import { randomUUID } from "node:crypto";
import { chmod, chown, link, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export const DELIVERY_GENERATION_AUTHORITY_PATH = "/etc/doorbell-commons/delivery-generation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireRootExecution() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("delivery generation administration must run as root");
  }
}

async function syncDirectory(path) {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function writeDeliveryGeneration({
  authorityPath = DELIVERY_GENERATION_AUTHORITY_PATH,
  generation = randomUUID(),
  owner = { uid: 0, gid: 0 },
  replace = false,
} = {}) {
  if (!isAbsolute(authorityPath)) {
    throw new Error("delivery generation authority path must be absolute");
  }
  if (!UUID_PATTERN.test(generation)) {
    throw new Error("delivery generation must be a UUID");
  }

  const authorityDirectory = dirname(authorityPath);
  await mkdir(authorityDirectory, { mode: 0o700, recursive: true });
  const temporaryPath = join(
    authorityDirectory,
    `.delivery-generation.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryHandle;
  let installed = false;
  try {
    temporaryHandle = await open(temporaryPath, "wx", 0o600);
    await temporaryHandle.writeFile(`${generation}\n`, "utf8");
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await chmod(temporaryPath, 0o600);
    if (owner) {
      await chown(temporaryPath, owner.uid, owner.gid);
    }

    if (replace) {
      await rename(temporaryPath, authorityPath);
    } else {
      await link(temporaryPath, authorityPath);
      await rm(temporaryPath);
    }
    installed = true;
    await syncDirectory(authorityDirectory);

    const metadata = await stat(authorityPath);
    if ((metadata.mode & 0o777) !== 0o600) {
      throw new Error("delivery generation authority must have mode 0600");
    }
    if (owner && (metadata.uid !== owner.uid || metadata.gid !== owner.gid)) {
      throw new Error("delivery generation authority must be owned by root:root");
    }
    return generation;
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    if (!installed) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
