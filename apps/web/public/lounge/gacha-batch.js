export function newBatch(uuid){return {mode:'legacy',ids:Array.from({length:10},()=>uuid()),results:[]};}
// Legacy single-draw loop kept only to finish batches started before the
// atomic ten-draw endpoint existed; a lost response resumes that exact draw.
export async function runBatch(batch,{draw,save,onResult=()=>{},isClosed=()=>false}){
 save(batch);
 while(batch.results.length<batch.ids.length&&!isClosed()){
  const result=await draw(batch.ids[batch.results.length]);
  batch.results.push(result);save(batch);onResult(result,batch.results.length);
 }
 return batch;
}
// One atomic ten-draw request; the server replays the same rewards for the
// same idempotency key, so a lost response resumes by resending it.
export async function runAtomicTen({id,draw,save,isClosed=()=>false}){
 save({mode:'atomic',ids:[id],results:[]});
 while(!isClosed()){
  const result=await draw(id);
  if(!isClosed()){save({mode:'atomic',ids:[id],results:[result]});return result;}
 }
 return null;
}
const memory=new Map();
export function storedBatch(plate,value){
 const key='doorbell:gacha:batch:'+plate;
 if(value!==undefined){if(value)memory.set(key,value);else memory.delete(key);try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}}
 try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):memory.get(key)||null;}catch{return memory.get(key)||null;}
}
