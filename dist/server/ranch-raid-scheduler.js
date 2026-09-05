import { playerFarms } from "../store.js";
import { settleDueRanchRaids } from "./ranch-raid-settlement.js";

/** One timer for the next persisted return, not a periodic world sweep. */
export function startRanchRaidScheduler() {
    let stopped = false;
    let timer = null;
    let scheduledAt = null;

    function reschedule(farms = playerFarms()) {
        if (stopped) return;
        let next = null;
        for (const farm of farms) {
            for (const raid of farm.ranch?.raids ?? []) {
                if (Number.isSafeInteger(raid.endsAt) && (next === null || raid.endsAt < next))
                    next = raid.endsAt;
            }
        }
        if (timer !== null && next === scheduledAt) return;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        scheduledAt = next;
        if (next === null) return;
        // Native timeout range only; longer dispatches keep their original deadline.
        timer = setTimeout(() => {
            timer = null;
            scheduledAt = null;
            try {
                settleDueRanchRaids(Date.now());
            } catch {
                console.error("[ranch-raid-scheduler] settlement failed");
                return; // Keep the original transaction intact; do not spin on a failed save.
            }
            reschedule();
        }, Math.min(2_147_483_647, Math.max(0, next - Date.now())));
        timer.unref();
    }

    reschedule();
    return {
        reschedule,
        stop() {
            stopped = true;
            if (timer !== null) clearTimeout(timer);
            timer = null;
        },
    };
}
