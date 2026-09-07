import * as T from "three";
import { box, beam, mesh } from "./primitives.js";
import { addSnowCover } from "./seasonal-cover.js";

export function createStall(parent, mat) {
  const stall = new T.Group();
  stall.name = "market-stall";
  stall.position.set(-3.76, 0.25, 2.32);
  parent.add(stall);
  const wood = mat("#b99461"),
    trim = mat("#d5b783");
  // The stall shares the house's ground axes and faces the front path.
  for (const x of [-0.72, 0.72])
    for (const z of [-0.46, 0.46]) {
      box(stall, wood, [x, 0.78, z], [0.065, 1.56, 0.065], true);
    }
  const counter = box(stall, wood, [0, 0.72, 0.1], [1.58, 0.12, 1.06], true);
  addSnowCover(counter, { width: 1.5, depth: 1.0, top: 0.061, thickness: 0.09, seed: 123 });
  for (let x = -0.68; x < 0.75; x += 0.17)
    box(stall, trim, [x, 0.38, 0.59], [0.155, 0.62, 0.055], true);
  for (const x of [-0.77, 0.77]) box(stall, wood, [x, 0.38, 0.1], [0.05, 0.62, 1.0], true);
  for (let i = 0; i < 8; i++) {
    const x = -0.84 + (i + 0.5) * 0.21;
    const cloth = mat(i % 2 ? "#ede4cb" : "#88a793");
    const canopy = box(stall, cloth, [x, 1.66, 0], [0.21, 0.045, 1.4]);
    canopy.rotation.x = 0.12;
    box(stall, cloth, [x, 1.49, 0.69], [0.21, 0.21, 0.025]);
  }
  beam(stall, wood, [-0.88, 1.72, -0.69], [0.88, 1.72, -0.69], 0.032);
  const snowRoof = new T.Group();
  snowRoof.position.set(0, 1.66, 0);
  snowRoof.rotation.x = 0.12;
  stall.add(snowRoof);
  addSnowCover(snowRoof, { width: 1.68, depth: 1.4, top: 0.024, seed: 341 });
  for (const x of [-0.44, 0.15]) {
    box(stall, wood, [x, 0.82, 0.1], [0.5, 0.12, 0.48], true);
    box(stall, mat("#796744"), [x, 0.89, 0.1], [0.43, 0.02, 0.4]);
    for (let i = 0; i < 6; i++)
      mesh(stall, new T.IcosahedronGeometry(0.065, 1), mat(x < 0 ? "#c77350" : "#99af66"), [
        x + ((i % 3) - 1) * 0.12,
        0.95,
        0.02 + Math.floor(i / 3) * 0.14,
      ]);
  }
  // Small hanging board identifies the stall without introducing a transaction UI.
  for (const x of [-0.25, 0.25]) beam(stall, wood, [x, 1.55, 0.7], [x, 1.32, 0.7], 0.009);
  box(stall, mat("#dfc598"), [0, 1.26, 0.71], [0.67, 0.23, 0.035], true);
  // Every accessory is a child of this movable unit, within its 2 × 2 grid footprint.
  const decorations = new T.Group();
  decorations.name = "stall-decorations";
  stall.add(decorations);
  mesh(
    decorations,
    new T.CylinderGeometry(0.13, 0.09, 0.2, 10),
    mat("#c08462"),
    [-0.65, 0.12, 0.76],
  );
  for (let i = 0; i < 5; i++) {
    const x = -0.65 + Math.sin(i * 2.4) * 0.075,
      z = 0.76 + Math.cos(i * 2.4) * 0.045;
    beam(decorations, mat("#708b4d"), [x, 0.21, z], [x, 0.4 + i * 0.02, z], 0.01);
    mesh(decorations, new T.IcosahedronGeometry(0.052, 1), mat(i % 2 ? "#e4b3bd" : "#f4e5ac"), [
      x,
      0.4 + i * 0.02,
      z,
    ]);
  }
  mesh(
    decorations,
    new T.CylinderGeometry(0.18, 0.14, 0.23, 12),
    mat("#c5a16e"),
    [0.59, 0.13, 0.72],
  );
  const basketHandle = mesh(
    decorations,
    new T.TorusGeometry(0.17, 0.016, 5, 16, Math.PI),
    mat("#8f734b"),
    [0.59, 0.23, 0.72],
  );
  basketHandle.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++)
    mesh(decorations, new T.IcosahedronGeometry(0.065, 1), mat("#d4aa50"), [
      0.53 + (i % 2) * 0.11,
      0.27,
      0.67 + Math.floor(i / 2) * 0.1,
    ]);
  beam(decorations, mat("#9a835b"), [-0.7, 1.38, 0.72], [0.7, 1.38, 0.72], 0.008);
  for (const [i, color] of ["#ddb183", "#a6bda0", "#d5b2b7", "#e2d2a0"].entries()) {
    const pennant = new T.BufferGeometry();
    pennant.setAttribute(
      "position",
      new T.Float32BufferAttribute([-0.065, 0, 0, 0.065, 0, 0, 0, -0.13, 0], 3),
    );
    pennant.computeVertexNormals();
    mesh(decorations, pennant, new T.MeshToonMaterial({ color, side: T.DoubleSide }), [
      -0.57 + i * 0.38,
      1.38,
      0.73,
    ]);
  }
  const lights = new T.Group();
  lights.name = "stall-star-lights";
  stall.add(lights);
  const starShape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 0.038 : 0.085;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const starGeometry = new T.ExtrudeGeometry(starShape, { depth: 0.018, bevelEnabled: false });
  const starMaterial = new T.MeshStandardMaterial({
    color: "#edcc88",
    emissive: "#ffd379",
    emissiveIntensity: 0,
    roughness: 0.6,
  });
  const points = [
    [-0.87, 1.48, -0.73],
    [0.87, 1.48, -0.73],
    [0.87, 1.48, 0.75],
    [-0.87, 1.48, 0.75],
  ];
  for (let edge = 0; edge < 4; edge++) {
    const a = new T.Vector3(...points[edge]),
      b = new T.Vector3(...points[(edge + 1) % 4]);
    beam(lights, mat("#877550"), a.toArray(), b.toArray(), 0.009);
    for (let i = 0; i < 4; i++) {
      const p = a.clone().lerp(b, (i + 0.5) / 4),
        drop = 0.1 + Math.sin(((i + 0.5) / 4) * Math.PI) * 0.07;
      beam(lights, mat("#a58f60"), p.toArray(), [p.x, p.y - drop, p.z], 0.006);
      const star = mesh(lights, starGeometry, starMaterial, [p.x, p.y - drop - 0.055, p.z]);
      star.rotation.y = edge % 2 ? Math.PI / 2 : 0;
    }
    const glow = new T.PointLight("#ffd48b", 0, 2.8, 2);
    glow.name = "star-glow";
    glow.position.copy(a.clone().lerp(b, 0.5));
    lights.add(glow);
  }
  stall.traverse((object) => {
    if (object.isMesh) object.userData.stall = true;
  });
  return stall;
}
