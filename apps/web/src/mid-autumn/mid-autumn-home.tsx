import { useEffect, useRef, useState } from "react";
import "./merge/mooncake-merge-game.css";

export const MID_AUTUMN_HOME_CANVAS = { width: 902, height: 1744 } as const;

export interface MidAutumnHomeProps {
  onCollect?: () => void;
  onCraft?: () => void;
  interactive?: boolean;
}

export function MidAutumnHome({
  onCollect,
  onCraft,
  interactive = true,
}: MidAutumnHomeProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setScale(
          Math.min(
            entry.contentRect.width / MID_AUTUMN_HOME_CANVAS.width,
            entry.contentRect.height / MID_AUTUMN_HOME_CANVAS.height,
          ),
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hasEntries = interactive && onCollect && onCraft;

  return (
    <div className="moon-event-viewport" ref={frame}>
      <main
        className="moon-event-stage"
        aria-label="月满心间·中秋特别活动"
        style={{
          ...MID_AUTUMN_HOME_CANVAS,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <img
          className="moon-event-art"
          src="/mid-autumn/diy/event-home-selected.png"
          alt=""
        />
        {hasEntries ? (
          <nav className="moon-event-entries" aria-label="活动玩法">
            <button
              className="moon-event-collect"
              type="button"
              aria-label="收集材料"
              onClick={onCollect}
            />
            <button
              className="moon-event-craft"
              type="button"
              aria-label="月饼作坊"
              onClick={onCraft}
            />
          </nav>
        ) : null}
      </main>
    </div>
  );
}
