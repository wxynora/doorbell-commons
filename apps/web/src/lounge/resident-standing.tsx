import { readStandingImage, saveStandingImage } from "./standing-image-cache";
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

export function ResidentStandingLoader({
  active = true,
  onImagesChange,
  residents,
}: {
  active?: boolean;
  onImagesChange: Dispatch<SetStateAction<Record<string, string>>>;
  residents: readonly { residentId: string; revision: number }[];
}) {
  const frameRefs = useRef(new Map<string, HTMLIFrameElement>());
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, number>>({});
  const pending = useMemo(() => residents.filter(person =>
    checked[person.residentId] === person.revision && loaded[person.residentId] !== person.revision),
    [checked, loaded, residents]);
  const publish = (residentId: string, image: string | null) => onImagesChange(current => {
    if (image) return current[residentId] === image ? current : { ...current, [residentId]: image };
    if (!(residentId in current)) return current;
    const next = { ...current }; delete next[residentId]; return next;
  });

  useEffect(() => {
    let disposed = false;
    for (const person of residents) {
      void readStandingImage(person.residentId, person.revision).catch(() => null).then(saved => {
        if (disposed) return;
        if (saved) {
          publish(person.residentId, saved.image);
          setLoaded(current => ({ ...current, [person.residentId]: person.revision }));
        }
        setChecked(current => ({ ...current, [person.residentId]: person.revision }));
      });
    }
    return () => { disposed = true; };
  }, [residents, onImagesChange]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isStandingMessage(event.data)) return;
      const person = residents.find(person => frameRefs.current.get(person.residentId)?.contentWindow === event.source);
      if (!person || (event.data.residentId !== null && event.data.residentId !== person.residentId)) return;
      const image = typeof event.data.image === "string" && event.data.image.startsWith("data:image/png;base64,") ? event.data.image : null;
      setLoaded(current => ({ ...current, [person.residentId]: person.revision }));
      publish(person.residentId, image);
      // A missing manifest is stable at revision zero; a failed nonempty avatar
      // must not become a permanently saved missing image.
      if (image || person.revision === 0) void saveStandingImage({ ...person, image }).catch(() => {});
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [residents, onImagesChange]);

  return <div className="public-lounge-portrait-loaders" aria-hidden="true">
    {(active ? pending : []).map(person => <iframe
      key={`${person.residentId}:${person.revision}`}
      ref={frame => { if (frame) frameRefs.current.set(person.residentId, frame); else frameRefs.current.delete(person.residentId); }}
      src={`/avatar-editor/?mode=standing&resident=${encodeURIComponent(person.residentId)}`}
      title={`读取${person.residentId}的居民全身形象`}
      tabIndex={-1}
    />)}
  </div>;
}
