import {
  type BoundFarmShopOpenSuccess,
  boundFarmCatalogReadErrorSchema,
  boundFarmCatalogReadSuccessSchema,
  boundFarmShopOpenErrorSchema,
  boundFarmShopOpenRequestSchema,
  boundFarmShopOpenSuccessSchema,
  farmShopOpenIdempotencyKeySchema,
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

export type BoundFarmShopOpen = BoundFarmShopOpenSuccess;
export type FarmShopOpenIssueCode =
  | ReturnType<typeof boundFarmShopOpenErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmShopOpenIssue {
  code: FarmShopOpenIssueCode;
  currentShopRevision: string | null;
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

export async function openBoundFarmShop(options: {
  expectedShopRevision: string | null;
  fetcher?: FrontendFetcher;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<ApiResult<BoundFarmShopOpen, FarmShopOpenIssue>> {
  const body = boundFarmShopOpenRequestSchema.parse({
    expected_shop_revision: options.expectedShopRevision,
  });
  const idempotencyKey = farmShopOpenIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/shop/openings", {
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
    return {
      ok: false,
      issue: { code: "network_unavailable", currentShopRevision: null, serverMessage: null },
    };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const parsed = boundFarmShopOpenErrorSchema.safeParse(payload);
    return parsed.success
      ? {
          ok: false,
          issue: {
            code: parsed.data.error.code,
            currentShopRevision: parsed.data.error.current_shop_revision ?? null,
            serverMessage: parsed.data.error.message,
          },
        }
      : {
          ok: false,
          issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
        };
  }

  const parsed = boundFarmShopOpenSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.shop_revision === parsed.data.data.resource.revision
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
      };
}

export function farmShopOpenIssueMessage(issue: FarmShopOpenIssue): string {
  if (issue.code === "network_unavailable") return "现在连不上农场商店，请稍后重试。";
  if (issue.code === "unexpected_response") {
    return "农场商店刷新结果无法识别，请稍后重试。";
  }
  return issue.serverMessage || "农场商店暂时无法刷新，请稍后重试。";
}

export function replaceFarmCatalogShop(
  catalog: BoundFarmCatalogRead,
  opened: BoundFarmShopOpen,
): BoundFarmCatalogRead {
  return {
    ...catalog,
    data: { ...catalog.data, shop: opened.data.resource },
    server_time: opened.server_time,
  };
}

export function farmCatalogIssueMessage(issue: FarmCatalogIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场目录，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "农场目录返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "农场目录暂时不可用，请稍后再试。";
}
