import { z } from "zod";

const nonnegative = z.int().nonnegative();
const prizeItem = z.strictObject({ id: z.string().min(1), name: z.string().min(1), quantity: z.literal(1) });
const prizeTitle = z.strictObject({ id: z.string().min(1), name: z.string().min(1) });
const statusSchema = z.strictObject({
  farm_doorplate: z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/u),
  price_gold: z.int().positive(),
  limit: z.int().positive(),
  day: z.iso.date(),
  count: nonnegative,
  remaining_today: nonnegative,
  gold: nonnegative,
  total_weight: z.int().positive(),
  prizes: z.array(z.strictObject({
    gold: nonnegative, weight: z.int().positive(), item: prizeItem.optional(), title: prizeTitle.optional(),
  })).nonempty(),
});
const responseSchema = z.strictObject({
  ok: z.literal(true),
  status: statusSchema,
  ticket: z.strictObject({ request_id: z.uuid(), cost_gold: z.int().positive(), prize_gold: nonnegative,
    prize_item: prizeItem.nullable(), prize_title: prizeTitle.nullable() }).nullable(),
  replayed: z.boolean(),
});

export type ScratchcardStatus = z.infer<typeof statusSchema>;
export type ScratchcardResponse = z.infer<typeof responseSchema>;
export interface ScratchcardBinding {
  farmDoorplate: string;
  farmHumanKey: string;
}

export type ScratchcardFailureCode = "binding_unavailable" | "quota_exceeded" | "insufficient_gold" |
  "spend_limit_exceeded" | "invalid_request" | "farm_unavailable" | "upstream_contract_unavailable";

export class ScratchcardClientError extends Error {
  constructor(readonly code: ScratchcardFailureCode) { super(code); }
}

function failureCode(payload: unknown): ScratchcardFailureCode {
  const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
  switch (error.data?.error.code) {
    case "farm_credential_not_found":
    case "farm_doorplate_mismatch":
    case "binding_unavailable": return "binding_unavailable";
    case "quota_exceeded": return "quota_exceeded";
    case "insufficient_gold": return "insufficient_gold";
    case "spend_limit_exceeded": return "spend_limit_exceeded";
    case "invalid_request": return "invalid_request";
    default: return "farm_unavailable";
  }
}

export class LoungeScratchcardClient {
  private readonly base: URL;
  constructor(private readonly options: {
    apiBaseUrl: string;
    serviceToken: string;
    requestTimeoutMs: number;
    fetchImplementation?: typeof fetch;
  }) {
    this.base = new URL(options.apiBaseUrl);
    if (!this.base.pathname.endsWith("/")) this.base.pathname += "/";
  }

  read(binding: ScratchcardBinding, requestId?: string): Promise<ScratchcardResponse> {
    return this.request("read", binding, requestId);
  }

  buy(binding: ScratchcardBinding, requestId: string, actor: "human" | "agent"): Promise<ScratchcardResponse> {
    return this.request("buy", binding, requestId, actor);
  }

  private async request(action: "read" | "buy", binding: ScratchcardBinding, requestId?: string, actor?: "human" | "agent") {
    const endpoint = new URL(`internal/doorbell/human/scratchcard/${action}`, this.base);
    let response: Response;
    try {
      response = await (this.options.fetchImplementation ?? fetch)(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          farm_human_key: binding.farmHumanKey,
          expected_farm_doorplate: binding.farmDoorplate,
          ...(requestId !== undefined ? { idempotency_key: requestId } : {}),
          ...(actor !== undefined ? { actor } : {}),
        }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch {
      throw new ScratchcardClientError("farm_unavailable");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ScratchcardClientError(failureCode(payload));
    const result = responseSchema.safeParse(payload);
    if (!result.success) throw new ScratchcardClientError("upstream_contract_unavailable");
    const { status, ticket } = result.data;
    if (status.farm_doorplate !== binding.farmDoorplate || status.count + status.remaining_today !== status.limit ||
        status.prizes.reduce((total, prize) => total + prize.weight, 0) !== status.total_weight ||
        (action === "buy" && ticket === null) || (ticket && ticket.request_id !== requestId)) {
      throw new ScratchcardClientError("upstream_contract_unavailable");
    }
    return result.data;
  }
}
