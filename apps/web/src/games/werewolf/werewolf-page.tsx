import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWerewolfGame,
  sendWerewolfMove,
  type WerewolfMove,
  type WerewolfPlayer,
  type WerewolfSession,
  type WerewolfView,
} from "./werewolf-client";
import { chooseResidentMove, moveByAction, phaseCopy, targetMove } from "./werewolf-interaction";
import "./werewolf-page.css";

const PLAYER_COUNTS = [6, 7, 8, 9, 10, 11, 12];
const SEAT_COLORS = [
  "oklch(72% 0.14 28)",
  "oklch(78% 0.13 82)",
  "oklch(72% 0.11 232)",
  "oklch(76% 0.12 157)",
  "oklch(72% 0.13 309)",
  "oklch(76% 0.13 56)",
  "oklch(72% 0.12 344)",
  "oklch(76% 0.1 186)",
  "oklch(69% 0.12 265)",
  "oklch(78% 0.13 125)",
  "oklch(80% 0.12 98)",
  "oklch(72% 0.12 326)",
];

function playerStyle(seat: number): CSSProperties {
  return {
    "--seat-color": SEAT_COLORS[seat] ?? "oklch(74% 0.1 190)",
    "--seat-tilt": `${seat % 2 === 0 ? -2 : 2}deg`,
    "--seat-delay": `${Math.min(seat, 8) * 38}ms`,
  } as CSSProperties;
}

const ROLE_MARKS = {
  wolf: "狼",
  seer: "星",
  witch: "药",
  hunter: "猎",
  villager: "民",
} as const;

function PlayerSeat({
  player,
  viewerId,
  current,
  legalMove,
  pending,
  onChoose,
}: {
  player: WerewolfPlayer;
  viewerId: string | null;
  current: boolean;
  legalMove: WerewolfMove | null;
  pending: boolean;
  onChoose: () => void;
}) {
  const visibleRole = player.role ? ROLE_MARKS[player.role] : null;
  const isViewer = player.id === viewerId;
  return (
    <button
      type="button"
      className={`ww-player${current ? " is-current" : ""}${legalMove ? " is-targetable" : ""}${player.alive ? "" : " is-out"}${isViewer ? " is-viewer" : ""}`}
      style={playerStyle(player.seat)}
      disabled={!legalMove || pending}
      onClick={onChoose}
      aria-label={`${player.seat + 1} 号 ${player.name}，${player.controller_type === "human" ? "人类玩家" : "小机玩家"}，${player.alive ? "存活" : "已出局"}${legalMove ? `，${legalMove.label}` : ""}`}
      aria-current={current ? "true" : undefined}
    >
      <span className="ww-player__avatar" aria-hidden="true">
        <b className="ww-player__seat-number">{player.seat + 1}</b>
        <span className="ww-player__hair" />
        <span className="ww-player__face">
          <i className="ww-player__eye--left" />
          <i className="ww-player__eye--right" />
          <b />
        </span>
        {visibleRole ? <i className="ww-player__role">{visibleRole}</i> : null}
      </span>
      <span className="ww-player__label">
        <strong>{player.name}</strong>
        <small aria-hidden="true">
          {isViewer ? "你" : player.controller_type === "human" ? "人" : "机"}
        </small>
      </span>
      {current && player.alive ? <span className="ww-player__turn">行动中</span> : null}
      {legalMove ? <span className="ww-player__choose">点选</span> : null}
      {!player.alive ? <em>出局</em> : null}
    </button>
  );
}

function RoleIntel({ view }: { view: WerewolfView }) {
  const privateView = view.private;
  if (!privateView) return null;
  let detail = privateView.team === "wolves" ? "与狼队友共同存活到人数优势" : "找出并放逐全部狼人";
  if (privateView.role === "wolf") {
    const names = (privateView.wolf_allies ?? [])
      .filter((id) => id !== view.viewer_id)
      .map((id) => view.players.find((player) => player.id === id)?.name)
      .filter(Boolean);
    detail = names.length ? `狼队友：${names.join("、")}` : "你是最后一名狼人";
  }
  if (privateView.role === "seer" && privateView.seer_checks?.length) {
    const check = privateView.seer_checks.at(-1);
    const target = view.players.find((player) => player.id === check?.target_id);
    detail = `查验：${target?.name ?? "未知"} · ${check?.is_wolf ? "狼人" : "好人"}`;
  }
  if (privateView.role === "witch" && privateView.witch) {
    detail = `解药${privateView.witch.antidote_available ? "✓" : "×"}  毒药${privateView.witch.poison_available ? "✓" : "×"}`;
  }
  if (privateView.role === "hunter") detail = "出局后可以开枪带走一名玩家";
  return (
    <div className={`ww-role ww-role--${privateView.role}`}>
      <span className="ww-role__mark">{ROLE_MARKS[privateView.role]}</span>
      <span className="ww-role__copy">
        <strong>你是{privateView.role_name}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function CenterAction({
  view,
  pending,
  speech,
  onSpeechChange,
  onMove,
  onNewGame,
}: {
  view: WerewolfView;
  pending: boolean;
  speech: string;
  onSpeechChange: (value: string) => void;
  onMove: (move: WerewolfMove) => void;
  onNewGame: () => void;
}) {
  const copy = phaseCopy(view);
  const mine = view.current_player_id === view.viewer_id;
  const latestEvent = view.recent_events.at(-1)?.text ?? "夜幕落下，先确认自己的身份。";
  const heal = moveByAction(view, "witch", "heal");
  const witchPass = moveByAction(view, "witch", "pass");
  const hunterPass = moveByAction(view, "hunter_pass");
  const passSpeech = moveByAction(view, "pass_speech");

  return (
    <section className="ww-center" aria-label="当前游戏阶段">
      <div
        className={`ww-phase-mark${view.phase.startsWith("night_") ? " is-night" : " is-day"}`}
        aria-hidden="true"
      >
        <span />
      </div>
      <div className="ww-phase" aria-live="polite">
        <span>{mine ? "轮到你了" : "本局进程"}</span>
        <strong>{copy.title}</strong>
        <small>{pending ? "正在提交…" : copy.instruction}</small>
      </div>
      <RoleIntel view={view} />

      {mine && view.phase === "discussion" ? (
        <div className="ww-speech">
          <label htmlFor="ww-speech-input" className="ww-visually-hidden">
            公开发言
          </label>
          <input
            id="ww-speech-input"
            value={speech}
            onChange={(event) => onSpeechChange(event.target.value)}
            placeholder="说说你的判断…"
            disabled={pending}
          />
          <button
            type="button"
            className="is-primary"
            disabled={pending || !speech.trim()}
            onClick={() => onMove({ action: "speak", text: speech.trim(), label: "公开发言" })}
          >
            发言
          </button>
          {passSpeech ? (
            <button type="button" disabled={pending} onClick={() => onMove(passSpeech)}>
              过麦
            </button>
          ) : null}
        </div>
      ) : null}

      {mine && view.phase === "night_witch" ? (
        <div className="ww-quick-actions">
          {heal ? (
            <button
              type="button"
              className="is-heal"
              disabled={pending}
              onClick={() => onMove(heal)}
            >
              {heal.label}
            </button>
          ) : null}
          {witchPass ? (
            <button type="button" disabled={pending} onClick={() => onMove(witchPass)}>
              不用药
            </button>
          ) : null}
        </div>
      ) : null}

      {mine && view.phase === "hunter_shot" && hunterPass ? (
        <div className="ww-quick-actions">
          <button type="button" disabled={pending} onClick={() => onMove(hunterPass)}>
            放弃开枪
          </button>
        </div>
      ) : null}

      {view.phase === "round_over" ? (
        <button type="button" className="ww-rematch" disabled={pending} onClick={onNewGame}>
          再来一局
        </button>
      ) : null}

      <p className="ww-event">{latestEvent}</p>
    </section>
  );
}

export function WerewolfPage() {
  const [session, setSession] = useState<WerewolfSession | null>(null);
  const [playerCount, setPlayerCount] = useState(8);
  const [speech, setSpeech] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef(0);
  const initialStartRef = useRef(false);
  const residentActionKeyRef = useRef<string | null>(null);

  const startGame = useCallback(async (count: number) => {
    const operation = ++operationRef.current;
    setPending(true);
    setError(null);
    setSpeech("");
    residentActionKeyRef.current = null;
    try {
      const next = await createWerewolfGame(Date.now() >>> 0, count);
      if (operation === operationRef.current) setSession(next);
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
    void startGame(playerCount);
  }, [playerCount, startGame]);

  const runMove = useCallback(
    async (move: WerewolfMove) => {
      if (!session || pending) return;
      const operation = ++operationRef.current;
      setPending(true);
      setError(null);
      try {
        const next = await sendWerewolfMove(session, move);
        if (operation === operationRef.current) {
          setSession(next);
          setSpeech("");
        }
      } catch (reason) {
        if (operation === operationRef.current)
          setError(reason instanceof Error ? reason.message : "这一步没有成功");
      } finally {
        if (operation === operationRef.current) setPending(false);
      }
    },
    [pending, session],
  );

  useEffect(() => {
    if (!session || pending || session.controller.phase === "round_over") return;
    const current = session.controller.players.find(
      (player) => player.id === session.controller.current_player_id,
    );
    if (current?.controller_type !== "resident") return;
    const move = chooseResidentMove(session.controller);
    if (!move) return;
    const actionKey = `${session.controller.game_id}:${session.controller.revision}:${current.id}`;
    if (residentActionKeyRef.current === actionKey) return;
    residentActionKeyRef.current = actionKey;
    void runMove(move);
  }, [pending, runMove, session]);

  const display = session?.display ?? null;
  const controller = session?.controller ?? null;
  const currentController = controller?.players.find(
    (player) => player.id === controller.current_player_id,
  );
  const humanTurn = currentController?.controller_type === "human";
  const targetMoves = useMemo(() => {
    const result = new Map<string, WerewolfMove>();
    if (!controller || !humanTurn) return result;
    for (const player of controller.players) {
      const move = targetMove(controller, player.id);
      if (move) result.set(player.id, move);
    }
    return result;
  }, [controller, humanTurn]);

  const previewColumns = display && display.players.length >= 8 ? 4 : 3;
  const previewRows = display ? Math.ceil(display.players.length / previewColumns) : 2;
  const aliveCount = display?.players.filter((player) => player.alive).length ?? 0;

  return (
    <main className="ww-viewport">
      <div className="ww-safe-frame">
        <div
          className={`ww-stage${display?.phase.startsWith("night_") ? " is-night" : " is-day"}`}
          style={
            {
              "--ww-preview-columns": previewColumns,
              "--ww-preview-roster-height": `${previewRows * 86}px`,
            } as CSSProperties
          }
        >
          <div className="ww-sky" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="ww-ground" aria-hidden="true" />

          <div className="ww-brand">
            <span aria-hidden="true">☾</span>
            <strong>狼人杀</strong>
            {display ? <small>{aliveCount} 人存活</small> : null}
          </div>

          <div className="ww-toolbar">
            <label>
              <span>人数</span>
              <select
                aria-label="玩家人数"
                value={playerCount}
                disabled={pending}
                onChange={(event) => setPlayerCount(Number(event.target.value))}
              >
                {PLAYER_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count} 人
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={pending} onClick={() => void startGame(playerCount)}>
              新局
            </button>
            {display && display.players.length !== playerCount ? <small>下局生效</small> : null}
          </div>

          {!display || !controller ? (
            <section className="ww-loading" aria-live="polite">
              <span aria-hidden="true" />
              <strong>{error ? "村门还没打开" : "正在分配隐藏身份…"}</strong>
              {error ? <small>{error}</small> : null}
              {error ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void startGame(playerCount)}
                >
                  再试一次
                </button>
              ) : null}
            </section>
          ) : (
            <>
              <fieldset className="ww-roster">
                <legend className="ww-visually-hidden">本局玩家</legend>
                {display.players.map((player) => (
                  <PlayerSeat
                    key={player.id}
                    player={player}
                    viewerId={display.viewer_id}
                    current={display.current_player_id === player.id}
                    legalMove={targetMoves.get(player.id) ?? null}
                    pending={pending}
                    onChoose={() => {
                      const move = targetMoves.get(player.id);
                      if (move) void runMove(move);
                    }}
                  />
                ))}
              </fieldset>
              <CenterAction
                view={display.current_player_id === display.viewer_id ? controller : display}
                pending={pending}
                speech={speech}
                onSpeechChange={setSpeech}
                onMove={(move) => void runMove(move)}
                onNewGame={() => void startGame(playerCount)}
              />
            </>
          )}

          {error && display ? (
            <div className="ww-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
