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
      } ${compact ? "ddz-card--compact" : ""}`}
      disabled={onClick ? disabled : undefined}
      onClick={onClick}
      style={{ "--card-order": index } as React.CSSProperties}
      type={onClick ? "button" : undefined}
    >
      <span className="ddz-card__rank">{rankText(card)}</span>
      <span className="ddz-card__suit">{suitText(card)}</span>
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
        <span className="ddz-player__hair" />
        <span className="ddz-player__eyes">••</span>
      </div>
      {current ? <span className="ddz-player__turn-tag">轮到</span> : null}
      <div className="ddz-player__words">
        <span className="ddz-player__name">
          {player.name}
          <b>{player.controller_type === "human" ? "人类" : "小机"}</b>
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

function Field({ view }: { view: DdzView }) {
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
      <div className="ddz-field__cards">
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
    </section>
  );
}

export function DoudizhuPage() {
  const [view, setView] = useState<DdzView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [residentId, setResidentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const initialStartRef = useRef(false);

  const startGame = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (initialStartRef.current) return;
    initialStartRef.current = true;
    void startGame();
  }, [startGame]);

  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      setScale(Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT));
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
      !view ||
      pending ||
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
  }, [pending, view]);

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
        setView(await sendDoudizhuMove(view, move, view.viewer_id));
        setSelected([]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "这步没有出成，再试一下。");
      } finally {
        setPending(false);
      }
    },
    [view],
  );

  return (
    <main className="ddz-shell">
      <div className="ddz-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="ddz-felt-marks" aria-hidden="true">
          <span>♣</span>
          <span>♦</span>
          <span>♠</span>
        </div>
        <header className="ddz-header">
          <div className="ddz-brand">
            <span>豆</span>
            <strong>欢乐斗地主</strong>
          </div>
          <div className="ddz-round-chip">第 {view?.round ?? 1} 局</div>
          {view ? (
            <div className="ddz-header__actions">
              <button className="ddz-new-game" disabled={pending} onClick={startGame} type="button">
                重开
              </button>
            </div>
          ) : null}
        </header>

        {view ? (
          <>
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
            <PlayerMarker
              current={view.current_player_id === self?.id}
              player={self}
              showBid={view.phase === "bidding"}
              side="self"
              thinking={false}
            />

            {view.phase === "round_over" ? (
              <RoundResult
                pending={pending}
                view={view}
                onNext={() => void runMove({ action: "next_round" })}
              />
            ) : (
              <>
                <Field view={view} />
                {view.phase === "bidding" && humanTurn ? (
                  <section className="ddz-bidding" aria-label="叫分">
                    <span>要当地主吗？</span>
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
                ) : null}
                {residentId && view.phase === "bidding" ? (
                  <div className="ddz-turn-hint">
                    {view.players.find((player) => player.id === residentId)?.name} 正在叫分…
                  </div>
                ) : null}

                {(view.phase === "bidding" || view.phase === "playing") && self?.hand ? (
                  <section
                    className="ddz-hand"
                    aria-label={`${self.name}的手牌`}
                    style={
                      {
                        "--hand-step": `${
                          self.hand.length > 1
                            ? Math.min(42, (740 - 55) / (self.hand.length - 1))
                            : 55
                        }px`,
                      } as React.CSSProperties
                    }
                  >
                    {self.controller_type === "human" ? (
                      self.hand.map((card, index) => {
                        const isSelected = selected.includes(card.id);
                        return (
                          <CardFace
                            card={card}
                            disabled={!humanTurn || pending}
                            index={index}
                            key={card.id}
                            onClick={() =>
                              setSelected((cards) =>
                                isSelected
                                  ? cards.filter((id) => id !== card.id)
                                  : [...cards, card.id],
                              )
                            }
                            selected={isSelected}
                          />
                        );
                      })
                    ) : (
                      <div className="ddz-resident-hand">
                        <span aria-hidden="true">豆</span>
                        <strong>小机手牌已隐藏</strong>
                        <small>{self.hand_count} 张 · 正按合法牌型行动</small>
                      </div>
                    )}
                  </section>
                ) : null}

                {view.phase === "playing" && humanTurn ? (
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
                ) : null}
              </>
            )}

            {eventMessage ? (
              <div
                className={`ddz-event-line ${
                  view.phase === "bidding" ? "ddz-event-line--bidding" : ""
                } ${error ? "ddz-event-line--error" : ""}`}
                aria-live="polite"
              >
                {eventMessage}
              </div>
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
