import { z } from "zod";

export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export const weatherSchema = z.enum(["sunny", "cloudy", "light_rain", "heavy_rain", "thunderstorm", "fog", "hot", "dry_wind", "light_snow", "blizzard"]);
export const environmentSchema = z.object({ season: z.object({ id: seasonSchema, name: z.string() }), weather: z.object({ condition: weatherSchema }).nullable() });
export type SceneEnvironment = z.infer<typeof environmentSchema>;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
// A read-only projection of the existing resident-avatar manifest; no new avatar protocol.
export const faceManifestSchema = z.object({
  skin: z.enum(["original", "light", "wheat"]),
  hair: z.enum(["hair1-01", "hair1-02", "hair1-04", "hair1-05", "hair1-07", "hair1-08", "hair1-09", "hair1-10", "hair1-11", "hair1-12", "hair1-15", "hair1-17"]).nullable(),
  eyes: z.string().nullable(), mouth: z.string().nullable(), hair_color: color.nullable(), iris_color: color, eyelash_color: color.nullable(),
  mole: z.object({ enabled: z.boolean(), x: z.number(), y: z.number(), scale: z.number(), color }),
});
export type FaceManifest = z.infer<typeof faceManifestSchema>;
export interface SceneReader {
  environment(signal: AbortSignal): Promise<SceneEnvironment | null>;
  avatar(residentId: string, signal: AbortSignal): Promise<FaceManifest | null>;
}
export function createSceneReader(fetcher: typeof fetch = (...args) => fetch(...args)): SceneReader {
  async function read(path: string, signal: AbortSignal) {
    const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) return null;
    return response.json();
  }
  return {
    async environment(signal) {
      const parsed = z.object({ data: environmentSchema }).safeParse(await read("/api/farm/field", signal));
      return parsed.success ? parsed.data.data : null;
    },
    async avatar(residentId, signal) {
      const parsed = z.object({ resident_id: z.literal(residentId), revision: z.number().int().nonnegative(), manifest: faceManifestSchema.nullable() }).safeParse(await read(`/api/residents/${encodeURIComponent(residentId)}/avatar`, signal));
      return parsed.success ? parsed.data.manifest : null;
    },
  };
}
export const sceneReader = createSceneReader();
export const weatherNames: Record<z.infer<typeof weatherSchema>, string> = { sunny: "晴", cloudy: "多云", light_rain: "小雨", heavy_rain: "大雨", thunderstorm: "雷雨", fog: "雾", hot: "炎热", dry_wind: "干风", light_snow: "小雪", blizzard: "暴雪" };
