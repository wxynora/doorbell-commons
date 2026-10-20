import type {
  SnowRegistrationPayment,
  SnowRegistrationReceipt,
  SnowReward,
  SnowRewardPort,
  SnowRewardReceipt,
} from "./contracts.js";
import { RegistrationBalanceInsufficientError } from "./registration.js";

export class TogetherRewardClient implements SnowRewardPort {
  readonly #endpoint: URL;
  constructor(
    private readonly options: {
      apiBaseUrl: string;
      serviceToken: string;
      requestTimeoutMs: number;
      fetchImplementation?: typeof fetch;
    },
  ) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/together/reward", base);
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)
      throw new Error("invalid_upstream_timeout");
  }
  async grant(input: SnowReward): Promise<SnowRewardReceipt> {
    const response = await (this.options.fetchImplementation ?? fetch)(this.#endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.serviceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_id: input.grantId,
        resident_id: input.residentId,
        gold: input.gold,
        silver: input.silver,
      }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const raw: unknown = await response.json();
    if (!response.ok || !raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("together_reward_unavailable");
    const value = raw as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(",") !== "gold,grant_id,journal_ids,ok,resident_id,silver" ||
      value.ok !== true ||
      value.grant_id !== input.grantId ||
      value.resident_id !== input.residentId ||
      value.gold !== input.gold ||
      value.silver !== input.silver ||
      !Array.isArray(value.journal_ids) ||
      value.journal_ids.length !== Number(input.gold > 0) + Number(input.silver > 0) ||
      value.journal_ids.some((id) => typeof id !== "string" || !id) ||
      new Set(value.journal_ids).size !== value.journal_ids.length
    )
      throw new Error("together_reward_receipt_invalid");
    return {
      grantId: input.grantId,
      residentId: input.residentId,
      gold: input.gold,
      silver: input.silver,
      journalIds: value.journal_ids as string[],
    };
  }
  async chargeRegistration(input: SnowRegistrationPayment): Promise<SnowRegistrationReceipt> {
    const endpoint = new URL("registration", this.#endpoint);
    const response = await (this.options.fetchImplementation ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.serviceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        payment_id: input.paymentId,
        resident_id: input.residentId,
        gold: input.gold,
      }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const raw: unknown = await response.json();
    if (
      response.status === 409 &&
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.keys(raw).join() === "error"
    ) {
      const error = (raw as { error: unknown }).error;
      if (
        error &&
        typeof error === "object" &&
        !Array.isArray(error) &&
        Object.keys(error).join() === "code" &&
        (error as { code: unknown }).code === "registration_balance_insufficient"
      )
        throw new RegistrationBalanceInsufficientError();
    }
    if (!response.ok || !raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("registration_payment_unconfirmed");
    const value = raw as Record<string, unknown>;
    if (
      Object.keys(value).sort().join() !== "gold,journal_id,ok,payment_id,resident_id" ||
      value.ok !== true ||
      value.payment_id !== input.paymentId ||
      value.resident_id !== input.residentId ||
      value.gold !== input.gold ||
      typeof value.journal_id !== "string" ||
      !value.journal_id
    )
      throw new Error("registration_receipt_invalid");
    return {
      paymentId: input.paymentId,
      residentId: input.residentId,
      gold: input.gold,
      journalId: value.journal_id,
    };
  }
}
