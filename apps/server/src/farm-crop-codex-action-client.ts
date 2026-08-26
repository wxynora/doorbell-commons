import {
  type FarmCropCodexAction,
  type FarmHumanCropCodexActionError,
  type FarmHumanCropCodexActionSuccess,
  farmHumanCropCodexActionErrorSchema,
  farmHumanCropCodexActionRequestSchema,
  farmHumanCropCodexActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanCropCodexActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  cropId: string;
  action: FarmCropCodexAction;
  expectedCodexRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanCropCodexActioner {
  executeCropCodexAction(
    input: FarmHumanCropCodexActionInput,
  ): Promise<FarmHumanCropCodexActionSuccess>;
}

export class FarmHumanCropCodexActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanCropCodexActionCredentialInvalidError";
  }
}

export class FarmHumanCropCodexActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanCropCodexActionNotFoundError";
  }
}

export class FarmHumanCropCodexActionUnavailableError extends Error {
  constructor() {
    super("The farm crop codex action service is unavailable");
    this.name = "FarmHumanCropCodexActionUnavailableError";
  }
}

export class FarmHumanCropCodexActionContractUnavailableError extends Error {
  constructor() {
    super("The farm crop codex action response could not be verified");
    this.name = "FarmHumanCropCodexActionContractUnavailableError";
  }
}

export class FarmHumanCropCodexActionStateConflictError extends Error {
  readonly currentCodexRevision: string | undefined;

  constructor(currentCodexRevision?: string) {
    super("The crop codex has changed");
    this.name = "FarmHumanCropCodexActionStateConflictError";
    this.currentCodexRevision = currentCodexRevision;
  }
}

export class FarmHumanCropCodexActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanCropCodexActionRejectedError";
  }
}

export class FarmHumanCropCodexActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanCropCodexActionIdempotencyConflictError";
  }
}

interface FarmHumanCropCodexActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function resultMatchesInput(
  result: FarmHumanCropCodexActionSuccess,
  input: FarmHumanCropCodexActionInput,
): boolean {
  const receipt = result.data.result;
  return (
    receipt.receipt_id === input.idempotencyKey &&
    receipt.crop_id === input.cropId &&
    receipt.action === input.action &&
    receipt.starred === (input.action === "star") &&
    result.data.resource.farm.farm_doorplate === input.farmDoorplate
  );
}

export class FarmHumanCropCodexActionClient implements FarmHumanCropCodexActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanCropCodexActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Crop Codex Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/codex/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeCropCodexAction(
    input: FarmHumanCropCodexActionInput,
  ): Promise<FarmHumanCropCodexActionSuccess> {
    const requestBody = farmHumanCropCodexActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      crop_id: input.cropId,
      action: input.action,
      expected_codex_revision: input.expectedCodexRevision,
      idempotency_key: input.idempotencyKey,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#actionEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanCropCodexActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanCropCodexActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanCropCodexActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanCropCodexActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanCropCodexActionSuccessSchema.safeParse(payload);
      if (!parsed.success || !resultMatchesInput(parsed.data, input)) {
        throw new FarmHumanCropCodexActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanCropCodexActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanCropCodexActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async starCrop(
    input: Omit<FarmHumanCropCodexActionInput, "action">,
  ): Promise<FarmHumanCropCodexActionSuccess> {
    return this.executeCropCodexAction({ ...input, action: "star" });
  }

  async unstarCrop(
    input: Omit<FarmHumanCropCodexActionInput, "action">,
  ): Promise<FarmHumanCropCodexActionSuccess> {
    return this.executeCropCodexAction({ ...input, action: "unstar" });
  }

  #throwActionError(parsedError: FarmHumanCropCodexActionError, status: number): never {
    const { code, current_revision: currentCodexRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanCropCodexActionStateConflictError(currentCodexRevision);
      case "action_rejected":
        throw new FarmHumanCropCodexActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanCropCodexActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanCropCodexActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanCropCodexActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanCropCodexActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanCropCodexActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanCropCodexActionUnavailableError()
          : new FarmHumanCropCodexActionContractUnavailableError();
    }
    throw new FarmHumanCropCodexActionContractUnavailableError();
  }
}

export const FarmHumanCropCodexClient = FarmHumanCropCodexActionClient;
export const FarmHumanCodexActionClient = FarmHumanCropCodexActionClient;
