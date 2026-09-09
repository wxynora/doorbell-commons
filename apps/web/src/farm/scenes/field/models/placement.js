import * as T from "three";
import { LAND } from "./world.js";
import { disposeDecoration } from "./decorations.js";
import { snapCells, rectangle, boundsRectangle, intersects } from "./placement-geometry.js";

import { createPlacementTerrain } from "./placement-terrain.js";

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
export function createPlacement(world, authoritativeGrid = null) {
  const stall = world.root.getObjectByName("market-stall");
  const decorations = (world.decorations ||= []);
  const isWaterwheel = (object) => object.userData.decorationId === "waterwheel";
  const terrain = createPlacementTerrain(world.plots.map(o=>o.userData.plot),world.house.position);
  let target = stall,
    isNew = false;
  world.root.updateMatrixWorld(true);
  function canPlace({ x, z }, object = target) {
    const polygon = rectangle({x,z,rotation:object.rotation.y}, object.userData.cells || [2,2]);
    const model=object.userData.decorationId??"";
    const groundFinish=object.userData.groundCover||model==="flowerbed"||model.startsWith("flowerbed_");
    if(!groundFinish&&(world.houseBlockedRects??[]).some(rect=>
      intersects(polygon,boundsRectangle(rect))))return false;
    if (!terrain.canPlace(polygon,isWaterwheel(object))) return false;
    // Decoration overlap is intentional; only terrain and the house block placement.
    return true;
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
      // Draw only usable pieces of each grid edge, including partial boundary cells.
      for(const [points,water] of [[linePoints,false],[riverPoints,true]])
        for(let edge=0;edge<4;edge++)
          for(const [a,b] of terrain.clip(corners[edge],corners[(edge+1)%4],water))
            points.push(new T.Vector3(a[0],.285,a[1]),new T.Vector3(b[0],.285,b[1]));
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
        if (canPlace(p, object)) {
          const polygon=rectangle({...p,rotation:object.rotation.y},object.userData.cells||[2,2]);
          const occupied=[stall,...decorations].some(other=>other!==object&&intersects(polygon,rectangle({x:other.position.x,z:other.position.z,rotation:other.rotation.y},other.userData.cells||[2,2])));
          available.push({...p,occupied});
        }
      }
    // +1 still suggests an empty nearby spot; manual overlap remains allowed.
    available.sort((a, b) => Number(a.occupied)-Number(b.occupied) || (a.x-origin.x) ** 2 + (a.z-origin.z) ** 2 - ((b.x-origin.x) ** 2 + (b.z-origin.z) ** 2));
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
