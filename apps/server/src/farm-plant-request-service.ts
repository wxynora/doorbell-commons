import { createHash, randomUUID } from "node:crypto";
import type { CommunityDatabase, FarmPlantRequestRecord } from "./community-database.js";
import { FarmPlantRequestIdempotencyConflictError } from "./community-database.js";

export const FARM_PLANT_BELL_REASON = "farm_plant_request" as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface FarmPlantRequestCreateInput {
  residentId: string;
  homeId: string;
  humanName: string;
  fieldRevision: string;
  emptyPlotCount: number;
  idempotencyKey: string;
}

export interface FarmPlantRequestReplayInput {
  residentId: string;
  fieldRevision: string;
  idempotencyKey: string;
}

export interface FarmPlantRequestServiceOptions {
  database: CommunityDatabase;
  now?: () => number;
  generateRequestId?: () => string;
  generateWakeId?: () => string;
  bellNotifier?: FarmPlantBellNotifier;
}

export interface FarmPlantBellNotifier {
  notifyResident(residentId: string): void;
  cancelWake(residentId: string, wakeId: string, now?: number): void;
  notifyWakeCancelled?(residentId: string, wakeId: string): void;
}

export interface FarmPlantRequestCreateResult {
  request: FarmPlantRequestRecord;
  created: boolean;
  notificationText: string;
}

export class FarmPlantRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmPlantRequestInputError";
  }
}

export function buildFarmPlantNotificationText(humanName: string): string {
  return `【📢来自铃野的通知】\n你的人类${humanName}喊你来农场种菜。`;
}

function payloadHash(humanName: string, fieldRevision: string, emptyPlotCount: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        human_name: humanName,
        field_revision: fieldRevision,
        empty_plot_count: emptyPlotCount,
      }),
    )
    .digest("hex");
}

export class FarmPlantRequestService {
  readonly #database: CommunityDatabase;
  readonly #now: () => number;
  readonly #generateRequestId: () => string;
  readonly #generateWakeId: () => string;
  readonly #bellNotifier: FarmPlantBellNotifier | undefined;

  constructor(options: FarmPlantRequestServiceOptions) {
    this.#database = options.database;
    this.#now = options.now ?? Date.now;
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
    this.#bellNotifier = options.bellNotifier;
  }

  create(input: FarmPlantRequestCreateInput): FarmPlantRequestCreateResult {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmPlantRequestInputError("Idempotency-Key must be a UUID");
    }
    if (
      input.humanName.trim().length === 0 ||
      input.fieldRevision.trim().length === 0 ||
      !Number.isSafeInteger(input.emptyPlotCount) ||
      input.emptyPlotCount <= 0
    ) {
      throw new FarmPlantRequestInputError(
        "Human name, field revision, and a positive empty plot count are required",
      );
    }
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    const notificationText = buildFarmPlantNotificationText(input.humanName);
    const result = this.#database.createFarmPlantRequest({
      requestId: this.#generateRequestId(),
      wakeId: this.#generateWakeId(),
      residentId: input.residentId,
      homeId: input.homeId,
      idempotencyKey,
      fieldRevision: input.fieldRevision,
      emptyPlotCount: input.emptyPlotCount,
      humanName: input.humanName,
      payloadHash: payloadHash(input.humanName, input.fieldRevision, input.emptyPlotCount),
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

  replay(input: FarmPlantRequestReplayInput): FarmPlantRequestCreateResult | undefined {
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new FarmPlantRequestInputError("Idempotency-Key must be a UUID");
    }
    if (input.fieldRevision.trim().length === 0) {
      throw new FarmPlantRequestInputError("Field revision is required");
    }
    const existing = this.#database.getFarmPlantRequestByIdempotencyKey(
      input.residentId,
      input.idempotencyKey.toLowerCase(),
    );
    if (!existing) return undefined;
    const current = this.get(existing.residentId, existing.requestId);
    if (!current) return undefined;
    if (current.fieldRevision !== input.fieldRevision) {
      throw new FarmPlantRequestIdempotencyConflictError();
    }
    const storedText = this.#database.getBellWake(current.residentId, current.wakeId)?.payload
      ?.text;
    return {
      request: current,
      created: false,
      notificationText:
        typeof storedText === "string"
          ? storedText
          : buildFarmPlantNotificationText(current.humanName),
    };
  }

  get(residentId: string, requestId: string): FarmPlantRequestRecord | undefined {
    const expired = this.#database.expireFarmPlantRequest(residentId, requestId, this.#now());
    this.#notifyCancelled(residentId, expired?.cancelledWakeIds ?? []);
    return this.#database.getFarmPlantRequest(residentId, requestId);
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
