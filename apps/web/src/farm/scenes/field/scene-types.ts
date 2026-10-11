export interface SceneFlood { plot_ids: readonly number[]; fish: readonly {id:string;fish_id:string;size:number}[] }
export interface SceneDecorationPose { x: number; z: number; rotation: number }
export interface SceneDecorationLayout {
  trees?: [{x:number;z:number},{x:number;z:number}] | undefined;
  field?: { x: number; z: number; columns: number; rows?: number | undefined } | undefined;
  house?: { x: number; z: number } | undefined;
  roof: string;
  canopy: "plain" | "floral";
  stall: SceneDecorationPose;
  boundary_item_id?: "farm_decor:white_fence" | "farm_decor:timber_fence" | "farm_decor:stone_wall" | "farm_decor:hedge" | "farm_decor:ghost_fence" | null | undefined;
  decorations: (SceneDecorationPose & { instance_id: string; item_id: string; mirrored?: boolean | undefined })[];
}
export interface SceneDecorationData {
  house?: {level: 1 | 2 | 3; canopy_unlocked: boolean; blocked_rects: readonly (readonly number[])[]};
  catalog: readonly { item_id: string; model_id: string; name: string; cells: readonly number[]; layer: string; purchase_mode: string; price_farm_coins: number }[];
  inventory: readonly { item_id: string; owned_quantity: number; placed_quantity: number; available_quantity: number | null; unlocked: boolean }[];
  layout: SceneDecorationLayout;
  grid: { cell_size: number; z_origin: number; land_cells: readonly (readonly number[])[]; river_cells: readonly (readonly number[])[] };
  environment?: { status: string; season: {id:string;name:string} | null; weather: {condition:string} | null; night: number; disaster: {type:string;phase:string} | null; flood?: SceneFlood | undefined };
}
export interface SceneEnvironment {
  season: string;
  weather: string | null;
  night: number;
  disaster?: {type:string;phase:string} | null;
  flood?: SceneFlood | undefined;
}
export interface SceneEditState {
  treeMoving?: boolean;
  fieldMoving?: boolean;
  fieldColumns?: number;
  fieldRows?: number;
  layoutPreview?: boolean;
  houseMoving?: boolean;
  boundaryItemId: string | null;
  editing: boolean;
  valid: boolean;
  title: string;
  canFlip?: boolean;
  mirrored?: boolean;
  canAdd: boolean;
  canRemove: boolean;
  message: string;
}
