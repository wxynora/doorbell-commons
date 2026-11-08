import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SnowPixelBattle } from "../../../../../packages/protocol/src/snow-tournament";
import { drawSnowPixelScene, PIXEL_FIELD, pixelUnitsAtPoint, pixelUnitsInCell } from "./pixel-scene";
import { SnowPixelTimeline } from "./timeline";
import {SnowReplicaTimeline} from "./replica-timeline";
import type {BattleStreamUpdate} from "./stream-client";
import { SnowPixelPortrait, SnowPixelUnitGuide } from "./unit-guide";
import "./pixel-live.css";

type Cell = { lane: number; position: number };
export function SnowPixelBattleCanvas({ battle, replica, paused=false, onSelect, overlay }: { battle: SnowPixelBattle; replica?:BattleStreamUpdate; paused?:boolean; onSelect?(cell: Cell): void; overlay?:ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeline = useRef(new SnowPixelTimeline());
  const simulation=useRef(new SnowReplicaTimeline()),usesReplica=useRef(false);
  const [displayed,setDisplayed]=useState(battle),displayTick=useRef(battle.tick);
  const selectedRef = useRef<Cell | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const at=performance.now();usesReplica.current=!!replica;
    if(replica){simulation.current.accept(replica);if(paused)simulation.current.pause(at);}
    else {timeline.current.accept(battle,at);if(paused)timeline.current.pause(at);}
    setDisplayed(battle);displayTick.current=battle.tick;
  }, [battle,replica,paused]);
  useEffect(() => { setSelected(null); setSelectedIds([]); selectedRef.current = null; selectedIdsRef.current = []; }, [battle.id]);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    let frameId: number;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const draw = (at: number) => {
      if (disposed) return;
      const next=usesReplica.current?simulation.current.frame(at,reduced.matches):timeline.current.frame(at,reduced.matches);
      drawSnowPixelScene(context,next,selectedRef.current,selectedIdsRef.current);
      if(next.battle&&displayTick.current!==next.battle.tick){displayTick.current=next.battle.tick;setDisplayed(next.battle);}
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => { disposed = true; cancelAnimationFrame(frameId); };
  }, []);
  const selectedUnits = displayed.units.filter(unit => selectedIds.includes(unit.id));
  return <div className="snow-pixel-live">
    <div className="snow-match-hud" aria-label="当前战况"><span>{displayed.started?"本局":"准备中"} <b>{Math.floor(displayed.tick/60).toString().padStart(2,"0")}:{(displayed.tick%60).toString().padStart(2,"0")}</b> / 10:00</span>
      <span>雪堡耐久 <b>{Number(displayed.coreHp.toFixed(2))} / {displayed.coreMaxHp}</b><meter aria-label="雪堡剩余耐久" min={0} max={displayed.coreMaxHp} value={displayed.coreHp}/></span></div>
    <div className="snow-pixel-toolbar"><span><b className="snow-pixel-role snow-pixel-role--attack">▶ 进攻</b><b className="snow-pixel-role snow-pixel-role--defend">◇ 防守</b></span><button type="button" onClick={() => setZoom(value => value === 1 ? 2 : 1)}>{zoom === 1 ? "放大看" : "看全场"}</button></div>
    <div className="snow-pixel-scroll"><div className="snow-pixel-canvas" data-pixel-canvas style={{ width: `${zoom * 100}%`, aspectRatio: `${PIXEL_FIELD.width} / ${PIXEL_FIELD.height}` }}>
      <canvas ref={canvas} width={PIXEL_FIELD.width} height={PIXEL_FIELD.height} role="img" aria-label="雪堡实时像素战场，三路十二格；兵种按实际移速连续前进" />
      {[1, 2, 3].flatMap(lane => Array.from({ length: 12 }, (_, index) => {
        const position = index + 1, units = displayed.units.filter(unit => unit.lane === lane && unit.position === position);
        return <button type="button" className="snow-pixel-hotspot" key={`${lane}:${position}`}
          style={{ left: `${(PIXEL_FIELD.left + index * PIXEL_FIELD.cell) / PIXEL_FIELD.width * 100}%`, top: `${(PIXEL_FIELD.top + (lane - 1) * PIXEL_FIELD.laneGap - 16) / PIXEL_FIELD.height * 100}%`, width: `${PIXEL_FIELD.cell / PIXEL_FIELD.width * 100}%`, height: `${115 / PIXEL_FIELD.height * 100}%` }}
          aria-label={`第${lane}路第${position}格，${units.map(unit => `${unit.name}${unit.id}`).join("、") || "空"}`}
          onClick={event => {
            const cell = { lane, position }, frame = usesReplica.current?simulation.current.frame(performance.now()):timeline.current.frame(performance.now());
            const bounds = canvas.current?.getBoundingClientRect();
            const hit = event.detail && bounds ? pixelUnitsAtPoint(frame.units,
              (event.clientX - bounds.left) * PIXEL_FIELD.width / bounds.width,
              (event.clientY - bounds.top) * PIXEL_FIELD.height / bounds.height) : [];
            const chosen = hit.length ? hit : pixelUnitsInCell(frame.units, lane, position);
            const ids = chosen.map(unit => unit.unit.id);
            selectedIdsRef.current = ids; setSelectedIds(ids);
            selectedRef.current = ids.length ? null : cell; setSelected(cell); onSelect?.(cell);
          }} />;
      }))}
      {overlay}
    </div></div>
    <section className="snow-pixel-detail" aria-live="polite">
      <h3>{selectedIds.length ? "选中的小雪团" : selected ? `第${selected.lane}路 · 第${selected.position}格` : "点击格子，看看前线"}</h3>
      {selected || selectedIds.length ? selectedUnits.length ? selectedUnits.map(unit => <article className="snow-pixel-selected-unit" key={unit.id}>
        <SnowPixelPortrait type={unit.type} role={unit.role} /><div><strong>{unit.name}</strong><small>{unit.role === "attack" ? "进攻" : "防守"} · {unit.id}</small>
          <p>生命 {Math.ceil(unit.hp)} / {unit.maxHp}{unit.shield ? ` · 护盾 ${unit.shield}` : ""}{unit.blockedBy ? " · 正在交战" : ""}</p></div>
      </article>) : <p>{selectedIds.length ? "已离开当前战场视图。" : "当前格子为空。"}</p> : <p>红围巾是进攻方，蓝围巾是防守方。</p>}
    </section>
    <SnowPixelUnitGuide />
  </div>;
}
