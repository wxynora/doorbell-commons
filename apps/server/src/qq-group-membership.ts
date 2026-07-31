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

  constructor(options: OneBotGroupMembershipClientOptions) {
    this.#apiBaseUrl = options.apiBaseUrl;
    this.#apiToken = options.apiToken;
    this.#fetch = options.fetchImplementation ?? fetch;
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

    for (const member of payload.data) {
      if (
        !isRecord(member) ||
        (typeof member.user_id !== "number" && typeof member.user_id !== "string")
      ) {
        throw new OneBotUnavailableError("OneBot returned malformed member data");
      }

      if (String(member.user_id) === qqNumber) {
        return true;
      }
    }

    return false;
  }
}
