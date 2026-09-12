import { GameRulesHelp , GameRulesText } from "../game-rules-help";
import { useGameSession, liveMove } from "../game-session-binding";
import { GameChatWindow, GameSpeechBubble } from "../game-chat-window";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createFlyingChessGame,
  type FlyingMove,
  type FlyingPlayer,
  type FlyingView,
  refreshFlyingChessGame,
  sendFlyingChessMove,
} from "./flying-chess-client";
import { FRUIT_SEAT_ACCENTS, FruitGlyph } from "./flying-chess-fruit";
import {
  chooseResidentMove,
  HANGAR_POINTS,
  HOME_POINTS,
  LAUNCH_EXIT_POINTS,
  moveForPiece,
  pointForPiece,
  TRACK_CELLS,
  TRACK_POINTS,
} from "./flying-chess-interaction";
import { animateFlyingMove, flightPathPoints } from "./flying-chess-motion";
import "./flying-chess-page.css";

const PREVIEW_VIEWER_ID = "player-1";
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 390;
const BOARD_SIZE = 360;
const PORTRAIT_HEIGHT = 600;
const CELL_SIZE = BOARD_SIZE / 15;
const ACCENTS = FRUIT_SEAT_ACCENTS;
const DICE_DOTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const DICE_POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

type PiecePlacement = {
  player: FlyingPlayer;
  piece: FlyingPlayer["pieces"][number];
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

function cellCenter(point: { x: number; y: number }): { x: number; y: number } {
  return { x: (point.x + 0.5) * CELL_SIZE, y: (point.y + 0.5) * CELL_SIZE };
}

function trackOwner(index: number, view: FlyingView): number {
  for (let seat = 0; seat < view.board.start_indices.length; seat += 1) {
    const start = view.board.start_indices[seat];
    if (start === undefined) continue;
    const progress = ((index - start + view.board.outer_length) % view.board.outer_length) + 1;
    if (view.board.own_color_progress.includes(progress)) return seat;
  }
  return 0;
}

function piecePlacements(view: FlyingView): PiecePlacement[] {
  const grouped = new Map<string, PiecePlacement[]>();
  for (const player of view.players) {
    for (const piece of player.pieces) {
      const point = cellCenter(pointForPiece(player, piece));
      const placement = { player, piece, ...point, offsetX: 0, offsetY: 0 };
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), placement]);
    }
  }

  const offsets = [
    { x: -6, y: -6 },
    { x: 6, y: -6 },
    { x: -6, y: 6 },
    { x: 6, y: 6 },
  ];
  return [...grouped.values()].flatMap((group) =>
    group.map((placement, index) => ({
      ...placement,
      offsetX: group.length === 1 ? 0 : (offsets[index]?.x ?? 0),
      offsetY: group.length === 1 ? 0 : (offsets[index]?.y ?? 0),
    })),
  );
}

function Dice({ value }: { value: number | null }) {
  const active = new Set(DICE_DOTS[value ?? 5]);
  return (
    <div
      className={`fc-dice${value === null ? " is-placeholder" : ""}`}
      role="img"
      aria-label={value ? `骰子点数 ${value}` : "尚未掷骰"}
    >
      {DICE_POSITIONS.map((position, index) => (
        <span key={position} className={active.has(index) ? "is-active" : ""} />
      ))}
    </div>
  );
}

function PlayerMarker({ player, current }: { player: FlyingPlayer; current: boolean }) {
  const accent = ACCENTS[player.seat]!;
  return (
    <div
      className={`fc-player fc-player--${accent} fc-player--seat-${player.seat}${current ? " is-current" : ""}`}
      aria-current={current ? "true" : undefined}
    >
      <span className="fc-player__avatar" aria-hidden="true">
        <FruitGlyph accent={accent} />
      </span>
      <span className="fc-player__info">
        <GameSpeechBubble playerId={player.id} name={player.name} />
        <strong>{player.name}</strong>
        <small>{player.goal_count}/4 到达</small>
      </span>
    </div>
  );
}

export function FlyingChessBoard({
  view,
  onPiece,
  pending,
  boardRef,
}: {
  view: FlyingView;
  onPiece: (pieceId: string) => void;
  pending: boolean;
  boardRef: React.RefObject<HTMLElement | null>;
}) {
  const placements = useMemo(() => piecePlacements(view), [view]);
  const airportExit = cellCenter(LAUNCH_EXIT_POINTS[0]!);
  useLayoutEffect(() => {
    // Hand the completed animation back to the new authoritative board positions before paint.
    if (!placements.length) return;
    boardRef.current?.querySelectorAll<HTMLElement>("[data-piece-id]").forEach((piece) => {
      for (const property of ["left", "top", "transform", "opacity"])
        piece.style.removeProperty(property);
      piece.querySelector<HTMLElement>(".fc-piece__token")?.style.removeProperty("transform");
    });
  }, [placements, boardRef]);
  const humanTurn =
    view.players.find((player) => player.id === view.current_player_id)?.controller_type ===
    "human" && view.current_player_id === view.viewer_id;

  return (
    <section ref={boardRef} className="fc-board" aria-label="飞行棋棋盘" aria-busy={pending}>
      <svg className="fc-board__art" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
        <rect width="360" height="360" fill="none" />
        {ACCENTS.map((accent, seat) => (
          <g key={accent} transform={`rotate(${seat * 90} 180 180)`}>
            <path
              d={`M28 268H78Q92 268 92 282V318L${airportExit.x} ${airportExit.y}H92V332Q92 346 78 346H28Q14 346 14 332V282Q14 268 28 268Z`}
              className={`fc-fruit-airport fc-fill--${accent}`}
            />
          </g>
        ))}
        {HANGAR_POINTS.flatMap((slots, seat) =>
          slots.map((slot) => {
            const point = cellCenter(slot);
            return (
              <circle
                key={`${slot.x}-${slot.y}`}
                cx={point.x}
                cy={point.y}
                r="15"
                className={`fc-hangar-slot fc-fill--${ACCENTS[seat]!}`}
              />
            );
          }),
        )}

        {TRACK_CELLS.map((polygon, index) => {
          const center = cellCenter(TRACK_POINTS[index]!);
          const owner = trackOwner(index, view);
          const points = polygon
            .map((point) => {
              const p = cellCenter(point);
              return `${p.x},${p.y}`;
            })
            .join(" ");
          return (
            <g key={points}>
              <polygon points={points} className={`fc-track-cell fc-fill--${ACCENTS[owner]!}`} />
              <circle
                cx={center.x}
                cy={center.y}
                r={polygon.length === 3 ? 6.5 : 7.5}
                fill="#fffdf8"
              />
            </g>
          );
        })}

        {ACCENTS.map((accent, seat) => (
          <g key={accent} transform={`rotate(${seat * 90} 180 180)`}>
            <path d="M168 310H192V202H168Z" className={`fc-home-ribbon fc-fill--${accent}`} />
          </g>
        ))}
        {HOME_POINTS.flatMap((lane) =>
          lane.map((point) => {
            const center = cellCenter(point);
            return (
              <circle
                key={`${point.x}-${point.y}`}
                cx={center.x}
                cy={center.y}
                r="7"
                fill="#fffdf8"
                className="fc-home-cell"
              />
            );
          }),
        )}

        <g className="fc-goal">
          {ACCENTS.map((accent, seat) => (
            <g key={accent} transform={`rotate(${seat * 90} 180 180)`}>
              <path d="M180 180L156 204H204Z" className={`fc-goal-wedge fc-fill--${accent}`} />
              {seat === 0 ? (
                <g>
                  <path d="M165 199Q180 186 195 199" fill="#c9e495" stroke="none" />
                  <path d="M171 198l-2 -3m9 0v-3m7 3l2 -3" stroke="#6d8f44" strokeWidth="1.5" />
                </g>
              ) : seat === 1 ? (
                <g fill="#f9e5b9" stroke="none">
                  <path d="M161 201Q165 178 177 191Q188 180 199 201Z" />
                  <ellipse cx="175" cy="195" rx="1" ry="2" fill="#9c784c" />
                  <ellipse cx="184" cy="195" rx="1" ry="2" fill="#9c784c" />
                </g>
              ) : seat === 2 ? (
                <path d="M164 199Q180 183 196 199" stroke="#fff1ae" strokeWidth="4" fill="none" />
              ) : (
                <path
                  d="M180 187l2 4 4 1 -3 3v4l-4 -2 -3 1 1 -4 -2 -3 4 -1Z"
                  fill="#4784a8"
                  stroke="none"
                />
              )}
            </g>
          ))}
        </g>

        {ACCENTS.map((accent, seat) => {
          const [source, crossing, destination] = flightPathPoints(view, seat).map(cellCenter) as [{x:number;y:number},{x:number;y:number},{x:number;y:number}];
          const dx = destination.x - source.x,
            dy = destination.y - source.y;
          const length = Math.hypot(dx, dy);
          const ux = dx / length,
            uy = dy / length;
          const tip = { x: destination.x - ux * 10, y: destination.y - uy * 10 };
          const base = { x: tip.x - ux * 6, y: tip.y - uy * 6 };
          return (
            <g key={accent} data-flight-seat={seat} className="fc-flight-guide">
              <line
                x1={source.x + ux * 9}
                y1={source.y + uy * 9}
                x2={tip.x}
                y2={tip.y}
                className={`fc-flight-line fc-stroke--${accent}`}
              />
              <path
                d={`M${tip.x} ${tip.y} L${base.x - uy * 3} ${base.y + ux * 3} L${base.x + uy * 3} ${base.y - ux * 3} Z`}
                className={`fc-flight-arrow fc-fill--${accent}`}
              />
              <circle cx={source.x} cy={source.y} r="3" className={`fc-fill--${accent}`} />
              <circle cx={crossing.x} cy={crossing.y} r="2.4" className={`fc-fill--${accent}`} />
            </g>
          );
        })}
      </svg>

      <div className="fc-board__pieces">
        {placements.map(({ player, piece, x, y, offsetX, offsetY }) => {
          const accent = ACCENTS[player.seat]!;
          const move = moveForPiece(view, piece.id);
          const legal = Boolean(humanTurn && move && !pending);
          const style = {
            "--piece-x": `${((x + offsetX) / BOARD_SIZE) * 100}%`,
            "--piece-y": `${((y + offsetY) / BOARD_SIZE) * 100}%`,
          } as CSSProperties;
          return (
            <button
              key={piece.id}
              data-piece-id={piece.id}
              data-zone={piece.zone}
              type="button"
              className={`fc-piece fc-piece--${accent}${legal ? " is-legal" : ""}${piece.finished ? " is-finished" : ""}`}
              style={style}
              disabled={!legal || piece.finished}
              onClick={() => onPiece(piece.id)}
              aria-label={`${player.name} ${piece.number}号飞机，${piece.finished ? "已到达，翻面停回机场" : legal ? "可以移动" : "等待中"}`}
            >
              <span className="fc-piece__token" aria-hidden="true">
                <span className="fc-piece__body">
                  <FruitGlyph accent={accent} />
                </span>
                <span className="fc-piece__back">
                  <FruitGlyph accent={accent} sliced />
                  <span className="fc-piece__complete-mark">✓</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ActionPanel({
  view,
  pending,
  onMove,
  restartArmed,
  onRequestNewGame,
  onConfirmNewGame,
  onCancelNewGame,
}: {
  view: FlyingView;
  pending: boolean;
  onMove: (move: FlyingMove) => void;
  restartArmed: boolean;
  onRequestNewGame: () => void;
  onConfirmNewGame: () => void;
  onCancelNewGame: () => void;
}) {
  const live = useGameSession();
  const current = view.players.find((player) => player.id === view.current_player_id) ?? null;
  const humanTurn = current?.controller_type === "human" && view.current_player_id === view.viewer_id;
  const currentAccent = ACCENTS[current?.seat ?? 0]!;
  const winner = view.players.find((player) => player.id === view.winner_id) ?? null;
  const diceValue = view.dice ?? view.last_roll?.dice ?? null;

  let instruction = "等候开局";
  if (view.phase === "awaiting_roll")
    instruction = humanTurn ? (pending ? "骰子滚动中" : "点骰子开始") : "正在掷骰";
  if (view.phase === "awaiting_move")
    instruction = pending ? "飞机移动中…" : humanTurn ? "点发光的飞机" : "正在选飞机";
  if (view.phase === "awaiting_penalty")
    instruction = pending ? "正在返航…" : humanTurn ? "点一架飞机返航" : "正在处理三连六";
  if (view.phase === "round_over") instruction = `${winner?.name ?? "本局玩家"}率先全部到达`;

  return (
    <aside className={`fc-actions fc-actions--${currentAccent}`} aria-label="本回合操作">
      <div className="fc-actions__topline">
        <strong>飞行棋</strong>
        <span>第 {view.round} 局</span>
        <button
          type="button"
          className="fc-text-button"
          hidden={Boolean(live)}
          onClick={onRequestNewGame}
          disabled={pending}
          aria-label="重新开局"
          title="重新开局"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
      <div
        className={`fc-turn fc-turn--${currentAccent}${pending && view.phase === "awaiting_roll" ? " is-rolling" : ""}${view.phase === "round_over" ? " is-round-over" : ""}`}
      >
        {view.phase === "round_over" ? (
          <>
          <button
            type="button"
            className="fc-rematch-button"
            onClick={onConfirmNewGame}
            disabled={pending}
          >
            再来一局
          </button>
          <GameRoundExit />
          </>
        ) : humanTurn && view.phase === "awaiting_roll" ? (
          <button
            type="button"
            className="fc-dice-action"
            onClick={() => onMove({ action: "roll" })}
            disabled={pending}
            aria-label="掷骰子"
          >
            <Dice value={diceValue} />
          </button>
        ) : (
          <Dice value={diceValue} />
        )}
        <div className="fc-turn__copy">
          <small>{current?.name}</small>
          <strong>{instruction}</strong>
        </div>
      </div>

      {restartArmed ? (
        <fieldset className="fc-restart-confirm" aria-label="确认重新开局">
          <p>重开本局？</p>
          <div>
            <button type="button" onClick={onCancelNewGame} disabled={pending}>
              继续玩
            </button>
            <button
              type="button"
              className="is-confirm"
              onClick={onConfirmNewGame}
              disabled={pending}
            >
              确认
            </button>
          </div>
        </fieldset>
      ) : null}
    </aside>
  );
}

function useCanvasScale() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setViewport({ width: frame.clientWidth, height: frame.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    update();
    return () => observer.disconnect();
  }, []);
  const portrait = viewport.height / viewport.width > 1.25;
  return {
    frameRef,
    scale: Math.min(
      viewport.width / (portrait ? 352 : CANVAS_WIDTH),
      viewport.height / (portrait ? PORTRAIT_HEIGHT : CANVAS_HEIGHT),
    ),
    portrait,
  };
}

export function FlyingChessPage() {
  const live = useGameSession();
  const [view, setView] = useState<FlyingView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartArmed, setRestartArmed] = useState(false);
  const { frameRef, scale, portrait } = useCanvasScale();
  const operationRef = useRef(0);
  const boardRef = useRef<HTMLElement | null>(null);
  const liveFrame = useRef<FlyingView | null>(null);
  const liveMotion = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current=true; return()=>{mounted.current=false;liveMotion.current?.abort();}; }, []);
  useEffect(() => {
    if (!live) return;
    const next=live.game as FlyingView;
    const before=liveFrame.current;
    if(before && next.revision<=before.revision)return;
    const interrupted=Boolean(liveMotion.current);
    liveMotion.current?.abort();
    liveMotion.current=null;
    liveFrame.current=next;setView(next);setPending(false);
    if(!before || interrupted || next.revision!==before.revision+1)return;
    const motionRun=new AbortController();
    liveMotion.current=motionRun;
    void (async()=>{
      try {
        const move=next.last_move;
        const oldPiece=before?.players.flatMap(p=>p.pieces).find(p=>p.id===move?.piece_id);
        const newPiece=next.players.flatMap(p=>p.pieces).find(p=>p.id===move?.piece_id);
        if(before && move && oldPiece?.progress!==newPiece?.progress) {
          await animateFlyingMove(boardRef.current,before,next,{action:"move",piece_id:move.piece_id,piece_number:move.piece_number},motionRun.signal);
        }
      } finally { if(liveMotion.current===motionRun)liveMotion.current=null; }
    })().catch(e=>{if(mounted.current && !motionRun.signal.aborted)setError(e instanceof Error?e.message:"动画未完成");});
  },[live?.game]);
  useEffect(
    () => () => {
      boardRef.current?.getAnimations({ subtree: true }).forEach((animation) => {
        animation.cancel();
      });
    },
    [],
  );
  const initialStartRef = useRef(false);
  const residentActionKeyRef = useRef<string | null>(null);

  const syncGame = async () => {
    const currentView = view;
    if (!currentView || pending) return;
    setPending(true);
    try {
      if (live) await live.refresh();
      else setView(await refreshFlyingChessGame(currentView));
      residentActionKeyRef.current = null;
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法同步，请再试一次");
    } finally {
      setPending(false);
    }
  };

  const startGame = useCallback(async () => {
    if (live) { try { await live.again(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); } return; }
    const operation = ++operationRef.current;
    setPending(true);
    setError(null);
    setRestartArmed(false);
    residentActionKeyRef.current = null;
    try {
      const next = await createFlyingChessGame(Date.now() >>> 0);
      if (operation === operationRef.current) setView(next);
    } catch (reason) {
      if (operation === operationRef.current)
        setError(reason instanceof Error ? reason.message : "开局失败");
    } finally {
      if (operation === operationRef.current) setPending(false);
    }
  }, [live]);

  useEffect(() => {
    if (live) return;
    if (initialStartRef.current) return;
    initialStartRef.current = true;
    void startGame();
  }, [startGame]);

  const runMove = useCallback(
    async (move: FlyingMove) => {
      if (!view || pending) return;
      const operation = ++operationRef.current;
      setPending(true);
      setError(null);
      setRestartArmed(false);
      try {
        const next = live ? await liveMove<FlyingView>(live, view.revision, move) : await sendFlyingChessMove(view, move, PREVIEW_VIEWER_ID);
        if (live) return;
        if (operation === operationRef.current) {
          await animateFlyingMove(boardRef.current, view, next, move);
          if (operation === operationRef.current) setView(next);
        }
      } catch (reason) {
        if (live) setPending(false);
        if (operation === operationRef.current)
          setError(reason instanceof Error ? reason.message : "这一步没有成功");
      } finally {
        if (!live && operation === operationRef.current) setPending(false);
      }
    },
    [pending, view, live],
  );

  useEffect(() => {
    if (live || !view || pending || error || view.phase === "round_over") return;
    const current = view.players.find((player) => player.id === view.current_player_id);
    if (current?.controller_type !== "resident") return;
    const move = chooseResidentMove(view);
    if (!move) return;
    const actionKey = `${view.game_id}:${view.revision}:${current.id}`;
    if (residentActionKeyRef.current === actionKey) return;
    residentActionKeyRef.current = actionKey;
    void runMove(move);
  }, [error, pending, runMove, view]);

  const lastEvent = view?.recent_events.at(-1)?.text ?? "四架飞机全部到达中心，就拿下这一局。";

  return (
    <main className="fc-viewport">
      <div ref={frameRef} className="fc-safe-frame">
        <div
          className={`fc-stage${portrait ? " fc-stage--portrait" : ""}`}
          style={{
            width: portrait ? 352 : CANVAS_WIDTH,
            height: portrait ? PORTRAIT_HEIGHT : CANVAS_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <GameChatWindow />
          <GameRulesHelp title="飞行棋"><GameRulesText kind="flying-chess" /></GameRulesHelp>
          {!view ? (
            <section className="fc-preview-loading" aria-live="polite">
              <span className="fc-loader" aria-hidden="true" />
              <strong>{error ? "棋盘没铺好" : "正在确认参与者并开局…"}</strong>
              {error ? <small>{error}</small> : null}
              {error ? (
                <button type="button" disabled={pending} onClick={() => void startGame()}>
                  再试一次
                </button>
              ) : null}
            </section>
          ) : (
            <>
              <div className="fc-event" aria-live="polite">
                <p>{lastEvent}</p>
              </div>

              <div className="fc-board-wrap">
                {view.players.map((player) => (
                  <PlayerMarker
                    key={player.id}
                    player={player}
                    current={view.current_player_id === player.id}
                  />
                ))}
                <FlyingChessBoard
                  boardRef={boardRef}
                  view={view}
                  onPiece={(pieceId) => {
                    const move = moveForPiece(view, pieceId);
                    if (move) void runMove(move);
                  }}
                  pending={pending}
                />
              </div>

              <ActionPanel
                view={view}
                pending={pending}
                onMove={(move) => void runMove(move)}
                restartArmed={restartArmed}
                onRequestNewGame={() =>
                  view.phase === "round_over" ? void startGame() : setRestartArmed(true)
                }
                onConfirmNewGame={() => void startGame()}
                onCancelNewGame={() => setRestartArmed(false)}
              />
            </>
          )}

          {error && (
            <div className="fc-error" role="alert">
              {error}
              <button type="button" disabled={pending} onClick={() => void syncGame()}>
                重新同步本局
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
import { GameRoundExit } from "../game-round-exit";
