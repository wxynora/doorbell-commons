import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUnoGame,
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
const HUMAN_ID = "player-1";
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

function CardFace({
  card,
  compact = false,
  disabled = false,
  onClick,
  order = 0,
}: {
  card: UnoCard;
  compact?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  order?: number;
}) {
  const isAction = card.kind !== "number";
  const className = `uno-card uno-card--${card.color ?? "wild"} uno-card--kind-${card.kind} ${
    isAction ? "uno-card--action" : ""
  } ${compact ? "uno-card--compact" : ""}`;
  const contents = (
    <>
      <span className="uno-card__corner">{cardMark(card)}</span>
      <span className="uno-card__oval">
        {card.wild ? (
          <span className="uno-card__wild-wheel" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            {card.kind === "wild4" ? <b>+4</b> : null}
          </span>
        ) : (
          <b>{cardMark(card)}</b>
        )}
      </span>
      {isAction ? <span className="uno-card__name">{cardActionName(card)}</span> : null}
    </>
  );
  if (!onClick) {
    return (
      <div
        aria-label={card.label}
        className={className}
        role="img"
        style={{ "--uno-order": order } as React.CSSProperties}
      >
        {contents}
      </div>
    );
  }
  return (
    <button
      aria-label={`${card.label}，点击出牌`}
      className={className}
      disabled={disabled}
      onClick={onClick}
      style={{ "--uno-order": order } as React.CSSProperties}
      type="button"
    >
      {contents}
    </button>
  );
}

function PlayerEdge({ player, current }: { player: UnoPlayer; current: boolean }) {
  return (
    <div
      className={`uno-player uno-player--seat-${player.seat} uno-player--${player.accent} ${
        current ? "uno-player--current" : ""
      }`}
    >
      <div className="uno-player__avatar" aria-hidden="true">
        <span className="uno-player__hair" />
        <span className="uno-player__eyes">••</span>
      </div>
      <div className="uno-player__words">
        <strong>
          {player.name}
          {player.controller_type === "resident" ? <i className="uno-player__type">小机</i> : null}
        </strong>
        <span>
          {player.hand_count} 张 · {player.score} 分
        </span>
      </div>
      {current ? <b className="uno-player__turn">出牌中</b> : null}
      {player.uno ? <em className="uno-player__alarm">UNO!</em> : null}
      {player.uno_missed ? <em className="uno-player__missed">漏喊!</em> : null}
    </div>
  );
}

function handRows(hand: UnoCard[]): UnoCard[][] {
  if (hand.length <= 16) return [hand];
  const split = Math.ceil(hand.length / 2);
  return [hand.slice(0, split), hand.slice(split)];
}

function handStep(row: UnoCard[]): number {
  if (row.length <= 1) return 60;
  return Math.max(38, Math.min(56, 684 / (row.length - 1)));
}

export function UnoPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [session, setSession] = useState<UnoSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wildCardId, setWildCardId] = useState<string | null>(null);

  useEffect(() => {
    const resize = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
      stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const startGame = useCallback(async (seed = 43) => {
    setBusy(true);
    setError(null);
    setWildCardId(null);
    try {
      setSession(await createUnoGame(seed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "UNO 牌桌没有开起来。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startGame();
  }, [startGame]);

  const runMove = useCallback(
    async (move: UnoMove, actorId?: string) => {
      if (!session || busy) return;
      setBusy(true);
      setError(null);
      try {
        setSession(await sendUnoMove(session, move, actorId));
        if (move.action !== "call_uno") setWildCardId(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "这一步没有成功。");
      } finally {
        setBusy(false);
      }
    },
    [busy, session],
  );

  const display = session?.display ?? null;
  const controller = session?.controller ?? null;
  const human = display?.players.find((player) => player.id === HUMAN_ID);
  const current = display?.players.find((player) => player.id === display.current_player_id);
  const humanTurn = display?.phase === "playing" && display.current_player_id === HUMAN_ID;
  const residentTurn = display?.phase === "playing" && current?.controller_type === "resident";
  const hand = human?.hand ?? [];
  const rows = useMemo(() => handRows(hand), [hand]);
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
    if (!residentTurn || !controller || busy) return;
    const move = chooseResidentMove(controller);
    const actorId = controller.viewer_id ?? controller.current_player_id;
    if (move && actorId) void runMove(move, actorId);
  }, [busy, controller, residentTurn, runMove]);

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
      : humanCatchUnoMove
        ? `快抓！${display.uno_catch?.offender_name ?? "有人"} 漏喊 UNO`
        : humanTurn
          ? display.pending?.mine
            ? "刚摸的牌能出：直接点它，或保留"
            : "轮到你：点手牌直接出"
          : `${current?.name ?? "小机"} 的回合`
    : "正在洗牌…";

  return (
    <main className="uno-shell">
      <div className="uno-stage" ref={stageRef}>
        <div className="uno-confetti" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <header className="uno-header">
          <div className="uno-brand" aria-label="UNO" role="img">
            <span>U</span>
            <span>N</span>
            <span>O</span>
          </div>
          {display ? (
            <div className="uno-round-info">
              <b>第 {display.round} 局</b>
              <span>
                {display.direction > 0 ? "↻" : "↺"} {display.direction_label}
              </span>
            </div>
          ) : null}
          <button
            className="uno-new-game"
            disabled={busy}
            onClick={() => void startGame(Date.now())}
            type="button"
          >
            重新开桌
          </button>
        </header>

        {display ? (
          <>
            {display.players.map((player) => (
              <PlayerEdge
                current={player.id === display.current_player_id}
                key={player.id}
                player={player}
              />
            ))}

            <section className="uno-center" aria-label="UNO 桌面牌区">
              <div className="uno-turn-hint">{turnHint}</div>
              <div className="uno-piles">
                {drawMove && humanTurn ? (
                  <button
                    aria-label={`摸一张，牌库剩 ${display.deck_count} 张`}
                    className="uno-draw-pile"
                    disabled={busy}
                    onClick={() => void runMove(drawMove, HUMAN_ID)}
                    type="button"
                  >
                    <span>抽</span>
                    <b>{display.deck_count}</b>
                  </button>
                ) : (
                  <div
                    className="uno-draw-pile"
                    aria-label={`牌库剩 ${display.deck_count} 张`}
                    role="img"
                  >
                    <span>抽</span>
                    <b>{display.deck_count}</b>
                  </div>
                )}
                <div className={`uno-active-color uno-active-color--${display.active_color}`}>
                  <span>{display.active_color_name}色</span>
                  {display.top_card ? <CardFace card={display.top_card} compact /> : null}
                </div>
              </div>
              {latestEvent ? <div className="uno-event-line">{latestEvent}</div> : null}
            </section>

            {humanCallUnoMove || humanCatchUnoMove ? (
              <div className="uno-reaction-bar">
                {humanCallUnoMove ? (
                  <button
                    className="uno-call-button"
                    disabled={busy}
                    onClick={() => void runMove(humanCallUnoMove, HUMAN_ID)}
                    type="button"
                  >
                    UNO!
                    <small>{display.uno_catch?.offender_id === HUMAN_ID ? "补喊" : "喊牌"}</small>
                  </button>
                ) : null}
                {humanCatchUnoMove ? (
                  <button
                    className="uno-catch-button"
                    disabled={busy}
                    onClick={() => void runMove(humanCatchUnoMove, HUMAN_ID)}
                    type="button"
                  >
                    抓！
                    <small>{display.uno_catch?.offender_name} 漏喊</small>
                  </button>
                ) : null}
              </div>
            ) : null}

            {keepMove && humanTurn && !humanCallUnoMove && !humanCatchUnoMove ? (
              <button
                className="uno-keep-button"
                disabled={busy}
                onClick={() => void runMove(keepMove, HUMAN_ID)}
                type="button"
              >
                保留 · 结束回合
              </button>
            ) : null}

            {wildCardId &&
            controller &&
            colorChoices.length &&
            !humanCallUnoMove &&
            !humanCatchUnoMove ? (
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

            <section
              className={`uno-hand ${rows.length > 1 ? "uno-hand--two-rows" : ""}`}
              aria-label={`你的手牌，共 ${hand.length} 张`}
            >
              {rows.map((row) => (
                <div
                  className="uno-hand__row"
                  key={row.map((card) => card.id).join("|") || "empty-hand"}
                  style={{ "--uno-hand-step": `${handStep(row)}px` } as React.CSSProperties}
                >
                  {row.map((card, cardIndex) => (
                    <CardFace
                      card={card}
                      disabled={!humanTurn || busy}
                      key={card.id}
                      onClick={() => clickCard(card)}
                      order={cardIndex}
                    />
                  ))}
                </div>
              ))}
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
                    onClick={() => void runMove(nextRoundMove, HUMAN_ID)}
                    type="button"
                  >
                    开下一局
                  </button>
                ) : null}
              </section>
            ) : null}

            {error ? (
              <div className="uno-error-line" aria-live="polite">
                {error}
              </div>
            ) : null}
          </>
        ) : (
          <div className="uno-loading" aria-live="polite">
            <span>洗</span>
            <span>牌</span>
            <span>中</span>
            <small>{error ?? "参与者身份由接入方式自动确认"}</small>
            {error ? (
              <button disabled={busy} onClick={() => void startGame()} type="button">
                再试一次
              </button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
