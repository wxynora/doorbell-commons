import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import {
  type FarmSettingsActionInput,
  type FarmSettingsActionIssue,
  farmSettingsActionIssueMessage,
} from "../../../auth/farm-settings-action-client";
import type { FarmSettingsActionExecutor, FarmSettingsDraft } from "./types";

interface FarmSettingsActionAttempt {
  input: FarmSettingsActionInput;
  label: string;
}

type FarmSettingsActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: FarmSettingsActionAttempt }
  | { stage: "success"; message: string }
  | {
      stage: "error";
      attempt: FarmSettingsActionAttempt | null;
      issue: FarmSettingsActionIssue;
    };

function shouldRetryFarmSettingsAction(issue: FarmSettingsActionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

function fitWelcomeMessageHeight(textarea: HTMLTextAreaElement): void {
  if (textarea.clientWidth <= 0) return;
  textarea.style.height = "auto";
  const borderBoxHeight = Math.max(0, textarea.offsetHeight - textarea.clientHeight);
  textarea.style.height = `${textarea.scrollHeight + borderBoxHeight}px`;
}

export function FarmSettingsPanelContent({
  availableTitles = [],
  baseline,
  catalogRevision,
  draft,
  editable,
  onChange,
  onSave,
}: {
  availableTitles?: readonly { id: string; name: string }[];
  baseline?: FarmSettingsDraft | undefined;
  catalogRevision?: string | undefined;
  draft: FarmSettingsDraft;
  editable: boolean;
  onChange: (draft: FarmSettingsDraft) => void;
  onSave?: FarmSettingsActionExecutor | undefined;
}) {
  const [actionState, setActionState] = useState<FarmSettingsActionState>({ stage: "idle" });
  const welcomeMessageRef = useRef<HTMLTextAreaElement>(null);
  const busy = actionState.stage === "submitting";
  const liveEditable = editable && Boolean(onSave && catalogRevision);

  useLayoutEffect(() => {
    const textarea = welcomeMessageRef.current;
    if (!textarea || textarea.value !== draft.welcomeMessage) return;
    fitWelcomeMessageHeight(textarea);
  }, [draft.welcomeMessage]);

  useEffect(() => {
    const resize = () => {
      const textarea = welcomeMessageRef.current;
      if (textarea) fitWelcomeMessageHeight(textarea);
    };
    const textarea = welcomeMessageRef.current;
    let observedWidth = textarea?.clientWidth ?? 0;
    const observer =
      textarea && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(([entry]) => {
            const width = entry?.contentRect.width ?? 0;
            if (width <= 0 || width === observedWidth) return;
            observedWidth = width;
            fitWelcomeMessageHeight(textarea);
          })
        : null;
    if (textarea && observer) observer.observe(textarea);
    window.addEventListener("resize", resize);
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) resize();
    });
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const submitSetting = async (
    field: FarmSettingsActionInput["field"],
    value: FarmSettingsActionInput["value"],
    label: string,
    retryAttempt?: FarmSettingsActionAttempt,
  ) => {
    if (!onSave || !catalogRevision) return;
    const attempt =
      retryAttempt ??
      ({
        input: {
          expectedCatalogRevision: catalogRevision,
          field,
          idempotencyKey: crypto.randomUUID(),
          value,
        },
        label,
      } satisfies FarmSettingsActionAttempt);
    setActionState({ stage: "submitting", attempt });
    const result = await onSave(attempt.input);
    if (result.ok) {
      const settings = result.data.data.resource.settings;
      if (settings.status === "available") onChange(farmSettingsDraftFromCatalog(settings));
      setActionState({ stage: "success", message: `${label}已保存` });
      return;
    }
    setActionState({
      stage: "error",
      attempt: shouldRetryFarmSettingsAction(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  return (
    <form
      aria-label="设置内容"
      className="farm-settings"
      onSubmit={(event) => event.preventDefault()}
    >
      {actionState.stage === "success" ? (
        <p className="farm-settings__status" role="status">
          {actionState.message}
        </p>
      ) : actionState.stage === "error" ? (
        <p className="farm-settings__status farm-settings__status--error" role="alert">
          <span>{farmSettingsActionIssueMessage(actionState.issue)}</span>
          {actionState.attempt ? (
            <button
              disabled={busy}
              onClick={() => {
                const attempt = actionState.attempt;
                if (attempt) {
                  void submitSetting(
                    attempt.input.field,
                    attempt.input.value,
                    attempt.label,
                    attempt,
                  );
                }
              }}
              type="button"
            >
              重试
            </button>
          ) : null}
        </p>
      ) : null}
      <fieldset className="farm-settings__group">
        <legend>农场名和称呼</legend>
        <div className="farm-settings__item">
          <label htmlFor="farm-name">农场名</label>
          <div className="farm-settings__control">
            <input
              disabled={!editable || busy}
              id="farm-name"
              maxLength={12}
              name="farm-name"
              onChange={(event) => onChange({ ...draft, farmName: event.currentTarget.value })}
              type="text"
              value={draft.farmName}
            />
            {onSave ? (
              <button
                className="farm-settings__save"
                disabled={
                  !liveEditable ||
                  busy ||
                  !draft.farmName.trim() ||
                  draft.farmName === baseline?.farmName
                }
                onClick={() => void submitSetting("farm_name", draft.farmName, "农场名")}
                type="button"
              >
                保存
              </button>
            ) : null}
          </div>
        </div>
        <div className="farm-settings__item">
          <label htmlFor="ai-nickname">小机昵称</label>
          <div className="farm-settings__control">
            <input
              disabled={!editable || busy}
              id="ai-nickname"
              maxLength={12}
              name="ai-nickname"
              onChange={(event) => onChange({ ...draft, aiNickname: event.currentTarget.value })}
              type="text"
              value={draft.aiNickname}
            />
            {onSave ? (
              <button
                className="farm-settings__save"
                disabled={!liveEditable || busy || draft.aiNickname === baseline?.aiNickname}
                onClick={() => void submitSetting("ai_name", draft.aiNickname, "小机昵称")}
                type="button"
              >
                保存
              </button>
            ) : null}
          </div>
        </div>
        <div className="farm-settings__item">
          <label htmlFor="human-nickname">你的昵称</label>
          <div className="farm-settings__control">
            <input
              disabled={!editable || busy}
              id="human-nickname"
              maxLength={12}
              name="human-nickname"
              onChange={(event) => onChange({ ...draft, humanNickname: event.currentTarget.value })}
              type="text"
              value={draft.humanNickname}
            />
            {onSave ? (
              <button
                className="farm-settings__save"
                disabled={!liveEditable || busy || draft.humanNickname === baseline?.humanNickname}
                onClick={() => void submitSetting("human_name", draft.humanNickname, "你的昵称")}
                type="button"
              >
                保存
              </button>
            ) : null}
          </div>
        </div>
      </fieldset>
      <div className="farm-settings__item farm-settings__item--welcome">
        <label htmlFor="welcome-message">欢迎语</label>
        <div className="farm-settings__control">
          <textarea
            disabled={!editable || busy}
            id="welcome-message"
            maxLength={60}
            name="welcome-message"
            onChange={(event) => {
              fitWelcomeMessageHeight(event.currentTarget);
              onChange({ ...draft, welcomeMessage: event.currentTarget.value });
            }}
            ref={welcomeMessageRef}
            rows={2}
            value={draft.welcomeMessage}
          />
          {onSave ? (
            <button
              className="farm-settings__save"
              disabled={
                !liveEditable ||
                busy ||
                !draft.welcomeMessage.trim() ||
                draft.welcomeMessage === baseline?.welcomeMessage
              }
              onClick={() => void submitSetting("welcome_message", draft.welcomeMessage, "欢迎语")}
              type="button"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
      <div className="farm-settings__item">
        <label htmlFor="active-title">佩戴称号</label>
        <div className="farm-settings__control">
          <select
            disabled={!editable || busy}
            id="active-title"
            name="active-title"
            onChange={(event) => onChange({ ...draft, activeTitle: event.currentTarget.value })}
            value={draft.activeTitle}
          >
            <option value="" />
            {availableTitles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.name}
              </option>
            ))}
          </select>
          {onSave ? (
            <button
              className="farm-settings__save"
              disabled={!liveEditable || busy || draft.activeTitle === baseline?.activeTitle}
              onClick={() =>
                void submitSetting("equip_title", draft.activeTitle || null, "佩戴称号")
              }
              type="button"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
      <fieldset className="farm-settings__group">
        <legend>社交开关</legend>
        <FarmSettingsSwitch
          editable={editable && !busy}
          label="来访"
          offLabel="谢绝来访"
          onChange={(visitsAllowed) => {
            if (liveEditable) void submitSetting("social.visit", visitsAllowed, "来访开关");
            else onChange({ ...draft, visitsAllowed });
          }}
          onLabel="访问"
          value={draft.visitsAllowed}
        />
        <FarmSettingsSwitch
          editable={editable && !busy}
          label="偷菜"
          onChange={(theftAllowed) => {
            if (liveEditable) void submitSetting("social.steal", theftAllowed, "偷菜开关");
            else onChange({ ...draft, theftAllowed });
          }}
          value={draft.theftAllowed}
        />
        <FarmSettingsSwitch
          editable={editable && !busy}
          label="帮浇水"
          onChange={(wateringHelpAllowed) => {
            if (liveEditable) void submitSetting("social.water", wateringHelpAllowed, "帮浇水开关");
            else onChange({ ...draft, wateringHelpAllowed });
          }}
          value={draft.wateringHelpAllowed}
        />
        <FarmSettingsSwitch
          editable={editable && !busy}
          label="留言"
          onChange={(messagesAllowed) => {
            if (liveEditable) void submitSetting("social.message", messagesAllowed, "留言开关");
            else onChange({ ...draft, messagesAllowed });
          }}
          value={draft.messagesAllowed}
        />
      </fieldset>
    </form>
  );
}

export function farmSettingsDraftFromCatalog(
  settings: Extract<BoundFarmCatalogRead["data"]["settings"], { status: "available" }>,
): FarmSettingsDraft {
  return {
    activeTitle:
      settings.equipped_title?.identity_state === "known" ? settings.equipped_title.title_id : "",
    aiNickname: settings.ai_name ?? "",
    farmName: settings.farm_name,
    humanNickname: settings.human_name ?? "",
    messagesAllowed: settings.social.message,
    theftAllowed: settings.social.steal,
    visitsAllowed: settings.social.visit,
    wateringHelpAllowed: settings.social.water,
    welcomeMessage: settings.welcome_message ?? "",
  };
}

function FarmSettingsSwitch({
  editable,
  label,
  offLabel = "关闭",
  onChange,
  onLabel = "允许",
  value,
}: {
  editable: boolean;
  label: string;
  offLabel?: string;
  onChange: (value: boolean) => void;
  onLabel?: string;
  value: boolean | null;
}) {
  const stateLabel = value === null ? "未设置" : value ? onLabel : offLabel;
  const visualState = value === true ? "on" : "off";
  return (
    <div className="farm-settings__item">
      <span>{label}</span>
      <button
        aria-checked={value === true}
        aria-label={`${label}：${stateLabel}`}
        className="farm-settings__switch"
        data-state={visualState}
        disabled={!editable}
        onClick={() => onChange(value !== true)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="farm-settings__switch-track">
          <span className="farm-settings__switch-thumb" />
        </span>
      </button>
    </div>
  );
}
