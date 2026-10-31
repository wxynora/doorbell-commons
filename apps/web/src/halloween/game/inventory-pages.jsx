import {candyEatingHint, candyEffectText as effectText, candyEffectStatus, candyEffectExpiry as effectExpiry} from "../candy-effects";
import { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { LogicalCanvas, BackButton } from './halloween-home.jsx';
import { ART_ROOT, RARITY_NAMES, SHAPES, COLORS } from './catalog.mjs';
import { MaterialArt } from './material-art.jsx';
import './inventory.css';
import { CandyJarsScene } from './candy-jars.mjs';
import {COOKING_MOLDS} from '../shared/cooking-rules.mjs';

function useCandyDialogFocus(dialog, open){
  useLayoutEffect(()=>{
    if(!open)return;
    const opener=document.activeElement;
    dialog.current?.querySelector('button:not(:disabled)')?.focus();
    return()=>{if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};
  },[dialog,open]);
}
function handleCandyDialogKeyDown(event,dialog,onClose){
  if(event.key==='Escape'){event.stopPropagation();onClose();return;}
  if(event.key!=='Tab')return;
  const focusable=[...(dialog.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')??[])];
  if(!focusable.length){event.preventDefault();return;}
  const index=focusable.indexOf(document.activeElement);
  if(event.shiftKey&&(index<=0)){event.preventDefault();focusable.at(-1)?.focus();}
  else if(!event.shiftKey&&(index===-1||index===focusable.length-1)){event.preventDefault();focusable[0]?.focus();}
}

export function Materials({view,onBack,onCraft,materialArt}){
  const[tier,setTier]=useState('N');
  const entries=view.catalog.filter(item=>item.tier===tier);
  return <LogicalCanvas className="materials-inventory" label="材料背包">
    <img className="inventory-scene-art" src={`${ART_ROOT}materials-phone-v6.webp`} alt=""/>
    <h1 className="visually-hidden">材料背包</h1><BackButton onClick={onBack}/>
    <nav className="bag-tier-tabs" aria-label="食材档位">{['N','R','SR','SSR','SP'].map(value=><button key={value} aria-pressed={tier===value} className={tier===value?'selected':''} onClick={()=>setTier(value)}><span className="visually-hidden">{value}</span></button>)}</nav>
    <section className="bag-inventory-grid" aria-label={`${tier}食材`}>{entries.map(item=><article key={item.name} className={`bag-material ${(view.materials[item.name]??0)?'':'unowned'}`}><MaterialArt src={materialArt(item.name)}/><b>{item.name}</b><span className="bag-quantity">×{view.materials[item.name]??0}</span></article>)}</section>
    <button className="bag-go-craft illustrated-action" disabled={view.phase!=='open'} onClick={onCraft}><span className="visually-hidden">带去糖坊</span></button>
  </LogicalCanvas>;
}

function groupCandies(candies){
  const groups=new Map();
  for(const candy of candies){const key=JSON.stringify([candy.appearance,candy.image,candy.rarity,candy.senderName]);if(!groups.has(key))groups.set(key,{key,candies:[],...candy});groups.get(key).candies.push(candy);}
  return [...groups.values()];
}
export function Candies({view,onBack,onCraft,run,busy}){
  const[selected,setSelected]=useState([]),[neighbor,setNeighbor]=useState(null),[revealed,setRevealed]=useState(null),[picking,setPicking]=useState(null),[page,setPage]=useState(0),[neighborPage,setNeighborPage]=useState(0),[emptyJar,setEmptyJar]=useState(null);
  const emptyDialog=useRef(null),pickingDialog=useRef(null),revealedDialog=useRef(null);
  useCandyDialogFocus(emptyDialog,Boolean(emptyJar));
  useCandyDialogFocus(pickingDialog,Boolean(picking));
  useCandyDialogFocus(revealedDialog,Boolean(revealed));
  const groups=useMemo(()=>groupCandies(view.candies),[view.candies]);
  const pageCount=Math.max(1,Math.ceil(groups.length/9));
  const displayJars=useMemo(()=>{const slots=groups.slice(page*9,page*9+9);const emptyNames=['月光罐','南瓜罐','星辰罐','捣蛋罐','蝙蝠罐','爱心罐','提灯罐','魔法罐','幽灵罐'];while(slots.length<9){const i=slots.length,shape=SHAPES[(i+page)%4],color=COLORS[(i+page)%6];slots.push({key:`empty-${page}-${i}`,empty:true,jarName:emptyNames[i],candies:[],appearance:{shape:shape.id,color:color.id,name:emptyNames[i]}});}return slots;},[groups,page]);
  useEffect(()=>{if(page>=pageCount)setPage(pageCount-1);},[page,pageCount]);
  const jarCanvas=useRef(null),jarContainer=useRef(null),jars=useRef(null),[jarError,setJarError]=useState(false);
  useEffect(()=>{jars.current=new CandyJarsScene(jarCanvas.current,jarContainer.current,()=>setJarError(true));return()=>jars.current.dispose();},[]);
  useEffect(()=>{jars.current.update(displayJars);},[displayJars]);
  useEffect(()=>setSelected(current=>current.filter(id=>view.candies.some(candy=>candy.id===id))),[view.candies]);
  useEffect(()=>{if(neighbor&&!view.neighbors?.some(item=>item.doorplate===neighbor))setNeighbor(null);},[view.neighbors,neighbor]);
  useEffect(()=>setPicking(current=>{if(!current)return null;const group=groups.find(g=>g.key===current.group.key);return group?{...current,group,amount:Math.min(current.amount,group.candies.length)}:null;}),[groups]);
  useEffect(()=>setNeighborPage(current=>Math.min(current,Math.max(0,Math.ceil((view.neighbors?.length??0)/2)-1))),[view.neighbors]);
  const choose=group=>setPicking({group,amount:group.candies.filter(candy=>selected.includes(candy.id)).length});
  const confirmPick=()=>{const group=groups.find(g=>g.key===picking?.group.key);if(group){const ids=new Set(group.candies.map(candy=>candy.id));setSelected(current=>[...current.filter(id=>!ids.has(id)&&view.candies.some(c=>c.id===id)),...group.candies.slice(0,picking.amount).map(candy=>candy.id)]);}setPicking(null);};
  const selectedCandy=view.candies.find(candy=>selected.includes(candy.id));
  const taste=()=>{if(!selectedCandy)return;const group=groups.find(group=>group.candies.some(candy=>candy.id===selectedCandy.id));if(group)setPicking({group,amount:1,mode:'eat'});};
  const eat=target=>{const candy=picking?.group.candies[0];if(!candy)return;run('eat',{candyId:candy.id,target},data=>{setPicking(null);setRevealed({candy,...data,target});});};
  return <LogicalCanvas className="candy-inventory candy-gallery-v2" label="糖果罐">
    <img className="inventory-scene-art" src={`${ART_ROOT}candies-phone-v6.webp`} alt=""/>
    <h1 className="visually-hidden">糖果罐</h1><BackButton onClick={()=>{if(emptyJar)setEmptyJar(null);else if(picking)setPicking(null);else if(revealed)setRevealed(null);else onBack();}} label={emptyJar||picking||revealed?"返回糖果罐":"返回小屋"}/>
    <div className="candy-delivery-today"><span>今日送出</span><strong>{view.deliveredToday}<small> / 10颗</small></strong></div><div className="candy-delivery-total"><span>累计送出</span><strong>{view.deliveredTotal}<small> 颗</small></strong></div>
    <div className="candy-jar-display"><canvas ref={jarCanvas} className="candy-jars-webgl" aria-hidden="true"/><section ref={jarContainer} className="candy-compartments" aria-label="挑选糖果">{displayJars.map(group=>{
      const quantity=group.candies.filter(candy=>selected.includes(candy.id)).length;
      return <article className={`candy-compartment ${quantity?'is-selected':''} ${group.empty?'is-empty':''}`} key={group.key}>
        <button className="candy-pile-button" onClick={()=>group.empty?setEmptyJar(group.jarName):choose(group)} disabled={busy} aria-label={group.empty?`查看${group.jarName}，目前是空罐`:`选择${group.appearance.name}，现有${group.candies.length}颗，已选${quantity}颗`}>
          <div className="candy-jar-art" aria-hidden="true"/>
          <div className="candy-label" title={group.appearance.name}><b>{group.empty?group.jarName:`${COOKING_MOLDS.find(mold=>mold.id===group.appearance.shape)?.name??group.appearance.shapeName??group.appearance.name}糖`}</b></div>
        </button>
        {!group.empty&&<span className="candy-stock-count">{group.candies.length}</span>}
        {quantity>0&&<div className="candy-pick-label">已选{quantity}颗</div>}
      </article>;
    })}</section>{jarError&&<p className="candy-jar-error">玻璃罐没打开，换个支持WebGL的浏览器再来吧。</p>}</div>
    {pageCount>1&&<nav className="candy-gallery-pager" aria-label="糖罐架翻页"><button aria-label="上一架" disabled={!page} onClick={()=>setPage(page-1)}><svg viewBox="0 0 32 32"><path d="m20 6-10 10 10 10"/></svg></button><span>{page+1}/{pageCount}</span><button aria-label="下一架" disabled={page===pageCount-1} onClick={()=>setPage(page+1)}><svg viewBox="0 0 32 32"><path d="m12 6 10 10-10 10"/></svg></button></nav>}<div className="candy-selected-summary">已选 {selected.length} 颗</div><button className="candy-taste-button" onClick={taste} disabled={!selectedCandy||busy}>尝一颗</button>
    <button className="neighbor-turn neighbor-prev" aria-label="前两家邻居" disabled={!neighborPage} onClick={()=>{setNeighborPage(neighborPage-1);setNeighbor(null);}}><svg viewBox="0 0 32 32"><path d="m20 6-10 10 10 10"/></svg></button><button className="neighbor-turn neighbor-next" aria-label="后两家邻居" disabled={(neighborPage+1)*2>=(view.neighbors?.length??0)} onClick={()=>{setNeighborPage(neighborPage+1);setNeighbor(null);}}><svg viewBox="0 0 32 32"><path d="m12 6 10 10-10 10"/></svg></button><span className="neighbor-position visually-hidden">{view.neighbors?.length?`${neighborPage*2+1}–${Math.min(neighborPage*2+2,view.neighbors.length)} / ${view.neighbors.length} 家`:""}</span>
    <nav className="gift-neighbor-options" aria-label="选择收糖邻居">{view.neighbors?.slice(neighborPage*2,neighborPage*2+2).map(item=><button key={item.doorplate} className={neighbor===item.doorplate?'selected':''} aria-pressed={neighbor===item.doorplate} onClick={()=>setNeighbor(item.doorplate)}><span className="neighbor-seal" aria-hidden="true"><svg viewBox="0 0 80 80"><path d="M12 37 40 13 68 37v31H49V47H31v21H12Z"/><path d="M52 18v-8h10v17M21 40h9v10h-9M50 40h9v10h-9"/></svg></span><span>{item.displayName}</span></button>)}{!view.neighbors?.length&&<p>暂时还没有可拜访的邻居。</p>}</nav>
    <button className="candy-send-button illustrated-action" disabled={view.phase!=='open'||!selected.length||!neighbor||busy} onClick={()=>run('gift',{candyIds:selected,doorplate:neighbor},()=>setSelected([]))}><span className="visually-hidden">把{selected.length}颗甜蜜送过去</span></button>
    {emptyJar&&<div className="candy-reveal-scrim"><section ref={emptyDialog} className="candy-reveal" role="dialog" aria-modal="true" aria-label={emptyJar} onKeyDown={event=>handleCandyDialogKeyDown(event,emptyDialog,()=>setEmptyJar(null))}><button className="close-dialog" aria-label="放回糖罐" onClick={()=>setEmptyJar(null)}>×</button><h2>{emptyJar}</h2><p>这只罐子里还没有糖果。</p><button className="spell-button" onClick={()=>setEmptyJar(null)}>放回架子</button></section></div>}
    {picking&&<div className="candy-reveal-scrim"><section ref={pickingDialog} className="candy-reveal candy-quantity-dialog" role="dialog" aria-modal="true" aria-label={picking.mode==='eat'?'吃一颗糖':'挑几颗糖'} onKeyDown={event=>handleCandyDialogKeyDown(event,pickingDialog,()=>setPicking(null))}><button className="close-dialog" aria-label="先放回罐子" onClick={()=>setPicking(null)}>×</button><img src={picking.group.image} alt=""/><h2>{picking.group.appearance.name}</h2><small className="candy-rarity">{RARITY_NAMES[picking.group.rarity]}</small>{picking.group.senderName&&<small className="candy-sender">{picking.group.senderName}送来的</small>}<p className="candy-eating-hint">{candyEatingHint}</p>{picking.mode==='eat'?<div className="candy-eating-options"><button className="spell-button" disabled={busy} onClick={()=>eat('self')}>自己吃</button><button className="spell-button" disabled={busy} onClick={()=>eat('other')}>喂ta吃</button></div>:<><p>罐子里有{picking.group.candies.length}颗，挑几颗送出去？</p><div className="candy-quantity-stepper"><button aria-label="少选一颗" disabled={!picking.amount} onClick={()=>setPicking({...picking,amount:picking.amount-1})}>−</button><output>{picking.amount}</output><button aria-label="多选一颗" disabled={picking.amount===picking.group.candies.length} onClick={()=>setPicking({...picking,amount:picking.amount+1})}>＋</button></div><button className="candy-pick-all" onClick={()=>setPicking({...picking,amount:picking.group.candies.length})}>这一罐都带上</button><button className="spell-button" onClick={confirmPick}>选好啦</button></>}</section></div>}
    {revealed&&<div className="candy-reveal-scrim"><section ref={revealedDialog} className="candy-reveal" role="dialog" aria-modal="true" aria-label="糖纸里的秘密" onKeyDown={event=>handleCandyDialogKeyDown(event,revealedDialog,()=>setRevealed(null))}><button className="close-dialog" aria-label="收起糖纸" onClick={()=>setRevealed(null)}>×</button><img src={revealed.candy.image} alt=""/><h2>{revealed.target==='other'?'ta吃下了这颗糖':'啊呜，藏着这个！'}</h2><p>{effectText(revealed.effect)}</p><small>{candyEffectStatus(revealed.effect)==='active'?'现在开始，限制有效至':'下一次适用动作在期限前触发，效果有效至'}{Number.isSafeInteger(revealed.expiresAt)?`北京时间${effectExpiry(revealed.expiresAt)}`:''}</small></section></div>}
  </LogicalCanvas>;
}
