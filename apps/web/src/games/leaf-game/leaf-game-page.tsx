import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLeafGame,
  getLeafGame,
  type LeafCard,
  type LeafGameView,
  type LeafPlayer,
  sendLeafCommand,
} from "./leaf-game-client";
import {
  chooseResidentMove,
  type LeafPlayAction,
  resolveSelectedPlayAction,
} from "./leaf-game-interaction";
import "./leaf-game-page.css";

const ranks = Array.from({ length: 10 }, (_, index) => index + 1);
const CANVAS_WIDTH = 844;
const CANVAS_HEIGHT = 390;

function playerById(view: LeafGameView, playerId: string | null): LeafPlayer | undefined {
  return view.players.find((player) => player.id === playerId);
}

function PlayerStatus({
  player,
  position,
  isDealer,
  isCurrent,
}: {
  player: LeafPlayer;
  position: "left" | "top" | "right" | "self";
  isDealer: boolean;
  isCurrent: boolean;
}) {
  return (
    <section
      aria-label={`${player.name}，${player.hand_count} 张牌，醉意 ${player.drunkenness}%，喝到毒酒概率 ${player.poison_chance}%${
        isCurrent ? "，当前行动" : ""
      }`}
      className={`leaf-player leaf-player--${position} leaf-player--${player.accent} ${
        isCurrent ? "leaf-player--current" : ""
      } ${player.knocked_out ? "leaf-player--out" : ""}`}
    >
      <div className="leaf-player__avatar" aria-hidden="true">
        <span className="leaf-player__hair" />
        <span className="leaf-player__face">
          <i />
          <i />
          <b />
        </span>
      </div>
      <div className="leaf-player__info">
        <div className="leaf-player__name-row">
          <strong>{player.name}</strong>
          <span className="leaf-player__controller">
            {player.controller_type === "human" ? "人类" : "小机"}
          </span>
          {isDealer ? <span className="leaf-player__dealer">主家</span> : null}
        </div>
        <div className="leaf-player__meta">
          <span>{player.hand_count} 张</span>
          <span>醉意 {player.drunkenness}%</span>
          <span>毒酒 {player.poison_chance}%</span>
        </div>
        <div className="leaf-player__meter" aria-hidden="true">
          <span style={{ width: `${player.drunkenness}%` }} />
        </div>
      </div>
      {isCurrent ? (
        <span className="leaf-player__turn" aria-hidden="true">
          ✦
        </span>
      ) : null}
      {player.knocked_out ? <span className="leaf-player__knocked">醉倒啦</span> : null}
    </section>
  );
}

function LeafCardButton({
  card,
  selected,
  onActivate,
  disabled,
  playing,
  index,
  count,
}: {
  card: LeafCard;
  selected: boolean;
  onActivate: () => void;
  disabled: boolean;
  playing: boolean;
  index: number;
  count: number;
}) {
  const center = (count - 1) / 2;
  const offset = index - center;
  const rotation = Math.max(-10, Math.min(10, offset * 1.2));
  const lift = Math.abs(offset) * 0.7;
  const label = card.kind === "wild" ? "花牌，可当任意点数" : `${card.rank} 点`;
  return (
    <button
      aria-label={`${label}${card.marked ? "，一文钱标记" : ""}，${
        selected ? "点击取消选择" : "点击选择"
      }`}
      aria-pressed={selected}
      className={`leaf-card ${card.kind === "wild" ? "leaf-card--wild" : ""} ${
        card.marked ? "leaf-card--marked" : ""
      } leaf-card--selecting ${playing ? "leaf-card--playing" : ""}`}
      disabled={disabled}
      onClick={onActivate}
      style={
        {
          "--card-rotation": `${rotation}deg`,
          "--card-lift": `${lift}px`,
          "--card-index": index,
        } as React.CSSProperties
      }
      type="button"
    >
      <span className="leaf-card__corner">{card.kind === "wild" ? "花" : card.rank}</span>
      <span className="leaf-card__mark" aria-hidden="true">
        {card.kind === "wild" ? (
          <span className="leaf-card__flower">✦</span>
        ) : (
          <span className="leaf-card__fruit">{(card.rank ?? 1) % 2 === 0 ? "●" : "◆"}</span>
        )}
      </span>
      <span className="leaf-card__rank">{card.kind === "wild" ? "百搭" : card.rank}</span>
      {card.marked ? <span className="leaf-card__coin">一文</span> : null}
    </button>
  );
}

function ResolutionNotice({ view }: { view: LeafGameView }) {
  const resolution = view.last_resolution;
  if (!resolution) {
    return null;
  }
  const winner = playerById(view, resolution.winner_id)?.name ?? "赢家";
  const loser = resolution.loser_id ? playerById(view, resolution.loser_id)?.name : null;
  let title = `${winner} 赢下这一轮`;
  let detail = loser
    ? `${loser} 收下 ${resolution.collected_card_count ?? 0} 张桌牌，醉意 +${
        resolution.pile_risk ?? 0
      }`
    : "最后一手无人质疑。";
  if (resolution.type === "challenge") {
    title = resolution.truthful ? "质疑失败，牌是真的" : "质疑成功，这手在唬人";
  }
  if (resolution.knocked_out && loser) {
    detail =
      resolution.knockout_reason === "poison"
        ? `${loser} 抽中毒酒，醉倒啦。`
        : `${loser} 的醉意到顶，暂时趴桌休息。`;
  } else if (loser) {
    detail += `，毒酒概率升至 ${resolution.poison_chance_after ?? 0}%`;
  }
  return (
    <aside className="leaf-resolution" aria-live="polite">
      <span className="leaf-resolution__spark" aria-hidden="true">
        ✦
      </span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </aside>
  );
}

function TablePile({
  view,
  selectedCount,
  canSubmitSelection,
  onSubmitSelection,
  pending,
}: {
  view: LeafGameView;
  selectedCount: number;
  canSubmitSelection: boolean;
  onSubmitSelection: () => void;
  pending: boolean;
}) {
  const lastActor = view.pile.at(-1)?.actor_id ?? null;
  const actorName = playerById(view, lastActor)?.name;
  const canPlayCards = view.legal_actions.some(
    (action) => action === "lead" || action === "follow",
  );
  const pileHint = selectedCount
    ? `点这里盖下 ${selectedCount} 张`
    : canPlayCards
      ? "先点选一张或多张手牌"
      : null;
  return (
    <button
      aria-label={
        canSubmitSelection
          ? `盖下已选的 ${selectedCount} 张牌`
          : `桌面共有 ${view.pile_card_count} 张盖牌`
      }
      className={`leaf-pile ${canSubmitSelection ? "leaf-pile--ready" : ""}`}
      disabled={!canSubmitSelection || pending}
      onClick={onSubmitSelection}
      type="button"
    >
      <div className="leaf-pile__cards" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <strong>{view.pile_card_count ? `${view.pile_card_count} 张` : "等主家开牌"}</strong>
      <span>
        {view.declared_rank
          ? `本轮只报 ${view.declared_rank} 点${actorName ? ` · ${actorName} 刚出` : ""}`
          : "主家选牌后再报点"}
      </span>
      {view.pile_card_count ? <small>本轮罚饮醉意 +{view.pile_risk_percent}%</small> : null}
      {pileHint ? <em>{pileHint}</em> : null}
    </button>
  );
}

function TableControls({
  view,
  onAction,
  pending,
  interactive,
}: {
  view: LeafGameView;
  onAction: (action: "challenge" | "concede") => void;
  pending: boolean;
  interactive: boolean;
}) {
  if (view.status === "finished") {
    const winner = playerById(view, view.winner_id);
    return (
      <section className="leaf-table-result">
        <span>本局结束</span>
        <strong>{winner?.name ?? "最后的玩家"} 赢啦</strong>
      </section>
    );
  }
  if (!interactive || !view.legal_actions.length) {
    return null;
  }
  return (
    <>
      {view.declared_rank ? (
        <div className="leaf-table-declaration">
          本轮报 <strong>{view.declared_rank}</strong> 点
        </div>
      ) : null}
      <fieldset className="leaf-table-actions">
        <legend className="leaf-visually-hidden">桌边行动</legend>
        {view.legal_actions.includes("challenge") ? (
          <button
            className="leaf-table-action leaf-table-action--challenge"
            disabled={pending}
            onClick={() => onAction("challenge")}
            type="button"
          >
            质疑
          </button>
        ) : null}
        {view.legal_actions.includes("concede") ? (
          <button
            className="leaf-table-action leaf-table-action--concede"
            disabled={pending}
            onClick={() => onAction("concede")}
            type="button"
          >
            认罚
          </button>
        ) : null}
      </fieldset>
    </>
  );
}

function RankDeclaration({
  cardCount,
  onCancel,
  onSubmit,
  pending,
}: {
  cardCount: number;
  onCancel: () => void;
  onSubmit: (rank: number) => void;
  pending: boolean;
}) {
  if (!cardCount) {
    return null;
  }
  return (
    <section className="leaf-rank-declaration" aria-label="选择所报点数">
      <div className="leaf-rank-declaration__heading">
        <span>请报牌</span>
        <button disabled={pending} onClick={onCancel} type="button">
          取消
        </button>
      </div>
      <div className="leaf-rank-declaration__options">
        {ranks.map((rank) => (
          <button disabled={pending} key={rank} onClick={() => onSubmit(rank)} type="button">
            <small>{cardCount} 张</small>
            <strong>{rank}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LeafGamePage() {
  const [view, setView] = useState<LeafGameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingLeadCardIds, setPendingLeadCardIds] = useState<string[]>([]);
  const [playingCardIds, setPlayingCardIds] = useState<Set<string>>(new Set());
  const [flight, setFlight] = useState<{ key: number; count: number } | null>(null);
  const [narrowPreviewScale, setNarrowPreviewScale] = useState<number | null>(null);
  const initialStartRef = useRef(false);

  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      setNarrowPreviewScale(
        height > width ? Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT) : null,
      );
    };

    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);

  const scalerStyle =
    narrowPreviewScale === null
      ? undefined
      : {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${narrowPreviewScale})`,
        };

  const startGame = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const created = await createLeafGame(Date.now() % 2_147_483_647);
      const viewer = created.current_player_id || created.viewer_id || created.players[0]?.id;
      const initial = viewer ? await getLeafGame(created.game_id, viewer) : created;
      setView(initial);
      setSelected(new Set());
      setPendingLeadCardIds([]);
      setPlayingCardIds(new Set());
      setFlight(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接本地规则服务。 ");
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
    const viewerId = view?.viewer_id;
    if (
      view?.status !== "active" ||
      view.phase !== "final_challenge" ||
      view.final_challenge_remaining_ms === null ||
      !viewerId
    ) {
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void getLeafGame(view.game_id, viewerId)
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : "最后一手没有完成结算。");
          }
        });
    }, view.final_challenge_remaining_ms);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [view]);

  const currentViewer = view ? playerById(view, view.viewer_id) : undefined;
  const humanTurn = currentViewer?.controller_type === "human";
  const visibleHand = currentViewer?.hand ?? [];
  const orderedPlayers = useMemo(() => {
    if (!view || !currentViewer) {
      return null;
    }
    const relativeSeat = (player: LeafPlayer) =>
      (player.seat - currentViewer.seat + view.players.length) % view.players.length;
    const others = view.players
      .filter((player) => player.id !== currentViewer.id)
      .sort((a, b) => relativeSeat(a) - relativeSeat(b));
    return { self: currentViewer, left: others[0], top: others[1], right: others[2] };
  }, [currentViewer, view]);

  const toggleCard = (cardId: string) => {
    if (!view?.legal_actions.some((action) => action === "lead" || action === "follow")) {
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < view.rules.max_play_size) {
        next.add(cardId);
      }
      return next;
    });
  };

  const act = async (
    action: "lead" | "follow" | "challenge" | "concede",
    cardIds: string[] = [],
    leadRank = 1,
  ) => {
    if (!view) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const next = await sendLeafCommand(view, action, cardIds, leadRank);
      setView(next);
      setSelected(new Set());
      setPendingLeadCardIds([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这个动作没有成功。 ");
    } finally {
      setPlayingCardIds(new Set());
      setPending(false);
    }
  };

  const playCards = (action: LeafPlayAction, cardIds: string[], leadRank = 1) => {
    setPlayingCardIds(new Set(cardIds));
    setFlight({ key: Date.now(), count: cardIds.length });
    void act(action, cardIds, leadRank);
  };

  const handleCardActivate = (cardId: string) => {
    if (!view) {
      return;
    }
    toggleCard(cardId);
  };

  const selectedPlayAction = resolveSelectedPlayAction(
    view?.legal_actions ?? [],
    selected.size,
    view?.rules.max_play_size ?? 0,
    pending || !humanTurn,
  );
  const residentMove = view && !humanTurn ? chooseResidentMove(view) : null;

  if (!view) {
    return (
      <main className="leaf-game-shell">
        <div className="leaf-game-scaler" style={scalerStyle}>
          <div className="leaf-game-stage">
            <section className="leaf-game-loading" aria-live="polite">
              <span aria-hidden="true">叶</span>
              <strong>{error ? "牌桌没铺好" : "正在洗牌开桌…"}</strong>
              {error ? <small>{error}</small> : null}
              {error ? (
                <button type="button" disabled={pending} onClick={() => void startGame()}>
                  再试一次
                </button>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    );
  }
  if (!orderedPlayers?.left || !orderedPlayers.top || !orderedPlayers.right) return null;

  const currentName = playerById(view, view.current_player_id)?.name;
  const stageMessage =
    view.status === "finished"
      ? `${playerById(view, view.winner_id)?.name ?? "赢家"} 把手牌清空啦！`
      : view.phase === "final_challenge"
        ? `${currentName} 可在 3 秒内质疑最后一手`
        : view.phase === "lead"
          ? humanTurn
            ? `${currentName} 做主家：先选牌，再报点`
            : `${currentName} 小机准备出牌`
          : humanTurn
            ? `${currentName} 行动：点选手牌出牌，或者质疑／认罚`
            : `${currentName} 小机正在判断这一手`;

  return (
    <main className="leaf-game-shell">
      <div className="leaf-game-scaler" style={scalerStyle}>
        <div className="leaf-game-stage">
          <header className="leaf-game-header">
            <div className="leaf-game-brand">
              <span className="leaf-game-brand__leaf" aria-hidden="true">
                叶
              </span>
              <div>
                <span>小机活动室</span>
                <h1>叶子戏</h1>
              </div>
            </div>
            <div className="leaf-game-header__status" aria-live="polite">
              <i aria-hidden="true" />
              {stageMessage}
            </div>
            <div className="leaf-game-header__tools">
              <span>
                {humanTurn ? "人类行动" : "小机行动"} · r{view.revision}
              </span>
              <button disabled={pending} onClick={startGame} type="button">
                重开
              </button>
            </div>
          </header>

          <PlayerStatus
            isCurrent={view.current_player_id === orderedPlayers.left.id}
            isDealer={view.dealer_id === orderedPlayers.left.id}
            player={orderedPlayers.left}
            position="left"
          />
          <PlayerStatus
            isCurrent={view.current_player_id === orderedPlayers.top.id}
            isDealer={view.dealer_id === orderedPlayers.top.id}
            player={orderedPlayers.top}
            position="top"
          />
          <PlayerStatus
            isCurrent={view.current_player_id === orderedPlayers.right.id}
            isDealer={view.dealer_id === orderedPlayers.right.id}
            player={orderedPlayers.right}
            position="right"
          />
          <PlayerStatus
            isCurrent={view.current_player_id === orderedPlayers.self.id}
            isDealer={view.dealer_id === orderedPlayers.self.id}
            player={orderedPlayers.self}
            position="self"
          />

          <section className="leaf-table" aria-label="叶子戏牌桌">
            <TableControls
              interactive={humanTurn}
              onAction={(action) => void act(action)}
              pending={pending}
              view={view}
            />
            <TablePile
              canSubmitSelection={
                humanTurn && selectedPlayAction !== null && pendingLeadCardIds.length === 0
              }
              onSubmitSelection={() => {
                if (selectedPlayAction) {
                  if (selectedPlayAction === "lead") {
                    setPendingLeadCardIds([...selected]);
                  } else {
                    playCards(selectedPlayAction, [...selected]);
                  }
                }
              }}
              pending={pending}
              selectedCount={selected.size}
              view={view}
            />
          </section>

          <ResolutionNotice view={view} />

          {residentMove ? (
            <button
              type="button"
              className="leaf-resident-action"
              disabled={pending}
              onClick={() =>
                residentMove.action === "lead" || residentMove.action === "follow"
                  ? playCards(residentMove.action, residentMove.cardIds, residentMove.declaredRank)
                  : void act(residentMove.action)
              }
            >
              {pending ? "小机行动中…" : `推进 ${currentViewer?.name ?? "小机"} 一步`}
            </button>
          ) : null}

          <RankDeclaration
            cardCount={pendingLeadCardIds.length}
            onCancel={() => {
              setPendingLeadCardIds([]);
            }}
            onSubmit={(rank) => playCards("lead", pendingLeadCardIds, rank)}
            pending={pending}
          />

          <section className="leaf-hand" aria-label={`${orderedPlayers.self.name} 的手牌`}>
            <div className="leaf-hand__label">
              <div>
                <strong>
                  {view.phase === "final_challenge"
                    ? "最后一手，等待质疑"
                    : selected.size
                      ? `已选 ${selected.size} 张 · 点桌面出牌`
                      : `点选手牌 · 一次最多 ${view.rules.max_play_size} 张`}
                </strong>
                <span className="leaf-hand__count">{visibleHand.length} 张</span>
              </div>
            </div>
            <div className="leaf-hand__cards">
              {humanTurn ? (
                visibleHand.map((card, index) => (
                  <LeafCardButton
                    card={card}
                    count={visibleHand.length}
                    disabled={
                      pending ||
                      pendingLeadCardIds.length > 0 ||
                      !view.legal_actions.some((action) => action === "lead" || action === "follow")
                    }
                    index={index}
                    key={card.id}
                    onActivate={() => handleCardActivate(card.id)}
                    playing={playingCardIds.has(card.id)}
                    selected={selected.has(card.id)}
                  />
                ))
              ) : (
                <div className="leaf-hand__resident-note">
                  <span aria-hidden="true">叶</span>
                  <strong>小机手牌已隐藏</strong>
                  <small>{visibleHand.length} 张 · 只用合法动作推进</small>
                </div>
              )}
            </div>
          </section>

          {flight ? (
            <div
              className={`leaf-card-flight ${flight.count > 1 ? "leaf-card-flight--stack" : ""}`}
              key={flight.key}
              onAnimationEnd={() => setFlight(null)}
            >
              <span aria-hidden="true">✦</span>
              {flight.count > 1 ? <b aria-hidden="true">{flight.count}</b> : null}
            </div>
          ) : null}

          {error ? (
            <div className="leaf-game-error" role="alert">
              <span>{error}</span>
              <button onClick={() => setError(null)} type="button">
                知道了
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
