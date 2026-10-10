import { T, kit, branch, Instances, seededRandom } from "./model-kit.js";

export function buildPine(season) {
  const g = new T.Group(), { mat, rod } = kit(g), wood = mat("#8d775c"), random = seededRandom(562);
  g.userData.species = "pine_tree"; g.userData.season = season;
  branch(g, wood, [[0, 0, 0], [-.09, .8, .025], [.07, 1.7, 0], [-.03, 2.7, -.02], [.055, 3.50, 0]], .075);
  for (let i = 0; i < 5; i++) { const a = i * 1.257; rod([0, .12, 0], [Math.cos(a) * .32, .006, Math.sin(a) * .29], .035, "#8d775c"); }
  const palettes = { spring: ["#648965", "#88a87b", "#aac093"], summer: ["#4c745a", "#668963", "#8aa678"], autumn: ["#56795b", "#739063", "#98ad7c"], winter: ["#577b6e", "#749588", "#98afa0"] };
  const material = mat("#ffffff"); material.side = T.DoubleSide;
  const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0, -.36, .42, .035, 0, 1, .09, .36, .42, .035], 3)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
  const needles = new Instances(g, geometry, material), palette = palettes[season] ?? palettes.summer;
  function spray(p, a, length, k) {
    const end = [p[0] + Math.cos(a) * length, p[1] + .11, p[2] + Math.sin(a) * length]; rod(p, end, .009, "#8d775c");
    for (let j = 0; j < 16; j++) { const t = j / 16, x = p[0] * (1 - t) + end[0] * t, y = p[1] * (1 - t) + end[1] * t, z = p[2] * (1 - t) + end[2] * t;
      for (let side = -1; side <= 1; side++) { const angle = a + side * .8, scale = .12 + random() * .09; needles.add([x + (random() - .5) * .028, y + (random() - .5) * .04, z + (random() - .5) * .028], [.019, scale, .07], [.9 + random() * .7, angle, (random() - .5) * .3], palette[(j + k) % 3]); }
    }
  }
  for (let tier = 0; tier < 5; tier++) { const h = 1.02 + tier * .47, reach = 1.28 - tier * .20;
    for (let n = 0; n < 5; n++) { const a = n * 1.257 + tier * .73, stretch = reach * (.85 + random() * .25), tip = [Math.cos(a) * stretch, h + .13, Math.sin(a) * stretch];
      branch(g, wood, [[0, h, 0], [tip[0] * .62, h - .07, tip[2] * .62], tip], .025 - tier * .003);
      for (let k = 0; k < 6; k++) { const t = .32 + k * .12, p = [tip[0] * t, h - .02 + t * .13, tip[2] * t]; for (const side of [-1, 1]) spray(p, a + side * .74, .25 + (1 - t) * .26, tier + k); }
      spray(tip, a, .18, tier);
    }
  }
  for (let j = 0; j < 6; j++) spray([.055, 3.3, 0], j * 1.047, .18, j);
  needles.finish(); return g;
}
