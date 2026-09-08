import * as T from 'three';
import {seededRandom} from './primitives.js';

// Visual-only rainfall; authoritative weather remains outside this module.
export function createRainEffects(parent,world){
  const root=new T.Group();root.name='layered-rain';parent.add(root);
  const random=seededRandom(928),count=420;
  const drops=Array.from({length:count},(_,i)=>({x:random()*24-12,z:random()*24-12,phase:random(),speed:5.5+random()*3.5,length:.18+random()*.34,tone:.36+random()*.42,water:false,y:.24}));
  const positions=new Float32Array(count*6),colors=new Float32Array(count*6);
  drops.forEach((d,i)=>{colors.set([.63*d.tone,.79*d.tone,.86*d.tone,.91*d.tone,.96*d.tone,d.tone],i*6);});
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  const streaks=new T.LineSegments(geometry,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65,depthWrite:false}));
  streaks.name='rain-streaks';streaks.frustumCulled=false;streaks.raycast=()=>{};root.add(streaks);
  const ringGeometry=new T.RingGeometry(.8,1,12);
  const alphas=new T.InstancedBufferAttribute(new Float32Array(count),1);ringGeometry.setAttribute('impactAlpha',alphas);
  const ringMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{night:{value:0}},
    vertexShader:'attribute float impactAlpha; varying float fade; void main(){fade=impactAlpha; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:'varying float fade; uniform float night; void main(){gl_FragColor=vec4(mix(vec3(.76,.87,.89),vec3(.45,.60,.67),night),fade);}'
  });
  const rings=new T.InstancedMesh(ringGeometry,ringMaterial,count);rings.name='rain-impact-rings';rings.frustumCulled=false;rings.raycast=()=>{};root.add(rings);
  const ray=new T.Raycaster(),normal=new T.Vector3(),forward=new T.Vector3(0,0,1),transform=new T.Object3D();
  const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  function refreshSurfaces(){
    world.updateMatrixWorld(true);
    const surfaces=[world.getObjectByName('ground'),world.getObjectByName('creek'),world.getObjectByName('cottage'),world.getObjectByName('market-stall'),...world.children.filter(o=>o.userData.decorationId)].filter(Boolean);
    for(const drop of drops){
      ray.set(new T.Vector3(drop.x,16,drop.z),new T.Vector3(0,-1,0));
      const hit=ray.intersectObjects(surfaces,true).find(h=>visible(h.object));
      drop.y=hit?hit.point.y:-.08;drop.water=hit?.object.name==='creek';
      normal.set(0,1,0);
      if(hit?.face){normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);if(normal.y<0)normal.negate();}
      drop.normal=normal.clone();
    }
  }
  refreshSurfaces();root.visible=false;
  return {root,streaks,rings,drops,refreshSurfaces,
    setActive(active){root.visible=active;if(active)refreshSurfaces();},
    update(time,night=0){
      if(!root.visible)return;
      ringMaterial.uniforms.night.value=night;streaks.material.opacity=.65-night*.24;
      for(let i=0;i<count;i++){
        const d=drops[i],height=14-d.y,phase=(d.phase+time*d.speed/height)%1;
        const y=d.y+(1-phase)*height,lean=.09+Math.sin(time*.37)*.018;
        positions.set([d.x-lean*(y-d.y),y,d.z,d.x-lean*(y+d.length-d.y),y+d.length,d.z],i*6);
        // The ring follows the previous impact while the next drop starts above.
        const age=phase*height/d.speed,life=d.water?.7:.28,t=Math.min(1,age/life);
        alphas.setX(i,age<life?(1-t)*(d.water?.3:.13):0);
        const radius=(d.water?.06:.025)+t*(d.water?.24:.065);
        transform.position.set(d.x,d.y+.016,d.z);transform.quaternion.setFromUnitVectors(forward,d.normal);transform.scale.setScalar(radius);transform.updateMatrix();rings.setMatrixAt(i,transform.matrix);
      }
      geometry.attributes.position.needsUpdate=true;alphas.needsUpdate=true;rings.instanceMatrix.needsUpdate=true;
    }
  };
}
