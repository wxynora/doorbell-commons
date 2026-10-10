import { T, kit, branch, Instances, seededRandom } from "./model-kit.js";

function mapleLeaf() {
  const s = new T.Shape(), points = [[0, -.16], [-.05, .03], [-.33, -.04], [-.24, .16], [-.53, .25], [-.28, .32], [-.43, .65], [-.13, .47], [0, .91], [.13, .47], [.43, .65], [.28, .32], [.53, .25], [.24, .16], [.33, -.04], [.05, .03]];
  s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p); s.closePath();
  const geometry = new T.ShapeGeometry(s); geometry.computeVertexNormals(); return geometry;
}

export function buildMaple(season = "summer") {
  const root = new T.Group(), { mat, rod } = kit(root), wood = mat("#81684e"), random = seededRandom(7193);
  root.userData.species = "maple_tree"; root.userData.season = season;
  branch(root, wood, [[0, 0, 0], [.10, .52, .02], [-.08, 1.04, 0], [.13, 1.57, -.07], [.02, 2.14, -.12]], .135);
  for (let i = 0; i < 5; i++) { const a = i * 1.257; branch(root, wood, [[.05, .17, 0], [Math.cos(a) * .20, .055, Math.sin(a) * .17], [Math.cos(a) * .38, .012, Math.sin(a) * .30]], .045); }
  const crowns = [[-1.03, 1.65, .43, .83, .61], [1.10, 1.83, .32, .88, .60], [-.90, 2.18, -.43, .79, .61], [.77, 2.38, -.48, .82, .61], [-.19, 2.75, -.17, .87, .63], [.13, 2.11, .66, .66, .49]];
  const seasonColors = { spring: ["#ac5260", "#c8757a", "#d68b89"], summer: ["#813e4c", "#a14c58", "#b96768"], autumn: ["#ae4540", "#ca5b4b", "#df7959"], winter: [] };
  const leaves = new Instances(root, mapleLeaf(), Object.assign(mat("#ffffff"), { side: T.DoubleSide }));
  crowns.forEach(([x, y, z, rx, rz], index) => {
    const start = [.02, .79 + index * .16, -.025], elbow = [x * .47, y - .38, z * .45]; branch(root, wood, [start, elbow, [x, y - .09, z]], .064 - index * .004);
    for (let twig = 0; twig < 7; twig++) {
      const a = twig * 2.399 + index * .73, end = [x + Math.cos(a) * rx * .78, y + .035 + (twig % 2) * .06, z + Math.sin(a) * rz * .78];
      branch(root, wood, [[x * .75, y - .19, z * .75], [x, y - .06, z], end], .014);
      rod(end, [end[0] + Math.cos(a + .4) * .13, end[1] + .055, end[2] + Math.sin(a + .4) * .13], .005, "#81684e");
    }
    if (season === "winter") return;
    const count = season === "spring" ? 225 : 285;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + index, r = Math.sqrt((i + .5) / count), edge = 1 + .07 * Math.sin(a * 5 + index), px = x + Math.cos(a) * rx * r * edge, pz = z + Math.sin(a) * rz * r * edge, py = y + .19 * (1 - r * r) + (random() - .5) * .15, size = .19 + random() * .085;
      leaves.add([px, py, pz], [size, size, size], [-Math.PI / 2 + (random() - .5) * .65, (random() - .5) * .3, a], seasonColors[season]?.[i % 3] ?? seasonColors.summer[i % 3]);
    }
  });
  if (leaves.items.length) leaves.finish(); else leaves.geometry.dispose();
  return root;
}
