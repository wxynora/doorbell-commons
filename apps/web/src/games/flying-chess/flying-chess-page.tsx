import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFlyingChessGame,
  type FlyingMove,
  type FlyingPlayer,
  type FlyingView,
  sendFlyingChessMove,
} from "./flying-chess-client";
import {
  chooseResidentMove,
  HANGAR_POINTS,
  HOME_POINTS,
  LAUNCH_POINTS,
  launchRotation,
  moveForPiece,
  pointForPiece,
  TRACK_POINTS,
} from "./flying-chess-interaction";
import "./flying-chess-page.css";

const PREVIEW_VIEWER_ID = "player-1";
const CANVAS_WIDTH = 844;
const CANVAS_HEIGHT = 390;
const BOARD_SIZE = 360;
const CELL_SIZE = BOARD_SIZE / 15;
const ACCENTS = ["coral", "gold", "sky", "mint"] as const;
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
  return (
    <div
      className={`fc-player fc-player--${player.accent}${current ? " is-current" : ""}`}
      aria-current={current ? "true" : undefined}
    >
      <span className="fc-player__plane" aria-hidden="true" />
      <span className="fc-player__info">
        <strong>
          {player.name}
          <i>{player.controller_type === "human" ? "人类" : "小机"}</i>
        </strong>
        <small>{player.goal_count}/4 到达</small>
      </span>
    </div>
  );
}

function Board({
  view,
  onPiece,
  pending,
}: {
  view: FlyingView;
  onPiece: (pieceId: string) => void;
  pending: boolean;
}) {
  const placements = useMemo(() => piecePlacements(view), [view]);
  const humanTurn =
    view.players.find((player) => player.id === view.current_player_id)?.controller_type ===
    "human";

  return (
    <section className="fc-board" aria-label="飞行棋棋盘">
      <svg className="fc-board__art" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
        <defs>
          <filter id="fc-cell-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="1.5"
              stdDeviation="1.5"
              floodColor="#2b5070"
              floodOpacity=".2"
            />
          </filter>
          <pattern id="fc-paper-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#1b6c76" opacity=".06" />
          </pattern>
        </defs>
        <rect width="360" height="360" rx="22" fill="#fff8df" />
        <rect width="360" height="360" rx="22" fill="url(#fc-paper-dots)" />
        <path d="M0 216H144V360H0Z" className="fc-base fc-fill--coral" />
        <path d="M0 0H144V144H0Z" className="fc-base fc-fill--gold" />
        <path d="M216 0H360V144H216Z" className="fc-base fc-fill--sky" />
        <path d="M216 216H360V360H216Z" className="fc-base fc-fill--mint" />

        {ACCENTS.map((accent, seat) => (
          <g key={accent}>
            {(HANGAR_POINTS[seat] ?? []).map((slot) => {
              const point = cellCenter(slot);
              return (
                <circle
                  key={`${accent}-${slot.x}-${slot.y}`}
                  cx={point.x}
                  cy={point.y}
                  r="16"
                  className={`fc-hangar-slot fc-stroke--${accent}`}
                />
              );
            })}
          </g>
        ))}

        {TRACK_POINTS.map((point, index) => {
          const center = cellCenter(point);
          const owner = trackOwner(index, view);
          return (
            <rect
              key={`${point.x}-${point.y}`}
              x={center.x - 9.5}
              y={center.y - 9.5}
              width="19"
              height="19"
              rx="6"
              className={`fc-track-cell fc-fill--${ACCENTS[owner]}`}
              filter="url(#fc-cell-shadow)"
            />
          );
        })}

        {HOME_POINTS.flatMap((lane, seat) => {
          const accent = ACCENTS[seat];
          return lane.map((point) => {
            const center = cellCenter(point);
            return (
              <rect
                key={`${accent}-${point.x}-${point.y}`}
                x={center.x - 9.5}
                y={center.y - 9.5}
                width="19"
                height="19"
                rx="6"
                className={`fc-home-cell fc-fill--${accent}`}
              />
            );
          });
        })}

        {LAUNCH_POINTS.map((point, seat) => {
          const center = cellCenter(point);
          return (
            <g
              key={`${point.x}-${point.y}`}
              transform={`translate(${center.x} ${center.y}) rotate(${launchRotation(seat)})`}
            >
              <circle r="14" className={`fc-launch fc-fill--${ACCENTS[seat]}`} />
              <path d="M-7 3L0-8 7 3 2 2 0 8-2 2Z" fill="#fff8e9" />
            </g>
          );
        })}

        {view.board.start_indices.map((start, seat) => {
          const source =
            TRACK_POINTS[(start + view.board.flight_source_progress - 1) % view.board.outer_length];
          const destination =
            TRACK_POINTS[(start + view.board.flight_dest_progress - 1) % view.board.outer_length];
          if (!source || !destination) return null;
          const first = cellCenter(source);
          const second = cellCenter(destination);
          return (
            <path
              key={start}
              d={`M${first.x} ${first.y} L${second.x} ${second.y}`}
              className={`fc-flight-line fc-stroke--${ACCENTS[seat]}`}
            />
          );
        })}

        <g className="fc-goal">
          <path d="M180 180L156 204H204Z" className="fc-fill--coral" />
          <path d="M180 180L156 156V204Z" className="fc-fill--gold" />
          <path d="M180 180L204 156H156Z" className="fc-fill--sky" />
          <path d="M180 180L204 204V156Z" className="fc-fill--mint" />
          <circle cx="180" cy="180" r="8" fill="#fff8df" />
        </g>
      </svg>

      <div className="fc-board__pieces">
        {placements.map(({ player, piece, x, y, offsetX, offsetY }) => {
          const move = moveForPiece(view, piece.id);
          const legal = Boolean(humanTurn && move && !pending);
          const style = {
            "--piece-x": `${x + offsetX}px`,
            "--piece-y": `${y + offsetY}px`,
          } as CSSProperties;
          return (
            <button
              key={piece.id}
              type="button"
              className={`fc-piece fc-piece--${player.accent}${legal ? " is-legal" : ""}${piece.finished ? " is-finished" : ""}`}
              style={style}
              disabled={!legal}
              onClick={() => onPiece(piece.id)}
              aria-label={`${player.name} ${piece.number}号飞机，${piece.zone === "goal" ? "已到达" : legal ? "可以移动" : "等待中"}`}
            >
              <span className="fc-piece__body" aria-hidden="true" />
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
  const current = view.players.find((player) => player.id === view.current_player_id) ?? null;
  const humanTurn = current?.controller_type === "human";
  const winner = view.players.find((player) => player.id === view.winner_id) ?? null;
  const diceValue = view.dice ?? view.last_roll?.dice ?? null;

  let instruction = "等候开局";
  if (view.phase === "awaiting_roll")
    instruction = humanTurn ? (pending ? "骰子滚动中" : "点骰子开始") : "正在掷骰";
  if (view.phase === "awaiting_move") instruction = humanTurn ? "点发光的飞机" : "正在选飞机";
  if (view.phase === "awaiting_penalty")
    instruction = humanTurn ? "点一架飞机返航" : "正在处理三连六";
  if (view.phase === "round_over") instruction = `${winner?.name ?? "本局玩家"}率先全部到达`;

  return (
    <aside className={`fc-actions fc-actions--${current?.accent ?? "sky"}`} aria-label="本回合操作">
      <div className="fc-actions__topline">
        <span>第 {view.round} 局</span>
        <button
          type="button"
          className="fc-text-button"
          onClick={onRequestNewGame}
          disabled={pending}
          aria-label="重新开局"
          title="重新开局"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
      <div
        className={`fc-turn fc-turn--${current?.accent ?? "sky"}${pending ? " is-pending" : ""}${view.phase === "round_over" ? " is-round-over" : ""}`}
      >
        {view.phase === "round_over" ? (
          <button
            type="button"
            className="fc-rematch-button"
            onClick={onConfirmNewGame}
            disabled={pending}
          >
            再来一局
          </button>
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
  return {
    frameRef,
    scale: Math.min(viewport.width / CANVAS_WIDTH, viewport.height / CANVAS_HEIGHT),
  };
}

export function FlyingChessPage() {
  const [view, setView] = useState<FlyingView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartArmed, setRestartArmed] = useState(false);
  const { frameRef, scale } = useCanvasScale();
  const operationRef = useRef(0);
  const initialStartRef = useRef(false);
  const residentActionKeyRef = useRef<string | null>(null);

  const startGame = useCallback(async () => {
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
  }, []);

  useEffect(() => {
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
        const next = await sendFlyingChessMove(view, move, PREVIEW_VIEWER_ID);
        if (operation === operationRef.current) setView(next);
      } catch (reason) {
        if (operation === operationRef.current)
          setError(reason instanceof Error ? reason.message : "这一步没有成功");
      } finally {
        if (operation === operationRef.current) setPending(false);
      }
    },
    [pending, view],
  );

  useEffect(() => {
    if (!view || pending || view.phase === "round_over") return;
    const current = view.players.find((player) => player.id === view.current_player_id);
    if (current?.controller_type !== "resident") return;
    const move = chooseResidentMove(view);
    if (!move) return;
    const actionKey = `${view.game_id}:${view.revision}:${current.id}`;
    if (residentActionKeyRef.current === actionKey) return;
    residentActionKeyRef.current = actionKey;
    void runMove(move);
  }, [pending, runMove, view]);

  const playerBySeat = useMemo(() => {
    const map = new Map<number, FlyingPlayer>();
    view?.players.forEach((player) => {
      map.set(player.seat, player);
    });
    return map;
  }, [view]);
  const bottomPlayer = playerBySeat.get(0);
  const leftPlayer = playerBySeat.get(1);
  const topPlayer = playerBySeat.get(2);
  const rightPlayer = playerBySeat.get(3);
  const lastEvent = view?.recent_events.at(-1)?.text ?? "四架飞机全部到达中心，就拿下这一局。";

  return (
    <main className="fc-viewport">
      <div className="fc-sky-shape fc-sky-shape--one" aria-hidden="true" />
      <div className="fc-sky-shape fc-sky-shape--two" aria-hidden="true" />
      <div ref={frameRef} className="fc-safe-frame">
        <div
          className="fc-stage"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
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
              {leftPlayer && (
                <PlayerMarker
                  player={leftPlayer}
                  current={view.current_player_id === leftPlayer.id}
                />
              )}
              {bottomPlayer && (
                <PlayerMarker
                  player={bottomPlayer}
                  current={view.current_player_id === bottomPlayer.id}
                />
              )}
              {topPlayer && (
                <PlayerMarker
                  player={topPlayer}
                  current={view.current_player_id === topPlayer.id}
                />
              )}
              {rightPlayer && (
                <PlayerMarker
                  player={rightPlayer}
                  current={view.current_player_id === rightPlayer.id}
                />
              )}

              <div className="fc-event" aria-live="polite">
                <p>{lastEvent}</p>
              </div>

              <div className="fc-board-wrap">
                <Board
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
              <button type="button" onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
