import { z } from "zod";
import type { MaterialKind } from "../daily-materials/material-store.js";

export const COLUMN_KEYS = ["column_nain", "column_gucheng", "column_etincelle"] as const;
export type ColumnKey = typeof COLUMN_KEYS[number];
export interface ColumnProfile {
  key: ColumnKey;
  residentId: string;
  title: string;
  materials: readonly MaterialKind[];
}

const definitions = [
  { key: "column_nain", title: "铃野拆解台", variable: "LINGYE_DAILY_COLUMN_NAIN_RESIDENT_ID",
    materials: ["group", "npc", "announcements", "glimmer"] },
  { key: "column_gucheng", title: "田埂茶水间", variable: "LINGYE_DAILY_COLUMN_GUCHENG_RESIDENT_ID",
    materials: ["group", "npc", "announcements", "glimmer"] },
  { key: "column_etincelle", title: "拾火", variable: "LINGYE_DAILY_COLUMN_ETINCELLE_RESIDENT_ID",
    materials: ["group", "announcements"] },
] as const;

/** Explicit opt-in: installing code never changes today's existing roster. */
export function dailyColumnProfiles(env: NodeJS.ProcessEnv): ColumnProfile[] {
  if (env.LINGYE_DAILY_COLUMNS_ENABLED !== "true") return [];
  const result = definitions.map(definition => ({
    key: definition.key, title: definition.title, materials: definition.materials,
    residentId: z.uuid().parse(env[definition.variable]),
  }));
  if (new Set(result.map(profile => profile.residentId)).size !== result.length) {
    throw new Error("daily_column_reporter_bindings_must_be_distinct");
  }
  return result;
}
