import { useId } from "react";

/** All scenery uses one 640×224 grid. Responsive sizing scales this whole canvas. */
export function SnowStadium({ className = "" }: { className?: string }) {
  const id = useId();
  return <svg className={`snow-stadium ${className}`} viewBox="0 0 640 224" role="img"
    aria-label="雪松围起的像素雪堡赛场，蓝红两面小旗迎风展开" shapeRendering="crispEdges">
    <defs><pattern id={id} width="40" height="36" patternUnits="userSpaceOnUse">
      <path d="M6 8h3v3H6zM30 26h2v2h-2z" fill="#e7f3f0" />
    </pattern></defs>
    <path fill="#d8e9e7" d="M0 0h640v224H0z" />
    <path fill={`url(#${id})`} d="M0 0h640v224H0z" />
    <path fill="#70909a" d="M32 20h576v2H32z" />
    {[56,104,152,200,248,296,344,392,440,488,536,584].map((x,i)=><path key={`flag-${x}`} fill={i%2?"#f0bb69":"#d98573"} d={`M${x} 22h16v16h-4v4h-8v-4h-4z`} />)}
    <path fill="#eaf0dd" d="M20 25h28v4H20zm12-7h4v18h-4z" />
    <path fill="#eaf3ee" d="M402 32h30v8h22v8h-74v-8h22zm-300 6h30v8h26v8H82v-8h20z" />
    <path fill="#c1d9d5" d="M0 118h40v-8h40v8h40v-12h70v8h48v-8h48v12h54v-12h80v8h42v-8h68v12h70v-8h40v10h60v14H0z" />
    <path fill="#eef4e9" d="M0 154h70v-8h60v8h60v-6h80v6h90v-6h60v6h70v-8h70v8h80v70H0z" />
    <path fill="#d8e5dd" d="M44 176h552v4H44zm16 20h520v4H60z" />
    {[16, 72, 538, 594].map((x, i) => <g key={x} transform={`translate(${x} ${i % 2 ? 92 : 72})`}>
      <path fill="#486f62" d="M16 0h8v12h8v12h8v12h8v12H0V36h8V24h8z" />
      <path fill="#6c8d79" d="M16 12h8v12h8v12h8v4H8v-4h8z" />
      <path fill="#f3f4df" d="M16 0h8v12h8v4H8v-4h8zm-8 24h8v4h16v-4h8v12H0v-4h8z" />
      <path fill="#8f8872" d="M20 48h8v20h-8z" />
    </g>)}
    <path fill="#bacfc8" d="M216 190h216v8H216z" />
    <path fill="#a9bfb6" d="M254 90h128v100H254zM210 76h52v114h-52zM380 76h52v114h-52z" />
    <path fill="#e6eee2" d="M218 88h36v94h-36zM388 88h36v94h-36zM264 102h108v80H264z" />
    <path fill="#f9f5df" d="M206 70h14v14h14V70h14v14h14V70h6v24h-62zm170 0h14v14h14V70h14v14h14V70h6v24h-62zM258 94h120v12H258z" />
    <path fill="#bacfc8" d="M220 114h16v8h-16zm20 30h14v8h-14zm148-30h14v8h-14zm20 30h16v8h-16zm-140-25h20v4h-20zm32 24h32v4h-32zm36-24h28v4h-28z" />
    <path fill="#668781" d="M294 150h8v-8h32v8h8v40h-48z" />
    <path fill="#8eaaa0" d="M302 152h32v38h-32z" />
    <path fill="#c5a877" d="M314 154h4v36h-4z" />
    <path fill="#6c8371" d="M232 32h4v42h-4zM404 32h4v42h-4z" />
    <path fill="#ba6b50" d="M236 32h30v8h-6v8h-24z" />
    <path fill="#628f9d" d="M408 32h30v8h-6v8h-24z" />
    <g transform="translate(155 153)"><PixelSnowball color="coral" /></g>
    <g transform="translate(452 153)"><PixelSnowball color="blue" /></g>
    {[110,188,414,492].map((x,i)=><g key={`crowd-${x}`} transform={`translate(${x} 165) scale(.65)`}><g className="snow-crowd"><PixelSnowball color={i<2?"coral":"blue"} /></g></g>)}
    <path fill="#c98868" d="M128 208h64v4h-64z" /><path fill="#6d9cb4" d="M440 208h64v4h-64z" />
    <path fill="#f9f5df" d="M124 198h24v4h-24zm342 8h24v4h-24zM20 202h40v4H20zm548-20h42v4h-42z" />
  </svg>;
}

export function PixelMenuIcon({kind}:{kind:"overview"|"schedule"|"standings"|"teams"|"rules"}) {
  const paths={
    overview:["M3 8h3V4h4v4h4V4h4v4h3v13H3z","M6 11h12v8H6z","M10 15h4v6h-4z"],
    schedule:["M3 5h18v16H3zM6 2h3v7H6zm9 0h3v7h-3z","M5 10h14v9H5z","M7 12h3v2H7zm6 0h3v2h-3zm-6 4h3v2H7zm6 0h3v2h-3z"],
    standings:["M5 3h14v10h-3v3h-3v4h4v2H7v-2h4v-4H8v-3H5zM2 5h3v7H2zm17 0h3v7h-3z","M8 5h8v7h-3v2h-2v-2H8z","M9 6h2v4H9z"],
    teams:["M5 4h4v5H5zm10 0h4v5h-4zM2 12h10v9H2zm10 0h10v9H12z","M3 14h7v5H3zm11 0h7v5h-7z","M5 10h4v3H5zm10 0h4v3h-4z"],
    rules:["M3 4h8v2h2V4h8v16h-8v2h-2v-2H3z","M5 6h5v12H5zm9 0h5v12h-5z","M6 9h3v2H6zm0 4h3v2H6zm9-4h3v2h-3zm0 4h3v2h-3z"],
  }[kind];
  return <svg className="snow-menu-icon" viewBox="0 0 24 24" width="24" height="24" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d={paths[0]} /><path fill={kind==="standings"?"#f2c96e":"#edf8f5"} d={paths[1]} /><path fill={kind==="standings"?"#fff5ce":"#c98b65"} d={paths[2]} />
  </svg>;
}

export function PixelSnowball({ color = "blue" }: { color?: "blue" | "coral" | "green" }) {
  const base = { blue: "#618c9b", coral: "#bb7458", green: "#708c62" }[color];
  return <g shapeRendering="crispEdges">
    <path fill="#c0d3c3" d="M8 13h12v3h5v4h3v12h-3v5h-5v3H8v-3H3v-5H0V20h3v-4h5zM5 40h6v3H5zm13 0h6v3h-6z" />
    <path fill="#faf3dc" d="M8 15h12v3h5v14h-3v5H6v-5H3V20h5z" />
    <path fill="#4c6256" d="M9 23h2v3H9zm10 0h2v3h-2zm-5 7h3v1h-3zm3-2h1v2h-1z" />
    <path fill="#e8bfa6" d="M5 28h4v2H5zm16 0h4v2h-4z" />
    <path fill={base} d="M3 34h22v3H3zm18 3h4v6h-4zM9 9h12v5H9z" />
    <path fill="#f9f4df" d="M12 6h6v3h-6z" />
  </g>;
}

export function PixelEmblem({ variant = 0, size = 40 }: { variant?: number; size?: number }) {
  const index = ((variant % 5) + 5) % 5;
  const color = ["#6c9298", "#bd7959", "#7b906b", "#ac8a54", "#8b7da0"][index];
  const motif = [
    "M8 9h4v4h8V9h4v11h-4v5h-8v-5H8z",
    "M14 9h4v4h5v4h-3v3h-2v5h-4v-5h-2v-3H9v-4h5z",
    "M14 8h4v5l4-4 3 3-4 4h4v4h-5l4 4-3 3-3-4v4h-4v-4l-3 4-3-3 4-4H7v-4h5l-4-4 3-3 3 4z",
    "M8 11h13v2h5v9h-5v4H8zM21 16v3h2v-3zM10 7h2v3h-2zm5 0h2v3h-2z",
    "M8 11h4v4h2V9h4v6h2v-4h4v12H8zM10 25h12v2H10z",
  ][index];
  return <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
    <path fill={color} d="M4 2h24v2h2v18h-2v4h-4v2h-4v2h-8v-2H8v-2H4v-4H2V4h2z" />
    <path fill="#f6f1dc" fillRule="evenodd" d={motif} />
    {index===0&&<path fill={color} d="M14 17h4v8h-4z" />}
    <path fill="#e6c278" d="M14 3h4v6h-4zM11 5h10v2H11z" />
  </svg>;
}

export function PixelMember({variant=0}:{variant?:number}) {
  return <svg className="snow-member-marker" viewBox="0 0 32 48" width="22" height="33" aria-hidden="true" shapeRendering="crispEdges">
    <PixelSnowball color={variant%3===0?"blue":variant%3===1?"coral":"green"} />
  </svg>;
}

export function PixelTrophy({ size = 48 }: { size?: number }) {
  return <svg viewBox="0 0 32 36" width={size} height={size * 36 / 32} aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#b18c4a" d="M4 6h24v12h-4v4h-6v8h6v4H8v-4h6v-8H8v-4H4z" />
    <path fill="#e9cd7d" d="M8 2h16v14h-4v4h-8v-4H8z" />
    <path fill="#f7edbc" d="M10 4h4v10h-4z" />
    <path fill="#b18c4a" d="M0 6h8v4H4v6h6v4H4v-4H0zm24 0h8v10h-4v4h-6v-4h6v-6h-4z" />
    <path fill="#e9cd7d" d="M8 30h16v2H8z" />
  </svg>;
}
