import * as T from "three";
import { islandRadius, LAND } from "./world.js";
import { disposeDecoration } from "./decorations.js";
import { snapCells, rectangle, boundsRectangle, intersects, touchedCells } from "./placement-geometry.js";

export const CELL_SIZE = 0.94;
const Z_ORIGIN = -1.44;
export function placementCells(object) {
  const cells = object?.userData.cells || [2, 2];
  return snapCells(cells, object?.rotation.y || 0);
}
export function snapPlacement(x, z, cells = [2, 2]) {
  const offsetX = ((cells[0] % 2) * CELL_SIZE) / 2,
    offsetZ = ((cells[1] % 2) * CELL_SIZE) / 2;
  return {
    x: offsetX + Math.round((x - offsetX) / CELL_SIZE) * CELL_SIZE,
    z: Z_ORIGIN + offsetZ + Math.round((z - Z_ORIGIN - offsetZ) / CELL_SIZE) * CELL_SIZE,
  };
}
function onLand(x, z) {
  const a = Math.atan2(z / LAND.z, x / LAND.x),
    r = islandRadius(a);
  return (
    (x / (LAND.x * r - LAND.fenceInset - 0.12)) ** 2 +
      (z / (LAND.z * r - LAND.fenceInset - 0.12)) ** 2 <=
    1
  );
}
export function createPlacement(world, authoritativeGrid = null) {
  const stall = world.root.getObjectByName("market-stall");
  const decorations = (world.decorations ||= []);
  const waterRay = new T.Raycaster();
  const isWaterwheel = (object) => object.userData.decorationId === "waterwheel";
  function onWater(x, z) {
    waterRay.set(new T.Vector3(x, 3, z), new T.Vector3(0, -1, 0));
    return waterRay.intersectObject(world.water, false).length > 0;
  }
  let target = stall,
    isNew = false;
  world.root.updateMatrixWorld(true);
  const blockers = [...world.plots, world.root.getObjectByName("bridge")].map((o) =>
    new T.Box3().setFromObject(o),
  );
  // Match the authority's actual foundation/porch/steps, not the roof bounding box.
  for (const [x1,z1,x2,z2] of [
    [-1.8,-6.57,2.5,-3.27],[-1.86,-3.39,2.56,-2.39],[.35,-2.48,1.65,-1.8],
  ]) blockers.push(new T.Box3(new T.Vector3(x1,0,z1),new T.Vector3(x2,4,z2)));
  const planted = [
    // Only the two trunks occupy these small spots.
    // Background grass and flowers are not furniture blockers.
    [4.45, -6.35],
    [-4.4, -5.34],
  ];
  function canPlace({ x, z }, object = target) {
    const polygon = rectangle({x,z,rotation:object.rotation.y}, object.userData.cells || [2,2]);
    const model=object.userData.decorationId??"";
    const groundFinish=object.userData.groundCover||model==="flowerbed"||model.startsWith("flowerbed_");
    if(!groundFinish&&(world.houseBlockedRects??[]).some(rect=>
      intersects(polygon,boundsRectangle(rect))))return false;
    const allowed = isWaterwheel(object) ? onWater : onLand;
    if (authoritativeGrid) {
      const cells = isWaterwheel(object) ? authoritativeGrid.river_cells : authoritativeGrid.land_cells;
      const occupied = new Set(cells.map(([col,row]) => `${col},${row}`));
      const used = touchedCells(polygon);
      if(!used.length || used.some(([col,row])=>!occupied.has(`${col},${row}`))) return false;
    } else {
      if (!allowed(x, z)) return false;
      if(polygon.some(([px,pz])=>!allowed(px,pz))) return false;
    }
    if (!authoritativeGrid &&
      blockers.some(
        (b) =>
          intersects(polygon,boundsRectangle([b.min.x,b.min.z,b.max.x,b.max.z])),
      )
    )
      return false;
    if (!authoritativeGrid &&
      planted.some(([px, pz]) => intersects(polygon,boundsRectangle([px-.42,pz-.42,px+.42,pz+.42])))
    )
      return false;
    return ![stall, ...decorations].some((other) => {
      if (other === object) return false;
      // Ground finishes and furniture occupy different layers; two finishes still cannot stack.
      if (Boolean(other.userData.groundCover) !== Boolean(object.userData.groundCover)) return false;
      return intersects(polygon,rectangle({x:other.position.x,z:other.position.z,rotation:other.rotation.y},other.userData.cells||[2,2]));
    });
  }
  const grid = new T.Group();
  grid.name = "placement-grid";
  grid.visible = false;
  world.root.add(grid);
  const linePoints = [], riverPoints = [];
  for (let col = -Math.ceil((LAND.x + LAND.riverWidth) / CELL_SIZE); col < Math.ceil((LAND.x + LAND.riverWidth) / CELL_SIZE); col++)
    for (
      let row = Math.floor((-LAND.z - LAND.riverWidth - Z_ORIGIN) / CELL_SIZE);
      row < Math.ceil((LAND.z + LAND.riverWidth - Z_ORIGIN) / CELL_SIZE);
      row++
    ) {
      const x = col * CELL_SIZE,
        z = Z_ORIGIN + row * CELL_SIZE;
      const corners = [
        [x, z],
        [x + CELL_SIZE, z],
        [x + CELL_SIZE, z + CELL_SIZE],
        [x, z + CELL_SIZE],
      ];
      const containsCell = (cells) => cells.some(([c,r])=>c===col&&r===row);
      const points = authoritativeGrid
        ? containsCell(authoritativeGrid.land_cells) ? linePoints : containsCell(authoritativeGrid.river_cells) ? riverPoints : null
        : corners.every(([px, pz]) => onLand(px, pz)) ? linePoints
          : corners.every(([px, pz]) => onWater(px, pz)) ? riverPoints : null;
      if (!points) continue;
      for (let i = 0; i < 4; i++)
        points.push(
          new T.Vector3(corners[i][0], 0.285, corners[i][1]),
          new T.Vector3(corners[(i + 1) % 4][0], 0.285, corners[(i + 1) % 4][1]),
        );
    }
  const landGrid = new T.LineSegments(
      new T.BufferGeometry().setFromPoints(linePoints),
      new T.LineBasicMaterial({ color: "#eef0ce", transparent: true, opacity: 0.7 }),
  );
  const riverGrid = new T.LineSegments(
    new T.BufferGeometry().setFromPoints(riverPoints),
    new T.LineBasicMaterial({ color: "#e4f5ff", transparent: true, opacity: 0.8 }),
  );
  grid.add(landGrid, riverGrid);
  const footprint = new T.Mesh(
    new T.PlaneGeometry(CELL_SIZE * 2, CELL_SIZE * 2),
    new T.MeshBasicMaterial({
      color: "#bedb94",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.raycast = () => {};
  footprint.position.y = 0.3;
  grid.add(footprint);
  let active = false,
    saved = stall.position.clone(),
    savedRotation = stall.rotation.y,
    valid = true;
  function move(x, z) {
    const cells = placementCells(target);
    const point = snapPlacement(x, z, cells);
    valid = canPlace(point);
    target.position.set(point.x, 0.25, point.z);
    const modelCells=target.userData.cells||[2,2];
    footprint.scale.set(modelCells[0] / 2, modelCells[1] / 2, 1);
    footprint.rotation.set(-Math.PI/2,0,target.rotation.y);
    footprint.position.set(point.x, 0.3, point.z);
    footprint.material.color.set(valid ? "#b5e78c" : "#ec867c");
    return valid;
  }
  function findFree(object, origin = {x:0,z:4.6}) {
    const available = [];
    const limitX = isWaterwheel(object) ? LAND.x + LAND.riverWidth : LAND.x - CELL_SIZE;
    const limitZ = isWaterwheel(object) ? LAND.z + LAND.riverWidth : LAND.z - CELL_SIZE;
    for (let z = -limitZ; z <= limitZ; z += CELL_SIZE)
      for (let x = -limitX; x <= limitX; x += CELL_SIZE) {
        const p = snapPlacement(x, z, placementCells(object));
        if (canPlace(p, object)) available.push(p);
      }
    available.sort((a, b) => (a.x-origin.x) ** 2 + (a.z-origin.z) ** 2 - ((b.x-origin.x) ** 2 + (b.z-origin.z) ** 2));
    return available[0] || null;
  }
  return {
    stall,
    get object() {
      return target;
    },
    get isNew() {
      return isNew;
    },
    get cells() {
      return placementCells(target);
    },
    grid,
    canPlace,
    findFree,
    relocateLandWaterwheels() {
      let moved = false;
      for (const object of decorations) {
        if (!isWaterwheel(object) || canPlace(object.position, object)) continue;
        const point = findFree(object);
        if (!point) continue; // Keep the existing object if every river slot is occupied.
        object.position.set(point.x, 0.25, point.z);
        moved = true;
      }
      return moved;
    },
    get active() {
      return active;
    },
    get valid() {
      return valid;
    },
    begin(object = stall, adding = false) {
      if (active) return false;
      target = object;
      isNew = adding;
      saved = target.position.clone();
      savedRotation = target.rotation.y;
      active = true;
      grid.visible = true;
      landGrid.visible = !isWaterwheel(object);
      riverGrid.visible = isWaterwheel(object);
      move(saved.x, saved.z);
      return true;
    },
    move(x, z) {
      if (active) return move(x, z);
      return false;
    },
    rotate() {
      if (!active) return;
      const before=placementCells(target);
      const cornerX=target.position.x-before[0]*CELL_SIZE/2;
      const cornerZ=target.position.z-before[1]*CELL_SIZE/2;
      target.rotation.y = (target.rotation.y + Math.PI / 4) % (Math.PI * 2);
      const after=placementCells(target);
      move(cornerX+after[0]*CELL_SIZE/2,cornerZ+after[1]*CELL_SIZE/2);
    },
    confirm() {
      if (!active || !valid) return false;
      active = false;
      grid.visible = false;
      isNew = false;
      return true;
    },
    cancel() {
      if (!active) return;
      target.position.copy(saved);
      target.rotation.y = savedRotation;
      if (isNew) {
        decorations.splice(decorations.indexOf(target), 1);
        disposeDecoration(target);
      }
      active = false;
      grid.visible = false;
      isNew = false;
    },
    remove() {
      if (!active || target === stall) return false;
      decorations.splice(decorations.indexOf(target), 1);
      disposeDecoration(target);
      active = false;
      grid.visible = false;
      isNew = false;
      return true;
    },
  };
}
