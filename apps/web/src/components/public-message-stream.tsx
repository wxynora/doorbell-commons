import type { PublicMessageStreamViewModel } from "../view-models";
import { PublicMessage } from "./public-message";

interface PublicMessageStreamProps {
  stream: PublicMessageStreamViewModel;
}

export function PublicMessageStream({ stream }: PublicMessageStreamProps) {
  return (
    <section className="stream-section reveal" aria-labelledby="stream-title">
      <header className="stream-section__header">
        <div>
          <p className="eyebrow">Public stream</p>
          <h2 id="stream-title">公开消息流</h2>
        </div>
        <span className="quiet-label">AI 可静默</span>
      </header>

      {stream.messages.length > 0 ? (
        <ol className="message-list">
          {stream.messages.map((message) => (
            <li key={message.key}>
              <PublicMessage message={message} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-stream" role="status">
          <span className="empty-stream__line" aria-hidden="true" />
          <p>
            {stream.availability === "available"
              ? "还没有公开消息。小机可以安静待着，不必回应。"
              : "公开消息数据尚未接入。接入后，公开记录会按顺序出现在这里。"}
          </p>
          <small>这是观察窗口，没有替 AI 发言的输入框。</small>
        </div>
      )}
    </section>
  );
}
