import * as T from "three";
import { box, mesh, beam, branch, palette, leafGeometry } from "./primitives.js";
import { buildGardenFurniture, updatePondFish } from "./garden-furniture.js";
import { PAVING, buildPaving } from "./paving.js";
import { FLOWERBEDS, buildFlowerbed } from "./flowerbeds.js";
import { GARDEN_TRIO, buildGardenTrio } from './garden-trio.js';

// First six IDs match ranch-items; new furniture IDs are local design candidates only.
export const DECORATIONS = {
  ...GARDEN_TRIO,
  flowerbed: { name: "花圃", cells: [1, 1] },
  ...FLOWERBEDS,
  scarecrow: { name: "稻草人", cells: [1, 1] },
  welcome_sign: { name: "欢迎木牌", cells: [1, 1] },
  pumpkin_cart: { name: "南瓜推车", cells: [2, 1] },
  mushroom_lamp: { name: "蘑菇灯", cells: [1, 1] },
  tea_table: { name: "茶歇桌", cells: [2, 2] },
  rattan_chair: { name: "藤椅", cells: [1, 1] },
  windmill: { name: "大风车", cells: [2, 2] },
  waterwheel: { name: "水车", cells: [2, 1] },
  parasol_lounger: { name: "阳伞躺椅", cells: [2, 2] },
  garden_pond: { name: "小池塘", cells: [3, 3] },
  garden_string_lights: { name: "木柱串灯", cells: [3, 1] },
  garden_lamppost: { name: "庭院路灯", cells: [1, 1] },
  ...PAVING,
};

export function createDecoration(id) {
  const definition = DECORATIONS[id];
  if (!definition) throw new Error(`Unknown decoration: ${id}`);
  const root = new T.Group(),
    mat = palette();
  root.name = `decoration-${id}`;
  root.userData.decorationId = id;
  root.userData.label = definition.name;
  root.userData.cells = definition.cells;
  if (definition.groundCover) root.userData.groundCover = true;
  root.position.y = 0.25;
  const wood = mat("#bc9369"),
    edge = mat("#87664b"),
    cream = mat("#efe2bf");
  const sphere = (parent, material, p, s) =>
    mesh(parent, new T.SphereGeometry(1, 14, 10), material, p, s);
  const cylinder = (parent, material, p, top, bottom, height) =>
    mesh(parent, new T.CylinderGeometry(top, bottom, height, 16), material, p);
  function flower(x, y, z, color, size = 0.05) {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      sphere(
        root,
        mat(color),
        [x + Math.cos(a) * size, y, z + Math.sin(a) * size],
        [size * 0.8, 0.018, size * 0.65],
      );
    }
    sphere(root, mat("#d8b151"), [x, y + 0.01, z], [0.025, 0.019, 0.025]);
  }
  function pumpkin(parent, x, y, z, size, color) {
    const fruit = new T.Group();
    fruit.position.set(x, y, z);
    parent.add(fruit);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      sphere(
        fruit,
        mat(color),
        [Math.cos(a) * size * 0.25, size * 0.62, Math.sin(a) * size * 0.25],
        [size * 0.67, size * 0.64, size * 0.67],
      );
    }
    beam(fruit, mat("#738048"), [0, size * 1.12, 0], [0.025, size * 1.55, 0.015], 0.022);
  }
  if (id === "flowerbed") {
    buildFlowerbed(root, id, mat);
  } else if (id === "scarecrow") {
    beam(root, edge, [0, 0, 0], [0, 1.14, 0], 0.035);
    box(root, mat("#8fb0a1"), [0, 0.67, 0], [0.28, 0.37, 0.16], true);
    for (const sign of [-1, 1]) {
      beam(root, mat("#8fb0a1"), [sign * 0.09, 0.81, 0], [sign * 0.31, 0.69, 0], 0.075);
      for (let i = 0; i < 5; i++)
        beam(
          root,
          mat("#d0b77b"),
          [sign * 0.3, 0.7, 0],
          [sign * (0.39 + i * 0.006), 0.68 + (i - 2) * 0.022, 0.008 * i],
          0.009,
        );
      box(root, mat("#829bb0"), [sign * 0.08, 0.42, 0], [0.105, 0.2, 0.13]);
    }
    sphere(root, cream, [0, 1.01, 0], [0.16, 0.18, 0.145]);
    cylinder(root, mat("#d1b277"), [0, 1.14, 0], 0.25, 0.25, 0.035);
    cylinder(root, mat("#ddc68a"), [0, 1.21, 0], 0.13, 0.17, 0.16);
    cylinder(root, mat("#9d8464"), [0, 1.165, 0], 0.174, 0.18, 0.035);
    for (const x of [-0.055, 0.055]) sphere(root, edge, [x, 1.035, 0.139], [0.015, 0.018, 0.008]);
    branch(
      root,
      edge,
      [
        [-0.055, 0.96, 0.14],
        [0, 0.948, 0.15],
        [0.055, 0.96, 0.14],
      ],
      0.006,
    );
    box(root, mat("#dda6a0"), [0, 0.858, 0.02], [0.23, 0.055, 0.16]);
    box(root, mat("#dda6a0"), [0.12, 0.77, 0.108], [0.06, 0.18, 0.018]).rotation.z = -0.3;
    box(root, mat("#e6ce9c"), [-0.07, 0.62, 0.085], [0.075, 0.08, 0.012]).rotation.z = 0.2;
  } else if (id === "welcome_sign") {
    for (const x of [-0.24, 0.24]) {
      beam(root, edge, [x, 0, 0.18], [x, 0.8, 0], 0.025);
      beam(root, wood, [x, 0, -0.2], [x, 0.8, 0], 0.025);
    }
    box(root, wood, [0, 0.6, 0.035], [0.68, 0.42, 0.07], true);
    box(root, cream, [0, 0.61, 0.077], [0.57, 0.3, 0.015]);
    // A tiny cottage emblem and carved lines keep the sign readable from all angles.
    box(root, mat("#86a391"), [-0.12, 0.59, 0.094], [0.14, 0.12, 0.012]);
    beam(root, edge, [-0.22, 0.66, 0.102], [-0.12, 0.74, 0.102], 0.012);
    beam(root, edge, [-0.12, 0.74, 0.102], [-0.02, 0.66, 0.102], 0.012);
    for (let i = 0; i < 3; i++)
      box(root, mat("#a6906c"), [0.13, 0.66 - i * 0.057, 0.092], [0.16 - i * 0.025, 0.012, 0.008]);
    flower(-0.24, 0.83, 0.06, "#ecc2ce", 0.04);
  } else if (id === "pumpkin_cart") {
    box(root, edge, [0, 0.29, 0], [0.98, 0.12, 0.6]);
    for (const z of [-0.29, 0.29])
      for (let row = 0; row < 2; row++)
        box(root, wood, [0, 0.4 + row * 0.12, z], [1.05, 0.095, 0.045], true);
    for (const x of [-0.48, 0.48]) box(root, wood, [x, 0.43, 0], [0.055, 0.3, 0.6], true);
    for (const x of [-0.34, 0.34])
      for (const z of [-0.35, 0.35]) {
        const wheel = cylinder(root, edge, [x, 0.2, z], 0.19, 0.19, 0.08);
        wheel.rotation.x = Math.PI / 2;
        const hub = cylinder(root, wood, [x, 0.2, z + Math.sign(z) * 0.045], 0.12, 0.12, 0.012);
        hub.rotation.x = Math.PI / 2;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          beam(
            root,
            cream,
            [x, 0.2, z + Math.sign(z) * 0.058],
            [x + Math.cos(a) * 0.12, 0.2 + Math.sin(a) * 0.12, z + Math.sign(z) * 0.058],
            0.009,
          );
        }
      }
    for (const z of [-0.19, 0.19]) beam(root, wood, [-0.42, 0.33, z], [-0.83, 0.63, z], 0.027);
    beam(root, edge, [-0.83, 0.63, -0.19], [-0.83, 0.63, 0.19], 0.03);
    pumpkin(root, -0.24, 0.37, -0.05, 0.22, "#d79354");
    pumpkin(root, 0.18, 0.37, 0.04, 0.25, "#dba35e");
    pumpkin(root, 0, 0.58, -0.07, 0.17, "#a9b278");
  } else if (id === "mushroom_lamp") {
    cylinder(root, edge, [0, 0.035, 0], 0.23, 0.27, 0.07);
    cylinder(root, cream, [0, 0.28, 0], 0.095, 0.14, 0.49);
    const shade = mat("#d5a5ad");
    mesh(
      root,
      new T.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      shade,
      [0, 0.5, 0],
    );
    const glow = new T.MeshStandardMaterial({
      color: "#f8e6ad",
      emissive: "#ffd88d",
      emissiveIntensity: 0,
      roughness: 0.65,
    });
    glow.userData.decorationGlow = true;
    cylinder(root, glow, [0, 0.493, 0], 0.3, 0.28, 0.025);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4,
        radius = i === 0 ? 0 : 0.17 + (i % 2) * 0.06;
      const y = 0.5 + Math.sqrt(0.32 ** 2 - radius ** 2);
      sphere(root, cream, [Math.cos(a) * radius, y, Math.sin(a) * radius], [0.038, 0.013, 0.03]);
    }
    const light = new T.PointLight("#ffd18a", 0, 2, 2);
    light.position.set(0, 0.46, 0);
    light.userData.decorationGlow = true;
    root.add(light);
  } else if (id === "tea_table") {
    cylinder(root, wood, [0, 0.58, 0], 0.44, 0.44, 0.065);
    cylinder(root, edge, [0, 0.28, 0], 0.055, 0.08, 0.55);
    for (const a of [0, 2.094, 4.189])
      beam(root, edge, [0, 0.22, 0], [Math.cos(a) * 0.31, 0.025, Math.sin(a) * 0.31], 0.04);
    for (const x of [-0.66, 0.66]) {
      cylinder(root, wood, [x, 0.29, 0.26], 0.19, 0.19, 0.055);
      for (const [dx, dz] of [
        [-0.1, -0.09],
        [0.1, -0.09],
        [0, 0.1],
      ])
        beam(root, edge, [x + dx, 0.02, 0.26 + dz], [x + dx * 0.8, 0.28, 0.26 + dz * 0.8], 0.025);
      sphere(root, mat("#adbea2"), [x, 0.325, 0.26], [0.17, 0.025, 0.17]);
    }
    cylinder(root, cream, [0, 0.62, 0], 0.28, 0.28, 0.014);
    const ceramic = mat("#9cbcb1");
    sphere(root, ceramic, [0, 0.73, -0.05], [0.095, 0.09, 0.085]);
    cylinder(root, ceramic, [0, 0.81, -0.05], 0.065, 0.07, 0.025);
    sphere(root, edge, [0, 0.836, -0.05], [0.021, 0.017, 0.021]);
    beam(root, ceramic, [-0.07, 0.73, -0.05], [-0.15, 0.79, -0.05], 0.025);
    const handle = mesh(
      root,
      new T.TorusGeometry(0.065, 0.013, 7, 18),
      ceramic,
      [0.09, 0.745, -0.05],
    );
    handle.rotation.y = Math.PI / 2;
    for (const x of [-0.18, 0.18]) {
      cylinder(root, mat("#e9c7bd"), [x, 0.657, 0.14], 0.038, 0.028, 0.06);
      cylinder(root, mat("#775b3c"), [x, 0.688, 0.14], 0.031, 0.031, 0.003);
    }
  } else if (id === "rattan_chair") {
    const cane = mat("#d8a553"), weave = mat("#b47b37"), cushion = mat("#e98caa");
    for (const x of [-0.27, 0.27]) for (const z of [-0.24, 0.24])
      beam(root, cane, [x, 0.025, z], [x * 0.88, 0.42, z * 0.85], 0.028);
    box(root, weave, [0, 0.4, 0], [0.6, 0.065, 0.57], true);
    sphere(root, cushion, [0, 0.46, 0.02], [0.285, 0.085, 0.265]);
    // Curved cane frame with separate vertical strands and woven cross-bands.
    const top = (x) => 0.79 + 0.3 * Math.sqrt(Math.max(0, 1 - (x / 0.31) ** 2));
    const outline = [];
    for (let i = 0; i <= 16; i++) {
      const x = -0.31 + i * 0.62 / 16;
      outline.push([x, top(x), -0.27]);
    }
    branch(root, cane, [[-0.31, 0.42, -0.24], ...outline, [0.31, 0.42, -0.24]], 0.028);
    for (let i = -6; i <= 6; i++) {
      const x = i * 0.044;
      branch(root, weave, [[x, 0.44, -0.24], [x, 0.72, -0.285], [x, top(x) - 0.02, -0.27]], 0.009);
    }
    for (let y = 0.53; y < 1.06; y += 0.055) {
      const half = y < 0.79 ? 0.29 : 0.29 * Math.sqrt(1 - ((y - 0.79) / 0.3) ** 2);
      branch(root, cane, [[-half, y, -0.264], [0, y - 0.012, -0.294], [half, y, -0.264]], 0.009);
    }
    for (const x of [-0.32, 0.32])
      branch(root, cane, [[x, 0.4, 0.23], [x, 0.66, 0.19], [x, 0.67, -0.16], [x, 0.48, -0.25]], 0.025);
    sphere(root, mat("#f4d66f"), [0.03, 0.64, -0.17], [0.18, 0.19, 0.06]);
  } else if (id === "windmill") {
    const paint = mat("#59b5b0"), roof = mat("#ef8aa1");
    cylinder(root, edge, [0, 0.08, 0], 0.54, 0.59, 0.16);
    cylinder(root, cream, [0, 1.04, 0], 0.32, 0.49, 1.85);
    for (let y = 0.35; y < 1.8; y += 0.24)
      cylinder(root, wood, [0, y, 0], 0.49 - y * 0.085, 0.49 - y * 0.085, 0.035);
    mesh(root, new T.ConeGeometry(0.5, 0.63, 8), roof, [0, 2.23, 0]);
    box(root, edge, [0, 0.42, 0.455], [0.25, 0.58, 0.045], true);
    box(root, paint, [0, 0.44, 0.483], [0.2, 0.51, 0.023]);
    sphere(root, cream, [0.065, 0.41, 0.506], [0.018, 0.018, 0.018]);
    for (const x of [-0.23, 0.23]) {
      box(root, edge, [x, 1.28, 0.315], [0.15, 0.25, 0.05]);
      box(root, mat("#83cbdc"), [x, 1.28, 0.35], [0.105, 0.19, 0.012]);
    }
    const rotor = new T.Group();
    rotor.position.set(0, 2.14, 0.57);
    rotor.userData.spinSpeed = 0.36;
    root.add(rotor);
    for (let i = 0; i < 4; i++) {
      const blade = new T.Group();
      blade.rotation.z = i * Math.PI / 2;
      rotor.add(blade);
      beam(blade, edge, [0, 0, 0], [0, 0.84, 0], 0.022);
      box(blade, cream, [0.095, 0.56, 0.005], [0.19, 0.53, 0.025]);
      for (const x of [0.01, 0.18]) beam(blade, wood, [x, 0.29, 0.027], [x, 0.82, 0.027], 0.011);
      for (let y = 0.3; y <= 0.81; y += 0.1)
        beam(blade, wood, [0, y, 0.027], [0.19, y, 0.027], 0.009);
      box(blade, paint, [0.095, 0.8, 0.035], [0.19, 0.055, 0.014]);
    }
    sphere(rotor, wood, [0, 0, 0.045], [0.115, 0.115, 0.075]);
    sphere(rotor, cream, [0, 0, 0.104], [0.055, 0.055, 0.022]);
  } else if (id === "waterwheel") {
    // Root stays at y=.25; footings reach the riverbed at -.07, paddles dip below .075 water.
    for (const z of [-0.29, 0.29]) {
      for (const x of [-0.28, 0.28])
        box(root, mat("#9caaa9"), [x, -0.265, z], [0.22, 0.11, 0.22], true).name = "waterwheel-footing";
      beam(root, edge, [-0.28, -0.21, z], [0, 0.46, z], 0.045);
      beam(root, edge, [0.28, -0.21, z], [0, 0.46, z], 0.045);
    }
    beam(root, wood, [0, 0.43, -0.37], [0, 0.43, 0.37], 0.065);
    const rotor = new T.Group();
    rotor.position.y = 0.43;
    rotor.name = "waterwheel-rotor";
    rotor.userData.spinSpeed = -0.46;
    root.add(rotor);
    for (const z of [-0.19, 0.19]) {
      mesh(rotor, new T.TorusGeometry(0.59, 0.043, 6, 32), edge, [0, 0, z]);
      mesh(rotor, new T.TorusGeometry(0.51, 0.023, 6, 32), wood, [0, 0, z]);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        beam(rotor, wood, [0, 0, z], [Math.cos(a) * 0.59, Math.sin(a) * 0.59, z], 0.025);
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const paddle = box(rotor, i % 2 ? wood : mat("#dcad63"), [Math.cos(a) * 0.61, Math.sin(a) * 0.61, 0], [0.14, 0.07, 0.44], true);
      paddle.rotation.z = a + Math.PI / 2;
    }
    sphere(rotor, mat("#599fba"), [0, 0, 0.26], [0.105, 0.105, 0.045]);
  }
  if (["parasol_lounger", "garden_pond", "garden_string_lights", "garden_lamppost"].includes(id))
    buildGardenFurniture(root, id, mat);
  if (definition.groundCover) buildPaving(root, id, mat);
  if (Object.hasOwn(GARDEN_TRIO,id)) buildGardenTrio(root,id,mat);
  if (Object.hasOwn(FLOWERBEDS, id)) buildFlowerbed(root, id, mat);
  root.traverse((o) => {
    if (o.isMesh) o.userData.decoration = root;
  });
  return root;
}

export function updateDecorationLights(objects, night) {
  for (const object of objects)
    object.traverse((o) => {
      if (o.isPointLight && o.userData.decorationGlow) o.intensity = night * (o.userData.nightIntensity ?? 0.8);
      if (o.material?.userData.decorationGlow) o.material.emissiveIntensity = night * 2.3;
    });
}

export function updateDecorationMotion(objects, time) {
  for (const object of objects)
    object.traverse((o) => {
      if (o.userData.spinSpeed) o.rotation.z = time * o.userData.spinSpeed;
      if (o.userData.pondFish !== undefined) updatePondFish(o, time);
      if (o.userData.gardenSwing) o.rotation.x=Math.sin(time*.85)*.035;
    });
}

export function disposeDecoration(object) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  object.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
      materials.add(m);
  });
  materials.forEach((m) => {
    if (m.gradientMap) textures.add(m.gradientMap);
    m.dispose();
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  object.removeFromParent();
}
