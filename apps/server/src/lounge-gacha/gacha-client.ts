import { z } from "zod";

export const LOUNGE_GACHA_REWARD_CATEGORIES = [
  "gold",
  "silver",
  "ingredient",
  "dish",
  "material",
  "sr_seed",
  "decor",
  "sp_material",
  "sp_seed",
  "ssr_seed",
] as const;

export type LoungeGachaRewardCategory =
  (typeof LOUNGE_GACHA_REWARD_CATEGORIES)[number];

export type LoungeGachaProbabilities = Record<
  LoungeGachaRewardCategory,
  number
>;

export interface LoungeGachaPity {
  limit: 100;
  misses: number;
  remaining: number;
}

export interface LoungeGachaReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface LoungeGachaDrawInput extends LoungeGachaReadInput {
  requestId: string;
}

export interface LoungeGachaStatus {
  ok: true;
  farm_doorplate: string;
  gold: number;
  silver: number;
  day: string;
  count: number;
  price_gold: 500;
  limit: 100;
  remaining_today: number;
  pity: LoungeGachaPity;
  probabilities: LoungeGachaProbabilities;
}

export interface LoungeGachaReward {
  category: LoungeGachaRewardCategory;
  id?: string;
  name?: string;
  quantity?: number;
  amount?: number;
  rarity?: string;
}

export interface LoungeGachaDrawResult extends LoungeGachaStatus {
  request_id: string;
  reward: LoungeGachaReward;
}

export interface LoungeGachaReader {
  read(input: LoungeGachaReadInput): Promise<LoungeGachaStatus>;
  draw(input: LoungeGachaDrawInput): Promise<LoungeGachaDrawResult>;
}

export class LoungeGachaInvalidRequestError extends Error {
  constructor() {
    super("The lounge gacha request is invalid");
    this.name = "LoungeGachaInvalidRequestError";
  }
}

export class LoungeGachaCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "LoungeGachaCredentialInvalidError";
  }
}

export class LoungeGachaNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "LoungeGachaNotFoundError";
  }
}

export class LoungeGachaUnavailableError extends Error {
  constructor() {
    super("The farm gacha service is unavailable");
    this.name = "LoungeGachaUnavailableError";
  }
}

export class LoungeGachaContractUnavailableError extends Error {
  constructor() {
    super("The farm gacha response could not be verified");
    this.name = "LoungeGachaContractUnavailableError";
  }
}

export class LoungeGachaQuotaExceededError extends Error {
  constructor() {
    super("The daily lounge gacha quota is exhausted");
    this.name = "LoungeGachaQuotaExceededError";
  }
}

export class LoungeGachaPrizePoolEmptyError extends Error {
  constructor() {
    super("The rare gacha prize pool is empty");
    this.name = "LoungeGachaPrizePoolEmptyError";
  }
}

export class LoungeGachaInsufficientGoldError extends Error {
  constructor() {
    super("The gold balance is insufficient");
    this.name = "LoungeGachaInsufficientGoldError";
  }
}

export class LoungeGachaIdempotencyConflictError extends Error {
  constructor() {
    super("This gacha request id was used for a different request");
    this.name = "LoungeGachaIdempotencyConflictError";
  }
}

export class LoungeGachaStateConflictError extends Error {
  constructor() {
    super("The farm state changed while drawing");
    this.name = "LoungeGachaStateConflictError";
  }
}

export interface LoungeGachaClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

const GACHA_PRICE_GOLD = 500;
const GACHA_DAILY_LIMIT = 100;
const GACHA_PITY_LIMIT = 100;
const farmDoorplateSchema = z
  .string()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/u);
const farmHumanKeySchema = z.string().min(1);
const requestIdSchema = z.uuid();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRewardCategory(value: unknown): value is LoungeGachaRewardCategory {
  return (
    typeof value === "string" &&
    (LOUNGE_GACHA_REWARD_CATEGORIES as readonly string[]).includes(value)
  );
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function parseProbabilities(
  value: unknown,
  allowEmpty: boolean,
): LoungeGachaProbabilities | null {
  if (!isObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== LOUNGE_GACHA_REWARD_CATEGORIES.length) return null;

  const probabilities = {} as LoungeGachaProbabilities;
  let total = 0;
  for (const category of LOUNGE_GACHA_REWARD_CATEGORIES) {
    const probability = value[category];
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 100
    ) {
      return null;
    }
    probabilities[category] = probability;
    total += probability;
  }
  if (Math.abs(total - 100) <= 0.01) return probabilities;
  return allowEmpty && total === 0 ? probabilities : null;
}

function parsePity(value: unknown): LoungeGachaPity | null {
  if (!isObject(value) || value.limit !== GACHA_PITY_LIMIT) return null;
  if (!safeInteger(value.misses) || value.misses >= GACHA_PITY_LIMIT) return null;
  if (!safeInteger(value.remaining) || value.remaining > GACHA_PITY_LIMIT) return null;
  if (value.remaining !== GACHA_PITY_LIMIT - value.misses) return null;
  return {
    limit: GACHA_PITY_LIMIT,
    misses: value.misses,
    remaining: value.remaining,
  };
}

function parseStatus(
  payload: unknown,
  expectedFarmDoorplate: string,
): LoungeGachaStatus | null {
  if (!isObject(payload) || payload.ok !== true) return null;
  if (payload.farm_doorplate !== expectedFarmDoorplate) return null;
  if (payload.price_gold !== GACHA_PRICE_GOLD) return null;
  if (payload.limit !== GACHA_DAILY_LIMIT) return null;
  if (typeof payload.day !== "string" || !DATE_RE.test(payload.day)) return null;
  if (!safeInteger(payload.gold) || !safeInteger(payload.silver)) return null;
  if (!safeInteger(payload.count) || payload.count > GACHA_DAILY_LIMIT) return null;
  if (
    !safeInteger(payload.remaining_today) ||
    payload.remaining_today > GACHA_DAILY_LIMIT ||
    payload.remaining_today !== GACHA_DAILY_LIMIT - payload.count
  ) {
    return null;
  }
  const pity = parsePity(payload.pity);
  if (!pity) return null;
  const probabilities = parseProbabilities(
    payload.probabilities,
    pity.remaining === 1,
  );
  if (!probabilities) return null;
  return {
    ok: true,
    farm_doorplate: expectedFarmDoorplate,
    gold: payload.gold,
    silver: payload.silver,
    day: payload.day,
    count: payload.count,
    price_gold: GACHA_PRICE_GOLD,
    limit: GACHA_DAILY_LIMIT,
    remaining_today: payload.remaining_today,
    pity,
    probabilities,
  };
}

function parseReward(value: unknown): LoungeGachaReward | null {
  if (!isObject(value) || !isRewardCategory(value.category)) return null;
  const category = value.category;
  if (category === "gold" || category === "silver") {
    if (!safeInteger(value.amount, 1)) return null;
    return { category, amount: value.amount };
  }

  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !safeInteger(value.quantity, 1)
  ) {
    return null;
  }
  return {
    category,
    id: value.id,
    name: value.name,
    quantity: value.quantity,
    ...(typeof value.rarity === "string" && value.rarity.length > 0
      ? { rarity: value.rarity }
      : {}),
  };
}

function normalizeReadInput(input: LoungeGachaReadInput): LoungeGachaReadInput {
  try {
    return {
      farmDoorplate: farmDoorplateSchema.parse(input.farmDoorplate),
      farmHumanKey: farmHumanKeySchema.parse(input.farmHumanKey),
    };
  } catch {
    throw new LoungeGachaInvalidRequestError();
  }
}

function normalizeDrawInput(input: LoungeGachaDrawInput): LoungeGachaDrawInput {
  const normalized = normalizeReadInput(input);
  try {
    return { ...normalized, requestId: requestIdSchema.parse(input.requestId) };
  } catch {
    throw new LoungeGachaInvalidRequestError();
  }
}

function remoteErrorCode(payload: unknown): string | null {
  if (!isObject(payload) || !isObject(payload.error)) return null;
  return typeof payload.error.code === "string" ? payload.error.code : null;
}

export class LoungeGachaClient implements LoungeGachaReader {
  readonly #readEndpoint: URL;
  readonly #drawEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: LoungeGachaClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Lounge gacha API timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#readEndpoint = new URL("internal/doorbell/human/gacha/read", apiBaseUrl);
    this.#drawEndpoint = new URL("internal/doorbell/human/gacha/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async read(input: LoungeGachaReadInput): Promise<LoungeGachaStatus> {
    const normalized = normalizeReadInput(input);
    const payload = await this.#request(this.#readEndpoint, {
      farm_human_key: normalized.farmHumanKey,
      expected_farm_doorplate: normalized.farmDoorplate,
    });
    const status = parseStatus(payload, normalized.farmDoorplate);
    if (!status) throw new LoungeGachaContractUnavailableError();
    return status;
  }

  async draw(input: LoungeGachaDrawInput): Promise<LoungeGachaDrawResult> {
    const normalized = normalizeDrawInput(input);
    const payload = await this.#request(this.#drawEndpoint, {
      farm_human_key: normalized.farmHumanKey,
      expected_farm_doorplate: normalized.farmDoorplate,
      idempotency_key: normalized.requestId,
    });
    const status = parseStatus(payload, normalized.farmDoorplate);
    if (!status || !isObject(payload) || payload.request_id !== normalized.requestId) {
      throw new LoungeGachaContractUnavailableError();
    }
    const reward = parseReward(payload.reward);
    if (!reward) throw new LoungeGachaContractUnavailableError();
    return { ...status, request_id: normalized.requestId, reward };
  }

  async #request(endpoint: URL, body: Record<string, string>): Promise<unknown> {
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
      throw new LoungeGachaUnavailableError();
    }

    if (response.status === 502) throw new LoungeGachaContractUnavailableError();
    if (response.status >= 500) throw new LoungeGachaUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LoungeGachaContractUnavailableError();
    }
    if (response.ok) return payload;
    this.#throwRemoteError(response.status, payload);
  }

  #throwRemoteError(status: number, payload: unknown): never {
    switch (remoteErrorCode(payload)) {
      case "farm_credential_invalid":
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new LoungeGachaCredentialInvalidError();
      case "farm_not_found":
        throw new LoungeGachaNotFoundError();
      case "farm_unavailable":
        throw new LoungeGachaUnavailableError();
      case "upstream_contract_unavailable":
        throw new LoungeGachaContractUnavailableError();
      case "quota_exceeded":
        throw new LoungeGachaQuotaExceededError();
      case "prize_pool_empty":
        throw new LoungeGachaPrizePoolEmptyError();
      case "insufficient_gold":
        throw new LoungeGachaInsufficientGoldError();
      case "idempotency_conflict":
        throw new LoungeGachaIdempotencyConflictError();
      case "state_conflict":
        throw new LoungeGachaStateConflictError();
      case "invalid_request":
        throw new LoungeGachaInvalidRequestError();
      default:
        throw status >= 500
          ? new LoungeGachaUnavailableError()
          : new LoungeGachaContractUnavailableError();
    }
  }
}

export { LoungeGachaClient as FarmHumanGachaClient };
export type FarmHumanGachaReader = LoungeGachaReader;
