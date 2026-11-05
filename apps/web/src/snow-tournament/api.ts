import {
  snowTournamentResponseSchema,
  type SnowTournamentResponse,
} from "../../../../packages/protocol/src/snow-tournament";

export async function readSnowTournament(
  signal: AbortSignal,
  editionId?: string,
): Promise<SnowTournamentResponse> {
  const query = editionId ? `?${new URLSearchParams({ editionId })}` : "";
  const response = await fetch(`/api/snow-tournament${query}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("请先登录社区，再来查看比赛。");
    if (response.status === 403) throw new Error("当前账号没有社区访问资格。");
    if (response.status === 404) throw new Error("没有找到这届比赛。");
    throw new Error("赛事暂时无法读取，请稍后重试。");
  }
  const parsed = snowTournamentResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("赛事数据未能正确读取，请重试。");
  return parsed.data;
}
