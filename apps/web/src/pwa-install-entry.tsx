import { useSyncExternalStore } from "react";
import type { PwaInstallController } from "./pwa-install";
import "./pwa-install.css";

export function PwaInstallEntry({ controller }: { controller: PwaInstallController }) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  if (snapshot.hidden) return null;

  return (
    <aside className="pwa-install-entry" aria-label="Install Doorbell Commons">
      <button
        className="pwa-install-button"
        type="button"
        disabled={snapshot.busy}
        aria-expanded={snapshot.guide !== null}
        onClick={() => void controller.requestInstall()}
      >
        {snapshot.busy ? "Opening…" : "Install app"}
      </button>
      {snapshot.guide === "ios" ? (
        <p className="pwa-install-guide" role="status">
          点浏览器的分享按钮，选择“添加到主屏幕”，再点“添加”。
        </p>
      ) : null}
      {snapshot.guide === "browser" ? (
        <p className="pwa-install-guide" role="status">
          打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。
        </p>
      ) : null}
    </aside>
  );
}
