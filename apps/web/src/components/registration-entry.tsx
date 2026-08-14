import { type FormEvent, useState } from "react";
import type { AuthIssue } from "../auth/auth-client";
import { AuthErrorNotice } from "./auth-error-notice";

export interface ReturningHumanCredentials {
  mode: "login";
  password: string;
  qqNumber: string;
}

export interface FirstRegistrationCredentials {
  mode: "registration";
  qqNumber: string;
  registrationCode: string;
}

export type HumanCredentials = ReturningHumanCredentials | FirstRegistrationCredentials;

interface RegistrationEntryProps {
  issue: AuthIssue | null;
  pending: boolean;
  onModeChange: () => void;
  onSubmit: (credentials: HumanCredentials) => void;
}

export function RegistrationEntry({
  issue,
  pending,
  onModeChange,
  onSubmit,
}: RegistrationEntryProps) {
  const [qqNumber, setQqNumber] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<HumanCredentials["mode"]>("login");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(
      mode === "login"
        ? { mode, password, qqNumber }
        : { mode, qqNumber, registrationCode },
    );
  }

  return (
    <form className="registration-form" onSubmit={handleSubmit}>
      <AuthErrorNotice issue={issue} />

      <div className="field-stack">
        <label className="form-field" htmlFor="qq-number">
          <span className="form-field__label">QQ Account / QQ账号</span>
          <input
            autoComplete="username"
            id="qq-number"
            inputMode="numeric"
            name="qq_number"
            onChange={(event) => setQqNumber(event.target.value)}
            pattern="[1-9][0-9]*"
            required
            type="text"
            value={qqNumber}
          />
        </label>

        {mode === "login" ? (
          <label className="form-field" htmlFor="human-password">
            <span className="form-field__label">PASSWORD / 登录密码</span>
            <input
              autoComplete="current-password"
              id="human-password"
              maxLength={128}
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
        ) : (
          <label className="form-field" htmlFor="registration-code">
            <span className="form-field__label">24H Passcode / 注册码</span>
            <input
              autoComplete="off"
              id="registration-code"
              name="registration_code"
              onChange={(event) => setRegistrationCode(event.target.value)}
              pattern="DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}"
              required
              spellCheck={false}
              type="password"
              value={registrationCode}
            />
          </label>
        )}
      </div>

      <button className="registration-login-action" disabled={pending} type="submit">
        Log in
      </button>

      {mode === "login" ? (
        <button
          className="registration-mode-action registration-mode-action--first"
          disabled={pending}
          onClick={() => {
            setPassword("");
            onModeChange();
            setMode("registration");
          }}
          type="button"
        >
          First time here?
        </button>
      ) : (
        <>
          <p className="registration-form__note">首次入住会继续登记居民与家园资料。</p>
          <button
            className="registration-mode-action"
            disabled={pending}
            onClick={() => {
              setRegistrationCode("");
              onModeChange();
              setMode("login");
            }}
            type="button"
          >
            返回
          </button>
        </>
      )}
    </form>
  );
}
