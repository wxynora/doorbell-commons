import type { FarmActionListSchedule } from "@doorbell/protocol";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class FarmActionListScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmActionListScheduleError";
  }
}

function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function nextDailyWindowTriggerAt(
  schedule: Extract<FarmActionListSchedule, { kind: "daily_window" }>,
  after: number,
): number {
  const local = new Date(after + BEIJING_OFFSET_MS);
  const dayStart =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BEIJING_OFFSET_MS;
  const start = dayStart + minuteOfDay(schedule.start_time) * 60_000;
  const end = dayStart + minuteOfDay(schedule.end_time) * 60_000;
  const interval = schedule.interval_minutes * 60_000;
  if (after <= start) return start;
  if (after < end) {
    const candidate = start + (Math.floor((after - start) / interval) + 1) * interval;
    if (candidate <= end) return candidate;
  }
  return start + DAY_MS;
}

export function nextFarmActionListTriggerAt(
  schedule: FarmActionListSchedule | null,
  enabled: boolean,
  after: number,
): number | null {
  if (!enabled || !schedule) return null;
  if (schedule.kind === "daily_window") return nextDailyWindowTriggerAt(schedule, after);
  const triggerAt = Date.parse(schedule.trigger_at);
  if (!Number.isFinite(triggerAt) || triggerAt <= after) {
    throw new FarmActionListScheduleError("A one-time action list must use a future trigger time");
  }
  return triggerAt;
}
