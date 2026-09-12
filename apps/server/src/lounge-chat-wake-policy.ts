import type { LoungeChatMode, LoungeChatSession } from "./lounge-chat-session-store.js";

export const LOUNGE_CHAT_MINUTE_MS = 60_000;
export const LOUNGE_CHAT_DEFAULT_DURATION_MINUTES = 15 as const;
export const LOUNGE_CHAT_DURATION_MINUTES = [5, 15, 30, 60] as const;

export type LoungeChatDurationMinutes = (typeof LOUNGE_CHAT_DURATION_MINUTES)[number];
export type LoungeChatWakeMode = LoungeChatMode;
export type LoungeChatWakeSession = Pick<
  LoungeChatSession,
  "enteredAt" | "expiresAt" | "mode" | "lastWakeAt" | "lastDeliveredSequence"
>;

export interface LoungeChatWakeMessages {
  latestSequence: number;
  lastMessageAt: number | null;
  /** Supplied by the caller from trusted reply/mention facts; never inferred here. */
  hasDirectedMessage: boolean;
}

export interface LoungeChatWakePolicyInput {
  now: number;
  session: LoungeChatWakeSession;
  messages: LoungeChatWakeMessages;
}

export interface LoungeChatWakeDecision {
  due: boolean;
  /** The earliest eligible wake instant. When due is true this equals now. */
  nextDueAt: number | null;
}

const WAKE_INTERVAL_MS: Record<LoungeChatWakeMode, number> = {
  proactive: LOUNGE_CHAT_MINUTE_MS,
  natural: 3 * LOUNGE_CHAT_MINUTE_MS,
  listening: 3 * LOUNGE_CHAT_MINUTE_MS,
  passive: LOUNGE_CHAT_MINUTE_MS,
};

function noWake(): LoungeChatWakeDecision {
  return { due: false, nextDueAt: null };
}

function schedule(now: number, expiresAt: number, eligibleAt: number): LoungeChatWakeDecision {
  // Expiry is exclusive. A wake scheduled at or after expiry is discarded.
  if (eligibleAt >= expiresAt) return noWake();
  if (eligibleAt <= now) return { due: true, nextDueAt: now };
  return { due: false, nextDueAt: eligibleAt };
}

/** Return the approved duration, defaulting to the approved 15-minute session. */
export function normalizeLoungeChatDurationMinutes(
  durationMinutes?: number,
): LoungeChatDurationMinutes {
  const resolved = durationMinutes ?? LOUNGE_CHAT_DEFAULT_DURATION_MINUTES;
  if (!LOUNGE_CHAT_DURATION_MINUTES.includes(resolved as LoungeChatDurationMinutes)) {
    throw new RangeError("Unsupported chat duration");
  }
  return resolved as LoungeChatDurationMinutes;
}

/** Compute the session deadline without persisting anything or starting a timer. */
export function getLoungeChatExpiresAt(enteredAt: number, durationMinutes?: number): number {
  return enteredAt + normalizeLoungeChatDurationMinutes(durationMinutes) * LOUNGE_CHAT_MINUTE_MS;
}

/**
 * Decide whether the current trusted room facts justify one chat wake.
 *
 * The caller records a successful wake separately. This function has no Bell,
 * database, timer, or message-text behavior.
 */
export function evaluateLoungeChatWake(input: LoungeChatWakePolicyInput): LoungeChatWakeDecision {
  const { now, session, messages } = input;

  // A session is active only from entry through the instant before expiry.
  if (now < session.enteredAt || now >= session.expiresAt) return noWake();

  // Sequence is the authoritative new-message boundary. A directed fact alone
  // cannot wake a session when no unread room message exists.
  if (messages.latestSequence <= session.lastDeliveredSequence) return noWake();

  // A new sequence without a message timestamp is not schedulable. Trusted
  // callers should provide the timestamp for every new sequence.
  if (messages.lastMessageAt === null) return noWake();

  // A future timestamp is held until that message is actually available.
  const messageAvailableAt = Math.max(now, messages.lastMessageAt);
  const lastWakeAt = session.lastWakeAt;

  switch (session.mode) {
    case "proactive": {
      const spacingAt = lastWakeAt === null ? now : lastWakeAt + WAKE_INTERVAL_MS.proactive;
      return schedule(now, session.expiresAt, Math.max(messageAvailableAt, spacingAt));
    }
    case "natural": {
      // The first three-minute window starts at entry. Once a wake exists,
      // each later window starts at that wake rather than at the old entry.
      const windowStartAt = lastWakeAt ?? session.enteredAt;
      const windowEndsAt = windowStartAt + WAKE_INTERVAL_MS.natural;
      return schedule(now, session.expiresAt, Math.max(messageAvailableAt, windowEndsAt));
    }
    case "listening": {
      const spacingAt = lastWakeAt === null ? now : lastWakeAt + WAKE_INTERVAL_MS.listening;
      const quietAt = messages.lastMessageAt + LOUNGE_CHAT_MINUTE_MS;
      return schedule(now, session.expiresAt, Math.max(messageAvailableAt, quietAt, spacingAt));
    }
    case "passive": {
      // The caller supplies this trusted aggregate from reply/mention ownership.
      if (!messages.hasDirectedMessage) return noWake();
      const spacingAt = lastWakeAt === null ? now : lastWakeAt + WAKE_INTERVAL_MS.passive;
      return schedule(now, session.expiresAt, Math.max(messageAvailableAt, spacingAt));
    }
  }
}
