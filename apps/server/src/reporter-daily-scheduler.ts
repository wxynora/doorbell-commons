import type { ReporterRelayStarter } from "./reporter-relay-farm-client.js";
import type { ReporterRelayService } from "./reporter-relay-service.js";

export interface ReporterDailyEvent {
  event: "dispatch_start" | "dispatch_enqueued" | "submission_dispatch_start" | "submission_dispatch_complete";
  issueDate: string;
  stage?: "selection" | "writing" | "review" | "supplement";
  status?: "created" | "duplicate" | "not_due" | "empty" | "completed" | "unassigned";
}

export interface ReporterDailySchedulerOptions {
  farm: ReporterRelayStarter;
  relay: Pick<ReporterRelayService, "enqueue" | "enqueueSubmissions">;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
  onEvent?: (event: ReporterDailyEvent) => void;
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_AM_MS = 5 * 60 * 60 * 1000;

function dateStringFromBeijingDay(dayStartUtc: number): string {
  return new Date(dayStartUtc + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function reporterDailyScheduleTarget(now: number) {
  const shifted = now + BEIJING_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  const todayFiveAt = dayStartShifted + FIVE_AM_MS - BEIJING_OFFSET_MS;
  if (now < todayFiveAt) {
    return {
      dueAt: todayFiveAt,
      dayStartUtc: dayStartShifted - BEIJING_OFFSET_MS,
    };
  }
  return {
    dueAt: todayFiveAt + DAY_MS,
    dayStartUtc: dayStartShifted - BEIJING_OFFSET_MS + DAY_MS,
  };
}

function issuePeriod(dayStartUtc: number) {
  const periodEnd = dayStartUtc + FIVE_AM_MS;
  return {
    issueDate: dateStringFromBeijingDay(dayStartUtc),
    periodStart: new Date(periodEnd - DAY_MS).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
  };
}

export class ReporterDailyScheduler {
  readonly #farm: ReporterRelayStarter;
  readonly #relay: ReporterDailySchedulerOptions["relay"];
  readonly #now: () => number;
  readonly #setTimer: NonNullable<ReporterDailySchedulerOptions["setTimer"]>;
  readonly #clearTimer: NonNullable<ReporterDailySchedulerOptions["clearTimer"]>;
  readonly #onError: (error: unknown) => void;
  readonly #onEvent: (event: ReporterDailyEvent) => void;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;

  constructor(options: ReporterDailySchedulerOptions) {
    this.#farm = options.farm;
    this.#relay = options.relay;
    this.#now = options.now ?? Date.now;
    this.#setTimer = options.setTimer ?? setTimeout;
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#onError = options.onError ?? (() => undefined);
    this.#onEvent = options.onEvent ?? (() => undefined);
  }

  start(): void {
    if (this.#closed || this.#timer) return;
    this.#schedule();
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) this.#clearTimer(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    if (this.#closed) return;
    const target = reporterDailyScheduleTarget(this.#now());
    this.#timer = this.#setTimer(
      () => void this.#run(target.dayStartUtc),
      Math.max(0, target.dueAt - this.#now()),
    );
    this.#timer.unref?.();
  }

  async #run(dayStartUtc: number): Promise<void> {
    this.#timer = null;
    try {
      const period = issuePeriod(dayStartUtc);
      await Promise.all([
        (async () => {
          this.#emit({ event: "dispatch_start", issueDate: period.issueDate });
          const wake = await this.#farm.startIssue(period);
          const acceptance = this.#relay.enqueue(wake);
          this.#emit({ event: "dispatch_enqueued", issueDate: period.issueDate,
            stage: wake.stage, status: acceptance.status });
        })().catch(this.#onError),
        (async () => {
          this.#emit({ event: "submission_dispatch_start", issueDate: period.issueDate });
          const reviewer = await this.#farm.submissionReviewer(period.issueDate);
          const status = reviewer ? this.#relay.enqueueSubmissions({
            issueDate: period.issueDate, reviewerResidentId: reviewer.residentId,
          }).status : "unassigned";
          this.#emit({ event: "submission_dispatch_complete", issueDate: period.issueDate, status });
        })().catch(this.#onError),
      ]);
    } catch (error) {
      this.#onError(error);
    } finally {
      this.#schedule();
    }
  }

  #emit(event: ReporterDailyEvent): void {
    try {
      this.#onEvent(event);
    } catch {
      // Logging must not interrupt reporter scheduling.
    }
  }
}
