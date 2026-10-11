import * as T from "three";
import { palette, mesh, beam } from "./primitives.js";
import { batchStaticMeshes } from "./batch-static-meshes.js";
import { disposeDecoration } from "./decorations.js";
import { winterSnowmanPosition } from "./winter-snowman-position.js";

export const SNOWMAN_MESSAGE = "镇上的孩子们悄悄来过，在你门前堆了个雪人。这样你回家的时候，就有一个笑脸在等你啦。";

export function buildSnowman(size = 1) {
  const root = new T.Group(), mat = palette();
  root.name = "winter-snowman";
  const ball = (p, scale, color) => mesh(root, new T.SphereGeometry(1, 16, 12), mat(color), p, scale);
  ball([0, .40, 0], [.43, .42, .40], "#e9eee5");
  ball([-.025, 1.0, 0], [.29, .30, .28], "#f6f4e9");
  const scarf = mesh(root, new T.TorusGeometry(.255, .054, 6, 24), mat("#b96257"), [-.02, .765, 0]);
  scarf.rotation.x = Math.PI / 2;
  const tail = mesh(root, new T.BoxGeometry(.11, .31, .04), mat("#b96257"), [-.17, .60, .36]);
  tail.rotation.z = -.12;
  const nose = mesh(root, new T.ConeGeometry(.048, .22, 8), mat("#d79558"), [-.025, 1.0, .35]);
  nose.rotation.x = Math.PI / 2;
  for (const x of [-.13, .08]) ball([x, 1.075, .25], [.025, .030, .018], "#4b443c");
  for (let i = -2; i <= 2; i++) ball([-.025 + i * .038, .90 + .015 * Math.abs(i), .255], [.012, .012, .01], "#615248");
  for (const y of [.31, .47, .62]) ball([.015, y, .392], [.026, .027, .017], "#7a6957");
  for (const side of [-1, 1]) {
    beam(root, mat("#8e765a"), [side * .30, .63, 0], [side * .71, .93, .02], .019);
    beam(root, mat("#8e765a"), [side * .59, .84, .02], [side * .59, 1.04, .03], .012);
  }
  const cap = mesh(root, new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#7f9fa4"), [-.025, 1.20, 0], [.30, .23, .29]);
  cap.rotation.z = -.06;
  const brim = mesh(root, new T.TorusGeometry(.275, .037, 6, 24), mat("#91afb0"), [-.025, 1.20, 0]);
  brim.rotation.x = Math.PI / 2;
  ball([-.07, 1.44, 0], [.075, .075, .075], "#c2d3ca");
  batchStaticMeshes(root);
  root.traverse(object => { if (object.isMesh) object.userData.winterSnowman = true; });
  root.scale.setScalar(size);
  return root;
}

// Seasonal scenery only: never enters inventory, layout capture or placement blockers.
export function createWinterSnowman(world, houseLevel = 1) {
  let object = null, currentSize = null, shown = true;
  function dispose() {
    const changed = !!object?.parent;
    if (object) disposeDecoration(object);
    object = null; currentSize = null;
    return changed;
  }
  function sync(season, layout, catalog) {
    if (season !== "winter" || !layout || !catalog) return dispose();
    const point = winterSnowmanPosition(world.plots.map(o => o.userData.plot), layout, houseLevel, catalog);
    if (!point) return dispose();
    let changed = false;
    if (!object || currentSize !== point.size) {
      changed = dispose();
      object = buildSnowman(point.size); currentSize = point.size;
    }
    changed ||= !object.parent || object.position.x !== point.x || object.position.z !== point.z;
    object.position.set(point.x, .25, point.z);
    object.visible = shown;
    if (!object.parent) world.root.add(object);
    return changed;
  }
  return {sync, dispose, get object(){return object;}, setVisible(value){shown=value;if(object)object.visible=value;}};
}
