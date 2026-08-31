import { z } from "zod";

export * from "./farm-bulletin.js";
export * from "./farm-catalog.js";
export * from "./farm-constable-interview.js";
export * from "./farm-crop-codex-action.js";
export * from "./farm-expedition-action.js";
export * from "./farm-harvest-request.js";
export * from "./farm-kitchen.js";
export * from "./farm-kitchen-cook.js";
export * from "./farm-kitchen-inventory-action.js";
export * from "./farm-kitchen-purchase.js";
export * from "./farm-kitchen-shop-open.js";
export * from "./farm-kitchen-shop-refresh.js";
export * from "./farm-market-action.js";
export * from "./farm-neighborhood-message-action.js";
export * from "./farm-original-plant-action.js";
export * from "./farm-plant-request.js";
export * from "./farm-purchase-request.js";
export * from "./farm-ranch.js";
export * from "./farm-ranch-action.js";
export * from "./farm-ranch-collection.js";
export * from "./farm-ranch-decoration-action.js";
export * from "./farm-ranch-interaction-action.js";
export * from "./farm-settings-action.js";
export * from "./farm-shop-open.js";
export * from "./farm-smelting-action.js";
export * from "./lingye-action.js";

export const serviceHealthSchema = z.object({
  service: z.literal("doorbell-commons"),
  status: z.literal("ok"),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

const qqIdentifierSchema = z.string().regex(/^[1-9][0-9]*$/);

export const qqGroupEligibilityRequestSchema = z
  .object({
    qq_number: qqIdentifierSchema,
  })
  .strict();

export const qqGroupEligibilitySuccessSchema = z
  .object({
    eligible: z.literal(true),
    qq_number: qqIdentifierSchema,
    group_id: qqIdentifierSchema,
  })
  .strict();

export const qqGroupEligibilityErrorCodeSchema = z.enum([
  "invalid_request",
  "qq_not_group_member",
  "onebot_unavailable",
]);

export const qqGroupEligibilityErrorSchema = z
  .object({
    error: z
      .object({
        code: qqGroupEligibilityErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type QqGroupEligibilityRequest = z.infer<typeof qqGroupEligibilityRequestSchema>;
export type QqGroupEligibilitySuccess = z.infer<typeof qqGroupEligibilitySuccessSchema>;
export type QqGroupEligibilityError = z.infer<typeof qqGroupEligibilityErrorSchema>;

export const registrationCodeSchema = z
  .string()
  .regex(/^DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);

export const farmDoorplateSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
export const farmHumanKeySchema = z.string().min(1);
export const farmHumanUrlSchema = z.string();

const storedDisplayNameSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "must not contain only whitespace",
});

export const farmLookupRequestSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmLookupSuccessSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
    farm_name: z.string(),
  })
  .strict();

export const farmLookupErrorCodeSchema = z.enum([
  "invalid_request",
  "farm_not_found",
  "farm_unavailable",
]);

export const farmLookupErrorSchema = z
  .object({
    error: z
      .object({
        code: farmLookupErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundFarmOverviewRequestSchema = z.object({}).strict();

export const boundFarmPlotSchema = z
  .object({
    plot_id: z.number().int().positive(),
    state: z.enum(["empty", "growing", "ripe"]),
    seed_type: z.string().nullable(),
    watered: z.number().int().nonnegative(),
  })
  .strict();

export const boundFarmOverviewSuccessSchema = z
  .object({
    farm: z
      .object({
        farm_doorplate: farmDoorplateSchema,
        farm_name: z.string(),
        plots: z.array(boundFarmPlotSchema),
      })
      .strict(),
  })
  .strict();

export const boundFarmOverviewErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_not_publicly_readable",
  "farm_unavailable",
]);

export const boundFarmOverviewErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmOverviewErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const boundFarmFieldRequestSchema = z.object({}).strict();

export const farmFieldCropIdentitySchema = z
  .object({
    crop_id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(["common", "fantasy", "limited", "ugc"]),
  })
  .strict();

export const farmFieldPlotSchema = z
  .object({
    plot_id: z.number().int().positive(),
    state: z.enum(["empty", "growing", "ripe"]),
    seed_type: z.enum(["common", "fantasy", "limited"]).nullable(),
    watered: z.number().int().nonnegative(),
    progress: z
      .object({
        current: z.number().int().nonnegative(),
        total: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    matures_at: z.iso.datetime().nullable(),
    identity_state: z.enum(["empty", "hidden", "known", "unavailable"]),
    crop_identity: farmFieldCropIdentitySchema.nullable(),
  })
  .strict()
  .superRefine((plot, context) => {
    if (plot.progress !== null && plot.progress.current > plot.progress.total) {
      context.addIssue({
        code: "custom",
        path: ["progress", "current"],
        message: "current progress must not exceed total progress",
      });
    }

    if (plot.state === "empty") {
      for (const [path, value] of [
        ["seed_type", plot.seed_type],
        ["progress", plot.progress],
        ["matures_at", plot.matures_at],
        ["crop_identity", plot.crop_identity],
      ] as const) {
        if (value !== null) {
          context.addIssue({
            code: "custom",
            path: [path],
            message: `${path} must be null for an empty plot`,
          });
        }
      }
      if (plot.identity_state !== "empty") {
        context.addIssue({
          code: "custom",
          path: ["identity_state"],
          message: "an empty plot must use the empty identity state",
        });
      }
      return;
    }

    if (plot.seed_type === null) {
      context.addIssue({
        code: "custom",
        path: ["seed_type"],
        message: "a planted plot must expose its seed type",
      });
    }
    if (plot.progress === null) {
      context.addIssue({
        code: "custom",
        path: ["progress"],
        message: "a planted plot must expose its growth progress",
      });
    }
    if (plot.state === "growing" && plot.matures_at === null) {
      context.addIssue({
        code: "custom",
        path: ["matures_at"],
        message: "a growing plot must expose its expected maturity time",
      });
    }
    if (plot.state === "ripe" && plot.matures_at !== null) {
      context.addIssue({
        code: "custom",
        path: ["matures_at"],
        message: "a ripe plot must not expose a future maturity time",
      });
    }
    if (plot.identity_state === "empty") {
      context.addIssue({
        code: "custom",
        path: ["identity_state"],
        message: "a planted plot cannot use the empty identity state",
      });
    }
    if (plot.identity_state === "hidden" && plot.crop_identity !== null) {
      context.addIssue({
        code: "custom",
        path: ["crop_identity"],
        message: "a hidden crop identity must remain null",
      });
    }
    if (plot.identity_state === "unavailable" && plot.crop_identity !== null) {
      context.addIssue({
        code: "custom",
        path: ["crop_identity"],
        message: "an unavailable crop identity must remain null",
      });
    }
    if (plot.identity_state === "known" && plot.crop_identity === null) {
      context.addIssue({
        code: "custom",
        path: ["crop_identity"],
        message: "a known crop identity must include its stable identity",
      });
    }
    if (
      (plot.seed_type === "common" || plot.seed_type === "fantasy") &&
      plot.identity_state !== "hidden"
    ) {
      context.addIssue({
        code: "custom",
        path: ["identity_state"],
        message: "common and fantasy crop identities stay hidden until harvest",
      });
    }
    if (
      plot.seed_type === "limited" &&
      plot.identity_state !== "known" &&
      plot.identity_state !== "unavailable"
    ) {
      context.addIssue({
        code: "custom",
        path: ["identity_state"],
        message: "limited and original crops must expose or explicitly mark their stored identity",
      });
    }
    if (
      plot.seed_type === "limited" &&
      plot.crop_identity !== null &&
      plot.crop_identity.category !== "limited" &&
      plot.crop_identity.category !== "ugc"
    ) {
      context.addIssue({
        code: "custom",
        path: ["crop_identity", "category"],
        message: "a limited seed must identify a limited or original crop",
      });
    }
    if (
      plot.crop_identity !== null &&
      (plot.crop_identity.category === "limited" || plot.crop_identity.category === "ugc") &&
      plot.seed_type !== "limited"
    ) {
      context.addIssue({
        code: "custom",
        path: ["seed_type"],
        message: "limited and original crops must use the limited seed type",
      });
    }
  });

export const farmEnvironmentSeasonIdSchema = z.enum(["spring", "summer", "autumn", "winter"]);

export const farmWeatherConditionSchema = z.enum([
  "sunny",
  "cloudy",
  "light_rain",
  "heavy_rain",
  "thunderstorm",
  "fog",
  "hot",
  "dry_wind",
  "light_snow",
  "blizzard",
]);

export const farmFieldLandUpgradeSchema = z
  .object({
    tier: z.number().int().positive(),
    name: z.string().min(1),
    plots: z.number().int().positive(),
    cost_farm_coins: z.number().int().nonnegative(),
    can_upgrade: z.boolean(),
    status_message: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((upgrade, context) => {
    if (upgrade.can_upgrade !== (upgrade.status_message === null)) {
      context.addIssue({
        code: "custom",
        path: ["status_message"],
        message: "an available upgrade must not include a blocking status message",
      });
    }
  });

export const farmFieldDataSchema = z
  .object({
    farm: z
      .object({
        farm_doorplate: farmDoorplateSchema,
        farm_name: z.string().min(1),
        welcome_message: z.string().nullable(),
        equipped_title: z
          .object({
            title_id: z.string().min(1),
            name: z.string().min(1),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    balance: z
      .object({
        farm_coins: z.number().int().nonnegative(),
      })
      .strict(),
    season: z
      .object({
        id: farmEnvironmentSeasonIdSchema,
        name: z.string().min(1),
      })
      .strict(),
    weather: z
      .object({
        condition: farmWeatherConditionSchema,
      })
      .strict()
      .nullable(),
    land: z
      .object({
        tier: z.number().int().positive(),
        name: z.string().min(1),
        // Optional only for the one rolling-deploy window in which the prior
        // Farm projection is still live. The browser exposes no upgrade action
        // until Farm supplies both authoritative fields.
        is_max_tier: z.boolean().optional(),
        next_upgrade: farmFieldLandUpgradeSchema.nullable().optional(),
      })
      .strict()
      .superRefine((land, context) => {
        const hasMaximum = land.is_max_tier !== undefined;
        const hasNext = land.next_upgrade !== undefined;
        if (hasMaximum !== hasNext) {
          context.addIssue({
            code: "custom",
            message: "land upgrade facts must be supplied together",
          });
          return;
        }
        if (!hasMaximum || !hasNext) {
          return;
        }
        if (land.is_max_tier !== (land.next_upgrade === null)) {
          context.addIssue({
            code: "custom",
            path: ["is_max_tier"],
            message: "maximum land must not expose a next upgrade",
          });
        }
        if (land.next_upgrade && land.next_upgrade.tier !== land.tier + 1) {
          context.addIssue({
            code: "custom",
            path: ["next_upgrade", "tier"],
            message: "the next land upgrade must advance exactly one tier",
          });
        }
      }),
    plots: z.array(farmFieldPlotSchema),
    harvest_assist: z
      .object({
        daily_limit: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
        mature_plot_count: z.number().int().nonnegative(),
        can_assist: z.boolean(),
        reset_at: z.iso.datetime(),
      })
      .strict()
      .superRefine((assist, context) => {
        if (assist.remaining > assist.daily_limit) {
          context.addIssue({
            code: "custom",
            path: ["remaining"],
            message: "remaining assists must not exceed the daily limit",
          });
        }
        if (assist.can_assist && (assist.remaining === 0 || assist.mature_plot_count === 0)) {
          context.addIssue({
            code: "custom",
            path: ["can_assist"],
            message: "an available assist requires both quota and mature plots",
          });
        }
      }),
  })
  .strict();

export const farmHumanFieldReadSuccessSchema = z
  .object({
    data: farmFieldDataSchema,
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmFieldSuccessSchema = farmHumanFieldReadSuccessSchema;

export const boundFarmFieldErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundFarmFieldErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmFieldErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const farmHumanFieldReadRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmHumanFieldReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanFieldReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanFieldReadErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const qixiLanternAppearanceSchema = z
  .object({
    shape: z.enum(["square-palace", "octagonal-palace", "lotus-palace"]),
    color: z.enum(["moon-white", "peach-pink", "mist-blue", "apricot-gold"]),
    pattern: z.enum(["none", "star-speckle", "qiaoguo-pattern", "river-glow", "magpie-bridge"]),
    ornament: z.enum([
      "none",
      "short-tassel",
      "fine-copper-bell",
      "magpie-ribbon",
      "twin-jade-pendant",
    ]),
    seal: z.enum(["none", "cotton-knot", "waterproof-seal", "cloud-knot", "twin-blossom-seal"]),
  })
  .strict();

export const qixiMemorialSideSchema = z
  .object({
    letter: z.string(),
    lantern: qixiLanternAppearanceSchema,
  })
  .strict();

export const farmHumanQixiMemorialReadSuccessSchema = z
  .object({
    subject: z.object({ farm_doorplate: farmDoorplateSchema }).strict(),
    data: z
      .object({
        event_id: z.literal("qixi-lantern-2026"),
        human_name: storedDisplayNameSchema,
        ai_name: storedDisplayNameSchema,
        human: qixiMemorialSideSchema,
        ai: qixiMemorialSideSchema,
      })
      .strict(),
    server_time: z.iso.datetime(),
  })
  .strict();

export const farmHumanQixiMemorialReadRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmHumanQixiMemorialReadErrorSchema = farmHumanFieldReadErrorSchema;
export const boundQixiMemorialReadRequestSchema = z.object({}).strict();
export const boundQixiMemorialReadSuccessSchema = z
  .object({
    data: z
      .object({
        human_name: storedDisplayNameSchema,
        ai_name: storedDisplayNameSchema,
        human: qixiMemorialSideSchema,
        ai: qixiMemorialSideSchema,
      })
      .strict(),
  })
  .strict();
export const boundQixiMemorialReadErrorSchema = boundFarmFieldErrorSchema;

const lingyeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const lingyeAssetKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const lingyeTextSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Lingye display text must not contain HTML or URLs",
  });
const lingyeShortTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[<>]/u.test(value) && !/(?:https?|javascript):/iu.test(value), {
    message: "Lingye display text must not contain HTML or URLs",
  });
const glimmerSetSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const glimmerSpriteIndexSchema = z.number().int().nonnegative().max(255);

export const farmGlimmerVariantSchema = z
  .object({
    id: lingyeIdSchema,
    name: lingyeShortTextSchema,
    atlas: lingyeAssetKeySchema,
    set: glimmerSetSchema,
    sprite_index: glimmerSpriteIndexSchema,
  })
  .strict();

export const farmGlimmerTrackSchema = z
  .object({
    revealed: z.boolean(),
    variant: farmGlimmerVariantSchema.nullable(),
  })
  .strict()
  .superRefine((track, context) => {
    if (track.revealed && track.variant === null) {
      context.addIssue({
        code: "custom",
        path: ["variant"],
        message: "a revealed Glimmer track must expose its stable variant",
      });
    }
    if (!track.revealed && track.variant !== null) {
      context.addIssue({
        code: "custom",
        path: ["variant"],
        message: "an unrevealed Glimmer track must hide its stable variant",
      });
    }
  });

const farmGlimmerCooperationSchema = z
  .object({
    event: z
      .object({
        id: lingyeIdSchema,
        name: lingyeShortTextSchema,
        requirement: lingyeShortTextSchema,
      })
      .strict(),
    progress: z
      .object({
        current: z.number().int().nonnegative(),
        target: z.number().int().positive(),
      })
      .strict(),
    completed: z.boolean(),
  })
  .strict();

const farmGlimmerPublicEventSchema = z
  .object({
    at: z.iso.datetime(),
    text: lingyeTextSchema,
  })
  .strict();

const farmGlimmerVariantEntrySchema = farmGlimmerVariantSchema
  .extend({ unlocked: z.boolean() })
  .strict();

const farmGlimmerEncounterSchema = z
  .object({
    id: lingyeIdSchema,
    name: lingyeShortTextSchema,
    seen: z.boolean(),
  })
  .strict();

const farmGlimmerAchievementSchema = z
  .object({
    id: lingyeIdSchema,
    name: lingyeShortTextSchema,
    progress: z
      .object({
        current: z.number().int().nonnegative(),
        target: z.number().int().positive(),
      })
      .strict(),
    rewarded: z.boolean(),
    reward: z
      .object({
        coins: z.number().int().nonnegative(),
        silver: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const farmGlimmerDataSchema = z
  .object({
    open: z.boolean(),
    status: lingyeTextSchema,
    season: lingyeShortTextSchema,
    capture_cooldown: z.object({ ready_at: z.iso.datetime() }).strict().nullable(),
    tracks: z.array(farmGlimmerTrackSchema).max(16),
    cooperation: farmGlimmerCooperationSchema.nullable(),
    events: z.array(farmGlimmerPublicEventSchema).max(10),
    variants: z.array(farmGlimmerVariantEntrySchema).max(128),
    encounters: z.array(farmGlimmerEncounterSchema).max(128),
    summary: z
      .object({
        encounters: z.number().int().nonnegative(),
        variants: z.number().int().nonnegative(),
        cooperations: z.number().int().nonnegative(),
      })
      .strict(),
    achievements: z.array(farmGlimmerAchievementSchema).max(128),
  })
  .strict();

export const farmHumanGlimmerReadSuccessSchema = z
  .object({
    subject: z.object({ farm_doorplate: farmDoorplateSchema }).strict(),
    data: farmGlimmerDataSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundGlimmerReadSuccessSchema = farmHumanGlimmerReadSuccessSchema;

export const boundGlimmerReadRequestSchema = z.object({}).strict();

export const farmHumanGlimmerReadRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmHumanGlimmerReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanGlimmerReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanGlimmerReadErrorCodeSchema,
        message: lingyeTextSchema,
      })
      .strict(),
  })
  .strict();

export const boundGlimmerReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundGlimmerReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundGlimmerReadErrorCodeSchema,
        message: lingyeTextSchema,
      })
      .strict(),
  })
  .strict();

export const farmTogetherPhaseSchema = z.enum([
  "choice",
  "task",
  "cooldown",
  "ended",
  "vote",
  "closed",
]);

const farmTogetherHistorySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("story"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("choice"),
      step: z.number().int().positive(),
      option: z.enum(["A", "B", "C"]),
      label: lingyeShortTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("task"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
      progress: z.number().int().nonnegative(),
      target: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clue"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("ending"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
    })
    .strict(),
]);

const farmTogetherArchiveHistorySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("story"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
      art_asset_key: lingyeAssetKeySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("task"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
      progress: z.number().int().nonnegative(),
      target: z.number().int().positive(),
      art_asset_key: lingyeAssetKeySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("clue"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
      art_asset_key: lingyeAssetKeySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("ending"),
      title: lingyeShortTextSchema,
      text: lingyeTextSchema,
      art_asset_key: lingyeAssetKeySchema,
    })
    .strict(),
]);

const farmTogetherArchiveSchema = z
  .object({
    story_id: lingyeIdSchema,
    title: lingyeShortTextSchema,
    round: z.number().int().positive(),
    art_asset_key: lingyeAssetKeySchema,
    history: z.array(farmTogetherArchiveHistorySchema).max(128),
  })
  .strict();

const farmTogetherTaskSchema = z
  .object({
    id: lingyeIdSchema,
    title: lingyeShortTextSchema,
    text: lingyeTextSchema,
    progress: z.number().int().nonnegative(),
    target: z.number().int().positive(),
  })
  .strict();

const farmTogetherChoiceSchema = z
  .object({
    index: z.number().int().positive().nullable(),
    title: lingyeShortTextSchema,
    options: z
      .array(
        z
          .object({
            key: z.enum(["A", "B", "C"]),
            label: lingyeTextSchema,
          })
          .strict(),
      )
      .min(2)
      .max(3),
    counts: z
      .object({
        A: z.number().int().nonnegative(),
        B: z.number().int().nonnegative(),
        C: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((choice, context) => {
    const keys = choice.options.map((option) => option.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "a public choice must not repeat an option key",
      });
    }
  });

const farmTogetherCooldownSchema = z
  .object({
    text: lingyeTextSchema,
    ready_at: z.iso.datetime(),
    ready_text: lingyeShortTextSchema,
  })
  .strict();

const farmTogetherEndingSchema = z
  .object({
    id: lingyeIdSchema,
    title: lingyeShortTextSchema,
    text: lingyeTextSchema,
  })
  .strict();

const farmTogetherClueIdSchema = z.union([
  lingyeIdSchema,
  z
    .string()
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*:[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._-]*$/),
]);

const farmTogetherClueSchema = z
  .object({
    id: farmTogetherClueIdSchema,
    title: lingyeShortTextSchema,
    text: lingyeTextSchema,
  })
  .strict();

export const farmTogetherDataSchema = z
  .object({
    story_id: lingyeIdSchema,
    title: lingyeShortTextSchema,
    round: z.number().int().positive(),
    phase: farmTogetherPhaseSchema,
    status: lingyeTextSchema,
    stage: z
      .object({
        index: z.number().int().positive(),
        total: z.number().int().positive(),
        name: lingyeShortTextSchema,
      })
      .strict(),
    art_asset_key: lingyeAssetKeySchema,
    history: z.array(farmTogetherHistorySchema).max(128),
    archives: z.array(farmTogetherArchiveSchema).max(12),
    current_task: farmTogetherTaskSchema.nullable(),
    current_choice: farmTogetherChoiceSchema.nullable(),
    cooldown: farmTogetherCooldownSchema.nullable(),
    ending: farmTogetherEndingSchema.nullable(),
    clues: z.array(farmTogetherClueSchema).max(32),
  })
  .strict();

export const farmHumanTogetherReadSuccessSchema = z
  .object({
    subject: z.object({ farm_doorplate: farmDoorplateSchema }).strict(),
    data: farmTogetherDataSchema,
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundTogetherReadSuccessSchema = farmHumanTogetherReadSuccessSchema;

export const boundTogetherReadRequestSchema = z.object({}).strict();

export const farmHumanTogetherReadRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmHumanTogetherReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanTogetherReadErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanTogetherReadErrorCodeSchema,
        message: lingyeTextSchema,
      })
      .strict(),
  })
  .strict();

export const boundTogetherReadErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundTogetherReadErrorSchema = z
  .object({
    error: z
      .object({
        code: boundTogetherReadErrorCodeSchema,
        message: lingyeTextSchema,
      })
      .strict(),
  })
  .strict();

export const farmHumanFieldHarvestAssistIdempotencyKeySchema = z.uuid();

export const farmHumanFieldHarvestAssistRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmHumanFieldHarvestAssistIdempotencyKeySchema,
    expected_revision: z.string().min(1),
    payload: z.object({}).strict(),
  })
  .strict();

export const boundFarmHarvestAssistRequestSchema = z.object({}).strict();

const farmHarvestItemDropSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();

export const farmHumanFieldHarvestAssistResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    harvested_count: z.number().int().positive(),
    farm_coins_gained: z.number().int().nonnegative(),
    silver_gained: z.number().int().nonnegative(),
    harvests: z
      .array(
        z
          .object({
            plot_id: z.number().int().positive().nullable(),
            crop: z
              .object({
                crop_id: z.string().min(1),
                name: z.string().min(1),
                category: z.enum(["common", "fantasy", "limited", "ugc"]),
                rarity: z.enum(["N", "R", "SR", "SSR", "SP", "OR"]),
              })
              .strict(),
            quality: z
              .object({
                id: z.string().min(1).optional(),
                name: z.string().min(1),
              })
              .strict()
              .nullable(),
            value: z.number().int().nonnegative(),
            currency: z.enum(["gold", "silver"]),
            is_new: z.boolean(),
            material_drop: farmHarvestItemDropSchema.nullable(),
            potion_drop: farmHarvestItemDropSchema.nullable(),
            bonus_value: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    season_event: z
      .object({
        id: z.string().min(1),
        label: z.string().min(1),
      })
      .strict()
      .nullable(),
    new_titles: z.array(
      z
        .object({
          title_id: z.string().min(1),
          name: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.harvested_count !== result.harvests.length) {
      context.addIssue({
        code: "custom",
        path: ["harvested_count"],
        message: "harvested_count must equal the number of harvest receipts",
      });
    }
  });

export const farmHumanFieldHarvestAssistResourceSchema = farmFieldDataSchema;

export const farmHumanFieldHarvestAssistSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanFieldHarvestAssistResultSchema,
        resource: farmHumanFieldHarvestAssistResourceSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict();

export const boundFarmHarvestAssistSuccessSchema = farmHumanFieldHarvestAssistSuccessSchema;
export const boundFarmHarvestAssistResultSchema = farmHumanFieldHarvestAssistResultSchema;
export const boundFarmHarvestAssistResourceSchema = farmHumanFieldHarvestAssistResourceSchema;

export const farmHumanFieldHarvestAssistErrorCodeSchema = z.enum([
  "harvest_assist_exhausted",
  "no_ripe_plots",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanFieldHarvestAssistErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanFieldHarvestAssistErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmHarvestAssistErrorCodeSchema = z.enum([
  "harvest_assist_exhausted",
  "no_ripe_plots",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundFarmHarvestAssistErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmHarvestAssistErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const farmHumanFieldLandUpgradeIdempotencyKeySchema = z.uuid();

export const farmHumanFieldLandUpgradeRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    idempotency_key: farmHumanFieldLandUpgradeIdempotencyKeySchema,
    expected_revision: z.string().min(1),
    payload: z.object({}).strict(),
  })
  .strict();

export const boundFarmLandUpgradeRequestSchema = z.object({}).strict();

const farmLandSnapshotSchema = z
  .object({
    tier: z.number().int().positive(),
    name: z.string().min(1),
    plots: z.number().int().positive(),
  })
  .strict();

export const farmHumanFieldLandUpgradeResultSchema = z
  .object({
    receipt_id: z.string().min(1),
    previous_land: farmLandSnapshotSchema,
    upgraded_land: farmLandSnapshotSchema,
    farm_coins_spent: z.number().int().nonnegative(),
    message: z.string().min(1),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.upgraded_land.tier !== result.previous_land.tier + 1 ||
      result.upgraded_land.plots <= result.previous_land.plots
    ) {
      context.addIssue({
        code: "custom",
        path: ["upgraded_land"],
        message: "a land upgrade must advance one tier and add plots",
      });
    }
  });

export const farmHumanFieldLandUpgradeSuccessSchema = z
  .object({
    data: z
      .object({
        result: farmHumanFieldLandUpgradeResultSchema,
        resource: farmFieldDataSchema,
      })
      .strict(),
    revision: z.string().min(1),
    server_time: z.iso.datetime(),
  })
  .strict()
  .superRefine((success, context) => {
    const { result, resource } = success.data;
    if (
      resource.land.tier !== result.upgraded_land.tier ||
      resource.land.name !== result.upgraded_land.name ||
      resource.plots.length !== result.upgraded_land.plots
    ) {
      context.addIssue({
        code: "custom",
        path: ["data", "resource", "land"],
        message: "the replacement field must match the upgraded land receipt",
      });
    }
  });

export const boundFarmLandUpgradeSuccessSchema = farmHumanFieldLandUpgradeSuccessSchema;

export const farmHumanFieldLandUpgradeErrorCodeSchema = z.enum([
  "land_upgrade_rejected",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_credential_invalid",
  "farm_not_found",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanFieldLandUpgradeErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanFieldLandUpgradeErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const boundFarmLandUpgradeErrorCodeSchema = z.enum([
  "land_upgrade_rejected",
  "state_conflict",
  "idempotency_conflict",
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_not_found",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const boundFarmLandUpgradeErrorSchema = z
  .object({
    error: z
      .object({
        code: boundFarmLandUpgradeErrorCodeSchema,
        message: z.string(),
        current_revision: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const humanPasswordSchema = z.string().min(8).max(128);

const returningHumanSessionRequestSchema = z
  .object({
    qq_number: qqIdentifierSchema,
    password: humanPasswordSchema,
  })
  .strict();

const firstHumanSessionStartRequestSchema = z
  .object({
    qq_number: qqIdentifierSchema,
    registration_code: registrationCodeSchema,
  })
  .strict();

const firstHumanSessionRequestSchema = firstHumanSessionStartRequestSchema.extend({
  password: humanPasswordSchema,
  resident_name: storedDisplayNameSchema,
  home_name: storedDisplayNameSchema,
  farm_doorplate: farmDoorplateSchema,
  farm_human_url: farmHumanUrlSchema,
  confirmed_farm_name: z.string(),
});

const firstHumanSessionFarmCreationRequestSchema = firstHumanSessionStartRequestSchema.extend({
  password: humanPasswordSchema,
  resident_name: storedDisplayNameSchema,
  home_name: storedDisplayNameSchema,
  farm_name: storedDisplayNameSchema,
  ai_name: storedDisplayNameSchema,
});

const additionalExistingFarmProfileRequestSchema = z
  .object({
    resident_name: storedDisplayNameSchema,
    home_name: storedDisplayNameSchema,
    farm_doorplate: farmDoorplateSchema,
    farm_human_url: farmHumanUrlSchema,
    confirmed_farm_name: z.string(),
  })
  .strict();

const additionalCreatedFarmProfileRequestSchema = z
  .object({
    resident_name: storedDisplayNameSchema,
    home_name: storedDisplayNameSchema,
    farm_name: storedDisplayNameSchema,
    ai_name: storedDisplayNameSchema,
  })
  .strict();

export const additionalHumanProfileRequestSchema = z.union([
  additionalExistingFarmProfileRequestSchema,
  additionalCreatedFarmProfileRequestSchema,
]);

export const humanSessionRequestSchema = z.union([
  firstHumanSessionRequestSchema,
  firstHumanSessionFarmCreationRequestSchema,
  firstHumanSessionStartRequestSchema,
  returningHumanSessionRequestSchema,
]);

export const humanAccountSchema = z
  .object({
    account_id: z.string().uuid(),
    qq_number: qqIdentifierSchema,
    created_at: z.string(),
    membership_status: z.literal("active"),
  })
  .strict();

export const residentSchema = z
  .object({
    resident_id: z.string().uuid(),
    resident_name: z.string(),
  })
  .strict();

export const homeSchema = z
  .object({
    home_id: z.string().uuid(),
    home_name: z.string(),
  })
  .strict();

export const farmBindingSchema = z
  .object({
    farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const humanProfileSummarySchema = z
  .object({
    profile_id: z.string().uuid(),
    resident_name: z.string(),
    home_name: z.string(),
    farm_doorplate: farmDoorplateSchema,
  })
  .strict();

const humanProfileSelectionSchema = {
  active_profile_id: z.string().uuid(),
  profiles: z.array(humanProfileSummarySchema).min(1),
};

export const humanProfileSwitchRequestSchema = z.object({ profile_id: z.string().uuid() }).strict();

const humanSessionSuccessBaseSchema = z
  .object({
    authenticated: z.literal(true),
    account_created: z.boolean(),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
    ...humanProfileSelectionSchema,
  })
  .strict();

export const humanSessionSuccessSchema = humanSessionSuccessBaseSchema.refine(
  (value) => value.profiles.some((profile) => profile.profile_id === value.active_profile_id),
  { message: "active_profile_id must reference one returned profile", path: ["active_profile_id"] },
);

export const createdFarmHumanSessionSuccessSchema = humanSessionSuccessBaseSchema
  .extend({
    created_farm: z
      .object({
        farm_doorplate: farmDoorplateSchema,
        farm_name: z.string(),
        ai_name: z.string(),
        farm_human_url: farmHumanUrlSchema,
      })
      .strict(),
  })
  .refine(
    (value) => value.profiles.some((profile) => profile.profile_id === value.active_profile_id),
    {
      message: "active_profile_id must reference one returned profile",
      path: ["active_profile_id"],
    },
  );

export const currentHumanSessionSuccessSchema = z
  .object({
    authenticated: z.literal(true),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
    ...humanProfileSelectionSchema,
  })
  .strict()
  .refine(
    (value) => value.profiles.some((profile) => profile.profile_id === value.active_profile_id),
    {
      message: "active_profile_id must reference one returned profile",
      path: ["active_profile_id"],
    },
  );

export const humanLogoutSuccessSchema = z
  .object({
    logged_out: z.literal(true),
  })
  .strict();

export const mailboxCategoryValues = ["system", "farm", "lingye"] as const;
export const mailboxCategorySchema = z.enum(mailboxCategoryValues);
export type MailboxCategory = z.infer<typeof mailboxCategorySchema>;

export const mailboxAttachmentSchema = z
  .object({
    attachment_type: z.literal("farm_reward"),
    status: z.enum(["available", "claimed"]),
  })
  .strict();

export const mailboxListRequestSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    category: mailboxCategorySchema.optional(),
  })
  .strict();

export const mailboxDetailRequestSchema = z
  .object({
    letter_id: z.string().uuid(),
  })
  .strict();

export const mailboxClaimBodySchema = z.object({}).strict();

export const mailboxLetterSummarySchema = z
  .object({
    letter_id: z.string().uuid(),
    title: z.string(),
    category: mailboxCategorySchema,
    created_at: z.iso.datetime(),
    is_new: z.boolean(),
    attachment: mailboxAttachmentSchema.nullable(),
  })
  .strict();

export const mailboxLetterDetailSchema = mailboxLetterSummarySchema.extend({
  body: z.string(),
});

export const mailboxListSuccessSchema = z
  .object({
    letters: z.array(mailboxLetterSummarySchema),
    pagination: z
      .object({
        page: z.number().int().positive(),
        page_size: z.literal(8),
        total_items: z.number().int().nonnegative(),
        total_pages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const mailboxDetailSuccessSchema = z
  .object({
    letter: mailboxLetterDetailSchema,
  })
  .strict();

export const mailboxErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "letter_not_found",
  "attachment_not_claimable",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const mailboxErrorSchema = z
  .object({
    error: z
      .object({
        code: mailboxErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const sharedMemeReadRequestSchema = z.object({}).strict();

export const sharedMemeIdSchema = z.coerce.number().int().positive();

const sharedMemeOptionalTextSchema = z.string().nullable();

export const sharedMemeEntrySchema = z
  .object({
    meme_id: sharedMemeIdSchema,
    term: z.string(),
    normalized_term: z.string(),
    category: sharedMemeOptionalTextSchema,
    type: sharedMemeOptionalTextSchema,
    meaning: sharedMemeOptionalTextSchema,
    usage: sharedMemeOptionalTextSchema,
    origin: sharedMemeOptionalTextSchema,
    notes: sharedMemeOptionalTextSchema,
    categories: z.array(z.string()),
    types: z.array(z.string()),
    aliases: z.array(z.string()),
    examples: z.array(z.string()),
    keywords: z.array(z.string()),
  })
  .strict();

export const sharedMemeLibraryMetadataSchema = z
  .object({
    library_version: z.number().int().positive(),
    snapshot_schema_version: z.literal(1),
    entry_count: z.number().int().nonnegative(),
    published_at: z.iso.datetime(),
    checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size_bytes: z.number().int().positive(),
  })
  .strict();

export const sharedMemeListSuccessSchema = z
  .object({
    library: sharedMemeLibraryMetadataSchema,
    memes: z.array(sharedMemeEntrySchema),
  })
  .strict();

export const sharedMemeDetailSuccessSchema = z
  .object({
    library_version: z.number().int().positive(),
    meme: sharedMemeEntrySchema,
  })
  .strict();

export const sharedMemeAddRequestSchema = z
  .object({
    term: z.string(),
    category: sharedMemeOptionalTextSchema.optional(),
    type: sharedMemeOptionalTextSchema.optional(),
    meaning: sharedMemeOptionalTextSchema.optional(),
    usage: sharedMemeOptionalTextSchema.optional(),
    origin: sharedMemeOptionalTextSchema.optional(),
    notes: sharedMemeOptionalTextSchema.optional(),
    aliases: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  })
  .strict();

export const sharedMemeAddSuccessSchema = z
  .object({
    created: z.literal(true),
    library: sharedMemeLibraryMetadataSchema,
    meme: sharedMemeEntrySchema,
  })
  .strict();

export const sharedMemeErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "shared_meme_not_found",
  "shared_meme_version_ahead",
  "duplicate_shared_meme_term",
  "duplicate_shared_meme_alias",
  "shared_meme_unavailable",
]);

export const sharedMemeErrorSchema = z
  .object({
    error: z
      .object({
        code: sharedMemeErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const lingyeDailyIssueDateSchema = z.iso.date();
export const lingyeDailyCoverageStatusSchema = z.enum(["complete", "partial"]);

export const lingyeDailyEventSourcesSchema = z.array(z.string().trim().min(1)).min(1);
export const lingyeDailyImageIdSchema = z.string().trim().min(1);
export const lingyeDailyImagePublishSchema = z
  .object({
    image_id: lingyeDailyImageIdSchema,
    media_type: z.string().regex(/^image\/[a-z0-9.+-]+$/iu),
    data_base64: z.string().min(1),
  })
  .strict();

export const lingyeDailyFrontPagePublishSchema = z
  .object({
    title: z.string().trim().min(1),
    paragraphs: z.array(z.string().trim().min(1)).min(1),
    source_event_ids: lingyeDailyEventSourcesSchema,
    image_ids: z.array(lingyeDailyImageIdSchema).default([]),
  })
  .strict();

export const lingyeDailyTopicPublishSchema = z
  .object({
    text: z.string().trim().min(1),
    source_event_ids: lingyeDailyEventSourcesSchema,
  })
  .strict();

export const lingyeDailyGroupChatPublishSchema = z
  .object({
    summary: z.string().trim().min(1),
    topics: z.array(lingyeDailyTopicPublishSchema),
  })
  .strict();

export const lingyeDailyBehaviorSlicePublishSchema = z
  .object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    source_event_ids: lingyeDailyEventSourcesSchema,
    image_ids: z.array(lingyeDailyImageIdSchema).default([]),
  })
  .strict();

export const lingyeDailyQuotePublishSchema = z
  .object({
    text: z.string().trim().min(1),
    source_label: z.string().trim().min(1),
    source_message_ids: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const lingyeDailyFarmMetricSchema = z
  .object({
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .strict();

export const lingyeDailyFarmObservationSchema = z
  .object({
    summary: z.string().trim().min(1).nullable(),
    metrics: z.array(lingyeDailyFarmMetricSchema),
  })
  .strict()
  .refine((value) => value.summary !== null || value.metrics.length > 0, {
    message: "farm_observation must contain a summary or metrics",
  });

export const lingyeDailySubmissionSchema = z
  .object({
    text: z.string().trim().min(1),
    source_label: z.string().trim().min(1),
  })
  .strict();

export const lingyeDailyTomorrowQuestionPublishSchema = z
  .object({
    text: z.string().trim().min(1),
    source_event_ids: lingyeDailyEventSourcesSchema,
  })
  .strict();

export const lingyeDailyEditionPublishSchema = z
  .object({
    front_page: lingyeDailyFrontPagePublishSchema.nullable(),
    group_chat: lingyeDailyGroupChatPublishSchema,
    behavior_slices: z.array(lingyeDailyBehaviorSlicePublishSchema),
    quotes: z.array(lingyeDailyQuotePublishSchema),
    farm_observation: lingyeDailyFarmObservationSchema.nullable(),
    submissions: z.array(lingyeDailySubmissionSchema),
    tomorrow_question: lingyeDailyTomorrowQuestionPublishSchema.nullable(),
    images: z.array(lingyeDailyImagePublishSchema).default([]),
  })
  .strict();

export const lingyeDailyPublishRequestSchema = z
  .object({
    issue_date: lingyeDailyIssueDateSchema,
    revision: z.number().int().positive(),
    revision_note: z.string().trim().min(1).nullable(),
    period_start: z.iso.datetime({ offset: true }),
    period_end: z.iso.datetime({ offset: true }),
    coverage_status: lingyeDailyCoverageStatusSchema,
    coverage_note: z.string(),
    generated_at: z.iso.datetime({ offset: true }),
    editor_model: z.string().trim().min(1),
    screening_model: z.string().trim().min(1),
    front_page: lingyeDailyFrontPagePublishSchema.nullable(),
    group_chat: lingyeDailyGroupChatPublishSchema,
    behavior_slices: z.array(lingyeDailyBehaviorSlicePublishSchema),
    quotes: z.array(lingyeDailyQuotePublishSchema),
    farm_observation: lingyeDailyFarmObservationSchema.nullable(),
    submissions: z.array(lingyeDailySubmissionSchema),
    tomorrow_question: lingyeDailyTomorrowQuestionPublishSchema.nullable(),
    images: z.array(lingyeDailyImagePublishSchema).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const imageIds = new Set<string>();
    for (const [index, image] of value.images.entries()) {
      if (imageIds.has(image.image_id)) {
        context.addIssue({
          code: "custom",
          message: "image_id must be unique within one issue",
          path: ["images", index, "image_id"],
        });
      }
      imageIds.add(image.image_id);
    }
    const sectionImageIds = [
      ...(value.front_page?.image_ids ?? []),
      ...value.behavior_slices.flatMap((slice) => slice.image_ids),
    ];
    if (sectionImageIds.some((imageId) => !imageIds.has(imageId))) {
      context.addIssue({
        code: "custom",
        message: "section image_ids must reference published images",
        path: ["images"],
      });
    }
    const issueDay = Date.parse(`${value.issue_date}T00:00:00Z`);
    const previousDate = new Date(issueDay - 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    const expectedPeriodStart = Date.parse(`${previousDate}T05:00:00+08:00`);
    const expectedPeriodEnd = Date.parse(`${value.issue_date}T04:59:59+08:00`);
    if (value.revision === 1 && value.revision_note !== null) {
      context.addIssue({
        code: "custom",
        message: "revision_note must be null for revision 1",
        path: ["revision_note"],
      });
    }
    if (value.revision > 1 && value.revision_note === null) {
      context.addIssue({
        code: "custom",
        message: "revision_note is required after revision 1",
        path: ["revision_note"],
      });
    }
    if (value.coverage_status === "complete" && value.coverage_note.trim() !== "") {
      context.addIssue({
        code: "custom",
        message: "coverage_note must be empty for complete coverage",
        path: ["coverage_note"],
      });
    }
    if (value.coverage_status === "partial" && value.coverage_note.trim() === "") {
      context.addIssue({
        code: "custom",
        message: "coverage_note is required for partial coverage",
        path: ["coverage_note"],
      });
    }
    if (
      Date.parse(value.period_start) !== expectedPeriodStart ||
      Date.parse(value.period_end) !== expectedPeriodEnd
    ) {
      context.addIssue({
        code: "custom",
        message: "period must cover the previous Beijing 05:00 through issue-day 04:59:59",
        path: ["period_start"],
      });
    }
    if (Date.parse(value.generated_at) < expectedPeriodEnd) {
      context.addIssue({
        code: "custom",
        message: "generated_at must not precede the completed issue period",
        path: ["generated_at"],
      });
    }
  });

export const lingyeDailyPublishSuccessSchema = z
  .object({
    published: z.literal(true),
    status: z.enum(["created", "revised", "duplicate"]),
    issue_date: lingyeDailyIssueDateSchema,
    issue_number: z.number().int().positive(),
    revision: z.number().int().positive(),
    published_at: z.iso.datetime(),
  })
  .strict();

export const lingyeDailyReadRequestSchema = z.object({}).strict();

export const lingyeDailyIssueSchema = z
  .object({
    issue_number: z.number().int().positive(),
    issue_date: lingyeDailyIssueDateSchema,
    revision: z.number().int().positive(),
    revision_note: z.string().nullable(),
    period_start: z.iso.datetime({ offset: true }),
    period_end: z.iso.datetime({ offset: true }),
    coverage_status: lingyeDailyCoverageStatusSchema,
    coverage_note: z.string(),
    generated_at: z.iso.datetime({ offset: true }),
    published_at: z.iso.datetime(),
    editor_model: z.string().min(1),
    front_page: lingyeDailyFrontPagePublishSchema
      .omit({ source_event_ids: true, image_ids: true })
      .extend({ image_urls: z.array(z.string().min(1)) })
      .nullable(),
    group_chat: z
      .object({
        summary: z.string().min(1),
        topics: z.array(z.string().min(1)),
      })
      .strict(),
    behavior_slices: z.array(
      lingyeDailyBehaviorSlicePublishSchema
        .omit({ source_event_ids: true, image_ids: true })
        .extend({ image_urls: z.array(z.string().min(1)) }),
    ),
    quotes: z.array(lingyeDailyQuotePublishSchema.omit({ source_message_ids: true })),
    farm_observation: lingyeDailyFarmObservationSchema.nullable(),
    submissions: z.array(lingyeDailySubmissionSchema),
    tomorrow_question: lingyeDailyTomorrowQuestionPublishSchema
      .omit({ source_event_ids: true })
      .nullable(),
  })
  .strict();

export const lingyeDailyReporterPublicationSchema = z
  .object({
    like_ref: z.string().trim().min(1),
    article_text: z.string().min(1),
    section_name: z.string().min(1).nullable(),
    author_name: z.string().min(1),
    author_farm_name: z.string().min(1).nullable(),
    published_at: z.number().int().nonnegative(),
    evaluation_closes_at: z.number().int().positive(),
    valid_likes: z.number().int().nonnegative(),
    has_liked: z.boolean(),
    can_like: z.boolean(),
    own_household: z.boolean(),
    status: z.enum(["open", "closed"]),
  })
  .strict();

export const lingyeDailyReporterPublicationsSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      items: z.array(lingyeDailyReporterPublicationSchema),
    })
    .strict(),
  z.object({ status: z.literal("unavailable") }).strict(),
]);

export const lingyeDailyLatestSuccessSchema = z
  .object({
    issue: lingyeDailyIssueSchema.nullable(),
    reporter_publications: lingyeDailyReporterPublicationsSchema.default({
      status: "unavailable",
    }),
  })
  .strict();

export const lingyeDailyLikeRequestSchema = z
  .object({ like_ref: z.string().trim().min(1) })
  .strict();

export const lingyeDailyLikeSuccessSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    valid_likes: z.number().int().nonnegative(),
    reporter_publications: lingyeDailyReporterPublicationsSchema,
  })
  .strict();

const farmHumanReporterIdentitySchema = z
  .object({
    farm_human_key: z.string().min(1),
    expected_farm_doorplate: farmDoorplateSchema,
    human_actor_key: z.string().uuid(),
    related_resident_ids: z.array(z.string().uuid()).min(1),
  })
  .strict();

export const farmHumanReporterReadRequestSchema = farmHumanReporterIdentitySchema;
export const farmHumanReporterLikeRequestSchema = farmHumanReporterIdentitySchema.extend({
  like_ref: z.string().trim().min(1),
});

export const farmHumanReporterPublicationSchema = z
  .object({
    likeRef: z.string().trim().min(1),
    articleText: z.string().min(1),
    sectionName: z.string().min(1).nullable(),
    authorName: z.string().min(1),
    authorFarmName: z.string().min(1).nullable(),
    publishedAt: z.number().int().nonnegative(),
    evaluationClosesAt: z.number().int().positive(),
    validLikes: z.number().int().nonnegative(),
    hasLiked: z.boolean(),
    canLike: z.boolean(),
    ownHousehold: z.boolean(),
    status: z.enum(["open", "closed"]),
  })
  .strict();

export const farmHumanReporterReadSuccessSchema = z
  .object({
    ok: z.literal(true),
    subject: z.object({ farm_doorplate: farmDoorplateSchema }).strict(),
    publications: z.array(farmHumanReporterPublicationSchema),
  })
  .strict();

export const farmHumanReporterLikeSuccessSchema = z
  .object({
    ok: z.literal(true),
    subject: z.object({ farm_doorplate: farmDoorplateSchema }).strict(),
    result: z
      .object({
        accepted: z.boolean(),
        duplicate: z.boolean(),
        likeRef: z.string().trim().min(1),
        validLikes: z.number().int().nonnegative(),
      })
      .strict(),
    publications: z.array(farmHumanReporterPublicationSchema),
  })
  .strict();

export const farmHumanReporterErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "invalid_request",
          "authentication_required",
          "farm_credential_not_found",
          "farm_doorplate_mismatch",
          "author_like_forbidden",
          "evaluation_closed",
          "farm_unavailable",
        ]),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const lingyeDailyErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "idempotency_conflict",
  "author_like_forbidden",
  "evaluation_closed",
  "farm_unavailable",
]);

export const lingyeDailyErrorSchema = z
  .object({
    error: z
      .object({
        code: lingyeDailyErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type LingyeDailyPublishRequest = z.infer<typeof lingyeDailyPublishRequestSchema>;
export type LingyeDailyEditionPublish = z.infer<typeof lingyeDailyEditionPublishSchema>;
export type LingyeDailyPublishSuccess = z.infer<typeof lingyeDailyPublishSuccessSchema>;
export type LingyeDailyIssue = z.infer<typeof lingyeDailyIssueSchema>;
export type LingyeDailyReporterPublication = z.infer<typeof lingyeDailyReporterPublicationSchema>;
export type FarmHumanReporterReadSuccess = z.infer<typeof farmHumanReporterReadSuccessSchema>;
export type FarmHumanReporterLikeSuccess = z.infer<typeof farmHumanReporterLikeSuccessSchema>;

export const bellUpdateAvailableEventType = "update_available" as const;

export const bellUpdateResourceSchema = z.enum(["shared_meme"]);

export const bellUpdateAvailablePayloadSchema = z
  .object({
    version: z.literal(1),
    connection_epoch: z.string().min(1),
    resource: bellUpdateResourceSchema,
    available_version: z.number().int().positive(),
  })
  .strict();

export const sharedMemeBackendPullQuerySchema = z
  .object({
    after_version: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const sharedMemeBackendPullSuccessSchema = z
  .object({
    mode: z.enum(["full", "delta"]),
    after_version: z.number().int().positive().nullable(),
    library_version: z.number().int().positive(),
    memes: z.array(sharedMemeEntrySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "full" && value.after_version !== null) {
      context.addIssue({
        code: "custom",
        path: ["after_version"],
        message: "a full shared meme response cannot have after_version",
      });
    }
    if (value.mode === "delta" && value.after_version === null) {
      context.addIssue({
        code: "custom",
        path: ["after_version"],
        message: "a delta shared meme response requires after_version",
      });
    }
  });

export const humanSettingsChatModeSchema = z.enum(["natural", "proactive", "listening"]);

export const climateTypeValues = [
  "tropical_rainforest",
  "tropical_savanna",
  "tropical_monsoon",
  "hot_desert",
  "humid_subtropical",
  "mediterranean",
  "oceanic",
  "temperate_monsoon",
  "continental",
  "subarctic",
  "tundra",
  "ice_cap",
  "highland",
] as const;

export const climateTypeSchema = z.enum(climateTypeValues);
export type ClimateType = z.infer<typeof climateTypeSchema>;

export const climateTypeDetails = {
  tropical_rainforest: {
    label: "热带雨林气候",
    description: "全年高温多雨，空气湿润，云量与降水通常较多，季节间温度差异较小。",
  },
  tropical_savanna: {
    label: "热带草原气候",
    description: "全年偏暖，雨季和旱季分明；雨季降水较多，旱季更干燥、云量较少。",
  },
  tropical_monsoon: {
    label: "热带季风气候",
    description: "全年偏暖，季风带来明显的雨季与较干季节；雨季湿度、云量和降水集中增加。",
  },
  hot_desert: {
    label: "热带沙漠气候",
    description: "全年干燥少雨，晴朗天气较多，昼夜温差通常较明显，风可带来干燥和扬尘。",
  },
  humid_subtropical: {
    label: "亚热带季风和湿润气候",
    description: "夏季炎热湿润、降水较多，冬季较温和；四季变化清楚，湿度和降水随季节变化。",
  },
  mediterranean: {
    label: "地中海气候",
    description: "夏季炎热干燥、晴天较多，冬季温和湿润、降水较集中，春秋为过渡季。",
  },
  oceanic: {
    label: "温带海洋性气候",
    description: "全年温和湿润，气温年变化较小，阴云、微风和持续性降水较常见。",
  },
  temperate_monsoon: {
    label: "温带季风气候",
    description: "夏季温暖湿润、降水集中，冬季寒冷干燥，春秋过渡明显。",
  },
  continental: {
    label: "温带大陆性气候",
    description: "气温年变化和昼夜变化较大，夏季温暖至炎热，冬季寒冷，全年降水相对有限。",
  },
  subarctic: {
    label: "亚寒带针叶林气候",
    description: "冬季漫长严寒，夏季短暂凉爽，年温差较大，降雪和封冻期较长。",
  },
  tundra: {
    label: "寒带苔原气候",
    description: "全年寒冷，暖季短且凉，地表长期受冻，降水较少并多以雪或雨夹雪出现。",
  },
  ice_cap: {
    label: "冰原气候",
    description: "全年严寒，冰雪长期覆盖，降水稀少且多为雪，强风和低云会明显降低能见度。",
  },
  highland: {
    label: "高原山地气候",
    description:
      "天气随海拔和地形变化，通常气温较低、昼夜温差较明显，迎风与背风区域的云量和降水差异较大。",
  },
} as const satisfies Record<ClimateType, { label: string; description: string }>;

export const weatherConditionValues = [
  "clear",
  "mostly_clear",
  "partly_cloudy",
  "overcast",
  "fog",
  "drizzle",
  "light_rain",
  "rain",
  "heavy_rain",
  "showers",
  "thunderstorm",
  "sleet",
  "light_snow",
  "snow",
  "heavy_snow",
  "blowing_snow",
  "dust",
] as const;

export const weatherConditionSchema = z.enum(weatherConditionValues);
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

export const weatherConditionDetails = {
  clear: { label: "晴朗", environment: "天空晴朗，云层很少，光线清晰。" },
  mostly_clear: { label: "少云", environment: "天空大部晴朗，只有少量云层经过。" },
  partly_cloudy: { label: "多云", environment: "云层与晴空交错，光线会随云影变化。" },
  overcast: { label: "阴", environment: "云层覆盖天空，光线较为均匀。" },
  fog: { label: "雾", environment: "近地面有雾，远处景物的能见度降低。" },
  drizzle: { label: "毛毛雨", environment: "细小雨滴持续落下，地面逐渐变湿。" },
  light_rain: { label: "小雨", environment: "小雨持续落下，降水较为平缓。" },
  rain: {
    label: "中雨",
    environment: "雨势稳定，地面持续被雨水打湿，能见度有所下降。",
  },
  heavy_rain: { label: "大雨", environment: "雨势较强，能见度明显下降，地面水流增多。" },
  showers: { label: "阵雨", environment: "降雨间歇出现，雨势会在短时间内发生变化。" },
  thunderstorm: {
    label: "雷雨",
    environment: "雷声与降雨同时出现，云层较厚，阵风可能增强。",
  },
  sleet: { label: "雨夹雪", environment: "雨滴与湿雪同时落下，地面变得湿冷。" },
  light_snow: { label: "小雪", environment: "细雪缓慢落下，地表可能出现薄层积雪。" },
  snow: { label: "中雪", environment: "降雪持续，地面与屋顶逐渐覆盖积雪。" },
  heavy_snow: { label: "大雪", environment: "降雪较密，能见度降低，积雪持续增加。" },
  blowing_snow: {
    label: "风吹雪",
    environment: "地面雪粒被风卷起，近地面能见度明显降低。",
  },
  dust: { label: "扬尘", environment: "干燥尘土被风带起，空气清晰度下降。" },
} as const satisfies Record<WeatherCondition, { label: string; environment: string }>;

export const weatherSeasonPhaseValues = [
  "spring",
  "summer",
  "autumn",
  "winter",
  "wet_season",
  "dry_season",
  "rainier_period",
  "drier_period",
  "warm_season",
  "cold_season",
  "thaw_period",
  "freeze_period",
] as const;

export const weatherSeasonPhaseSchema = z.enum(weatherSeasonPhaseValues);
export type WeatherSeasonPhase = z.infer<typeof weatherSeasonPhaseSchema>;

export const weatherSeasonTransitionCopy = {
  spring: "季节转入春季，天气将按当前气候的春季特征继续变化。",
  summer: "季节转入夏季，天气将按当前气候的夏季特征继续变化。",
  autumn: "季节转入秋季，天气将按当前气候的秋季特征继续变化。",
  winter: "季节转入冬季，天气将按当前气候的冬季特征继续变化。",
  wet_season: "季节转入雨季，云量和降水将按当前气候的雨季特征继续变化。",
  dry_season: "季节转入旱季，降水减少，天气将按当前气候的旱季特征继续变化。",
  rainier_period: "季节转入较多雨时期，云量和降水将按当前气候特征继续变化。",
  drier_period: "季节转入较少雨时期，降水将按当前气候特征继续变化。",
  warm_season: "季节转入暖季，气温将按当前气候的暖季特征继续变化。",
  cold_season: "季节转入寒季，气温将按当前气候的寒季特征继续变化。",
  thaw_period: "季节转入融冻期，气温回升，地表冰雪状态将随天气变化。",
  freeze_period: "季节转入封冻期，气温下降，降雪和地表冻结将按当前气候特征变化。",
} as const satisfies Record<WeatherSeasonPhase, string>;

export const weatherCopy = {
  display_summary:
    "{weather_name} · {temperature} · {wind_summary} · 云量 {cloud_cover} · {precipitation_summary}",
  environment_context:
    "{weather_environment} 当前气温为{temperature}，风向为{wind_direction}，风速为{wind_speed}，云量为{cloud_cover}，降水为{precipitation_summary}。",
  climate_changed: "气候类型已更换为“{climate_name}”，当前天气已按新气候重新建立。",
  climate_unchanged: "气候类型未变化，当前天气保持不变。",
  invalid_climate: "无法识别该气候类型，请重新选择。",
  climate_not_saved: "气候类型未保存，当前天气保持不变。",
  climate_conflict: "气候设置已经发生变化，请重新读取当前状态。",
  climate_not_configured: "尚未选择家园气候。",
  weather_not_initialized: "家园气候已保存，但当前天气状态尚未建立。",
  home_not_configured: "当前账号尚未建立完整家园资料。",
  weather_unavailable: "天气服务暂时不可用，当前状态无法读取。",
  weather_stale: "当前天气状态已过期，暂时无法确认最新天气。",
  weather_unknown: "当前天气状态无法识别。",
  weather_update_failed: "天气状态未能更新，已保留上一次成功保存的状态。",
  weather_forbidden: "当前会话无权读取该家园天气。",
} as const;

const humanSettingsHomePatchSchema = z
  .object({
    home_name: storedDisplayNameSchema.optional(),
    environment_description: z.string().nullable().optional(),
    climate_type: climateTypeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "home must include at least one supported setting",
  });

const humanNotificationPreferencesPatchSchema = z
  .object({
    pause_all_wakeups: z.boolean().nullable().optional(),
    visit_requests_and_invitations_enabled: z.boolean().nullable().optional(),
    activity_invitations_enabled: z.boolean().nullable().optional(),
    important_system_notifications_enabled: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "notification_preferences must include at least one supported setting",
  });

const humanCommunityConnectionPreferencesPatchSchema = z
  .object({
    default_connection_duration_minutes: z.number().int().positive().nullable().optional(),
    initial_recent_activity_count: z.number().int().nonnegative().nullable().optional(),
    chat_mode: humanSettingsChatModeSchema.nullable().optional(),
    allow_activity_room_warmup: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "community_connection_preferences must include at least one supported setting",
  });

const humanSharedDataPreferencesPatchSchema = z
  .object({
    shared_meme_update_signals_enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "shared_data_preferences must include at least one supported setting",
  });

const humanBrowserNotificationPreferencesPatchSchema = z
  .object({
    browser_notifications_enabled: z.boolean().optional(),
    activity_reminders_enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "browser_notification_preferences must include at least one supported setting",
  });

const browserPushEndpointSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "browser push endpoint must use https",
});

export const browserPushSubscriptionRequestSchema = z
  .object({
    endpoint: browserPushEndpointSchema,
    expiration_time: z.number().int().nonnegative().nullable(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/u),
        auth: z.string().regex(/^[A-Za-z0-9_-]+$/u),
      })
      .strict(),
  })
  .strict();

export const browserPushSubscriptionDeleteRequestSchema = z
  .object({ endpoint: browserPushEndpointSchema })
  .strict();

export const browserPushSubscriptionStatusRequestSchema = z
  .object({ endpoint: browserPushEndpointSchema })
  .strict();

export const browserPushSubscriptionSuccessSchema = z.object({ subscribed: z.boolean() }).strict();

export const browserPushSubscriptionStatusSuccessSchema = z
  .object({ subscribed: z.boolean() })
  .strict();

export const browserPushSubscriptionDeleteSuccessSchema = z
  .object({
    subscribed: z.literal(false),
    unsubscribe_endpoint: z.boolean(),
  })
  .strict();

export const browserPushErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "browser_notifications_unavailable",
]);

export const browserPushErrorSchema = z
  .object({
    error: z
      .object({
        code: browserPushErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const browserPushPayloadSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("activity_reminder"),
    title: z.string().min(1),
    body: z.string().min(1),
    url: z.string().startsWith("/"),
    tag: z.string().min(1),
    created_at: z.iso.datetime(),
  })
  .strict();

export const humanSettingsReadRequestSchema = z.object({}).strict();

export const humanSettingsPatchRequestSchema = z
  .object({
    home: humanSettingsHomePatchSchema.optional(),
    notification_preferences: humanNotificationPreferencesPatchSchema.optional(),
    community_connection_preferences: humanCommunityConnectionPreferencesPatchSchema.optional(),
    shared_data_preferences: humanSharedDataPreferencesPatchSchema.optional(),
    browser_notification_preferences: humanBrowserNotificationPreferencesPatchSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one supported settings group is required",
  });

export const mcpCredentialSchema = z.string().regex(/^dbm_[A-Za-z0-9_-]{43}$/);
export const bellCredentialSchema = z.string().regex(/^dbb_[A-Za-z0-9_-]{43}$/);

export const bellEndpointSchema = z.url().refine((value) => {
  const url = new URL(value);
  const loopbackHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  return (
    (url.protocol === "https:" || loopbackHttp) &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/api/bell/stream" &&
    url.search === "" &&
    url.hash === ""
  );
}, "must be the trusted Doorbell public origin followed by /api/bell/stream");

export const bellAccessCredentialStatusSchema = z.enum(["not_issued", "active", "revoked"]);
export const bellAccessReadRequestSchema = z.object({}).strict();
export const bellAccessMutationBodySchema = z.object({}).strict().optional();

export const bellAccessStatusResponseSchema = z
  .object({
    bell_endpoint: bellEndpointSchema,
    authorization_scheme: z.literal("Bearer"),
    credential_status: bellAccessCredentialStatusSchema,
    credential_id: z.uuid().nullable(),
    credential_issued_at: z.iso.datetime().nullable(),
    credential_revoked_at: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const fields = [value.credential_id, value.credential_issued_at, value.credential_revoked_at];
    const reject = (message: string) => context.addIssue({ code: "custom", message });
    if (value.credential_status === "not_issued") {
      if (fields.some((field) => field !== null)) {
        reject("not_issued must not include credential fields");
      }
      return;
    }
    if (value.credential_id === null || value.credential_issued_at === null) {
      reject("an issued credential must include its id and issued time");
    }
    if (value.credential_status === "active" && value.credential_revoked_at !== null) {
      reject("an active credential must not include credential_revoked_at");
    }
    if (value.credential_status === "revoked" && value.credential_revoked_at === null) {
      reject("a revoked credential must include credential_revoked_at");
    }
  });

export const bellCredentialIssueResponseSchema = z
  .object({
    bell_endpoint: bellEndpointSchema,
    authorization_scheme: z.literal("Bearer"),
    bell_credential: bellCredentialSchema,
    credential_id: z.uuid(),
    credential_issued_at: z.iso.datetime(),
    replaced_previous: z.boolean(),
  })
  .strict();

export const bellAccessErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "membership_verification_unavailable",
  "registration_profile_required",
  "bell_credential_not_configured",
  "method_not_allowed",
  "internal_contract_error",
]);

export type BellAccessErrorCode = z.infer<typeof bellAccessErrorCodeSchema>;

export const bellAccessErrorMessages = {
  invalid_request: "The request body or query parameters are invalid",
  authentication_required: "An active human session is required",
  qq_not_group_member: "The session QQ number is no longer a current member of the community group",
  membership_verification_unavailable: "QQ group membership could not be verified",
  registration_profile_required: "A complete resident, home, and farm registration is required",
  bell_credential_not_configured: "No active Bell credential is configured",
  method_not_allowed: "This method is not allowed for the Bell access route",
  internal_contract_error: "The Bell access contract could not be completed safely",
} as const satisfies Record<BellAccessErrorCode, string>;

export const bellAccessErrorSchema = z
  .object({
    error: z
      .object({ code: bellAccessErrorCodeSchema, message: z.string() })
      .strict()
      .superRefine((value, context) => {
        if (value.message !== bellAccessErrorMessages[value.code]) {
          context.addIssue({
            code: "custom",
            message: "message must match the approved error code",
          });
        }
      }),
  })
  .strict();

export const mcpEndpointSchema = z.url().refine((value) => {
  const url = new URL(value);
  const loopbackHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  return (
    (url.protocol === "https:" || loopbackHttp) &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/mcp" &&
    url.search === "" &&
    url.hash === ""
  );
}, "must be the trusted Doorbell public origin followed by /mcp");

export const mcpAccessMigrationStatusSchema = z.enum([
  "not_started",
  "pending_farm_revocation",
  "farm_revoked",
]);

export const mcpAccessCredentialStatusSchema = z.enum(["not_issued", "active", "revoked"]);

export const mcpAccessReadRequestSchema = z.object({}).strict();
export const mcpAccessMutationBodySchema = z.object({}).strict().optional();

export const mcpAccessStatusResponseSchema = z
  .object({
    mcp_endpoint: mcpEndpointSchema,
    authorization_scheme: z.literal("Bearer"),
    migration_status: mcpAccessMigrationStatusSchema,
    credential_status: mcpAccessCredentialStatusSchema,
    migration_id: z.uuid().nullable(),
    migration_requested_at: z.iso.datetime().nullable(),
    farm_revoked_at: z.iso.datetime().nullable(),
    credential_id: z.uuid().nullable(),
    credential_issued_at: z.iso.datetime().nullable(),
    credential_revoked_at: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const migrationFields = [
      value.migration_id,
      value.migration_requested_at,
      value.farm_revoked_at,
    ];
    const credentialFields = [
      value.credential_id,
      value.credential_issued_at,
      value.credential_revoked_at,
    ];
    const reject = (message: string) => context.addIssue({ code: "custom", message });

    if (value.migration_status === "not_started") {
      if (migrationFields.some((field) => field !== null)) {
        reject("not_started must not include migration fields");
      }
      if (
        value.credential_status !== "not_issued" ||
        credentialFields.some((field) => field !== null)
      ) {
        reject("not_started must not include credential state");
      }
      return;
    }

    if (value.migration_id === null || value.migration_requested_at === null) {
      reject("a started migration must include its id and requested time");
    }

    if (value.migration_status === "pending_farm_revocation") {
      if (value.farm_revoked_at !== null) {
        reject("pending_farm_revocation must not include farm_revoked_at");
      }
      if (
        value.credential_status !== "not_issued" ||
        credentialFields.some((field) => field !== null)
      ) {
        reject("pending_farm_revocation must not include credential state");
      }
      return;
    }

    if (value.farm_revoked_at === null) {
      reject("farm_revoked must include farm_revoked_at");
    }
    if (value.credential_status === "not_issued") {
      if (credentialFields.some((field) => field !== null)) {
        reject("not_issued must not include credential fields");
      }
      return;
    }
    if (value.credential_id === null || value.credential_issued_at === null) {
      reject("an issued credential must include its id and issued time");
    }
    if (value.credential_status === "active" && value.credential_revoked_at !== null) {
      reject("an active credential must not include credential_revoked_at");
    }
    if (value.credential_status === "revoked" && value.credential_revoked_at === null) {
      reject("a revoked credential must include credential_revoked_at");
    }
  });

export const mcpCredentialIssueResponseSchema = z
  .object({
    mcp_endpoint: mcpEndpointSchema,
    authorization_scheme: z.literal("Bearer"),
    mcp_credential: mcpCredentialSchema,
    credential_id: z.uuid(),
    credential_issued_at: z.iso.datetime(),
    replaced_previous: z.boolean(),
  })
  .strict();

export const mcpAccessErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "method_not_allowed",
  "registration_profile_required",
  "farm_credential_invalid",
  "farm_binding_mismatch",
  "farm_migration_conflict",
  "migration_not_confirmed",
  "upstream_contract_unavailable",
  "farm_unavailable",
  "mcp_runtime_unavailable",
  "membership_verification_unavailable",
  "mcp_credential_not_configured",
  "internal_contract_error",
]);

export type McpAccessErrorCode = z.infer<typeof mcpAccessErrorCodeSchema>;

export const mcpAccessErrorMessages = {
  invalid_request: "The request body or query parameters are invalid",
  authentication_required: "An active human session is required",
  qq_not_group_member: "The session QQ number is no longer a current member of the community group",
  method_not_allowed: "This method is not allowed for the MCP access route",
  registration_profile_required: "A complete resident, home, and farm registration is required",
  farm_credential_invalid: "The bound farm credential is no longer valid",
  farm_binding_mismatch: "The bound farm credential no longer matches the registered farm",
  farm_migration_conflict: "The bound farm was migrated by a different operation",
  migration_not_confirmed: "The previous farm MCP link has not been confirmed as revoked",
  upstream_contract_unavailable: "The farm migration confirmation could not be verified",
  farm_unavailable: "The farm migration service is unavailable",
  mcp_runtime_unavailable: "The Doorbell MCP runtime is not available",
  membership_verification_unavailable: "QQ group membership could not be verified",
  mcp_credential_not_configured: "No active MCP credential is configured",
  internal_contract_error: "The MCP access contract could not be completed safely",
} as const satisfies Record<McpAccessErrorCode, string>;

export const mcpAccessErrorSchema = z
  .object({
    error: z
      .object({
        code: mcpAccessErrorCodeSchema,
        message: z.string(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.message !== mcpAccessErrorMessages[value.code]) {
          context.addIssue({
            code: "custom",
            message: "message must match the approved error code",
          });
        }
      }),
  })
  .strict();

export const farmMcpMigrationRequestSchema = z
  .object({
    migration_id: z.uuid(),
    resident_id: z.uuid(),
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
  })
  .strict();

export const farmCreationServiceRequestSchema = z
  .object({
    creation_id: z.uuid(),
    farm_name: storedDisplayNameSchema,
    ai_name: storedDisplayNameSchema,
    human_name: storedDisplayNameSchema,
  })
  .strict();

export const farmCreationServiceReceiptSchema = z
  .object({
    creation_id: z.uuid(),
    created: z.boolean(),
    farm_doorplate: farmDoorplateSchema,
    farm_name: z.string().min(1),
    ai_name: z.string().min(1),
    human_name: z.string().min(1),
    farm_human_key: farmHumanKeySchema,
    created_at: z.iso.datetime(),
  })
  .strict();

export const farmMcpMigrationReceiptSchema = z
  .object({
    migration_id: z.uuid(),
    confirmation_id: z.uuid(),
    farm_doorplate: farmDoorplateSchema,
    legacy_mcp_revoked: z.literal(true),
    revoked_at: z.iso.datetime(),
  })
  .strict();

export const farmMcpActionRequestSchema = z
  .object({
    farm_human_key: farmHumanKeySchema,
    expected_farm_doorplate: farmDoorplateSchema,
    action: z.string().trim().min(1),
    params: z.record(z.string(), z.unknown()),
    detail: z.boolean().optional(),
  })
  .strict();

export const farmMcpActionResultSchema = z
  .object({
    ok: z.boolean(),
    text: z.string(),
    farm: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const farmMcpActionErrorCodeSchema = z.enum([
  "service_not_configured",
  "authentication_required",
  "method_not_allowed",
  "invalid_request",
  "unsupported_action",
  "farm_credential_not_found",
  "farm_doorplate_mismatch",
  "farm_migration_required",
  "farm_unavailable",
]);

export const farmMcpActionErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: farmMcpActionErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const humanSettingsSuccessSchema = z
  .object({
    ...humanProfileSelectionSchema,
    connection_status: z
      .object({
        wake_bridge: z
          .object({
            status: z.enum(["not_configured", "offline", "online"]),
            last_connected_at: z.iso.datetime().nullable(),
          })
          .strict(),
      })
      .strict(),
    home: z
      .object({
        home_name: z.string(),
        environment_description: z.string().nullable(),
        climate_type: climateTypeSchema.nullable(),
        weather_state: z
          .object({
            weather_revision: z.number().int().positive(),
            season_phase: weatherSeasonPhaseSchema.nullable(),
            condition: weatherConditionSchema.nullable(),
            state_started_at: z.iso.datetime().nullable(),
            next_transition_at: z.iso.datetime().nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    notification_preferences: z
      .object({
        pause_all_wakeups: z.boolean().nullable(),
        visit_requests_and_invitations_enabled: z.boolean().nullable(),
        activity_invitations_enabled: z.boolean().nullable(),
        important_system_notifications_enabled: z.boolean().nullable(),
      })
      .strict(),
    community_connection_preferences: z
      .object({
        default_connection_duration_minutes: z.number().int().positive(),
        initial_recent_activity_count: z.number().int().nonnegative().nullable(),
        chat_mode: humanSettingsChatModeSchema.nullable(),
        allow_activity_room_warmup: z.boolean().nullable(),
      })
      .strict(),
    shared_data_preferences: z
      .object({
        shared_meme_update_signals_enabled: z.boolean(),
      })
      .strict(),
    browser_notification_preferences: z
      .object({
        application_server_key: z.string().nullable(),
        browser_notifications_available: z.boolean(),
        browser_notifications_enabled: z.boolean(),
        activity_reminders_enabled: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (value) => value.profiles.some((profile) => profile.profile_id === value.active_profile_id),
    {
      message: "active_profile_id must reference one returned profile",
      path: ["active_profile_id"],
    },
  );

export const humanSettingsErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "profile_not_available",
]);

export const humanSettingsErrorSchema = z
  .object({
    error: z
      .object({
        code: humanSettingsErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const humanAuthenticationErrorCodeSchema = z.enum([
  "invalid_request",
  "invalid_credentials",
  "invalid_registration_code",
  "account_already_registered",
  "qq_not_group_member",
  "onebot_unavailable",
  "authentication_required",
  "farm_not_found",
  "farm_unavailable",
  "farm_confirmation_mismatch",
  "invalid_farm_human_url",
  "invalid_farm_human_key",
  "farm_human_key_mismatch",
  "upstream_contract_unavailable",
  "registration_profile_required",
  "registration_profile_mismatch",
  "farm_already_bound",
  "farm_creation_conflict",
  "farm_creation_unavailable",
  "profile_not_available",
]);

export const humanAuthenticationErrorSchema = z
  .object({
    error: z
      .object({
        code: humanAuthenticationErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const farmHumanUiErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "farm_credential_invalid",
  "farm_unavailable",
  "upstream_contract_unavailable",
]);

export const farmHumanUiErrorSchema = z
  .object({
    error: z
      .object({
        code: farmHumanUiErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type HumanSessionRequest = z.infer<typeof humanSessionRequestSchema>;
export type AdditionalHumanProfileRequest = z.infer<typeof additionalHumanProfileRequestSchema>;
export type HumanProfileSummary = z.infer<typeof humanProfileSummarySchema>;
export type HumanProfileSwitchRequest = z.infer<typeof humanProfileSwitchRequestSchema>;
export type FarmLookupRequest = z.infer<typeof farmLookupRequestSchema>;
export type FarmLookupSuccess = z.infer<typeof farmLookupSuccessSchema>;
export type FarmLookupError = z.infer<typeof farmLookupErrorSchema>;
export type FarmFieldCropIdentity = z.infer<typeof farmFieldCropIdentitySchema>;
export type FarmFieldPlot = z.infer<typeof farmFieldPlotSchema>;
export type FarmFieldData = z.infer<typeof farmFieldDataSchema>;
export type FarmHumanFieldReadRequest = z.infer<typeof farmHumanFieldReadRequestSchema>;
export type FarmHumanFieldReadSuccess = z.infer<typeof farmHumanFieldReadSuccessSchema>;
export type FarmHumanFieldReadErrorCode = z.infer<typeof farmHumanFieldReadErrorCodeSchema>;
export type FarmHumanFieldReadError = z.infer<typeof farmHumanFieldReadErrorSchema>;
export type QixiLanternAppearance = z.infer<typeof qixiLanternAppearanceSchema>;
export type QixiMemorialSide = z.infer<typeof qixiMemorialSideSchema>;
export type FarmHumanQixiMemorialReadRequest = z.infer<
  typeof farmHumanQixiMemorialReadRequestSchema
>;
export type FarmHumanQixiMemorialReadSuccess = z.infer<
  typeof farmHumanQixiMemorialReadSuccessSchema
>;
export type FarmHumanQixiMemorialReadError = z.infer<typeof farmHumanQixiMemorialReadErrorSchema>;
export type BoundQixiMemorialReadRequest = z.infer<typeof boundQixiMemorialReadRequestSchema>;
export type BoundQixiMemorialReadSuccess = z.infer<typeof boundQixiMemorialReadSuccessSchema>;
export type BoundQixiMemorialReadError = z.infer<typeof boundQixiMemorialReadErrorSchema>;
export type BoundFarmFieldSuccess = z.infer<typeof boundFarmFieldSuccessSchema>;
export type BoundFarmFieldError = z.infer<typeof boundFarmFieldErrorSchema>;
export type FarmHumanFieldHarvestAssistRequest = z.infer<
  typeof farmHumanFieldHarvestAssistRequestSchema
>;
export type FarmHumanFieldHarvestAssistSuccess = z.infer<
  typeof farmHumanFieldHarvestAssistSuccessSchema
>;
export type FarmHumanFieldHarvestAssistResult = z.infer<
  typeof farmHumanFieldHarvestAssistResultSchema
>;
export type FarmGlimmerVariant = z.infer<typeof farmGlimmerVariantSchema>;
export type FarmGlimmerTrack = z.infer<typeof farmGlimmerTrackSchema>;
export type FarmGlimmerData = z.infer<typeof farmGlimmerDataSchema>;
export type FarmHumanGlimmerReadRequest = z.infer<typeof farmHumanGlimmerReadRequestSchema>;
export type FarmHumanGlimmerReadSuccess = z.infer<typeof farmHumanGlimmerReadSuccessSchema>;
export type FarmHumanGlimmerReadErrorCode = z.infer<typeof farmHumanGlimmerReadErrorCodeSchema>;
export type FarmHumanGlimmerReadError = z.infer<typeof farmHumanGlimmerReadErrorSchema>;
export type BoundGlimmerReadRequest = z.infer<typeof boundGlimmerReadRequestSchema>;
export type BoundGlimmerReadSuccess = z.infer<typeof boundGlimmerReadSuccessSchema>;
export type BoundGlimmerReadError = z.infer<typeof boundGlimmerReadErrorSchema>;
export type FarmTogetherPhase = z.infer<typeof farmTogetherPhaseSchema>;
export type FarmTogetherData = z.infer<typeof farmTogetherDataSchema>;
export type FarmHumanTogetherReadRequest = z.infer<typeof farmHumanTogetherReadRequestSchema>;
export type FarmHumanTogetherReadSuccess = z.infer<typeof farmHumanTogetherReadSuccessSchema>;
export type FarmHumanTogetherReadErrorCode = z.infer<typeof farmHumanTogetherReadErrorCodeSchema>;
export type FarmHumanTogetherReadError = z.infer<typeof farmHumanTogetherReadErrorSchema>;
export type BoundTogetherReadRequest = z.infer<typeof boundTogetherReadRequestSchema>;
export type BoundTogetherReadSuccess = z.infer<typeof boundTogetherReadSuccessSchema>;
export type BoundTogetherReadError = z.infer<typeof boundTogetherReadErrorSchema>;
export type FarmHumanFieldHarvestAssistResource = z.infer<
  typeof farmHumanFieldHarvestAssistResourceSchema
>;
export type FarmHumanFieldHarvestAssistErrorCode = z.infer<
  typeof farmHumanFieldHarvestAssistErrorCodeSchema
>;
export type FarmHumanFieldHarvestAssistError = z.infer<
  typeof farmHumanFieldHarvestAssistErrorSchema
>;
export type BoundFarmHarvestAssistRequest = z.infer<typeof boundFarmHarvestAssistRequestSchema>;
export type BoundFarmHarvestAssistSuccess = z.infer<typeof boundFarmHarvestAssistSuccessSchema>;
export type BoundFarmHarvestAssistResult = z.infer<typeof boundFarmHarvestAssistResultSchema>;
export type BoundFarmHarvestAssistResource = z.infer<typeof boundFarmHarvestAssistResourceSchema>;
export type BoundFarmHarvestAssistErrorCode = z.infer<typeof boundFarmHarvestAssistErrorCodeSchema>;
export type BoundFarmHarvestAssistError = z.infer<typeof boundFarmHarvestAssistErrorSchema>;
export type FarmHumanFieldLandUpgradeRequest = z.infer<
  typeof farmHumanFieldLandUpgradeRequestSchema
>;
export type FarmHumanFieldLandUpgradeSuccess = z.infer<
  typeof farmHumanFieldLandUpgradeSuccessSchema
>;
export type FarmHumanFieldLandUpgradeResult = z.infer<typeof farmHumanFieldLandUpgradeResultSchema>;
export type FarmHumanFieldLandUpgradeErrorCode = z.infer<
  typeof farmHumanFieldLandUpgradeErrorCodeSchema
>;
export type FarmHumanFieldLandUpgradeError = z.infer<typeof farmHumanFieldLandUpgradeErrorSchema>;
export type BoundFarmLandUpgradeRequest = z.infer<typeof boundFarmLandUpgradeRequestSchema>;
export type BoundFarmLandUpgradeSuccess = z.infer<typeof boundFarmLandUpgradeSuccessSchema>;
export type BoundFarmLandUpgradeErrorCode = z.infer<typeof boundFarmLandUpgradeErrorCodeSchema>;
export type BoundFarmLandUpgradeError = z.infer<typeof boundFarmLandUpgradeErrorSchema>;
export type HumanSessionSuccess = z.infer<typeof humanSessionSuccessSchema>;
export type CreatedFarmHumanSessionSuccess = z.infer<typeof createdFarmHumanSessionSuccessSchema>;
export type CurrentHumanSessionSuccess = z.infer<typeof currentHumanSessionSuccessSchema>;
export type HumanLogoutSuccess = z.infer<typeof humanLogoutSuccessSchema>;
export type MailboxListSuccess = z.infer<typeof mailboxListSuccessSchema>;
export type MailboxDetailSuccess = z.infer<typeof mailboxDetailSuccessSchema>;
export type MailboxError = z.infer<typeof mailboxErrorSchema>;
export type SharedMemeEntry = z.infer<typeof sharedMemeEntrySchema>;
export type SharedMemeLibraryMetadata = z.infer<typeof sharedMemeLibraryMetadataSchema>;
export type SharedMemeListSuccess = z.infer<typeof sharedMemeListSuccessSchema>;
export type SharedMemeDetailSuccess = z.infer<typeof sharedMemeDetailSuccessSchema>;
export type SharedMemeAddRequest = z.infer<typeof sharedMemeAddRequestSchema>;
export type SharedMemeAddSuccess = z.infer<typeof sharedMemeAddSuccessSchema>;
export type SharedMemeError = z.infer<typeof sharedMemeErrorSchema>;
export type SharedMemeBackendPullSuccess = z.infer<typeof sharedMemeBackendPullSuccessSchema>;
export type HumanSettingsChatMode = z.infer<typeof humanSettingsChatModeSchema>;
export type HumanSettingsPatchRequest = z.infer<typeof humanSettingsPatchRequestSchema>;
export type HumanSettingsSuccess = z.infer<typeof humanSettingsSuccessSchema>;
export type HumanSettingsError = z.infer<typeof humanSettingsErrorSchema>;
export type BrowserPushSubscriptionRequest = z.infer<typeof browserPushSubscriptionRequestSchema>;
export type BrowserPushSubscriptionSuccess = z.infer<typeof browserPushSubscriptionSuccessSchema>;
export type BrowserPushSubscriptionStatusSuccess = z.infer<
  typeof browserPushSubscriptionStatusSuccessSchema
>;
export type BrowserPushSubscriptionDeleteSuccess = z.infer<
  typeof browserPushSubscriptionDeleteSuccessSchema
>;
export type BrowserPushError = z.infer<typeof browserPushErrorSchema>;
export type BrowserPushPayload = z.infer<typeof browserPushPayloadSchema>;
export type BellAccessCredentialStatus = z.infer<typeof bellAccessCredentialStatusSchema>;
export type BellAccessStatusResponse = z.infer<typeof bellAccessStatusResponseSchema>;
export type BellCredentialIssueResponse = z.infer<typeof bellCredentialIssueResponseSchema>;
export type BellAccessError = z.infer<typeof bellAccessErrorSchema>;
export type McpAccessMigrationStatus = z.infer<typeof mcpAccessMigrationStatusSchema>;
export type McpAccessCredentialStatus = z.infer<typeof mcpAccessCredentialStatusSchema>;
export type McpAccessStatusResponse = z.infer<typeof mcpAccessStatusResponseSchema>;
export type McpCredentialIssueResponse = z.infer<typeof mcpCredentialIssueResponseSchema>;
export type McpAccessError = z.infer<typeof mcpAccessErrorSchema>;
export type FarmMcpMigrationRequest = z.infer<typeof farmMcpMigrationRequestSchema>;
export type FarmMcpMigrationReceipt = z.infer<typeof farmMcpMigrationReceiptSchema>;
export type FarmCreationServiceRequest = z.infer<typeof farmCreationServiceRequestSchema>;
export type FarmCreationServiceReceipt = z.infer<typeof farmCreationServiceReceiptSchema>;
export type FarmMcpActionRequest = z.infer<typeof farmMcpActionRequestSchema>;
export type FarmMcpActionResult = z.infer<typeof farmMcpActionResultSchema>;
export type FarmMcpActionErrorCode = z.infer<typeof farmMcpActionErrorCodeSchema>;
export type FarmMcpActionError = z.infer<typeof farmMcpActionErrorSchema>;
export type HumanAuthenticationError = z.infer<typeof humanAuthenticationErrorSchema>;
export type FarmHumanUiError = z.infer<typeof farmHumanUiErrorSchema>;
