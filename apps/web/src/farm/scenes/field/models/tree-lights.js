import * as T from "three";
import { mesh, Instances } from "./primitives.js";

export function addTreeLights(parent, { height = 3.1, radius = 1.18 } = {}) {
  const root = new T.Group();
  root.name = "tree-fairy-lights";
  parent.add(root);
  const bulbMaterial = new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  bulbMaterial.userData.treeLight = true;
  const haloMaterial = new T.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  haloMaterial.userData.treeHalo = true;
  const bulbs = new Instances(root, new T.SphereGeometry(0.052, 7, 5), bulbMaterial);
  const halos = new Instances(root, new T.SphereGeometry(0.1, 7, 5), haloMaterial);
  const colors = ["#f2c277", "#eaa1b9", "#a2dac4", "#a8c7ed", "#d6b1ec"];
  for (let loop = 0; loop < 2; loop++) {
    const light = new T.PointLight(loop ? "#b8dfd1" : "#ffd0bd", 0, radius * 2.8, 2);
    light.name = "tree-glow";
    light.userData.treeGlow = true;
    light.position.set((loop ? -1 : 1) * radius * 0.45, height + loop * 0.65 + 0.15, radius * 0.45);
    root.add(light);
    const points = [];
    function point(a) {
      const r = radius * (1 - loop * 0.16);
      return [Math.cos(a) * r, height + loop * 0.65 + Math.sin(a * 2) * 0.11, Math.sin(a) * r];
    }
    for (let i = 0; i <= 40; i++) points.push(new T.Vector3(...point((i / 40) * Math.PI * 2)));
    mesh(
      root,
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 48, 0.009, 4, false),
      new T.MeshToonMaterial({ color: "#7b7857" }),
    );
    for (let i = 0; i < 16; i++) {
      const p = point((i / 16) * Math.PI * 2);
      p[1] -= 0.035;
      bulbs.add(p, [1, 1.14, 1], [0, 0, 0], colors[(i + loop * 2) % colors.length]);
      halos.add(p, [1, 1, 1], [0, 0, 0], colors[(i + loop * 2) % colors.length]);
    }
  }
  bulbs.finish(false);
  halos.finish(false);
  return root;
}
