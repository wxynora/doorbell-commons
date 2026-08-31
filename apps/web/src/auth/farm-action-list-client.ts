import {
  type FarmActionListCreateRequest,
  type FarmActionListUpdateRequest,
  farmActionListCreateRequestSchema,
  farmActionListErrorSchema,
  farmActionListIdempotencyKeySchema,
  farmActionListMutationSuccessSchema,
  farmActionListNotifySuccessSchema,
  farmActionListOptionsSuccessSchema,
  farmActionListReadSuccessSchema,
  farmActionListUpdateRequestSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type FarmActionListIssueCode =
  | ReturnType<typeof farmActionListErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmActionListIssue {
  code: FarmActionListIssueCode;
  currentRevision: number | null;
  serverMessage: string | null;
}

function issue(code: FarmActionListIssueCode): FarmActionListIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseIssue(value: unknown): FarmActionListIssue {
  const parsed = farmActionListErrorSchema.safeParse(value);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : issue("unexpected_response");
}

export async function getFarmActionList(options?: { fetcher?: FrontendFetcher }) {
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher("/api/farm/action-list", {
      credentials: "same-origin",
      method: "GET",
    });
    const value = await readPayload(response);
    if (!response.ok) return { ok: false, issue: parseIssue(value) } as const;
    const parsed = farmActionListReadSuccessSchema.safeParse(value);
    return parsed.success
      ? ({ ok: true, data: parsed.data } as const)
      : ({ ok: false, issue: issue("unexpected_response") } as const);
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export async function getFarmActionListOptions(options?: { fetcher?: FrontendFetcher }) {
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher("/api/farm/action-list/options", {
      credentials: "same-origin",
      method: "GET",
    });
    const value = await readPayload(response);
    if (!response.ok) return { ok: false, issue: parseIssue(value) } as const;
    const parsed = farmActionListOptionsSuccessSchema.safeParse(value);
    return parsed.success
      ? ({ ok: true, data: parsed.data } as const)
      : ({ ok: false, issue: issue("unexpected_response") } as const);
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export async function createFarmActionList(
  input: FarmActionListCreateRequest,
  options?: { fetcher?: FrontendFetcher },
) {
  const parsedBody = farmActionListCreateRequestSchema.safeParse(input);
  if (!parsedBody.success) return { ok: false, issue: issue("invalid_request") } as const;
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher("/api/farm/action-list", {
      credentials: "same-origin",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedBody.data),
    });
    const value = await readPayload(response);
    if (!response.ok) return { ok: false, issue: parseIssue(value) } as const;
    const parsed = farmActionListMutationSuccessSchema.safeParse(value);
    return parsed.success
      ? ({ ok: true, data: parsed.data } as const)
      : ({ ok: false, issue: issue("unexpected_response") } as const);
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export async function updateFarmActionList(
  listId: string,
  input: FarmActionListUpdateRequest,
  options?: { fetcher?: FrontendFetcher },
) {
  const parsedBody = farmActionListUpdateRequestSchema.safeParse(input);
  if (!parsedBody.success) {
    return { ok: false, issue: issue("invalid_request") } as const;
  }
  const body = parsedBody.data;
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/farm/action-list/${encodeURIComponent(listId)}`, {
      credentials: "same-origin",
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await readPayload(response);
    if (!response.ok) return { ok: false, issue: parseIssue(value) } as const;
    const parsed = farmActionListMutationSuccessSchema.safeParse(value);
    return parsed.success
      ? ({ ok: true, data: parsed.data } as const)
      : ({ ok: false, issue: issue("unexpected_response") } as const);
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export async function notifyFarmActionList(
  listId: string,
  idempotencyKey: string,
  options?: { fetcher?: FrontendFetcher },
) {
  const parsedKey = farmActionListIdempotencyKeySchema.safeParse(idempotencyKey);
  if (!parsedKey.success) {
    return { ok: false, issue: issue("invalid_request") } as const;
  }
  const key = parsedKey.data;
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/farm/action-list/${encodeURIComponent(listId)}/notify`, {
      credentials: "same-origin",
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: "{}",
    });
    const value = await readPayload(response);
    if (!response.ok) return { ok: false, issue: parseIssue(value) } as const;
    const parsed = farmActionListNotifySuccessSchema.safeParse(value);
    return parsed.success
      ? ({ ok: true, data: parsed.data } as const)
      : ({ ok: false, issue: issue("unexpected_response") } as const);
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export async function deleteFarmActionList(
  listId: string,
  expectedRevision: number,
  options?: { fetcher?: FrontendFetcher },
) {
  const fetcher = options?.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/farm/action-list/${encodeURIComponent(listId)}`, {
      credentials: "same-origin",
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected_revision: expectedRevision }),
    });
    if (response.ok) return { ok: true } as const;
    return { ok: false, issue: parseIssue(await readPayload(response)) } as const;
  } catch {
    return { ok: false, issue: issue("network_unavailable") } as const;
  }
}

export function farmActionListIssueMessage(value: FarmActionListIssue): string {
  if (value.code === "revision_conflict") return "清单已经变化，请重新读取后再保存。";
  if (value.code === "unsupported_item") return "清单里有当前尚未开放的行动。";
  if (value.code === "authority_unavailable") return "暂时无法核对行动状态。";
  if (value.code === "notification_unavailable") return "清单已保存，但暂时无法发铃。";
  if (value.code === "network_unavailable") return "现在连不上 Doorbell，请稍后再试。";
  if (value.code === "invalid_request") return "清单里还有没填完整的内容。";
  return "暂时无法处理行动清单，请稍后再试。";
}

export type FarmActionListReadResult = Awaited<ReturnType<typeof getFarmActionList>>;
export type FarmActionListMutationResult = ApiResult<
  ReturnType<typeof farmActionListMutationSuccessSchema.parse>,
  FarmActionListIssue
>;
