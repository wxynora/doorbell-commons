import * as T from "three";

export function createNightSky(parent, random) {
  const skyMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.BackSide,
    toneMapped: false,
    blending: T.AdditiveBlending,
    uniforms: { night: { value: 0 }, time: { value: 0 } },
    vertexShader: `varying vec3 skyPosition;
      void main(){skyPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 skyPosition;uniform float night;uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float dust(vec2 p){return .56*noise(p)+.28*noise(p*2.07+13.)+.16*noise(p*4.13+29.);}
      void main(){
        // Fixed world-space chart: orbiting reveals another part of the sky, never a camera-locked image.
        vec3 direction=normalize(skyPosition);
        vec3 right=normalize(vec3(1.,0.,-1.)),up=normalize(vec3(-1.,2.,-1.));
        vec2 uv=vec2(dot(skyPosition,right)/21.,(dot(skyPosition,up)-1.1431)/23.3333)+.5;
        vec3 color=vec3(0.);
        // A softly shaded full moon, including maria, small craters and a restrained halo.
        vec2 moon=(uv-vec2(.77,.83))*vec2(.9,1.)/.039;
        float moonSide=smoothstep(.1,.4,dot(direction,normalize(vec3(-1.,-1.,-1.))));
        float r=length(moon);
        // Only the small moon/halo region needs procedural shading; stars are one point batch.
        if(r>3.5||moonSide<=0.)discard;
        float disc=(1.-smoothstep(.97,1.,r))*moonSide;
        float maria=dust(moon*3.4+17.);
        float shade=.65+.35*max(0.,dot(vec3(moon,sqrt(max(0.,1.-r*r))),normalize(vec3(-.3,.35,1.))));
        float crater=exp(-dot(moon-vec2(-.34,.16),moon-vec2(-.34,.16))*48.)
                    +.7*exp(-dot(moon-vec2(.29,-.37),moon-vec2(.29,-.37))*95.);
        vec3 moonColor=vec3(1.,.94,.77)*shade*(.8+.2*maria-crater*.14);
        color=mix(color,moonColor,disc);
        color+=vec3(.65,.76,1.)*exp(-r*r*.56)*.065*(1.-disc)*moonSide;
        gl_FragColor=vec4(color,night);
        #include <colorspace_fragment>
      }`,
  });
  const skyBackdrop = new T.Mesh(new T.SphereGeometry(100, 24, 16), skyMaterial);
  skyBackdrop.name = "stars-and-moon";
  skyBackdrop.frustumCulled = false;
  skyBackdrop.raycast = () => {};
  parent.add(skyBackdrop);
  const positions = [],
    sizes = [],
    phases = [],
    colors = [];
  // A smaller world-space shell stays outside the fixed camera orbit, so fewer
  // stars remain visible from every allowed direction without following the camera.
  for (let i = 0; i < 4096; i++) {
    const a = random() * Math.PI * 2,
      y = random() * 2 - 1,
      r = Math.sqrt(1 - y * y);
    positions.push(Math.cos(a) * r * 55, y * 55, Math.sin(a) * r * 55);
    sizes.push(i % 31 === 0 ? 6 + random() * 1.5 : 4.2 + random() * 1.3);
    phases.push(random() * Math.PI * 2);
    const c = new T.Color(["#f3edd9", "#cee2f5", "#ffdeb8", "#e5e4f3"][i % 4]);
    colors.push(c.r, c.g, c.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("starSize", new T.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("phase", new T.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false,
    uniforms: { time: { value: 0 }, night: { value: 0 }, pixelScale: { value: 1 } },
    vertexShader: `attribute float starSize; attribute float phase; uniform float pixelScale; varying float vPhase; varying vec3 vColor;
    void main(){vPhase=phase;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=starSize*pixelScale;}`,
    fragmentShader: `uniform float time;uniform float night;varying float vPhase;varying vec3 vColor;
    void main(){vec2 p=gl_PointCoord-.5;float r=length(p);float core=1.-smoothstep(.15,.44,r);float halo=exp(-r*r*25.)*.22;float flicker=.9+.1*sin(time*.7+vPhase);gl_FragColor=vec4(vColor,min(1.,core+halo)*night*flicker);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const stars = new T.Points(geometry, material);
  stars.name = "night-sky-stars";
  parent.add(stars);
  stars.onBeforeRender = (renderer) => {
    material.uniforms.pixelScale.value =
      (renderer.getPixelRatio() * renderer.domElement.clientWidth) / 900;
  };
  const meteor = new T.Group();
  meteor.name = "small-meteor";
  parent.add(meteor);
  const trailGeometry = new T.BufferGeometry();
  const trailPositions = new Float32Array(25 * 3),
    trailColors = new Float32Array(25 * 3);
  for (let i = 0; i < 25; i++) {
    const brightness = (1 - i / 24) ** 1.5;
    trailColors.set([brightness * 0.75, brightness * 0.86, brightness], i * 3);
  }
  trailGeometry.setAttribute("position", new T.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute("color", new T.BufferAttribute(trailColors, 3));
  const trailMaterial = new T.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
  });
  const trail = new T.Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  meteor.add(trail);
  const head = new T.Mesh(
    new T.SphereGeometry(0.038, 7, 5),
    new T.MeshBasicMaterial({ color: "#ecf4ff", transparent: true, opacity: 0 }),
  );
  meteor.add(head);
  head.raycast = () => {};
  // Fixed world-space trail above the rear meadow, visible from the approved
  // front-biased camera instead of the obsolete 45-degree backdrop plane.
  const center = new T.Vector3(-2, 4, -14),
    right = new T.Vector3(36, 0, -6.5).normalize(),
    up = new T.Vector3(6.5, 24, 36).normalize().cross(right).normalize();
  function backdrop(x, y) {
    return center.clone().addScaledVector(right, x).addScaledVector(up, y);
  }
  return {
    skyBackdrop,
    stars,
    meteor,
    update(time, night, weather) {
      skyBackdrop.visible = night > 0.02;
      skyMaterial.uniforms.time.value = time;
      skyMaterial.uniforms.night.value = night * (weather === "clear" ? 1 : 0.12);
      stars.visible = night > 0.02;
      material.uniforms.time.value = time;
      material.uniforms.night.value = night * (weather === "clear" ? 0.95 : 0.16);
      const phase = (time + 3) % 8,
        progress = (phase - 4) / 1.35;
      meteor.visible = night > 0.1 && weather === "clear" && progress >= 0 && progress <= 1;
      if (!meteor.visible) return;
      const start = -7 + (Math.floor((time + 3) / 8) % 3) * 4;
      for (let i = 0; i < 25; i++) {
        const t = progress - (i / 24) * 0.34;
        const p = backdrop(start + t * 5.2, 1.5 - t * 2.4);
        trailPositions.set(p.toArray(), i * 3);
      }
      head.position.copy(backdrop(start + progress * 5.2, 1.5 - progress * 2.4));
      trailGeometry.attributes.position.needsUpdate = true;
      const opacity = Math.sin(progress * Math.PI) * night;
      trailMaterial.opacity = opacity;
      head.material.opacity = opacity;
    },
  };
}
