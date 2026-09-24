import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MidAutumnGift } from "../api";
import { GiftCakeArt } from "./mooncake-diy";
import "./mooncake-gift-opening.css";

const CANVAS = { width: 390, height: 844 };

export function MooncakeGiftOpening({ gift, onBack }: { gift: MidAutumnGift; onBack: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const letterBody = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [opened, setOpened] = useState(false);

  useLayoutEffect(() => {
    const body = letterBody.current;
    if (!opened || !body) return;
    let active = true;
    const fit = () => {
      if (!active || !body.clientHeight) return;
      body.style.fontSize = "16px";
      const fits = () => body.scrollHeight <= body.clientHeight && body.scrollWidth <= body.clientWidth;
      if (fits()) return;
      let low = 0;
      let high = 16;
      while (high - low > 0.01) {
        const middle = (low + high) / 2;
        body.style.fontSize = `${middle}px`;
        if (fits()) low = middle;
        else high = middle;
      }
      body.style.fontSize = `${low}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    void document.fonts?.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [opened, gift.letter]);

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(entry.contentRect.width / CANVAS.width, entry.contentRect.height / CANVAS.height));
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="moon-receive-viewport" ref={frame}>
      <main className={`moon-receive-stage${opened ? " is-open" : ""}`} style={{ transform: `translate(-50%, -50%) scale(${scale})` }} aria-label="收到的月饼礼盒">
        <button type="button" className="moon-receive-back" onClick={onBack} aria-label="返回活动主页">‹</button>
        <header className="moon-receive-heading">
          <p>月满心间 · 月饼作坊</p>
          <h1>TA 送来的月饼</h1>
        </header>
        <div className="moon-receive-box">
          <img className="moon-receive-base" src="/mid-autumn/diy/gift-base-v1.png" alt="" />
          <div className="moon-receive-cakes" aria-hidden={!opened}>
            {gift.cakes.map((item, index) => (
              <div key={item.id} aria-label={`礼盒第${index + 1}格`}><GiftCakeArt cake={item.cake} /></div>
            ))}
          </div>
          <img className="moon-receive-lid" src="/mid-autumn/diy/gift-lid-v1.png" alt="" />
          <img className="moon-receive-ribbon" src="/mid-autumn/diy/gift-ribbon-v1.png" alt="" />
          {!opened && <button type="button" className="moon-receive-open" onClick={() => setOpened(true)} aria-label="打开小机送来的月饼礼盒" />}
        </div>
        {!opened && <p className="moon-receive-hint">轻触礼盒，拆开 TA 的心意</p>}
        <section className="moon-receive-letter" aria-label="TA 的来信" hidden={!opened}>
          <h2>给你的一封信</h2>
          <div className="moon-receive-letter-body" ref={letterBody}>{gift.letter || "未附留言"}</div>
        </section>
      </main>
    </div>
  );
}
