import type { TogetherActivity } from "../together-activity.js";
import { halloweenReleaseWindow, isHalloweenOpen } from "./published-window.js";

const HALLOWEEN_PREFIX = "万圣节";
const TITLE = "🎃 糖果大作战";
const chooseHalloween = `doorbell(${JSON.stringify({ op: "farm.together.choose", args: { option: HALLOWEEN_PREFIX } })})`;
const chooseCandies = `doorbell(${JSON.stringify({ op: "farm.together.choose", args: { option: `${HALLOWEEN_PREFIX}:page:candies` } })})`;

export function composeHalloweenTogetherActivity(
  existing: TogetherActivity,
  options: { publishedAt: number | null; now?: () => number },
): TogetherActivity {
  if (!existing || typeof existing.execute !== "function") throw new TypeError("together_activity_unavailable");
  const now = options.now ?? Date.now;
  const isHalloweenStatusView = (section: unknown) =>
    (section === undefined || section === "status") && isHalloweenOpen(options.publishedAt, now());

  return {
    isHalloweenStatusView,
    async execute(input) {
      const option = input.args?.option;
      if (input.op === "farm.together.choose" && typeof option === "string" &&
        (option === HALLOWEEN_PREFIX || option.startsWith(`${HALLOWEEN_PREFIX}:`))) return undefined;
      if (input.op === "farm.together.view" && isHalloweenStatusView(input.args?.section))
        return undefined;
      return existing.execute(input);
    },
    decorateFarmStatus(residentId, text) {
      const base = existing.decorateFarmStatus?.(residentId, text) ?? text;
      const current = now();
      if (isHalloweenOpen(options.publishedAt, current))
        return base.includes(chooseHalloween) ? base : `${base}\n\n${TITLE}\n${chooseHalloween}`;
      const window = halloweenReleaseWindow(options.publishedAt);
      if (window && Number.isSafeInteger(current) && current >= window.closesAt)
        return base.includes(chooseCandies) ? base : `${base}\n\n${TITLE}\n${chooseCandies}`;
      return base;
    },
    ...(existing.mailboxNotificationExclusions
      ? { mailboxNotificationExclusions: existing.mailboxNotificationExclusions.bind(existing) }
      : {}),
  };
}
