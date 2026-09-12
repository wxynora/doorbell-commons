import { z } from "zod";

const loungeIdentifierSchema = z.string().min(1);
const loungeDateTimeSchema = z.iso.datetime();
const loungePositionSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

export const loungeResidentSchema = z
  .object({
    resident_id: loungeIdentifierSchema,
    resident_name: z.string().min(1),
  })
  .strict();

export const loungePresenceSchema = z
  .object({
    resident_id: loungeIdentifierSchema,
    resident_name: z.string().min(1),
    farm_doorplate: loungeIdentifierSchema,
    area_id: loungeIdentifierSchema,
    slot_id: loungeIdentifierSchema.nullable(),
    idle_position: loungePositionSchema,
    last_spoke_at: loungeDateTimeSchema.nullable(),
    entered_at: loungeDateTimeSchema,
  })
  .strict();

export const loungePublicMessageSchema = z
  .object({
    sequence: z.number().int().positive(),
    message_id: loungeIdentifierSchema,
    resident_id: loungeIdentifierSchema,
    resident_name: z.string().min(1),
    text: z.string().min(1),
    created_at: loungeDateTimeSchema,
    reply_to_message_id: loungeIdentifierSchema.nullable(),
    activity_id: loungeIdentifierSchema.nullable(),
  })
  .strict();

export const loungeActivitySchema = z
  .object({
    sequence: z.number().int().positive(),
    activity_id: loungeIdentifierSchema,
    kind: z.string().min(1),
    resident_id: loungeIdentifierSchema.nullable(),
    resident_name: z.string().min(1).nullable(),
    created_at: loungeDateTimeSchema,
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const loungeGameTableSchema = z.object({
  table_id: z.enum(["square", "round"]),
  room: z.object({
    room_id: loungeIdentifierSchema,
    kind: z.enum(["mahjong", "doudizhu", "leaf-game", "uno", "monopoly", "flying-chess"]),
    phase: z.enum(["waiting", "playing", "finished"]),
    revision: z.number().int().nonnegative(),
  }).strict().nullable(),
}).strict();

export const loungeSnapshotSchema = z
  .object({
    version: z.literal(1),
    server_time: loungeDateTimeSchema,
    self_resident_id: loungeIdentifierSchema,
    residents: z.array(loungeResidentSchema),
    tables: z.array(loungeGameTableSchema),
    presence: z.array(loungePresenceSchema),
    messages: z.array(loungePublicMessageSchema),
    activities: z.array(loungeActivitySchema),
  })
  .strict();

export const loungeSnapshotDeltaSchema = z
  .object({
    version: z.literal(1),
    event_version: z.number().int().positive(),
    server_time: loungeDateTimeSchema,
    residents: z.array(loungeResidentSchema).optional(),
    tables: z.array(loungeGameTableSchema).optional(),
    presence: z.array(loungePresenceSchema).optional(),
    append_messages: z.array(loungePublicMessageSchema).optional(),
    append_activities: z.array(loungeActivitySchema).optional(),
    withdrawn_message_ids: z.array(loungeIdentifierSchema).optional(),
  })
  .strict();

export type LoungeResident = z.infer<typeof loungeResidentSchema>;
export type LoungePresence = z.infer<typeof loungePresenceSchema>;
export type LoungePublicMessage = z.infer<typeof loungePublicMessageSchema>;
export type LoungeActivity = z.infer<typeof loungeActivitySchema>;
export type LoungeSnapshot = z.infer<typeof loungeSnapshotSchema>;
export type LoungeSnapshotDelta = z.infer<typeof loungeSnapshotDeltaSchema>;
