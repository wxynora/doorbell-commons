import * as T from "three";
import { mesh, palette, seededRandom, Instances, leafGeometry } from "./primitives.js";
import { LAND, groundPoint } from "./world.js";
import { createNightSky } from "./night-sky.js";
import { createRainEffects } from "./rain-effects.js";

export const SEASONS = {
  spring: { ground: "#a9bf78", leaf: "#9bb969", tree: "#f8d4df" },
  summer: { ground: "#9db868", leaf: "#719950", tree: "#81a558" },
  autumn: { ground: "#c6b17c", leaf: "#aa985b", tree: "#cb914e" },
  winter: { ground: "#d8e0d4", leaf: "#a7b6a7", tree: "#bdcdc3" },
};
const FOLIAGE_LAYERS = {
  spring: {
    tree: ["#f7bfd4", "#facddd", "#ffdae6", "#ffe9e8", "#f5c4d8", "#ffe1eb"],
    leaf: ["#7caf55", "#a0c86a", "#c1d77e", "#8bb960"],
  },
  autumn: {
    tree: ["#d5984c", "#e9ba65", "#c78051", "#e2a85a"],
    leaf: ["#aa9752", "#c2ab61", "#b89454"],
  },
  winter: {
    tree: ["#b9ccc4", "#d2dcd1", "#a5bfb6", "#e0e5d9"],
    leaf: ["#a5b8aa", "#c2cdc0", "#afc2b6"],
  },
};

export function createNightLighting(world) {
  const interior = world.house.getObjectByName("interior-lamp");
  const stars = new Set(),
    windows = new Set(),
    lights = [],
    treeBulbs = new Set(),
    treeHalos = new Set(),
    treeIllumination = [];
  world.root.traverse((o) => {
    if (o.isPointLight && o.userData.treeGlow) treeIllumination.push(o);
    if (o.material?.userData?.treeLight) treeBulbs.add(o.material);
    if (o.material?.userData?.treeHalo) treeHalos.add(o.material);
  });
  world.root.getObjectByName("stall-star-lights").traverse((o) => {
    if (o.isMesh && o.material.emissive) stars.add(o.material);
    if (o.isPointLight) lights.push(o);
  });
  world.house.traverse((o) => {
    if (o.material?.userData.windowGlow) windows.add(o.material);
  });
  return (amount) => {
    stars.forEach((m) => (m.emissiveIntensity = amount * 3.5));
    windows.forEach((m) => (m.emissiveIntensity = amount * 1.2));
    lights.forEach((l) => (l.intensity = amount * 0.5));
    world.glow.intensity = amount * 2;
    interior.intensity = amount * 1.8;
    treeBulbs.forEach((m) => m.color.setScalar(0.15 + amount * 0.85));
    treeHalos.forEach((m) => (m.opacity = amount * 0.12));
    treeIllumination.forEach((l) => (l.intensity = amount * 1.8));
  };
}

export function createSeasonController(root) {
  const instances = [],
    materials = new Map(),
    seasonalObjects = [];
  root.traverse((o) => {
    if (o.userData.seasonOnly) seasonalObjects.push(o);
    if (o.userData.seasonRole && o.instanceColor)
      instances.push({
        mesh: o,
        original: o.instanceColor.array.slice(),
        role: o.userData.seasonRole,
      });
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      if (m.userData.seasonRole) materials.set(m, m.userData.seasonRole);
    }
  });
  return (season) => {
    const colors = SEASONS[season];
    if (!colors) return;
    root.userData.season = season;
    seasonalObjects.forEach((o) => (o.visible = o.userData.seasonOnly === season));
    materials.forEach((role, m) => m.color.set(colors[role]));
    for (const { mesh: object, original, role } of instances) {
      for (let i = 0; i < object.count; i++) {
        const base = new T.Color().fromArray(original, i * 3);
        // Preserve fruit, petals, stems and stones; only tagged green foliage changes.
        if (base.g > base.r && base.g > base.b) {
          const layers = FOLIAGE_LAYERS[season]?.[role];
          const target = new T.Color(
            layers ? layers[(i + Math.floor(base.g * 11)) % layers.length] : colors[role],
          );
          const color = season === "summer" ? base : target.multiplyScalar(0.94 + base.g * 0.15);
          object.setColorAt(i, color);
        } else object.setColorAt(i, base);
      }
      object.instanceColor.needsUpdate = true;
    }
  };
}

export function createEnvironment(parent) {
  const root = new T.Group();
  root.name = "surrounding-meadow";
  parent.add(root);
  const mat = palette(),
    random = seededRandom(1804);
  const grass = mat("#9db868");
  grass.userData.seasonRole = "ground";
  const meadow = mesh(root, new T.CircleGeometry(13, 96), grass, [0, -0.08, -1]);
  meadow.rotation.x = -Math.PI / 2;
  meadow.castShadow = false;
  // Extend only the foreground so low views see lawn below, while the rear keeps its sky horizon.
  // It is scenery, not a larger placement area; it shares the world's material and projection.
  const foreground = new T.Group();
  foreground.name = "foreground-lawn";
  foreground.rotation.y = Math.PI / 4;
  root.add(foreground);
  const lawn = mesh(foreground, new T.PlaneGeometry(200, 200), grass, [0, -0.085, 100]);
  lawn.rotation.x = -Math.PI / 2;
  lawn.castShadow = false;
  const flowers = new Instances(root, new T.IcosahedronGeometry(1, 0), mat("#ffffff"));
  const blades = new Instances(root, leafGeometry(), mat("#ffffff"));
  for (let i = 0; i < 2800; i++) {
    const a = random() * Math.PI * 2,
      r = 7.2 + random() * 5.1;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r - 1;
    if (
      (x / (LAND.x + LAND.riverWidth + 0.2)) ** 2 + (z / (LAND.z + LAND.riverWidth + 0.2)) ** 2 <
        1.08 ||
      (Math.abs(x) < 0.85 && z > 7)
    )
      continue;
    blades.add(
      [x, -0.06, z],
      [0.12, 0.12 + random() * 0.13, 0.18],
      [0.3, random() * 6, 0],
      i % 2 ? "#99b368" : "#789450",
    );
    if (i % 2 === 0)
      flowers.add(
        [x, 0.015, z],
        [0.09, 0.025, 0.09],
        [0, 0, 0],
        ["#eee5c4", "#d5acc0", "#b6a3cc", "#e3cb74"][i % 4],
      );
  }
  blades.finish(false).userData.seasonRole = "leaf";
  flowers.finish(false);
  // The bridge lands on a visible footpath through the surrounding meadow.
  const path = mesh(root, new T.PlaneGeometry(1.25, 2.2), mat("#c9bc95"), [
    0.05,
    -0.065,
    groundPoint(Math.PI / 2)[1] + LAND.riverWidth + 1.1,
  ]);
  path.rotation.x = -Math.PI / 2;
  path.castShadow = false;
  const skyPixels = new Uint8Array(128 * 4);
  const skyGradient = new T.DataTexture(skyPixels, 1, 128);
  skyGradient.colorSpace = T.SRGBColorSpace;
  skyGradient.minFilter = skyGradient.magFilter = T.LinearFilter;
  const skyBottom = new T.Color(),
    skyTop = new T.Color(),
    skySample = new T.Color();
  const nightBottom = new T.Color("#18263b"),
    nightTop = new T.Color("#050918");
  let lastSkyWeather, lastSkyEvening;
  const cloudMaterials = ["#fff8ed", "#e3edf0", "#abc5d3"].map(
    (color) => new T.MeshBasicMaterial({ color, vertexColors: true, toneMapped: false }),
  );
  const cloudGeometry = new T.SphereGeometry(1, 20, 12);
  const puffColors = [];
  for (let i = 0; i < cloudGeometry.attributes.position.count; i++) {
    const shade = 0.79 + (0.21 * (cloudGeometry.attributes.position.getY(i) + 1)) / 2;
    puffColors.push(shade, shade, shade);
  }
  cloudGeometry.setAttribute("color", new T.Float32BufferAttribute(puffColors, 3));
  const clouds = [];
  for (const [x, y, z] of [
    [-9, 6, -8],
    [-4, 8, -11],
    [5, 7, -11],
    [10, 7, -6],
  ]) {
    const cloud = new T.Group();
    cloud.name = "drifting-cloud";
    cloud.position.set(x * 1.3 - 4.2, y + 3, z * 1.3 + 4.2);
    cloud.scale.setScalar(0.72);
    root.add(cloud);
    clouds.push({ cloud, x: x * 1.3 - 4.2, z: z * 1.3 + 4.2 });
    // Broad shaded underside, overlapping middle billows and smaller sunlit crests.
    for (const [cx, cy, cz, sx, sy, sz, layer] of [
      [0, -0.2, 0, 1.7, 0.19, 0.62, 2],
      [-1.18, -0.04, 0.05, 0.7, 0.26, 0.48, 1],
      [0.98, -0.02, -0.07, 0.83, 0.3, 0.51, 1],
      [-0.58, 0.16, 0, 0.82, 0.4, 0.56, 0],
      [0.33, 0.24, -0.1, 0.88, 0.52, 0.59, 0],
      [1.38, 0.04, 0.04, 0.49, 0.23, 0.4, 0],
      [-0.19, 0.5, -0.2, 0.49, 0.31, 0.41, 0],
      [0.64, -0.1, 0.42, 0.57, 0.21, 0.3, 1],
    ]) {
      const puff = mesh(cloud, cloudGeometry, cloudMaterials[layer], [cx, cy, cz], [sx, sy, sz]);
      puff.castShadow = false;
      puff.receiveShadow = false;
    }
  }
  const snowData = new Float32Array(420 * 3);
  const seeds = Array.from({ length: 420 }, () => [
    random() * 24 - 12,
    random() * 14,
    random() * 24 - 12,
  ]);
  const snowGeometry = new T.BufferGeometry();
  snowGeometry.setAttribute("position", new T.BufferAttribute(snowData, 3));
  const rainfall=createRainEffects(root,parent),rain=rainfall.root;
  const snow = new T.Points(
    snowGeometry,
    new T.PointsMaterial({ color: "#ffffff", size: 2.2, transparent: true, opacity: 0.9 }),
  );
  const sky = createNightSky(root, random);
  const { stars, meteor } = sky;
  const petals = new T.InstancedMesh(
    new T.SphereGeometry(1, 7, 4),
    new T.MeshToonMaterial({ color: "#f3cdd7" }),
    90,
  );
  petals.name = "spring-falling-petals";
  petals.raycast = () => {};
  petals.frustumCulled = false;
  root.add(petals);
  const blossomTrees = [
    [4.45, -6.35, 5.7],
    [-4.4, -5.34, 3.1],
  ];
  const petalSeeds = Array.from({ length: 90 }, (_, i) => ({
    tree: blossomTrees[i % blossomTrees.length],
    phase: random(),
    angle: random() * Math.PI * 2,
  }));
  const petalTransform = new T.Object3D();
  root.add(snow);
  rain.frustumCulled = false;
  snow.frustumCulled = false;
  let weather = "clear";
  function setWeather(value) {
    if (!["clear", "rain", "snow"].includes(value)) return;
    weather = value;
    rainfall.setActive(value === "rain");
    snow.visible = value === "snow";
  }
  setWeather("clear");
  return {
    root,
    rain,
    snow,
    stars,
    meteor,
    petals,
    setWeather,
    refreshRainSurfaces:rainfall.refreshSurfaces,
    dispose() {
      skyGradient.dispose();
    },
    get weather() {
      return weather;
    },
    update(time, evening, scene, camera) {
      if (camera) foreground.rotation.y = Math.atan2(camera.position.x, camera.position.z);
      clouds.forEach(({ cloud, x, z }) => {
        const depth = (x + z) / Math.SQRT2,
          horizontal = (((x - z) / Math.SQRT2 + time * 0.12 + 18) % 36) - 18;
        cloud.position.x = (depth + horizontal) / Math.SQRT2;
        cloud.position.z = (depth - horizontal) / Math.SQRT2;
      });
      if (lastSkyWeather !== weather || lastSkyEvening !== evening) {
        const colors =
          weather === "clear"
            ? ["#bad9e8", "#3789c9"]
            : weather === "rain"
              ? ["#bccfce", "#708fa8"]
              : ["#e4ece8", "#a2bdce"];
        skyBottom.set(colors[0]).lerp(nightBottom, evening);
        skyTop.set(colors[1]).lerp(nightTop, evening);
        for (let i = 0; i < 128; i++) {
          skySample
            .copy(skyBottom)
            .lerp(skyTop, i / 127)
            .convertLinearToSRGB();
          skyPixels.set(
            [
              Math.round(skySample.r * 255),
              Math.round(skySample.g * 255),
              Math.round(skySample.b * 255),
              255,
            ],
            i * 4,
          );
        }
        skyGradient.needsUpdate = true;
        const dayCloud =
          weather === "clear"
            ? ["#fff8ed", "#e3edf0", "#abc5d3"]
            : ["#d1dce2", "#b9cbd4", "#91aaba"];
        cloudMaterials.forEach((material, i) =>
          material.color
            .set(dayCloud[i])
            .lerp(new T.Color(["#263347", "#1b293c", "#121e30"][i]), evening),
        );
        lastSkyWeather = weather;
        lastSkyEvening = evening;
      }
      scene.background = skyGradient;
      sky.update(time, evening, weather);
      petals.visible = parent.userData.season === "spring";
      if (petals.visible) {
        petalSeeds.forEach(({ tree: [x, z, height], phase, angle }, i) => {
          const fall = (phase + time * 0.085) % 1;
          petalTransform.position.set(
            x + Math.cos(angle) * 0.65 + fall * 1.15 + Math.sin(time * 0.8 + i) * 0.17,
            0.3 + height * (1 - fall),
            z + Math.sin(angle) * 0.65 + fall * 0.45,
          );
          petalTransform.rotation.set(time * 0.8 + i, angle + time * 0.35, Math.sin(time + i));
          petalTransform.scale.set(0.055, 0.012, 0.032);
          petalTransform.updateMatrix();
          petals.setMatrixAt(i, petalTransform.matrix);
        });
        petals.instanceMatrix.needsUpdate = true;
      }
      if (weather === "clear") return;
      if(weather==="rain"){rainfall.update(time,evening);return;}
      seeds.forEach(([x, y, z], i) => {
        const height = (((y - time * .85) % 14) + 14) % 14;
        const drift = Math.sin(time * .6 + i) * .3;
        snowData.set([x + drift, height, z], i * 3);
      });
      snowGeometry.attributes.position.needsUpdate = true;
    },
  };
}
