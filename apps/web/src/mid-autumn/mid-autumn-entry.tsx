import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { readMidAutumn, type MidAutumnView } from "./api";
import "./mid-autumn-page.css";

const ActivityPage = lazy(async () => {
  const module = await import("./mid-autumn-page");
  return { default: module.MidAutumnPage };
});
const Memorial = lazy(async () => {
  const module = await import("./diy/mooncake-gifts");
  return { default: module.MooncakeGifts };
});

export function MidAutumnEntry({ onBack, initialView, readView = readMidAutumn }: {
  onBack: () => void;
  initialView?: MidAutumnView;
  readView?: () => Promise<MidAutumnView>;
}) {
  const [view, setView] = useState(initialView ?? null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      setView(await readView());
    } catch {
      setError(true);
    }
  }, [readView]);

  useEffect(() => {
    if (!initialView) void load();
  }, [initialView, load]);

  const loading = (
    <div className="mid-autumn-page">
      <button type="button" className="mid-autumn-page__back" onClick={onBack} aria-label="返回铃野">‹</button>
      <p className="mid-autumn-page__status" role="status" aria-live="polite">
        {error ? "活动暂时无法读取，请重试。" : "正在读取活动……"}
        {error ? <button type="button" onClick={() => void load()} style={{ marginLeft: 8 }}>重试</button> : null}
      </p>
    </div>
  );

  if (!view) return loading;
  return (
    <Suspense fallback={loading}>
      {view.phase === "ended" ? (
        <div className="mid-autumn-page"><Memorial memorial gifts={view.gifts} onBack={onBack} /></div>
      ) : (
        <ActivityPage initialView={view} readView={readView} onBack={onBack} />
      )}
    </Suspense>
  );
}
