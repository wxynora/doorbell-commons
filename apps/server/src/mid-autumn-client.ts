import { z } from "zod";

const empty = z.object({}).strict();
const id = z.string().trim().min(1);
const write = { request_id: id };
export const midAutumnHumanRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("view"), args: empty }).strict(),
  z.object({ op: z.literal("memorial"), args: empty }).strict(),
  z.object({ op: z.literal("complete_collection"), args: empty, ...write }).strict(),
  z
    .object({
      op: z.literal("cook"),
      args: z
        .object({
          cake: z
            .object({
              filling: z.number().int().min(0).max(3),
              yolk: z.boolean(),
              shape: z.enum(["圆月", "花朵", "玉兔"]),
              pattern: id,
              bake: z.number().min(0).max(100),
            })
            .strict(),
          replaceCakeId: id.optional(),
        })
        .strict(),
      ...write,
    })
    .strict(),
  z
    .object({
      op: z.literal("pack"),
      args: z.object({ cakeIds: z.array(id).length(4), letter: z.string() }).strict(),
      ...write,
    })
    .strict(),
  z.object({ op: z.literal("unpack"), args: z.object({ boxId: id }).strict(), ...write }).strict(),
  z.object({ op: z.literal("send"), args: z.object({ boxId: id }).strict(), ...write }).strict(),
]);
export type MidAutumnHumanRequest = z.infer<typeof midAutumnHumanRequestSchema>;
export interface MidAutumnHumanClient {
  execute(
    input: MidAutumnHumanRequest & { farmDoorplate: string; farmHumanKey: string },
  ): Promise<{ ok: true; data: Record<string, unknown> }>;
}
export class MidAutumnUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "MidAutumnUpstreamError";
  }
}
const success = z.object({ ok: z.literal(true), data: z.record(z.string(), z.unknown()) }).strict();
const failure = z.object({ ok: z.literal(false), error: z.object({ code: id }).strict() }).strict();

export class FarmMidAutumnClient implements MidAutumnHumanClient {
  readonly #endpoint: URL;
  readonly #options: {
    requestTimeoutMs: number;
    serviceToken: string;
    fetchImplementation?: typeof fetch;
  };
  constructor(options: {
    apiBaseUrl: string;
    requestTimeoutMs: number;
    serviceToken: string;
    fetchImplementation?: typeof fetch;
  }) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)
      throw new TypeError("Invalid upstream timeout");
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/mid-autumn/human", base);
    this.#options = options;
  }
  async execute(input: MidAutumnHumanRequest & { farmDoorplate: string; farmHumanKey: string }) {
    const { farmDoorplate, farmHumanKey, ...command } = input;
    const parsed = midAutumnHumanRequestSchema.parse(command);
    let response: Response;
    try {
      response = await (this.#options.fetchImplementation ?? fetch)(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#options.serviceToken}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.#options.requestTimeoutMs),
        body: JSON.stringify({
          ...parsed,
          farm_human_key: farmHumanKey,
          expected_farm_doorplate: farmDoorplate,
        }),
      });
    } catch {
      throw new MidAutumnUpstreamError(503, "service_unavailable");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MidAutumnUpstreamError(502, "upstream_contract_unavailable");
    }
    if (response.ok) {
      const result = success.safeParse(payload);
      if (result.success) return result.data;
    } else {
      const result = failure.safeParse(payload);
      if (result.success) throw new MidAutumnUpstreamError(response.status, result.data.error.code);
    }
    throw new MidAutumnUpstreamError(502, "upstream_contract_unavailable");
  }
}

