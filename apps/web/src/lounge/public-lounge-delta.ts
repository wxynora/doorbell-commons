import type { LoungeSnapshot, LoungeSnapshotDelta } from "@doorbell/protocol";

function compareSequence<T extends { sequence: number }>(left: T, right: T): number {
  return left.sequence - right.sequence;
}

function mergeMessages(
  snapshot: LoungeSnapshot,
  delta: LoungeSnapshotDelta,
): LoungeSnapshot["messages"] {
  if (delta.append_messages === undefined && delta.withdrawn_message_ids === undefined) {
    return snapshot.messages;
  }
  const messages = new Map(snapshot.messages.map((message) => [message.message_id, message]));
  for (const message of delta.append_messages ?? []) messages.set(message.message_id, message);
  for (const messageId of delta.withdrawn_message_ids ?? []) messages.delete(messageId);
  return [...messages.values()].sort(
    (left, right) =>
      compareSequence(left, right) || left.message_id.localeCompare(right.message_id),
  );
}

function mergeActivities(
  snapshot: LoungeSnapshot,
  delta: LoungeSnapshotDelta,
): LoungeSnapshot["activities"] {
  if (delta.append_activities === undefined) return snapshot.activities;
  const appended = delta.append_activities;
  if (appended.length === 0) return snapshot.activities;
  let previous = snapshot.activities.at(-1)?.sequence ?? -1;
  const appendedIds = new Set(appended.map(activity => activity.activity_id));
  const freshTail = appendedIds.size === appended.length && appended.every(activity => {
    const follows = activity.sequence > previous;
    previous = activity.sequence;
    return follows;
  });
  if (freshTail && !snapshot.activities.some(activity => appendedIds.has(activity.activity_id))) {
    return [...snapshot.activities, ...appended];
  }
  const activities = new Map(
    snapshot.activities.map((activity) => [activity.activity_id, activity]),
  );
  for (const activity of appended) activities.set(activity.activity_id, activity);
  return [...activities.values()].sort(
    (left, right) =>
      compareSequence(left, right) || left.activity_id.localeCompare(right.activity_id),
  );
}

export function mergeLoungeSnapshotDelta(
  snapshot: LoungeSnapshot,
  delta: LoungeSnapshotDelta,
): LoungeSnapshot {
  const messages = mergeMessages(snapshot, delta);
  const activities = mergeActivities(snapshot, delta);
  return {
    ...snapshot,
    server_time: delta.server_time,
    ...(delta.residents === undefined ? {} : { residents: delta.residents }),
    ...(delta.tables === undefined ? {} : { tables: delta.tables }),
    ...(delta.presence === undefined ? {} : { presence: delta.presence }),
    messages,
    activities,
  };
}
