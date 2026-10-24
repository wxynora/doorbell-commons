import { playedSnowRound } from "./snow-war-waits.mjs";

export const SNOW_TITLE_NAMES = Object.freeze({
  snow_fort_participant: "谁往我领子里塞雪了",
  snow_fort_winner: "雪堡拆迁办",
  snow_fort_loser: "刚才那把不算",
});

// Titles belong to every real series member, independently of monetary attendance.
export function ensureSnowTitleRewards(state, series) {
  if (series.status !== "complete") return;
  for (const side of ["A", "B"]) {
    for (const member of series.teams[side].members.filter((entry) => !entry.isNpc)) {
      const grantId = `${state.activityId}:titles:${member.id}`;
      // Separate immutable grant: old title receipts stay unchanged after cutover.
      const furnitureId = `${state.activityId}:loser-furniture:${member.id}`;
      if (side !== series.seriesWinner && !Object.hasOwn(state.rewards, furnitureId) &&
          series.matches.some(match => match.rounds.some(round => playedSnowRound(round, member.id)))) {
        state.rewards[furnitureId] = {
          grantId: furnitureId, residentId: member.id, kind: "titles", gold: 0, silver: 0,
          titles: ["snow_fort_participant", "snow_fort_loser"],
          decoration: { itemId: "farm_decor:small_snow_fort", quantity: 1 },
          status: "pending", receipt: null,
        };
      }
      if (Object.hasOwn(state.rewards, grantId)) continue;
      state.rewards[grantId] = {
        grantId,
        residentId: member.id,
        kind: "titles",
        gold: 0,
        silver: 0,
        titles: [
          "snow_fort_participant",
          side === series.seriesWinner ? "snow_fort_winner" : "snow_fort_loser",
        ],
        status: "pending",
        receipt: null,
      };
    }
  }
}
