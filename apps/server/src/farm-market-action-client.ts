import {
  type FarmHumanMarketActionError,
  type FarmHumanMarketActionSuccess,
  type FarmHumanMarketCrossFarmActionSuccess,
  type FarmMarketAction,
  type FarmMarketListingKind,
  farmHumanMarketActionErrorSchema,
  farmHumanMarketActionRequestSchema,
  farmHumanMarketActionSuccessSchema,
} from "@doorbell/protocol";

type FarmHumanMarketActionIdentity = {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
};

export type FarmHumanMarketActionInput =
  | (FarmHumanMarketActionIdentity & { action: "browse" })
  | (FarmHumanMarketActionIdentity & {
      action: "list";
      kind: FarmMarketListingKind;
      itemId: string;
      quantity: number;
      price?: number | undefined;
    })
  | (FarmHumanMarketActionIdentity & {
      action: "buy";
      sellerDoorplate: string;
      kind: FarmMarketListingKind;
      itemId: string;
      quantity: number;
    })
  | (FarmHumanMarketActionIdentity & {
      action: "unlist";
      kind: FarmMarketListingKind;
      itemId: string;
    })
  | (FarmHumanMarketActionIdentity & {
      action: "barter-list";
      giveKind: FarmMarketListingKind;
      giveItemId: string;
      giveQuantity: number;
      wantKind: FarmMarketListingKind;
      wantItemId: string;
      wantQuantity: number;
    })
  | (FarmHumanMarketActionIdentity & {
      action: "barter-accept";
      sellerDoorplate: string;
      listingId: string;
    })
  | (FarmHumanMarketActionIdentity & {
      action: "barter-unlist";
      listingId: string;
    });

export interface FarmHumanMarketActioner {
  executeMarketAction(input: FarmHumanMarketActionInput): Promise<FarmHumanMarketActionSuccess>;
}

export class FarmHumanMarketActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanMarketActionCredentialInvalidError";
  }
}

export class FarmHumanMarketActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanMarketActionNotFoundError";
  }
}

export class FarmHumanMarketActionUnavailableError extends Error {
  constructor() {
    super("The farm market action service is unavailable");
    this.name = "FarmHumanMarketActionUnavailableError";
  }
}

export class FarmHumanMarketActionContractUnavailableError extends Error {
  constructor() {
    super("The farm market action response could not be verified");
    this.name = "FarmHumanMarketActionContractUnavailableError";
  }
}

export class FarmHumanMarketActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The market state has changed");
    this.name = "FarmHumanMarketActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanMarketActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanMarketActionRejectedError";
  }
}

export class FarmHumanMarketActionCrossFarmAtomicityUnavailableError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("Cross-farm market settlement is unavailable");
    this.name = "FarmHumanMarketActionCrossFarmAtomicityUnavailableError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanMarketActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanMarketActionIdempotencyConflictError";
  }
}

interface FarmHumanMarketActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function requestActionFields(input: FarmHumanMarketActionInput): Record<string, unknown> {
  switch (input.action) {
    case "browse":
      return { action: input.action };
    case "list":
      return {
        action: input.action,
        kind: input.kind,
        item_id: input.itemId,
        qty: input.quantity,
        ...(input.price === undefined ? {} : { price: input.price }),
      };
    case "buy":
      return {
        action: input.action,
        seller_doorplate: input.sellerDoorplate,
        kind: input.kind,
        item_id: input.itemId,
        qty: input.quantity,
      };
    case "unlist":
      return { action: input.action, kind: input.kind, item_id: input.itemId };
    case "barter-list":
      return {
        action: input.action,
        give_kind: input.giveKind,
        give_item_id: input.giveItemId,
        give_qty: input.giveQuantity,
        want_kind: input.wantKind,
        want_item_id: input.wantItemId,
        want_qty: input.wantQuantity,
      };
    case "barter-accept":
      return {
        action: input.action,
        seller_doorplate: input.sellerDoorplate,
        listing_id: input.listingId,
      };
    case "barter-unlist":
      return { action: input.action, listing_id: input.listingId };
  }
}

function revisionMatchesAction(
  result: FarmHumanMarketActionSuccess,
  expectedRevision: string,
  action: FarmMarketAction,
): boolean {
  return action === "browse"
    ? result.revision === expectedRevision
    : result.revision !== expectedRevision;
}

function isCrossFarmSuccess(
  result: FarmHumanMarketActionSuccess,
): result is FarmHumanMarketCrossFarmActionSuccess {
  return "seller_revision" in result;
}

function resultMatchesInput(
  result: FarmHumanMarketActionSuccess,
  input: FarmHumanMarketActionInput,
): boolean {
  if (input.action === "buy" || input.action === "barter-accept") {
    if (!isCrossFarmSuccess(result)) return false;
    if (
      result.data.buyer_doorplate !== input.farmDoorplate ||
      result.data.seller_doorplate !== input.sellerDoorplate
    ) {
      return false;
    }

    const actionResult = result.data.result;
    if (actionResult.receipt_id !== input.idempotencyKey || actionResult.action !== input.action) {
      return false;
    }

    if (input.action === "buy") {
      return (
        actionResult.action === "buy" &&
        actionResult.outcome.seller_doorplate === input.sellerDoorplate &&
        actionResult.outcome.kind === input.kind &&
        actionResult.outcome.item_id === input.itemId &&
        actionResult.outcome.quantity === input.quantity
      );
    }

    return (
      actionResult.action === "barter-accept" &&
      actionResult.outcome.seller_doorplate === input.sellerDoorplate &&
      actionResult.outcome.listing_id === input.listingId
    );
  }

  if (isCrossFarmSuccess(result)) return false;

  const actionResult = result.data.result;
  if (actionResult.receipt_id !== input.idempotencyKey || actionResult.action !== input.action) {
    return false;
  }

  switch (input.action) {
    case "browse":
      return actionResult.action === "browse" && actionResult.outcome === null;
    case "list":
      return (
        actionResult.action === "list" &&
        actionResult.outcome.kind === input.kind &&
        actionResult.outcome.item_id === input.itemId &&
        actionResult.outcome.quantity === input.quantity &&
        (input.price === undefined || actionResult.outcome.price === input.price)
      );
    case "unlist":
      return (
        actionResult.action === "unlist" &&
        actionResult.outcome.kind === input.kind &&
        actionResult.outcome.item_id === input.itemId
      );
    case "barter-list":
      return (
        actionResult.action === "barter-list" &&
        actionResult.outcome.give.kind === input.giveKind &&
        actionResult.outcome.give.item_id === input.giveItemId &&
        actionResult.outcome.give.quantity === input.giveQuantity &&
        actionResult.outcome.want.kind === input.wantKind &&
        actionResult.outcome.want.item_id === input.wantItemId &&
        actionResult.outcome.want.quantity === input.wantQuantity
      );
    case "barter-unlist":
      return (
        actionResult.action === "barter-unlist" &&
        actionResult.outcome.listing_id === input.listingId
      );
  }
}

export class FarmHumanMarketActionClient implements FarmHumanMarketActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanMarketActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Market Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/market/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeMarketAction(
    input: FarmHumanMarketActionInput,
  ): Promise<FarmHumanMarketActionSuccess> {
    const requestBody = farmHumanMarketActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      ...requestActionFields(input),
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
      throw new FarmHumanMarketActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanMarketActionContractUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.status >= 500) throw new FarmHumanMarketActionUnavailableError();
      throw new FarmHumanMarketActionContractUnavailableError();
    }

    if (!response.ok) {
      const serviceError = farmHumanMarketActionErrorSchema.safeParse(payload);
      if (serviceError.success) this.#throwActionError(serviceError.data, response.status);
      if (response.status >= 500) throw new FarmHumanMarketActionUnavailableError();
      throw new FarmHumanMarketActionContractUnavailableError();
    }

    const parsed = farmHumanMarketActionSuccessSchema.safeParse(payload);
    if (
      !parsed.success ||
      (!isCrossFarmSuccess(parsed.data) &&
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate) ||
      !resultMatchesInput(parsed.data, input) ||
      !revisionMatchesAction(parsed.data, input.expectedRevision, input.action)
    ) {
      throw new FarmHumanMarketActionContractUnavailableError();
    }
    return parsed.data;
  }

  async executeFarmMarketAction(
    input: FarmHumanMarketActionInput,
  ): Promise<FarmHumanMarketActionSuccess> {
    return this.executeMarketAction(input);
  }

  #throwActionError(parsedError: FarmHumanMarketActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanMarketActionStateConflictError(currentRevision);
      case "cross_farm_atomicity_unavailable":
        throw new FarmHumanMarketActionCrossFarmAtomicityUnavailableError(currentRevision);
      case "action_rejected":
        throw new FarmHumanMarketActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanMarketActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanMarketActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanMarketActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanMarketActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanMarketActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanMarketActionUnavailableError()
          : new FarmHumanMarketActionContractUnavailableError();
    }
    throw new FarmHumanMarketActionContractUnavailableError();
  }
}

export const FarmHumanMarketClient = FarmHumanMarketActionClient;
