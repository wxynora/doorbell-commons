import { useEffect, useRef, type RefObject } from "react";
import { createNpcBridge, parseNpcBridgeAction } from "./bridge";

export function useNpcBridge(iframe: RefObject<HTMLIFrameElement | null>, profileKey: string | null) {
  const controller = useRef<ReturnType<typeof createNpcBridge> | null>(null);
  if (!controller.current) controller.current = createNpcBridge();
  useEffect(() => {
    if (controller.current?.setProfile(profileKey)) {
      iframe.current?.contentWindow?.postMessage({ type: "doorbell-npc:reset" }, "*");
    }
  }, [iframe, profileKey]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || !parseNpcBridgeAction(event.data)) return;
      void import("./artwork").then(({ npcArtwork }) => {
        iframe.current?.contentWindow?.postMessage({ type: "doorbell-npc:artwork", artwork: npcArtwork }, "*");
      }).catch(() => { /* Artwork loading never changes the authoritative action result. */ });
      void controller.current?.handle(event.data, result => iframe.current?.contentWindow?.postMessage(result, "*"));
    };
    window.addEventListener("message", onMessage);
    return () => { controller.current?.setProfile(null); window.removeEventListener("message", onMessage); };
  }, [iframe]);
}
