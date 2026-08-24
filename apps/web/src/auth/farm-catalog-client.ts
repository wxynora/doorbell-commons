import {
  boundFarmCatalogReadErrorSchema,
  boundFarmCatalogReadSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundFarmCatalogRead = ReturnType<typeof boundFarmCatalogReadSuccessSchema.parse>;
export type FarmCatalogIssueCode =
  | ReturnType<typeof boundFarmCatalogReadErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmCatalogIssue {
  code: FarmCatalogIssueCode;
  serverMessage: string | null;
}

interface FarmCatalogReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): FarmCatalogIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseFarmCatalogIssue(payload: unknown): FarmCatalogIssue {
  const parsed = boundFarmCatalogReadErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

export async function getBoundFarmCatalog(
  options: FarmCatalogReadOptions = {},
): Promise<ApiResult<BoundFarmCatalogRead, FarmCatalogIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/catalog", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseFarmCatalogIssue(payload) };
  }

  const parsed = boundFarmCatalogReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const getFarmCatalog = getBoundFarmCatalog;
export const getCatalog = getBoundFarmCatalog;

export function farmCatalogIssueMessage(issue: FarmCatalogIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场目录，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "农场目录返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "农场目录暂时不可用，请稍后再试。";
}
