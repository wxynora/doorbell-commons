import { type CSSProperties, useEffect, useRef, useState } from "react";
import "./mooncake-fonts.css";
import "./mooncake-diy.css";
import { APPROVED_STAMP_LAYOUTS, CakeArt, cakeName, defaultLayout, FILLINGS, PATTERNS, SHAPES, Stamp, type Cake, type StampLayout, type StampLayouts } from "./mooncake-art";
import { createMidAutumnCommand, runMidAutumnCommand, MidAutumnRejectedError, type MidAutumnCommand, type MidAutumnView } from "../api";

const TABS = ["口味", "外形", "印纹", "火候"] as const;
type Tab = (typeof TABS)[number];
const INITIAL_CAKE: Cake = { filling: 1, yolk: true, shape: "圆月", pattern: "无", bake: 40 };
const SLOTS = ["一", "二", "三", "四"] as const;
const SENT_GIFT_IN_TRANSIT = "你的礼盒正在龟速运输中，明天一定能准时送达";
const SENT_GIFT_DELIVERED = "你的月饼礼盒已经准时送达。";

const EDITOR_ENABLED =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("diyLayoutEditor") === "1";
function readLayouts(): StampLayouts {
  if (!EDITOR_ENABLED) return { ...APPROVED_STAMP_LAYOUTS };
  try {
    const parsed: unknown = JSON.parse(
      new URLSearchParams(window.location.search).get("diyStampLayout") ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { ...APPROVED_STAMP_LAYOUTS };
    return {
      ...APPROVED_STAMP_LAYOUTS,
      ...Object.fromEntries(
        Object.entries(parsed).filter(
          ([, item]) =>
            item &&
            Number.isFinite(item.x) &&
            Number.isFinite(item.y) &&
            Number.isFinite(item.scale) &&
            item.scale > 0,
        ),
      ),
    };
  } catch {
    return { ...APPROVED_STAMP_LAYOUTS };
  }
}
export function MooncakeDiy({ onBack, live }: { onBack: () => void; live?: { view: MidAutumnView; refresh: () => Promise<MidAutumnView> } }) {
  const [cake, setCake] = useState<Cake>(() =>
    EDITOR_ENABLED ? { ...INITIAL_CAKE, pattern: "乌萨奇" } : INITIAL_CAKE,
  );
  const [tab, setTab] = useState<Tab>(EDITOR_ENABLED ? "印纹" : "口味");
  const [box, setBox] = useState<(Cake | null)[]>([null, null, null, null]);
  const [cakeIds, setCakeIds] = useState<(string | null)[]>([null, null, null, null]);
  const [packedId, setPackedId] = useState<string | null>(null);
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef<{ command: MidAutumnCommand; done: (result: Record<string, unknown>) => void } | null>(null);
  const restored = useRef(false);
  const [slot, setSlot] = useState(0);
  const [notice, setNotice] = useState("");
  const [packing, setPacking] = useState<"idle" | "gather" | "lid" | "ribbon" | "done">("idle");
  const [sentLocally, setSentLocally] = useState(false);
  const options = live?.view.options;
  const sentGift = live?.view.gifts.find((gift) => gift.side === "human" && gift.status === "sent");
  const sent = sentLocally || !!sentGift;
  const sentMessage = live?.view.deliveryAt && Date.now() >= live.view.deliveryAt
    ? SENT_GIFT_DELIVERED
    : SENT_GIFT_IN_TRANSIT;
  const canCraft = !sent && (!live || (live.view.phase === "open" && !!options?.fillings.length && !!options.shapes.length));
  useEffect(() => {
    if (!live || restored.current) return;
    restored.current = true;
    const savedGift = live.view.gifts.find((gift) => gift.side === "human" && (gift.status === "sent" || gift.status === "packed"));
    const saved = savedGift?.cakes ?? live.view.cakes ?? [];
    setBox(SLOTS.map((_, i) => saved[i]?.cake ?? null));
    setCakeIds(SLOTS.map((_, i) => saved[i]?.id ?? null));
    if (savedGift) {
      setPackedId(savedGift.id);
      setLetter(savedGift.letter);
      setPacking("done");
      setSentLocally(savedGift.status === "sent");
    }
  }, [live]);
  useEffect(() => {
    if (!options) return;
    setCake((old) => ({ ...old,
      filling: options.fillings.some((item) => item.id === old.filling) ? old.filling : options.fillings[0]?.id ?? 0,
      shape: options.shapes.includes(old.shape) ? old.shape : options.shapes[0] ?? "圆月",
      pattern: options.patterns.includes(old.pattern) ? old.pattern : "无",
      yolk: options.yolk && old.yolk,
      bake: Math.max(options.bake.min, Math.min(options.bake.max, old.bake)),
    }));
  }, [options]);
  const performPending = async () => {
    if (!pending.current || busyRef.current || !live) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await runMidAutumnCommand<Record<string, unknown>>(pending.current.command);
      pending.current.done(result);
      pending.current = null;
      // The mutation is confirmed already. A failed read must not turn it back
      // into an uncertain write or offer another purchase/gift attempt.
      await live.refresh().catch(() => { setNotice("操作已完成，最新状态暂未刷新。"); });
    } catch (error) {
      if (error instanceof MidAutumnRejectedError) pending.current = null;
      setNotice(error instanceof Error ? error.message : "操作尚未确认，请重试同一次操作。");
    } finally { busyRef.current = false; setBusy(false); }
  };
  const submit = (op: string, args: Record<string, unknown>, done: (result: Record<string, unknown>) => void) => {
    if (pending.current || busyRef.current || live?.view.phase !== "open") return;
    pending.current = { command: createMidAutumnCommand(op, args), done };
    void performPending();
  };
  const packageOpen = packing !== "idle";
  const unpackRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!packageOpen || sent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPacking("done");
      return;
    }
    const timers = [
      window.setTimeout(() => setPacking("lid"), 700),
      window.setTimeout(() => setPacking("ribbon"), 1450),
      window.setTimeout(() => setPacking("done"), 2200),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [packageOpen, sent]);
  useEffect(() => {
    if (packing === "done") unpackRef.current?.focus();
  }, [packing]);
  const [scale, setScale] = useState(1);
  const [layouts, setLayouts] = useState<StampLayouts>(readLayouts);
  const [editorNotice, setEditorNotice] = useState("");
  const layoutKey = `${cake.shape}:${cake.pattern}`;
  const currentLayout = layouts[layoutKey] ?? defaultLayout(cake.shape);
  const updateLayout = (value: StampLayout) => {
    setLayouts((old) => {
      const next = { ...old, [layoutKey]: value };
      const url = new URL(window.location.href);
      url.searchParams.set("diyStampLayout", JSON.stringify(next));
      window.history.replaceState(null, "", url);
      return next;
    });
    setEditorNotice("");
  };
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(entry.contentRect.width / 390, entry.contentRect.height / 844));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const update = (change: Partial<Cake>) => {
    setCake((old) => ({ ...old, ...change }));
    setNotice("");
  };
  const save = () => {
    if (!canCraft || sent) return;
    const savedCake = { ...cake }, savedSlot = slot;
    const done = (result: Record<string, unknown>) => {
      setBox((old) => old.map((item, index) => (index === savedSlot ? savedCake : item)));
      setCakeIds((old) => old.map((item, index) => index === savedSlot ? String(result.cakeId) : item));
      setNotice(`已放入第${SLOTS[savedSlot]}格`);
      const empty = box.findIndex((item, index) => !item && index !== savedSlot);
      if (empty >= 0) setSlot(empty);
    };
    if (live) submit("cook", { cake: savedCake, ...(cakeIds[savedSlot] ? { replaceCakeId: cakeIds[savedSlot] } : {}) }, done); else done({ cakeId: "preview" });
  };
  return (
    <div className="moon-diy-viewport">
      <div ref={frame} className="moon-diy-frame">
        <main
          className="moon-diy-stage"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div inert={packing !== "idle" || sent}>
            <header className="moon-diy-header">
              <button
                type="button"
                className="moon-diy-back"
                disabled={busy}
                onClick={onBack}
                aria-label="返回活动主页"
              >
                ‹
              </button>
              <div>
                <p>中秋 · 食材工坊</p>
                <h1>月饼作坊</h1>
              </div>
              <img
                className="moon-diy-seal"
                src="/mid-autumn/diy/handmade-seal-v1.png"
                alt="手作"
              />
            </header>
            <section className="moon-diy-art" aria-label="月饼实时预览">
              <div className="moon-diy-plate">
                <CakeArt
                  cake={cake}
                  layout={currentLayout}
                  {...(EDITOR_ENABLED ? { onMove: updateLayout } : {})}
                />
              </div>
              <div className="moon-diy-cut">
                <CakeArt cake={cake} cut />
              </div>
            </section>
            <div className="moon-diy-name">
              <h2>{cakeName(cake)}</h2>
              <p>
                {cake.shape} · {cake.pattern === "无" ? "未压花" : `${cake.pattern}纹`} ·{" "}
                {cake.bake < 33 ? "浅烘" : cake.bake < 67 ? "金黄" : "焦香"}
              </p>
            </div>
            <section className="moon-diy-options" aria-label="制作月饼">
              <div className="moon-diy-tabs" role="tablist" aria-label="制作步骤">
                {TABS.map((item) => (
                  <button
                    type="button"
                    key={item}
                    role="tab"
                    id={`diy-tab-${item}`}
                    aria-controls="diy-options"
                    aria-selected={tab === item}
                    onClick={() => setTab(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div
                className="moon-diy-tab-content"
                id="diy-options"
                role="tabpanel"
                aria-labelledby={`diy-tab-${tab}`}
              >
                {tab === "口味" && (
                  <>
                    <div className="moon-diy-fillings">
                      {FILLINGS.map((item, index) => (
                        <button
                          type="button"
                          key={item.name}
                          disabled={!!live && !options?.fillings.some((choice) => choice.id === index)}
                          aria-pressed={cake.filling === index}
                          onClick={() => update({ filling: index })}
                        >
                          <span
                            className="moon-diy-filling-dot"
                            style={
                              {
                                "--filling": item.color,
                                "--filling-light": item.light,
                              } as CSSProperties
                            }
                          />
                          <strong>{item.name}</strong>
                          <small>{item.note}</small>
                        </button>
                      ))}
                    </div>
                    <label className="moon-diy-yolk">
                      <span>
                        <strong>咸蛋黄</strong>
                      </span>
                      <input
                        type="checkbox"
                        checked={cake.yolk}
                        disabled={!!live && !options?.yolk}
                        onChange={(event) => update({ yolk: event.target.checked })}
                      />
                      <i aria-hidden="true" />
                    </label>
                  </>
                )}
                {tab === "外形" && (
                  <div className="moon-diy-shapes">
                    {SHAPES.map((shape) => (
                      <button
                        type="button"
                        key={shape}
                        disabled={!!live && !options?.shapes.includes(shape)}
                        aria-pressed={cake.shape === shape}
                        onClick={() => update({ shape })}
                      >
                        <CakeArt
                          cake={{ ...cake, shape }}
                          layout={layouts[`${shape}:${cake.pattern}`] ?? defaultLayout(shape)}
                        />
                        <strong>{shape}</strong>
                      </button>
                    ))}
                  </div>
                )}
                {tab === "印纹" && (
                  <div className="moon-diy-patterns">
                    {PATTERNS.map((pattern) => (
                      <button
                        type="button"
                        key={pattern}
                        disabled={!!live && !options?.patterns.includes(pattern)}
                        aria-pressed={cake.pattern === pattern}
                        onClick={() => update({ pattern })}
                      >
                        <svg viewBox="65 65 110 110" aria-hidden="true">
                          <g
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <Stamp pattern={pattern} />
                          </g>
                        </svg>
                        <strong>{pattern}</strong>
                      </button>
                    ))}
                  </div>
                )}
                {tab === "火候" && (
                  <div className="moon-diy-bake">
                    <label htmlFor="diy-bake">
                      烘烤深浅
                    </label>
                    <div className="moon-diy-bake-colors">
                      <i />
                      <i />
                      <i />
                    </div>
                    <input
                      id="diy-bake"
                      type="range"
                      min={options?.bake.min ?? 0}
                      max={options?.bake.max ?? 100}
                      disabled={!!live && (!options || options.bake.min === options.bake.max)}
                      value={cake.bake}
                      onChange={(event) => update({ bake: Number(event.target.value) })}
                    />
                    <div className="moon-diy-bake-labels">
                      <span>浅烘</span>
                      <span>金黄</span>
                      <span>焦香</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <section className="moon-diy-gift" aria-label="月饼礼盒">
              <header>
                <h3>月饼礼盒</h3>
                <span>{box.filter(Boolean).length} / 4</span>
              </header>
              <div className="moon-diy-slots">
                {SLOTS.map((number, index) => (
                  <button
                    type="button"
                    key={number}
                    aria-label={`礼盒第${number}格${box[index] ? `：${cakeName(box[index])}` : "：空位"}`}
                    aria-pressed={slot === index}
                    disabled={sent || busy || !!pending.current}
                    onClick={() => {
                      setSlot(index);
                      const saved = box[index];
                      if (saved) setCake({ ...saved });
                      setNotice("");
                    }}
                  >
                    {box[index] ? (
                      <CakeArt
                        cake={box[index]}
                        layout={
                          layouts[`${box[index].shape}:${box[index].pattern}`] ??
                          defaultLayout(box[index].shape)
                        }
                      />
                    ) : (
                      <>
                        <span className="moon-diy-slot-plus">＋</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              <button
                className="moon-diy-pack-button"
                type="button"
                onClick={save}
                disabled={!canCraft || sent || busy || !!pending.current}
              >
                {box[slot] ? "替换这一只" : "装入礼盒"}
              </button>
              <p className="moon-diy-slot-note">
                {box[slot] ? `正在改做第${SLOTS[slot]}格` : `放入第${SLOTS[slot]}格`}
              </p>
            </section>
            <footer className="moon-diy-footer">
              <p className="moon-diy-status" aria-live="polite" style={live ? { top: -28, width: "100%", height: "auto", margin: 0, clipPath: "none", whiteSpace: "normal", overflow: "visible", fontSize: 12 } : undefined}>{packing === "idle" ? notice : ""}</p>
              <button
                type="button"
                disabled={sent || busy || (!pending.current && (!box.every(Boolean) || (!!live && live.view.phase !== "open")))}
                onClick={() => pending.current ? void performPending() : live ? submit("pack", { cakeIds, letter }, (result) => { setPackedId(String(result.boxId)); setPacking("gather"); setNotice(""); }) : setPacking("gather")}
              >
                {pending.current ? "重试同一次操作" : "包装礼盒"}
              </button>
              {live && <textarea aria-label="写给 TA 的信" placeholder="写给 TA 的信（选填）" value={letter} disabled={sent || busy || !!pending.current}
                onChange={(event) => setLetter(event.target.value)}
                style={{ display: "block", boxSizing: "border-box", width: "100%", height: 32, marginTop: 6, resize: "none", border: "1px solid #baa899", borderRadius: 4, background: "#fffaf1", color: "#775f51", font: "inherit", fontSize: 12, padding: "5px 8px" }} />}
              {!canCraft && !sent && <p>请先收集并解锁对应食材。</p>}
            </footer>
          </div>
          {packing !== "idle" && (
            <section className={`moon-diy-pack-scene phase-${packing}${sent ? " is-sent" : ""}`} aria-label="礼盒包装">
              <header>
                <h2 aria-live="polite">
                  {packing === "gather"
                    ? "收拢月饼"
                    : packing === "lid"
                      ? "盖好盒子"
                      : packing === "ribbon"
                        ? "系上丝带"
                        : "礼盒包装好了"}
                </h2>
              </header>
              <div className="moon-diy-pack-box">
                <img
                  className="moon-diy-pack-base"
                  src="/mid-autumn/diy/gift-base-v1.png"
                  alt="四格水彩礼盒"
                />
                <div className="moon-diy-pack-cakes">
                  {box.map(
                    (saved, index) =>
                      saved && (
                        <div key={SLOTS[index]} style={{ "--order": index } as CSSProperties}>
                          <CakeArt
                            cake={saved}
                            layout={
                              layouts[`${saved.shape}:${saved.pattern}`] ??
                              defaultLayout(saved.shape)
                            }
                          />
                        </div>
                      ),
                  )}
                </div>
                <img
                  className="moon-diy-pack-lid"
                  src="/mid-autumn/diy/gift-lid-v1.png"
                  alt="月色桂花盒盖"
                />
                <img
                  className="moon-diy-pack-ribbon"
                  src="/mid-autumn/diy/gift-ribbon-v1.png"
                  alt="薄荷青丝带"
                />
              </div>
              <p className={sent ? "moon-diy-sent-caption" : undefined} role="status" style={{ position: "absolute", top: 584, left: 20, right: 20 }}>{sent ? sentMessage : notice}</p>
              {packing === "done" && live && !sent && <button type="button" style={{ top: 628 }} disabled={busy || (!pending.current && live.view.phase !== "open")} onClick={() => pending.current ? void performPending() : submit("send", { boxId: packedId }, () => { setSentLocally(true); setNotice(""); })}>{pending.current ? "重试同一次操作" : "赠送给 TA"}</button>}
              {sent ? (
                <button type="button" onClick={onBack}>返回活动主页</button>
              ) : (
                <button ref={unpackRef} type="button" disabled={busy || !!pending.current || (!!live && live.view.phase !== "open")} onClick={() => live ? submit("unpack", { boxId: packedId }, () => { setPackedId(null); setPacking("idle"); setNotice(""); }) : setPacking("idle")}>
                  {packing === "done" ? "拆开继续编辑" : "返回编辑"}
                </button>
              )}
            </section>
          )}
        </main>
      </div>
      {EDITOR_ENABLED && (
        <aside className="moon-diy-layout-editor" aria-label="印纹排版编辑器">
          <header>
            <strong>印纹排版 · 定稿用</strong>
            <span>
              {cake.shape} / {cake.pattern}
            </span>
          </header>
          <p>在月饼上拖动印纹；选别的饼形、纹样可分别调。</p>
          <label>
            大小{" "}
            <input
              aria-label="印纹大小"
              type="range"
              min="20"
              max="240"
              value={Math.round(currentLayout.scale * 100)}
              disabled={cake.pattern === "无"}
              onChange={(event) =>
                updateLayout({ ...currentLayout, scale: Number(event.target.value) / 100 })
              }
            />
            <output>{Math.round(currentLayout.scale * 100)}%</output>
          </label>
          <div className="moon-diy-editor-position">
            <label>
              X{" "}
              <input
                aria-label="印纹横向位置"
                type="number"
                value={Math.round(currentLayout.x)}
                onChange={(event) => {
                  if (event.target.value !== "")
                    updateLayout({ ...currentLayout, x: Number(event.target.value) });
                }}
              />
            </label>
            <label>
              Y{" "}
              <input
                aria-label="印纹纵向位置"
                type="number"
                value={Math.round(currentLayout.y)}
                onChange={(event) => {
                  if (event.target.value !== "")
                    updateLayout({ ...currentLayout, y: Number(event.target.value) });
                }}
              />
            </label>
            <button type="button" onClick={() => updateLayout(defaultLayout(cake.shape))}>
              居中重置
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(layouts, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "mooncake-stamp-layout.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setEditorNotice("布局已导出");
            }}
          >
            导出定稿布局
          </button>
          <small>{editorNotice || "调整已写入当前链接，刷新可恢复"}</small>
        </aside>
      )}
    </div>
  );
}
