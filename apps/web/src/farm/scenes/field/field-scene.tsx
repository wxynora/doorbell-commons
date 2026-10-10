import type { LayoutShareSkip } from "./layout-sharing-plan.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFieldRuntime, roofChoices, type SceneRuntime } from "./scene-runtime.js";
import type { SceneDecorationData, SceneDecorationLayout, SceneEditState } from "./scene-types";
export type { SceneDecorationData, SceneDecorationLayout } from "./scene-types";
import type { FarmPlot } from "../../farm-overview";
import { farmPlotStateLabel } from "../../farm-overview";
import { useModelOutlinePreference } from "./model-outline-preference";
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
  active = true,
  plots,
  selectedPlot,
  onSelectPlot,
  onClosePlot,
  requestControls,
  decorationData,
  placementRequest,
  layoutPreviewRequest,
  onSaveLayout,
  onFinishEditing,
  onEditingChange,
  onRequestHousePurchase,
  housePurchaseFeedback,
  onOpenHouse,
}: {
  layoutPreviewRequest?: { layout: SceneDecorationLayout; requestKey: string } | undefined;
  active?: boolean;
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
  onRequestHousePurchase?: ((itemId: string) => void) | undefined;
  housePurchaseFeedback?: {stage: string; message?: string} | undefined;
  onOpenHouse?: (()=>void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<SceneRuntime | null>(null);
  const [modelOutline]=useModelOutlinePreference();
  const [shareSkipped, setShareSkipped] = useState<LayoutShareSkip[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [roofPalette, setRoofPalette] = useState(false);
  const [roofChoice, setRoofChoice] = useState("mint");
  const [houseMenu,setHouseMenu]=useState(false),[canopyEditor,setCanopyEditor]=useState(false),[boundaryEditor,setBoundaryEditor]=useState(false);
  const [canopyChoice,setCanopyChoice]=useState<"plain"|"floral">("plain");
  const [requestedHouseItem,setRequestedHouseItem]=useState<string|null>(null);
  const [houseLevel,setHouseLevel]=useState(decorationData?.house?.level??1);
  const [edit, setEdit] = useState<SceneEditState>({editing:false,valid:false,title:"",canAdd:false,canRemove:false,message:"",boundaryItemId:null});
  const [fieldSize,setFieldSize]=useState({rows:"6",columns:"6"});
  const fieldDraftValid=useRef(true);
  useEffect(()=>{if(edit.fieldMoving)setFieldSize({rows:String(edit.fieldRows??1),columns:String(edit.fieldColumns??6)});},[edit.fieldMoving,edit.fieldRows,edit.fieldColumns]);
  const [renderPlots, setRenderPlots] = useState(plots);
  const callbacks = useRef({onSelectPlot,onSaveLayout,onFinishEditing,onEditingChange,onOpenHouse,onClosePlot});
  callbacks.current={onSelectPlot,onSaveLayout,onFinishEditing,onEditingChange,onOpenHouse,onClosePlot};
  const currentActive=useRef(active);currentActive.current=active;
  const currentData=useRef(decorationData);currentData.current=decorationData;
  const plotKey=JSON.stringify(renderPlots.map(plot=>plot.plot_id));
  const nature=decorationData?.environment;
  const environment={season:nature?.season?.id??"summer",weather:nature?.weather?.condition??null,night:nature?.night??0,disaster:nature?.disaster??null,flood:nature?.flood};
  const currentEnvironment=useRef(environment);currentEnvironment.current=environment;
  useEffect(()=>{if(!edit.editing)setRenderPlots(plots);},[plots,edit.editing]);
  useEffect(()=>{if(!edit.editing)setHouseLevel(decorationData?.house?.level??1);},[decorationData?.house?.level,edit.editing]);
  useEffect(()=>{
    if(!host.current)return;
    try {
      const instance=createFieldRuntime(host.current,{
        active:currentActive.current,plots:renderPlots,environment:currentEnvironment.current,houseLevel,
        onSelectHouse:()=>{if(currentData.current){setHouseMenu(true);setRequestedHouseItem(null);callbacks.current.onClosePlot();callbacks.current.onOpenHouse?.();}},
        onSelectPlot:id=>callbacks.current.onSelectPlot(id),
        onEditState:state=>{setEdit(state);callbacks.current.onEditingChange?.(state.editing);},
        onSaveLayout:async layout=>{if(!fieldDraftValid.current)throw new Error("请先输入有效的行数或列数");if(!callbacks.current.onSaveLayout)throw new Error("布置保存暂时不可用");await callbacks.current.onSaveLayout(layout);},
        onFinishEditing:()=>callbacks.current.onFinishEditing?.(),
      });
      runtime.current=instance;
      setFailure(null);
      return()=>{instance.dispose();runtime.current=null;};
    } catch(error) {setFailure(error instanceof Error?error.message:"浏览器未能开启三维画面，请启用硬件加速。");}
  },[plotKey,houseLevel]);
  useEffect(()=>{runtime.current?.setPlots(renderPlots);},[renderPlots,houseLevel]);
  useEffect(()=>{runtime.current?.setActive(active);},[active,plotKey,houseLevel]);
  useEffect(()=>{runtime.current?.setModelOutline(modelOutline);},[modelOutline,plotKey,houseLevel]);
  useEffect(()=>{runtime.current?.setEnvironment(environment);},[environment.season,environment.weather,environment.night,environment.disaster?.type,environment.disaster?.phase,JSON.stringify(environment.flood),plotKey,houseLevel]);
  useEffect(()=>{if(decorationData)runtime.current?.setDecorations(decorationData);},[decorationData,plotKey,houseLevel]);
  useEffect(()=>{runtime.current?.selectPlot(selectedPlot?.plot_id??null);},[selectedPlot?.plot_id,plotKey,houseLevel]);
  useEffect(()=>{if(placementRequest)runtime.current?.startPlacement(placementRequest.decorationId);},[placementRequest?.requestKey]);
  useEffect(()=>{
    if(!layoutPreviewRequest)return;
    try {
      if(!runtime.current)throw new Error("场景尚未就绪，请稍后再试。");
      setShareSkipped(runtime.current.previewLayout(layoutPreviewRequest.layout));
      setFailure(null);
    } catch(error) {setFailure(error instanceof Error?error.message:"布局预览未完成，请重试。");}
  },[layoutPreviewRequest?.requestKey]);
  useEffect(()=>{if(!edit.editing)setRoofPalette(false);},[edit.editing]);
  useEffect(()=>{if(edit.editing){setHouseMenu(false);}else{setCanopyEditor(false);setBoundaryEditor(false);}},[edit.editing]);
  const upgradeId=houseLevel===1?"farm_decor:house_level_two":"farm_decor:house_level_three";
  const upgrade=decorationData?.catalog.find(item=>item.item_id===upgradeId);
  const canopyProduct=decorationData?.catalog.find(item=>item.item_id==="farm_decor:floral_canopy");
  const requestHouse=(id:string)=>{setRequestedHouseItem(id);onRequestHousePurchase?.(id);};
  const purchaseBusy=housePurchaseFeedback?.stage==="submitting";
  const boundaryChoices=(decorationData?.catalog??[]).filter(item=>["white_fence","timber_fence","stone_wall","hedge","ghost_fence"].includes(item.model_id)&&!!decorationData?.inventory.some(stock=>stock.item_id===item.item_id&&stock.unlocked));
  const maxFieldColumns=Math.max(6,...renderPlots.map(plot=>plot.plot_id));
  const fieldSlots=Math.max(0,...renderPlots.map(plot=>plot.plot_id));
  const validDimension=(value:string,max:number)=>value.trim()!==""&&Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=max;
  const validFieldSize=validDimension(fieldSize.rows,fieldSlots)&&validDimension(fieldSize.columns,maxFieldColumns);
  fieldDraftValid.current=!edit.fieldMoving||validFieldSize;
  const changeFieldSize=(axis:"rows"|"columns",value:string)=>{
    if(!validDimension(value,axis==="rows"?fieldSlots:maxFieldColumns)){setFieldSize(current=>({...current,[axis]:value}));return;}
    const other=String(Math.ceil(fieldSlots/Number(value)));
    setFieldSize(axis==="rows"?{rows:value,columns:other}:{rows:other,columns:value});
    if(axis==="rows")runtime.current?.changeFieldRows(Number(value));else runtime.current?.changeFieldColumns(Number(value));
  };
  return (
    <section
      aria-labelledby="farm-field-title"
      className="farm-scene farm-scene--field"
    >
      <h2 className="farm-visually-hidden" id="farm-field-title">
        农场
      </h2>

      <div className="farm-field-canvas" ref={host} />
      {!edit.editing && decorationData ? <button className="farm-house-accessible" type="button" onClick={()=>{setHouseMenu(true);setRequestedHouseItem(null);onClosePlot();onOpenHouse?.();}}>编辑房屋</button> : null}
      {!edit.editing&&houseMenu&&decorationData ? <section className="farm-field-editor farm-house-menu" aria-label="房屋编辑">
        <strong>{houseLevel}级房屋</strong>
        <button type="button" aria-label="关闭房屋编辑" onClick={()=>setHouseMenu(false)}>关闭</button>
        <div><button type="button" onClick={()=>{
        const key=decorationData.layout.roof;
        setRoofChoice(key);setRoofPalette(true);setCanopyEditor(false);setBoundaryEditor(false);runtime.current?.changeRoof(key);
      }}>屋顶换色</button>
        <button type="button" onClick={()=>runtime.current?.startHouseMove()}>移动房屋</button>
        <button type="button" disabled={!renderPlots.length} onClick={()=>{onClosePlot();runtime.current?.startFieldMove();}}>调整田地</button>
        {decorationData.house?.canopy_unlocked ? <button type="button" onClick={()=>{
          const key=decorationData.layout.canopy??"plain";setCanopyChoice(key);setCanopyEditor(true);setRoofPalette(false);setBoundaryEditor(false);runtime.current?.changeCanopy(key);
        }}>更换雨棚</button> : null}</div>
        <button type="button" onClick={()=>{
          setBoundaryEditor(true);setRoofPalette(false);setCanopyEditor(false);runtime.current?.changeBoundary(decorationData.layout.boundary_item_id??null);
        }}>更换整圈外圈</button>
        <p>升级由 TA 使用农场金币购买，购买后生效。</p>
        <div>{houseLevel<3&&upgrade ? <button type="button" disabled={!onRequestHousePurchase||purchaseBusy} onClick={()=>requestHouse(upgradeId)}>喊 TA 升到{houseLevel+1}级 · {upgrade.price_farm_coins.toLocaleString()}金币</button> : null}
        {!decorationData.house?.canopy_unlocked&&canopyProduct ? <button type="button" disabled={houseLevel<2||!onRequestHousePurchase||purchaseBusy} onClick={()=>requestHouse(canopyProduct.item_id)}>喊 TA 买花植雨棚 · {canopyProduct.price_farm_coins.toLocaleString()}金币{houseLevel<2?"（需二级）":""}</button> : null}</div>
        {requestedHouseItem ? <p role="status">{purchaseBusy?"正在发送购买请求…":housePurchaseFeedback?.stage==="success"?"已喊 TA 来买，实际购买后房屋才会更新。":housePurchaseFeedback?.message??""}</p> : null}
        {onOpenHouse?<button type="button" disabled={purchaseBusy} onClick={onOpenHouse}>刷新购买结果</button>:null}
      </section> : null}
      {!edit.editing&&!houseMenu ? requestControls : null}
      {failure ? <p className="farm-scene__notice" role="alert">{failure}</p> : null}
      {!edit.editing && edit.message ? <p className="farm-scene__notice" role="status">{edit.message}</p> : null}
      {edit.editing ? <section className={`farm-field-editor${edit.fieldMoving?" farm-field-editor--terrain":""}`} aria-label={edit.fieldMoving?"田地调整":"装饰摆放"}>
        <strong>{edit.fieldMoving?"田地排布":roofPalette ? "屋顶配色" : canopyEditor?"雨棚款式":boundaryEditor?"整圈外圈":edit.title}</strong>
        <p role="status">{edit.fieldMoving&&!validFieldSize?"请输入有效的行数或列数":edit.message || (edit.fieldMoving ? edit.valid?"整片拖动 · 绿色可保存":"有阻挡，请移动田地" : edit.layoutPreview ? "确认布置后保存" : roofPalette ? "选好颜色后保存，取消可恢复原色" : canopyEditor?"选好款式后保存，取消可恢复原款":boundaryEditor?"整圈围栏会保留原桥口；保存后生效，取消可恢复。":"拖动摆放 · 绿色位置可保存")}</p>
        {edit.layoutPreview ? <>
          <p>这是预览；保存后替换当前装饰布置，取消可恢复。</p>
          {shareSkipped.length ? <ul className="farm-layout-share-skipped">{shareSkipped.map(item=><li key={item.name+item.reason}>{item.name} × {item.quantity}：{item.reason === "missing" ? "未拥有或数量不足" : "位置冲突"}</li>)}</ul> : <p>所需装饰齐全，均可摆放。</p>}
        </> : null}
        {canopyEditor ? <div>{([['plain','默认米白雨棚'],['floral','花植雨棚']] as const).map(([key,label])=><button key={key} type="button" disabled={!edit.valid} aria-pressed={canopyChoice===key} onClick={()=>{setCanopyChoice(key);runtime.current?.changeCanopy(key);}}>{label}</button>)}</div>:null}
        {boundaryEditor&&decorationData ? <label>整圈外圈
          <select aria-label="整圈外圈栅栏" value={edit.boundaryItemId??""} disabled={!edit.valid} onChange={event=>runtime.current?.changeBoundary(event.currentTarget.value||null)}>
            <option value="">默认外圈</option>
            {boundaryChoices.map(item=><option key={item.item_id} value={item.item_id}>{item.name}</option>)}
          </select>
        </label> : null}
        {edit.fieldMoving ? <div className="farm-field-size" role="group" aria-label="田地行列，修改一边自动匹配另一边">
          <label><input aria-label="田地行数" type="number" inputMode="numeric" min="1" max={fieldSlots} step="1" value={fieldSize.rows} aria-invalid={!validDimension(fieldSize.rows,fieldSlots)} onChange={event=>changeFieldSize("rows",event.currentTarget.value)}/>行</label>
          <span aria-hidden="true">×</span>
          <label><input aria-label="田地列数" type="number" inputMode="numeric" min="1" max={maxFieldColumns} step="1" value={fieldSize.columns} aria-invalid={!validDimension(fieldSize.columns,maxFieldColumns)} onChange={event=>changeFieldSize("columns",event.currentTarget.value)}/>列</label>
        </div> : null}
        {roofPalette ? <div className="farm-roof-palette" aria-label="屋顶颜色">
          {roofChoices.map(choice=><button key={choice.id} type="button" disabled={!edit.valid} aria-pressed={roofChoice===choice.id} onClick={()=>{
            setRoofChoice(choice.id);runtime.current?.changeRoof(choice.id);
          }}><i aria-hidden="true" style={{backgroundColor:choice.color}}/>{choice.label}</button>)}
        </div> : null}
        <div className={edit.fieldMoving?"farm-field-shape__actions":undefined}>
          {!roofPalette&&!canopyEditor&&!boundaryEditor&&!edit.layoutPreview&&!edit.houseMoving&&!edit.fieldMoving ? <>
            <button type="button" onClick={()=>runtime.current?.rotate()}>旋转</button>
            <button type="button" disabled={!edit.canAdd} onClick={()=>runtime.current?.addOne()}>+1</button>
            <button type="button" disabled={!edit.canRemove} onClick={()=>runtime.current?.remove()}>收起</button>
          </> : null}
          <button type="button" onClick={()=>runtime.current?.cancel()}>取消</button>
          <button type="button" disabled={!edit.valid||(edit.fieldMoving&&!validFieldSize)} onClick={()=>void runtime.current?.save()}>保存</button>
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
