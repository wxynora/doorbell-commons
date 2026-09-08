import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Only merge static siblings. Parent groups remain the units for movement,
// visibility and picking; named/animated/transparent/custom-shader meshes stay intact.
export function batchStaticMeshes(root) {
  const replaced = new Set();
  function visit(parent) {
    for (const child of [...parent.children]) if (child.isGroup) visit(child);
    const buckets = new Map();
    for (const object of parent.children) {
      const geometry = object.geometry, material = object.material;
      if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh ||
          object.name || object.children.length || !object.visible ||
          !material || Array.isArray(material) || material.transparent || material.isShaderMaterial ||
          material.onBeforeCompile !== T.Material.prototype.onBeforeCompile ||
          Object.keys(object.userData).some(key => key !== "house" && key !== "stall") ||
          Object.keys(geometry.morphAttributes).length || geometry.drawRange.start !== 0 ||
          geometry.drawRange.count !== Infinity || object.raycast !== T.Mesh.prototype.raycast ||
          object.onBeforeRender !== T.Object3D.prototype.onBeforeRender ||
          object.onAfterRender !== T.Object3D.prototype.onAfterRender) continue;
      object.updateMatrix();
      if (object.matrix.determinant() <= 0) continue;
      const attributes = Object.entries(geometry.attributes).sort(([a],[b]) => a.localeCompare(b))
        .map(([name,a]) => [name,a.itemSize,a.normalized,a.array?.constructor.name]);
      const key = JSON.stringify([material.uuid,object.castShadow,object.receiveShadow,
        object.renderOrder,object.layers.mask,object.userData,!!geometry.index,attributes]);
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(object);
    }
    for (const objects of buckets.values()) {
      if (objects.length < 2) continue;
      const copies = objects.map(object => object.geometry.clone().applyMatrix4(object.matrix));
      const geometry = mergeGeometries(copies,false);
      copies.forEach(copy => copy.dispose());
      if (!geometry) continue;
      const first = objects[0], batch = new T.Mesh(geometry,first.material);
      batch.name = "static-mesh-batch";
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
      Object.assign(batch.userData,first.userData);
      parent.add(batch);
      for (const object of objects) {replaced.add(object.geometry);parent.remove(object);}
    }
  }
  visit(root);
  root.traverse(object => replaced.delete(object.geometry));
  replaced.forEach(geometry => geometry.dispose());
}
