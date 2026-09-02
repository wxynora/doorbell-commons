import type { ReporterRelayStarter } from "./reporter-relay-farm-client.js";
import type { ReporterRelayService } from "./reporter-relay-service.js";

export interface ReporterDailyEvent {
  event: "dispatch_start" | "dispatch_no_pending" | "dispatch_enqueued";
  issueDate: string;
  recovery: boolean;
  stage?: "selection" | "writing" | "review" | "supplement";
  status?: "created" | "duplicate";
}

export interface ReporterDailySchedulerOptions {
  farm: ReporterRelayStarter;
  relay: Pick<ReporterRelayService, "enqueue">;
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

function scheduleTarget(now: number, catchUpToday: boolean) {
  const shifted = now + BEIJING_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  const todayFiveAt = dayStartShifted + FIVE_AM_MS - BEIJING_OFFSET_MS;
  if (now < todayFiveAt) {
    return {
      dueAt: todayFiveAt,
      dayStartUtc: dayStartShifted - BEIJING_OFFSET_MS,
      recovery: false,
    };
  }
  if (catchUpToday) {
    return { dueAt: now, dayStartUtc: dayStartShifted - BEIJING_OFFSET_MS, recovery: true };
  }
  return {
    dueAt: todayFiveAt + DAY_MS,
    dayStartUtc: dayStartShifted - BEIJING_OFFSET_MS + DAY_MS,
    recovery: false,
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
  readonly #relay: Pick<ReporterRelayService, "enqueue">;
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
    this.#schedule(true);
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) this.#clearTimer(this.#timer);
    this.#timer = null;
  }

  #schedule(catchUpToday: boolean): void {
    if (this.#closed) return;
    const target = scheduleTarget(this.#now(), catchUpToday);
    this.#timer = this.#setTimer(
      () => void this.#run(target.dayStartUtc, target.recovery),
      Math.max(0, target.dueAt - this.#now()),
    );
    this.#timer.unref?.();
  }

  async #run(dayStartUtc: number, recovery: boolean): Promise<void> {
    this.#timer = null;
    try {
      const period = issuePeriod(dayStartUtc);
      this.#emit({ event: "dispatch_start", issueDate: period.issueDate, recovery });
      const startedWake = await this.#farm.startIssue(period);
      const pendingWake = recovery ? await this.#farm.pendingIssue(period.issueDate) : startedWake;
      if (!pendingWake) {
        this.#emit({ event: "dispatch_no_pending", issueDate: period.issueDate, recovery });
        return;
      }
      const wake = recovery
        ? { ...pendingWake, wake_id: `${pendingWake.wake_id}:recovery-processed` }
        : pendingWake;
      const acceptance = this.#relay.enqueue(wake);
      this.#emit({
        event: "dispatch_enqueued",
        issueDate: period.issueDate,
        recovery,
        stage: wake.stage,
        status: acceptance.status,
      });
    } catch (error) {
      this.#onError(error);
    } finally {
      this.#schedule(false);
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
