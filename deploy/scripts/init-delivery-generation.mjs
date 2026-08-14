import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireRootExecution, writeDeliveryGeneration } from "./delivery-generation-authority.mjs";

export async function initDeliveryGeneration() {
  return await writeDeliveryGeneration({ replace: false });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireRootExecution();
  await initDeliveryGeneration();
  process.stdout.write("Doorbell delivery generation initialized.\n");
}
