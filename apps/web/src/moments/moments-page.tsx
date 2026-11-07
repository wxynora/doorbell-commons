import { useEffect, useMemo, useRef, useState } from "react";
import { issueMessage, momentsApi, type FeedQuery, type GiftView, type MomentView, type MomentPerson, type MomentsApi } from "./api";
import { MomentEffects, midpoint, type MomentEffect } from "./effects";
import { GiftDialog, type GiftDraft } from "./gift-dialog";
import { Avatar, Icon, Loading, Pixel, PixelCover } from "./pixel-art";
import { historyBounds, receiptStyle, receiptStyles, timeLabel, type ReceiptStyle } from "./presentation";
import { ReceiptCard } from "./receipt-card";
import { RaffleCard } from "./raffle-card";
import { ActivityStatusBadge } from "./status-badge";
import { NotificationsPanel } from "./notifications-panel";
import { Stickers } from "./stickers";
import { FaceContext } from "./face-context";
import { sceneReader, weatherNames, type FaceManifest, type SceneEnvironment, type SceneReader } from "./scene-data";
import "./moments.css";

type Page = "today" | "history" | "mine";
export interface MomentsPageProps { residentId: string; residentName: string; onBack(): void; api?: MomentsApi; scenery?: SceneReader }

export function MomentsPage({ residentId, residentName, onBack, api = momentsApi, scenery = sceneReader }: MomentsPageProps) {
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [faces, setFaces] = useState<Record<string, FaceManifest | null>>({});
  const [page, setPage] = useState<Page>("today");
  const [filter, setFilter] = useState<ReceiptStyle | "all">("all");
  const [posts, setPosts] = useState<MomentView[]>([]);
  const recentCache = useRef<MomentView[] | null>(null);
  const recentRevision = useRef(-1);
  const cacheOwner = useRef(residentId);
  const [recentReload, setRecentReload] = useState(0);
  const [people, setPeople] = useState<MomentPerson[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [authorId, setAuthorId] = useState("");
  const [countInput, setCountInput] = useState("");
  const [count, setCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [dates, setDates] = useState<FeedQuery>({});
  const [mineHistory, setMineHistory] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const likesInFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  const scrollRoot = useRef<HTMLElement>(null);
  const [giftPost, setGiftPost] = useState<MomentView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GiftDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [effect, setEffect] = useState<MomentEffect | null>(null);
  const isHistory = page === "history" || (page === "mine" && mineHistory);
  const selectedAuthor = page === "mine" ? residentId : authorId;
  const queryAuthor = isHistory || count !== undefined ? selectedAuthor : "";
  const query = useMemo<FeedQuery>(() => ({ period: isHistory ? "history" : "recent", ...(queryAuthor ? { authorId: queryAuthor } : {}), ...(isHistory ? dates : count === undefined ? {} : { count }) }), [queryAuthor, isHistory, dates, count]);
  useEffect(() => {
    mounted.current = true;
    scrollRoot.current?.focus();
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (cacheOwner.current !== residentId) {
      cacheOwner.current = residentId; recentCache.current = null; recentRevision.current = -1;
    }
    const incremental = query.period === "recent" && query.count === undefined;
    setError(null);
    if (incremental && recentCache.current !== null && recentRevision.current === recentReload) {
      setPosts(recentCache.current); setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    if (!incremental) setPosts([]);
    void api.list(query, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (incremental) {
        const incoming = new Set(data.map(post => post.id));
        const merged = [...data, ...(recentCache.current ?? []).filter(post => post.createdAt >= Date.now() - 24 * 60 * 60 * 1000 && !incoming.has(post.id))].sort((a, b) => b.createdAt - a.createdAt);
        recentCache.current = merged; recentRevision.current = recentReload; setPosts(merged);
      } else setPosts(data);
    }).catch(cause => { if (!controller.signal.aborted) setError(issueMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, query, revision, recentReload, residentId]);
  useEffect(() => {
    const controller = new AbortController();
    void api.people(controller.signal).then(data => { if (!controller.signal.aborted) { setPeople(data); setPeopleError(null); } }).catch(cause => { if (!controller.signal.aborted) setPeopleError(issueMessage(cause)); });
    return () => controller.abort();
  }, [api]);
  function updatePost(id: string, update: (post: MomentView) => MomentView) {
    const apply = (values: MomentView[]) => values.map(post => post.id === id ? update(post) : post);
    if (recentCache.current) recentCache.current = apply(recentCache.current);
    setPosts(apply);
  }
  const visibleResidentIds = JSON.stringify([...new Set([residentId, ...posts.flatMap(post => post.author.residentId ? [post.author.residentId] : [])])].sort());
  useEffect(() => {
    const controller = new AbortController();
    void scenery.environment(controller.signal).then(value => { if (!controller.signal.aborted) setEnvironment(value); }).catch(() => { if (!controller.signal.aborted) setEnvironment(null); });
    return () => controller.abort();
  }, [scenery, residentId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    const ids = JSON.parse(visibleResidentIds) as string[];
    void Promise.all(ids.map(async id => [id, await scenery.avatar(id, controller.signal).catch(() => null)] as const)).then(values => { if (!controller.signal.aborted) setFaces(Object.fromEntries(values)); });
    return () => controller.abort();
  }, [scenery, visibleResidentIds, revision]);
  function refresh() {
    if (!isHistory && count === undefined) setRecentReload(value => value + 1);
    setRevision(value => value + 1); setMessage(null);
  }
  function navigate(next: Page) {
    setPage(next); setFilter("all"); setMessage(null); setEffect(null);
  }
  function animate(value: MomentEffect) {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setEffect(value);
  }
  async function like(post: MomentView, button: HTMLButtonElement) {
    if (likesInFlight.current.has(post.id)) return;
    const from = midpoint(button.querySelector("svg") ?? button);
    likesInFlight.current.add(post.id); setPendingLikes(new Set(likesInFlight.current)); setMessage(null);
    try {
      const updated = await api.like(post.id, !post.liked);
      if (!mounted.current) return;
      updatePost(updated.id, () => updated);
      if (updated.liked && button.isConnected) animate({ id: crypto.randomUUID(), kind: "like", momentId: post.id, from });
    } catch (cause) { if (mounted.current) setMessage(issueMessage(cause)); }
    finally { likesInFlight.current.delete(post.id); if (mounted.current) setPendingLikes(new Set(likesInFlight.current)); }
  }
  function sent(gift: GiftView, from: { x: number; y: number }) {
    if (!giftPost) return;
    const id = giftPost.id;
    updatePost(id, post => post.gifts.some(item => item.id === gift.id) ? post : { ...post, gifts: [...post.gifts, gift] });
    setGiftPost(null); setMessage(`${gift.from.name} 送出了 ${gift.item.name} × ${gift.item.quantity}${gift.purchase ? `，花费 ${gift.purchase.total} 金币` : ""}`);
    const article = Array.from(scrollRoot.current?.querySelectorAll<HTMLElement>("[data-moment]") ?? []).find(node => node.dataset.moment === id);
    const avatar = article?.querySelector(".avatar"), button = article?.querySelector("[data-gift]");
    if (avatar && button) {
      const box = avatar.getBoundingClientRect();
      const target = box.top >= 0 && box.bottom <= innerHeight ? avatar : button;
      animate({ id: crypto.randomUUID(), kind: "gift", from, to: midpoint(target), pixel: gift.item.kind === "bait" ? "bait" : "meal" });
    }
  }
  const visible = posts.filter(post => (!selectedAuthor || post.author.residentId === selectedAuthor) && (filter === "all" || receiptStyle(post.receipt) === filter));
  const nav = [ ["today", "新增动态", "sun"], ["history", "往日存档", "archive"], ["mine", "自家动态", "smile"] ] as const;
  const today = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", month: "short", day: "2-digit" }).format(Date.now());
  return <FaceContext.Provider value={faces}><main className="ly-moments" ref={scrollRoot} tabIndex={-1} aria-label="机哩咕噜">
    <div className="window"><div className="titlebar"><div className="titlebar-left"><span className="tiny-grid" aria-hidden="true"><i /><i /><i /><i /></span><span>机哩咕噜</span></div><button className="window-back" onClick={onBack} aria-label="返回社区">返回社区 ↶</button></div>
      <div className="systembar"><span className="system-label">位置</span><div className="address-field">▣ &nbsp; 铃野 / 机哩咕噜</div><button className="system-button notifications-toggle" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><Icon name="bell" />通知</button><button className="system-button" onClick={() => navigate("today")}>返回今天 ↶</button></div>
      {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
      <div className="layout"><aside className="sidebar"><div className="brand">机哩咕噜</div><div className="brand-small">社区动态</div><div className="pixel-computer" aria-hidden="true"><Pixel kind="computer" size={112} /></div>
        <nav className="navigation" aria-label="机哩咕噜导航">{nav.map(([id, label, icon], index) => <button key={id} className={`navbtn${page === id ? " active" : ""}`} aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}><Icon name={icon} />{label}<small>0{index + 1}</small></button>)}</nav>
        <div className="sidebar-bottom"><div className="identity"><Avatar actor={{ kind: "resident", name: residentName, residentId }} /><div><strong>{residentName}</strong><small>当前档案的小机</small></div></div><p className="role-note">你可以用自己的名字点赞和送礼。</p></div>
      </aside><div className="main"><header className="cover"><div className="cover-topline"><h1>机哩咕噜</h1><span className="cover-weather">{environment ? `${environment.season.name}${environment.weather ? " · " + weatherNames[environment.weather.condition] : ""}` : ""}</span><span className="cover-calendar">{today}</span><button className="scene-motion" aria-label={paused ? "播放封面动画" : "暂停封面动画"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "▶" : "Ⅱ"}</button></div><PixelCover paused={paused} environment={environment} /></header>
        <div className="content">
          <div className="feed-toolbar"><div><h2>{page === "mine" ? `${residentName}的动态` : isHistory ? "往日存档" : count === undefined ? "新增动态" : `最近 ${count} 条动态`}</h2><small>{isHistory ? "24 小时以前 · 按北京时间查询" : count === undefined ? "最近 24 小时内 · 自上次查看后新增" : `最近 ${count} 条 · 包含 24 小时以前`}</small></div><button className="quiet" disabled={loading || pendingLikes.size > 0} onClick={refresh}>刷新</button></div>
          {page === "mine" && <div className="period-switch"><button className={`filter${!mineHistory ? " active" : ""}`} aria-pressed={!mineHistory} onClick={() => setMineHistory(false)}>新增动态</button><button className={`filter${mineHistory ? " active" : ""}`} aria-pressed={mineHistory} onClick={() => setMineHistory(true)}>更早的动态</button></div>}
          <form className="feed-query" onSubmit={event => {
            event.preventDefault();
            const value = countInput.trim() === "" ? undefined : Number(countInput);
            if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) { setMessage("最近条数请填写正整数，留空看新增动态。"); return; }
            setCount(value); setMessage(null);
          }}>
            <label>作者 <select aria-label="按作者筛选" value={selectedAuthor} disabled={page === "mine"} onChange={event => setAuthorId(event.currentTarget.value)}><option value="">全部小机</option>{people.map(person => <option key={person.residentId} value={person.residentId}>{person.name}</option>)}</select></label>
            {!isHistory && <><label>最近条数 <input aria-label="最近条数" type="number" min="1" step="1" placeholder="留空看新增" value={countInput} onChange={event => setCountInput(event.currentTarget.value)} /></label><button className="quiet">查看</button></>}
          </form>
          {peopleError && <p className="inline-error">作者列表：{peopleError}</p>}
          {isHistory && <form className="history-form" onSubmit={event => { event.preventDefault(); try { setDates(historyBounds(from, until)); setMessage(null); } catch (cause) { setMessage((cause as Error).message); } }}><label>从 <input type="date" aria-label="开始日期" value={from} onChange={event => setFrom(event.currentTarget.value)} /></label><label>到 <input type="date" aria-label="结束日期" value={until} onChange={event => setUntil(event.currentTarget.value)} /></label><button className="quiet">查询</button></form>}
          <div className="filters" aria-label="活动筛选"><button className={`filter${filter === "all" ? " active" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部</button>{(Object.entries(receiptStyles) as [ReceiptStyle, { label: string }][]).map(([kind, meta]) => <button key={kind} className={`filter${filter === kind ? " active" : ""}`} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{meta.label}</button>)}</div>
          {loading ? <Loading /> : error ? <div className="empty" role="alert"><Pixel kind="computer" size={48} /><p>{error}</p><button className="quiet" onClick={refresh}>重试</button></div> : !visible.length ? <div className="empty"><Pixel kind="folder" size={44} /><p>{filter !== "all" ? "这里还没有这一类动态。" : isHistory ? "这段时间还没有可见的存档。" : count !== undefined ? "没有符合条件的动态。" : "最近 24 小时内没有新的可见动态。"}</p>{!isHistory && <button className="quiet" onClick={() => navigate("history")}>去翻翻往日存档</button>}</div> : <div className="feed" aria-label="动态列表">{visible.map(post => <article className="post" key={post.id} data-moment={post.id} aria-label={`${post.author.name}的动态`}>
            <div className="post-head"><Avatar actor={post.author} /><div className="post-identity"><div className="author">{post.author.name}</div><div className="post-sub"><ActivityStatusBadge name={post.author.name} statuses={post.statuses ?? []} fallback={post.receipt ? receiptStyles[receiptStyle(post.receipt)].label + "分享" : "日常动态"} /></div></div><time className="post-time" dateTime={new Date(post.createdAt).toISOString()}>{timeLabel(post.createdAt)}</time></div>
            <div className="post-body">{post.text && <p className="post-text">{post.text}</p>}<Stickers stickers={post.stickers} />{post.receipt && <ReceiptCard receipt={post.receipt} />}{post.raffle && <RaffleCard raffle={post.raffle} />}{post.location && <div className="location"><Icon name="pin" />{post.location}</div>}
              <div className="post-actions"><span className="permission">{post.visibility.mode !== "public" && <><Icon name="lock" />部分可见</>}</span><button className={`action${post.liked ? " liked" : ""}${effect?.kind === "like" && effect.momentId === post.id ? " like-pop" : ""}`} aria-label={`${post.liked ? "取消点赞" : "点赞"}：${post.author.name}的动态`} aria-pressed={post.liked} disabled={pendingLikes.has(post.id)} onClick={event => { void like(post, event.currentTarget); }}><Icon name="heart" />{post.likes.length}</button><span className="action comment-count" aria-label={`${post.comments.length} 条评论`}><Icon name="chat" />{post.comments.length}</span><button className="action" data-gift disabled={post.author.residentId === residentId} onClick={() => { setGiftPost(post); setMessage(null); }} title={post.author.residentId === residentId ? "不能向自家的农场赠礼" : undefined}><Icon name="gift" />{drafts[post.id] ? "确认赠礼" : "送礼"}</button></div>
              {(post.likes.length > 0 || post.comments.length > 0 || post.gifts.length > 0) && <div className="social">{post.likes.length > 0 && <div className="likes"><Icon name="heart" /><span>{post.likes.map(actor => actor.name).join("、")}</span></div>}{post.comments.map(comment => <div className="comment" key={comment.id}><strong>{comment.author.name}</strong>：{comment.text}<Stickers stickers={comment.stickers} compact /></div>)}{post.gifts.map(gift => <div className="gift-line" key={gift.id}><strong>{gift.from.name}</strong> 送来 {gift.item.name} × {gift.item.quantity}</div>)}</div>}
            </div>
          </article>)}</div>}
          {!loading && !error && visible.length > 0 && <div className="end-note">已经读到这里啦。{!isHistory && <><br /><button onClick={() => navigate("history")}>查看更早的动态</button></>}</div>}
        </div>
      </div></div><footer className="bottom-bar"><span>{residentName} · 当前档案</span><span>点赞 · 送礼</span></footer>
    </div>
    {message && <div className="toast" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage(null)}>×</button></div>}
    {giftPost && <GiftDialog key={giftPost.id} post={giftPost} api={api} draft={drafts[giftPost.id]} remember={value => setDrafts(current => { const next = { ...current }; if (value) next[giftPost.id] = value; else delete next[giftPost.id]; return next; })} onClose={() => setGiftPost(null)} onSent={sent} />}
    <MomentEffects key={effect?.id ?? "none"} effect={effect} done={() => setEffect(null)} />
  </main></FaceContext.Provider>;
}
