import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceRoot = new URL("../src/", import.meta.url);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const webTsconfig = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
const testFiles = readdirSync(sourceRoot, { recursive: true })
  .filter(
    (entry) =>
      typeof entry === "string" &&
      /\.test\.tsx?$/.test(entry) &&
      !entry.endsWith(".interaction.test.tsx"),
  )
  .sort()
  .map((entry) => new URL(entry, sourceRoot).pathname);

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], {
  cwd: workspaceRoot,
  env: { ...process.env, TSX_TSCONFIG_PATH: webTsconfig },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
