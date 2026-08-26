import {
  type BoundFarmRanchInteractionActionSuccess,
  boundFarmRanchInteractionActionErrorSchema,
  boundFarmRanchInteractionActionRequestSchema,
  boundFarmRanchInteractionActionSuccessSchema,
  farmRanchInteractionActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

interface RanchInteractionActionInputBase {
  idempotencyKey: string;
  expectedRevision: string;
}

export type RanchInteractionActionInput =
  | (RanchInteractionActionInputBase & {
      action: "dispatch";
      targetFarmDoorplate: string;
      animalKindId: string;
      durationHours: number;
    })
  | (RanchInteractionActionInputBase & {
      action: "catch";
      raidId: string;
    })
  | (RanchInteractionActionInputBase & {
      action: "remit";
      amount: number;
    })
  | (RanchInteractionActionInputBase & {
      action: "send";
      amount: number;
    });

export type BoundRanchInteractionAction = BoundFarmRanchInteractionActionSuccess;
export type RanchInteractionActionIssueCode =
  | ReturnType<typeof boundFarmRanchInteractionActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface RanchInteractionActionIssue {
  code: RanchInteractionActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

type RanchInteractionActionOptions = RanchInteractionActionInput & {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
};

function clientIssue(code: ClientIssueCode): RanchInteractionActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

function actionFields(input: RanchInteractionActionInput) {
  switch (input.action) {
    case "dispatch":
      return {
        action: input.action,
        target_farm_doorplate: input.targetFarmDoorplate,
        animal_kind_id: input.animalKindId,
        duration_hours: input.durationHours,
      };
    case "catch":
      return { action: input.action, raid_id: input.raidId };
    case "remit":
    case "send":
      return { action: input.action, amount: input.amount };
  }
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): RanchInteractionActionIssue {
  const parsed = boundFarmRanchInteractionActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function resultMatchesInput(
  result: BoundRanchInteractionAction,
  input: RanchInteractionActionInput,
): boolean {
  if (
    result.data.result.receipt_id !== input.idempotencyKey ||
    result.data.result.action !== input.action ||
    result.data.result.outcome.kind !== input.action ||
    result.data.resource.farm.farm_doorplate === null ||
    result.revision === input.expectedRevision
  ) {
    return false;
  }

  switch (input.action) {
    case "dispatch":
      return (
        result.data.result.outcome.kind === "dispatch" &&
        result.data.result.outcome.animal_kind_id === input.animalKindId &&
        result.data.result.outcome.target_farm_doorplate === input.targetFarmDoorplate
      );
    case "catch":
      return (
        result.data.result.outcome.kind === "catch" &&
        result.data.result.outcome.raid_id === input.raidId
      );
    case "remit":
    case "send":
      return (
        result.data.result.outcome.kind === input.action &&
        result.data.result.outcome.amount === input.amount
      );
  }
}

export async function executeBoundRanchInteractionAction(
  options: RanchInteractionActionOptions,
): Promise<ApiResult<BoundRanchInteractionAction, RanchInteractionActionIssue>> {
  const body = boundFarmRanchInteractionActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    ...actionFields(options),
  });
  const idempotencyKey = farmRanchInteractionActionIdempotencyKeySchema.parse(
    options.idempotencyKey,
  );
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/ranch/interaction/actions", {
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
  if (!response.ok) return { ok: false, issue: parseServerIssue(payload) };

  const parsed = boundFarmRanchInteractionActionSuccessSchema.safeParse(payload);
  return parsed.success && resultMatchesInput(parsed.data, options)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundRanchInteractionAction = executeBoundRanchInteractionAction;
export const executeRanchInteractionAction = executeBoundRanchInteractionAction;

export function ranchInteractionActionIssueMessage(issue: RanchInteractionActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上牧场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "牧场往来动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "牧场往来动作暂时不可用，请稍后再试。";
}
