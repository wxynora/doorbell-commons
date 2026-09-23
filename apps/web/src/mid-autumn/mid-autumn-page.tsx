import { useCallback, useEffect, useRef, useState } from "react";
import { createMidAutumnCommand, runMidAutumnCommand, readMidAutumn, type MidAutumnCommand, type MidAutumnView } from "./api";
import { MooncakeDiy, MooncakeGifts } from "./diy/mooncake-diy";
import { MidAutumnHome } from "./mid-autumn-home";
import { MooncakeMergeGame } from "./merge/mooncake-merge-game";
import "./mid-autumn-page.css";

type MidAutumnScene = "home" | "merge" | "diy" | "gifts" | "memorial";
type ReadMidAutumnView = () => Promise<MidAutumnView>;

export interface MidAutumnPageProps {
  onBack: () => void;
  initialView?: MidAutumnView;
  readView?: ReadMidAutumnView;
}

function readErrorMessage(_error: unknown) {
  return "活动暂时无法读取，请重试。";
}

function gateMessage(view: MidAutumnView | null) {
  if (!view) return "正在读取活动……";
  if (view.phase === "upcoming") return "活动尚未开放。";
  if (view.phase === "unconfigured") return "活动暂未配置。";
  return null;
}

export function MidAutumnPage({ onBack, initialView, readView = readMidAutumn }: MidAutumnPageProps) {
  const [view, setView] = useState<MidAutumnView | null>(initialView ?? null);
  const [error, setError] = useState<string | null>(null);
  const [boundaryPending, setBoundaryPending] = useState(!initialView);
  const [scene, setScene] = useState<MidAutumnScene>(
    initialView?.phase === "ended" ? "memorial" : "home",
  );
  const [collectionOpened, setCollectionOpened] = useState(false);
  const [workshopOpened, setWorkshopOpened] = useState(false);
  const collectionCommand = useRef<MidAutumnCommand | null>(null);

  const refresh = useCallback(async () => {
    const next = await readView();
    setView(next);
    setError(null);
    return next;
  }, [readView]);

  const completeCollection = useCallback(async () => {
    collectionCommand.current ??= createMidAutumnCommand("complete_collection", {});
    await runMidAutumnCommand(collectionCommand.current);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (initialView) return;
    void refresh()
      .catch((reason: unknown) => {
        setError(readErrorMessage(reason));
      })
      .finally(() => setBoundaryPending(false));
  }, [initialView, refresh]);

  useEffect(() => {
    if (
      !view ||
      (view.phase !== "upcoming" && view.phase !== "open") ||
      (!view.opensAt && !view.deliveryAt && !view.closesAt)
    ) {
      return;
    }
    const boundaryAt = view.phase === "upcoming" ? view.opensAt
      : view.deliveryAt && Date.now() < view.deliveryAt ? view.deliveryAt : view.closesAt;
    if (!boundaryAt) return;
    const timer = window.setTimeout(() => {
      setBoundaryPending(true);
      void refresh()
        .catch((reason: unknown) => {
          setError(readErrorMessage(reason));
        })
        .finally(() => setBoundaryPending(false));
    }, Math.max(0, boundaryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [refresh, view]);

  useEffect(() => {
    if (view?.phase === "ended") setScene("memorial");
  }, [view?.phase]);

  const displayScene = view?.phase === "ended" ? "memorial" : scene;
  const isOpen = view?.phase === "open" && !boundaryPending && !error;
  const message = error ?? (boundaryPending ? "正在读取活动……" : gateMessage(view));
  const giftCount = view?.gifts.filter((gift) => gift.status === "sent").length ?? 0;
  const giftNotice = view?.gifts.some((gift) => gift.status === "sent" && gift.side === "ai")
    ? "🥮你的小机送了你一盒月饼" : undefined;

  const retry = () => {
    setBoundaryPending(true);
    void refresh()
      .catch((reason: unknown) => setError(readErrorMessage(reason)))
      .finally(() => setBoundaryPending(false));
  };

  return (
    <div className="mid-autumn-page">
      {displayScene === "home" ? (
        <button type="button" className="mid-autumn-page__back" onClick={onBack} aria-label="返回铃野">
          ‹
        </button>
      ) : null}
      {message ? (
        <p className="mid-autumn-page__status" role="status" aria-live="polite">
          {message}
          {error ? (
            <button type="button" onClick={retry} style={{ marginLeft: 8 }}>
              重试
            </button>
          ) : null}
        </p>
      ) : null}

      <div hidden={displayScene !== "home"}>
        <MidAutumnHome
          interactive={isOpen}
          onCollect={() => {
            setCollectionOpened(true);
            setScene("merge");
          }}
          onCraft={() => {
            setWorkshopOpened(true);
            setScene("diy");
          }}
          onGifts={() => setScene("gifts")}
          giftCount={giftCount}
          giftNotice={giftNotice}
        />
      </div>
      {collectionOpened ? (
        <div hidden={!isOpen || displayScene !== "merge"}>
          <MooncakeMergeGame active={isOpen && displayScene === "merge"} onBack={() => setScene("home")} onComplete={completeCollection} />
        </div>
      ) : null}
      {workshopOpened ? (
        <div hidden={!isOpen || displayScene !== "diy"}>
          <MooncakeDiy
            onBack={() => setScene("home")}
            {...(view
              ? {
                  live: {
                    view,
                    refresh,
                  },
                }
              : {})}
          />
        </div>
      ) : null}
      <div hidden={displayScene !== "gifts"}>
        <MooncakeGifts
          gifts={view?.gifts.filter((gift) => gift.status === "sent") ?? []}
          onBack={() => setScene("home")}
        />
      </div>
      <div hidden={displayScene !== "memorial"}>
        <MooncakeGifts memorial gifts={view?.gifts ?? []} onBack={onBack} />
      </div>
    </div>
  );
}
