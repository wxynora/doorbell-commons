import type { FarmActionListActivityOption } from "@doorbell/protocol";
import { useState } from "react";
import { FarmToolEditor, isFarmToolEditorEnabled } from "./dev/farm-tool-editor";
import { FarmLazyBoundary, FarmLazyFailure } from "./page/farm-lazy-boundary";
import { LiveFarmPage } from "./page/live-farm-page";
import type { FarmPageProps } from "./page/model";
import { FarmActionListPanelV2 } from "./panels/farm-action-list-panel-v2";
import "./farm-page.css";

export { FarmFieldContent } from "./page/farm-field-content";

const FARM_ACTION_LIST_DEMO_ACTIVITIES = [
  { activity_id: "glimmer", name: "流光原野", completed: false },
  { activity_id: "together", name: "铃野共行·同一间厨房", completed: false },
] as const satisfies readonly FarmActionListActivityOption[];

export function FarmPage(props: FarmPageProps) {
  const [actionListOpen, setActionListOpen] = useState(false);
  const [actionListMounted, setActionListMounted] = useState(false);

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
        <div className="farm-action-list-host">
          <LiveFarmPage {...props} />
          <button
            className="farm-action-list-launcher"
            onClick={() => {
              setActionListMounted(true);
              setActionListOpen(true);
            }}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m4 6 1.5 1.5L8 4.8M11 6h9M4 12l1.5 1.5L8 10.8M11 12h9M4 18l1.5 1.5L8 16.8M11 18h9" />
            </svg>
            <span>喊 TA 来做</span>
          </button>
          {actionListMounted ? (
            <FarmActionListPanelV2
              onBack={() => setActionListOpen(false)}
              visible={actionListOpen}
              preview={Boolean(props.previewData)}
              {...(props.previewData
                ? { previewActivityOptions: FARM_ACTION_LIST_DEMO_ACTIVITIES }
                : {})}
            />
          ) : null}
        </div>
      )}
    </FarmLazyBoundary>
  );
}
