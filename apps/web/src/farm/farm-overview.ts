import type { BoundFarmField, FarmFieldIssue, FarmHarvestAssistIssue } from "../auth/auth-client";

export type FarmPlot = BoundFarmField["data"]["plots"][number];

export interface FarmPlotSummary {
  empty: number;
  growing: number;
  ripe: number;
}

export function summarizeFarmPlots(plots: readonly FarmPlot[]): FarmPlotSummary {
  const summary: FarmPlotSummary = { empty: 0, growing: 0, ripe: 0 };
  for (const plot of plots) {
    summary[plot.state] += 1;
  }
  return summary;
}

export function farmPlotStateLabel(plot: FarmPlot): string {
  if (plot.state === "empty") {
    return "空闲";
  }
  if (plot.state === "ripe") {
    return "成熟";
  }
  return "生长中";
}

export function farmFieldIssueMessage(issue: FarmFieldIssue): string {
  const messages: Readonly<Partial<Record<FarmFieldIssue["code"], string>>> = {
    invalid_request: "农场读取请求不符合当前合同。",
    authentication_required: "登录状态已经失效，请返回社区重新登录。",
    qq_not_group_member: "当前 QQ 已不具备社区访问资格。",
    onebot_unavailable: "QQ 群资格核验服务暂时不可用。",
    registration_profile_required: "当前账号还没有完整的居民、家园和农场绑定。",
    farm_not_found: "当前绑定的农场已经不存在。",
    farm_credential_invalid: "当前账号保存的农场凭据已经失效，请重新确认农场绑定。",
    farm_unavailable: "农场服务暂时不可用，农场数据没有完成读取。",
    upstream_contract_unavailable: "农场返回的数据暂时无法由当前页面读取。",
    network_unavailable: "暂时无法连接 Doorbell 服务。",
    unexpected_response: "农场返回了当前页面无法识别的响应。",
  };
  return messages[issue.code] ?? issue.serverMessage ?? "农场数据暂时无法读取。";
}

export function farmHarvestAssistIssueMessage(issue: FarmHarvestAssistIssue): string {
  const messages: Readonly<Partial<Record<FarmHarvestAssistIssue["code"], string>>> = {
    harvest_assist_exhausted: "今天的帮收次数已经用完了。",
    no_ripe_plots: "现在没有成熟的作物可以帮收。",
    state_conflict: "农场状态已经变化，请重新读取后再试。",
    idempotency_conflict: "这次帮收请求已经失效，请重新读取后再试。",
    invalid_request: "帮收请求不符合当前合同。",
    authentication_required: "登录状态已经失效，请返回社区重新登录。",
    qq_not_group_member: "当前 QQ 已不具备社区访问资格。",
    onebot_unavailable: "QQ 群资格核验服务暂时不可用。",
    registration_profile_required: "当前账号还没有完整的居民、家园和农场绑定。",
    farm_not_found: "当前绑定的农场已经不存在。",
    farm_credential_invalid: "当前账号保存的农场凭据已经失效，请重新确认农场绑定。",
    farm_unavailable: "农场暂时没有确认这次帮收，可以用同一次请求重试。",
    upstream_contract_unavailable: "农场返回了当前页面无法确认的帮收结果。",
    network_unavailable: "连接中断，暂时无法确认这次帮收结果。",
    unexpected_response: "农场返回了当前页面无法识别的帮收结果。",
  };
  return messages[issue.code] ?? issue.serverMessage ?? "这次帮收暂时没有完成。";
}
