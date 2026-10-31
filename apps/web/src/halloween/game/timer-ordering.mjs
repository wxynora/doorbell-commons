const DATABASE='halloween-collection-timer';
const STORE='transition-versions';

// The read/write transaction serializes reservations across same-origin tabs.
export function reserveTimerVersions(sessionId,stage,authorityVersion=0) {
  if(typeof sessionId!=='string'||!sessionId||!Number.isSafeInteger(stage)||stage<1||
     !Number.isSafeInteger(authorityVersion)||authorityVersion<0)return Promise.reject(new TypeError('invalid_timer_version'));
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(DATABASE,1);
    open.onupgradeneeded=()=>open.result.createObjectStore(STORE);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);
      const request=store.get(JSON.stringify([sessionId,stage]));let pair;
      request.onsuccess=()=>{
        const previous=request.result??0;
        if(!Number.isSafeInteger(previous)||previous<0||Math.max(previous,authorityVersion)>Number.MAX_SAFE_INTEGER-2){transaction.abort();return;}
        const enter=Math.max(previous,authorityVersion)+1;pair={enter,pause:enter+1};store.put(pair.pause,JSON.stringify([sessionId,stage]));
      };
      transaction.oncomplete=()=>{db.close();resolve(pair);};
      transaction.onabort=transaction.onerror=()=>{db.close();reject(transaction.error??new Error('timer_version_unavailable'));};
    };
  });
}
