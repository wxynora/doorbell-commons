import { useEffect, useRef, useState } from "react";

export const LINGYE_BGM_OPUS_PATH = new URL("./audio/doorbell-farm-loop.webm", import.meta.url)
  .href;
export const LINGYE_BGM_AAC_PATH = new URL("./audio/doorbell-farm-loop.m4a", import.meta.url).href;
export const LINGYE_BGM_STORAGE_KEY = "doorbell.lingye.background-music-muted";
export const LINGYE_BGM_VOLUME = 0.32;

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

export function LingyeBackgroundMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(readStoredMuted);
  const [playing, setPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = LINGYE_BGM_VOLUME;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncPlayback = () => {
      if (!active || muted || document.visibilityState === "hidden") {
        audio.pause();
        return;
      }
      void audio.play().then(
        () => setPlaybackBlocked(false),
        () => setPlaybackBlocked(true),
      );
    };

    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => document.removeEventListener("visibilitychange", syncPlayback);
  }, [active, muted]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!muted && playing) {
      audio.pause();
      setMuted(true);
      writeStoredMuted(true);
      return;
    }

    const wasMuted = muted;
    setMuted(false);
    writeStoredMuted(false);
    if (wasMuted) return;
    void audio.play().then(
      () => setPlaybackBlocked(false),
      () => setPlaybackBlocked(true),
    );
  };

  const audible = playing && !muted;

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: This is instrumental background music with no speech to caption. */}
      <audio
        loop
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        playsInline
        preload={active ? "metadata" : "none"}
        ref={audioRef}
      >
        <source src={LINGYE_BGM_OPUS_PATH} type='audio/webm; codecs="opus"' />
        <source src={LINGYE_BGM_AAC_PATH} type="audio/mp4" />
      </audio>
      {active ? (
        <button
          aria-label={audible ? "关闭铃野背景音乐" : "播放铃野背景音乐"}
          className={`lingye-music-toggle${audible ? " is-playing" : " is-paused"}`}
          data-playback-blocked={playbackBlocked ? "true" : "false"}
          onClick={togglePlayback}
          title={audible ? "关闭铃野背景音乐" : "播放铃野背景音乐"}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 32 32">
            <path d="M8.5 19.2V11l12.4-3.1v8.2" />
            <circle cx="7.1" cy="21.4" r="3.4" />
            <circle cx="19.5" cy="18.2" r="3.4" />
            {audible ? (
              <path d="M24.6 10.5c2 1.7 2 4.9 0 6.7M27.6 8c3.5 3.2 3.5 8.5 0 11.7" />
            ) : (
              <path d="m23.7 10 6.3 9.2M30 10l-6.3 9.2" />
            )}
          </svg>
        </button>
      ) : null}
    </>
  );
}
