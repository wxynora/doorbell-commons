import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { candyEatingHint, candyEffectExpiry, candyEffectStatusText, candyEffectText, type CandyEffectReceipt } from "./effects";
import { candyEatCommand, sendCandyCommand, type CandyEatCommand } from "./client";
import "./backpack.css";

interface Candy {
  id: string;
  image: string;
  senderName: string | null;
  appearance: { name: string; [key: string]: unknown };
  rarity: string;
}

interface CandyBackpackState {
  candies: Candy[] | null;
  groups: Array<{ candy: Candy; count: number }>;
  effects: CandyEffectReceipt[];
  error: boolean;
  retry(): void;
  eatResult: { receipt: CandyEffectReceipt; target: "self" | "other" } | null;
  dismissResult(): void;
  busy: boolean;
  eatError: string | null;
  uncertain: boolean;
  eat(candy?: Candy, target?: "self" | "other"): Promise<void>;
}

function candyName(candy: Candy) {
  return candy.senderName ? `${candy.appearance.name}（${candy.senderName}送的）` : candy.appearance.name;
}

function CandyPicture({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  // Keep the saved image URL unchanged so candies made with older molds still load.
  return failed ? <span className="candy-picture-error">图片暂未加载</span>
    : <img src={image} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function useCandyBackpack(): CandyBackpackState {
  const [candies, setCandies] = useState<Candy[] | null>(null);
  const [error, setError] = useState(false);
  const [read, setRead] = useState(0);
  const [effects, setEffects] = useState<CandyEffectReceipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [eatError, setEatError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [eatResult, setEatResult] = useState<{ receipt: CandyEffectReceipt; target: "self" | "other" } | null>(null);
  const pending = useRef<CandyEatCommand | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setCandies(null);
    sendCandyCommand<{ candies: Candy[]; effects?: CandyEffectReceipt[] }>({ op: "view", args: {} }, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.candies)) throw new Error("read_failed");
        setCandies(result.candies);
        setEffects(result.effects ?? []);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [read]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { candy: Candy; count: number }>();
    for (const candy of candies ?? []) {
      const key = JSON.stringify([candy.image, candy.appearance, candy.rarity, candy.senderName]);
      const group = grouped.get(key);
      if (group) group.count++;
      else grouped.set(key, { candy, count: 1 });
    }
    return [...grouped.values()];
  }, [candies]);

  async function eat(candy?: Candy, target: "self" | "other" = "self") {
    if (active.current) return;
    if (!pending.current && candy) pending.current = candyEatCommand(candy.id, target);
    if (!pending.current) return;
    active.current = true;
    setBusy(true);
    setEatError(null);
    try {
      const eatingTarget = pending.current.args.target;
      const receipt = await sendCandyCommand<CandyEffectReceipt>(pending.current);
      setCandies(current => current?.filter(item => item.id !== receipt.candyId) ?? null);
      if (eatingTarget === "self") setEffects(current => [...current.filter(item => item.candyId !== receipt.candyId), receipt]);
      setEatResult({ receipt, target: eatingTarget });
      pending.current = null;
      setUncertain(false);
    } catch (caught) {
      const failure = caught as Error & { uncertain?: boolean };
      setEatError(failure.message);
      setUncertain(Boolean(failure.uncertain));
      if (!failure.uncertain) {
        pending.current = null;
        setRead(value => value + 1);
      }
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return { candies, groups, error, retry: () => setRead(value => value + 1), effects, eatResult, dismissResult: () => setEatResult(null), busy, eatError, uncertain, eat };
}

function CandyDialog({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: ReactNode; onClose(): void }) {
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="candy-modal-scrim candy-choice-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="candy-choice" role="dialog" aria-modal="true" aria-labelledby={heading}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        event.stopPropagation();
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <button className="candy-dialog-close" aria-label={closeLabel} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <h3 id={heading}>{title}</h3>
      {children}
    </section>
  </div>, document.body);
}

function CandyChoiceDialog({ candy, state, onClose }: { candy: Candy; state: CandyBackpackState; onClose(): void }) {
  const name = candyName(candy);
  return <CandyDialog title={name} closeLabel="关闭糖果详情" onClose={onClose}>
    <div className="candy-choice-picture"><CandyPicture image={candy.image} name={name} /></div>
    <p>{candyEatingHint}</p>
    <div className="candy-eat-options">
      <button className="candy-eat-button" disabled={state.busy || state.uncertain} onClick={() => void state.eat(candy, "self")}>自己吃</button>
      <button className="candy-eat-button" disabled={state.busy || state.uncertain} onClick={() => void state.eat(candy, "other")}>喂ta吃</button>
    </div>
    {state.eatError && <div className="candy-feedback" role="alert"><p>{state.eatError}</p>{state.uncertain && <button disabled={state.busy} onClick={() => void state.eat()}>再问一次</button>}</div>}
  </CandyDialog>;
}

function CandyUseToast({ result, onClose }: { result: NonNullable<CandyBackpackState["eatResult"]>; onClose(): void }) {
  return createPortal(<aside className="candy-use-toast" role="status" aria-live="polite">
    <button aria-label="收起吃糖结果" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <b>{result.target === "other" ? "ta吃下了这颗糖" : "吃下了这颗糖"}</b>
    <p>{candyEffectText(result.receipt.effect)}</p>
    <small>{candyEffectStatusText(result.receipt.effect)}<br/>有效至北京时间{candyEffectExpiry(result.receipt.expiresAt)}</small>
  </aside>, document.body);
}

function CandyBackpackContents({ state }: { state: CandyBackpackState }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEffects, setShowEffects] = useState(false);
  const selected = state.groups.find(({ candy }) => candy.id === selectedId)?.candy;
  return <>
    <div className="candy-backpack-content" aria-busy={!state.candies && !state.error}>
      {state.error ? <div className="candy-message" role="alert"><p>糖果没读出来，再试一次吧。</p><button onClick={state.retry}>重新读取</button></div>
        : !state.candies ? <p className="candy-message" role="status">正在查看背包里的糖果…</p>
        : !state.candies.length ? <div className="candy-message"><p>背包里还没有糖果</p></div>
        : <ul className="candy-backpack-items">{state.groups.map(({ candy, count }) => {
          const name = candyName(candy);
          return <li key={candy.id}>
            <button className="candy-select" aria-label={`查看${name}`} aria-haspopup="dialog" onClick={() => setSelectedId(candy.id)}>
              <div className="candy-art"><CandyPicture image={candy.image} name={name} /><span className="candy-count">×{count}</span></div>
              <h3>{name}</h3>
            </button>
          </li>;
        })}</ul>}
      {!selected && state.eatError && <div className="candy-feedback" role="alert"><p>{state.eatError}</p>{state.uncertain && <button disabled={state.busy} onClick={() => void state.eat()}>再问一次</button>}</div>}
    </div>
    {selected && <CandyChoiceDialog candy={selected} state={state} onClose={() => setSelectedId(null)} />}
    {state.effects.length > 0 && <button className="candy-effects-open" aria-haspopup="dialog" onClick={() => setShowEffects(true)}>糖果效果</button>}
    {showEffects && <CandyDialog title="糖果效果" closeLabel="关闭糖果效果" onClose={() => setShowEffects(false)}><section className="candy-effects" aria-label="当前效果">
      {state.effects.map(entry => <p key={entry.candyId}><b>{candyEffectStatusText(entry.effect)}</b> · {candyEffectText(entry.effect)}<small>有效至北京时间{candyEffectExpiry(entry.expiresAt)}</small></p>)}
    </section></CandyDialog>}
    {state.eatResult && <CandyUseToast result={state.eatResult} onClose={state.dismissResult} />}
  </>;
}

export function CandyBackpack() {
  const state = useCandyBackpack();
  return <section className="candy-backpack" aria-label="背包里的糖果"><CandyBackpackContents state={state} /></section>;
}
