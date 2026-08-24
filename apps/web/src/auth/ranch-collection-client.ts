import {
  type BoundFarmRanchCollectionSuccess,
  boundFarmRanchCollectionErrorSchema,
  boundFarmRanchCollectionRequestSchema,
  boundFarmRanchCollectionSuccessSchema,
  farmHumanRanchCollectionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundRanchCollection = BoundFarmRanchCollectionSuccess;
export type RanchCollectionIssueCode =
  | ReturnType<typeof boundFarmRanchCollectionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface RanchCollectionIssue {
  code: RanchCollectionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface RanchCollectionInput {
  idempotencyKey: string;
  expectedRevision: string;
}

interface RanchCollectionOptions extends RanchCollectionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): RanchCollectionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): RanchCollectionIssue {
  const parsed = boundFarmRanchCollectionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function collectBoundRanch(
  options: RanchCollectionOptions,
): Promise<ApiResult<BoundRanchCollection, RanchCollectionIssue>> {
  boundFarmRanchCollectionRequestSchema.parse({});
  const idempotencyKey = farmHumanRanchCollectionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/ranch/collect", {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "if-match": `"${options.expectedRevision}"`,
      },
      body: JSON.stringify({}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = boundFarmRanchCollectionSuccessSchema.safeParse(payload);
  return parsed.success && parsed.data.data.result.receipt_id === idempotencyKey
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const collectRanch = collectBoundRanch;
export const collectBoundRanchProduce = collectBoundRanch;

export function ranchCollectionIssueMessage(issue: RanchCollectionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上牧场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "牧场收取结果返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "牧场收取暂时不可用，请稍后再试。";
}
