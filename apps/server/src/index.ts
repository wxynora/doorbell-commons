import { buildApp } from "./app.js";
import { readQqGroupEligibilityConfig } from "./config.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";

const qqGroupEligibilityConfig = readQqGroupEligibilityConfig();
const app = buildApp({
  groupId: qqGroupEligibilityConfig.qqGroupId,
  groupMembership: new OneBotGroupMembershipClient({
    apiBaseUrl: qqGroupEligibilityConfig.oneBotApiBaseUrl,
    apiToken: qqGroupEligibilityConfig.oneBotApiToken,
  }),
});
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const close = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Stopping Doorbell Commons");
  await app.close();
};

process.once("SIGINT", () => {
  void close("SIGINT");
});

process.once("SIGTERM", () => {
  void close("SIGTERM");
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
