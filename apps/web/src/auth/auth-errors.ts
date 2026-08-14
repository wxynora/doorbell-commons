import type { AuthIssue, AuthIssueCode } from "./auth-client";

export const AUTH_ISSUE_MESSAGES: Readonly<Partial<Record<AuthIssueCode, string>>> = {
  invalid_request: "提交内容不符合当前注册合同，请检查各项内容后再提交。",
  invalid_credentials: "QQ号或密码不正确。",
  invalid_registration_code: "这个注册码不是当前有效码，请核对群内的当前注册码。",
  account_already_registered: "这个 QQ 账号已经注册，请使用密码登录。",
  qq_not_group_member: "这个 QQ 号不是当前社区群成员，暂时不能进入社区。",
  onebot_unavailable: "QQ 群成员核验服务当前不可用，身份尚未完成核验。",
  authentication_required: "当前没有有效的登录会话。",
  farm_not_found: "没有查到这个农场门牌。",
  farm_unavailable: "农场服务当前不可用，农场查询尚未完成。",
  farm_confirmation_mismatch: "农场名称已经变化或与刚才确认的结果不一致，请重新查询。",
  invalid_farm_human_url: "这不是有效的农场 Human URL，请复制完整链接后重新输入。",
  invalid_farm_human_key: "农场访问密钥无效，请核对后重新输入。",
  farm_human_key_mismatch: "这个农场访问密钥不属于已确认的农场门牌。",
  upstream_contract_unavailable: "农场服务返回的页面不符合当前接入合同，暂时不能完成注册。",
  registration_profile_required: "这份账号还需要补齐居民、家庭和农场资料。",
  registration_profile_mismatch: "提交的居民、家庭或农场资料与已有登记不一致。",
  farm_already_bound: "这个农场门牌已经绑定到另一个账号。",
  invalid_password: "密码需为 8–128 个字符。",
  password_confirmation_mismatch: "两次输入的密码不一致。",
  network_unavailable: "当前无法连接 Doorbell 服务，请检查服务是否已经启动。",
  unexpected_response: "Doorbell 返回了当前前端无法识别的响应。",
};

export function authIssueMessage(issue: AuthIssue): string {
  return (
    AUTH_ISSUE_MESSAGES[issue.code] ??
    issue.serverMessage ??
    "Doorbell 返回了当前前端无法识别的响应。"
  );
}
