import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const farmActionListItemIdSchema = z.uuid();
export const farmActionListIdSchema = z.uuid();
export const farmActionListIdempotencyKeySchema = z.uuid();

export const farmActionListScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), trigger_at: z.iso.datetime() }).strict(),
  z
    .object({
      kind: z.literal("daily_window"),
      start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
      end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
      interval_minutes: z.number().int().positive().max(1_440),
    })
    .strict()
    .superRefine((schedule, context) => {
      if (schedule.start_time >= schedule.end_time) {
        context.addIssue({ code: "custom", message: "Daily window end must be after start" });
      }
    }),
]);

const itemBase = {
  item_id: farmActionListItemIdSchema,
};

const harvestItem = z.object({ ...itemBase, kind: z.literal("harvest") }).strict();
const plantItem = z
  .object({ ...itemBase, kind: z.literal("plant"), details: nonEmptyText.optional() })
  .strict();
const buyItem = z.object({ ...itemBase, kind: z.literal("buy"), details: nonEmptyText }).strict();
const stealItem = z.object({ ...itemBase, kind: z.literal("steal") }).strict();
const fishItem = z.object({ ...itemBase, kind: z.literal("fish") }).strict();
const exploreItem = z.object({ ...itemBase, kind: z.literal("explore") }).strict();
const cookItem = z.object({ ...itemBase, kind: z.literal("cook") }).strict();
const activityItem = z
  .object({
    ...itemBase,
    kind: z.literal("activity"),
    activity_id: nonEmptyText,
  })
  .strict();
const noteItem = z.object({ ...itemBase, kind: z.literal("note"), text: nonEmptyText }).strict();

export const farmActionListItemSchema = z.union([
  harvestItem,
  plantItem,
  buyItem,
  stealItem,
  fishItem,
  exploreItem,
  cookItem,
  activityItem,
  noteItem,
]);

export const farmActionListItemKindSchema = z.enum([
  "harvest",
  "plant",
  "buy",
  "steal",
  "fish",
  "explore",
  "cook",
  "activity",
  "note",
]);

export const farmActionListItemViewSchema = z
  .object({
    item: farmActionListItemSchema,
    status: z.enum(["active", "crossed", "authority_unavailable"]),
    reason: nonEmptyText.nullable(),
    display_text: nonEmptyText,
  })
  .strict();

export const farmActionListSchema = z
  .object({
    list_id: farmActionListIdSchema,
    revision: z.number().int().nonnegative(),
    name: nonEmptyText,
    enabled: z.boolean(),
    schedule: farmActionListScheduleSchema.nullable(),
    next_trigger_at: z.iso.datetime().nullable(),
    items: z.array(farmActionListItemViewSchema),
    checked_at: z.iso.datetime().nullable(),
    last_notification: z
      .object({
        status: z.enum(["sent", "all_crossed", "failed"]),
        at: z.iso.datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const farmActionListCreateRequestSchema = z
  .object({
    name: nonEmptyText,
    enabled: z.boolean(),
    schedule: farmActionListScheduleSchema.nullable(),
    items: z.array(farmActionListItemSchema),
  })
  .strict();

export const farmActionListUpdateRequestSchema = farmActionListCreateRequestSchema.extend({
  expected_revision: z.number().int().nonnegative(),
});

export const farmActionListDeleteRequestSchema = z
  .object({ expected_revision: z.number().int().nonnegative() })
  .strict();

export const farmActionListReadSuccessSchema = z
  .object({ lists: z.array(farmActionListSchema), server_time: z.iso.datetime() })
  .strict();
export const farmActionListMutationSuccessSchema = z
  .object({ list: farmActionListSchema, server_time: z.iso.datetime() })
  .strict();
export const farmActionListNotifySuccessSchema = farmActionListMutationSuccessSchema.extend({
  notification_status: z.enum(["sent", "all_crossed"]),
});
export const farmActionListOptionsSuccessSchema = z
  .object({
    activities: z.array(
      z
        .object({
          activity_id: nonEmptyText,
          name: nonEmptyText,
          completed: z.boolean(),
        })
        .strict(),
    ),
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmActionListErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "revision_conflict",
  "idempotency_conflict",
  "unsupported_item",
  "authority_unavailable",
  "notification_unavailable",
]);

export const farmActionListErrorSchema = z
  .object({
    error: z
      .object({
        code: farmActionListErrorCodeSchema,
        message: z.string(),
        current_revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export type FarmActionListSchedule = z.infer<typeof farmActionListScheduleSchema>;
export type FarmActionListItem = z.infer<typeof farmActionListItemSchema>;
export type FarmActionListItemKind = z.infer<typeof farmActionListItemKindSchema>;
export type FarmActionListItemView = z.infer<typeof farmActionListItemViewSchema>;
export type FarmActionList = z.infer<typeof farmActionListSchema>;
export type FarmActionListCreateRequest = z.infer<typeof farmActionListCreateRequestSchema>;
export type FarmActionListUpdateRequest = z.infer<typeof farmActionListUpdateRequestSchema>;
export type FarmActionListActivityOption = z.infer<
  typeof farmActionListOptionsSuccessSchema
>["activities"][number];
