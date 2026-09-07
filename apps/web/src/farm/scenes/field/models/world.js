import * as T from "three";
import {
  seededRandom,
  palette,
  mesh,
  box,
  branch,
  beam,
  leafGeometry,
  Instances,
} from "./primitives.js";
import { createCottage } from "./cottage.js";
import { createStall } from "./stall.js";
import { createRiverFish } from "./river-fish.js";
import { addTreeLights } from "./tree-lights.js";
import { createFence } from "./fence.js";
import { createCropModel } from "./crop-models.js";
import { addSnowCover } from "./seasonal-cover.js";

export const LAND = { x: 7.5, z: 8.7, riverWidth: 1.6, fenceInset: 0.3 };

export const PLOTS = Array.from({ length: 36 }, (_, i) => ({
  id: i + 1,
  kind: (i % 9) + 1,
  x: ((i % 6) - 2.5) * 0.94,
  z: -0.97 + Math.floor(i / 6) * 0.94,
  name: ["番茄", "小葱", "生菜", "卷心菜", "草莓", "青菜", "嫩芽", "幼苗", "待播种的土壤"][i % 9],
  description: [
    "支架上的番茄，正慢慢转红。",
    "细长的叶尖随微风轻轻摇动。",
    "柔软的新叶舒展开来。",
    "一层层叶片，裹住小小的菜心。",
    "叶子下面藏着一点红。",
    "今天也是绿意满满的一天。",
    "刚冒头的小叶子。",
    "给它一点阳光，再等一等。",
    "松好的土，等待下一粒种子。",
  ][i % 9],
}));
export function islandRadius(a) {
  return 1 + 0.025 * Math.sin(a * 5) + 0.02 * Math.cos(a * 9);
}
export function groundPoint(a, extra = 0) {
  const r = islandRadius(a);
  return [Math.cos(a) * (LAND.x * r + extra), Math.sin(a) * (LAND.z * r + extra)];
}

function terrain(parent, mat) {
  const shape = new T.Shape();
  for (let i = 0; i <= 128; i++) {
    const [x, z] = groundPoint((i / 128) * Math.PI * 2);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }
  const g = new T.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.1,
    bevelThickness: 0.06,
  });
  g.rotateX(-Math.PI / 2);
  const grassMaterial = mat("#9db868").clone();
  grassMaterial.userData.seasonRole = "ground";
  grassMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 groundPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ngroundPosition=position;",
    );
    shader.fragmentShader = "varying vec3 groundPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float broad = sin(groundPosition.x * 3.7 + sin(groundPosition.z * 2.8)) * sin(groundPosition.z * 4.3);
      float fine = sin(groundPosition.x * 78. + sin(groundPosition.z * 57.)) * sin(groundPosition.z * 89.);
      diffuseColor.rgb *= .97 + broad * .065 + fine * .025;`,
    );
  };
  const land = mesh(parent, g, [grassMaterial, mat("#b9ad81")]);
  land.name = "ground";
  const waterPositions = [],
    uv = [],
    indices = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    for (const extra of [0.05, LAND.riverWidth]) {
      const [x, z] = groundPoint(a, extra);
      waterPositions.push(x, 0.075, z);
      uv.push(i / 160, (extra - 0.05) / (LAND.riverWidth - 0.05));
    }
    if (i < 160) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const wg = new T.BufferGeometry();
  wg.setAttribute("position", new T.Float32BufferAttribute(waterPositions, 3));
  wg.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  wg.setIndex(indices);
  wg.computeVertexNormals();
  const bedGeometry = wg.clone();
  for (let i = 0; i < bedGeometry.attributes.position.count; i++)
    bedGeometry.attributes.position.setY(i, -0.07);
  const bedMaterial = mat("#b3b998").clone();
  bedMaterial.side = T.DoubleSide;
  const bed = mesh(parent, bedGeometry, bedMaterial);
  bed.name = "riverbed";
  bed.castShadow = false;
  const waterMaterial = new T.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      evening: { value: 0 },
      ripple: { value: new T.Vector3(0, 0, -100) },
    },
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader:
      "varying vec3 p;varying vec2 riverUv; void main(){p=position;riverUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec3 p;varying vec2 riverUv; uniform float time; uniform float evening; uniform vec3 ripple;
      void main(){float current=riverUv.x*6.283185-time*.1;
      float depth=smoothstep(0.,.24,riverUv.y)*smoothstep(0.,.24,1.-riverUv.y);
      float lanes=sin(riverUv.y*36.+sin(current*3.)*.8);
      float glint=smoothstep(.976,1.,lanes)*smoothstep(.1,.85,sin(current*19.+riverUv.y*4.));
      vec3 c=mix(vec3(.60,.71,.63),vec3(.33,.59,.61),depth*.88);
      c+=sin(current*7.+riverUv.y*9.)*.014;
      c=mix(c,vec3(.83,.91,.84),glint*.52);float age=time-ripple.z;
      float d=length(p.xz-ripple.xy);float ring=exp(-pow((d-age*1.4)*15.,2.))*max(0.,1.-age/2.);
      if(age>=0.) c+=ring*.19; c=mix(c,c*vec3(.13,.21,.28),evening*.92);gl_FragColor=vec4(c,.87);}`,
  });
  const water = mesh(parent, wg, waterMaterial);
  water.castShadow = false;
  water.name = "creek";
  return { water, waterMaterial };
}

export function createWorld(plotDefinitions = []) {
  const root = new T.Group();
  root.name = "farm-world";
  const random = seededRandom();
  const mat = palette();
  const { water, waterMaterial } = terrain(root, mat);
  createFence(root, groundPoint, LAND.fenceInset);
  const riverFish = createRiverFish(root, groundPoint, LAND.riverWidth);
  const { house, glow } = createCottage(root, mat);
  createStall(root, mat);
  const sphere = new T.IcosahedronGeometry(1, 1),
    smallSphere = new T.IcosahedronGeometry(1, 0);
  const rocks = new Instances(root, sphere, mat("#ffffff"));
  const groundDetails = new Instances(root, smallSphere, mat("#ffffff"));
  // River stones follow the real land outline, with a bridge opening at the front.
  for (let i = 0; i < 230; i++) {
    const a = ((i + random() * 0.8) / 230) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.14) continue;
    const [x, z] = groundPoint(
        a,
        i % 2 ? LAND.riverWidth - 0.16 + random() * 0.2 : -0.05 + random() * 0.15,
      ),
      size = (i % 2 ? 0.16 : 0.12) + random() * 0.22;
    const scale = [size * (1 + random() * 0.55), size * 0.5, size];
    const rotation = [random() * 0.25, random() * 3, random() * 0.25];
    const matrix = new T.Matrix4().compose(
      new T.Vector3(),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
      new T.Vector3(...scale),
    );
    let bottom = Infinity;
    const vertex = new T.Vector3();
    for (let k = 0; k < sphere.attributes.position.count; k++)
      bottom = Math.min(
        bottom,
        vertex.fromBufferAttribute(sphere.attributes.position, k).applyMatrix4(matrix).y,
      );
    rocks.add(
      [x, (i % 2 ? -0.075 : 0.1) - bottom, z],
      scale,
      rotation,
      ["#a2ab95", "#c8c7af", "#83947e", "#b1baa0"][i % 4],
    );
  }
  for (let i = 0; i < 240; i++) {
    const a = random() * Math.PI * 2,
      [x, z] = groundPoint(a, 0.35 + random() * 0.4);
    groundDetails.add(
      [x, 0.055, z],
      [0.04 + random() * 0.09, 0.025, 0.035 + random() * 0.06],
      [0, random() * 6, 0],
      "#91aaa2",
    );
  }
  // Path around the central beds; shallow irregular stepping stones to the porch.
  const path = mat("#d5c697");

  for (let i = 0; i < 5; i++) {
    const stone = mesh(
      root,
      new T.CylinderGeometry(0.24, 0.25, 0.05, 6),
      mat(i % 2 ? "#d3cfb1" : "#c5c2a2"),
      [0.75, 0.265, -1.25 - i * 0.3],
    );
    stone.scale.z = 0.7;
    stone.rotation.y = random();
  }
  for (let i = 0; i < 12; i++) {
    const z = 4.42 + i * 0.32;
    mesh(root, new T.CylinderGeometry(0.28, 0.31, 0.045, 6), mat("#d4c8a3"), [
      0.07 + Math.sin(i) * 0.06,
      0.265,
      z,
    ]).scale.z = 0.8;
  }
  const plots = [];
  const soilPebbles = new Instances(root, smallSphere, mat("#ffffff"));
  for (const plot of plotDefinitions) {
    const group = new T.Group();
    group.name = `plot-${plot.id}`;
    group.position.set(plot.x, 0.255, plot.z);
    root.add(group);
    const soil = box(group, mat("#796844"), [0, 0.045, 0], [0.785, 0.07, 0.785]);
    soil.userData.plot = plot;
    plots.push(soil);
    const snow = addSnowCover(soil, {
      width: 0.83,
      depth: 0.83,
      top: 0.035,
      thickness: 0.12,
      seed: plot.id,
    });
    snow.traverse((o) => {
      if (o.isMesh) o.userData.plot = plot;
    });
    for (let k = 0; k < 8; k++)
      soilPebbles.add(
        [plot.x + (random() - 0.5) * 0.72, 0.35, plot.z + (random() - 0.5) * 0.72],
        [0.009 + random() * 0.011, 0.008, 0.013],
        [0, random() * 6, 0],
        k % 2 ? "#9a895a" : "#67573e",
      );
    for (let k = 0; k < 3; k++)
      box(group, mat("#6c5c3b"), [-0.24 + k * 0.24, 0.085, 0], [0.016, 0.008, 0.72]);
  }
  soilPebbles.finish(false);
  // All leaf and flower meshes are shared and instanced, rather than thousands of draw calls.
  const leafMat = mat("#ffffff").clone();
  leafMat.side = T.DoubleSide;
  const wind = { value: 0 };
  leafMat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = "uniform float windTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      transformed.x += sin(windTime * 1.1 + instanceMatrix[3].x * 1.4 + instanceMatrix[3].z) * .045 * position.y * position.y;`,
    );
  };
  const leaves = new Instances(root, leafGeometry(), leafMat);
  const buds = new Instances(root, sphere, mat("#ffffff"));
  function leaf(x, y, z, size, angle, tilt, color) {
    leaves.add([x, y, z], [size * 0.65, size, size], [tilt, angle, (random() - 0.5) * 0.15], color);
  }
  function rosette(x, z, size = 0.4) {
    const greens = ["#749645", "#8da953", "#a4bc65", "#638843"];
    for (let i = 0; i < 8; i++)
      leaf(x, 0.35, z, size, (i * Math.PI) / 4, 0.75 + random() * 0.55, greens[i % 4]);
    buds.add([x, 0.4, z], [size * 0.24, size * 0.23, size * 0.24], [0, random() * 6, 0], "#a7be66");
  }
  for (const plot of plotDefinitions) {
    const crop = createCropModel(plot);
    if (crop) { crop.position.set(plot.x, .35, plot.z); root.add(crop); }
  }
  const flowerColors = ["#f6ebcf", "#e7a9c0", "#ad8acb", "#ebcd68"];
  function flowers(x, z, count, radius, stretch) {
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius * (0.85 + Math.sin(a * 3) * 0.15);
      const px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r * stretch,
        h = 0.035 + random() * 0.045,
        size = 0.7 + random() * 0.5;
      for (let p = 0; p < 5; p++) {
        const t = (p / 5) * Math.PI * 2;
        buds.add(
          [px + Math.cos(t) * 0.047 * size, 0.26 + h, pz + Math.sin(t) * 0.047 * size],
          [0.048 * size, 0.017, 0.04 * size],
          [0, t, 0],
          flowerColors[Math.floor(k / 4) % 4],
        );
      }
      buds.add([px, 0.27 + h, pz], [0.021, 0.021, 0.021], [0, 0, 0], "#c6a744");
      leaf(px, 0.25, pz, 0.11, random() * 6, 1.2, "#819957");
    }
  }
  // Keep the original varied clusters, but anchor them to the fence rather than the usable yard.
  [
    [60, 0.42, 0.9], [26, 0.3, 0.7], [13, 0.19, 1], [52, 0.4, 0.8],
    [21, 0.25, 0.85], [64, 0.42, 1], [34, 0.34, 0.72], [16, 0.22, 0.8],
    [43, 0.38, 0.85], [22, 0.27, 0.65],
  ].forEach(([count, radius, stretch], i) => {
    const [x, z] = groundPoint(i * Math.PI * 2 / 10, -0.78);
    flowers(x, z, count, radius, stretch);
  });
  // Organic bushes and curved grass occupy the margins, leaving small decoration pockets.
  for (let k = 0; k < 200; k++) {
    const a = random() * Math.PI * 2,
      [x, z] = groundPoint(a, -0.28 - random() * 0.3);
    if (z > 6 && Math.abs(x) < 1.1) continue;
    if (k % 3 === 0)
      buds.add(
        [x, 0.38, z],
        [0.17 + random() * 0.16, 0.14 + random() * 0.15, 0.19 + random() * 0.12],
        [0, random() * 6, 0],
        ["#829b52", "#95ac65", "#6b8a4d"][k % 3],
      );
    for (let i = 0; i < 5; i++)
      leaf(
        x,
        0.25,
        z,
        0.2 + random() * 0.3,
        i * 1.256,
        0.3 + random() * 0.8,
        k % 2 ? "#a3b56b" : "#8a9f54",
      );
  }
  // Small ground flecks create a restrained painted meadow texture, not a flat green disk.
  for (let i = 0; i < 3600; i++) {
    const x = (random() - 0.5) * (LAND.x * 2 - 0.6),
      z = (random() - 0.5) * (LAND.z * 2 - 0.6);
    if (
      (x / (LAND.x - 0.2)) ** 2 + (z / (LAND.z - 0.2)) ** 2 > 0.96 ||
      (Math.abs(x) < 3.03 && z > -1.5 && z < 4.5) ||
      (x > -4.95 && x < -2.9 && z > 1.9 && z < 3.85) ||
      (x > -1.8 && x < 2.8 && z < -1.3)
    )
      continue;
    groundDetails.add(
      [x, 0.245, z],
      [0.023 + random() * 0.044, 0.005, 0.015 + random() * 0.03],
      [0, random() * 6, 0],
      ["#c2ce8b", "#95b166", "#d0d59b", "#a2b978"][i % 4],
    );
    if (i % 2 === 0)
      leaf(
        x,
        0.245,
        z,
        0.075 + random() * 0.13,
        random() * 6,
        0.2 + random() * 0.8,
        i % 4 ? "#99af61" : "#bcc782",
      );
  }
  // Tree structure is actual branching geometry, with layered, individual leaves.
  const treeSways = [];
  function tree(x, z, scale, denser = false) {
    const tree = new T.Group();
    tree.position.set(x, 0.24, z);
    tree.scale.setScalar(scale);
    root.add(tree);
    const trunk = mat("#8d7751");
    branch(
      tree,
      trunk,
      [
        [0, 0, 0],
        [-0.13, 1.1, 0.07],
        [0.1, 2.3, 0],
        [-0.1, 3.3, 0.1],
      ],
      0.12,
    );
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      beam(tree, trunk, [0, 0.24, 0], [Math.cos(a) * 0.54, 0, Math.sin(a) * 0.45], 0.085);
    }
    const crown = new T.Group();
    tree.add(crown);
    treeSways.push(crown);
    const tl = new Instances(crown, leafGeometry(), leafMat);
    const tips = [];
    const clusterGeo = new T.IcosahedronGeometry(1, 1),
      core = new Instances(crown, clusterGeo, mat("#ffffff"));
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4,
        r = 0.55 + random() * 1.3;
      const tip = [Math.cos(a) * r, 2.5 + random() * 2.3, Math.sin(a) * r * 0.8];
      tips.push(tip);
      branch(
        crown,
        trunk,
        [[0, 1.2 + i * 0.06, 0], [tip[0] * 0.5, tip[1] - 0.55, tip[2] * 0.5], tip],
        0.025 + random() * 0.025,
      );
      core.add(
        tip,
        [0.3, 0.22, 0.31],
        [random(), random(), random()],
        ["#75994e", "#88a255", "#9aaf62"][i % 3],
      );
      for (let k = 0; k < 100; k++) {
        const u = random() * Math.PI * 2,
          v = Math.acos(2 * random() - 1),
          r2 = 0.35 + random() * 0.45;
        const p = [
          tip[0] + Math.cos(u) * Math.sin(v) * r2,
          tip[1] + Math.cos(v) * r2 * 0.6,
          tip[2] + Math.sin(u) * Math.sin(v) * r2,
        ];
        tl.add(
          p,
          [0.1 + random() * 0.08, 0.16 + random() * 0.13, 0.16],
          [random() * 2 - 1, random() * 6, random() * 2],
          ["#91ac55", "#b5c978", "#718f48", "#a2bb66", "#c2cc80"][k % 5],
        );
      }
    }
    {
      // Fill the existing crown from within. A separate seed preserves every other tree.
      const fillRandom = seededRandom(9417);
      for (const tip of tips)
        for (let k = 0; k < (denser ? 150 : 100); k++) {
          const a = fillRandom() * Math.PI * 2,
            v = Math.acos(2 * fillRandom() - 1),
            r = 0.16 + fillRandom() * 0.58;
          tl.add(
            [
              tip[0] * 0.72 + Math.cos(a) * Math.sin(v) * r,
              tip[1] - 0.06 + Math.cos(v) * r * 0.6,
              tip[2] * 0.72 + Math.sin(a) * Math.sin(v) * r,
            ],
            [0.12 + fillRandom() * 0.09, 0.19 + fillRandom() * 0.13, 0.16],
            [fillRandom() * 2 - 1, fillRandom() * 6, fillRandom() * 2],
            ["#75964d", "#94b15e", "#b5c978", "#819e50", "#a6bd6b"][k % 5],
          );
        }
    }
    core.finish().userData.seasonRole = "tree";
    tl.finish().userData.seasonRole = "tree";
    addTreeLights(tree);
  }
  tree(3.35, -5.89, 1.25, true);
  tree(-4.4, -5.34, 0.67);
  // The bridge crosses the creek at z-positive. Every board and support is real geometry.
  const bridge = new T.Group();
  bridge.name = "bridge";
  bridge.position.set(0.05, 0, groundPoint(Math.PI / 2)[1] + LAND.riverWidth / 2);
  root.add(bridge);
  const bridgeWood = mat("#bfa274");
  for (let i = 0; i < 14; i++) {
    const z = -1.05 + i * 0.16,
      y = 0.22 + Math.sin((i / 13) * Math.PI) * 0.13;
    box(bridge, mat(i % 2 ? "#c8ad79" : "#bca070"), [0, y, z], [1.32, 0.09, 0.145], true);
  }
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.83, 0.83]) box(bridge, bridgeWood, [x, 0.62, z], [0.09, 1, 0.09], true);
    beam(bridge, bridgeWood, [x, 0.94, -0.9], [x, 0.94, 0.9], 0.035);
    box(bridge, mat("#82734f"), [x, 0.12, 0], [0.1, 0.12, 2.3]);
  }
  // Watering can near the bridge-side path.
  const can = new T.Group();
  can.position.set(-0.65, 0.26, 4.73);
  root.add(can);
  const metal = mat("#93a9a4");
  mesh(can, new T.CylinderGeometry(0.14, 0.18, 0.3, 14), metal, [0, 0.17, 0]);
  beam(can, metal, [0.12, 0.14, 0], [0.37, 0.32, 0], 0.045);
  const handle = mesh(
    can,
    new T.TorusGeometry(0.17, 0.018, 5, 18, Math.PI * 1.7),
    metal,
    [-0.08, 0.23, 0],
  );
  handle.rotation.y = Math.PI / 2;
  rocks.finish().name = "riverbank-stones";
  groundDetails.finish(false).userData.seasonRole = "leaf";
  leaves.finish().userData.seasonRole = "leaf";
  buds.finish().userData.seasonRole = "leaf";
  const selector = new T.LineLoop(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(-0.86, 0, -0.86),
      new T.Vector3(0.86, 0, -0.86),
      new T.Vector3(0.86, 0, 0.86),
      new T.Vector3(-0.86, 0, 0.86),
    ]),
    new T.LineBasicMaterial({ color: "#f4e4a8" }),
  );
  selector.visible = false;
  root.add(selector);
  return {
    root,
    plots,
    house,
    water,
    waterMaterial,
    glow,
    selector,
    riverFish,
    update(time, evening) {
      riverFish.update(time, evening);
      wind.value = time;
      waterMaterial.uniforms.time.value = time;
      waterMaterial.uniforms.evening.value = evening;
      treeSways.forEach((t, i) => {
        t.rotation.z = Math.sin(time * 0.55 + i) * 0.012;
        t.rotation.x = Math.sin(time * 0.38 + i) * 0.009;
      });
    },
    dispose() {
      const gs = new Set(),
        ms = new Set(),
        ts = new Set();
      root.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m);
      });
      for (const m of ms) {
        for (const value of Object.values(m)) if (value?.isTexture) ts.add(value);
        m.dispose();
      }
      for (const g of gs) g.dispose();
      for (const t of ts) t.dispose();
    },
  };
}
