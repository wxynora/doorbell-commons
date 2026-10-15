import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Merge static siblings by default; decorations can also opt into plain static
// containers. Named/animated/seasonal/transparent/custom-shader boundaries stay intact.
export function batchStaticMeshes(root, { descendants = false } = {}) {
  const replaced = new Set();
  function visit(parent) {
    if (!descendants) for (const child of [...parent.children]) if (child.isGroup) visit(child);
    const buckets = new Map();
    function collect(group, transform) {
      for (const object of group.children) {
        object.updateMatrix();
        const matrix = new T.Matrix4().multiplyMatrices(transform, object.matrix);
        // Decoration motion and seasonal visibility use named/tagged groups.
        // Only opt-in through plain, visible containers; keep those boundaries intact.
        if (descendants && object.isGroup && !object.name && object.visible &&
            !Object.keys(object.userData).length && object.layers.mask === parent.layers.mask &&
            object.renderOrder === 0) { collect(object, matrix); continue; }
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
        if (matrix.determinant() <= 0) continue;
        const attributes = Object.entries(geometry.attributes).sort(([a],[b]) => a.localeCompare(b))
          .map(([name,a]) => [name,a.itemSize,a.normalized,a.array?.constructor.name]);
        const key = JSON.stringify([material.uuid,object.castShadow,object.receiveShadow,
          object.renderOrder,object.layers.mask,object.userData,!!geometry.index,attributes]);
        if (!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push({object, matrix});
      }
    }
    collect(parent, new T.Matrix4());
    for (const entries of buckets.values()) {
      if (entries.length < 2) continue;
      const copies = entries.map(({object, matrix}) => object.geometry.clone().applyMatrix4(matrix));
      const geometry = mergeGeometries(copies,false);
      copies.forEach(copy => copy.dispose());
      if (!geometry) continue;
      const first = entries[0].object, batch = new T.Mesh(geometry,first.material);
      batch.name = "static-mesh-batch";
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
      Object.assign(batch.userData,first.userData);
      parent.add(batch);
      for (const {object} of entries) {replaced.add(object.geometry);object.removeFromParent();}
    }
    if (descendants) for (const child of [...parent.children]) if (child.isGroup) visit(child);
  }
  visit(root);
  root.traverse(object => replaced.delete(object.geometry));
  replaced.forEach(geometry => geometry.dispose());
}
