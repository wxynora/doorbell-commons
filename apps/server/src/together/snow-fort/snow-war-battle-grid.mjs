import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

// Only accepts the recipient's existing viewForSide projection, never authority state.
export function snowBattleGrid(battle) {
  return Array.from({ length: CFG.laneCount }, (_, lane) => ({
    lane: lane + 1,
    cells: Array.from({ length: CFG.laneCells }, (_, index) => {
      const position = index + 1;
      const units = battle.visibleUnits.filter(
        (unit) => unit.lane === lane + 1 && unit.pos === position,
      );
      return {
        position,
        groundDeployable: CFG.groundSlots.includes(position),
        highDeployable: CFG.highSlots.includes(position),
        ground: units.filter(
          (unit) => unit.side === "attack" || CFG.defenderUnits[unit.typeKey]?.ground,
        ),
        high: units.filter(
          (unit) => unit.side === "defend" && CFG.defenderUnits[unit.typeKey]?.ground === false,
        ),
      };
    }),
  }));
}

export function renderSnowBattleGrid(battle) {
  const names = (units) =>
    units.map((unit) => `${unit.side === "attack" ? "攻" : "守"}:${unit.id}`).join("、");
  const lines = [
    `| 格位 | ${Array.from({ length: CFG.laneCells }, (_, i) => i + 1).join(" | ")} |`,
    `| --- | ${Array.from({ length: CFG.laneCells }, () => "---").join(" | ")} |`,
  ];
  for (const row of snowBattleGrid(battle)) {
    lines.push(
      `| 第${row.lane}路地面 | ${row.cells.map((cell) => names(cell.ground) || (cell.groundDeployable ? "空（可部署）" : "空")).join(" | ")} |`,
      `| 第${row.lane}路高台 | ${row.cells.map((cell) => names(cell.high) || (cell.highDeployable ? "空（可部署）" : "—")).join(" | ")} |`,
    );
  }
  return lines.join("\n");
}
