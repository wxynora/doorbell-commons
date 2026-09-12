import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import "./game-waiting-room.css";

export type WaitingGameKind = "uno" | "doudizhu" | "leaf-game" | "mahjong" | "monopoly" | "flying-chess";
export interface WaitingRoom {
  roomId: string;
  kind: WaitingGameKind;
  revision: number;
  phase: "waiting" | "playing" | "finished";
  seats: readonly { playerId: string; ready: boolean; residentId?:string|null; controllerType?:'human'|'resident' }[];
  host: { playerId: string } | null;
  baseStake: number | null;
}
export interface GameWaitingRoomProps {
  room: WaitingRoom;
  viewerId: string | null;
  profiles: Readonly<Record<string, { name: string; avatarUrl?: string }>>;
  connected: boolean;
  onJoin?: () => Promise<void>;
  onReady?: (ready: boolean) => Promise<void>;
  onStart?: () => Promise<void>;
  /** Navigation only, not a leave-seat command. */
  onBack?: () => void;
  onRules?: () => void;
}
export const WAITING_GAMES = {
  uno: { name: "UNO", min: 2, max: 4, motif: "UNO" },
  doudizhu: { name: "斗地主", min: 3, max: 3, motif: "♠" },
  "leaf-game": { name: "叶子戏", min: 4, max: 4, motif: "叶" },
  mahjong: { name: "麻将", min: 4, max: 4, motif: "發" },
  monopoly: { name: "大富翁", min: 2, max: 4, motif: "⌂" },
  "flying-chess": { name: "飞行棋", min: 2, max: 4, motif: "✈" },
} as const;

export function GameWaitingRoom({ room, viewerId, profiles, connected, onJoin, onReady, onStart, onBack, onRules }: GameWaitingRoomProps) {
  const container = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState({ wide: false, scale: 1 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const wide = width > height;
      setCanvas({ wide, scale: Math.min(width / (wide ? 780 : 390), height / (wide ? 430 : 720)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const game = WAITING_GAMES[room.kind];
  const self = room.seats.find(seat => seat.playerId === viewerId);
  const canStart = room.seats.length >= game.min && room.seats.length <= game.max && room.seats.every(seat => seat.ready);
  const locked = pending || !connected || room.phase !== "waiting";
  async function act(callback: (() => Promise<void>) | undefined) {
    if (!callback || locked) return;
    setPending(true);
    setError("");
    try { await callback(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作未完成，请重试"); }
    finally { setPending(false); }
  }
  return <div className="game-waiting-viewport" ref={container}>
    <section className={`game-waiting-stage game-waiting--${room.kind} ${canvas.wide ? "is-wide" : ""}`} style={{ "--waiting-scale": canvas.scale } as CSSProperties} aria-label={`${game.name}等待室`} aria-busy={pending}>
      <header className="game-waiting-header">
        <button type="button" onClick={onBack} disabled={!onBack} aria-label="返回休息室">‹</button>
        <h1>{game.name}</h1>
        {onRules && <button type="button" className="game-waiting-rules" onClick={onRules}>规则</button>}
      </header>
      <div className="game-waiting-room-id">房间 <span>{room.roomId}</span></div>
      <div className="game-waiting-center">
        <div className="game-waiting-motif" aria-hidden="true"><i /><i /><b>{game.motif}</b></div>
        <h2>{room.phase === "waiting" ? "等你一起玩" : room.phase === "playing" ? "对局已开始" : "本局已结束"}</h2>
        <p>{room.seats.length} / {game.max} 人入座</p>
        {room.baseStake !== null && <small>底分 {room.baseStake} 银币</small>}
      </div>
      <div className={`game-waiting-seats seats-${game.max}`} aria-label="本桌玩家">
        {Array.from({ length: game.max }, (_, index) => {
          const seat = room.seats[index];
          const profile = seat ? profiles[seat.playerId] : undefined;
          const name = profile?.name ?? "玩家";
          return <div className={`game-waiting-seat seat-${index} ${seat ? "occupied" : "empty"}`} key={seat?.playerId ?? `empty-${index}`}>
            <div className="game-waiting-avatar">{seat ? profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{name.slice(0, 1)}</span> : <span aria-hidden="true">+</span>}{seat?.ready && <i aria-label="已准备">✓</i>}</div>
            <div className="game-waiting-player-name">{seat ? <>{name}{seat.playerId === viewerId && <small>你</small>}</> : "空位"}</div>
            <small className="game-waiting-seat-status">{seat ? `${room.host?.playerId === seat.playerId ? "房主 · " : ""}${seat.ready ? "已准备" : "未准备"}` : "等人加入"}</small>
          </div>;
        })}
      </div>
      <footer className="game-waiting-footer">
        <div className="game-waiting-notice" role="status">{error || (!connected ? "连接已断开，等待重连" : room.phase !== "waiting" ? "" : pending ? "正在提交…" : room.seats.length < game.min ? `还差 ${game.min - room.seats.length} 人即可开局` : !canStart ? "等待大家准备" : "大家都准备好了")}</div>
        <div className="game-waiting-actions">
          {!self ? <button disabled={locked || !onJoin || !viewerId || room.seats.length >= game.max} onClick={() => void act(onJoin)}>入座</button> : <>
            <button className={self.ready ? "secondary" : ""} disabled={locked || !onReady} onClick={() => void act(onReady ? () => onReady(!self.ready) : undefined)}>{self.ready ? "取消准备" : "准备好了"}</button>
            {canStart && <button disabled={locked || !onStart} onClick={() => void act(onStart)}>开始游戏</button>}
          </>}
        </div>
      </footer>
    </section>
  </div>;
}
