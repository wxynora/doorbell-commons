import type { SnowDanmaku, SnowLiveSnapshot } from "@doorbell/protocol";
import { useLayoutEffect, useRef, useState } from "react";
import { SnowUnitSprite } from "./unit-sprite";

type Battle = NonNullable<SnowLiveSnapshot["battle"]>;
type Cell = { lane: number; position: number };
export const SNOW_CANVAS = {
  width: 1120,
  height: 640,
  left: 110,
  cell: 74,
  laneTop: 112,
  laneGap: 156,
} as const;
const marks: Record<string, string> = {
  light_inf: "兵",
  heavy_t: "T",
  thrower: "投",
  march_medic: "医",
  scout: "影",
  hammer: "锤",
  shield_guard: "盾",
  heavy_guard: "重盾",
  crossbow: "弩",
  snow_mage: "术",
  artillery: "炮",
  medic: "医",
};

export function SnowBattleCanvas({
  battle,
  flying,
  onFinish,
  onSelect,
}: {
  battle: Battle;
  flying: SnowDanmaku[];
  onFinish(sequence: number): void;
  onSelect(cell: Cell): void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const previous = useRef<Battle | null>(null);
  const [hits, setHits] = useState<
    { id: string; tick: number; damage: number; x: number; y: number }[]
  >([]);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = battle;
    if (!before || before.id !== battle.id || battle.tick < before.tick) {
      setHits([]);
      return;
    }
    if (battle.tick === before.tick) return;
    const next = battle.units.flatMap((unit) => {
      const prior = before.units.find((value) => value.id === unit.id);
      if (!prior || prior.hp <= unit.hp) return [];
      const group = battle.units.filter(
        (value) =>
          value.lane === unit.lane &&
          value.position === unit.position &&
          value.ground === unit.ground,
      );
      const ordinal = group.findIndex((value) => value.id === unit.id);
      const columns = Math.ceil(Math.sqrt(group.length));
      const size = Math.min(34, 60 / columns);
      return [
        {
          id: unit.id,
          tick: battle.tick,
          damage: prior.hp - unit.hp,
          x:
            SNOW_CANVAS.left +
            (unit.position - 1) * SNOW_CANVAS.cell +
            7 +
            size * ((ordinal % columns) + 0.5),
          y:
            SNOW_CANVAS.laneTop +
            (unit.lane - 1) * SNOW_CANVAS.laneGap +
            (unit.ground ? 59 : 7) +
            size * (Math.floor(ordinal / columns) + 0.5),
        },
      ];
    });
    if (next.length) setHits(next);
  }, [battle]);
  const [width, setWidth] = useState(0),
    [zoom, setZoom] = useState(1),
    [showDanmaku, setShowDanmaku] = useState(true);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);
  const scale = (width / SNOW_CANVAS.width) * zoom;
  return (
    <>
      <div className="snow-live-canvas-toolbar">
        <span>
          <i className="snow-live-key snow-live-key--attack" />
          进攻 <i className="snow-live-key snow-live-key--defend" />
          防守
        </span>
        <div>
          <button type="button" onClick={() => setZoom((value) => (value === 1 ? 2 : 1))}>
            {zoom === 1 ? "放大看" : "看全场"}
          </button>
          <button
            type="button"
            aria-pressed={showDanmaku}
            onClick={() => setShowDanmaku((value) => !value)}
          >
            弹幕{showDanmaku ? "开" : "关"}
          </button>
        </div>
      </div>
      <div className="snow-live-canvas-scroll" ref={viewport}>
        <div
          style={{ width: width * zoom, height: SNOW_CANVAS.height * scale, position: "relative" }}
        >
          <div
            className="snow-live-logical-canvas"
            data-logical-canvas
            style={{
              width: SNOW_CANVAS.width,
              height: SNOW_CANVAS.height,
              transform: `scale(${scale})`,
            }}
          >
            <fieldset className="snow-live-fieldset" aria-label="雪堡战实时战场，三路十二格">
              <svg
                width={SNOW_CANVAS.width}
                height={SNOW_CANVAS.height}
                viewBox={`0 0 ${SNOW_CANVAS.width} ${SNOW_CANVAS.height}`}
                aria-hidden="true"
              >
                <defs>
                  <pattern id="snow-specks" width="37" height="37" patternUnits="userSpaceOnUse">
                    <circle cx="8" cy="11" r="1.6" fill="#fff" />
                  </pattern>
                  <filter id="snow-shadow">
                    <feDropShadow
                      dx="0"
                      dy="3"
                      stdDeviation="3"
                      floodColor="#718fa0"
                      floodOpacity=".15"
                    />
                  </filter>
                </defs>
                <rect width="1120" height="640" rx="24" fill="#e3eef1" />
                <rect width="1120" height="640" rx="24" fill="url(#snow-specks)" />
                <text x="40" y="43" className="snow-live-map-title">
                  雪堡前线
                </text>
                <text x="1080" y="43" textAnchor="end" className="snow-live-map-note">
                  点格子看单位
                </text>
                {Array.from({ length: 12 }, (_, index) => (
                  <text
                    key={index}
                    x={SNOW_CANVAS.left + (index + 0.5) * SNOW_CANVAS.cell}
                    y="81"
                    textAnchor="middle"
                    className="snow-live-map-number"
                  >
                    {index + 1}
                  </text>
                ))}
                {[1, 2, 3].map((lane) => {
                  const top = SNOW_CANVAS.laneTop + (lane - 1) * SNOW_CANVAS.laneGap;
                  return (
                    <g key={lane}>
                      <rect x="22" y={top + 45} width="1052" height="89" rx="25" fill="#f7fbfb" />
                      <text
                        x="65"
                        y={top + 98}
                        textAnchor="middle"
                        className="snow-live-lane-label"
                      >
                        {lane}路
                      </text>
                      {Array.from({ length: 12 }, (_, index) => {
                        const position = index + 1,
                          x = SNOW_CANVAS.left + index * SNOW_CANVAS.cell;
                        const units = battle.units.filter(
                          (unit) => unit.lane === lane && unit.position === position,
                        );
                        const renderUnit = (
                          unit: Battle["units"][number],
                          ordinal: number,
                          count: number,
                          high: boolean,
                        ) => {
                          const columns = Math.ceil(Math.sqrt(count)),
                            size = Math.min(34, 60 / columns);
                          const cx = x + 7 + size * ((ordinal % columns) + 0.5),
                            cy =
                              top + (high ? 7 : 59) + size * (Math.floor(ordinal / columns) + 0.5);
                          return (
                            <g
                              key={unit.id}
                              className={`snow-live-token snow-live-token--${unit.role}`}
                              transform={`translate(${cx},${cy})`}
                              pointerEvents="none"
                            >
                              <g
                                key={hits.find((hit) => hit.id === unit.id)?.tick ?? "idle"}
                                className={
                                  hits.some((hit) => hit.id === unit.id)
                                    ? "snow-live-hit-token"
                                    : undefined
                                }
                              >
                                <SnowUnitSprite type={unit.type} role={unit.role} size={size} />
                              </g>
                              <text
                                display="none"
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={size * 0.33}
                              >
                                {marks[unit.type] ?? unit.name.slice(0, 1)}
                              </text>
                              <rect
                                x={-size * 0.4}
                                y={size * 0.39}
                                width={size * 0.8}
                                height="4"
                                rx="2"
                                fill="#d9e1dc"
                              />
                              <rect
                                x={-size * 0.4}
                                y={size * 0.39}
                                width={(size * 0.8 * unit.hp) / unit.maxHp}
                                height="4"
                                rx="2"
                                fill="#79a889"
                              />
                            </g>
                          );
                        };
                        const ground = units.filter((unit) => unit.ground),
                          high = units.filter((unit) => !unit.ground);
                        return (
                          <g key={position}>
                            <rect
                              x={x + 3}
                              y={top + 52}
                              width="68"
                              height="73"
                              rx="10"
                              fill={battle.groundSlots.includes(position) ? "#e0ece5" : "#eef4f2"}
                              stroke="#d0dfde"
                            />
                            {battle.highSlots.includes(position) ? (
                              <>
                                <rect
                                  x={x + 3}
                                  y={top}
                                  width="68"
                                  height="42"
                                  rx="10"
                                  fill="#bfd5e3"
                                  stroke="#9fbccf"
                                />
                                <text
                                  x={x + 37}
                                  y={top + 27}
                                  textAnchor="middle"
                                  className="snow-live-platform-label"
                                >
                                  高台
                                </text>
                              </>
                            ) : null}
                            {ground.map((unit, ordinal) =>
                              renderUnit(unit, ordinal, ground.length, false),
                            )}
                            {high.map((unit, ordinal) =>
                              renderUnit(unit, ordinal, high.length, true),
                            )}
                          </g>
                        );
                      })}
                      <path
                        d={`M1020 ${top + 60}h58v54h-58zM1020 ${top + 60}v-12h12v12h12v-12h12v12h10v-12h12v12`}
                        fill="#b9cfda"
                        stroke="#809fae"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
                <g pointerEvents="none">
                  {hits.map((hit) => (
                    <g
                      key={`${battle.id}:${hit.id}:${hit.tick}`}
                      transform={`translate(${hit.x},${hit.y})`}
                    >
                      <g className="snow-live-hit-burst">
                        <circle r="24" fill="none" stroke="#fff5be" strokeWidth="4" />
                        <path
                          d="M-34 0h10M24 0h10M0-34v10M0 24v10M-24-24l7 7M17 17l7 7M24-24l-7 7M-17 17l-7 7"
                          stroke="#e4ab63"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </g>
                      <text
                        className="snow-live-hit-number"
                        textAnchor="middle"
                        y="-20"
                        onAnimationEnd={() =>
                          setHits((current) =>
                            current.filter(
                              (value) => value.id !== hit.id || value.tick !== hit.tick,
                            ),
                          )
                        }
                      >
                        −{hit.damage}
                      </text>
                    </g>
                  ))}
                </g>
                <text x="557" y="614" textAnchor="middle" className="snow-live-map-note">
                  进攻 → 雪堡
                </text>
              </svg>
              {[1, 2, 3].flatMap((lane) =>
                Array.from({ length: 12 }, (_, index) => {
                  const position = index + 1;
                  const units = battle.units.filter(
                    (unit) => unit.lane === lane && unit.position === position,
                  );
                  return (
                    <button
                      key={`${lane}:${position}`}
                      type="button"
                      className="snow-live-cell-hotspot"
                      style={{
                        left: SNOW_CANVAS.left + index * SNOW_CANVAS.cell,
                        top: SNOW_CANVAS.laneTop + (lane - 1) * SNOW_CANVAS.laneGap,
                        width: SNOW_CANVAS.cell,
                        height: 132,
                      }}
                      aria-label={`第${lane}路第${position}格，${units.map((unit) => `${unit.role === "attack" ? "进攻" : "防守"}${unit.name}${unit.id}`).join("、") || "空"}`}
                      onClick={() => onSelect({ lane, position })}
                    />
                  );
                }),
              )}
            </fieldset>
            <div
              className="snow-live-danmaku-layer"
              style={{ visibility: showDanmaku ? "visible" : "hidden" }}
              aria-hidden="true"
            >
              {flying.map((message) => (
                <div
                  className="snow-live-danmaku-line"
                  key={message.sequence}
                  style={{ top: 20 + (message.sequence % 4) * 44 }}
                  onAnimationEnd={() => onFinish(message.sequence)}
                >
                  <b>{message.senderName}</b> {message.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
