import {
  type SnowDanmaku,
  type SnowLiveSnapshot,
  snowDanmakuSchema,
  snowLiveResponseSchema,
  snowLiveSnapshotSchema,
} from "@doorbell/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { SNOW_LIVE_API, snowLiveError } from "./api";

export function useSnowLive() {
  const [snapshot, setSnapshot] = useState<SnowLiveSnapshot | null>(null);
  const [messages, setMessages] = useState<SnowDanmaku[]>([]);
  const [flying, setFlying] = useState<SnowDanmaku[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const seen = useRef(new Set<number>()),
    cursor = useRef(0);
  const addMessages = useCallback((incoming: SnowDanmaku[], animate: boolean) => {
    const fresh = incoming.filter((message) => !seen.current.has(message.sequence));
    for (const message of fresh) {
      seen.current.add(message.sequence);
      cursor.current = Math.max(cursor.current, message.sequence);
    }
    if (fresh.length) {
      setMessages((previous) => [...previous, ...fresh].sort((a, b) => a.sequence - b.sequence));
      if (animate) setFlying((previous) => [...previous, ...fresh]);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    setStatus("connecting");
    setError(null);
    const source = new EventSource(`${SNOW_LIVE_API}/stream?after=${cursor.current}`);
    const accept = (handler: (value: unknown) => void) => (event: MessageEvent<string>) => {
      if (disposed) return;
      try {
        handler(JSON.parse(event.data));
        setStatus("live");
        setError(null);
      } catch {
        source.close();
        setStatus("error");
        setError("直播数据暂时无法读取，请重试。");
      }
    };
    source.addEventListener(
      "initial",
      accept((raw) => {
        const value = snowLiveResponseSchema.parse(raw);
        setSnapshot(value.snapshot);
        addMessages(value.messages, false);
      }),
    );
    source.addEventListener(
      "snapshot",
      accept((raw) => setSnapshot(raw === null ? null : snowLiveSnapshotSchema.parse(raw))),
    );
    source.addEventListener(
      "danmaku",
      accept((raw) => addMessages([snowDanmakuSchema.parse(raw)], true)),
    );
    source.addEventListener("access_error", (event) => {
      if (disposed) return;
      source.close();
      setStatus("error");
      try {
        setError(snowLiveError(JSON.parse((event as MessageEvent<string>).data)?.error?.code));
      } catch {
        setError(snowLiveError("service_unavailable"));
      }
    });
    source.addEventListener("unavailable", () => {
      if (!disposed) {
        setStatus("error");
        setError(snowLiveError("service_unavailable"));
      }
    });
    source.onerror = () => {
      if (!disposed) {
        setStatus("connecting");
        setError("直播连接中断，正在重新连接。");
      }
    };
    return () => {
      disposed = true;
      source.close();
    };
  }, [generation, addMessages]);
  return {
    snapshot,
    messages: messages.filter((message) => message.activityId === snapshot?.activityId),
    flying: flying.filter((message) => message.activityId === snapshot?.activityId),
    status,
    error,
    addMessage: (message: SnowDanmaku) => addMessages([message], true),
    finishFlying: (sequence: number) =>
      setFlying((previous) => previous.filter((message) => message.sequence !== sequence)),
    reconnect: () => setGeneration((value) => value + 1),
  };
}
