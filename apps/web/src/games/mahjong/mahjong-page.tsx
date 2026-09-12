import { GameRulesIcon , GameRulesText } from "../game-rules-help";
import { GameChatWindow, GameSpeechBubble } from "../game-chat-window";
import { useGameSession } from "../game-session-binding";
import "./mahjong-page.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { request, type Tile, type View } from "./mahjong-client";

const honors: Record<string, string> = { F1: "東", F2: "南", F3: "西", F4: "北", J1: "中", J2: "發", J3: "白" };
const numbers = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function TileFace({ tile }: { tile: Tile }) {
  if (tile.back) return <span className="mj-back" />;
  const code = tile.code || "J3";
  const n = Number(code[1]);
  if (code[0] === "W") return <span className="mj-wan"><b>{numbers[n]}</b><strong>萬</strong></span>;
  if (code[0] === "B" || code[0] === "T") {
    const positions: [number, number][][] = [
      [], [[22, 31]], [[22, 17], [22, 45]], [[12, 13], [22, 31], [32, 49]],
      [[12, 17], [32, 17], [12, 45], [32, 45]],
      [[12, 13], [32, 13], [22, 31], [12, 49], [32, 49]],
      [[12, 12], [32, 12], [12, 31], [32, 31], [12, 50], [32, 50]],
      [[22, 10], [12, 25], [32, 25], [12, 38], [32, 38], [12, 51], [32, 51]],
      [[12, 10], [32, 10], [12, 24], [32, 24], [12, 38], [32, 38], [12, 52], [32, 52]],
      [[10, 12], [22, 12], [34, 12], [10, 31], [22, 31], [34, 31], [10, 50], [22, 50], [34, 50]],
    ];
    return <svg viewBox="0 0 44 62" aria-hidden="true">{(positions[n] ?? []).map(([x, y], i) => code[0] === "B"
      ? <g key={i}><circle cx={x} cy={y} r={n === 1 ? 12 : 4.5} fill="none" stroke={i === 0 && n % 2 ? "#b3483c" : "#285f67"} strokeWidth="2.6" /><circle cx={x} cy={y} r={n === 1 ? 6 : 1.1} fill="#285f67" /></g>
      : <g key={i} stroke={n === 1 ? "#285f67" : "#38734e"} strokeWidth="3" strokeLinecap="round"><path d={`M${x} ${y - 4}v8 M${x - 2} ${y - 3}h4 M${x - 2} ${y + 3}h4`} /></g>
    )}</svg>;
  }
  return <span className={`mj-honor ${code === "J1" ? "red" : code === "J2" ? "green" : ""}`}>{code === "J3" ? <i /> : honors[code]}</span>;
}

function SmallTile({ tile, recent = false }: { tile: Tile; recent?: boolean }) {
  return <span title={tile.label} className={`mj-tile mj-small ${recent ? "recent" : ""}`}><TileFace tile={tile} /></span>;
}

function MeldTiles({ tiles, kind }: { tiles: Tile[]; kind: string }) {
  const label = ({ chi: "吃", peng: "碰", ming_gang: "明杠", concealed_gang: "暗杠", added_gang: "加杠" } as Record<string, string>)[kind];
  return <span className="mj-meld" title={label} aria-label={label}>
    {tiles.map((tile, index) => <span className={index === 3 ? "mj-kong-top" : "mj-meld-slot"} key={tile.id || index}><SmallTile tile={tile} /></span>)}
  </span>;
}

function River({ tiles, x, y, angle, last, portrait }: { tiles: Tile[]; x: number; y: number; angle: number; last?: string | undefined; portrait: boolean }) {
  // Fit every discard into its own fixed seat region; never clip late-hand rivers.
  const columns = Math.max(1, Math.min(tiles.length, portrait ? 6 : 8));
  const rows = Math.ceil(tiles.length / columns);
  const scale = rows ? Math.min(1, (portrait ? 174 : 112) / (rows * 54 + (rows - 1) * 4)) : 1;
  return <div className="mj-anchor" style={{ left: x, top: y, transform: `translate(-50%, -50%) rotate(${angle}deg)` }}>
    <div className="mj-river" style={{ width: columns * 40 + (columns - 1) * 2, gridTemplateColumns: `repeat(${columns}, 40px)`, transform: `scale(${scale})` }}>{tiles.map(t => <SmallTile key={t.id} tile={t} recent={t.id === last} />)}</div>
  </div>;
}

export function MahjongPage() {
  const live = useGameSession();
  const viewerId = live?.viewerId ?? "p0";
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [view, setView] = useState<View | null>(null);
  useEffect(() => { if (live) setView(live.game as View); }, [live?.game]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const [review, setReview] = useState(false);
  const inFlight = useRef(false);
  const portrait = size.width / size.height < 1.15;
  const w = portrait ? 700 : 1400, h = portrait ? 1250 : 650;
  const scale = Math.min(size.width / w, size.height / h);
  const center = { x: w / 2, y: portrait ? 590 : 310 };
  const ownY = portrait ? 1110 : 590;
  const actionY = portrait ? 953 : 510;
  const top = portrait ? 146 : 52;
  const seats = portrait
    ? [{ x: 112, y: 905 }, { x: 626, y: 320 }, { x: 350, y: top }, { x: 74, y: 320 }]
    : [{ x: 150, y: 560 }, { x: 1305, y: 137 }, { x: 700, y: top }, { x: 95, y: 137 }];
  const rivers = portrait
    ? [{ x: 350, y: 746, a: 0 }, { x: 510, y: 555, a: -90 }, { x: 350, y: 362, a: 180 }, { x: 190, y: 555, a: 90 }]
    : [{ x: 700, y: 430, a: 0 }, { x: 970, y: 300, a: -90 }, { x: 700, y: 195, a: 180 }, { x: 430, y: 300, a: 90 }];
  const handSeats = portrait
    ? [{ x: 350, y: ownY, a: 0 }, { x: 637, y: 602, a: -90 }, { x: 350, y: 226, a: 180 }, { x: 63, y: 602, a: 90 }]
    : [{ x: 700, y: ownY, a: 0 }, { x: 1305, y: 347, a: -90 }, { x: 700, y: 126, a: 180 }, { x: 95, y: 347, a: 90 }];

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (live) { await live.again(); return; }
      const next = await request("/api/games", {});
      sessionStorage.setItem("mahjong-preview-game", next.game_id);
      setView(next); setSelected(null); setReview(false);
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (live) return;
    let active = true;
    const saved = sessionStorage.getItem("mahjong-preview-game");
    if (saved) request(`/api/games/${saved}?viewer=p0`).then(v => { if (active) setView(v); }).catch(() => { if (active) void start(); });
    else void start();
    return () => { active = false; };
  }, []);

  async function submit(actionId: string) {
    if (!view || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const next = live ? await live.command({command_id:crypto.randomUUID(), revision:view.revision, action_id:actionId}) as View : await request(`/api/games/${view.game_id}/commands`, { command: {
        command_id: crypto.randomUUID(), revision: view.revision, actor_id: "p0", action_id: actionId,
      } });
      setView(next); setSelected(null);
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (live || !view || busy || error || view.public.game_result || view.public.turn_player_id === "p0") return;
    let active = true;
    // Visual pacing for this disposable demo only, not a resident turn deadline.
    const timer = window.setTimeout(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      request(`/api/games/${view.game_id}/demo-step`, { revision: view.revision })
        .then(next => { if (active) setView(next); })
        .catch(e => { if (active) setError((e as Error).message); })
        .finally(() => { inFlight.current = false; });
    }, 650);
    return () => { active = false; clearTimeout(timer); };
  }, [view, busy, error]);

  const state = view?.public;
  const actions = view?.private?.legal_actions || [];
  const hand = view?.public.terminal_hands?.[viewerId] || view?.private?.hand || [];
  const ownSeat = view?.participants.findIndex(p => p.player_id === viewerId) ?? 0;
  const participants = view ? [...view.participants.slice(Math.max(0, ownSeat)), ...view.participants.slice(0, Math.max(0, ownSeat))] : [];
  const drawn = view?.private?.drawn_tile_id;
  const sorted = [...hand.filter(t => t.id !== drawn), ...hand.filter(t => t.id === drawn)];
  const name = (id?: string | null) => view?.participants.find(p => p.player_id === id)?.display_name || "";
  const result = state?.game_result;
  const specials = actions.filter(a => a.kind !== "discard");
  const selectedAction = actions.find(a => a.action_id === `discard:${selected}`);
  const style = { width: w, height: h, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;

  return <div className="mj-host" ref={host}>
    <main className={`mj-stage ${portrait ? "portrait" : "landscape"}`} style={style}>
      <header><h1>麻将<span>国标</span></h1><nav><GameChatWindow /><button className="game-rules-icon" aria-label="查看麻将规则" onClick={() => setRules(true)}><GameRulesIcon /></button>{!live && <button disabled={busy} onClick={() => void start()}>重新开桌</button>}</nav></header>
      {!view && <div className="mj-loading">正在摆牌…</div>}
      {view && state && <>
        {participants.map((p, i) => <div key={p.player_id} className={`mj-seat ${state.turn_player_id === p.player_id && !result ? "active" : ""}`} style={{ left: seats[i]!.x, top: seats[i]!.y }}>
          <GameSpeechBubble playerId={p.player_id} name={p.display_name} />
          <span className={`mj-avatar tone-${p.seat_index}`}>{p.display_name[0]}</span><span><b>{p.display_name}</b><small>{state.seat_winds[p.player_id]}{p.seat_index === 0 ? " · 庄" : ""}</small></span>
        </div>)}
        {participants.slice(1).map((p, j) => {
          const pos = handSeats[j + 1]!;
          const tiles: Tile[] = state.terminal_hands?.[p.player_id] || Array.from({ length: state.hand_counts[p.player_id]! }, () => ({ back: true }));
          const melds = state.melds[p.player_id]!;
          const lane = portrait ? 500 : 340;
          const meldWidth = melds.length ? melds.length * 160 + (melds.length - 1) * 12 : 0;
          const meldScale = meldWidth ? Math.min(1, (lane - (tiles.length ? 52 : 0)) / meldWidth) : 1;
          const backWidth = tiles.length ? Math.min(tiles.length * 42 - 2, lane - meldWidth * meldScale - (melds.length ? 12 : 0)) : 0;
          const backStep = tiles.length > 1 ? (backWidth - 40) / (tiles.length - 1) : 0;
          return <div className="mj-other-hand mj-anchor" key={p.player_id} style={{ left: pos.x, top: pos.y, transform: `translate(-50%, -50%) rotate(${pos.a}deg)` }}>
            {tiles.length > 0 && <div className="mj-concealed-rack" style={{ width: backWidth }}>{tiles.map((t, i) => <span key={t.id || i} style={{ left: i * backStep }}><SmallTile tile={t} /></span>)}</div>}
            {melds.length > 0 && <div className="mj-other-melds" style={{ width: meldWidth * meldScale, height: 70 * meldScale }}>
              <div style={{ transform: `scale(${meldScale})` }}>{melds.map((m, i) => <MeldTiles key={i} tiles={m.tiles} kind={m.kind} />)}</div>
            </div>}
          </div>;
        })}
        {participants.map((p, i) => <River key={p.player_id} portrait={portrait} tiles={state.discards[p.player_id]!} x={rivers[i]!.x} y={rivers[i]!.y} angle={rivers[i]!.a} last={state.last_discard?.tile.id} />)}
        <section className="mj-center mj-anchor" style={{ left: center.x, top: center.y }}>
          <small>东一局</small><strong>{result ? result.draw ? "荒牌" : `${name(result.winner_player_id)} 和牌` : `${state.wall_remaining}`}</strong>
          <span>{result ? result.draw ? "本手结束" : `${result.total_fan} 番` : "余牌"}</span>
        </section>
        <div className="mj-actions mj-anchor" style={{ left: w / 2, top: actionY }}>
          {result ? <button onClick={() => setReview(true)}>本手结果</button> : <>
            {specials.map(a => <button key={a.action_id} disabled={busy} className={a.kind === "hu" ? "primary" : ""} onClick={() => void submit(a.action_id)}>{a.label}</button>)}
            {actions.some(a => a.kind === "discard") && <button className="primary" disabled={busy || !selectedAction} onClick={() => selectedAction && void submit(selectedAction.action_id)}>出牌</button>}
            {!actions.length && <span className="mj-wait">{name(state.turn_player_id)}{state.phase === "response" ? " 响应中" : " 的回合"}</span>}
          </>}
        </div>
        <div className="mj-own-hand mj-anchor" style={{ left: w / 2, top: ownY }}>
          {view.private?.own_melds.map((m, i) => <MeldTiles key={`meld-${i}`} tiles={m.tiles} kind={m.kind} />)}
          {sorted.map(t => <button key={t.id} aria-label={t.label} aria-pressed={selected === t.id} disabled={busy || !actions.some(a => a.action_id === `discard:${t.id}`)} className={`mj-tile ${selected === t.id ? "selected" : ""} ${t.id === drawn ? "drawn" : ""}`} onClick={() => setSelected(selected === t.id ? null : t.id || null)}><TileFace tile={t} /></button>)}
        </div>
      </>}
      {result && !review && !rules && <GameRoundExit floating onAgain={() => void start()} />}
      {error && <div role="alert" className="mj-error">{error}<button onClick={() => location.reload()}>重新连接</button></div>}
      {(rules || review) && <div className="mj-overlay"><section role="dialog" aria-modal="true" aria-label={rules ? "规则" : "本手结果"}><button className="mj-close" onClick={() => { setRules(false); setReview(false); }}>关闭</button>
        {rules ? <><h2>国标麻将</h2><GameRulesText kind="mahjong" /></>
          : <><h2>{result?.draw ? "荒牌" : `${name(result?.winner_player_id)} · ${result?.total_fan} 番`}</h2>{result?.fans?.map((f, i) => <p key={i}>{f.name}<b className="mj-fan">{f.fan} 番</b></p>)}</>}
        {!rules && result && <GameRoundExit onAgain={() => void start()} />}
      </section></div>}
    </main>
  </div>;
}
import { GameRoundExit } from "../game-round-exit";
