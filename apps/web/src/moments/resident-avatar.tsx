import { useContext } from "react";
import { FaceContext } from "./face-context";
import type { ActorView } from "./api";
import type { FaceManifest } from "./scene-data";

// Hand-drawn against the Q-avatar reference sheet, on one 32 × 32 pixel grid.
// Hair IDs select silhouettes; saved colors and skin still supply the resident's identity.
type HairShape = { color: string; back: string; fringe: string; strands: string; accent?: "cross" | "bow" | "tie" | "band" };
const shortBack = "M12 1H17V2H18V4H23V5H26V7H28V9H30V12H29V14H30V19H29V24H27V27H24V29H8V28H5V26H3V22H2V17H1V13H2V10H4V7H8V5H14V4H13V3H11V2H12Z";
const longBack = "M12 1H17V2H18V4H23V5H26V7H28V9H30V12H29V14H30V19H29V24H27V28H26V31H23V29H8V31H5V28H4V25H2V21H1V16H2V11H4V8H7V6H12V5H15V4H13V3H11V2H12Z";
const centerFringe = "M4 11H7V8H12V6H20V7H24V9H27V13H29V20H27V25H25V27H23V22H21V18H19V15H14V19H15V22H12V21H11V19H9V22H7V26H5V22H3V17H4Z";
const centerStrands = "M5 18V14H6V11H8V9H10V8H13V9M20 9H22V10H24V12H25V16H26V20M16 4V6";
const sideFringe = "M4 10H8V7H13V6H21V8H25V10H27V13H29V21H27V24H24V25H23V21H22V17H19V14H17V18H18V21H19V23H15V22H13V21H12V18H10V21H8V24H6V23H4V19H3V15H4Z";
const hairShapes: Record<NonNullable<FaceManifest["hair"]>, HairShape> = {
  "hair1-01": { color: "#4a4759", back: shortBack, fringe: sideFringe, strands: "M5 18V13H7V10H10V8H13V9M20 9H23V11H25V16H26V20M16 4V6" },
  "hair1-02": { color: "#c6bec1", back: shortBack, fringe: centerFringe, strands: centerStrands },
  "hair1-04": { color: "#55516b", back: longBack, fringe: sideFringe, strands: centerStrands },
  "hair1-05": { color: "#a28c86", back: longBack, fringe: centerFringe, strands: "M5 19V14H6V11H9V8H13V9M20 9H23V11H25V15H26V22M16 4V6" },
  "hair1-07": { color: "#afa3a5", back: longBack, fringe: sideFringe, strands: "M5 19V14H7V10H10V8H13V9M21 9H23V11H25V14M16 4V6", accent: "cross" },
  "hair1-08": { color: "#c4bfc6", back: "M12 1H17V2H18V4H23V5H26V7H28V9H30V12H29V15H30V20H28V24H27V27H29V31H27V32H25V29H24V26H8V29H5V27H4V24H2V20H1V16H2V11H4V8H7V6H12V5H15V4H13V3H11V2H12Z", fringe: centerFringe, strands: centerStrands, accent: "bow" },
  "hair1-09": { color: "#514f69", back: longBack, fringe: "M4 11H8V8H12V6H20V7H24V9H27V13H29V21H27V27H25V30H23V23H21V18H19V15H16V19H17V22H13V21H11V19H9V23H7V29H5V26H3V19H4Z", strands: centerStrands },
  "hair1-10": { color: "#c8c0c2", back: "M14 1H19V2H21V5H24V6H27V9H29V13H30V20H28V26H29V30H25V31H23V27H9V30H5V31H3V27H4V23H2V18H2V12H4V8H8V6H13V5H14Z", fringe: centerFringe, strands: centerStrands, accent: "tie" },
  "hair1-11": { color: "#555168", back: "M11 1H16V2H18V4H20V3H22V2H24V3H25V5H27V7H29V10H30V15H29V21H27V26H26V30H23V28H8V30H5V28H4V24H2V20H1V15H2V11H3V8H5V6H4V5H9V4H13V3H11Z", fringe: sideFringe, strands: "M5 19V14H7V10H10V8H13V9M20 9H23V11H25V16H26V22M16 4V6" },
  "hair1-12": { color: "#484556", back: shortBack, fringe: "M4 11H7V8H12V6H20V7H24V9H27V12H29V19H27V24H25V26H23V22H22V18H20V16H19V13H14V14H12V17H11V20H9V23H7V26H5V22H3V17H4Z", strands: "M5 17V13H7V10H10V8H13V9M21 9H24V12H25V17H26V21M16 4V6", accent: "band" },
  "hair1-15": { color: "#53506c", back: longBack, fringe: centerFringe, strands: centerStrands },
  "hair1-17": { color: "#4f4a63", back: longBack, fringe: "M4 11H7V8H12V6H20V7H24V9H27V13H29V21H27V27H25V30H23V23H21V18H19V15H15V19H16V23H12V21H11V19H9V23H7V30H5V27H3V20H4Z", strands: centerStrands },
};
function shade(color: string, factor: number) {
  return `#${[1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;
}

export function PixelFace({ manifest }: { manifest: FaceManifest }) {
  const hair = manifest.hair ? hairShapes[manifest.hair] : null;
  const hairColor = manifest.hair_color ?? hair?.color ?? "#4a4759";
  const outline = shade(hairColor, 0.61);
  const skin = { original: "#ffe2bf", light: "#ffebcf", wheat: "#e9c49c" }[manifest.skin];
  const mouth = manifest.mouth?.split("-").at(-1);
  return <svg className="pixel-face" viewBox="0 0 32 34" shapeRendering="crispEdges" aria-hidden="true" data-hair={manifest.hair ?? "none"}>
    {hair && <path d={hair.back} fill={hairColor} stroke={outline} strokeWidth="2" paintOrder="stroke" />}
    <path d={hair ? "M8 14H24V19H26V23H27V26H25V28H22V30H10V29H7V27H5V23H6V19H8Z" : "M10 5H22V7H25V11H27V24H25V28H22V30H10V29H7V27H5V11H7V7H10Z"} fill={skin} stroke="#745340" strokeWidth="2" paintOrder="stroke" />
    {hair?.accent === "band" && <path d="M12 13H20V18H12Z" fill="#a7a0ae" stroke={outline} strokeWidth="2" paintOrder="stroke" />}
    {hair && <>
      <path d={hair.fringe} fill={hairColor} />
      <path d={hair.strands} fill="none" stroke={shade(hairColor, 0.83)} strokeWidth="1" />
      <path d="M4 12H6V15H4ZM6 10H8V12H6Z" fill="#fff4dd" opacity=".12" />
    </>}
    {manifest.eyes && <path d="M10 24H12V26H10ZM20 24H22V26H20Z" fill={manifest.iris_color} />}
    {manifest.mouth && <path d={mouth === "03" ? "M16 28H17V29H16Z" : ["02", "06", "24"].includes(mouth ?? "") ? "M14 28H15V29H17V28H18V29H17V30H15V29H14Z" : ["10", "20"].includes(mouth ?? "") ? "M15 28H18V29H15Z" : "M15 28H17V29H15Z"} fill="#80503c" />}
    {hair?.accent === "cross" && <path d="M24 12H25V13H26V14H27V13H28V12H29V14H28V15H27V16H28V17H29V19H28V18H27V17H26V18H25V19H24V17H25V16H26V15H25V14H24Z" fill="#343042" />}
    {hair?.accent === "bow" && <path d="M25 24H27V25H28V24H30V27H28V26H27V27H25Z" fill="#343042" />}
    {hair?.accent === "tie" && <path d="M15 4H20V5H15Z" fill="#514d65" />}
  </svg>;
}

/** A shared, unpersonalized human icon; never derived from a resident's Q-avatar. */
export function DefaultHumanFace() {
  return <svg className="pixel-face human-default-face" viewBox="0 0 32 34" shapeRendering="crispEdges" aria-hidden="true">
    <path d="M10 5H22V7H25V10H27V24H25V28H22V30H10V29H7V27H5V10H7V7H10Z" fill="#e3dfca" stroke="#87948b" strokeWidth="2" paintOrder="stroke" />
    <path d="M10 5H22V7H25V10H27V17H24V12H22V11H10V12H8V17H5V10H7V7H10Z" fill="#8da7ab" />
    <path d="M10 21H12V23H10ZM20 21H22V23H20ZM14 27H18V28H14Z" fill="#647c7b" />
  </svg>;
}

export function ResidentAvatar({ actor }: { actor: ActorView }) {
  const faces = useContext(FaceContext), manifest = actor.residentId ? faces[actor.residentId] : null;
  return <div className="avatar" aria-label={`${actor.name}的头像`}>{actor.kind === "human" ? <DefaultHumanFace /> : manifest ? <PixelFace manifest={manifest} /> : <svg viewBox="0 0 32 34" shapeRendering="crispEdges" aria-hidden="true"><path d="M9 6H23V8H26V12H28V25H25V29H22V31H10V30H7V28H4V12H6V8H9Z" fill="#dcc6a6" /><path d="M10 21H12V23H10ZM20 21H22V23H20ZM15 27H18V28H15Z" fill="#a18a70" /></svg>}</div>;
}
