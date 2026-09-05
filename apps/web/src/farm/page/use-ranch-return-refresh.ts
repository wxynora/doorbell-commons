import { useEffect } from "react";
import type { BoundRanchRead } from "../../auth/ranch-client";

/** Refresh a known return once at its server deadline, without polling. */
export function useRanchReturnRefresh(ranch: BoundRanchRead | null, refresh: () => void) {
  useEffect(() => {
    if (!ranch || ranch.data.dispatch.status !== "available") return;
    const serverTime = Date.parse(ranch.server_time);
    const ends = ranch.data.dispatch.active
      .map((raid) => Date.parse(raid.ends_at ?? ""))
      .filter(Number.isFinite);
    if (!Number.isFinite(serverTime) || ends.length === 0) return;
    // Use the server's remaining duration, not the phone's wall-clock setting.
    const wakeAt = Date.now() + Math.max(0, Math.min(...ends) - serverTime);
    let fired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      if (fired) return;
      const remaining = wakeAt - Date.now();
      if (remaining > 0) {
        timer = setTimeout(wake, Math.min(2_147_483_647, remaining));
        return;
      }
      fired = true;
      refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= wakeAt) wake();
    };
    wake();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      fired = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ranch, refresh]);
}
