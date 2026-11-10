import { useEffect, useState } from "react";
import { issueMessage } from "./api";
import { Icon } from "./pixel-art";
import { timeLabel } from "./presentation";
import { notificationsApi, type NotificationView, type NotificationsApi } from "./notifications-api";
import { Stickers } from "./stickers";
import "./notifications.css";

export interface NotificationsPanelProps { onClose(): void; api?: NotificationsApi }

/** Opened by the parent page; neither opening nor viewing changes read markers. */
export function NotificationsPanel({ onClose, api = notificationsApi }: NotificationsPanelProps) {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void api.list(controller.signal).then(data => { if (!controller.signal.aborted) setItems(data); })
      .catch(cause => { if (!controller.signal.aborted) setError(issueMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, reload]);
  async function markRead(id: string) {
    if (pending !== null || markingAll) return;
    setPending(id); setError(null);
    try {
      const updated = await api.markRead(id);
      setItems(current => current.map(item => item.id === id ? updated : item));
    } catch (cause) { setError(issueMessage(cause)); }
    finally { setPending(null); }
  }
  async function markAllRead() {
    if (loading || pending !== null || markingAll) return;
    setMarkingAll(true); setError(null);
    try { setItems(await api.markAllRead()); }
    catch (cause) { setError(issueMessage(cause)); }
    finally { setMarkingAll(false); }
  }
  return <aside className="ly-notifications" aria-label="机哩咕噜通知" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <div className="ly-notifications-title"><strong>▤ 机哩咕噜通知</strong><button type="button" onClick={onClose} aria-label="关闭通知">×</button></div>
    <div className="ly-notifications-toolbar"><span>收到的互动</span><div className="ly-notifications-actions">
      <button type="button" disabled={loading || markingAll || pending !== null || !items.some(item => !item.read)} onClick={() => { void markAllRead(); }}>{markingAll ? "保存中" : "全部已读"}</button>
      <button type="button" disabled={loading || markingAll || pending !== null} onClick={() => setReload(value => value + 1)}>刷新</button>
    </div></div>
    {error && <p className="ly-notifications-error" role="alert">{error}</p>}
    {loading ? <p className="ly-notifications-empty" role="status">正在读取通知…</p> : error ? null : items.length === 0 ? <p className="ly-notifications-empty">还没有收到互动。</p> :
      <ul className="ly-notifications-list">{items.map(item => <li key={item.id} className={item.read ? "" : "unread"}>
        <span className={`ly-notifications-icon ${item.kind}`} aria-hidden="true"><Icon name={item.kind === "like" ? "heart" : item.kind === "comment" ? "chat" : "gift"} /></span>
        <div className="ly-notifications-content"><div><strong>{item.from.name}</strong> {item.kind === "like" ? "赞了这条动态" : item.kind === "comment" ? "评论了这条动态" : <>送来了 {item.gift.name} × {item.gift.quantity}</>}</div>
          {item.kind === "comment" && <>{item.comment && <p className="ly-notifications-comment">{item.comment}</p>}<Stickers stickers={item.stickers} compact /></>}
          {item.moment.text && <p className="ly-notifications-post">{item.moment.text}</p>}
          {item.moment.stickers.length > 0 && <div className="ly-notifications-post"><Stickers stickers={item.moment.stickers} compact /></div>}
          <time dateTime={new Date(item.createdAt).toISOString()}>{timeLabel(item.createdAt)}</time>
        </div>
        {item.read ? <span className="ly-notifications-read">已读</span> : <button type="button" className="ly-notifications-mark" disabled={pending !== null || markingAll} onClick={() => { void markRead(item.id); }} aria-label={`标记${item.from.name}的${item.kind === "like" ? "点赞" : item.kind === "comment" ? "评论" : "礼物"}为已读`}>{pending === item.id ? "保存中" : "标为已读"}</button>}
      </li>)}</ul>}
    <div className="ly-notifications-footer">礼物 · 评论 · 点赞</div>
  </aside>;
}
