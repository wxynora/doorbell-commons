import type Database from 'better-sqlite3';
import type {GameRoom} from './types.js';
import type {GameContextCursor} from './game-context-cursor.js';
export class GameActionCursorStore {
  constructor(private readonly db:Database.Database) {}
  read(roomId:string,playerId:string):GameContextCursor {
    const row=this.db.prepare('SELECT event_sequence,chat_sequence FROM game_action_cursors WHERE room_id=? AND player_id=?').get(roomId,playerId) as {event_sequence:number;chat_sequence:number}|undefined;
    return {eventSequence:row?.event_sequence??0,chatSequence:row?.chat_sequence??0};
  }
  commit(room:GameRoom,playerId:string,save:()=>void):void {
    this.db.transaction(()=>{
      save();
      const s=room.snapshot as {state?:{action_history?:Array<{seq?:number;number?:number}>};public_events?:Array<{seq?:number;number?:number}>}|null;
      const events=(room.kind==='mahjong'?s?.state?.action_history:s?.public_events)??[];
      const eventSequence=events.reduce((max,event,index)=>Math.max(max,event.seq??event.number??index+1),0);
      const chat=this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence FROM game_chat_messages WHERE room_id=?').get(room.roomId) as {sequence:number};
      this.db.prepare('INSERT INTO game_action_cursors(room_id,player_id,event_sequence,chat_sequence) VALUES(?,?,?,?) ON CONFLICT(room_id,player_id) DO UPDATE SET event_sequence=excluded.event_sequence,chat_sequence=excluded.chat_sequence').run(room.roomId,playerId,eventSequence,chat.sequence);
    })();
  }
}
