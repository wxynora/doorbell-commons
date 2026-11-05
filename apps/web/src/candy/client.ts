export interface CandyEatCommand {
  op: "eat";
  args: { candyId: string; target: "self" | "other" };
  requestId: string;
}

export type CandyCommand = CandyEatCommand | { op: "view"; args: Record<string, never> };

const messages: Record<string, string> = {
  authentication_required: "登录状态已失效，请重新登录后再打开糖果背包。",
  registration_profile_required: "当前账号还没有绑定农场入住资料，需要先完成入住绑定。",
  qq_not_group_member: "当前 QQ 群成员资格已失效，农场访问已停止；恢复群成员资格后再重新登录。",
  onebot_unavailable: "现在无法核验 QQ 群成员资格，稍后再试。",
  candy_unavailable: "这颗糖已经不在背包里啦，刷新看看。",
};
const uncertainCodes = new Set(["service_unavailable", "upstream_contract_unavailable", "wallet_receipt_unavailable", "payment_unconfirmed"]);

export function candyEatCommand(candyId: string, target: "self" | "other"): CandyEatCommand {
  return { op: "eat", args: { candyId, target }, requestId: crypto.randomUUID() };
}

export class CandyApiError extends Error {
  readonly code: string;
  readonly uncertain: boolean;

  constructor(code: string) {
    const uncertain = uncertainCodes.has(code);
    super(uncertain ? "小幽灵没带回回信。点「再问一次」确认刚才的结果。" : messages[code] ?? "这次没办成，请刷新看看再试。");
    this.code = code;
    this.uncertain = uncertain;
  }
}

export async function sendCandyCommand<T>(payload: CandyCommand, options: { signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/lingye/halloween", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch {
    throw Object.assign(new Error("小幽灵没带回回信。点「再问一次」确认刚才的结果。"), { uncertain: true });
  }

  let receipt: { ok?: boolean; data?: T; error?: { code?: string } };
  try {
    receipt = await response.json() as { ok?: boolean; data?: T; error?: { code?: string } };
  } catch {
    throw Object.assign(new Error("回信没读完整，点「再问一次」确认结果。"), { uncertain: true });
  }
  if (receipt.ok !== true) throw new CandyApiError(receipt.error?.code ?? "request_failed");
  return receipt.data as T;
}
