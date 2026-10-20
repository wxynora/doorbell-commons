import type { BellWakeSource, BellWakeSourceRecord } from "../bell-service.js";
import type { CommunityDatabase } from "../community-database.js";
import type { SnowActivity, SnowNotice } from "./contracts.js";

export function togetherBellSource(
  activity: SnowActivity,
  database: CommunityDatabase,
): BellWakeSource {
  const find = (residentId: string, id: string) =>
    activity
      .controlView()
      ?.notices.find(
        (notice) => notice.residentId === residentId && `together:${notice.id}` === id,
      );
  const project = (notice: SnowNotice): BellWakeSourceRecord | undefined => {
    const identity = database.findTogetherIdentity(notice.residentId);
    if (!identity || !notice.letterId) return undefined;
    const letter = database.findMailboxLetter(identity.homeId, "resident", notice.letterId);
    if (!letter) return undefined;
    return {
      wakeId: `together:${notice.id}`,
      residentId: notice.residentId,
      reason: "together",
      status: notice.status,
      createdAt: notice.createdAt,
      endedAt: notice.endedAt ?? null,
      blockReason: notice.blockReason ?? null,
      errorCode: notice.errorCode ?? null,
      purchaseRequestId: null,
      letterId: notice.letterId,
      payload: { text: letter.body },
    };
  };
  return {
    listPending(residentId) {
      return (activity.controlView()?.notices ?? [])
        .filter((notice) => notice.residentId === residentId && notice.status === "pending")
        .flatMap((notice) => {
          const wake = project(notice);
          return wake ? [wake] : [];
        });
    },
    get(residentId, id) {
      const notice = find(residentId, id);
      return notice ? project(notice) : undefined;
    },
    acknowledge(residentId, id, now) {
      const notice = find(residentId, id);
      if (!notice) return "missing";
      const result = activity.finishNotice(notice.id, "acked", now);
      return result === "changed" ? "acked" : result;
    },
    block(residentId, id, now, blockReason, errorCode) {
      const notice = find(residentId, id);
      if (!notice) return "missing";
      const result = activity.finishNotice(notice.id, "blocked", now, blockReason, errorCode);
      return result === "changed" ? "blocked" : result;
    },
    cancel(residentId, id, now) {
      const notice = find(residentId, id);
      const changed = notice && activity.finishNotice(notice.id, "cancelled", now) === "changed";
      return {
        residentId: notice ? residentId : null,
        cancelledWakeId: changed ? id : null,
        cancelledWakeIds: changed ? [id] : [],
      };
    },
  };
}
