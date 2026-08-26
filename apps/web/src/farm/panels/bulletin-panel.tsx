import type { BoundBulletinRead } from "../../auth/bulletin-client";
import { type FarmAssetKey, getFarmAssetUrl } from "../farm-asset-manifest";
import "./bulletin-panel.css";

export type FarmBulletinSceneId = "field" | "ranch" | "cooking" | "neighborhood";

export interface DingdongBulletinProps {
  bulletin?: BoundBulletinRead | null;
  onClose: () => void;
  preview?: boolean;
  sceneId: FarmBulletinSceneId;
}

const DINGDONG_BULLETIN_OPTIONS = [
  {
    id: "tasks",
    label: "进行中任务",
    iconKey: "panel.tool.dispatch",
    emptyTitle: "进行中任务尚未接入",
    emptyDescription: "接入真实任务来源后，任务进度会显示在这里。",
  },
  {
    id: "maturity",
    label: "成熟提醒",
    iconKey: "field.crop.ordinary-ripe",
    emptyTitle: "成熟提醒尚未接入",
    emptyDescription: "接入农场真实状态后，成熟信息会显示在这里。",
  },
  {
    id: "messages",
    label: "最近留言",
    iconKey: "neighborhood.message-board",
    emptyTitle: "最近留言尚未接入",
    emptyDescription: "接入真实留言来源后，最近留言会显示在这里。",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  iconKey: FarmAssetKey;
  emptyTitle: string;
  emptyDescription: string;
}[];

function BulletinEmptyRow({
  description,
  iconKey,
  label,
  title,
}: {
  description: string;
  iconKey: FarmAssetKey;
  label: string;
  title: string;
}) {
  return (
    <li className="farm-bulletin__empty">
      <img alt="" aria-hidden="true" src={getFarmAssetUrl(iconKey)} />
      <div className="farm-bulletin__empty-copy">
        <strong>{label}</strong>
        <span>{title}</span>
        <small>{description}</small>
      </div>
    </li>
  );
}

function BulletinLiveList({ bulletin }: { bulletin?: BoundBulletinRead | null }) {
  if (!bulletin) {
    return (
      <ul aria-label="叮咚播报列表" className="farm-bulletin__list">
        <BulletinEmptyRow
          description="正在读取当前农场的真实播报。"
          iconKey="neighborhood.message-board"
          label="叮咚播报"
          title="正在读取"
        />
      </ul>
    );
  }

  const available = bulletin.data.available;
  const unavailable = bulletin.data.unavailable;
  const hasEntries =
    (available.tasks?.length ?? 0) > 0 ||
    (available.mature_plots?.length ?? 0) > 0 ||
    (available.messages?.length ?? 0) > 0 ||
    (available.ranch_notifications?.length ?? 0) > 0;
  const hasUnavailable = Object.keys(unavailable).length > 0;

  return (
    <ul aria-label="叮咚播报列表" className="farm-bulletin__list">
      {available.tasks?.map((task) => (
        <BulletinEmptyRow
          description={`${task.progress} / ${task.target} · 奖励 ${task.reward} ${task.currency === "silver" ? "银币" : "农场金币"}`}
          iconKey="panel.tool.dispatch"
          key={`task-${task.kind}`}
          label="进行中任务"
          title={task.description}
        />
      ))}
      {available.mature_plots?.map((plot) => (
        <BulletinEmptyRow
          description={`已浇水 ${plot.watered} 次`}
          iconKey="field.crop.ordinary-ripe"
          key={`mature-${plot.plot_id}`}
          label="成熟提醒"
          title={`地块 ${plot.plot_id} 的作物已成熟`}
        />
      ))}
      {available.messages?.map((message) => (
        <BulletinEmptyRow
          description={message.at ?? ""}
          iconKey="neighborhood.message-board"
          key={`message-${message.id ?? `${message.at ?? "message"}-${message.text}`}`}
          label={message.author_name ?? "留言"}
          title={message.text}
        />
      ))}
      {available.ranch_notifications?.map((notice) => (
        <BulletinEmptyRow
          description={notice.at ?? ""}
          iconKey="panel.tool.dispatch"
          key={`ranch-notice-${notice.at ?? "notice"}-${notice.text}`}
          label={notice.section ?? "牧场播报"}
          title={notice.text}
        />
      ))}
      {unavailable.tasks ? (
        <BulletinEmptyRow
          description={unavailable.tasks.message}
          iconKey="panel.tool.dispatch"
          label="进行中任务"
          title="当前无法读取"
        />
      ) : null}
      {unavailable.mature_plots ? (
        <BulletinEmptyRow
          description={unavailable.mature_plots.message}
          iconKey="field.crop.ordinary-ripe"
          label="成熟提醒"
          title="当前无法读取"
        />
      ) : null}
      {unavailable.messages ? (
        <BulletinEmptyRow
          description={unavailable.messages.message}
          iconKey="neighborhood.message-board"
          label="最近留言"
          title="当前无法读取"
        />
      ) : null}
      {unavailable.ranch_notifications ? (
        <BulletinEmptyRow
          description={unavailable.ranch_notifications.message}
          iconKey="panel.tool.dispatch"
          label="牧场播报"
          title="当前无法读取"
        />
      ) : null}
      {!hasEntries && !hasUnavailable ? (
        <BulletinEmptyRow
          description="任务、成熟提醒和最近留言都会按时间出现在这里。"
          iconKey="neighborhood.message-board"
          label="叮咚播报"
          title="现在没有新播报"
        />
      ) : null}
    </ul>
  );
}

export function DingdongBulletin({
  bulletin,
  onClose,
  preview = true,
  sceneId,
}: DingdongBulletinProps) {
  const titleId = `farm-bulletin-title-${sceneId}`;

  return (
    <aside aria-labelledby={titleId} className="farm-bulletin" role="dialog">
      <h2 className="farm-bulletin__tab" id={titleId}>
        叮咚播报
      </h2>
      <button
        aria-label="关闭叮咚播报"
        className="farm-bulletin__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <div className="farm-bulletin__content">
        <div className="farm-bulletin__panel">
          {preview ? (
            <ul aria-label="叮咚播报列表" className="farm-bulletin__list">
              {DINGDONG_BULLETIN_OPTIONS.map((option) => (
                <BulletinEmptyRow
                  description={option.emptyDescription}
                  iconKey={option.iconKey}
                  key={option.id}
                  label={option.label}
                  title={option.emptyTitle}
                />
              ))}
            </ul>
          ) : (
            <BulletinLiveList bulletin={bulletin ?? null} />
          )}
        </div>
      </div>
    </aside>
  );
}
