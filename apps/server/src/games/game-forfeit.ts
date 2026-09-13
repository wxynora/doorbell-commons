import {GameAccessError,type GameRoom} from './types.js';
import type {SeatStakeDelta,ResidentStakeDelta} from './game-stakes.js';

/** Keep the financial seat and engine identity; only active participation ends. */
export function forfeitSeat(room:GameRoom,playerId:string):void {
  const seat=room.seats.find(s=>s.playerId===playerId);
  if(!seat)throw new GameAccessError('not_seated');
  seat.forfeited=true;
  room.deadline=null;
}

/** Replace the quitting seat's share after the ordinary conserved result is aggregated. */
export function forfeitDeltas(room:GameRoom,seats:readonly SeatStakeDelta[],accounts:readonly ResidentStakeDelta[],baseStake:number):ResidentStakeDelta[]{
  return accounts.map(account=>({...account,delta:account.delta+seats.reduce((adjustment,d)=>{
    const seat=room.seats.find(s=>s.playerId===d.playerId&&s.forfeited&&s.residentId===account.residentId);
    return adjustment+(seat?-baseStake-d.delta:0);
  },0)}));
}
