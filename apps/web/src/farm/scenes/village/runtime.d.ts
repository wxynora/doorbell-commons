import type {NeighborhoodHome} from '@doorbell/protocol';
export type VillageEnvironment={season:string;weather:string|null;night:number};
export function createVillage(host:HTMLElement,options:{residents:NeighborhoodHome[];environment?:VillageEnvironment;onSelect:(home:NeighborhoodHome)=>void}):{pan(direction:"up"|"down"|"left"|"right"):void;setEnvironment(environment:VillageEnvironment):void;setActive(active:boolean):void;dispose():void;reset():void;stats():{calls:number;triangles:number;renderCount:number;geometries:number;textures:number}};
