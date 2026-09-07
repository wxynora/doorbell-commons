import * as T from "three";

export const CANVAS = { width: 900, height: 1000 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2.7;
export const CAMERA_TARGET = new T.Vector3(0, 1.4, 0);
export function resizeFarmCamera(camera, width, height) {
  if (!(width > 0 && height > 0)) return;
  // Preserve the central composition and world scale. Extra portrait height
  // reveals sky/lawn; extra landscape width reveals the surrounding meadow.
  const aspect = width / height;
  const halfWidth = 10.5 * Math.max(1, aspect / (CANVAS.width / CANVAS.height));
  const halfHeight = halfWidth / aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
export function createFarmCamera() {
  // Front-biased oblique view matching the approved phone composition.
  const halfWidth = 10.5,
    halfHeight = (halfWidth * CANVAS.height) / CANVAS.width;
  const camera = new T.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 180);
  camera.position.copy(CAMERA_TARGET).add(new T.Vector3(6.5, 24, 36));
  camera.zoom = 1.55;
  camera.updateProjectionMatrix();
  camera.lookAt(CAMERA_TARGET);
  camera.updateMatrixWorld();
  return camera;
}
