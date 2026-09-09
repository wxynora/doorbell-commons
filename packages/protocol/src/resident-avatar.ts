import { z } from "zod";
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const hairs = z.enum(["hair1-01", "hair1-02", "hair1-04", "hair1-05", "hair1-07", "hair1-08", "hair1-09", "hair1-10", "hair1-11", "hair1-12", "hair1-15", "hair1-17"]);
const mouths = z.enum(["mouth-01", "mouth-02", "mouth-03", "mouth-04", "mouth-05", "mouth-06", "mouth-07", "mouth-08", "mouth-09", "mouth-10", "mouth-11", "mouth-12", "mouth-13", "mouth-14", "mouth-15", "mouth-16", "mouth-17", "mouth-18", "mouth-19", "mouth-20", "mouth-21", "mouth-22", "mouth-23", "mouth-24"]);
const clothes = z.enum(["clothes-v2-04", "clothes-v2-05", "clothes-v2-08", "clothes-v2-09", "clothes-v2-11", "clothes-v2-12", "clothes-v2-13", "clothes-v2-14", "clothes-v2-17", "clothes-v2-18", "clothes-v2-19", "clothes-v2-20", "clothes-v2-21", "clothes-v2-23", "clothes-v2-25", "clothes-v2-27", "clothes-v2-31", "clothes-v2-32"]);
export const residentAvatarManifestSchema = z.strictObject({
 version: z.literal(1), catalog_version: z.literal(1),
 skin: z.enum(["original","light","wheat"]),
 hair: hairs.nullable(), mouth: mouths.nullable(), clothes: clothes.nullable(),
 eyes: z.enum(["eyes-01","eyes-02","eyes-03","eyes-04","eyes-05","eyes-06","eyes-07","eyes-08","eyes-09"]).nullable(),
 hair_color: color.nullable(), iris_color: color, eyelash_color: color.nullable(),
 mole: z.strictObject({ enabled:z.boolean(), x:z.number(), y:z.number(), scale:z.number().positive(), color }),
});
export type ResidentAvatarManifest = z.infer<typeof residentAvatarManifestSchema>;
export const residentAvatarSaveSchema = z.strictObject({
 resident_id:z.string().min(1), expected_revision:z.number().int().nonnegative(), manifest:residentAvatarManifestSchema,
});
