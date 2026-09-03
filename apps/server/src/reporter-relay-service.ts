import {
  type ReporterRelayWake,
  type ReporterRelayWakeAcceptance,
  reporterRelayWakeAcceptanceSchema,
  reporterRelayWakeSchema,
} from "@doorbell/protocol";
import { ZodError } from "zod";
import type { BellService } from "./bell-service.js";
import type { CommunityDatabase } from "./community-database.js";
import { renderDailySubmissionReview } from "./lingye-daily-submission-op.js";
import type { DailySubmissionReview } from "./lingye-daily-store.js";

export interface ReporterRelayRenderer {
  render(wake: ReporterRelayWake): string;
}

export interface ReporterRelayServiceOptions {
  database: Pick<CommunityDatabase, "createReporterBellWake" | "lingyeDailyStore">;
  bellService: Pick<BellService, "notifyResident">;
  renderer: ReporterRelayRenderer;
  now?: () => number;
  onEvent?: (event: ReporterRelayEvent) => void;
}

export interface ReporterRelayEvent {
  event: "wake_enqueued";
  issueDate: string;
  stage: ReporterRelayWake["stage"];
  status: ReporterRelayWakeAcceptance["status"];
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
  readonly #onEvent: (event: ReporterRelayEvent) => void;

  constructor(options: ReporterRelayServiceOptions) {
    this.#database = options.database;
    this.#bellService = options.bellService;
    this.#renderer = options.renderer;
    this.#now = options.now ?? Date.now;
    this.#onEvent = options.onEvent ?? (() => undefined);
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
    const status = this.#database.lingyeDailyStore.enqueueArticleReviewWake(wake, () =>
      this.#database.createReporterBellWake({
        wakeId: wake.wake_id,
        residentId: wake.recipient_resident_id,
        text,
        createdAt: this.#now(),
      }),
    );
    if (status === "created") {
      this.#bellService.notifyResident(wake.recipient_resident_id);
    }
    try {
      this.#onEvent({
        event: "wake_enqueued",
        issueDate: wake.issue_date,
        stage: wake.stage,
        status,
      });
    } catch {
      // Logging must not overturn an accepted Bell wake.
    }
    return reporterRelayWakeAcceptanceSchema.parse({
      accepted: true,
      status,
      wake_id: wake.wake_id,
    });
  }

  enqueueSubmissions(input: { issueDate: string; reviewerResidentId: string }) {
    const now = this.#now();
    let recipient = input.reviewerResidentId;
    const status = this.#database.lingyeDailyStore.enqueueSubmissionReview(
      input.issueDate, input.reviewerResidentId, now, review => {
        recipient = review.reviewerResidentId;
        return this.#database.createReporterBellWake({
          wakeId: `daily-submissions:${input.issueDate}`,
          residentId: recipient,
          text: renderDailySubmissionReview(review),
          createdAt: now,
        });
      },
    );
    if (status === "created") this.#bellService.notifyResident(recipient);
    return { status };
  }

  createResentFarmWake(wake:ReporterRelayWake,wakeId:string) {
    const resent=reporterRelayWakeSchema.parse({...wake,wake_id:wakeId});
    return {recipientResidentId:resent.recipient_resident_id,sourceWakeId:wake.wake_id,
      status:this.#database.createReporterBellWake({wakeId,residentId:resent.recipient_resident_id,
        text:this.#renderer.render(resent),createdAt:this.#now()})};
  }

  createResentSubmissionWake(review:DailySubmissionReview,wakeId:string) {
    return {recipientResidentId:review.reviewerResidentId,sourceWakeId:`daily-submissions:${review.issueDate}`,
      status:this.#database.createReporterBellWake({wakeId,residentId:review.reviewerResidentId,
        text:renderDailySubmissionReview(review),createdAt:this.#now()})};
  }

  notifyResentWake(residentId:string) { this.#bellService.notifyResident(residentId); }
}
