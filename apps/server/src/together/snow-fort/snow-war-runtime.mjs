// Internal host integration candidate, not an HTTP/MCP endpoint.
// The caller supplies an already-authenticated resident. No player identity fields.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  advanceSnowDecisionWakes,
  markSnowDecisionNotified,
  pendingSnowDecisions,
  scheduleSnowDecision,
} from "./snow-war-decision-wakes.mjs";
import { restoreBattle, submitCommand, tick, viewForSide } from "./snow-war-engine.mjs";
import { snowWarNpcPolicy } from "./snow-war-npc.mjs";
import { readSnowProcessIdentity } from "./snow-war-process-identity.mjs";
import {
  createSeries,
  restoreSeries,
  seriesView,
  settleRoundFromBattle,
  startRound,
  submitLineup,
} from "./snow-war-series.mjs";
import { openSnowWarStore } from "./snow-war-store.mjs";
import { SNOW_WAIT_MS } from "./snow-war-waits.mjs";

const COMMAND_FIELDS = {
  spawn: ["type", "requestId", "unitType", "lane"],
  deploy: ["type", "requestId", "unitType", "lane", "cell"],
  retreat: ["type", "requestId", "unitId"],
  unit_skill: ["type", "requestId", "unitId"],
  commander_skill: ["type", "requestId", "skill", "lane"],
};
const copy = (value) => structuredClone(value);
const fail = (code) => {
  throw new Error(code);
};
const own = (object, key) => Object.hasOwn(object, key);

export function openSnowWarRuntime({
  dbPath,
  store: providedStore,
  clock = () => performance.now(),
  now = Date.now,
  automatic = true,
  npcPolicy = snowWarNpcPolicy,
  onTerminal = () => {},
  onDecisionDue = () => {},
  onSnapshot = () => {},
}) {
  const store = providedStore ?? openSnowWarStore(dbPath);
  const owner = { pid: process.pid, nonce: randomUUID() };
  try {
    owner.processIdentity = readSnowProcessIdentity(process.pid);
    if (!owner.processIdentity) fail("runtime_owner_unverifiable");
    store.claimRuntime(owner);
  } catch (error) {
    store.close();
    throw error;
  }
  const lastTicks = new Map();
  let timer;
  let closed = false;
  let activityTransaction = false;
  const requireOpen = () => {
    if (closed) fail("runtime_closed");
  };
  const seriesAt = (id) => {
    const value = store.loadSeries(id);
    if (!value) fail("series_not_found");
    return restoreSeries(value);
  };
  const battleAt = (id) => {
    const value = store.loadBattle(id);
    if (!value) fail("battle_not_found");
    return restoreBattle(value);
  };
  const locate = (battle) => {
    const series = seriesAt(battle.roundId);
    for (const match of series.matches)
      for (const round of match.rounds) {
        if (round.battleId === battle.battleId) return { series, match, round };
      }
    fail("battle_not_in_series");
  };
  const persist = (battle) => {
    const decisionDue = advanceSnowDecisionWakes(battle);
    if (battle.status === "running") store.saveBattle(battle);
    else {
      const { series, match, round } = locate(battle);
      settleRoundFromBattle(series, match.index, round.index, battle);
      store.saveSeriesAndBattle(series, battle);
    }
    if (decisionDue) queueMicrotask(onDecisionDue);
    queueMicrotask(onSnapshot); // Read-only observers run after the enclosing SQLite commit.
  };
  const authorize = (battle, residentId) => {
    const sides = ["attack", "defend"].filter((side) =>
      battle.participants[side].includes(residentId),
    );
    if (sides.length !== 1) fail("not_battle_participant");
    return sides[0];
  };

  const expirePreparation = (battleId, at = now()) => {
    let started = false;
    store.transaction(() => {
      const battle = battleAt(battleId);
      const state = battle.runtime;
      if (battle.status === "running" && !state.started && state.readyDeadlineAt === undefined) {
        state.readyDeadlineAt = at + SNOW_WAIT_MS.ready;
        store.saveBattle(battle);
        return;
      }
      if (battle.status !== "running" || state.started || at < state.readyDeadlineAt) return;
      const missing = [...battle.participants.attack, ...battle.participants.defend].filter(
        (id) => !own(state.ready, id),
      );
      state.substitutes = [...new Set([...(state.substitutes ?? []), ...missing])];
      state.npcs = [...new Set([...(state.npcs ?? []), ...missing])];
      for (const id of missing) state.ready[id] = true;
      state.started = true;
      started = true;
      persist(battle);
    });
    if (started) {
      lastTicks.set(battleId, clock());
      scheduleClock();
    }
  };

  // Restore completed-but-unsettled results before accepting any host actions.
  try {
    store.transaction(() => {
      for (const entry of store.listBattles()) {
        const battle = battleAt(entry.battleId);
        if (battle.status !== "running") persist(battle);
        else if (battle.runtime?.started) {
          persist(battle);
          lastTicks.set(battle.battleId, clock());
        }
      }
    });
  } catch (error) {
    store.releaseRuntime(owner);
    store.close();
    throw error;
  }

  // While the host is alive, elapsed monotonic time is authoritative. A restarted
  // host resets this baseline: offline time is never replayed as battle time.
  const pump = () => {
    requireOpen();
    if (activityTransaction) return;
    const now = clock();
    for (const entry of store.listBattles()) {
      if (entry.status !== "running") continue;
      expirePreparation(entry.battleId);
      const previous = lastTicks.get(entry.battleId) ?? now;
      const due = Math.floor((now - previous) / 1000);
      if (due <= 0) continue;
      let finished = false;
      store.transaction(() => {
        const battle = battleAt(entry.battleId);
        if (!battle.runtime?.started || battle.status !== "running") return;
        for (let n = 0; n < due && battle.status === "running"; n++) {
          for (const side of ["attack", "defend"]) {
            for (const member of battle.participants[side].filter((id) =>
              battle.runtime.npcs?.includes(id),
            )) {
              const commands = npcPolicy({
                role: side,
                view: structuredClone(viewForSide(battle, side)),
              });
              for (const [index, command] of commands.entries()) {
                if (
                  !command ||
                  !own(COMMAND_FIELDS, command.type) ||
                  Object.keys(command).some(
                    (key) => key !== "requestId" && !COMMAND_FIELDS[command.type].includes(key),
                  )
                )
                  fail("invalid_npc_command");
                submitCommand(battle, {
                  ...command,
                  battleId: battle.battleId,
                  roundId: battle.roundId,
                  side,
                  member,
                  requestId: JSON.stringify(["npc", member, battle.tick, index]),
                });
              }
            }
          }
          tick(battle);
          persist(battle); // Each acknowledged tick and terminal score persist.
        }
        finished = battle.status !== "running";
      });
      // Never advance the baseline when persistence failed.
      if (finished) {
        lastTicks.delete(entry.battleId);
        queueMicrotask(onTerminal);
      } else lastTicks.set(entry.battleId, previous + due * 1000);
    }
    if (runtime.clockError) {
      // A successful authority read/write has proved persistence healthy again.
      // Resume the existing deadline clock; do not add retries while writes fail.
      runtime.clockError = undefined;
      scheduleClock();
    }
  };

  const forResident = (residentId) => {
    if (typeof residentId !== "string" || !residentId) fail("resident_required");
    return {
      lineup(seriesId, matchIndex, input) {
        requireOpen();
        if (
          !input ||
          !own(input, "order") ||
          !own(input, "skills") ||
          Object.keys(input).some((key) => key !== "order" && key !== "skills")
        )
          fail("invalid_lineup_shape");
        const { order, skills } = input;
        return store.transaction(() => {
          const series = seriesAt(seriesId);
          const side = ["A", "B"].find((s) => series.captains?.[s] === residentId);
          if (!side) fail("not_team_captain");
          const result = submitLineup(series, matchIndex, side, {
            captain: residentId,
            order,
            skills,
          });
          store.saveSeries(series);
          return result;
        });
      },
      ready(battleId) {
        requireOpen();
        expirePreparation(battleId);
        let startedNow = false;
        const result = store.transaction(() => {
          const battle = battleAt(battleId);
          authorize(battle, residentId);
          if (battle.status !== "running") fail("battle_over");
          const runtime = battle.runtime;
          if (runtime.substitutes?.includes(residentId)) fail("not_battle_participant");
          runtime.ready = Object.assign(Object.create(null), runtime.ready);
          runtime.ready[residentId] = true;
          if (
            !runtime.started &&
            [...battle.participants.attack, ...battle.participants.defend].every((id) =>
              own(runtime.ready, id),
            )
          ) {
            runtime.started = true;
            startedNow = true;
          }
          persist(battle);
          return { started: runtime.started, ready: copy(runtime.ready) };
        });
        if (startedNow) {
          lastTicks.set(battleId, clock());
          scheduleClock();
        }
        return result;
      },
      command(battleId, input) {
        requireOpen();
        pump();
        if (
          !input ||
          !own(COMMAND_FIELDS, input.type) ||
          typeof input.requestId !== "string" ||
          !input.requestId ||
          Object.keys(input).some((key) => !COMMAND_FIELDS[input.type].includes(key))
        )
          fail("invalid_command_shape");
        const normalized = Object.fromEntries(
          Object.keys(input)
            .sort()
            .map((key) => [key, input[key]]),
        );
        return store.transaction(() => {
          const battle = battleAt(battleId);
          const side = authorize(battle, residentId);
          if (battle.runtime.substitutes?.includes(residentId)) fail("not_battle_participant");
          if (!battle.runtime?.started) fail("battle_not_ready");
          const key = JSON.stringify([residentId, input.requestId]);
          const payload = JSON.stringify(normalized);
          if (own(battle.runtime.requests, key) && battle.runtime.requests[key] !== payload)
            fail("request_conflict");
          const result = submitCommand(battle, {
            ...normalized,
            requestId: key,
            side,
            member: residentId,
            battleId,
            roundId: battle.roundId,
          });
          battle.runtime.requests[key] = payload;
          persist(battle);
          return { ...copy(result), requestId: input.requestId };
        });
      },
      commands(battleId, inputs) {
        requireOpen();
        pump();
        if (!Array.isArray(inputs) || !inputs.length) fail("invalid_command_shape");
        const normalized = inputs.map((input) => {
          if (
            !input ||
            !own(COMMAND_FIELDS, input.type) ||
            typeof input.requestId !== "string" ||
            !input.requestId ||
            Object.keys(input).some((key) => !COMMAND_FIELDS[input.type].includes(key))
          )
            fail("invalid_command_shape");
          return Object.fromEntries(
            Object.keys(input)
              .sort()
              .map((key) => [key, input[key]]),
          );
        });
        if (new Set(inputs.map((input) => input.requestId)).size !== inputs.length)
          fail("request_conflict");
        return store.transaction(() => {
          // One isolated loaded snapshot: failed suffixes never persist successful prefixes.
          const battle = battleAt(battleId);
          const side = authorize(battle, residentId);
          if (battle.runtime.substitutes?.includes(residentId)) fail("not_battle_participant");
          if (!battle.runtime.started) fail("battle_not_ready");
          const commands = [];
          for (const [index, input] of normalized.entries()) {
            const key = JSON.stringify([residentId, input.requestId]);
            const payload = JSON.stringify(input);
            if (own(battle.runtime.requests, key) && battle.runtime.requests[key] !== payload)
              fail("request_conflict");
            const result = submitCommand(battle, {
              ...input,
              requestId: key,
              side,
              member: residentId,
              battleId,
              roundId: battle.roundId,
            });
            if (!result.ok)
              return {
                ...copy(result),
                requestId: input.requestId,
                batchRejected: true,
                failedCommand: index + 1,
              };
            battle.runtime.requests[key] = payload;
            commands.push({ ...copy(result), requestId: input.requestId });
          }
          persist(battle);
          return { ok: true, commands };
        });
      },
      waitForDecision(battleId, requestId, waitTicks) {
        requireOpen();
        return store.transaction(() => {
          const battle = battleAt(battleId);
          authorize(battle, residentId);
          const waiting = scheduleSnowDecision(battle, residentId, requestId, waitTicks);
          persist(battle);
          return waiting;
        });
      },
      view(battleId) {
        requireOpen();
        pump();
        const battle = battleAt(battleId);
        return {
          ...viewForSide(battle, authorize(battle, residentId)),
          ready: copy(battle.runtime.ready),
          started: battle.runtime.started,
          readyDeadlineAt: battle.runtime.readyDeadlineAt,
          substituted: battle.runtime.substitutes?.includes(residentId) ?? false,
        };
      },
      series(seriesId) {
        requireOpen();
        const series = seriesAt(seriesId);
        if (
          ![...series.teams.A.members, ...series.teams.B.members].some((m) => m.id === residentId)
        )
          fail("not_series_participant");
        return seriesView(series);
      },
    };
  };

  // Trusted host controls are deliberately not exposed by forResident.
  const runtime = {
    forResident,
    pump,
    expirePreparation,
    pendingDecisions() {
      return store.listBattles().flatMap((entry) => pendingSnowDecisions(battleAt(entry.battleId)));
    },
    markDecisionNotified(battleId, id) {
      const battle = battleAt(battleId);
      markSnowDecisionNotified(battle, id);
      store.saveBattle(battle);
    },
    // Trusted Together assembly only: option receipt and authoritative operation
    // commit together. Never expose this capability to a resident facade.
    atomic(operation) {
      requireOpen();
      pump();
      if (activityTransaction) return operation();
      const previousTicks = new Map(lastTicks);
      try {
        return store.transaction(() => {
          activityTransaction = true;
          try {
            return operation();
          } finally {
            activityTransaction = false;
          }
        });
      } catch (error) {
        lastTicks.clear();
        for (const [key, value] of previousTicks) lastTicks.set(key, value);
        scheduleClock();
        throw error;
      }
    },
    create({ seriesId, humanEntries, captains }) {
      requireOpen();
      return store.transaction(() => {
        if (store.loadSeries(seriesId)) fail("series_exists");
        const series = createSeries({ seriesId, humanEntries });
        for (const side of ["A", "B"])
          if (!series.teams[side].members.some((m) => m.id === captains?.[side]))
            fail("invalid_captain");
        series.captains = copy(captains);
        store.saveSeries(series);
        return seriesView(series);
      });
    },
    prepare(seriesId, matchIndex, roundIndex) {
      requireOpen();
      let started = false;
      const id = store.transaction(() => {
        const series = seriesAt(seriesId);
        const battle = startRound(series, matchIndex, roundIndex);
        const participants = [...battle.participants.attack, ...battle.participants.defend];
        const npcs = [...series.teams.A.members, ...series.teams.B.members]
          .filter((member) => member.isNpc && participants.includes(member.id))
          .map((member) => member.id);
        const ready = Object.fromEntries(npcs.map((id) => [id, true]));
        started = participants.every((id) => own(ready, id));
        battle.runtime = {
          started,
          ready,
          npcs,
          substitutes: [],
          readyDeadlineAt: now() + SNOW_WAIT_MS.ready,
          requests: Object.create(null),
        };
        store.saveSeriesAndBattle(series, battle);
        return battle.battleId;
      });
      if (started) {
        lastTicks.set(id, clock());
        scheduleClock();
      }
      return id;
    },
    close() {
      if (!closed) {
        if (timer) clearTimeout(timer);
        store.releaseRuntime(owner);
        store.close();
        closed = true;
      }
    },
  };
  // Schedule against the next actual battle deadline, not runtime construction.
  // Prepared lobbies have no ticking timer and consume no battle time.
  const scheduleClock = () => {
    if (timer) clearTimeout(timer);
    if (!automatic || closed || !lastTicks.size) return;
    const delay = Math.max(0, Math.min(...lastTicks.values()) + 1000 - clock());
    timer = setTimeout(() => {
      try {
        pump();
        scheduleClock();
      } catch (error) {
        // Halt on persistence failure; never continue an unpersisted game.
        timer = undefined;
        runtime.clockError = error;
      }
    }, delay);
  };
  scheduleClock();
  return runtime;
}
