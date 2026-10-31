// The identical deterministic settle runs off the UI thread. No inventory or
// gameplay state crosses this boundary, only cosmetic shape bounds and poses.
export class JarPileClient {
  constructor(){
    this.nextId=0;this.pending=new Map();
    this.worker=new Worker(new URL('./jar-pile-worker.mjs',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{const job=this.pending.get(data.id);if(!job)return;this.pending.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.poses);};
    this.worker.onerror=event=>{const error=new Error(event.message||'jar_pile_worker_failed');this.failure=error;for(const job of this.pending.values())job.reject(error);this.pending.clear();};
  }
  settle(parameters){if(this.failure)return Promise.reject(this.failure);return new Promise((resolve,reject)=>{const id=++this.nextId;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,parameters});});}
  dispose(){this.worker.terminate();for(const job of this.pending.values())job.resolve(null);this.pending.clear();}
}
