import type { MomentSticker } from "./api";
import "./stickers.css";

export function Stickers({ stickers, compact = false }: { stickers: readonly MomentSticker[]; compact?: boolean }) {
  if (stickers.length === 0) return null;
  return <div className={`moment-stickers${compact ? " moment-stickers--compact" : ""}`}>
    {stickers.map((sticker, index) => <img key={`${sticker.id}-${index}`} src={sticker.src} alt={sticker.name}
      width={sticker.width} height={sticker.height} loading="lazy" />)}
  </div>;
}
