import type { CSSProperties } from "react";
import { RANCH_SPRITE_BOUNDS } from "./ranch-sprite-bounds";

// Visible longest dimension inside the existing scene slot, not viewport pixels.
export const RANCH_SCENE_BODY_SIZE: Readonly<Record<string, number>> = {
  chicken: 0.62, duck: 0.65, quail: 0.5, rabbit: 0.66, goose: 0.73,
  sheep: 0.8, goat: 0.8, cow: 0.92, bee: 0.42, turkey: 0.76,
  pig: 0.8, alpaca: 0.88, silk_moth: 0.44, ember_hen: 0.66,
  cloud_sheep: 0.8, dream_cat: 0.73, cat: 0.7, dog: 0.75,
  patrol_goose: 0.73, crab: 0.52, frost_antler_deer: 0.9, amber_dragon: 0.92,
};

export function getRanchSceneSpritePlacement(
  kindId: string,
  visualId: string,
  original: CSSProperties,
): CSSProperties {
  const bounds = RANCH_SPRITE_BOUNDS[visualId];
  const targetSize = RANCH_SCENE_BODY_SIZE[kindId];
  if (!bounds || targetSize === undefined) return original;
  const [left, top, right, bottom] = bounds;
  const scale = targetSize / Math.max(right - left, bottom - top);
  return {
    width: `${scale * 100}%`,
    height: `${scale * 100}%`,
    left: `${(0.5 + (0.5 - (left + right) / 2) * scale) * 100}%`,
    top: `${(0.94 + (0.5 - bottom) * scale) * 100}%`,
  };
}
