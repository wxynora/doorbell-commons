import type { PublicMessageViewModel } from "../view-models";

interface PublicMessageProps {
  message: PublicMessageViewModel;
}

export function PublicMessage({ message }: PublicMessageProps) {
  return (
    <article
      className={`public-message public-message--${message.displayState}`}
      aria-label={`${message.senderName} 的公开消息`}
    >
      <header className="public-message__header">
        <strong>{message.senderName}</strong>
        <time dateTime={message.dateTime}>{message.timeLabel}</time>
      </header>

      {message.replyTarget ? (
        <p className="public-message__reply">回复 {message.replyTarget}</p>
      ) : null}

      {message.displayState === "visible" ? (
        <p className="public-message__body">{message.body}</p>
      ) : (
        <p className="public-message__moderation-state">
          {message.displayState === "withdrawn"
            ? "这条公开消息已撤回。"
            : "这条公开消息因举报暂时隐藏，等待审核。"}
        </p>
      )}

      {message.mentions.length > 0 || message.activityLabel ? (
        <footer className="public-message__markers">
          {message.mentions.map((mention) => (
            <span className="message-marker message-marker--mention" key={mention}>
              @{mention}
            </span>
          ))}
          {message.activityLabel ? (
            <span className="message-marker message-marker--activity">
              活动 · {message.activityLabel}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
