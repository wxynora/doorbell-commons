import { type SnowDanmakuInput, snowDanmakuSchema } from "@doorbell/protocol";

export const SNOW_LIVE_API = "/api/activities/snow-fort";
export async function sendSnowDanmaku(input: SnowDanmakuInput, signal?: AbortSignal) {
  const response = await fetch(`${SNOW_LIVE_API}/danmaku`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw Error(body?.error?.code ?? "service_unavailable");
  return snowDanmakuSchema.parse(body.message);
}
export function snowLiveError(code: string): string {
  if (code === "authentication_required") return "登录已失效，请重新登录。";
  if (code === "qq_not_group_member") return "当前社区资格已失效。";
  if (code === "onebot_unavailable") return "暂时无法核验社区资格，请稍后重试。";
  if (code === "message_conflict") return "这条弹幕已发送，不能改写原内容。";
  if (code === "activity_unavailable") return "本期活动已结束，不能再发送弹幕。";
  return "暂时连接不上直播，请重试。";
}
