import { LoungeDailyDialog } from "./lounge-daily-dialog";
import {
  type LoungeSnapshot,
  loungeSnapshotDeltaSchema,
  loungeSnapshotSchema,
} from "@doorbell/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublicLoungeChat } from "../lounge/lounge-chat";
import { getPublicLoungeSnapshot, type PublicLoungeIssue } from "../lounge/public-lounge-client";
import { mergeLoungeSnapshotDelta } from "../lounge/public-lounge-delta";
import { ResidentStandingLoader } from "../lounge/resident-standing";
import { GameSessionHost } from "../games/game-session-host";
import { createGameTable, joinGameTable } from "../games/game-session-client";

export interface LoungeScenePresence {
  residentId: string;
  name: string;
  doorplate: string;
  slotId: string | null;
  position: readonly [number, number, number];
  effect: string | null;
  avatarSrc: string | null;
}

export interface PublicLoungePageProps {
  loadSnapshot?: typeof getPublicLoungeSnapshot;
  onBack?: () => void;
  snapshot?: LoungeSnapshot;
  gameViewerId?: string;
  gamesEnabled?: boolean;
}

type LoungeLoadState =
  | { stage: "loading" }
  | { stage: "error"; issue: PublicLoungeIssue }
  | { stage: "ready"; snapshot: LoungeSnapshot };

function loungeSnapshotSequence(snapshot: LoungeSnapshot): number {
  return Math.max(
    0,
    ...snapshot.messages.map((message) => message.sequence),
    ...snapshot.activities.map((activity) => activity.sequence),
  );
}

function compareLoungeSnapshots(left: LoungeSnapshot, right: LoungeSnapshot): number {
  const leftTime = Date.parse(left.server_time);
  const rightTime = Date.parse(right.server_time);
  if (leftTime !== rightTime) return leftTime > rightTime ? 1 : -1;
  const leftSequence = loungeSnapshotSequence(left);
  const rightSequence = loungeSnapshotSequence(right);
  if (leftSequence !== rightSequence) return leftSequence > rightSequence ? 1 : -1;
  return 0;
}

function scenePresenceForSnapshot(
  snapshot: LoungeSnapshot,
  standingImages: Readonly<Record<string, string>>,
): LoungeScenePresence[] {
  return snapshot.presence.map((presence) => ({
    residentId: presence.resident_id,
    name: presence.resident_name,
    doorplate: presence.farm_doorplate,
    slotId: presence.slot_id,
    position: presence.idle_position,
    effect: null,
    avatarSrc: presence.slot_id ? null : (standingImages[presence.resident_id] ?? null),
  }));
}

export function PublicLoungePage({
  loadSnapshot,
  onBack,
  snapshot: suppliedSnapshot,
  gameViewerId,
  gamesEnabled = false,
}: PublicLoungePageProps = {}) {
  const [gameRoomId, setGameRoomId] = useState<string | null>(null);
  const [gameError, setGameError] = useState("");
  const enteringGame = useRef(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoungeLoadState>(() =>
    suppliedSnapshot ? { stage: "ready", snapshot: suppliedSnapshot } : { stage: "loading" },
  );
  const sceneFrameRef = useRef<HTMLIFrameElement>(null);
  const sceneReadyRef = useRef(false);
  const snapshotRef = useRef<LoungeSnapshot | null>(suppliedSnapshot ?? null);
  const [standingImages, setStandingImages] = useState<Record<string, string>>({});
  const standingImagesRef = useRef<Readonly<Record<string, string>>>({});
  const loader = loadSnapshot ?? getPublicLoungeSnapshot;

  useEffect(() => {
    standingImagesRef.current = standingImages;
  }, [standingImages]);

  const postSceneState = useCallback((nextSnapshot: LoungeSnapshot | null) => {
    const frame = sceneFrameRef.current;
    if (!sceneReadyRef.current || !frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      {
        type: "lounge-state",
        gamesEnabled: Boolean(gamesEnabled && gameViewerId && nextSnapshot),
        tables: nextSnapshot?.tables.map(t => ({ tableId: t.table_id, gameKind: t.room?.kind ?? null, roomId: t.room?.room_id ?? null, revision: t.room?.revision ?? null })) ?? [],
        presence: nextSnapshot
          ? scenePresenceForSnapshot(nextSnapshot, standingImagesRef.current)
          : [],
      },
      window.location.origin,
    );
  }, [gamesEnabled, gameViewerId]);

  useEffect(() => {
    const handleGameMessage = (event: MessageEvent) => {
      if (!gamesEnabled || !gameViewerId || event.origin !== window.location.origin || event.source !== sceneFrameRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || (data.type !== "lounge-game-create" && data.type !== "lounge-game-join") || enteringGame.current) return;
      const table = snapshotRef.current?.tables.find(t => t.table_id === data.tableId);
      if (!table) return;
      const kinds = ["mahjong", "doudizhu", "leaf-game", "uno", "monopoly", "flying-chess"] as const;
      if (data.type === "lounge-game-create" && (table.room || !kinds.includes(data.kind))) return;
      if (data.type === "lounge-game-join" && (!table.room || table.room.room_id !== data.roomId || table.room.revision !== data.revision)) {
        setGameError("这桌状态已更新，请重新点开桌子。"); return;
      }
      enteringGame.current = true;
      setGameError("");
      const request = data.type === "lounge-game-create"
        ? createGameTable(table.table_id, data.kind)
        : joinGameTable(table.room!.room_id, table.room!.revision);
      void request.then(room => setGameRoomId(room.roomId))
        .catch(error => setGameError(error instanceof Error ? error.message : "未能进入游戏"))
        .finally(() => { enteringGame.current = false; });
    };
    window.addEventListener("message", handleGameMessage);
    return () => window.removeEventListener("message", handleGameMessage);
  }, [gamesEnabled, gameViewerId]);

  const markSceneReady = useCallback(() => {
    sceneReadyRef.current = true;
    postSceneState(snapshotRef.current);
  }, [postSceneState]);

  useEffect(() => {
    void reloadKey;
    if (suppliedSnapshot) {
      snapshotRef.current = suppliedSnapshot;
      setLoadState({ stage: "ready", snapshot: suppliedSnapshot });
      return;
    }

    const controller = new AbortController();
    let stream: EventSource | null = null;
    setLoadState({ stage: "loading" });
    void loader({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          snapshotRef.current = result.data;
          setLoadState({ stage: "ready", snapshot: result.data });

          if (typeof EventSource === "undefined") return;
          stream = new EventSource("/api/lounge/stream", { withCredentials: true });
          const setStreamProtocolError = () => {
            snapshotRef.current = null;
            setLoadState({
              stage: "error",
              issue: { code: "unexpected_response", serverMessage: null },
            });
            postSceneState(null);
          };
          const handleSnapshot = (event: Event) => {
            const data = (event as MessageEvent<string>).data;
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              setStreamProtocolError();
              return;
            }
            const parsed = loungeSnapshotSchema.safeParse(payload);
            if (!parsed.success) {
              setStreamProtocolError();
              return;
            }
            const previous = snapshotRef.current;
            if (previous && compareLoungeSnapshots(parsed.data, previous) < 0) return;
            snapshotRef.current = parsed.data;
            setLoadState({ stage: "ready", snapshot: parsed.data });
          };
          const handleDelta = (event: Event) => {
            const data = (event as MessageEvent<string>).data;
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              setStreamProtocolError();
              return;
            }
            const parsed = loungeSnapshotDeltaSchema.safeParse(payload);
            const previous = snapshotRef.current;
            if (!parsed.success || !previous) {
              setStreamProtocolError();
              return;
            }
            const next = mergeLoungeSnapshotDelta(previous, parsed.data);
            snapshotRef.current = next;
            setLoadState({ stage: "ready", snapshot: next });
          };
          const handleStreamError = () => {
            snapshotRef.current = null;
            setLoadState({
              stage: "error",
              issue: { code: "network_unavailable", serverMessage: null },
            });
            postSceneState(null);
          };
          stream.addEventListener("snapshot", handleSnapshot);
          stream.addEventListener("delta", handleDelta);
          stream.addEventListener("error", handleStreamError);
          const closeStream = () => {
            stream?.removeEventListener("snapshot", handleSnapshot);
            stream?.removeEventListener("delta", handleDelta);
            stream?.removeEventListener("error", handleStreamError);
            stream?.close();
            stream = null;
          };
          if (controller.signal.aborted) closeStream();
        } else {
          snapshotRef.current = null;
          setLoadState({ stage: "error", issue: result.issue });
          postSceneState(null);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        snapshotRef.current = null;
        setLoadState({
          stage: "error",
          issue: { code: "network_unavailable", serverMessage: null },
        });
        postSceneState(null);
      });
    return () => {
      controller.abort();
      stream?.close();
      stream = null;
    };
  }, [loader, postSceneState, reloadKey, suppliedSnapshot]);

  useEffect(() => {
    const handleSceneMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== sceneFrameRef.current?.contentWindow
      ) {
        return;
      }
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        (data.type !== "lounge-ready" && data.type !== "lounge-chat-focus" && data.type !== "lounge-daily-open" && data.type !== "lounge-gacha-open")
      ) {
        return;
      }
      if (data.type === "lounge-gacha-open") {
        const moduleUrl = "/lounge/gacha-dialog.js";
        void import(/* @vite-ignore */ moduleUrl).then(module => module.openGachaDialog())
          .catch(() => setGameError("扭蛋机暂时没打开，请再试一次。"));
        return;
      }
      if (data.type === "lounge-daily-open") { setDailyOpen(true); return; }
      if (data.type === "lounge-chat-focus") {
        const chat = document.querySelector<HTMLElement>(".public-lounge-chat");
        if (chat) { chat.tabIndex = -1; chat.focus({ preventScroll: true }); }
        return;
      }
      markSceneReady();
    };

    window.addEventListener("message", handleSceneMessage);
    return () => {
      sceneReadyRef.current = false;
      window.removeEventListener("message", handleSceneMessage);
    };
  }, [markSceneReady]);

  useEffect(() => {
    void standingImages;
    if (loadState.stage === "ready") {
      postSceneState(snapshotRef.current);
    }
  }, [loadState, postSceneState, standingImages]);

  const issue = loadState.stage === "error" ? loadState.issue : null;
  const chatSnapshot = loadState.stage === "ready" ? loadState.snapshot : null;
  const gameProfiles = useMemo(() => ({
    ...Object.fromEntries((chatSnapshot?.presence ?? []).map(p => [`resident:${p.resident_id}`, { name: p.resident_name }])),
    ...(gameViewerId ? { [gameViewerId]: { name: "你" } } : {}),
  }), [chatSnapshot?.presence, gameViewerId]);
  const returnFromGame = () => { setGameRoomId(null); setReloadKey(key => key + 1); };
  const standingResidentIds = useMemo(
    () => [
      ...new Set(
        chatSnapshot?.presence
          .filter((presence) => presence.slot_id === null)
          .map((presence) => presence.resident_id) ?? [],
      ),
    ],
    [chatSnapshot],
  );

  return (
    <main className="public-lounge-page" id="main-content" aria-label="公共休息室">
      <section className="public-lounge-room" aria-label="公共休息室场景">
        <header className="public-lounge-room__header">
          <div>
            <p className="public-lounge-room__eyebrow">DOORBELL COMMONS</p>
            <h1>公共休息室</h1>
          </div>
          {onBack ? (
            <button type="button" className="public-lounge-room__back" onClick={onBack}>
              返回铃野
            </button>
          ) : null}
        </header>
        <div className="public-lounge-room__viewport">
          <iframe
            ref={sceneFrameRef}
            src="/lounge/index.html"
            title="公共休息室场景"
            onLoad={markSceneReady}
          />
        </div>
      </section>
      {dailyOpen ? <LoungeDailyDialog onClose={() => setDailyOpen(false)} /> : null}
      <ResidentStandingLoader
        residentIds={standingResidentIds}
        onImagesChange={setStandingImages}
      />
      <PublicLoungeChat
        issue={issue}
        onRetry={loadState.stage === "error" ? () => setReloadKey((current) => current + 1) : null}
        snapshot={chatSnapshot}
        status={loadState.stage}
      />
      {gameError && <div role="alert">{gameError}<button type="button" onClick={() => setGameError("")}>关闭</button></div>}
      {gameRoomId && gameViewerId && <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
        <GameSessionHost roomId={gameRoomId} viewerId={gameViewerId} profiles={gameProfiles} onExit={returnFromGame} onNewTable={returnFromGame} />
      </div>}
    </main>
  );
}
