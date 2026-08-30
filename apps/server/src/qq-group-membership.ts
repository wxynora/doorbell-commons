export interface QqGroupMembershipReader {
  isCurrentMember(
    groupId: string,
    qqNumber: string,
    options?: QqGroupMembershipCheckOptions,
  ): Promise<boolean>;
}

export interface QqGroupMembershipCheckOptions {
  allowPersistedSnapshot?: boolean;
}

export interface QqGroupMemberSnapshotStore {
  replaceQqGroupMemberSnapshot(
    groupId: string,
    memberIds: readonly string[],
    capturedAt: number,
  ): void;
  getQqGroupMemberSnapshot(
    groupId: string,
  ): { groupId: string; memberIds: string[]; capturedAt: number } | undefined;
}

export class OneBotUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OneBotUnavailableError";
  }
}

interface OneBotGroupMembershipClientOptions {
  apiBaseUrl: string;
  apiToken: string;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  requestTimeoutMs: number;
  snapshotStore: QqGroupMemberSnapshotStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildActionUrl(apiBaseUrl: string, action: string): URL {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(action, normalizedBaseUrl);
}

export class OneBotGroupMembershipClient implements QqGroupMembershipReader {
  readonly #apiBaseUrl: string;
  readonly #apiToken: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #requestTimeoutMs: number;
  readonly #snapshotStore: QqGroupMemberSnapshotStore;

  constructor(options: OneBotGroupMembershipClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("OneBot request timeout must be a positive integer in milliseconds");
    }
    this.#apiBaseUrl = options.apiBaseUrl;
    this.#apiToken = options.apiToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#snapshotStore = options.snapshotStore;
  }

  async isCurrentMember(
    groupId: string,
    qqNumber: string,
    options: QqGroupMembershipCheckOptions = {},
  ): Promise<boolean> {
    let memberIds: string[];
    try {
      memberIds = await this.#readCurrentMemberIds(groupId);
    } catch (error) {
      if (options.allowPersistedSnapshot === false) throw error;
      let snapshot: ReturnType<QqGroupMemberSnapshotStore["getQqGroupMemberSnapshot"]>;
      try {
        snapshot = this.#snapshotStore.getQqGroupMemberSnapshot(groupId);
      } catch (snapshotError) {
        throw new OneBotUnavailableError("Persisted QQ group member snapshot could not be read", {
          cause: snapshotError,
        });
      }
      if (snapshot) return snapshot.memberIds.includes(qqNumber);
      throw error;
    }

    try {
      this.#snapshotStore.replaceQqGroupMemberSnapshot(groupId, memberIds, this.#now());
    } catch (error) {
      throw new OneBotUnavailableError("Current QQ group member snapshot could not be persisted", {
        cause: error,
      });
    }
    return memberIds.includes(qqNumber);
  }

  async #readCurrentMemberIds(groupId: string): Promise<string[]> {
    let response: Response;

    try {
      response = await this.#fetch(buildActionUrl(this.#apiBaseUrl, "get_group_member_list"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          group_id: groupId,
          no_cache: true,
        }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch (error) {
      throw new OneBotUnavailableError("OneBot request failed", { cause: error });
    }

    if (!response.ok) {
      throw new OneBotUnavailableError("OneBot returned a non-success HTTP status");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new OneBotUnavailableError("OneBot returned invalid JSON", { cause: error });
    }

    if (
      !isRecord(payload) ||
      payload.status !== "ok" ||
      payload.retcode !== 0 ||
      !Array.isArray(payload.data)
    ) {
      throw new OneBotUnavailableError("OneBot returned an unsuccessful member-list result");
    }

    const memberIds = payload.data.map((member) => {
      if (
        !isRecord(member) ||
        (typeof member.user_id !== "number" && typeof member.user_id !== "string")
      ) {
        throw new OneBotUnavailableError("OneBot returned malformed member data");
      }
      return String(member.user_id);
    });

    if (memberIds.length === 0) {
      throw new OneBotUnavailableError(
        "OneBot returned an empty member list for the community group",
      );
    }

    return memberIds;
  }
}
