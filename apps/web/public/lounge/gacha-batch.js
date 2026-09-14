export function newBatch(uuid){return {ids:Array.from({length:10},()=>uuid()),results:[]};}
// Save the IDs before drawing; a lost response resumes that exact single draw.
export async function runBatch(batch,{draw,save,onResult=()=>{},isClosed=()=>false}){
 save(batch);
 while(batch.results.length<batch.ids.length&&!isClosed()){
  const result=await draw(batch.ids[batch.results.length]);
  batch.results.push(result);save(batch);onResult(result,batch.results.length);
 }
 return batch;
}
const memory=new Map();
export function storedBatch(plate,value){
 const key='doorbell:gacha:batch:'+plate;
 if(value!==undefined){if(value)memory.set(key,value);else memory.delete(key);try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}}
 try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):memory.get(key)||null;}catch{return memory.get(key)||null;}
}
