const IDLE_MS = 10 * 60_000;
type PetPresence = { areaId: string; enteredAt: number; lastSpokeAt: number | null };

/** Pet-area inactivity only; game and conversation leases retain ownership. */
export class LoungePetIdle {
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    private readonly read: (id: string) => PetPresence | undefined,
    private readonly leave: (id: string) => void,
    private readonly now: () => number = Date.now,
  ) {}
  touch(id: string, activityAt: number): void {
    this.cancel(id);
    const presence = this.read(id);
    if (presence?.areaId !== 'pet') return;
    const lastAction = Math.max(activityAt, presence.enteredAt, presence.lastSpokeAt ?? 0);
    const timer = setTimeout(() => {
      this.#timers.delete(id);
      const current = this.read(id);
      if (current?.areaId !== 'pet') return;
      const latest = Math.max(lastAction, current.lastSpokeAt ?? 0);
      if (this.now() < latest + IDLE_MS) this.touch(id, latest);
      else this.leave(id);
    }, Math.max(0, lastAction + IDLE_MS - this.now()));
    timer.unref?.();
    this.#timers.set(id, timer);
  }
  cancel(id: string): void {
    const timer = this.#timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.#timers.delete(id);
  }
  close(): void { for (const id of this.#timers.keys()) this.cancel(id); }
}
