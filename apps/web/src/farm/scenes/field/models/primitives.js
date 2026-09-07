import * as T from "three";

export function seededRandom(seed = 721) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
export function palette() {
  const colors = new Uint8Array([105, 156, 199, 232, 255]);
  const gradientMap = new T.DataTexture(colors, colors.length, 1, T.RedFormat);
  gradientMap.needsUpdate = true;
  const cache = new Map();
  return (color) => {
    if (!cache.has(color)) cache.set(color, new T.MeshToonMaterial({ color, gradientMap }));
    return cache.get(color);
  };
}
export function mesh(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  const object = new T.Mesh(geometry, material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
export function box(parent, material, position, size, outline = false) {
  const object = mesh(parent, new T.BoxGeometry(...size), material, position);
  if (outline) {
    object.add(
      new T.LineSegments(
        new T.EdgesGeometry(object.geometry, 25),
        new T.LineBasicMaterial({ color: "#394933", transparent: true, opacity: 0.25 }),
      ),
    );
  }
  return object;
}
export function branch(parent, material, points, radius = 0.05) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  return mesh(parent, new T.TubeGeometry(curve, 9, radius, 6, false), material);
}
export function beam(parent, material, from, to, radius = 0.035) {
  const a = new T.Vector3(...from),
    b = new T.Vector3(...to),
    direction = b.clone().sub(a);
  const object = mesh(
    parent,
    new T.CylinderGeometry(radius * 0.85, radius, direction.length(), 6),
    material,
    a.add(b).multiplyScalar(0.5).toArray(),
  );
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
  return object;
}
export function leafGeometry() {
  const geometry = new T.BufferGeometry();
  const positions = [],
    indices = [];
  for (let row = 0; row <= 5; row++) {
    const t = row / 5,
      width = Math.sin(Math.PI * t) * 0.5;
    positions.push(
      -width,
      t,
      Math.sin(t * Math.PI) * 0.14,
      0,
      t,
      Math.sin(t * Math.PI) * 0.24,
      width,
      t,
      Math.sin(t * Math.PI) * 0.14,
    );
    if (row < 5)
      for (let col = 0; col < 2; col++) {
        const a = row * 3 + col;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export class Instances {
  constructor(parent, geometry, material) {
    this.parent = parent;
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }
  add(position, scale = [1, 1, 1], rotation = [0, 0, 0], color) {
    const o = new T.Object3D();
    o.position.set(...position);
    o.scale.set(...scale);
    o.rotation.set(...rotation);
    o.updateMatrix();
    this.items.push({ matrix: o.matrix.clone(), color });
  }
  finish(shadows = true) {
    const m = new T.InstancedMesh(this.geometry, this.material, this.items.length);
    this.items.forEach(({ matrix, color }, i) => {
      m.setMatrixAt(i, matrix);
      if (color) m.setColorAt(i, new T.Color(color));
    });
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    this.parent.add(m);
    return m;
  }
}
