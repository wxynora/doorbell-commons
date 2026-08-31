import { z } from "zod";
import { farmCatalogDoorplateSchema, farmCatalogHumanKeySchema } from "./farm-catalog.js";

export const farmActionListAuthorityReadRequestSchema = z
  .object({
    farm_human_key: farmCatalogHumanKeySchema,
    expected_farm_doorplate: farmCatalogDoorplateSchema,
  })
  .strict();

export const farmActionListAuthorityReadSuccessSchema = z
  .object({
    data: z
      .object({
        farm: z
          .object({
            farm_doorplate: farmCatalogDoorplateSchema,
          })
          .strict(),
        steal: z
          .object({
            status: z.literal("available"),
            targets: z.array(
              z
                .object({
                  target: z.string().regex(/^(?:0|[1-9]\d*)$/u),
                  farm_name: z.string().min(1),
                  ripe_plot_ids: z.array(z.number().int().positive()),
                })
                .strict(),
            ),
          })
          .strict(),
        fishing: z
          .object({
            status: z.literal("available"),
            daily_limit: z.number().int().nonnegative(),
            used_today: z.number().int().nonnegative(),
            remaining_today: z.number().int().nonnegative(),
            available_baits: z.array(
              z
                .object({
                  bait_id: z.string().min(1),
                  name: z.string().min(1),
                  quantity: z.number().int().nonnegative(),
                })
                .strict(),
            ),
          })
          .strict(),
        activities: z.array(
          z
            .object({
              activity_id: z.string().min(1),
              name: z.string().min(1),
              completed: z.boolean(),
              call: z
                .object({
                  op: z.string().min(1),
                  args: z.record(z.string(), z.unknown()),
                })
                .strict(),
            })
            .strict(),
        ),
      })
      .strict(),
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmActionListAuthorityReadErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "invalid_request",
          "authentication_required",
          "farm_credential_not_found",
          "farm_doorplate_mismatch",
          "farm_not_found",
          "farm_unavailable",
          "upstream_contract_unavailable",
        ]),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type FarmActionListAuthorityReadSuccess = z.infer<
  typeof farmActionListAuthorityReadSuccessSchema
>;
