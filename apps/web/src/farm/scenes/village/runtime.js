import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCoarseHouseBuilder} from './coarse-house.js';
import {assignVillageLots,riverPoints,terrainHeight,riverProfile,villageBridge} from './plan.js';

// Build one continuous walking network per river bank from the two bridge landings.
// This is geometry planning only, not a new gameplay movement rule.
export function planWalkways(lots,height,river){
 const step=1,nx=193,nz=149,point=id=>[-96+(id%nx)*step,-74+Math.floor(id/nx)*step];
 const local=(l,x,z)=>{const dx=x-l.x,dz=z-l.z,a=l.yaw??0;return [dx*Math.cos(a)-dz*Math.sin(a),dx*Math.sin(a)+dz*Math.cos(a)];};
 const nodes=Array.from({length:nx*nz},(_,id)=>{const [x,z]=point(id),water=river.some(p=>Math.hypot(x-p.x,z-p.z)<4.7),yard=lots.some(l=>{const [u,v]=local(l,x,z);return Math.abs(u)<11.3&&Math.abs(v)<9.3;});return {x,z,h:height(x,z),blocked:water||yard};});
 const wideBlocked=n=>n.blocked||(![villageBridge.start,villageBridge.end].some(p=>Math.hypot(n.x-p[0],n.z-p[1])<5)&& (river.some(p=>Math.hypot(n.x-p.x,n.z-p.z)<6.2)||lots.some(l=>{const [u,v]=local(l,n.x,n.z);return Math.abs(u)<12.2&&Math.abs(v)<10.2;})));
 const nearest=(x,z,wide=false)=>{let best=-1,d=Infinity;for(let i=0;i<nodes.length;i++){const n=nodes[i],q=(n.x-x)**2+(n.z-z)**2;if(!(wide?wideBlocked(n):n.blocked)&&q<d){d=q;best=i;}}return best;};
 function tree(seeds,wide=false){
  const root=Array.isArray(seeds)?seeds[0]:seeds,starts=Array.isArray(seeds)?seeds:[seeds],blocked=n=>wide?wideBlocked(n):n.blocked;const cost=new Float64Array(nodes.length).fill(Infinity),parent=new Int32Array(nodes.length).fill(-1),heap=[];
  const push=(id,c)=>{let i=heap.length;heap.push([id,c]);while(i){const p=(i-1)>>1;if(heap[p][1]<=c)break;heap[i]=heap[p];i=p;}heap[i]=[id,c];};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;if(heap[child][1]>=last[1])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
  for(const id of starts){cost[id]=0;push(id,0);}
  while(heap.length){const [id,c]=pop();if(c!==cost[id])continue;const a=nodes[id],col=id%nx,row=Math.floor(id/nx);
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const cx=col+dx,cz=row+dz;if(cx<0||cx>=nx||cz<0||cz>=nz)continue;const next=cz*nx+cx,b=nodes[next];if(blocked(b)||dx&&dz&&(blocked(nodes[row*nx+cx])||blocked(nodes[cz*nx+col])))continue;const distance=step*Math.hypot(dx,dz),grade=Math.abs(b.h-a.h)/distance;if(grade>.85)continue;let safe=true,prev=a.h;const samples=Math.ceil(distance/.3);for(let k=1;k<=samples;k++){const h=height(a.x+(b.x-a.x)*k/samples,a.z+(b.z-a.z)*k/samples);if(Math.abs(h-prev)/(distance/samples)>.85){safe=false;break;}prev=h;}if(!safe)continue;const candidate=c+distance*(1+grade*grade*32);if(candidate<cost[next]){cost[next]=candidate;parent[next]=id;push(next,candidate);}}
  }return {cost,parent,root};
 }
 const roots=[villageBridge.start,villageBridge.end],paths=[],missing=[],mainPaths=[],mainNodes=[new Set(),new Set()],gates=[],homeGates=[];let maxGrade=0;
 const exits=[[[-78,-8]],[[72,23]]];
 for(let bank=0;bank<2;bank++){
  const root=nearest(...roots[bank],true),trunk=tree(root,true);mainNodes[bank].add(root);paths.push([roots[bank],point(root)]);mainPaths.push(paths.at(-1));
  for(const exit of exits[bank]){let id=nearest(...exit,true);if(!Number.isFinite(trunk.cost[id]))throw new Error(`主路镇口未接通 ${bank}: ${exit}`);const trail=[point(id)];
   while(!mainNodes[bank].has(id)){mainNodes[bank].add(id);id=trunk.parent[id];if(id<0)throw new Error('主路断开');trail.push(point(id));}
   paths.push(trail);mainPaths.push(trail);
  }
 }
 const trees=mainNodes.map(ids=>tree([...ids])),used=mainNodes.map(ids=>new Set(ids));
 const walkable=trail=>{let distance=0;for(let k=1;k<trail.length;k++){const a=trail[k-1],b=trail[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/.35));let prev=height(...a);for(let j=1;j<=steps;j++){const x=a[0]+(b[0]-a[0])*j/steps,z=a[1]+(b[1]-a[1])*j/steps,h=height(x,z);if(length>.01&&Math.abs(h-prev)/(length/steps)>.85)return Infinity;prev=h;}distance+=length;}return distance;};
 for(const lot of [...lots].sort((a,b)=>height(b.x,b.z)-height(a.x,a.z))){const a=lot.yaw??0,world=([u,v])=>[lot.x+u*Math.cos(a)+v*Math.sin(a),lot.z-u*Math.sin(a)+v*Math.cos(a)],gate=world([0,8]),front=world([0,9.5]);
  const approaches=[[],[[-11,9.5]],[[11,9.5]],[[-11,9.5],[-11,0]],[[11,9.5],[11,0]],[[-11,9.5],[-11,-9.5]],[[11,9.5],[11,-9.5]]];let best=null;
  for(const approach of approaches){const way=[gate,front,...approach.map(world)],last=way.at(-1);for(let entry=0;entry<nodes.length;entry++){const n=nodes[entry];if(n.blocked||Math.hypot(n.x-last[0],n.z-last[1])>3)continue;const bank=trees[0].cost[entry]<trees[1].cost[entry]?0:1,t=trees[bank];if(!Number.isFinite(t.cost[entry]))continue;const connector=[...way,point(entry)],length=walkable(connector),score=length+t.cost[entry]*.12;if(Number.isFinite(length)&&(!best||score<best.score))best={entry,bank,connector,score};}}
  if(!best){missing.push(lot.name);continue;}const {entry,bank,connector:trail}=best,t=trees[bank];let id=entry;
  while(!used[bank].has(id)){used[bank].add(id);const next=t.parent[id];if(next<0)break;maxGrade=Math.max(maxGrade,Math.abs(nodes[id].h-nodes[next].h)/Math.hypot(nodes[id].x-nodes[next].x,nodes[id].z-nodes[next].z));trail.push(point(next));id=next;}
  paths.push(trail);gates.push(gate);homeGates.push({doorplate:lot.doorplate,gate,bank,region:lot.region,height:height(lot.x,lot.z)});
 }

 // Collapse the shared grid into junction-to-junction lanes before drawing.
 const graph=new Map(),key=p=>p.map(v=>v.toFixed(4)).join(',');
 const vertex=p=>{const id=key(p);if(!graph.has(id))graph.set(id,{p,links:new Set()});return id;};
 for(const trail of paths)for(let i=1;i<trail.length;i++){const a=vertex(trail[i-1]),b=vertex(trail[i]);if(a!==b){graph.get(a).links.add(b);graph.get(b).links.add(a);}}
 const mainEdges=new Set();for(const trail of mainPaths)for(let i=1;i<trail.length;i++)mainEdges.add([key(trail[i-1]),key(trail[i])].sort().join('|'));
 const terminals=new Set(gates.map(key)),rootKeys=new Set(roots.map(key));
 const parents=new Map(),loads=new Map();
 function countHomes(id,parent){parents.set(id,parent);let homes=terminals.has(id)?1:0;for(const next of graph.get(id).links)if(next!==parent&&!parents.has(next))homes+=countHomes(next,id);loads.set(id,homes);return homes;}
 for(const id of rootKeys)if(graph.has(id)&&!parents.has(id))countHomes(id,null);
 const open=(x,z)=>!river.some(p=>Math.hypot(x-p.x,z-p.z)<4.7)&&!lots.some(l=>{const [u,v]=local(l,x,z);return Math.abs(u)<11.3&&Math.abs(v)<9.3;});
 const safeLine=(a,b,wide=false)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>18)return false;const steps=Math.ceil(length/.25);let prev=height(...a);for(let i=1;i<=steps;i++){const x=a[0]+(b[0]-a[0])*i/steps,z=a[1]+(b[1]-a[1])*i/steps,h=height(x,z);if(!(wide?!wideBlocked({x,z,blocked:!open(x,z)}):open(x,z))||Math.abs(h-prev)/(length/steps)>.4)return false;prev=h;}return true;};
 const simplify=(trail,wide)=>{const result=[trail[0]];for(let i=0;i<trail.length-1;){let next=i+1;for(let j=i+2;j<trail.length;j++){if(Math.hypot(trail[j][0]-trail[i][0],trail[j][1]-trail[i][1])>18)break;if(safeLine(trail[i],trail[j],wide))next=j;}result.push(trail[next]);i=next;}return result;};
 const junction=id=>graph.get(id).links.size!==2||terminals.has(id)||rootKeys.has(id)||new Set([...graph.get(id).links].map(n=>mainEdges.has([id,n].sort().join('|')))).size>1,seen=new Set(),lanes=[],widths=[];
 for(const [id,node] of graph)if(junction(id))for(const neighbor of node.links){const edge=[id,neighbor].sort().join('|');if(seen.has(edge))continue;const trail=[node.p];let previous=id,current=neighbor,homes=0,isMain=mainEdges.has(edge);
  while(true){seen.add([previous,current].sort().join('|'));homes=Math.max(homes,loads.get(parents.get(current)===previous?current:previous)||0);trail.push(graph.get(current).p);if(junction(current))break;const next=[...graph.get(current).links].find(n=>n!==previous);previous=current;current=next;}
  lanes.push(simplify(trail,isMain));widths.push(isMain?3.6:homes>=2?1.8:1.2);
 }
 return {paths:lanes,widths,missing,maxGrade,safeLine,homeGates};
}

export function createVillage(host,{residents,onSelect,environment={season:'spring',weather:'sunny',night:0}}){
 const scene=new T.Scene();scene.background=new T.Color('#dce8e3');scene.fog=new T.Fog('#dce8e3',210,420);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(window.devicePixelRatio);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 // Static overview: one baked shadow pass, no per-frame animation or full household models.
 host.append(renderer.domElement);const camera=new T.PerspectiveCamera(42,1,.1,600);
 camera.position.set(38,40,105);camera.lookAt(-8,4,8);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(-8,4,8);controls.enableDamping=false;controls.enableRotate=true;controls.minPolarAngle=Math.PI/3.2;controls.maxPolarAngle=Math.PI/2.2;
 controls.minDistance=35;controls.maxDistance=250;controls.update();
 const ambient=new T.HemisphereLight('#fff9e9','#76836a',1.5);scene.add(ambient);const sun=new T.DirectionalLight('#fff2d4',2.5);sun.position.set(-55,95,45);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-110,right:110,top:90,bottom:-90,near:1,far:230});sun.shadow.normalBias=.12;sun.shadow.bias=-.0001;scene.add(sun);
 const geometries=[],materials=[],textures=[],batches=new Map();
 const geometry=(g)=>{geometries.push(g);return g;};
 const roofShape=new T.Shape();roofShape.moveTo(-.5,0);roofShape.lineTo(0,1);roofShape.lineTo(.5,0);roofShape.closePath();const gable=geometry(new T.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false}));gable.translate(0,0,-.5);
 const box=geometry(new T.BoxGeometry(1,1,1)),cone=geometry(new T.ConeGeometry(1,1,4)),leaf=geometry(new T.IcosahedronGeometry(1,0));
 const mat=color=>{if(!materials.some(m=>m.color.getHexString()===new T.Color(color).getHexString()))materials.push(new T.MeshStandardMaterial({color,roughness:.94}));return materials.find(m=>m.color.getHexString()===new T.Color(color).getHexString());};
 function add(g,color,x,y,z,sx,sy,sz,ry=0){const m=mat(color),key=g.uuid+color;let b=batches.get(key);if(!b){b={g,m,poses:[]};batches.set(key,b);}b.poses.push({x,y,z,sx,sy,sz,ry});}
 const disk=geometry(new T.CircleGeometry(1,12));disk.rotateX(-Math.PI/2);
 const patchShape=new T.Shape();[[-.5,-.36],[-.28,-.5],[.32,-.48],[.5,-.2],[.46,.36],[.12,.5],[-.5,.42]].forEach(([x,y],i)=>i?patchShape.lineTo(x,y):patchShape.moveTo(x,y));patchShape.closePath();const patch=geometry(new T.ShapeGeometry(patchShape));patch.rotateX(-Math.PI/2);

 const lots=assignVillageLots(residents);
 const curve=new T.CatmullRomCurve3(riverPoints.map(([x,z])=>new T.Vector3(x,riverProfile(x,z).height,z)));
 const creekSamples=curve.getPoints(120);
 const surfaceHeight=(x,z)=>{const nearest=creekSamples.reduce((best,p)=>Math.hypot(p.x-x,p.z-z)<Math.hypot(best.x-x,best.z-z)?p:best,creekSamples[0]);const distance=Math.hypot(nearest.x-x,nearest.z-z);if(distance<5.2)return riverProfile(nearest.x,nearest.z).height-.6;const base=terrainHeight(x,z);
  // A yard has one elevation shared by its house, fence and supporting terrain.
  const support=lots.map(l=>{const dx=x-l.x,dz=z-l.z,yaw=l.yaw??0;return {l,d:Math.max(Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))/13.5,Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))/11.5)};}).filter(p=>p.d<=1).sort((a,b)=>a.d-b.d)[0];
  if(support)return terrainHeight(support.l.x,support.l.z);
  let total=0,delta=0;for(const lot of lots){const dx=x-lot.x,dz=z-lot.z,yaw=lot.yaw??0,lx=Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw)),lz=Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw));const fade=(1-T.MathUtils.smoothstep(lx,13.5,25))*(1-T.MathUtils.smoothstep(lz,11.5,23));const influence=fade/Math.max(.00001,1-fade);total+=influence;delta+=(terrainHeight(lot.x,lot.z)-base)*influence;}return base+delta/(1+total);};
 const terrain=geometry(new T.PlaneGeometry(200,155,72,56));terrain.rotateX(-Math.PI/2);const pos=terrain.attributes.position;
 for(let i=0;i<pos.count;i++)pos.setY(i,surfaceHeight(pos.getX(i),pos.getZ(i)));terrain.computeVertexNormals();const groundMaterial=new T.MeshLambertMaterial({color:'#a8b78a',vertexColors:true});materials.push(groundMaterial);const colors=[];for(let i=0;i<pos.count;i++){const c=new T.Color().setHSL(.24,.36,.36+pos.getY(i)*.003+Math.sin(pos.getX(i)*.05)*.018);colors.push(c.r,c.g,c.b);}terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));groundMaterial.color.set('#ffffff');const groundMesh=new T.Mesh(terrain,groundMaterial);groundMesh.receiveShadow=true;scene.add(groundMesh);


 // A continuous coarse landscape surrounds the detailed town, with the outer edge beyond fog.
 // The first ring copies the existing boundary vertices exactly; distant rings need few faces.
 const perimeter=[];
 for(let i=0;i<72;i++)perimeter.push([-100+i*200/72,-77.5]);
 for(let i=0;i<56;i++)perimeter.push([100,-77.5+i*155/56]);
 for(let i=0;i<72;i++)perimeter.push([100-i*200/72,77.5]);
 for(let i=0;i<56;i++)perimeter.push([-100,77.5-i*155/56]);
 const landscapeHeight=(x,z)=>{const distance=Math.max(Math.abs(x)/100,Math.abs(z)/77.5);const rise=T.MathUtils.smoothstep(distance,1.15,2.8);const base=terrainHeight(x,z)+rise*(16+14*Math.sin(x*.018+z*.013)**2+22*Math.sin(x*.009-z*.023)**2),water=riverProfile(x,z),blend=1-T.MathUtils.smoothstep(water.distance,8,35);return T.MathUtils.lerp(base,Math.min(base,water.height+.7+water.distance*.3),blend);};
 const landV=[],landC=[],landI=[],rings=[1,1.18,1.55,2.2,3.2,5,9];
 for(const scale of rings)for(const [px,pz] of perimeter){const x=px*scale,z=pz*scale,y=scale===1?surfaceHeight(x,z):landscapeHeight(x,z);landV.push(x,y,z);const c=new T.Color().setHSL(.24,.36,.36+y*.003+Math.sin(x*.05)*.018);landC.push(c.r,c.g,c.b);}
 const count=perimeter.length;
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<count;i++){const j=(i+1)%count,a=r*count+i,b=r*count+j,c=(r+1)*count+i,d=(r+1)*count+j;landI.push(a,b,c,b,d,c);}
 const surround=geometry(new T.BufferGeometry());surround.setAttribute('position',new T.Float32BufferAttribute(landV,3));surround.setAttribute('color',new T.Float32BufferAttribute(landC,3));surround.setIndex(landI);surround.computeVertexNormals();const landscape=new T.Mesh(surround,groundMaterial);landscape.receiveShadow=true;scene.add(landscape);
 const groundRay=new T.Raycaster();const distantGround=(x,z)=>{if(x>=-100&&x<100&&z>=-77.5&&z<77.5){const gx=(x+100)*72/200,gz=(z+77.5)*56/155,col=Math.floor(gx),row=Math.floor(gz),u=gx-col,v=gz-row,a=row*73+col,b=a+73,d=a+1,c=b+1,ha=pos.getY(a),hb=pos.getY(b),hc=pos.getY(c),hd=pos.getY(d);return u+v<=1?ha+(hd-ha)*u+(hb-ha)*v:hc+(hb-hc)*(1-u)+(hd-hc)*(1-v);}groundRay.set(new T.Vector3(x,500,z),new T.Vector3(0,-1,0));return groundRay.intersectObjects([groundMesh,landscape])[0]?.point.y??landscapeHeight(x,z);};

 function ribbon(curve,width,color,lift=0,water=false){const pts=curve.getPoints(100),v=[],idx=[];for(let i=0;i<pts.length;i++){const p=pts[i],t=curve.getTangent(i/100),n=new T.Vector3(-t.z,0,t.x).normalize().multiplyScalar(width/2);for(const side of [-1,1]){const x=p.x+n.x*side,z=p.z+n.z*side;v.push(x,(water?riverProfile(p.x,p.z).height:surfaceHeight(x,z))+.5+lift,z);}if(i<pts.length-1){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}const g=geometry(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();scene.add(new T.Mesh(g,mat(color)));}
 ribbon(curve,9,'#d6ceaa',0,true);ribbon(curve,7.4,'#78adb1',.18,true);
 // Keep the existing inhabited river untouched; continue both ends into the distant landscape.
 for(const points of [[[55,-65],[65,-80],[68,-108],[85,-145],[125,-210],[155,-300],[200,-430]],[[-81,39],[-102,49],[-130,68],[-175,84],[-240,116],[-340,160],[-480,225]]]){
  const c=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)));
  const pts=c.getPoints(72),v=[],ix=[];
  for(let i=0;i<pts.length;i++){const p=pts[i],t=c.getTangent(i/72),n=new T.Vector3(-t.z,0,t.x).normalize();for(const side of [-1,1]){const x=p.x+n.x*side*3.7,z=p.z+n.z*side*3.7;v.push(x,riverProfile(p.x,p.z).height+.68,z);}if(i<72){const k=i*2;ix.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const g=geometry(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();scene.add(new T.Mesh(g,mat('#78adb1')));
 }

 const roadSamples=[],stoneVertices=[],stoneColors=[];
 const stoneRand=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
 const pathMaterial=new T.MeshLambertMaterial({color:'#ffffff',vertexColors:true,transparent:true,depthWrite:false});materials.push(pathMaterial);
 function road(points,width=1.6,collect=true){
  const c=points instanceof T.Curve?points:new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)));
  const steps=Math.max(80,Math.ceil(c.getLength()/.7)),pts=c.getSpacedPoints(steps),v=[],colors=[],alpha=[],idx=[];
  // A slightly worn center and soft, uneven shoulders instead of a uniform ribbon.
  for(let i=0;i<pts.length;i++){const p=pts[i],t=c.getTangentAt(i/steps),n=new T.Vector3(-t.z,0,t.x).normalize(),w=width*(1+.12*Math.sin(i*.19)+.06*Math.sin(i*.53));
   for(const [j,side] of [-.72,-.46,0,.46,.72].entries()){const x=p.x+n.x*side*w,z=p.z+n.z*side*w;v.push(x,distantGround(x,z)+.12,z);const col=new T.Color(j===2?'#9d9b88':'#b4b29b');colors.push(col.r,col.g,col.b);alpha.push(j===0||j===4?0:1);}
   if(i<steps){const q=pts[i+1],h=distantGround(p.x,p.z),next=distantGround(q.x,q.z),length=p.distanceTo(q);
    if(Math.abs(next-h)/Math.max(.01,length)>.4){const mx=(p.x+q.x)/2,mz=(p.z+q.z)/2,top=Math.max(h,next)+.14,base=Math.min(h,next)-.08;add(box,'#b8b29d',mx,(top+base)/2,mz,width*.95,top-base,length+.08,Math.atan2(q.x-p.x,q.z-p.z));}
    else for(let j=0;j<4;j++){const k=i*5+j;idx.push(k,k+1,k+5,k+1,k+6,k+5);}
   }
   if(collect){const sample=p.clone();sample.userData={tangent:t.clone(),width,height:distantGround(p.x,p.z)};roadSamples.push(sample);}
  }
  // Flat irregular stone faces follow the terrain; all paths share one mesh.
  const stoneSteps=Math.ceil(c.getLength()/.82),stoneLanes=Math.max(3,Math.round(width/.55));
  for(let k=0;k<stoneSteps;k++)for(let lane=0;lane<stoneLanes;lane++){
   const seed=k*13+lane*97+Math.round(pts[0].x*31+pts[0].z*17),u=Math.min(.999,(k+.2+stoneRand(seed)*.55)/stoneSteps),p=c.getPointAt(u),t=c.getTangentAt(u),n=new T.Vector3(-t.z,0,t.x).normalize();
   const side=(lane-(stoneLanes-1)/2)*width*.9/stoneLanes+(stoneRand(seed+9)-.5)*.12,x=p.x+n.x*side,z=p.z+n.z*side;
   if(Math.abs(distantGround(x+t.x*.4,z+t.z*.4)-distantGround(x-t.x*.4,z-t.z*.4))/.8>.4)continue;
   const col=new T.Color(['#c5c1aa','#b5b3a2','#d3ccb5','#aaa997'][Math.floor(stoneRand(seed+6)*4)]),ring=[];
   for(let j=0;j<6;j++){const a=j*Math.PI/3+.2,r=.8+stoneRand(seed+j+20)*.2;ring.push([x+Math.cos(a)*width*.44/stoneLanes*r,z+Math.sin(a)*.35*r]);}
   for(let j=1;j<5;j++)for(const [sx,sz] of [ring[0],ring[j],ring[j+1]]){stoneVertices.push(sx,distantGround(sx,sz)+.145,sz);stoneColors.push(col.r,col.g,col.b);}
  }
  const g=geometry(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(v,3));
  // RGBA vertex color gives the verge a feathered edge without textures or extra draw passes.
  const rgba=[];for(let i=0;i<alpha.length;i++)rgba.push(...colors.slice(i*3,i*3+3),alpha[i]);g.setAttribute('color',new T.Float32BufferAttribute(rgba,4));g.setIndex(idx);g.computeVertexNormals();const mesh=new T.Mesh(g,pathMaterial);mesh.receiveShadow=true;scene.add(mesh);
 }
 const network=planWalkways(lots,distantGround,creekSamples);
 if(network.missing.length)throw new Error('上坡路线尚未接通：'+network.missing.join('、'));
 for(const [laneIndex,points] of network.paths.entries()){
  const c=new T.CurvePath(),vectors=points.map(([x,z])=>new T.Vector3(x,0,z));let last=vectors[0];
  // Round each safe grid corner locally; never smooth across an entire hill or garden.
  for(let i=1;i<vectors.length-1;i++){const corner=vectors[i],radius=Math.min(2.8,corner.distanceTo(vectors[i-1])*.35,corner.distanceTo(vectors[i+1])*.35),before=corner.clone().lerp(vectors[i-1],radius/corner.distanceTo(vectors[i-1])),after=corner.clone().lerp(vectors[i+1],radius/corner.distanceTo(vectors[i+1]));
   const bend=new T.QuadraticBezierCurve3(before,corner,after),samples=bend.getPoints(12),safe=samples.slice(1).every((p,j)=>network.safeLine([samples[j].x,samples[j].z],[p.x,p.z],network.widths[laneIndex]>3));
   if(safe){c.add(new T.LineCurve3(last,before));c.add(bend);last=after;}else{c.add(new T.LineCurve3(last,corner));last=corner;}}
  c.add(new T.LineCurve3(last,vectors.at(-1)));road(c,network.widths[laneIndex]);
 }
 const buildHouse=createCoarseHouseBuilder(geometry);
 const clickTargets=[],labels=[];const labelLayer=document.createElement('div');labelLayer.className='village-labels';host.append(labelLayer);
 const worldAdd=add;
 for(const lot of lots){
  const {x,z}=lot,y=terrainHeight(x,z),yaw=lot.yaw??0;
  const style=lot.style??'classic';
  const add=(g,c,px,py,pz,sx,sy,sz,rotation=0)=>{
   const dx=px-x,dz=pz-z;
   worldAdd(g,c,x+dx*Math.cos(yaw)+dz*Math.sin(yaw),py,z-dx*Math.sin(yaw)+dz*Math.cos(yaw),sx,sy,sz,rotation+yaw);
  };
  add(patch,'#b1bc8c',x,y+.25,z,22,1,18);
  add(disk,'#88956d',x-3.5,y+.32,z-1,5.2,1,4.3);
  buildHouse(lot,(g,c,u,h,v,w,hh,d,angle)=>add(g,c,x+u,y+h,z+v,w,hh,d,angle));
  const stone='#b6a486';
  // Place the shared gardens around the house entrance, with terrain-specific shapes.
  if(lot.region==='slope'){
   for(const v of [.85,3.2,5.55]){
    add(box,stone,x+5,y+.22,z+v,6.48,.44,1.72);
    add(box,'#927650',x+5,y+.46,z+v,6.16,.12,1.39);
    add(box,'#819c60',x+5,y+.57,z+v,5.51,.18,.51);
   }
  }else if(lot.region==='bridge'){
   for(const [u,v] of [[3.85,2.45],[6.45,4.4],[4.2,5.67]]){
    add(disk,'#927650',x+u,y+.33,z+v,1.33,1,.92);
    for(const dx of [-.53,.53])add(leaf,'#819a60',x+u+dx,y+.57,z+v,.55,.37,.53);
    add(leaf,'#edc3d0',x+u,y+.66,z+v,.42,.27,.35);
   }
  }else{
   add(patch,'#927650',x+5.25,y+.34,z+3.45,6.7,1,6.13);
   for(let i=0;i<3;i++)add(box,'#819c60',x+5.18,y+.44,z+1.58+i*1.67,5.7,.18,.62);
  }
  const fencePoints=[[-10,-6],[-7,-8],[8,-8],[10,-3],[9,7],[2,8]];
  function fence(ax,az,bx,bz){const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);for(const h of [.65,1.15])add(box,'#ad9f7a',x+(ax+bx)/2,y+h,z+(az+bz)/2,.16,.16,length,angle);const count=Math.ceil(length/4);for(let i=0;i<=count;i++)add(box,'#998967',x+ax+dx*i/count,y+.8,z+az+dz*i/count,.28,1.6,.28);}
  for(let i=0;i<fencePoints.length-1;i++)fence(...fencePoints[i],...fencePoints[i+1]);fence(-2,8,-10,6);fence(-10,6,-10,-6);
  const doorX=style==='rose_cottage'?-3.48:style==='stump'?-3.4:-2.8;
  const doorZ=style==='rose_cottage'?3.86:style==='stump'?1.78:1.35;
  for(let i=0;i<6;i++){
   const t=(i+.45)/6;
   add(patch,'#d0c5a1',x+doorX*(1-t)**1.4,y+.38,z+doorZ+(8.0-doorZ)*t,1.34,1,.83,i*.09);
  }
  add(patch,'#d0c5a1',x,y+.37,z+8.12,2.0,1,1.32);
  add(box,'#917b58',x+1.21,y+.7,z+8,.21,1.4,.22);
  for(const [dx,dz] of [[-8,-5],[7,-6]]){add(box,'#8a7755',x+dx,y+1,z+dz,.35,2,.35);add(leaf,'#819a60',x+dx,y+2.7,z+dz,1.6,2,1.6);}
  const hit=new T.Mesh(new T.BoxGeometry(20,14,16),new T.MeshBasicMaterial({visible:false}));geometries.push(hit.geometry);materials.push(hit.material);hit.position.set(x,y+7,z);hit.rotation.y=yaw;hit.userData.lot=lot;scene.add(hit);clickTargets.push(hit);
  const b=document.createElement('button');
  b.type='button';b.textContent=lot.name;b.className='village-name';
  b.addEventListener('click',()=>onSelect(lot));labelLayer.append(b);
  const labelX=0,labelZ=6.8;
  labels.push({node:b,point:new T.Vector3(
   x+labelX*Math.cos(yaw)+labelZ*Math.sin(yaw),y+1.8,
   z-labelX*Math.sin(yaw)+labelZ*Math.cos(yaw))});
 }
 // Broad low-poly canopies and river-bank shrubs share instance batches.
 const riverSamples=curve.getPoints(100),rand=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
 const crown=geometry(new T.SphereGeometry(1,8,5)),pine=geometry(new T.ConeGeometry(1,1,7));
 function broadTree(x,y,z,h=1){
  add(box,'#867454',x,y+2*h,z,.5*h,4*h,.5*h);
  add(crown,'#769b61',x,y+4.8*h,z,3*h,2.1*h,2.7*h);
  add(crown,'#a1bb7c',x-1.7*h,y+4*h,z+.5*h,2*h,1.5*h,2*h);
  add(crown,'#a1bb7c',x+1.6*h,y+4.3*h,z-.4*h,1.8*h,1.6*h,1.9*h);
 }
 const groves=[[-80,-42],[-54,-32],[78,-32],[2,-16],[-77,12],[-51,57],[77,60]],treeCenters=[];
 for(let i=0;i<100;i++){const center=groves[i%groves.length],angle=rand(i*2)*Math.PI*2,radius=Math.sqrt(rand(i*2+1))*15,x=center[0]+Math.cos(angle)*radius,z=center[1]+Math.sin(angle)*radius;if(Math.abs(x)>94||Math.abs(z)>72)continue;if(lots.some(l=>{const dx=x-l.x,dz=z-l.z,a=l.yaw??0,u=dx*Math.cos(a)-dz*Math.sin(a),v=dx*Math.sin(a)+dz*Math.cos(a);return Math.abs(u)<12&&Math.abs(v)<10||Math.abs(u)<5&&v>=10&&v<18;}))continue;if(treeCenters.some(p=>Math.hypot(p[0]-x,p[1]-z)<6)||riverSamples.some(p=>Math.hypot(p.x-x,p.z-z)<7.5)||roadSamples.some(p=>Math.hypot(p.x-x,p.z-z)<p.userData.width*.72+2.1))continue;treeCenters.push([x,z]);const y=distantGround(x,z);
  add(disk,'#8b9a70',x+.5,y+.2,z+.5,3,1,2.5);
  if(i%5===0){add(box,'#867454',x,y+2,z,.5,4,.5);add(pine,'#456e56',x,y+4,z,2.7,5,2.7);add(pine,'#567e61',x,y+6,z,1.9,3.6,1.9);}
  else broadTree(x,y,z,.75+rand(i+123)*.25);
 }
 // Small grouped undergrowth breaks up the open grass without covering paths or gardens.
 for(let i=0;i<160;i++){const x=(rand(i+4000)-.5)*184,z=(rand(i+4400)-.5)*145;if(lots.some(l=>Math.abs(l.x-x)<12&&Math.abs(l.z-z)<10)||riverSamples.some(p=>Math.hypot(p.x-x,p.z-z)<6)||roadSamples.some(p=>Math.hypot(p.x-x,p.z-z)<p.userData.width*.72+1))continue;const y=distantGround(x,z);
  if(i%3===0){for(let j=0;j<3;j++){const dx=(j-1)*.8;add(crown,'#789460',x+dx,y+.6,z,1,.65,.8);add(crown,i%2?'#edc3d0':'#f2e0b1',x+dx,y+1.1,z,.5,.23,.45);}}
  else {for(let j=0;j<3;j++)add(pine,'#829a62',x+j*.35,y+.4,z+j*.2,.35,.8+rand(i+j)*.5,.35);}
 }
 // Irregular meadow edges and exposed slope-foot stone groups give open land a purpose.
 const edges=[[-77,-5],[-57,-7],[-24,-9],[5,-18],[28,-23],[49,50],[-50,50],[4,54]];
 for(let i=0;i<120;i++){const center=edges[i%edges.length],angle=rand(i+9200)*Math.PI*2,r=4+rand(i+9400)*9,x=center[0]+Math.cos(angle)*r,z=center[1]+Math.sin(angle)*r*.55;
  if(lots.some(l=>Math.abs(l.x-x)<12&&Math.abs(l.z-z)<10)||roadSamples.some(p=>Math.hypot(p.x-x,p.z-z)<p.userData.width*.72+1.6)||riverSamples.some(p=>Math.hypot(p.x-x,p.z-z)<6))continue;
  const y=distantGround(x,z),slope=Math.hypot(surfaceHeight(x+1,z)-surfaceHeight(x-1,z),surfaceHeight(x,z+1)-surfaceHeight(x,z-1));
  if(slope>1.2){add(leaf,i%2?'#a19e89':'#b3b7a0',x,y+.35,z,1.8+rand(i)*1.5,.7+rand(i+3)*.8,1.3);add(crown,'#789460',x+.8,y+.7,z+.8,1.3,.65,1);}
  else {add(crown,'#789460',x,y+.6,z,1.6,.8,1.2);if(i%3===0)add(crown,'#f2e0b1',x,y+1.2,z,.65,.2,.5);}
 }
 // Distant woodland uses the same instanced canopy geometry, no individual leaves or lights.
 const distantTrees=[];
 for(let i=0;i<125;i++){const grove=i%11,baseAngle=rand(grove+910)*Math.PI*2,baseRadius=1.16+rand(grove+1910)*.85,offsetAngle=rand(i+3910)*Math.PI*2,offsetRadius=Math.sqrt(rand(i+4910))*22,x=Math.cos(baseAngle)*112*baseRadius+Math.cos(offsetAngle)*offsetRadius,z=Math.sin(baseAngle)*91*baseRadius+Math.sin(offsetAngle)*offsetRadius;
  if((x>48&&x<100&&z<-60)||(x<-78&&z>30&&z<95))continue;
  if(distantTrees.some(p=>Math.hypot(p[0]-x,p[1]-z)<9))continue;distantTrees.push([x,z]);
  const y=distantGround(x,z),h=5+rand(i+2910)*4;
  add(box,'#867454',x,y+h*.24,z,.65,h*.48,.65);
  add(crown,'#769b61',x,y+h*.65,z,4.1,h*.38,3.5);
  add(crown,'#a1bb7c',x-2.1,y+h*.52,z+.6,2.7,h*.26,2.6);
 }
 riverSamples.forEach((p,i)=>{if(i%2)return;const t=curve.getTangent(i/100),side=i%4?1:-1,x=p.x-t.z*5.8*side,z=p.z+t.x*5.8*side;if(lots.some(l=>Math.abs(l.x-x)<11&&Math.abs(l.z-z)<9))return;const y=distantGround(x,z);add(leaf,'#b3b7a0',x,y+.45,z,.8,.45,.6);add(leaf,'#789460',x+side,y+.8,z,1.2,.8,1);});
 // The bridge, stone approaches and paths share the same two dry-bank landings.
 const {start:[startX,bridgeStart],end:[endX,bridgeEnd],width:bridgeWidth}=villageBridge;
 const bridgeX=z=>T.MathUtils.lerp(startX,endX,(z-bridgeStart)/(bridgeEnd-bridgeStart));
 const startHeight=distantGround(startX,bridgeStart)+.12,endHeight=distantGround(endX,bridgeEnd)+.12;
 const bridgeHeight=z=>{
  const t=T.MathUtils.clamp((z-bridgeStart)/(bridgeEnd-bridgeStart),0,1);
  return T.MathUtils.lerp(startHeight,endHeight,t)+Math.sin(Math.PI*t)**2*.48;
 };
 // Close each prism rather than leaving a thin floating plank at the bank.
 const bridgeBatches=new Map();
 function bridgePrism(x,width,z0,z1,y0,y1,depth,color){
  if(!bridgeBatches.has(color))bridgeBatches.set(color,{positions:[],indices:[]});
  const batch=bridgeBatches.get(color),offset=batch.positions.length/3;
  const x0=bridgeX(z0)+x+2,x1=bridgeX(z1)+x+2;
  batch.positions.push(
   x0-width/2,y0,z0,x0+width/2,y0,z0,x1-width/2,y1,z1,x1+width/2,y1,z1,
   x0-width/2,y0-depth,z0,x0+width/2,y0-depth,z0,x1-width/2,y1-depth,z1,x1+width/2,y1-depth,z1
  );
  batch.indices.push(...[0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5].map(i=>i+offset));
 }
 bridgePrism(-2,bridgeWidth+.45,13.5,29.5,bridgeHeight(13.5)-.15,bridgeHeight(29.5)-.15,.25,'#806b4c');
 for(let i=0;i<25;i++){
  const z0=13.5+i*16/25,z1=13.5+(i+1)*16/25-.025;
  bridgePrism(-2,bridgeWidth,z0,z1,bridgeHeight(z0),bridgeHeight(z1),.17,i%4===0?'#bca179':'#b49b73');
 }
 // Broad stone sills turn into the path, with no vertical step at either end.
 for(const [z0,z1] of [[bridgeStart,13.5],[29.5,bridgeEnd]]){
  const steps=4;
  for(let i=0;i<steps;i++){
   const a=T.MathUtils.lerp(z0,z1,i/steps),b=T.MathUtils.lerp(z0,z1,(i+1)/steps);
   const width=bridgeWidth+.22+Math.abs((a-22.2)/8.8)*.75;
   bridgePrism(-2,width,a,b,bridgeHeight(a),bridgeHeight(b),.3,'#b6af97');
  }
 }
 for(const side of [-1,1]){
  const x=-2+side*(bridgeWidth/2+.04);
  const posts=[13.75,16.85,19.95,23.05,26.15,29.25];
  for(const z of posts)add(box,'#827455',bridgeX(z)+x+2,bridgeHeight(z)+.55,z,.22,1.18,.22);
  for(let i=1;i<posts.length;i++)for(const h of [.46,1.03])
   bridgePrism(x,.14,posts[i-1],posts[i],bridgeHeight(posts[i-1])+h,bridgeHeight(posts[i])+h,.14,'#8e7c58');
  for(const z of [14.1,29]){
   const supportX=bridgeX(z)+x+2,bottom=distantGround(supportX,z)-.12,top=bridgeHeight(z)-.17;
   add(box,'#a09d87',supportX,(top+bottom)/2,z,.65,Math.max(.25,top-bottom),.85);
  }
 }
 for(const [color,batch] of bridgeBatches){
  const g=geometry(new T.BufferGeometry());
  g.setAttribute('position',new T.Float32BufferAttribute(batch.positions,3));g.setIndex(batch.indices);g.computeVertexNormals();
  add(g,color,0,0,0,1,1,1);
 }
 // A small shared meeting place, offset from the bridge's through-route.
 const plazaX=-7,plazaZ=38,plazaY=distantGround(plazaX,plazaZ);
 add(disk,'#ccbf9e',plazaX,plazaY+.12,plazaZ,5.3,1,4.2);
 broadTree(-10,distantGround(-10,36),36,1.4);
 for(const [x,z,angle] of [[-9,40,0],[-4,38,Math.PI/2]]){const y=distantGround(x,z);
  add(box,'#94825f',x,y+1,z,3,.23,.8,angle);
  add(box,'#94825f',x-Math.sin(angle)*.35,y+1.65,z-Math.cos(angle)*.35,3,.6,.16,angle);
  for(const side of [-1,1])add(box,'#7f7157',x+Math.cos(angle)*side*1.1,y+.5,z-Math.sin(angle)*side*1.1,.2,1,.65,angle);
 }
 const boardY=distantGround(-12,41);
 for(const x of [-13.2,-10.8])add(box,'#7f7157',x,boardY+1.6,41,.23,3.2,.23);
 add(box,'#917b58',-12,boardY+2.2,41,2.8,1.8,.25);
 add(gable,'#67998b',-12,boardY+3.1,41,3.2,.6,.9);
 for(const [dx,dy,c] of [[-.7,0,'#eee4c9'],[.1,.1,'#d5ddc1'],[.7,-.2,'#e9d3b8']])add(box,c,-12+dx,boardY+2.2+dy,41.15,.55,.85,.04);
 road([[1,31],[-1,33.5],[-4,36.3],[-7,38]],1.3,false);
 road([[-7,38],[-11,36],[-14,34]],.95,false);
 for(const [x,z] of [[-5,19],[1,29],[-3,42]]){const y=distantGround(x,z);add(box,'#6e715b',x,y+1.8,z,.2,3.6,.2);add(box,'#e6d8ab',x,y+3.8,z,.6,.8,.6);add(cone,'#7c8062',x,y+4.35,z,.6,.4,.6,Math.PI/4);}
 // Small directional signs stand beside the road, never in its walking width.
 const arrowShape=new T.Shape();
 [[-1.45,-.34],[.92,-.34],[1.56,0],[.92,.34],[-1.45,.34]].forEach(([x,y],i)=>i?arrowShape.lineTo(x,y):arrowShape.moveTo(x,y));arrowShape.closePath();
 const arrowBoard=geometry(new T.ExtrudeGeometry(arrowShape,{depth:.16,bevelEnabled:false}));arrowBoard.translate(0,0,-.08);
 const signCanvas=document.createElement('canvas');signCanvas.width=128;signCanvas.height=192;
 const signContext=signCanvas.getContext('2d');
 signContext.fillStyle='#5b4734';signContext.textAlign='center';signContext.textBaseline='middle';signContext.font='700 38px "Songti SC",serif';
 const signNames=['河湾','坡上','桥头'];signNames.forEach((name,i)=>signContext.fillText(name,64,i*64+32));
 const signTexture=new T.CanvasTexture(signCanvas);signTexture.colorSpace=T.SRGBColorSpace;textures.push(signTexture);
 const signPositions=[],signUV=[],signIndices=[];
 const destinations={
  river:{x:-34,z:18,row:0},slope:{x:-32,z:-28,row:1},bridge:{x:2,z:22,row:2}
 };
 function signWriting(x,y,z,angle,row){
  for(const side of [-1,1]){
   const index=signPositions.length/3;
   const corners=[[-1.21,-.25],[.66,-.25],[-1.21,.25],[.66,.25]];
   for(const [u,v] of corners){
    const xx=u*side,zz=.087*side;
    signPositions.push(x+xx*Math.cos(angle)+zz*Math.sin(angle),y+v,z-xx*Math.sin(angle)+zz*Math.cos(angle));
   }
   const top=1-row/3,bottom=1-(row+1)/3;
   signUV.push(0,bottom,1,bottom,0,top,1,top);
   if(side===1)signIndices.push(index,index+1,index+2,index+1,index+3,index+2);
   else signIndices.push(index,index+2,index+1,index+1,index+2,index+3);
  }
 }
 const signStations=[];
 for(const [targetX,targetZ,regions] of [[4,33,['bridge','river']],[1,12,['slope','bridge']],[-28,-23,['river','slope']],[36,15,['bridge','slope']]]){
  const path=roadSamples.reduce((best,p)=>Math.hypot(p.x-targetX,p.z-targetZ)<Math.hypot(best.x-targetX,best.z-targetZ)?p:best,roadSamples[0]);
  const normal=new T.Vector3(-path.userData.tangent.z,0,path.userData.tangent.x).normalize();
  const choices=[1,-1].map(side=>({x:path.x+normal.x*side*(path.userData.width*.72+1.3),z:path.z+normal.z*side*(path.userData.width*.72+1.3)}));
  const place=choices.find(p=>!lots.some(l=>{const dx=p.x-l.x,dz=p.z-l.z,a=l.yaw??0;return Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<11&&Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<9;})&&riverSamples.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>5.5));
  if(!place||signStations.some(p=>Math.hypot(p.x-place.x,p.z-place.z)<9))continue;
  signStations.push(place);const {x,z}=place,y=distantGround(x,z);
  add(box,'#917b58',x,y+1.32,z,.22,2.64,.22);
  add(leaf,'#819a60',x-.1,y+.18,z+.08,.47,.22,.35);
  regions.forEach((region,i)=>{
   const target=destinations[region],angle=-Math.atan2(target.z-z,target.x-x),h=y+2.32-i*.78;
   add(arrowBoard,i?'#b39a6d':'#c3aa7a',x,h,z,1,1,1,angle);
   signWriting(x,h,z,angle,target.row);
  });
 }
 const writingGeometry=geometry(new T.BufferGeometry());
 writingGeometry.setAttribute('position',new T.Float32BufferAttribute(signPositions,3));writingGeometry.setAttribute('uv',new T.Float32BufferAttribute(signUV,2));writingGeometry.setIndex(signIndices);
 const writingMaterial=new T.MeshBasicMaterial({map:signTexture,transparent:true,alphaTest:.08,depthWrite:false,side:T.DoubleSide});materials.push(writingMaterial);
 scene.add(new T.Mesh(writingGeometry,writingMaterial));
 // Bend-specific stone shelves and reed beds rather than an evenly decorated shoreline.
 for(const [fraction,side] of [[.2,-1],[.43,1],[.74,-1],[.9,1]]){const p=curve.getPoint(fraction),t=curve.getTangent(fraction),n=new T.Vector3(-t.z,0,t.x);
  for(let j=0;j<14;j++){const along=(rand(j+fraction*900)-.5)*9,offset=(4.5+rand(j+100)*1.7)*side,x=p.x+t.x*along+n.x*offset,z=p.z+t.z*along+n.z*offset;
   if(lots.some(l=>Math.abs(l.x-x)<12&&Math.abs(l.z-z)<10)||roadSamples.some(q=>Math.hypot(q.x-x,q.z-z)<q.userData.width*.72+.6))continue;
   const y=distantGround(x,z);
   if(side<0)add(leaf,j%2?'#b3b7a0':'#c8c3ac',x,y+.16,z,.5+rand(j)*.7,.22,.4+rand(j+3)*.5);
   else for(let k=0;k<3;k++){const h=1+rand(j+k)*.7;add(box,'#829a62',x+k*.2,y+h/2,z+k*.15,.07,h,.07);add(leaf,'#927650',x+k*.2,y+h,z+k*.15,.12,.26,.12);}
  }
 }
 const lampSites=[[-5,19],[1,29],[-3,42]];
 for(let i=8;i<roadSamples.length;i+=13){const p=roadSamples[i],t=p.userData.tangent,side=(i%2?1:-1),offset=p.userData.width*.72+1,x=p.x-t.z*offset*side,z=p.z+t.x*offset*side;
  if(roadSamples.some(q=>Math.hypot(q.x-x,q.z-z)<q.userData.width*.72+.4)||lampSites.some(q=>Math.hypot(q[0]-x,q[1]-z)<15)||lots.some(l=>Math.abs(l.x-x)<11&&Math.abs(l.z-z)<9)||riverSamples.some(q=>Math.hypot(q.x-x,q.z-z)<5.2))continue;
  lampSites.push([x,z]);const y=distantGround(x,z);
  add(box,'#6e715b',x,y+2.1,z,.22,4.2,.22);add(box,'#7f7157',x,y+.25,z,.55,.5,.55);
  add(box,'#6e715b',x,y+4.25,z,.85,.18,.85);add(box,'#e6d8ab',x,y+4.65,z,.6,.7,.6);
  add(cone,'#6e715b',x,y+5.12,z,.7,.35,.7,Math.PI/4);
 }
 const stones=geometry(new T.BufferGeometry());stones.setAttribute('position',new T.Float32BufferAttribute(stoneVertices,3));stones.setAttribute('color',new T.Float32BufferAttribute(stoneColors,3));stones.computeVertexNormals();const stoneMaterial=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});materials.push(stoneMaterial);const stoneMesh=new T.Mesh(stones,stoneMaterial);stoneMesh.receiveShadow=true;scene.add(stoneMesh);
 for(const b of batches.values()){const mesh=new T.InstancedMesh(b.g,b.m,b.poses.length);const o=new T.Object3D();b.poses.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.scale.set(p.sx,p.sy,p.sz);o.rotation.y=p.ry;o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});mesh.computeBoundingSphere();mesh.castShadow=b.g!==disk&&b.g!==patch;mesh.receiveShadow=true;scene.add(mesh);}

 // All lamp pools share one mesh; vertex alpha fades into the actual ground without dynamic lights.
 const poolPositions=[],poolColors=[],poolIndices=[],poolRings=[0,1.2,2.8,4.2],opacity=[.68,.42,.13,0];
 const warmPools=[...lampSites.map(([x,z])=>[x,z,1,1]),...lots.map(l=>{const a=l.yaw??0,u=-2.8,v=4;return [l.x+u*Math.cos(a)+v*Math.sin(a),l.z-u*Math.sin(a)+v*Math.cos(a),.85,.78];})];
 for(const [x,z,radius,strength] of warmPools){const offset=poolPositions.length/3;for(let r=0;r<poolRings.length;r++)for(let i=0;i<20;i++){const angle=i/20*Math.PI*2,px=x+Math.cos(angle)*poolRings[r]*radius,pz=z+Math.sin(angle)*poolRings[r]*radius;poolPositions.push(px,distantGround(px,pz)+.2,pz);poolColors.push(1,.66,.28,opacity[r]*strength);}for(let r=0;r<3;r++)for(let i=0;i<20;i++){const a=offset+r*20+i,b=offset+r*20+(i+1)%20,c=a+20,d=b+20;poolIndices.push(a,c,b,b,c,d);}}
 const poolGeometry=geometry(new T.BufferGeometry());poolGeometry.setAttribute('position',new T.Float32BufferAttribute(poolPositions,3));poolGeometry.setAttribute('color',new T.Float32BufferAttribute(poolColors,4));poolGeometry.setIndex(poolIndices);
 const poolMaterial=new T.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide});materials.push(poolMaterial);
 const lampPools=new T.Mesh(poolGeometry,poolMaterial);lampPools.renderOrder=2;scene.add(lampPools);
 const baseColors=new Map(materials.filter(m=>m.color).map(m=>[m,m.color.clone()]));
 const seasonColors={spring:['#a9bf78','#93b66e','#b3ca87'],summer:['#9db868','#638948','#81a558'],autumn:['#c6b17c','#c88c48','#e4b467'],winter:['#e2e8e4','#b4c7bd','#dce5df']};
 const precipitationGeometry=geometry(new T.BufferGeometry()),weatherPositions=new Float32Array(480*3);
 for(let i=0;i<480;i++)weatherPositions.set([(rand(i+5100)-.5)*230,rand(i+6100)*70,(rand(i+7100)-.5)*170],i*3);
 const weatherFloor=Array.from({length:480},(_,i)=>surfaceHeight(weatherPositions[i*3],weatherPositions[i*3+2]));
 precipitationGeometry.setAttribute('position',new T.BufferAttribute(weatherPositions,3));
 const weatherMaterial=new T.PointsMaterial({color:'#e6eff2',size:.25,transparent:true,opacity:.65,depthWrite:false});materials.push(weatherMaterial);
 const precipitation=new T.Points(precipitationGeometry,weatherMaterial);precipitation.frustumCulled=false;scene.add(precipitation);
 const rainPositions=new Float32Array(480*6),rainColors=new Float32Array(480*8);
 for(let i=0;i<480;i++){
  rainColors.set([.79,.88,.96,.14,.86,.94,1,.93],i*8);
 }
 const rainGeometry=geometry(new T.BufferGeometry());
 rainGeometry.setAttribute('position',new T.BufferAttribute(rainPositions,3));
 rainGeometry.setAttribute('color',new T.BufferAttribute(rainColors,4));
 const rainMaterial=new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.78,depthWrite:false,toneMapped:false});
 materials.push(rainMaterial);
 const rain=new T.LineSegments(rainGeometry,rainMaterial);rain.frustumCulled=false;scene.add(rain);
 let weatherMotion=false,weatherSnow=false,rainLength=2.1,lastWeatherFrame=0;
 function updateRain(){
  for(let i=0;i<480;i++){
   const k=i*3,j=i*6,y=weatherPositions[k+1],length=rainLength*(.8+rand(i+3200)*.4);
   const x=weatherPositions[k]+(y-weatherFloor[i])*.16,z=weatherPositions[k+2];
   rainPositions.set([x+.16*length,y+length,z-.08*length,x,y,z],j);
  }
  rainGeometry.attributes.position.needsUpdate=true;
 }
 function setEnvironment(value){
  const palette=seasonColors[value.season]??seasonColors.summer,night=value.night??0,weather=value.weather;
  const rainy=['light_rain','heavy_rain','thunderstorm','freezing_rain'].includes(weather),snowy=['light_snow','blizzard'].includes(weather),overcast=rainy||snowy||['cloudy','fog'].includes(weather);
  for(const [m,base] of baseColors){m.color.copy(base);const hex=base.getHexString();
   if(['6f8c59','819a60','789460','758b59'].includes(hex))m.color.set(palette[1]);
   if(['8ba16a','819c60'].includes(hex))m.color.set(palette[2]);
   if(['769b61','a1bb7c'].includes(hex))m.color.set(value.season==='spring'?(hex==='769b61'?'#efb5c8':'#f9d8e2'):palette[hex==='769b61'?1:2]);
   if(['456e56','567e61'].includes(hex)&&value.season==='winter')m.color.lerp(new T.Color('#d2dfd7'),.5);
   if(['edc3d0','f2e0b1'].includes(hex)&&value.season==='winter')m.color.set('#e2e8e4');
   if(['b1bc8c','88956d','8b9a70'].includes(hex))m.color.set(palette[0]);
   if(value.season==='winter'&&['67998b','bd8583','7a93a8','b8a274','927661','ba8584'].includes(hex))m.color.lerp(new T.Color('#edf1ed'),.8);
   if(m.emissive){m.emissive.set('#000000');m.emissiveIntensity=0;if(['9aafb0','718e91','b2c4bd','a5bcc0','e6d8ab'].includes(hex)){m.emissive.set(hex==='e6d8ab'?'#ffc472':'#ffb35e');m.emissiveIntensity=night*(hex==='e6d8ab'?4:1.15);}}
  }
  for(const g of [terrain,surround]){const p=g.attributes.position,c=g.attributes.color;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),normal=g.attributes.normal.getY(i),meadow=Math.sin(x*.075+Math.sin(z*.05)*1.6)*Math.cos(z*.06);const shade=new T.Color(palette[0]).multiplyScalar(.86+meadow*.11+p.getY(i)*.001);if(normal<.9)shade.lerp(new T.Color(value.season==='winter'?'#bac8c6':'#9a987d'),Math.min(.8,(.9-normal)*2));c.setXYZ(i,shade.r,shade.g,shade.b);}c.needsUpdate=true;}
  const sky=new T.Color(rainy?'#a5b4bd':overcast?'#b7c4c8':'#dce8e3').lerp(new T.Color('#24354d'),night);
  scene.background.copy(sky);scene.fog.color.copy(sky);
  scene.fog.near=weather==='fog'?35:rainy?170:330;
  scene.fog.far=weather==='fog'?190:rainy?440:540;
  sun.intensity=(rainy?.85:overcast?1.4:2.5)*(1-night*.9);
  sun.color.set(rainy?'#d0dce6':'#fff2d4').lerp(new T.Color('#becce0'),night);
  ambient.intensity=(rainy?1.3:1.5)-night*(rainy?.5:.7);
  ambient.color.set(rainy?'#cfdae2':'#fff9e9').lerp(new T.Color('#c0c9db'),night);
  ambient.groundColor.set(rainy?'#788574':'#76836a').lerp(new T.Color('#79755f'),night);
  lampPools.visible=night>0;poolMaterial.opacity=night*.72;
  precipitation.visible=snowy;rain.visible=rainy;
  weatherMotion=rainy||snowy;weatherSnow=snowy;
  const heavy=weather==='heavy_rain'||weather==='thunderstorm';
  rainLength=heavy?3.0:2.1;rainMaterial.opacity=heavy?.92:.78;
  weatherMaterial.size=.6;weatherMaterial.opacity=.85;
  if(rainy)updateRain();
  lastWeatherFrame=0;invalidate();
 }
 let disposed=false,frame=null,active=true,renderCount=0,initialized=false,labelsDirty=true;
 const projected=new T.Vector3();
 function renderLabels(){
  labelsDirty=false;
  const {width,height}=host.getBoundingClientRect();
  for(const label of labels){
   projected.copy(label.point).project(camera);
   label.node.hidden=projected.z < -1||projected.z > 1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
   if(label.node.hidden)continue;
   const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
   label.node.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
  }
 }
 function render(){
  frame=null;
  if(disposed||!active||document.hidden)return;
  if(weatherMotion){
   const now=performance.now(),dt=lastWeatherFrame?(now-lastWeatherFrame)/1000:0;
   lastWeatherFrame=now;
   for(let i=0;i<480;i++){
    const k=i*3;weatherPositions[k+1]-=dt*(weatherSnow?3:32);
    if(weatherPositions[k+1]<weatherFloor[i])weatherPositions[k+1]=65+rand(i+8100)*15;
   }
   if(weatherSnow)precipitationGeometry.attributes.position.needsUpdate=true;
   else updateRain();
  }
  renderer.render(scene,camera);renderCount++;
  if(labelsDirty)renderLabels();
  if(weatherMotion)invalidate();
 }
 function invalidate(){if(frame===null&&!disposed&&active&&!document.hidden)frame=requestAnimationFrame(render);}
 function resize(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;if(!initialized){if(aspect<.8){camera.position.set(17,43,125);controls.update();}controls.saveState();initialized=true;}camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setSize(width,height);labelsDirty=true;invalidate();}
 const cameraChanged=()=>{labelsDirty=true;invalidate();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',cameraChanged);const visibility=()=>{lastWeatherFrame=0;invalidate();};document.addEventListener('visibilitychange',visibility);
 function pan(direction){
  const step=camera.position.distanceTo(controls.target)*.095;
  const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
  const forward=new T.Vector3().crossVectors(new T.Vector3(0,1,0),right).normalize();
  const delta=(direction==='left'||direction==='right'?right:forward).multiplyScalar(step*(direction==='left'||direction==='down'?-1:1));
  const previousHeight=terrainHeight(controls.target.x,controls.target.z);
  delta.y=terrainHeight(controls.target.x+delta.x,controls.target.z+delta.z)-previousHeight;
  controls.target.add(delta);camera.position.add(delta);controls.update();cameraChanged();
 }
 const ray=new T.Raycaster(),pointer=new T.Vector2();
 const canvas=renderer.domElement;
 let down=null;
 function hitAt(event){
  const bounds=canvas.getBoundingClientRect();
  pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
  ray.setFromCamera(pointer,camera);
  return ray.intersectObjects(clickTargets)[0]?.object??null;
 }
 function pointerDown(event){down=[event.clientX,event.clientY];}
 function pointerUp(event){
  const start=down;down=null;
  if(!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5)return;
  const target=hitAt(event);
  if(target)onSelect(target.userData.lot);
 }
 function pointerCancel(){down=null;}
 const pointerHandlers={pointerdown:pointerDown,pointerup:pointerUp,pointercancel:pointerCancel};
 for(const [type,handler] of Object.entries(pointerHandlers))canvas.addEventListener(type,handler);
 setEnvironment(environment);resize();
 return {setEnvironment,pan,stats:()=>({...renderer.info.render,renderCount,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),setActive(value){active=value;lastWeatherFrame=0;if(!active&&frame!==null){cancelAnimationFrame(frame);frame=null;}invalidate();},reset(){controls.reset();camera.zoom=1;camera.updateProjectionMatrix();cameraChanged();},dispose(){disposed=true;if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();controls.removeEventListener('change',cameraChanged);controls.dispose();document.removeEventListener('visibilitychange',visibility);for(const [type,handler] of Object.entries(pointerHandlers))canvas.removeEventListener(type,handler);scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();labelLayer.remove();}};
}
