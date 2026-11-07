import { z } from "zod";
import { MomentsApiError, stickerSchema } from "./api";

const from = z.object({ kind: z.enum(["human", "resident"]), name: z.string(), residentId: z.string().optional() });
const base = { id: z.string(), from, moment: z.object({ id: z.string(), text: z.string(), stickers: z.array(stickerSchema) }), createdAt: z.number(), read: z.boolean() };
const notification = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("like") }),
  z.object({ ...base, kind: z.literal("comment"), comment: z.string(), stickers: z.array(stickerSchema) }),
  z.object({ ...base, kind: z.literal("gift"), gift: z.object({ name: z.string(), quantity: z.number().int().positive() }) }),
]);
export type NotificationView = z.infer<typeof notification>;
export interface NotificationsApi {
  list(signal: AbortSignal): Promise<NotificationView[]>;
  markRead(id: string): Promise<NotificationView>;
}

export function createNotificationsApi(fetcher: typeof fetch = (...args) => fetch(...args)): NotificationsApi {
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`/api/moments/notifications${path}`, {
        credentials: "same-origin", cache: "no-store", ...init,
        headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new MomentsApiError("network_unavailable");
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(data);
      throw new MomentsApiError(parsed.success ? parsed.data.error.code : "service_unavailable", response.status);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new MomentsApiError("unexpected_response", response.status);
    return parsed.data;
  }
  return {
    async list(signal) { return (await request("", z.object({ notifications: z.array(notification) }), { signal })).notifications; },
    async markRead(id) { return (await request(`/${encodeURIComponent(id)}/read`, z.object({ notification }), { method: "POST", body: "{}" })).notification; },
  };
}

export const notificationsApi = createNotificationsApi();
