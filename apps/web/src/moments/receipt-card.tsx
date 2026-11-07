import { useId, useLayoutEffect, useRef, useState } from "react";
import type { MomentView } from "./api";
import { Pixel } from "./pixel-art";
import { GlimmerCard } from "./glimmer-card";
import { GameCard, isGameReceipt } from "./game-card";
import { receiptStyle, receiptStyles, timeLabel } from "./presentation";
import "./receipt-card.css";

type Receipt = NonNullable<MomentView["receipt"]>;
function Facts({ facts }: { facts: Receipt["facts"] }) {
  return <dl className="receipt-facts">{facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>;
}
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return <ReceiptLayout receipt={receipt} />;
}

function NewspaperText({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement>(null), id = useId();
  const [expanded, setExpanded] = useState(false), [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return <>
    <p id={id} ref={body} className="paper-text" data-expanded={expanded}>{text}</p>
    {overflows && <button type="button" className="paper-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "收起全文" : "展开全文"}</button>}
  </>;
}

function ReceiptLayout({ receipt }: { receipt: Receipt }) {
  if (receipt.kind === "glimmer") return <GlimmerCard receipt={receipt} />;
  if (isGameReceipt(receipt)) return <GameCard receipt={receipt} />;
  const style = receiptStyle(receipt);
  // The persisted harvest contract records one rarity fact for each actual crop.
  const counts = new Map<string, number>();
  if (receipt.kind === "harvest") for (const fact of receipt.facts) {
    if (fact.label === "稀有度") counts.set(fact.value, (counts.get(fact.value) ?? 0) + 1);
  }
  const order = new Map(["N", "R", "SR", "SSR"].map((rarity, index) => [rarity, index]));
  const harvestFacts = [...counts].sort(([left], [right]) => (order.get(left) ?? order.size) - (order.get(right) ?? order.size))
    .map(([label, count]) => ({ label, value: `× ${count}` }));
  const harvestTotal = [...counts.values()].reduce((total, count) => total + count, 0);
  const facts = <Facts facts={harvestTotal ? harvestFacts : receipt.facts} />;
  const time = <time dateTime={new Date(receipt.occurredAt).toISOString()}>{timeLabel(receipt.occurredAt)}</time>;
  const harvest = receipt.facts.find(fact => fact.label === "收获");
  const amount = harvest?.value.match(/^(.*?)\s*×\s*(\d+)\s*(.*)$/);
  const newspaperComment = receipt.kind === "newspaper-comment";
  if (style === "fish") return <section className="source fish-receipt" aria-label="钓鱼回执">
    <div className="receipt-top"><span>{receipt.title}</span>{time}</div>
    <div className="fish-record"><span className="fish-picture"><Pixel kind="fish" size={40} /></span><div className="fish-info"><strong>{amount?.[1] ?? receipt.title}</strong><small>{receipt.summary}</small></div>{amount && <div className="fish-count"><b>{amount[2]}</b><small>{amount[3] || " 尾"}</small></div>}</div>
    <div className="receipt-foot">{facts}</div>
  </section>;
  if (style === "farm") return <section className="source farm-receipt" aria-label="种地回执">
    <div className="farm-head"><span>▧ {receipt.title}</span>{time}</div>
    <div className="harvest-row"><span className="pumpkins" aria-hidden="true"><Pixel kind="pumpkin" size={26} /><Pixel kind="pumpkin" size={26} /><Pixel kind="pumpkin" size={26} /></span><div className="harvest-copy"><strong>{harvestTotal ? `收获了 ${harvestTotal} 株` : harvest?.value ?? receipt.title}</strong>{!harvestTotal && <small>{receipt.summary}</small>}</div></div>
    <div className="farm-strip">{facts}</div>
  </section>;
  if (style === "news") return <section className="source newspaper" aria-label={newspaperComment ? "日报评论回执" : "日报回执"}>
    <div className="paper-masthead"><strong>铃野日报</strong><small>{time}<br />{newspaperComment ? "评论回执" : "阅读回执"}</small></div>
    <div className="paper-story"><div><h3>{receipt.title}</h3>{receipt.summary && (newspaperComment ? <p>{receipt.summary}</p> : <NewspaperText key={receipt.summary} text={receipt.summary} />)}</div><span className="paper-art"><Pixel kind="leaf" size={28} /></span></div>
    <div className="paper-bottom">{facts}</div>
  </section>;
  if (style === "snow") {
    const score = receipt.facts.find(fact => fact.label === "赛果" || fact.label === "比分");
    return <section className="source snow-result" aria-label="雪堡回执"><div className="score-title"><span>雪堡锦标赛</span>{time}</div>
      <div className="scoreboard"><span className="team-flag"><Pixel kind="castle" size={28} /><small>己方雪堡</small></span><div><span className="result-word">{receipt.title}</span>{score && <span className="result-score">{score.value}</span>}</div><span className="team-flag opponent"><Pixel kind="castle" size={28} /><small>对方雪堡</small></span></div>
      <div className="title-earned"><span>{receipt.summary}</span><Facts facts={receipt.facts.filter(fact => fact !== score)} /></div>
    </section>;
  }
  if (style === "quest") return <section className="source quest-window" aria-label="委托回执">
    <div className="quest-titlebar"><span><span className="quest-app-icon">▤</span> 邻里委托</span><span className="quest-window-box" aria-hidden="true">−</span></div>
    <div className="quest-dialog-body"><span className="quest-folder"><Pixel kind="folder" size={32} /></span><div className="quest-description"><strong>{receipt.title}</strong>{receipt.facts.map((fact, index) => <div className="quest-field" key={index}><span>{fact.label}</span><b>{fact.value}</b></div>)}</div></div>
    <div className="quest-dialog-footer"><span className="quest-wait"><i />{receipt.summary}</span></div>
  </section>;
  return <section className="source receipt-other" aria-label={`${receiptStyles[style].label}回执`}><strong>{receipt.title}</strong>{time}{receipt.summary && <p>{receipt.summary}</p>}{facts}</section>;
}
