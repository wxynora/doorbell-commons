import * as T from 'three';

// One lightweight house recipe for the town and distant household silhouettes.
export function createCoarseHouseBuilder(geometry){
 const box=geometry(new T.BoxGeometry(1,1,1)),leaf=geometry(new T.IcosahedronGeometry(1,0));
 const roofShape=new T.Shape();roofShape.moveTo(-.5,0);roofShape.lineTo(0,1);roofShape.lineTo(.5,0);roofShape.closePath();
 const gable=geometry(new T.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false}));gable.translate(0,0,-.5);
 const round=geometry(new T.SphereGeometry(1,10,6)),stem=geometry(new T.CylinderGeometry(.85,1,1,12)),cap=geometry(new T.LatheGeometry([[0,1.5],[.5,1.45],[1.2,1.2],[1.9,.65],[2.3,.13],[2.2,0],[1.5,.07],[0,.1]].reverse().map(p=>new T.Vector2(...p)),16));
 // Roof faces have a real overhang. The wall gable stays behind the eaves.
 const roofPanels=geometry(new T.ExtrudeGeometry([-1,1].map(side=>{
  const panel=new T.Shape();
  panel.moveTo(0,1);panel.lineTo(side*.5,0);panel.lineTo(side*.5,-.075);panel.lineTo(0,.925);panel.closePath();
  return panel;
 }),{depth:1,bevelEnabled:false}));
 roofPanels.translate(0,0,-.5);
 const archShape=new T.Shape();
 archShape.moveTo(-.5,-.5);archShape.lineTo(.5,-.5);archShape.lineTo(.5,.02);
 archShape.quadraticCurveTo(.5,.5,0,.5);archShape.quadraticCurveTo(-.5,.5,-.5,.02);
 archShape.closePath();
 const arch=geometry(new T.ExtrudeGeometry(archShape,{depth:1,bevelEnabled:false}));
 arch.translate(0,0,-.5);
 // The front gable and transverse roof share one continuous surface.
 const roseRidgeX=.68,roseRidgeZ=-.72;
 const roseRoofHeight=(x,z)=>{
  const main=6.23+2.16*Math.max(0,1-Math.abs(z-roseRidgeZ)/3.18)**1.35;
  const front=z<roseRidgeZ?0:6.23+(2.16+(z-roseRidgeZ)*.54)*Math.max(0,1-Math.abs(x-roseRidgeX)/4.1)**1.42;
  return Math.max(main,front);
 };
 const roofXs=[-4.23,-3.3,-2.48,-1.62,-.66,.08,roseRidgeX,1.28,1.98,2.76,3.62,4.5];
 const roofZs=[-3.9,-3.1,-2.28,-1.49,roseRidgeZ,.04,.89,1.74,2.59,2.87];
 function roseRoofGeometry(){
  const positions=[],indices=[],cols=roofXs.length,rows=roofZs.length;
  for(const offset of [0,-.17])
   for(const z of roofZs)for(const x of roofXs)positions.push(x,roseRoofHeight(x,z)+offset,z);
  const layer=cols*rows;
  for(let row=0;row<rows-1;row++)for(let col=0;col<cols-1;col++){
   const a=row*cols+col,b=a+1,c=a+cols,d=c+1;
   indices.push(a,c,b,b,c,d,layer+a,layer+b,layer+c,layer+b,layer+d,layer+c);
  }
  const edge=[
   ...roofXs.map((_,i)=>i),
   ...roofZs.slice(1).map((_,i)=>(i+2)*cols-1),
   ...roofXs.slice(1).map((_,i)=>layer-2-i),
   ...roofZs.slice(2).map((_,i)=>(rows-2-i)*cols),
  ];
  edge.forEach((a,i)=>{const b=edge[(i+1)%edge.length];indices.push(a,b,a+layer,b,b+layer,a+layer);});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();
  return geometry(g);
 }
 function roseWallGeometry(){
  const wall=new T.Shape();
  wall.moveTo(-3.48,3.27);wall.lineTo(3.48,3.27);
  for(const u of [3.48,3.13,2.76,1.98,1.28,roseRidgeX,.08,-.66,-1.62,-2.48,-3.48])
   wall.lineTo(u,roseRoofHeight(u,2.04)-.13);
  wall.closePath();
  const g=new T.ExtrudeGeometry(wall,{depth:.16,bevelEnabled:false});g.translate(0,0,1.88);
  return geometry(g);
 }
 function roseTube(points,radius){
  const path=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)));
  return geometry(new T.TubeGeometry(path,points.length+2,radius,5,false));
 }
 const roseRoof=roseRoofGeometry(),roseWall=roseWallGeometry();
 const roseVerge=roseTube(roofXs.map(u=>[u,roseRoofHeight(u,2.87)+.035,2.9]),.1);
 const roseSupports=[
  [[.12,.45,.21],[-.15,1.62,.32],[-2.78,3.11,.84]],
  [[.2,.5,-.4],[.45,1.7,-.17],[2.67,3.14,.94]],
  [[.12,.5,.01],[-.12,.17,1.33],[-2.43,.1,2.45]],
  [[.12,.5,.03],[1.07,.21,1.37],[2.81,.09,2.73]]
 ].map((points,i)=>roseTube(points,i<2?.32:.22));
 const witchHat=geometry(new T.LatheGeometry([[0,0],[1.08,0],[1.02,.08],[.69,.11],[.52,.28],[.31,.62],[.18,.84],[0,1]].map(p=>new T.Vector2(...p)),10));

 const roofColors={mint:'#67998b',rose:'#bd8583',pink:'#bd8583',blue:'#7a93a8',cream:'#b8a274',brown:'#927661'};
 return (lot,emit)=>{
 const style=lot.style??'classic',roof=roofColors[lot.roof]??'#a98269';
 const modelScale=style==='stump'?1.49:1.2;
  const timber='#86694f',plaster='#eddbb6',stone='#b6a486',glass='#9aafb0';
  const house=(g,color,u,h,v,w,sy,d,angle=0)=>emit(g,color,-2.8+u*modelScale,h*modelScale,-2.8+v*modelScale,w*modelScale,sy*modelScale,d*modelScale,angle);
  const block=(color,u,h,v,w,sy,d,angle)=>house(box,color,u,h,v,w,sy,d,angle);
  const ellipsoid=(color,u,h,v,w,sy,d)=>house(round,color,u,h,v,w,sy,d);
  const windowFront=(u,h,v,w,hh,shutter)=>{
   block(timber,u,h,v,w,hh,.23);
   block(glass,u,h,v+.14,w*.77,hh*.76,.08);
   block(plaster,u,h,v+.19,.09,hh*.8,.06);
   block(plaster,u,h,v+.19,w*.8,.09,.06);
   block(stone,u,h-hh*.52,v+.19,w*1.12,.14,.38);
   if(shutter)for(const side of [-1,1])block(shutter,u+side*w*.68,h,v+.05,w*.27,hh*.9,.19);
  };
  const pitched=(u,v,w,d,eave,rise,wall,tile)=>{
   house(gable,wall,u,eave-.04,v,w,rise,d);
   house(roofPanels,tile,u,eave,v,w+.72,rise,d+.9);
   for(const side of [-1,1])block(timber,u+side*(w+.72)/2,eave-.12,v,.16,.23,d+.92);
   block(timber,u,eave+rise-.02,v,.14,.17,d+.93);
  };
  if(style==='pumpkin'||style==='witch_pumpkin'){
   const witch=style==='witch_pumpkin';
   const skin=witch?'#b97742':'#d4934c',lobe=witch?'#c28755':'#e4a25b';
   ellipsoid(skin,0,2.58,0,3.43,2.75,2.94);
   for(const [u,v,w] of [[-1.45,.1,1.9],[1.45,.1,1.9],[0,.8,2.03]])ellipsoid(lobe,u,2.55,v,w,2.62,2.54);
   if(witch){
    house(witchHat,'#696276',-.15,4.68,-.2,4.35,3.65,3.9);
    house(stem,'#987457',-.15,5.23,-.2,2.57,.22,2.31);
   }else{
    house(stem,'#758b59',.17,5.5,-.14,.81,1.26,.81);
    house(leaf,'#819a60',1.08,5.3,-.02,1.22,.24,.62,.2);
   }
   for(const side of [-1,1]){
    ellipsoid(timber,side*1.83,2.95,2.82,.66,.71,.18);
    ellipsoid(glass,side*1.83,2.95,2.95,.45,.48,.08);
   }
   block(timber,0,1.15,3.02,1.5,2.26,.26);
   ellipsoid(timber,0,2.22,3.05,.75,.48,.18);
   block(stone,0,.14,3.49,1.9,.26,.67);
  }else if(style==='mushroom'){
   for(const [u,v,k] of [[-.25,-.35,1.98],[3.9,-1.5,1.24]]){
    house(stem,'#e8d9b8',u,1.4*k,v,1.52*k,2.8*k,1.52*k);
    house(cap,'#cc9285',u,2.75*k,v,k,k,k);
    for(const [du,dv,h] of [[-.71,.25,1.37],[.59,.8,1.31],[1.35,-.33,1.08],[-1.25,-.83,1.04]])
     ellipsoid('#f0e2c7',u+du*k,(2.75+h)*k,v+dv*k,.29*k,.07*k,.25*k);
    for(const side of [-1,1]){
     ellipsoid(timber,u+side*.76*k,1.75*k,v+1.27*k,.44*k,.52*k,.14*k);
     ellipsoid(glass,u+side*.76*k,1.75*k,v+1.38*k,.29*k,.37*k,.07*k);
    }
   }
   block(timber,-.25,1.28,2.46,1.58,2.52,.24);
   ellipsoid(timber,-.25,2.46,2.48,.79,.51,.15);
   for(let i=0;i<2;i++)block(stone,-.25,.13+i*.15,3.37-i*.43,2.3,.25,.49);
  }else if(style==='rose_cottage'){
   const oak='#74553f',clay='#bd8583',door='#b78290',wall='#eee1c7';
   house(stem,oak,.03,1.61,-.14,1.08,3.19,.84);
   for(const support of roseSupports)house(support,oak,0,0,0,1,1,1);
   house(stem,timber,-.05,3.11,.1,4.1,.38,2.77);
   block(wall,0,4.77,-.09,6.96,3.05,3.96);
   house(roseWall,wall,0,0,0,1,1,1);
   for(const side of [-1,1])house(gable,wall,side*3.38,6.16,-.72,3.95,1.4,.24,Math.PI/2);
   house(roseRoof,clay,0,0,0,1,1,1);
   house(roseVerge,oak,0,0,0,1,1,1);
   for(const u of [-3.47,3.47])block(timber,u,4.78,2.02,.18,3.05,.18);
   house(arch,timber,-2.45,4.45,2.13,1.45,2.43,.18);
   house(arch,door,-2.45,4.46,2.25,1.19,2.24,.11);
   ellipsoid('#e6d8ab',-2.19,4.44,2.34,.09,.09,.045);
   block(timber,.74,4.81,2.14,4.12,1.75,.26);
   block('#c29485',.74,5.78,2.49,4.34,.18,.98);
   for(const u of [-.59,.74,2.06]){
    block(glass,u,4.81,2.31,1.12,1.39,.07);
    block(timber,u,4.86,2.37,1.15,.075,.06);
   }
   for(const [u,h,w,hh] of [[-1.09,6.72,.83,1.23],[.6,7.11,1.04,1.69],[2.22,6.72,.83,1.23]]){
    house(arch,timber,u,h,2.09,w,hh,.19);
    house(arch,glass,u,h,2.22,w*.76,hh*.78,.07);
    block(timber,u,h,2.28,.07,hh*.73,.04);
   }
   for(let i=0;i<5;i++){
    block(stone,-.57-i*.63,.13+i*.135,5.39, .77,.27,1.08);
    block(timber,-3.15,1.11+i*.37,4.99-i*.48,1.48,.39,.6);
   }
   for(const u of [-3.96,-2.33,-.45,1.5,3.81])block(timber,u,3.58,2.52,.13,.68,.13);
   block(timber,1.58,3.85,2.52,4.46,.12,.13);
   block(timber,-3.76,3.82,1.51,.14,.12,2.11);
   ellipsoid('#e6d8ab',-3.63,5.37,2.36,.15,.24,.15);
   const vines=[[-3.52,2.49],[-3.01,2.74],[-2.44,2.8],[-1.94,2.65],[-1.42,2.78],[-.98,2.5],
    [.62,2.64],[1.15,2.82],[1.71,2.72],[2.26,2.82],[2.78,2.57],[3.34,2.73],
    [-3.13,-.46],[-2.61,-.65],[-2.04,-.72],[-1.5,-.52],[2.46,-.62],[3.02,-.69],[3.63,-.41]];
   vines.forEach(([u,v],i)=>{
    const h=roseRoofHeight(u,v);
    house(leaf,'#758b59',u,h+.09,v,.63,.19,.39);
    if(i%3!==1)house(leaf,'#edc3d0',u-.06,h+.26,v+.08,.19,.13,.15);
   });
   for(const [u,v] of [[-3.4,2.07],[-1.37,2.57],[-.56,2.67],[.33,2.6],[1.32,2.63],[2.3,2.55],[3.38,2.36]]){
    house(leaf,'#819a60',u,3.37,v,.49,.25,.36);
    house(leaf,'#edc3d0',u-.02,3.62,v+.12,.23,.13,.23);
   }
  }else if(style==='stump'){
   const bark='#aa825c',wood='#d6b48a';
   house(stem,bark,-.38,2.47,0,2.65,4.94,2.27);
   for(const [u,v,h,angle] of [[-2.49,.89,.59,-.74],[1.84,1.43,.53,.72],[-2.05,-1.49,.43,.44],[1.38,-1.81,.43,-.7]])
    house(round,bark,u,h*.62,v,.58,h,1.05,angle);
   house(stem,wood,-.38,4.94,0,2.35,.23,2.02);
   house(cap,'#758b59',-.4,5.06,-.45,.85,.68,.78);
   house(stem,bark,2.62,1.62,-1.03,1.35,3.18,1.26);
   house(stem,wood,2.62,3.25,-1.03,1.24,.2,1.19);
   house(cap,'#758b59',2.62,3.37,-1.03,.57,.65,.54);
   house(stem,bark,-1.79,5.03,-.56,.32,1.39,.31);
   house(stem,wood,-1.79,5.74,-.56,.32,.12,.31);
   house(arch,timber,-.4,1.58,2.28,1.49,2.54,.22);
   house(cap,'#758b59',-.4,2.86,2.26,.49,.35,.32);
   for(const [u,h,v,sz] of [[-1.79,2.89,1.75,.51],[1.11,2.9,1.75,.51],[-.4,3.95,1.96,.35],[2.87,1.96,.23,.49]]){
    ellipsoid(timber,u,h,v,sz,sz,.19);
    ellipsoid(glass,u,h,v+.16,sz*.75,sz*.75,.1);
   }
   block(stone,-.4,.17,2.83,2.36,.3,.81);
  }else{
   const level=lot.level??1;
   const tall=level>=3,sideWing=level===2||tall;
   const w=tall?6.3:6.6,d=tall?5.7:5.45,eave=tall?5.85:3.82,rise=tall?2.65:2.18;
   const wall=lot.region==='river'?'#f0e1c1':lot.region==='bridge'?'#e2d3b3':plaster;
   block(stone,0,.37,0,w+.3,.72,d+.26);
   block(wall,0,(eave+.68)/2,0,w,eave-.68,d);
   pitched(0,0,w,d,eave,rise,wall,roof);
   for(const side of [-1,1]){
    block(timber,side*(w/2-.17),eave*.55,d/2+.05,.18,eave*.88,.16);
    for(const v of [-1.03,1.22]){
     const u=side*(w/2+.025);
     block(timber,u,2.4,v,.19,1.26,1.31);
     block(glass,u+side*.11,2.4,v,.07,.94,1.03);
     block(plaster,u+side*.15,2.4,v,.07,.085,1.07);
    }
   }
   block(timber,0,1.22,d/2+.1,1.23,2.28,.22);
   block('#a58665',0,1.21,d/2+.23,.97,2.08,.09);
   block(stone,0,.19,d/2+.48,2.31,.29,.92);
   for(const u of [-1.84,1.84]){
    windowFront(u,2.28,d/2+.09,1.22,1.35,roof);
    block(timber,u,1.46,d/2+.35,1.37,.22,.48);
    house(leaf,'#819a60',u,1.63,d/2+.35,.68,.24,.34);
   }
   windowFront(0,eave+.77,d/2+.12,.85,1.12);
   if(tall){
    block(timber,0,3.65,d/2+.1,w,.14,.21);
    for(const u of [-1.67,1.67])windowFront(u,4.72,d/2+.09,1.25,1.26,roof);
   }
   if(sideWing){
    const u=tall?-3.37:-3.48,v=-.95,wingEave=tall?3.38:3.08;
    block(wall,u,wingEave/2,v,2.69,wingEave,3.71);
    pitched(u,v,2.69,3.71,wingEave,1.63,wall,roof);
    windowFront(u-.35,1.8,v+1.89,.86,1.05);
   }
   const chimneyH=eave+rise*.68;
   block('#ab8873',1.78,chimneyH-.34,-1.34,.73,2.1,.77);
   block(timber,1.78,chimneyH+.75,-1.34,.91,.2,.93);
  }

 };
}
