import {
  type ConnectorDeliveryGeneration,
  type ConnectorEventEnvelope,
  type ConnectorLocalConnectionState,
  connectorAckFrameSchema,
  connectorEventFrameSchema,
  connectorGenerationResetAckFrameSchema,
  connectorGenerationResetRequiredFrameSchema,
  connectorHeartbeatAckFrameSchema,
  connectorHeartbeatFrameSchema,
  connectorHelloFrameSchema,
  connectorReadyFrameSchema,
  connectorRequiredCapabilities,
  connectorResyncRequestFrameSchema,
  connectorResyncRequiredFrameSchema,
  connectorServerErrorFrameSchema,
  connectorWelcomeMessage,
  type MailboxCategory,
  type MailboxDetailSuccess,
  type MailboxListSuccess,
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListSuccessSchema,
  sharedMemeVersionHintEventType,
  sharedMemeVersionHintPayloadSchema,
} from "@doorbell/protocol";
import WebSocket, { type RawData } from "ws";
import { validateConnectorServerWebSocketUrl } from "./connector-config.js";
import type { ConnectorStateDatabase } from "./connector-state.js";
import type { SharedMemeSynchronizer } from "./shared-meme-sync.js";

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface ConnectorClientOptions {
  serverWebSocketUrl: string;
  credential: string;
  httpRequestTimeoutMs: number;
  state: ConnectorStateDatabase;
  now?: () => number;
  createSocket?: (url: string) => WebSocket;
  reconnect?: boolean;
  fetchImplementation?: typeof fetch;
  sharedMemeSync?: SharedMemeSynchronizer;
}

export class ConnectorMailboxRequestError extends Error {
  readonly statusCode: number;
  readonly code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "letter_not_found"
    | "attachment_not_claimable"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable"
    | "connector_unavailable";

  constructor(statusCode: number, code: ConnectorMailboxRequestError["code"], message: string) {
    super(message);
    this.name = "ConnectorMailboxRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function parseJson(data: RawData): unknown {
  const buffer = Array.isArray(data)
    ? Buffer.concat(data)
    : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);
  return JSON.parse(buffer.toString("utf8"));
}

export class ConnectorClient {
  readonly #serverWebSocketUrl: string;
  readonly #credential: string;
  readonly #state: ConnectorStateDatabase;
  readonly #now: () => number;
  readonly #createSocket: (url: string) => WebSocket;
  readonly #reconnect: boolean;
  readonly #fetch: typeof fetch;
  readonly #httpRequestTimeoutMs: number;
  readonly #sharedMemeSync: SharedMemeSynchronizer | undefined;
  readonly #subscribers = new Set<(event: ConnectorEventEnvelope) => void>();
  readonly #generationSubscribers = new Set<(generation: ConnectorDeliveryGeneration) => void>();
  #connectionState: ConnectorLocalConnectionState = "stopped";
  #socket: WebSocket | undefined;
  #stopped = true;
  #reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #syncRequestedGeneration: ConnectorDeliveryGeneration | undefined;

  constructor(options: ConnectorClientOptions) {
    if (!Number.isSafeInteger(options.httpRequestTimeoutMs) || options.httpRequestTimeoutMs <= 0) {
      throw new TypeError("Connector HTTP timeout must be a positive integer in milliseconds");
    }
    this.#serverWebSocketUrl = validateConnectorServerWebSocketUrl(options.serverWebSocketUrl);
    this.#credential = options.credential;
    this.#state = options.state;
    this.#now = options.now ?? Date.now;
    this.#createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.#reconnect = options.reconnect ?? true;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#httpRequestTimeoutMs = options.httpRequestTimeoutMs;
    this.#sharedMemeSync = options.sharedMemeSync;
  }

  start(): void {
    if (!this.#stopped) {
      return;
    }
    this.#stopped = false;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    this.#connectionState = "stopped";
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    this.#socket?.close(1000, "connector_stopped");
    this.#socket = undefined;
  }

  getStatus() {
    return this.#state.getStatus(this.#connectionState);
  }

  getSharedMemeSyncStatus() {
    return this.#sharedMemeSync?.getStatus() ?? this.#state.getSharedMemeSyncStatus();
  }

  listEventsAfter(
    generation: ConnectorDeliveryGeneration,
    afterCursor: number,
  ): ConnectorEventEnvelope[] {
    return this.#state.listEventsAfter(generation, afterCursor);
  }

  subscribe(listener: (event: ConnectorEventEnvelope) => void): () => void {
    this.#subscribers.add(listener);
    return () => this.#subscribers.delete(listener);
  }

  subscribeGenerationChanges(
    listener: (generation: ConnectorDeliveryGeneration) => void,
  ): () => void {
    this.#generationSubscribers.add(listener);
    return () => this.#generationSubscribers.delete(listener);
  }

  async listMailbox(page: number, category?: MailboxCategory): Promise<MailboxListSuccess> {
    const url = this.#serverHttpUrl("/api/connector/mailbox");
    url.searchParams.set("page", String(page));
    if (category !== undefined) {
      url.searchParams.set("category", category);
    }
    const response = await this.#mailboxRequest(url);
    return mailboxListSuccessSchema.parse(response);
  }

  async readMailbox(letterId: string): Promise<MailboxDetailSuccess> {
    const response = await this.#mailboxRequest(
      this.#serverHttpUrl(`/api/connector/mailbox/${encodeURIComponent(letterId)}`),
    );
    return mailboxDetailSuccessSchema.parse(response);
  }

  async claimMailboxReward(letterId: string): Promise<MailboxDetailSuccess> {
    const response = await this.#mailboxRequest(
      this.#serverHttpUrl(`/api/connector/mailbox/${encodeURIComponent(letterId)}/claim`),
      "POST",
    );
    return mailboxDetailSuccessSchema.parse(response);
  }

  #serverHttpUrl(pathname: string): URL {
    const url = new URL(this.#serverWebSocketUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url;
  }

  async #mailboxRequest(url: URL, method: "GET" | "POST" = "GET"): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${this.#credential}`,
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: "{}" } : {}),
        signal: AbortSignal.timeout(this.#httpRequestTimeoutMs),
      });
    } catch {
      throw new ConnectorMailboxRequestError(
        503,
        "connector_unavailable",
        "The Doorbell server could not be reached",
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ConnectorMailboxRequestError(
        503,
        "connector_unavailable",
        "The Doorbell server returned an invalid mailbox response",
      );
    }
    if (!response.ok) {
      const parsed = mailboxErrorSchema.safeParse(body);
      if (parsed.success) {
        throw new ConnectorMailboxRequestError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
        );
      }
      throw new ConnectorMailboxRequestError(
        503,
        "connector_unavailable",
        "The Doorbell server returned an invalid mailbox error",
      );
    }
    return body;
  }

  #connect(): void {
    if (this.#stopped) {
      return;
    }
    this.#connectionState = "connecting";
    this.#syncRequestedGeneration = undefined;
    const socket = this.#createSocket(this.#serverWebSocketUrl);
    this.#socket = socket;

    socket.on("open", () => {
      const checkpoint = this.#state.getDeliveryCheckpoint();
      const hello = connectorHelloFrameSchema.parse({
        type: "hello",
        protocol_version: "2.0",
        capabilities: connectorRequiredCapabilities,
        credential: this.#credential,
        generation: checkpoint.generation,
        last_persisted_cursor: checkpoint.lastPersistedCursor,
      });
      socket.send(JSON.stringify(hello));
    });

    socket.on("message", (data) => this.#handleMessage(socket, data));
    socket.on("error", () => {
      this.#state.recordError("transport_error");
    });
    socket.on("close", (code, reason) => {
      if (this.#socket !== socket) {
        return;
      }
      this.#socket = undefined;
      if (this.#stopped) {
        this.#connectionState = "stopped";
        return;
      }
      this.#connectionState = "offline";
      if (code !== 1000) {
        this.#state.recordError(reason.toString("utf8") || `websocket_closed_${code}`);
      }
      this.#scheduleReconnect();
    });
  }

  #handleMessage(socket: WebSocket, data: RawData): void {
    let frame: unknown;
    try {
      frame = parseJson(data);
    } catch {
      this.#state.recordError("invalid_server_frame");
      socket.close(4000, "invalid_server_frame");
      return;
    }

    const ready = connectorReadyFrameSchema.safeParse(frame);
    if (ready.success) {
      if (ready.data.welcome !== connectorWelcomeMessage) {
        this.#state.recordError("invalid_welcome_message");
        socket.close(4000, "invalid_welcome_message");
        return;
      }
      if (this.#state.getDeliveryCheckpoint().generation !== ready.data.generation) {
        this.#state.recordError("delivery_generation_changed");
        socket.close(4000, "delivery_generation_changed");
        return;
      }
      this.#connectionState = "online";
      this.#reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.#state.recordConnected(this.#now());
      if (this.#syncRequestedGeneration !== ready.data.generation) {
        this.#syncRequestedGeneration = ready.data.generation;
        void this.#sharedMemeSync?.syncLatest();
      }
      return;
    }

    const generationReset = connectorGenerationResetRequiredFrameSchema.safeParse(frame);
    if (generationReset.success) {
      const reset = this.#state.resetDeliveryGeneration(generationReset.data.generation);
      socket.send(
        JSON.stringify(
          connectorGenerationResetAckFrameSchema.parse({
            type: "generation_reset_ack",
            generation: generationReset.data.generation,
          }),
        ),
      );
      if (reset.changed) {
        this.#connectionState = "resyncing";
        for (const subscriber of this.#generationSubscribers) {
          subscriber(generationReset.data.generation);
        }
        this.#syncRequestedGeneration = generationReset.data.generation;
        void this.#sharedMemeSync?.syncLatest();
      }
      return;
    }

    const heartbeat = connectorHeartbeatFrameSchema.safeParse(frame);
    if (heartbeat.success) {
      socket.send(
        JSON.stringify(
          connectorHeartbeatAckFrameSchema.parse({
            type: "heartbeat_ack",
            heartbeat_id: heartbeat.data.heartbeat_id,
          }),
        ),
      );
      return;
    }

    const eventFrame = connectorEventFrameSchema.safeParse(frame);
    if (eventFrame.success) {
      const result = this.#state.persistEvent(eventFrame.data.event, this.#now());
      if (result.status === "generation_mismatch") {
        this.#state.recordError("event_generation_mismatch");
        return;
      }
      if (result.status === "gap") {
        this.#connectionState = "resyncing";
        socket.send(
          JSON.stringify(
            connectorResyncRequestFrameSchema.parse({
              type: "resync_request",
              generation: eventFrame.data.event.generation,
              after_cursor: result.lastPersistedCursor,
              reason: "cursor_gap",
            }),
          ),
        );
        return;
      }
      socket.send(
        JSON.stringify(
          connectorAckFrameSchema.parse({
            type: "ack",
            generation: eventFrame.data.event.generation,
            event_id: eventFrame.data.event.event_id,
            cursor: eventFrame.data.event.cursor,
          }),
        ),
      );
      this.#connectionState = "online";
      if (result.status === "persisted") {
        for (const subscriber of this.#subscribers) {
          subscriber(eventFrame.data.event);
        }
        if (eventFrame.data.event.event_type === sharedMemeVersionHintEventType) {
          const hint = sharedMemeVersionHintPayloadSchema.safeParse(eventFrame.data.event.payload);
          if (hint.success) {
            void this.#sharedMemeSync?.syncLatest();
          }
        }
      }
      return;
    }

    const resync = connectorResyncRequiredFrameSchema.safeParse(frame);
    if (resync.success) {
      if (this.#state.getDeliveryCheckpoint().generation !== resync.data.generation) {
        this.#state.recordError("resync_generation_mismatch");
        return;
      }
      this.#connectionState = "resyncing";
      return;
    }

    const serverError = connectorServerErrorFrameSchema.safeParse(frame);
    if (serverError.success) {
      this.#state.recordError(serverError.data.code);
      socket.close(4000, serverError.data.code);
      return;
    }

    this.#state.recordError("invalid_server_frame");
    socket.close(4000, "invalid_server_frame");
  }

  #scheduleReconnect(): void {
    if (!this.#reconnect || this.#stopped || this.#reconnectTimer) {
      return;
    }
    const delay = this.#reconnectDelayMs;
    this.#reconnectDelayMs = Math.min(this.#reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.#connect();
    }, delay);
  }
}
