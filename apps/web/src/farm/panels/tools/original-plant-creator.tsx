import { useState } from "react";
import {
  type BoundOriginalPlantAction,
  type OriginalPlantActionInput,
  type OriginalPlantActionIssue,
  originalPlantActionIssueMessage,
} from "../../../auth/original-plant-action-client";
import type { OriginalPlantActionExecutor, OriginalPlantDraft } from "./types";

export function OriginalPlantCreator({
  catalogRevision,
  draft,
  editable,
  onChange,
  onCreate,
}: {
  catalogRevision?: string | undefined;
  draft: OriginalPlantDraft;
  editable: boolean;
  onChange: (draft: OriginalPlantDraft) => void;
  onCreate?: OriginalPlantActionExecutor | undefined;
}) {
  type Attempt = OriginalPlantActionInput;
  type ActionState =
    | { stage: "idle" }
    | { stage: "submitting"; attempt: Attempt }
    | { stage: "error"; attempt: Attempt | null; issue: OriginalPlantActionIssue }
    | { stage: "success"; result: BoundOriginalPlantAction["data"]["result"] };

  const [action, setAction] = useState<ActionState>({ stage: "idle" });
  const retryableAttempt =
    action.stage === "error" && action.issue.code === "network_unavailable" ? action.attempt : null;
  const locked = action.stage === "submitting" || retryableAttempt !== null;
  const canSubmit =
    editable &&
    Boolean(onCreate && catalogRevision) &&
    draft.name.trim().length > 0 &&
    draft.description.trim().length > 0 &&
    !locked;

  const updateDraft = (next: OriginalPlantDraft) => {
    if (locked) return;
    setAction({ stage: "idle" });
    onChange(next);
  };

  const submit = async (retry?: Attempt) => {
    if (!onCreate || (!catalogRevision && !retry)) return;
    const attempt =
      retry ??
      ({
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: catalogRevision as string,
        name: draft.name,
        latin: draft.latinName,
        desc: draft.description,
        plant: draft.sowingText,
        harvest: draft.harvestText,
      } satisfies Attempt);
    setAction({ stage: "submitting", attempt });
    const result = await onCreate(attempt);
    if (result.ok) {
      setAction({ stage: "success", result: result.data.data.result });
      return;
    }
    setAction({
      stage: "error",
      attempt: result.issue.code === "network_unavailable" ? attempt : null,
      issue: result.issue,
    });
  };

  return (
    <form
      aria-label="原创植物设计"
      className="original-plant-creator"
      onSubmit={(event) => {
        event.preventDefault();
        if (retryableAttempt) {
          void submit(retryableAttempt);
        } else if (canSubmit) {
          void submit();
        }
      }}
    >
      <p className="original-plant-creator__intro">设计一株属于这座农场的原创植物。</p>
      <div className="original-plant-creator__fields">
        <label>
          <span>名称</span>
          <input
            disabled={!editable || locked}
            name="original-plant-name"
            onChange={(event) => updateDraft({ ...draft, name: event.currentTarget.value })}
            placeholder="给植物起个名字"
            type="text"
            value={draft.name}
          />
        </label>
        <label>
          <span>
            拉丁名 <small>选填</small>
          </span>
          <input
            disabled={!editable || locked}
            name="original-plant-latin-name"
            onChange={(event) => updateDraft({ ...draft, latinName: event.currentTarget.value })}
            placeholder="可留空"
            type="text"
            value={draft.latinName}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>描述</span>
          <textarea
            disabled={!editable || locked}
            name="original-plant-description"
            onChange={(event) => updateDraft({ ...draft, description: event.currentTarget.value })}
            placeholder="写下它的样子和故事"
            rows={3}
            value={draft.description}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>播种文案</span>
          <textarea
            disabled={!editable || locked}
            name="original-plant-sowing-text"
            onChange={(event) => updateDraft({ ...draft, sowingText: event.currentTarget.value })}
            placeholder="播种时显示的文字"
            rows={2}
            value={draft.sowingText}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>收获文案</span>
          <textarea
            disabled={!editable || locked}
            name="original-plant-harvest-text"
            onChange={(event) => updateDraft({ ...draft, harvestText: event.currentTarget.value })}
            placeholder="收获时显示的文字"
            rows={2}
            value={draft.harvestText}
          />
        </label>
      </div>
      {action.stage === "success" ? (
        <section aria-live="polite" className="original-plant-creator__receipt">
          <strong>{action.result.crop.name}</strong>
          <span>
            消耗 {action.result.fee} 农场金币 · 获得 {action.result.seeds} 颗起步种子
          </span>
        </section>
      ) : null}
      {action.stage === "error" ? (
        <p className="original-plant-creator__feedback" role="alert">
          {originalPlantActionIssueMessage(action.issue)}
        </p>
      ) : null}
      <button
        className="original-plant-creator__submit"
        disabled={!retryableAttempt && !canSubmit}
        type="submit"
      >
        {action.stage === "submitting" ? "正在设计" : retryableAttempt ? "重试设计" : "完成设计"}
      </button>
    </form>
  );
}
