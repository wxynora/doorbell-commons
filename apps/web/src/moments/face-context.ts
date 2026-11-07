import { createContext } from "react";
import type { FaceManifest } from "./scene-data";
export const FaceContext = createContext<Record<string, FaceManifest | null>>({});
