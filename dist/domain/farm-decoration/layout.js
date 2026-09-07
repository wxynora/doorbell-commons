import { decorationById, ROOF_COLORS } from "./catalog.js";

export const CELL_SIZE = .94;
export const Z_ORIGIN = -1.44;
const LAND = { x: 7.5, z: 8.7, fenceInset: .3, riverWidth: 1.6 };
const radius = a => 1 + .025 * Math.sin(a * 5) + .02 * Math.cos(a * 9);
const groundPoint = (a, extra) => [Math.cos(a) * (LAND.x * radius(a) + extra), Math.sin(a) * (LAND.z * radius(a) + extra)];
const waterQuads = Array.from({ length: 160 }, (_, i) => [groundPoint(i / 160 * Math.PI * 2, .05), groundPoint(i / 160 * Math.PI * 2, 1.6), groundPoint((i + 1) / 160 * Math.PI * 2, 1.6), groundPoint((i + 1) / 160 * Math.PI * 2, .05)]);
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function inTriangle(p, a, b, c) {
  const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
  return signs.every(v => v >= -1e-7) || signs.every(v => v <= 1e-7);
}
function onWater(x, z) {
  const p = [x, z];
  return waterQuads.some(([a, b, c, d]) => inTriangle(p, a, b, d) || inTriangle(p, b, c, d));
}
function onLand(x, z) {
  const r = radius(Math.atan2(z / LAND.z, x / LAND.x));
  return (x / (LAND.x * r - LAND.fenceInset - .12)) ** 2 + (z / (LAND.z * r - LAND.fenceInset - .12)) ** 2 <= 1;
}
const overlaps = (a, b) => a[0] < b[2] - 1e-7 && a[2] > b[0] + 1e-7 && a[1] < b[3] - 1e-7 && a[3] > b[1] + 1e-7;

// Same frozen preview geometry, without browser/Three dependencies. Plot
// blockers use actual owned plots, never the demo's fixed 36 samples.
export function decorationGrid(farm) {
  const blockers = [
    [-1.7, -6.57, 2.6, -3.27], // cottage foundation, not the roof overhang
    [-1.76, -3.39, 2.66, -2.39], // porch
    [.45, -2.48, 1.75, -1.8], // narrow front steps, not the entire house width
    [-.65, 8.5675, .75, 10.8675], // bridge
    ...[[3.35, -5.89], [-4.4, -5.34]].map(([x, z]) => [x - .42, z - .42, x + .42, z + .42]),
    ...(farm.plots ?? []).map((plot, i) => {
      const index = Number.isInteger(plot.id) && plot.id > 0 ? plot.id - 1 : i;
      const x = (index % 6 - 2.5) * CELL_SIZE, z = -.97 + Math.floor(index / 6) * CELL_SIZE;
      return [x - .435, z - .456, x + .435, z + .456];
    }),
  ];
  const land_cells = [], river_cells = [];
  for (let col = -10; col <= 9; col++) for (let row = -10; row <= 12; row++) {
    const x = col * CELL_SIZE, z = Z_ORIGIN + row * CELL_SIZE;
    if (blockers.some(b => overlaps([x, z, x + CELL_SIZE, z + CELL_SIZE], b))) continue;
    const corners = [[x, z], [x + CELL_SIZE, z], [x, z + CELL_SIZE], [x + CELL_SIZE, z + CELL_SIZE]];
    if (corners.every(([px, pz]) => onLand(px, pz))) land_cells.push([col, row]);
    else if (corners.every(([px, pz]) => onWater(px, pz))) river_cells.push([col, row]);
  }
  return { cell_size: CELL_SIZE, z_origin: Z_ORIGIN, land_cells, river_cells };
}

export function footprint(pose, cells) {
  if (!pose || ![pose.x, pose.z, pose.rotation].every(Number.isFinite)) return null;
  const turns = pose.rotation / (Math.PI / 2);
  if (Math.abs(turns - Math.round(turns)) > 1e-7) return null;
  const [w, d] = Math.abs(Math.round(turns)) % 2 ? [cells[1], cells[0]] : cells;
  const c = pose.x / CELL_SIZE - w / 2, r = (pose.z - Z_ORIGIN) / CELL_SIZE - d / 2;
  if (Math.abs(c - Math.round(c)) > 1e-7 || Math.abs(r - Math.round(r)) > 1e-7) return null;
  return Array.from({ length: w * d }, (_, i) => [Math.round(c) + i % w, Math.round(r) + Math.floor(i / w)]);
}
const exactKeys = (object, keys) => object && typeof object === "object" && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));
const key = ([c, r]) => `${c},${r}`;

export function validateDecorationLayout(farm, layout, owned) {
  if (!exactKeys(layout, ["roof", "stall", "decorations"]) || !ROOF_COLORS.includes(layout.roof) || !Array.isArray(layout.decorations) || !exactKeys(layout.stall, ["x", "z", "rotation"])) return "invalid_layout";
  const grid = decorationGrid(farm), land = new Set(grid.land_cells.map(key)), river = new Set(grid.river_cells.map(key));
  const occupied = { ground: new Set(), furniture: new Set() }, counts = {}, ids = new Set();
  function place(pose, cells, layer, water = false) {
    const cellsUsed = footprint(pose, cells), allowed = water ? river : land;
    if (!cellsUsed || cellsUsed.some(cell => !allowed.has(key(cell)) || occupied[layer].has(key(cell)))) return false;
    cellsUsed.forEach(cell => occupied[layer].add(key(cell)));
    return true;
  }
  if (!place(layout.stall, [2, 2], "furniture")) return "invalid_stall_position";
  for (const item of layout.decorations) {
    if (!exactKeys(item, ["instance_id", "item_id", "x", "z", "rotation"]) || typeof item.instance_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.instance_id) || ids.has(item.instance_id)) return "invalid_instance";
    ids.add(item.instance_id);
    const definition = decorationById.get(item.item_id);
    if (!definition || !(owned[item.item_id] > 0)) return "decoration_not_owned";
    counts[item.item_id] = (counts[item.item_id] ?? 0) + 1;
    if (definition.purchase_mode === "unit" && counts[item.item_id] > owned[item.item_id]) return "decoration_quantity_exceeded";
    if (!place(item, definition.cells, definition.layer, definition.model_id === "waterwheel")) return "invalid_decoration_position";
  }
  return null;
}
