import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PortraitStatus = "loading" | "ready" | "empty";

interface ResidentPortraitContextValue {
  images: Readonly<Record<string, string>>;
}

const ResidentPortraitContext = createContext<ResidentPortraitContextValue | null>(null);

function isPortraitMessage(value: unknown): value is {
  type: "resident-avatar-portrait";
  residentId: string | null;
  image: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as { type?: unknown; residentId?: unknown; image?: unknown };
  return (
    message.type === "resident-avatar-portrait" &&
    (message.residentId === null || typeof message.residentId === "string") &&
    (message.image === null || typeof message.image === "string")
  );
}

export function ResidentPortraitProvider({
  children,
  residentIds,
}: {
  children: ReactNode;
  residentIds: readonly string[];
}) {
  const frameRefs = useRef(new Map<string, HTMLIFrameElement>());
  const [status, setStatus] = useState<Record<string, PortraitStatus>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    setStatus((current) => {
      const next = { ...current };
      for (const residentId of residentIds) {
        if (!next[residentId]) next[residentId] = "loading";
      }
      return next;
    });
  }, [residentIds]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isPortraitMessage(event.data)) return;
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
      setStatus((current) => ({ ...current, [residentId]: image ? "ready" : "empty" }));
      setImages((current) => {
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
  }, []);

  const loadingResidentIds = useMemo(
    () =>
      residentIds.filter(
        (residentId) => status[residentId] !== "ready" && status[residentId] !== "empty",
      ),
    [residentIds, status],
  );

  return (
    <ResidentPortraitContext.Provider value={{ images }}>
      {children}
      <div className="public-lounge-portrait-loaders" aria-hidden="true">
        {loadingResidentIds.map((residentId) => (
          <iframe
            key={residentId}
            ref={(frame) => {
              if (frame) frameRefs.current.set(residentId, frame);
              else frameRefs.current.delete(residentId);
            }}
            src={`/avatar-editor/?mode=portrait&resident=${encodeURIComponent(residentId)}`}
            title={`读取${residentId}的居民头像`}
            tabIndex={-1}
          />
        ))}
      </div>
    </ResidentPortraitContext.Provider>
  );
}

export function ResidentPortrait({
  residentId,
  residentName,
}: {
  residentId: string;
  residentName: string;
}) {
  const context = useContext(ResidentPortraitContext);
  const image = context?.images[residentId] ?? null;
  const fallback = Array.from(residentName)[0] ?? "·";

  return (
    <span
      className="public-lounge-resident-portrait"
      role="img"
      aria-label={`${residentName}的居民头像`}
    >
      {image ? <img src={image} alt="" /> : <span aria-hidden="true">{fallback}</span>}
    </span>
  );
}
