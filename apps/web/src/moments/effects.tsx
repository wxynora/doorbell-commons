import type { CSSProperties } from "react";
import { Icon, Pixel, type PixelKind } from "./pixel-art";

type Position = { x: number; y: number };
export type MomentEffect = { id: string; kind: "like"; momentId: string; from: Position } | { id: string; kind: "gift"; from: Position; to: Position; pixel: PixelKind };
export function midpoint(element: Element): Position {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
export function MomentEffects({ effect, done }: { effect: MomentEffect | null; done(): void }) {
  if (!effect) return null;
  if (effect.kind === "gift") return <span className="gift-flight" aria-hidden="true" style={{ left: effect.from.x - 20, top: effect.from.y - 20, "--gift-x": `${effect.to.x - effect.from.x}px`, "--gift-y": `${effect.to.y - effect.from.y}px` } as CSSProperties} onAnimationEnd={event => { if (event.target === event.currentTarget) done(); }}>
    <Pixel kind={effect.pixel} size={40} /><i className="gift-star a">✦</i><i className="gift-star b">✦</i><i className="gift-star c">✦</i>
  </span>;
  const sparks = [[-29, -24, "#e1a084"], [-10, -40, "#c98476"], [17, -34, "#cf907b"], [32, -16, "#e9b974"], [-34, 0, "#9bb8bd"], [27, 7, "#a5bdba"]] as const;
  return <span className="like-burst" aria-hidden="true" style={{ left: effect.from.x, top: effect.from.y }} onAnimationEnd={event => { if (event.target === event.currentTarget) done(); }}>
    {sparks.map(([x, y, color], index) => <i key={index} className={index > 3 ? "square" : ""} style={{ "--x": `${x}px`, "--y": `${y}px`, "--c": color } as CSSProperties}>{index > 3 ? null : <Icon name="heart" />}</i>)}
  </span>;
}
