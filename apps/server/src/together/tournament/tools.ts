import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { MainActivitySource } from "../../moments/main-activity-source.js";
import type { SnowTournamentStore } from "./store.js";
import type { SnowTournamentMatchHost } from "./match-host.js";
import type { SnowTournamentTeamService, SnowTournamentIdentityPort } from "./team-service.js";
import type { SnowTournamentService } from "./service.js";
import { snowTournamentForResident } from "./resident-facade.js";
import { snowTournamentOperationByName, type SnowTournamentToolPort } from "./tool-registry.js";
import {snowTeamOptionLabel,snowTeamReceipt} from "./tool-presentation.js";
import {decorateRegistrationStatus} from './registration-status.js';
import {renderSnowReply} from './reply.js';
import { SNOW_TEAM_SIZE, snowTeamHasOpenSeat, snowTeamLimit } from "./roster.js";

type Ref={editionId:string;matchId:string};
type TeamCommand=Parameters<SnowTournamentTeamService["execute"]>[0];
type Binding={editionId:string;kind:string;revision?:number;context?:string;teamId?:string;residentId?:string;offerId?:string;
  matchId?:string;battleId?:string;serial?:number;side?:"attack"|"defend";requires?:string[]};
type State={id:string;title:string;phase:string;revision:number;registrationOpenAt:string;registrationCloseAt:string;teamFormationCloseAt:string;
  enrollments:{id:string;name:string}[];
  teams:{id:string;name:string;captainId:string|null;status:string;members:{id:string;name:string}[]}[];
  offers:{id:string;teamId:string;residentId:string;kind:string;fromCaptainId?:string}[];
  registrationRounds?:{teamId:string;status:string;confirmed:string[]}[];
  matches:{id:string;teamAId:string|null;teamBId:string|null;status:string;scheduledAt:string|null}[];
  receipts:Record<string,{actorId:string;result:{kind?:string;team?:{id:string};resident?:{id:string}}}>};
type OptionRow={option_id:string;resident_id:string;binding_json:string;input_json:string|null;result_json:string|null};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>
  item && typeof item==="object" && !Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
const key=(...parts:unknown[])=>"st:"+createHash("sha256").update(stable(parts)).digest("hex").slice(0,24);

/** Opaque, resident-bound capabilities. Same successful option replays; new business turns get a new option. */
export class SnowTournamentTools implements SnowTournamentToolPort {
  constructor(private readonly db:Database.Database,private readonly options:{
    store:SnowTournamentStore;identity:SnowTournamentIdentityPort;teams:SnowTournamentTeamService;publicService:SnowTournamentService;
    host:SnowTournamentMatchHost|null;catalog:unknown;residents:()=>{id:string;name:string}[];now?:()=>number;
    mainActivity?:Pick<MainActivitySource,"snowShares">;
    afterMutation?:(editionId:string)=>Promise<unknown>;
    afterTeamMutation?:(editionId:string)=>void;
  }) {}
  private now() {return this.options.now?.()??Date.now();}
  private async authorize(actor:string) {
    if ((await this.options.identity.requireActive(actor)).id!==actor) throw new Error("identity_mismatch");
  }
  private state() {return this.options.store.latest() as State|null;}
  decorateFarmStatus(actor:string,text:string) {return decorateRegistrationStatus(text,this.state(),actor,this.now());}
  renderReply(result:unknown,_op:string,args:Record<string,unknown>) {
    const text=renderSnowReply(result,{names:new Map(this.options.residents().map(member=>[member.id,member.name])),args});
    const shares=(result as {mainActivityShares?:string[]}|null)?.mainActivityShares??[];
    return [text,...shares].join("\n\n");
  }
  registrationCall(actor:string,editionId:string) {
    const state=this.options.store.read(editionId) as State|null;
    if(!state)return null;
    const binding=this.candidates(actor,state).find(binding=>binding.kind==='register');
    if(!binding)return null;
    const option=this.issue(actor,binding);
    return 'call' in option?option.call:null;
  }
  private facade(actor:string) {return snowTournamentForResident(actor,{...this.options,now:()=>this.now()});}
  private candidates(actor:string,state:State):Binding[] {
    const now=this.now(),own=state.teams.find(t=>t.status!=="withdrawn" && t.members.some(m=>m.id===actor)),result:Binding[]=[];
    const put=(binding:Omit<Binding,"editionId">)=>result.push({editionId:state.id,...binding});
    if(state.phase==="registration" && now>=Date.parse(state.registrationOpenAt) && now<Date.parse(state.registrationCloseAt)) {
      if(!state.enrollments.some(member=>member.id===actor))put({kind:"register",revision:0});
      return result;
    }
    if (state.phase==="team_formation" && now>=Date.parse(state.registrationCloseAt) && now<Date.parse(state.teamFormationCloseAt) && state.enrollments.some(member=>member.id===actor)) {
      const team=(kind:string,extra:Partial<Binding>={})=>{
        const rev=extra.offerId?0:Object.values(state.receipts).filter(receipt=>receipt.actorId===actor&&receipt.result.kind===kind&&
          (!extra.teamId||receipt.result.team?.id===extra.teamId)&&(!extra.residentId||receipt.result.resident?.id===extra.residentId)).length;
        const roster=["confirm","cancel","leave","handover","accept_captain","rename"].includes(kind);
        put({kind,revision:rev,...(roster?{context:stable([own?.id,own?.captainId,own?.members.map(member=>member.id),own?.status,
          state.registrationRounds?.filter(round=>round.teamId===own?.id).map(round=>[round.status])])}:{}),...extra});
      };
      if (!own) {
        if(state.teams.filter(t=>t.status!=="withdrawn").length<snowTeamLimit(state.enrollments.length))team("create",{requires:["name"]});
        for (const t of state.teams.filter(t=>snowTeamHasOpenSeat(t) &&
          !state.offers.some(offer=>offer.teamId===t.id && offer.residentId===actor && offer.kind==="request"))) team("request",{teamId:t.id});
      } else {
        const round=state.registrationRounds?.find(round=>round.teamId===own.id && round.status!=="cancelled");
        team("leave",{teamId:own.id});
        if (round && (round.confirmed.length>0 || round.status!=="confirming")) team("cancel",{teamId:own.id});
        if (own.status==="forming" && own.captainId && (!round || round.status==="confirming" && !round.confirmed.includes(actor))) team("confirm",{teamId:own.id});
        if (own.captainId===null && own.status==="forming") team("accept_captain",{teamId:own.id});
        if (own.captainId===actor) {
          team("rename",{teamId:own.id,requires:["name"]});
          if (snowTeamHasOpenSeat(own)) for (const resident of this.options.residents().filter(resident=>state.enrollments.some(member=>member.id===resident.id))) {
            if (!state.teams.some(t=>t.status!=="withdrawn" && t.members.some(m=>m.id===resident.id)) &&
                !state.offers.some(o=>o.teamId===own.id && o.residentId===resident.id && o.kind==="invite")) {
              team("invite",{teamId:own.id,residentId:resident.id});
            }
          }
          for (const member of own.members) if(own.status==="forming" && member.id!==actor &&
            !state.offers.some(offer=>offer.teamId===own.id && offer.residentId===member.id && offer.kind==="handover")) {
            team("handover",{teamId:own.id,residentId:member.id});
          }
        }
      }
      for (const offer of state.offers) {
        const target=state.teams.find(t=>t.id===offer.teamId && (offer.kind==="handover"?t.status==="forming":snowTeamHasOpenSeat(t)));
        if (!target) continue;
        const available=offer.kind==="handover"
          ? offer.residentId===actor && offer.fromCaptainId===target.captainId && target.members.some(m=>m.id===actor)
          : (offer.kind==="request"
            ? own?.captainId===actor && own.id===offer.teamId
            : !own && offer.residentId===actor);
        if (available) {team("accept",{offerId:offer.id,teamId:offer.teamId,residentId:offer.residentId});team("decline",{offerId:offer.id,teamId:offer.teamId,residentId:offer.residentId});}
      }
      return result;
    }
    if (!own || !this.options.host || !["round_robin","knockout"].includes(state.phase)) return result;
    for (const match of state.matches) {
      if (!match.teamAId || !match.teamBId || ![match.teamAId,match.teamBId].includes(own.id) || !["scheduled","in_progress"].includes(match.status)) continue;
      const view=this.options.host.playerState({editionId:state.id,matchId:match.id},actor,now);
      const base={matchId:match.id};
      if(this.now()>=Date.parse(match.scheduledAt!)-600_000)put({kind:"channel",...base});
      if (view.canChooseSide) for (const side of ["attack","defend"] as const) put({kind:"side",...base,side});
      if (view.canChat) {put({kind:"chat",...base,serial:view.chatTurn!,requires:["text"]});put({kind:"pass",...base,serial:view.chatTurn!});}
      if (view.canLineup) put({kind:"lineup",...base,serial:view.lineupRevision,requires:["members"]});
      if (view.canConfirmLineup) put({kind:"confirm_lineup",...base,serial:view.lineupRevision});
      if (view.canReady && view.battleId) put({kind:"ready",...base,battleId:view.battleId});
      if (view.canCommand && view.battleId) {
        put({kind:"command",...base,battleId:view.battleId,serial:view.commandRevision!,requires:["commands","waitTicks"]});
        put({kind:"surrender",...base,battleId:view.battleId});
      }
    }
    return result;
  }
  private issue(actor:string,binding:Binding) {
    const id=key(actor,binding),encoded=stable(binding);
    this.db.prepare(`INSERT INTO snow_tournament_options (option_id,edition_id,resident_id,binding_json)
      VALUES (?,?,?,?) ON CONFLICT(option_id) DO NOTHING`).run(id,binding.editionId,actor,encoded);
    const row=this.db.prepare("SELECT * FROM snow_tournament_options WHERE option_id=?").get(id) as OptionRow;
    if (row.resident_id!==actor || row.binding_json!==encoded) throw new Error("snow_option_conflict");
    const state=this.options.store.read(binding.editionId) as State;
    const name=(id:string)=>this.options.residents().find(member=>member.id===id)?.name??id;
    const op=binding.kind==="command"?"game.snow.command":"game.snow.choose";
    return {option:id,kind:binding.kind,label:snowTeamOptionLabel(binding,state,name),...(binding.requires?{requires:binding.requires}:{}),
      ...(binding.teamId?{teamId:binding.teamId}:{}),...(binding.residentId?{residentId:binding.residentId}:{}),
      ...(binding.matchId?{matchId:binding.matchId}:{}),...(binding.side?{side:binding.side}:{}),
      op,...(binding.requires?.length?{argsHint:snowTournamentOperationByName.get(op)!.argsHint}:{call:{op,args:{option:id}}})};
  }
  /** The same current capabilities are used by the tool and targeted team Bells. */
  offerOptions(actor:string,editionId:string,offerId:string) {
    const state=this.options.store.read(editionId) as State|null;
    if(!state)return [];
    return this.candidates(actor,state).filter(binding=>binding.offerId===offerId && ["accept","decline"].includes(binding.kind)).map(binding=>{
      const option=this.issue(actor,binding);
      if (!("call" in option)) throw new Error("snow_offer_call_missing");
      return {...option,call:option.call};
    });
  }
  private async view(actor:string) {
    const state=this.state();
    if (!state) return {edition:null,options:[]};
    const overview=await this.facade(actor).overview();
    const publicState=overview.publicState.edition!;
    const own=state.teams.find(t=>t.members.some(m=>m.id===actor) && t.status!=="withdrawn");
    const matches=this.options.host && own ? state.matches.filter(m=>["scheduled","in_progress"].includes(m.status) && m.teamAId && m.teamBId && [m.teamAId,m.teamBId].includes(own.id))
      .map(m=>{
        const {messages:_messages,chatTurn:_chat,lineupRevision:_lineup,commandRevision:_command,...facts}=this.options.host!.playerState({editionId:state.id,matchId:m.id},actor,this.now());
        return facts;
      }).filter(facts=>facts.canChooseSide || this.now()>=Date.parse(facts.scheduledAt!)-600_000).sort((a,b)=>Date.parse(a.scheduledAt!)-Date.parse(b.scheduledAt!)).slice(0,1):[];
    const catalog=this.options.catalog as {attackerUnits?:unknown;defenderUnits?:unknown;commanderSkills?:Record<string,unknown>}|undefined;
    const active=matches.find(match=>match.canReady||match.canCommand);
    const cards=matches.some(match=>match.canLineup)&&catalog?{catalog:{commanderSkills:catalog.commanderSkills}}:
      active?.role&&catalog?{catalog:{units:active.role==="attack"?catalog.attackerUnits:catalog.defenderUnits,commanderSkills:catalog.commanderSkills?.[active.role]}}:{};
    const next=own?publicState.matches.filter(match=>["scheduled","in_progress"].includes(match.status)&&[match.teamAId,match.teamBId].includes(own.id))
      .sort((a,b)=>Date.parse(a.scheduledAt!)-Date.parse(b.scheduledAt!))[0]:undefined;
    const pendingRegistration=overview.registration.filter(round=>round.status!=="registered");
    const seekingTeam=!own||snowTeamHasOpenSeat(own);
    const mainActivityShares=this.options.mainActivity?.snowShares(state as unknown as Parameters<MainActivitySource["snowShares"]>[0],actor,this.now())??[];
    return {...(mainActivityShares.length?{mainActivityShares}:{}),edition:{id:state.id,title:state.title,phase:state.phase,registrationCloseAt:state.registrationCloseAt,teamFormationCloseAt:state.teamFormationCloseAt},
      enrolled:state.enrollments.some(member=>member.id===actor),team:publicState.teams.find(team=>team.id===own?.id)??null,
      ...(state.phase==="team_formation"&&seekingTeam?{teams:publicState.teams.filter(snowTeamHasOpenSeat),
        teamLimit:snowTeamLimit(state.enrollments.length),enrolledCount:state.enrollments.length}:{}),
      ...(pendingRegistration.length?{registration:pendingRegistration}:{}),matches,...cards,
      ...(!matches.length&&next?{nextMatch:{matchId:next.id,scheduledAt:next.scheduledAt,stage:next.stage,opponent:publicState.teams.find(team=>team.id===(next.teamAId===own!.id?next.teamBId:next.teamAId))?.name}}:{}),
      rules:{op:"game.snow.view",args:{section:"rules"}},
      options:this.candidates(actor,state).map(binding=>this.issue(actor,binding))};
  }
  async execute(actor:string,op:string,args:Record<string,unknown>):Promise<unknown> {
    const outcome=await this.run(actor,op,args);
    if (op!=="game.snow.choose" || (outcome as {ok?:boolean})?.ok===false) return outcome;
    const row=this.db.prepare("SELECT binding_json FROM snow_tournament_options WHERE option_id=? AND resident_id=?")
      .get(String(args.option),actor) as {binding_json:string}|undefined;
    if (!row) return outcome;
    const binding=JSON.parse(row.binding_json) as Binding;
    this.options.afterTeamMutation?.(binding.editionId);
    if (!this.options.afterMutation || !["confirm","cancel","leave","accept"].includes(binding.kind)) return outcome;
    let settlementPending=false;
    try {
      const failures=await this.options.afterMutation(binding.editionId);
      settlementPending=Array.isArray(failures) && failures.length>0;
    } catch { settlementPending=true; }
    if(binding.kind==="accept"||(outcome as {replay?:boolean}).replay===true)return outcome;
    const registration=(await this.facade(actor).overview(binding.editionId)).registration.filter(round=>round.teamId===binding.teamId);
    return {...outcome as object,...(registration.length?{registration}:{}),...(settlementPending?{settlementPending:true}:{})};
  }
  private async run(actor:string,op:string,args:Record<string,unknown>):Promise<unknown> {
    await this.authorize(actor);
    const operation=snowTournamentOperationByName.get(op);
    if (!operation) throw new Error("snow_unknown_operation");
    const parsed=operation.argsSchema.safeParse(args);
    if (!parsed.success) return {ok:false,error:{code:"INVALID_ARGS",issues:parsed.error.issues}};
    const input=parsed.data as Record<string,unknown>;
    if (op==="game.snow.view") return input.section==="rules"?{
      competition:{teamSize:SNOW_TEAM_SIZE,registrationHours:48,teamFormationHours:24,teamLimit:"ceil(enrolledCount / 3)",registrationFeeGold:10000,
        paymentAfter:"all_human_roster_confirmations",groupStage:"single_round_robin",groupWinPoints:3,
        formats:{twoTeams:"direct_final",threeTeams:"round_robin_top_two_final",fourOrMoreTeams:"round_robin_top_four_semifinal_final"},gamesPerMatch:3,eachMemberGamesPerMatch:1},
      combat:{lanes:3,cellsPerLane:12,tickSeconds:1,durationTicks:600,coreHp:20,attackerVictory:"coreHp <= 0",defenderVictory:"tick = 600 and coreHp > 0",thinkingPausesClock:false,
        batchedCommands:true,atomicBatch:true,minimumWaitTicks:30},catalog:this.options.catalog}:this.view(actor);
    const id=String(input.option),row=this.db.prepare("SELECT * FROM snow_tournament_options WHERE option_id=? AND resident_id=?").get(id,actor) as OptionRow|undefined;
    if (!row) return {ok:false,error:{code:"OPTION_NOT_AVAILABLE"}};
    const encoded=stable([op,input]);
    if (row.input_json!==null && row.input_json!==encoded) return {ok:false,error:{code:"REQUEST_CONFLICT"}};
    if (row.result_json!==null) return {result:JSON.parse(row.result_json),replay:true};
    const binding=JSON.parse(row.binding_json) as Binding;
    const state=this.options.store.read(binding.editionId) as State|null;
    if (!state) return {ok:false,error:{code:"OPTION_NOT_AVAILABLE"}};
    if (state.receipts && Object.hasOwn(state.receipts,id) && state.receipts[id]!.actorId===actor && row.input_json===encoded) {
      return this.complete(id,encoded,snowTeamReceipt(state.receipts[id]!.result,this.options.publicService.readPublic(binding.editionId).edition!,this.options.residents()));
    }
    if (!this.candidates(actor,state).some(candidate=>stable(candidate)===row.binding_json)) return {ok:false,error:{code:"OPTION_NOT_AVAILABLE"}};
    if(binding.kind==="channel") {
      if(op!=="game.snow.choose"||Object.keys(input).some(field=>field!=="option"))return {ok:false,error:{code:"INVALID_ARGS"}};
      const channel=this.options.host!.teamDiscussion({editionId:binding.editionId,matchId:binding.matchId!},actor,this.now());
      const names=new Map(this.options.residents().map(member=>[member.id,member.name]));
      return {channel:{matchId:binding.matchId,messages:channel.messages.map(message=>({name:names.get(message.residentId)??message.residentId,text:message.text,at:message.at})),canSpeak:channel.canSpeak}};
    }
    const expected=binding.kind==="command"?["option","commands","waitTicks"]:["option",...(binding.requires??[])];
    if (Object.keys(input).some(field=>!expected.includes(field)) || expected.some(field=>input[field]===undefined) ||
        (binding.kind==="command")!==(op==="game.snow.command")) return {ok:false,error:{code:"INVALID_ARGS"}};
    this.db.prepare("UPDATE snow_tournament_options SET input_json=? WHERE option_id=?").run(encoded,id);
    try {
    if (binding.revision!==undefined) {
      const command={editionId:binding.editionId,actorId:actor,commandId:id,now:new Date(this.now()).toISOString(),
        action:binding.kind,...(binding.teamId?{teamId:binding.teamId}:{}),...(binding.residentId?{residentId:binding.residentId}:{}),
        ...(binding.offerId?{offerId:binding.offerId}:{}),
        ...(binding.kind==="create"?{teamId:key(id,"team"),name:input.name}:{}),
        ...(binding.kind==="rename"?{name:input.name}:{}),
        ...(["invite","request","handover"].includes(binding.kind)?{offerId:key(id,"offer")}:{ }),
        ...(binding.kind==="confirm"?{roster:state.teams.find(t=>t.id===binding.teamId)!.members.map(m=>m.id)}:{})} as TeamCommand;
      let receipt:unknown;
      await this.options.teams.execute(command,result=>{
        receipt=this.complete(id,encoded,snowTeamReceipt(result,this.options.publicService.readPublic(binding.editionId).edition!,this.options.residents()));
      });
      return receipt;
    }
    if (!this.options.host || !binding.matchId) throw new Error("snow_runtime_unavailable");
    const host=this.options.host,ref:Ref={editionId:binding.editionId,matchId:binding.matchId};
    return this.options.store.transaction(()=>{
      let result:unknown={ok:true,kind:binding.kind};
      switch(binding.kind) {
        case "side":host.chooseOpeningSide(ref,actor,binding.side!,this.now());result={ok:true,kind:"side",side:binding.side,attackers:host.readLockedAttackers(ref)};break;
        case "chat":host.speak(ref,actor,id,String(input.text),this.now());result={ok:true,kind:"chat",text:"队内消息已发送，只有本队成员可以读取。"};break;
        case "pass":host.speak(ref,actor,id,null,this.now());result={ok:true,kind:"pass",text:"已 pass，本轮没有发送消息。"};break;
        case "lineup": {
          const view=host.playerState(ref,actor,this.now());
          host.lineup(ref,actor,input.members as Parameters<typeof host.lineup>[2],this.now()>=Date.parse(view.scheduledAt!)-120_000,this.now());
          result={ok:true,kind:"lineup",lineup:host.playerState(ref,actor,this.now()).lineup};break;
        }
        case "confirm_lineup":host.lineup(ref,actor,host.playerState(ref,actor).lineup!.entries,true,this.now());result={ok:true,kind:"confirm_lineup",lineup:host.playerState(ref,actor,this.now()).lineup};break;
        case "ready":host.ready(ref,actor,binding.battleId!,this.now());result={ok:true,kind:"ready",battleId:binding.battleId,started:host.battleForProjection(ref)?.runtime?.started===true};break;
        case "surrender": {
          host.surrender(ref,actor,binding.battleId!);
          const terminal=host.battleForProjection(ref)!;
          result={ok:true,kind:"surrender",battleId:terminal.battleId,status:terminal.status,endReason:terminal.endReason,
            winnerTeamId:terminal.status==="attack_win"?terminal.attackSideId:terminal.defendSideId};break;
        }
        case "command":result=host.submit(ref,actor,binding.battleId!,id,input.commands as Parameters<typeof host.submit>[4],Number(input.waitTicks));break;
        default:throw new Error("snow_unknown_operation");
      }
      if ((result as {ok?:boolean})?.ok===false) {
        this.db.prepare("UPDATE snow_tournament_options SET input_json=NULL WHERE option_id=?").run(id);
        return result;
      }
      return this.complete(id,encoded,result);
    });
    } catch (error) {
      const latest=this.options.store.read(binding.editionId) as State|null;
      if (!latest?.receipts || !Object.hasOwn(latest.receipts,id)) {
        this.db.prepare("UPDATE snow_tournament_options SET input_json=NULL WHERE option_id=? AND result_json IS NULL").run(id);
      }
      if (error instanceof Error && /^[a-z][a-z0-9_]+$/.test(error.message)) return {ok:false,error:{code:error.message}};
      throw error;
    }
  }
  private complete(id:string,input:string,result:unknown) {
    const normalized=result??{ok:true};
    this.db.prepare("UPDATE snow_tournament_options SET input_json=?,result_json=? WHERE option_id=?").run(input,JSON.stringify(normalized),id);
    return {result:normalized,replay:false};
  }
}
