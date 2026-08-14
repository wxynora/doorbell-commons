import { emitKeypressEvents } from "node:readline";
import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";
import { createHumanPasswordCredential, isValidHumanPassword } from "./password-auth.js";

function readHiddenValue(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Password reset requires an interactive terminal");
  }
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (result?: string, error?: Error) => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(result ?? "");
      }
    };
    const onKeypress = (text: string, key: { ctrl?: boolean; meta?: boolean; name?: string }) => {
      if (key.ctrl && key.name === "c") {
        finish(undefined, new Error("Password reset cancelled"));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish(value);
        return;
      }
      if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (!key.ctrl && !key.meta && text) {
        value += text;
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

const qqNumber = process.argv[2];
if (!qqNumber || !/^[1-9][0-9]*$/.test(qqNumber)) {
  throw new Error("Usage: npm run account:reset-password -w @doorbell/server -- <qq-number>");
}

const password = await readHiddenValue("New password: ");
if (!isValidHumanPassword(password)) {
  throw new Error("Password must contain 8 to 128 characters");
}
const confirmation = await readHiddenValue("Confirm password: ");
if (password !== confirmation) {
  throw new Error("Password confirmation does not match");
}

const credential = await createHumanPasswordCredential(password);
const database = new CommunityDatabase(readDatabasePath());
try {
  if (!database.resetHumanPassword(qqNumber, credential, Date.now())) {
    throw new Error(`No Doorbell human account exists for QQ ${qqNumber}`);
  }
  process.stdout.write(`Password reset completed for QQ ${qqNumber}; active sessions were revoked.\n`);
} finally {
  database.close();
}
