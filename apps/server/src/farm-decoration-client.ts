import {
  boundFarmDecorationsReadSuccessSchema, boundFarmDecorationLayoutSaveSuccessSchema,
  boundFarmDecorationLayoutSaveRequestSchema, boundFarmDecorationLayoutSaveErrorSchema,
  type BoundFarmDecorationLayoutSaveRequest, type BoundFarmDecorationLayoutSaveError,
} from "@doorbell/protocol";
import type { z } from "zod";

type Binding = { farmDoorplate: string; farmHumanKey: string };
type Failure = BoundFarmDecorationLayoutSaveError["error"];
export class FarmDecorationError extends Error {
  constructor(readonly status: number, readonly detail: Failure) { super(detail.message); }
}
export class FarmDecorationClient {
  constructor(private readonly options: {
    apiBaseUrl: string; requestTimeoutMs: number; serviceToken: string; fetchImplementation?: typeof fetch;
  }) {}
  read(input: Binding) {
    return this.request("read", input, {}, boundFarmDecorationsReadSuccessSchema);
  }
  save(input: Binding, body: BoundFarmDecorationLayoutSaveRequest) {
    return this.request("save", input, boundFarmDecorationLayoutSaveRequestSchema.parse(body), boundFarmDecorationLayoutSaveSuccessSchema);
  }
  private async request<T>(action: string, binding: Binding, body: object, schema: z.ZodType<T>): Promise<T> {
    const base = new URL(this.options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    let response: Response;
    try {
      response = await (this.options.fetchImplementation ?? fetch)(new URL(`internal/doorbell/human/farm-decorations/${action}`, base), {
        method: "POST", headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({ farm_human_key: binding.farmHumanKey, expected_farm_doorplate: binding.farmDoorplate, ...body }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch { throw new FarmDecorationError(503, { code: "farm_unavailable", message: "农场暂时无法连接。" }); }
    if (response.status >= 500) throw new FarmDecorationError(response.status === 502 ? 502 : 503, {
      code: response.status === 502 ? "upstream_contract_unavailable" : "farm_unavailable", message: "农场装饰暂时不可用。",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const result = schema.safeParse(payload);
      if (result.success) return result.data;
    } else {
      const result = boundFarmDecorationLayoutSaveErrorSchema.safeParse(payload);
      if (result.success) {
        const detail = result.data.error;
        if (["farm_credential_not_found", "farm_doorplate_mismatch", "farm_credential_invalid"].includes(detail.code))
          throw new FarmDecorationError(409, { code: "farm_credential_invalid", message: "农场绑定已失效。" });
        if (detail.code !== "authentication_required" && detail.code !== "invalid_request")
          throw new FarmDecorationError(response.status, detail);
      }
    }
    throw new FarmDecorationError(502, { code: "upstream_contract_unavailable", message: "无法核对农场装饰数据。" });
  }
}
