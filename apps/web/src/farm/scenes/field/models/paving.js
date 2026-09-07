import * as T from "three";
import { box, mesh, seededRandom } from "./primitives.js";

export const PAVING = {
  paving_sandstone: { name: "暖米石砖", cells: [1, 1], groundCover: true },
  paving_terracotta: { name: "红陶砖", cells: [1, 1], groundCover: true },
  paving_slate: { name: "灰蓝石板", cells: [1, 1], groundCover: true },
  paving_pebbles: { name: "浅色鹅卵石", cells: [1, 1], groundCover: true },
};

export function buildPaving(root, id, mat) {
  const base = box(root, mat(id === "paving_slate" ? "#a1aaa7" : "#c9c0a7"), [0, .027, 0], [.94, .01, .94]);
  base.name = "paving-ground-bed";
  base.castShadow = false;
  const slab = (x, z, width, depth, color) => {
    const piece = box(root, mat(color), [x, .038, z], [width, .012, depth]);
    piece.castShadow = false;
    return piece;
  };
  if (id === "paving_sandstone" || id === "paving_terracotta") {
    const terracotta = id === "paving_terracotta";
    const colors = terracotta ? ["#c99883", "#d7ab91", "#bd8e79", "#d4a28d"]
      : ["#dfd3b7", "#e7dbc3", "#d4c6a8", "#ddd0b2"];
    const rows = terracotta ? 4 : 3, step = .94 / rows, length = .47;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? length / 2 : 0;
      for (let col = -1; col < 3; col++) {
        const left = Math.max(-.47, -.47 + col * length + offset);
        const right = Math.min(.47, -.47 + (col + 1) * length + offset);
        if (right - left < .02) continue;
        slab((left + right) / 2, -.47 + (row + .5) * step, right - left - .012, step - .012,
          colors[(row * 3 + col + 4) % colors.length]);
      }
    }
  } else if (id === "paving_slate") {
    for (const [x, z, w, d, color] of [
      [-.17, -.17, .59, .59, "#9dafb6"], [.305, -.305, .316, .316, "#b0bdc0"],
      [.305, .165, .316, .602, "#8fa4ad"], [-.305, .305, .316, .316, "#a4b6bd"],
      [.015, .305, .304, .316, "#b9c4c5"],
    ]) slab(x, z, w, d, color);
  } else {
    const random = seededRandom(318);
    const geometry = new T.SphereGeometry(1, 8, 6);
    for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
      const x = (col - 4) * .098 + (random() - .5) * .015;
      const z = (row - 4) * .098 + (random() - .5) * .015;
      const pebble = mesh(root, geometry, mat(["#ddd9c6", "#c1c9bd", "#e9dfc9", "#b6c0b9"][Math.floor(random() * 4)]),
        [x, .035, z], [.036 + random() * .009, .012, .032 + random() * .01]);
      pebble.rotation.y = random() * Math.PI;
      pebble.castShadow = false;
    }
  }
}
