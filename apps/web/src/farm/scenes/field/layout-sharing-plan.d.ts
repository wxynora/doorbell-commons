import type { SceneDecorationData, SceneDecorationLayout, SceneDecorationPose } from "./scene-types";
export interface LayoutShareSkip { name: string; quantity: number; reason: "missing" | "conflict" }
export function planSharedLayout(source: SceneDecorationLayout, data: SceneDecorationData,
  tryPlace: (itemId: string, pose: SceneDecorationPose) => boolean, makeId?: () => string
): { layout: SceneDecorationLayout; skipped: LayoutShareSkip[] };
