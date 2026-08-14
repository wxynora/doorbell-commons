import { farmDoorplateSchema } from "@doorbell/protocol";
import { type FormEvent, useState } from "react";
import {
  type AuthIssue,
  createHumanSession,
  type HumanIdentity,
  lookupFarm,
} from "../auth/auth-client";
import { AuthErrorNotice } from "./auth-error-notice";
import type { FirstRegistrationCredentials } from "./registration-entry";

interface RegistrationProfileFormProps {
  credentials: FirstRegistrationCredentials;
  onBack: () => void;
  onRegistered: (identity: HumanIdentity) => void;
}

type FarmLookupState =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "error"; issue: AuthIssue }
  | { stage: "found"; doorplate: string; farmName: string };

const FARM_RECHECK_CODES = new Set(["farm_not_found", "farm_confirmation_mismatch"]);

export function RegistrationProfileForm({
  credentials,
  onBack,
  onRegistered,
}: RegistrationProfileFormProps) {
  const [residentName, setResidentName] = useState("");
  const [homeName, setHomeName] = useState("");
  const [farmDoorplate, setFarmDoorplate] = useState("");
  const [farmHumanUrl, setFarmHumanUrl] = useState("");
  const [farmLookup, setFarmLookup] = useState<FarmLookupState>({ stage: "idle" });
  const [farmConfirmed, setFarmConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submissionIssue, setSubmissionIssue] = useState<AuthIssue | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeDoorplate(value: string) {
    setFarmDoorplate(value);
    setFarmLookup({ stage: "idle" });
    setFarmConfirmed(false);
    setSubmissionIssue(null);
  }

  async function handleFarmLookup() {
    setSubmissionIssue(null);
    const parsedDoorplate = farmDoorplateSchema.safeParse(farmDoorplate);
    if (!parsedDoorplate.success) {
      setFarmLookup({
        stage: "error",
        issue: { code: "invalid_request", serverMessage: null },
      });
      return;
    }

    setFarmLookup({ stage: "checking" });
    setFarmConfirmed(false);
    const result = await lookupFarm({ farm_doorplate: parsedDoorplate.data });
    if (!result.ok) {
      setFarmLookup({ stage: "error", issue: result.issue });
      return;
    }

    setFarmLookup({
      stage: "found",
      doorplate: result.data.farm_doorplate,
      farmName: result.data.farm_name,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionIssue(null);

    if (
      residentName.trim().length === 0 ||
      homeName.trim().length === 0 ||
      farmHumanUrl.length === 0
    ) {
      setSubmissionIssue({ code: "invalid_request", serverMessage: null });
      return;
    }
    if (farmLookup.stage !== "found" || !farmConfirmed) {
      setSubmissionIssue({ code: "invalid_request", serverMessage: null });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setSubmissionIssue({ code: "invalid_password", serverMessage: null });
      return;
    }
    if (password !== passwordConfirmation) {
      setSubmissionIssue({ code: "password_confirmation_mismatch", serverMessage: null });
      return;
    }

    setSubmitting(true);
    const result = await createHumanSession({
      qq_number: credentials.qqNumber,
      registration_code: credentials.registrationCode,
      password,
      resident_name: residentName,
      home_name: homeName,
      farm_doorplate: farmLookup.doorplate,
      farm_human_url: farmHumanUrl,
      confirmed_farm_name: farmLookup.farmName,
    });
    setSubmitting(false);

    if (result.ok) {
      setFarmHumanUrl("");
      onRegistered(result.identity);
      return;
    }

    setSubmissionIssue(result.issue);
    if (FARM_RECHECK_CODES.has(result.issue.code)) {
      setFarmLookup({ stage: "idle" });
      setFarmConfirmed(false);
    }
  }

  return (
    <form className="registration-form registration-form--profile" onSubmit={handleSubmit}>
      <div className="field-stack profile-field-stack">
        <label className="form-field" htmlFor="resident-name">
          <span className="form-field__label">RESIDENT NAME / 居民名字</span>
          <input
            id="resident-name"
            name="resident_name"
            onChange={(event) => {
              setResidentName(event.target.value);
              setSubmissionIssue(null);
            }}
            required
            type="text"
            value={residentName}
          />
        </label>
        <label className="form-field" htmlFor="home-name">
          <span className="form-field__label">HOUSE NAME / 家园名字</span>
          <input
            id="home-name"
            name="home_name"
            onChange={(event) => {
              setHomeName(event.target.value);
              setSubmissionIssue(null);
            }}
            required
            type="text"
            value={homeName}
          />
        </label>
        <label className="form-field" htmlFor="farm-doorplate">
          <span className="form-field__label">FARM NO. / 农场门牌号</span>
          <input
            id="farm-doorplate"
            name="farm_doorplate"
            onChange={(event) => changeDoorplate(event.target.value)}
            pattern="[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}"
            required
            spellCheck={false}
            type="text"
            value={farmDoorplate}
          />
        </label>
        <label className="form-field" htmlFor="farm-human-url">
          <span className="form-field__label">HUMAN URL / 农场访问链接</span>
          <input
            autoComplete="off"
            id="farm-human-url"
            name="farm_human_url"
            onChange={(event) => {
              setFarmHumanUrl(event.target.value);
              setSubmissionIssue(null);
            }}
            required
            spellCheck={false}
            type="url"
            value={farmHumanUrl}
          />
        </label>
        <button
          className="primary-action lookup-action"
          disabled={farmLookup.stage === "checking"}
          onClick={() => void handleFarmLookup()}
          type="button"
        >
          查询真实农场
        </button>

        {farmLookup.stage === "error" ? <AuthErrorNotice issue={farmLookup.issue} /> : null}

        {farmLookup.stage === "found" ? (
          <div className="farm-confirmation">
            <div>
              <span className="farm-confirmation__label">FARM NAME / 农场名称</span>
              <strong>{farmLookup.farmName}</strong>
              <small>门牌 {farmLookup.doorplate}</small>
            </div>
            <label className="confirmation-check" htmlFor="confirm-farm">
              <input
                checked={farmConfirmed}
                id="confirm-farm"
                onChange={(event) => {
                  setFarmConfirmed(event.target.checked);
                  setSubmissionIssue(null);
                }}
                type="checkbox"
              />
              <span>就是这个农场</span>
            </label>
          </div>
        ) : null}
        <label className="form-field" htmlFor="new-human-password">
          <span className="form-field__label">PASSWORD / 设置登录密码</span>
          <input
            autoComplete="new-password"
            id="new-human-password"
            maxLength={128}
            minLength={8}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              setSubmissionIssue(null);
            }}
            required
            type="password"
            value={password}
          />
        </label>
        <label className="form-field" htmlFor="confirm-human-password">
          <span className="form-field__label">CONFIRM PASSWORD / 再输入一次</span>
          <input
            autoComplete="new-password"
            id="confirm-human-password"
            maxLength={128}
            minLength={8}
            name="password_confirmation"
            onChange={(event) => {
              setPasswordConfirmation(event.target.value);
              setSubmissionIssue(null);
            }}
            required
            type="password"
            value={passwordConfirmation}
          />
        </label>
      </div>

      <AuthErrorNotice issue={submissionIssue} />

      <div className="form-actions">
        <button className="text-action" onClick={onBack} type="button">
          返回
        </button>
        <button className="primary-action" disabled={submitting} type="submit">
          确认入住
        </button>
      </div>
    </form>
  );
}
