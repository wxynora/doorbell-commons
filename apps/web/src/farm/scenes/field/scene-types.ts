export interface SceneFlood { plot_ids: readonly number[]; fish: readonly {id:string;fish_id:string;size:number}[] }
export interface SceneDecorationPose { x: number; z: number; rotation: number }
export interface SceneDecorationLayout {
  house?: { x: number; z: number } | undefined;
  roof: string;
  canopy: "plain" | "floral";
  stall: SceneDecorationPose;
  decorations: (SceneDecorationPose & { instance_id: string; item_id: string })[];
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
  layoutPreview?: boolean;
  houseMoving?: boolean;
  editing: boolean;
  valid: boolean;
  title: string;
  canAdd: boolean;
  canRemove: boolean;
  message: string;
}
