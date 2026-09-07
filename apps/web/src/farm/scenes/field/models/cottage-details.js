import * as T from "three";
import { box, mesh, beam, Instances, leafGeometry, seededRandom } from "./primitives.js";
import { addSeasonalCover } from "./seasonal-cover.js";

export function addCottageDetails(house, mat) {
  const details = new T.Group();
  details.name = "cottage-garden-details";
  house.add(details);
  const wood = mat("#e8dbbb"),
    edge = mat("#bc925b");
  // Cream-painted boards share the facade color; geometry and light provide depth.
  for (let x = -2.0; x < 2.03; x += 0.16) {
    // The door opening stays clear, including its threshold.
    if (x <= 0.55 || x >= 1.7) box(details, wood, [x, 0.49, 1.566], [0.148, 0.72, 0.028]);
    box(details, wood, [x, 2.47, 1.566], [0.148, 0.43, 0.028]);
  }
  for (const side of [-1, 1]) {
    for (let z = -1.45; z < 1.51; z += 0.16) {
      box(details, wood, [side * 2.058, 0.75, z], [0.022, 1.23, 0.146]);
      box(details, wood, [side * 2.058, 2.45, z], [0.022, 0.46, 0.146]);
    }
    for (const z of [-0.91, 0.41])
      box(details, edge, [side * 2.135, 1.75, z], [0.12, 1.04, 0.09], true);
    box(details, edge, [side * 2.15, 1.22, -0.25], [0.25, 0.1, 1.5], true);
  }
  // A small green door canopy and a reading bench give the porch a lived-in scale.
  const awning = box(details, mat("#72947b").clone(), [1.1, 2.44, 2.0], [1.64, 0.085, 0.9], true);
  awning.userData.roofSurface = true;
  awning.rotation.x = 0.13;
  addSeasonalCover(awning, { width: 1.6, depth: 0.87, top: 0.045, seed: 721 });
  box(details, wood, [1.9, 1.29, 2.32], [0.09, 2.0, 0.09], true);
  beam(details, wood, [1.9, 1.88, 2.32], [1.9, 2.39, 1.76], 0.035);
  box(details, wood, [-0.23, 0.7, 2.2], [0.75, 0.09, 0.36], true);
  for (const x of [-0.53, 0.07])
    for (const z of [2.09, 2.31]) box(details, edge, [x, 0.5, z], [0.055, 0.37, 0.055]);
  box(details, mat("#d6c39c"), [-0.23, 0.78, 2.19], [0.57, 0.07, 0.28]);
  box(details, mat("#a8b99a"), [-0.4, 0.85, 2.08], [0.22, 0.2, 0.065]).rotation.z = -0.12;
  box(details, mat("#9d8663"), [1.11, 0.306, 2.18], [0.72, 0.025, 0.37]);
  // Brick chimney sits on the existing roof, not a new storey or expanded building.
  const chimney = new T.Group();
  chimney.position.set(-0.95, 3.35, -0.38);
  details.add(chimney);
  box(chimney, wood, [0, 0.5, 0], [0.43, 1.0, 0.44], true);
  for (let row = 0; row < 6; row++) {
    box(chimney, wood, [0, 0.09 + row * 0.16, 0.225], [0.43, 0.018, 0.006]);
    box(chimney, wood, [0.22, 0.09 + row * 0.16, 0], [0.006, 0.018, 0.44]);
    box(chimney, wood, [row % 2 ? 0.08 : -0.08, 0.16 + row * 0.16, 0.226], [0.012, 0.14, 0.006]);
  }
  box(chimney, wood, [0, 1.02, 0], [0.56, 0.12, 0.56], true);
  box(chimney, mat("#635c50"), [0, 1.085, 0], [0.3, 0.012, 0.3]);
  const leaves = new Instances(details, leafGeometry(), mat("#ffffff"));
  const blooms = new Instances(details, new T.IcosahedronGeometry(1, 1), mat("#ffffff"));
  const random = seededRandom(941);
  function tuft(x, y, z, r, count = 25) {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2,
        d = Math.sqrt(random()) * r;
      leaves.add(
        [x + Math.cos(a) * d, y, z + Math.sin(a) * d],
        [0.11, 0.15 + random() * 0.12, 0.16],
        [0.5 + random(), a, 0],
        ["#7e9c56", "#abc078", "#90ac61"][i % 3],
      );
      if (i % 4 === 0)
        blooms.add(
          [x + Math.cos(a) * d, y + 0.15, z + Math.sin(a) * d],
          [0.052, 0.026, 0.048],
          [0, a, 0],
          i % 8 ? "#f3deae" : "#d9afc0",
        );
    }
  }
  for (const [x, z] of [
    [-1.98, 2.25],
    [1.98, 1.83],
  ]) {
    mesh(details, new T.CylinderGeometry(0.15, 0.11, 0.22, 10), mat("#bc896a"), [x, 0.41, z]);
    tuft(x, 0.52, z, 0.09, 22);
  }
  for (const side of [-1, 1]) {
    const planter = box(
      details,
      wood.clone(),
      [side * 2.15, 1.08, -0.25],
      [0.26, 0.21, 0.95],
      true,
    );
    planter.name = "side-planter-box";
    planter.userData.roofAccent = true;
    box(details, mat("#6b593e"), [side * 2.15, 1.19, -0.25], [0.22, 0.015, 0.87]);
    for (let i = 0; i < 5; i++) tuft(side * 2.15, 1.2, -0.59 + i * 0.17, 0.06, 8);
  }
  leaves.finish().userData.seasonRole = "leaf";
  blooms.finish();
}
