import { createContext,useContext,useEffect,useRef,useState } from 'react';
import {createPortal} from 'react-dom';
import { ART_ROOT } from './catalog.mjs';
import './home.css';

const CanvasContext=createContext(null);
export const HOME_CANVAS = Object.freeze({ width: 941, height: 1672 });
export const PHONE_CANVAS = Object.freeze({ width: 863, height: 1823 });
export function LogicalCanvas({ children, className = '', label }) {
  const pan=className.split(' ').includes('halloween-home'), design=pan?HOME_CANVAS:PHONE_CANVAS;
  const frame = useRef(null),visiblePanel=useRef(null);
  const [layout,setLayout]=useState({scale:0,width:0,height:0,mobile:false,scrollTall:false});
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>{
      const{width,height}=entry.contentRect,mobile=width<=600||matchMedia('(pointer:coarse)').matches;
      const scrollTall=mobile&&!pan&&width>height;
      const scale=scrollTall?width/design.width:(mobile?Math.max:Math.min)(width/design.width,height/design.height);
      setLayout({scale,width,height,mobile,scrollTall});
    });observer.observe(frame.current);return()=>observer.disconnect();
  },[design]);
  useEffect(()=>{window.dispatchEvent(new Event("halloween:resize"));},[layout.scale]);
  useEffect(()=>{
    if(!layout.scrollTall){visiblePanel.current=null;return;}
    const panel=frame.current.querySelector('.witch-cart,[role="dialog"],.collection-cover');
    if(panel&&panel!==visiblePanel.current?.node){visiblePanel.current={node:panel,previousScroll:frame.current.scrollTop};panel.scrollIntoView({block:'start'});}
    else if(!panel&&visiblePanel.current){frame.current.scrollTop=visiblePanel.current.previousScroll;visiblePanel.current=null;}
  },[children,layout.scrollTall]);
  const {scale,width,height,mobile,scrollTall}=layout,canvasWidth=design.width*scale,canvasHeight=design.height*scale;
  const safeWidth=scale?Math.min(design.width,width/scale):design.width,safeLeft=(design.width-safeWidth)/2;
  const context={viewport:frame.current,mobile,left:mobile?14:Math.max(14,(width-canvasWidth)/2+32*scale),top:mobile?16:48*scale};
  return <CanvasContext.Provider value={context}><div className={`halloween-viewport ${mobile?'mobile-fullscreen':''} ${pan?'scene-pannable':'scene-centered'} ${scrollTall?'scene-scroll-tall':''} ${className}`} ref={frame}>
    <div className="halloween-scroll-surface" style={{width:pan?Math.max(width,canvasWidth):width,height:pan||scrollTall?Math.max(height,canvasHeight):height}}>
      <main className="halloween-canvas" aria-label={label} style={{width:design.width,height:design.height,left:pan?Math.max(0,(width-canvasWidth)/2):(width-canvasWidth)/2,top:scrollTall?0:pan?Math.max(0,(height-canvasHeight)/2):(height-canvasHeight)/2,transform:`scale(${scale})`,visibility:scale?'visible':'hidden','--safe-left':`${safeLeft}px`,'--safe-width':`${safeWidth}px`,'--safe-top':`${scrollTall?0:Math.max(0,(canvasHeight-height)/2/scale)||0}px`}}>{children}</main>
    </div>
  </div></CanvasContext.Provider>;
}

export function BackButton({onClick,label='返回小屋'}){
 const context=useContext(CanvasContext);
 const button=<button className="halloween-fixed-back" aria-label={label} onClick={onClick} type="button" style={{left:context?.left??14,top:context?.top??16}}><span className="halloween-back-art" aria-hidden="true"/></button>;
 return context?.viewport?createPortal(button,context.viewport):null;
}

const GHOSTS = [
  { x: 266, y: 508, w: 90, h: 106, hint: '窗边的小幽灵' },
  { x: 419, y: 566, w: 88, h: 111, hint: '帽子里的小幽灵' },
  { x: 530, y: 732, w: 74, h: 119, hint: '柜边的小幽灵' },
  { x: 36, y: 936, w: 111, h: 111, hint: '书上的小幽灵' },
  { x: 697, y: 1118, w: 122, h: 106, hint: '箱子里的小幽灵' },
  { x: 687, y: 1308, w: 143, h: 165, hint: '南瓜边的小幽灵' },
];
const TOOLS = [
  { id: 'scroll', x: 338, y: 272, w: 61, h: 156, hint: '星图卷轴' },
  { id: 'clock', x: 398, y: 287, w: 47, h: 95, hint: '魔法怀表' },
  { id: 'keys', x: 443, y: 267, w: 58, h: 149, hint: '钥匙串' },
  { id: 'quill', x: 510, y: 230, w: 64, h: 160, hint: '羽毛笔' },
  { id: 'pendulum', x: 486, y: 330, w: 42, h: 105, hint: '水晶吊坠' },
  { id: 'broom', x: 520, y: 478, w: 54, h: 242, hint: '小扫帚' },
  { id: 'star', x: 464, y: 470, w: 54, h: 61, hint: '星星挂饰' },
];
function Sprite({ frame, ghostIndex, style, className = '', ...props }) {
  const active = className.includes('is-') && ghostIndex !== undefined;
  const frameIndex = ghostIndex * 2 + 1;
  const placement = { ...style, ...(active ? { backgroundImage: `url(${ART_ROOT}ghosts-v2.webp)`, backgroundPosition: `${frameIndex % 4 / 3 * 100}% ${Math.floor(frameIndex / 4) / 2 * 100}%` } : {}) };
  return <>{active && <div className="home-reaction-underlay" style={{ ...style, backgroundPosition: `${-style.left}px ${-style.top}px` }} />}
    <button type="button" {...props} className={`home-sprite ${className}`} style={placement} />
  </>;
}

export function HalloweenHome({ onBack, onNavigate }) {
  const [cat, setCat] = useState(false), [book, setBook] = useState(false);
  const [ghosts, setGhosts] = useState({}), [tool, setTool] = useState(null), [bubble, setBubble] = useState(null);
  const timers = useRef(new Set());
  const ghostTimers = useRef(new Map());
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);
  const later = (callback, delay) => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
  };
  const say = (text, x, y) => { setBubble({ text, x, y }); later(() => setBubble(null), 1800); };
  const pokeCat = () => { setCat(true); say('喵？这团线自己跑的。', 96, 424); later(() => setCat(false), 1100); };
  const flipBook = () => { setBook(true); say('这一页，画着一只偷吃的小幽灵。', 55, 890); later(() => setBook(false), 1050); };
  const pokeGhost = index => {
    const previous = ghostTimers.current.get(index); if (previous) { clearTimeout(previous); timers.current.delete(previous); }
    setGhosts(current => ({ ...current, [index]: (current[index] ?? 0) + 1 }));
    const timer = setTimeout(() => { timers.current.delete(timer); ghostTimers.current.delete(index); setGhosts(current => ({ ...current, [index]: 0 })); }, 900);
    timers.current.add(timer); ghostTimers.current.set(index, timer);
  };
  return <LogicalCanvas className="halloween-home" label="糖果大作战活动小屋">
    <img className="home-room" src={`${ART_ROOT}home-backless-v5.webp`} alt="" />
    <h1 className="home-title">糖果大作战</h1>
    <BackButton onClick={onBack} label="返回社区" />
    <button className="home-entry home-entry--shop" onClick={() => onNavigate('shop')}><span>女巫的橱柜</span></button>
    <button className="home-entry home-entry--craft" onClick={() => onNavigate('craft')}><span>咕嘟糖坊</span></button>
    <button className="home-entry home-entry--collection" onClick={() => onNavigate('collection')}><span>翻箱倒罐</span></button>
    <Sprite frame={cat ? 1 : 0} className={cat ? 'home-cat is-playing' : 'home-cat'}
      style={{ left: 73, top: 415, width: 198, height: 198 }} aria-label="摸摸窗边黑猫" onClick={pokeCat} />
    <Sprite frame={cat ? 7 : 6} className={cat ? 'home-yarn is-rolling' : 'home-yarn'}
      style={{ left: 220, top: 520, width: 79, height: 79 }} aria-label="拨一拨毛线球" onClick={pokeCat} />
    <Sprite frame={book ? 5 : 4} className={book ? 'home-book is-turning' : 'home-book'}
      style={{ left: -12, top: 899, width: 316, height: 276 }} aria-label="翻一页魔法书" onClick={flipBook} />
    {GHOSTS.map((ghost, index) => [1,2,3].includes(index) ? null : <Sprite key={`${index}-${ghosts[index] ?? 0}`} ghostIndex={index} frame={ghosts[index] ? 3 : 2}
      className={`home-ghost ${ghosts[index] ? 'is-peeking' : ''}`}
      style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, animationDelay: `${index * -0.7}s` }}
      aria-label={`戳戳${ghost.hint}`} onClick={() => pokeGhost(index)} />)}
    {TOOLS.map(item => <button key={item.id} type="button" className={`home-tool ${tool === item.id ? 'is-twinkling' : ''}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }} aria-label={`碰碰${item.hint}`}
      onClick={() => { setTool(item.id); later(() => setTool(null), 1000); }}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d="m50 4 8 33 33 13-33 9-8 35-10-35L7 50l33-13Z" /></svg>
    </button>)}
    <nav className="home-footer" aria-label="随身物品">
      <button onClick={() => onNavigate('candies')}><i className="home-footer-art home-footer-art--gift" /><span>糖果罐</span></button>
      <button onClick={() => onNavigate('materials')}><i className="home-footer-art home-footer-art--bag" /><span>材料背包</span></button>
    </nav>
    {bubble && <p className="home-bubble" role="status" style={{ left: bubble.x, top: bubble.y }}>{bubble.text}</p>}
  </LogicalCanvas>;
}
