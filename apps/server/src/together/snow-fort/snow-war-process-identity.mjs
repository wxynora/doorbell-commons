import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function validSnowProcessIdentity(value) {
  return Boolean(
    value?.version === 1 &&
      ["linux", "darwin"].includes(value.system) &&
      typeof value.bootId === "string" &&
      value.bootId &&
      typeof value.startedAt === "string" &&
      value.startedAt,
  );
}

// OS birth facts distinguish a process from a later reuse of the same PID.
// Linux: boot UUID + /proc/PID/stat field 22 (ticks since boot).
// macOS development: boot UUID + ps lstart in a fixed locale and timezone.
// Failure to read a live process is unknown, never proof that it is dead.
export function readSnowProcessIdentity(
  pid,
  {
    system = process.platform,
    readFile = readFileSync,
    execFile = execFileSync,
    probe = (id) => process.kill(id, 0),
  } = {},
) {
  const alive = () => {
    try {
      probe(pid);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      // EPERM proves the PID exists; metadata may still be readable even when
      // we cannot signal the unrelated process that reused the number.
      if (error.code === "EPERM") return true;
      throw new Error("runtime_owner_unverifiable", { cause: error });
    }
  };
  if (!alive()) return undefined;
  try {
    let bootId, startedAt;
    if (system === "linux") {
      bootId = readFile("/proc/sys/kernel/random/boot_id", "utf8").trim();
      const stat = readFile(`/proc/${pid}/stat`, "utf8");
      // comm is parenthesized and can itself contain spaces or ')'.
      const end = stat.lastIndexOf(")");
      const fields = stat
        .slice(end + 1)
        .trim()
        .split(/\s+/u);
      startedAt = fields[19]; // field 3 is fields[0], so field 22 is fields[19].
      if (
        end < 0 ||
        stat.slice(0, stat.indexOf(" ")) !== String(pid) ||
        !/^\d+$/u.test(startedAt ?? "")
      )
        throw new Error("invalid_process_stat");
    } else if (system === "darwin") {
      const options = {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
        stdio: ["ignore", "pipe", "pipe"],
      };
      bootId = execFile("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], options).trim();
      startedAt = execFile("/bin/ps", ["-p", String(pid), "-o", "lstart="], options).trim();
    } else throw new Error("unsupported_process_identity");
    const identity = { version: 1, system, bootId, startedAt };
    if (!validSnowProcessIdentity(identity)) throw new Error("invalid_process_identity");
    return identity;
  } catch (error) {
    if (!alive()) return undefined; // It exited while the OS facts were being read.
    throw new Error("runtime_owner_unverifiable", { cause: error });
  }
}

export function sameSnowProcessIdentity(left, right) {
  return (
    validSnowProcessIdentity(left) &&
    validSnowProcessIdentity(right) &&
    left.system === right.system &&
    left.bootId === right.bootId &&
    left.startedAt === right.startedAt
  );
}
