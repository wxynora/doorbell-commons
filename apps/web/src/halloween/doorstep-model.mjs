import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStaticMeshes } from './game/mesh-batching.mjs';

function woodGrain() {
  const size = 96, bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(y * .58 + Math.sin(x * .07) * 1.6) * 8 + Math.sin(y * 2.8 + x * .05) * 3;
    const i = (y * size + x) * 4;
    bytes[i] = bytes[i + 1] = bytes[i + 2] = 233 + grain; bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createDoorstepBoxModel() {
  const root = new THREE.Group(); root.name = 'doorstep-candy-box';
  const grain = woodGrain();
  const wood = new THREE.MeshStandardMaterial({ color: '#c4b2d6', map: grain, bumpMap: grain, bumpScale: .006, roughness: .76 });
  const rim = new THREE.MeshStandardMaterial({ color: '#f4e4bd', map: grain, roughness: .65 });
  const lining = new THREE.MeshStandardMaterial({ color: '#a487b3', roughness: .96 });
  const brass = new THREE.MeshStandardMaterial({ color: '#dbbd82', roughness: .52, metalness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: '#9986ab', roughness: .87 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0d7', roughness: .64 });
  const face = new THREE.MeshStandardMaterial({ color: '#55404f', roughness: .79 });
  const blush = new THREE.MeshStandardMaterial({ color: '#e9adba', roughness: .74 });
  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (parent, size, position, material, radius = .025) => add(parent,
    new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(n => n / 3))), material, ...position);

  // An open container: floor and four separate walls, not a solid cube.
  box(root, [1.58, .13, 1.1], [0, .105, 0], dark);
  for (const z of [-.535, .535]) box(root, [1.64, .64, .105], [0, .455, z], wood);
  for (const x of [-.77, .77]) box(root, [.105, .64, .99], [x, .455, 0], wood);
  box(root, [1.43, .04, .97], [0, .19, 0], lining, .012);
  for (const z of [-.465, .465]) box(root, [1.43, .52, .025], [0, .465, z], lining, .006);
  for (const x of [-.703, .703]) box(root, [.025, .52, .92], [x, .465, 0], lining, .006);
  for (const z of [-.54, .54]) box(root, [1.7, .095, .13], [0, .792, z], rim);
  for (const x of [-.785, .785]) box(root, [.13, .095, 1.05], [x, .792, 0], rim);
  // Recessed plank seams and brass corner straps.
  for (const y of [.32, .54]) box(root, [1.51, .009, .007], [0, y, .592], dark, .002);
  for (const x of [-.7, .7]) {
    box(root, [.055, .59, .017], [x, .44, .6], brass, .005);
    for (const y of [.21, .66]) add(root, new THREE.SphereGeometry(.024, 8, 6), brass, x, y, .615).scale.z = .35;
    box(root, [.14, .07, 1.03], [x, .085, 0], brass, .012);
  }
  for (const x of [-.63, .63]) for (const z of [-.39, .39]) box(root, [.2, .08, .2], [x, .04, z], dark, .018);

  const ghost = new THREE.Shape();
  ghost.moveTo(-.25, -.12);
  ghost.bezierCurveTo(-.22, .0, -.26, .28, 0, .28);
  ghost.bezierCurveTo(.26, .28, .22, .0, .25, -.12);
  ghost.bezierCurveTo(.26, -.21, .16, -.19, .12, -.15);
  ghost.bezierCurveTo(.09, -.21, .01, -.22, -.02, -.16);
  ghost.bezierCurveTo(-.07, -.21, -.15, -.21, -.15, -.14);
  ghost.bezierCurveTo(-.22, -.19, -.27, -.2, -.25, -.12);
  const badge=add(root, new THREE.ExtrudeGeometry(ghost, {depth:.035, bevelEnabled:true, bevelSize:.015, bevelThickness:.012, bevelSegments:3, curveSegments:16}), cream, 0, .41, .602);
  badge.name='little-ghost-badge';
  for(const x of [-.083,.083])add(root,new THREE.SphereGeometry(1,12,8),face,x,.49,.660).scale.set(.018,.027,.009);
  for(const x of [-.145,.145])add(root,new THREE.SphereGeometry(1,12,8),blush,x,.432,.657).scale.set(.036,.018,.008);
  const smile=new THREE.CatmullRomCurve3([new THREE.Vector3(-.028,.429,.662),new THREE.Vector3(0,.413,.664),new THREE.Vector3(.028,.429,.662)]);
  add(root,new THREE.TubeGeometry(smile,10,.006,6,false),face,0,0,0);

  const crescent = new THREE.Shape();
  crescent.moveTo(.05, .14); crescent.bezierCurveTo(-.13, .16, -.18, -.05, -.04, -.13);
  crescent.bezierCurveTo(.06, -.18, .13, -.11, .14, -.08);
  crescent.bezierCurveTo(-.005, -.105, -.10, .04, .05, .14);
  for (const x of [-.43, .43]) {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .025 : .057;
      const point = [Math.cos(a) * r, Math.sin(a) * r]; i ? star.lineTo(...point) : star.moveTo(...point); }
    star.closePath();
    add(root, new THREE.ExtrudeGeometry(star, { depth: .012, bevelEnabled: false }), brass, x, .44, .603);
  }

  const lid = new THREE.Group(); lid.name = 'hinged-lid'; lid.position.set(0, .82, -.54); root.add(lid);
  box(lid, [1.69, .12, 1.14], [0, 0, .55], wood);
  box(lid, [1.45, .024, .91], [0, -.075, .55], lining, .012);
  const moon=add(lid,new THREE.ExtrudeGeometry(crescent,{depth:.014,bevelEnabled:true,bevelSize:.006,bevelThickness:.004,bevelSegments:2,curveSegments:12}),brass,0,-.098,.58);
  moon.rotation.x=Math.PI/2;
  for (const x of [-.775, .775]) box(lid, [.1, .035, 1.07], [x, -.076, .55], rim, .009);
  for (const z of [.045, 1.055]) box(lid, [1.47, .035, .1], [0, -.076, z], rim, .009);
  for (const x of [-.7, .7]) box(lid, [.085, .017, 1.14], [x, .069, .55], brass, .005);
  box(lid, [.16, .045, .14], [0, .065, 1.065], brass, .012);
  for (const x of [-.52, .52]) {
    const hinge = add(root, new THREE.CylinderGeometry(.043, .043, .19, 12), brass, x, .82, -.54);
    hinge.rotation.z = Math.PI / 2;
  }
  mergeStaticMeshes(lid);
  mergeStaticMeshes(root, new Set([lid]));
  lid.rotation.x = -1.02;
  root.userData.lid = lid;
  return root;
}

export const CANDY_BOX_SCALE = .9;

function disposeBox(box) {
  box.removeFromParent();
  const resources = new Set();
  box.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

// Shares the real farm scene, camera, light, shadow map, raycaster and frame loop.
// No extra canvas, renderer, light, timer or stored furniture placement.
export function createDoorstepBoxController(world, { createTerrain, land, cellSize, camera, random = Math.random }) {
  let box = null, localBounds = null, placed = false, editing = false;
  const inverseRoot = new THREE.Matrix4();
  const polygonAt = (x, z) => [
    [x + localBounds.min.x - .1, z + localBounds.min.z - .1],
    [x + localBounds.max.x + .1, z + localBounds.min.z - .1],
    [x + localBounds.max.x + .1, z + localBounds.max.z + .1],
    [x + localBounds.min.x - .1, z + localBounds.max.z + .1],
  ];
  // Called on scene/layout changes only. Camera motion and idle frames do no searches.
  function refresh() {
    if (!box) return false;
    const terrain = createTerrain();
    world.root.updateWorldMatrix(true, true);
    inverseRoot.copy(world.root.matrixWorld).invert();
    const obstacles = [world.house, world.root.getObjectByName('market-stall'),
      ...world.nativeTrees, ...world.decorations, world.wateringCan,
      world.root.getObjectByName('winter-snowman')]
      .filter(object => object?.visible)
      .map(object => new THREE.Box3().setFromObject(object).applyMatrix4(inverseRoot))
      .filter(bounds => !bounds.isEmpty());
    const canPlace = (x, z) => {
      const polygon = polygonAt(x, z), [left, top] = polygon[0], [right, bottom] = polygon[2];
      return terrain.canPlace(polygon) && !obstacles.some(bounds =>
        left < bounds.max.x && right > bounds.min.x && top < bounds.max.z && bottom > bounds.min.z);
    };
    if (placed && canPlace(box.position.x, box.position.z)) return false;
    const available = [], center = new THREE.Vector3(), projected = new THREE.Vector3();
    const sight = new THREE.Ray(), hit = new THREE.Vector3(), viewDirection = camera.getWorldDirection(new THREE.Vector3());
    camera.updateMatrixWorld(true);
    for (let z = -land.z; z <= land.z; z += cellSize) for (let x = -land.x; x <= land.x; x += cellSize) {
      if (!canPlace(x, z)) continue;
      // Keep the whole box inside the current view, with no house/tree hiding it.
      const corners = polygonAt(x, z);
      if (!corners.every(([px, pz]) => [0, localBounds.max.y].every(y => {
        projected.set(px, .28 + y, pz).applyMatrix4(world.root.matrixWorld).project(camera);
        return Math.abs(projected.x) < .96 && Math.abs(projected.y) < .96;
      }))) continue;
      center.set(x, .28 + localBounds.max.y * .55, z).applyMatrix4(world.root.matrixWorld);
      sight.set(center.clone().addScaledVector(viewDirection, -100), viewDirection).applyMatrix4(inverseRoot);
      const distance = sight.origin.distanceTo(center.applyMatrix4(inverseRoot));
      if (obstacles.some(bounds => sight.intersectBox(bounds, hit) && sight.origin.distanceTo(hit) < distance)) continue;
      available.push({ x, z });
    }
    const point = available.length ? available[Math.floor(random() * available.length)] : null;
    const wasPlaced = placed;
    placed = Boolean(point);
    if (point) box.position.set(point.x, .28 - localBounds.min.y, point.z);
    box.visible = placed && !editing;
    return wasPlaced || placed;
  }
  function sync(isEditing = false) {
    editing = isEditing;
    if (!box) return;
    box.visible = placed && !editing;
  }
  return {
    get visible() { return Boolean(box?.visible); },
    setAvailable(available) {
      if (!available && box) { disposeBox(box); box = null; placed = false; }
      else if (available && !box) {
        box = createDoorstepBoxModel(); box.scale.setScalar(CANDY_BOX_SCALE);
        localBounds = new THREE.Box3().setFromObject(box);
        box.traverse(object => { if (object.isMesh) object.userData.halloweenCandyBox = true; });
        world.root.add(box); refresh();
      }
    },
    sync, refresh,
    dispose() { if (box) disposeBox(box); box = null; placed = false; },
  };
}
