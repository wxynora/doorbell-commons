import { farmLayoutShareSchema, type FarmLayoutShare } from "@doorbell/protocol";
export async function requestLayoutShare(code?: string): Promise<FarmLayoutShare> {
  let response: Response;
  try {
    response = await fetch(`/api/farm/decorations/shares${code === undefined ? "" : "/lookup"}`, {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify(code === undefined ? {} : { code }),
    });
  } catch { throw new Error("暂时无法连接，请稍后再试。"); }
  if (!response.ok) {
    const messages: Record<number, string> = { 400: "请检查布局码格式。", 401: "请先登录。", 403: "当前账号没有社区资格。", 404: "没有找到这个布局码，请核对后再试。", 409: "请先完成农场绑定，并重新读取农场。" };
    throw new Error(messages[response.status] ?? "布局暂时无法读取，请稍后再试。");
  }
  const parsed = farmLayoutShareSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("布局资料格式不正确，请重新读取。");
  return parsed.data;
}
