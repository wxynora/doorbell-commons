export const SNOW_LIVE_ENTRY = `<button class="candidate2-snow-live-entry" type="button" onclick="openSnowLive()" aria-label="进入雪堡锦标赛" title="雪堡赛事站"><img src="/lingye/snow-tournament/snow-fort-icon.svg" alt="" width="32" height="32" draggable="false"></button>`;
export const SNOW_LIVE_ENTRY_STYLES = `
.candidate2-snow-live-entry{position:absolute;top:calc(102px + 2 * var(--candidate2-lingye-rail-icon-size, clamp(52px, 14vw, 60px)));right:12px;z-index:30;display:block;width:var(--candidate2-lingye-rail-icon-size, clamp(52px, 14vw, 60px));aspect-ratio:1;padding:0;border:0;background:transparent;touch-action:manipulation;}
.candidate2-snow-live-entry img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 3px 5px #40352650);pointer-events:none;user-select:none;-webkit-user-drag:none;}
.candidate2-snow-live-entry:focus-visible{outline:3px solid #488c9a;outline-offset:3px;}
`;
