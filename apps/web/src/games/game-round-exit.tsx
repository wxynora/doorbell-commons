import { createContext, useContext, useState } from "react";
import "./game-round-exit.css";

/** Resolve only after authoritative departure and navigation have succeeded. */
export const GameRoundExitContext = createContext<null | (() => Promise<void>)>(null);
export function GameRoundExit({ floating = false, onAgain }: { floating?: boolean; onAgain?: () => void }) {
  const leave = useContext(GameRoundExitContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function exit() {
    if (busy) return;
    if (!leave) { setError("当前为独立预览，尚未连接休息室退桌"); return; }
    setBusy(true);
    setError("");
    try { await leave(); } catch { setError("离桌未成功，请重试"); } finally { setBusy(false); }
  }
  return <div className={`game-round-exit${floating ? " game-round-exit--floating" : ""}`}>
    {onAgain && <button type="button" disabled={busy} onClick={onAgain}>再来一局</button>}
    <button type="button" disabled={busy} onClick={() => void exit()}>{busy ? "正在离桌…" : "不玩了"}</button>
    {error && <small role="status">{error}</small>}
  </div>;
}
