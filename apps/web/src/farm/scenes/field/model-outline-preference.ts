import { useSyncExternalStore } from "react";

const KEY="doorbell.farm.model-outline";
const CHANGE="farm-model-outline-change";
let sessionValue=false;
export function readModelOutline(): boolean {
  try{return window.localStorage.getItem(KEY)==="true";}catch{return sessionValue;}
}
export function setModelOutlinePreference(value: boolean): void {
  sessionValue=value;
  try{window.localStorage.setItem(KEY,String(value));}catch{/* Storage may be unavailable in private browsing. */}
  window.dispatchEvent(new Event(CHANGE));
}
function subscribe(listener:()=>void):()=>void {
  window.addEventListener(CHANGE,listener);window.addEventListener("storage",listener);
  return()=>{window.removeEventListener(CHANGE,listener);window.removeEventListener("storage",listener);};
}
export function useModelOutlinePreference(): readonly [boolean,(value:boolean)=>void] {
  return [useSyncExternalStore(subscribe,readModelOutline,()=>false),setModelOutlinePreference];
}
