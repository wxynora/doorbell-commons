import * as T from "three";

// Sparse rain circles share one draw, without a shader over the whole water surface.
function createSimpleFloodRipples() {
  const centers=[],unitCircle=[];
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const seed=row*8+col;
    const x=-16.8+col*4.8+Math.sin(seed*7.3)*.9;
    const z=-11.2+row*4.8+Math.cos(seed*4.1)*.8;
    if(z<0&&Math.hypot(x,z)>12.6)continue;
    centers.push({x,z,phase:seed*.61803398875%1});
  }
  for(let segment=0;segment<12;segment++)for(const step of [segment,segment+1]){
    const angle=(step%12)/12*Math.PI*2;
    unitCircle.push(Math.cos(angle),Math.sin(angle));
  }
  const vertices=unitCircle.length/2;
  const positions=new Float32Array(centers.length*vertices*3);
  const colors=new Float32Array(centers.length*vertices*4).fill(1);
  const position=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
  const color=new T.BufferAttribute(colors,4).setUsage(T.DynamicDrawUsage);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',position);geometry.setAttribute('color',color);
  const material=new T.LineBasicMaterial({color:'#cae3e6',vertexColors:true,transparent:true,opacity:.32,depthWrite:false});
  const mesh=new T.LineSegments(geometry,material);
  mesh.name='flood-simple-ripples';mesh.position.y=.414;mesh.renderOrder=1;mesh.frustumCulled=false;
  return {mesh,update(time){
    for(let i=0;i<centers.length;i++){
      const center=centers[i],phase=(time*.42+center.phase)%1;
      const age=Math.min(phase/.52,1),radius=.045+age*.42;
      const alpha=4*age*(1-age);
      for(let j=0;j<vertices;j++){
        const vertex=i*vertices+j;
        positions[vertex*3]=center.x+unitCircle[j*2]*radius;
        positions[vertex*3+2]=center.z+unitCircle[j*2+1]*radius;
        colors[vertex*4+3]=alpha;
      }
    }
    position.needsUpdate=true;color.needsUpdate=true;
  }};
}

// Local animation illustrates authoritative active events. It never starts an event.
export function createNatureEffects(parent, plots, groundPoint) {
  const root=new T.Group();root.name="active-nature-event";parent.add(root);
  const flood=new T.Group(), drought=new T.Group(), pest=new T.Group();
  root.add(flood,drought,pest);
  flood.name='flood-water';
  const water=new T.MeshLambertMaterial({color:"#83bdcc",transparent:true,opacity:.52,depthWrite:false});
  // Same world-space meadow + foreground extent as the surrounding lawn,
  // not just the fenced island. A single surface avoids overlapping water layers.
  const outline=new T.Shape();outline.moveTo(-100,0);outline.lineTo(-14,0);
  for(let i=0;i<=64;i++){const a=Math.PI-i/64*Math.PI;outline.lineTo(Math.cos(a)*14,Math.sin(a)*14);}
  outline.lineTo(100,0);outline.lineTo(100,-200);outline.lineTo(-100,-200);outline.closePath();
  const waterExtent=new T.Group();flood.add(waterExtent);
  const surface=new T.Mesh(new T.ShapeGeometry(outline),water);
  surface.name='flood-continuous-surface';surface.rotation.x=-Math.PI/2;surface.position.y=.406;waterExtent.add(surface);
  const ripples=createSimpleFloodRipples();waterExtent.add(ripples.mesh);
  const puddles=new Map(), swimmers=[];
  let floodKey='';
  const crackMat=new T.LineBasicMaterial({color:"#816848"});
  const flies=[];
  for(const plot of plots) {
    const puddle=new T.Group();
    puddle.name=`flood-plot-${plot.id}`;puddle.position.set(plot.x,.375,plot.z);puddle.visible=false;flood.add(puddle);puddles.set(plot.id,puddle);
    const segments=[];
    for(let i=0;i<4;i++) {
      const angle=i*1.57+.2, r=.08+i*.035;
      segments.push(plot.x,.389,plot.z,plot.x+Math.cos(angle)*r,.389,plot.z+Math.sin(angle)*r);
      segments.push(plot.x+Math.cos(angle)*r,.389,plot.z+Math.sin(angle)*r,plot.x+Math.cos(angle+.4)*.32,.389,plot.z+Math.sin(angle+.4)*.32);
    }
    drought.add(new T.LineSegments(new T.BufferGeometry().setAttribute("position",new T.Float32BufferAttribute(segments,3)),crackMat));
    if(plot.state!=="empty") for(let i=0;i<3;i++) {
      const fly=new T.Mesh(new T.SphereGeometry(.016,5,4),new T.MeshBasicMaterial({color:"#665e38"}));
      pest.add(fly);flies.push({mesh:fly,x:plot.x,z:plot.z,phase:i*2.1+plot.id});
    }
  }
  return {
    setEvent(event,state){
      const type=event?.phase==="active"?event.type:null;
      drought.visible=type==="drought";pest.visible=type==="pest";
      const key=JSON.stringify([type,state??null]);
      if(key===floodKey)return;floodKey=key;
      for(const f of swimmers){f.mesh.removeFromParent();f.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}swimmers.length=0;
      const wet=new Set(state?.plot_ids??[]);
      const targets=plots.filter(p=>wet.has(p.id));
      // Pending fish are farm-wide, not bound to a gameplay plot. Locate their
      // shallow pools on rendered fields without assigning new gameplay state.
      const homes=targets.length?targets:plots;
      for(const [i,entry] of (state?.fish??[]).entries()) {
        if(!homes.length)break;
        const plot=homes[i%homes.length];wet.add(plot.id);
        const mesh=new T.Group();mesh.name=`flood-fish-${entry.id}`;
        const mat=new T.MeshStandardMaterial({color:i%2?'#ba884f':'#577f79',roughness:.45});
        const body=new T.Mesh(new T.SphereGeometry(1,12,8),mat);body.scale.set(.095,.022,.037);mesh.add(body);
        const shape=new T.Shape();shape.moveTo(-.075,0);shape.lineTo(-.15,.05);shape.quadraticCurveTo(-.126,0,-.15,-.05);shape.closePath();
        const tail=new T.Mesh(new T.ShapeGeometry(shape),mat.clone());tail.rotation.x=-Math.PI/2;mesh.add(tail);
        const fin=new T.Mesh(new T.ConeGeometry(.025,.035,3),mat.clone());fin.rotation.z=-.5;fin.position.set(-.008,.018,0);mesh.add(fin);
        for(const z of [-.021,.021]){const eye=new T.Mesh(new T.SphereGeometry(.006,6,4),new T.MeshBasicMaterial({color:'#213a37'}));eye.position.set(.069,.014,z);mesh.add(eye);}
        flood.add(mesh);swimmers.push({mesh,tail,x:plot.x,z:plot.z,phase:i*2.3});
      }
      for(const [id,puddle] of puddles)puddle.visible=wet.has(id);
      flood.visible=type==='flood'||[...puddles.values()].some(p=>p.visible);
      flood.traverse(o=>{o.raycast=()=>{};});
    },
    update(time){
      if(pest.visible)for(const f of flies)f.mesh.position.set(f.x+Math.sin(time*1.7+f.phase)*.24,.65+Math.sin(time*2+f.phase)*.08,f.z+Math.cos(time*1.4+f.phase)*.24);
      if(flood.visible){
        ripples.update(time);
        waterExtent.rotation.y=parent.getObjectByName('foreground-lawn')?.rotation.y??0;
        for(const f of swimmers){const a=time*.65+f.phase;f.mesh.position.set(f.x+Math.cos(a)*.22,.389,f.z+Math.sin(a)*.18);f.mesh.rotation.y=-Math.atan2(Math.cos(a)*.18,-Math.sin(a)*.22);f.tail.rotation.z=Math.sin(time*8+f.phase)*.2;}
      }
    }
  };
}
