import { FarmToolEditor, isFarmToolEditorEnabled } from "./dev/farm-tool-editor";
import { FarmLazyBoundary, FarmLazyFailure } from "./page/farm-lazy-boundary";
import { LiveFarmPage } from "./page/live-farm-page";
import type { FarmPageProps } from "./page/model";
import "./farm-page.css";

export { FarmFieldContent } from "./page/farm-field-content";

export function FarmPage(props: FarmPageProps) {
  return (
    <FarmLazyBoundary
      fallback={
        <FarmLazyFailure
          label="农场里的一个画面没有打开，已读取的状态仍然保留。"
          onDismiss={props.onBack}
        />
      }
    >
      {import.meta.env.DEV && isFarmToolEditorEnabled() ? (
        <FarmToolEditor onBack={props.onBack} />
      ) : (
        <LiveFarmPage {...props} />
      )}
    </FarmLazyBoundary>
  );
}
