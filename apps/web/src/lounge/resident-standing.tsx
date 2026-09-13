import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";

function isStandingMessage(value: unknown): value is {
  type: "resident-avatar-standing";
  residentId: string | null;
  image: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as { type?: unknown; residentId?: unknown; image?: unknown };
  return (
    message.type === "resident-avatar-standing" &&
    (message.residentId === null || typeof message.residentId === "string") &&
    (message.image === null || typeof message.image === "string")
  );
}

export function retainStandingImages(
  current: Readonly<Record<string, string>>,
  residentIds: readonly string[],
): Readonly<Record<string, string>> {
  const allowed = new Set(residentIds);
  let changed = false;
  const next: Record<string, string> = {};
  for (const [residentId, image] of Object.entries(current)) {
    if (allowed.has(residentId)) next[residentId] = image;
    else changed = true;
  }
  return changed ? next : current;
}

export function retainStandingResidentIds(
  current: Set<string>,
  residentIds: readonly string[],
): Set<string> {
  const allowed = new Set(residentIds);
  let changed = false;
  const next = new Set<string>();
  for (const residentId of current) {
    if (allowed.has(residentId)) next.add(residentId);
    else changed = true;
  }
  return changed ? next : current;
}

export function ResidentStandingLoader({
  active = true,
  onImagesChange,
  residentIds,
}: {
  active?: boolean;
  onImagesChange: Dispatch<SetStateAction<Record<string, string>>>;
  residentIds: readonly string[];
}) {
  const frameRefs = useRef(new Map<string, HTMLIFrameElement>());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const pendingIds = useMemo(
    () => residentIds.filter((residentId) => !loadedIds.has(residentId)),
    [loadedIds, residentIds],
  );

  useEffect(() => {
    setLoadedIds((current) => retainStandingResidentIds(current, residentIds));
    onImagesChange((current) => retainStandingImages(current, residentIds));
  }, [onImagesChange, residentIds]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isStandingMessage(event.data)) return;
      const residentId = [...frameRefs.current.entries()].find(
        ([, frame]) => frame.contentWindow === event.source,
      )?.[0];
      if (!residentId) return;
      if (event.data.residentId !== null && event.data.residentId !== residentId) return;
      const image =
        typeof event.data.image === "string" &&
        event.data.image.startsWith("data:image/png;base64,")
          ? event.data.image
          : null;
      setLoadedIds((current) => new Set(current).add(residentId));
      onImagesChange((current) => {
        if (!image) {
          if (!(residentId in current)) return current;
          const next = { ...current };
          delete next[residentId];
          return next;
        }
        return { ...current, [residentId]: image };
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onImagesChange]);

  return (
    <div className="public-lounge-portrait-loaders" aria-hidden="true">
      {(active ? pendingIds : []).map((residentId) => (
        <iframe
          key={residentId}
          ref={(frame) => {
            if (frame) frameRefs.current.set(residentId, frame);
            else frameRefs.current.delete(residentId);
          }}
          src={`/avatar-editor/?mode=standing&resident=${encodeURIComponent(residentId)}`}
          title={`读取${residentId}的居民全身形象`}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}
