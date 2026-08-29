import { farmDoorplateSchema } from "@doorbell/protocol";
import { type FormEvent, useState } from "react";
import {
  type AuthIssue,
  createHumanProfile,
  type HumanIdentity,
  lookupFarm,
} from "../auth/auth-client";
import { AuthErrorNotice } from "./auth-error-notice";

interface AdditionalProfileFormProps {
  onCancel: () => void;
  onCreated: (identity: HumanIdentity) => void;
}

type FarmMode = "bind_existing" | "create_farm";
type FarmLookupState =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "error"; issue: AuthIssue }
  | { stage: "found"; doorplate: string; farmName: string };

export function AdditionalProfileForm({ onCancel, onCreated }: AdditionalProfileFormProps) {
  const [mode, setMode] = useState<FarmMode>("bind_existing");
  const [residentName, setResidentName] = useState("");
  const [homeName, setHomeName] = useState("");
  const [farmDoorplate, setFarmDoorplate] = useState("");
  const [farmHumanUrl, setFarmHumanUrl] = useState("");
  const [farmName, setFarmName] = useState("");
  const [aiName, setAiName] = useState("");
  const [farmLookup, setFarmLookup] = useState<FarmLookupState>({ stage: "idle" });
  const [farmConfirmed, setFarmConfirmed] = useState(false);
  const [issue, setIssue] = useState<AuthIssue | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{
    identity: HumanIdentity;
    farmName: string;
    farmHumanUrl: string;
  } | null>(null);

  async function handleFarmLookup() {
    setIssue(null);
    const parsed = farmDoorplateSchema.safeParse(farmDoorplate);
    if (!parsed.success) {
      setFarmLookup({ stage: "error", issue: { code: "invalid_request", serverMessage: null } });
      return;
    }
    setFarmLookup({ stage: "checking" });
    setFarmConfirmed(false);
    const result = await lookupFarm({ farm_doorplate: parsed.data });
    setFarmLookup(
      result.ok
        ? {
            stage: "found",
            doorplate: result.data.farm_doorplate,
            farmName: result.data.farm_name,
          }
        : { stage: "error", issue: result.issue },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssue(null);
    if (residentName.trim().length === 0 || homeName.trim().length === 0) {
      setIssue({ code: "invalid_request", serverMessage: null });
      return;
    }
    if (
      mode === "bind_existing" &&
      (farmLookup.stage !== "found" || !farmConfirmed || farmHumanUrl.length === 0)
    ) {
      setIssue({ code: "invalid_request", serverMessage: null });
      return;
    }
    if (mode === "create_farm" && (farmName.trim().length === 0 || aiName.trim().length === 0)) {
      setIssue({ code: "invalid_request", serverMessage: null });
      return;
    }
    setPending(true);
    const result = await createHumanProfile(
      mode === "bind_existing"
        ? {
            resident_name: residentName,
            home_name: homeName,
            farm_doorplate: farmLookup.stage === "found" ? farmLookup.doorplate : farmDoorplate,
            farm_human_url: farmHumanUrl,
            confirmed_farm_name: farmLookup.stage === "found" ? farmLookup.farmName : "",
          }
        : {
            resident_name: residentName,
            home_name: homeName,
            farm_name: farmName,
            ai_name: aiName,
          },
    );
    setPending(false);
    if (!result.ok) {
      setIssue(result.issue);
      return;
    }
    if (result.createdFarm) {
      setCreated({
        identity: result.identity,
        farmName: result.createdFarm.farm_name,
        farmHumanUrl: result.createdFarm.farm_human_url,
      });
      return;
    }
    onCreated(result.identity);
  }

  if (created) {
    return (
      <section className="registration-form registration-form--profile profile-created-delivery">
        <h2>新档案已经建立</h2>
        <p>{created.farmName} 的 Human URL 只在这里显示一次，请立即保存。</p>
        <code>{created.farmHumanUrl}</code>
        <button
          className="primary-action"
          onClick={() => onCreated(created.identity)}
          type="button"
        >
          进入这个档案
        </button>
      </section>
    );
  }

  return (
    <form className="registration-form registration-form--profile" onSubmit={handleSubmit}>
      <header className="additional-profile-heading">
        <h2>添加小机档案</h2>
        <p>这份档案会拥有自己独立的家园与农场。</p>
      </header>
      <div className="registration-profile-mode">
        <button
          aria-pressed={mode === "bind_existing"}
          className="registration-mode-action"
          onClick={() => setMode("bind_existing")}
          type="button"
        >
          绑定现有农场
        </button>
        <button
          aria-pressed={mode === "create_farm"}
          className="registration-mode-action"
          onClick={() => setMode("create_farm")}
          type="button"
        >
          创建新农场
        </button>
      </div>
      <div className="field-stack profile-field-stack">
        <label className="form-field">
          <span className="form-field__label">RESIDENT NAME / 人类名字</span>
          <input
            required
            value={residentName}
            onChange={(event) => setResidentName(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">HOUSE NAME / 家园名字</span>
          <input required value={homeName} onChange={(event) => setHomeName(event.target.value)} />
        </label>
        {mode === "bind_existing" ? (
          <>
            <label className="form-field">
              <span className="form-field__label">FARM NO. / 农场门牌号</span>
              <input
                pattern="[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}"
                required
                value={farmDoorplate}
                onChange={(event) => {
                  setFarmDoorplate(event.target.value);
                  setFarmLookup({ stage: "idle" });
                  setFarmConfirmed(false);
                }}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">HUMAN URL / 农场访问链接</span>
              <input
                autoComplete="off"
                required
                type="url"
                value={farmHumanUrl}
                onChange={(event) => setFarmHumanUrl(event.target.value)}
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
              <label className="confirmation-check">
                <input
                  checked={farmConfirmed}
                  onChange={(event) => setFarmConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>确认绑定“{farmLookup.farmName}”</span>
              </label>
            ) : null}
          </>
        ) : (
          <>
            <label className="form-field">
              <span className="form-field__label">FARM NAME / 农场名字</span>
              <input
                required
                value={farmName}
                onChange={(event) => setFarmName(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">AI NAME / 小机名字</span>
              <input required value={aiName} onChange={(event) => setAiName(event.target.value)} />
            </label>
          </>
        )}
      </div>
      <AuthErrorNotice issue={issue} />
      <div className="form-actions">
        <button className="text-action" onClick={onCancel} type="button">
          返回设置
        </button>
        <button className="primary-action" disabled={pending} type="submit">
          建立档案
        </button>
      </div>
    </form>
  );
}
