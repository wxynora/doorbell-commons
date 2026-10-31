import { useEffect, useState } from 'react';

export function useHalloweenAvailability(enabled: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) { setOpen(false); return; }
    const controller = new AbortController();
    fetch('/api/lingye/halloween', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'view',args:{}}),signal:controller.signal})
      .then(response => response.json()).then(result => {
        if (!controller.signal.aborted) setOpen(result.ok === true && result.data?.phase === 'open');
      }).catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  return enabled && open;
}

export function HalloweenActivityShortcut({ onOpen, available }: { onOpen: () => void; available: boolean }) {
  if (!available) return null;
  return <button className="farm-game__round-button" aria-label="糖果大作战" title="糖果大作战" onClick={onOpen} type="button"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M16 7c-10-6-16 14-7 20 3 2 11 2 14 0 9-6 3-26-7-20Z" fill="#eab166" stroke="#64442f" strokeWidth="1.5"/><path d="M16 7c-1-4 1-5 4-5M12 9c-4 5-4 11-1 17M20 9c4 5 4 11 1 17" fill="none" stroke="#94723d" strokeWidth="1.5"/><path d="m9 16 4-2v4Zm14 0-4-2v4ZM12 22h8l-4 3Z" fill="#64442f"/></svg></button>;
}
