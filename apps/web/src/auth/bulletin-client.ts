import {
  boundFarmBulletinAckErrorSchema,
  boundFarmBulletinAckRequestSchema,
  boundFarmBulletinAckSuccessSchema,
  boundFarmBulletinReadErrorSchema,
  boundFarmBulletinReadSuccessSchema,
  type FarmBulletinAckScope,
  farmBulletinAckIdempotencyKeySchema,
  farmBulletinDoorplateSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundBulletinRead = ReturnType<typeof boundFarmBulletinReadSuccessSchema.parse>;
export type BoundBulletinAck = ReturnType<typeof boundFarmBulletinAckSuccessSchema.parse>;
export type BulletinAcknowledgementScope = FarmBulletinAckScope;
export type BulletinIssueCode =
  | ReturnType<typeof boundFarmBulletinReadErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface BulletinIssue {
  code: BulletinIssueCode;
  serverMessage: string | null;
}

export interface BulletinReadOptions {
  expectedFarmDoorplate: string;
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

export interface BulletinAckIssue {
  code: ReturnType<typeof boundFarmBulletinAckErrorSchema.parse>["error"]["code"] | ClientIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface BulletinAckOptions {
  acknowledge: FarmBulletinAckScope;
  expectedFarmDoorplate: string;
  expectedRevision: string;
  idempotencyKey: string;
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): BulletinIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): BulletinIssue {
  const parsed = boundFarmBulletinReadErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

export async function getBoundBulletin(
  options: BulletinReadOptions,
): Promise<ApiResult<BoundBulletinRead, BulletinIssue>> {
  const expectedFarmDoorplate = farmBulletinDoorplateSchema.parse(options.expectedFarmDoorplate);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/bulletin", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) return { ok: false, issue: parseServerIssue(payload) };

  const parsed = boundFarmBulletinReadSuccessSchema.safeParse(payload);
  if (!parsed.success || parsed.data.subject.farm_doorplate !== expectedFarmDoorplate) {
    return { ok: false, issue: clientIssue("unexpected_response") };
  }
  return { ok: true, data: parsed.data };
}

export const getFarmBulletin = getBoundBulletin;
export const getDingdongBulletin = getBoundBulletin;

export async function acknowledgeBoundBulletin(
  options: BulletinAckOptions,
): Promise<ApiResult<BoundBulletinAck, BulletinAckIssue>> {
  const expectedFarmDoorplate = farmBulletinDoorplateSchema.parse(options.expectedFarmDoorplate);
  const idempotencyKey = farmBulletinAckIdempotencyKeySchema.parse(options.idempotencyKey);
  const body = boundFarmBulletinAckRequestSchema.parse({
    expected_revision: options.expectedRevision,
    acknowledge: options.acknowledge,
  });
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/bulletin/ack", {
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
      issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
    };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const parsed = boundFarmBulletinAckErrorSchema.safeParse(payload);
    return parsed.success
      ? {
          ok: false,
          issue: {
            code: parsed.data.error.code,
            currentRevision: parsed.data.error.current_revision ?? null,
            serverMessage: parsed.data.error.message,
          },
        }
      : {
          ok: false,
          issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
        };
  }

  const parsed = boundFarmBulletinAckSuccessSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.subject.farm_doorplate !== expectedFarmDoorplate ||
    parsed.data.revision !== options.expectedRevision ||
    parsed.data.data.result.receipt_id !== idempotencyKey
  ) {
    return {
      ok: false,
      issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
    };
  }
  return { ok: true, data: parsed.data };
}

export const acknowledgeDingdongBulletin = acknowledgeBoundBulletin;

export function bulletinIssueMessage(issue: BulletinIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上叮咚播报，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "叮咚播报返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "叮咚播报暂时不可用，请稍后再试。";
}
