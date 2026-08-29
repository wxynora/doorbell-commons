import { type ReactNode, useState } from "react";
import type { ApiResult } from "../../../auth/auth-client";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import {
  type BoundNeighborhoodMessageAction,
  type NeighborhoodMessageActionInput,
  type NeighborhoodMessageActionIssue,
  neighborhoodMessageActionIssueMessage,
} from "../../../auth/neighborhood-message-action-client";
import "./neighborhood-scene.css";

export interface NeighborhoodSceneOption {
  id: string;
  label: string;
}

export type NeighborhoodMessageActionExecutor = (
  input: NeighborhoodMessageActionInput,
) => Promise<ApiResult<BoundNeighborhoodMessageAction, NeighborhoodMessageActionIssue>>;

type NeighborhoodMessageState =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "success"; result: BoundNeighborhoodMessageAction }
  | { stage: "error"; issue: NeighborhoodMessageActionIssue };

interface NeighborhoodRankingDefinition {
  id: string;
  label: string;
  unit: string;
  valuePrefix?: string;
}

interface NeighborhoodRankingDisplayRow {
  key: string;
  name: string;
  detail: string | null;
  title: string | null;
  value: number;
}

const TOTAL_RANKINGS: readonly NeighborhoodRankingDefinition[] = [
  { id: "wealth", label: "财富榜", unit: "金" },
  { id: "collection", label: "收集榜", unit: "种" },
  { id: "diligence", label: "勤劳榜", unit: "株" },
  { id: "kindness", label: "热心榜", unit: "次" },
  { id: "thief", label: "大盗榜", unit: "次" },
  { id: "land", label: "土地榜", unit: "阶" },
];

const TODAY_RANKINGS: readonly NeighborhoodRankingDefinition[] = [
  { id: "todayTasks", label: "卷王榜", unit: "个" },
  { id: "todayLogins", label: "网瘾榜", unit: "次" },
  { id: "todayMessages", label: "热情榜", unit: "次" },
  { id: "todayEvents", label: "奇遇榜", unit: "次" },
  { id: "todayRaidIncome", label: "摸金榜", unit: "金" },
  { id: "todayRaidLoss", label: "漏财榜", unit: "金", valuePrefix: "-" },
];

function NeighborhoodRankingBoard({
  definition,
  emptyLabel = "还没有上榜的",
  rows,
}: {
  definition: NeighborhoodRankingDefinition;
  emptyLabel?: string;
  rows: readonly NeighborhoodRankingDisplayRow[];
}) {
  const headingId = `farm-neighborhood-ranking-${definition.id}`;
  return (
    <section aria-labelledby={headingId} className="farm-neighborhood__ranking-board">
      <h5 id={headingId}>{definition.label}</h5>
      {rows.length > 0 ? (
        <ol>
          {rows.map((row, index) => (
            <li key={row.key}>
              <span aria-hidden="true" className="farm-neighborhood__ranking-position">
                {index + 1}
              </span>
              <span className="farm-neighborhood__ranking-identity">
                {row.title ? (
                  <small className="farm-neighborhood__ranking-title">✧{row.title}✧</small>
                ) : null}
                <strong>{row.name}</strong>
                {row.detail ? <small>{row.detail}</small> : null}
              </span>
              <span className="farm-neighborhood__ranking-value">
                {definition.valuePrefix}
                {row.value} {definition.unit}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="farm-neighborhood__ranking-empty">{emptyLabel}</p>
      )}
    </section>
  );
}

function messageActionKey(): string {
  return globalThis.crypto.randomUUID();
}

export function NeighborhoodScene({
  emptyLabels,
  farmCatalog,
  options,
  onMessageAction,
  onMessageActionSuccess,
  preview = true,
  shellUrl,
}: {
  emptyLabels: Readonly<Record<string, string>>;
  farmCatalog?: BoundFarmCatalogRead | null;
  options: readonly NeighborhoodSceneOption[];
  onMessageAction?: NeighborhoodMessageActionExecutor | undefined;
  onMessageActionSuccess?: ((result: BoundNeighborhoodMessageAction) => void) | undefined;
  preview?: boolean;
  shellUrl: string;
}) {
  const [activeSectionId, setActiveSectionId] = useState(options[0]?.id ?? "");
  const [messageTarget, setMessageTarget] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageState, setMessageState] = useState<NeighborhoodMessageState>({ stage: "idle" });
  const activeSection = options.find((option) => option.id === activeSectionId) ?? options[0];

  if (!activeSection) {
    return null;
  }

  const liveNeighborhood = farmCatalog?.data.neighborhood;
  const neighborhoodRevision = farmCatalog?.neighborhood_revision ?? null;
  const ownFarmDoorplate = farmCatalog?.data.farm.farm_doorplate ?? null;
  const messageBoards =
    liveNeighborhood?.status === "available"
      ? (liveNeighborhood.message_boards ??
        (ownFarmDoorplate
          ? [
              {
                farm_doorplate: ownFarmDoorplate,
                farm_name: farmCatalog?.data.farm.farm_name ?? ownFarmDoorplate,
                is_own: true,
                status: "open" as const,
                messages: liveNeighborhood.messages,
              },
            ]
          : []))
      : [];
  const publicFarmTargets = (() => {
    if (liveNeighborhood?.status !== "available") {
      return [];
    }
    if (liveNeighborhood.message_boards) {
      return liveNeighborhood.message_boards.flatMap((board) =>
        !board.is_own && board.status === "open"
          ? [{ doorplate: board.farm_doorplate, farmName: board.farm_name }]
          : [],
      );
    }
    const targets = new Map<string, { doorplate: string; farmName: string }>();
    for (const rows of Object.values(liveNeighborhood.rankings)) {
      for (const row of rows) {
        if (row.farm_doorplate === ownFarmDoorplate || targets.has(row.farm_doorplate)) {
          continue;
        }
        targets.set(row.farm_doorplate, {
          doorplate: row.farm_doorplate,
          farmName: row.farm_name,
        });
      }
    }
    return [...targets.values()];
  })();
  const hasMessageTarget = publicFarmTargets.some((target) => target.doorplate === messageTarget);
  const liveUnavailableMessage =
    !preview && (!liveNeighborhood || liveNeighborhood.status === "unavailable")
      ? (liveNeighborhood?.message ?? "邻里数据尚未接入")
      : null;
  const liveBody: ReactNode = (() => {
    if (preview || liveUnavailableMessage || liveNeighborhood?.status !== "available") {
      return null;
    }
    if (activeSection.id === "ranking") {
      const rankingRows = (definition: NeighborhoodRankingDefinition) =>
        (liveNeighborhood.rankings[definition.id] ?? []).map((row) => ({
          key: row.farm_doorplate,
          name: row.farm_name,
          detail: row.farm_doorplate,
          title: row.equipped_title,
          value: row.value,
        }));
      const hotRows = liveNeighborhood.original_crops
        .filter(
          (crop) =>
            crop.identity_state === "known" &&
            Boolean(crop.name) &&
            (crop.buyers ?? 0) > 0 &&
            crop.banned !== true,
        )
        .sort((left, right) => (right.buyers ?? 0) - (left.buyers ?? 0))
        .slice(0, 5)
        .map((crop) => ({
          key: crop.crop_id,
          name: crop.name ?? crop.crop_id,
          detail: `设计者 ${crop.designer_name ?? "?"}`,
          title: null,
          value: crop.buyers ?? 0,
        }));
      const hotDefinition = {
        id: "hot",
        label: "原创热门榜",
        unit: "人买过",
      } satisfies NeighborhoodRankingDefinition;
      return (
        <div aria-label="真实排行榜" className="farm-neighborhood__ranking-groups">
          <section className="farm-neighborhood__ranking-group">
            <h4>总榜（累计）</h4>
            {TOTAL_RANKINGS.map((definition) => (
              <NeighborhoodRankingBoard
                definition={definition}
                key={definition.id}
                rows={rankingRows(definition)}
              />
            ))}
            <NeighborhoodRankingBoard
              definition={hotDefinition}
              emptyLabel="还没有热卖的原创"
              rows={hotRows}
            />
          </section>
          <section className="farm-neighborhood__ranking-group">
            <h4>今日榜（每天 0 点归零，新人同台）</h4>
            {TODAY_RANKINGS.map((definition) => (
              <NeighborhoodRankingBoard
                definition={definition}
                key={definition.id}
                rows={rankingRows(definition)}
              />
            ))}
          </section>
        </div>
      );
    }
    if (activeSection.id === "message-board") {
      const submitMessage = async () => {
        if (
          !onMessageAction ||
          !hasMessageTarget ||
          !messageDraft.trim() ||
          !neighborhoodRevision ||
          messageState.stage === "submitting"
        ) {
          return;
        }
        const input = {
          idempotencyKey: messageActionKey(),
          expectedRevision: neighborhoodRevision,
          targetFarmDoorplate: messageTarget,
          body: messageDraft,
        };
        setMessageState({ stage: "submitting" });
        let result = await onMessageAction(input);
        if (!result.ok && result.issue.code === "network_unavailable") {
          result = await onMessageAction(input);
        }
        if (result.ok) {
          setMessageDraft("");
          setMessageState({ stage: "success", result: result.data });
          onMessageActionSuccess?.(result.data);
        } else {
          setMessageState({ stage: "error", issue: result.issue });
        }
      };

      return (
        <div className="farm-neighborhood__message-area">
          <div aria-label="真实留言板" className="farm-neighborhood__message-boards">
            {messageBoards.map((board) => (
              <article
                aria-label={board.is_own ? "我的留言板" : `${board.farm_name}的留言板`}
                className="farm-neighborhood__message-board-card"
                data-own={board.is_own}
                key={board.farm_doorplate}
              >
                <header>
                  <h4>{board.is_own ? "我的留言板" : board.farm_name}</h4>
                  <span>门牌 {board.farm_doorplate}</span>
                </header>
                {board.status === "closed" ? (
                  <p className="farm-neighborhood__message-board-empty">留言板已关闭</p>
                ) : board.messages.length > 0 ? (
                  <ul>
                    {board.messages.map((message, index) => (
                      <li key={message.id ?? `${board.farm_doorplate}-${index}`}>
                        <div>
                          <strong>{message.author_name ?? "访客"}</strong>
                          {message.author_farm_doorplate ? (
                            <small>门牌 {message.author_farm_doorplate}</small>
                          ) : null}
                          {message.at ? <time dateTime={message.at}>{message.at}</time> : null}
                        </div>
                        <p>{message.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="farm-neighborhood__message-board-empty">还没有访客留言</p>
                )}
              </article>
            ))}
          </div>
          {onMessageAction ? (
            <details className="farm-neighborhood__message-compose-disclosure">
              <summary>写留言</summary>
              <form
                className="farm-neighborhood__message-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMessage();
                }}
              >
                <div className="farm-neighborhood__message-compose-row">
                  <label htmlFor="farm-neighborhood-message-target">留言给</label>
                  <select
                    aria-label="选择留言目标农场"
                    disabled={!hasMessageTarget || messageState.stage === "submitting"}
                    id="farm-neighborhood-message-target"
                    onChange={(event) => setMessageTarget(event.target.value)}
                    value={messageTarget}
                  >
                    <option value="">
                      {publicFarmTargets.length > 0 ? "选择公开农场" : "暂无可留言的公开农场"}
                    </option>
                    {publicFarmTargets.map((target) => (
                      <option key={target.doorplate} value={target.doorplate}>
                        {target.farmName} · {target.doorplate}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="farm-neighborhood__message-compose-row">
                  <label htmlFor="farm-neighborhood-message-body">留言</label>
                  <textarea
                    aria-label="留言内容"
                    disabled={!hasMessageTarget || messageState.stage === "submitting"}
                    id="farm-neighborhood-message-body"
                    maxLength={100}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="写一句给邻居的话"
                    rows={2}
                    value={messageDraft}
                  />
                </div>
                <button
                  className="farm-neighborhood__message-submit"
                  disabled={
                    !hasMessageTarget ||
                    !messageDraft.trim() ||
                    messageState.stage === "submitting"
                  }
                  type="submit"
                >
                  {messageState.stage === "submitting" ? "发送中…" : "发送留言"}
                </button>
                {messageState.stage === "success" ? (
                  <p className="farm-neighborhood__message-feedback" role="status">
                    已向 {messageState.result.data.result.target_farm_doorplate} 发送留言。
                  </p>
                ) : null}
                {messageState.stage === "error" ? (
                  <p className="farm-neighborhood__message-feedback is-error" role="alert">
                    {neighborhoodMessageActionIssueMessage(messageState.issue)}
                  </p>
                ) : null}
              </form>
            </details>
          ) : null}
        </div>
      );
    }
    return liveNeighborhood.original_crops.length > 0 ? (
      <ul className="farm-neighborhood__live-list" aria-label="真实原创作物">
        {liveNeighborhood.original_crops.map((crop) => (
          <li key={crop.crop_id}>
            <strong>
              {crop.identity_state === "known" && crop.name ? crop.name : "身份不可用"}
            </strong>
            <span>{crop.designer_name ?? "设计者身份不可用"}</span>
          </li>
        ))}
      </ul>
    ) : null;
  })();

  return (
    <>
      <div aria-hidden="true" className="farm-scene farm-scene--neighborhood" />
      <section aria-labelledby="farm-neighborhood-title" className="farm-neighborhood">
        <img alt="" aria-hidden="true" className="farm-neighborhood__shell-frame" src={shellUrl} />
        <h2 className="farm-visually-hidden" id="farm-neighborhood-title">
          邻里
        </h2>
        <div aria-label="邻里内容" className="farm-neighborhood__tabs" role="tablist">
          {options.map((option) => (
            <button
              aria-controls="farm-neighborhood-panel"
              aria-selected={activeSectionId === option.id}
              className="farm-neighborhood__link"
              id={`farm-neighborhood-tab-${option.id}`}
              key={option.id}
              onClick={() => setActiveSectionId(option.id)}
              role="tab"
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div
          aria-labelledby={`farm-neighborhood-tab-${activeSection.id}`}
          className="farm-neighborhood__panel"
          id="farm-neighborhood-panel"
          role="tabpanel"
        >
          <div className="farm-neighborhood__body">
            <header className="farm-neighborhood__section-head">
              <h3>{activeSection.label}</h3>
            </header>
            {liveUnavailableMessage ? (
              <div className="farm-neighborhood__empty" role="status">
                <p>{liveUnavailableMessage}</p>
              </div>
            ) : liveBody ? (
              liveBody
            ) : (
              <div className="farm-neighborhood__empty" role="status">
                <p>{preview ? emptyLabels[activeSection.id] : "暂无真实内容"}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
