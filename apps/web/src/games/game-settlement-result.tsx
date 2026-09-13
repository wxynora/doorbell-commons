import { useGameSession } from './game-session-binding';
/** Amounts are authoritative account receipts, not engine scores. */
export function GameSettlementResult() {
  const session = useGameSession();
  if (!session?.settlement) return null;
  return <div aria-label="银币结算" style={{display:'grid',gap:'0.4em',fontSize:'inherit'}}>
    {session.settlement.accounts.map((account,index) => <div key={index}>
      <span>{account.playerIds.map(id=>session.playerNames?.[id]??'同桌玩家').join(' / ')}</span>{' '}
      <strong>{account.actualDelta > 0 ? '+' : ''}{account.actualDelta} 银币</strong>
    </div>)}
  </div>;
}
