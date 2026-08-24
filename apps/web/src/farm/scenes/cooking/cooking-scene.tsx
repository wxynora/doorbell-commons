import type { CSSProperties } from "react";
import "./cooking-scene.css";

export function CookingScene({
  assetUrl,
  label,
  toolStyle,
}: {
  assetUrl: string;
  label: string;
  toolStyle: CSSProperties;
}) {
  return (
    <section aria-labelledby="farm-cooking-title" className="farm-scene farm-scene--cooking">
      <h2 className="farm-visually-hidden" id="farm-cooking-title">
        料理台
      </h2>

      <div className="farm-cooking__tool" aria-live="polite" style={toolStyle}>
        <img alt="" aria-hidden="true" key={assetUrl} src={assetUrl} />
        <span className="farm-visually-hidden">当前预览：{label}</span>
      </div>
      <p className="farm-visually-hidden">当前只预览工具切换，不会提交料理操作。</p>
    </section>
  );
}
