import { T, kit, pot, Instances, leafGeometry, seededRandom } from "./model-kit.js";

function plantedPot(root, p, scale, season, index) {
  const g = pot(root, p, scale, ["#b77853", "#ca9468", "#a56546", "#d2ac80"][index % 4]), { mat, rod } = kit(g), random = seededRandom(index + 18);
  const leaves = new Instances(g, leafGeometry(), Object.assign(mat("#ffffff"), { side: T.DoubleSide })), petals = new Instances(g, new T.SphereGeometry(1, 6, 4), mat("#ffffff"));
  const colors = ({ spring: ["#e49caa", "#f3c4ce", "#f4e3cf"], summer: ["#db849b", "#f0b2c2", "#f5e4cc"], autumn: ["#cb8650", "#e4b769", "#f1d79d"], winter: ["#b2a0bf", "#dbbfd6", "#f0e5dc"] })[season];
  for (let j = 0; j < (season === "winter" ? 18 : 26); j++) {
    const a = j * 2.39996, r = .32 * Math.sqrt(j / 26), h = .56 + .19 * (1 - r / .36) + random() * .055, x = Math.cos(a) * r, z = Math.sin(a) * r;
    rod([0, .35, 0], [x, h, z], .007, "#66804b"); leaves.add([x, .42 + random() * .10, z], [.16, .27, .18], [.85, a, .25], j % 2 ? "#6d8c51" : "#8aa15d");
    const size = .071 + random() * .025, color = colors[index % 3];
    for (let p = 0; p < 6; p++) { const angle = p * Math.PI / 3; petals.add([x + Math.cos(angle) * size * .72, h, z + Math.sin(angle) * size * .72], [size * .72, .027, size * .48], [0, -angle, 0], color); }
    petals.add([x, h + .024, z], [.027, .021, .027], [0, 0, 0], "#d6a34f");
  }
  if (index % 2 === 0) for (let j = 0; j < 6; j++) { const t = j / 5, x = .14 + Math.sin(t * 3) * .05, y = .49 - t * .28, z = .20 + t * .16; leaves.add([x, y, z], [.11, .19, .12], [1.3, .8, .3], "#718b50"); if (j % 2 === 0) for (let p = 0; p < 5; p++) { const a = p * 1.257; petals.add([x + Math.cos(a) * .043, y + .035, z + Math.sin(a) * .043], [.047, .023, .031], [0, -a, 0], colors[index % 3]); } }
  leaves.finish(); petals.finish();
  return g;
}

export function buildFlowerStand(g, season) {
  const { block, rod, ball } = kit(g), wood = "#805b3e", shelf = "#b88e64";
  for (let tier = 0; tier < 3; tier++) {
    const y = .20 + tier * .36, z = .27 - tier * .30, w = 1.54 - tier * .16;
    for (const x of [-w / 2, w / 2]) { rod([x, 0, z - .13], [x, y + .02, z - .13], .026, wood); rod([x, 0, z + .13], [x, y + .02, z + .13], .026, wood); }
    for (let i = 0; i < 4; i++) block([0, y, z - .12 + i * .08], [w + .08, .045, .061], shelf);
    for (const x of [-w / 2, w / 2]) rod([x, y + .02, z - .15], [x, y + .02, z + .15], .024, wood);
    const count = tier === 2 ? 3 : 4;
    for (let j = 0; j < count; j++) plantedPot(g, [(j - (count - 1) / 2) * .37, y + .024, z], .70, season, tier * 4 + j);
  }
  for (const x of [-.65, .65]) { rod([x, 0, -.40], [x, 1.24, -.40], .03, wood); ball([x, 1.26, -.40], [.041, .045, .041], wood); }
  rod([-.65, 1.18, -.4], [.65, 1.18, -.4], .024, wood);
}
