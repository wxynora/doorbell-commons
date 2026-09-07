import * as T from "three";
import { box, Instances, seededRandom } from "./primitives.js";

export function addSeasonalCover(surface, { width, depth, top, seed = 338 }) {
  const spring = new T.Group();
  spring.name = "spring-petal-cover";
  spring.userData.seasonOnly = "spring";
  spring.visible = false;
  surface.add(spring);
  const random = seededRandom(seed),
    petals = new Instances(
      spring,
      new T.SphereGeometry(1, 7, 4),
      new T.MeshToonMaterial({ color: "#ffffff" }),
    );
  for (let i = 0; i < Math.ceil(width * depth * 52); i++) {
    const edge = i % 3 !== 0;
    const x = (random() - 0.5) * (width - 0.12),
      z = edge
        ? (i % 2 ? 1 : -1) * (depth * 0.5 - 0.05 - random() * Math.min(depth * 0.28, 0.24))
        : (random() - 0.5) * (depth - 0.06);
    const size = 0.025 + random() * 0.035;
    petals.add(
      [x, top + 0.008 + (edge ? random() * 0.017 : 0), z],
      [size, 0.007, size * 0.58],
      [0, random() * 6, 0],
      ["#f5b6cb", "#ffe0e2", "#e99fbf", "#fff0e5"][i % 4],
    );
  }
  petals.finish(false);
  const winter = addSnowCover(surface, { width, depth, top, seed });
  return { spring, winter };
}

export function addSnowCover(surface, { width, depth, top, seed = 338, thickness = 0.2 }) {
  const winter = new T.Group();
  winter.name = "winter-snow-cover";
  winter.userData.seasonOnly = "winter";
  winter.visible = false;
  surface.add(winter);
  const random = seededRandom(seed);
  const snow = new T.MeshStandardMaterial({ color: "#edf3ed", roughness: 1 });
  box(winter, snow, [0, top + thickness / 2, 0], [width - 0.025, thickness, depth - 0.02]);
  const drifts = new Instances(winter, new T.SphereGeometry(1, 10, 6), snow);
  for (let i = 0; i < Math.ceil(width * 5); i++)
    for (const side of [-1, 1]) {
      const x = (i / (Math.ceil(width * 5) - 1) - 0.5) * (width - 0.13);
      drifts.add(
        [x, top + thickness / 2, side * (depth / 2 - 0.055)],
        [0.085, thickness * 0.6 + random() * 0.025, Math.min(0.1, depth * 0.3)],
      );
    }
  drifts.finish();
  return winter;
}
