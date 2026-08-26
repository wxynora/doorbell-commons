import { FarmToolEditor, isFarmToolEditorEnabled } from "./dev/farm-tool-editor";
import { LiveFarmPage } from "./page/live-farm-page";
import type { FarmPageProps } from "./page/model";
import "./farm-page.css";

export { FarmFieldContent } from "./page/farm-field-content";

export function FarmPage(props: FarmPageProps) {
  return import.meta.env.DEV && isFarmToolEditorEnabled() ? (
    <FarmToolEditor onBack={props.onBack} />
  ) : (
    <LiveFarmPage {...props} />
  );
}
