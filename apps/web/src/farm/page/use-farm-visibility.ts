import { useEffect, useState } from "react";

/** A retained farm must stop rendering while covered or while the PWA is hidden. */
export function useFarmVisibility(active: boolean) {
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return active && documentVisible;
}
