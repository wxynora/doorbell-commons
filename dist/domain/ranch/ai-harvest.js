import { currentDayIndex } from "../../time.js";
import { aiDisplay } from "./display.js";
import { ranchCollect } from "./collection.js";
export const AI_RANCH_HARVEST_DAILY_LIMIT = 3;
export function aiRanchHarvestRemaining(farm,now) {
    const counter=farm.aiRanchHarvestCounter;
    const used=counter?.day===currentDayIndex(now)?counter.count:0;
    return Math.max(0,AI_RANCH_HARVEST_DAILY_LIMIT-(Number.isSafeInteger(used)&&used>=0?used:0));
}
export function aiRanchHarvestStatus(farm,now) {
    return `今日牧场帮收次数：${aiRanchHarvestRemaining(farm,now)}`;
}
export function harvestRanchForAi(farm,farms,now) {
    const remaining=aiRanchHarvestRemaining(farm,now);
    if(remaining===0) return {ok:false,code:"ai_ranch_harvest_daily_limit",remaining};
    const result=ranchCollect(farm,farms,now,aiDisplay(farm));
    if(!result.ok) return {...result,remaining};
    farm.aiRanchHarvestCounter={day:currentDayIndex(now),count:AI_RANCH_HARVEST_DAILY_LIMIT-remaining+1};
    return {...result,remaining:remaining-1};
}
