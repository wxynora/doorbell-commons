import type {NeighborhoodHome} from "@doorbell/protocol";
export function assignVillageLots(residents:NeighborhoodHome[]):(NeighborhoodHome & {x:number;z:number;region:string;yaw:number})[];
export const riverPoints:readonly (readonly [number,number])[];
export function terrainHeight(x:number,z:number):number;
export function riverProfile(x:number,z:number):{distance:number;height:number};

export const villageBridge:{start:readonly [number,number];end:readonly [number,number];width:number};
