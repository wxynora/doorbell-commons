import { decorationById } from "./catalog.js";
import { CELL_SIZE, Z_ORIGIN, snapCells, rectangle, intersects } from "./placement-geometry.js";
import { LAND, createPlacementTerrain } from "./placement-terrain.js";

// Version-one layouts belong to the smaller yard. Keep holdings, IDs, rotation,
// and all land furniture unchanged while moving each wheel to nearby new water.
export function relocateWaterwheels(layout, plots) {
  const wheels = layout.decorations.filter(item => decorationById.get(item.item_id)?.model_id === "waterwheel");
  if (!wheels.length) return;
  const terrain = createPlacementTerrain(plots);
  const occupied = [rectangle(layout.stall, [2, 2])];
  for (const item of layout.decorations) {
    const definition = decorationById.get(item.item_id);
    if (definition?.layer === "furniture" && definition.model_id !== "waterwheel")
      occupied.push(rectangle(item, definition.cells));
  }
  const maxX = LAND.x * 1.045 + LAND.riverWidth, maxZ = LAND.z * 1.045 + LAND.riverWidth;
  for (const item of wheels) {
    const cells = decorationById.get(item.item_id).cells;
    const [width, depth] = snapCells(cells, item.rotation);
    const angle = Math.atan2(item.z / 8.7, item.x / 7.5);
    const radius = 1 + .025 * Math.sin(angle * 5) + .02 * Math.cos(angle * 9);
    const preferred = {
      x: item.x + Math.cos(angle) * (LAND.x - 7.5) * radius,
      z: item.z + Math.sin(angle) * (LAND.z - 8.7) * radius,
    };
    const candidates = [];
    for (let col = Math.floor(-maxX / CELL_SIZE); col <= Math.floor(maxX / CELL_SIZE); col++)
      for (let row = Math.floor((-maxZ - Z_ORIGIN) / CELL_SIZE); row <= Math.floor((maxZ - Z_ORIGIN) / CELL_SIZE); row++) {
        const x = (col + width / 2) * CELL_SIZE, z = Z_ORIGIN + (row + depth / 2) * CELL_SIZE;
        candidates.push({ x, z, distance: (x - preferred.x) ** 2 + (z - preferred.z) ** 2 });
      }
    candidates.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
    const point = candidates.find(point => {
      const polygon = rectangle({ ...point, rotation: item.rotation }, cells);
      return terrain.canPlace(polygon, true) && !occupied.some(other => intersects(polygon, other));
    });
    if (!point) throw new Error("No free creek position for an existing waterwheel");
    item.x = point.x;
    item.z = point.z;
    occupied.push(rectangle(item, cells));
  }
}
