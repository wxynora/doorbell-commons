import {
  type BoundFarmKitchenReadSuccess,
  boundFarmKitchenReadErrorSchema,
  boundFarmKitchenReadSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundKitchenRead = BoundFarmKitchenReadSuccess;
export type KitchenIssueCode =
  | ReturnType<typeof boundFarmKitchenReadErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenIssue {
  code: KitchenIssueCode;
  serverMessage: string | null;
}

interface KitchenReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): KitchenIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenIssue {
  const parsed = boundFarmKitchenReadErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

export async function getBoundKitchen(
  options: KitchenReadOptions = {},
): Promise<ApiResult<BoundKitchenRead, KitchenIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = boundFarmKitchenReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const getBoundFarmKitchen = getBoundKitchen;
export const getFarmKitchen = getBoundKitchen;

export function kitchenIssueMessage(issue: KitchenIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理台，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "料理台数据返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "料理台暂时不可用，请稍后再试。";
}
