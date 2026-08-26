import {
  boundFarmNeighborhoodMessageActionErrorSchema,
  boundFarmNeighborhoodMessageActionRequestSchema,
  boundFarmNeighborhoodMessageActionSuccessSchema,
  farmNeighborhoodMessageActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundNeighborhoodMessageAction = ReturnType<
  typeof boundFarmNeighborhoodMessageActionSuccessSchema.parse
>;
export type NeighborhoodMessageActionIssueCode =
  | ReturnType<typeof boundFarmNeighborhoodMessageActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface NeighborhoodMessageActionIssue {
  code: NeighborhoodMessageActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface NeighborhoodMessageActionInput {
  idempotencyKey: string;
  expectedRevision: string;
  targetFarmDoorplate: string;
  body: string;
}

interface NeighborhoodMessageActionOptions extends NeighborhoodMessageActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): NeighborhoodMessageActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): NeighborhoodMessageActionIssue {
  const parsed = boundFarmNeighborhoodMessageActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function executeBoundNeighborhoodMessage(
  options: NeighborhoodMessageActionOptions,
): Promise<ApiResult<BoundNeighborhoodMessageAction, NeighborhoodMessageActionIssue>> {
  const body = boundFarmNeighborhoodMessageActionRequestSchema.parse({
    target_farm_doorplate: options.targetFarmDoorplate,
    body: options.body,
    expected_revision: options.expectedRevision,
  });
  const idempotencyKey = farmNeighborhoodMessageActionIdempotencyKeySchema.parse(
    options.idempotencyKey,
  );
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/neighborhood/messages", {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = boundFarmNeighborhoodMessageActionSuccessSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, issue: clientIssue("unexpected_response") };
  }

  const result = parsed.data.data.result;
  const valid =
    result.receipt_id === idempotencyKey &&
    result.target_farm_doorplate === options.targetFarmDoorplate &&
    result.message.text === options.body.trim() &&
    parsed.data.revision !== options.expectedRevision &&
    parsed.data.data.resource.messages.some((message) => message.id === result.message_id);
  return valid
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundNeighborhoodMessage = executeBoundNeighborhoodMessage;
export const executeBoundNeighborhoodMessageAction = executeBoundNeighborhoodMessage;
export const sendBoundNeighborhoodMessage = executeBoundNeighborhoodMessage;
export const sendNeighborhoodMessage = executeBoundNeighborhoodMessage;

export function neighborhoodMessageActionIssueMessage(
  issue: NeighborhoodMessageActionIssue,
): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上邻里留言板，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "邻里留言结果返回了无法识别的数据，请稍后再试。";
  }
  if (issue.code === "state_conflict") {
    return "留言板已经变化，已重新读取，请再发送一次。";
  }
  if (issue.code === "idempotency_conflict") {
    return "这次留言请求已经失效，请重新发送。";
  }
  return issue.serverMessage || "邻里留言暂时不可用，请稍后再试。";
}
