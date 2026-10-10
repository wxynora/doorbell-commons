import { T, kit, Instances, leafGeometry, seededRandom } from "./model-kit.js";

function taperedBranch(root, material, points, radius) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  const segments = 14, sides = 7, geometry = new T.TubeGeometry(curve, segments, radius, sides, false), p = geometry.attributes.position;
  for (let row = 0; row <= segments; row++) {
    const center = curve.getPointAt(row / segments), taper = 1 - row / segments * .84;
    for (let j = 0; j <= sides; j++) {
      const n = row * (sides + 1) + j;
      p.setXYZ(n, center.x + (p.getX(n) - center.x) * taper, center.y + (p.getY(n) - center.y) * taper, center.z + (p.getZ(n) - center.z) * taper);
    }
  }
  geometry.computeVertexNormals(); const m = new T.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; root.add(m);
}

function blossomGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, cx = Math.cos(a) * .40, cz = Math.sin(a) * .40, base = positions.length / 3;
    positions.push(cx, .07, cz);
    for (let j = 0; j < 7; j++) {
      const b = j * Math.PI * 2 / 6, px = Math.cos(b) * .38, pz = Math.sin(b) * .30;
      positions.push(cx + px * Math.cos(a) - pz * Math.sin(a), .015 + Math.abs(Math.sin(b)) * .06, cz + px * Math.sin(a) + pz * Math.cos(a));
      if (j < 6) indices.push(base, base + j + 1, base + j + 2);
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function buildCherry(season) {
  const root = new T.Group(), { mat } = kit(root), wood = mat("#91785c");
  root.userData.species = "cherry_tree"; root.userData.season = season;
  taperedBranch(root, wood, [[0, 0, 0], [-.08, .60, .025], [.10, 1.2, 0], [.03, 1.65, -.04]], .14);
  for (let i = 0; i < 5; i++) { const a = i * 1.257; taperedBranch(root, wood, [[0, .16, 0], [Math.cos(a) * .16, .06, Math.sin(a) * .15], [Math.cos(a) * .36, .008, Math.sin(a) * .31]], .055); }
  const random = seededRandom(9317), clusters = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 2.399 + .27, reach = 1.16 + random() * .66, height = 2.02 + random() * .56, tip = [Math.cos(a) * reach, height, Math.sin(a) * reach * .82];
    taperedBranch(root, wood, [[.02, 1.01 + i * .055, 0], [Math.cos(a) * .42, 1.55, Math.sin(a) * .35], [tip[0] * .77, height - .12, tip[2] * .78], tip], .065);
    for (let j = 0; j < 4; j++) {
      const angle = a + (j - 1.5) * .42, r = reach * (.61 + j * .15), end = [Math.cos(angle) * r, height + .13 + Math.sin(j * 1.8) * .14, Math.sin(angle) * r * .82];
      taperedBranch(root, wood, [[tip[0] * .52, height - .28, tip[2] * .52], [end[0] * .84, end[1] - .15, end[2] * .86], end], .022);
      clusters.push({ p: end, w: .43 + random() * .17, h: .23 + random() * .08 });
    }
  }
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + .2, tip = [Math.cos(a) * .55, 2.9 + (i % 2) * .12, Math.sin(a) * .5]; taperedBranch(root, wood, [[.03, 1.55, 0], [tip[0] * .60, 2.25, tip[2] * .60], tip], .037); clusters.push({ p: tip, w: .55, h: .31 }); }
  if (season === "winter") return root;
  const leafRandom = seededRandom(1638), material = mat("#ffffff"); material.side = T.DoubleSide;
  const spring = season === "spring", foliage = new Instances(root, spring ? blossomGeometry() : leafGeometry(), material);
  const colors = spring ? ["#f3bdcf", "#f7cedb", "#ffe1e5", "#fae6e8", "#edb9ce"] : season === "autumn" ? ["#c79755", "#d8ac6b", "#deb67a", "#b8884d"] : ["#759956", "#91ad68", "#aac17e", "#bad091"];
  for (const { p, w, h } of clusters) for (let j = 0; j < (spring ? 105 : 125); j++) {
    const a = leafRandom() * Math.PI * 2, v = Math.acos(2 * leafRandom() - 1), r = Math.cbrt(leafRandom());
    const point = [p[0] + Math.cos(a) * Math.sin(v) * w * r, p[1] + Math.cos(v) * h * r, p[2] + Math.sin(a) * Math.sin(v) * w * r], size = spring ? .080 + leafRandom() * .026 : .14 + leafRandom() * .065;
    foliage.add(point, spring ? [size, size, size] : [size, size * 1.65, size], [spring ? (leafRandom() - .5) * 1.7 : leafRandom() * 2, leafRandom() * 6.28, (leafRandom() - .5) * 1.9], colors[j % colors.length]);
  }
  foliage.finish(); return root;
}
