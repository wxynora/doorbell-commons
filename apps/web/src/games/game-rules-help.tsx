import { useRef, type ReactNode } from "react";
import "./game-rules-help.css";
import { GAME_RULES_COPY } from "./game-rules-copy";

export function GameRulesText({ kind }: { kind: keyof typeof GAME_RULES_COPY }) {
  return <>{GAME_RULES_COPY[kind].map(text => <p key={text}>{text}</p>)}</>;
}

export function GameRulesIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>;
}

export function GameRulesHelp({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className={`game-rules-icon ${className}`} aria-label={`查看${title}规则`} onClick={() => dialog.current?.showModal()}><GameRulesIcon /></button>
    <dialog ref={dialog} className="game-rules-dialog" aria-label={`${title}规则`} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <article><header><h2>{title}规则</h2><button type="button" aria-label="关闭规则" onClick={() => dialog.current?.close()}>×</button></header>{children}</article>
    </dialog>
  </>;
}
