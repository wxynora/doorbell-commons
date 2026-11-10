const hour = 3_600_000;
const day = 24 * hour;
const beijingOffset = 8 * hour;
export const snowFinalSlotGapMs = hour;

export const teamFormationCloseAt = (registrationCloseAt:string) => new Date(Date.parse(registrationCloseAt)+day).toISOString();

export type SnowTournamentCalendar = {
  roundRobinAt: string[];
  semifinalAt: string;
  finalAt: string;
};

/** Beijing's first Saturday 09:00 strictly after the registration deadline. */
export function weekendCalendar(closeAt: string, roundCount = 5): SnowTournamentCalendar {
  const local = new Date(Date.parse(closeAt) + beijingOffset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - beijingOffset;
  let saturday = midnight + ((6 - local.getUTCDay() + 7) % 7) * day + 9 * hour;
  if (saturday <= Date.parse(closeAt)) saturday += 7 * day;
  const iso = (time: number) => new Date(time).toISOString();
  const slots = [0, 1, 2, 5, 6];
  const knockout = saturday + Math.max(1, Math.ceil(roundCount / slots.length)) * day;
  return {
    roundRobinAt: Array.from({ length: roundCount }, (_, index) =>
      iso(saturday + Math.floor(index / slots.length) * day + slots[index % slots.length]! * hour)),
    semifinalAt: iso(knockout),
    finalAt: iso(knockout + snowFinalSlotGapMs),
  };
}

/** The approved November date change does not alter the monthly default. */
export function calendarForEdition(editionId:string,closeAt:string,roundCount=5):SnowTournamentCalendar {
  if(editionId!=="snow-tournament:2026-11")return weekendCalendar(closeAt,roundCount);
  return {
    roundRobinAt:["2026-11-08T04:00:00.000Z","2026-11-08T05:00:00.000Z","2026-11-08T06:00:00.000Z"],
    semifinalAt:"2026-11-09T01:00:00.000Z",
    finalAt:"2026-11-09T02:00:00.000Z",
  };
}

export type MonthlySnowSeason = {
  /** Explicitly configured first edition; the service never opens a season on its own. */
  firstRegistrationOpenAt: string;
  rulesVersion: string;
  title: string;
};

export function monthlyWindow(season: MonthlySnowSeason, now: number) {
  const first = Date.parse(season.firstRegistrationOpenAt);
  const anchor = new Date(first + beijingOffset);
  if (!Number.isFinite(first) || !season.title || !season.rulesVersion) {
    throw new Error("invalid_snow_tournament_season");
  }
  const local = new Date(now + beijingOffset);
  const openAt = (month: number) => {
    const date=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+month,1));
    if(date.getUTCFullYear()===anchor.getUTCFullYear()&&date.getUTCMonth()===anchor.getUTCMonth())return first;
    return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1,
      anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds())-beijingOffset;
  };
  const opens = openAt(0), closes = opens + 2 * day;
  const id = `snow-tournament:${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    id,
    registrationOpenAt: new Date(opens).toISOString(),
    registrationCloseAt: new Date(closes).toISOString(),
    eligible: opens >= first && now >= opens && now < closes,
    nextOpen: Math.max(first, now < opens ? opens : openAt(1)),
  };
}
