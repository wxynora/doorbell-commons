import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFieldRuntime, type SceneRuntime } from "./scene-runtime.js";
import type { SceneDecorationData, SceneDecorationLayout, SceneEditState } from "./scene-types";
export type { SceneDecorationData, SceneDecorationLayout } from "./scene-types";
import type { FarmPlot } from "../../farm-overview";
import { farmPlotStateLabel } from "../../farm-overview";
import "./field-scene.css";

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

export function FieldScene({
  plots,
  selectedPlot,
  onSelectPlot,
  onClosePlot,
  requestControls,
  decorationData,
  placementRequest,
  onSaveLayout,
  onFinishEditing,
  onEditingChange,
}: {
  backgroundUrl?: string;
  plots: readonly FarmPlot[];
  selectedPlot: FarmPlot | null;
  onSelectPlot: (plotId: number) => void;
  onClosePlot: () => void;
  requestControls?: ReactNode;
  decorationData?: SceneDecorationData | undefined;
  placementRequest?: { decorationId: string; requestKey: string } | null | undefined;
  onSaveLayout?: ((layout: SceneDecorationLayout) => Promise<void>) | undefined;
  onFinishEditing?: (() => void) | undefined;
  onEditingChange?: ((editing: boolean) => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<SceneRuntime | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [edit, setEdit] = useState<SceneEditState>({editing:false,valid:false,title:"",canAdd:false,canRemove:false,message:""});
  const [renderPlots, setRenderPlots] = useState(plots);
  const callbacks = useRef({onSelectPlot,onSaveLayout,onFinishEditing,onEditingChange});
  callbacks.current={onSelectPlot,onSaveLayout,onFinishEditing,onEditingChange};
  const currentData=useRef(decorationData);currentData.current=decorationData;
  const plotKey=JSON.stringify(renderPlots);
  const nature=decorationData?.environment;
  const environment={season:nature?.season?.id??"summer",weather:nature?.weather?.condition??null,night:nature?.night??0,disaster:nature?.disaster??null};
  const currentEnvironment=useRef(environment);currentEnvironment.current=environment;
  useEffect(()=>{if(!edit.editing)setRenderPlots(plots);},[plots,edit.editing]);
  useEffect(()=>{
    if(!host.current)return;
    try {
      const instance=createFieldRuntime(host.current,{
        plots:renderPlots,environment:currentEnvironment.current,
        onSelectPlot:id=>callbacks.current.onSelectPlot(id),
        onEditState:state=>{setEdit(state);callbacks.current.onEditingChange?.(state.editing);},
        onSaveLayout:async layout=>{if(!callbacks.current.onSaveLayout)throw new Error("布置保存暂时不可用");await callbacks.current.onSaveLayout(layout);},
        onFinishEditing:()=>callbacks.current.onFinishEditing?.(),
      });
      runtime.current=instance;
      if(currentData.current)instance.setDecorations(currentData.current);
      setFailure(null);
      return()=>{instance.dispose();runtime.current=null;};
    } catch(error) {setFailure(error instanceof Error?error.message:"浏览器未能开启三维画面，请启用硬件加速。");}
  },[plotKey]);
  useEffect(()=>{runtime.current?.setEnvironment(environment);},[environment.season,environment.weather,environment.night,environment.disaster?.type,environment.disaster?.phase,plotKey]);
  useEffect(()=>{if(decorationData)runtime.current?.setDecorations(decorationData);},[decorationData,plotKey]);
  useEffect(()=>{runtime.current?.selectPlot(selectedPlot?.plot_id??null);},[selectedPlot?.plot_id,plotKey]);
  useEffect(()=>{if(placementRequest)runtime.current?.startPlacement(placementRequest.decorationId);},[placementRequest?.requestKey]);
  return (
    <section
      aria-labelledby="farm-field-title"
      className="farm-scene farm-scene--field"
    >
      <h2 className="farm-visually-hidden" id="farm-field-title">
        农场
      </h2>

      <div className="farm-field-canvas" ref={host} />
      {!edit.editing ? requestControls : null}
      {failure ? <p className="farm-scene__notice" role="alert">{failure}</p> : null}
      {!edit.editing && edit.message ? <p className="farm-scene__notice" role="status">{edit.message}</p> : null}
      <div className="farm-field-view-tools" aria-label="农场视角">
        <button type="button" aria-label="放大场景" onClick={()=>runtime.current?.zoom(1.18)}>＋</button>
        <button type="button" aria-label="缩小场景" onClick={()=>runtime.current?.zoom(1/1.18)}>−</button>
        <button type="button" onClick={()=>runtime.current?.resetView()}>归位</button>
      </div>
      {edit.editing ? <section className="farm-field-editor" aria-label="装饰摆放">
        <strong>{edit.title}</strong>
        <p role="status">{edit.message || (edit.valid?"拖动摆放 · 绿色位置可保存":"这里放不下，请移到绿色格子")}</p>
        <div>
          <button type="button" onClick={()=>runtime.current?.rotate()}>旋转</button>
          <button type="button" disabled={!edit.canAdd} onClick={()=>runtime.current?.addOne()}>+1</button>
          <button type="button" disabled={!edit.canRemove} onClick={()=>runtime.current?.remove()}>收起</button>
          <button type="button" onClick={()=>runtime.current?.cancel()}>取消</button>
          <button type="button" disabled={!edit.valid} onClick={()=>void runtime.current?.save()}>保存</button>
        </div>
      </section> : null}

      {plots.length > 0 ? (
        <fieldset className="farm-field-accessible-plots">
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
              第 {plot.plot_id} 块地
            </button>
          ))}
        </fieldset>
      ) : (
        <p className="farm-scene__notice">这个农场目前没有可展示的地块。</p>
      )}

      {selectedPlot && !edit.editing ? (
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
