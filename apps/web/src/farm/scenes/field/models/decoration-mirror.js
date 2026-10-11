const PUMPKIN_LAMPS = new Set(["cat_pumpkin", "pumpkin_lamppost"]);

export function canMirrorDecoration(object) {
  return PUMPKIN_LAMPS.has(object?.userData.decorationId);
}

export function applyDecorationMirror(object, mirrored = false) {
  if (!canMirrorDecoration(object)) return false;
  object.scale.x = Math.abs(object.scale.x) * (mirrored ? -1 : 1);
  return true;
}

export function decorationMirrorPose(object) {
  return canMirrorDecoration(object) && object.scale.x < 0 ? {mirrored: true} : {};
}
