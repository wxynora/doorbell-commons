import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { command, sendCommand, type HalloweenCommand } from './game/api.mjs';
import { candyEatingHint, candyEffectText, candyEffectExpiry, candyEffectStatusText, type CandyEffectReceipt } from './candy-effects';
import './doorstep-dialog.css';

interface Candy {
  id: string;
  image: string;
  senderName: string | null;
  appearance: { name: string; [key: string]: unknown };
  rarity: string;
}

function CandyPicture({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return failed ? <span className="halloween-gift-picture-error">图片暂未加载</span>
    : <img src={image} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export const receivedCandyName = (candy: Candy) => candy.senderName
  ? `${candy.appearance.name}（${candy.senderName}送的）`
  : candy.appearance.name;

function useReceivedCandies({ receivedOnly = false }: { receivedOnly?: boolean } = {}) {
  const [candies, setCandies] = useState<Candy[] | null>(null), [error, setError] = useState(false), [read, setRead] = useState(0);
  const [effects, setEffects] = useState<CandyEffectReceipt[]>([]), [busy, setBusy] = useState(false);
  const [eatError, setEatError] = useState<string | null>(null), [uncertain, setUncertain] = useState(false);
  const [eatResult, setEatResult] = useState<{ receipt: CandyEffectReceipt; target: 'self' | 'other' } | null>(null);
  const pending = useRef<HalloweenCommand | null>(null), active = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false); setCandies(null);
    fetch('/api/lingye/halloween', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'view', args: {} }), signal: controller.signal,
    }).then(response => response.json()).then(result => {
      if (controller.signal.aborted) return;
      if (result.ok !== true || !Array.isArray(result.data?.candies)) throw new Error('read_failed');
      setCandies(result.data.candies.filter((candy: Candy) => !receivedOnly || Boolean(candy.senderName)));
      setEffects(result.data.effects ?? []);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [read, receivedOnly]);
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
  async function eat(candy?: Candy, target: 'self' | 'other' = 'self') {
    if (active.current) return;
    if (!pending.current && candy) pending.current = command('eat', { candyId: candy.id, target });
    if (!pending.current) return;
    active.current = true; setBusy(true); setEatError(null);
    try {
      const eatingTarget = pending.current.args.target === 'other' ? 'other' : 'self';
      const receipt = await sendCommand<CandyEffectReceipt>(pending.current);
      setCandies(current => current?.filter(item => item.id !== receipt.candyId) ?? null);
      if (eatingTarget === 'self') setEffects(current => [...current.filter(item => item.candyId !== receipt.candyId), receipt]);
      setEatResult({ receipt, target: eatingTarget });
      pending.current = null; setUncertain(false);
    } catch (error) {
      const failed = error as Error & { uncertain?: boolean };
      setEatError(failed.message); setUncertain(Boolean(failed.uncertain));
      if (!failed.uncertain) { pending.current = null; setRead(value => value + 1); }
    } finally { active.current = false; setBusy(false); }
  }
  return { candies, groups, error, retry: () => setRead(value => value + 1), effects, eatResult, dismissResult: () => setEatResult(null), busy, eatError, uncertain, eat };
}

function CandyDialog({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: ReactNode; onClose(): void }) {
  const heading = useId(), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="halloween-gift-scrim halloween-candy-choice-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="halloween-candy-choice" role="dialog" aria-modal="true" aria-labelledby={heading}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        event.stopPropagation();
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <button className="halloween-gift-close" aria-label={closeLabel} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <h3 id={heading}>{title}</h3>
      {children}
    </section>
  </div>, document.body);
}

function CandyChoiceDialog({ candy, state, onClose }: { candy: Candy; state: ReturnType<typeof useReceivedCandies>; onClose(): void }) {
  return <CandyDialog title={receivedCandyName(candy)} closeLabel="关闭糖果详情" onClose={onClose}>
      <div className="halloween-candy-choice-picture"><CandyPicture image={candy.image} name={receivedCandyName(candy)} /></div>
      <p>{candyEatingHint}</p>
      <div className="halloween-candy-eat-options">
        <button className="halloween-candy-eat" disabled={state.busy || state.uncertain} onClick={() => void state.eat(candy, 'self')}>自己吃</button>
        <button className="halloween-candy-eat" disabled={state.busy || state.uncertain} onClick={() => void state.eat(candy, 'other')}>喂ta吃</button>
      </div>
      {state.eatError && <div className="halloween-candy-feedback" role="alert"><p>{state.eatError}</p>{state.uncertain && <button disabled={state.busy} onClick={() => void state.eat()}>再问一次</button>}</div>}
  </CandyDialog>;
}

function CandyUseToast({ result, onClose }: { result: NonNullable<ReturnType<typeof useReceivedCandies>['eatResult']>; onClose(): void }) {
  return createPortal(<aside className="halloween-candy-toast" role="status" aria-live="polite">
    <button aria-label="收起吃糖结果" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <b>{result.target === 'other' ? 'ta吃下了这颗糖' : '吃下了这颗糖'}</b>
    <p>{candyEffectText(result.receipt.effect)}</p>
    <small>{candyEffectStatusText(result.receipt.effect)}<br/>有效至北京时间{candyEffectExpiry(result.receipt.expiresAt)}</small>
  </aside>, document.body);
}

function ReceivedCandyContents({ state, usable = false }: { state: ReturnType<typeof useReceivedCandies>; usable?: boolean }) {
  const { candies, groups, error, retry } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEffects, setShowEffects] = useState(false);
  const selected = usable ? groups.find(({ candy }) => candy.id === selectedId)?.candy : undefined;
  return <><div className="halloween-gift-content" aria-busy={!candies && !error}>
    {error ? <div className="halloween-gift-message" role="alert"><p>糖果没读出来，再试一次吧。</p><button onClick={retry}>重新读取</button></div>
      : !candies ? <p className="halloween-gift-message" role="status">正在看看谁送来了糖…</p>
      : !candies.length ? <div className="halloween-gift-message"><p>还没有收到糖果</p><small>邻居送来的甜蜜，会留在背包里。</small></div>
      : <ul className="halloween-gift-candies">{groups.map(({ candy, count }) => {
        const picture = <><div className="halloween-gift-art"><CandyPicture image={candy.image} name={receivedCandyName(candy)} /><span className="halloween-gift-count">×{count}</span></div><h3>{receivedCandyName(candy)}</h3></>;
        return <li key={candy.id}>
          {usable ? <button className="halloween-candy-select" aria-label={`查看${receivedCandyName(candy)}`} aria-haspopup="dialog" onClick={() => setSelectedId(candy.id)}>{picture}</button> : picture}
        </li>;
      })}</ul>}
    {usable && !selected && state.eatError && <div className="halloween-candy-feedback" role="alert"><p>{state.eatError}</p>{state.uncertain && <button disabled={state.busy} onClick={() => void state.eat()}>再问一次</button>}</div>}
  </div>
    {selected && <CandyChoiceDialog candy={selected} state={state} onClose={() => setSelectedId(null)} />}
    {usable && state.effects.length > 0 && <button className="halloween-candy-effects-open" aria-haspopup="dialog" onClick={() => setShowEffects(true)}>糖果效果</button>}
    {usable && showEffects && <CandyDialog title="糖果效果" closeLabel="关闭糖果效果" onClose={() => setShowEffects(false)}><section className="halloween-candy-effects" aria-label="当前效果">
      {state.effects.map(entry => <p key={entry.candyId}><b>{candyEffectStatusText(entry.effect)}</b> · {candyEffectText(entry.effect)}<small>有效至北京时间{candyEffectExpiry(entry.expiresAt)}</small></p>)}
    </section></CandyDialog>}
    {usable && state.eatResult && <CandyUseToast result={state.eatResult} onClose={state.dismissResult} />}
  </>;
}

export function HalloweenCandyBackpack() {
  const state = useReceivedCandies();
  return <section className="halloween-candy-backpack" aria-label="背包里的糖果"><ReceivedCandyContents state={state} usable /></section>;
}

export function HalloweenCandyBoxDialog({ onClose, mode = 'inbox' }: { onClose(): void; mode?: 'inbox' | 'backpack' }) {
  const heading = useId(), panel = useRef<HTMLElement>(null);
  const state = useReceivedCandies({ receivedOnly: mode === 'inbox' });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="halloween-gift-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="halloween-gift-dialog" role="dialog" aria-modal="true" aria-labelledby={heading}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="halloween-gift-heading">
        <span className="halloween-gift-seal" aria-hidden="true">
          <svg viewBox="0 0 48 48"><path d="M10 36V22a14 14 0 0 1 28 0v14l-7-4-7 4-7-4Z"/><ellipse cx="19" cy="22" rx="2" ry="3"/><ellipse cx="29" cy="22" rx="2" ry="3"/><path d="M21 28q3 3 6 0"/></svg>
        </span>
        <div><h2 id={heading}>{mode === 'backpack' ? '背包 · 糖果' : '收到的糖果'}</h2><p>{state.candies ? `已收进背包 · ${state.candies.length} 颗` : '正在查看收到的糖果…'}</p></div>
        <button className="halloween-gift-close" aria-label={mode === 'backpack' ? '合上背包' : '合上糖果盒'} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <ReceivedCandyContents state={state} usable={mode === 'backpack'} />
      <footer className="halloween-gift-footer"><button onClick={onClose}>{mode === 'backpack' ? '合上背包' : '合上盒子'}</button></footer>
    </section>
  </div>;
}
