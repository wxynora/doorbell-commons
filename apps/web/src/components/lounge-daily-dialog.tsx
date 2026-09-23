import { useEffect, useRef, useState } from "react";
import { loadLatestLingyeDaily, likeLingyeDailyReporterPublication } from "../daily/lingye-daily-client";
import { LingyeDailyPage, type LingyeDailyIssue, type LingyeDailyReporterPublication } from "../daily/lingye-daily-page";

export function LoungeDailyDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; issue: LingyeDailyIssue | null }>({ status: "loading", issue: null });
  const [publications, setPublications] = useState<LingyeDailyReporterPublication[]>([]);
  const [pendingLikeRef, setPendingLikeRef] = useState<string | null>(null);
  const [likeError, setLikeError] = useState("");
  const liking = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void loadLatestLingyeDaily().then(({ issue, reporterPublications }) => {
      if (active) setPublications(reporterPublications);
      if (active) setState({ status: "ready", issue });
    }).catch(() => { if (active) setState({ status: "error", issue: null }); });
    return () => { active = false; };
  }, []);
  async function like(likeRef: string) {
    if (liking.current) return;
    liking.current = true; setPendingLikeRef(likeRef); setLikeError("");
    try { setPublications(await likeLingyeDailyReporterPublication(likeRef)); }
    catch { setLikeError("点赞没成功，请稍后再试。"); }
    finally { liking.current = false; setPendingLikeRef(null); }
  }
  return <dialog ref={dialog} aria-label="铃野日报" onCancel={onClose} onClose={onClose}
    style={{ width: "min(900px, 94vw)", maxHeight: "90dvh", padding: "20px", border: "1px solid #b9a080", borderRadius: "16px", background: "#fff8eb", color: "#6d5d55" }}>
    <button type="button" onClick={onClose} style={{ float: "right", position: "sticky", top: 0, zIndex: 1 }}>关闭日报 ×</button>
    {state.status === "ready" ? <LingyeDailyPage issue={state.issue} reporterPublications={publications} pendingLikeRef={pendingLikeRef} onReporterLike={like} /> : <p role="status">{state.status === "error" ? "日报暂时没打开，请稍后再来看看。" : "报纸正在送来。"}</p>}
    {likeError ? <p role="alert">{likeError}</p> : null}
  </dialog>;
}
