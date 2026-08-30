export interface QqGroupMembershipReader {
  isCurrentMember(groupId: string, qqNumber: string): Promise<boolean>;
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
  requestTimeoutMs: number;
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
  readonly #requestTimeoutMs: number;

  constructor(options: OneBotGroupMembershipClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("OneBot request timeout must be a positive integer in milliseconds");
    }
    this.#apiBaseUrl = options.apiBaseUrl;
    this.#apiToken = options.apiToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async isCurrentMember(groupId: string, qqNumber: string): Promise<boolean> {
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
      throw new OneBotUnavailableError("OneBot returned an empty member list for the community group");
    }

    return memberIds.includes(qqNumber);
  }
}
