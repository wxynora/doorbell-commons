import { useEffect, useRef } from "react";
import { drawSnowPixelSprite } from "./pixel-scene";

export const PIXEL_UNIT_GUIDE = [
  { role: "attack", type: "light_inf", name: "雪地轻兵", mark: "绒球帽" },
  { role: "attack", type: "heavy_t", name: "厚甲先锋T", mark: "厚冰壳" },
  { role: "attack", type: "thrower", name: "远程投手", mark: "捧大雪球" },
  { role: "attack", type: "march_medic", name: "行军救护员", mark: "旅行药箱" },
  { role: "attack", type: "scout", name: "潜行斥候", mark: "尖兜帽" },
  { role: "attack", type: "hammer", name: "破阵重锤手", mark: "大木锤" },
  { role: "attack", type: "system_inf", name: "系统小兵", mark: "金色帽章" },
  { role: "defend", type: "shield_guard", name: "持盾卫兵", mark: "小圆盾" },
  { role: "defend", type: "heavy_guard", name: "重盾卫兵", mark: "大方盾" },
  { role: "defend", type: "crossbow", name: "弩手", mark: "大木弩" },
  { role: "defend", type: "snow_mage", name: "雪术师", mark: "高尖帽" },
  { role: "defend", type: "artillery", name: "雪炮台手", mark: "推小雪炮" },
  { role: "defend", type: "medic", name: "救护员", mark: "绿十字帽" },
] as const;

export function SnowPixelPortrait({ type, role }: { type: string; role: "attack" | "defend" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 48, 48); context.imageSmoothingEnabled = false;
    drawSnowPixelSprite(context, type, role, 0, false, 24, 28);
  }, [type, role]);
  return <canvas className="snow-pixel-portrait" ref={ref} width={48} height={48} aria-hidden="true" />;
}

export function SnowPixelUnitGuide() {
  return <details className="snow-pixel-unit-guide"><summary>兵种图鉴</summary>
    {(["attack", "defend"] as const).map(role => <section key={role} aria-label={role === "attack" ? "进攻方兵种" : "防守方兵种"}>
      <h3><span className={`snow-pixel-role snow-pixel-role--${role}`}>{role === "attack" ? "▶ 进攻" : "◇ 防守"}</span></h3>
      <div className="snow-pixel-guide-grid">{PIXEL_UNIT_GUIDE.filter(unit => unit.role === role).map(unit => <figure data-unit-type={unit.type} key={unit.type}>
        <SnowPixelPortrait type={unit.type} role={unit.role} /><figcaption><strong>{unit.name}</strong><span>{unit.mark}</span></figcaption>
      </figure>)}</div>
    </section>)}
  </details>;
}
