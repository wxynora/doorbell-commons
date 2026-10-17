import { useId, useRef } from "react";

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
type Shape = (typeof SHAPES)[number];
type Pattern = (typeof PATTERNS)[number];
interface Cake {
  filling: number;
  yolk: boolean;
  shape: Shape;
  pattern: Pattern;
  bake: number;
}
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


export { FILLINGS, SHAPES, PATTERNS, APPROVED_STAMP_LAYOUTS, defaultLayout, CakeArt, Stamp };
export type { Cake, StampLayout, StampLayouts };
