import { dirname, join } from "node:path";
import { ConnectorClient } from "./connector-client.js";
import { readConnectorHttpTimeoutMs, readConnectorServerWebSocketUrl } from "./connector-config.js";
import { ConnectorStateDatabase } from "./connector-state.js";
import { buildConnectorLocalApi, listenOnLoopback } from "./local-api.js";
import { SharedMemeSynchronizer } from "./shared-meme-sync.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const serverWebSocketUrl = readConnectorServerWebSocketUrl();
const httpRequestTimeoutMs = readConnectorHttpTimeoutMs();
const databasePath = required("DOORBELL_CONNECTOR_DATABASE_PATH");
const credential = required("DOORBELL_CONNECTOR_CREDENTIAL");
const database = new ConnectorStateDatabase(databasePath);
const sharedMemeSync = new SharedMemeSynchronizer({
  serverWebSocketUrl: serverWebSocketUrl.toString(),
  credential,
  httpRequestTimeoutMs,
  state: database,
  snapshotPath: join(dirname(databasePath), "shared-memes.sqlite"),
});
const client = new ConnectorClient({
  serverWebSocketUrl: serverWebSocketUrl.toString(),
  credential,
  httpRequestTimeoutMs,
  state: database,
  sharedMemeSync,
});
const app = buildConnectorLocalApi(client);
const port = Number(process.env.DOORBELL_CONNECTOR_PORT ?? 3100);

app.addHook("onClose", () => {
  client.stop();
  database.close();
});

try {
  await listenOnLoopback(app, port);
  client.start();
} catch (error) {
  await app.close();
  throw error;
}
