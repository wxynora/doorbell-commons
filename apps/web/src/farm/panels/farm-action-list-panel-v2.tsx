import type {
  FarmActionList,
  FarmActionListActivityOption,
  FarmActionListItem,
  FarmActionListItemKind,
  FarmActionListSchedule,
} from "@doorbell/protocol";
import { useCallback, useEffect, useState } from "react";
import {
  createFarmActionList,
  deleteFarmActionList,
  farmActionListIssueMessage,
  getFarmActionList,
  getFarmActionListOptions,
  notifyFarmActionList,
  updateFarmActionList,
} from "../../auth/farm-action-list-client";
import { formatActionListDateInput, formatActionListTimeInput } from "./farm-action-list-input";
import "./farm-action-list-panel-v2.css";

const LABELS: Readonly<Record<FarmActionListItemKind, string>> = {
  harvest: "收菜",
  plant: "种菜",
  buy: "购买",
  steal: "偷菜",
  water: "帮邻居浇水",
  fish: "钓鱼",
  explore: "探险",
  cook: "做饭",
  activity: "参加活动",
  note: "自由备注",
};

type ScheduleMode = "none" | FarmActionListSchedule["kind"];

interface ListDraft {
  listId: string | null;
  expectedRevision: number;
  name: string;
  enabled: boolean;
  mode: ScheduleMode;
  onceAt: string;
  startTime: string;
  endTime: string;
  intervalMinutes: string;
  items: FarmActionListItem[];
}

function newItem(
  kind: FarmActionListItemKind,
  activities: readonly FarmActionListActivityOption[],
) {
  const base = { item_id: crypto.randomUUID() };
  if (kind === "plant") return { ...base, kind, details: undefined } as const;
  if (kind === "buy") return { ...base, kind, details: "" } as const;
  if (kind === "activity") {
    return { ...base, kind, activity_id: activities[0]?.activity_id ?? "" } as const;
  }
  if (kind === "note") return { ...base, kind, text: "" } as const;
  return { ...base, kind } as FarmActionListItem;
}

function localDateTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidLocalDateTime(value: string): boolean {
  const [date, time, extra] = value.split("T");
  return extra === undefined && isValidDate(date ?? "") && TIME_PATTERN.test(time ?? "");
}

function emptyDraft(): ListDraft {
  return {
    listId: null,
    expectedRevision: 0,
    name: "",
    enabled: true,
    mode: "daily_window",
    onceAt: "",
    startTime: "09:00",
    endTime: "21:00",
    intervalMinutes: "120",
    items: [],
  };
}

function draftFromList(list: FarmActionList): ListDraft {
  return {
    listId: list.list_id,
    expectedRevision: list.revision,
    name: list.name,
    enabled: list.enabled,
    mode: list.schedule?.kind ?? "none",
    onceAt: list.schedule?.kind === "once" ? localDateTime(list.schedule.trigger_at) : "",
    startTime: list.schedule?.kind === "daily_window" ? list.schedule.start_time : "09:00",
    endTime: list.schedule?.kind === "daily_window" ? list.schedule.end_time : "21:00",
    intervalMinutes:
      list.schedule?.kind === "daily_window" ? String(list.schedule.interval_minutes) : "120",
    items: list.items.map((entry) => entry.item),
  };
}

function scheduleFromDraft(draft: ListDraft): FarmActionListSchedule | null {
  if (draft.mode === "none") return null;
  if (draft.mode === "once") {
    return { kind: "once", trigger_at: new Date(draft.onceAt).toISOString() };
  }
  return {
    kind: "daily_window",
    start_time: draft.startTime,
    end_time: draft.endTime,
    interval_minutes: Number(draft.intervalMinutes),
  };
}

function scheduleLabel(list: FarmActionList): string {
  if (!list.schedule) return "";
  if (list.schedule.kind === "once") {
    return `一次 · ${new Date(list.schedule.trigger_at).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return `每天 ${list.schedule.start_time}—${list.schedule.end_time} · 每 ${list.schedule.interval_minutes} 分钟`;
}

function itemText(item: FarmActionListItem, activities: readonly FarmActionListActivityOption[]) {
  if (item.kind === "plant") return item.details ? `种菜：${item.details}` : "种菜";
  if (item.kind === "buy") return `购买：${item.details || "未填写"}`;
  if (item.kind === "activity") {
    return `参加活动：${activities.find((entry) => entry.activity_id === item.activity_id)?.name ?? "当前活动"}`;
  }
  if (item.kind === "note") return item.text || "自由备注";
  return LABELS[item.kind];
}

const DEMO_LISTS = (activities: readonly FarmActionListActivityOption[]): FarmActionList[] => [
  {
    list_id: "00000000-0000-4000-8000-000000000501",
    revision: 1,
    name: "每日活跃",
    enabled: true,
    schedule: {
      kind: "daily_window",
      start_time: "09:00",
      end_time: "21:00",
      interval_minutes: 120,
    },
    next_trigger_at: null,
    items: [
      {
        item: { item_id: "00000000-0000-4000-8000-000000000511", kind: "harvest" },
        status: "active",
        reason: null,
        display_text: "收菜",
      },
      {
        item: { item_id: "00000000-0000-4000-8000-000000000512", kind: "plant" },
        status: "active",
        reason: null,
        display_text: "种菜",
      },
      {
        item: { item_id: "00000000-0000-4000-8000-000000000513", kind: "explore" },
        status: "active",
        reason: null,
        display_text: "探险",
      },
    ],
    checked_at: null,
    last_notification: null,
  },
  {
    list_id: "00000000-0000-4000-8000-000000000502",
    revision: 1,
    name: "睡前收尾",
    enabled: false,
    schedule: null,
    next_trigger_at: null,
    items: [
      {
        item: { item_id: "00000000-0000-4000-8000-000000000521", kind: "cook" },
        status: "active",
        reason: null,
        display_text: "做饭",
      },
      {
        item: {
          item_id: "00000000-0000-4000-8000-000000000522",
          kind: "activity",
          activity_id: activities[0]?.activity_id ?? "glimmer",
        },
        status: "active",
        reason: null,
        display_text: "参加活动",
      },
    ],
    checked_at: null,
    last_notification: null,
  },
];

export function FarmActionListPanelV2({
  onBack,
  visible = true,
  preview = false,
  previewActivityOptions = [],
}: {
  onBack: () => void;
  visible?: boolean;
  preview?: boolean;
  previewActivityOptions?: readonly FarmActionListActivityOption[];
}) {
  const [lists, setLists] = useState<FarmActionList[]>(() =>
    preview ? DEMO_LISTS(previewActivityOptions) : [],
  );
  const [activities, setActivities] =
    useState<readonly FarmActionListActivityOption[]>(previewActivityOptions);
  const [draft, setDraft] = useState<ListDraft | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(preview ? "" : "正在读取清单…");

  const load = useCallback(async () => {
    const [listResult, optionResult] = await Promise.all([
      getFarmActionList(),
      getFarmActionListOptions(),
    ]);
    if (!listResult.ok) return setStatus(farmActionListIssueMessage(listResult.issue));
    setLists(listResult.data.lists);
    if (optionResult.ok) setActivities(optionResult.data.activities);
    setStatus("");
  }, []);

  useEffect(() => {
    if (!preview && visible) void load();
  }, [load, preview, visible]);

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setStatus("请填写清单名称");
    if (draft.mode === "once" && !isValidLocalDateTime(draft.onceAt)) {
      return setStatus("日期请输入 8 位数字（如 20260901），时间请输入 4 位数字（如 0930）");
    }
    if (draft.mode === "daily_window") {
      if (!TIME_PATTERN.test(draft.startTime) || !TIME_PATTERN.test(draft.endTime)) {
        return setStatus("开始和结束时间请按 24 小时制 HH:mm 填写");
      }
      if (draft.startTime >= draft.endTime) return setStatus("结束时间要晚于开始时间");
      const interval = Number(draft.intervalMinutes);
      if (!Number.isInteger(interval) || interval < 1 || interval > 1_440) {
        return setStatus("间隔请填写 1—1440 之间的整数分钟");
      }
    }
    const request = {
      name: draft.name,
      enabled: draft.enabled,
      schedule: scheduleFromDraft(draft),
      items: draft.items,
    };
    setBusy(true);
    try {
      if (preview) {
        const list: FarmActionList = {
          list_id: draft.listId ?? crypto.randomUUID(),
          revision: draft.expectedRevision + 1,
          ...request,
          next_trigger_at: null,
          items: draft.items.map((item) => ({
            item,
            status: "active",
            reason: null,
            display_text: itemText(item, activities),
          })),
          checked_at: null,
          last_notification: null,
        };
        setLists((current) => [list, ...current.filter((entry) => entry.list_id !== list.list_id)]);
        setDraft(null);
        return;
      }
      const result = draft.listId
        ? await updateFarmActionList(draft.listId, {
            ...request,
            expected_revision: draft.expectedRevision,
          })
        : await createFarmActionList(request);
      if (!result.ok) return setStatus(farmActionListIssueMessage(result.issue));
      await load();
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const removeList = async (list: FarmActionList) => {
    if (preview) return setLists((current) => current.filter((entry) => entry !== list));
    const result = await deleteFarmActionList(list.list_id, list.revision);
    if (!result.ok) return setStatus(farmActionListIssueMessage(result.issue));
    await load();
  };

  const toggleList = async (list: FarmActionList) => {
    if (preview) {
      setLists((current) =>
        current.map((entry) =>
          entry.list_id === list.list_id ? { ...entry, enabled: !entry.enabled } : entry,
        ),
      );
      return;
    }
    const result = await updateFarmActionList(list.list_id, {
      expected_revision: list.revision,
      name: list.name,
      enabled: !list.enabled,
      schedule: list.schedule,
      items: list.items.map((entry) => entry.item),
    });
    if (!result.ok) return setStatus(farmActionListIssueMessage(result.issue));
    await load();
  };

  const notifyList = async (list: FarmActionList) => {
    if (preview) return setStatus("预览模式不会真的发铃");
    const result = await notifyFarmActionList(list.list_id, crypto.randomUUID());
    if (!result.ok) return setStatus(farmActionListIssueMessage(result.issue));
    setStatus(result.data.notification_status === "sent" ? "已发铃" : "没有需要执行的事项");
    await load();
  };

  const addItem = (kind: FarmActionListItemKind) => {
    setDraft((current) =>
      current ? { ...current, items: [...current.items, newItem(kind, activities)] } : current,
    );
    setAddMenuOpen(false);
  };

  return (
    <section aria-label="喊 TA 来做" className="farm-action-lists-v2" hidden={!visible}>
      <header>
        <button
          aria-label={draft ? "返回清单总览" : "返回农场"}
          className="farm-action-lists-v2__back"
          onClick={() => (draft ? setDraft(null) : onBack())}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <small>ACTION LISTS</small>
          <h2>{draft ? (draft.listId ? "编辑清单" : "新建清单") : "喊 TA 来做"}</h2>
          <p>{draft ? "设置这张清单要提醒 TA 做的事。" : "把常用提醒分成几张清单卡。"}</p>
        </div>
        {!draft ? (
          <button
            aria-label="新建清单"
            className="farm-action-lists-v2__new"
            onClick={() => setDraft(emptyDraft())}
            type="button"
          >
            +
          </button>
        ) : null}
      </header>

      {draft ? (
        <div className="farm-action-list-editor-v2">
          <label>
            清单名称
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
          </label>
          <div className="farm-action-list-editor-v2__schedule">
            <label>
              <span className="farm-action-list-editor-v2__frequency">频率</span>
              <select
                value={draft.mode}
                onChange={(event) =>
                  setDraft({ ...draft, mode: event.currentTarget.value as ScheduleMode })
                }
              >
                <option value="none">不定时</option>
                <option value="once">一次性</option>
                <option value="daily_window">每日时间窗</option>
              </select>
            </label>
            {draft.mode === "once" ? (
              <>
                <label>
                  日期
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="例如 20260901"
                    spellCheck={false}
                    type="text"
                    value={draft.onceAt.split("T")[0] ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        onceAt: `${formatActionListDateInput(event.currentTarget.value)}T${draft.onceAt.split("T")[1] ?? ""}`,
                      })
                    }
                  />
                </label>
                <label>
                  时间（24小时）
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="例如 0930"
                    spellCheck={false}
                    type="text"
                    value={draft.onceAt.split("T")[1] ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        onceAt: `${draft.onceAt.split("T")[0] ?? ""}T${formatActionListTimeInput(event.currentTarget.value)}`,
                      })
                    }
                  />
                </label>
              </>
            ) : null}
            {draft.mode === "daily_window" ? (
              <>
                <label>
                  开始时间
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="09:00"
                    spellCheck={false}
                    type="text"
                    value={draft.startTime}
                    onChange={(event) =>
                      setDraft({ ...draft, startTime: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  结束时间
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="21:00"
                    spellCheck={false}
                    type="text"
                    value={draft.endTime}
                    onChange={(event) => setDraft({ ...draft, endTime: event.currentTarget.value })}
                  />
                </label>
                <label className="farm-action-list-editor-v2__interval">
                  间隔（分钟）
                  <input
                    inputMode="numeric"
                    max="1440"
                    min="1"
                    placeholder="例如 90"
                    step="1"
                    type="number"
                    value={draft.intervalMinutes}
                    onChange={(event) =>
                      setDraft({ ...draft, intervalMinutes: event.currentTarget.value })
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="farm-action-list-editor-v2__items-head">
            <strong>行动内容</strong>
            <button
              aria-label="添加行动"
              onClick={() => setAddMenuOpen((open) => !open)}
              type="button"
            >
              ＋
            </button>
          </div>
          {addMenuOpen ? (
            <div className="farm-action-list-editor-v2__menu">
              {Object.entries(LABELS).map(([kind, label]) => (
                <button
                  key={kind}
                  onClick={() => addItem(kind as FarmActionListItemKind)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="farm-action-list-editor-v2__items">
            {draft.items.map((item) => {
              const hasFields = ["plant", "buy", "activity", "note"].includes(item.kind);
              return (
                <article className={hasFields ? "has-fields" : ""} key={item.item_id}>
                  <header>
                    <strong>{LABELS[item.kind]}</strong>
                    <button
                      aria-label={`删除${LABELS[item.kind]}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          items: draft.items.filter((entry) => entry.item_id !== item.item_id),
                        })
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </header>
                  {item.kind === "plant" ? (
                    <input
                      placeholder="想种什么（可不填）"
                      value={item.details ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((entry) =>
                            entry.item_id === item.item_id
                              ? { ...item, details: event.currentTarget.value || undefined }
                              : entry,
                          ),
                        })
                      }
                    />
                  ) : null}
                  {item.kind === "buy" ? (
                    <input
                      placeholder="想买什么"
                      value={item.details}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((entry) =>
                            entry.item_id === item.item_id
                              ? { ...item, details: event.currentTarget.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  ) : null}
                  {item.kind === "activity" ? (
                    <select
                      value={item.activity_id}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((entry) =>
                            entry.item_id === item.item_id
                              ? { ...item, activity_id: event.currentTarget.value }
                              : entry,
                          ),
                        })
                      }
                    >
                      {activities.map((entry) => (
                        <option key={entry.activity_id} value={entry.activity_id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {item.kind === "note" ? (
                    <input
                      placeholder="写一句提醒"
                      value={item.text}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((entry) =>
                            entry.item_id === item.item_id
                              ? { ...item, text: event.currentTarget.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
          <footer>
            <button onClick={() => setDraft(null)} type="button">
              取消
            </button>
            <button disabled={busy} onClick={() => void saveDraft()} type="button">
              {busy ? "保存中…" : "保存清单"}
            </button>
          </footer>
        </div>
      ) : (
        <div className="farm-action-lists-v2__cards">
          {lists.map((list) => (
            <article className="farm-action-list-card-v2" key={list.list_id}>
              <header>
                <div className="farm-action-list-card-v2__title">
                  <h3>{list.name}</h3>
                  <button onClick={() => setDraft(draftFromList(list))} type="button">
                    编辑
                  </button>
                </div>
                <label className="farm-action-list-card-v2__toggle">
                  <input
                    checked={list.enabled}
                    type="checkbox"
                    onChange={() => void toggleList(list)}
                  />
                  启用
                </label>
              </header>
              {scheduleLabel(list) ? (
                <div className="farm-action-list-card-v2__status-row">
                  <p>{scheduleLabel(list)}</p>
                </div>
              ) : null}
              <footer>
                <button
                  className="farm-action-list-card-v2__remove"
                  onClick={() => void removeList(list)}
                  type="button"
                >
                  删除
                </button>
                <button onClick={() => void notifyList(list)} type="button">
                  现在喊 TA
                </button>
              </footer>
            </article>
          ))}
          {lists.length === 0 ? (
            <button
              className="farm-action-lists-v2__empty"
              onClick={() => setDraft(emptyDraft())}
              type="button"
            >
              ＋ 新建第一张清单
            </button>
          ) : null}
        </div>
      )}
      {status ? (
        <p className="farm-action-lists-v2__status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
