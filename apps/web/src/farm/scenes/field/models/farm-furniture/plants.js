import { T, kit, branch, beam, leafGeometry, Instances, seededRandom, mesh } from "./model-kit.js";
import { buildCherry } from "./cherry-tree.js";
import { buildPine } from "./pine-tree.js";
import { buildMaple } from "./maple-tree.js";

const treeColors = {
  ginkgo_tree: { spring: ["#b4c784", "#c8d997", "#94b16d"], summer: ["#88aa61", "#a0bb73", "#b7cf88"], autumn: ["#ddba51", "#edce6c", "#f4df92"], winter: ["#8c9d78", "#a3ad85", "#bac49b"] },
  birch_tree: { spring: ["#abc487", "#c7d9a0", "#90b171"], summer: ["#83a862", "#a4be7e", "#bed39c"], autumn: ["#d8b875", "#ecd090", "#c7a266"], winter: ["#aeb6a1", "#c6caba", "#d8d9cb"] },
  osmanthus_tree: { spring: ["#789d5f", "#9bb577", "#b6c68d"], summer: ["#5c8150", "#789858", "#9ab06e"], autumn: ["#567348", "#789152", "#90a668"], winter: ["#718762", "#899b74", "#a1b28b"] },
};

function leafShape(id) {
  if (id !== "ginkgo_tree") return leafGeometry();
  const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(-.48, .64); s.absarc(0, .64, .48, Math.PI, 0, true); s.lineTo(0, 0);
  return new T.ShapeGeometry(s, 5);
}

export function buildPlant(id, season = "summer") {
  if (id === "cherry_tree") return buildCherry(season);
  if (id === "pine_tree") return buildPine(season);
  if (id === "maple_tree") return buildMaple(season);
  const root = new T.Group(), { mat, ball, rod } = kit(root), random = seededRandom([...id].reduce((s, c) => s + c.charCodeAt(0), 93));
  root.userData.season = season; root.userData.species = id;
  const colors = treeColors[id][season] ?? treeColors[id].summer, leafy = season !== "winter" || id === "osmanthus_tree";
  const leaves = new Instances(root, leafShape(id), Object.assign(mat("#ffffff"), { side: T.DoubleSide }));
  if (id === "birch_tree") {
    for (let n = 0; n < 3; n++) {
      const x = (n - 1) * .28, z = n % 2 * .23, h = 3.65 + n * .25, bark = mat("#e7e1d1");
      branch(root, bark, [[x, 0, z], [x - .08, 1, z + .04], [x + .10, h * .7, z], [x - .05, h, z + .04]], .065);
      for (let j = 0; j < 12; j++) { const mark = mesh(root, new T.CylinderGeometry(.067, .068, .022 + (j % 3) * .012, 9, 1, true, 0, 2.1), mat("#8a8171"), [x, .2 + j * .27, z]); mark.rotation.y = j * 2.1; }
      for (let j = 0; j < 7; j++) {
        const a = j * 2.4 + n, r = .32 + random() * .42, tip = [x + Math.cos(a) * r, h * .58 + random() * h * .43, z + Math.sin(a) * r * .8], start = [x, h * .38 + j * .055, z];
        branch(root, bark, [start, [tip[0] * .55, tip[1] - .35, tip[2] * .55], tip], .023);
        if (leafy) for (let k = 0; k < 90; k++) { const a2 = random() * Math.PI * 2, v = Math.acos(2 * random() - 1), q = Math.cbrt(random()), p = [tip[0] + Math.cos(a2) * Math.sin(v) * .48 * q, tip[1] + Math.cos(v) * .44 * q, tip[2] + Math.sin(a2) * Math.sin(v) * .40 * q], size = .13 + random() * .06; leaves.add(p, [size, size * 1.25, size], [random() * 2, a, random()], colors[k % 3]); }
      }
    }
  } else {
    const bark = mat("#8d7751");
    branch(root, bark, [[0, 0, 0], [-.08, .95, .04], [.1, 2.0, 0], [-.04, 2.75, .02]], .12);
    for (let n = 0; n < 5; n++) { const a = n * 1.257; rod([0, .19, 0], [Math.cos(a) * .37, 0, Math.sin(a) * .33], .065, "#8d7751"); }
    for (let j = 0; j < 14; j++) {
      const a = j * 2.4, r = .6 + random() * .65, h = 1.55 + random() * 1.35, tip = [Math.cos(a) * r, h, Math.sin(a) * r * .8];
      branch(root, bark, [[0, 1.05 + j * .045, 0], [tip[0] * .55, h - .35, tip[2] * .55], tip], .034);
      if (leafy) for (let k = 0; k < 150; k++) { const a2 = random() * Math.PI * 2, v = Math.acos(2 * random() - 1), q = Math.cbrt(random()), p = [tip[0] + Math.cos(a2) * Math.sin(v) * .63 * q, h + Math.cos(v) * .39 * q, tip[2] + Math.sin(a2) * Math.sin(v) * .54 * q], size = .12 + random() * .06; leaves.add(p, [size, size * 1.5, size], [random() * 2.4, a, random() * 2], colors[k % 3]); }
      if (season === "autumn") for (let k = 0; k < 13; k++) { const p = [tip[0] + (random() - .5) * .9, h + (random() - .5) * .55, tip[2] + (random() - .5) * .8]; ball(p, [.035, .028, .035], k % 2 ? "#f5d986" : "#e7b850"); }
    }
  }
  if (leaves.items.length) leaves.finish(); else leaves.geometry.dispose();
  return root;
}

export function buildPlanting(id, season = "summer") {
  const g = new T.Group(), { ball, rod, mat } = kit(g), random = seededRandom(41), leaves = new Instances(g, leafGeometry(), Object.assign(mat("#ffffff"), { side: T.DoubleSide }));
  g.userData.season = season;
  for (let n = 0; n < 18; n++) {
    const x = (random() - .5) * .76, z = (random() - .5) * .58, dry = season === "winter", color = dry ? "#b2aa85" : id === "red_roses" ? "#496346" : season === "autumn" ? "#a7a06a" : "#7d9858";
    if (id === "ferns") {
      for (let j = 0; j < (dry ? 3 : 6); j++) { const a = j * 1.047, tip = [x + Math.cos(a) * .25, .19 + (dry ? .03 : .14), z + Math.sin(a) * .25]; rod([x, 0, z], tip, .007, color); for (let k = 1; k < 7; k++) for (const side of [-1, 1]) leaves.add([x + (tip[0] - x) * k / 7, tip[1] * k / 7 + .06, z + (tip[2] - z) * k / 7], [.04, .11 * (1 - k / 9), .07], [1.1, a + side * .8, 0], color); }
    } else if (id === "ornamental_grass") {
      for (let j = 0; j < 7; j++) { const a = j * .9; leaves.add([x, 0, z], [.023, .34 + random() * .25, .3], [.3, a, 0], color); }
      if (season === "autumn" || dry) rod([x, 0, z], [x + .06, .6, z], .016, "#d0bd94");
    } else {
      rod([x, 0, z], [x, .24, z], .012, color);
      if (!dry) { leaves.add([x, .1, z], [.07, .19, .1], [.7, n, 0], color); leaves.add([x, .12, z], [.07, .16, .1], [1, n + 3, 0], color); }
      if (id === "lavender" && (season === "spring" || season === "summer")) for (let k = 0; k < 4; k++) ball([x, .27 + k * .035, z], [.035, .037, .035], k % 2 ? "#a29bbd" : "#8d83aa");
      if (id === "daisies" && (season === "spring" || season === "summer")) { for (let k = 0; k < 6; k++) { const a = k * 1.047; ball([x + Math.cos(a) * .043, .26, z + Math.sin(a) * .043], [.04, .012, .026], "#f6eedb"); } ball([x, .274, z], [.023, .018, .023], "#d9bc63"); }
      if (id === "black_roses" && !dry) for (let k = 0; k < 5; k++) { const a = k * 1.257; ball([x + Math.cos(a) * .022, .28 + k * .003, z + Math.sin(a) * .022], [.045, .025, .039], k % 2 ? "#65556b" : "#8a647d"); }
      if (id === "red_roses" && !dry) { const h = .27 + (n % 3) * .028; rod([x, .22, z], [x, h, z], .011, color); for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 6 - layer; k++) { const a = k * Math.PI * 2 / (6 - layer) + layer * .7, r = .039 - layer * .012, petal = ball([x + Math.cos(a) * r, h + layer * .017, z + Math.sin(a) * r], [.047 - layer * .011, .019, .031 - layer * .006], ["#922e40", "#b63e4d", "#d45a61"][layer]); petal.rotation.y = -a; } }
    }
  }
  leaves.finish(); return g;
}
