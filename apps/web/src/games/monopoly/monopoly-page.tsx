import { GameRulesHelp , GameRulesText } from "../game-rules-help";
import { useGameSession, liveMove, asSession } from "../game-session-binding";
import { GameChatWindow, GameSpeechBubble } from "../game-chat-window";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMonopolyGame,
  type MonopolyCell,
  type MonopolyMove,
  type MonopolyPlayer,
  type MonopolySession,
  refreshMonopolyGame,
  sendMonopolyMove,
} from "./monopoly-client";
import { chooseResidentMove, moveForCell } from "./monopoly-interaction";
import { BOARD, LANDSCAPE, movementCells, PORTRAIT, pawnAnchor, tileRect } from "./monopoly-visual";
import "./monopoly-page.css";

const RENT_STAGES = ["裸地", "1房", "2房", "3房", "4房", "旅馆"] as const;
function CellSymbol({ cell }: { cell: MonopolyCell }) {
  if (cell.type === "chance") return <span className="monopoly-question">?</span>;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="monopoly-cell-symbol">
      {cell.type === "rail" ? (
        <g fill="#675a4b">
          <path d="M4 13h11V6h9v10h3v7H4z" />
          <path d="M6 6h5v8H6zM4 4h9v3H4z" />
          <rect x="18" y="8" width="4" height="6" rx="1" fill="#bce0e5" />
          <circle cx="8" cy="25" r="4" />
          <circle cx="22" cy="25" r="4" />
        </g>
      ) : cell.type === "util" ? (
        cell.name.includes("水") ? (
          <path d="M16 3C12 10 6 14 6 20a10 10 0 0 0 20 0C26 14 20 10 16 3z" fill="#69afd1" />
        ) : (
          <path d="M18 2 6 18h9l-2 12L27 12h-9z" fill="#dea947" />
        )
      ) : cell.type === "community" ? (
        <g>
          <rect
            x="3"
            y="4"
            width="20"
            height="25"
            rx="3"
            fill="#d3b379"
            transform="rotate(-9 13 16)"
          />
          <rect x="8" y="4" width="20" height="25" rx="3" fill="#f4e9c7" stroke="#be9754" />
          <path d="m18 9 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#6caeb5" />
        </g>
      ) : (
        <g fill="#d5a052">
          <circle cx="16" cy="17" r="12" />
          <circle cx="16" cy="17" r="9" fill="#f5d990" />
          <path
            d="m11 10 5 6 5-6M16 16v10M10 17h12M10 21h12"
            fill="none"
            stroke="#9b7340"
            strokeWidth="2"
          />
        </g>
      )}
    </svg>
  );
}
function CornerSymbol({ type }: { type: MonopolyCell["type"] }) {
  return (
    <svg viewBox="0 0 64 64" className="monopoly-corner-symbol" aria-hidden="true">
      {type === "go" ? (
        <>
          <path d="M20 49V13" fill="none" stroke="#6e7866" strokeWidth="3" strokeLinecap="round" />
          <path d="M22 13c11-8 17 8 28 0v20c-11 8-17-8-28 0Z" fill="#d68e7e" />
          <path
            d="M16 52h32m-5-5 5 5-5 5"
            fill="none"
            stroke="#ae6b59"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : type === "parking" ? (
        <>
          <path d="M22 37v15" stroke="#87785f" strokeWidth="4" strokeLinecap="round" />
          <path d="M11 27c-3-12 17-23 22-9 12 3 10 21-3 23-12 4-23-3-19-14Z" fill="#93b091" />
          <path
            d="M35 40h18M35 45h18m-15 0v8m12-8v8"
            fill="none"
            stroke="#a89472"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : type === "jail" ? (
        <>
          <rect x="13" y="17" width="38" height="36" rx="9" fill="#e5d6b7" />
          <path d="M11 19 32 8l21 11" fill="#b6bda6" />
          <rect x="23" y="27" width="18" height="26" rx="6" fill="#778674" />
          <path d="M29 29v23m6-23v23m-10-15h14" stroke="#f4ead4" strokeWidth="2.5" />
        </>
      ) : (
        <>
          <path d="M32 10 49 17v15c0 11-17 21-17 21S15 43 15 32V17Z" fill="#a6bbc6" />
          <path
            d="m23 31 6 6 13-15"
            fill="none"
            stroke="#fffaf0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError && reason.message === "Failed to fetch")
    return "本地预览连接断开了";
  return reason instanceof Error ? reason.message : fallback;
}
function money(amount: number): string {
  return amount.toLocaleString("zh-CN");
}

function Pawn({
  accent,
  className = "",
}: {
  accent: MonopolyPlayer["accent"];
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={`monopoly-toy monopoly-toy--${accent} ${className}`}
    >
      <circle
        cx="32"
        cy="35"
        r="26"
        fill={{ coral: "#d99d8c", sky: "#a0bdcb", gold: "#ddc17d", mint: "#a2bca0" }[accent]}
      />
      {accent === "coral" ? (
        <>
          <path d="m14 32 1-19 14 9h6l14-9 1 19c8 23-44 23-36 0Z" fill="#fff3dd" />
          <path d="m18 19 1 10 7-5m20-5-1 10-7-5" fill="#e4b4a4" />
          <circle cx="24" cy="35" r="2" fill="#655d4c" />
          <circle cx="40" cy="35" r="2" fill="#655d4c" />
          <path d="m29 40 3 3 3-3Z" fill="#bb8877" />
          <path
            d="M32 43v3m-13-6-5-1m31 2 5-1"
            stroke="#a28d75"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : accent === "sky" ? (
        <>
          <ellipse cx="23" cy="19" rx="6" ry="15" fill="#fff8e9" transform="rotate(-9 23 19)" />
          <ellipse cx="41" cy="19" rx="6" ry="15" fill="#fff8e9" transform="rotate(9 41 19)" />
          <path d="m22 10 2 17m18-17-2 17" stroke="#dfbdb4" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="32" cy="38" rx="19" ry="16" fill="#fff8e9" />
          <circle cx="25" cy="36" r="2" fill="#5d6667" />
          <circle cx="39" cy="36" r="2" fill="#5d6667" />
          <path
            d="m29 42 3 2 3-2"
            fill="none"
            stroke="#b58d84"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : accent === "gold" ? (
        <>
          <circle cx="17" cy="21" r="8" fill="#a88c61" />
          <circle cx="47" cy="21" r="8" fill="#a88c61" />
          <circle cx="17" cy="21" r="4" fill="#e3cda3" />
          <circle cx="47" cy="21" r="4" fill="#e3cda3" />
          <rect x="13" y="21" width="38" height="33" rx="16" fill="#bfa16e" />
          <circle cx="24" cy="34" r="2" fill="#574f3f" />
          <circle cx="40" cy="34" r="2" fill="#574f3f" />
          <ellipse cx="32" cy="43" rx="9" ry="7" fill="#fff0cf" />
          <ellipse cx="32" cy="40" rx="3" ry="2" fill="#6c5c45" />
          <path d="M32 42v4" stroke="#6c5c45" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="21" cy="24" r="10" fill="#6e9164" />
          <circle cx="43" cy="24" r="10" fill="#6e9164" />
          <ellipse cx="32" cy="39" rx="22" ry="16" fill="#7c9e6e" />
          <circle cx="21" cy="25" r="6" fill="#fff6da" />
          <circle cx="43" cy="25" r="6" fill="#fff6da" />
          <circle cx="22" cy="26" r="2.5" fill="#3d5941" />
          <circle cx="42" cy="26" r="2.5" fill="#3d5941" />
          <path
            d="M24 41q8 7 16 0"
            fill="none"
            stroke="#3d5941"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

function PlayerRow({
  player,
  current,
  index,
  mine,
}: {
  player: MonopolyPlayer;
  current: boolean;
  index: number;
  mine: boolean;
}) {
  return (
    <div
      className={`monopoly-player monopoly-player--${player.accent} ${current ? "monopoly-player--current" : ""} ${player.bankrupt ? "monopoly-player--bankrupt" : ""}`}
      data-seat={index}
    >
      <GameSpeechBubble playerId={player.id} name={player.name} />
      <span className="monopoly-player__portrait">
        <Pawn accent={player.accent} />
      </span>
      <span className="monopoly-player__identity">
        <strong>
          {player.name}
          {mine ? <small className="monopoly-player__you">你</small> : null}
        </strong>
        <b>{money(player.cash)}</b>
        {player.bankrupt || player.in_jail ? (
          <small>{player.bankrupt ? "已破产" : "在监狱"}</small>
        ) : null}
      </span>
      {current && !player.bankrupt ? (
        <span className="monopoly-player__turn" role="img" aria-label="当前行动">
          ◂
        </span>
      ) : null}
    </div>
  );
}

function CellTile({
  cell,
  ownership,
  players,
  selected,
  actionable,
  onClick,
}: {
  cell: MonopolyCell;
  ownership: { owner: string; houses: number; rent: number } | undefined;
  players: MonopolyPlayer[];
  selected: boolean;
  actionable: boolean;
  onClick: () => void;
}) {
  const rect = tileRect(cell.idx);
  const owner = ownership ? players.find((player) => player.id === ownership.owner) : null;
  return (
    <button
      type="button"
      aria-label={`${cell.name}${owner ? `，${owner.name}持有` : ""}`}
      className={`monopoly-cell monopoly-cell--${cell.type} ${cell.group ? `monopoly-cell--${cell.group}` : ""} ${rect.corner ? "monopoly-cell--corner" : ""} ${selected ? "monopoly-cell--selected" : ""} ${actionable ? "monopoly-cell--actionable" : ""}`}
      data-cell={cell.idx}
      data-side={rect.side}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onClick={onClick}
    >
      {cell.group ? <span className="monopoly-cell__group" /> : null}
      {rect.corner ? (
        <CornerSymbol type={cell.type} />
      ) : cell.type !== "prop" ? (
        <span className="monopoly-cell__icon" aria-hidden="true">
          <CellSymbol cell={cell} />
        </span>
      ) : null}
      <span className="monopoly-cell__name">
        {cell.short_name}
      </span>
      {owner ? (
        <span
          className={`monopoly-cell__owner monopoly-color--${owner.accent}`}
          role="img"
          aria-label={`${owner.name}的地产`}
        />
      ) : null}
      {ownership?.houses ? (
        <span
          className="monopoly-cell__houses"
          role="img"
          aria-label={ownership.houses >= 5 ? "旅馆" : `${ownership.houses} 栋房`}
        >
          {ownership.houses >= 5 ? "▥" : "⌂".repeat(ownership.houses)}
        </span>
      ) : null}
    </button>
  );
}

function Dice({ values }: { values: [number, number] | null }) {
  return (
    <div className="monopoly-dice">
      {[0, 1].map((index) => {
        // A resting decorative face is not a roll result.
        const value = values?.[index] ?? (index === 0 ? 5 : 2);
        const pips =
          [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]][value] ??
          [];
        return (
          <svg
            key={index}
            viewBox="0 0 64 70"
            role="img"
            aria-label={values ? `${value} 点` : "待掷骰子"}
          >
            <rect x="2" y="8" width="60" height="60" rx="16" fill="#bbc8b5" />
            <rect
              x="2"
              y="2"
              width="60"
              height="60"
              rx="16"
              fill="#fffcf2"
              stroke="#e6e4d3"
              strokeWidth="1.5"
            />
            {pips.map((dot) => (
              <circle
                key={dot}
                cx={17 + (dot % 3) * 15}
                cy={17 + Math.floor(dot / 3) * 15}
                r="4"
                fill="#536e5b"
              />
            ))}
          </svg>
        );
      })}
    </div>
  );
}

export function MonopolyPage() {
  const live = useGameSession();
  const startedRef = useRef(false);
  const residentRevisionRef = useRef<string | null>(null);
  const [session, setSession] = useState<MonopolySession | null>(null);
  const [selectedCellIndex, setSelectedCellIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState({ scale: 1, portrait: true });
  const [panel, setPanel] = useState<"cell" | "assets" | null>(null);
  const [animation, setAnimation] = useState<{
    playerId: string;
    cell: number;
    step: number;
  } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [shownDice, setShownDice] = useState<[number, number] | null>(null);
  const commandLock = useRef(false);
  const liveFrame=useRef<MonopolySession|null>(null);
  const liveMotion=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;liveMotion.current?.abort();};},[]);
  useEffect(()=>{
    if(!live)return;
    const next=asSession<MonopolySession>(live.game);
    const before=liveFrame.current;
    if(before && next.display.revision<=before.display.revision)return;
    const interrupted=Boolean(liveMotion.current);
    liveMotion.current?.abort();
    liveMotion.current=null;
    liveFrame.current=next;
    setSession(next);setAnimation(null);setShownDice(null);setRolling(false);setBusy(false);
    // Reconnection and interrupted visuals snap to truth, never reconstruct missing turns.
    if(!before || interrupted || next.display.revision!==before.display.revision+1)return;
    const motionRun=new AbortController();
    liveMotion.current=motionRun;
    void (async()=>{
      try{
        if(before && !window.matchMedia("(prefers-reduced-motion: reduce)").matches){
          const moved=next.display.recent_events.some(e=>e.revision>before.display.revision&&e.type==="move");
          const motion=movementCells(before.display,next.display,{action:moved?"roll":"card_ack",label:""});
          setShownDice(next.display.dice);setRolling(false);
          if(motion)for(const [step,cell] of motion.cells.entries()){
            if(!mounted.current || motionRun.signal.aborted)return;
            setAnimation({playerId:motion.playerId,cell,step});
            await new Promise(resolve=>window.setTimeout(resolve,190));
          }
        }
      }finally{if(liveMotion.current===motionRun){liveMotion.current=null;if(mounted.current){setAnimation(null);setShownDice(null);}}}
    })().catch(e=>{if(mounted.current && !motionRun.signal.aborted)setError(e instanceof Error?e.message:"动画未完成");});
  },[live?.game]);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!panel) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previousFocus.current?.focus();
  }, [panel]);

  useEffect(() => {
    const resize = () => {
      const portrait = window.innerHeight / window.innerWidth > 1.12;
      setLayout({
        scale: Math.min(
          window.innerWidth / (portrait ? PORTRAIT.width : LANDSCAPE.width),
          window.innerHeight / (portrait ? PORTRAIT.height : LANDSCAPE.height),
        ),
        portrait,
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const syncGame = async () => {
    const currentView = session?.display;
    if (!currentView || busy) return;
    setBusy(true);
    try {
      if (live) await live.refresh();
      else setSession(await refreshMonopolyGame(currentView));
      residentRevisionRef.current = null;
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason, "暂时无法同步，请再试一次"));
    } finally {
      setBusy(false);
    }
  };

  const startGame = useCallback(async (seed = 61) => {
    if (live) { try { await live.again(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); } return; }
    setBusy(true);
    setError(null);
    residentRevisionRef.current = null;
    try {
      const next = await createMonopolyGame(seed);
      setSession(next);
      setSelectedCellIndex(0);
      setPanel(null);
      setAnimation(null);
      setShownDice(null);
    } catch (caught) {
      setError(errorMessage(caught, "大富翁棋盘没有开起来。再试一次吧。"));
    } finally {
      setBusy(false);
    }
  }, [live]);

  useEffect(() => {
    if (live) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void startGame();
  }, [startGame]);

  const runMove = useCallback(
    async (move: MonopolyMove) => {
      if (!session || busy || commandLock.current) return;
      commandLock.current = true;
      setBusy(true);
      setError(null);
      setRolling(move.action === "roll");
      try {
        const next = live ? asSession<MonopolySession>(await liveMove(live, session.display.revision, move)) : await sendMonopolyMove(session, move);
        if (live) return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const motion = movementCells(session.display, next.display, move);
        setShownDice(next.display.dice);
        if (move.action === "roll" && !reducedMotion) {
          await new Promise((resolve) => window.setTimeout(resolve, 360));
        }
        setRolling(false);
        if (motion && !reducedMotion) {
          for (const [step, cell] of motion.cells.entries()) {
            setAnimation({ playerId: motion.playerId, cell, step });
            await new Promise((resolve) => window.setTimeout(resolve, 190));
          }
        }
        setSession(next);
        setAnimation(null);
        setShownDice(null);
      } catch (caught) {
        if (live) setBusy(false);
        setError(errorMessage(caught, "这一步没有成功，请再试一次。"));
      } finally {
        setRolling(false);
        if (!live) setBusy(false);
        commandLock.current = false;
      }
    },
    [busy, session, live],
  );

  const display = session?.display ?? null;
  const controller = session?.controller ?? null;
  const controllerPlayer = display?.players.find((player) => player.id === controller?.viewer_id);
  const residentAction = controllerPlayer?.controller_type === "resident";

  useEffect(() => {
    if (live || !controller || !residentAction || busy || error) return;
    const key = `${controller.game_id}:${controller.revision}:${controller.viewer_id}`;
    if (residentRevisionRef.current === key) return;
    const move = chooseResidentMove(controller);
    if (!move) return;
    residentRevisionRef.current = key;
    void runMove(move);
  }, [busy, controller, error, residentAction, runMove]);

  const current =
    display?.players.find((player) => player.id === display.current_player_id) ?? null;
  const humanCanAct = Boolean(display?.legal_moves.length);
  const humanMoves = display?.legal_moves ?? [];
  const primaryMoves = humanMoves.filter(
    (move) => move.action !== "build" && move.action !== "sell_house",
  );
  const selectedCell = display?.board[selectedCellIndex] ?? null;
  const selectedOwnership = display?.cells[String(selectedCellIndex)];
  const selectedOwner = selectedOwnership
    ? display?.players.find((player) => player.id === selectedOwnership.owner)
    : null;
  const buildMove = display ? moveForCell(display, "build", selectedCellIndex) : null;
  const sellMove = display ? moveForCell(display, "sell_house", selectedCellIndex) : null;
  const actionableCells = useMemo(
    () =>
      new Set(
        humanMoves
          .filter((move) => move.action === "build" || move.action === "sell_house")
          .map((move) => move.cell_idx),
      ),
    [humanMoves],
  );
  const latestEvent = useMemo(
    () =>
      display
        ? ([...display.recent_events].reverse().find((event) => event.type !== "turn")?.text ??
          "棋盘已经摆好。")
        : "正在铺开棋盘…",
    [display],
  );
  const winner = display?.players.find((player) => player.id === display.winner_id);

  const actionHint = display
    ? winner
      ? `${winner.name} 赢下这局`
      : display.pending_debt
        ? `${display.players.find((player) => player.id === display.pending_debt?.player_id)?.name ?? "玩家"} 需要处理欠款`
        : humanCanAct
          ? "轮到你决定"
          : `${current?.name ?? "玩家"} 的回合`
    : "正在连接本地规则服务";

  const scene = layout.portrait ? PORTRAIT : LANDSCAPE;
  const visibleDice = shownDice ?? display?.dice ?? null;
  const shownPlayers =
    display?.players.map((player) =>
      animation?.playerId === player.id ? { ...player, pos: animation.cell } : player,
    ) ?? [];
  const mine = display?.players.find((player) => player.id === display.viewer_id);
  const myProperties =
    display?.board.filter((cell) => display.cells[String(cell.idx)]?.owner === mine?.id) ?? [];
  const openCell = (index: number) => {
    setSelectedCellIndex(index);
    setPanel("cell");
  };
  const panelKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setPanel(null);
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <main className="monopoly-shell">
      <div
        className={`monopoly-stage${layout.portrait ? " monopoly-stage--portrait" : ""}`}
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(-50%, -50%) scale(${layout.scale})`,
        }}
      >
        <div className="monopoly-table-content" inert={panel !== null}>
          <header className="monopoly-header">
            <div>
              <h1>大富翁</h1>
            </div>
            <GameRulesHelp title="大富翁"><GameRulesText kind="monopoly" /></GameRulesHelp>
            <GameChatWindow />
            <button
              type="button"
              className="monopoly-round-button"
              hidden={Boolean(live)}
              aria-label="重新开桌"
              title="重新开桌"
              disabled={busy}
              onClick={() => void startGame(Date.now())}
            >
              ↻
            </button>
          </header>
          <section className="monopoly-players" aria-label="玩家资产">
            {display?.players.map((player, index) => (
              <PlayerRow
                key={player.id}
                player={player}
                index={index}
                current={player.id === display.current_player_id}
                mine={player.id === display.viewer_id}
              />
            ))}
          </section>
          <section
            className="monopoly-board"
            aria-label="大富翁四十格棋盘"
            style={{ width: BOARD.width, height: BOARD.height }}
          >
            <div className="monopoly-garden" aria-hidden="true">
              <svg className="monopoly-village" viewBox="0 0 220 80">
                <path d="M14 73h192" stroke="#c9d5c6" strokeWidth="2" strokeLinecap="round" />
                <path d="M24 69V49m-6 10 6 5 7-9" stroke="#8d9f82" strokeWidth="3" fill="none" />
                <circle cx="24" cy="44" r="14" fill="#abc5a2" />
                <rect x="49" y="33" width="49" height="39" rx="3" fill="#e6b4a2" />
                <path d="m43 34 30-25 31 25Z" fill="#c88773" />
                <rect x="58" y="44" width="12" height="13" rx="2" fill="#fff9e9" />
                <path d="M80 72V51a6 6 0 0 1 12 0v21" fill="#fff9e9" />
                <rect x="104" y="23" width="51" height="49" rx="3" fill="#efd8a2" />
                <path d="m99 24 30-19 31 19Z" fill="#b8bd91" />
                <rect x="114" y="33" width="13" height="14" rx="2" fill="#fffdf1" />
                <rect x="136" y="33" width="10" height="14" rx="2" fill="#fffdf1" />
                <path d="M126 72V58a6 6 0 0 1 12 0v14" fill="#b8bd91" />
                <path d="M187 72V44" stroke="#8d9f82" strokeWidth="3" />
                <path d="M174 48c-8-13 2-28 13-27 16 0 23 30 7 34-9 3-17 0-20-7Z" fill="#9fbca7" />
                <path d="M37 73h8m119 0h7" stroke="#abc5a2" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>
            {display?.board.map((cell) => (
              <CellTile
                key={cell.idx}
                cell={cell}
                ownership={display.cells[String(cell.idx)]}
                players={display.players}
                selected={panel === "cell" && selectedCellIndex === cell.idx}
                actionable={actionableCells.has(cell.idx)}
                onClick={() => openCell(cell.idx)}
              />
            ))}
            <div className={`monopoly-plaza ${rolling ? "monopoly-plaza--rolling" : ""}`}>
              <div className="monopoly-turn-label" aria-live="polite">
                <strong>
                  {animation
                    ? `${current?.name} 出发啦`
                    : humanCanAct && display?.phase === "awaiting_roll"
                      ? "轮到你啦"
                      : actionHint}
                </strong>
              </div>
              <Dice values={visibleDice} />
              <span className="monopoly-dice-caption">
                {rolling
                  ? "骰子转呀转…"
                  : visibleDice
                    ? `${visibleDice[0] + visibleDice[1]} 步${!shownDice && display?.extra_roll ? " · 双数" : ""}`
                    : "掷骰子，出发吧"}
              </span>
            </div>
            {display?.pending_card ? (
              <div className="monopoly-card-slip">
                <b>{display.pending_card.deck === "chance" ? "机会" : "命运"}</b>
                <span>{display.pending_card.card.text}</span>
              </div>
            ) : null}
            <div className="monopoly-pawns">
              {shownPlayers
                .filter((player) => !player.bankrupt)
                .map((player) => {
                  const occupants = shownPlayers.filter(
                    (other) => !other.bankrupt && other.pos === player.pos,
                  );
                  const spot = pawnAnchor(
                    player.pos,
                    occupants.findIndex((other) => other.id === player.id),
                    occupants.length,
                  );
                  const moving = animation?.playerId === player.id;
                  return (
                    <button
                      type="button"
                      key={player.id}
                      className={`monopoly-pawn ${moving ? "monopoly-pawn--moving" : ""} ${player.id === current?.id ? "monopoly-pawn--current" : ""}`}
                      data-player={player.id}
                      data-position={player.pos}
                      style={{
                        left: spot.x,
                        top: spot.y,
                        width: spot.size,
                        height: spot.size,
                        zIndex: moving ? 10 : player.seat + 1,
                      }}
                      onClick={() => openCell(player.pos)}
                      aria-label={`${player.name}的棋子，位于${display?.board[player.pos]?.name}`}
                    >
                      <Pawn key={moving ? animation.step : "rest"} accent={player.accent} />
                    </button>
                  );
                })}
            </div>
          </section>
          <section className="monopoly-actions" aria-label="回合操作">
            <p className="monopoly-event" aria-live="polite">
              {display && display.revision > 0 ? latestEvent : ""}
            </p>
            {error ? (
              <div className="monopoly-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (display ? void syncGame() : void startGame())}
                >
                  重新连接
                </button>
              </div>
            ) : primaryMoves.length ? (
              <div className="monopoly-actions__buttons">
                {primaryMoves.map((move) => (
                  <button
                    type="button"
                    className={`monopoly-action monopoly-action--${move.action}`}
                    disabled={busy}
                    key={move.action}
                    onClick={() => void runMove(move)}
                  >
                    {move.action === "roll" ? (
                      <span aria-hidden="true" className="monopoly-action__die">
                        ⚄
                      </span>
                    ) : null}
                    {move.action === "buy" ? `买下这里 · ${money(move.amount)}` : move.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="monopoly-actions__waiting">
                {winner ? <GameRoundExit onAgain={() => void startGame()} /> : busy ? "棋子旅行中…" : "马上轮到你"}
              </div>
            )}
            <button
              className="monopoly-assets-button"
              type="button"
              onClick={() => setPanel("assets")}
            >
              我的地产 <span>{myProperties.length}</span>
            </button>
          </section>
        </div>
        {panel ? (
          <div className="monopoly-overlay">
            <button
              className="monopoly-overlay__dismiss"
              aria-label="返回棋盘"
              type="button"
              tabIndex={-1}
              onClick={() => setPanel(null)}
            />
            <div
              className="monopoly-property-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={panel === "assets" ? "我的地产" : "地产详情"}
              ref={panelRef}
              onKeyDown={panelKeyboard}
            >
              <header>
                <h2>{panel === "assets" ? "我的地产" : "看看这块地"}</h2>
                <button
                  className="monopoly-round-button"
                  aria-label="关闭地产详情"
                  type="button"
                  onClick={() => setPanel(null)}
                >
                  ×
                </button>
              </header>
              <div className="monopoly-property-sheet__body">
                {panel === "assets" ? (
                  <>
                    <p className="monopoly-property-summary">
                      {mine?.name} · 现有钞票 <b>{money(mine?.cash ?? 0)}</b>
                    </p>
                    {myProperties.length ? (
                      <div className="monopoly-property-list">
                        {myProperties.map((cell) => (
                          <button
                            key={cell.idx}
                            type="button"
                            className={`monopoly-property-item monopoly-cell--${cell.group ?? "none"}`}
                            onClick={() => openCell(cell.idx)}
                          >
                            <i />
                            <span>
                              <strong>{cell.name}</strong>
                              <small>
                                租金 {money(display?.cells[String(cell.idx)]?.rent ?? 0)} · 建筑{" "}
                                {display?.cells[String(cell.idx)]?.houses ?? 0} 级
                              </small>
                            </span>
                            <b>›</b>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="monopoly-empty-properties">
                        <Pawn accent={mine?.accent ?? "coral"} />
                        <strong>第一块地，会是哪儿呢？</strong>
                        <p>走到未被购买的地产，就可以决定要不要买下。</p>
                      </div>
                    )}
                  </>
                ) : (
                  <section className="monopoly-cell-detail">
                    {selectedCell ? (
                      <>
                        <div className="monopoly-cell-detail__title">
                          <span
                            className={`monopoly-cell-detail__swatch ${
                              selectedCell.group
                                ? `monopoly-cell-detail__swatch--${selectedCell.group}`
                                : ""
                            }`}
                          />
                          <p>
                            <strong>{selectedCell.name}</strong>
                            <small>
                              {selectedOwner
                                ? `${selectedOwner.name}持有`
                                : selectedCell.price
                                  ? "待售地产"
                                  : "公共地块"}
                            </small>
                          </p>
                          {selectedCell.price ? <b>{money(selectedCell.price)} 钞</b> : null}
                        </div>
                        <div className="monopoly-cell-detail__facts">
                          {selectedOwnership ? (
                            <span>当前租金 {money(selectedOwnership.rent)}</span>
                          ) : null}
                          {selectedCell.house_cost ? (
                            <span>盖房 {money(selectedCell.house_cost)}</span>
                          ) : null}
                          {selectedOwnership?.houses ? (
                            <span>建筑 {selectedOwnership.houses} 级</span>
                          ) : null}
                          {!selectedCell.price && !selectedOwnership ? (
                            <span>公共格，落地自动结算</span>
                          ) : null}
                        </div>
                        {selectedCell.rents?.length ? (
                          <div className="monopoly-rent-line">
                            {selectedCell.rents.map((rent, index) => (
                              <span key={`${selectedCell.idx}-${RENT_STAGES[index] ?? rent}`}>
                                <small>{RENT_STAGES[index]}</small>
                                {money(rent)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {buildMove || sellMove ? (
                          <div className="monopoly-cell-detail__actions">
                            {buildMove ? (
                              <button
                                disabled={busy}
                                onClick={() => void runMove(buildMove)}
                                type="button"
                              >
                                盖一栋 · {money(buildMove.amount)}
                              </button>
                            ) : null}
                            {sellMove ? (
                              <button
                                disabled={busy}
                                onClick={() => void runMove(sellMove)}
                                type="button"
                              >
                                卖一栋 · +{money(sellMove.amount)}
                              </button>
                            ) : null}
                          </div>
                        ) : actionableCells.size ? (
                          <small className="monopoly-cell-detail__tip">
                            棋盘上标亮的地块可以建设
                          </small>
                        ) : null}
                      </>
                    ) : null}
                    {primaryMoves
                      .filter(
                        (move) => move.action === "buy" && move.cell_idx === selectedCellIndex,
                      )
                      .map((move) => (
                        <button
                          className="monopoly-action monopoly-action--buy"
                          key={move.action}
                          disabled={busy}
                          type="button"
                          onClick={() => {
                            setPanel(null);
                            void runMove(move);
                          }}
                        >
                          {move.label}
                        </button>
                      ))}
                    <button
                      className="monopoly-back-link"
                      type="button"
                      onClick={() => setPanel("assets")}
                    >
                      查看我的全部地产
                    </button>
                  </section>
                )}
              </div>
              <footer>这里使用局内钞票，不影响社区银币。</footer>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
import { GameRoundExit } from "../game-round-exit";
