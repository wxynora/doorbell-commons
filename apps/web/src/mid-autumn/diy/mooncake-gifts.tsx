import { useEffect, useRef, useState } from "react";
import type { MidAutumnGift } from "../api";
import { APPROVED_STAMP_LAYOUTS, CakeArt, defaultLayout } from "./mooncake-art";
import "./mooncake-fonts.css";
import "./mooncake-memorial.css";

export function MooncakeGifts({ gifts, memorial = false, onBack }: { gifts: MidAutumnGift[]; memorial?: boolean; onBack: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [paperHeight, setPaperHeight] = useState(844);
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, gifts.length - 1));
  const gift = gifts[currentPage];
  useEffect(() => {
    if (!frame.current || !paper.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / 390);
    });
    const paperObserver = new ResizeObserver(([entry]) => {
      if (entry) setPaperHeight((entry.target as HTMLElement).offsetHeight);
    });
    observer.observe(frame.current);
    paperObserver.observe(paper.current);
    return () => { observer.disconnect(); paperObserver.disconnect(); };
  }, []);
  const giftLabel = gift?.side === "ai" ? "TA 送来的礼盒" : "送给 TA 的礼盒";
  return (
    <div className="moon-memorial-viewport">
      <div className="moon-memorial-frame" ref={frame}>
        <div className="moon-memorial-space" style={{ height: paperHeight * scale }}>
          <main className="moon-memorial-paper" ref={paper} style={{ transform: `scale(${scale})` }} aria-label={memorial ? "中秋纪念册" : "月饼礼盒"}>
            <header className="moon-memorial-heading">
              <button type="button" className="moon-memorial-back" onClick={onBack} aria-label="返回">‹</button>
              <p>2026 · 中秋特别活动</p>
              <h1>月满心间</h1>
            </header>
            <p className="moon-memorial-dates">2026.09.24 — 09.26</p>
            <figure className="moon-memorial-photo">
              <img src="/mid-autumn/diy/event-home-selected.png" alt="月满心间活动的月夜桂花庭院" />
              <figcaption>月色与你，皆是良辰。</figcaption>
            </figure>
            {gift ? (
              <section className="moon-memorial-keepsake" key={gift.id} aria-label={giftLabel}>
                <blockquote className="moon-memorial-letter">
                  <h2>{gift.side === "ai" ? "TA 的来信" : "写给 TA 的信"}</h2>
                  <p>{gift.letter || "无赠言"}</p>
                  {gift.sentAt !== null && <footer><time dateTime={new Date(gift.sentAt).toISOString()}>{new Date(gift.sentAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })}</time></footer>}
                </blockquote>
                <div className="moon-memorial-collage">
                  <img className="moon-memorial-lid" src="/mid-autumn/diy/gift-lid-v1.png" alt="" />
                  <img className="moon-memorial-seal" src="/mid-autumn/diy/handmade-seal-v1.png" alt="手作" />
                  <div className="moon-memorial-box" role="group" aria-label="四格月饼礼盒">
                    <img className="moon-memorial-box-base" src="/mid-autumn/diy/gift-base-v1.png" alt="" />
                    <div className="moon-memorial-box-slots">
                      {gift.cakes.map((item, index) => (
                        <div className="moon-memorial-box-slot" key={item.id} aria-label={`礼盒第${index + 1}格`}>
                          <CakeArt cake={item.cake} layout={APPROVED_STAMP_LAYOUTS[`${item.cake.shape}:${item.cake.pattern}`] ?? defaultLayout(item.cake.shape)} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <h2 className="moon-memorial-gift-label">{giftLabel}</h2>
                </div>
              </section>
            ) : <p className="moon-memorial-empty">这里还没有赠送的月饼礼盒。</p>}
            {gifts.length > 1 && <nav className="moon-memorial-pages" aria-label="礼盒翻页">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="上一盒">‹</button>
              <span aria-live="polite">{currentPage + 1} / {gifts.length}</span>
              <button type="button" disabled={currentPage === gifts.length - 1} onClick={() => setPage(currentPage + 1)} aria-label="下一盒">›</button>
            </nav>}
          </main>
        </div>
      </div>
    </div>
  );
}
