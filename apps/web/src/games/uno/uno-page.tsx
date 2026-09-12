import { GameRulesIcon , GameRulesText } from "../game-rules-help";
import { useGameSession, liveMove, asSession } from "../game-session-binding";
import { GameChatWindow, GameSpeechBubble } from "../game-chat-window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUnoGame,
  refreshUnoGame,
  sendUnoMove,
  type UnoCard,
  type UnoColor,
  type UnoMove,
  type UnoPlayer,
  type UnoSession,
} from "./uno-client";
import {
  chooseResidentMove,
  colorChoicesForCard,
  playForCard,
  playsForCard,
} from "./uno-interaction";
import "./uno-page.css";

const CANVAS_WIDTH = 844;
const CANVAS_HEIGHT = 390;
const COLOR_NAMES: Record<UnoColor, string> = { R: "红", G: "绿", B: "蓝", Y: "黄" };

function cardMark(card: UnoCard): string {
  if (card.kind === "number") return String(card.number);
  if (card.kind === "skip") return "⊘";
  if (card.kind === "reverse") return "↻";
  if (card.kind === "draw2") return "+2";
  if (card.kind === "wild4") return "+4";
  return "◆";
}

function cardActionName(card: UnoCard): string {
  if (card.kind === "skip") return "跳过";
  if (card.kind === "reverse") return "反转";
  if (card.kind === "draw2") return "摸二";
  if (card.kind === "wild4") return "换色 +4";
  if (card.kind === "wild") return "万能换色";
  return "";
}

// UNO card anatomy and compact seats adapted from CedarDuet's UNO renderer.
function CardFace({
  card,
  compact = false,
  disabled = false,
  onClick,
  order = 0,
  playable = false,
}: {
  card: UnoCard;
  compact?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  order?: number;
  playable?: boolean;
}) {
  const className = `uno-card uno-card--${card.color ?? "wild"} uno-card--kind-${card.kind}${compact ? " uno-card--compact" : ""}${playable ? " is-playable" : ""}`;
  const contents = (
    <>
      <span className="uno-card-corner top" aria-hidden="true">
        {cardMark(card)}
      </span>
      <span className="uno-card-face" aria-hidden="true">
        {cardMark(card)}
      </span>
      <span className="uno-card-corner bottom" aria-hidden="true">
        {cardMark(card)}
      </span>
      {card.kind !== "number" ? (
        <span className="uno-card-name">{cardActionName(card)}</span>
      ) : null}
    </>
  );
  if (!onClick)
    return (
      <div className={className} role="img" aria-label={card.label}>
        {contents}
      </div>
    );
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={`${card.label}，点击出牌`}
      onClick={onClick}
      style={{ "--uno-order": order } as React.CSSProperties}
    >
      {contents}
    </button>
  );
}

function CardBack() {
  return (
    <span className="uno-card-back" aria-hidden="true">
      <span>UNO</span>
    </span>
  );
}

function PlayerEdge({ player, current }: { player: UnoPlayer; current: boolean }) {
  return (
    <article
      className={`uno-opponent${current ? " current" : ""}`}
      aria-label={`${player.name}，${player.hand_count} 张牌，${player.score} 分${current ? "，行动中" : ""}`}
    >
      <span className={`uno-avatar uno-avatar--${player.accent}`} aria-hidden="true">
        {Array.from(player.name)[0] ?? "?"}
      </span>
      <GameSpeechBubble playerId={player.id} name={player.name} />
      <div className="uno-opponent-copy">
        <strong>
          {player.name}
          {player.controller_type === "human" ? <small>人类</small> : null}
        </strong>
        <span>
          {player.score} 分{current ? <b className="uno-seat-turn">行动中</b> : null}
        </span>
      </div>
      <div className="uno-opponent-backs" aria-hidden="true">
        {player.hand_count > 0 ? <CardBack /> : null}
        {player.hand_count > 1 ? <CardBack /> : null}
      </div>
      <div className="uno-hand-count">
        <b>{player.hand_count}</b>
        <small>张</small>
      </div>
      {player.uno ? <em className="uno-player-alarm">UNO!</em> : null}
    </article>
  );
}

function handStep(hand: UnoCard[], portrait: boolean): number {
  if (hand.length <= 1) return 64;
  const availableWidth = (portrait ? 352 : CANVAS_WIDTH) - 2 * (12 + 8) - 64;
  return Math.min(56, (availableWidth - 64) / (hand.length - 1));
}

export function UnoPage() {
  const live = useGameSession();
  const HUMAN_ID = live?.viewerId ?? "player-1";
  const startedRef = useRef(false);
  const [session, setSession] = useState<UnoSession | null>(null);
  useEffect(() => { if (live) setSession(asSession<UnoSession>(live.game)); }, [live?.game]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  const [reactionFeedback, setReactionFeedback] = useState<string | null>(null);
  const [layout, setLayout] = useState({ scale: 1, portrait: false });

  useEffect(() => {
    const resize = () => {
      const portrait = window.innerHeight / window.innerWidth > 1.25;
      setLayout({
        scale: Math.min(
          window.innerWidth / (portrait ? 352 : CANVAS_WIDTH),
          window.innerHeight / (portrait ? 694 : CANVAS_HEIGHT),
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
      const next = live ? asSession<UnoSession>(await live.refresh()) : await refreshUnoGame(currentView);
      setSession(next);

      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法同步，请再试一次");
    } finally {
      setBusy(false);
    }
  };

  const startGame = useCallback(async (seed = 43) => {
    if (live) { try { await live.again(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); } return; }
    setBusy(true);
    setError(null);
    setWildCardId(null);
    setReactionFeedback(null);
    try {
      setSession(await createUnoGame(seed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "UNO 牌桌没有开起来。");
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
    async (move: UnoMove, actorId?: string) => {
      if (!session || busy) return;
      setBusy(true);
      setError(null);
      setReactionFeedback(null);
      try {
        setSession(live ? asSession<UnoSession>(await liveMove(live, session.display.revision, move)) : await sendUnoMove(session, move, actorId));
        if (move.action !== "call_uno") setWildCardId(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "这一步没有成功。");
      } finally {
        setBusy(false);
      }
    },
    [busy, session, live],
  );

  const display = session?.display ?? null;
  const controller = session?.controller ?? null;
  const human = display?.players.find((player) => player.id === HUMAN_ID);
  const current = display?.players.find((player) => player.id === display.current_player_id);
  const humanTurn = display?.phase === "playing" && display.current_player_id === HUMAN_ID;
  const residentTurn = display?.phase === "playing" && current?.controller_type === "resident";
  const hand = human?.hand ?? [];
  const latestEvent = useMemo(
    () =>
      display
        ? ([...display.recent_events]
            .reverse()
            .find((event) => !["turn", "start", "deal"].includes(event.type))?.text ?? null)
        : null,
    [display],
  );

  useEffect(() => {
    if (live || !residentTurn || !controller || busy || error) return;
    const move = chooseResidentMove(controller);
    const actorId = controller.viewer_id ?? controller.current_player_id;
    if (move && actorId) void runMove(move, actorId);
  }, [busy, controller, error, residentTurn, runMove]);

  const clickCard = useCallback(
    (card: UnoCard) => {
      if (!controller || !humanTurn || busy) return;
      const plays = playsForCard(controller, card.id);
      if (!plays.length) {
        setError("这张牌现在接不上。可以换一张，或点牌堆摸牌。");
        return;
      }
      const colors = colorChoicesForCard(controller, card.id);
      if (colors.length) {
        setWildCardId(card.id);
        setError(null);
        return;
      }
      const move = playForCard(controller, card.id);
      if (move) void runMove(move, HUMAN_ID);
    },
    [busy, controller, humanTurn, runMove],
  );

  const drawMove = controller?.legal_moves.find((move) => move.action === "draw") ?? null;
  const keepMove = controller?.legal_moves.find((move) => move.action === "keep") ?? null;
  const nextRoundMove =
    controller?.legal_moves.find((move) => move.action === "next_round") ?? null;
  const humanCallUnoMove = display?.legal_moves.find((move) => move.action === "call_uno") ?? null;
  const humanCatchUnoMove =
    display?.legal_moves.find((move) => move.action === "catch_uno") ?? null;
  const colorChoices = controller && wildCardId ? colorChoicesForCard(controller, wildCardId) : [];

  const turnHint = display
    ? display.phase === "round_over"
      ? "本局收盘"
      : humanTurn
        ? display.pending?.mine
          ? "出牌或保留"
          : "轮到你"
        : `${current?.name ?? "小机"} 的回合`
    : "正在洗牌…";

  return (
    <main className="uno-shell">
      <div
        className={`uno-stage${layout.portrait ? " uno-stage--portrait" : ""}`}
        style={{
          width: layout.portrait ? 352 : CANVAS_WIDTH,
          height: layout.portrait ? 694 : CANVAS_HEIGHT,
          transform: `translate(-50%, -50%) scale(${layout.scale})`,
        }}
      >
        <header className="uno-header">
          <div className="uno-brand" aria-label="UNO" role="img">
            UNO
          </div>
          <span className="uno-round-info">第 {display?.round ?? 1} 局</span>
          <details
            className="uno-rules"
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
              <GameRulesText kind="uno" />
            </div>
          </details>
          <GameChatWindow />
          <button
            className="uno-new-game"
            hidden={Boolean(live)}
            disabled={busy}
            onClick={() => void startGame(Date.now())}
            type="button"
          >
            重新开桌
          </button>
        </header>

        {display ? (
          <>
            <section className="uno-opponents" aria-label="其他玩家">
              {display.players
                .filter((player) => player.id !== HUMAN_ID)
                .map((player) => (
                  <PlayerEdge
                    key={player.id}
                    player={player}
                    current={display.phase === "playing" && player.id === display.current_player_id}
                  />
                ))}
            </section>

            <section className="uno-arena" aria-label="UNO 桌面牌区">
              <div className="uno-table-info">
                <div className="uno-status">
                  <span className={`uno-current-color uno-current-color--${display.active_color}`}>
                    <i aria-hidden="true" />
                    {display.active_color_name}色
                  </span>
                  <span className="uno-direction">
                    {display.direction > 0 ? "↻" : "↺"} {display.direction_label}
                  </span>
                </div>
                <strong className="uno-turn-hint">{turnHint}</strong>
                {reactionFeedback || latestEvent ? (
                  <p className="uno-event-line" aria-live="polite">
                    {reactionFeedback ?? latestEvent}
                  </p>
                ) : null}
                {error ? (
                  <p className="uno-error-line" role="alert">
                    {error}
                    <button
                      className="uno-sync-button"
                      type="button"
                      disabled={busy}
                      onClick={() => void syncGame()}
                    >
                      重新同步本局
                    </button>
                  </p>
                ) : null}
              </div>

              <div className="uno-center">
                <div className="uno-pile">
                  <button
                    type="button"
                    className="uno-draw-pile"
                    aria-label={`摸一张，牌库剩 ${display.deck_count} 张`}
                    disabled={busy || !humanTurn || !drawMove}
                    onClick={() => drawMove && void runMove(drawMove, HUMAN_ID)}
                  >
                    <CardBack />
                  </button>
                  <span>
                    摸牌堆 <b>{display.deck_count}</b>
                  </span>
                </div>
                <div className="uno-pile">
                  {display.top_card ? <CardFace card={display.top_card} compact /> : null}
                  <span>弃牌堆顶</span>
                </div>
              </div>

              <div className="uno-actions">
                {keepMove && humanTurn ? (
                  <button
                    className="uno-keep-button"
                    disabled={busy}
                    onClick={() => void runMove(keepMove, HUMAN_ID)}
                    type="button"
                  >
                    保留
                  </button>
                ) : null}
                {wildCardId && controller && colorChoices.length ? (
                  <fieldset className="uno-color-picker">
                    <legend>变成哪种颜色？</legend>
                    {colorChoices.map((color) => (
                      <button
                        aria-label={`变成${COLOR_NAMES[color]}色`}
                        className={`uno-color-choice uno-color-choice--${color}`}
                        disabled={busy}
                        key={color}
                        onClick={() => {
                          const move = playForCard(controller, wildCardId, color);
                          if (move) void runMove(move, HUMAN_ID);
                        }}
                        type="button"
                      >
                        {COLOR_NAMES[color]}
                      </button>
                    ))}
                    <button
                      aria-label="取消选择颜色"
                      className="uno-color-cancel"
                      onClick={() => setWildCardId(null)}
                      type="button"
                    >
                      ×
                    </button>
                  </fieldset>
                ) : null}
              </div>
            </section>

            <section className="uno-hand-area" aria-label="本人席位与手牌">
              <header className="uno-hand-heading">
                <span className="uno-self-name">
                  <GameSpeechBubble playerId={human?.id ?? ""} name={human?.name ?? ""} />
                  <span className="uno-avatar uno-avatar--coral" aria-hidden="true">
                    {Array.from(human?.name ?? "你")[0]}
                  </span>
                  <strong>{human?.name ?? "你"}</strong>
                  <small>你的手牌</small>
                </span>
                <span className="uno-own-count">{hand.length} 张</span>
                <span className="uno-own-score">{human?.score ?? 0} 分</span>
                {humanTurn ? <b className="uno-seat-turn">轮到你</b> : null}
              </header>
              <section className="uno-hand" aria-label={`你的手牌，共 ${hand.length} 张`}>
                <div className="uno-reaction-bar">
                  <button
                    className="uno-call-button"
                    disabled={busy || display.phase !== "playing"}
                    onClick={() => {
                      if (humanCallUnoMove) void runMove(humanCallUnoMove, HUMAN_ID);
                      else setReactionFeedback("现在不能喊 UNO");
                    }}
                    aria-label="喊 UNO"
                    type="button"
                  >
                    UNO
                  </button>
                  <button
                    className="uno-catch-button"
                    disabled={busy || display.phase !== "playing"}
                    onClick={() => {
                      if (humanCatchUnoMove) void runMove(humanCatchUnoMove, HUMAN_ID);
                      else setReactionFeedback("没有抓到漏喊");
                    }}
                    type="button"
                  >
                    抓漏喊
                  </button>
                </div>
                <div
                  className="uno-hand__row"
                  style={
                    {
                      "--uno-hand-step": `${handStep(hand, layout.portrait)}px`,
                      width: 80 + Math.max(0, hand.length - 1) * handStep(hand, layout.portrait),
                    } as React.CSSProperties
                  }
                >
                  {hand.map((card, cardIndex) => {
                    const playable = Boolean(
                      controller && humanTurn && playsForCard(controller, card.id).length,
                    );
                    return (
                      <CardFace
                        key={card.id}
                        card={card}
                        disabled={!playable || busy}
                        playable={playable}
                        onClick={() => clickCard(card)}
                        order={cardIndex}
                      />
                    );
                  })}
                </div>
              </section>
            </section>

            {display.phase === "round_over" && display.last_results ? (
              <section className="uno-result" aria-label="本局结算">
                <span>本局赢家</span>
                <strong>
                  {display.players.find((player) => player.id === display.last_results?.winner_id)
                    ?.name ?? "赢家"}
                </strong>
                <b>+{display.last_results.gain} 分</b>
                <div>
                  {display.last_results.players.map((player) => (
                    <small key={player.player_id}>
                      {player.name} {player.score} 分
                    </small>
                  ))}
                </div>
                {nextRoundMove ? (
                  <button
                    disabled={busy}
                    onClick={() => live ? void startGame() : void runMove(nextRoundMove, HUMAN_ID)}
                    type="button"
                  >
                    再来一局
                  </button>
                ) : null}
                <GameRoundExit />
              </section>
            ) : null}
          </>
        ) : (
          <section className="uno-loading" aria-live="polite">
            <div className="uno-brand" aria-hidden="true">
              UNO
            </div>
            <strong>{error ? "牌桌未连接" : "正在洗牌…"}</strong>
            {error ? <small>{error}</small> : null}
            {error ? (
              <button disabled={busy} onClick={() => void startGame()} type="button">
                再试一次
              </button>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
import { GameRoundExit } from "../game-round-exit";
