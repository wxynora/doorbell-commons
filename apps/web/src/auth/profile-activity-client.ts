import { z } from "zod";

const profileActivitySchema = z.object({
  farmUnavailable: z.boolean().optional(),
  activities: z.array(z.object({ source: z.string(), sequence: z.number(), at: z.string().datetime({ offset: true }), label: z.string() })),
  relationships: z.array(z.object({ residentId: z.string(), name: z.string(), kind: z.enum(["chat", "game"]), count: z.number().int().nonnegative(), lastAt: z.string().datetime({ offset: true }) })),
});
export type ProfileActivityData = z.infer<typeof profileActivitySchema>;
export type ProfileActivityView = { stage: "idle" | "loading" | "error" } | { stage: "ready"; data: ProfileActivityData };

async function requestProfileActivity(
  method: "GET" | "POST",
  { signal, fetcher = fetch }: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ProfileActivityView> {
  try {
    const response = await fetcher(
      method === "GET" ? "/api/profile/activity" : "/api/profile/activity/refresh",
      {
        method,
        credentials: "same-origin",
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok) return { stage: "error" };
    const parsed = profileActivitySchema.safeParse(await response.json());
    return parsed.success ? { stage: "ready", data: parsed.data } : { stage: "error" };
  } catch {
    return { stage: "error" };
  }
}

export function getProfileActivity(
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ProfileActivityView> {
  return requestProfileActivity("GET", options);
}

export function refreshProfileActivity(
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ProfileActivityView> {
  return requestProfileActivity("POST", options);
}
