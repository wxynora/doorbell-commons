import { useEffect, useRef } from 'react';

export function HalloweenEntry({ onBack }: { onBack: () => void }) {
  const initialPage = new URLSearchParams(window.location.search).get('page') === 'candies' ? '?page=candies' : '';
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return <iframe ref={frame} title="糖果大作战" src={`/halloween/${initialPage}`} style={{position:'fixed',inset:0,width:'100%',height:'100%',border:0,zIndex:950,background:'#392538'}} onLoad={() => {
    cleanup.current();
    const target = frame.current?.contentWindow;
    const close = (event: Event) => { event.preventDefault(); onBack(); };
    target?.addEventListener('halloween:close', close);
    cleanup.current = () => target?.removeEventListener('halloween:close', close);
  }} />;
}
