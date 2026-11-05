import { randomInt } from "node:crypto";
import { monthlyWindow, weekendCalendar, type MonthlySnowSeason } from "./calendar.js";
import type { SnowTournamentEnginePort, SnowTournamentResults } from "./results.js";
import type { SnowTournamentStore } from "./store.js";
import type { SnowTournamentTeamService } from "./team-service.js";
import { SnowTournamentRecovery } from "./recovery.js";

type GameIndex = 0 | 1 | 2;
type ScheduledMatch = {
  id: string;
  stage: "round_robin" | "semifinal" | "final";
  teamAId: string | null;
  teamBId: string | null;
  status: "scheduled" | "in_progress" | "completed" | "forfeit" | "cancelled";
  scheduledAt: string | null;
  originalScheduledAt?:string;
  games?: unknown[];
};
type ScheduledEdition = {
  id: string; phase: string; registrationCloseAt: string; teamFormationCloseAt:string; matches: ScheduledMatch[];
  bracket: { semifinalMatchIds: string[] };
};

export interface SnowTournamentScheduleHost extends SnowTournamentEnginePort {
  /**
   * Owns persisted pre-match/round windows and technical pause. Calling again
   * with the same match and game must resume the saved host, not create a new one.
   * Returns its next wall-clock boundary, if any; combat ticks stay in the host.
   */
  reconcileMatch(input: {
    editionId: string; matchId: string; gameIndex: GameIndex;
    scheduledAt: number; now: number;
  }): Promise<number | null> | number | null;
  invalidateMatch?(ref:{editionId:string;matchId:string}):void;
}

type ScheduleOptions = {
  season: MonthlySnowSeason;
  isEligible(residentId: string): boolean | Promise<boolean>;
  registrationBell?: {
    queue(editionId:string,createdAt:number,expiresAt:number):string[];
    publish(ids:readonly string[]):void;
  };
  teamSignals?:{sync(editionId:string):void};
  onResult?:(editionId:string)=>void;
};

function drawTeams(ids: string[]) {
  const teams = [...ids];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [teams[i], teams[j]] = [teams[j]!, teams[i]!];
  }
  const oppositeAttackers = teams.length >= 4 && teams.length % 2 === 0
    ? teams.slice(0, teams.length / 2).map((id, i) => randomInt(2) ? id : teams[i + teams.length / 2]!)
    : [];
  return { teams, oppositeAttackers };
}

const pending = (match: ScheduledMatch) => match.status === "scheduled" || match.status === "in_progress";
const sides = (match: ScheduledMatch) => [match.teamAId, match.teamBId];
const minutes = 60_000;

export class SnowTournamentScheduler {
  private readonly recovery:SnowTournamentRecovery;
  private running: Promise<{ nextAt: number; failures: { id: string; error: unknown }[] }> | null = null;

  constructor(
    private readonly store: SnowTournamentStore,
    private readonly teams: SnowTournamentTeamService,
    private readonly results: SnowTournamentResults,
    private readonly host: SnowTournamentScheduleHost,
    private readonly options: ScheduleOptions,
  ) { this.recovery=new SnowTournamentRecovery(store); }

  /** The existing service clock calls this on startup, host terminal, or nextAt. */
  reconcile(now: number) {
    if (!this.running) {
      this.running = this.advance(now).finally(() => { this.running = null; });
    }
    return this.running;
  }

  private async advance(now: number) {
    const window = monthlyWindow(this.options.season, now);
    let nextAt = window.nextOpen;
    const watch = (at: number | null) => { if (at !== null && at > now) nextAt = Math.min(nextAt, at); };
    const failures: { id: string; error: unknown }[] = [];
    if (window.eligible && !this.store.read(window.id)) {
      const recipients=this.store.transaction(()=>{
        this.teams.createEdition({
          id: window.id, registrationOpenAt: window.registrationOpenAt, registrationCloseAt: window.registrationCloseAt,
          title: this.options.season.title, rulesVersion: this.options.season.rulesVersion,
        });
        return this.options.registrationBell?.queue(window.id,now,Date.parse(window.registrationCloseAt)) ?? [];
      });
      this.options.registrationBell?.publish(recipients);
    }
    for (const initial of this.store.unfinished() as ScheduledEdition[]) {
      if (!initial.id.startsWith("snow-tournament:")) continue;
      this.options.onResult?.(initial.id);
      if (this.recovery.expire(initial.id,now)) {
        for (const match of initial.matches) if (pending(match)) this.host.invalidateMatch?.({editionId:initial.id,matchId:match.id});
        this.options.onResult?.(initial.id);
        continue;
      }
      watch(this.recovery.boundary(initial.id,now));
      if (initial.phase === "registration") {
        const deadline = Date.parse(initial.registrationCloseAt);
        if (now < deadline) { watch(deadline); continue; }
        this.teams.openTeamFormation(initial.id,new Date(now).toISOString());
        this.options.teamSignals?.sync(initial.id);
      }
      const forming=this.store.read(initial.id) as ScheduledEdition;
      if (forming.phase === "team_formation") {
        const deadline=Date.parse(forming.teamFormationCloseAt);
        this.options.teamSignals?.sync(initial.id);
        if(now<deadline){watch(deadline);continue;}
        try {
          await this.teams.closeRegistration(initial.id, new Date(now).toISOString(), [], [], {
            isEligible: this.options.isEligible, draw: drawTeams,
          });
        } catch (error) {
          failures.push({ id: initial.id, error });
          const calendar = weekendCalendar(forming.teamFormationCloseAt);
          for (const time of calendar.roundRobinAt) watch(Date.parse(time) - 8 * minutes);
          watch(Date.parse(calendar.semifinalAt) - 10 * minutes);
          watch(Date.parse(calendar.finalAt) - 10 * minutes);
          continue;
        }
      }
      // Reload after each terminal, because this can publish the next bracket.
      const visited = new Set<string>();
      for (;;) {
        const edition = this.store.read(initial.id) as ScheduledEdition;
        if (!["round_robin", "knockout"].includes(edition.phase)) break;
        const ready: { match: ScheduledMatch; at: number }[] = [];
        for (const match of edition.matches) {
          if (!pending(match) || visited.has(match.id) || !match.teamAId || !match.teamBId) continue;
          if (match.stage === "final" && edition.matches.some(m => edition.bracket.semifinalMatchIds.includes(m.id) && pending(m))) continue;
          const at = match.scheduledAt === null ? NaN : Date.parse(match.scheduledAt);
          if (!Number.isFinite(at)) { failures.push({ id: match.id, error: new Error("snow_match_time_missing") }); visited.add(match.id); continue; }
          const prepareAt = at - (match.stage === "round_robin" ? 8 : 10) * minutes;
          if (now < prepareAt) { watch(prepareAt); continue; }
          // A delayed match must not let either of its teams enter another host.
          if (edition.matches.some(m => m.id !== match.id && pending(m) && m.scheduledAt !== null &&
            Date.parse(m.originalScheduledAt??m.scheduledAt) < Date.parse(match.originalScheduledAt??match.scheduledAt!) &&
            sides(m).some(id => id !== null && sides(match).includes(id)))) continue;
          ready.push({ match, at });
          visited.add(match.id);
        }
        if (!ready.length) break;
        // Host reconciliation is a short state transition, not a wait for the game to finish.
        await Promise.all(ready.map(async ({ match, at }) => {
          try {
            let index = (match.games?.length ?? 0) as GameIndex;
            if (now < at) {
              watch(at);
              watch(await this.host.reconcileMatch({ editionId: edition.id, matchId: match.id, gameIndex: index, now, scheduledAt: at }));
              return;
            }
            for (; index < 3; index = (index + 1) as GameIndex) {
              const input = { editionId: edition.id, matchId: match.id, gameIndex: index };
              if (!this.host.readTerminal(input)) {
                watch(await this.host.reconcileMatch({ ...input, now, scheduledAt: at }));
                if (!this.host.readTerminal(input)) break;
              }
              this.results.consumeTerminal(edition.id, match.id, index);
              this.options.onResult?.(edition.id);
            }
          } catch (error) {
            failures.push({ id: match.id, error });
            const ref={editionId:edition.id,matchId:match.id};
            const failedAt=this.recovery.pending(ref);
            if (failedAt!==undefined && now-failedAt>30*minutes) {
              for (const matchId of this.recovery.resume(ref,failedAt,now)) this.host.invalidateMatch?.({editionId:edition.id,matchId});
            }
            else this.recovery.failed(ref,now);
          }
        }));
        watch(this.recovery.boundary(initial.id,now));
      }
    }
    return { nextAt, failures };
  }
}

/** One wake at the next real boundary. The host calls wake() after persisting a terminal. */
export function startSnowTournamentClock(scheduler: SnowTournamentScheduler, report: (id: string, error: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false, running = false, requested = false;
  const wake = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    requested = true;
    if (!running) void drain();
  };
  async function drain() {
    running = true;
    let nextAt: number | undefined;
    try {
      while (requested && !stopped) {
        requested = false;
        const result = await scheduler.reconcile(Date.now());
        nextAt = result.nextAt;
        for (const failure of result.failures) report(failure.id, failure.error);
      }
    } catch (error) { report("snow-tournament-clock", error); }
    finally {
      running = false;
      if (!stopped && nextAt !== undefined) {
        timer = setTimeout(wake, Math.min(2_147_483_647, Math.max(0, nextAt - Date.now())));
        timer.unref();
      }
    }
  }
  wake();
  return { wake, stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
