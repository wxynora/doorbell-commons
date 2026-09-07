export interface SceneDecorationPose { x: number; z: number; rotation: number }
export interface SceneDecorationLayout {
  roof: string;
  stall: SceneDecorationPose;
  decorations: (SceneDecorationPose & { instance_id: string; item_id: string })[];
}
export interface SceneDecorationData {
  catalog: readonly { item_id: string; model_id: string; name: string; cells: readonly number[]; layer: string; purchase_mode: string; price_farm_coins: number }[];
  inventory: readonly { item_id: string; owned_quantity: number; placed_quantity: number; available_quantity: number | null; unlocked: boolean }[];
  layout: SceneDecorationLayout;
  grid: { cell_size: number; z_origin: number; land_cells: readonly (readonly number[])[]; river_cells: readonly (readonly number[])[] };
  environment?: { status: string; season: {id:string;name:string} | null; weather: {condition:string} | null; night: number; disaster: {type:string;phase:string} | null };
}
export interface SceneEnvironment {
  season: string;
  weather: string | null;
  night: number;
  disaster?: {type:string;phase:string} | null;
}
export interface SceneEditState {
  editing: boolean;
  valid: boolean;
  title: string;
  canAdd: boolean;
  canRemove: boolean;
  message: string;
}
