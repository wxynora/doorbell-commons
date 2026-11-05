/** Pure competition calculations. Inputs are persisted draws and authoritative results. */
export interface Pairing { round: number; attackerTeamId: string; defenderTeamId: string }

export interface KnockoutFixture { stage: "semifinal" | "final"; teams: [string | null, string | null] }
/** The caller persists the returned bracket once; later withdrawals never reseed it. */
export function seedKnockout(rankedActiveTeams: string[], battleStarted: boolean, initialTeamCount: number): {
  fixtures: KnockoutFixture[]; championTeamId: string | null; cancelled: boolean;
} {
  if (new Set(rankedActiveTeams).size !== rankedActiveTeams.length) throw new Error("invalid_seeds");
  const [first, second, third, fourth] = rankedActiveTeams;
  if (!first) return {fixtures:[], championTeamId:null, cancelled:true};
  if (!second) return {fixtures:[], championTeamId:battleStarted ? first : null, cancelled:!battleStarted};
  if (!third || initialTeamCount === 3) return {fixtures:[{stage:"final",teams:[first,second]}], championTeamId:null, cancelled:false};
  if (!fourth) return {fixtures:[{stage:"semifinal",teams:[second,third]},{stage:"final",teams:[first,null]}], championTeamId:null, cancelled:false};
  return {fixtures:[{stage:"semifinal",teams:[first,fourth]},{stage:"semifinal",teams:[second,third]},{stage:"final",teams:[null,null]}], championTeamId:null, cancelled:false};
}

export function roundRobin(draw: string[], oppositeAttackers: string[] = []): Pairing[] {
  if (draw.length < 3 || new Set(draw).size !== draw.length) throw new Error("invalid_draw");
  const n = draw.length;
  if (n % 2 === 0 && (oppositeAttackers.length !== n / 2 ||
      oppositeAttackers.some((id, i) => id !== draw[i] && id !== draw[i + n / 2]))) {
    throw new Error("invalid_opposite_draw");
  }
  // The five-team timetable is the explicitly published table in the rules.
  if (n === 5) return [[0,1,2,3],[0,2,4,1],[3,0,2,4],[4,0,1,3],[1,2,3,4]]
    .flatMap((r, i) => [{round:i+1, attackerTeamId:draw[r[0]!]!, defenderTeamId:draw[r[1]!]!},
      {round:i+1, attackerTeamId:draw[r[2]!]!, defenderTeamId:draw[r[3]!]!}]);
  const ring: (number | null)[] = draw.map((_, i) => i);
  if (n % 2) ring.push(null);
  const result: Pairing[] = [];
  for (let round = 1; round < ring.length; round++) {
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i];
      if (a == null || b == null) continue;
      const distance = (b - a + n) % n;
      const attackA = n % 2 === 0 && distance === n / 2
        ? oppositeAttackers[Math.min(a,b)] === draw[a]
        : distance <= Math.floor((n - 1) / 2);
      result.push({round, attackerTeamId:draw[attackA ? a : b]!, defenderTeamId:draw[attackA ? b : a]!});
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return result;
}

export interface RankingMatch {
  attackerTeamId: string; defenderTeamId: string;
  attackerWins: number; defenderWins: number;
  /** Only real, non-void attack games; excluded entirely for withdrawn-team matches. */
  attackGames: { coreDamage: number; breakTimeRemaining: number }[];
  /** Both withdrawn means no points and no game difference. */
  doubleForfeit?: boolean;
}
export interface RankingRow {
  teamId: string; rank: number; points: number; wins: number; losses: number; gameDifference: number;
  averageCoreDamage: number | null; averageBreakTimeRemaining: number | null;
}
export function rankTeams(draw: string[], matches: RankingMatch[], withdrawn: Set<string> = new Set()): RankingRow[] {
  const rows = draw.map((teamId) => ({teamId, rank: 0, points: 0, wins: 0, losses: 0,
    gameDifference: 0, averageCoreDamage: null as number | null, averageBreakTimeRemaining: null as number | null}));
  const byId = new Map(rows.map(row => [row.teamId, row]));
  const samples = new Map(draw.map(id => [id, [] as RankingMatch["attackGames"]]));
  const normalized = matches.map(match => {
    const a = withdrawn.has(match.attackerTeamId), d = withdrawn.has(match.defenderTeamId);
    return {...match, doubleForfeit: match.doubleForfeit || (a && d),
      attackerWins: a ? 0 : d ? 3 : match.attackerWins,
      defenderWins: d ? 0 : a ? 3 : match.defenderWins,
      attackGames: a || d ? [] : match.attackGames};
  });
  for (const match of normalized) {
    const a = byId.get(match.attackerTeamId), d = byId.get(match.defenderTeamId);
    if (!a || !d || a === d) throw new Error("invalid_match");
    if (match.doubleForfeit) continue;
    if (match.attackerWins + match.defenderWins !== 3) throw new Error("incomplete_match");
    a.gameDifference += match.attackerWins - match.defenderWins;
    d.gameDifference += match.defenderWins - match.attackerWins;
    const winner = match.attackerWins > match.defenderWins ? a : d;
    const loser = winner === a ? d : a;
    winner.points += 3; winner.wins++; loser.losses++;
    samples.get(a.teamId)!.push(...match.attackGames);
  }
  for (const row of rows) {
    const games = samples.get(row.teamId)!;
    if (games.length) {
      row.averageCoreDamage = games.reduce((sum, game) => sum + game.coreDamage, 0) / games.length;
      row.averageBreakTimeRemaining = games.reduce((sum, game) => sum + game.breakTimeRemaining, 0) / games.length;
    }
  }
  const sorted: RankingRow[] = [];
  for (const points of [...new Set(rows.map(r => r.points))].sort((a,b) => b-a)) {
    const group = rows.filter(r => r.points === points);
    const members = new Set(group.map(r => r.teamId));
    const mini = new Map(group.map(r => [r.teamId, 0]));
    for (const m of normalized) if (!m.doubleForfeit && members.has(m.attackerTeamId) && members.has(m.defenderTeamId)) {
      const winner = m.attackerWins > m.defenderWins ? m.attackerTeamId : m.defenderTeamId;
      mini.set(winner, mini.get(winner)! + 3);
    }
    for (const score of [...new Set(mini.values())].sort((a,b) => b-a)) {
      const tied = group.filter(r => mini.get(r.teamId) === score);
      for (const diff of [...new Set(tied.map(r => r.gameDifference))].sort((a,b) => b-a)) {
        const equal = tied.filter(r => r.gameDifference === diff);
        const hasSamples = equal.every(r => r.averageCoreDamage !== null);
        equal.sort((a,b) => hasSamples
          ? (b.averageCoreDamage! - a.averageCoreDamage!) || (b.averageBreakTimeRemaining! - a.averageBreakTimeRemaining!) || draw.indexOf(a.teamId)-draw.indexOf(b.teamId)
          : draw.indexOf(a.teamId)-draw.indexOf(b.teamId));
        sorted.push(...equal);
      }
    }
  }
  return sorted.map((row, index) => ({...row, rank:index + 1}));
}
