export interface DueFarmActionList {
  listId: string;
  residentId: string;
  scheduledFor: number;
}

export interface FarmActionListScheduleStore {
  listDueActionLists(now: number): DueFarmActionList[];
  nextActionListDueAt(): number | null;
}

export interface FarmActionListScheduledSender {
  sendScheduled(listId: string, residentId: string, scheduledFor: number): Promise<void>;
}

export interface FarmActionListSchedulerOptions {
  store: FarmActionListScheduleStore;
  sender: FarmActionListScheduledSender;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

const MAX_TIMER_DELAY_MS = 2_147_000_000;

export class FarmActionListScheduler {
  readonly #store: FarmActionListScheduleStore;
  readonly #sender: FarmActionListScheduledSender;
  readonly #now: () => number;
  readonly #setTimer: NonNullable<FarmActionListSchedulerOptions["setTimer"]>;
  readonly #clearTimer: NonNullable<FarmActionListSchedulerOptions["clearTimer"]>;
  readonly #onError: (error: unknown) => void;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #closed = false;

  constructor(options: FarmActionListSchedulerOptions) {
    this.#store = options.store;
    this.#sender = options.sender;
    this.#now = options.now ?? Date.now;
    this.#setTimer = options.setTimer ?? setTimeout;
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#onError = options.onError ?? (() => undefined);
  }

  start(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.#closed) return;
    if (this.#timer) this.#clearTimer(this.#timer);
    this.#timer = null;
    const dueAt = this.#store.nextActionListDueAt();
    if (dueAt === null) return;
    this.#timer = this.#setTimer(
      () => void this.#drain(),
      Math.min(MAX_TIMER_DELAY_MS, Math.max(0, dueAt - this.#now())),
    );
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) this.#clearTimer(this.#timer);
    this.#timer = null;
  }

  async #drain(): Promise<void> {
    if (this.#closed || this.#running) return;
    this.#timer = null;
    this.#running = true;
    try {
      for (const due of this.#store.listDueActionLists(this.#now())) {
        try {
          await this.#sender.sendScheduled(due.listId, due.residentId, due.scheduledFor);
        } catch (error) {
          this.#onError(error);
        }
      }
    } finally {
      this.#running = false;
      this.refresh();
    }
  }
}
