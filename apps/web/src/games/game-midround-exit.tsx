import {useRef,useState} from 'react';
import './game-midround-exit.css';

export function GameMidroundExit({baseStake,onLeave}:{baseStake:number;onLeave:()=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const leave=async()=>{if(busy)return;setBusy(true);setError('');try{await onLeave();dialog.current?.close();}catch(e){setError(e instanceof Error?e.message:'退出失败，请重试');}finally{setBusy(false);}};
  return <>
    <button className="game-midround-exit" type="button" aria-label="退出本局" title="退出本局" onClick={()=>dialog.current?.showModal()}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5v16h5M10 12h11m-4-4 4 4-4 4"/></svg>
    </button>
    <dialog ref={dialog} className="game-midround-confirm" aria-labelledby="game-exit-title" onCancel={e=>{if(busy)e.preventDefault();}}>
      <h2 id="game-exit-title">退出本局？</h2>
      <p>退出按认输处理，系统接手，其他人继续玩。本局结束扣 {baseStake} 银币，不再重复计算你的输赢。</p>
      {error&&<p role="alert">{error}</p>}
      <div><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>继续玩</button><button type="button" disabled={busy} onClick={()=>void leave()}>{busy?'正在退出…':'认输并退出'}</button></div>
    </dialog>
  </>;
}
