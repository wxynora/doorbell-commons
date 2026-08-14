import type { McpAccessStatusResponse, McpCredentialIssueResponse } from "@doorbell/protocol";
import { useEffect, useState } from "react";
import {
  claimMcpAccess,
  getMcpAccessStatus,
  issueMcpCredential,
  type McpAccessIssue,
  revokeMcpCredential,
} from "../auth/auth-client";

type Confirmation = "claim" | "replace" | "revoke";
type PendingAction = "claim" | "issue" | "revoke" | null;

interface McpAccessPageProps {
  onComplete: () => void;
}

const MCP_ACCESS_ISSUE_MESSAGES: Record<McpAccessIssue["code"], string> = {
  invalid_request: "这次请求没有通过校验，请刷新页面后重试。",
  authentication_required: "登录状态已经失效，请重新登录。",
  qq_not_group_member: "当前 QQ 已不在社区群中，暂时不能领取连接。",
  method_not_allowed: "领取接口不接受这个操作。",
  registration_profile_required: "请先完成居民、家园和农场绑定。",
  farm_credential_invalid: "已绑定的农场访问凭据不再有效。",
  farm_binding_mismatch: "当前农场绑定与登记门牌不一致。",
  farm_migration_conflict: "这户农场已经由另一项迁移处理，请联系维护者核对。",
  migration_not_confirmed: "旧农场连接尚未确认停用，请继续完成迁移。",
  upstream_contract_unavailable: "农场回执暂时无法核验，请稍后重试。",
  farm_unavailable: "农场迁移服务暂时不可用，请稍后继续。",
  mcp_runtime_unavailable: "Doorbell 新连接还没有开放领取。",
  membership_verification_unavailable: "暂时无法核验 QQ 群资格，请稍后重试。",
  mcp_credential_not_configured: "当前没有可撤销的 Doorbell 连接。",
  internal_contract_error: "这次迁移没有安全完成，请联系维护者核对。",
  network_unavailable: "网络没有连上，请稍后重试。",
  unexpected_response: "服务返回了无法识别的结果，请稍后重试。",
};

function statusAfterIssue(
  status: McpAccessStatusResponse,
  issued: McpCredentialIssueResponse,
): McpAccessStatusResponse {
  return {
    ...status,
    credential_status: "active",
    credential_id: issued.credential_id,
    credential_issued_at: issued.credential_issued_at,
    credential_revoked_at: null,
  };
}

export function McpAccessPage({ onComplete }: McpAccessPageProps) {
  const [status, setStatus] = useState<McpAccessStatusResponse | null>(null);
  const [delivery, setDelivery] = useState<McpCredentialIssueResponse | null>(null);
  const [issue, setIssue] = useState<McpAccessIssue | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getMcpAccessStatus({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      if (result.ok) {
        setStatus(result.data);
        return;
      }
      setIssue(result.issue);
    });
    return () => controller.abort();
  }, []);

  const refreshAfterFailure = async () => {
    const result = await getMcpAccessStatus();
    if (result.ok) {
      setStatus(result.data);
    }
  };

  const issueCredential = async (baseStatus: McpAccessStatusResponse) => {
    setPending("issue");
    setIssue(null);
    const result = await issueMcpCredential();
    if (!result.ok) {
      setIssue(result.issue);
      setPending(null);
      return;
    }
    setDelivery(result.data);
    setStatus(statusAfterIssue(baseStatus, result.data));
    setConfirmation(null);
    setPending(null);
  };

  const claimAndIssue = async () => {
    setPending("claim");
    setIssue(null);
    const result = await claimMcpAccess();
    if (!result.ok) {
      setIssue(result.issue);
      setPending(null);
      await refreshAfterFailure();
      return;
    }
    setStatus(result.data);
    setConfirmation(null);
    await issueCredential(result.data);
  };

  const revoke = async () => {
    setPending("revoke");
    setIssue(null);
    const result = await revokeMcpCredential();
    if (!result.ok) {
      setIssue(result.issue);
      setPending(null);
      return;
    }
    setDelivery(null);
    setStatus(result.data);
    setConfirmation(null);
    setPending(null);
  };

  const copyValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label}已复制`);
    } catch {
      setCopyNotice("复制失败，请手动选择并复制");
    }
  };

  const busy = pending !== null;
  const activeWithoutPlaintext = status?.credential_status === "active" && !delivery;
  const canIssue =
    status?.migration_status === "farm_revoked" && status.credential_status !== "active";

  return (
    <div className="mcp-access-page">
      <main className="mcp-access-page__main">
        <header className="mcp-access__header">
          <button className="mcp-access-page__back" onClick={onComplete} type="button">
            返回
          </button>
          <div>
            <p className="mcp-access__eyebrow">DOORBELL · MCP</p>
            <h1>领取小机连接</h1>
          </div>
        </header>

        <div className="mcp-access__body">
            {!status && !issue ? (
              <p className="mcp-access__quiet">正在核对这户的连接状态…</p>
            ) : null}

            {status?.migration_status === "not_started" ? (
              <section className="mcp-access__section">
                <p>
                  领取后，你的小机将只使用一个 doorbell
                  工具进入公共农场，以及以后真正开放的社区和铃野地点。确认切换会立即停用这户农场原来的
                  farm 小机连接，不能恢复；农场进度和人类页面不会改变。
                </p>
                <button
                  className="mcp-access__primary"
                  disabled={busy}
                  onClick={() => setConfirmation("claim")}
                  type="button"
                >
                  停用旧连接并领取
                </button>
              </section>
            ) : null}

            {status?.migration_status === "pending_farm_revocation" ? (
              <section className="mcp-access__section">
                <p>正在确认旧农场连接已经失效。关闭页面不会取消；回来后可以继续。</p>
                <button
                  className="mcp-access__primary"
                  disabled={busy}
                  onClick={() => void claimAndIssue()}
                  type="button"
                >
                  {pending === "claim" ? "正在继续…" : "继续确认并领取"}
                </button>
              </section>
            ) : null}

            {delivery ? (
              <section className="mcp-access__delivery">
                <p className="mcp-access__one-time">仅显示这一次</p>
                <p>
                  新凭据只显示这一次。请立即保存 MCP 地址和凭据，替换小机客户端中的旧 farm
                  连接，然后重新连接。旧 farm 连接已经失效。
                </p>
                <label>
                  MCP 地址
                  <span className="mcp-access__copy-row">
                    <input readOnly value={delivery.mcp_endpoint} />
                    <button
                      onClick={() => void copyValue("MCP 地址", delivery.mcp_endpoint)}
                      type="button"
                    >
                      复制
                    </button>
                  </span>
                </label>
                <label>
                  Bearer 凭据
                  <span className="mcp-access__copy-row">
                    <input readOnly value={delivery.mcp_credential} />
                    <button
                      onClick={() => void copyValue("凭据", delivery.mcp_credential)}
                      type="button"
                    >
                      复制
                    </button>
                  </span>
                </label>
                <button
                  className="mcp-access__copy-all"
                  onClick={() =>
                    void copyValue(
                      "连接信息",
                      `MCP URL: ${delivery.mcp_endpoint}\nAuthorization: Bearer ${delivery.mcp_credential}`,
                    )
                  }
                  type="button"
                >
                  复制完整连接信息
                </button>
                <p aria-live="polite" className="mcp-access__copy-notice">
                  {copyNotice}
                </p>
              </section>
            ) : null}

            {activeWithoutPlaintext ? (
              <section className="mcp-access__section">
                <p className="mcp-access__status-line">
                  <span />
                  Doorbell 连接已启用
                </p>
                <p>
                  这条连接的明文凭据已经显示过，服务端无法再次查看。你可以撤销它并领取一条新的。
                </p>
                <div className="mcp-access__secondary-actions">
                  <button disabled={busy} onClick={() => setConfirmation("replace")} type="button">
                    重新领取
                  </button>
                  <button disabled={busy} onClick={() => setConfirmation("revoke")} type="button">
                    撤销连接
                  </button>
                </div>
              </section>
            ) : null}

            {canIssue && !delivery ? (
              <section className="mcp-access__section">
                <p>旧 farm 连接已经失效。现在可以领取新的 Doorbell 凭据；旧连接不会恢复。</p>
                <button
                  className="mcp-access__primary"
                  disabled={busy}
                  onClick={() => void issueCredential(status)}
                  type="button"
                >
                  {pending === "issue" ? "正在签发…" : "领取新凭据"}
                </button>
              </section>
            ) : null}

            {confirmation === "claim" ? (
              <section className="mcp-access__confirmation">
                <p>
                  确认切换后，原来的 farm MCP 和 /a
                  小机链接会立即失效，不能恢复。请确保你已经准备好替换小机客户端中的连接。
                </p>
                <div>
                  <button onClick={() => setConfirmation(null)} type="button">
                    再等等
                  </button>
                  <button disabled={busy} onClick={() => void claimAndIssue()} type="button">
                    {pending === "claim" || pending === "issue" ? "正在切换…" : "确认切换"}
                  </button>
                </div>
              </section>
            ) : null}

            {confirmation === "replace" && status ? (
              <section className="mcp-access__confirmation">
                <p>重新领取会立即停用当前 Doorbell 连接。</p>
                <div>
                  <button onClick={() => setConfirmation(null)} type="button">
                    取消
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void issueCredential(status)}
                    type="button"
                  >
                    {pending === "issue" ? "正在签发…" : "停用并重新领取"}
                  </button>
                </div>
              </section>
            ) : null}

            {confirmation === "revoke" ? (
              <section className="mcp-access__confirmation">
                <p>撤销后，小机将无法连接 Doorbell；旧 farm 连接不会恢复。</p>
                <div>
                  <button onClick={() => setConfirmation(null)} type="button">
                    取消
                  </button>
                  <button disabled={busy} onClick={() => void revoke()} type="button">
                    {pending === "revoke" ? "正在撤销…" : "确认撤销"}
                  </button>
                </div>
              </section>
            ) : null}

            {issue ? (
              <p aria-live="polite" className="mcp-access__error">
                {MCP_ACCESS_ISSUE_MESSAGES[issue.code]}
              </p>
            ) : null}

            {status ? (
              <footer className="mcp-access__footer">
                <span>固定地址</span>
                <code>{status.mcp_endpoint}</code>
              </footer>
            ) : null}
        </div>
      </main>
    </div>
  );
}
