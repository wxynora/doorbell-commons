import { useCallback, useEffect, useRef, useState } from "react";

export const LINGYE_BGM_OPUS_PATH = new URL("./audio/doorbell-farm-loop.webm", import.meta.url)
  .href;
export const LINGYE_BGM_AAC_PATH = new URL("./audio/doorbell-farm-loop.m4a", import.meta.url).href;
export const LINGYE_BGM_STORAGE_KEY = "doorbell.lingye.background-music-muted";
export const LINGYE_BGM_VOLUME = 0.2;

type BackgroundMusicEngine = {
  context: AudioContext;
  gain: GainNode;
  source: AudioBufferSourceNode;
};

function readStoredMuted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LINGYE_BGM_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredMuted(muted: boolean) {
  try {
    window.localStorage.setItem(LINGYE_BGM_STORAGE_KEY, String(muted));
  } catch {
    // Private browsing or a blocked storage partition must not break playback.
  }
}

function preferredBackgroundMusicPath() {
  const probe = document.createElement("audio");
  return probe.canPlayType('audio/webm; codecs="opus"')
    ? LINGYE_BGM_OPUS_PATH
    : LINGYE_BGM_AAC_PATH;
}

function audioContextConstructor() {
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function LingyeBackgroundMusic({
  active,
  controlVisible,
}: {
  active: boolean;
  controlVisible: boolean;
}) {
  const engineRef = useRef<BackgroundMusicEngine | null>(null);
  const enginePromiseRef = useRef<Promise<BackgroundMusicEngine> | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const activeRef = useRef(active);
  const mutedRef = useRef(readStoredMuted());
  const [muted, setMuted] = useState(mutedRef.current);
  const [playing, setPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const ensureEngine = useCallback(() => {
    if (engineRef.current) return Promise.resolve(engineRef.current);
    if (enginePromiseRef.current) return enginePromiseRef.current;

    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass) {
      return Promise.reject(new Error("Web Audio is not available in this browser."));
    }

    const context = new AudioContextClass();
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const gain = context.createGain();
    gain.gain.value = mutedRef.current ? 0 : LINGYE_BGM_VOLUME;
    gain.connect(context.destination);
    contextRef.current = context;

    let enginePromise: Promise<BackgroundMusicEngine>;
    enginePromise = fetch(preferredBackgroundMusicPath())
      .then((response) => {
        if (!response.ok) throw new Error(`Background music request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        if (
          !mountedRef.current ||
          lifecycleGenerationRef.current !== lifecycleGeneration ||
          context.state === "closed"
        ) {
          throw new Error("Background music was disposed before loading completed.");
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start(0);
        const engine = { context, gain, source };
        engineRef.current = engine;
        return engine;
      })
      .catch(async (error: unknown) => {
        if (context.state !== "closed") await context.close().catch(() => undefined);
        if (contextRef.current === context) contextRef.current = null;
        throw error;
      })
      .finally(() => {
        if (enginePromiseRef.current === enginePromise) enginePromiseRef.current = null;
      });

    enginePromiseRef.current = enginePromise;
    return enginePromise;
  }, []);

  const syncPlayback = useCallback(async () => {
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const shouldRun = activeRef.current && document.visibilityState !== "hidden";
    if (!shouldRun) {
      const context = contextRef.current;
      if (context?.state === "running") await context.suspend().catch(() => undefined);
      if (mountedRef.current && lifecycleGenerationRef.current === lifecycleGeneration) {
        setPlaying(false);
      }
      return;
    }

    try {
      const engine = await ensureEngine();
      if (!mountedRef.current || lifecycleGenerationRef.current !== lifecycleGeneration) {
        return;
      }

      engine.gain.gain.value = mutedRef.current ? 0 : LINGYE_BGM_VOLUME;
      if (!activeRef.current || document.visibilityState === "hidden") {
        if (engine.context.state === "running") await engine.context.suspend();
        if (mountedRef.current && lifecycleGenerationRef.current === lifecycleGeneration) {
          setPlaying(false);
        }
        return;
      }

      if (engine.context.state !== "running") await engine.context.resume();
      if (!mountedRef.current || lifecycleGenerationRef.current !== lifecycleGeneration) {
        return;
      }
      const isPlaying = engine.context.state === "running";
      setPlaying(isPlaying);
      setPlaybackBlocked(!isPlaying);
    } catch {
      if (!mountedRef.current || lifecycleGenerationRef.current !== lifecycleGeneration) {
        return;
      }
      setPlaying(false);
      setPlaybackBlocked(true);
    }
  }, [ensureEngine]);

  useEffect(() => {
    const lifecycleGeneration = lifecycleGenerationRef.current + 1;
    lifecycleGenerationRef.current = lifecycleGeneration;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lifecycleGenerationRef.current === lifecycleGeneration) {
        lifecycleGenerationRef.current += 1;
      }

      const engine = engineRef.current;
      const context = contextRef.current;
      engineRef.current = null;
      enginePromiseRef.current = null;
      contextRef.current = null;
      if (engine) {
        engine.source.stop();
        engine.source.disconnect();
        engine.gain.disconnect();
      }
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    mutedRef.current = muted;
    void syncPlayback();
  }, [active, muted, syncPlayback]);

  useEffect(() => {
    const handleVisibilityChange = () => void syncPlayback();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [syncPlayback]);

  const togglePlayback = () => {
    if (muted) {
      mutedRef.current = false;
      const gain = engineRef.current?.gain;
      if (gain) gain.gain.value = LINGYE_BGM_VOLUME;
      setMuted(false);
      writeStoredMuted(false);
      return;
    }

    if (playing) {
      mutedRef.current = true;
      const gain = engineRef.current?.gain;
      if (gain) gain.gain.value = 0;
      setMuted(true);
      writeStoredMuted(true);
      return;
    }

    void syncPlayback();
  };

  const audible = playing && !muted;

  return controlVisible ? (
    <button
      aria-label={audible ? "关闭铃野背景音乐" : "播放铃野背景音乐"}
      className={`lingye-music-toggle${audible ? " is-playing" : " is-paused"}`}
      data-playback-blocked={playbackBlocked ? "true" : "false"}
      onClick={togglePlayback}
      title={audible ? "关闭铃野背景音乐" : "播放铃野背景音乐"}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <path d="M5.5 12h5l7-5v18l-7-5h-5z" />
        {audible ? (
          <path d="M21 11.3c2.7 2.6 2.7 6.8 0 9.4M24.8 8c4.6 4.4 4.6 11.6 0 16" />
        ) : (
          <path d="m21.5 12 7 8M28.5 12l-7 8" />
        )}
      </svg>
    </button>
  ) : null;
}
