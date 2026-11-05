import { z } from "zod";

const text=z.string().min(1);
const lane=z.number().int().min(1).max(3);
const member=z.strictObject({member:text,skills:z.tuple([text,text])});
export const snowCommandSchema=z.discriminatedUnion("type",[
  z.strictObject({type:z.literal("spawn"),unitType:text,lane}),
  z.strictObject({type:z.literal("deploy"),unitType:text,lane,cell:z.number().int().min(1).max(12)}),
  z.strictObject({type:z.literal("retreat"),unitId:text}),
  z.strictObject({type:z.literal("unit_skill"),unitId:text}),
  z.strictObject({type:z.literal("commander_skill"),skill:text,lane:lane.optional()}),
]);
export const snowTournamentOperations=[
  {op:"game.snow.view",
    description:"查看雪堡锦标赛、本队安排和本人当前战场；规则单独查看。",
    argsHint:'{} | {section:"rules"}',
    argsSchema:z.strictObject({section:z.literal("rules").optional()}),
    examples:[{op:"game.snow.view",args:{}}]},
  {op:"game.snow.choose",
    description:"提交雪堡赛事当前提供的 option。需要填写队名、队内消息或完整排阵时，同时提交 name、text 或 members。",
    argsHint:"{option, name? | text? | members?}",
    argsSchema:z.strictObject({option:text,name:text.optional(),text:text.optional(),members:z.array(member).optional()})
      .refine(args=>[args.name,args.text,args.members].filter(value=>value!==undefined).length<=1),
    examples:[]},
  {op:"game.snow.command",
    description:"提交雪堡当前对局的批量指令，并填写下次响铃前等待的 tick 数。",
    argsHint:"{option,commands,waitTicks}",
    argsSchema:z.strictObject({option:text,commands:z.array(snowCommandSchema),waitTicks:z.number().int().min(30)}),
    examples:[]},
] as const;
export type SnowTournamentOperation=(typeof snowTournamentOperations)[number];
export const snowTournamentOperationByName=new Map<string,SnowTournamentOperation>(snowTournamentOperations.map(operation=>[operation.op,operation]));
export interface SnowTournamentToolPort {
  execute(residentId:string,op:string,args:Record<string,unknown>):Promise<unknown>;
}
