import { decorationById, ROOF_COLORS } from "./catalog.js";
import { houseState, overlapsHouseExtension, isGroundDecoration } from "./house.js";
import { snapCells, rectangle, intersects, touchedCells } from "./placement-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";

export const CELL_SIZE = .94;
export const Z_ORIGIN = -1.44;
// Candidate cells expose partial edges; actual placement uses terrain geometry.
export function decorationGrid(farm) {
  const terrain=createPlacementTerrain(farm.plots??[]);
  const land_cells=[],river_cells=[];
  for(let col=-10;col<=9;col++)for(let row=-10;row<=12;row++){
    if(terrain.cellVisible(col,row))land_cells.push([col,row]);
    if(terrain.cellVisible(col,row,true))river_cells.push([col,row]);
  }
  return {cell_size:CELL_SIZE,z_origin:Z_ORIGIN,land_cells,river_cells};
}

export function footprint(pose, cells) {
  if (!pose || ![pose.x, pose.z, pose.rotation].every(Number.isFinite)) return null;
  const turns = pose.rotation / (Math.PI / 4);
  if (Math.abs(turns - Math.round(turns)) > 1e-7) return null;
  const [w, d] = snapCells(cells, pose.rotation);
  const c = pose.x / CELL_SIZE - w / 2, r = (pose.z - Z_ORIGIN) / CELL_SIZE - d / 2;
  if (Math.abs(c - Math.round(c)) > 1e-7 || Math.abs(r - Math.round(r)) > 1e-7) return null;
  const used = touchedCells(rectangle(pose, cells));
  return used.length ? used : null;
}
const exactKeys = (object, keys) => object && typeof object === "object" && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));

export function validateDecorationLayout(farm, layout, owned) {
  if (!exactKeys(layout, ["roof", "canopy", "stall", "decorations"]) || !ROOF_COLORS.includes(layout.roof) || !["plain", "floral"].includes(layout.canopy) || !Array.isArray(layout.decorations) || !exactKeys(layout.stall, ["x", "z", "rotation"])) return "invalid_layout";
  const house = houseState(owned);
  if (layout.canopy === "floral" && (!house.canopy_unlocked || house.level < 2)) return "decoration_not_owned";
  const terrain = createPlacementTerrain(farm.plots ?? []);
  const occupied = { ground: [], furniture: [] }, counts = {}, ids = new Set();
  function place(pose, cells, layer, water = false) {
    if (!footprint(pose, cells)) return false;
    const polygon = rectangle(pose, cells);
    if (!terrain.canPlace(polygon, water)) return false;
    if (occupied[layer].some(other => intersects(polygon, other))) return false;
    occupied[layer].push(polygon);
    return true;
  }
  if (!place(layout.stall, [2, 2], "furniture")) return "invalid_stall_position";
  if (house.level >= 2 && overlapsHouseExtension(layout.stall, [2, 2])) return "invalid_stall_position";
  for (const item of layout.decorations) {
    if (!exactKeys(item, ["instance_id", "item_id", "x", "z", "rotation"]) || typeof item.instance_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.instance_id) || ids.has(item.instance_id)) return "invalid_instance";
    ids.add(item.instance_id);
    const definition = decorationById.get(item.item_id);
    if (!definition || !(owned[item.item_id] > 0)) return "decoration_not_owned";
    if (definition.layer === "house") return "invalid_decoration_position";
    if (house.level >= 2 && !isGroundDecoration(definition) && overlapsHouseExtension(item, definition.cells)) return "invalid_decoration_position";
    counts[item.item_id] = (counts[item.item_id] ?? 0) + 1;
    if (definition.purchase_mode === "unit" && counts[item.item_id] > owned[item.item_id]) return "decoration_quantity_exceeded";
    if (!place(item, definition.cells, definition.layer, definition.model_id === "waterwheel")) return "invalid_decoration_position";
  }
  return null;
}
