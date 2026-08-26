import { createHash } from "node:crypto";
import { projectHumanField } from "./human-structured.js";
import { taskView } from "../tasks.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const TASK_UNAVAILABLE_MESSAGE = "任务槽没有可供叮咚播报确认的持久化进行中任务。";
const PLOTS_UNAVAILABLE_MESSAGE = "地块状态没有可供叮咚播报读取的持久化数据。";
const MESSAGES_UNAVAILABLE_MESSAGE = "留言板没有可供叮咚播报读取的持久化数据。";
const RANCH_NOTICES_UNAVAILABLE_MESSAGE = "牧场通知没有可供叮咚播报读取的持久化数据。";

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

  return {
    available: true,
    entries: [{ kind, description, progress, target, reward, currency }],
  };
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
    // The Human field projector is the existing pure authority for lazy crop
    // growth.  It advances only a clone internally, so this read does not
    // mutate the persisted farm or duplicate the growth rule here.
    const field = projectHumanField(farm, now);
    const plots = field?.data?.plots;
    if (!Array.isArray(plots)) {
      return {
        available: false,
        unavailable: unavailable("invalid_projection", "地块纯投影没有可供叮咚播报读取的成熟状态。"),
      };
    }
    const entries = plots
      .filter((plot) => isRecord(plot) && plot.state === "ripe" && Number.isSafeInteger(plot.plot_id) && plot.plot_id > 0)
      .map((plot) => ({
        plot_id: plot.plot_id,
        seed_type: plot.seed_type === "common" || plot.seed_type === "fantasy" || plot.seed_type === "limited"
          ? plot.seed_type
          : null,
        watered: nonNegativeInt(plot.watered, 0),
      }))
      .sort((left, right) => left.plot_id - right.plot_id);
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
  return {
    id: typeof message.id === "string" && message.id ? message.id : null,
    author_farm_doorplate: author,
    author_name: nullableText(message.name),
    text: message.text,
    at: nullableIso(message.at),
  };
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
  return {
    text: notice.text,
    at: nullableIso(notice.at),
    section: nullableText(notice.section),
  };
}

function projectRanchNotifications(farm) {
  if (!isRecord(farm.ranch) || !Array.isArray(farm.ranch.notices)) {
    return {
      available: false,
      unavailable: unavailable("not_initialized", RANCH_NOTICES_UNAVAILABLE_MESSAGE),
    };
  }
  const entries = farm.ranch.notices
    .slice(-10)
    .reverse()
    .map(projectRanchNotice)
    .filter(Boolean);
  return { available: true, entries };
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
export function projectHumanBulletin(farm, now = Date.now()) {
  if (!isRecord(farm)) throw new TypeError("Farm bulletin requires a farm");
  const timestamp = Number.isFinite(now) ? now : Date.now();
  const subject = { farm_doorplate: String(farm.id ?? "") };
  const available = {};
  const unavailableSections = {};

  addSection(available, unavailableSections, "tasks", projectTask(farm, timestamp));
  addSection(available, unavailableSections, "mature_plots", projectMaturePlots(farm, timestamp));
  addSection(available, unavailableSections, "messages", projectMessages(farm));
  addSection(available, unavailableSections, "ranch_notifications", projectRanchNotifications(farm));

  const data = { available, unavailable: unavailableSections };
  return {
    subject,
    data,
    revision: opaqueRevision({ subject, data }),
    server_time: new Date(timestamp).toISOString(),
  };
}

export const projectFarmBulletin = projectHumanBulletin;
export const readHumanBulletin = projectHumanBulletin;
