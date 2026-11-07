import { useEffect, useRef, useState } from "react";
import { isConfirmedGiftRejection, issueMessage, type GiftInventory, type GiftItem, type GiftItemView, type GiftPurchase, type GiftPurchaseOption, type GiftView, type MomentsApi, type MomentView } from "./api";
import { midpoint } from "./effects";
import { Loading, Pixel } from "./pixel-art";

export interface GiftDraft { requestId: string; item: GiftItem; name: string; purchase?: GiftPurchase }
export function GiftDialog({ post, api, draft, remember, onClose, onSent }: {
  post: MomentView; api: MomentsApi; draft: GiftDraft | undefined;
  remember(draft: GiftDraft | undefined): void; onClose(): void;
  onSent(gift: GiftView, from: { x: number; y: number }): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [inventory, setInventory] = useState<GiftInventory | null>(null);
  const [selected, setSelected] = useState<GiftItemView | GiftPurchaseOption | null>(draft ? { ...draft.item, name: draft.name } : null);
  const [buying, setBuying] = useState(!!draft?.purchase);
  const [quantity, setQuantity] = useState(draft?.item.quantity ?? 1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const node = dialog.current;
    node?.showModal();
    return () => { mounted.current = false; node?.close(); };
  }, []);
  useEffect(() => {
    if (draft) return;
    const controller = new AbortController();
    setInventory(null); setInventoryError(null);
    void api.inventory(controller.signal).then(data => { if (!controller.signal.aborted) setInventory(data); }).catch(cause => { if (!controller.signal.aborted) setInventoryError(issueMessage(cause)); });
    return () => controller.abort();
  }, [api, revision, Boolean(draft)]);
  const total = draft?.purchase?.expectedTotal ?? (buying && selected && "unitPrice" in selected ? selected.unitPrice * quantity : 0);
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const affordable = !buying || (Number.isSafeInteger(total) && total >= 0 && inventory !== null && total <= inventory.balance);
  const valid = !!draft || (!!selected && validQuantity && affordable && (buying || ("quantity" in selected && quantity <= selected.quantity)));
  function select(item: GiftItemView | GiftPurchaseOption, purchase: boolean) {
    setSelected(item); setBuying(purchase); setQuantity(1); setError(null);
  }
  async function send(button: HTMLButtonElement) {
    if (!selected || !valid || busy.current) return;
    const from = midpoint(button);
    const intent: GiftDraft = draft ?? { requestId: crypto.randomUUID(), name: selected.name, item: { kind: selected.kind, id: selected.id, quantity: selected.kind === "dish" ? 1 : quantity }, ...(buying ? { purchase: { expectedTotal: total } } : {}) };
    remember(intent); busy.current = true; setPending(true); setError(null);
    try {
      const result = await api.send(post.id, intent.requestId, intent.item, intent.purchase);
      if (mounted.current) { remember(undefined); onSent(result, from); }
    } catch (cause) {
      if (mounted.current) {
        if (isConfirmedGiftRejection(cause)) { remember(undefined); setSelected(null); setBuying(false); setRevision(value => value + 1); }
        setError(issueMessage(cause));
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return <dialog className="modal" ref={dialog} aria-labelledby="moments-gift-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}>
    <div className="panel-title"><strong id="moments-gift-title">送给 {post.author.name}</strong><button type="button" className="close" aria-label="关闭赠礼" disabled={pending} onClick={onClose}>×</button></div>
    <div className="modal-body"><p>选择背包里的具体成品，或购买鱼饵后送出。</p>
      {draft ? <div className="gift-pending"><Pixel kind={draft.item.kind === "bait" ? "bait" : "meal"} /><strong>{draft.name} × {draft.item.quantity}</strong>{draft.purchase && <p>已确认总价：{draft.purchase.expectedTotal} 金币</p>}<p>{pending ? "正在确认送达…" : "这份礼物的结果尚未确认。继续确认会沿用同一次赠礼。"}</p></div> : inventoryError ? <div role="alert"><p>{inventoryError}</p><button className="quiet" onClick={() => setRevision(value => value + 1)}>重新查看背包</button></div> : !inventory ? <Loading label="正在打开背包" /> : <>
        <h3 className="gift-section-title">从背包送出</h3>
        {!inventory.items.length ? <p>背包里还没有可以送出的料理或鱼饵。</p> : <div className="gift-grid" aria-label="背包可赠物品">{inventory.items.map(item => <button key={`${item.kind}:${item.id}`} className={`gift-choice${!buying && selected?.id === item.id && selected.kind === item.kind ? " selected" : ""}`} aria-pressed={!buying && selected?.id === item.id && selected.kind === item.kind} onClick={() => select(item, false)}><Pixel kind={item.kind === "bait" ? "bait" : "meal"} /><strong>{item.name}</strong><small>{item.kind === "dish" ? "这份成品" : `背包 × ${item.quantity}`}</small></button>)}</div>}
        <h3 className="gift-section-title">购买鱼饵并赠送 <small>余额 {inventory.balance} {inventory.currency}</small></h3>
        {!inventory.purchaseOptions.length ? <p>目前没有可购买的鱼饵。</p> : <div className="gift-grid" aria-label="购买鱼饵">{inventory.purchaseOptions.map(item => <button key={item.id} className={`gift-choice${buying && selected?.id === item.id ? " selected" : ""}`} aria-pressed={buying && selected?.id === item.id} onClick={() => select(item, true)}><Pixel kind="bait" /><strong>{item.name}</strong><small>每份 {item.unitPrice} {inventory.currency}</small></button>)}</div>}
        {selected?.kind === "bait" && <label className="gift-quantity">数量 <input aria-label="礼物数量" type="number" min="1" {...(!buying && "quantity" in selected ? { max: selected.quantity } : {})} step="1" value={Number.isNaN(quantity) ? "" : quantity} onChange={event => setQuantity(event.currentTarget.valueAsNumber)} /></label>}
        {buying && selected && "unitPrice" in selected && validQuantity && <div className="gift-quote" aria-label="购买确认"><strong>{selected.name} × {quantity}</strong><p>{selected.unitPrice} 金币 × {quantity} = 总价 {total} 金币</p><p>确认后购买并直接送给 {post.author.name}。</p>{!affordable && <p className="inline-error">金币余额不足。</p>}</div>}
      </>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-footer"><button className="quiet" disabled={pending} onClick={onClose}>{draft ? "收起" : "取消"}</button><button className="primary" disabled={pending || !valid} onClick={event => { void send(event.currentTarget); }}>{pending ? "正在送出…" : draft ? "继续确认送达" : buying && selected ? `确认购买并赠送 ${selected.name} × ${validQuantity ? quantity : "—"} · ${validQuantity ? total : "—"} 金币` : selected ? `送出 ${selected.name} × ${selected.kind === "dish" ? 1 : validQuantity ? quantity : "—"}` : "送出礼物"}</button></div>
    </div>
  </dialog>;
}
