import {useEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useGameSession} from './game-session-binding';
import './game-result-dialog.css';

/** Results belong to the screen, never the transformed game board. */
export function GameResultDialog({children}: {children: ReactNode}) {
  const session=useGameSession();
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement;panel.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  return createPortal(<div className="game-result-screen"><div ref={panel} tabIndex={-1} className="game-result-panel" role="dialog" aria-modal="true" aria-label="本局结算" onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const nodes=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]');
    if(!nodes?.length){event.preventDefault();return;}
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){event.preventDefault();first?.focus();}
  }}>
    <div className={session?.watchOnly?'game-result-content game-result-content--watch':'game-result-content'}>{children}</div>
    {session?.watchOnly&&<button className="game-watch-exit" type="button" onClick={()=>void session.exitWatch?.()}>退出围观</button>}
  </div></div>,document.body);
}
