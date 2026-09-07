import { z } from "zod";

const itemId = z.string().regex(/^farm_decor:[a-z_]+$/);
const point = { x: z.number(), z: z.number(), rotation: z.number() };
export const farmDecorationLayoutSchema = z.object({
  roof: z.string(),
  stall: z.object(point).strict(),
  decorations: z.array(z.object({ instance_id: z.uuid(), item_id: itemId, ...point }).strict()),
}).strict();
export const farmDecorationsDataSchema = z.object({
  catalog: z.array(z.object({
    item_id: itemId, model_id: z.string(), name: z.string(),
    cells: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    layer: z.enum(["ground", "furniture"]), purchase_mode: z.enum(["unlock", "unit"]),
    price_farm_coins: z.number().int().nonnegative(),
  }).strict()),
  inventory: z.array(z.object({
    item_id: itemId, owned_quantity: z.number().int().nonnegative(),
    placed_quantity: z.number().int().nonnegative(),
    available_quantity: z.number().int().nonnegative().nullable(), unlocked: z.boolean(),
  }).strict()),
  layout: farmDecorationLayoutSchema,
  coins: z.number().int().nonnegative(),
  grid: z.object({
    cell_size: z.number().positive(), z_origin: z.number(),
    land_cells: z.array(z.tuple([z.number(), z.number()])),
    river_cells: z.array(z.tuple([z.number(), z.number()])),
  }).strict(),
  environment: z.object({
    status: z.enum(["active", "inactive"]),
    season: z.object({ id: z.string(), name: z.string() }).strict().nullable(),
    weather: z.object({ condition: z.string() }).strict().nullable(),
    night: z.number().min(0).max(1),
    disaster: z.object({ type: z.string(), phase: z.string() }).strict().nullable(),
  }).strict(),
}).strict();
const resourceMetadata = { revision: z.string().min(1), server_time: z.iso.datetime() };
export const boundFarmDecorationsReadSuccessSchema = z.object({ data: farmDecorationsDataSchema, ...resourceMetadata }).strict();
export const boundFarmDecorationLayoutSaveRequestSchema = z.object({
  idempotency_key: z.uuid(), expected_revision: z.string().min(1), layout: farmDecorationLayoutSchema,
}).strict();
export const boundFarmDecorationLayoutSaveSuccessSchema = z.object({
  data: z.object({ result: z.object({ receipt_id: z.string().min(1) }).strict(), resource: farmDecorationsDataSchema }).strict(),
  ...resourceMetadata,
}).strict();
export const boundFarmDecorationLayoutSaveErrorSchema = z.object({ error: z.object({
  code: z.enum([
    "invalid_request", "authentication_required", "qq_not_group_member", "onebot_unavailable",
    "registration_profile_required", "farm_credential_not_found", "farm_doorplate_mismatch",
    "farm_credential_invalid", "farm_not_found", "farm_unavailable", "upstream_contract_unavailable",
    "state_conflict", "idempotency_conflict", "invalid_layout", "invalid_stall_position", "invalid_instance",
    "decoration_not_owned", "decoration_quantity_exceeded", "invalid_decoration_position",
  ]), message: z.string(), current_revision: z.string().optional(),
}).strict() }).strict();
export type FarmDecorationsData = z.infer<typeof farmDecorationsDataSchema>;
export type FarmDecorationLayout = z.infer<typeof farmDecorationLayoutSchema>;
export type BoundFarmDecorationsReadSuccess = z.infer<typeof boundFarmDecorationsReadSuccessSchema>;
export type BoundFarmDecorationLayoutSaveRequest = z.infer<typeof boundFarmDecorationLayoutSaveRequestSchema>;
export type BoundFarmDecorationLayoutSaveSuccess = z.infer<typeof boundFarmDecorationLayoutSaveSuccessSchema>;
export type BoundFarmDecorationLayoutSaveError = z.infer<typeof boundFarmDecorationLayoutSaveErrorSchema>;
