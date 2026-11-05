import * as T from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {MarchingCubes} from "three/addons/objects/MarchingCubes.js";

// One metre-based canvas, +Z forward, inside the original 4×3 placement.
export const SNOW_KING_CELLS=[4,3];
const BODY={center:[0,1.16,-.06],radii:[1.03,.86,.83]};
const HEAD={center:[0,2.29,.04],radii:[.9,.8,.79]};
const sphere=new T.SphereGeometry(1,48,32),smallSphere=new T.SphereGeometry(1,12,8);
const material=(color,roughness=.82,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
function mesh(parent,geometry,mat,p=[0,0,0],s=[1,1,1],name=""){
  const object=new T.Mesh(geometry,mat);object.position.set(...p);object.scale.set(...s);object.name=name;
  object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}
const ball=(parent,mat,p,s,name="",small=false)=>mesh(parent,(small?smallSphere:sphere).clone(),mat,p,s,name);
function surface(u,v,point,wrap=false){
  const positions=[],uvs=[],indices=[];
  for(let j=0;j<=v;j++)for(let i=0;i<=u;i++){positions.push(...point(i/u,j/v));uvs.push(i/u,j/v);}
  for(let j=0;j<v;j++)for(let i=0;i<u;i++){
    const a=j*(u+1)+i,b=a+u+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  if(wrap){const normal=geometry.attributes.normal;for(let j=0;j<=v;j++){const a=j*(u+1),b=a+u,n=new T.Vector3().fromBufferAttribute(normal,a).add(new T.Vector3().fromBufferAttribute(normal,b)).normalize();normal.setXYZ(a,n.x,n.y,n.z);normal.setXYZ(b,n.x,n.y,n.z);}}
  return geometry;
}
function outward(geometry){
  const indices=geometry.index;
  for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
  const normal=geometry.attributes.normal;for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
  return geometry;
}
function cord(parent,mat,points,r=.02,segments=40){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return mesh(parent,new T.TubeGeometry(curve,segments,r,8,false),mat);
}
function sweep(parent,mat,points,radius,name=""){
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),n=48,m=20,frames=path.computeFrenetFrames(n,false);
  return mesh(parent,outward(surface(m,n,(a,t)=>{const index=Math.round(t*n),p=path.getPoint(t),r=radius(t);return p.addScaledVector(frames.normals[index],r*Math.cos(a*Math.PI*2)).addScaledVector(frames.binormals[index],r*Math.sin(a*Math.PI*2)).toArray();},true)),mat,[0,0,0],[1,1,1],name);
}
function snowTexture(){
  const size=256,bytes=new Uint8Array(size*size*4);let seed=68172;
  for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=135+(seed>>>25);bytes.set([v,v,v,255],i*4);}
  const texture=new T.DataTexture(bytes,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(3,3);texture.needsUpdate=true;return texture;
}
function glowTexture(){
  const size=64,bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));const a=Math.exp(-4*r*r)*(1-T.MathUtils.smoothstep(r,.75,1));bytes.set([255,255,255,Math.round(255*a)],(y*size+x)*4);}
  const texture=new T.DataTexture(bytes,size,size);texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
function snowyEdge(parent,mat,points,r=.055){
  cord(parent,mat,points,r,Math.max(40,points.length*2));
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),count=Math.ceil(path.getLength()/.065);
  for(let i=0;i<=count;i++){const p=path.getPoint(i/count),k=.7+.15*Math.sin(i*2.3);const flake=ball(parent,mat,[p.x,p.y+.008,p.z],[r*k,r*.62,r*k],"",true);flake.castShadow=false;}
}
function capePoint(a,t){
  const y=1.87-1.39*t+.035*Math.sin(a*4.8)**2*t**5;
  const bodyRadius=BODY.radii[0]*Math.sqrt(Math.max(0,1-((y-BODY.center[1])/BODY.radii[1])**2));
  const flare=.84*t**2.6,fold=(.035+.09*t)*Math.cos(a*9+.8*t);
  const r=bodyRadius+.16+flare+fold;
  return [Math.sin(a)*r,y,BODY.center[2]-Math.cos(a)*r*(.815-.09*t*t)];
}
function crownGeometry(){
  const n=144,positions=[],indices=[],top=a=>.13+.22*Math.pow((1+Math.cos(a*6))/2,1.3);
  for(let side=0;side<4;side++){
    const start=positions.length/3;
    for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,h=top(a),pair=side===0?[[.39,0],[.39,h]]:side===1?[[.335,h],[.335,0]]:side===2?[[.39,h],[.335,h]]:[[.335,0],[.39,0]];
      for(const [r,y] of pair)positions.push(Math.sin(a)*r,y,Math.cos(a)*r);}
    for(let i=0;i<n;i++){const a=start+i*2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return outward(geometry);
}
function armAndMitten(parent,mat,position,rotation,scale,armPoints,name){
  const pose=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));
  const inverse=pose.clone().invert(),path=new T.CatmullRomCurve3([...armPoints.map(p=>new T.Vector3(...p).applyMatrix4(inverse)),new T.Vector3(0,-.08,0)]).getPoints(12);
  const bounds=new T.Box3(new T.Vector3(-.4,-.4,-.25),new T.Vector3(.35,.45,.25));path.forEach(p=>bounds.expandByPoint(p));bounds.expandByScalar(.25);
  const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),radius=Math.max(size.x,size.y,size.z)/2;
  const field=new MarchingCubes(48,mat,false,false,20000);field.isolation=0;
  const blend=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
  const ellipsoid=(x,y,z,c,r)=>{x=(x-c[0])/r[0];y=(y-c[1])/r[1];z=(z-c[2])/r[2];const k0=Math.hypot(x,y,z),k1=Math.hypot(x/r[0],y/r[1],z/r[2]);return k1?k0*(k0-1)/k1:-Math.min(...r);};
  const segments=path.slice(1).map((b,i)=>{const a=path[i],d=b.clone().sub(a);return {a,d,length:d.lengthSq(),radius:.18-.055*i/(path.length-2)};});
  for(let z=0;z<48;z++)for(let y=0;y<48;y++)for(let x=0;x<48;x++){
    const px=center.x+(x/24-1)*radius,py=center.y+(y/24-1)*radius,pz=center.z+(z/24-1)*radius;
    let distance=ellipsoid(px,py,pz,[.055,.055,0],[.205,.30,.175]);
    distance=blend(distance,ellipsoid(px,py,pz,[-.205,.035,.005],[.105,.15,.135]),.045);
    for(const s of segments){const dx=px-s.a.x,dy=py-s.a.y,dz=pz-s.a.z,t=T.MathUtils.clamp((dx*s.d.x+dy*s.d.y+dz*s.d.z)/s.length,0,1);distance=blend(distance,Math.hypot(dx-s.d.x*t,dy-s.d.y*t,dz-s.d.z*t)-s.radius,.055);}
    field.field[x+y*48+z*48*48]=-distance;
  }
  field.update();
  const geometry=new T.BufferGeometry();for(const key of ["position","normal"])geometry.setAttribute(key,new T.Float32BufferAttribute(field.geometry.attributes[key].array.slice(0,field.count*3),3));
  geometry.scale(radius,radius,radius);geometry.translate(...center.toArray());field.geometry.dispose();
  const hand=mesh(parent,geometry,mat,position,scale,name);hand.rotation.set(...rotation);return hand;
}
function faceZ(x,y){return HEAD.center[2]+HEAD.radii[2]*Math.sqrt(Math.max(0,1-(x/HEAD.radii[0])**2-((y-HEAD.center[1])/HEAD.radii[1])**2));}
function facePatch(parent,shape,mat,offset=.012){
  const flat=new T.ShapeGeometry(shape,20).toNonIndexed(),positions=flat.attributes.position,vertices=[];
  const add=(a,b,c,depth)=>{
    if(depth){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);add(a,ab,ca,depth-1);add(ab,b,bc,depth-1);add(ca,bc,c,depth-1);add(ab,bc,ca,depth-1);}
    else for(const p of [a,b,c])vertices.push(p.x,p.y,faceZ(p.x,p.y)+offset);
  };
  for(let i=0;i<positions.count;i+=3)add(new T.Vector3().fromBufferAttribute(positions,i),new T.Vector3().fromBufferAttribute(positions,i+1),new T.Vector3().fromBufferAttribute(positions,i+2),3);
  flat.dispose();const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return mesh(parent,geometry,mat);
}
function snowflake(parent,mat,position,size){
  const group=new T.Group();group.position.set(...position);parent.add(group);
  for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.cos(a),dy=Math.sin(a);cord(group,mat,[[0,0,0],[dx*size,dy*size,0]],.007,4);
    for(const sign of [-1,1]){const b=a+sign*.8;cord(group,mat,[[dx*size*.52,dy*size*.52,0],[(dx*.52+Math.cos(b)*.31)*size,(dy*.52+Math.sin(b)*.31)*size,0]],.006,4);}}
  return group;
}
function star(){const s=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.034:.071;i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}s.closePath();return new T.ExtrudeGeometry(s,{depth:.023,bevelEnabled:true,bevelSize:.007,bevelThickness:.007,bevelSegments:2});}

export function createSnowKing(){
  const root=new T.Group();root.name="snow-king";
  const texture=snowTexture(),halo=glowTexture(),snow=material("#fffaf0",.72),ivory=material("#fffaf0",.94),red=material("#bb1634",.78),gold=material("#efbc58",.29,.56),dark=material("#30242d",.86);
  // A white lantern needs a softer rim than an orange pumpkin to keep its volume.
  snow.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\nfloat lampFacing = max(0., dot(normal, normalize(vViewPosition)));\ntotalEmissiveRadiance *= .12 + .88 * pow(lampFacing, 1.8);");};
  snow.customProgramCacheKey=()=>"snow-king-lantern-shell-v1";
  ivory.bumpMap=texture;ivory.bumpScale=.012;red.bumpMap=texture;red.bumpScale=.008;red.side=T.DoubleSide;
  const baseSnow=material("#fffdf7",.9);baseSnow.bumpMap=texture;baseSnow.bumpScale=.018;root.userData.snowKingBodyLighting=[];
  const selfLit=(m,color,intensity)=>{m.emissive.set(color);m.emissiveIntensity=0;m.userData.decorationGlow=true;m.userData.nightIntensity=intensity;root.userData.snowKingBodyLighting.push(m);};
  // Match the Halloween lantern's luminous shell, not a glass shell over a solid core.
  selfLit(snow,"#fff0c9",4.5);selfLit(ivory,"#fff3d8",.28);selfLit(red,"#bb1634",.13);
  const glow=color=>{const m=material(color,.5);m.emissive=new T.Color(color);m.userData.decorationGlow=true;return m;};
  const lamps={stars:glow("#ffd389"),blue:glow("#b6e3ff"),pink:glow("#ffc0cd"),snowballs:Array.from({length:4},()=>glow("#ffe7b2"))};
  lamps.stars.emissive.set("#ffc357");lamps.blue.emissive.set("#418bf1");lamps.pink.emissive.set("#f45f86");
  for(const lamp of lamps.snowballs)lamp.emissive.set("#ffbd60");
  root.userData.snowKingLighting=lamps;root.userData.snowKingTextures=[texture,halo];root.userData.snowKingHalos=[];
  function lightHalo(position,color,size,strength=.32){const m=new T.SpriteMaterial({map:halo,color,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});const sprite=new T.Sprite(m);sprite.position.set(...position);sprite.scale.set(...(Array.isArray(size)?size:[size,size,1]));sprite.userData.nightOpacity=strength;root.add(sprite);root.userData.snowKingHalos.push(sprite);}
  lightHalo(HEAD.center,"#ffebc9",[3.2,2.95,1],.45);
  lightHalo(BODY.center,"#ffebc9",[3.45,2.95,1],.4);
  // Broad, low snowy terrace; the front has three steps, not fence rails.
  ball(root,baseSnow,[0,.105,-.01],[1.84,.115,1.32]);
  const profile=[[0,0],[1.62,0],[1.74,.025],[1.79,.08],[1.78,.24],[1.74,.29],[1.65,.32],[0,.32]].map(p=>new T.Vector2(...p));
  mesh(root,new T.LatheGeometry(profile,96),baseSnow,[0,.11,-.05],[1,1,.69]);
  for(let i=0;i<3;i++)mesh(root,new RoundedBoxGeometry(1.5-i*.15,.14,.39,2,.06),baseSnow,[0,.11+i*.115,1.15-i*.17]);
  // Short belly and a large head tucked into a draped shoulder collar.
  const body=ball(root,snow,BODY.center,BODY.radii,"snow-king-body");body.userData.sculptureEllipsoid=BODY;
  ball(root,snow,HEAD.center,HEAD.radii,"snow-king-head");
  for(const sign of [-1,1]){const foot=ball(root,snow,[sign*.51,.53,.57],[.42,.23,.43]);foot.rotation.y=sign*.15;}
  mesh(root,surface(96,40,(u,t)=>capePoint(-2.17+u*4.34,t)),red,[0,0,0],[1,1,1],"snow-king-red-cape");
  const hem=Array.from({length:65},(_,i)=>capePoint(-2.17+i/64*4.34,1));snowyEdge(root,ivory,hem,.064);
  const frontEdges=[];
  for(const sign of [-1,1]){
    const edge=Array.from({length:33},(_,i)=>capePoint(sign*2.17,i/32));frontEdges.push(edge);snowyEdge(root,ivory,edge,.06);
    // Soft scalloped shoulder folds are actual fabric patches, not horizontal rods.
    const inner=[[0,1.84,.77],[sign*.29,1.66,.83],[sign*.63,1.65,.68],[sign*.87,1.81,.34]];
    const outer=[[0,1.84,.78],[sign*.29,1.92,.71],[sign*.63,1.94,.49],[sign*.87,1.81,.34]];
    const low=new T.CatmullRomCurve3(inner.map(p=>new T.Vector3(...p))),high=new T.CatmullRomCurve3(outer.map(p=>new T.Vector3(...p)));
    mesh(root,surface(40,12,(u,v)=>{const a=low.getPoint(u),b=high.getPoint(u),p=a.lerp(b,v);p.z+=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*(.105+.035*Math.cos(u*15));return p.toArray();}),red);
    snowyEdge(root,ivory,inner,.049);
  }
  const clasp=ball(root,gold,[0,1.835,.855],[.112,.112,.037]);
  const claspRim=mesh(root,new T.TorusGeometry(.109,.012,8,40),gold,[0,1.835,.885]);
  // Each arm, wrist and mitten is one smooth surface, without intersecting cuffs.
  armAndMitten(root,snow,[-1.13,1.7,.48],[0,-.22,.4],[.91,.91,1],[[-.68,1.75,.02],[-.96,1.59,.2],[-1.09,1.55,.43]],"snow-king-gripping-hand");
  armAndMitten(root,snow,[1.2,2.35,.2],[0,-.1,-.31],[1,1,1],[[.69,1.78,0],[.98,1.92,.09],[1.12,2.12,.18]],"snow-king-waving-hand");
  const eyeMat=new T.MeshPhysicalMaterial({color:"#073bcb",roughness:.2,clearcoat:.8,clearcoatRoughness:.15}),white=new T.MeshBasicMaterial({color:"white"});
  for(const sign of [-1,1]){
    const x=sign*.285,y=2.52,eye=new T.Group();eye.position.set(x,y,faceZ(x,y)+.007);eye.rotation.y=sign*.23;eye.rotation.x=-.13;root.add(eye);
    ball(eye,eyeMat,[0,0,0],[.12,.175,.041],"snow-king-blue-eye");ball(eye,white,[-.035,.075,.038],[.033,.037,.009],"snow-king-eye-highlight");
  }
  const carrot=material("#f99528",.65),baseZ=faceZ(0,2.42);
  sweep(root,carrot,[[0,2.42,baseZ-.02],[.06,2.45,baseZ+.14],[.15,2.53,baseZ+.29],[.23,2.59,baseZ+.37]],t=>.105*Math.pow(1-t,.7)+.002,"snow-king-carrot");
  const mouth=new T.Shape();mouth.moveTo(-.29,2.25);mouth.bezierCurveTo(-.15,2.13,.15,2.13,.29,2.25);mouth.bezierCurveTo(.2,1.92,-.19,1.92,-.29,2.25);facePatch(root,mouth,dark);
  for(const sign of [-1,1])cord(root,dark,[[sign*.27,2.225,faceZ(sign*.27,2.225)+.02],[sign*.305,2.25,faceZ(sign*.305,2.25)+.02],[sign*.32,2.22,faceZ(sign*.32,2.22)+.02]],.018,12);
  const tongue=new T.Shape();tongue.moveTo(-.12,2.027);tongue.bezierCurveTo(-.16,2.11,-.055,2.15,0,2.084);tongue.bezierCurveTo(.06,2.15,.16,2.11,.12,2.027);tongue.quadraticCurveTo(0,1.975,-.12,2.027);facePatch(root,tongue,material("#f16974",.65),.019);
  // Six rounded points run around the open, thick-walled crown.
  const crown=new T.Group();crown.position.set(0,3.005,.015);crown.rotation.z=-.075;root.add(crown);
  mesh(crown,crownGeometry(),gold,[0,0,0],[1,1,1],"snow-king-crown-ring");
  const band=mesh(crown,new T.TorusGeometry(.3625,.028,10,64),gold,[0,.025,0]);band.rotation.x=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*.362,z=Math.cos(a)*.362;ball(crown,gold,[x,.374,z],[.062,.062,.062]);ball(crown,ivory,[x,.421,z],[.044,.022,.044],"",true);}
  // Waffle cone and one continuous twisted soft-serve surface.
  const staff=new T.Group();staff.position.set(-1.21,0,.47);staff.rotation.z=.035;root.add(staff);
  mesh(staff,new T.CylinderGeometry(.044,.049,2.35,24),gold,[0,1.57,0]);ball(staff,gold,[0,.39,0],[.064,.07,.064]);
  const wafer=material("#dfa24b",.62),waffle=material("#f4c66f",.62);
  mesh(staff,new T.CylinderGeometry(.225,.065,.41,48),wafer,[0,2.94,0]);
  for(const dir of [-1,1])for(let i=0;i<10;i++){const points=Array.from({length:15},(_,j)=>{const t=j/14,a=i*Math.PI/5+dir*t*1.7,r=.065+t*.16;return [Math.cos(a)*r,2.735+t*.41,Math.sin(a)*r];});cord(staff,waffle,points,.007,24);}
  for(const [r,y] of [[.08,2.735],[.225,3.145]]){const rim=mesh(staff,new T.TorusGeometry(r,.022,10,48),gold,[0,y,0]);rim.rotation.x=Math.PI/2;}
  mesh(staff,surface(72,88,(u,t)=>{const a=u*Math.PI*2,r=.238*Math.pow(1-t,.68)*(1+.105*Math.cos(t*Math.PI*6-a));return [Math.cos(a)*r+.07*t**5,3.15+t*.55,Math.sin(a)*r];},true),snow,[0,0,0],[1,1,1],"snow-king-soft-serve");
  // Restrained warm/pastel bulbs sit on the sculpture, not over its face.
  const cable=material("#c3a06d"),front=[];
  for(let i=0;i<=48;i++){const a=.06+Math.PI*.96*i/48;front.push([Math.cos(a)*1.79,.32-.025*Math.sin(i*.7),Math.sin(a)*1.23-.05]);}cord(root,cable,front,.006,64);
  for(let i=0;i<19;i++){const p=front[Math.round(i*48/18)],m=i%3===0?lamps.stars:i%3===1?lamps.blue:lamps.pink;
    if(i%3===0)mesh(root,star(),m,[p[0],p[1]-.07,p[2]+.025]);else ball(root,m,[p[0],p[1]-.06,p[2]],[.031,.049,.031],"",true);
    lightHalo([p[0],p[1]-.06,p[2]+.025],m.emissive,.34);
  }
  for(const edge of frontEdges)edge.forEach((p,i)=>{if(i%3===1){ball(root,lamps.stars,[p[0],p[1]+.012,p[2]+.04],[.021,.021,.021],"",true);lightHalo([p[0],p[1]+.012,p[2]+.055],"#ffcf7e",.25);}});
  hem.forEach((p,i)=>{if(i%3===1){ball(root,lamps.stars,[p[0],p[1]+.018,p[2]],[.022,.022,.022],"",true);lightHalo([p[0],p[1]+.028,p[2]],"#ffcf7e",.25);}});
  for(const [i,x] of [-1.48,-.89,.89,1.48].entries()){
    const z=i===0||i===3?.77:1.19;ball(root,lamps.snowballs[i],[x,.2,z],[.15,.15,.15]);snowflake(root,ivory,[x,.2,z+.145],.087);lightHalo([x,.2,z+.09],"#ffda89",.82,.5);
  }
  for(const sign of [-1,1]){const flake=snowflake(root,ivory,[sign*1.25,.275,.84],.12);flake.rotation.y=sign*.55;}
  // A little emitted light reaches the nearby terrace. No upward pedestal spotlights.
  const internalLights=[];
  for(const [shape,power,range] of [[BODY,6,4.7],[HEAD,4,4]]){
    const light=new T.PointLight("#ffe7b6",0,range,2);light.name="snow-king-internal-light";light.position.set(...shape.center);light.userData.decorationGlow=true;light.userData.nightIntensity=power;root.add(light);internalLights.push(light);
  }
  root.userData.snowKingLamp={shell:snow,internalLights};
  return root;
}
export function updateSnowKing(root,time,night){
  const lamps=root?.userData.snowKingLighting;if(!lamps)return;
  for(const m of root.userData.snowKingBodyLighting)m.emissiveIntensity=night*m.userData.nightIntensity;
  const lamp=root.userData.snowKingLamp;
  for(const light of lamp.internalLights){light.intensity=night*light.userData.nightIntensity;light.visible=night>0;}
  lamps.stars.emissiveIntensity=night*4;lamps.blue.emissiveIntensity=night*3;lamps.pink.emissiveIntensity=night*3;
  for(const m of lamps.snowballs)m.emissiveIntensity=night*3.5;
  for(const halo of root.userData.snowKingHalos){halo.visible=night>0;halo.material.opacity=night*halo.userData.nightOpacity;}
}
