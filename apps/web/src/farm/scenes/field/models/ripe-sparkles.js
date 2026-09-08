import * as T from "three";

export function createRipeSparkles(plots) {
  const ripe = plots.filter(plot => plot.state === "ripe" && plot.seed_type);
  if (!ripe.length) return null;
  const geometry = new T.PlaneGeometry(1, 1);
  const phases = new Float32Array(ripe.length * 3);
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float sparklePhase;
      uniform float time;
      varying vec2 sparkleUv;
      varying float brightness;
      void main() {
        sparkleUv = uv;
        float wave = .5 + .5 * sin(time * 2.5 + sparklePhase);
        brightness = .12 + .88 * pow(wave, 2.0);
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        center.xy += position.xy * (.20 + brightness * .20);
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      varying vec2 sparkleUv;
      varying float brightness;
      void main() {
        vec2 p = abs(sparkleUv * 2. - 1.);
        float star = 1. - smoothstep(.72, 1., pow(p.x, .7) + pow(p.y, .7));
        float halo = exp(-dot(p, p) * 18.) * .34;
        float alpha = (star + halo) * brightness;
        if (alpha < .01) discard;
        gl_FragColor = vec4(1., .96, .76, alpha);
      }`,
  });
  const points = new T.InstancedMesh(geometry, material, phases.length);
  points.name = "ripe-crop-sparkles";
  points.raycast = () => {};
  const matrix = new T.Matrix4();
  ripe.forEach((plot, index) => {
    const height = plot.seed_type === "common" ? .9 : 1.15;
    [[-.27, .04, -.12], [.24, .17, .03], [-.02, .32, .19]].forEach(([x,y,z], j) => {
      const slot = index * 3 + j;
      points.setMatrixAt(slot, matrix.makeTranslation(plot.x + x, height + y, plot.z + z));
      phases[slot] = (plot.id ?? index) * 2.399 + j * 2.094;
    });
  });
  geometry.setAttribute("sparklePhase", new T.InstancedBufferAttribute(phases, 1));
  // Billboards expand in view space; don't cull from the unexpanded centers.
  points.frustumCulled = false;
  return { points, update(time) { material.uniforms.time.value = time; } };
}
