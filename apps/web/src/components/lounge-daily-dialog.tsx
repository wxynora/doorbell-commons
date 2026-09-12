import { useEffect, useRef, useState } from "react";
import { loadLatestLingyeDaily } from "../daily/lingye-daily-client";
import { LingyeDailyPage, type LingyeDailyIssue } from "../daily/lingye-daily-page";

export function LoungeDailyDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; issue: LingyeDailyIssue | null }>({ status: "loading", issue: null });
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void loadLatestLingyeDaily().then(({ issue }) => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (active) setState({ status: "ready", issue: issue?.issueDate === today ? issue : null });
    }).catch(() => { if (active) setState({ status: "error", issue: null }); });
    return () => { active = false; };
  }, []);
  return <dialog ref={dialog} aria-label="今天的铃野日报" onCancel={onClose} onClose={onClose}
    style={{ width: "min(900px, 94vw)", maxHeight: "90dvh", padding: "20px", border: "1px solid #b9a080", borderRadius: "16px", background: "#fff8eb", color: "#6d5d55" }}>
    <button type="button" onClick={onClose} style={{ float: "right", position: "sticky", top: 0, zIndex: 1 }}>关闭日报 ×</button>
    {state.status === "ready" ? <LingyeDailyPage issue={state.issue} /> : <p role="status">{state.status === "error" ? "日报暂时没打开，请稍后再来看看。" : "报纸正在送来。"}</p>}
  </dialog>;
}
