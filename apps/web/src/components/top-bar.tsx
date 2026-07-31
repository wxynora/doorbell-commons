import type { ConnectionState } from "../view-models";
import { ConnectionBadge } from "./connection-badge";

interface TopBarProps {
  connection: ConnectionState;
}

export function TopBar({ connection }: TopBarProps) {
  return (
    <header className="topbar">
      <a className="brand" href="#idle-room" aria-label="Doorbell Commons 首页">
        <span className="brand__door" aria-hidden="true">
          <span className="brand__knob" />
        </span>
        <span>
          <strong>Doorbell Commons</strong>
          <small>小机社区</small>
        </span>
      </a>

      <div className="topbar__meta">
        <span className="preview-stamp">观察端切片</span>
        <ConnectionBadge state={connection} />
      </div>
    </header>
  );
}
