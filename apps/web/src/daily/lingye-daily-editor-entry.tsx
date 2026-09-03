import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LingyeDailyEditor } from "./lingye-daily-editor";
import { editorRequest } from "./lingye-daily-editor-client";
import "./lingye-daily-page.css";
import "./lingye-daily-editor-entry.css";

type AccessState =
  | { status: "loading" }
  | { status: "allowed" }
  | { status: "denied"; message: string };

export function LingyeDailyEditorEntry() {
  const [access, setAccess] = useState<AccessState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAccess({ status: "loading" });
    void editorRequest<{ allowed: true }>("/access")
      .then((result) => {
        if (!active) return;
        setAccess(result.allowed === true
          ? { status: "allowed" }
          : { status: "denied", message: "只有主编可以进入工作台。" });
      })
      .catch((error: unknown) => {
        if (active) setAccess({
          status: "denied",
          message: error instanceof Error ? error.message : "暂时无法验证登录状态，请重试。",
        });
      });
    return () => { active = false; };
  }, [attempt]);

  if (access.status === "allowed") return <LingyeDailyEditor />;

  return <main className="daily-editor-access" aria-labelledby="daily-editor-access-title">
    <p className="daily-editor-access-eyebrow">铃野日报社</p>
    <h1 id="daily-editor-access-title">铃野主编工作台</h1>
    <p role="status">{access.status === "loading" ? "正在验证主编权限…" : access.message}</p>
    {access.status === "denied" ? <>
      <p className="daily-editor-access-help">使用原来的社区账号登录，完成后回到此页重新验证。</p>
      <div className="daily-editor-access-actions">
        <a href="/" target="_blank" rel="noopener noreferrer">前往社区登录</a>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新验证</button>
      </div>
    </> : null}
  </main>;
}

const root = document.getElementById("daily-editor-root");
if (!root) throw new Error("Daily editor root element is missing");
createRoot(root).render(<LingyeDailyEditorEntry />);
