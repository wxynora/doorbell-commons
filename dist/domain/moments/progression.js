import {acceptCommittedFarmRecords} from "../../farm-mutation-scope.js";
import { getFarm } from "../../store.js";
import { writeFarmStatePaths } from "../../farm-state-records.js";
import { titles } from "../../content.js";
import { EconomyService } from "../../economy/economy-service.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";
import { configureMomentsTaskReader, onTaskEvent, taskLine } from "../../tasks.js";

const metrics=["posts","comments","likes","received_likes","gifts","received_gifts"];
const events=new Set(["initial","publish","comment","like","unlike","receive_like","receive_unlike","gift","receive_gift"]);
const achievements=titles.filter(title=>title.cat==="机哩咕噜" && metrics.includes(title.momentsMetric));
const record=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=value=>typeof value==="string"&&value.length>0;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export class MomentsProgressionError extends Error {
    constructor(code){super(code);this.name="MomentsProgressionError";this.code=code;}
}
const fail=code=>{throw new MomentsProgressionError(code);};
function validate(input){
    if(!exact(input,["residentId","farmDoorplate","day","postsToday","sequence","events"]) ||
        !text(input.residentId)||!text(input.farmDoorplate)||!integer(input.day)||!integer(input.postsToday)||
        input.postsToday>3||!integer(input.sequence)||input.sequence<1||!Array.isArray(input.events))fail("invalid_request");
    for(const event of input.events){
        if(!exact(event,["sequence","event","source","target","occurredAt","totals"])||
            !integer(event.sequence)||event.sequence<1||!events.has(event.event)||typeof event.source!=="string"||
            typeof event.target!=="string"||!integer(event.occurredAt)||!exact(event.totals,metrics)||
            metrics.some(key=>!integer(event.totals[key])))fail("invalid_request");
        if(event.event!=="initial"&&!text(event.source))fail("invalid_request");
        if(!["initial","publish"].includes(event.event)&&(!text(event.target)||event.target===input.residentId))fail("invalid_request");
    }
    for(let i=1;i<input.events.length;i++)if(input.events[i].sequence!==input.events[i-1].sequence+1)fail("invalid_request");
    if(input.events.length&&input.events.at(-1).sequence!==input.sequence)fail("invalid_request");
}
function sameEvent(row,event){
    return row.event===event.event&&row.source===event.source&&row.target===event.target&&row.occurred_at===event.occurredAt&&
        metrics.every(key=>row[key]===event.totals[key]);
}

/** Money, task progress, title grants and the sequence receipt commit on one SQLite connection. */
export function createMomentsProgressionService({database,economyRules,farms=getFarm,now=Date.now}){
    const economy=new EconomyService(database,{rules:economyRules,now});
    const readContext=id=>database.prepare("SELECT * FROM moments_progression_states WHERE farm_id=?").get(id)??null;
    configureMomentsTaskReader(readContext);
    return {sync(input){
        validate(input);
        const farm=farms(input.farmDoorplate);
        if(!farm||farm.doorbellMcpMigration?.residentId!==input.residentId)fail("farm_binding_mismatch");
        let publish;
        const result=runLingyeWorldTransaction(database,()=>{
            const persisted=database.prepare("SELECT resident_id FROM farm_states WHERE farm_id=?")
                .get(farm.id);
            if(persisted?.resident_id!==input.residentId)fail("farm_binding_mismatch");
            let state=readContext(farm.id);
            if(state&&state.resident_id!==input.residentId)fail("farm_binding_mismatch");
            if(!state){
                database.prepare("INSERT INTO moments_progression_states(farm_id,resident_id,sequence,day,posts_today) VALUES(?,?,0,?,?)")
                    .run(farm.id,input.residentId,input.day,input.postsToday);
                state=readContext(farm.id);
            }
            const staged={...farm,task:farm.task?structuredClone(farm.task):undefined,daily:farm.daily?structuredClone(farm.daily):undefined,
                welfareWeekV1:farm.welfareWeekV1?structuredClone(farm.welfareWeekV1):undefined,seeds:{...farm.seeds},
                titles:[...(farm.titles??[])],doorbellMcpMigration:{...farm.doorbellMcpMigration}};
            const task=staged.task, taskKey=task?`${task.seq}:${task.offeredAt}`:"";
            const taskEligible=Boolean(task?.accepted&&!task.completedAt&&task.kind.startsWith("moments_"));
            let last=state.sequence, changed=false, taskTouched=false;
            const fresh=[];
            for(const event of input.events){
                const existing=database.prepare("SELECT * FROM moments_progression_events WHERE resident_id=? AND sequence=?").get(input.residentId,event.sequence);
                if(existing){if(!sameEvent(existing,event))fail("request_conflict");continue;}
                if(event.sequence!==last+1||(last===0)!==(event.event==="initial"))fail("sequence_conflict");
                database.prepare(`INSERT INTO moments_progression_events(resident_id,sequence,event,source,target,occurred_at,${metrics.join(",")})
                    VALUES(?,?,?,?,?,?,${metrics.map(()=>"?").join(",")})`).run(input.residentId,event.sequence,event.event,event.source,event.target,event.occurredAt,...metrics.map(key=>event.totals[key]));
                fresh.push(event); last=event.sequence;changed=true;
                if(!taskEligible||event.occurredAt<task.offeredAt||event.event==="initial")continue;
                const taskEvent=event.event==="unlike"?"like":event.event;
                if(task.kind!==`moments_${taskEvent}`)continue;
                const source=taskEvent==="comment"?event.target:event.source;
                if(taskEvent==="like"&&database.prepare("SELECT 1 FROM moments_progression_task_marks WHERE farm_id=? AND kind='like' AND source=? AND credited=1")
                    .get(farm.id,source))continue;
                database.prepare(`INSERT INTO moments_progression_task_marks(farm_id,task_key,kind,source,active) VALUES(?,?,?,?,?)
                    ON CONFLICT(farm_id,task_key,kind,source) DO UPDATE SET active=excluded.active`)
                    .run(farm.id,taskKey,taskEvent,source,event.event==="unlike"?0:1);
                taskTouched=true;
            }
            if(last!==input.sequence)fail("sequence_conflict");
            if(input.day>=state.day&&(last!==state.sequence||input.day!==state.day||input.postsToday!==state.posts_today))database.prepare("UPDATE moments_progression_states SET sequence=?,day=?,posts_today=? WHERE farm_id=?")
                .run(last,input.day,input.postsToday,farm.id);
            else if(last!==state.sequence)database.prepare("UPDATE moments_progression_states SET sequence=? WHERE farm_id=?").run(last,farm.id);
            const latest=input.events.at(-1),initial=fresh.find(event=>event.event==="initial");
            const eligible=changed?achievements.filter(title=>latest.totals[title.momentsMetric]>=title.min):[];
            const earned=new Set(eligible.length?database.prepare("SELECT title_id FROM moments_progression_rewards WHERE resident_id=?").all(input.residentId).map(row=>row.title_id):[]);
            const unlocked=eligible.filter(title=>!earned.has(title.id));
            let reward=0;
            if(changed&&(unlocked.length||taskTouched)){
                const account=economy.getAccount(input.residentId);
                staged.coins=account.availableGold;staged.silver=account.availableSilver;
                // Settle from the final effective counts, so queued unlike events remove unearned progress.
                for(const title of unlocked){
                    const legacy=Boolean(initial&&initial.totals[title.momentsMetric]>=title.min);
                    database.prepare("INSERT INTO moments_progression_rewards(resident_id,title_id,sequence,silver,legacy,created_at) VALUES(?,?,?,?,?,?)")
                        .run(input.residentId,title.id,last,title.reward.silver,legacy?1:0,now());
                    if(!staged.titles.includes(title.id))staged.titles.push(title.id);
                    reward+=title.reward.silver;
                }
                if(taskTouched){
                    const count=database.prepare("SELECT count(*) AS n FROM moments_progression_task_marks WHERE farm_id=? AND task_key=? AND active=1")
                        .get(farm.id,taskKey).n;
                    if(count>task.progress)onTaskEvent(staged,task.kind,now(),{},count-task.progress);
                    else task.progress=count;
                    if(task.completedAt){
                        database.prepare("UPDATE moments_progression_task_marks SET credited=1 WHERE farm_id=? AND task_key=? AND active=1").run(farm.id,taskKey);
                        database.prepare("UPDATE moments_progression_events SET task_notice=? WHERE resident_id=? AND sequence=?")
                            .run(taskLine(staged,now()),input.residentId,last);
                    }
                }
                reward+=staged.silver-account.availableSilver;
                const goldReward=staged.coins-account.availableGold;
                const reference=`moments:${input.residentId}:${last}`;
                if(reward>0)economy.creditFromSystem({residentId:input.residentId,currency:"silver",amount:reward,
                    businessType:"moments",businessRef:reference,idempotencyKey:`${reference}:silver`});
                if(goldReward>0)economy.creditFromSystem({residentId:input.residentId,currency:"gold",amount:goldReward,
                    businessType:"moments",businessRef:reference,idempotencyKey:`${reference}:gold`});
                staged.silver=account.availableSilver+reward;
                staged.doorbellMcpMigration.balanceProjection={authority:"ledger",operationId:reference,gold:staged.coins,silver:staged.silver};
                // Existing task/wallet projections are patched by field. No whole-farm serialization or world save.
                const values={titles:staged.titles,coins:staged.coins,silver:staged.silver,
                    "doorbellMcpMigration.balanceProjection":staged.doorbellMcpMigration.balanceProjection};
                if(taskTouched){
                    values.task=staged.task;values.tasksDone=staged.tasksDone??0;
                    if(staged.daily)values.daily=staged.daily;
                    if(staged.welfareWeekV1)values.welfareWeekV1=staged.welfareWeekV1;
                    if(goldReward>0)values.seeds=staged.seeds;
                }
                const entries=Object.entries(values);
                const committed=writeFarmStatePaths(database,farm.id,entries.map(([key,value])=>({path:key.split("."),value})));
                publish=()=>{
                    for(const [key,value] of entries)if(!key.includes("."))farm[key]=value;
                    farm.doorbellMcpMigration.balanceProjection=staged.doorbellMcpMigration.balanceProjection;
                    acceptCommittedFarmRecords(farm,committed.recordChanges);
                };
            }
            const sequences=new Set(input.events.map(event=>event.sequence));
            const grants=database.prepare("SELECT * FROM moments_progression_rewards WHERE resident_id=? AND sequence>=? AND sequence<=?")
                .all(input.residentId,input.events[0]?.sequence??last+1,last).filter(row=>sequences.has(row.sequence)).map(row=>({
                    id:row.title_id,name:achievements.find(title=>title.id===row.title_id).name,silver:row.silver,legacy:row.legacy===1,sequence:row.sequence,
                }));
            const taskNotices=database.prepare("SELECT sequence,task_notice AS text FROM moments_progression_events WHERE resident_id=? AND sequence>=? AND sequence<=? AND task_notice IS NOT NULL")
                .all(input.residentId,input.events[0]?.sequence??last+1,last).filter(row=>sequences.has(row.sequence)).map(row=>({sequence:row.sequence,text:row.text}));
            return {residentId:input.residentId,farmDoorplate:farm.id,through:input.sequence,grants,taskNotices};
        });
        publish?.();
        return result;
    }};
}
