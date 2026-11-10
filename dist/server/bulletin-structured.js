import { createHash } from "node:crypto";
import { projectFarmGrowth } from "../engine.js";
import { projectHealthBulletinNotices } from "./bulletin-health-notices.js";
import { taskView } from "../tasks.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const TASK_UNAVAILABLE_MESSAGE = "任务槽没有可供叮咚播报确认的持久化进行中任务。";
const PLOTS_UNAVAILABLE_MESSAGE = "地块状态没有可供叮咚播报读取的持久化数据。";
const MESSAGES_UNAVAILABLE_MESSAGE = "留言板没有可供叮咚播报读取的持久化数据。";
const RANCH_NOTICES_UNAVAILABLE_MESSAGE = "牧场通知没有可供叮咚播报读取的持久化数据。";
const TRAIL_KINDS = new Set(["watered", "stolen", "foiled"]);
const TRAIL_LIMIT = 20;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInt(value, fallback = null) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function nullableText(value) {
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

function nullableIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

function opaqueRevision(value) {
  return `farm-bulletin-v1:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex")}`;
}

function reminderKey(section, value) {
  return `farm-bulletin-reminder-v1:${createHash("sha256")
    .update(JSON.stringify(canonicalize({ section, value })), "utf8")
    .digest("hex")}`;
}

function acknowledgedReminderKeys(farm) {
  const values = farm?.doorbellHumanBulletinReadState?.acknowledged_reminder_keys;
  return new Set(
    Array.isArray(values)
      ? values.filter(
          (value) =>
            typeof value === "string" &&
            /^farm-bulletin-reminder-v1:[0-9a-f]{64}$/.test(value),
        )
      : [],
  );
}

function seenTrailEventId(farm) {
  const value = farm?.doorbellHumanBulletinReadState?.trail_seen_event_id;
  return typeof value === "string" && value.trim() ? value : null;
}

function unavailable(reason, message) {
  return { reason, message };
}

function projectTask(farm, now) {
  if (!isRecord(farm.task)) {
    return { available: false, unavailable: unavailable("not_initialized", TASK_UNAVAILABLE_MESSAGE) };
  }

  const raw = farm.task;
  if (raw.accepted !== true) {
    if (raw.accepted === false) return { available: true, entries: [] };
    return {
      available: false,
      unavailable: unavailable("invalid_persisted_state", "任务槽的接取状态无法安全读取。"),
    };
  }

  const completedAt = raw.completedAt;
  if (completedAt !== undefined && completedAt !== null) {
    if (!Number.isFinite(completedAt)) {
      return {
        available: false,
        unavailable: unavailable("invalid_persisted_state", "任务槽的完成状态无法安全读取。"),
      };
    }
    return { available: true, entries: [] };
  }

  // taskView only formats the persisted task; unlike tickTask it does not
  // create, expire, or replace an offer.
  const view = taskView(farm, now);
  const kind = typeof view?.kind === "string" && view.kind.trim() ? view.kind : null;
  const description = typeof view?.desc === "string" && view.desc.trim() ? view.desc : null;
  const progress = nonNegativeInt(view?.progress);
  const target = nonNegativeInt(view?.target);
  const reward = nonNegativeInt(view?.reward);
  const currency = view?.currency === "coin" || view?.currency === "silver" ? view.currency : null;

  // Unknown persisted task kinds are not turned into human-facing labels by
  // echoing the opaque kind.  They remain an unavailable section instead.
  if (
    !kind
    || !description
    || description === kind
    || progress === null
    || target === null
    || target <= 0
    || progress > target
    || reward === null
    || !currency
  ) {
    return {
      available: false,
      unavailable: unavailable("invalid_persisted_state", "进行中任务的持久化字段无法安全读取。"),
    };
  }

  const entry = {
    available: true,
    entries: [{ kind, description, progress, target, reward, currency }],
  };
  entry.entries[0].reminder_key = reminderKey("task", {
    entry: entry.entries[0],
    sequence: nonNegativeInt(raw.seq),
    offered_at: nullableIso(raw.offeredAt),
  });
  return entry;
}

function projectMaturePlots(farm, now) {
  if (!Array.isArray(farm.plots)) {
    return { available: false, unavailable: unavailable("not_initialized", PLOTS_UNAVAILABLE_MESSAGE) };
  }
  if (!Number.isFinite(Number(farm.lastTickAt))) {
    return {
      available: false,
      unavailable: unavailable("invalid_persisted_state", "地块生长时钟的持久化字段无法安全读取。"),
    };
  }

  try {
    const { plots } = projectFarmGrowth(farm, now);
    const entries = plots
      .filter(({id, crop}) => Number.isSafeInteger(id) && id > 0 && crop &&
        (crop.ripe || crop.progress >= crop.growTicks))
      .map(({id, crop}) => ({
        plot_id: id,
        seed_type: crop.seedType === "common" || crop.seedType === "fantasy" || crop.seedType === "limited"
          ? crop.seedType
          : null,
        watered: nonNegativeInt(crop.waterCount, 0),
      }))
      .sort((left, right) => left.plot_id - right.plot_id);
    for (const entry of entries) {
      const rawPlot = farm.plots.find((plot) => plot?.id === entry.plot_id);
      entry.reminder_key = reminderKey("mature_plot", {
        entry,
        crop: rawPlot?.crop ?? null,
        harvest_generation: nonNegativeInt(farm.harvested, 0),
        stolen_generation: nonNegativeInt(farm.gotStolen, 0),
      });
    }
    return { available: true, entries };
  } catch {
    return {
      available: false,
      unavailable: unavailable("invalid_persisted_state", "地块持久化状态无法安全投影为成熟播报。"),
    };
  }
}

function projectMessage(message) {
  if (!isRecord(message) || typeof message.text !== "string" || !message.text.trim()) return null;
  const author = typeof message.by === "string" && FARM_DOORPLATE_RE.test(message.by) ? message.by : null;
  const entry = {
    id: typeof message.id === "string" && message.id ? message.id : null,
    author_farm_doorplate: author,
    author_name: nullableText(message.name),
    text: message.text,
    at: nullableIso(message.at),
  };
  return { ...entry, reminder_key: reminderKey("message", entry) };
}

function projectMessages(farm) {
  if (!Array.isArray(farm.messages)) {
    return { available: false, unavailable: unavailable("not_initialized", MESSAGES_UNAVAILABLE_MESSAGE) };
  }
  const entries = farm.messages
    .slice(-10)
    .reverse()
    .map(projectMessage)
    .filter(Boolean);
  return { available: true, entries };
}

function projectRanchNotice(notice) {
  if (!isRecord(notice) || typeof notice.text !== "string" || !notice.text.trim()) return null;
  const entry = {
    text: notice.text,
    at: nullableIso(notice.at),
    section: nullableText(notice.section),
  };
  return { ...entry, reminder_key: reminderKey("ranch_notification", entry) };
}

function projectRanchNotifications(farm) {
  if (!isRecord(farm.ranch) && !Array.isArray(farm.plots)) {
    return {
      available: false,
      unavailable: unavailable("not_initialized", RANCH_NOTICES_UNAVAILABLE_MESSAGE),
    };
  }
  // The queue is created lazily by pushRanchNotice. A valid field can also
  // have health notices before its owner has opened a ranch.
  if (farm.ranch?.notices !== undefined && !Array.isArray(farm.ranch.notices)) {
    return {
      available: false,
      unavailable: unavailable("invalid_persisted_state", RANCH_NOTICES_UNAVAILABLE_MESSAGE),
    };
  }
  const entries = (farm.ranch?.notices ?? [])
    .slice(-10)
    .reverse()
    .map(projectRanchNotice)
    .filter(Boolean);
  for (const notice of projectHealthBulletinNotices(farm)) {
    entries.push({
      ...projectRanchNotice(notice),
      reminder_key: reminderKey("health_notification", notice.identity),
    });
  }
  entries.sort((left, right) => Date.parse(right.at ?? "") - Date.parse(left.at ?? "") || 0);
  return { available: true, entries };
}

function projectTrailEntry(entry) {
  if (
    !isRecord(entry) ||
    typeof entry.eventId !== "string" ||
    !entry.eventId.trim() ||
    !TRAIL_KINDS.has(entry.kind) ||
    typeof entry.by !== "string" ||
    !entry.by.trim() ||
    !Number.isSafeInteger(entry.plotId) ||
    entry.plotId <= 0
  ) {
    return null;
  }
  const at = nullableIso(entry.t);
  if (!at) return null;
  return {
    event_id: entry.eventId,
    kind: entry.kind,
    actor_name: entry.by,
    actor_farm_doorplate:
      typeof entry.actorFarmId === "string" && FARM_DOORPLATE_RE.test(entry.actorFarmId)
        ? entry.actorFarmId
        : null,
    plot_id: entry.plotId,
    crop_name: entry.kind === "stolen" ? nullableText(entry.crop) : null,
    at,
  };
}

function projectTrail(farm) {
  if (farm.trail !== undefined && !Array.isArray(farm.trail)) {
    return {
      status: "unavailable",
      reason: "invalid_persisted_state",
      message: "农场足迹的持久化字段无法安全读取。",
    };
  }
  const entries = (farm.trail ?? []).slice(0, TRAIL_LIMIT).map(projectTrailEntry).filter(Boolean);
  return { status: "available", entries, has_unread: false };
}

function withTrailUnread(trail, farm) {
  if (trail.status !== "available") return trail;
  const newestEventId = trail.entries[0]?.event_id ?? null;
  return {
    ...trail,
    has_unread: newestEventId !== null && newestEventId !== seenTrailEventId(farm),
  };
}

function addSection(available, unavailableSections, key, result) {
  if (result.available) available[key] = result.entries;
  else unavailableSections[key] = result.unavailable;
}

/**
 * Project only the farm facts that the Doorbell ding-dong bulletin may read.
 * All sections are read-only; time-based maturity is delegated to the pure
 * Human field projection without mutating the persisted farm.
 */
export function projectHumanBulletinSource(farm, now = Date.now()) {
  if (!isRecord(farm)) throw new TypeError("Farm bulletin requires a farm");
  const timestamp = Number.isFinite(now) ? now : Date.now();
  const subject = { farm_doorplate: String(farm.id ?? "") };
  const available = {};
  const unavailableSections = {};

  addSection(available, unavailableSections, "tasks", projectTask(farm, timestamp));
  addSection(available, unavailableSections, "mature_plots", projectMaturePlots(farm, timestamp));
  addSection(available, unavailableSections, "messages", projectMessages(farm));
  addSection(available, unavailableSections, "ranch_notifications", projectRanchNotifications(farm));

  const data = { available, unavailable: unavailableSections, trail: projectTrail(farm) };
  return {
    subject,
    data,
    revision: opaqueRevision({ subject, data }),
    server_time: new Date(timestamp).toISOString(),
  };
}

export function projectHumanBulletin(farm, now = Date.now()) {
  const source = projectHumanBulletinSource(farm, now);
  const acknowledged = acknowledgedReminderKeys(farm);
  const available = {};
  for (const [section, entries] of Object.entries(source.data.available)) {
    available[section] = entries
      .filter((entry) => !acknowledged.has(entry.reminder_key))
      .map(({ reminder_key: _reminderKey, ...entry }) => entry);
  }
  return {
    ...source,
    data: {
      available,
      unavailable: source.data.unavailable,
      trail: withTrailUnread(source.data.trail, farm),
    },
  };
}

export const projectFarmBulletin = projectHumanBulletin;
export const readHumanBulletin = projectHumanBulletin;
