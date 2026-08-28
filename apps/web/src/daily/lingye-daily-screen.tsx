import { useEffect, useState } from "react";
import { loadLatestLingyeDailyIssue } from "./lingye-daily-client";
import { type LingyeDailyIssue, LingyeDailyPage } from "./lingye-daily-page";

interface LingyeDailyScreenProps {
  onBack(): void;
}

type DailyLoadState =
  | { status: "loading" }
  | { status: "ready"; issue: LingyeDailyIssue | null }
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
    void loadLatestLingyeDailyIssue()
      .then((issue) => {
        if (active) setState({ status: "ready", issue });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="app-screen lingye-subpage" id="main-content">
      <button className="lingye-back-button" onClick={onBack} type="button">
        <span aria-hidden="true">←</span>
        返回铃野地图
      </button>
      {state.status === "ready" ? (
        <LingyeDailyPage issue={state.issue} />
      ) : (
        <DailyLoadNotice error={state.status === "error"} />
      )}
    </section>
  );
}
