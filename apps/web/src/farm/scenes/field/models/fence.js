import * as T from "three";
import { beam, palette, Instances } from "./primitives.js";

export function createFence(parent, groundPoint, inset) {
  const root = new T.Group();
  root.name = "farm-fence";
  parent.add(root);
  const mat = palette();
  const posts = new Instances(root, new T.BoxGeometry(0.075, 0.58, 0.075), mat("#eee9dc"));
  const slats = new Instances(root, new T.BoxGeometry(0.065, 0.4, 0.045), mat("#fffaf0"));
  const caps = new Instances(root, new T.ConeGeometry(0.055, 0.085, 4), mat("#fffdf5"));
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2,
      b = ((i + 1) / 56) * Math.PI * 2;
    if (Math.abs((a + b) / 2 - Math.PI / 2) < 0.15) continue;
    const [ax, az] = groundPoint(a, -inset),
      [bx, bz] = groundPoint(b, -inset);
    posts.add([ax, 0.55, az]);
    caps.add([ax, 0.883, az], [1, 1, 1], [0, Math.PI / 4, 0]);
    if (Math.abs(b + Math.PI / 56 - Math.PI / 2) < 0.15) {
      posts.add([bx, 0.55, bz]);
      caps.add([bx, 0.883, bz], [1, 1, 1], [0, Math.PI / 4, 0]);
    }
    for (const y of [0.43, 0.69]) beam(root, mat("#f2eee4"), [ax, y, az], [bx, y, bz], 0.027);
    for (const t of [0.25, 0.65]) {
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      slats.add([x, 0.57, z], [1, 1, 1], [0, -(a + b) / 2, 0]);
    }
  }
  posts.finish();
  slats.finish();
  caps.finish();
  return root;
}
