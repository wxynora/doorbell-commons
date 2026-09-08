import { useRef, useState } from "react";
import type { SceneDecorationLayout } from "./scene-types";
import { requestLayoutShare } from "./layout-sharing-client";

export function LayoutSharingPanel({ onPreview, request = requestLayoutShare }: {
  onPreview: (layout: SceneDecorationLayout) => void;
  request?: typeof requestLayoutShare;
}) {
  const [input, setInput] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const codeField = useRef<HTMLInputElement>(null);
  async function run(importing: boolean) {
    setBusy(true); setMessage("");
    try {
      const result = await request(importing ? input.trim().toUpperCase() : undefined);
      if (importing) onPreview(result.layout);
      else { setShareCode(result.code); setMessage("分享的是当前已保存的布置。"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成，请重试。"); }
    finally { setBusy(false); }
  }
  return <fieldset className="farm-settings__group" aria-label="布局码">
    <legend>农场布局</legend>
    <div className="farm-settings__item">
      <label htmlFor="farm-own-layout-code">分享布局</label>
      <div className="farm-settings__control">
        <input id="farm-own-layout-code" ref={codeField} aria-label="我的布局码" value={shareCode} placeholder="生成后可复制" readOnly onFocus={event => event.currentTarget.select()} />
        <button className="farm-settings__save" type="button" disabled={busy} onClick={async () => {
          if (!shareCode) { await run(false); return; }
          try { await navigator.clipboard.writeText(shareCode); setMessage("布局码已复制。"); }
          catch { codeField.current?.focus(); codeField.current?.select(); setMessage("请长按选中的布局码复制。"); }
        }}>{shareCode ? "复制" : "生成"}</button>
      </div>
    </div>
    <div className="farm-settings__item">
      <label htmlFor="farm-layout-code">导入布局</label>
      <div className="farm-settings__control"><input id="farm-layout-code" value={input} disabled={busy} onChange={event => setInput(event.currentTarget.value)} placeholder="LY-XXXXXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
      <button className="farm-settings__save" type="button" onClick={()=>void run(true)} disabled={busy || !input.trim()}>预览布局</button></div>
    </div>
    <p className="farm-settings__status">缺少或放不下的装饰会留空。先看预览，确认后才替换当前布置。</p>
    {message || busy ? <p className="farm-settings__status" role="status">{busy ? "正在读取布局…" : message}</p> : null}
  </fieldset>;
}
