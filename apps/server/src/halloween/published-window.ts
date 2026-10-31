const DURATION_MS = 72 * 60 * 60 * 1000;

export interface HalloweenReleaseWindow {
  opensAt: number;
  closesAt: number;
}

export function halloweenReleaseWindow(publishedAt: number | null): HalloweenReleaseWindow | null {
  if (!Number.isSafeInteger(publishedAt) || publishedAt === null || publishedAt <= 0) return null;
  const closesAt = publishedAt + DURATION_MS;
  if (!Number.isSafeInteger(closesAt)) return null;
  return { opensAt: publishedAt, closesAt };
}

export function isHalloweenOpen(publishedAt: number | null, now: number): boolean {
  const window = halloweenReleaseWindow(publishedAt);
  return window !== null && Number.isSafeInteger(now) && now >= window.opensAt && now < window.closesAt;
}
