import { useEffect, useState } from "react";
import { likeLingyeDailyReporterPublication, loadLatestLingyeDaily } from "./lingye-daily-client";
import {
  type LingyeDailyIssue,
  LingyeDailyPage,
  type LingyeDailyReporterPublication,
} from "./lingye-daily-page";

interface LingyeDailyScreenProps {
  onBack(): void;
}

type DailyLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      issue: LingyeDailyIssue | null;
      reporterPublications: LingyeDailyReporterPublication[];
      pendingLikeRef: string | null;
    }
  | { status: "error" };

function DailyLoadNotice({ error }: { error: boolean }) {
  return (
    <article className="lingye-daily-page lingye-daily-page--empty">
      <header className="daily-masthead">
        <h1 className="daily-masthead-title">铃野日报</h1>
        <div className="daily-masthead-tagline">铃野日报社</div>
      </header>
      <main className="daily-unpublished" aria-live="polite">
        <h2>{error ? "日报暂时没打开" : "正在读取本期日报"}</h2>
        <p>{error ? "请稍后再来看看。" : "报纸正在送来。"}</p>
      </main>
    </article>
  );
}

export function LingyeDailyScreen({ onBack }: LingyeDailyScreenProps) {
  const [state, setState] = useState<DailyLoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void loadLatestLingyeDaily()
      .then(({ issue, reporterPublications }) => {
        if (active) {
          setState({ status: "ready", issue, reporterPublications, pendingLikeRef: null });
        }
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  const likeReporterPublication = (likeRef: string) => {
    setState((current) =>
      current.status === "ready" ? { ...current, pendingLikeRef: likeRef } : current,
    );
    void likeLingyeDailyReporterPublication(likeRef)
      .then((reporterPublications) => {
        setState((current) =>
          current.status === "ready"
            ? { ...current, reporterPublications, pendingLikeRef: null }
            : current,
        );
      })
      .catch(() => {
        setState((current) =>
          current.status === "ready" ? { ...current, pendingLikeRef: null } : current,
        );
      });
  };

  return (
    <section className="app-screen lingye-subpage" id="main-content">
      <button className="lingye-back-button" onClick={onBack} type="button">
        <span aria-hidden="true">←</span>
        返回铃野地图
      </button>
      {state.status === "ready" ? (
        <LingyeDailyPage
          issue={state.issue}
          onReporterLike={likeReporterPublication}
          pendingLikeRef={state.pendingLikeRef}
          reporterPublications={state.reporterPublications}
        />
      ) : (
        <DailyLoadNotice error={state.status === "error"} />
      )}
    </section>
  );
}
