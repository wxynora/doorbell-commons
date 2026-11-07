import type { MomentView } from "./api";
import { GlimmerArt } from "./glimmer-art";
import { timeLabel } from "./presentation";
import "./glimmer-card.css";

type Receipt = NonNullable<MomentView["receipt"]>;
type Scene = "encounter" | "caught" | "escaped" | "general";

function sceneForReceipt(receipt: Receipt): Scene {
  const keys = receipt.statusKeys ?? [];
  const caught = keys.includes("glimmer.catch.success");
  const escaped = keys.includes("glimmer.catch.fail");
  const encounter = keys.includes("glimmer.explore.choice") || keys.includes("glimmer.explore.instant") || keys.includes("glimmer.choose");
  if (Number(caught) + Number(escaped) + Number(encounter) !== 1) return "general";
  return caught ? "caught" : escaped ? "escaped" : "encounter";
}

export function GlimmerCard({ receipt }: { receipt: Receipt }) {
  const scene = sceneForReceipt(receipt);
  const title: Record<Scene, string> = { encounter: "原野奇遇", caught: "抓捕成功", escaped: "抓捕失败", general: "流光原野" };
  return <section className="source glimmer-card" data-glimmer-scene={scene} aria-label="流光原野回执">
    <div className="glimmer-card-header"><span>{title[scene]}</span><time dateTime={new Date(receipt.occurredAt).toISOString()}>{timeLabel(receipt.occurredAt)}</time></div>
    <div className="glimmer-card-art"><GlimmerArt scene={scene} /></div>
    <div className="glimmer-card-body">
      {receipt.title !== title[scene] && <strong>{receipt.title}</strong>}
      {receipt.summary && <p>{receipt.summary}</p>}
      {receipt.facts.length > 0 && <dl>{receipt.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
    </div>
  </section>;
}
