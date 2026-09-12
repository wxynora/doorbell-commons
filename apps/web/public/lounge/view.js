export const WIDTH=1536, HEIGHT=1024;
export function fit(w,h,layoutWidth=WIDTH){const scale=Math.min(w/layoutWidth,h/HEIGHT);return{scale,x:(w-layoutWidth*scale)/2,y:(h-HEIGHT*scale)/2};}
export function constrain(zoom,pan){zoom=Math.max(1,zoom);const limit=7.8*(1-1/zoom);return{zoom,pan:Math.max(-limit,Math.min(limit,pan))};}
export const CAMERA_OFFSET=Object.freeze([10,18,24]);
