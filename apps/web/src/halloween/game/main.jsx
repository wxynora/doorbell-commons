import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HalloweenHome } from './halloween-home.jsx';
const Workshop = lazy(() => import('./workshop.jsx').then(m => ({default:m.Workshop})));
const Shop = lazy(() => import('./pages.jsx').then(m => ({default:m.Shop})));
const Collection = lazy(() => import('./pages.jsx').then(m => ({default:m.Collection})));
const Materials = lazy(() => import('./inventory-pages.jsx').then(m => ({default:m.Materials})));
const Candies = lazy(() => import('./inventory-pages.jsx').then(m => ({default:m.Candies})));
import { command, sendCommand } from './api.mjs';
import { ingredientArtwork } from './catalog.mjs';
import './pages.css';
import './inventory.css';
import './workshop.css';
import './phone-v6.css';
function App() {
  const fromDoorstep = useRef(new URLSearchParams(location.search).get('page') === 'candies').current;
  const [page, setPage] = useState(() => new URLSearchParams(location.search).get('page') === 'candies' ? 'candies' : 'home'), [view, setView] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [toast, setToast] = useState(null);
  const pending = useRef(null), active = useRef(false), toastTimer = useRef(null), mounted = useRef(true), loadVersion = useRef(0),currentPage=useRef(page);currentPage.current=page;
  const notify = useCallback(text => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(() => setToast(null), 3800); }, []);
  const refresh = useCallback(async () => { const version=++loadVersion.current; const data = await sendCommand(command('view')); if (mounted.current && version===loadVersion.current) setView(data); }, []);
  useEffect(() => { mounted.current = true; refresh().catch(setError); return () => { mounted.current = false; clearTimeout(toastTimer.current); }; }, []);
  const execute = async () => {
    if (active.current || !pending.current) return; active.current = true; setBusy(true); setError(null);
    const action = pending.current;
    try {
      const data = await sendCommand(action.payload); action.receipt = data; ++loadVersion.current;
      if (action.payload.op === 'collection_pick' && data.collection && !data.stageCompleted) {
        setView(current => ({ ...current, collection: data.collection }));
      } else await refresh();
      pending.current = null; action.done?.(data);
      if(action.payload.op==='craft'&&currentPage.current!=='craft')notify(`咕嘟——开锅！${data.candyIds.length}颗「${data.appearance.name}」做好啦。`);
      if (action.payload.op === 'gift') notify(`叩叩！${data.delivered}颗糖已经放进${data.recipientName}的背包。`);
      return 'success';
    } catch (caught) { if (!caught.uncertain && !action.receipt) { pending.current = null; setError(caught); return 'failed'; } setError(caught); return 'pending'; }
    finally { active.current = false; setBusy(false); }
  };
  const run = async (op, args = {}, done) => { if (active.current || pending.current) return 'pending'; pending.current = { payload: command(op, args), done }; return execute(); };
  const leave = () => { const unhandled = window.dispatchEvent(new CustomEvent('halloween:close', {cancelable:true})); if (unhandled) { if(import.meta.env.DEV) notify('当前是活动预览，关闭预览页即可返回。'); else location.assign('/lingye/farm'); } };
  const materialArt = name => ingredientArtwork(view.catalog, name);
  if (!view) return <div className="loading-room"><h1>糖果大作战</h1><p>{error ? error.message : '小幽灵正在点亮灯笼…'}</p><button onClick={leave}>返回农场</button>{error && <button onClick={() => { setError(null); refresh().catch(setError); }}>再敲敲门</button>}</div>;
  const navigate = next => { setPage(next); refresh().catch(setError); };
  const props = { view, onBack: () => fromDoorstep && page === 'candies' ? leave() : navigate('home'), onCraft: () => navigate('craft'), onCandies: () => navigate('candies'), run, busy, materialArt, notify };
  if(view.phase !== 'open' && page !== 'candies' && page !== 'materials') return <div className="loading-room season-closed"><h1>糖果大作战</h1><p>{view.phase==='ended'?'小屋打烊啦，谢谢你的糖果！':'小幽灵还在准备，开门后再来吧。'}</p><button onClick={() => setPage('candies')}>看看糖果罐</button><button onClick={leave}>返回农场</button></div>;
  return <><Suspense fallback={<div className="loading-room" role="status">小幽灵正在打开房门…</div>}>{page === 'home' ? <HalloweenHome onNavigate={navigate} onBack={leave} /> : page === 'craft' ? <Workshop {...props} /> : page === 'shop' ? <Shop {...props} /> : page === 'collection' ? <Collection {...props} /> : page === 'materials' ? <Materials {...props} /> : <Candies {...props} />}</Suspense>
    {toast && <div className="event-toast" role="status">{toast}</div>}
    {error && <div className="request-error" role="alert"><p>{error.message}</p><button onClick={() => pending.current ? execute() : refresh().then(() => setError(null)).catch(setError)} disabled={busy}>{pending.current ? '再问一次' : '刷新看看'}</button>{!pending.current && <button onClick={() => setError(null)}>知道啦</button>}</div>}
    {busy && pending.current?.payload.op !== 'collection_pick' && <div className="action-pending" role="status">小幽灵正在送回信…</div>}
  </>;
}
if (import.meta.env.DEV && new URLSearchParams(location.search).has('export-art')) {
  import('./art-export.mjs').then(module => module.exportArt()).catch(error => { document.body.dataset.artExport = 'failed'; document.body.textContent = error.stack; });
} else createRoot(document.getElementById('root')).render(<App />);
