import {
  type ReporterRelayWake,
  type ReporterRelayWakeAcceptance,
  reporterRelayWakeAcceptanceSchema,
  reporterRelayWakeSchema,
} from "@doorbell/protocol";
import { ZodError } from "zod";
import type { BellService } from "./bell-service.js";
import type { CommunityDatabase } from "./community-database.js";

export interface ReporterRelayRenderer {
  render(wake: ReporterRelayWake): string;
}

export interface ReporterRelayServiceOptions {
  database: Pick<CommunityDatabase, "createReporterBellWake">;
  bellService: Pick<BellService, "notifyResident">;
  renderer: ReporterRelayRenderer;
  now?: () => number;
}

export class ReporterRelayWakeValidationError extends Error {
  constructor(options?: ErrorOptions) {
    super("The reporter relay wake does not match the supported contract", options);
    this.name = "ReporterRelayWakeValidationError";
  }
}

export class ReporterRelayRenderError extends Error {
  constructor() {
    super("The reporter relay renderer did not return an approved message");
    this.name = "ReporterRelayRenderError";
  }
}

export class ReporterRelayService {
  readonly #database: ReporterRelayServiceOptions["database"];
  readonly #bellService: ReporterRelayServiceOptions["bellService"];
  readonly #renderer: ReporterRelayRenderer;
  readonly #now: () => number;

  constructor(options: ReporterRelayServiceOptions) {
    this.#database = options.database;
    this.#bellService = options.bellService;
    this.#renderer = options.renderer;
    this.#now = options.now ?? Date.now;
  }

  enqueue(input: unknown): ReporterRelayWakeAcceptance {
    let wake: ReporterRelayWake;
    try {
      wake = reporterRelayWakeSchema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ReporterRelayWakeValidationError({ cause: error });
      }
      throw error;
    }

    const text = this.#renderer.render(wake);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new ReporterRelayRenderError();
    }
    const status = this.#database.createReporterBellWake({
      wakeId: wake.wake_id,
      residentId: wake.recipient_resident_id,
      text,
      createdAt: this.#now(),
    });
    if (status === "created") {
      this.#bellService.notifyResident(wake.recipient_resident_id);
    }
    return reporterRelayWakeAcceptanceSchema.parse({
      accepted: true,
      status,
      wake_id: wake.wake_id,
    });
  }
}
