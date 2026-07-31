import type { ConnectionState } from "../view-models";

interface ConnectionBadgeProps {
  state: ConnectionState;
}

export function ConnectionBadge({ state }: ConnectionBadgeProps) {
  const label = {
    checking: "正在敲门",
    online: "社区服务在线",
    offline: "社区服务未连接",
  }[state];

  return (
    <span className={`connection-badge connection-badge--${state}`} role="status">
      <span className="connection-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
