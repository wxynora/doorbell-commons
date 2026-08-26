import type { CSSProperties } from "react";
import { type FarmAssetKey, getFarmAssetUrl } from "../../farm-asset-manifest";
import type { FarmPlot } from "../../farm-overview";
import { farmPlotStateLabel } from "../../farm-overview";
import "./field-scene.css";

const FARM_PLOT_ASSET_KEYS = {
  common: {
    growing: "field.crop.ordinary-growing",
    ripe: "field.crop.ordinary-ripe",
  },
  fantasy: {
    growing: "field.crop.fantasy-growing",
    ripe: "field.crop.fantasy-ripe",
  },
  limited: {
    growing: "field.crop.limited-growing",
    ripe: "field.crop.limited-ripe",
  },
} as const satisfies Record<
  NonNullable<FarmPlot["seed_type"]>,
  Record<Exclude<FarmPlot["state"], "empty">, FarmAssetKey>
>;

const FARM_SEED_TYPE_LABELS: Readonly<Record<NonNullable<FarmPlot["seed_type"]>, string>> = {
  common: "普通种子",
  fantasy: "奇幻种子",
  limited: "限定或原创种子",
};

const FARM_MATURITY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
});

function farmPlotIdentityLabel(plot: FarmPlot): string {
  if (plot.state === "empty" || plot.seed_type === null) {
    return "空地";
  }
  if (plot.identity_state === "known" && plot.crop_identity) {
    return plot.crop_identity.name;
  }
  if (plot.identity_state === "unavailable") {
    return "作物资料暂时不可用";
  }
  return FARM_SEED_TYPE_LABELS[plot.seed_type];
}

function formatMaturesAt(maturesAt: string): string {
  return FARM_MATURITY_FORMATTER.format(new Date(maturesAt));
}

function PlotPlant({ plot }: { plot: FarmPlot }) {
  if (plot.state === "empty" || plot.seed_type === null) {
    return null;
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`farm-plot__plant farm-plot__plant--${plot.state}`}
      src={getFarmAssetUrl(FARM_PLOT_ASSET_KEYS[plot.seed_type][plot.state])}
    />
  );
}

export function FieldScene({
  backgroundUrl,
  plots,
  selectedPlot,
  onSelectPlot,
  onClosePlot,
}: {
  backgroundUrl: string;
  plots: readonly FarmPlot[];
  selectedPlot: FarmPlot | null;
  onSelectPlot: (plotId: number) => void;
  onClosePlot: () => void;
}) {
  return (
    <section
      aria-labelledby="farm-field-title"
      className="farm-scene farm-scene--field"
      style={{ "--farm-scene-background": `url("${backgroundUrl}")` } as CSSProperties}
    >
      <h2 className="farm-visually-hidden" id="farm-field-title">
        农场
      </h2>

      {plots.length > 0 ? (
        <fieldset className="farm-plots">
          <legend className="farm-visually-hidden">农场地块</legend>
          {plots.map((plot) => (
            <button
              aria-label={`第 ${plot.plot_id} 块地，${farmPlotStateLabel(plot)}，${farmPlotIdentityLabel(plot)}`}
              aria-pressed={selectedPlot?.plot_id === plot.plot_id}
              className={`farm-plot farm-plot--${plot.state}`}
              key={plot.plot_id}
              onClick={() => onSelectPlot(plot.plot_id)}
              type="button"
            >
              <PlotPlant plot={plot} />
            </button>
          ))}
        </fieldset>
      ) : (
        <p className="farm-scene__notice">这个农场目前没有可展示的地块。</p>
      )}

      {selectedPlot ? (
        <aside className="farm-plot-detail" aria-live="polite">
          <button
            aria-label="关闭地块详情"
            className="farm-plot-detail__close"
            onClick={onClosePlot}
            type="button"
          >
            ×
          </button>
          <p>第 {selectedPlot.plot_id} 块地</p>
          <strong>{farmPlotIdentityLabel(selectedPlot)}</strong>
          <dl>
            <div>
              <dt>状态</dt>
              <dd>{farmPlotStateLabel(selectedPlot)}</dd>
            </div>
            <div>
              <dt>浇水</dt>
              <dd>{selectedPlot.watered} 次</dd>
            </div>
            {selectedPlot.progress ? (
              <div>
                <dt>进度</dt>
                <dd>
                  {selectedPlot.progress.current}/{selectedPlot.progress.total}
                </dd>
              </div>
            ) : null}
            {selectedPlot.matures_at ? (
              <div>
                <dt>预计成熟</dt>
                <dd>{formatMaturesAt(selectedPlot.matures_at)}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      ) : null}
    </section>
  );
}
