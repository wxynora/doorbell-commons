import type { LayoutShareSkip } from "./layout-sharing-plan.js";
import type { FarmPlot } from "../../farm-overview";
import type { SceneDecorationData, SceneDecorationLayout, SceneEditState, SceneEnvironment } from "./scene-types";
export interface SceneRuntime {
  previewLayout(layout: SceneDecorationLayout): LayoutShareSkip[];
  setActive(active: boolean): void;
  setPlots(plots: readonly FarmPlot[]): void;
  changeRoof(key: string): void;
  changeCanopy(key: "plain" | "floral"): void;
  setEnvironment(value: SceneEnvironment): void;
  setDecorations(value: SceneDecorationData): void;
  selectPlot(id: number | null): void;
  startPlacement(id: string): void;
  rotate(): void;
  addOne(): void;
  remove(): void;
  cancel(): void;
  save(): Promise<void>;
  zoom(factor: number): void;
  resetView(): void;
  dispose(): void;
}
export const roofChoices: readonly {id:string;label:string;color:string}[];
export function createFieldRuntime(host: HTMLElement, options: {
  active?: boolean;
  plots: readonly FarmPlot[];
  houseLevel?: 1 | 2 | 3;
  onSelectHouse?(): void;
  environment: SceneEnvironment;
  onSelectPlot(id: number): void;
  onEditState(state: SceneEditState): void;
  onSaveLayout(layout: SceneDecorationLayout): Promise<void>;
  onFinishEditing(): void;
}): SceneRuntime;
