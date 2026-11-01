import {createHash} from 'node:crypto';
import {configuredGuestbookJudge} from './guestbook-similarity.mjs';

const runtimes=new WeakMap();
let activeDatabase=null;
export const messageKey=m=>createHash('sha256').update(JSON.stringify([m.id,m.at,m.text])).digest('hex');

export function installGuestbookJudgments(db){
  db.exec(`CREATE TABLE IF NOT EXISTS guestbook_similarity_jobs(
    farm_id TEXT NOT NULL,message_id TEXT NOT NULL,message_at INTEGER NOT NULL,
    status TEXT NOT NULL,payload TEXT,PRIMARY KEY(farm_id,message_id,message_at));
  CREATE TABLE IF NOT EXISTS guestbook_similarity_pairs(
    farm_id TEXT NOT NULL,left_key TEXT NOT NULL,right_key TEXT NOT NULL,score REAL NOT NULL,
    PRIMARY KEY(farm_id,left_key,right_key));
  CREATE TRIGGER IF NOT EXISTS guestbook_similarity_new_message AFTER UPDATE OF state_json ON farm_states
  WHEN coalesce(json_extract(OLD.state_json,'$.messages'),'[]') <> coalesce(json_extract(NEW.state_json,'$.messages'),'[]')
  BEGIN
    INSERT OR IGNORE INTO guestbook_similarity_jobs(farm_id,message_id,message_at,status,payload)
    SELECT NEW.farm_id,json_extract(m.value,'$.id'),json_extract(m.value,'$.at'),'queued',
      json_object('message',json(m.value),'previous',json((
        SELECT coalesce(json_group_array(json(value)),'[]') FROM
          (SELECT value FROM json_each(OLD.state_json,'$.messages') ORDER BY key DESC LIMIT 10)
      )))
    FROM json_each(NEW.state_json,'$.messages') m
    WHERE NOT EXISTS(SELECT 1 FROM json_each(OLD.state_json,'$.messages') old
      WHERE json_extract(old.value,'$.id')=json_extract(m.value,'$.id')
      AND json_extract(old.value,'$.at')=json_extract(m.value,'$.at'));
  END;`);
}

export function configureGuestbookJudgments(db,judge=configuredGuestbookJudge()){
  installGuestbookJudgments(db);
  activeDatabase=db;
  runtimes.set(db,{judge,running:null});
  wakeGuestbookJudgments(db);
}

export function wakeGuestbookJudgments(db){
  if(!runtimes.has(db))return;
  // Run after the synchronous game transaction commits, never await a model inside it.
  queueMicrotask(()=>{void drainGuestbookJudgments(db).catch(()=>{});});
}

export function drainGuestbookJudgments(db){
  const runtime=runtimes.get(db);
  if(!runtime)return Promise.resolve();
  if(runtime.running)return runtime.running;
  runtime.running=(async()=>{
    for(;;){
      const job=db.prepare("SELECT * FROM guestbook_similarity_jobs WHERE status='queued' ORDER BY rowid LIMIT 1").get();
      if(!job)return;
      const claimed=db.prepare("UPDATE guestbook_similarity_jobs SET status='started' WHERE farm_id=? AND message_id=? AND message_at=? AND status='queued'").run(job.farm_id,job.message_id,job.message_at);
      if(!claimed.changes)continue;
      try{
        const {message,previous}=JSON.parse(job.payload);
        const messages=[...previous,message];
        const scores=previous.length?await runtime.judge(messages,{newMessageOnly:true}):{};
        const last=messages.length-1;
        const pairs=previous.map((m,i)=>{
          const score=scores[`pair_${i}_${last}`];
          if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)throw Error('invalid_score');
          return [...[messageKey(m),messageKey(message)].sort(),score];
        });
        db.exec('BEGIN');
        try{
          for(const [left,right,score] of pairs)db.prepare('INSERT OR REPLACE INTO guestbook_similarity_pairs VALUES (?,?,?,?)').run(job.farm_id,left,right,score);
          db.prepare("UPDATE guestbook_similarity_jobs SET status='completed',payload=NULL WHERE farm_id=? AND message_id=? AND message_at=?").run(job.farm_id,job.message_id,job.message_at);
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
      }catch{
        db.prepare("UPDATE guestbook_similarity_jobs SET status='failed',payload=NULL WHERE farm_id=? AND message_id=? AND message_at=?").run(job.farm_id,job.message_id,job.message_at);
      }
    }
  })().finally(()=>{runtime.running=null;});
  return runtime.running;
}

export function readGuestbookScores(farmId,messages,db=activeDatabase){
  if(!db)return {};
  const scores={};
  for(let i=0;i<messages.length;i++)for(let j=i+1;j<messages.length;j++){
    const [left,right]=[messageKey(messages[i]),messageKey(messages[j])].sort();
    const row=db.prepare('SELECT score FROM guestbook_similarity_pairs WHERE farm_id=? AND left_key=? AND right_key=?').get(farmId,left,right);
    if(row)scores[`pair_${i}_${j}`]=row.score;
  }
  return scores;
}
