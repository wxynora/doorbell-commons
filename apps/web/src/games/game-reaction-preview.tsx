import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./game-reaction-preview.css";
import { GameReactionContext } from "./game-reaction-binding";

type Reaction = "flower" | "bomb";
const STAGES = ".uno-stage, .ddz-stage, .leaf-game-stage, .fc-stage, .monopoly-stage, .mj-stage";

export function ReactionArt({ kind }: { kind: Reaction }) {
  return kind === "flower" ? <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 30c-1 11-1 19 3 29" stroke="#527b48" strokeWidth="4" strokeLinecap="round" />
    <path d="M32 49C18 49 17 39 17 39c12-2 17 3 15 10Zm2 5c14-1 16-12 16-12-11-1-17 5-16 12Z" fill="#80a961" />
    <g fill="#efa1b0" stroke="#d57891" strokeWidth="1.5">
      {[0,72,144,216,288].map(angle => <ellipse key={angle} cx="32" cy="16" rx="8" ry="12" transform={`rotate(${angle} 32 27)`} />)}
    </g>
    <circle cx="32" cy="27" r="7" fill="#f5d87f" /><circle cx="30" cy="25" r="2" fill="#fff3bf" />
  </svg> : <svg viewBox="0 0 96 112" fill="none" aria-hidden="true">
    <path d="M58 40c-3-12 15-13 15-23" stroke="#604d43" strokeWidth="5" strokeLinecap="round" />
    <path d="M58 38c-1-9 14-12 14-20" stroke="#cfb27d" strokeWidth="2.5" strokeDasharray="3 3" />
    <g className="reaction-fuse-flame" transform="translate(73 14)">
      <path d="M0-12C-7-6-9 0-5 5 1 12 10 5 7-1 4 1 3-7 0-12Z" fill="#e99b53" />
      <path d="M1-5C-4 0-4 4 0 6 6 7 5 1 1-5Z" fill="#ffe5a1" />
      <path d="m-9-7-4-3M10-6l4-3M11 5l4 2" stroke="#f2c06f" strokeWidth="2" strokeLinecap="round" />
    </g>
    <path d="m47 33 20 7-5 13-20-8Z" fill="#76898d" stroke="#344953" strokeWidth="2" />
    <circle cx="46" cy="72" r="30" fill="#344852" />
    <path d="M19 68c0 28 33 39 49 17-10 5-18 4-23 0-14-2-19-8-26-17Z" fill="#293b46" />
    <path d="M27 59c3-6 9-10 15-11" stroke="#95a8aa" strokeWidth="5" strokeLinecap="round" />
    <path d="M26 68v2" stroke="#95a8aa" strokeWidth="4" strokeLinecap="round" />
    <path d="M57 92c6-2 11-7 13-13" stroke="#4d626c" strokeWidth="2" strokeLinecap="round" />
    <circle cx="39" cy="75" r="2.5" fill="#e4dac3" /><circle cx="52" cy="75" r="2.5" fill="#e4dac3" />
    <path d="M41 83c3 2 6 2 9 0" stroke="#e4dac3" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** Explicit demo is isolated; real actions require an authenticated table binding. */
export function GameReactionPreview({ name, playerId }: { name: string; playerId?: string }) {
  const binding = useContext(GameReactionContext);
  const demo = !binding && new URLSearchParams(window.location.search).get("reactionPreview") === "1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<Partial<Record<Reaction, string>>>({});
  const inFlight = useRef(false);
  const seen = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const marker = useRef<HTMLSpanElement>(null);
  const avatar = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ stage: HTMLElement; x: number; y: number } | null>(null);
  const [effects, setEffects] = useState<{ stage: HTMLElement; kind: Reaction; id: string; style: CSSProperties }[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (!demo && !binding) return;
    const host = marker.current?.parentElement;
    const player = host?.closest(".fc-player") ?? host;
    const target = player?.querySelector<HTMLElement>('[class*="avatar"], [class*="portrait"]');
    if (!target) return;
    avatar.current = target;
    if (playerId) target.dataset.reactionPlayerId = playerId;
    const attrs = ["role", "tabindex", "aria-label", "aria-hidden"];
    const before = attrs.map(attr => target.getAttribute(attr));
    target.setAttribute("role", "button"); target.tabIndex = 0;
    target.setAttribute("aria-label", `与${name}互动${demo ? "（特效预览）" : ""}`); target.removeAttribute("aria-hidden");
    target.classList.add("game-reaction-target");
    const open = (event: Event) => {
      event.stopPropagation();
      if (binding && (!binding.connected || !playerId || playerId === binding.viewerId)) return;
      const stage = target.closest<HTMLElement>(STAGES);
      if (!stage) return;
      const s = stage.getBoundingClientRect(); const a = target.getBoundingClientRect();
      const scale = s.width / stage.offsetWidth;
      setMenu({ stage, x: Math.max(8, Math.min((a.left - s.left) / scale, stage.offsetWidth - 206)), y: Math.max(8, Math.min((a.bottom - s.top) / scale + 8, stage.offsetHeight - 112)) });
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(event); } };
    target.addEventListener("click", open); target.addEventListener("keydown", keyboard);
    return () => {
      target.removeEventListener("click", open); target.removeEventListener("keydown", keyboard);
      target.classList.remove("game-reaction-target");
      delete target.dataset.reactionPlayerId;
      attrs.forEach((attr, i) => before[i] === null ? target.removeAttribute(attr) : target.setAttribute(attr, before[i]!));
    };
  }, [name, playerId, demo, binding?.roomId, binding?.connected, binding?.viewerId]);
  const play = (kind: Reaction, id: string = crypto.randomUUID(), senderId?: string) => {
    if (!avatar.current) return;
    const stage = avatar.current.closest<HTMLElement>(STAGES);
    if (!stage) return;
    const s = stage.getBoundingClientRect(); const a = avatar.current.getBoundingClientRect();
    const scale = s.width / stage.offsetWidth;
    const x = (a.left + a.width / 2 - s.left) / scale;
    const y = (a.top + a.height / 2 - s.top) / scale;
    const self = senderId ? Array.from(stage.querySelectorAll<HTMLElement>("[data-reaction-player-id]")).find(node => node.dataset.reactionPlayerId === senderId) : stage.querySelector(".uno-self-name, .monopoly-player[data-seat='0'], .ddz-player--self, .leaf-player--self, .fc-player--seat-0, .mj-seat");
    if (senderId && !self) return;
    const origin = self?.getBoundingClientRect();
    const fromX = origin ? (origin.left + origin.width / 2 - s.left) / scale : stage.offsetWidth / 2;
    const fromY = origin ? (origin.top + origin.height / 2 - s.top) / scale : stage.offsetHeight - 40;
    setEffects(current => [...current, { stage, kind, id, style: { "--rx": `${x}px`, "--ry": `${y}px`, "--sx": `${fromX}px`, "--sy": `${fromY}px` } as CSSProperties }]);
    const shake = kind === "bomb" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? avatar.current.animate([{translate:"0px"},{translate:"-5px"},{translate:"5px"},{translate:"-3px"},{translate:"0px"}],{delay:850,duration:350}) : null;
    const timer = setTimeout(() => { setEffects(current => current.filter(item => item.id !== id)); shake?.cancel(); timers.current = timers.current.filter(item => item !== timer); }, 3400);
    timers.current.push(timer);
    setMenu(null);
  };
  useEffect(() => {
    if (!binding || !playerId) return;
    return binding.subscribe(event => {
      if (event.roomId !== binding.roomId || event.targetId !== playerId || seen.current.has(event.id)) return;
      seen.current.add(event.id);
      play(event.kind, event.id, event.senderId);
    });
  }, [binding, playerId]);
  async function send(kind: Reaction) {
    if (demo) { play(kind); return; }
    if (!binding?.connected || !playerId || inFlight.current) return;
    const requestId = request.current[kind] ??= crypto.randomUUID();
    inFlight.current = true; setBusy(true); setError("");
    try { await binding.send(playerId, kind, requestId); delete request.current[kind]; setMenu(null); }
    catch { setError("发送尚未确认，请重试"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <><span ref={marker} hidden />
    {menu && createPortal(<div className="game-reaction-menu" role="dialog" aria-label={`与${name}互动预览`} style={{left:menu.x,top:menu.y}} onKeyDown={e => {if(e.key === "Escape")setMenu(null);}}>
      <div className="game-reaction-caption"><span>{demo ? "特效预览 · 不扣款" : "同桌互动"}</span><button onClick={() => setMenu(null)} aria-label="关闭互动">×</button></div>
      <div className="game-reaction-options">{(["flower","bomb"] as const).map(kind => <button key={kind} disabled={busy || (!demo && !binding?.connected)} onClick={() => void send(kind)}><ReactionArt kind={kind} /><span>{kind === "flower" ? "送花" : "扔炸弹"}<small>50 金币</small></span></button>)}</div>
      {error && <p role="alert">{error}</p>}
    </div>, menu.stage)}
    {effects.map(effect => createPortal(<div key={effect.id} className={`game-reaction-layer game-reaction--${effect.kind}`} style={effect.style} aria-label={`${name}收到${effect.kind === "flower" ? "鲜花" : "炸弹"}${demo ? "（预览）" : ""}`}>
      <div className="game-reaction-flight"><ReactionArt kind={effect.kind} /></div>
      <div className="game-reaction-impact">
        {effect.kind === "flower" ? <>{Array.from({length:12},(_,i)=><svg className="game-reaction-mini-flower" viewBox="0 0 32 32" key={i} style={{"--angle":`${i*30}deg`, "--delay":"880ms"} as CSSProperties} aria-hidden="true"><g fill={i%3 === 0 ? "#f2c5a5" : i%3 === 1 ? "#efa9bc" : "#eac1d5"}>{[0,72,144,216,288].map(angle => <ellipse key={angle} cx="16" cy="9" rx="4.8" ry="7" transform={`rotate(${angle} 16 16)`} />)}</g><circle cx="16" cy="16" r="4" fill="#fff0b5" /></svg>)}{Array.from({length:7},(_,i)=><i className="game-flower-sparkle" key={i} style={{"--angle":`${i*51+12}deg`, "--delay":"880ms"} as CSSProperties} />)}</>
        : <><span className="game-reaction-ring" /><span className="game-reaction-star" />{Array.from({length:6},(_,i)=><svg className="game-reaction-smoke" viewBox="0 0 64 54" key={i} style={{"--angle":`${i*60}deg`, "--delay":"850ms"} as CSSProperties} aria-hidden="true"><path d="M9 43C-3 38 1 22 12 21 10 8 27 1 35 12 46 4 61 16 55 27c15 8 6 25-5 22-10 8-21 2-23-1-7 6-15 2-18-5Z" fill={i%2 ? "#d8dace" : "#b9c3bd"} /><path d="M13 24c0-10 14-14 19-5M40 19c7-3 13 3 10 9" fill="none" stroke="#eef0e3" strokeWidth="3" strokeLinecap="round" /></svg>)}{Array.from({length:5},(_,i)=><i className="game-reaction-twinkle" key={i} style={{"--angle":`${i*72+15}deg`} as CSSProperties} />)}</>}
      </div>
    </div>, effect.stage, effect.id))}
  </>;
}
