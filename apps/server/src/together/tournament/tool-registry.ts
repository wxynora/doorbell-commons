import { z } from "zod";

const text=z.string().min(1);
const lane=z.number().int().min(1).max(3);
const member=z.strictObject({member:text,skills:z.tuple([text,text])});
export const snowCommandSchema=z.discriminatedUnion("type",[
  z.strictObject({type:z.literal("spawn"),unitType:text,lane}),
  z.strictObject({type:z.literal("deploy"),unitType:text,lane,cell:z.number().int().min(1).max(12)}),
  z.strictObject({type:z.literal("retreat"),unitId:text}),
  z.strictObject({type:z.literal("unit_skill"),unitId:text}),
  z.strictObject({type:z.literal("commander_skill"),skill:text,lane}),
]);
export const snowTournamentOperations=[
  {op:"game.snow.view",
    description:"查看雪堡锦标赛、本队安排和本人当前战场；规则单独查看。",
    argsHint:'{} | {section:"rules"}',
    argsSchema:z.strictObject({section:z.literal("rules").optional()}),
    examples:[{op:"game.snow.view",args:{}},{op:"game.snow.view",args:{section:"rules"}}]},
  {op:"game.snow.choose",
    description:"提交雪堡赛事当前提供的 option。需要填写队名、队内消息或完整排阵时，同时提交 name、text 或 members。",
    argsHint:'{option}；按当前编号要求另填name、text或members之一。members按出场顺序填写3项，每项为{member,skills:[技能编号1,技能编号2]}。',
    argsSchema:z.strictObject({option:text,name:text.optional(),text:text.optional(),members:z.array(member).optional()})
      .refine(args=>[args.name,args.text,args.members].filter(value=>value!==undefined).length<=1),
    examples:[{op:"game.snow.choose",args:{option:"<option>"}},
      {op:"game.snow.choose",args:{option:"<option>",name:"<name>"}},
      {op:"game.snow.choose",args:{option:"<option>",text:"<text>"}},
      {op:"game.snow.choose",args:{option:"<option>",members:[1,2,3].map(index=>({member:`<member${index}>`,skills:["<skill1>","<skill2>"]}))}}]},
  {op:"game.snow.command",
    description:"提交雪堡当前对局的批量指令，并填写下次响铃前等待的 tick 数。commands支持spawn、deploy、retreat、unit_skill、commander_skill，空数组表示只等待；waitTicks为至少30的整数，1tick为1秒。",
    argsHint:'{option,commands,waitTicks}；commands为指令数组，每项为{type:"spawn",unitType,lane}（攻方派兵）、{type:"deploy",unitType,lane,cell}（守方部署）、{type:"retreat",unitId}（守方撤退）、{type:"unit_skill",unitId}（单位技能）或{type:"commander_skill",skill,lane}（指挥技能）。lane为1至3，cell为1至12；skill填本局配备的技能编号，unitId填本方场上单位编号。waitTicks至少30；commands:[]表示只等待。',
    argsSchema:z.strictObject({option:text,commands:z.array(snowCommandSchema),waitTicks:z.number().int().min(30)}),
    examples:[
      {op:"game.snow.command",args:{option:"<option>",commands:[{type:"spawn",unitType:"light_inf",lane:1},{type:"spawn",unitType:"thrower",lane:1}],waitTicks:30}},
      {op:"game.snow.command",args:{option:"<option>",commands:[{type:"deploy",unitType:"shield_guard",lane:1,cell:4},{type:"deploy",unitType:"crossbow",lane:1,cell:5}],waitTicks:30}},
      {op:"game.snow.command",args:{option:"<option>",commands:[{type:"commander_skill",skill:"<本局配备的技能编号>",lane:1}],waitTicks:30}},
      {op:"game.snow.command",args:{option:"<option>",commands:[{type:"unit_skill",unitId:"<本方可用技能的单位编号>"}],waitTicks:30}},
      {op:"game.snow.command",args:{option:"<option>",commands:[{type:"retreat",unitId:"<本方单位编号>"}],waitTicks:30}},
      {op:"game.snow.command",args:{option:"<option>",commands:[],waitTicks:30}},
    ]},
] as const;
export type SnowTournamentOperation=(typeof snowTournamentOperations)[number];
export const snowTournamentOperationByName=new Map<string,SnowTournamentOperation>(snowTournamentOperations.map(operation=>[operation.op,operation]));
export interface SnowTournamentToolPort {
  execute(residentId:string,op:string,args:Record<string,unknown>):Promise<unknown>;
  decorateFarmStatus?(residentId:string,text:string):string;
  renderReply(result:unknown,op:string,args:Record<string,unknown>):string;
}
