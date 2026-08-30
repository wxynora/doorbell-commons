import { createHash, randomUUID } from "node:crypto";
import type { CommunityDatabase, FarmHarvestRequestRecord } from "./community-database.js";
import { FarmHarvestRequestIdempotencyConflictError } from "./community-database.js";

export const FARM_HARVEST_BELL_REASON = "farm_harvest_request" as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface FarmHarvestRequestCreateInput {
  residentId: string;
  homeId: string;
  humanName: string;
  fieldRevision: string;
  maturePlotCount: number;
  idempotencyKey: string;
}

export interface FarmHarvestRequestReplayInput {
  residentId: string;
  fieldRevision: string;
  idempotencyKey: string;
}

export interface FarmHarvestRequestServiceOptions {
  database: CommunityDatabase;
  now?: () => number;
  generateRequestId?: () => string;
  generateWakeId?: () => string;
  bellNotifier?: FarmHarvestBellNotifier;
}

export interface FarmHarvestBellNotifier {
  notifyResident(residentId: string): void;
  cancelWake(residentId: string, wakeId: string, now?: number): void;
  notifyWakeCancelled?(residentId: string, wakeId: string): void;
}

export interface FarmHarvestRequestCreateResult {
  request: FarmHarvestRequestRecord;
  created: boolean;
  notificationText: string;
}

export class FarmHarvestRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHarvestRequestInputError";
  }
}

export function buildFarmHarvestNotificationText(humanName: string): string {
  return `【📢来自铃野的通知】\n你的人类${humanName}喊你来农场收菜。`;
}

function payloadHash(humanName: string, fieldRevision: string, maturePlotCount: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        human_name: humanName,
        field_revision: fieldRevision,
        mature_plot_count: maturePlotCount,
      }),
    )
    .digest("hex");
}

export class FarmHarvestRequestService {
  readonly #database: CommunityDatabase;
  readonly #now: () => number;
  readonly #generateRequestId: () => string;
  readonly #generateWakeId: () => string;
  readonly #bellNotifier: FarmHarvestBellNotifier | undefined;

  constructor(options: FarmHarvestRequestServiceOptions) {
    this.#database = options.database;
    this.#now = options.now ?? Date.now;
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
    this.#bellNotifier = options.bellNotifier;
  }

  create(input: FarmHarvestRequestCreateInput): FarmHarvestRequestCreateResult {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmHarvestRequestInputError("Idempotency-Key must be a UUID");
    }
    if (
      input.humanName.trim().length === 0 ||
      input.fieldRevision.trim().length === 0 ||
      !Number.isSafeInteger(input.maturePlotCount) ||
      input.maturePlotCount <= 0
    ) {
      throw new FarmHarvestRequestInputError(
        "Human name, field revision, and a positive mature plot count are required",
      );
    }
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    const notificationText = buildFarmHarvestNotificationText(input.humanName);
    const result = this.#database.createFarmHarvestRequest({
      requestId: this.#generateRequestId(),
      wakeId: this.#generateWakeId(),
      residentId: input.residentId,
      homeId: input.homeId,
      idempotencyKey,
      fieldRevision: input.fieldRevision,
      maturePlotCount: input.maturePlotCount,
      humanName: input.humanName,
      payloadHash: payloadHash(input.humanName, input.fieldRevision, input.maturePlotCount),
      notificationText,
      createdAt: this.#now(),
    });
    this.#bellNotifier?.notifyResident(input.residentId);
    const storedText = this.#database.getBellWake(input.residentId, result.request.wakeId)?.payload
      ?.text;
    return {
      ...result,
      notificationText: typeof storedText === "string" ? storedText : notificationText,
    };
  }

  replay(input: FarmHarvestRequestReplayInput): FarmHarvestRequestCreateResult | undefined {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmHarvestRequestInputError("Idempotency-Key must be a UUID");
    }
    if (input.fieldRevision.trim().length === 0) {
      throw new FarmHarvestRequestInputError("Field revision is required");
    }
    const existing = this.#database.getFarmHarvestRequestByIdempotencyKey(
      input.residentId,
      input.idempotencyKey.toLowerCase(),
    );
    if (!existing) return undefined;
    const current = this.get(existing.residentId, existing.requestId);
    if (!current) return undefined;
    if (current.fieldRevision !== input.fieldRevision) {
      throw new FarmHarvestRequestIdempotencyConflictError();
    }
    const storedText = this.#database.getBellWake(current.residentId, current.wakeId)?.payload
      ?.text;
    return {
      request: current,
      created: false,
      notificationText:
        typeof storedText === "string"
          ? storedText
          : buildFarmHarvestNotificationText(current.humanName),
    };
  }

  get(residentId: string, requestId: string): FarmHarvestRequestRecord | undefined {
    const expired = this.#database.expireFarmHarvestRequest(residentId, requestId, this.#now());
    this.#notifyCancelled(residentId, expired?.cancelledWakeIds ?? []);
    return this.#database.getFarmHarvestRequest(residentId, requestId);
  }

  #notifyCancelled(residentId: string, wakeIds: readonly string[]): void {
    for (const wakeId of wakeIds) {
      if (this.#bellNotifier?.notifyWakeCancelled) {
        this.#bellNotifier.notifyWakeCancelled(residentId, wakeId);
      } else {
        this.#bellNotifier?.cancelWake(residentId, wakeId, this.#now());
      }
    }
  }
}
