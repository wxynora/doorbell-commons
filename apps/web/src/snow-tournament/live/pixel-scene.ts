import type { SnowPixelBattle, SnowPixelEvent } from "../../../../../packages/protocol/src/snow-tournament";
import type { AnimatedUnit, SnowPixelTimeline } from "./timeline";

export const PIXEL_FIELD = { width: 760, height: 440, left: 68, cell: 46, top: 64, laneGap: 112, rows: 3, columns: 12 } as const;
type Frame = ReturnType<SnowPixelTimeline["frame"]>;
type Point = SnowPixelEvent["source"];
type Ctx = CanvasRenderingContext2D;
const colors = { ink: "#37534e", snow: "#eef3e6", ice: "#dceae5", line: "#becfc3", blue: "#557f91", red: "#bc7158", gold: "#d8b264" };
const highTypes = new Set(["crossbow", "snow_mage", "artillery", "medic"]);

export function fieldPoint(position: number, lane: number, ground: boolean) {
  return { x: PIXEL_FIELD.left + (position - .5) * PIXEL_FIELD.cell,
    y: PIXEL_FIELD.top + (lane - 1) * PIXEL_FIELD.laneGap + (ground ? 68 : 12) };
}
function eventPoint(point: Point) { return fieldPoint(point.position, point.lane, point.role === "attack" || !highTypes.has(point.type)); }

function pine(ctx: Ctx, x: number, y: number, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = "#789580";
  ctx.fillRect(10, 0, 6, 8); ctx.fillRect(6, 8, 14, 8); ctx.fillRect(2, 16, 22, 8); ctx.fillRect(-2, 24, 30, 8);
  ctx.fillStyle = "#edf0df"; ctx.fillRect(10, 0, 6, 6); ctx.fillRect(6, 10, 14, 4); ctx.fillRect(0, 26, 24, 4);
  ctx.fillStyle = "#b6a783"; ctx.fillRect(10, 32, 6, 8); ctx.restore();
}

function castle(ctx: Ctx, battle: SnowPixelBattle, flash: boolean) {
  const x = 664, y = 112, hp = battle.coreHp / battle.coreMaxHp;
  ctx.fillStyle = "#a4bfb6"; ctx.fillRect(x, y + 22, 72, 204); ctx.fillRect(x - 8, y, 22, 230); ctx.fillRect(x + 58, y, 22, 230);
  ctx.fillStyle = flash ? "#f8e0a3" : "#e9efdf"; ctx.fillRect(x + 8, y + 30, 48, 182); ctx.fillRect(x - 4, y + 8, 14, 204); ctx.fillRect(x + 62, y + 8, 14, 204);
  ctx.fillStyle = "#f9f4dc";
  for (const offset of [-8, 58]) for (let i = 0; i < 3; i++) ctx.fillRect(x + offset + i * 8, y - (i % 2 ? 0 : 8), 8, 10);
  ctx.fillStyle = colors.ink; ctx.fillRect(x + 22, y + 136, 22, 76); ctx.fillStyle = "#91b1a8"; ctx.fillRect(x + 26, y + 140, 14, 72);
  ctx.fillStyle = "#829e93";
  for (let row = 0; row < 6; row++) ctx.fillRect(x + 16 + (row % 2) * 20, y + 48 + row * 19, 12, 4);
  ctx.fillStyle = colors.gold; ctx.fillRect(x + 24, y + 88, 20, 20); ctx.fillStyle = "#f9efc0"; ctx.fillRect(x + 28, y + 92, 12, 12);
  ctx.fillStyle = colors.blue; ctx.fillRect(x + 3, y - 40, 24, 14); ctx.fillStyle = colors.ink; ctx.fillRect(x, y - 40, 3, 36);
  if (hp < .5) { ctx.fillStyle = "#9ab2a7"; ctx.fillRect(x + 48, y + 65, 3, 20); ctx.fillRect(x + 42, y + 82, 9, 3); }
  if (hp === 0) { ctx.fillStyle = "#adc4b5"; ctx.fillRect(x + 8, y + 30, 48, 52); ctx.fillRect(x - 12, y + 211, 95, 17); }
  ctx.fillStyle = colors.ink; ctx.font = '12px "ZCOOL KuaiLe", sans-serif'; ctx.textAlign = "center"; ctx.fillText("雪堡", x + 34, y + 253);
}

function sprite(ctx: Ctx, type: string, role: "attack" | "defend", frame: number, acting: boolean, x: number, y: number) {
  ctx.save(); ctx.translate(Math.round(x) - 12, Math.round(y) - 18);
  const scarf = role === "attack" ? "#bd634b" : "#4e86a1";
  const dark = role === "attack" ? "#914d3b" : "#375f7e";
  const snow = "#faf3dc", shade = "#c5d9cc", highlight = "#fcf6e7", ink = "#4c6256";
  const rect = (a: number, b: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(a, b, w, h); };
  const foot = frame === 1 ? [-1, 1] : frame === 2 ? [1, -1] : [0, 0];
  const bob = frame === 1 ? -1 : 0;
  rect(4 + foot[0]!, 21, 5, 2, shade); rect(14 + foot[1]!, 21, 5, 2, shade);
  ctx.translate(0, bob);
  // One rounded snow body: no human neck, torso, trousers or long arms.
  rect(7, 3, 10, 2, shade); rect(4, 5, 16, 2, shade); rect(2, 7, 20, 12, shade);
  rect(4, 19, 16, 2, shade); rect(7, 21, 10, 1, shade);
  rect(7, 4, 10, 2, snow); rect(4, 6, 16, 12, snow); rect(3, 9, 18, 7, snow); rect(6, 18, 12, 3, snow);
  rect(6, 7, 3, 2, highlight); rect(5, 9, 2, 3, highlight);
  if (type === "heavy_t" || type === "heavy_guard") {
    rect(3, 5, 18, 3, "#95bcb8"); rect(1, 8, 4, 8, "#95bcb8"); rect(19, 8, 4, 8, "#95bcb8");
    rect(7, 3, 10, 2, "#d3e4d6"); rect(8, 2, 3, 2, highlight);
  }
  if (type === "scout") {
    rect(13, -3, 5, 3, "#49745c"); rect(8, 0, 12, 3, "#49745c");
    rect(5, 3, 16, 3, "#5c886b"); rect(3, 6, 18, 3, "#5c886b");
    rect(2, 8, 4, 8, "#5c886b"); rect(18, 8, 4, 11, "#5c886b"); rect(18, 19, 6, 3, "#49745c");
  }
  // Tiny eyes, rosy cheeks, and a small off-center smile.
  rect(8, 11, 2, 2, ink); rect(15, 11, 2, 2, ink);
  rect(5, 14, 3, 1, "#eac0a6"); rect(17, 14, 3, 1, "#eac0a6");
  rect(11, 15, 2, 1, "#81917a"); rect(13, 14, 1, 1, "#81917a");
  rect(4, 17, 16, 3, scarf); rect(role === "attack" ? 18 : 2, 19, 4, 5, scarf);
  if (type === "light_inf" || type === "system_inf") {
    rect(8, 1, 9, 3, scarf); rect(10, -1, 5, 2, highlight);
    if (type === "system_inf") { rect(8, 0, 9, 4, "#d6af4f"); rect(11, -3, 3, 3, "#edcb6d"); rect(11, 17, 3, 3, "#f3d77d"); }
  }
  if (type === "heavy_t") {
    rect(5, 1, 4, 4, "#95bcb8"); rect(15, 1, 4, 4, "#95bcb8"); rect(10, 3, 4, 2, "#e5c878");
    rect(-2, 10, 7, 10, "#739d99"); rect(-1, 11, 5, 7, "#cee3d4");
    rect(1, 12, 1, 5, scarf); rect(-1, 14, 5, 1, scarf);
  }
  if (type === "shield_guard" || type === "heavy_guard") {
    if (type === "heavy_guard") {
      rect(-3, 9, 10, 14, "#50768b"); rect(-2, 10, 8, 11, "#a5c6ce"); rect(1, 11, 2, 9, "#50768b");
      rect(5, 0, 16, 5, "#82a6b5"); rect(7, -2, 3, 2, highlight); rect(16, -2, 3, 2, highlight);
    } else {
      rect(-1, 11, 8, 10, "#50768b"); rect(-2, 13, 10, 6, "#50768b");
      rect(0, 12, 6, 8, "#c4dcd1"); rect(1, 15, 4, 2, dark);
      rect(7, 2, 11, 3, "#bcd4d1"); rect(9, 1, 7, 2, highlight);
    }
  }
  if (type === "hammer") {
    const hx = acting ? 1 : 20, hy = acting ? -2 : 5;
    rect(hx, hy, 2, 17, "#9d7950"); rect(hx - 4, hy - 3, 10, 8, "#aa8654"); rect(hx - 4, hy - 3, 10, 2, "#e0c995");
    rect(hx - 2, hy - 1, 2, 5, "#86643f"); rect(7, 2, 10, 3, "#d0a65d");
  }
  if (type === "thrower") {
    const sx = acting ? -5 : -4, sy = acting ? 6 : 12;
    rect(sx + 2, sy, 6, 2, "#8eafb1"); rect(sx, sy + 2, 10, 6, "#8eafb1"); rect(sx + 2, sy + 8, 6, 2, "#8eafb1");
    rect(sx + 2, sy + 2, 6, 6, highlight); rect(sx + 3, sy + 2, 3, 2, "#fcf8e9");
    rect(7, 1, 10, 3, scarf); rect(6, 4, 3, 4, scarf);
  }
  if (type === "crossbow") {
    rect(-3, 13, 12, 3, "#9a714c"); rect(1, 9, 3, 12, "#9a714c"); rect(-5, 14, 15, 1, "#544e38");
    rect(-2, 10, 2, 3, "#bf9d67"); rect(-2, 17, 2, 3, "#bf9d67");
    rect(7, 2, 11, 3, scarf); rect(6, 5, 3, 3, dark);
  }
  if (type === "artillery") {
    // Same snowball body and face; the wheeled cannon is separate equipment.
    rect(6, 1, 13, 4, scarf); rect(10, -1, 6, 2, scarf);
    rect(-7, 17, 11, 3, "#779092"); rect(-7, 20, 4, 3, dark); rect(1, 20, 4, 3, dark);
    rect(-8, acting ? 10 : 11, 13, 5, "#94b6bb"); rect(-9, acting ? 11 : 12, 3, 3, "#375f7e");
    rect(-5, acting ? 10 : 11, 8, 1, highlight); rect(2, 14, 3, 4, "#779092");
  }
  if (type === "snow_mage") {
    rect(4, 2, 18, 3, "#9383b0"); rect(8, -2, 11, 4, "#9383b0"); rect(12, -7, 5, 5, "#9383b0"); rect(11, -2, 2, 2, "#efce76");
    rect(-1, 7, 2, 15, "#aa8b65"); rect(-3, 3, 6, 5, "#8ebcbb"); rect(-1, 1, 2, 9, highlight); rect(-4, 5, 8, 1, highlight);
  }
  if (type === "medic") {
    rect(5, 1, 15, 6, "#e5ead4"); rect(11, 0, 3, 8, "#5d9666"); rect(8, 3, 9, 2, "#5d9666");
    rect(18, 14, 8, 7, "#d5e1c7"); rect(21, 15, 2, 5, "#5d9666"); rect(19, 17, 6, 2, "#5d9666");
  }
  if (type === "march_medic") {
    rect(-4, 8, 8, 14, "#938264"); rect(-3, 10, 6, 10, "#bdab82"); rect(-5, 5, 10, 4, "#c6d2ad");
    rect(-1, 12, 2, 6, "#f5ebd1"); rect(-3, 14, 6, 2, "#f5ebd1");
    rect(8, 1, 10, 3, scarf); rect(10, 0, 6, 1, "#e5cda4");
  }
  ctx.restore();
}

export { sprite as drawSnowPixelSprite };

function unitPosition(animated: AnimatedUnit) {
  const point = fieldPoint(animated.position, animated.unit.lane, animated.unit.ground);
  const number = [...animated.unit.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { x: point.x + (number % 3 - 1) * 3, y: point.y + (number % 5 - 2) * 3 };
}

export function pixelUnitsAtPoint(units: AnimatedUnit[], x: number, y: number) {
  return units.filter(animated => {
    const point = unitPosition(animated);
    return x >= point.x - 22 && x <= point.x + 17 && y >= point.y - 29 && y <= point.y + 25;
  });
}

export function pixelUnitsInCell(units: AnimatedUnit[], lane: number, position: number) {
  return units.filter(animated => animated.unit.lane === lane && Math.floor(animated.position + .5) === position);
}

function drawUnit(ctx: Ctx, animated: AnimatedUnit, acting: boolean, selected: boolean) {
  const { unit } = animated, { x, y } = unitPosition(animated);
  ctx.fillStyle = "#66877925"; ctx.fillRect(x - 11, y + 7, 25, 3);
  sprite(ctx, unit.type, unit.role, animated.walkFrame, acting, x, y);
  if (unit.shield > 0) { ctx.strokeStyle = "#90bbd3"; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) - 15, Math.round(y) - 19, 32, 32); }
  ctx.fillStyle = "#9eafa2"; ctx.fillRect(Math.round(x) - 11, Math.round(y) + 14, 24, 3);
  ctx.fillStyle = unit.role === "attack" ? "#c17b60" : "#729d78"; ctx.fillRect(Math.round(x) - 11, Math.round(y) + 14, Math.round(24 * unit.hp / unit.maxHp), 3);
  ctx.fillStyle = unit.role === "attack" ? "#a74e39" : "#386981";
  if (unit.role === "attack") {
    ctx.fillRect(Math.round(x) + 3, Math.round(y) + 18, 2, 2); ctx.fillRect(Math.round(x) + 5, Math.round(y) + 20, 2, 2); ctx.fillRect(Math.round(x) + 3, Math.round(y) + 22, 2, 2);
  } else {
    ctx.fillRect(Math.round(x) + 1, Math.round(y) + 18, 6, 4); ctx.fillRect(Math.round(x) + 3, Math.round(y) + 22, 2, 2);
  }
  if (selected) {
    ctx.fillStyle = "#a88442";
    for (const [cornerX, cornerY, directionX, directionY] of [[-17, -28, 1, 1], [18, -28, -1, 1], [-17, 26, 1, -1], [18, 26, -1, -1]]) {
      ctx.fillRect(Math.round(x) + cornerX!, Math.round(y) + cornerY!, 6 * directionX!, 2 * directionY!);
      ctx.fillRect(Math.round(x) + cornerX!, Math.round(y) + cornerY!, 2 * directionX!, 6 * directionY!);
    }
  }
}

function effect(ctx: Ctx, event: SnowPixelEvent, progress: number) {
  const source = eventPoint(event.source);
  if (event.kind === "death") {
    ctx.globalAlpha = 1 - progress; ctx.fillStyle = "#f8f2d7";
    for (let i = 0; i < 6; i++) ctx.fillRect(source.x + Math.cos(i) * progress * 24, source.y + Math.sin(i) * progress * 24 - 15, 4, 4);
    ctx.globalAlpha = 1; return;
  }
  if (event.kind === "breakthrough") {
    ctx.fillStyle = `rgba(244,207,119,${1 - progress})`; ctx.fillRect(660, source.y - 22, 70, 50); return;
  }
  for (const target of event.targets) {
    const end = eventPoint(target), p = Math.min(1, progress / .55);
    if (event.kind === "heal") {
      ctx.fillStyle = "#72aa77"; const x = source.x + (end.x - source.x) * p, y = source.y + (end.y - source.y) * p - Math.sin(p * Math.PI) * 15;
      ctx.fillRect(x - 4, y - 1, 10, 3); ctx.fillRect(x, y - 5, 3, 11);
    } else {
      if (highTypes.has(event.source.type) || event.source.type === "thrower") {
        const x = source.x + (end.x - source.x) * p, y = source.y + (end.y - source.y) * p - 13;
        ctx.fillStyle = event.source.type === "snow_mage" ? "#9accc6" : "#f8efcc";
        ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        ctx.fillStyle = "#bd9a62"; if (event.source.type === "crossbow") ctx.fillRect(x - 7, y, 12, 2);
      }
      if (progress > .4) {
        ctx.globalAlpha = 1 - progress; ctx.fillStyle = "#ebbf70";
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2, distance = 5 + progress * 16;
          ctx.fillRect(Math.round(end.x + Math.cos(angle) * distance) - 2, Math.round(end.y + Math.sin(angle) * distance) - 15, 5, 5);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function drawSnowPixelScene(ctx: Ctx, frame: Frame, selected: { lane: number; position: number } | null, selectedUnitIds: readonly string[] = []) {
  const { battle } = frame;
  ctx.clearRect(0, 0, PIXEL_FIELD.width, PIXEL_FIELD.height); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#d9e8e2"; ctx.fillRect(0, 0, PIXEL_FIELD.width, PIXEL_FIELD.height);
  ctx.fillStyle = "#e9efdf"; ctx.fillRect(0, 26, PIXEL_FIELD.width, 22); ctx.fillRect(0, 385, PIXEL_FIELD.width, 55);
  for (const [x, y, size] of [[12, 8, .8], [705, 2, 1], [29, 375, 1], [696, 380, .8]]) pine(ctx, x!, y!, size);
  ctx.textAlign = "center"; ctx.font = '12px "ZCOOL KuaiLe", sans-serif'; ctx.fillStyle = "#587468";
  for (let column = 1; column <= 12; column++) ctx.fillText(String(column), fieldPoint(column, 1, true).x, 44);
  for (let lane = 1; lane <= 3; lane++) {
    const top = PIXEL_FIELD.top + (lane - 1) * PIXEL_FIELD.laneGap;
    ctx.fillStyle = "#d4e0d4"; ctx.fillRect(PIXEL_FIELD.left - 8, top + 32, PIXEL_FIELD.cell * 12 + 16, 72);
    ctx.fillStyle = colors.ink; ctx.fillText(`${lane}路`, 28, top + 75);
    for (let column = 1; column <= 12; column++) {
      const x = PIXEL_FIELD.left + (column - 1) * PIXEL_FIELD.cell;
      ctx.fillStyle = battle?.groundSlots.includes(column) ? "#dce6d3" : colors.snow; ctx.fillRect(x + 1, top + 38, PIXEL_FIELD.cell - 2, 60);
      ctx.fillStyle = "#e0e8da"; ctx.fillRect(x + 2, top + 94, PIXEL_FIELD.cell - 4, 4);
      if (battle?.highSlots.includes(column)) {
        ctx.fillStyle = "#9eb8af"; ctx.fillRect(x + 4, top - 11, PIXEL_FIELD.cell - 8, 39);
        ctx.fillStyle = "#c0d3c8"; ctx.fillRect(x + 4, top - 14, PIXEL_FIELD.cell - 8, 29);
        ctx.fillStyle = colors.snow; ctx.fillRect(x + 2, top - 16, PIXEL_FIELD.cell - 4, 5);
      }
      if (selected?.lane === lane && selected.position === column) { ctx.strokeStyle = "#b18b4c"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, top - 16, PIXEL_FIELD.cell - 2, 115); }
    }
  }
  if (battle) {
    for (const aura of battle.effects) {
      const y = PIXEL_FIELD.top + (aura.lane - 1) * PIXEL_FIELD.laneGap;
      ctx.fillStyle = aura.kind === "smoke" ? "#8fa6a248" : aura.kind === "speed" ? "#dfbc692a" : "#84bab12a";
      ctx.fillRect(PIXEL_FIELD.left, y + 38, PIXEL_FIELD.cell * 12, 60);
    }
    const attacking = new Set(frame.events.filter(e => e.progress < .6).map(e => e.event.source.id));
    const units = [...frame.units].sort((a, b) => unitPosition(a).y - unitPosition(b).y);
    const selectedIds = new Set(selectedUnitIds);
    for (const animated of units) drawUnit(ctx, animated, attacking.has(animated.unit.id), selectedIds.has(animated.unit.id));
    castle(ctx, battle, frame.events.some(e => e.event.kind === "breakthrough"));
    for (const item of frame.events) effect(ctx, item.event, item.progress);
  }
  ctx.fillStyle = "#6c8377"; ctx.textAlign = "left"; ctx.font = '11px "ZCOOL KuaiLe", sans-serif'; ctx.fillText("进攻 →", 75, 415);
  ctx.textAlign = "right"; ctx.fillText("高台在上 · 地面在下", 631, 415);
}
