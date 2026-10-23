import { SNOW_LIVE_PATH } from "../routes";

export const SNOW_LIVE_ENTRY = `<a class="candidate2-snow-live-entry" href="${SNOW_LIVE_PATH}" target="_top" aria-label="进入雪堡战直播" title="雪堡直播"><img src="/lingye/ui/snow-live-snowman-v1.webp" alt="" width="192" height="192" draggable="false"></a>`;
export const SNOW_LIVE_ENTRY_STYLES = `
.candidate2-snow-live-entry{position:absolute;top:calc(102px + 2 * var(--candidate2-lingye-rail-icon-size, clamp(52px, 14vw, 60px)));right:12px;z-index:30;display:block;width:var(--candidate2-lingye-rail-icon-size, clamp(52px, 14vw, 60px));aspect-ratio:1;padding:0;border:0;background:transparent;touch-action:manipulation;}
.candidate2-snow-live-entry img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 3px 5px #40352650);pointer-events:none;user-select:none;-webkit-user-drag:none;}
.candidate2-snow-live-entry:focus-visible{outline:3px solid #488c9a;outline-offset:3px;}
`;
