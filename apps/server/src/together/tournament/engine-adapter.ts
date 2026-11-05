import {randomInt} from "node:crypto";
import { createBattle, restoreBattle, submitCommand, tick, viewForSide } from "./shared/engine.mjs";
import { SNOW_WAR_CONFIG } from "./shared/config.mjs";
import { snowWarNpcPolicy } from "./shared/npc.mjs";
import type { HostBattle, SnowMatchEngine } from "./match-host.js";
import {publicReplica} from "./shared/replica.js";

/** The runtime uses the same rules, input semantics and visibility as the original engine. */
export const tournamentEngine: SnowMatchEngine = {
  rulesVersion: SNOW_WAR_CONFIG.rulesVersion,
  commanderSkills: {
    attack: Object.keys(SNOW_WAR_CONFIG.commanderSkills.attack),
    defend: Object.keys(SNOW_WAR_CONFIG.commanderSkills.defend),
  },
  create: input => createBattle({...input,randomSeed:input.randomSeed??randomInt(1,0x100000000)}) as HostBattle,
  restore: battle => restoreBattle(battle) as HostBattle,
  tick,
  command: submitCommand,
  npc: (battle, side) => snowWarNpcPolicy({ role:side, view:viewForSide(battle,side) }) as ReturnType<SnowMatchEngine["npc"]>,
  view:viewForSide,
  catalog:SNOW_WAR_CONFIG,
};

export function projectTournamentBattle(battle: HostBattle) {
  return publicReplica(battle);
}
