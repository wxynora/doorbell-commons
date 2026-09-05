import {
  lingyeNpcReadSuccessSchema, lingyeNpcInteractSuccessSchema,
  lingyeNpcInteractRequestSchema, lingyeNpcErrorSchema,
  type LingyeNpcInteractRequest,
} from "@doorbell/protocol";

type Parser<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
export type NpcClientResult<T> = { ok: true; data: T } | { ok: false; code: string };

export function createNpcClient(fetcher: typeof fetch = fetch) {
  async function request<T>(url: string, schema: Parser<T>, body?: LingyeNpcInteractRequest): Promise<NpcClientResult<T>> {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: body ? "POST" : "GET", credentials: "same-origin",
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    } catch { return { ok: false, code: "network_unavailable" }; }
    let payload: unknown;
    try { payload = await response.json(); } catch { return { ok: false, code: "unexpected_response" }; }
    if (!response.ok) {
      const parsed = lingyeNpcErrorSchema.safeParse(payload);
      return { ok: false, code: parsed.success ? parsed.data.error.code : "unexpected_response" };
    }
    const parsed = schema.safeParse(payload);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "unexpected_response" };
  }
  return {
    read: () => request("/api/lingye/npcs", lingyeNpcReadSuccessSchema),
    interact: (input: LingyeNpcInteractRequest) => request("/api/lingye/npcs/interact", lingyeNpcInteractSuccessSchema, lingyeNpcInteractRequestSchema.parse(input)),
  };
}
