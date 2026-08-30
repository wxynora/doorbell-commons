import type { BellAccessStatusResponse, BellCredentialIssueResponse } from "@doorbell/protocol";
import { useEffect, useState } from "react";
import {
  type BellAccessIssue,
  getBellAccessStatus,
  issueBellCredential,
  revokeBellCredential,
} from "../auth/auth-client";

const ISSUE_MESSAGES: Record<BellAccessIssue["code"], string> = {
  authentication_required: "登录已经失效，请重新登录。",
  bell_credential_not_configured: "这套档案当前没有可撤销的铃凭据。",
  internal_contract_error: "暂时无法安全完成铃配置，请稍后重试。",
  invalid_request: "请求格式不正确，请刷新页面后重试。",
  membership_verification_unavailable: "暂时无法核验社区资格，请稍后重试。",
  method_not_allowed: "当前操作不可用，请刷新页面后重试。",
  network_unavailable: "暂时无法连接 Doorbell，请检查网络后重试。",
  qq_not_group_member: "当前社区资格已经失效。",
  registration_profile_required: "请先完成当前小机档案与农场绑定。",
  unexpected_response: "Doorbell 返回了无法识别的结果，请稍后重试。",
};

interface BellAccessPanelProps {
  onClose(): void;
}

function nextStatus(issued: BellCredentialIssueResponse): BellAccessStatusResponse {
  return {
    bell_endpoint: issued.bell_endpoint,
    authorization_scheme: issued.authorization_scheme,
    credential_status: "active",
    credential_id: issued.credential_id,
    credential_issued_at: issued.credential_issued_at,
    credential_revoked_at: null,
  };
}

export function BellAccessPanel({ onClose }: BellAccessPanelProps) {
  const [status, setStatus] = useState<BellAccessStatusResponse | null>(null);
  const [credential, setCredential] = useState<BellCredentialIssueResponse | null>(null);
  const [issue, setIssue] = useState<BellAccessIssue | null>(null);
  const [pending, setPending] = useState<"issue" | "revoke" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getBellAccessStatus({ signal: controller.signal }).then((result) => {
      if (result.ok) setStatus(result.data);
      else setIssue(result.issue);
    });
    return () => controller.abort();
  }, []);

  const issueCredential = async () => {
    if (
      status?.credential_status === "active" &&
      !window.confirm("重新领取会立即停用当前铃连接。")
    ) {
      return;
    }
    setIssue(null);
    setPending("issue");
    const result = await issueBellCredential();
    setPending(null);
    if (!result.ok) {
      setIssue(result.issue);
      return;
    }
    setCredential(result.data);
    setStatus(nextStatus(result.data));
  };

  const revokeCredential = async () => {
    if (!window.confirm("撤销后，当前家庭后端会立即断开铃。")) return;
    setIssue(null);
    setPending("revoke");
    const result = await revokeBellCredential();
    setPending(null);
    if (!result.ok) {
      setIssue(result.issue);
      return;
    }
    setCredential(null);
    setStatus(result.data);
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="bell-access">
      <main className="bell-access__page" aria-labelledby="bell-access-title">
        <button className="bell-access__back" type="button" onClick={onClose}>
          <span aria-hidden="true">←</span>
          设置
        </button>
        <header className="bell-access__heading">
          <p className="bell-access__kicker">Doorbell Commons</p>
          <h1 id="bell-access-title">配置铃</h1>
          <p className="bell-access__intro">
            为当前小机档案领取一条独立的铃连接。把下面的地址和凭据填进自己的家庭后端即可，不需要联系管理员。
          </p>
        </header>

        {!status && !issue ? (
          <p className="bell-access__notice bell-access__notice--loading">正在读取当前配置……</p>
        ) : null}
        {issue ? (
          <p className="bell-access__notice bell-access__notice--error">
            {ISSUE_MESSAGES[issue.code]}
          </p>
        ) : null}

        {status ? (
          <section className="bell-access__section" aria-labelledby="bell-access-connection-title">
            <div className="bell-access__section-heading">
              <div>
                <span>01</span>
                <h2 id="bell-access-connection-title">铃连接</h2>
              </div>
              <strong>
                {status.credential_status === "active"
                  ? "已领取"
                  : status.credential_status === "revoked"
                    ? "已撤销"
                    : "尚未领取"}
              </strong>
            </div>
            <div className="bell-access__content">
              <label className="bell-access__field">
                <span>铃连接地址</span>
                <div className="bell-access__copy-row">
                  <input readOnly value={status.bell_endpoint} />
                  <button type="button" onClick={() => void copy(status.bell_endpoint)}>
                    复制
                  </button>
                </div>
              </label>

              {credential ? (
                <div className="bell-access__credential">
                  <strong>新凭据只显示这一次</strong>
                  <p>请现在复制并保存。关闭后服务端无法再次查看明文。</p>
                  <div className="bell-access__copy-row">
                    <input readOnly value={credential.bell_credential} />
                    <button type="button" onClick={() => void copy(credential.bell_credential)}>
                      复制
                    </button>
                  </div>
                </div>
              ) : status.credential_status === "active" ? (
                <p className="bell-access__notice">
                  当前凭据仍有效，但明文不会再次显示；如果已经丢失，请重新领取。
                </p>
              ) : null}

              <div className="bell-access__actions">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void issueCredential()}
                >
                  {pending === "issue"
                    ? "正在领取……"
                    : status.credential_status === "active"
                      ? "重新领取"
                      : "领取铃凭据"}
                </button>
                {status.credential_status === "active" ? (
                  <button
                    className="bell-access__secondary"
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void revokeCredential()}
                  >
                    {pending === "revoke" ? "正在撤销……" : "撤销当前连接"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
