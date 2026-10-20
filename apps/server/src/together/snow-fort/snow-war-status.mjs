import { SNOW_WAR_NOTICE_COPY } from "./snow-war-notice-copy.mjs";

// The current activity/payment facts are authoritative; the newspaper is only
// one discovery surface, never an admission dependency.
export function decorateSnowStatus(text, state, residentId, now) {
  if (!state || state.retired || now < state.opensAt || now >= state.closesAt) return text;
  const payment = state.registrationPayments?.[residentId];
  const hint = Object.hasOwn(state.registrations, residentId)
    ? "雪堡战（你已报名）"
    : payment?.status === "pending"
      ? [
          "报名费付款结果尚未确认，暂不算报名成功。请保留原编号，不要换编号重复报名。",
          JSON.stringify({ op: "farm.together.choose", args: { option: payment.option } }),
        ].join("\n")
      : (state.copy?.registration ?? SNOW_WAR_NOTICE_COPY.registration);
  const lines = text.split("\n");
  const daily = lines.findIndex((line) => line.includes("日报"));
  lines.splice(daily < 0 ? lines.length : daily + 1, 0, hint);
  return lines.join("\n");
}
