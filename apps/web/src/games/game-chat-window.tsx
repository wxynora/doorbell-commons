import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./game-chat-window.css";
import { GameReactionPreview } from "./game-reaction-preview";
import { GameReactionContext } from "./game-reaction-binding";

/** Supplied by the authenticated table page, never by a preview or room URL alone. */
export interface GameChatBinding {
  roomId: string;
  messages: readonly { roomId: string; sequence: number; playerId?: string; name: string; text: string }[];
  connected: boolean;
  send(text: string, clientMessageId: string): Promise<void>;
}
export const GameChatContext = createContext<GameChatBinding | null>(null);

/** Live messages use the trusted player's id; names are only used by explicit samples. */
export function GameSpeechBubble({ playerId, name }: { playerId: string; name: string }) {
  const chat = useContext(GameChatContext);
  const reaction = useContext(GameReactionContext);
  return <><SpeechBubble key={`chat:${chat?.roomId ?? "sample"}`} chat={chat} playerId={playerId} name={name} /><GameReactionPreview key={`reaction:${reaction?.roomId ?? "preview"}`} name={name} playerId={playerId} /></>;
}

function SpeechBubble({ chat, playerId, name }: { chat: GameChatBinding | null; playerId: string; name: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const sample = !chat && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("chatPreview") === "1";
  const latest = sample ? SAMPLE_MESSAGES.filter(m => m.name === name).at(-1)
    : chat?.messages.filter(m => m.roomId === chat.roomId && m.playerId === playerId).at(-1);
  const initial = useRef(latest?.sequence);
  const [text, setText] = useState("");
  const [position, setPosition] = useState<{ stage: Element; left: number; top: number; unit: number; tip: number } | null>(null);
  useEffect(() => {
    if (!latest || (!sample && initial.current === latest.sequence)) return;
    initial.current = latest.sequence;
    setText(latest.text);
    const timeout = window.setTimeout(() => setText(""), 20_000);
    return () => window.clearTimeout(timeout);
  }, [latest?.sequence, sample]);
  useEffect(() => {
    if (!text) return;
    const anchor = marker.current?.parentElement;
    const stage = anchor?.closest(".uno-stage, .ddz-stage, .leaf-game-stage, .fc-stage, .monopoly-stage, .mj-stage") as HTMLElement | null;
    if (!anchor || !stage) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      const avatar = anchor.querySelector('[class*="avatar"], [class*="portrait"]') ?? anchor;
      const a = avatar.getBoundingClientRect();
      const scale = bounds.width / stage.offsetWidth;
      const unit = Math.min(stage.offsetWidth, stage.offsetHeight) / 390 || 1;
      const width = bubble.current?.offsetWidth ?? 200 * unit;
      const height = bubble.current?.offsetHeight ?? 0;
      const center = (a.left + a.width / 2 - bounds.left) / scale;
      const left = Math.max(8 * unit, Math.min(center - width / 2, stage.offsetWidth - width - 8 * unit));
      setPosition({ stage, unit, left, top: Math.max(8 * unit, (a.top - bounds.top) / scale - height - 8 * unit), tip: Math.max(14 * unit, Math.min(center - left, width - 14 * unit)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (bubble.current) observer.observe(bubble.current);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [text, Boolean(position)]);
  return <><span ref={marker} hidden />{text && position && createPortal(<div ref={bubble} className="game-speech-bubble" style={{ left: position.left, top: position.top, "--bubble-tip": `${position.tip}px`, "--chat-unit": `${position.unit}px` } as CSSProperties} aria-label={`${name}说`}>{text}</div>, position.stage)}</>;
}

const SAMPLE_MESSAGES = [
  { sequence: 1, name: "团团", text: "这把谁先出？" },
  { sequence: 2, name: "桃桃", text: "我来，先出一张绿的。" },
  { sequence: 3, name: "蓝莓", text: "等一下，我看看手牌……\n你们怎么都剩这么少了。" },
  { sequence: 4, name: "芽芽", text: "UNO！" },
  { sequence: 5, name: "桃桃", text: "喊得倒挺快 😂" },
  { sequence: 6, name: "团团", text: "我刚准备抓漏喊，手都抬起来了。下把还一起玩吗？我想再来一局。" },
];

export function GameChatWindow() {
  const chat = useContext(GameChatContext);
  // Switching tables discards the old draft, open state, and pending UI callbacks.
  return <ChatWindow key={chat?.roomId ?? "unconnected"} chat={chat} />;
}

function ChatWindow({ chat }: { chat: GameChatBinding | null }) {
  const sample = !chat && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("chatPreview") === "1";
  const messages = sample ? SAMPLE_MESSAGES : chat?.messages.filter(message => message.roomId === chat.roomId) ?? [];
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const pendingMessage = useRef<{ text: string; id: string } | null>(null);
  const sending = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState(1);
  useEffect(() => {
    const canvas = button.current?.closest<HTMLElement>(".uno-stage, .ddz-stage, .leaf-game-stage, .fc-stage, .monopoly-stage, .mj-stage");
    if (!canvas) return;
    const update = () => setUnit(Math.min(canvas.offsetWidth, canvas.offsetHeight) / 390 || 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const chatStyle = { "--chat-unit": `${unit}px` } as CSSProperties;
  const stage = button.current?.closest(".uno-stage, .ddz-stage, .leaf-game-stage, .fc-stage, .monopoly-stage, .mj-stage");
  const close = () => { setOpen(false); button.current?.focus(); };
  const send = async () => {
    if (!chat?.connected || !draft.trim() || sending.current) return;
    const text = draft;
    if (pendingMessage.current?.text !== text) pendingMessage.current = { text, id: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await chat.send(text, pendingMessage.current.id);
      setDraft("");
      pendingMessage.current = null;
    } catch {
      setError("发送未确认，请重试");
    } finally {
      sending.current = false;
      setBusy(false);
      draftRef.current?.focus();
    }
  };
  return <>
    <button ref={button} style={chatStyle} type="button" className="game-chat-toggle" aria-label="本桌聊天"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
        <path d="M16 5C9.1 5 4.5 9.2 4.5 14.8c0 3.2 1.6 5.9 4.4 7.7l-.8 4.4 5.3-2.7c.9.2 1.8.3 2.6.3 6.9 0 11.5-4.1 11.5-9.7S22.9 5 16 5Z"
          fill="#fffaf0" stroke="#476452" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="10.7" cy="14.8" r="1.4" fill="#476452" />
        <circle cx="16" cy="14.8" r="1.4" fill="#476452" />
        <circle cx="21.3" cy="14.8" r="1.4" fill="#476452" />
      </svg>
    </button>
    {open && stage && createPortal(
      <section id={id} style={chatStyle} className="game-chat-window" role="dialog" aria-label="本桌聊天"
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
        <div className="game-chat-heading"><strong>本桌聊天{sample ? " · 示例" : ""}</strong>
          <button type="button" onClick={close} aria-label="关闭聊天">×</button>
        </div>
        <div className="game-chat-messages" role="log" aria-label="本桌消息" tabIndex={0}>
          {messages.map(message =>
            <div className="game-chat-message" key={message.sequence}><b>{message.name}</b><p>{message.text}</p></div>)}
          {!sample && !chat?.connected && <p className="game-chat-empty">尚未连接本桌聊天</p>}
          {chat?.connected && !chat.messages.some(message => message.roomId === chat.roomId) && <p className="game-chat-empty">还没有消息</p>}
        </div>
        <form className="game-chat-compose" onSubmit={event => { event.preventDefault(); void send(); }}>
          <textarea ref={draftRef} aria-label="聊天内容" placeholder="说点什么…" rows={1}
            value={draft} disabled={!chat?.connected || busy} onChange={event => setDraft(event.target.value)} />
          <button type="submit" aria-label={busy ? "发送中" : "发送"} disabled={!chat?.connected || busy || !draft.trim()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="m10.5 13.5 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </form>
        {error && <p className="game-chat-error" role="alert">{error}</p>}
      </section>, stage)}
  </>;
}
