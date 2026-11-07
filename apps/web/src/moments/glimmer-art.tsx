import "./glimmer-art.css";

export type GlimmerScene = "encounter" | "caught" | "escaped" | "general";

/* All pieces live on the same 320 × 96 pixel canvas. */
function Tree({ x, y, crown, light, trunk }: { x: number; y: number; crown: string; light: string; trunk: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M13 28h8v17h-8z" fill={trunk} />
    <path d="M4 28v-5H1v-8h4V9h5V4h14v5h5v6h4v8h-3v5H4z" fill={crown} />
    <path d="M6 19v-5h5v-4h9v4h5v5h-4v4H10v-4z" fill={light} />
    <rect x="5" y="24" width="5" height="3" fill={light} />
  </g>;
}

function Traveler({ x, y, cheer = false }: { x: number; y: number; cheer?: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="4" y="33" width="24" height="3" fill="#aa91a3" opacity=".35" />
    <path d="M6 29h7v5H5v-3h1zm12 0h7v2h1v3h-8z" fill="#685a6f" />
    <path d="M5 19h3v-3h15v3h3v11H5z" fill="#758ab0" />
    <path d="M8 18h15v11H8z" fill="#a3b5d1" />
    <rect x="10" y="20" width="11" height="8" fill="#f2d4a9" />
    <rect x="12" y="21" width="7" height="5" fill="#dcae84" />
    <rect x="3" y="22" width="4" height="6" fill="#f1c3ad" />
    {cheer ? <><path d="M23 22h4v-3h3v-3h3v-3h4v5h-4v3h-3v4h-7z" fill="#758ab0" /><rect x="34" y="10" width="4" height="4" fill="#f1c3ad" /></> : <rect x="24" y="22" width="4" height="6" fill="#f1c3ad" />}
    <path d="M6 7h3V4h13v3h3v10h-3v3H9v-3H6z" fill="#f5cfb8" />
    <path d="M5 8V5h3V2h15v3h3v10h-3v2h-3V9h-3v2h-5V9H9v8H6v-3H4V8z" fill="#66566e" />
    <path d="M10 4h10v2H10z" fill="#88728a" />
  </g>;
}

function Spark({ x, y, color = "#fff8dc" }: { x: number; y: number; color?: string }) {
  return <path d={`M${x + 3} ${y}h3v3h3v3h-3v3h-3V6H${x}V3h3z`} fill={color} />;
}

function Encounter() {
  return <>
    <rect width="320" height="96" fill="#f8e1ed" />
    <path d="M0 28h24v-7h22v6h26v7h27v-9h25v6h26v5h39v-8h23v4h31v-8h32v5h45v29H0z" fill="#e9c8e4" />
    <path d="M0 47h38v-5h32v5h31v-4h27v7h31v-4h33v5h42v-6h33v3h53v48H0z" fill="#d7bdd8" />
    <Tree x={-3} y={21} crown="#a383ad" light="#c9a9ca" trunk="#826d89" />
    <Tree x={66} y={25} crown="#b18db7" light="#d8b7d5" trunk="#917493" />
    <Tree x={260} y={22} crown="#aa88b4" light="#d3b2d0" trunk="#8c7290" />
    <Tree x={291} y={27} crown="#997fa8" light="#c4a7c9" trunk="#806c88" />
    <path d="M0 61h39v-5h39v5h42v-4h43v4h39v-5h43v4h39v-4h36v40H0z" fill="#d4b8c9" />
    <path d="M96 96v-5h10v-5h10v-5h11v-5h12v-5h11v-5h-14v-4h-13v-4h-12v-4h18v3h17v4h15v4h9v-4h16v-4h17v-3h20v4h-13v4h-15v4h-13v5h11v5h12v5h13v5h12v5h10v5z" fill="#f8e5d8" />
    <path d="M206 49h4v29h-4z" fill="#8a6d75" /><path d="M191 46h29l7 5-7 5h-29z" fill="#be8f91" />
    <path d="M198 50h15v2h-15z" fill="#f7dfca" />
    <Spark x={119} y={17} color="#fff8d8" /><Spark x={235} y={34} color="#fff6d5" />
    <rect x="95" y="39" width="3" height="3" fill="#fff9d9" /><rect x="175" y="35" width="3" height="3" fill="#fff9d9" />
    <rect x="249" y="19" width="3" height="3" fill="#fff9d9" /><rect x="143" y="48" width="2" height="2" fill="#fff9d9" />
    <Traveler x={40} y={55} />
    <path d="M18 83h3v-3h3v3h3v3h-9zm57 5h3v-3h3v3h3v3h-9zm196-5h3v-3h3v3h3v3h-9z" fill="#f5dfec" />
  </>;
}

function Escaped() {
  return <>
    <rect width="320" height="96" fill="#d9d9f3" />
    <path d="M0 34h23v-8h23v7h28v-6h24v8h27v-7h33v8h31v-6h26v4h39v-7h29v5h37v31H0z" fill="#bcbde4" />
    <path d="M0 48h32v-4h36v6h31v-5h41v5h36v-5h37v6h34v-5h39v4h34v46H0z" fill="#a8acd3" />
    <path d="M263 10h13v4h4v11h-4v4h-13v-4h-4V14h4z" fill="#f4e8da" />
    <path d="M271 9h8v5h4v12h-5v4h-7v-4h-3V14h3z" fill="#d9d9f3" />
    <Tree x={-7} y={27} crown="#858dbb" light="#a7aed5" trunk="#777d9c" />
    <Tree x={39} y={33} crown="#9298c4" light="#b5badc" trunk="#8284a6" />
    <path d="M0 64h45v-4h42v4h42v-4h42v5h36v-4h36v4h38v-4h39v35H0z" fill="#d5cfe5" />
    <path d="M0 82h49v-4h28v4h56v-3h42v4h46v-3h42v3h57v13H0z" fill="#e7dbe8" />
    <Traveler x={96} y={54} />
    <path d="M158 61h41v3h-41zm-3 3h3v19h-3zm44 0h3v7h-3zm-41 19h41v3h-41z" fill="#7f7693" />
    <path d="M161 64h35v19h-35z" fill="#e8e0ed" /><path d="M169 64h3v19h-3zm13 0h3v19h-3zm-21 8h35v3h-35z" fill="#a49ab3" />
    <path d="M202 70h4v3h4v3h4v9h-3v-7h-4v-3h-5z" fill="#7f7693" />
    <path d="M222 82h4v3h-4zm9-3h4v3h-4zm13 5h4v3h-4zm9-3h4v3h-4zm13 5h4v3h-4zm9-3h4v3h-4zm13 5h4v3h-4zm9-3h4v3h-4zm10 5h4v3h-4zm9-3h4v3h-4z" fill="#a79ab8" />
    <path d="M141 36h3v-3h3v3h3v3h-3v3h-3v-3h-3z" fill="#edf0fc" />
    <rect x="233" y="43" width="3" height="3" fill="#eee9f7" /><rect x="25" y="19" width="3" height="3" fill="#eee9f7" />
  </>;
}

function Caught() {
  return <>
    <rect width="320" height="96" fill="#ffead5" />
    <path d="M0 34h27v-6h31v7h29v-8h32v9h28v-6h35v7h31v-7h29v5h37v-7h41v31H0z" fill="#f4cfba" />
    <path d="M0 51h43v-6h36v5h39v-4h40v5h39v-4h41v5h42v-4h40v48H0z" fill="#e8bca6" />
    <path d="M43 12h15v3h4v14h-4v3H43v-3h-4V15h4z" fill="#fff2c1" />
    <Tree x={-4} y={28} crown="#c99499" light="#ebbdba" trunk="#9c777c" />
    <Tree x={290} y={27} crown="#c99499" light="#ebbdba" trunk="#9c777c" />
    <path d="M0 64h40v-4h43v4h40v-4h43v5h40v-4h40v4h35v-4h39v35H0z" fill="#f0d3b7" />
    <path d="M0 83h42v-4h45v4h41v-3h49v3h42v-4h42v4h59v13H0z" fill="#f9e5ca" />
    <path d="M138 55h5v-5h38v5h5v27h-5v4h-38v-4h-5z" fill="#a57261" />
    <path d="M144 57h36v23h-36z" fill="#fff4dc" />
    <path d="M154 68h3v-4h13v4h3v7h-3v3h-13v-3h-3z" fill="#d5a2a7" />
    <rect x="158" y="69" width="2" height="2" fill="#765d6c" /><rect x="167" y="69" width="2" height="2" fill="#765d6c" />
    <path d="M144 80h36v4h-36z" fill="#d6a789" /><path d="M149 51h26v3h-26z" fill="#e8bb96" />
    <Spark x={116} y={30} color="#fff8d0" /><Spark x={192} y={18} color="#fff8d0" /><Spark x={214} y={42} color="#fff8d0" />
    <path d="M231 30h4v4h4v3h4v4h-4v4h-4v4h-4v-4h-4v-4h-4v-4h4v-3h4z" fill="#fff8d0" />
    <rect x="137" y="22" width="4" height="4" fill="#fff7dd" /><rect x="155" y="35" width="4" height="4" fill="#eaa799" /><rect x="221" y="25" width="4" height="4" fill="#eaa799" />
    <Traveler x={242} y={54} cheer />
    <path d="M24 86h3v-3h3v3h3v3h-9zm69-4h3v-3h3v3h3v3h-9zm114 5h3v-3h3v3h3v3h-9z" fill="#eab197" />
  </>;
}

function General() {
  return <>
    <rect width="320" height="96" fill="#e7eef5" />
    <path d="M0 33h30v-6h31v7h28v-8h31v8h34v-6h31v7h29v-7h32v5h36v-6h38v34H0z" fill="#d0d6eb" />
    <path d="M0 49h43v-5h40v6h38v-4h43v5h43v-5h39v5h36v-4h38v49H0z" fill="#d7c4d3" />
    <path d="M26 16h17v-4h14v4h8v4H26zm182 2h12v-4h14v4h11v4h-37z" fill="#fff7ec" />
    <Tree x={-2} y={26} crown="#a994b0" light="#d1bcd0" trunk="#8e798d" />
    <Tree x={285} y={25} crown="#b49cac" light="#dbc0c7" trunk="#977f88" />
    <path d="M0 63h43v-4h39v5h43v-4h42v4h40v-4h41v5h39v-4h33v35H0z" fill="#ead0bc" />
    <path d="M0 83h39v-4h39v4h42v-3h48v4h47v-4h41v3h64v13H0z" fill="#f5e4cf" />
    <path d="M41 69h73v3H41zm6-7h4v17h-4zm21 0h4v17h-4zm21 0h4v17h-4zm21 0h4v17h-4z" fill="#bd9b8b" />
    <path d="M183 76h13v-4h34v4h13v5h-13v4h-34v-4h-13z" fill="#b5d3dd" />
    <path d="M201 77h20v2h-20zm25 3h8v2h-8z" fill="#eef6ed" />
    <path d="M130 78h3v-3h3v3h3v3h-9zm23 9h3v-3h3v3h3v3h-9zm108-7h3v-3h3v3h3v3h-9z" fill="#e5a9a8" />
  </>;
}

export function GlimmerArt({ scene }: { scene: GlimmerScene }) {
  return <svg className="glimmer-art" viewBox="0 0 320 96" width="320" height="96" preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {scene === "encounter" ? <Encounter /> : scene === "caught" ? <Caught /> : scene === "escaped" ? <Escaped /> : <General />}
  </svg>;
}
