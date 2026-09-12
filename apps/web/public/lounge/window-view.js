import * as T from 'three';

const OFFSET=8*60*60*1000;
export function windowTime(date=new Date()){
 const local=new Date(date.getTime()+OFFSET),month=local.getUTCMonth()+1;
 const season=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
 return {season,night:local.getUTCHours()<6||local.getUTCHours()>=18};
}
export function nextWindowChange(date=new Date()){
 const local=new Date(date.getTime()+OFFSET),y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate(),hour=local.getUTCHours();
 const light=Date.UTC(y,m,d+(hour>=18?1:0),hour<6||hour>=18?6:18)-OFFSET;
 const seasonMonth=[2,5,8,11,14].find(value=>value>m);
 const season=Date.UTC(y,seasonMonth,1)-OFFSET;
 return Math.min(light,season);
}
function paint(canvas,{season,night}){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 const palettes={spring:['#c6e4df','#eef0cc','#a2c087','#bfd092'],summer:['#a6d4df','#dce8bd','#709b68','#8caf73'],autumn:['#b9d7dc','#f0dfbb','#c89c5e','#d8b66e'],winter:['#c7d8e0','#eef0e9','#a6b7ba','#d6ded9']};
 const colors=palettes[season],sky=ctx.createLinearGradient(0,0,0,h);
 sky.addColorStop(0,night?'#080c13':colors[0]);sky.addColorStop(1,night?'#10151d':colors[1]);
 ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 if(!night){
  ctx.fillStyle='#f6f3e6';ctx.globalAlpha=.6;
  for(const [x,y,s] of [[280,120,1],[670,185,.7]]){
   ctx.beginPath();ctx.ellipse(x,y,98*s,20*s,0,0,Math.PI*2);ctx.ellipse(x-33*s,y-14*s,43*s,24*s,0,0,Math.PI*2);ctx.ellipse(x+23*s,y-21*s,48*s,27*s,0,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
 }
 ctx.fillStyle=night?'#111a1c':season==='winter'?'#edf0e8':'#bfc7a1';
 ctx.beginPath();ctx.moveTo(0,530);ctx.quadraticCurveTo(450,440,960,520);ctx.lineTo(960,640);ctx.lineTo(0,640);ctx.fill();
 for(const [x,y,scale] of [[115,575,1.1],[620,590,.95],[910,560,.78]]){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.strokeStyle=night?'#202723':'#927e61';ctx.lineWidth=17;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,60);ctx.bezierCurveTo(-9,-40,12,-170,0,-318);ctx.stroke();
  for(let i=0;i<6;i++){
   const side=i%2?1:-1,by=-90-i*36;
   ctx.lineWidth=8-i*.6;ctx.beginPath();ctx.moveTo(0,by+36);ctx.quadraticCurveTo(side*45,by,side*(72-i*5),by-68);ctx.stroke();
  }
  if(season==='winter'){
   ctx.strokeStyle=night?'#39433f':'#f6f4e9';ctx.lineWidth=5;
   for(let i=0;i<5;i++){const side=i%2?1:-1,by=-98-i*36;ctx.beginPath();ctx.moveTo(side*17,by+12);ctx.lineTo(side*(65-i*5),by-48);ctx.stroke();}
  }else{
   for(let i=0;i<15;i++){
    const a=i*2.4,r=30+(i%4)*21,cx=Math.cos(a)*r,cy=-286+Math.sin(a)*r*.8;
    ctx.fillStyle=night?(i%2?'#17231e':'#1c2820'):colors[2+i%2];
    ctx.beginPath();ctx.ellipse(cx,cy,season==='summer'?72:60,53,a*.15,0,Math.PI*2);ctx.fill();
    if(season==='spring'&&!night&&i%2===0){ctx.fillStyle='#f0d9cf';for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(cx+k*12-12,cy+(k%2)*12,6,0,Math.PI*2);ctx.fill();}}
   }
  }
  ctx.restore();
 }
}
export function createWindowView(width,height){
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshBasicMaterial({map:texture,toneMapped:false});
 const view=new T.Mesh(new T.PlaneGeometry(width,height),material);view.name='season-window-view';view.userData.noOutline=true;
 view.position.z=-.075;
 let previous='';
 function update(date=new Date()){
  const state=windowTime(date),key=state.season+(state.night?'-night':'-day');
  if(key===previous)return false;
  paint(canvas,state);texture.needsUpdate=true;previous=key;view.userData.windowState=state;return true;
 }
 update();view.userData.updateWindow=update;
 view.userData.disposeWindow=()=>{texture.dispose();material.dispose();view.geometry.dispose();};
 return view;
}
