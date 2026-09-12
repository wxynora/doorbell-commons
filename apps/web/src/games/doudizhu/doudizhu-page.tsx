import { GameRulesIcon , GameRulesText } from "../game-rules-help";
import { useGameSession, liveMove } from "../game-session-binding";
import { GameChatWindow, GameSpeechBubble } from "../game-chat-window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDoudizhuGame,
  type DdzCard,
  type DdzMove,
  type DdzPlayer,
  type DdzView,
  getDoudizhuGame,
  sendDoudizhuMove,
} from "./doudizhu-client";
import { chooseResidentMove, resolveSelectedMove, tableOpponents } from "./doudizhu-interaction";
import "./doudizhu-page.css";

const CANVAS_WIDTH = 844;
const CANVAS_HEIGHT = 390;
const PREVIEW_OBSERVER_ID = "player-1";

function rankText(card: DdzCard): string {
  if (card.id === "X1") return "小王";
  if (card.id === "X2") return "大王";
  return (
    ({ 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2" } as Record<number, string>)[card.rank] ??
    String(card.rank)
  );
}

function suitText(card: DdzCard): string {
  return (
    ({ S: "♠", H: "♥", D: "♦", C: "♣", X: "★" } as Record<string, string>)[card.suit] ?? card.suit
  );
}

function CardFace({
  card,
  selected = false,
  compact = false,
  disabled = false,
  onClick,
  index = 0,
}: {
  card: DdzCard;
  selected?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const red = card.suit === "H" || card.suit === "D" || card.id === "X2";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      aria-label={
        onClick ? `${card.label}${selected ? "，已选择，点击取消" : "，点击选择"}` : card.label
      }
      aria-pressed={onClick ? selected : undefined}
      className={`ddz-card ${red ? "ddz-card--red" : ""} ${card.joker ? "ddz-card--joker" : ""} ${
        selected ? "ddz-card--selected" : ""
      } ${compact ? "ddz-card--compact" : ""} ${card.rank === 10 ? "ddz-card--ten" : ""}`}
      disabled={onClick ? disabled : undefined}
      onClick={onClick}
      style={{ "--card-order": index } as React.CSSProperties}
      type={onClick ? "button" : undefined}
    >
      <span className="ddz-card__rank">{rankText(card)}</span>
      <span className="ddz-card__suit">{suitText(card)}</span>
      <span className="ddz-card__center" aria-hidden="true">
        {suitText(card)}
      </span>
      {card.joker ? <span className="ddz-card__joker-mark">JOKER</span> : null}
    </Tag>
  );
}

function PlayerMarker({
  player,
  side,
  current,
  thinking,
  showBid,
}: {
  player: DdzPlayer | undefined;
  side: "left" | "right" | "self";
  current: boolean;
  thinking: boolean;
  showBid: boolean;
}) {
  if (!player) return null;
  return (
    <section
      aria-label={`${player.name}，${player.hand_count} 张牌，积分 ${player.score}${current ? "，当前行动" : ""}`}
      className={`ddz-player ddz-player--${side} ddz-player--${player.accent} ${current ? "ddz-player--current" : ""}`}
    >
      <div className="ddz-player__avatar" aria-hidden="true">
        {Array.from(player.name)[0]}
      </div>
      <GameSpeechBubble playerId={player.id} name={player.name} />
      {current ? <span className="ddz-player__turn-tag">轮到</span> : null}
      <div className="ddz-player__words">
        <span className="ddz-player__name">
          {player.name}
          {player.is_landlord ? <i>地主</i> : null}
        </span>
        <span className="ddz-player__meta">
          {player.hand_count} 张 · {player.score >= 0 ? "+" : ""}
          {player.score}
        </span>
      </div>
      {player.passed ? <span className="ddz-player__bubble">不出</span> : null}
      {showBid && player.bid !== null && !player.is_landlord ? (
        <span className="ddz-player__bubble">{player.bid ? `${player.bid} 分` : "不叫"}</span>
      ) : null}
      {thinking ? <span className="ddz-player__thinking">···</span> : null}
      {side !== "self" ? (
        <div className="ddz-player__backs" aria-hidden="true">
          <span />
          <span />
          <b>{player.hand_count}</b>
        </div>
      ) : null}
    </section>
  );
}

function Hand({
  cards,
  name,
  selected,
  disabled,
  portrait,
  onChange,
}: {
  cards: DdzCard[];
  name: string;
  selected: string[];
  disabled: boolean;
  portrait: boolean;
  onChange: (ids: string[]) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    start: number;
    startX: number;
    initial: string[];
    selecting: boolean;
    leftEdges: number[];
  } | null>(null);
  const suppressPointerClick = useRef(false);

  const extendSelection = (event: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const startLeft = active.leftEdges[active.start];
    if (startLeft === undefined) return;
    const nextLeft = active.leftEdges[active.start + 1] ?? startLeft + 64;
    const selectionX = startLeft + (nextLeft - startLeft) / 2 + event.clientX - active.startX;
    const end = Math.max(
      0,
      active.leftEdges.findLastIndex((left) => selectionX >= left),
    );
    const low = Math.min(active.start, end);
    const high = Math.max(active.start, end);
    onChange(
      cards
        .filter((card, index) =>
          index >= low && index <= high ? active.selecting : active.initial.includes(card.id),
        )
        .map((card) => card.id),
    );
  };
  const cancelSelection = (event: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    onChange(active.initial);
    gesture.current = null;
    suppressPointerClick.current = false;
  };

  return (
    <section
      className="ddz-hand"
      aria-label={`${name}的手牌，可按住拖选相邻牌`}
      style={
        {
          "--hand-step": `${Math.min(48, ((portrait ? 312 : 804) - 64) / Math.max(1, cards.length - 1))}px`,
        } as React.CSSProperties
      }
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || !event.isPrimary || gesture.current) return;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".ddz-card");
        if (!button || button.disabled) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".ddz-card")];
        const start = buttons.indexOf(button);
        if (start < 0 || !cards[start]) return;
        gesture.current = {
          pointerId: event.pointerId,
          start,
          startX: event.clientX,
          initial: selected,
          selecting: !selected.includes(cards[start].id),
          // Use rendered coordinates so hit testing follows the shared canvas scale.
          leftEdges: buttons.map((card) => card.getBoundingClientRect().left),
        };
        suppressPointerClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        extendSelection(event);
      }}
      onPointerMove={extendSelection}
      onPointerUp={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        extendSelection(event);
        gesture.current = null;
        suppressPointerClick.current = true;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancelSelection}
      onLostPointerCapture={cancelSelection}
      onClickCapture={(event) => {
        // Pointer selection already happened; keep keyboard-generated clicks (detail 0).
        if (event.detail > 0 && suppressPointerClick.current) {
          suppressPointerClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {cards.map((card, index) => (
        <CardFace
          card={card}
          disabled={disabled}
          index={index}
          key={card.id}
          onClick={() =>
            onChange(
              selected.includes(card.id)
                ? selected.filter((id) => id !== card.id)
                : [...selected, card.id],
            )
          }
          selected={selected.includes(card.id)}
        />
      ))}
    </section>
  );
}

function Field({ view, portrait }: { view: DdzView; portrait: boolean }) {
  const current = view.players.find((player) => player.id === view.current_player_id);
  if (!view.field) {
    return (
      <section className="ddz-field ddz-field--empty" aria-live="polite">
        <span>轮到</span>
        <strong>{current?.name ?? "当前玩家"}</strong>
        <small>{view.phase === "playing" ? "请领出一手牌" : "等待叫分"}</small>
      </section>
    );
  }
  const actor = view.players.find((player) => player.id === view.field?.by);
  return (
    <section
      className="ddz-field"
      aria-label={`${actor?.name ?? "玩家"}出的${view.field.combo.label}`}
      aria-live="polite"
    >
      <div className="ddz-field__caption">
        <span>{actor?.name} 出</span>
        <strong>{view.field.combo.label}</strong>
      </div>
      <div
        className="ddz-field__cards"
        style={
          {
            "--trick-step": `${Math.min(36, ((portrait ? 312 : 480) - 44) / Math.max(1, view.field.cards.length - 1))}px`,
          } as React.CSSProperties
        }
      >
        {view.field.cards.map((card, index) => (
          <CardFace card={card} compact index={index} key={card.id} />
        ))}
      </div>
      {current ? (
        <div className="ddz-field__next">
          轮到 <strong>{current.name}</strong>
          <span>{current.id === view.field.by ? "重新领出" : "请跟牌"}</span>
        </div>
      ) : null}
    </section>
  );
}

function BottomCards({ view }: { view: DdzView }) {
  return (
    <section className="ddz-bottom-cards" aria-label="三张底牌">
      <span className="ddz-bottom-cards__label">底牌</span>
      <div>
        {view.bottom_cards
          ? view.bottom_cards.map((card, index) => (
              <CardFace card={card} compact index={index} key={card.id} />
            ))
          : [0, 1, 2].map((index) => <span className="ddz-mini-back" key={index} />)}
      </div>
    </section>
  );
}

function RoundResult({
  view,
  onNext,
  pending,
}: {
  view: DdzView;
  onNext: () => void;
  pending: boolean;
}) {
  const winner = view.round_winner === "landlord" ? "地主胜" : "农民胜";
  return (
    <section className="ddz-round-result" aria-live="polite">
      <span>第 {view.round} 局</span>
      <strong>{winner}</strong>
      <div className="ddz-round-result__scores">
        {view.last_results?.map((result) => (
          <span key={result.player_id}>
            {result.name}{" "}
            <b>
              {result.delta >= 0 ? "+" : ""}
              {result.delta}
            </b>
          </span>
        ))}
      </div>
      <small>
        {view.spring ? "春天 · " : view.anti_spring ? "反春 · " : ""}本局 ×{view.base ?? 1}
        ，牌型倍数 ×{view.multiplier}
      </small>
      <button disabled={pending} onClick={onNext} type="button">
        再来一局
      </button>
      <GameRoundExit />
    </section>
  );
}

export function DoudizhuPage() {
  const live = useGameSession();
  const [view, setView] = useState<DdzView | null>(null);
  useEffect(() => { if (live) setView(live.game as DdzView); }, [live?.game]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [residentId, setResidentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState({ scale: 1, portrait: false });
  const initialStartRef = useRef(false);

  const syncGame = async () => {
    if (!view || pending) return;
    setPending(true);
    try {
      const next = live ? await live.refresh() as DdzView : await getDoudizhuGame(view.game_id, view.viewer_id ?? PREVIEW_OBSERVER_ID);
      setView(next);
      setSelected([]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法同步，请再试一次");
    } finally {
      setPending(false);
    }
  };

  const startGame = useCallback(async () => {
    if (live) { try { await live.again(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); } return; }
    setPending(true);
    setError(null);
    setSelected([]);
    try {
      setView(await createDoudizhuGame(Date.now()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "斗地主预览没有启动成功。");
    } finally {
      setPending(false);
    }
  }, [live]);

  useEffect(() => {
    if (live) return;
    if (initialStartRef.current) return;
    initialStartRef.current = true;
    void startGame();
  }, [startGame]);

  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const portrait = height / width > 1.25;
      setLayout({
        scale: Math.min(
          width / (portrait ? 352 : CANVAS_WIDTH),
          height / (portrait ? 694 : CANVAS_HEIGHT),
        ),
        portrait,
      });
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (
      live || !view ||
      pending ||
      error ||
      !view.current_player_id ||
      !["bidding", "playing"].includes(view.phase)
    ) {
      return;
    }
    const current = view.players.find((player) => player.id === view.current_player_id);
    if (!current) return;
    let cancelled = false;
    const actorId = view.current_player_id;
    if (current.controller_type === "human") {
      if (actorId !== view.viewer_id) {
        void getDoudizhuGame(view.game_id, actorId)
          .then((next) => {
            if (!cancelled) {
              setView(next);
              setSelected([]);
            }
          })
          .catch((caught) => {
            if (!cancelled)
              setError(caught instanceof Error ? caught.message : "没有切到当前人类座位。");
          });
      }
      return () => {
        cancelled = true;
      };
    }
    setResidentId(actorId);
    const timer = window.setTimeout(async () => {
      try {
        const controller = await getDoudizhuGame(view.game_id, actorId);
        const move = chooseResidentMove(controller);
        if (!move) throw new Error("小机座位没有找到合法动作。");
        const next = await sendDoudizhuMove(
          controller,
          move,
          view.viewer_id ?? PREVIEW_OBSERVER_ID,
        );
        if (!cancelled) {
          setView(next);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "小机座位行动失败。");
      } finally {
        if (!cancelled) setResidentId(null);
      }
    }, 520);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [error, pending, view]);

  const self = view?.players.find((player) => player.id === view.viewer_id);
  const [left, right] = view ? tableOpponents(view) : [undefined, undefined];
  const selectedMove = useMemo(
    () => (view ? resolveSelectedMove(view, selected) : null),
    [selected, view],
  );
  const currentPlayer = view?.players.find((player) => player.id === view.current_player_id);
  const humanTurn = Boolean(
    view?.viewer_id &&
      view.current_player_id === view.viewer_id &&
      currentPlayer?.controller_type === "human",
  );
  const lastEvent = view?.recent_events.at(-1)?.text;
  const eventMessage = error ?? (view?.phase === "bidding" ? lastEvent : null);

  const runMove = useCallback(
    async (move: DdzMove) => {
      if (!view?.viewer_id) return;
      setPending(true);
      setError(null);
      try {
        setView(live ? await liveMove<DdzView>(live, view.revision, move) : await sendDoudizhuMove(view, move, view.viewer_id));
        setSelected([]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "这步没有出成，再试一下。");
      } finally {
        setPending(false);
      }
    },
    [view, live],
  );

  return (
    <main className="ddz-shell">
      <div
        className={`ddz-stage${layout.portrait ? " ddz-stage--portrait" : ""}`}
        style={{
          width: layout.portrait ? 352 : CANVAS_WIDTH,
          height: layout.portrait ? 694 : CANVAS_HEIGHT,
          transform: `translate(-50%, -50%) scale(${layout.scale})`,
        }}
      >
        <header className="ddz-header">
          <div className="ddz-brand">
            <span aria-hidden="true">♠</span>
            <strong>斗地主</strong>
          </div>
          <span className="ddz-round-chip">第 {view?.round ?? 1} 局</span>
          <details
            className="ddz-rules"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary className="game-rules-icon" aria-label="查看规则"><GameRulesIcon /></summary>
            <div>
              <strong>怎么玩</strong>
              <GameRulesText kind="doudizhu" />
            </div>
          </details>
          <GameChatWindow />
          {view && !live ? (
            <button className="ddz-new-game" disabled={pending} onClick={startGame} type="button">
              重开
            </button>
          ) : null}
        </header>
        {view ? (
          <>
            <div className="ddz-table-meta">
              <BottomCards view={view} />
              <div className="ddz-score-strip">
                <span>
                  叫分 <b>{view.base ?? view.high_bid?.value ?? 0}</b>
                </span>
                <span>
                  倍数 <b>×{view.multiplier}</b>
                </span>
                {view.bombs ? (
                  <span>
                    炸弹 <b>{view.bombs}</b>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ddz-opponents">
              <PlayerMarker
                current={view.current_player_id === left?.id}
                player={left}
                showBid={view.phase === "bidding"}
                side="left"
                thinking={residentId === left?.id}
              />
              <PlayerMarker
                current={view.current_player_id === right?.id}
                player={right}
                showBid={view.phase === "bidding"}
                side="right"
                thinking={residentId === right?.id}
              />
            </div>
            <section className="ddz-arena">
              <Field view={view} portrait={layout.portrait} />
              <div className="ddz-decision">
                {view.phase === "bidding" && humanTurn ? (
                  <section className="ddz-bidding" aria-label="叫分">
                    <div>
                      {view.legal_bid_values.map((value) => (
                        <button
                          disabled={pending}
                          key={value}
                          onClick={() => void runMove({ action: "bid", value })}
                          type="button"
                        >
                          {value === 0 ? "不叫" : `${value} 分`}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : view.phase === "playing" && humanTurn ? (
                  <div className="ddz-play-actions">
                    <button
                      className="ddz-play-button"
                      disabled={!selectedMove || pending}
                      onClick={() => selectedMove && void runMove(selectedMove)}
                      type="button"
                    >
                      {selectedMove?.action === "play"
                        ? `出${selectedMove.combo.label}`
                        : selected.length
                          ? "牌型不对"
                          : "出牌"}
                    </button>
                    {view.legal_actions.includes("pass") ? (
                      <button
                        className="ddz-pass-button"
                        disabled={pending}
                        onClick={() => void runMove({ action: "pass" })}
                        type="button"
                      >
                        不出
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="ddz-turn-hint">
                    {residentId
                      ? `${view.players.find((player) => player.id === residentId)?.name} 正在行动…`
                      : "等待行动"}
                  </div>
                )}
              </div>
              <div
                className={`ddz-event-line ${error ? "ddz-event-line--error" : ""}`}
                aria-live="polite"
              >
                {eventMessage}
                {error ? (
                  <button type="button" disabled={pending} onClick={() => void syncGame()}>
                    重新同步本局
                  </button>
                ) : null}
              </div>
            </section>
            <section className="ddz-hand-area">
              <PlayerMarker
                current={view.current_player_id === self?.id}
                player={self}
                showBid={view.phase === "bidding"}
                side="self"
                thinking={false}
              />
              {(view.phase === "bidding" || view.phase === "playing") && self?.hand ? (
                self.controller_type === "human" ? (
                  <Hand
                    cards={self.hand}
                    name={self.name}
                    selected={selected}
                    disabled={!humanTurn || pending}
                    portrait={layout.portrait}
                    onChange={setSelected}
                  />
                ) : (
                  <div className="ddz-resident-hand">
                    <strong>手牌已隐藏</strong>
                    <small>{self.hand_count} 张</small>
                  </div>
                )
              ) : null}
            </section>
            {view.phase === "round_over" ? (
              <RoundResult
                pending={pending}
                view={view}
                onNext={() => live ? void startGame() : void runMove({ action: "next_round" })}
              />
            ) : null}
          </>
        ) : (
          <div className="ddz-loading" aria-live="polite">
            {error ? "牌桌没开起来" : "正在发牌…"}
            <small>{error ?? "参与者身份由接入方式自动确认"}</small>
            {error ? (
              <button type="button" disabled={pending} onClick={() => void startGame()}>
                再试一次
              </button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
import { GameRoundExit } from "../game-round-exit";
