import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import "./mooncake-diy.css";
import "./mooncake-memorial.css";
import { createMidAutumnCommand, runMidAutumnCommand, MidAutumnRejectedError, type MidAutumnCommand, type MidAutumnView, type MidAutumnGift } from "../api";

const FILLINGS = [
  { name: "豆沙", color: "#8c4d58", light: "#bc7e82", note: "绵密红豆香" },
  { name: "莲蓉", color: "#b8945c", light: "#e0c89e", note: "清甜莲子香" },
  { name: "黑芝麻", color: "#575263", light: "#8e8395", note: "浓郁芝麻香" },
  { name: "五仁", color: "#9c7351", light: "#d4b584", note: "果仁满满" },
] as const;
const SHAPES = ["圆月", "花朵", "玉兔"] as const;
const PATTERNS = [
  "无",
  "乌萨奇",
  "小熊",
  "Hello Kitty",
  "狐狸",
  "樱花",
  "小雏菊",
  "桂枝",
  "足印",
  "星星",
  "弯月",
  "星月",
  "流云",
  "自嘲熊",
  "小八",
  "布丁狗",
  "大耳狗",
  "美乐蒂",
] as const;
const TABS = ["口味", "外形", "印纹", "火候"] as const;
type Tab = (typeof TABS)[number];
type Shape = (typeof SHAPES)[number];
type Pattern = (typeof PATTERNS)[number];
interface Cake {
  filling: number;
  yolk: boolean;
  shape: Shape;
  pattern: Pattern;
  bake: number;
}
const INITIAL_CAKE: Cake = { filling: 1, yolk: true, shape: "圆月", pattern: "无", bake: 40 };
const SLOTS = ["一", "二", "三", "四"] as const;
const SENT_GIFT_IN_TRANSIT = "你的礼盒正在龟速运输中，明天一定能准时送达";
const SENT_GIFT_DELIVERED = "你的月饼礼盒已经准时送达。";

interface StampLayout {
  x: number;
  y: number;
  scale: number;
}
type StampLayouts = Record<string, StampLayout>;
const APPROVED_STAMP_LAYOUTS: StampLayouts = {
  "圆月:乌萨奇": {
    x: 122.04819758884786,
    y: 83.31510593181198,
    scale: 1.57,
  },
  "花朵:乌萨奇": {
    x: 120,
    y: 91.23547591824334,
    scale: 1.69,
  },
  "玉兔:乌萨奇": {
    x: 120.02017928658964,
    y: 106.09375370776738,
    scale: 2.1,
  },
  "花朵:小熊": {
    x: 117.85595079985139,
    y: 88.78369259760281,
    scale: 1.66,
  },
  "圆月:小熊": {
    x: 117.96693687609437,
    y: 76.31793830685636,
    scale: 1.67,
  },
  "玉兔:小熊": {
    x: 115.12165746695597,
    y: 103.94970450761875,
    scale: 2.16,
  },
  "玉兔:Hello Kitty": {
    x: 118.51177761401449,
    y: 111.63296787662192,
    scale: 1.95,
  },
  "花朵:Hello Kitty": {
    x: 119.67713141456585,
    y: 97.319530825018,
    scale: 1.44,
  },
  "圆月:Hello Kitty": {
    x: 119.6468624846814,
    y: 87.56284575892994,
    scale: 1.44,
  },
  "玉兔:狐狸": {
    x: 124.61096698573138,
    y: 102.35049604539026,
    scale: 2.03,
  },
  "玉兔:樱花": {
    x: 116.96301736826007,
    y: 108.04105486366706,
    scale: 2.07,
  },
  "玉兔:小雏菊": {
    x: 117.60370971748095,
    y: 111.52198180037894,
    scale: 2.09,
  },
  "玉兔:桂枝": {
    x: 127.38561889180606,
    y: 110.30617978335349,
    scale: 1.97,
  },
  "玉兔:足印": {
    x: 119.9445069618785,
    y: 113.3936106315675,
    scale: 2.13,
  },
  "玉兔:星星": {
    x: 121.84640472295152,
    y: 106.60832551580305,
    scale: 2.08,
  },
  "玉兔:弯月": {
    x: 107.66541107208619,
    y: 115.1744326731027,
    scale: 2.11,
  },
  "玉兔:星月": {
    x: 120.59024413274679,
    y: 112.05673289500425,
    scale: 2.16,
  },
  "玉兔:流云": {
    x: 119.77298302586662,
    y: 109.4283808167044,
    scale: 2.17,
  },
  "玉兔:自嘲熊": {
    x: 119.67713141456585,
    y: 114.49842657234996,
    scale: 1.85,
  },
  "玉兔:小八": {
    x: 119.21805264465168,
    y: 110.2607763885268,
    scale: 1.93,
  },
  "玉兔:布丁狗": {
    x: 119.30381461265762,
    y: 108.87345043548947,
    scale: 1.89,
  },
  "玉兔:大耳狗": {
    x: 120.10594125459558,
    y: 104.87290686909452,
    scale: 2.03,
  },
  "玉兔:美乐蒂": {
    x: 124.24773982711797,
    y: 107.2944212598506,
    scale: 2.03,
  },
  "花朵:美乐蒂": {
    x: 120,
    y: 98.66649820487609,
    scale: 1.6,
  },
  "花朵:大耳狗": {
    x: 120.64069234922088,
    y: 95.5387087834828,
    scale: 1.43,
  },
  "花朵:布丁狗": {
    x: 118.72870494485305,
    y: 94.98882322391528,
    scale: 1.48,
  },
  "花朵:小八": {
    x: 120,
    y: 103,
    scale: 1.31,
  },
  "花朵:自嘲熊": {
    x: 120,
    y: 103,
    scale: 1.31,
  },
  "花朵:流云": {
    x: 120,
    y: 95.98265308845475,
    scale: 1.85,
  },
  "花朵:星月": {
    x: 120,
    y: 103,
    scale: 1.65,
  },
  "花朵:弯月": {
    x: 111.56505820553296,
    y: 100.89126455138324,
    scale: 1.61,
  },
  "花朵:星星": {
    x: 123.70289908919784,
    y: 96.55271793461192,
    scale: 1.71,
  },
  "花朵:足印": {
    x: 120,
    y: 103,
    scale: 1.73,
  },
  "花朵:桂枝": {
    x: 134.08514203956457,
    y: 94.07066568408693,
    scale: 1.65,
  },
  "花朵:小雏菊": {
    x: 115.974232325368,
    y: 97.40024797137656,
    scale: 1.73,
  },
  "花朵:樱花": {
    x: 118.9405874540442,
    y: 96.3610147120104,
    scale: 1.63,
  },
  "花朵:狐狸": {
    x: 124.6261014506736,
    y: 91.52303075214563,
    scale: 1.57,
  },
  "圆月:狐狸": {
    x: 126.20513062631247,
    y: 80.9036811843507,
    scale: 1.52,
  },
  "圆月:樱花": {
    x: 120,
    y: 83.48662986782386,
    scale: 1.6,
  },
  "圆月:小雏菊": {
    x: 117.26066184545718,
    y: 85.53482745667172,
    scale: 1.7,
  },
  "圆月:桂枝": {
    x: 132.58178518863684,
    y: 87.54266647234031,
    scale: 1.65,
  },
  "圆月:足印": {
    x: 120.7718577120535,
    y: 85.8173374689266,
    scale: 1.7,
  },
  "圆月:星星": {
    x: 123.15805835127773,
    y: 84.21308418505069,
    scale: 1.64,
  },
  "圆月:弯月": {
    x: 112.4125882422976,
    y: 86.5286573212112,
    scale: 1.63,
  },
  "圆月:星月": {
    x: 125.49381077402786,
    y: 85.93336836681699,
    scale: 1.65,
  },
  "圆月:流云": {
    x: 119.67713141456585,
    y: 81.45356674391823,
    scale: 1.68,
  },
  "圆月:自嘲熊": {
    x: 120.43889948332455,
    y: 89.23772654586958,
    scale: 1.34,
  },
  "圆月:小八": {
    x: 120.76176806875868,
    y: 87.48717343421882,
    scale: 1.38,
  },
  "圆月:布丁狗": {
    x: 119.65695212797623,
    y: 83.38068861322829,
    scale: 1.35,
  },
  "圆月:大耳狗": {
    x: 118.62276369025747,
    y: 84.43505633753666,
    scale: 1.44,
  },
  "圆月:美乐蒂": {
    x: 120.52466145133049,
    y: 83.35546450499125,
    scale: 1.45,
  },
};
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
function defaultLayout(shape: Shape): StampLayout {
  return { x: 120, y: shape === "玉兔" ? 140 : 103, scale: 1 };
}

export function cakeName(cake: Cake) {
  return `${cake.yolk ? "蛋黄" : ""}${FILLINGS[cake.filling]?.name ?? "豆沙"}月饼`;
}

const STAMP_ASSETS: Record<Exclude<Pattern, "无">, string> = {
  乌萨奇: "usagi",
  小熊: "bear",
  "Hello Kitty": "hello-kitty",
  狐狸: "fox",
  樱花: "sakura",
  小雏菊: "daisy",
  桂枝: "osmanthus",
  足印: "paw",
  星星: "star",
  弯月: "moon",
  星月: "star-moon",
  流云: "cloud",
  自嘲熊: "nagano",
  小八: "hachiware",
  布丁狗: "pompompurin",
  大耳狗: "cinnamoroll",
  美乐蒂: "my-melody",
};

function Stamp({ pattern }: { pattern: Pattern }) {
  const id = useId().replaceAll(":", "");
  if (pattern === "无") return null;
  return (
    <>
      <defs>
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          x="65"
          y="65"
          width="110"
          height="110"
          style={{ maskType: "alpha" }}
        >
          <image
            href={`/mid-autumn/diy/stamp-${STAMP_ASSETS[pattern]}-v2.png`}
            x="65"
            y="65"
            width="110"
            height="110"
          />
        </mask>
      </defs>
      <rect x="65" y="65" width="110" height="110" mask={`url(#${id})`} fill="currentColor" />
    </>
  );
}

export function GiftCakeArt({ cake }: { cake: Cake }) {
  return <CakeArt cake={cake} layout={APPROVED_STAMP_LAYOUTS[`${cake.shape}:${cake.pattern}`] ?? defaultLayout(cake.shape)} />;
}

function CakeArt({
  cake,
  cut = false,
  layout = defaultLayout(cake.shape),
  onMove,
}: {
  cake: Cake;
  cut?: boolean;
  layout?: StampLayout;
  onMove?: (layout: StampLayout) => void;
}) {
  const colorId = useId().replaceAll(":", "");
  const drag = useRef<{ x: number; y: number; layout: StampLayout } | null>(null);
  const shapeAssets = { 圆月: "round", 花朵: "flower", 玉兔: "rabbit" };
  const flavors = ["redbean", "lotus", "sesame", "nuts"];
  const source = cut
    ? `/mid-autumn/diy/cut-${flavors[cake.filling]}-${cake.yolk ? "yolk" : "plain"}-v1.png`
    : `/mid-autumn/diy/cake-${shapeAssets[cake.shape]}-v1.png`;
  const browned = Math.max(0, (cake.bake - 40) / 60);
  const pale = Math.max(0, (40 - cake.bake) / 40) * 0.14;
  return (
    <svg
      viewBox="0 0 240 240"
      role="img"
      className={onMove && cake.pattern !== "无" ? "moon-diy-editable-art" : undefined}
      onPointerDown={
        onMove && cake.pattern !== "无"
          ? (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, layout: { ...layout } };
            }
          : undefined
      }
      onPointerMove={
        onMove
          ? (event) => {
              if (!drag.current) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              onMove({
                ...drag.current.layout,
                x: drag.current.layout.x + ((event.clientX - drag.current.x) * 240) / bounds.width,
                y: drag.current.layout.y + ((event.clientY - drag.current.y) * 240) / bounds.height,
              });
            }
          : undefined
      }
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      aria-label={`${cakeName(cake)}${cut ? "切面" : `，${cake.shape}形，${cake.pattern === "无" ? "无压花" : cake.pattern + "印纹"}`}`}
    >
      <defs>
        <filter id={colorId} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={1 - pale - browned * 0.08} intercept={pale} />
            <feFuncG type="linear" slope={1 - pale - browned * 0.25} intercept={pale} />
            <feFuncB type="linear" slope={1 - pale - browned * 0.42} intercept={pale} />
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        href={source}
        x="0"
        y="0"
        width="240"
        height="240"
        filter={cut ? undefined : `url(#${colorId})`}
      />
      {!cut && cake.pattern !== "无" && (
        <g
          transform={`translate(${layout.x} ${layout.y}) scale(${layout.scale * (cake.shape === "玉兔" ? 0.82 : 0.96)} ${layout.scale * (cake.shape === "玉兔" ? 0.65 : 0.79)}) translate(-120 -120)`}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g
            style={{
              color: `rgb(${Math.round(166 - browned * 61)}, ${Math.round(105 - browned * 47)}, ${Math.round(48 - browned * 19)})`,
            }}
            opacity=".88"
          >
            <Stamp pattern={cake.pattern} />
          </g>
          {onMove && (
            <rect
              x="65"
              y="65"
              width="110"
              height="110"
              stroke="#ae6f81"
              strokeWidth="1"
              strokeDasharray="4 4"
              fill="none"
              pointerEvents="none"
            />
          )}
        </g>
      )}
    </svg>
  );
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

export function MooncakeGifts({ gifts, memorial = false, onBack }: { gifts: MidAutumnGift[]; memorial?: boolean; onBack: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [paperHeight, setPaperHeight] = useState(844);
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, gifts.length - 1));
  const gift = gifts[currentPage];
  useEffect(() => {
    if (!frame.current || !paper.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / 390);
    });
    const paperObserver = new ResizeObserver(([entry]) => {
      if (entry) setPaperHeight((entry.target as HTMLElement).offsetHeight);
    });
    observer.observe(frame.current);
    paperObserver.observe(paper.current);
    return () => { observer.disconnect(); paperObserver.disconnect(); };
  }, []);
  const giftLabel = gift?.side === "ai" ? "TA 送来的礼盒" : "送给 TA 的礼盒";
  return (
    <div className="moon-memorial-viewport">
      <div className="moon-memorial-frame" ref={frame}>
        <div className="moon-memorial-space" style={{ height: paperHeight * scale }}>
          <main className="moon-memorial-paper" ref={paper} style={{ transform: `scale(${scale})` }} aria-label={memorial ? "中秋纪念册" : "月饼礼盒"}>
            <header className="moon-memorial-heading">
              <button type="button" className="moon-memorial-back" onClick={onBack} aria-label="返回">‹</button>
              <p>2026 · 中秋特别活动</p>
              <h1>月满心间</h1>
            </header>
            <p className="moon-memorial-dates">2026.09.24 — 09.26</p>
            <figure className="moon-memorial-photo">
              <img src="/mid-autumn/diy/event-home-selected.png" alt="月满心间活动的月夜桂花庭院" />
              <figcaption>月色与你，皆是良辰。</figcaption>
            </figure>
            {gift ? (
              <section className="moon-memorial-keepsake" key={gift.id} aria-label={giftLabel}>
                <blockquote className="moon-memorial-letter">
                  <h2>{gift.side === "ai" ? "TA 的来信" : "写给 TA 的信"}</h2>
                  <p>{gift.letter || "无赠言"}</p>
                  {gift.sentAt !== null && <footer><time dateTime={new Date(gift.sentAt).toISOString()}>{new Date(gift.sentAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })}</time></footer>}
                </blockquote>
                <div className="moon-memorial-collage">
                  <img className="moon-memorial-lid" src="/mid-autumn/diy/gift-lid-v1.png" alt="" />
                  <img className="moon-memorial-seal" src="/mid-autumn/diy/handmade-seal-v1.png" alt="手作" />
                  <div className="moon-memorial-box" role="group" aria-label="四格月饼礼盒">
                    <img className="moon-memorial-box-base" src="/mid-autumn/diy/gift-base-v1.png" alt="" />
                    <div className="moon-memorial-box-slots">
                      {gift.cakes.map((item, index) => (
                        <div className="moon-memorial-box-slot" key={item.id} aria-label={`礼盒第${index + 1}格`}>
                          <CakeArt cake={item.cake} layout={APPROVED_STAMP_LAYOUTS[`${item.cake.shape}:${item.cake.pattern}`] ?? defaultLayout(item.cake.shape)} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <h2 className="moon-memorial-gift-label">{giftLabel}</h2>
                </div>
              </section>
            ) : <p className="moon-memorial-empty">这里还没有赠送的月饼礼盒。</p>}
            {gifts.length > 1 && <nav className="moon-memorial-pages" aria-label="礼盒翻页">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="上一盒">‹</button>
              <span aria-live="polite">{currentPage + 1} / {gifts.length}</span>
              <button type="button" disabled={currentPage === gifts.length - 1} onClick={() => setPage(currentPage + 1)} aria-label="下一盒">›</button>
            </nav>}
          </main>
        </div>
      </div>
    </div>
  );
}
