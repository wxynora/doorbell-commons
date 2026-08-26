import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-weather-nature-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const {
  ECO_SEASON_DAYS,
  NatureContractError,
  activateNatureWorld,
  advanceNatureWorld,
  beijingDayIndex,
  beijingDayStart,
  ecologicalSeasonAt,
  ensureWeatherPlan,
  markNatureEventReadyForSettlement,
  natureSnapshot,
  normalizeNatureWorld,
  plannedWeatherForDay,
  registerNatureImpact,
  resolveNatureImpact,
} = await import("../dist/nature.js");
const { currentSeason } = await import("../dist/time.js");
const {
  activateStoredNatureWorld,
  advanceStoredNatureWorld,
  createFarm,
  getFarm,
  getNatureWorld,
  replaceFarmsAndNatureAtomic,
} = await import("../dist/store.js");
const { dumpUgc } = await import("../dist/ugc.js");

const atDay = (day, hour = 12) => beijingDayStart(day) + hour * 3_600_000;
const activationNow = Date.UTC(2026, 7, 31, 16, 0, 0);
const activationDay = beijingDayIndex(activationNow);

function activeWorld(seed = "nature-test-seed") {
  return activateNatureWorld(null, { now: activationNow, seed });
}

function findForecast(type, startOffset) {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const seed = `${type}-seed-${attempt}`;
    for (let offset = startOffset; offset < startOffset + 14; offset++) {
      const base = activeWorld(seed);
      base.lastAdvancedDay = activationDay + offset - 1;
      const now = atDay(activationDay + offset);
      const world = advanceNatureWorld(base, now);
      if (world.currentEvent?.type === type && world.currentEvent.phase === "forecast")
        return { seed, now, world };
    }
  }
  throw new Error(`unable to find deterministic ${type} forecast`);
}

function findTimelineWithEarlyEvent() {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const seed = `catch-up-seed-${attempt}`;
    let sequential = activeWorld(seed);
    for (let offset = 0; offset <= 12; offset++)
      sequential = advanceNatureWorld(sequential, atDay(activationDay + offset));
    if (sequential.currentEvent?.forecastedAtDay <= activationDay + 3)
      return { seed, sequential, targetDay: activationDay + 12 };
  }
  throw new Error("unable to find an early deterministic disaster timeline");
}

test("P4 activation is explicit and projects one synchronized 14-day ecological season", () => {
  const inactive = normalizeNatureWorld(null);
  assert.equal(inactive.status, "inactive");
  assert.equal(ecologicalSeasonAt(inactive, activationNow), null);

  const world = activeWorld();
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay)).name, "春");
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay + ECO_SEASON_DAYS - 1)).name, "春");
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay + ECO_SEASON_DAYS)).name, "夏");
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay + 28)).name, "秋");
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay + 42)).name, "冬");
  assert.equal(ecologicalSeasonAt(world, atDay(activationDay + 56)).name, "春");
  assert.equal(currentSeason(atDay(activationDay + 14), world).name, "夏");

  assert.equal(
    activateNatureWorld(world, { now: atDay(activationDay + 9), seed: "nature-test-seed" }).activationDay,
    activationDay,
  );
  assert.throws(
    () => activateNatureWorld(world, { now: activationNow, seed: "different-seed" }),
    (error) => error instanceof NatureContractError && error.code === "nature_already_activated",
  );
});

test("today plus three forecast days remain seed-stable for farm and ranch readers", () => {
  const now = atDay(activationDay + 17);
  const planned = ensureWeatherPlan(activeWorld("shared-weather"), now);
  const first = natureSnapshot(planned, now);
  const restarted = normalizeNatureWorld(JSON.parse(JSON.stringify(planned)));
  const second = natureSnapshot(restarted, now);

  assert.equal(first.forecast.length, 4);
  assert.deepEqual(second.forecast, first.forecast);
  assert.deepEqual(first.weather, second.weather);
  assert.equal(first.weather.dayIndex, beijingDayIndex(now));
  assert.equal(first.weather.condition, plannedWeatherForDay(planned, first.weather.dayIndex).condition);
  assert.equal(Object.hasOwn(first.season, "diseaseProbability"), false);
  assert.equal(Object.hasOwn(first.season, "yieldMultiplier"), false);
});

test("stored forecast entries fail closed when they conflict with the authority seed", () => {
  const now = atDay(activationDay + 2);
  const planned = ensureWeatherPlan(activeWorld("tamper-proof"), now);
  const corrupted = structuredClone(planned);
  corrupted.weatherPlan[0].condition = corrupted.weatherPlan[0].condition === "sunny" ? "fog" : "sunny";
  assert.throws(
    () => normalizeNatureWorld(corrupted),
    (error) => error instanceof NatureContractError && error.code === "invalid_nature_state",
  );
});

test("advancing across missed Beijing day boundaries catches up the same disaster timeline", () => {
  const found = findTimelineWithEarlyEvent();
  const jumped = advanceNatureWorld(activeWorld(found.seed), atDay(found.targetDay));

  assert.equal(jumped.currentEvent?.eventId, found.sequential.currentEvent.eventId);
  assert.equal(jumped.currentEvent?.phase, found.sequential.currentEvent.phase);
  assert.equal(jumped.currentEvent?.forecastedAtDay, found.sequential.currentEvent.forecastedAtDay);
});

test("flood lifecycle keeps stable event and impact identities through recovery and cooldown", () => {
  const found = findForecast("flood", 14);
  let world = found.world;
  const forecast = structuredClone(world.currentEvent);
  assert.equal(forecast.phase, "forecast");
  assert.ok(forecast.activeFromDay > beijingDayIndex(found.now));

  world = advanceNatureWorld(world, atDay(forecast.activeFromDay));
  assert.equal(world.currentEvent.eventId, forecast.eventId);
  assert.equal(world.currentEvent.phase, "active");

  const first = registerNatureImpact(world, {
    eventId: forecast.eventId,
    farmId: "FARM01",
    objectId: "plot:1",
    kind: "plot_flooded",
    now: atDay(forecast.activeFromDay),
  });
  const replay = registerNatureImpact(first.world, {
    eventId: forecast.eventId,
    farmId: "FARM01",
    objectId: "plot:1",
    kind: "plot_flooded",
    now: atDay(forecast.activeFromDay),
  });
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.impact.impactId, first.impact.impactId);
  world = replay.world;

  let recoveryDay = forecast.activeFromDay + 1;
  while (["heavy_rain", "thunderstorm"].includes(plannedWeatherForDay(world, recoveryDay).condition))
    recoveryDay++;
  world = advanceNatureWorld(world, atDay(recoveryDay));
  assert.equal(world.currentEvent.phase, "recovery");
  world = markNatureEventReadyForSettlement(world, { eventId: forecast.eventId, now: atDay(recoveryDay) });
  world = advanceNatureWorld(world, atDay(recoveryDay + 1));
  assert.equal(world.currentEvent?.eventId, forecast.eventId, "unresolved gameplay impact fences settlement");

  const resolved = resolveNatureImpact(world, {
    eventId: forecast.eventId,
    impactId: first.impact.impactId,
    resolutionKind: "natural",
    resolutionRef: `flood-recovery:${recoveryDay + 1}`,
    now: atDay(recoveryDay + 1),
  });
  world = resolved.world;
  assert.equal(
    resolveNatureImpact(world, {
      eventId: forecast.eventId,
      impactId: first.impact.impactId,
      resolutionKind: "natural",
      resolutionRef: `flood-recovery:${recoveryDay + 1}`,
      now: atDay(recoveryDay + 1),
    }).impact.resolvedAtDay,
    resolved.impact.resolvedAtDay,
  );
  assert.throws(
    () => resolveNatureImpact(world, {
      eventId: forecast.eventId,
      impactId: first.impact.impactId,
      resolutionKind: "career",
      resolutionRef: "different-resolution",
      now: atDay(recoveryDay + 1),
    }),
    (error) => error instanceof NatureContractError && error.code === "nature_resolution_conflict",
  );
  world = advanceNatureWorld(world, atDay(recoveryDay + 1));
  assert.equal(world.currentEvent, null);
  assert.equal(world.settledEvents.at(-1).eventId, forecast.eventId);
  assert.equal(world.cooldownUntilDay, recoveryDay + 9);
  assert.equal(advanceNatureWorld(world, atDay(recoveryDay + 2)).currentEvent, null);
});

test("recovery disasters reject new impacts before and after settlement readiness without changing the world", () => {
  const found = findForecast("flood", 14);
  const event = found.world.currentEvent;
  let recoveryDay = event.activeFromDay + 1;
  let world = advanceNatureWorld(found.world, atDay(event.activeFromDay));
  while (["heavy_rain", "thunderstorm"].includes(plannedWeatherForDay(world, recoveryDay).condition))
    recoveryDay++;
  world = advanceNatureWorld(world, atDay(recoveryDay));
  assert.equal(world.currentEvent.phase, "recovery");

  const beforeReady = structuredClone(world);
  assert.throws(
    () => registerNatureImpact(world, {
      eventId: event.eventId,
      farmId: "FARM01",
      objectId: "plot:late-before-ready",
      kind: "plot_flooded",
      now: atDay(recoveryDay),
    }),
    (error) => error instanceof NatureContractError && error.code === "nature_event_not_active",
  );
  assert.deepEqual(world, beforeReady);

  world = markNatureEventReadyForSettlement(world, { eventId: event.eventId, now: atDay(recoveryDay) });
  const afterReady = structuredClone(world);
  assert.throws(
    () => registerNatureImpact(world, {
      eventId: event.eventId,
      farmId: "FARM01",
      objectId: "plot:late-after-ready",
      kind: "plot_flooded",
      now: atDay(recoveryDay),
    }),
    (error) => error instanceof NatureContractError && error.code === "nature_event_not_active",
  );
  assert.deepEqual(world, afterReady);
});

test("pest and drought use the same persisted weather timeline rather than new random rolls", () => {
  for (const [type, offset] of [["pest", 0], ["drought", 28]]) {
    const found = findForecast(type, offset);
    const before = structuredClone(found.world.currentEvent);
    const restarted = advanceNatureWorld(
      normalizeNatureWorld(JSON.parse(JSON.stringify(found.world))),
      found.now,
    );
    assert.equal(restarted.currentEvent.eventId, before.eventId);
    assert.equal(restarted.currentEvent.type, type);
    assert.deepEqual(restarted.currentEvent.triggerDays, before.triggerDays);
  }
});

test("each disaster accepts only its own approved impact kinds", () => {
  const cases = [
    ["flood", "plot_flooded", "plot_drought"],
    ["drought", "animal_dehydration", "flood_fish"],
    ["pest", "plot_pest", "animal_wet_cold"],
  ];
  for (const [type, validKind, invalidKind] of cases) {
    const found = findForecast(type, type === "drought" ? 28 : 0);
    const event = found.world.currentEvent;
    const active = advanceNatureWorld(found.world, atDay(event.activeFromDay));
    assert.equal(registerNatureImpact(active, {
      eventId: event.eventId,
      farmId: "FARM01",
      objectId: `${type}:valid`,
      kind: validKind,
      now: atDay(event.activeFromDay),
    }).created, true);
    assert.throws(
      () => registerNatureImpact(active, {
        eventId: event.eventId,
        farmId: "FARM01",
        objectId: `${type}:invalid`,
        kind: invalidKind,
        now: atDay(event.activeFromDay),
      }),
      (error) => error instanceof NatureContractError && error.code === "nature_impact_not_allowed",
    );
  }
});

test("nature authority is persisted inside the existing atomic world document", () => {
  const now = atDay(activationDay + 6);
  const activated = activateStoredNatureWorld({ now: activationNow, seed: "persisted-world-weather" });
  const advanced = advanceStoredNatureWorld(now);
  const disk = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));

  assert.equal(activated.activationDay, activationDay);
  assert.deepEqual(getNatureWorld(), advanced);
  assert.deepEqual(disk.nature, advanced);
  assert.equal(currentSeason(now).name, ecologicalSeasonAt(advanced, now).name);
  assert.equal(disk.format, "aifarm-world");
  assert.equal(disk.version, 1);
});

test("farm, UGC, and nature publish together after one world commit and remain unchanged when writing fails", () => {
  const farm = createFarm("Atomic nature test");
  const stagedFarm = structuredClone(farm);
  stagedFarm.coins += 321;
  const stagedNature = advanceNatureWorld(getNatureWorld(), atDay(activationDay + 7));
  const stagedUgc = [{ id: "atomic-nature-ugc", name: "Atomic nature crop" }];

  replaceFarmsAndNatureAtomic({
    replacements: [{ id: farm.id, farm: stagedFarm }],
    nextNatureWorld: stagedNature,
    ugc: stagedUgc,
  });

  const committedFarm = structuredClone(getFarm(farm.id));
  const committedNature = structuredClone(getNatureWorld());
  const committedUgc = structuredClone(dumpUgc());
  const committedDisk = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  assert.equal(committedFarm.coins, stagedFarm.coins);
  assert.deepEqual(committedNature, stagedNature);
  assert.deepEqual(committedUgc, stagedUgc);
  assert.deepEqual(
    committedDisk.farms.find((entry) => entry.id === farm.id),
    JSON.parse(JSON.stringify(committedFarm)),
  );
  assert.deepEqual(committedDisk.nature, committedNature);
  assert.deepEqual(committedDisk.ugc, committedUgc);

  const failedFarm = structuredClone(committedFarm);
  failedFarm.coins += 999;
  const failedNature = advanceNatureWorld(committedNature, atDay(activationDay + 8));
  const failedUgc = [{ id: "must-not-publish", name: "Failed atomic crop" }];
  const temporaryWorldPath = join(dataDirectory, "world.json.tmp");
  mkdirSync(temporaryWorldPath);
  try {
    assert.throws(
      () => replaceFarmsAndNatureAtomic({
        replacements: [{ id: farm.id, farm: failedFarm }],
        nextNatureWorld: failedNature,
        ugc: failedUgc,
      }),
      (error) => error?.code === "EISDIR",
    );
  } finally {
    rmSync(temporaryWorldPath, { recursive: true, force: true });
  }

  assert.deepEqual(getFarm(farm.id), committedFarm);
  assert.deepEqual(getNatureWorld(), committedNature);
  assert.deepEqual(dumpUgc(), committedUgc);
  assert.deepEqual(JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8")), committedDisk);
});

test("an existing version-1 world without nature data upgrades to an inactive authority safely", () => {
  const legacyDirectory = mkdtempSync(join(tmpdir(), "aifarm-weather-legacy-"));
  try {
    writeFileSync(join(legacyDirectory, "world.json"), JSON.stringify({
      format: "aifarm-world",
      version: 1,
      farms: [],
      ugc: [],
    }), "utf8");
    const storeUrl = new URL("../dist/store.js", import.meta.url).href;
    const program = `
      process.env.AIFARM_DATA_DIR = ${JSON.stringify(legacyDirectory)};
      const store = await import(${JSON.stringify(storeUrl)});
      store.load();
      console.log(JSON.stringify(store.getNatureWorld()));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const state = JSON.parse(child.stdout.trim().split("\n").at(-1));
    assert.equal(state.status, "inactive");
    assert.equal(state.weatherPlan.length, 0);
  } finally {
    rmSync(legacyDirectory, { recursive: true, force: true });
  }
});
