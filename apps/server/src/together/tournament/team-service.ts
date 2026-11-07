import { randomUUID } from "node:crypto";
import { calendarForEdition, teamFormationCloseAt, type SnowTournamentCalendar } from "./calendar.js";
import { roundRobin } from "./competition.js";
import { beginCharge, cancelRegistration, confirmRegistration, newRegistrationRound, resolveCharge, resolveRefund, type RegistrationRound } from "./registration.js";
import { SnowTournamentStore } from "./store.js";
import { fillSnowTeamSeats, snowTeamHasOpenSeat, snowTeamLimit, type SnowTeamMember } from "./roster.js";

type Member = { id: string; name: string };
type Team = { id: string; name: string; captainId: string | null; members: SnowTeamMember[]; status: "forming" | "registered" | "withdrawn"; drawOrder: number | null };
type Offer = { id: string; teamId: string; residentId: string; kind: "invite" | "request" | "handover"; fromCaptainId?: string };
type State = {
  id: string; phase: string; registrationOpenAt: string; registrationCloseAt: string; teamFormationCloseAt:string; revision: number;
  enrollments:(Member & {registeredAt:string})[];
  teams: Team[]; offers: Offer[]; registrationRounds: RegistrationRound[];
  matches: unknown[]; bracket: unknown; receipts: Record<string, { actorId: string; input: string; result: unknown }>;
  calendar?: SnowTournamentCalendar;
  deadlineConfirmationAt?:number;
};
type Command = { editionId: string; actorId: string; commandId: string; revision?: number; now: string } & (
  | { action: "register" }
  | { action: "create"; teamId: string; name: string }
  | { action: "rename"; teamId: string; name: string }
  | { action: "invite"; teamId: string; residentId: string; offerId: string }
  | { action: "request"; teamId: string; offerId: string }
  | { action: "handover"; teamId: string; residentId: string; offerId: string }
  | { action: "accept_captain"; teamId: string }
  | { action: "accept"; offerId: string }
  | { action: "decline"; offerId: string }
  | { action: "leave"; teamId: string }
  | { action: "cancel"; teamId: string }
  | { action: "confirm"; teamId: string; roster: string[] }
);
export type SnowTournamentIdentityPort = { requireActive(residentId: string): Promise<Member> };

/** No transport here: actorId must come from the verified resident connection, never tool arguments. */
export class SnowTournamentTeamService {
  constructor(private readonly store: SnowTournamentStore, private readonly identity: SnowTournamentIdentityPort) {}

  /** Trusted edition configuration, not exposed as a human or player write route. */
  createEdition(input: {id:string; title:string; registrationOpenAt:string; registrationCloseAt:string; rulesVersion:string}): void {
    const opens=Date.parse(input.registrationOpenAt), closes=Date.parse(input.registrationCloseAt);
    if (!input.id || !input.title || !Number.isFinite(opens) || !Number.isFinite(closes) || opens >= closes) throw new Error("invalid_edition");
    const normalized={...input,registrationOpenAt:new Date(opens).toISOString(),registrationCloseAt:new Date(closes).toISOString(),teamFormationCloseAt:teamFormationCloseAt(input.registrationCloseAt)};
    this.store.transaction(() => {
      if (this.store.read(input.id)) throw new Error("edition_exists");
      this.store.save(input.id,normalized.registrationOpenAt,{...normalized,calendar:calendarForEdition(input.id,normalized.teamFormationCloseAt),phase:"registration",revision:0,enrollments:[],teams:[],offers:[],registrationRounds:[],matches:[],standings:[],bracket:{semifinalMatchIds:[],finalMatchId:null,championTeamId:null},rewards:[],receipts:{}});
    });
  }

  /** Refresh an unstarted edition's public calendar without touching roster or payments. */
  refreshCalendar(editionId:string):void {
    this.store.transaction(()=>{
      const state=this.requireState(editionId);
      if(!["registration","team_formation"].includes(state.phase)||state.matches.length)return;
      const calendar=calendarForEdition(state.id,state.teamFormationCloseAt);
      if(JSON.stringify(state.calendar)===JSON.stringify(calendar))return;
      state.calendar=calendar;state.revision++;
      this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  async execute(command: Command,onStored?:(result:unknown)=>void): Promise<unknown> {
    if (!command.commandId) throw new Error("invalid_command_id");
    const actor = await this.identity.requireActive(command.actorId);
    if (actor.id !== command.actorId) throw new Error("identity_mismatch");
    // In an invitation the recipient must also be an active real resident at acceptance.
    const target = command.action === "accept" || command.action === "decline" ? await this.offerTarget(command.editionId, command.offerId) : null;
    const accepted = command.action==="accept" && target && target.residentId !== actor.id ? await this.identity.requireActive(target.residentId) : actor;
    if (command.action==="accept" && target && accepted.id !== target.residentId) throw new Error("identity_mismatch");
    const invited = command.action === "invite" ? await this.identity.requireActive(command.residentId) : null;
    if(invited && command.action==="invite" && invited.id!==command.residentId)throw new Error("identity_mismatch");
    return this.store.transaction(() => {
      const state = this.requireState(command.editionId);
      const { now: _now, ...stableCommand } = command;
      const input = JSON.stringify(stableCommand);
      const receipt = Object.hasOwn(state.receipts,command.commandId) ? state.receipts[command.commandId] : undefined;
      if (receipt) {
        if (receipt.actorId !== actor.id || receipt.input !== input) throw new Error("command_conflict");
        onStored?.(receipt.result);
        return receipt.result;
      }
      if (command.revision!==undefined && state.revision !== command.revision) throw new Error("stale_revision");
      const now=Date.parse(command.now);
      if(command.action==="register") {
        if(!Number.isFinite(now)||state.phase!=="registration"||now<Date.parse(state.registrationOpenAt)||now>=Date.parse(state.registrationCloseAt))throw new Error("registration_closed");
        if(state.enrollments.some(member=>member.id===actor.id))throw new Error("already_registered");
        state.enrollments.push({...actor,registeredAt:command.now});
      } else {
        if(!Number.isFinite(now)||state.phase!=="team_formation"||now<Date.parse(state.registrationCloseAt)||now>=Date.parse(state.teamFormationCloseAt))throw new Error("team_formation_closed");
        if(!state.enrollments.some(member=>member.id===actor.id))throw new Error("registration_required");
      }
      const ownTeam = () => state.teams.find(t => t.status !== "withdrawn" && t.members.some(m => m.id === actor.id));
      const team = (id: string) => { const t = state.teams.find(t => t.id === id && t.status !== "withdrawn"); if (!t) throw new Error("team_not_found"); return t; };
      const captain = (t: Team) => { if (t.captainId !== actor.id) throw new Error("captain_required"); };
      const invalidate = (t: Team) => { for (const r of state.registrationRounds) if (r.teamId === t.id && r.status !== "cancelled") cancelRegistration(r); t.status = "forming"; };
      let result: unknown = { ok:true };
      switch (command.action) {
        case "register":break;
        case "create": {
          if (ownTeam() || !command.name.trim() || state.teams.some(t => t.id === command.teamId)) throw new Error("cannot_create_team");
          if(state.teams.filter(t=>t.status!=="withdrawn").length>=snowTeamLimit(state.enrollments.length))throw new Error("team_limit_reached");
          state.teams.push({id:command.teamId,name:command.name.trim(),captainId:actor.id,members:[actor],status:"forming",drawOrder:null});
          break;
        }
        case "rename": {
          const t=team(command.teamId); captain(t);
          const name=command.name.trim();
          if (!name) throw new Error("cannot_rename_team");
          t.name=name; break;
        }
        case "invite": {
          const t = team(command.teamId); captain(t);
          if (!snowTeamHasOpenSeat(t) || state.teams.some(x => x.status !== "withdrawn" && x.members.some(m => m.id === command.residentId))) throw new Error("cannot_invite");
          if(!state.enrollments.some(member=>member.id===command.residentId))throw new Error("registration_required");
          if (state.offers.some(o => o.id === command.offerId || o.teamId===t.id && o.residentId===command.residentId && o.kind==="invite")) throw new Error("offer_exists");
          state.offers.push({id:command.offerId,teamId:t.id,residentId:command.residentId,kind:"invite",fromCaptainId:actor.id}); break;
        }
        case "request": {
          const t = team(command.teamId);
          if (ownTeam() || !snowTeamHasOpenSeat(t) || state.offers.some(o => o.id === command.offerId || o.teamId===t.id && o.residentId===actor.id && o.kind==="request")) throw new Error("cannot_request");
          state.offers.push({id:command.offerId,teamId:t.id,residentId:actor.id,kind:"request"}); break;
        }
        case "handover": {
          const t = team(command.teamId); captain(t);
          if (t.status === "registered" || command.residentId === actor.id || !t.members.some(m => m.id === command.residentId) || state.offers.some(o => o.id === command.offerId)) throw new Error("cannot_handover");
          state.offers.push({id:command.offerId,teamId:t.id,residentId:command.residentId,kind:"handover",fromCaptainId:actor.id}); break;
        }
        case "accept_captain": {
          const t = team(command.teamId);
          if (t.captainId !== null || t.status !== "forming" || !t.members.some(m => m.id === actor.id)) throw new Error("captain_vacancy_not_available");
          t.captainId = actor.id; break;
        }
        case "accept":
        case "decline": {
          const offer = state.offers.find(o => o.id === command.offerId);
          if (!offer || !target || offer.teamId !== target.teamId || offer.residentId !== target.residentId || offer.kind !== target.kind) throw new Error("offer_not_found");
          const t = team(offer.teamId);
          if(command.action==="decline") {
            if(offer.kind==="request"?t.captainId!==actor.id:offer.residentId!==actor.id)throw new Error("not_offer_recipient");
            state.offers=state.offers.filter(entry=>entry.id!==offer.id);break;
          }
          if (offer.kind === "handover") {
            if (offer.residentId !== actor.id || offer.fromCaptainId !== t.captainId || t.status === "registered" || !t.members.some(m => m.id === actor.id)) throw new Error("not_offer_recipient");
            t.captainId = actor.id;
            state.offers = state.offers.filter(o => o.teamId !== t.id || o.kind !== "handover");
            break;
          }
          if (offer.kind === "invite" ? offer.residentId !== actor.id : t.captainId !== actor.id) throw new Error("not_offer_recipient");
          if (!snowTeamHasOpenSeat(t) || state.teams.some(x => x.status !== "withdrawn" && x.members.some(m => m.id === offer.residentId))) throw new Error("cannot_join");
          if(!state.enrollments.some(member=>member.id===accepted.id))throw new Error("registration_required");
          invalidate(t); t.members.push(accepted);
          state.offers = state.offers.filter(o => o.residentId !== accepted.id && o.id !== offer.id); break;
        }
        case "leave": {
          const t = team(command.teamId);
          if (!t.members.some(m => m.id === actor.id)) throw new Error("not_member");
          invalidate(t); t.members = t.members.filter(m => m.id !== actor.id);
          if (!t.members.length) t.status = "withdrawn";
          else if (t.captainId === actor.id) t.captainId = null;
          break;
        }
        case "cancel": { const t = team(command.teamId); if (!t.members.some(m => m.id === actor.id)) throw new Error("not_member"); invalidate(t); break; }
        case "confirm": {
          const t = team(command.teamId);
          if (!t.captainId) throw new Error("invalid_roster");
          let round = state.registrationRounds.find(r => r.teamId === t.id && r.status !== "cancelled");
          if (!round) { round = newRegistrationRound(randomUUID(), t.id, t.members.map(m => m.id)); state.registrationRounds.push(round); }
          confirmRegistration(round, actor.id, command.roster); result = {ok:true,roundId:round.id,status:round.status}; break;
        }
      }
      const changedTeam=state.teams.find(entry=>entry.id===("teamId" in command?command.teamId:target?.teamId));
      result={...result as object,kind:command.action,...(target?{offerKind:target.kind}:{}),...(changedTeam?{team:structuredClone(changedTeam)}:{}),
        ...(invited?{resident:invited}:command.action==="accept"?{resident:accepted}:"residentId" in command?{resident:changedTeam?.members.find(member=>member.id===command.residentId)}:{})};
      state.revision++;
      Object.defineProperty(state.receipts,command.commandId,{value:{actorId:actor.id,input,result},enumerable:true,writable:true,configurable:true});
      this.store.save(state.id,state.registrationOpenAt,state);
      onStored?.(result);
      return result;
    });
  }

  private requireState(id: string): State { const state = this.store.read(id) as State | null; if (!state) throw new Error("edition_not_found"); return state; }
  private async offerTarget(id: string, offerId: string): Promise<Offer | null> {
    return this.requireState(id).offers.find(o => o.id === offerId) ?? null;
  }

  /** Trusted clock transition; the 24-hour team window never depends on a player opening the tool. */
  openTeamFormation(editionId:string,now:string):string[] {
    return this.store.transaction(()=>{
      const state=this.requireState(editionId);
      if(state.phase!=="registration"||Date.parse(now)<Date.parse(state.registrationCloseAt))throw new Error("cannot_open_team_formation");
      state.phase="team_formation";state.revision++;
      this.store.save(state.id,state.registrationOpenAt,state);
      return state.enrollments.map(member=>member.id);
    });
  }

  /** Deadline authority freezes eligible real rosters once, before economic I/O. */
  async confirmDueRosters(editionId:string,now:string,isEligible:(residentId:string)=>boolean|Promise<boolean>):Promise<void> {
    const snapshot=this.requireState(editionId),at=Date.parse(now);
    if(snapshot.phase!=="team_formation"||at<Date.parse(snapshot.teamFormationCloseAt)||!Number.isFinite(at)||snapshot.deadlineConfirmationAt!==undefined)return;
    const eligible=new Set<string>();
    for(const team of snapshot.teams.filter(team=>team.status==="forming"&&team.captainId&&team.members.length)){
      let valid=true;
      for(const member of team.members)if(!member.npc&&!await isEligible(member.id)){valid=false;break;}
      if(valid)eligible.add(team.id);
    }
    this.store.transaction(()=>{
      const state=this.requireState(editionId);
      if(state.deadlineConfirmationAt!==undefined)return;
      if(state.revision!==snapshot.revision)throw new Error("stale_revision");
      for(const team of state.teams.filter(team=>eligible.has(team.id))){
        const roster=team.members.filter(member=>!member.npc).map(member=>member.id);
        let round=state.registrationRounds.find(round=>round.teamId===team.id&&round.status!=="cancelled");
        if(!round){round=newRegistrationRound(randomUUID(),team.id,roster);state.registrationRounds.push(round);}
        if(round.status==="confirming")for(const residentId of roster)confirmRegistration(round,residentId,roster);
        if(round.status==="paying")round.deadlineConfirmedAt=at;
      }
      state.deadlineConfirmationAt=at;state.revision++;
      this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  /** Trusted economy coordinator only. Persist before I/O and resolve only verified receipts. */
  paymentTransition(editionId: string, roundId: string, operation: { kind:"dispatch"; residentId:string } | { kind:"charge_result"; paymentId:string; outcome:"paid" | "failed"; receivedAt?:number } | { kind:"refund_confirmed"; paymentId:string }): void {
    this.store.transaction(() => {
      const state = this.requireState(editionId);
      const round = state.registrationRounds.find(r => r.id === roundId);
      if (!round) throw new Error("round_not_found");
      if (operation.kind === "dispatch") beginCharge(round,operation.residentId);
      else if (operation.kind === "charge_result") {
        if (round.status!=="registered" && round.deadlineConfirmedAt===undefined && operation.receivedAt!==undefined &&
            operation.receivedAt>=Date.parse(state.teamFormationCloseAt)) cancelRegistration(round);
        resolveCharge(round,operation.paymentId,operation.outcome);
      }
      else resolveRefund(round,operation.paymentId);
      const team = state.teams.find(t => t.id === round.teamId);
      if (team && round.status === "registered") team.status = "registered";
      else if (team && round.status === "cancelled" && team.status === "registered") team.status = "forming";
      state.revision++; this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  /** Trusted scheduler; draw must be the once-persisted public permutation of all paid teams. */
  async closeRegistration(editionId: string, now: string, draw: string[], oppositeAttackers: string[] = [], policy?: {
    /** False means an authoritative loss of eligibility; lookup errors must throw. */
    isEligible(residentId: string): boolean | Promise<boolean>;
    draw(eligibleTeamIds: string[]): { teams: string[]; oppositeAttackers: string[] };
  }): Promise<void> {
    const snapshot = this.requireState(editionId);
    const currentTime=Date.parse(now);
    if (!Number.isFinite(currentTime) || snapshot.phase !== "team_formation" || currentTime < Date.parse(snapshot.teamFormationCloseAt)) throw new Error("cannot_close");
    const excluded = new Set<string>();
    for (const team of snapshot.teams.filter(t => t.status === "registered")) for (const member of team.members) {
      if (policy) {
        if (!await policy.isEligible(member.id)) { excluded.add(team.id); break; }
        continue;
      }
      const identity = await this.identity.requireActive(member.id);
      if (identity.id !== member.id) throw new Error("identity_mismatch");
    }
    if (policy) ({ teams: draw, oppositeAttackers } = policy.draw(snapshot.teams.filter(t => t.status === "registered" && !excluded.has(t.id)).map(t => t.id)));
    this.store.transaction(() => {
      const state = this.requireState(editionId);
      if (state.revision !== snapshot.revision) throw new Error("stale_revision");
      const registered = state.teams.filter(t => t.status === "registered" && !excluded.has(t.id));
      if (draw.length !== registered.length || new Set(draw).size !== draw.length || draw.some(id => !registered.some(t => t.id === id))) throw new Error("invalid_draw");
      for (const team of state.teams) {
        if (!draw.includes(team.id)) {
          for (const round of state.registrationRounds.filter(r => r.teamId === team.id)) cancelRegistration(round);
          if (excluded.has(team.id)) team.status = "withdrawn";
        }
        team.drawOrder = draw.indexOf(team.id) < 0 ? null : draw.indexOf(team.id);
      }
      if (draw.length>=2) for (const team of registered) fillSnowTeamSeats(team);
      if (draw.length < 2) {
        for (const round of state.registrationRounds) cancelRegistration(round);
        for (const team of registered) team.status = "forming";
        state.phase = "cancelled";
      } else if (draw.length === 2) {
        state.phase = "knockout";
        state.calendar=calendarForEdition(state.id,state.teamFormationCloseAt);
        const finalId = `${state.id}:final`;
        state.matches = [{id:finalId,stage:"final",round:1,teamAId:draw[0],teamBId:draw[1],attackerTeamId:null,defenderTeamId:null,status:"scheduled",scheduledAt:state.calendar?.finalAt??null,score:null,winnerTeamId:null}];
        state.bracket = {semifinalMatchIds:[],finalMatchId:finalId,championTeamId:null};
      } else {
        state.phase = "round_robin";
        const pairings = roundRobin(draw,oppositeAttackers);
        const roundCount = pairings.at(-1)!.round;
        const calendar = calendarForEdition(state.id,state.teamFormationCloseAt, roundCount);
        state.calendar = calendar;
        state.matches = pairings.map((pair,i) => ({ id:`${state.id}:rr:${i+1}`, stage:"round_robin",
          teamAId:pair.attackerTeamId,teamBId:pair.defenderTeamId,...pair,status:"scheduled",scheduledAt:calendar.roundRobinAt[pair.round-1]!,score:null,winnerTeamId:null }));
      }
      state.revision++; this.store.save(state.id,state.registrationOpenAt,state);
    });
  }
}
