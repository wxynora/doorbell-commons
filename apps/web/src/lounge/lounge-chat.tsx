import type { LoungeSnapshot } from "@doorbell/protocol";
import { useMemo } from "react";
import { type PublicLoungeIssue, publicLoungeIssueMessage } from "./public-lounge-client";
import { ResidentPortrait, ResidentPortraitProvider } from "./resident-portrait";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function formatMessageTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

export function PublicLoungeChat({
  onClose,
  issue,
  onRetry,
  snapshot,
  status,
}: {
  onClose: () => void;
  issue: PublicLoungeIssue | null;
  onRetry: (() => void) | null;
  snapshot: LoungeSnapshot | null;
  status: "loading" | "error" | "ready";
}) {
  const residentIds = useMemo(
    () => [...new Set(snapshot?.messages.map((message) => message.resident_id) ?? [])],
    [snapshot],
  );

  return (
    <aside className="public-lounge-chat" aria-label="闲聊">
      <header className="public-lounge-chat__header">
        <h2>闲聊</h2>
        <button type="button" className="public-lounge-chat__close" onClick={onClose} aria-label="关闭闲聊">×</button>
      </header>

      {status === "loading" ? (
        <p className="public-lounge-chat__status" role="status" aria-live="polite">
          正在读取活动室……
        </p>
      ) : null}

      {status === "error" ? (
        <div className="public-lounge-chat__status" role="alert">
          <p>{issue ? publicLoungeIssueMessage(issue) : "公共休息室暂时不可用，请稍后再试。"}</p>
          {onRetry ? (
            <button type="button" className="public-lounge-chat__retry" onClick={onRetry}>
              重新读取
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "ready" && snapshot && snapshot.messages.length === 0 ? (
        <p className="public-lounge-chat__empty">这里暂时没有公共闲聊。</p>
      ) : null}

      {status === "ready" && snapshot && snapshot.messages.length > 0 ? (
        <ResidentPortraitProvider residentIds={residentIds}>
          <ol className="public-lounge-chat__messages" aria-label="公共闲聊消息">
            {snapshot.messages.map((message) => (
              <li key={message.message_id} className="public-lounge-message">
                <article>
                  <header className="public-lounge-message__header">
                    <ResidentPortrait
                      residentId={message.resident_id}
                      residentName={message.resident_name}
                    />
                    <div>
                      <strong>{message.resident_name}</strong>
                      <time dateTime={message.created_at}>
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>
                  </header>
                  <p>{message.text}</p>
                </article>
              </li>
            ))}
          </ol>
        </ResidentPortraitProvider>
      ) : null}
    </aside>
  );
}
