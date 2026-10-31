import { MaterialArt } from './material-art.jsx';
import { useEffect, useRef, useState } from 'react';
import { LogicalCanvas, BackButton } from './halloween-home.jsx';
import { CollectionScene } from './collection-scene.mjs';
import { ART_ROOT } from './catalog.mjs';
import {useCollectionTimer} from './use-collection-timer.jsx';
import {CollectionPicks} from './collection-picks.mjs';
import {KeyboardFocusMarker} from './keyboard-focus.jsx';
export function PageShell({ title, subtitle, children, onBack, backLabel = '返回小屋', className = '' }) {
  return <LogicalCanvas className={`room-page ${className}`} label={title}><div className="room-page-art" /><BackButton onClick={onBack} label={backLabel} /><header className="room-heading"><span className="witch-hat">✦</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>{children}</LogicalCanvas>;
}
export function Shop({view,onBack,run,busy,materialArt,notify}){
 const[tier,setTier]=useState('N'),[cart,setCart]=useState([]),[open,setOpen]=useState(false);
 const items=cart.map(name=>view.catalog.find(item=>item.name===name)).filter(Boolean),total=items.reduce((n,item)=>n+item.price,0);
 useEffect(()=>setCart(current=>current.filter(name=>!view.purchases.includes(name))),[view.purchases]);
 const add=name=>setCart(current=>current.includes(name)?current:[...current,name]);
 return <PageShell title="女巫的橱柜" subtitle="" onBack={open?()=>setOpen(false):onBack} backLabel={open?'返回橱柜':'返回小屋'} className="shop-page">
  {!open?<><nav className="tier-tabs" aria-label="食材档位">{['N','R','SR','SSR','SP'].map(value=><button key={value} aria-pressed={tier===value} className={tier===value?'active':''} onClick={()=>setTier(value)}>{value}</button>)}</nav>
   <div className="shop-shelves">{Array.from({length:3},(_,row)=><div className="shop-shelf" key={row}>{view.catalog.filter(item=>item.tier===tier).slice(row*4,row*4+4).map(item=>{const bought=view.purchases.includes(item.name),chosen=cart.includes(item.name);return <div className={`shop-product ${bought?'sold':''} ${chosen?'in-cart':''}`} key={item.name}><button aria-label={bought?`${item.name}已买回家`:`将${item.name}加入购物车`} aria-pressed={chosen} disabled={busy||bought||view.phase!=='open'} onClick={()=>chosen?setCart(cart.filter(name=>name!==item.name)):add(item.name)}><MaterialArt src={materialArt(item.name)}/><span>{item.name}</span><small>{bought?'已买回家':`${item.price} 银币`}</small></button></div>;})}</div>)}</div>
   <button className="shop-cart-shortcut" onClick={()=>setOpen(true)} aria-label={`查看购物车，${items.length}件`}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 8h6l5 23h22l5-17H13M18 39h1m16 0h1"/></svg><span>购物车 <b>{items.length}</b></span><strong>{total} 银币</strong></button></>:
   <section className="witch-cart" aria-label="购物车"><header><h2>购物车</h2><span>{items.length} 件</span></header><ul>{items.map(item=><li key={item.name}><MaterialArt src={materialArt(item.name)}/><div><b>{item.name}</b><span>{item.price} 银币</span></div><button disabled={busy} aria-label={`移出${item.name}`} onClick={()=>setCart(cart.filter(name=>name!==item.name))}><svg viewBox="0 0 32 32"><path d="M8 16h16"/></svg></button></li>)}</ul>{!items.length&&<p className="witch-cart-empty">小篮子空空的，先去挑点食材吧。</p>}<footer><p>合计 <strong>{total} 银币</strong></p><button className="spell-button" disabled={busy||!items.length||view.phase!=='open'} onClick={()=>run('buy_cart',{materials:cart},data=>{setCart([]);setOpen(false);notify(`买好啦！${data.purchased.reduce((n,item)=>n+item.quantity,0)}份食材已经放进背包。`);})}>{busy?'女巫正在装袋…':'一起买回家'}</button><small>每种食材，活动期间可买一份。</small></footer></section>}
 </PageShell>;
}
export function Collection({ view, onBack, run, busy, materialArt, notify }) {
  const canvas = useRef(null), scene = useRef(null), pick = useRef(null), [gpuError, setGpuError] = useState(false),[sceneReady,setSceneReady]=useState(null),[contextLost,setContextLost]=useState(false),[keyboardTarget,setKeyboardTarget]=useState(null);
  const collection = view.collection;
  const [pickState,setPickState]=useState({collection:null,pending:0,uncertain:false});
  const sendPick=useRef(null),unavailable=useRef(null);
  unavailable.current=()=>notify('这个还被压着，先拿上面的小东西。');
  const [picks]=useState(()=>new CollectionPicks({send:(args,done)=>sendPick.current(args,done),onChange:setPickState,onUnavailable:()=>unavailable.current()}));
  sendPick.current=(args,done)=>run('collection_pick',args,result=>{done(result);if(result.stageCompleted){const reward=Object.entries(result.clearReward?.materials??{}).map(([name,quantity])=>`${quantity}份「${name}」`).join('、');notify(`${collection.stage===collection.stagesTotal?'两箱都翻完啦！':'这箱翻完啦，接着开下一箱！'}${result.clearRewardGranted&&reward?`${reward}已放进背包。`:result.stageClearRewardClaimed?'今天这关的奖励已经领过啦。':''}`);}});
  const shown=pickState.pending?pickState.collection:collection;
  const clock=useCollectionTimer(collection,()=>run('view'),notify,!contextLost&&sceneReady===`${collection?.session.id}:${collection?.stage}:${collection?.pile.modelVersion??1}`),clockRef=useRef(clock),seconds=Math.ceil(clock.remaining/1000),clockText=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;clockRef.current=clock;
  const suspended=contextLost||clock.transitioning||clock.paused||Boolean(collection?.timer&&(clock.timer?.status!=='running'||clock.remaining<=0));
  useEffect(()=>{picks.sync(collection);},[collection,picks]);
  useEffect(()=>{picks.suspend(suspended||document.hidden);},[suspended,picks]);
  useEffect(()=>{const stop=()=>picks.suspend(true);const visibility=()=>{if(document.hidden)stop();};window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',visibility);return()=>{picks.dispose();window.removeEventListener('pagehide',stop);document.removeEventListener('visibilitychange',visibility);};},[picks]);
  pick.current = tile => { if (!tile.selectable) { unavailable.current(); return; } picks.enqueue(tile.id); };
  useEffect(() => { scene.current = new CollectionScene(canvas.current, { onPick: tile => pick.current(tile), onError: () => setGpuError(true),onReady:setSceneReady,onKeyboardFocus:setKeyboardTarget,onContextLost:()=>{setContextLost(true);void clockRef.current.pause();},onContextRestored:()=>setContextLost(false) }); return () => scene.current.dispose(); }, []);
  useEffect(() => { scene.current.update(shown, suspended||pickState.uncertain||(busy&&!pickState.pending)||Boolean(shown&&shown.tray.length>=shown.capacity)); }, [shown,busy,suspended,pickState.pending,pickState.uncertain]);
  const active = collection?.status === 'active';
  return <PageShell title="翻箱倒罐" subtitle={collection ? `第${collection.stage}关 / 共${collection.stagesTotal}关` : '今日两关'} onBack={async()=>{try { await clock.leave(); onBack(); } catch(e) { notify(e.message); }}} className="collection-page">
    {clock.timer&&active&&<div className={`collection-clock ${seconds<=30?"urgent":""}`}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="10"/><path d="M12 3h8M16 8v10l5 3"/></svg><output aria-label="剩余时间">{clockText}</output><button disabled={clock.transitioning} onClick={clock.pause} aria-label="暂停关卡"><svg viewBox="0 0 32 32"><path d="M11 8v16M21 8v16"/></svg></button></div>}
    <div className="collection-pool"><canvas ref={canvas} tabIndex={0} aria-label="3D材料池，点击露出的小东西" aria-description="方向键选择可拿的材料，回车拿取。" /><KeyboardFocusMarker canvas={canvas} target={keyboardTarget}/><span className="visually-hidden" role="status" aria-live="polite">{keyboardTarget?.text??''}</span>{contextLost&&<section className="collection-cover" role="status"><h2>画面暂时中断</h2><p>正在暂停箱子，等待画面恢复。</p></section>}{!contextLost&&clock.paused&&active&&<section className="collection-cover"><h2>小箱子歇一会儿</h2><p>倒计时暂停啦。</p><button className="spell-button" disabled={clock.transitioning} onClick={clock.resume}>接着翻箱子</button></section>}{!contextLost&&(!active || gpuError) && <section className="collection-cover"><h2>{gpuError ? '3D箱子没能打开' : collection?.status === 'complete' ? '两箱都翻完啦！' : collection?.timer?.status==='expired'?'时间到啦！': collection?.status === 'full' ? '小口袋装满啦！' : '来找点好吃的？'}</h2><p>{gpuError ? '请换个支持WebGL的浏览器再来。' : collection?.status==='complete' ? '两箱都翻完啦，还可以再玩一轮。' : collection ? '再试一次吧，已经领到的奖励会留在背包。' : '每天两份通关奖励，失败可以再来。'}</p>{view.collectionAvailable && !gpuError && <button className="spell-button" disabled={busy} onClick={() => run('collection_start')}>{collection?.status==='complete'?'再玩一轮':collection?'再试一次':'打开箱子'}</button>}</section>}</div>
    <div className="collection-tray" aria-label="暂存口袋">{Array.from({ length: collection?.capacity ?? 7 }, (_, index) => { const tile = shown?.tray[index]; return <div key={index}>{tile && <><img src={`${ART_ROOT}game-objects/v${collection.pile.modelVersion>=2?'5':'2'}/m${view.catalog.findIndex(item => item.name === tile.name)}.png`} alt={tile.name} /><span className="visually-hidden">{tile.name}</span></>}</div>; })}</div>
    <div className="collection-controls">{active && <button disabled={busy||contextLost||clock.transitioning||clock.paused||clock.timer?.status!=='running'} onClick={() => run('collection_shake', { sessionId: collection.session.id, revision: collection.pile.revision })}>晃一晃箱子</button>}{active&&<p>还剩 {shown.remaining} 件</p>}</div>
  </PageShell>;
}
