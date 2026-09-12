import type { GameEconomyPort } from "./game-economy.js";

type BalancesInput = Parameters<GameEconomyPort["balances"]>[0];
type BalancesResult = Awaited<ReturnType<GameEconomyPort["balances"]>>;
type SettlementInput = Parameters<GameEconomyPort["settle"]>[0];
type SettlementResult = Awaited<ReturnType<GameEconomyPort["settle"]>>;

export interface GameEconomyClientOptions {
  apiBaseUrl: string;
  serviceToken: string;
  requestTimeoutMs: number;
  fetchImplementation?: typeof fetch;
}

export class GameEconomyUnavailableError extends Error {
  constructor(message = "The game economy service is unavailable") {
    super(message);
    this.name = "GameEconomyUnavailableError";
  }
}

export class GameEconomyContractUnavailableError extends Error {
  constructor(message = "The game economy response could not be verified") {
    super(message);
    this.name = "GameEconomyContractUnavailableError";
  }
}

export class GameEconomyRejectedError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "GameEconomyRejectedError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function errorFromPayload(payload: unknown, status: number): GameEconomyRejectedError | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const code = payload.error.code;
  const message = payload.error.message;
  if (!isNonEmptyString(code) || !isNonEmptyString(message)) return null;
  return new GameEconomyRejectedError(code, message, status);
}

function requireAccounts(payload: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.accounts)) {
    throw new GameEconomyContractUnavailableError(
      "The game economy response does not contain an account list",
    );
  }
  if (!payload.accounts.every(isRecord)) {
    throw new GameEconomyContractUnavailableError("The game economy account list is invalid");
  }
  return payload.accounts;
}

function assertRequestedAccountIds(
  accounts: readonly Record<string, unknown>[],
  residentIds: readonly string[],
): void {
  if (accounts.length !== residentIds.length) {
    throw new GameEconomyContractUnavailableError(
      "The game economy account list does not match the request",
    );
  }
  const requested = new Set(residentIds);
  const returned = new Set<string>();
  for (const account of accounts) {
    if (!isNonEmptyString(account.resident_id) || returned.has(account.resident_id)) {
      throw new GameEconomyContractUnavailableError(
        "The game economy account list contains an invalid resident",
      );
    }
    returned.add(account.resident_id);
  }
  if (requested.size !== returned.size || [...requested].some((id) => !returned.has(id))) {
    throw new GameEconomyContractUnavailableError(
      "The game economy account list does not match the request",
    );
  }
}

function parseBalances(payload: unknown, residentIds: readonly string[]): BalancesResult {
  const accounts = requireAccounts(payload);
  assertRequestedAccountIds(accounts, residentIds);
  return accounts.map((account) => {
    if (!isSafeInteger(account.balance) || account.balance < 0) {
      throw new GameEconomyContractUnavailableError("The game economy balance is invalid");
    }
    return {
      residentId: account.resident_id as string,
      balance: account.balance,
    };
  }) as BalancesResult;
}

function parseSettlement(payload: unknown, input: SettlementInput): SettlementResult {
  if (!isRecord(payload) || payload.ok !== true || !isNonEmptyString(payload.settlement_id)) {
    throw new GameEconomyContractUnavailableError(
      "The game economy settlement response is invalid",
    );
  }
  if (payload.settlement_id !== input.settlementId) {
    throw new GameEconomyContractUnavailableError(
      "The game economy settlement ID does not match the request",
    );
  }
  const accounts = requireAccounts(payload);
  const residentIds = input.deltas.map((delta) => delta.residentId);
  assertRequestedAccountIds(accounts, residentIds);
  const expected = new Map(input.deltas.map((delta) => [delta.residentId, delta.delta]));
  return {
    settlementId: payload.settlement_id,
    accounts: accounts.map((account) => {
      const residentId = account.resident_id as string;
      if (
        !isSafeInteger(account.expected_delta) ||
        !isSafeInteger(account.actual_delta) ||
        account.balance === undefined ||
        !isSafeInteger(account.balance) ||
        account.balance < 0 ||
        account.expected_delta !== expected.get(residentId) ||
        (account.expected_delta >= 0
          ? account.actual_delta !== account.expected_delta
          : account.actual_delta < account.expected_delta || account.actual_delta > 0)
      ) {
        throw new GameEconomyContractUnavailableError(
          "The game economy settlement account is invalid",
        );
      }
      return {
        residentId,
        expectedDelta: account.expected_delta,
        actualDelta: account.actual_delta,
        balance: account.balance,
      };
    }),
  } as SettlementResult;
}

export class GameEconomyClient implements GameEconomyPort {
  readonly #balancesEndpoint: URL;
  readonly #settleEndpoint: URL;
  readonly #serviceToken: string;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: GameEconomyClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Game economy timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#balancesEndpoint = new URL("internal/doorbell/game-economy/balances", apiBaseUrl);
    this.#settleEndpoint = new URL("internal/doorbell/game-economy/settle", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async balances(residentIds: BalancesInput): Promise<BalancesResult> {
    const payload = await this.post(this.#balancesEndpoint, {
      resident_ids: [...residentIds],
    });
    return parseBalances(payload, residentIds);
  }

  async settle(input: SettlementInput): Promise<SettlementResult> {
    const payload = await this.post(this.#settleEndpoint, {
      settlement_id: input.settlementId,
      deltas: input.deltas.map((delta) => ({
        resident_id: delta.residentId,
        delta: delta.delta,
      })),
    });
    return parseSettlement(payload, input);
  }

  private async post(endpoint: URL, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new GameEconomyUnavailableError("The game economy service could not be reached");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new GameEconomyUnavailableError();
      }
      throw new GameEconomyContractUnavailableError(
        "The game economy service returned invalid JSON",
      );
    }

    if (!response.ok) {
      if (response.status >= 500) throw new GameEconomyUnavailableError();
      const error = errorFromPayload(payload, response.status);
      if (!error) {
        throw new GameEconomyContractUnavailableError(
          "The game economy service returned an invalid error",
        );
      }
      throw error;
    }
    return payload;
  }
}
