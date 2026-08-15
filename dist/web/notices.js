import { esc } from "./shell.js";

/** 把一次性人类牧场消息叠在任意正常 /ui 页面上；沿用全站已有的弹窗尺寸与关闭交互。 */
export function uiHumanNotices(html, notices) {
    if (!notices.length)
        return html;
    const rows = notices.map((notice) => `<div style="padding:9px 0;border-top:1px dashed var(--line);white-space:pre-wrap">${esc(notice)}</div>`).join("");
    const modal = `<div class="mback show" id="human-notice" role="dialog" aria-modal="true" aria-labelledby="human-notice-title">
  <div class="sheet"><button type="button" class="x" data-close aria-label="关闭" style="border:0;background:none;padding:0">✕</button>
    <h3 class="mt" id="human-notice-title">牧场消息</h3>
    <div style="margin-top:12px">${rows}</div>
    <button type="button" class="btn" data-close style="margin-top:16px">知道了</button>
  </div></div>
<script>(function(){var mb=document.getElementById('human-notice');if(!mb)return;function close(){mb.classList.remove('show');}mb.addEventListener('click',function(e){if(e.target===mb||e.target.closest('[data-close]'))close();});document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});})();</script>`;
    return html.replace("</body>", `${modal}</body>`);
}
