import {
  boundFarmDecorationsReadSuccessSchema,
  boundFarmDecorationLayoutSaveRequestSchema,
  boundFarmDecorationLayoutSaveSuccessSchema,
  boundFarmDecorationLayoutSaveErrorSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundFarmDecorationsRead = ReturnType<
  typeof boundFarmDecorationsReadSuccessSchema.parse
>;
export type FarmDecorationLayout = BoundFarmDecorationsRead["data"]["layout"];
export type FarmLayoutSlot = 1 | 2 | 3;
export type FarmDecorationCommand = {layout:FarmDecorationLayout;save_slot?:FarmLayoutSlot;name?:string} | {load_slot:FarmLayoutSlot} | {rename_slot:FarmLayoutSlot;name:string};
export type BoundFarmDecorationLayoutSave = ReturnType<
  typeof boundFarmDecorationLayoutSaveSuccessSchema.parse
>;
export interface FarmDecorationIssue {
  code:
    | ReturnType<typeof boundFarmDecorationLayoutSaveErrorSchema.parse>["error"]["code"]
    | ClientIssueCode;
  serverMessage: string | null;
}

interface ReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

async function payloadOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function issueFrom(payload: unknown): FarmDecorationIssue {
  const parsed = boundFarmDecorationLayoutSaveErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : { code: "unexpected_response", serverMessage: null };
}

export async function getBoundFarmDecorations(
  options: ReadOptions = {},
): Promise<ApiResult<BoundFarmDecorationsRead, FarmDecorationIssue>> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/farm/decorations", {
      method: "GET",
      credentials: "same-origin",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: { code: "network_unavailable", serverMessage: null } };
  }
  const payload = await payloadOf(response);
  if (!response.ok) return { ok: false, issue: issueFrom(payload) };
  const parsed = boundFarmDecorationsReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: issueFrom(undefined) };
}

export async function saveBoundFarmDecorationLayout(
  options: ReadOptions & {
    expectedRevision: string;
    idempotencyKey: string;
  } & FarmDecorationCommand,
): Promise<ApiResult<BoundFarmDecorationLayoutSave, FarmDecorationIssue>> {
  const body = boundFarmDecorationLayoutSaveRequestSchema.parse({
    idempotency_key: options.idempotencyKey,
    expected_revision: options.expectedRevision,
    ...("rename_slot" in options?{rename_slot:options.rename_slot,name:options.name}:"load_slot" in options?{load_slot:options.load_slot}:{layout:options.layout,...(options.save_slot?{save_slot:options.save_slot,...(options.name!==undefined?{name:options.name}:{})}:{})}),
  });
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/farm/decorations/layout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: { code: "network_unavailable", serverMessage: null } };
  }
  const payload = await payloadOf(response);
  if (!response.ok) return { ok: false, issue: issueFrom(payload) };
  const parsed = boundFarmDecorationLayoutSaveSuccessSchema.safeParse(payload);
  return parsed.success && parsed.data.data.result.receipt_id === options.idempotencyKey
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: issueFrom(undefined) };
}

export function farmDecorationIssueMessage(issue: FarmDecorationIssue): string {
  if(issue.code==="layout_slot_empty")return "这套布局还没有保存，无法切换或改名。";
  if(["invalid_layout","invalid_stall_position","invalid_decoration_position","decoration_not_owned","decoration_quantity_exceeded","invalid_instance"].includes(issue.code))return "当前库存、田地或房屋占位已变化，这套布置未能保存或切换，原布局仍保留。";
  if (issue.code === "network_unavailable") return "现在连不上农场，布置尚未保存，请重试。";
  if (issue.code === "unexpected_response") return "装饰数据暂时无法识别，请稍后重试。";
  return issue.serverMessage || "装饰暂时不可用，请稍后重试。";
}
