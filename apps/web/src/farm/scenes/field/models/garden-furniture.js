import * as T from "three";
import { box, mesh, beam, branch } from "./primitives.js";

const oval = (parent, material, position, scale) =>
  mesh(parent, new T.SphereGeometry(1, 16, 10), material, position, scale);
const disc = (parent, material, position, radius, height) =>
  mesh(parent, new T.CylinderGeometry(radius, radius, height, 40), material, position);

export function buildGardenFurniture(root, id, mat) {
  if (id === "parasol_lounger") buildParasol(root, mat);
  else if (id === "garden_pond") {
    const pond = new T.Group();
    pond.name = "pond-assembly";
    pond.scale.set(1.5, 1, 1.5);
    root.add(pond);
    buildPond(pond, mat);
  } else buildGardenLight(root, id, mat);
}

function buildGardenLight(root, id, mat) {
  const wood = mat("#bc9369"), dark = mat("#77644e"), brass = mat("#c1a777");
  const glow = mat("#f3e5bc");
  glow.emissive.set("#ffcf7e");
  glow.emissiveIntensity = 0;
  glow.userData.decorationGlow = true;
  const illuminate = (parent, position, intensity, distance) => {
    const light = new T.PointLight("#ffd695", 0, distance, 2);
    light.position.set(...position);
    light.userData.decorationGlow = true;
    light.userData.nightIntensity = intensity;
    parent.add(light);
  };
  if (id === "garden_string_lights") {
    for (const x of [-1.22, 1.22]) {
      disc(root, mat("#c2bca6"), [x, 0.07, 0], 0.12, 0.12);
      beam(root, wood, [x, 0.06, 0], [x, 2.05, 0], 0.042);
      oval(root, wood, [x, 2.075, 0], [0.055, 0.045, 0.055]);
      for (const y of [1.86, 1.91, 1.96]) disc(root, brass, [x, y, 0], 0.045, 0.018);
    }
    const wireY = (x) => 1.62 + 0.29 * (x / 1.22) ** 2;
    branch(root, dark, Array.from({ length: 17 }, (_, i) => {
      const x = -1.22 + i * 2.44 / 16; return [x, wireY(x), 0];
    }), 0.009);
    for (let i = 0; i < 8; i++) {
      const x = -1.06 + i * 2.12 / 7, y = wireY(x);
      beam(root, dark, [x, y, 0], [x, y - 0.07, 0], 0.009);
      disc(root, brass, [x, y - 0.08, 0], 0.031, 0.048);
      oval(root, glow, [x, y - 0.153, 0], [0.058, 0.072, 0.058]);
    }
    // Two shared light pools cover the entire strand without eight extra point lights.
    for (const x of [-0.63, 0.63]) illuminate(root, [x, 1.42, 0], 2.1, 3.7);
  } else {
    disc(root, dark, [0, 0.07, 0], 0.16, 0.1);
    disc(root, brass, [0, 0.15, 0], 0.1, 0.08);
    beam(root, dark, [0, 0.15, 0], [0, 1.56, 0], 0.036);
    for (const y of [0.3, 1.36, 1.5]) disc(root, brass, [0, y, 0], 0.049, 0.028);
    box(root, dark, [0, 1.58, 0], [0.34, 0.065, 0.34]);
    box(root, glow, [0, 1.8, 0], [0.25, 0.37, 0.25]);
    for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15])
      beam(root, dark, [x, 1.6, z], [x, 2, z], 0.018);
    box(root, dark, [0, 2, 0], [0.35, 0.045, 0.35]);
    const cap = mesh(root, new T.ConeGeometry(0.29, 0.22, 4), mat("#91afa0"), [0, 2.13, 0]);
    cap.rotation.y = Math.PI / 4;
    oval(root, brass, [0, 2.275, 0], [0.035, 0.05, 0.035]);
    illuminate(root, [0, 1.77, 0], 3.6, 4.2);
  }
}

function buildParasol(root, mat) {
  const wood = mat("#bc9369"), cream = mat("#f0e4c9"), mint = mat("#94c4b4");
  const parasol = new T.Group();
  parasol.name = "parasol";
  parasol.position.set(-0.18, 0, -0.12);
  root.add(parasol);
  disc(parasol, mat("#cabfa6"), [0, 0.075, 0], 0.18, 0.1);
  beam(parasol, wood, [0, 0.1, 0], [0, 1.98, 0], 0.026);
  // Eight curved fabric gores, with a scalloped valance and exposed wooden ribs.
  const radius = 0.72, panels = 8, rows = 6, columns = 6;
  const point = (r, angle) => [Math.cos(angle) * radius * r,
    1.94 - 0.35 * Math.pow(r, 0.7), Math.sin(angle) * radius * r];
  for (let panel = 0; panel < panels; panel++) {
    const positions = [], indices = [];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const p = point(row / rows, (panel + col / columns) * Math.PI / 4);
        p[1] -= Math.sin(col / columns * Math.PI) * row / rows * 0.025;
        positions.push(...p);
      }
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    // Sew a short draped edge onto each panel, not a separate floating trim.
    for (let col = 0; col <= columns; col++) {
      const p = point(1, (panel + col / columns) * Math.PI / 4);
      p[1] -= 0.045 + 0.055 * Math.sin(col / columns * Math.PI);
      positions.push(...p);
      if (col < columns) {
        const a = rows * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const fabric = panel % 2 ? cream : mint;
    fabric.side = T.DoubleSide;
    mesh(parasol, geometry, fabric);
    branch(parasol, wood, Array.from({ length: 7 }, (_, i) => {
      const p = point(i / 6, panel * Math.PI / 4); p[1] -= 0.016; return p;
    }), 0.009);
    beam(parasol, wood, [0, 1.39, 0], point(0.55, panel * Math.PI / 4), 0.012);
  }
  oval(parasol, wood, [0, 1.97, 0], [0.045, 0.065, 0.045]);

  const strand = new T.Group();
  strand.name = "parasol-bead-lights";
  parasol.add(strand);
  const beadMaterial = mat("#f5e5bd");
  beadMaterial.emissive.set("#ffcf7e");
  beadMaterial.emissiveIntensity = 0;
  beadMaterial.userData.decorationGlow = true;
  // Scalloped swags attach at each rib; pearls hang just below the fabric hem.
  for (let panel = 0; panel < panels; panel++) {
    const edgePoint = (t) => {
      const a = (panel + t) * Math.PI / 4;
      return [Math.cos(a) * .716, 1.535 - Math.sin(t * Math.PI) * .105, Math.sin(a) * .716];
    };
    branch(strand, mat("#b9a783"), Array.from({ length: 7 }, (_, i) => edgePoint(i / 6)), .005);
    for (const t of [.18, .5, .82]) {
      const p = edgePoint(t); p[1] -= .027;
      const bead = oval(strand, beadMaterial, p, [.023, .026, .023]);
      bead.name = "parasol-light-bead";
      bead.castShadow = false;
    }
  }
  const light = new T.PointLight("#ffd695", 0, 3.2, 2);
  light.position.set(0, 1.35, 0);
  light.userData.decorationGlow = true;
  light.userData.nightIntensity = 1.7;
  strand.add(light);

  const chair = new T.Group();
  chair.name = "lounger";
  chair.position.set(0.37, 0, 0.12);
  root.add(chair);
  for (const x of [-0.255, 0.255]) {
    beam(chair, wood, [x, 0.07, -0.32], [x, 0.38, 0.27], 0.029);
    beam(chair, wood, [x, 0.07, 0.52], [x, 0.38, -0.15], 0.029);
    beam(chair, wood, [x, 0.34, 0.65], [x, 0.34, -0.18], 0.029);
    beam(chair, wood, [x, 0.34, -0.18], [x, 0.91, -0.65], 0.029);
    oval(chair, mat("#9a7953"), [x, 0.265, 0.06], [0.037, 0.037, 0.037]);
  }
  box(chair, cream, [0, 0.36, 0.24], [0.46, 0.055, 0.84]);
  const back = new T.Group();
  back.position.set(0, 0.35, -0.18);
  back.rotation.x = Math.atan2(0.57, 0.47);
  chair.add(back);
  box(back, cream, [0, 0, -0.365], [0.46, 0.055, 0.73]);
  for (const x of [-0.16, 0, 0.16]) {
    box(chair, mat("#ddb5a7"), [x, 0.39, 0.24], [0.055, 0.008, 0.82]);
    box(back, mat("#ddb5a7"), [x, 0.03, -0.365], [0.055, 0.008, 0.72]);
  }
  oval(back, mint, [0, 0.08, -0.6], [0.19, 0.07, 0.095]);
  const table = new T.Group();
  table.name = "lounger-side-table";
  table.position.set(-0.5, 0, 0.53);
  root.add(table);
  for (const x of [-0.11, 0.11]) for (const z of [-0.11, 0.11])
    beam(table, wood, [x, 0.025, z], [x, 0.35, z], 0.019);
  disc(table, cream, [0, 0.36, 0], 0.21, 0.045);
  disc(table, mat("#dfa76f"), [0.03, 0.44, 0], 0.042, 0.11);
  beam(table, cream, [0.04, 0.44, 0], [0.065, 0.56, 0], 0.005);
  box(table, mint, [-0.09, 0.395, 0.06], [0.09, 0.02, 0.13]);
}

function buildPond(root, mat) {
  const bed = disc(root, mat("#6d9c95"), [0, 0.08, 0], 1, 0.12);
  bed.scale.set(0.73, 1, 0.62);
  bed.name = "pond-basin";
  const waterMaterial = new T.MeshPhysicalMaterial({ color: "#71c8cb", roughness: 0.2,
    transparent: true, opacity: 0.48, depthWrite: false, metalness: 0 });
  const water = mesh(root, new T.CircleGeometry(1, 64), waterMaterial, [0, 0.185, 0], [0.7, 0.59, 1]);
  water.rotation.x = -Math.PI / 2;
  water.name = "pond-water";
  water.castShadow = false;
  for (let i = 0; i < 22; i++) {
    const a = i * Math.PI / 11, size = 0.095 + 0.022 * (0.5 + Math.sin(i * 4.1) * 0.5);
    const stone = oval(root, mat(["#c9c4ad", "#adb9b1", "#dfd4bb"][i % 3]),
      [Math.cos(a) * 0.74, 0.14, Math.sin(a) * 0.63], [size * 1.35, 0.115, size]);
    stone.rotation.y = -a;
  }
  for (const [x, z, size] of [[-0.3, -0.19, 0.14], [-0.43, 0.05, 0.1], [0.27, 0.25, 0.11]]) {
    const pad = mesh(root, new T.CircleGeometry(size, 24, 0.18, Math.PI * 2 - 0.36), mat("#82ad68"), [x, 0.192, z]);
    pad.rotation.x = -Math.PI / 2;
    pad.castShadow = false;
    if (size > 0.13) {
      for (let j = 0; j < 7; j++) {
        const a = j * Math.PI * 2 / 7;
        const petal = oval(root, mat(j % 2 ? "#f1c5cc" : "#e8a5b8"),
          [x + Math.cos(a) * 0.045, 0.226, z + Math.sin(a) * 0.045], [0.027, 0.026, 0.055]);
        petal.rotation.y = Math.PI / 2 - a;
      }
      oval(root, mat("#eac76d"), [x, 0.25, z], [0.031, 0.018, 0.031]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 0.33 + (i % 3) * 0.045, z = -0.52 + Math.floor(i / 3) * 0.033;
    const height = 0.23 + 0.1 * Math.sin(i * 2.7) ** 2;
    branch(root, mat(i % 2 ? "#8eae6b" : "#679267"), [[x, 0.1, z], [x - 0.03, height, z], [x + 0.02, height + 0.1, z - 0.04]], 0.009);
    if (i % 3 === 0) oval(root, mat("#ac8964"), [x + 0.02, height + 0.09, z - 0.04], [0.015, 0.049, 0.015]);
  }
  for (let i = 0; i < 3; i++) {
    const fish = new T.Group();
    fish.name = "pond-fish";
    fish.userData.pondFish = i;
    root.add(fish);
    const color = mat(i === 1 ? "#f5dfb4" : "#e7a073");
    oval(fish, color, [0, 0, 0], [0.028, 0.018, 0.071]);
    oval(fish, mat("#f1d6b5"), [0, 0.012, -0.02], [0.019, 0.01, 0.022]);
    const tail = mesh(fish, new T.ConeGeometry(0.032, 0.055, 3), color, [0, 0, 0.082], [1, 1, 0.35]);
    tail.rotation.x = -Math.PI / 2;
    fish.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    updatePondFish(fish, 0);
  }
  for (const [x, z] of [[0.22, -0.24], [-0.17, 0.27]]) {
    const ripple = mesh(root, new T.TorusGeometry(0.12, 0.004, 4, 28, Math.PI * 1.15), mat("#c4e9df"), [x, 0.19, z]);
    ripple.rotation.x = -Math.PI / 2;
    ripple.castShadow = false;
  }
}

export function updatePondFish(fish, time) {
  const i = fish.userData.pondFish, angle = time * 0.24 + i * Math.PI * 2 / 3;
  const rx = 0.34 + i * 0.045, rz = 0.23 + i * 0.025;
  fish.position.set(Math.cos(angle) * rx, 0.16, Math.sin(angle) * rz);
  fish.rotation.y = Math.atan2(rx * Math.sin(angle), -rz * Math.cos(angle));
}
