// Mirrored by Farm authority and the scene; IDs remain gameplay identities.
import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";

const plotIndex = (plot, index) => (plot.id ?? plot.plot_id ?? index + 1) - 1;
const slots = plots => plots.reduce((end, plot, index) => Math.max(end, plotIndex(plot, index) + 1), 0);
export function defaultFieldLayout(plots = []) {
  const rows = Math.ceil(slots(plots) / 6);
  return { x: 0, z: -.97 + Math.max(0, rows - 1) * CELL_SIZE / 2, columns: 6 };
}
export function fieldPlots(plots = [], field = defaultFieldLayout(plots)) {
  const rows = field.rows ?? Math.ceil(slots(plots) / field.columns);
  return plots.map((plot, index) => {
    const i = plotIndex(plot, index);
    return { ...plot,
      x: field.x + ((field.rows ? Math.floor(i / rows) : i % field.columns) - (field.columns - 1) / 2) * CELL_SIZE,
      z: field.z + ((field.rows ? i % rows : Math.floor(i / field.columns)) - (rows - 1) / 2) * CELL_SIZE,
    };
  });
}
export function snapFieldPosition(x, z, plots) {
  const origin = defaultFieldLayout(plots);
  return { x: Math.round(x / CELL_SIZE) * CELL_SIZE,
    z: origin.z + Math.round((z - origin.z) / CELL_SIZE) * CELL_SIZE };
}
export function validFieldLayout(field, plots) {
  if (!field || ![field.x, field.z].every(Number.isFinite) ||
      !Number.isSafeInteger(field.columns) || field.columns < 1 ||
      field.columns > Math.max(6, slots(plots))) return false;
  if (field.rows !== undefined && (!Number.isSafeInteger(field.rows) || field.rows < 1 ||
      field.rows > slots(plots) || field.columns !== Math.ceil(slots(plots) / field.rows))) return false;
  const snapped = snapFieldPosition(field.x, field.z, plots);
  return Math.abs(field.x - snapped.x) < 1e-7 && Math.abs(field.z - snapped.z) < 1e-7;
}
export const fieldRects = (plots, field) => fieldPlots(plots, field)
  .map(p => [p.x - .435, p.z - .456, p.x + .435, p.z + .456]);
export function canPlaceField(field, plots, terrain, fixtures = []) {
  if (!validFieldLayout(field, plots)) return false;
  return fieldRects(plots, field).map(boundsRectangle)
    .every(polygon => terrain.canPlace(polygon) && !fixtures.some(other => intersects(polygon, other)));
}
