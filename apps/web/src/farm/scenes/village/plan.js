const lotBindings = new Map([["夏知", "057a1016-45a4-41c5-99cd-72c852c02572", "352HQ6"], ["念昭", "1bf1ee1a-e8d8-4972-96da-86a72b4e56c5", "YX5AWC"], ["Aster", "33c9d906-1422-43cf-9c0a-26eeb248fcc2", "CD3NZK"], ["Loomis", "38e08a1f-0392-4e34-ae58-52c3c844fe9f", "ZMQAFB"], ["笨笨", "39583186-c5e5-4727-b331-12703b432e6d", "4XYJGE"], ["Evren", "84ceffeb-5f52-4306-807e-8c626805183a", "4BU2PV"], ["沈知远", "84fcc60a-3c6e-49d5-8312-ba98340aad6f", "ESS94P"], ["Seth", "865a4785-70a4-4d1f-a273-98144ab1e5ed", "MVEC6P"], ["Vice", "89d6babb-e58d-42b9-9323-b6481e44e0e3", "DQVQ8R"], ["Lune", "8fff2575-00da-4414-aec8-77f443b97b3c", "S7H2VK"], ["Nain", "9b3eb408-9f30-4232-955c-15360b573a4e", "TX5278"], ["Étincelle", "c0c921ee-d996-4feb-acd7-40f79094733e", "C6QMCE"], ["那智", "d37f2892-b51e-4b1f-b481-a5283a3dc0d6", "4ZSDR3"], ["闻渡", "dc68a6f3-1332-4e96-b473-c6b8b5023d57", "3ET3FE"], ["顾澄", "e808ae84-5ed6-4d81-ac11-a8b102e10ad3", "8TJEM4"], ["Kairos", "f259d4c8-480a-41e6-b112-511fae9d916a", "S7FWP7"], ["顾衡", "f7866961-fdbc-4247-9dbe-4c88b34c0d4e", "6PSHGT"]].map(([name,residentId,doorplate])=>[name,{residentId,doorplate}]));
// Accepted conceptual positions; identities are joined with the active directory, never credentials.
export const villageLots = [
 ['Evren',-68,-29,'slope',-.35],['那智',-28,-48,'slope',.34],['顾衡',-3,-37,'slope',-.28],['沈知远',19,-49,'slope',.4],
 ['Nain',-43,-14,'slope',.22],['笨笨',-57,6,'river',-.25],['闻渡',-34,18,'river',.1],['顾澄',-10,7,'river',-.3],
 ['Seth',49,-44,'river',.3],['Vice',62,-20,'river',-.42],['Étincelle',39,4,'river',.2],['Lune',70,5,'slope',-.35],
 ['Loomis',-62,43,'river',.3],['念昭',-32,51,'river',-.2],['夏知',16,28,'bridge',.35],['Aster',60,35,'bridge',-.55],['Kairos',22,60,'bridge',.22],
].map(([name,x,z,region,yaw])=>({name,x,z,region,yaw,...lotBindings.get(name)}));
export const villageBridge={start:[3,12],end:[1,31],width:3.4};
export const riverPoints=[[55,-65],[37,-44],[45,-25],[28,-12],[25,7],[6,17],[-12,28],[-36,32],[-58,29],[-81,39]];
// Water levels are independent from the hills and descend from the northeast source to the southwest outlet.
const waterCourse=[[200,-430,12],[155,-300,11],[125,-210,10],[85,-145,9.2],[68,-108,8.7],[65,-80,8.3],[55,-65,8],[37,-44,6.8],[45,-25,5.4],[28,-12,4.1],[25,7,2.5],[6,17,1.2],[-12,28,.6],[-36,32,.35],[-58,29,.2],[-81,39,.05],[-102,49,0],[-130,68,-.1],[-175,84,-.22],[-240,116,-.4],[-340,160,-.6],[-480,225,-.8]];
export function riverProfile(x,z){let best={distance:Infinity,height:0};for(let i=1;i<waterCourse.length;i++){const a=waterCourse[i-1],b=waterCourse[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(distance<best.distance)best={distance,height:a[2]+(b[2]-a[2])*t};}return best;}
export const terrainHeight=(x,z)=>{const ridge=-22+7*Math.sin((x+20)*.04);const hillside=(18+8/(1+Math.exp((x-24)/8)))/(1+Math.exp((z-ridge)/13));const eastTerrace=10/(1+Math.exp(-(x-54)/9));const bridgeRise=2.5*Math.exp(-((x-30)**2+(z-31)**2)/430),base=hillside+eastTerrace+bridgeRise,water=riverProfile(x,z),valley=water.height+.7+water.distance*.24,blend=Math.max(0,Math.min(1,(30-water.distance)/14));return base+(Math.min(base,valley)-base)*blend;};

export function assignVillageLots(residents){
 const byResident=new Map(villageLots.map(l=>[l.residentId,l]));
 const occupied=new Set();
 return residents.flatMap(resident=>{
   const known=byResident.get(resident.residentId);const slot=known&&known.doorplate===resident.doorplate&&!occupied.has(known.residentId)?known:null;
   if(slot)occupied.add(slot.residentId);
   // Unassigned residents stay selectable, but do not acquire invented land.
   return slot?[{...resident,...slot,name:resident.name}]:[];
 });
}
