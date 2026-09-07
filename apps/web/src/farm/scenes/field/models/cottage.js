import * as T from "three";
import { box, mesh, beam, Instances } from "./primitives.js";
import { addCottageDetails } from "./cottage-details.js";
import { addSeasonalCover } from "./seasonal-cover.js";

export const ROOF_COLORS = {
  mint: { label: "薄荷绿", color: "#91bca9" },
  cream: { label: "银杏黄", color: "#e3c16d" },
  peach: { label: "蜜桃粉", color: "#dfacac" },
  blue: { label: "雾蓝", color: "#a0bfd5" },
  lavender: { label: "香芋紫", color: "#bcaed2" },
  red: { label: "红色", color: "#ce8d83" },
};

export function setRoofColor(house, key) {
  const choice = ROOF_COLORS[key];
  if (!choice) return;
  const base = new T.Color(choice.color);
  house.traverse((object) => {
    if (object.userData.roofAccent) object.material.color.copy(base);
    if (object.userData.roofSurface) object.material.color.copy(base).multiplyScalar(0.78);
    if (object.userData.roofTiles) {
      for (let i = 0; i < object.count; i++)
        object.setColorAt(
          i,
          base
            .clone()
            .multiplyScalar([0.92, 1, 0.85, 1.06][(Math.floor(i / 12) + (i % 12) * 3) % 4]),
        );
      object.instanceColor.needsUpdate = true;
    }
  });
  house.userData.roofColor = key;
}

export function createCottage(parent, mat) {
  const house = new T.Group();
  house.name = "cottage";
  house.position.set(0.45, 0.24, -4.92);
  parent.add(house);
  const wall = mat("#e8dbbb"),
    wood = wall,
    trim = wall,
    dark = wall,
    windowWood = mat("#bc925b"),
    roof = mat("#648775").clone();
  box(house, wall, [0, 0.09, 0], [4.3, 0.18, 3.3], true);
  // Separate walls leave a genuine recessed window opening in the front facade.
  box(house, wall, [0, 1.42, -1.5], [4.1, 2.6, 0.1], true);
  for (const x of [-2, 2]) box(house, wall, [x, 1.42, 0], [0.1, 2.6, 3.1], true);
  for (const [x, width] of [
    [-1.855, 0.39],
    [0.345, 0.45],
    [1.87, 0.36],
  ])
    box(house, wall, [x, 1.42, 1.5], [width, 2.6, 0.1]);
  box(house, wall, [-0.77, 0.51, 1.5], [1.78, 0.78, 0.1]);
  box(house, wall, [-0.77, 2.46, 1.5], [1.78, 0.52, 0.1]);
  box(house, wall, [1.13, 2.49, 1.5], [1.12, 0.46, 0.1]);
  // Gables share the same x/z axes as the farm beds. Roof ridge runs along x.
  for (const side of [-1, 1]) {
    const g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [side * 2.05, 2.72, -1.55, side * 2.05, 3.66, 0, side * 2.05, 2.72, 1.55],
        3,
      ),
    );
    g.computeVertexNormals();
    const material = wall.clone();
    material.side = T.DoubleSide;
    mesh(house, g, material);
    const p = box(house, roof, [0, 3.18, side * 0.91], [4.55, 0.12, 2.15], true);
    p.userData.roofSurface = true;
    p.rotation.x = side * 0.55;
    const tiles = new Instances(p, new T.BoxGeometry(1, 1, 1), mat("#ffffff"));
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 12; col++) {
        const x = -2.25 + (col + 0.5) * 0.375;
        tiles.add(
          [x, 0.069, -0.89 + row * 0.355],
          [0.365, 0.025, 0.342],
          [0, 0, 0],
          ["#6c9079", "#6f937d", "#688d76", "#71947c"][(row + col * 3) % 4],
        );
      }
    tiles.finish().userData.roofTiles = true;
    addSeasonalCover(p, { width: 4.5, depth: 2.12, top: 0.085, seed: 338 + side });
    beam(house, dark, [-2.3, 2.64, side * 1.83], [2.3, 2.64, side * 1.83], 0.055);
    beam(house, wood, [side * 2.14, 2.65, -1.67], [side * 2.14, 3.71, 0], 0.075);
    beam(house, wood, [side * 2.14, 3.71, 0], [side * 2.14, 2.65, 1.67], 0.075);
  }
  beam(house, roof, [-2.31, 3.81, 0], [2.31, 3.81, 0], 0.055).userData.roofSurface = true;
  for (const x of [-2.035, 2.035])
    for (const z of [-1.54, 1.54]) box(house, trim, [x, 1.42, z], [0.075, 2.6, 0.075]);
  // Recessed blue-green glazing, slim timber surrounds and interior suggestions.
  const glass = new T.MeshPhongMaterial({
    color: "#c5e2db",
    shininess: 100,
    specular: "#f4f6e5",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const interior = new T.Group();
  interior.name = "window-interior";
  house.add(interior);
  const interiorLight = new T.PointLight("#ffcf89", 0, 2.2, 2);
  interiorLight.name = "interior-lamp";
  interiorLight.position.set(-0.77, 1.65, 1.25);
  interior.add(interiorLight);
  const insideWall = new T.MeshStandardMaterial({
    color: "#c8b99d",
    emissive: "#e7b66c",
    emissiveIntensity: 0,
    roughness: 1,
  });
  insideWall.userData.windowGlow = true;
  box(interior, insideWall, [-0.77, 1.55, 0.94], [1.78, 1.35, 0.06]);
  box(interior, wood, [-0.77, 0.94, 1.25], [1.78, 0.09, 0.55], true);
  for (const x of [-1.6, 0.06]) box(interior, wood, [x, 1.55, 1.29], [0.08, 1.36, 0.58]);
  const curtain = mat("#e3d9bc");
  for (const side of [-1, 1])
    for (let fold = 0; fold < 4; fold++) {
      const x = -0.77 + side * (0.59 + fold * 0.048);
      mesh(interior, new T.CylinderGeometry(0.037, 0.047, 1.08, 8), curtain, [x, 1.62, 1.35]);
    }
  beam(interior, wood, [-1.59, 2.19, 1.36], [0.05, 2.19, 1.36], 0.018);
  mesh(
    interior,
    new T.CylinderGeometry(0.085, 0.06, 0.12, 10),
    mat("#b68467"),
    [-1.17, 1.04, 1.28],
  );
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(
      interior,
      new T.SphereGeometry(1, 7, 5),
      mat("#81995c"),
      [-1.17 + Math.sin(i * 2.4) * 0.06, 1.17 + (i % 2) * 0.05, 1.28 + Math.cos(i * 2.4) * 0.035],
      [0.045, 0.1, 0.027],
    );
    leaf.rotation.z = Math.sin(i * 2.4) * 0.6;
  }
  for (let i = 0; i < 3; i++)
    box(
      interior,
      mat(["#b98b72", "#8b9c89", "#d8bf8d"][i]),
      [-0.43 + i * 0.065, 1.08, 1.17],
      [0.05, 0.22 + i * 0.03, 0.16],
    );
  box(house, glass, [-0.77, 1.55, 1.53], [1.62, 1.21, 0.012]);
  for (const x of [-1.7, 0.16]) box(house, windowWood, [x, 1.55, 1.62], [0.085, 1.48, 0.11], true);
  for (const y of [0.835, 2.27])
    box(house, windowWood, [-0.77, y, 1.62], [1.93, 0.085, 0.11], true);
  box(house, windowWood, [-0.67, 1.55, 1.63], [0.04, 1.37, 0.055]);
  const windowSill = box(house, windowWood, [-0.77, 0.83, 1.62], [2.04, 0.12, 0.29], true);
  addSeasonalCover(windowSill, { width: 2.0, depth: 0.26, top: 0.065, seed: 614 });
  const reflection = new T.MeshBasicMaterial({
    color: "#edf8ed",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  box(house, reflection, [-1.05, 1.84, 1.55], [0.38, 0.016, 0.002]).rotation.z = -0.42;
  box(house, dark, [1.13, 1.2, 1.585], [1.12, 2.12, 0.09], true);
  const accent = wall.clone();
  const door = box(house, accent, [1.13, 1.2, 1.646], [0.96, 1.98, 0.055], true);
  door.name = "cottage-door";
  door.userData.roofAccent = true;
  for (let x = 0.76; x < 1.6; x += 0.145)
    box(house, accent, [x, 1.2, 1.68], [0.012, 1.9, 0.006]).userData.roofAccent = true;
  box(house, mat("#927349"), [0.82, 1.25, 1.73], [0.035, 0.15, 0.07]);
  const sideGlass = new T.MeshStandardMaterial({
    color: "#788e85",
    emissive: "#ffd48d",
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  sideGlass.userData.windowGlow = true;
  for (const side of [-1, 1]) {
    box(house, windowWood, [side * 2.065, 1.75, -0.25], [0.085, 0.92, 1.23], true);
    box(house, sideGlass, [side * 2.115, 1.75, -0.25], [0.025, 0.73, 1.02]);
    box(house, windowWood, [side * 2.14, 1.75, -0.25], [0.025, 0.73, 0.04]);
  }
  // Deck consists of real boards and steps, visible from every viewing angle.
  box(house, wall, [0, 0.055, 2.03], [4.42, 0.25, 1.0], true).name = "porch-foundation";
  for (let z = 1.58; z < 2.49; z += 0.13) box(house, wall, [0, 0.21, z], [4.42, 0.16, 0.115], true);
  for (const x of [-1.85, 1.85]) box(house, wood, [x, 0.06, 2.18], [0.13, 0.26, 0.13]);
  box(house, wood, [0.65, 0.07, 2.65], [1.15, 0.13, 0.42], true);
  box(house, wall, [0.65, -0.03, 2.94], [1.3, 0.1, 0.36], true);
  box(house, dark, [0.36, 1.95, 1.68], [0.12, 0.22, 0.12], true);
  const lamp = mesh(
    house,
    new T.SphereGeometry(0.065, 8, 6),
    new T.MeshBasicMaterial({ color: "#fff0ba" }),
    [0.36, 1.97, 1.76],
  );
  const glow = new T.PointLight("#ffd890", 0, 5, 2);
  glow.position.copy(lamp.position);
  house.add(glow);
  // Low flower box beneath the window.
  const planter = box(house, accent, [-1.3, 0.46, 2.13], [0.85, 0.31, 0.37], true);
  planter.name = "front-planter-box";
  planter.userData.roofAccent = true;
  const soil = box(house, mat("#65533a"), [-1.3, 0.625, 2.13], [0.77, 0.025, 0.3]);
  soil.name = "planter-soil";
  // Flowers are rooted in the box's local soil surface, never scattered on world ground.
  const flowers = new T.Group();
  flowers.name = "planter-flowers";
  flowers.position.set(-1.3, 0.6375, 2.13);
  house.add(flowers);
  for (let i = 0; i < 7; i++) {
    const flower = new T.Group();
    flower.position.set((i - 3) * 0.085, 0, i % 2 ? -0.055 : 0.055);
    flowers.add(flower);
    const height = 0.19 + (i % 3) * 0.055;
    beam(flower, mat("#71884c"), [0, 0, 0], [0, height, 0], 0.009);
    for (const side of [-1, 1]) {
      const leaf = mesh(
        flower,
        new T.SphereGeometry(1, 6, 4),
        mat("#829954"),
        [side * 0.029, height * 0.5, 0],
        [0.045, 0.014, 0.018],
      );
      leaf.rotation.z = side * 0.5;
    }
    for (let p = 0; p < 5; p++) {
      const angle = (p * Math.PI * 2) / 5;
      mesh(
        flower,
        new T.SphereGeometry(1, 7, 4),
        mat(i % 3 ? "#f5edcf" : "#e7bec7"),
        [Math.cos(angle) * 0.034, height, Math.sin(angle) * 0.034],
        [0.03, 0.014, 0.023],
      );
    }
    mesh(flower, new T.SphereGeometry(0.019, 7, 4), mat("#d5b453"), [0, height + 0.008, 0]);
  }
  addCottageDetails(house, mat);
  return { house, glow };
}
