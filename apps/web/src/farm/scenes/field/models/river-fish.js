import * as T from "three";
import { mesh } from "./primitives.js";

export function createRiverFish(parent, riverPoint, width) {
  const school = new T.Group();
  school.name = "river-fish";
  parent.add(school);
  const fish = [];
  for (let i = 0; i < 8; i++) {
    const group = new T.Group();
    school.add(group);
    const color = new T.Color(["#c99055", "#cbd1b3", "#749c94", "#d5ad64"][i % 4]);
    const material = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    mesh(group, new T.SphereGeometry(1, 12, 7), material, [0, 0, 0], [0.068, 0.027, 0.19]);
    const tailShape = new T.BufferGeometry();
    tailShape.setAttribute(
      "position",
      new T.Float32BufferAttribute([0, 0, -0.14, -0.085, 0, -0.29, 0.085, 0, -0.29], 3),
    );
    tailShape.computeVertexNormals();
    const tail = mesh(
      group,
      tailShape,
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: T.DoubleSide }),
      [0, 0.004, 0],
    );
    for (const x of [-0.04, 0.04])
      mesh(
        group,
        new T.SphereGeometry(0.009, 5, 4),
        new T.MeshBasicMaterial({ color: "#526762" }),
        [x, 0.017, 0.12],
      );
    group.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    fish.push({ group, tail, material, color, phase: (i / 8) * Math.PI * 2 });
  }
  return {
    school,
    fish,
    update(time, night) {
      fish.forEach(({ group, tail, material, color, phase }, i) => {
        const a = phase + time * (0.024 + (i % 3) * 0.006),
          lane = width * (0.43 + (i % 3) * 0.12) + Math.sin(time * 0.4 + i) * 0.07;
        const [x, z] = riverPoint(a, lane),
          [nx, nz] = riverPoint(a + 0.002, lane);
        group.position.set(x, 0.085, z);
        group.rotation.y = Math.atan2(nx - x, nz - z);
        tail.rotation.y = Math.sin(time * 5 + i) * 0.25;
        material.color.copy(color).multiplyScalar(1 - night * 0.75);
        tail.material.color.copy(material.color);
      });
    },
  };
}
