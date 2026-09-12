import type Database from 'better-sqlite3';
export class GameRuleChoiceStore {
 constructor(private db:Database.Database){}
 set(roomId:string,playerId:string,needsRules:boolean,roundKey='1'){this.db.prepare('INSERT INTO game_rule_choices(room_id,player_id,needs_rules,shown,round_key) VALUES(?,?,?,0,?) ON CONFLICT(room_id,player_id) DO UPDATE SET needs_rules=excluded.needs_rules,shown=0,round_key=excluded.round_key').run(roomId,playerId,needsRules?1:0,roundKey);}
 selected(roomId:string,playerId:string,roundKey='1'):boolean{return !!this.db.prepare('SELECT 1 FROM game_rule_choices WHERE room_id=? AND player_id=? AND round_key=?').get(roomId,playerId,roundKey);}
 pending(roomId:string,playerId:string,roundKey='1'):boolean{return !!this.db.prepare('SELECT 1 FROM game_rule_choices WHERE room_id=? AND player_id=? AND round_key=? AND needs_rules=1 AND shown=0').get(roomId,playerId,roundKey);}
 shown(roomId:string,playerId:string,roundKey='1'){this.db.prepare('UPDATE game_rule_choices SET shown=1 WHERE room_id=? AND player_id=? AND round_key=?').run(roomId,playerId,roundKey);}
}
