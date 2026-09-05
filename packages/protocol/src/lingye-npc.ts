import { z } from "zod";

const text = z.string().min(1);
const revision = z.number().int().nonnegative();
const opaqueOption = z.string().regex(/^opt_[A-Za-z0-9_-]+$/u);

export const lingyeNpcIdSchema = z.enum([
  "npc_atu", "npc_pupu", "npc_modian", "npc_liyuan", "npc_songmo", "npc_beiheng",
]);
export const lingyeNpcAffinityStageSchema = z.enum(["new", "known", "familiar", "close", "trusted"]);
export const lingyeNpcWorkStatusSchema = z.enum(["on_duty", "off_duty", "away"]);
export const lingyeNpcLocationSchema = z.enum([
  "farm-ranch", "animal-hospital", "lingye-daily", "bank", "vocational-school",
  "lingye-public-security-office", "glimmer-meadow", "moonlight-pond", "crystal-cave",
  "geyser-waterfall", "floating-lake", "mangrove-shoal", "abyssal-trench",
  "doorbell-community", "detention-center", "commercial-street",
]);

const identities = {
  npc_atu: ["阿土", "土拨鼠", "杂货郎和常驻邻居", "farm"],
  npc_pupu: ["蒲蒲", "水豚", "值班分诊员和病例管理员", "animal_hospital"],
  npc_modian: ["墨点", "乌鸦", "值班编辑", "lingye_daily"],
  npc_liyuan: ["栗圆", "金丝熊", "柜员与合同管理员", "bank"],
  npc_songmo: ["松墨", "雪鸮", "教务员", "vocational_school"],
  npc_beiheng: ["北衡", "黑背犬", "值班接案员和程序管理员", "public_security"],
} as const;

export const lingyeNpcViewSchema = z.object({
  npc_id: lingyeNpcIdSchema,
  name: text,
  species: text,
  role: text,
  institution_id: text,
  location_id: lingyeNpcLocationSchema,
  work_status: lingyeNpcWorkStatusSchema,
  world_revision: revision,
  affinity_stage: lingyeNpcAffinityStageSchema,
  affinity_revision: revision,
  talk_option: opaqueOption.nullable(),
}).strict().superRefine((value, context) => {
  const expected = identities[value.npc_id];
  for (const [index, field] of (["name", "species", "role", "institution_id"] as const).entries()) {
    if (value[field] !== expected[index]) context.addIssue({ code: "custom", path: [field], message: "NPC identity does not match its roster" });
  }
});

const npcViews = z.array(lingyeNpcViewSchema).superRefine((items, context) => {
  if (new Set(items.map(item => item.npc_id)).size !== items.length) {
    context.addIssue({ code: "custom", message: "NPC identities must be unique" });
  }
});

export const lingyeNpcDialogueSchema = z.object({
  npc_id: lingyeNpcIdSchema,
  status: z.enum(["awaiting_choice", "completed"]),
  lines: z.array(text),
  options: z.array(z.object({ option: opaqueOption, label: text }).strict()),
  affinity_change: z.object({ delta: z.number().int().positive(), revision }).strict().nullable(),
  gift: z.object({ receipt_id: text, name: text, quantity: z.number().int().positive(), unit: z.enum(["金币", "份"]) }).strict().nullable(),
}).strict().superRefine((dialogue, context) => {
  if (dialogue.status === "completed" && dialogue.options.length !== 0) {
    context.addIssue({ code: "custom", path: ["options"], message: "A completed dialogue has no choices" });
  }
  if (dialogue.status !== "completed" && dialogue.affinity_change !== null) {
    context.addIssue({ code: "custom", path: ["affinity_change"], message: "Affinity changes require a completed interaction" });
  }
  if (dialogue.status !== "completed" && dialogue.gift !== null) {
    context.addIssue({ code: "custom", path: ["gift"], message: "Gifts require a settled interaction" });
  }
});

export const lingyeNpcReadRequestSchema = z.object({}).strict();
export const lingyeNpcInteractRequestSchema = z.object({
  npc_id: lingyeNpcIdSchema,
  option: opaqueOption,
}).strict();
export const lingyeNpcReadSuccessSchema = z.object({ npcs: npcViews }).strict();
export const lingyeNpcInteractSuccessSchema = z.object({
  npc: lingyeNpcViewSchema,
  dialogue: lingyeNpcDialogueSchema,
}).strict().superRefine((result, context) => {
  if (result.npc.npc_id !== result.dialogue.npc_id) {
    context.addIssue({ code: "custom", path: ["dialogue", "npc_id"], message: "Dialogue must belong to its NPC" });
  }
});

const farmIdentity = {
  resident_id: text,
  farm_human_key: text,
  expected_farm_doorplate: text,
};
const farmSubject = z.object({ farm_doorplate: text }).strict();
export const farmHumanNpcReadRequestSchema = z.object(farmIdentity).strict();
export const farmHumanNpcInteractRequestSchema = lingyeNpcInteractRequestSchema.extend(farmIdentity);
export const farmHumanNpcReadSuccessSchema = z.object({
  ok: z.literal(true), subject: farmSubject, npcs: npcViews,
}).strict();
export const farmHumanNpcInteractSuccessSchema = z.object({
  ok: z.literal(true), subject: farmSubject, npc: lingyeNpcViewSchema, dialogue: lingyeNpcDialogueSchema,
}).strict().superRefine((result, context) => {
  if (result.npc.npc_id !== result.dialogue.npc_id) {
    context.addIssue({ code: "custom", path: ["dialogue", "npc_id"], message: "Dialogue must belong to its NPC" });
  }
});

export const farmHumanNpcErrorSchema = z.object({
  error: z.object({ code: text, message: z.string() }).strict(),
}).strict();
export const lingyeNpcErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "invalid_request", "authentication_required", "qq_not_group_member", "onebot_unavailable",
      "registration_profile_required", "upstream_contract_unavailable", "farm_unavailable", "npc_action_rejected",
    ]),
    message: z.string(),
  }).strict(),
}).strict();

export type LingyeNpcId = z.infer<typeof lingyeNpcIdSchema>;
export type LingyeNpcView = z.infer<typeof lingyeNpcViewSchema>;
export type LingyeNpcDialogue = z.infer<typeof lingyeNpcDialogueSchema>;
export type LingyeNpcReadSuccess = z.infer<typeof lingyeNpcReadSuccessSchema>;
export type LingyeNpcInteractRequest = z.infer<typeof lingyeNpcInteractRequestSchema>;
export type LingyeNpcInteractSuccess = z.infer<typeof lingyeNpcInteractSuccessSchema>;
export type FarmHumanNpcReadSuccess = z.infer<typeof farmHumanNpcReadSuccessSchema>;
export type FarmHumanNpcInteractSuccess = z.infer<typeof farmHumanNpcInteractSuccessSchema>;
