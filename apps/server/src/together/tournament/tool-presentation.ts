import type {SnowTournamentEdition} from "@doorbell/protocol";

type Binding={kind:string;teamId?:string;residentId?:string;offerId?:string};
type Teams={teams:{id:string;name:string}[];offers:{id:string;kind:string;residentId:string}[]};
export function snowTeamOptionLabel(binding:Binding,state:Teams,name:(id:string)=>string) {
  const team=state.teams.find(team=>team.id===binding.teamId);
  const offer=state.offers.find(offer=>offer.id===binding.offerId);
  switch(binding.kind){
    case "register":return "报名";
    case "create":return "创建队伍";
    case "rename":return "更改队伍名";
    case "invite":return `邀请${name(binding.residentId!)}`;
    case "request":return `申请加入『${team!.name}』`;
    case "accept":return offer?.kind==="handover"?"accept_captain":offer?.kind==="request"?`同意${name(offer.residentId)}加入`:`接受『${team!.name}』的邀请`;
    case "decline":return "拒绝邀请／申请";
    case "channel":return "队内频道";
    default:return binding.kind;
  }
}

/** Only the action's own facts; never append the lobby, rules or channel history. */
export function snowTeamReceipt(value:unknown,edition:SnowTournamentEdition,residents:{id:string;name:string}[]) {
  const result=value as {ok:boolean;kind:string;offerKind?:string;team?:{id:string;name:string};resident?:{id:string};roundId?:string;status?:string};
  if (result.kind==="rename") return {ok:result.ok,kind:result.kind,teamName:result.team!.name};
  const team=edition.teams.find(team=>team.id===result.team?.id);
  const resident=residents.find(member=>member.id===result.resident?.id);
  const roster=team?.members.map(member=>member.name).join("、");
  let text:string|undefined;
  switch(result.kind){
    case "register":text="报名已登记。自由组队开始时会响铃通知你。";break;
    case "create":text=`已创建『${team!.name}』，你是队长。当前成员：${roster}（${team!.members.length}/3）。`;break;
    case "invite":text=`已邀请${resident!.name}加入『${team!.name}』，等待对方接受。`;break;
    case "request":text=`已申请加入『${team!.name}』，等待队长确认。`;break;
    case "accept":if(result.offerKind!=="handover")text=`${resident!.name}已加入『${team!.name}』。当前成员：${roster}（${team!.members.length}/3）。`;break;
    case "decline":text="已拒绝这次邀请／申请。";break;
  }
  if(text)return {ok:result.ok,kind:result.kind,text};
  return {ok:result.ok,kind:result.kind,...(result.offerKind?{offerKind:result.offerKind}:{}),
    ...(team?{teamName:team.name,captain:team.members.find(member=>member.id===team.captainId)?.name??null,members:team.members.map(member=>member.name)}:{}),
    ...(result.roundId?{confirmed:true,feeGold:10000}:{})};
}
