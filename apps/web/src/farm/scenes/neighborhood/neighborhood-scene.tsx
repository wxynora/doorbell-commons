import { type ReactNode, useState } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import "./neighborhood-scene.css";

export interface NeighborhoodSceneOption {
  id: string;
  label: string;
}

export function NeighborhoodScene({
  emptyLabels,
  farmCatalog,
  options,
  preview = true,
  shellUrl,
}: {
  emptyLabels: Readonly<Record<string, string>>;
  farmCatalog?: BoundFarmCatalogRead | null;
  options: readonly NeighborhoodSceneOption[];
  preview?: boolean;
  shellUrl: string;
}) {
  const [activeSectionId, setActiveSectionId] = useState(options[0]?.id ?? "");
  const activeSection = options.find((option) => option.id === activeSectionId) ?? options[0];

  if (!activeSection) {
    return null;
  }

  const liveNeighborhood = farmCatalog?.data.neighborhood;
  const liveUnavailableMessage =
    !preview && (!liveNeighborhood || liveNeighborhood.status === "unavailable")
      ? (liveNeighborhood?.message ?? "邻里数据尚未接入")
      : null;
  const liveBody: ReactNode = (() => {
    if (preview || liveUnavailableMessage || liveNeighborhood?.status !== "available") {
      return null;
    }
    if (activeSection.id === "ranking") {
      const rankingRows =
        liveNeighborhood.rankings.total ??
        liveNeighborhood.rankings.today ??
        Object.values(liveNeighborhood.rankings)[0] ??
        [];
      return rankingRows.length > 0 ? (
        <ul className="farm-neighborhood__live-list" aria-label="真实排行榜">
          {rankingRows.map((row) => (
            <li key={row.farm_doorplate}>
              <strong>{row.farm_name}</strong>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      ) : null;
    }
    if (activeSection.id === "message-board") {
      return liveNeighborhood.messages.length > 0 ? (
        <ul className="farm-neighborhood__live-list" aria-label="真实留言板">
          {liveNeighborhood.messages.map((message, index) => (
            <li key={`message-${message.id ?? index}`}>
              <strong>{message.author_name ?? "留言"}</strong>
              <span>{message.text}</span>
            </li>
          ))}
        </ul>
      ) : null;
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
          <nav
            aria-label={`${activeSection.label}分页`}
            className="farm-panel-pagination farm-neighborhood__pagination"
          >
            <button aria-label="上一页" disabled type="button">
              ‹
            </button>
            <span>1 / 1</span>
            <button aria-label="下一页" disabled type="button">
              ›
            </button>
          </nav>
        </div>
      </section>
    </>
  );
}
