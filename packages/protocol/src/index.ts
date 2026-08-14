import { z } from "zod";

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

export const humanSessionSuccessSchema = z
  .object({
    authenticated: z.literal(true),
    account_created: z.boolean(),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
  })
  .strict();

export const createdFarmHumanSessionSuccessSchema = humanSessionSuccessSchema.extend({
  created_farm: z
    .object({
      farm_doorplate: farmDoorplateSchema,
      farm_name: z.string(),
      ai_name: z.string(),
      farm_human_url: farmHumanUrlSchema,
    })
    .strict(),
});

export const currentHumanSessionSuccessSchema = z
  .object({
    authenticated: z.literal(true),
    account: humanAccountSchema,
    resident: residentSchema,
    home: homeSchema,
    farm_binding: farmBindingSchema,
  })
  .strict();

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

export const sharedMemeVersionHintEventType = "shared_meme.version" as const;

export const sharedMemeVersionHintPayloadSchema = z
  .object({
    library_version: z.number().int().positive(),
  })
  .strict();

export const connectorLocalSharedMemeSyncSchema = z
  .object({
    sync_status: z.enum(["not_synced", "syncing", "synced", "error"]),
    applied_version: z.number().int().positive().nullable(),
    entry_count: z.number().int().nonnegative(),
    last_synced_at: z.iso.datetime().nullable(),
    last_error_code: z.string().nullable(),
  })
  .strict();

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

export const humanSettingsReadRequestSchema = z.object({}).strict();

export const humanSettingsPatchRequestSchema = z
  .object({
    home: humanSettingsHomePatchSchema.optional(),
    notification_preferences: humanNotificationPreferencesPatchSchema.optional(),
    community_connection_preferences: humanCommunityConnectionPreferencesPatchSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one supported settings group is required",
  });

export const connectorProtocolVersionSchema = z.literal("2.0");
export const connectorCapabilitySchema = z.enum(["event_stream_v2", "resync_v2"]);
export const connectorRequiredCapabilities = ["event_stream_v2", "resync_v2"] as const;
export const connectorCapabilitiesSchema = z
  .array(connectorCapabilitySchema)
  .length(connectorRequiredCapabilities.length)
  .refine(
    (capabilities) =>
      connectorRequiredCapabilities.every((capability) => capabilities.includes(capability)),
    { message: "all Connector v2 capabilities are required" },
  );
export const connectorCredentialSchema = z.string().regex(/^dbc_[A-Za-z0-9_-]{43}$/);
export const connectorWelcomeMessage = "May every ring lead you home." as const;
export const connectorDeliveryGenerationSchema = z.uuid();

export const connectorBootstrapCheckpointSchema = z
  .object({
    delivery_generation: connectorDeliveryGenerationSchema,
    through_cursor: z.number().int().nonnegative(),
  })
  .strict();

export const connectorSettingsStatusSchema = z
  .object({
    status: z.enum(["not_configured", "offline", "online"]),
    last_online_at: z.iso.datetime().nullable(),
  })
  .strict();

export const connectorCredentialMutationRequestSchema = z.object({}).strict();

export const mcpCredentialSchema = z.string().regex(/^dbm_[A-Za-z0-9_-]{43}$/);

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

export const connectorCredentialIssueSuccessSchema = z
  .object({
    configured: z.literal(true),
    credential_id: z.uuid(),
    connector_credential: connectorCredentialSchema,
    issued_at: z.iso.datetime(),
    replaced_previous: z.boolean(),
  })
  .strict();

export const connectorCredentialRevokeSuccessSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();

export const connectorControlErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
  "connector_not_configured",
]);

export const connectorControlErrorSchema = z
  .object({
    error: z
      .object({
        code: connectorControlErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const connectorEventEnvelopeSchema = z
  .object({
    generation: connectorDeliveryGenerationSchema,
    event_id: z.uuid(),
    cursor: z.number().int().positive(),
    event_type: z.string().min(1),
    created_at: z.iso.datetime(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const connectorHelloFrameSchema = z
  .object({
    type: z.literal("hello"),
    protocol_version: connectorProtocolVersionSchema,
    capabilities: connectorCapabilitiesSchema,
    credential: connectorCredentialSchema,
    generation: connectorDeliveryGenerationSchema.nullable(),
    last_persisted_cursor: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.generation === null && value.last_persisted_cursor !== 0) {
      context.addIssue({
        code: "custom",
        path: ["last_persisted_cursor"],
        message: "an unset generation must start at cursor 0",
      });
    }
  });

export const connectorAckFrameSchema = z
  .object({
    type: z.literal("ack"),
    generation: connectorDeliveryGenerationSchema,
    event_id: z.uuid(),
    cursor: z.number().int().positive(),
  })
  .strict();

export const connectorResyncRequestFrameSchema = z
  .object({
    type: z.literal("resync_request"),
    generation: connectorDeliveryGenerationSchema,
    after_cursor: z.number().int().nonnegative(),
    reason: z.literal("cursor_gap"),
  })
  .strict();

export const connectorHeartbeatAckFrameSchema = z
  .object({
    type: z.literal("heartbeat_ack"),
    heartbeat_id: z.uuid(),
  })
  .strict();

export const connectorGenerationResetAckFrameSchema = z
  .object({
    type: z.literal("generation_reset_ack"),
    generation: connectorDeliveryGenerationSchema,
  })
  .strict();

export const connectorClientFrameSchema = z.discriminatedUnion("type", [
  connectorHelloFrameSchema,
  connectorAckFrameSchema,
  connectorResyncRequestFrameSchema,
  connectorHeartbeatAckFrameSchema,
  connectorGenerationResetAckFrameSchema,
]);

export const connectorReadyFrameSchema = z
  .object({
    type: z.literal("ready"),
    protocol_version: connectorProtocolVersionSchema,
    capabilities: connectorCapabilitiesSchema,
    connection_id: z.uuid(),
    resident_id: z.string().min(1),
    generation: connectorDeliveryGenerationSchema,
    resume_after_cursor: z.number().int().nonnegative(),
    welcome: z.literal(connectorWelcomeMessage),
  })
  .strict();

export const connectorEventFrameSchema = z
  .object({
    type: z.literal("event"),
    event: connectorEventEnvelopeSchema,
  })
  .strict();

export const connectorHeartbeatFrameSchema = z
  .object({
    type: z.literal("heartbeat"),
    heartbeat_id: z.uuid(),
    sent_at: z.iso.datetime(),
  })
  .strict();

export const connectorResyncRequiredFrameSchema = z
  .object({
    type: z.literal("resync_required"),
    generation: connectorDeliveryGenerationSchema,
    after_cursor: z.number().int().nonnegative(),
    reason: z.enum(["ack_gap", "cursor_ahead", "event_mismatch"]),
  })
  .strict();

export const connectorGenerationResetRequiredFrameSchema = z
  .object({
    type: z.literal("generation_reset_required"),
    generation: connectorDeliveryGenerationSchema,
    reason: z.enum(["initial_sync", "generation_changed"]),
  })
  .strict();

export const connectorServerErrorFrameSchema = z
  .object({
    type: z.literal("error"),
    code: z.enum([
      "invalid_frame",
      "unsupported_protocol_version",
      "missing_required_capability",
      "authentication_rejected",
      "membership_verification_unavailable",
      "delivery_generation_inconsistent",
    ]),
  })
  .strict();

export const connectorServerFrameSchema = z.discriminatedUnion("type", [
  connectorReadyFrameSchema,
  connectorEventFrameSchema,
  connectorHeartbeatFrameSchema,
  connectorResyncRequiredFrameSchema,
  connectorGenerationResetRequiredFrameSchema,
  connectorServerErrorFrameSchema,
]);

export const connectorLocalConnectionStateSchema = z.enum([
  "stopped",
  "connecting",
  "offline",
  "online",
  "resyncing",
]);

export const connectorLocalHealthSchema = z
  .object({
    service: z.literal("doorbell-connector"),
    api_version: z.literal("v2"),
    status: z.literal("ok"),
  })
  .strict();

export const connectorLocalStatusSchema = z
  .object({
    connection_state: connectorLocalConnectionStateSchema,
    protocol_version: connectorProtocolVersionSchema,
    delivery_generation: connectorDeliveryGenerationSchema.nullable(),
    last_persisted_cursor: z.number().int().nonnegative(),
    last_connected_at: z.iso.datetime().nullable(),
    last_error_code: z.string().nullable(),
    welcome_message: z.literal(connectorWelcomeMessage).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.delivery_generation === null && value.last_persisted_cursor !== 0) {
      context.addIssue({
        code: "custom",
        path: ["last_persisted_cursor"],
        message: "an unset delivery_generation must start at cursor 0",
      });
    }
  });

export const connectorLocalEventsQuerySchema = z
  .object({
    delivery_generation: connectorDeliveryGenerationSchema,
    after_cursor: z.coerce.number().int().nonnegative(),
  })
  .strict();

export const connectorLocalEventsSuccessSchema = z
  .object({
    delivery_generation: connectorDeliveryGenerationSchema,
    events: z.array(connectorEventEnvelopeSchema),
  })
  .strict()
  .superRefine((value, context) => {
    value.events.forEach((event, index) => {
      if (event.generation !== value.delivery_generation) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "generation"],
          message: "event generation must match delivery_generation",
        });
      }
    });
  });

export const connectorLocalEventsErrorCodeSchema = z.enum([
  "invalid_request",
  "delivery_generation_changed",
]);

export const connectorLocalEventsErrorSchema = z.union([
  z
    .object({
      error: z
        .object({
          code: z.literal("invalid_request"),
          message: z.string(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      error: z
        .object({
          code: z.literal("delivery_generation_changed"),
          message: z.string(),
          requested_generation: connectorDeliveryGenerationSchema,
          current_generation: connectorDeliveryGenerationSchema.nullable(),
        })
        .strict(),
    })
    .strict(),
]);

export const connectorLocalGenerationChangedEventSchema = z
  .object({
    delivery_generation: connectorDeliveryGenerationSchema,
  })
  .strict();

export const connectorLocalMailboxErrorCodeSchema = z.union([
  mailboxErrorCodeSchema,
  z.literal("connector_unavailable"),
]);

export const connectorLocalMailboxErrorSchema = z
  .object({
    error: z
      .object({
        code: connectorLocalMailboxErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const humanSettingsSuccessSchema = z
  .object({
    connection_status: z
      .object({
        connector: connectorSettingsStatusSchema,
        wake_bridge: z
          .object({
            status: z.literal("not_integrated"),
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
  })
  .strict();

export const humanSettingsErrorCodeSchema = z.enum([
  "invalid_request",
  "authentication_required",
  "qq_not_group_member",
  "onebot_unavailable",
  "registration_profile_required",
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
export type FarmLookupRequest = z.infer<typeof farmLookupRequestSchema>;
export type FarmLookupSuccess = z.infer<typeof farmLookupSuccessSchema>;
export type FarmLookupError = z.infer<typeof farmLookupErrorSchema>;
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
export type ConnectorLocalSharedMemeSync = z.infer<typeof connectorLocalSharedMemeSyncSchema>;
export type ConnectorLocalMailboxError = z.infer<typeof connectorLocalMailboxErrorSchema>;
export type HumanSettingsChatMode = z.infer<typeof humanSettingsChatModeSchema>;
export type HumanSettingsPatchRequest = z.infer<typeof humanSettingsPatchRequestSchema>;
export type HumanSettingsSuccess = z.infer<typeof humanSettingsSuccessSchema>;
export type HumanSettingsError = z.infer<typeof humanSettingsErrorSchema>;
export type ConnectorSettingsStatus = z.infer<typeof connectorSettingsStatusSchema>;
export type ConnectorCredentialIssueSuccess = z.infer<typeof connectorCredentialIssueSuccessSchema>;
export type ConnectorControlError = z.infer<typeof connectorControlErrorSchema>;
export type ConnectorDeliveryGeneration = z.infer<typeof connectorDeliveryGenerationSchema>;
export type ConnectorBootstrapCheckpoint = z.infer<typeof connectorBootstrapCheckpointSchema>;
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
export type ConnectorEventEnvelope = z.infer<typeof connectorEventEnvelopeSchema>;
export type ConnectorHelloFrame = z.infer<typeof connectorHelloFrameSchema>;
export type ConnectorClientFrame = z.infer<typeof connectorClientFrameSchema>;
export type ConnectorServerFrame = z.infer<typeof connectorServerFrameSchema>;
export type ConnectorLocalConnectionState = z.infer<typeof connectorLocalConnectionStateSchema>;
export type ConnectorLocalStatus = z.infer<typeof connectorLocalStatusSchema>;
export type ConnectorLocalEventsError = z.infer<typeof connectorLocalEventsErrorSchema>;
export type ConnectorLocalGenerationChangedEvent = z.infer<
  typeof connectorLocalGenerationChangedEventSchema
>;
export type HumanAuthenticationError = z.infer<typeof humanAuthenticationErrorSchema>;
export type FarmHumanUiError = z.infer<typeof farmHumanUiErrorSchema>;
