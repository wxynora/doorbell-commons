import type { SnowTournamentEdition } from "../../../../packages/protocol/src/snow-tournament";

export type TournamentMatch = SnowTournamentEdition["matches"][number];
export type TournamentTeam = SnowTournamentEdition["teams"][number];
export const phaseNames: Record<SnowTournamentEdition["phase"], string> = {
  registration: "个人报名中",
  team_formation:"自由组队中",
  round_robin: "混打进行中",
  knockout: "淘汰赛进行中",
  completed: "本届已落幕",
  cancelled: "本届已取消",
};
export const matchStatusNames: Record<TournamentMatch["status"], string> = {
  scheduled: "待开赛", in_progress: "进行中", completed: "已结束",
  forfeit: "弃权判定", cancelled: "已取消",
};
export function teamName(edition: SnowTournamentEdition, id: string | null): string {
  return edition.teams.find((team) => team.id === id)?.name ?? "待晋级";
}
export function matchTeams(edition: SnowTournamentEdition, match: TournamentMatch): [string, string] {
  return [teamName(edition, match.teamAId), teamName(edition, match.teamBId)];
}
export function stageName(match: TournamentMatch): string {
  return match.stage === "round_robin" ? `混打 · 第${match.round}轮`
    : match.stage === "semifinal" ? "半决赛" : "决赛";
}
export function beijingDate(value: string | null, includeTime = false): string {
  if (!value) return "时间待公布";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "long", day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).format(new Date(value));
}
export function beijingDay(value: string | null): string {
  if (!value) return "未定";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}
export function beijingTime(value: string | null): string {
  if (!value) return "待定";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
}
export function groupedSchedule(matches: TournamentMatch[]) {
  const groups = new Map<string, TournamentMatch[]>();
  for (const match of [...matches].sort((a, b) =>
    (a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity) - (b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity) || a.round - b.round,
  )) {
    const day = beijingDay(match.scheduledAt);
    groups.set(day, [...(groups.get(day) ?? []), match]);
  }
  return [...groups.entries()];
}
