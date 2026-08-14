import type { AuthIssue } from "../auth/auth-client";
import { authIssueMessage } from "../auth/auth-errors";

interface AuthErrorNoticeProps {
  issue: AuthIssue | null;
}

export function AuthErrorNotice({ issue }: AuthErrorNoticeProps) {
  if (!issue) {
    return null;
  }

  return (
    <div className="auth-error" role="alert">
      <span className="auth-error__mark" aria-hidden="true">
        !
      </span>
      <p>{authIssueMessage(issue)}</p>
    </div>
  );
}
