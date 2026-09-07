import * as T from "three";

// Local animation illustrates authoritative active events. It never starts an event.
export function createNatureEffects(parent, plots) {
  const root=new T.Group();root.name="active-nature-event";parent.add(root);
  const flood=new T.Group(), drought=new T.Group(), pest=new T.Group();
  root.add(flood,drought,pest);
  const water=new T.MeshStandardMaterial({color:"#76acb0",transparent:true,opacity:.42,roughness:.22});
  const crackMat=new T.LineBasicMaterial({color:"#816848"});
  const flies=[];
  for(const plot of plots) {
    const puddle=new T.Mesh(new T.CircleGeometry(.32,16),water);
    puddle.rotation.x=-Math.PI/2;puddle.scale.y=.72;puddle.position.set(plot.x,.385,plot.z);flood.add(puddle);
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
    setEvent(event){
      const type=event?.phase==="active"?event.type:null;
      flood.visible=type==="flood";drought.visible=type==="drought";pest.visible=type==="pest";
    },
    update(time){if(pest.visible)for(const f of flies)f.mesh.position.set(f.x+Math.sin(time*1.7+f.phase)*.24,.65+Math.sin(time*2+f.phase)*.08,f.z+Math.cos(time*1.4+f.phase)*.24);}
  };
}
