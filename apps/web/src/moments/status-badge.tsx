import { useId, useState } from "react";
import { activityDayStart, type ActivityStatus } from "../../../server/src/moments/activity-status";
import { Pixel } from "./pixel-art";
import { statusCatalog } from "./status-catalog";

export function ActivityStatusBadge({ name, statuses = [], fallback }: { name: string; statuses?: ActivityStatus[]; fallback: string }) {
  const [expanded, setExpanded] = useState(false), id = useId();
  const now = Date.now(), start = activityDayStart(now);
  const today = statuses.filter(status => status.occurredAt >= start && status.occurredAt <= now);
  // Social interactions remain in the list without obscuring today's activity result.
  const primary = today.find(status => !status.key.startsWith("social.")) ?? today[0];
  if (!primary) return <>{fallback}</>;
  const meta = statusCatalog[primary.key];
  const content = <><Pixel kind={meta.pixel} size={14} /><span>{meta.label}</span>{today.length > 1 && <b>+{today.length - 1}</b>}</>;
  return <div className="activity-status" data-family={meta.family}>
    {today.length > 1 ? <button className="activity-status-chip" aria-label={`查看${name}的今日状态，共${today.length}种`} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{content}</button> : <span className="activity-status-chip">{content}</span>}
    {expanded && today.length > 1 && <div id={id} className="activity-status-details"><span className="activity-status-heading">今日可见状态</span><ul aria-label="今日可见状态">{today.map(status => {
      const entry = statusCatalog[status.key];
      return <li key={status.key}><Pixel kind={entry.pixel} size={14} /><span>{entry.label}</span><time dateTime={new Date(status.occurredAt).toISOString()}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(status.occurredAt)}</time></li>;
    })}</ul></div>}
  </div>;
}
