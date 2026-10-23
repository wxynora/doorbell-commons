import { useEffect, useRef, useState } from "react";
import { sendSnowDanmaku, snowLiveError } from "./api";
import { SnowBattleCanvas } from "./battle-canvas";
import { useSnowLive } from "./use-snow-live";
import "./snow-live.css";

const clock = (ticks: number) =>
  `${Math.floor(ticks / 60)
    .toString()
    .padStart(2, "0")}:${(ticks % 60).toString().padStart(2, "0")}`;
const sentAt = (value: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);

export function SnowLivePage({ onBack }: { onBack(): void }) {
  const live = useSnowLive(),
    battle = live.snapshot?.battle;
  const [selected, setSelected] = useState<{ lane: number; position: number } | null>(null);
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState<string | null>(null);
  const attempt = useRef<{ clientMessageId: string; text: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [battle?.id]);
  useEffect(() => () => controller.current?.abort(), []);
  const currentMatch =
    live.snapshot?.matches.find((match) => !match.winner) ?? live.snapshot?.matches.at(-1);
  const selectedUnits =
    battle?.units.filter(
      (unit) => unit.lane === selected?.lane && unit.position === selected?.position,
    ) ?? [];
  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    if (attempt.current?.text !== value)
      attempt.current = { clientMessageId: crypto.randomUUID(), text: value };
    const input = attempt.current;
    const request = new AbortController();
    controller.current = request;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendSnowDanmaku(input, request.signal);
      if (request.signal.aborted) return;
      live.addMessage(message);
      setText("");
      attempt.current = null;
    } catch (error) {
      if (!request.signal.aborted)
        setSendError(snowLiveError(error instanceof Error ? error.message : "service_unavailable"));
    } finally {
      if (!request.signal.aborted) setSending(false);
    }
  }
  return (
    <main className="snow-live-page">
      <header className="snow-live-header">
        <button className="snow-live-back" type="button" aria-label="返回社区" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">
            <path
              d="M19 12H5m6-6-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1>雪堡直播</h1>
        <div className={`snow-live-connection snow-live-connection--${live.status}`} role="status">
          <i />
          {live.status === "live" ? "实时直播" : live.status === "error" ? "连接中断" : "连接中"}
        </div>
      </header>
      {live.error ? (
        <div className="snow-live-error" role="alert">
          {live.error}
          <button type="button" onClick={live.reconnect}>
            重新连接
          </button>
        </div>
      ) : null}
      <div className="snow-live-layout">
        <section className="snow-live-main" aria-label="战场直播">
          <div className="snow-live-scoreboard">
            <div className="snow-live-player">
              <small>{battle?.attackSide ?? currentMatch?.attackSide ?? "A"}队 · 进攻</small>
              <strong>{battle?.attack.name ?? "等待出场"}</strong>
            </div>
            <div className="snow-live-score">
              <span>
                第{(battle?.matchIndex ?? currentMatch?.index ?? 0) + 1}场
                {battle ? ` · 第${battle.roundIndex + 1}局` : ""}
              </span>
              <b>{currentMatch ? `${currentMatch.score.A} : ${currentMatch.score.B}` : "—"}</b>
              <small>A队 · 小局比分 · B队</small>
            </div>
            <div className="snow-live-player snow-live-player--defend">
              <small>
                {(battle?.attackSide ?? currentMatch?.attackSide) === "B" ? "A" : "B"}队 · 防守
              </small>
              <strong>{battle?.defend.name ?? "等待出场"}</strong>
            </div>
          </div>
          {battle ? (
            <>
              <div className="snow-live-battle-stats">
                <span>
                  {battle.started ? "本局" : "准备中"} <b>{clock(battle.tick)}</b> / 10:00
                </span>
                <span className="snow-live-core">
                  雪堡耐久{" "}
                  <b>
                    {battle.coreHp} / {battle.coreMaxHp}
                  </b>
                  <meter min="0" max={battle.coreMaxHp} value={battle.coreHp} />
                </span>
              </div>
              <SnowBattleCanvas
                battle={battle}
                flying={live.flying}
                onFinish={live.finishFlying}
                onSelect={setSelected}
              />
              <section className="snow-live-cell-detail" aria-label="格子中的单位">
                <h2>{selected ? `${selected.lane}路 · 第${selected.position}格` : "场上单位"}</h2>
                {selected ? (
                  selectedUnits.length ? (
                    <div className="snow-live-unit-list">
                      {selectedUnits.map((unit) => (
                        <article key={unit.id}>
                          <span className={`snow-live-unit-side snow-live-unit-side--${unit.role}`}>
                            {unit.role === "attack" ? "攻" : "守"}
                          </span>
                          <div>
                            <strong>
                              {unit.name} <small>{unit.id}</small>
                            </strong>
                            <p>
                              生命 {unit.hp}/{unit.maxHp}
                              {unit.shield ? ` · 护盾 ${unit.shield}` : ""}
                              {unit.blockedBy ? ` · 被${unit.blockedBy}阻挡` : ""}
                              {unit.blocking.length ? ` · 阻挡 ${unit.blocking.join("、")}` : ""}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>当前格子为空。</p>
                  )
                ) : (
                  <p>点击战场格子，查看这里的兵种、血量和阻挡情况。</p>
                )}
              </section>
            </>
          ) : (
            <div className="snow-live-empty">
              <span aria-hidden="true">❄</span>
              <h2>
                {live.status === "connecting" && !live.snapshot
                  ? "正在连接雪堡前线"
                  : live.snapshot?.phase === "complete"
                    ? `${live.snapshot.champion}队获得冠军！`
                    : live.snapshot?.phase === "registration"
                      ? "雪堡战正在报名"
                      : !live.snapshot
                        ? "当前没有进行中的雪堡战"
                        : live.snapshot.phase === "ended"
                          ? "本期雪堡战已结束"
                          : "等待下一局开场"}
              </h2>
              <p>
                {live.snapshot?.phase === "complete" || live.snapshot?.phase === "ended"
                  ? "可以在对阵表查看比赛结果。"
                  : live.snapshot
                    ? "对局开始后，这里会显示实时战场。"
                    : "有比赛时，来这里围观。"}
              </p>
            </div>
          )}
        </section>
        <aside className="snow-live-sidebar">
          <section className="snow-live-chat" aria-label="观众弹幕">
            <header>
              <h2>围观席</h2>
              <span>发点弹幕</span>
            </header>
            <div className="snow-live-messages" aria-live="polite" aria-relevant="additions">
              {live.messages.length ? (
                live.messages.map((message) => (
                  <article key={message.sequence}>
                    <div>
                      <b>{message.senderName}</b>
                      <time dateTime={new Date(message.createdAt).toISOString()}>
                        {sentAt(message.createdAt)}
                      </time>
                    </div>
                    <p>{message.text}</p>
                  </article>
                ))
              ) : (
                <p className="snow-live-chat-empty">前排空着呢，来一句？</p>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label htmlFor="snow-danmaku-text">弹幕</label>
              <textarea
                id="snow-danmaku-text"
                rows={2}
                placeholder="给雪堡添点热闹…"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              {sendError ? <p role="alert">{sendError}</p> : null}
              <button
                type="submit"
                disabled={
                  sending || !text.trim() || !live.snapshot || live.snapshot.phase === "ended"
                }
              >
                {sending ? "发送中…" : "发射弹幕 ↗"}
              </button>
            </form>
          </section>
          <section className="snow-live-fixtures" aria-label="比赛对阵">
            <h2>对阵表</h2>
            {live.snapshot?.matches.map((match) => (
              <details key={match.index} open={match.index === currentMatch?.index}>
                <summary>
                  第{match.index + 1}场{" "}
                  <b>
                    A {match.score.A} : {match.score.B} B
                  </b>
                </summary>
                {match.rounds.length ? (
                  <ol>
                    {match.rounds.map((round) => (
                      <li key={round.index}>
                        <span>
                          {round.attack.name}
                          <small>攻</small>
                        </span>
                        <em>
                          {round.winner
                            ? `${round.winner}胜`
                            : round.index === battle?.roundIndex &&
                                match.index === battle.matchIndex
                              ? "进行中"
                              : "待上场"}
                        </em>
                        <span>
                          {round.defend.name}
                          <small>守</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>排阵尚未公开。</p>
                )}
              </details>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
