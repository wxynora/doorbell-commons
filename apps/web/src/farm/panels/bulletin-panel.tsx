import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import { type FarmAssetKey, getFarmAssetUrl } from "../farm-asset-manifest";
import "./bulletin-panel.css";

export type FarmBulletinSceneId = "field" | "ranch" | "cooking" | "neighborhood";

export interface DingdongBulletinProps {
  farmCatalog?: BoundFarmCatalogRead | null;
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

function BulletinLiveList({ farmCatalog }: { farmCatalog?: BoundFarmCatalogRead | null }) {
  const bulletin = farmCatalog?.data.bulletin;
  if (!bulletin || bulletin.status === "unavailable") {
    return (
      <ul aria-label="叮咚播报列表" className="farm-bulletin__list">
        <BulletinEmptyRow
          description={bulletin?.message ?? "叮咚播报数据尚未接入。"}
          iconKey="neighborhood.message-board"
          label="叮咚播报"
          title="当前没有可读取的真实播报"
        />
      </ul>
    );
  }

  return (
    <ul aria-label="叮咚播报列表" className="farm-bulletin__list">
      <BulletinEmptyRow
        description={bulletin.tasks.message}
        iconKey="panel.tool.dispatch"
        label="进行中任务"
        title="任务数据暂不可用"
      />
      <BulletinEmptyRow
        description={bulletin.mature_broadcast.message}
        iconKey="field.crop.ordinary-ripe"
        label="成熟提醒"
        title="成熟提醒数据暂不可用"
      />
      {bulletin.messages.length > 0 ? (
        bulletin.messages.map((message) => (
          <li
            className="farm-bulletin__empty"
            key={`message-${message.id ?? `${message.at ?? "message"}-${message.text}`}`}
          >
            <img alt="" aria-hidden="true" src={getFarmAssetUrl("neighborhood.message-board")} />
            <div className="farm-bulletin__empty-copy">
              <strong>{message.author_name ?? "留言"}</strong>
              <span>{message.text}</span>
              {message.at ? <small>{message.at}</small> : null}
            </div>
          </li>
        ))
      ) : (
        <BulletinEmptyRow
          description="当前没有真实留言。"
          iconKey="neighborhood.message-board"
          label="最近留言"
          title="暂无留言"
        />
      )}
      {bulletin.ranch_notices.map((notice) => (
        <li
          className="farm-bulletin__empty"
          key={`ranch-notice-${notice.at ?? "notice"}-${notice.text}`}
        >
          <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.dispatch")} />
          <div className="farm-bulletin__empty-copy">
            <strong>{notice.section ?? "牧场播报"}</strong>
            <span>{notice.text}</span>
            {notice.at ? <small>{notice.at}</small> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DingdongBulletin({
  farmCatalog,
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
            <BulletinLiveList farmCatalog={farmCatalog ?? null} />
          )}
        </div>
      </div>
    </aside>
  );
}
