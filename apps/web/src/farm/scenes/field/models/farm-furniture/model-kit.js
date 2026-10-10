import * as T from "three";
import { palette, mesh, box, beam, branch, leafGeometry, Instances, seededRandom } from "../primitives.js";

export { T, palette, mesh, box, beam, branch, leafGeometry, Instances, seededRandom };
export const colors = { wood: "#b88e64", edge: "#87664b", cream: "#eee8da", green: "#789956", stone: "#a3a79a", purple: "#786185", orange: "#da914e" };
const kits = new WeakMap();

export function kit(root, paletteOverride) {
  if (kits.has(root)) return kits.get(root);
  const mat = paletteOverride ?? palette();
  const ball = (p, s, c) => mesh(root, new T.SphereGeometry(1, 12, 8), mat(c), p, s);
  const block = (p, s, c) => box(root, mat(c), p, s);
  const rod = (a, b, r, c) => beam(root, mat(c), a, b, r);
  const cyl = (p, r, h, c, top = r) => mesh(root, new T.CylinderGeometry(top, r, h, 12), mat(c), p);
  const ring = (p, r, t, c) => { const o = mesh(root, new T.TorusGeometry(r, t, 6, 24), mat(c), p); o.rotation.x = Math.PI / 2; return o; };
  const result = { mat, ball, block, rod, cyl, ring };
  kits.set(root, result);
  return result;
}

export function pot(root, p, s = 1, c = "#bc8468") {
  const g = new T.Group(); g.position.set(...p); g.scale.setScalar(s); root.add(g);
  const { cyl, ring } = kit(g);
  cyl([0, .18, 0], .14, .36, c, .21); ring([0, .35, 0], .205, .025, c); cyl([0, .345, 0], .18, .013, "#746049");
  return g;
}

export function flower(root, p, color = "#f0d8d4", size = .055) {
  const { ball, rod } = kit(root); rod(p, [p[0], p[1] - .20, p[2]], .009, "#719058");
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ball([p[0] + Math.cos(a) * size, p[1], p[2] + Math.sin(a) * size], [size, .018, size * .65], color); }
  ball([p[0], p[1] + .015, p[2]], [size * .38, .024, size * .38], "#dcc575");
}

export function pumpkin(root, p, s = .32) {
  const g = new T.Group(); g.position.set(...p); root.add(g); const { ball, rod } = kit(g);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ball([Math.cos(a) * s * .38, s * .7, Math.sin(a) * s * .38], [s * .66, s * .72, s * .66], i % 2 ? "#d99350" : "#e5a15b"); }
  rod([0, s * 1.3, 0], [.035, s * 1.65, 0], s * .09, "#788453");
  for (const x of [-.28, .28]) ball([x * s, s * .87, s * .93], [s * .13, s * .15, s * .035], "#fce2a0");
  ball([0, s * .48, s * .96], [s * .28, s * .08, s * .028], "#fce2a0");
  return g;
}

export function ghost(root, p, s = 1, paletteOverride) {
  const g = new T.Group(); g.position.set(...p); g.scale.setScalar(s); root.add(g); const { ball } = kit(g, paletteOverride);
  ball([0, .3, 0], [.22, .31, .16], "#f5efdf");
  for (let i = 0; i < 5; i++) ball([-.17 + i * .085, .06, .015], [.065, .095, .15], "#f5efdf");
  for (const x of [-.067, .067]) ball([x, .36, .149], [.022, .035, .012], "#514957");
  ball([0, .25, .166], [.025, .03, .012], "#514957");
  return g;
}
