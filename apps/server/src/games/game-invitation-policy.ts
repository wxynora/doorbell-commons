import type { GamePreferences } from "@doorbell/protocol";

const BEIJING_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function beijingMinuteOfDay(at: number): number {
  const parts = BEIJING_CLOCK.formatToParts(new Date(at));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

function clockMinuteOfDay(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function isWithinQuietHours(current: number, start: number, end: number): boolean {
  if (start < end) return current >= start && current < end;
  if (start > end) return current >= start || current < end;
  return false;
}

export function acceptsGameInvitation(
  preferences: GamePreferences | null | undefined,
  at: number,
): boolean {
  if (!preferences || !preferences.invitations_enabled) return false;
  if (!preferences.quiet_hours_enabled) return true;

  const current = beijingMinuteOfDay(at);
  return !preferences.quiet_hours.some((range) =>
    isWithinQuietHours(current, clockMinuteOfDay(range.start), clockMinuteOfDay(range.end)),
  );
}
