import type { MomentView } from "./api";
import { timeLabel } from "./presentation";
import "./game-card.css";

type Receipt = NonNullable<MomentView["receipt"]>;
const gameKinds = ["game-leaf-game", "game-doudizhu", "game-flying-chess", "game-uno", "game-monopoly", "game-mahjong"];
export const isGameReceipt = (receipt: Receipt) => gameKinds.includes(receipt.kind);

function GameIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 48 40" shapeRendering="crispEdges" aria-hidden="true">
    {kind === "game-mahjong" ? <>
      <path fill="#4f8c85" d="M7 7h25v29H7z"/><path fill="#fff8dd" d="M10 3h25v29H10z"/><path fill="#dc635c" d="M21 8h4v19h-4zM15 12h16v4H15zM15 20h16v4H15zM15 12h4v12h-4zM27 12h4v12h-4z"/>
    </> : kind === "game-flying-chess" ? <>
      <path fill="#77b5d0" d="M2 30h44v4H2zM5 23h6v3H5zM34 6h9v3h-9z"/><path fill="#dc6859" d="M21 3h6v9h5v5h6v6H27v8h5v4H16v-4h5v-8H10v-6h6v-5h5z"/><path fill="#fff2ca" d="M22 9h4v8h-4z"/>
    </> : kind === "game-monopoly" ? <>
      <path fill="#8ba8b4" d="M3 31h42v5H3z"/><path fill="#e6b265" d="M7 15h17v16H7z"/><path fill="#dc7561" d="M4 13h23v5H4zM8 9h15v4H8zM12 5h7v4h-7z"/><path fill="#8cb99d" d="M29 11h12v20H29z"/><path fill="#fff1cd" d="M11 21h5v10h-5zM19 21h3v5h-3zM32 15h3v4h-3zM37 15h2v4h-2zM32 22h3v4h-3z"/>
    </> : kind === "game-uno" ? <>
      <path fill="#476a88" d="M7 4h26v31H7z"/><path fill="#d76158" d="M13 8h26v29H13z"/><path fill="#fff4cf" d="M20 12h13v3H20zM17 15h5v8h-5zM28 18h6v11h-6zM20 26h10v6H20z"/><path fill="#e9bf5c" d="M22 17h6v10h-6z"/>
    </> : kind === "game-doudizhu" ? <>
      <path fill="#d4ad62" d="M4 8h17v26H4z"/><path fill="#fff6dc" d="M15 5h17v29H15z"/><path fill="#7c9fbd" d="M27 9h17v26H27z"/><path fill="#cc6156" d="M21 13h5v4h3v5h-3v4h-5v-4h-3v-5h3z"/><path fill="#f5d47f" d="M5 2h5v3h5V2h5v8H5z"/>
    </> : <>
      <path fill="#eee3b7" d="M7 3h15v31H7zM27 6h14v31H27z"/><path fill="#658b6c" d="M11 9h7v4h-7zM11 17h7v4h-7zM30 12h8v4h-8zM30 23h8v4h-8z"/><path fill="#ba7855" d="M10 27h10v4H10zM29 31h10v3H29z"/>
    </>}
  </svg>;
}

export function GameCard({ receipt }: { receipt: Receipt }) {
  return <section className="source game-receipt" data-game-kind={receipt.kind} aria-label="休息室游戏回执">
    <header><span>▦ {receipt.title}</span><time dateTime={new Date(receipt.occurredAt).toISOString()}>{timeLabel(receipt.occurredAt)}</time></header>
    <div className="game-receipt-body"><div className="game-receipt-icon"><GameIcon kind={receipt.kind} /></div><dl>
      {receipt.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl></div>
    {receipt.summary && <p>{receipt.summary}</p>}
  </section>;
}
