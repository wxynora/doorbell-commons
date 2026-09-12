import * as T from 'three';
// Public game-kind scenery only: never render a resident's private hand.
export function createTabletopGames(square,round){
 const cream='#fff0d4',ink='#655543',colors=['#d97d70','#7cafd0','#9eb56b','#edc96e'];
 const materials=new Map();
 function material(c){if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.85}));return materials.get(c);}
 function box(g,x,y,z,w,h,d,c){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(c));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;}
 function cylinder(g,x,y,z,r,h,c){const m=new T.Mesh(new T.CylinderGeometry(r,r,h,16),material(c));m.position.set(x,y,z);g.add(m);return m;}
 function layer(parent,name){const g=new T.Group();g.name='tabletop-'+name;g.userData.noOutline=true;g.userData.noPoseOcclusion=true;parent.add(g);return g;}
 function texturePlane(g,size,y,paint){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');paint(ctx);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(size,size),new T.MeshBasicMaterial({map:texture,toneMapped:false,side:T.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=y;g.add(m);}
 function boardBase(ctx){ctx.fillStyle=cream;ctx.fillRect(0,0,512,512);ctx.lineWidth=5;ctx.strokeStyle=ink;ctx.strokeRect(3,3,506,506);}
 function pawn(g,x,z,c){cylinder(g,x,.765,z,.043,.04,c);const m=new T.Mesh(new T.SphereGeometry(.04,12,8),material(c));m.position.set(x,.817,z);g.add(m);}
 function dice(g,x,z){box(g,x,.785,z,.1,.1,.1,cream);for(const dx of[-.023,.023])for(const dz of[-.023,.023])cylinder(g,x+dx,.837,z+dz,.008,.003,ink);}
 const sets={square:{},round:{}};
 const mah=layer(square,'mahjong');mah.userData.noPoseOcclusion=false;sets.square.mahjong=mah;
 for(let side=0;side<4;side++){const r=new T.Group();r.rotation.y=side*Math.PI/2;r.userData.noPoseOcclusion=side!==0;mah.add(r);for(let i=0;i<10;i++){const x=-.65+i*.145;box(r,x,.965,-.66,.13,.13,.19,cream);for(let d=0;d<2;d++)cylinder(r,x,1.038,-.7+d*.07,.014,.004,i%3?'#628378':'#b97b67');}}
 function cards(name,kind){const g=layer(square,name);sets.square[name]=g;
 for(let side=0;side<4;side++){const hand=new T.Group();hand.rotation.y=side*Math.PI/2;g.add(hand);for(let i=0;i<4;i++){const card=box(hand,-.22+i*.14,.888+i*.002,-.52,.19,.008,kind==='yezi'?.34:.27,kind==='yezi'?'#b98e59':kind==='uno'?colors[i]:cream);card.rotation.y=(i-1.5)*.1;box(hand,-.22+i*.14,.895+i*.002,-.52,.06,.005,.1,kind==='yezi'?'#f2d89e':kind==='uno'?cream:'#a65e56');}}
 box(g,0,.9,0,.22,.045,.32,kind==='yezi'?'#b98e59':cream);
 if(kind==='yezi')for(const x of[-.58,.58]){cylinder(g,x,.93,0,.067,.12,'#b79668');cylinder(g,x,.992,0,.05,.004,'#644331');}
 }
 cards('doudizhu','poker');cards('leaf-game','yezi');cards('uno','uno');
 const legacy=layer(round,'idle-cards');sets.round.idle=legacy;
 for(let i=0;i<6;i++){const a=i*Math.PI/3;box(legacy,Math.cos(a)*.55,.73,Math.sin(a)*.55,.23,.013,.34,colors[i%4]).rotation.y=-a;}
 const ludo=layer(round,'ludo');sets.round['flying-chess']=ludo;box(ludo,0,.73,0,1.3,.035,1.3,'#dbc7a4');
 texturePlane(ludo,1.28,.749,ctx=>{boardBase(ctx);const cell=32,off=16;for(let y=0;y<15;y++)for(let x=0;x<15;x++){if(x>=6&&x<=8||y>=6&&y<=8){ctx.fillStyle='#fffdf3';ctx.fillRect(off+x*cell,off+y*cell,cell,cell);ctx.strokeStyle='#bfb49f';ctx.lineWidth=1;ctx.strokeRect(off+x*cell,off+y*cell,cell,cell);}}
 [[0,0],[9,0],[9,9],[0,9]].forEach(([x,y],i)=>{ctx.fillStyle=colors[i];ctx.fillRect(off+x*cell,off+y*cell,6*cell,6*cell);ctx.fillStyle=cream;for(const dx of[1.8,4.2])for(const dy of[1.8,4.2]){ctx.beginPath();ctx.arc(off+(x+dx)*cell,off+(y+dy)*cell,19,0,Math.PI*2);ctx.fill();}});
 for(let i=0;i<4;i++){ctx.save();ctx.translate(256,256);ctx.rotate(i*Math.PI/2);ctx.fillStyle=colors[i];ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-48,-48);ctx.lineTo(48,-48);ctx.closePath();ctx.fill();ctx.fillRect(-16,-208,32,160);ctx.restore();}});
 [[-.43,-.43],[.43,-.43],[.43,.43],[-.43,.43]].forEach(([x,z],i)=>{pawn(ludo,x,z,colors[i]);pawn(ludo,x+.09,z+.09,colors[i]);});dice(ludo,.76,.1);
 const monopoly=layer(round,'monopoly');sets.round.monopoly=monopoly;box(monopoly,0,.73,0,1.3,.035,1.3,'#dbc7a4');
 texturePlane(monopoly,1.28,.749,ctx=>{boardBase(ctx);ctx.fillStyle='#bad0ad';ctx.fillRect(55,55,402,402);for(let side=0;side<4;side++){ctx.save();ctx.translate(256,256);ctx.rotate(side*Math.PI/2);for(let i=0;i<10;i++){const x=-250+i*50;ctx.fillStyle=cream;ctx.fillRect(x,-250,50,55);ctx.fillStyle=colors[Math.floor(i/3)%4];ctx.fillRect(x,-211,50,14);ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.strokeRect(x,-250,50,55);}ctx.restore();}ctx.fillStyle='#fff0d4';ctx.save();ctx.translate(256,256);ctx.rotate(-.22);ctx.fillRect(-68,-38,62,85);ctx.fillStyle='#dfb597';ctx.fillRect(8,-25,62,85);ctx.restore();});
 [[-.52,-.56],[.56,-.2],[.16,.56],[-.56,.3]].forEach(([x,z],i)=>pawn(monopoly,x,z,colors[i]));
 for(const x of[-.23,0,.23]){box(monopoly,x,.79,-.51,.09,.07,.09,'#729a73');const roof=new T.Mesh(new T.ConeGeometry(.079,.05,4),material('#648666'));roof.rotation.y=Math.PI/4;roof.position.set(x,.85,-.51);monopoly.add(roof);}dice(monopoly,.12,.1);dice(monopoly,.29,.1);
 // Both physical tables support every game; preserve tabletop-relative heights.
 for(const kind of ['mahjong','doudizhu','leaf-game','uno']){
  const copy=sets.square[kind].clone(true);copy.position.y-=.12;round.add(copy);sets.round[kind]=copy;
 }
 for(const kind of ['monopoly','flying-chess']){
  const copy=sets.round[kind].clone(true);copy.position.y+=.12;square.add(copy);sets.square[kind]=copy;
 }
 function set(table,game){if(!sets[table])return;const selected=game??(table==='square'?'mahjong':'idle');for(const [name,g]of Object.entries(sets[table]))g.visible=name===selected;}
 for(const table of Object.values(sets))for(const g of Object.values(table))g.traverse(o=>{o.userData.noOutline=true;});
 set('square',null);set('round',null);
 return {set,update(tables=[]){for(const table of['square','round'])set(table,tables.find(t=>t.tableId===table)?.gameKind??null);}};
}
