import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getFarmAssetUrl } from "../farm-asset-manifest";
import {
  DEFAULT_FARM_TOOL_EDITOR_LAYOUT,
  FARM_TOOL_EDITOR_BULLETIN_OPTION,
  FARM_TOOL_EDITOR_CANVAS_SIZE,
  FARM_TOOL_EDITOR_OPTIONS,
  FARM_TOOL_LAYOUTS,
  type FarmToolEditorLayout,
} from "./farm-tool-layouts";

type FarmToolEditorLayouts = Record<string, FarmToolEditorLayout>;
type FarmToolEditorLayer = "icon" | "text";

const FARM_TOOL_EDITOR_HASH_PREFIX = "#farmTools=";

function clampFarmToolEditorValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createDefaultFarmToolEditorLayouts(): FarmToolEditorLayouts {
  return Object.fromEntries(
    FARM_TOOL_EDITOR_OPTIONS.map((tool) => [
      tool.id,
      { ...(FARM_TOOL_LAYOUTS[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT) },
    ]),
  );
}

function readFarmToolEditorLayouts(): FarmToolEditorLayouts {
  const defaults = createDefaultFarmToolEditorLayouts();
  if (
    typeof window === "undefined" ||
    !window.location.hash.startsWith(FARM_TOOL_EDITOR_HASH_PREFIX)
  ) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(window.location.hash.slice(FARM_TOOL_EDITOR_HASH_PREFIX.length)),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;
    for (const tool of FARM_TOOL_EDITOR_OPTIONS) {
      const candidate = record[tool.id];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      const values = candidate as Record<keyof FarmToolEditorLayout, unknown>;
      const fallback = defaults[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;
      defaults[tool.id] = {
        iconX:
          typeof values.iconX === "number" && Number.isFinite(values.iconX)
            ? clampFarmToolEditorValue(values.iconX, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.iconX,
        iconY:
          typeof values.iconY === "number" && Number.isFinite(values.iconY)
            ? clampFarmToolEditorValue(values.iconY, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.iconY,
        iconSize:
          typeof values.iconSize === "number" && Number.isFinite(values.iconSize)
            ? clampFarmToolEditorValue(values.iconSize, 24, 220)
            : fallback.iconSize,
        textX:
          typeof values.textX === "number" && Number.isFinite(values.textX)
            ? clampFarmToolEditorValue(values.textX, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.textX,
        textY:
          typeof values.textY === "number" && Number.isFinite(values.textY)
            ? clampFarmToolEditorValue(values.textY, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.textY,
        textSize:
          typeof values.textSize === "number" && Number.isFinite(values.textSize)
            ? clampFarmToolEditorValue(values.textSize, 9.6, 61.44)
            : fallback.textSize,
      };
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function isFarmToolEditorEnabled() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("editor") === "farm-tools"
  );
}

export function FarmToolEditor({ onBack }: { onBack: () => void }) {
  const [selectedToolId, setSelectedToolId] = useState(FARM_TOOL_EDITOR_BULLETIN_OPTION.id);
  const [layouts, setLayouts] = useState<FarmToolEditorLayouts>(readFarmToolEditorLayouts);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ layer: FarmToolEditorLayer; pointerId: number } | null>(null);
  const selectedTool =
    FARM_TOOL_EDITOR_OPTIONS.find((tool) => tool.id === selectedToolId) ??
    FARM_TOOL_EDITOR_BULLETIN_OPTION;
  const selectedLayout = layouts[selectedTool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

  useEffect(() => {
    const encodedLayouts = encodeURIComponent(JSON.stringify(layouts));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${FARM_TOOL_EDITOR_HASH_PREFIX}${encodedLayouts}`,
    );
  }, [layouts]);

  const updateSelectedLayout = useCallback(
    (update: Partial<FarmToolEditorLayout>) => {
      setLayouts((current) => ({
        ...current,
        [selectedTool.id]: {
          ...(current[selectedTool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT),
          ...update,
        },
      }));
    },
    [selectedTool.id],
  );

  const updateLayerPosition = useCallback(
    (layer: FarmToolEditorLayer, clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      const x = clampFarmToolEditorValue(
        ((clientX - bounds.left) / bounds.width) * FARM_TOOL_EDITOR_CANVAS_SIZE,
        0,
        FARM_TOOL_EDITOR_CANVAS_SIZE,
      );
      const y = clampFarmToolEditorValue(
        ((clientY - bounds.top) / bounds.height) * FARM_TOOL_EDITOR_CANVAS_SIZE,
        0,
        FARM_TOOL_EDITOR_CANVAS_SIZE,
      );
      updateSelectedLayout(layer === "icon" ? { iconX: x, iconY: y } : { textX: x, textY: y });
    },
    [updateSelectedLayout],
  );

  const startLayerDrag = (
    layer: FarmToolEditorLayer,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { layer, pointerId: event.pointerId };
    updateLayerPosition(layer, event.clientX, event.clientY);
  };

  const moveLayer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    updateLayerPosition(drag.layer, event.clientX, event.clientY);
  };

  const stopLayerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <main className="farm-game farm-tool-editor" data-testid="farm-tool-editor">
      <div className="farm-game__shell farm-tool-editor__shell">
        <button
          aria-label="返回铃野地图"
          className="farm-game__round-button farm-tool-editor__back"
          onClick={onBack}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <section className="farm-tool-editor__panel">
          <header>
            <h1>工具图标调位</h1>
            <p>点选工具后，直接拖动图标或文字；大小用下面两条滑杆调整。</p>
          </header>

          <nav aria-label="选择要调整的工具" className="farm-tool-editor__tools">
            {FARM_TOOL_EDITOR_OPTIONS.map((tool) => (
              <button
                aria-pressed={tool.id === selectedTool.id}
                key={tool.id}
                onClick={() => setSelectedToolId(tool.id)}
                type="button"
              >
                {tool.label}
              </button>
            ))}
          </nav>

          <div className="farm-tool-editor__preview-row">
            <div
              className="farm-tool-editor__canvas"
              onPointerCancel={stopLayerDrag}
              onPointerMove={moveLayer}
              onPointerUp={stopLayerDrag}
              ref={canvasRef}
            >
              <button
                aria-label={`拖动${selectedTool.label}图标`}
                className="farm-tool-editor__layer farm-tool-editor__icon"
                onPointerDown={(event) => startLayerDrag("icon", event)}
                style={{
                  height: `${selectedLayout.iconSize}px`,
                  left: `${selectedLayout.iconX}px`,
                  top: `${selectedLayout.iconY}px`,
                  width: `${selectedLayout.iconSize}px`,
                }}
                type="button"
              >
                <img alt="" aria-hidden="true" src={getFarmAssetUrl(selectedTool.iconKey)} />
              </button>
              <button
                aria-label={`拖动${selectedTool.label}文字`}
                className="farm-tool-editor__layer farm-tool-editor__text"
                onPointerDown={(event) => startLayerDrag("text", event)}
                style={{
                  fontSize: `${selectedLayout.textSize}px`,
                  left: `${selectedLayout.textX}px`,
                  top: `${selectedLayout.textY}px`,
                }}
                type="button"
              >
                {selectedTool.label}
              </button>
            </div>

            <aside className="farm-tool-editor__actual-preview">
              <span>实页大小</span>
              <div
                aria-label={`${selectedTool.label}实页比例预览`}
                className="farm-tool-editor__actual-cell"
                role="img"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  src={getFarmAssetUrl(selectedTool.iconKey)}
                  style={{
                    height: `${(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    left: `${(selectedLayout.iconX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    top: `${(selectedLayout.iconY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    width: `${(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                  }}
                />
                <strong
                  style={{
                    fontSize: `${(selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 13.7}cqw`,
                    left: `${(selectedLayout.textX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    top: `${(selectedLayout.textY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                  }}
                >
                  {selectedTool.label}
                </strong>
              </div>
            </aside>
          </div>

          <div className="farm-tool-editor__sliders">
            <label>
              <span>图标大小</span>
              <output>
                {Math.round((selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 1000) / 10}%
              </output>
              <input
                max="115"
                min="12.5"
                onInput={(event) =>
                  updateSelectedLayout({
                    iconSize:
                      (Number(event.currentTarget.value) / 100) * FARM_TOOL_EDITOR_CANVAS_SIZE,
                  })
                }
                step="0.5"
                type="range"
                value={(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}
              />
            </label>
            <label>
              <span>文字大小</span>
              <output>
                {Math.round((selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 1000) / 10}%
              </output>
              <input
                max="32"
                min="5"
                onInput={(event) =>
                  updateSelectedLayout({
                    textSize:
                      (Number(event.currentTarget.value) / 100) * FARM_TOOL_EDITOR_CANVAS_SIZE,
                  })
                }
                step="0.5"
                type="range"
                value={(selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}
              />
            </label>
          </div>

          <button
            className="farm-tool-editor__reset"
            onClick={() =>
              setLayouts((current) => ({
                ...current,
                [selectedTool.id]: { ...DEFAULT_FARM_TOOL_EDITOR_LAYOUT },
              }))
            }
            type="button"
          >
            重置当前工具
          </button>
        </section>
      </div>
    </main>
  );
}
