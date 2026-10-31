import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Only flatten stationary, owned parts. Animated candy bodies keep their identity.
export function mergeStaticMeshes(root, exclude = new Set()) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), buckets = new Map(), originals = new Set();
  const visit = object => {
    if (exclude.has(object)) return;
    if (object.isMesh && !Array.isArray(object.material)) {
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, {material:object.material, cast:object.castShadow, receive:object.receiveShadow, parts:[], nodes:[]});
      const bucket = buckets.get(key), geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      for (const name of Object.keys(geometry.attributes)) if (!['position','normal','uv'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      bucket.parts.push(geometry); bucket.nodes.push(object); originals.add(object.geometry);
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.parts), mesh = new THREE.Mesh(geometry,bucket.material);
    mesh.castShadow=bucket.cast; mesh.receiveShadow=bucket.receive;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    bucket.nodes.forEach(node=>node.removeFromParent()); bucket.parts.forEach(part=>part.dispose());
    root.add(mesh);
  }
  for (const geometry of originals) geometry.dispose();
  return root;
}
