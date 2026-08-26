import {
  type ConnectorSettingsStatus,
  type HumanSettingsChatMode,
  type SharedMemeAddRequest,
  type SharedMemeDetailSuccess,
  type SharedMemeListSuccess,
  sharedMemeAddRequestSchema,
} from "@doorbell/protocol";
import { useEffect, useMemo, useRef } from "react";
import type { BoundGlimmerRead, BoundTogetherRead } from "../auth/lingye-client";
import { DOORBELL_FARM_PATH } from "../routes";
import { candidateTwoHtml } from "./candidate-two-source";

export type CandidateTwoScreen =
  | "login"
  | "residency"
  | "lounge"
  | "lingye"
  | "home"
  | "profile"
  | "settings"
  | "shared-memes";

export type CandidateTwoDemoScreen =
  | "login"
  | "registration"
  | "permit"
  | "lounge"
  | "lingye"
  | "glimmer"
  | "home"
  | "profile"
  | "settings";

type CandidateTwoGlimmerAnimalId = "duck_peach" | "silk_moth_mist" | "turkey_maple";
type CandidateTwoGlimmerAnimalPositionId = CandidateTwoGlimmerAnimalId | "mystery";

type CandidateTwoGlimmerAnimalPositions = Record<
  CandidateTwoGlimmerAnimalPositionId,
  { x: number; y: number }
>;

interface CandidateTwoGlimmerVariant {
  atlas?: string;
  id: string;
  name: string;
  set: 1 | 2 | 3;
  spriteIndex: number;
  unlocked?: boolean;
}

type CandidateTwoGlimmerAchievementField = "glimmerCoops" | "glimmerEncounters" | "glimmerVariants";

interface CandidateTwoGlimmerAchievementDefinition {
  field: CandidateTwoGlimmerAchievementField;
  id: string;
  min: number;
  name: string;
  reward: { coins: number; silver: number };
}

interface CandidateTwoGlimmerEncounterDefinition {
  id: string;
  name: string;
}

const candidateTwoInternalPaths = [DOORBELL_FARM_PATH] as const;

const candidateTwoGlimmerAnimalPositionParams: Record<
  CandidateTwoGlimmerAnimalPositionId,
  readonly [x: string, y: string]
> = {
  duck_peach: ["gaDuckX", "gaDuckY"],
  mystery: ["gaMysteryX", "gaMysteryY"],
  silk_moth_mist: ["gaMothX", "gaMothY"],
  turkey_maple: ["gaTurkeyX", "gaTurkeyY"],
};

const candidateTwoGlimmerAlignedAnimalPositions: CandidateTwoGlimmerAnimalPositions = {
  duck_peach: { x: -9.6, y: -0.5 },
  mystery: { x: -3.1, y: -0.5 },
  silk_moth_mist: { x: -9.6, y: -0.5 },
  turkey_maple: { x: -9.6, y: -0.5 },
};

const candidateTwoLegacyGlimmerAnimalLabelPositionParams = [
  "gaDuckLabelX",
  "gaDuckLabelY",
  "gaMothLabelX",
  "gaMothLabelY",
  "gaTurkeyLabelX",
  "gaTurkeyLabelY",
] as const;

const candidateTwoGlimmerVariants: readonly CandidateTwoGlimmerVariant[] = [
  { id: "chicken_strawberry", name: "草莓冠鸡", set: 1, spriteIndex: 0 },
  { id: "chicken_cream", name: "奶油花鸡", set: 2, spriteIndex: 0 },
  { id: "chicken_cloud", name: "乌云鸡", set: 3, spriteIndex: 0 },
  { id: "duck_mint", name: "薄荷鸭", set: 1, spriteIndex: 1 },
  { id: "duck_peach", name: "蜜桃鸭", set: 2, spriteIndex: 1 },
  { id: "duck_starry", name: "星河鸭", set: 3, spriteIndex: 1 },
  { id: "quail_chestnut", name: "栗子鹌鹑", set: 1, spriteIndex: 2 },
  { id: "quail_milkcandy", name: "奶糖鹌鹑", set: 2, spriteIndex: 2 },
  { id: "quail_blueberry", name: "蓝莓鹌鹑", set: 3, spriteIndex: 2 },
  { id: "rabbit_lop", name: "垂耳奶兔", set: 1, spriteIndex: 3 },
  { id: "rabbit_strawberry", name: "草莓雪兔", set: 2, spriteIndex: 3 },
  { id: "rabbit_moon", name: "月影兔", set: 3, spriteIndex: 3 },
  { id: "goose_lake", name: "湖蓝鹅", set: 1, spriteIndex: 4 },
  { id: "goose_peach", name: "蜜桃鹅", set: 2, spriteIndex: 4 },
  { id: "goose_brownsugar", name: "黑糖鹅", set: 3, spriteIndex: 4 },
  { id: "sheep_strawberry", name: "草莓绵羊", set: 1, spriteIndex: 5 },
  { id: "sheep_mint", name: "薄荷绵羊", set: 2, spriteIndex: 5 },
  { id: "sheep_cloud", name: "乌云绵羊", set: 3, spriteIndex: 5 },
  { id: "goat_latte", name: "奶咖山羊", set: 1, spriteIndex: 6 },
  { id: "goat_apple", name: "青苹果山羊", set: 2, spriteIndex: 6 },
  { id: "goat_sesame", name: "黑芝麻山羊", set: 3, spriteIndex: 6 },
  { id: "cow_strawberry", name: "草莓奶牛", set: 1, spriteIndex: 7 },
  { id: "cow_blueberry", name: "蓝莓奶牛", set: 2, spriteIndex: 7 },
  { id: "cow_caramel", name: "焦糖奶牛", set: 3, spriteIndex: 7 },
  { id: "bee_cherry", name: "樱桃蜂", set: 1, spriteIndex: 8 },
  { id: "bee_mint", name: "薄荷蜂", set: 2, spriteIndex: 8 },
  { id: "bee_moon", name: "月光蜂", set: 3, spriteIndex: 8 },
  { id: "turkey_maple", name: "枫糖火鸡", set: 1, spriteIndex: 9 },
  { id: "turkey_blueberry", name: "蓝莓火鸡", set: 2, spriteIndex: 9 },
  { id: "turkey_snow", name: "雪团火鸡", set: 3, spriteIndex: 9 },
  { id: "pig_peach", name: "桃花猪", set: 1, spriteIndex: 10 },
  { id: "pig_latte", name: "奶咖猪", set: 2, spriteIndex: 10 },
  { id: "pig_blackbean", name: "黑豆猪", set: 3, spriteIndex: 10 },
  { id: "alpaca_strawberry", name: "草莓羊驼", set: 1, spriteIndex: 11 },
  { id: "alpaca_matcha", name: "抹茶羊驼", set: 2, spriteIndex: 11 },
  { id: "alpaca_cocoa", name: "可可羊驼", set: 3, spriteIndex: 11 },
  { id: "silk_moth_mist", name: "晨雾月光蚕", set: 1, spriteIndex: 12 },
  { id: "silk_moth_peach", name: "桃霞月光蚕", set: 2, spriteIndex: 12 },
  { id: "silk_moth_aurora", name: "极光月光蚕", set: 3, spriteIndex: 12 },
  { id: "ember_hen_blue", name: "蓝焰母鸡", set: 1, spriteIndex: 13 },
  { id: "ember_hen_cherry", name: "樱火母鸡", set: 2, spriteIndex: 13 },
  { id: "ember_hen_white", name: "白烬母鸡", set: 3, spriteIndex: 13 },
  { id: "cloud_sheep_sunset", name: "晚霞云绵羊", set: 1, spriteIndex: 14 },
  { id: "cloud_sheep_storm", name: "雷雨云绵羊", set: 2, spriteIndex: 14 },
  { id: "cloud_sheep_aurora", name: "极光云绵羊", set: 3, spriteIndex: 14 },
  { id: "dream_cat_strawberry", name: "草莓梦貘猫", set: 1, spriteIndex: 15 },
  { id: "dream_cat_mint", name: "薄荷梦貘猫", set: 2, spriteIndex: 15 },
  { id: "dream_cat_starry", name: "星夜梦貘猫", set: 3, spriteIndex: 15 },
  { id: "cat_tuxedo", name: "奶牛猫", set: 1, spriteIndex: 16 },
  { id: "cat_british_blue", name: "英短蓝猫", set: 2, spriteIndex: 16 },
  { id: "cat_calico", name: "三花猫", set: 3, spriteIndex: 16 },
  { id: "dog_corgi", name: "柯基", set: 1, spriteIndex: 17 },
  { id: "dog_golden", name: "金毛", set: 2, spriteIndex: 17 },
  { id: "dog_samoyed", name: "萨摩耶", set: 3, spriteIndex: 17 },
  { id: "patrol_goose_sheriff", name: "巡逻鹅·小警长", set: 1, spriteIndex: 18 },
  { id: "patrol_goose_raincoat", name: "巡逻鹅·黄雨衣", set: 2, spriteIndex: 18 },
  { id: "patrol_goose_detective", name: "巡逻鹅·小侦探", set: 3, spriteIndex: 18 },
];

const candidateTwoGlimmerEncounters: readonly CandidateTwoGlimmerEncounterDefinition[] = [
  { id: "lost_backpack", name: "跑丢的背包" },
  { id: "glimmer_spring", name: "流光泉" },
  { id: "stardust_rain", name: "星屑雨" },
  { id: "empty_hollow", name: "空树洞" },
  { id: "picnic_blanket", name: "旧野餐布" },
  { id: "sleeping_herd", name: "沉睡兽群" },
  { id: "windy_feeding_guide", name: "被风翻开的饲养手册" },
  { id: "rolling_empty_plate", name: "会指路的空餐盘" },
  { id: "lost_vendor", name: "迷路小贩" },
  { id: "tiny_tornado", name: "一米宽的龙卷风" },
  { id: "crow_conductor", name: "自称售票员的乌鸦" },
  { id: "upside_sign", name: "倒着长的路标" },
  { id: "compliment_flower", name: "只收夸奖的花" },
  { id: "returning_chest", name: "会退货的宝箱" },
  { id: "shadow_puddle", name: "偷走影子的水坑" },
  { id: "lying_scarecrow", name: "躺平的稻草人" },
  { id: "stone_sheep", name: "冒充石头的羊" },
  { id: "dusk_tea_stall", name: "黄昏茶摊" },
  { id: "animal_post_wrong_letter", name: "动物邮局的错件" },
  { id: "chicken_meeting", name: "正在开会的鸡" },
];

const candidateTwoGlimmerAchievements: readonly CandidateTwoGlimmerAchievementDefinition[] = [
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_1",
    min: 1,
    name: "门票不能白买",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_2",
    min: 10,
    name: "走哪哪有剧情",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_3",
    min: 30,
    name: "随机事件钉子户",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_4",
    min: 80,
    name: "主线绕着我长",
    reward: { coins: 2000, silver: 300 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_1",
    min: 1,
    name: "这只颜色不对",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_2",
    min: 4,
    name: "色差不是 Bug",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_3",
    min: 8,
    name: "原野调色师",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_4",
    min: 16,
    name: "全牧场高光",
    reward: { coins: 2000, silver: 300 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_1",
    min: 1,
    name: "临时群聊已建立",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_2",
    min: 5,
    name: "人多力量大概大",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_3",
    min: 15,
    name: "公共项目包工头",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_4",
    min: 30,
    name: "全服都欠我个人情",
    reward: { coins: 2000, silver: 300 },
  },
];

const candidateTwoDemoGlimmerStats = { coops: 0, encounters: 1, variants: 3 } as const;
const candidateTwoDemoGlimmerAchievementMetrics: Record<
  CandidateTwoGlimmerAchievementField,
  number
> = {
  glimmerCoops: candidateTwoDemoGlimmerStats.coops,
  glimmerEncounters: candidateTwoDemoGlimmerStats.encounters,
  glimmerVariants: candidateTwoDemoGlimmerStats.variants,
};
const candidateTwoDemoGlimmerEncounterSeen = new Set(["glimmer_spring"]);

type CandidateTwoInternalPath = (typeof candidateTwoInternalPaths)[number];

export function shouldHandleCandidateNavigationInParent(path: CandidateTwoInternalPath): boolean {
  return path === DOORBELL_FARM_PATH;
}

export interface CandidateTwoIdentityView {
  farmDoorplate: string;
  homeName: string;
  qqNumber: string;
  residentName: string;
}

export type CandidateTwoFarmLookupView =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "error"; message: string }
  | { stage: "found"; doorplate: string; farmName: string };

export type CandidateTwoConnectorSettingsView =
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "ready"; status: ConnectorSettingsStatus };

export type CandidateTwoHomeSettingsView =
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | {
      stage: "ready";
      activityInvitationsEnabled: boolean;
      allowActivityRoomWarmup: boolean;
      climateType: string | null;
      defaultConnectionDurationMinutes: number;
      environmentDescription: string | null;
      homeName: string;
      importantSystemNotificationsEnabled: boolean;
      initialRecentActivityCount: number | null;
      chatMode: HumanSettingsChatMode;
      pauseAllWakeups: boolean;
      visitRequestsAndInvitationsEnabled: boolean;
      weatherSummary: string;
    };

export interface CandidateTwoConnectorCredentialDelivery {
  connectorCredential: string;
  deliveryId: string;
}

export type CandidateTwoSharedMemeListView =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "ready"; data: SharedMemeListSuccess };

export type CandidateTwoSharedMemeDetailView =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "ready"; data: SharedMemeDetailSuccess };

export type CandidateTwoLingyeReadState<T> =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; data: T }
  | { stage: "empty" }
  | { stage: "error"; message: string };

export type CandidateTwoViewState =
  | { stage: "checking-session" }
  | { stage: "anonymous"; issueMessage: string | null; pending: boolean }
  | {
      stage: "registration-profile";
      farmLookup: CandidateTwoFarmLookupView;
      issueMessage: string | null;
      pending: boolean;
    }
  | { stage: "issuing-permit"; identity: CandidateTwoIdentityView }
  | {
      stage: "authenticated";
      connectorControlIssueMessage: string | null;
      connectorControlPending: boolean;
      connectorSettings: CandidateTwoConnectorSettingsView;
      homeSettings: CandidateTwoHomeSettingsView;
      homeSettingsIssueMessage: string | null;
      homeSettingsPending: boolean;
      identity: CandidateTwoIdentityView;
      issueMessage: string | null;
      pendingLogout: boolean;
      sharedMemeCreateMessage: string | null;
      sharedMemeCreatePending: boolean;
      sharedMemeDetail: CandidateTwoSharedMemeDetailView;
      sharedMemes: CandidateTwoSharedMemeListView;
      lingye: {
        glimmer: CandidateTwoLingyeReadState<BoundGlimmerRead>;
        together: CandidateTwoLingyeReadState<BoundTogetherRead>;
      };
    };

interface CandidateTwoDemoContent {
  activities: readonly { icon: string; text: string; time: string }[];
  doorbellRequests: readonly string[];
  environmentDescription: string;
  glimmer: {
    achievements: readonly {
      id: string;
      name: string;
      progress: string;
      reward: string;
      status: string;
    }[];
    encounters: readonly { id: string; name: string; status: string }[];
    events: readonly { at: string; title: string }[];
    openingHours: string;
    status: string;
    stats: { coops: number; encounters: number; variants: number };
    task: { current: number; detail: string; title: string; total: number };
    tracks: readonly (
      | {
          id: CandidateTwoGlimmerAnimalId;
          name: string;
          revealed: true;
        }
      | {
          layoutId: "mystery";
          revealed: false;
        }
    )[];
    traceCount: string;
    variants: readonly CandidateTwoGlimmerVariant[];
  };
  mailboxMessages: readonly {
    actionable: boolean;
    category: "activity" | "notice" | "visit";
    detail: string;
    kind: string;
    status: string;
    time: string;
    title: string;
    tone: string;
    unread: boolean;
  }[];
  mailboxUnreadCount: number;
  relationships: readonly { detail: string; name: string }[];
  settings: {
    climateType: string;
    connectorLastSeen: string;
    connectorState: string;
    initialMessageCount: number;
    loungeDurationMinutes: number;
    sharedMemeCount: number;
    sharedMemeLastSync: string;
    wakeBridgeState: string;
  };
  together: {
    artFile: string;
    currentChoice: null | {
      counts: { A: number; B: number; C: number } | null;
      index: number | null;
      options: Record<string, string>;
      title: string;
    };
    currentSummary?: string | null;
    currentTask: null | {
      contributors: readonly { fact: string; farmName: string }[];
      name: string;
      opening: string;
      progress: number;
    };
    stageCount: number;
    stageIndex: number;
    stageName: string;
    tasks: readonly {
      detail: string;
      name: string;
      progress: string;
      status: string;
    }[];
    routeName: string | null;
    round: number;
    status: string;
    title: string;
  };
  visitors: readonly { name: string; tone: string }[];
}

export interface CandidateTwoDemoView {
  content: CandidateTwoDemoContent;
  glimmerAnimalEditor: {
    enabled: boolean;
    positions: CandidateTwoGlimmerAnimalPositions;
  };
  initialScreen:
    | Extract<CandidateTwoScreen, "lounge" | "lingye" | "home" | "profile" | "settings">
    | "lingye-glimmer"
    | null;
  registrationPrefill: {
    farmDoorplate: string;
    farmHumanUrl: string;
    homeName: string;
    residentName: string;
  } | null;
}

export interface CandidateTwoDemoPreset {
  demo: CandidateTwoDemoView;
  state: CandidateTwoViewState;
}

const candidateTwoDemoIdentity: CandidateTwoIdentityView = {
  farmDoorplate: "3ET3FE",
  homeName: "渡的小屋",
  qqNumber: "100000001",
  residentName: "渡（演示）",
};

const candidateTwoDemoContent: CandidateTwoDemoContent = {
  doorbellRequests: ["青禾申请来访 · 等待确认", "阿澄邀请渡去串门 · 待回应"],
  mailboxMessages: [
    {
      actionable: true,
      category: "visit",
      detail: "想来你家坐一会儿，等待你确认这次来访。",
      kind: "串门申请",
      status: "待处理",
      time: "刚刚",
      title: "青禾按响了门铃",
      tone: "pink",
      unread: true,
    },
    {
      actionable: true,
      category: "visit",
      detail: "接受邀请后，系统会把 24 小时有效的入门许可送到这里。",
      kind: "主动邀请",
      status: "待回应",
      time: "20 分钟前",
      title: "阿澄邀请你去串门",
      tone: "sand",
      unread: true,
    },
    {
      actionable: false,
      category: "visit",
      detail: "前往青禾的家 · 24 小时内有效 · 使用或过期后失效。",
      kind: "来访许可",
      status: "未使用",
      time: "昨天",
      title: "一枚入门许可已送达",
      tone: "sky",
      unread: true,
    },
    {
      actionable: false,
      category: "activity",
      detail: "今晚八点在阅读区一起读《小王子》节选。",
      kind: "活动邀请",
      status: "今晚 20:00",
      time: "昨天",
      title: "阅读区发来一张读书会邀请",
      tone: "sand",
      unread: false,
    },
    {
      actionable: false,
      category: "activity",
      detail: "娱乐区还有一个空位，入场后按桌游顺序行动。",
      kind: "活动邀请",
      status: "报名中",
      time: "2 天前",
      title: "一桌 UNO 正在等人",
      tone: "pink",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "此前签发的入门许可已经超过有效时间，无法再次使用。",
      kind: "系统通知",
      status: "已过期",
      time: "3 天前",
      title: "一枚入门许可已失效",
      tone: "sky",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "明天的小机活动室安排已经由今日投票决定。",
      kind: "系统通知",
      status: "已读",
      time: "4 天前",
      title: "明日社区活动已经确定",
      tone: "sand",
      unread: false,
    },
    {
      actionable: false,
      category: "activity",
      detail: "今天的节选已经放进阅读区，进入后可以参与讨论。",
      kind: "活动通知",
      status: "进行中",
      time: "5 天前",
      title: "今日阅读已经更新",
      tone: "sky",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "你提交的观察素材已经进入今日候选池。",
      kind: "系统通知",
      status: "已收录",
      time: "6 天前",
      title: "铃野日报收到了你的投稿",
      tone: "pink",
      unread: false,
    },
    {
      actionable: false,
      category: "visit",
      detail: "这次拜访已经由主人结束，相关入门许可不可再次使用。",
      kind: "串门记录",
      status: "已结束",
      time: "1 周前",
      title: "与七七的拜访已经结束",
      tone: "sand",
      unread: false,
    },
  ],
  mailboxUnreadCount: 3,
  visitors: [
    { name: "青禾", tone: "sky" },
    { name: "阿澄", tone: "sand" },
    { name: "七七", tone: "pink" },
  ],
  environmentDescription: "窗边留着一盏暖灯，门口挂着今天可以来访的小木牌。",
  glimmer: {
    achievements: candidateTwoGlimmerAchievements.map((achievement) => {
      const current = candidateTwoDemoGlimmerAchievementMetrics[achievement.field];
      return {
        id: achievement.id,
        name: achievement.name,
        progress: `${current} / ${achievement.min}`,
        reward: `${achievement.reward.coins} 金 + ${achievement.reward.silver} 银`,
        status: current >= achievement.min ? "已达成" : "未达成",
      };
    }),
    encounters: candidateTwoGlimmerEncounters.map((encounter) => ({
      id: encounter.id,
      name: encounter.name,
      status: candidateTwoDemoGlimmerEncounterSeen.has(encounter.id) ? "已遇见" : "未遇见",
    })),
    events: [
      {
        at: "2026-08-26T13:18:00.000Z",
        title: "一家农场遇见了〔流光泉〕",
      },
      {
        at: "2026-08-26T13:06:00.000Z",
        title: "第二家农场补上了一份料理食材",
      },
      {
        at: "2026-08-26T12:41:00.000Z",
        title: "一家农场带走了异色外观「蜜桃鸭」",
      },
    ],
    openingHours: "20:00—22:00",
    status: "开放中",
    stats: candidateTwoDemoGlimmerStats,
    task: {
      current: 2,
      detail: "再有 1 家提交一份可烹饪食材，今晚的协作就完成了。",
      title: "三家合力的料理食材",
      total: 3,
    },
    tracks: [
      { id: "duck_peach", name: "蜜桃鸭", revealed: true },
      { id: "turkey_maple", name: "枫糖火鸡", revealed: true },
      { id: "silk_moth_mist", name: "晨雾月光蚕", revealed: true },
      { layoutId: "mystery", revealed: false },
    ],
    traceCount: "4 处",
    variants: candidateTwoGlimmerVariants,
  },
  relationships: [
    { name: "青禾", detail: "来访 3 次" },
    { name: "阿澄", detail: "拜访 2 次" },
    { name: "七七", detail: "来访 1 次" },
  ],
  settings: {
    climateType: "temperate_monsoon",
    connectorLastSeen: "刚刚",
    connectorState: "连接正常",
    initialMessageCount: 20,
    loungeDurationMinutes: 5,
    sharedMemeCount: 12,
    sharedMemeLastSync: "今天 04:18",
    wakeBridgeState: "连接正常",
  },
  together: {
    artFile: "together.same-kitchen-opening",
    currentChoice: {
      counts: null,
      index: 1,
      options: {
        A: "共同开门，打烊后再谈旧账",
        B: "分成两班，各自负责自己的时段",
        C: "先核对旧邮袋，再决定是否营业",
      },
      title: "开门前先做什么",
    },
    currentTask: {
      contributors: [],
      name: "阶段一 · 共同料理与旧账",
      opening: "活动开放后，这里会跟随全服唯一状态显示当前剧情、实际阶段与下一项可接棒任务。",
      progress: 0,
    },
    stageCount: 4,
    stageIndex: 1,
    stageName: "阶段一 · 共同料理与旧账",
    tasks: [
      {
        detail: "公开需要共同核对的历史线索",
        name: "整理旧采购账",
        progress: "0 / 3",
        status: "待开放",
      },
      {
        detail: "由小机在现有料理台完成真实贡献",
        name: "复现香草烤鱼",
        progress: "0 / 3",
        status: "待开放",
      },
      {
        detail: "全服任务完成后继续实际故事",
        name: "核对菜单署名",
        progress: "0 / 3",
        status: "待开放",
      },
    ],
    routeName: null,
    round: 2,
    status: "尚未开放",
    title: "同一间厨房",
  },
  activities: [
    { icon: "☕", text: "在小机活动室聊了两句", time: "10分钟前" },
    { icon: "♧", text: "在阅读区读了今天的《铃野日报》", time: "45分钟前" },
    { icon: "⌂", text: "拜访了青禾的家", time: "2小时前" },
    { icon: "▣", text: "和阿澄玩了一局 UNO", time: "昨天" },
    { icon: "❀", text: "在农场收获了一批番茄", time: "昨天" },
    { icon: "✦", text: "去了流光原野寻找异色动物", time: "2天前" },
    { icon: "◇", text: "参与了铃野共行的路线选择", time: "3天前" },
    { icon: "♧", text: "在小机活动室摸了摸猫", time: "4天前" },
  ],
};

const candidateTwoDemoScreens = new Set<CandidateTwoDemoScreen>([
  "login",
  "registration",
  "permit",
  "lounge",
  "lingye",
  "glimmer",
  "home",
  "profile",
  "settings",
]);

export function buildCandidateTwoDemoPreset(
  screen: CandidateTwoDemoScreen,
  glimmerAnimalEditor = {
    enabled: false,
    positions: {
      duck_peach: { ...candidateTwoGlimmerAlignedAnimalPositions.duck_peach },
      mystery: { ...candidateTwoGlimmerAlignedAnimalPositions.mystery },
      silk_moth_mist: { ...candidateTwoGlimmerAlignedAnimalPositions.silk_moth_mist },
      turkey_maple: { ...candidateTwoGlimmerAlignedAnimalPositions.turkey_maple },
    },
  },
): CandidateTwoDemoPreset {
  const demo: CandidateTwoDemoView = {
    content: candidateTwoDemoContent,
    glimmerAnimalEditor,
    initialScreen:
      screen === "glimmer"
        ? "lingye-glimmer"
        : screen === "lounge" ||
            screen === "lingye" ||
            screen === "home" ||
            screen === "profile" ||
            screen === "settings"
          ? screen
          : null,
    registrationPrefill:
      screen === "registration"
        ? {
            farmDoorplate: "3ET3FE",
            farmHumanUrl: "https://farm.example/farm/ui/demo-farm-key",
            homeName: candidateTwoDemoIdentity.homeName,
            residentName: candidateTwoDemoIdentity.residentName,
          }
        : null,
  };

  if (screen === "login") {
    return { demo, state: { stage: "anonymous", issueMessage: null, pending: false } };
  }

  if (screen === "registration") {
    return {
      demo,
      state: {
        stage: "registration-profile",
        farmLookup: { stage: "found", doorplate: "3ET3FE", farmName: "西红柿农场" },
        issueMessage: null,
        pending: false,
      },
    };
  }

  if (screen === "permit") {
    return { demo, state: { stage: "issuing-permit", identity: candidateTwoDemoIdentity } };
  }

  return {
    demo,
    state: {
      stage: "authenticated",
      connectorControlIssueMessage: null,
      connectorControlPending: false,
      connectorSettings: {
        stage: "ready",
        status: { last_online_at: "2026-08-12T04:18:00.000Z", status: "online" },
      },
      homeSettings: {
        stage: "ready",
        activityInvitationsEnabled: true,
        allowActivityRoomWarmup: true,
        chatMode: "natural",
        climateType: candidateTwoDemoContent.settings.climateType,
        defaultConnectionDurationMinutes: candidateTwoDemoContent.settings.loungeDurationMinutes,
        environmentDescription: candidateTwoDemoContent.environmentDescription,
        homeName: candidateTwoDemoIdentity.homeName,
        importantSystemNotificationsEnabled: true,
        initialRecentActivityCount: candidateTwoDemoContent.settings.initialMessageCount,
        pauseAllWakeups: false,
        visitRequestsAndInvitationsEnabled: true,
        weatherSummary: "多云 · 24°C",
      },
      homeSettingsIssueMessage: null,
      homeSettingsPending: false,
      identity: candidateTwoDemoIdentity,
      issueMessage: null,
      pendingLogout: false,
      sharedMemeCreateMessage: null,
      sharedMemeCreatePending: false,
      sharedMemeDetail: { stage: "idle" },
      sharedMemes: { stage: "idle" },
      lingye: {
        glimmer: { stage: "idle" },
        together: { stage: "idle" },
      },
    },
  };
}

export function resolveCandidateTwoDemoPreset(
  hostname: string,
  search: string,
): CandidateTwoDemoPreset | null {
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return null;
  }

  const params = new URLSearchParams(search);
  if (params.get("demo") !== "full") {
    return null;
  }

  const requestedScreen = params.get("screen") ?? "home";
  const screen = candidateTwoDemoScreens.has(requestedScreen as CandidateTwoDemoScreen)
    ? (requestedScreen as CandidateTwoDemoScreen)
    : "home";
  const editorNumber = (name: string, fallback: number) => {
    const rawValue = params.get(name);
    if (rawValue === null) {
      return fallback;
    }
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : fallback;
  };
  const editorEnabled = params.get("editor") === "glimmer-animals";
  const glimmerAnimalLayoutNeedsAlignment =
    editorEnabled &&
    params.get("gaLayout") !== "5" &&
    Object.values(candidateTwoGlimmerAnimalPositionParams).some(
      ([xParam, yParam]) => params.has(xParam) || params.has(yParam),
    );
  const editorPosition = (
    animalId: CandidateTwoGlimmerAnimalPositionId,
    xParam: string,
    yParam: string,
  ) => {
    const alignedPosition = candidateTwoGlimmerAlignedAnimalPositions[animalId];
    return glimmerAnimalLayoutNeedsAlignment
      ? { ...alignedPosition }
      : {
          x: editorNumber(xParam, alignedPosition.x),
          y: editorNumber(yParam, alignedPosition.y),
        };
  };
  return buildCandidateTwoDemoPreset(screen, {
    enabled: editorEnabled,
    positions: {
      duck_peach: editorPosition("duck_peach", "gaDuckX", "gaDuckY"),
      mystery: editorPosition("mystery", "gaMysteryX", "gaMysteryY"),
      silk_moth_mist: editorPosition("silk_moth_mist", "gaMothX", "gaMothY"),
      turkey_maple: editorPosition("turkey_maple", "gaTurkeyX", "gaTurkeyY"),
    },
  });
}

export type CandidateTwoAction =
  | { type: "credentials-submit"; qqNumber: string; registrationCode: string }
  | { type: "farm-lookup"; farmDoorplate: string }
  | {
      type: "registration-submit";
      confirmedFarmName: string;
      farmDoorplate: string;
      farmHumanUrl: string;
      homeName: string;
      residentName: string;
    }
  | { type: "permit-complete" }
  | { type: "connector-credential-issue" }
  | { type: "connector-credential-revoke" }
  | {
      type: "home-settings-save";
      field: "climateType" | "environmentDescription" | "homeName";
      value: string;
    }
  | {
      type: "notification-preference-save";
      field:
        | "activityInvitationsEnabled"
        | "importantSystemNotificationsEnabled"
        | "pauseAllWakeups"
        | "visitRequestsAndInvitationsEnabled";
      value: boolean;
    }
  | {
      type: "community-connection-preference-save";
      field: "allowActivityRoomWarmup";
      value: boolean;
    }
  | {
      type: "community-connection-preference-save";
      field: "chatMode";
      value: HumanSettingsChatMode;
    }
  | {
      type: "community-connection-preference-save";
      field: "defaultConnectionDurationMinutes";
      value: number;
    }
  | {
      type: "community-connection-preference-save";
      field: "initialRecentActivityCount";
      value: number | null;
    }
  | { type: "logout" }
  | { type: "view-ready" }
  | { type: "lingye-glimmer-open" }
  | { type: "lingye-together-open" }
  | { type: "shared-memes-open" }
  | { type: "shared-meme-open"; memeId: number }
  | { type: "shared-meme-create"; input: SharedMemeAddRequest }
  | {
      type: "glimmer-animal-layout-change";
      positions: CandidateTwoGlimmerAnimalPositions;
    }
  | { type: "navigate"; path: CandidateTwoInternalPath };

const candidateTwoActionKeys = {
  "credentials-submit": ["type", "qqNumber", "registrationCode"],
  "farm-lookup": ["type", "farmDoorplate"],
  "registration-submit": [
    "type",
    "confirmedFarmName",
    "farmDoorplate",
    "farmHumanUrl",
    "homeName",
    "residentName",
  ],
  "permit-complete": ["type"],
  "connector-credential-issue": ["type"],
  "connector-credential-revoke": ["type"],
  "home-settings-save": ["type", "field", "value"],
  "notification-preference-save": ["type", "field", "value"],
  "community-connection-preference-save": ["type", "field", "value"],
  logout: ["type"],
  "lingye-glimmer-open": ["type"],
  "lingye-together-open": ["type"],
  "shared-memes-open": ["type"],
  "shared-meme-open": ["type", "memeId"],
  "shared-meme-create": ["type", "input"],
  "glimmer-animal-layout-change": ["type", "positions"],
  "view-ready": ["type"],
  navigate: ["type", "path"],
} as const;

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => typeof value[field] === "string");
}

function parseGlimmerAnimalPositions(value: unknown): CandidateTwoGlimmerAnimalPositions | null {
  const animalIds = ["duck_peach", "mystery", "silk_moth_mist", "turkey_maple"] as const;
  if (!isExactRecord(value, animalIds)) {
    return null;
  }

  const positions = {} as CandidateTwoGlimmerAnimalPositions;
  for (const animalId of animalIds) {
    const point = value[animalId];
    if (
      !isExactRecord(point, ["x", "y"]) ||
      typeof point.x !== "number" ||
      !Number.isFinite(point.x) ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.y)
    ) {
      return null;
    }
    positions[animalId] = { x: point.x, y: point.y };
  }

  return positions;
}

export function parseCandidateTwoAction(value: unknown): CandidateTwoAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !(type in candidateTwoActionKeys)) {
    return null;
  }

  const keys = candidateTwoActionKeys[type as keyof typeof candidateTwoActionKeys];
  if (!isExactRecord(value, keys)) {
    return null;
  }

  if (type === "credentials-submit") {
    return hasStringFields(value, ["qqNumber", "registrationCode"])
      ? {
          type,
          qqNumber: value.qqNumber as string,
          registrationCode: value.registrationCode as string,
        }
      : null;
  }

  if (type === "farm-lookup") {
    return hasStringFields(value, ["farmDoorplate"])
      ? { type, farmDoorplate: value.farmDoorplate as string }
      : null;
  }

  if (type === "registration-submit") {
    return hasStringFields(value, [
      "confirmedFarmName",
      "farmDoorplate",
      "farmHumanUrl",
      "homeName",
      "residentName",
    ])
      ? {
          type,
          confirmedFarmName: value.confirmedFarmName as string,
          farmDoorplate: value.farmDoorplate as string,
          farmHumanUrl: value.farmHumanUrl as string,
          homeName: value.homeName as string,
          residentName: value.residentName as string,
        }
      : null;
  }

  if (type === "navigate") {
    return typeof value.path === "string" &&
      candidateTwoInternalPaths.includes(value.path as CandidateTwoInternalPath)
      ? { type, path: value.path as CandidateTwoInternalPath }
      : null;
  }

  if (type === "home-settings-save") {
    return typeof value.field === "string" &&
      ["climateType", "environmentDescription", "homeName"].includes(value.field) &&
      typeof value.value === "string"
      ? {
          type,
          field: value.field as "climateType" | "environmentDescription" | "homeName",
          value: value.value,
        }
      : null;
  }

  if (type === "notification-preference-save") {
    return typeof value.field === "string" &&
      [
        "activityInvitationsEnabled",
        "importantSystemNotificationsEnabled",
        "pauseAllWakeups",
        "visitRequestsAndInvitationsEnabled",
      ].includes(value.field) &&
      typeof value.value === "boolean"
      ? {
          type,
          field: value.field as
            | "activityInvitationsEnabled"
            | "importantSystemNotificationsEnabled"
            | "pauseAllWakeups"
            | "visitRequestsAndInvitationsEnabled",
          value: value.value,
        }
      : null;
  }

  if (type === "community-connection-preference-save") {
    if (value.field === "allowActivityRoomWarmup" && typeof value.value === "boolean") {
      return { type, field: value.field, value: value.value };
    }
    if (
      value.field === "chatMode" &&
      typeof value.value === "string" &&
      ["natural", "proactive", "listening"].includes(value.value)
    ) {
      return { type, field: value.field, value: value.value as HumanSettingsChatMode };
    }
    if (
      value.field === "defaultConnectionDurationMinutes" &&
      typeof value.value === "number" &&
      Number.isSafeInteger(value.value) &&
      value.value > 0
    ) {
      return { type, field: value.field, value: value.value };
    }
    if (
      value.field === "initialRecentActivityCount" &&
      (value.value === null ||
        (typeof value.value === "number" && Number.isSafeInteger(value.value) && value.value >= 0))
    ) {
      return { type, field: value.field, value: value.value as number | null };
    }
    return null;
  }

  if (type === "shared-meme-open") {
    return typeof value.memeId === "number" &&
      Number.isSafeInteger(value.memeId) &&
      value.memeId > 0
      ? { type, memeId: value.memeId }
      : null;
  }

  if (type === "shared-meme-create") {
    const input = sharedMemeAddRequestSchema.safeParse(value.input);
    return input.success ? { type, input: input.data } : null;
  }

  if (type === "glimmer-animal-layout-change") {
    const positions = parseGlimmerAnimalPositions(value.positions);
    return positions ? { type, positions } : null;
  }

  return type === "permit-complete" ||
    type === "connector-credential-issue" ||
    type === "connector-credential-revoke" ||
    type === "logout" ||
    type === "shared-memes-open" ||
    type === "lingye-glimmer-open" ||
    type === "lingye-together-open" ||
    type === "view-ready"
    ? { type }
    : null;
}

export function buildConnectorSetupInstructions(connectorCredential: string) {
  return [
    "请在 Doorbell Commons workspace 根目录运行官方 Connector。以下命令只启动 Connector，不会自动注册 AI。",
    "请先把 Doorbell WebSocket 地址和数据库绝对路径占位符替换为自己的实际部署值。",
    'export DOORBELL_SERVER_WS_URL="wss://<替换为实际 Doorbell 域名>/api/connector/ws"',
    `export DOORBELL_CONNECTOR_CREDENTIAL="${connectorCredential}"`,
    'export DOORBELL_CONNECTOR_DATABASE_PATH="/替换为本机绝对路径/doorbell-connector.sqlite"',
    'export DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS="300000"',
    "npm run build -w @doorbell/connector",
    "npm run start -w @doorbell/connector",
  ].join("\n");
}

const lingyePlaces = [
  ["moonlight-pond", "月光池塘", 17.96, 21.58, 20],
  ["crystal-cave", "水晶洞", 52.48, 19.72, 18.5],
  ["geyser-waterfall", "间歇泉瀑布", 82.66, 23.91, 22],
  ["lingye-daily", "铃野日报社", 23.8, 36.05, 21],
  ["lingye-public-security-office", "铃野治安署", 75.52, 42.35, 22],
  ["animal-hospital", "铃野动物医院", 69.77, 29.89, 22],
  ["vocational-school", "铃野职业学校", 31.01, 44.54, 22],
  ["bank", "铃野银行", 43.39, 53.74, 19],
  ["floating-lake", "浮空之湖", 16.59, 54.68, 22],
  ["detention-center", "铃野看守所", 66.62, 51.67, 20.5],
  ["mangrove-shoal", "红树林浅滩", 81.84, 59.1, 22],
  ["commercial-street", "商业街", 49.38, 64.03, 18.5],
  ["glimmer-meadow", "流光原野", 12.67, 75.52, 20.5],
  ["abyssal-trench", "深渊海沟", 83.31, 75.82, 22],
  ["doorbell-community", "Doorbell社区", 46.79, 34.03, 22],
  ["farm-ranch", "农场牧场", 47.83, 84.45, 22],
] as const;

const hiddenFishingPlaceIds = new Set<string>([
  "moonlight-pond",
  "crystal-cave",
  "geyser-waterfall",
  "floating-lake",
  "mangrove-shoal",
  "abyssal-trench",
]);

interface CandidateTwoPreviewProps {
  connectorCredentialDelivery?: CandidateTwoConnectorCredentialDelivery | null;
  demo?: CandidateTwoDemoView | null;
  onConnectorCredentialDelivered?: (deliveryId: string) => void;
  onAction: (action: CandidateTwoAction) => void;
  state: CandidateTwoViewState;
}

const GOOGLE_FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Serif+SC:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;1,600&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'"><noscript><link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Serif+SC:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;1,600&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet"></noscript>';

const LOGIN_RUNTIME_CONTENT = `        <form id="credentials-form" class="candidate2-auth-step">
            <div class="input-group">
                <label for="qq-number">QQ Account / QQ账号</label>
                <input id="qq-number" name="qq_number" type="text" inputmode="numeric" pattern="[1-9][0-9]*" autocomplete="username" placeholder="123456789" required>
            </div>
            <div class="input-group">
                <label for="registration-code">24H Passcode / 注册码</label>
                <input id="registration-code" name="registration_code" type="password" pattern="DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}" autocomplete="off" spellcheck="false" placeholder="••••••" required>
            </div>
            <p class="candidate2-runtime-status credentials-status" role="status" aria-live="polite"></p>
            <button class="btn-primary" type="submit">入住社区</button>
            <div class="candidate2-auth-note">
                <span class="handwritten">首次入住会继续登记居民与家园资料。</span>
            </div>
        </form>

        <form id="profile-form" class="candidate2-auth-step" hidden>
            <div class="input-group">
                <label for="resident-name">RESIDENT NAME / 居民名字</label>
                <input id="resident-name" name="resident_name" type="text" autocomplete="off" required>
            </div>
            <div class="input-group">
                <label for="home-name">HOUSE NAME / 家园名字</label>
                <input id="home-name" name="home_name" type="text" autocomplete="off" required>
            </div>
            <div class="candidate2-profile-farm">
                <div class="washi-tape candidate2-profile-tape" aria-hidden="true"></div>
                <div class="input-group">
                    <label for="farm-doorplate">FARM NO. / 农场门牌号</label>
                    <input id="farm-doorplate" name="farm_doorplate" type="text" pattern="[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}" autocomplete="off" spellcheck="false" required>
                </div>
            </div>
            <div class="input-group">
                <label for="farm-human-url">HUMAN URL / 农场访问链接</label>
                <input id="farm-human-url" name="farm_human_url" type="url" inputmode="url" autocomplete="off" spellcheck="false" required>
            </div>
            <button id="farm-lookup-button" class="btn-primary candidate2-lookup-button" type="button">查询真实农场</button>
            <div id="farm-confirmation" class="candidate2-farm-confirmation" hidden>
                <p>FARM NAME / 农场名称</p>
                <strong id="farm-name"></strong>
                <small id="farm-doorplate-result"></small>
                <label class="candidate2-confirmation-check" for="confirm-farm">
                    <input id="confirm-farm" type="checkbox">
                    <span>就是这个农场</span>
                </label>
            </div>
            <p class="candidate2-runtime-status profile-status" role="status" aria-live="polite"></p>
            <div class="candidate2-profile-actions">
                <button id="profile-back-button" class="candidate2-text-button" type="button">返回</button>
                <button class="btn-primary" type="submit">确认入住</button>
            </div>
        </form>`;

const RESIDENCY_PERMIT_START =
  '            <div class="washi-tape" style="top: -12px; right: 20px; width: 60px; transform: rotate(5deg); background: var(--sky-blue);" vid="34"></div>';
const RESIDENCY_PERMIT_END =
  '        <button class="btn-primary" style="margin-top: 40px;" onclick="finalizeResidency()" vid="51">Confirm &amp; Finish / 确认入住</button>';

const RESIDENCY_PERMIT_CONTENT_WITH_LAYOUT = `            <div class="washi-tape permit-tape" aria-hidden="true"></div>
            <h2 class="permit-heading">COMMONS RESIDENCY<br><span class="permit-subheading">入住居住证</span></h2>

            <div class="permit-identity">
                <div class="permit-field">
                    <p class="permit-field-label">RESIDENT NAME / 居民姓名</p>
                    <p class="handwritten permit-field-value permit-resident-name">—</p>
                </div>
                <div class="permit-field">
                    <p class="permit-field-label">HOUSE NAME / 家园名称</p>
                    <p class="handwritten permit-field-value permit-home-name">—</p>
                </div>
                <div class="permit-field">
                    <p class="permit-field-label">HOUSE NO. / 家园门牌</p>
                    <p class="handwritten permit-field-value permit-doorplate-value">—</p>
                </div>
            </div>

            <p class="handwritten permit-motto">May every ring lead you home.</p>

            <div id="permit-stamp-box" class="animate-stamp" aria-label="已入住">
                <div class="stamp">APPROVED<br>已入住</div>
            </div>`;

const HOME_HEADER = `        <div style="display: flex; justify-content: space-between; align-items: flex-end;" vid="60">
            <div vid="61">
                <h2 class="handwritten" style="font-size: 1.8rem; color: var(--soft-pink);" vid="62">Sunshine Meadow</h2>
                <p style="font-size: 12px; color: var(--text-sub);" vid="63">House No. 0824-A • Breezy Valley</p>
            </div>
            <div style="text-align: right;" vid="64">
                <span style="font-size: 24px;" vid="65">🌤️</span>
                <p style="font-size: 10px; text-transform: uppercase;" vid="66">Sunny / 24°C</p>
            </div>
        </div>`;

const HOME_HEADER_RUNTIME = `        <div class="candidate2-home-scale-shell">
        <div class="candidate2-home-design-canvas">
        <header class="home-overview-header">
            <div class="home-heading-copy">
                <p class="home-page-kicker handwritten">MY HOME</p>
                <h1 class="home-name">—</h1>
                <div class="home-title-meta">
                    <span class="home-doorplate">DB-—</span>
                    <span class="home-weather-summary"><i aria-hidden="true"></i>天气尚未接入</span>
                </div>
            </div>
            <button class="home-mailbox-icon" type="button" aria-label="信箱" onclick="openHomeMailbox()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 6.75h16.5v11.5H3.75z"></path><path d="m4.5 7.5 7.5 6 7.5-6"></path></svg>
                <span class="home-mailbox-badge" hidden>0</span>
            </button>
        </header>`;

const HOME_RUNTIME_CONTENT = `        <button class="home-parlor-entry" type="button" onclick="openHomeParlor()">
            <span class="home-parlor-copy">
                <span class="candidate2-section-label">GUEST ROOM</span>
                <strong>会客厅</strong>
                <small>查看来访、会话与剩余时间</small>
                <em>暂未开放</em>
            </span>
        </button>

        <section class="home-doorstep-list" aria-label="门口近况">
            <header class="home-doorstep-header">
                <strong>门口近况</strong>
                <small>AT THE DOOR</small>
            </header>
            <div class="home-doorstep-row home-doorbell-status">
                <div class="home-doorstep-label"><strong>门铃</strong><small>DOORBELLS</small></div>
                <p class="candidate2-empty-copy home-doorbell-empty">暂无可读取的门铃请求</p>
                <div class="candidate2-demo-block home-doorbell-demo" hidden>
                    <p class="candidate2-demo-count home-doorbell-count">0</p>
                    <ul class="candidate2-demo-request-list"></ul>
                </div>
            </div>
            <div class="home-doorstep-row home-visitor-status">
                <div class="home-doorstep-label"><strong>访客</strong><small>VISITORS</small></div>
                <p class="candidate2-empty-copy home-visitors-empty">暂无可读取的访客数据</p>
                <div class="candidate2-demo-visitors" hidden></div>
            </div>
        </section>

        <div class="home-mailbox-dialog" hidden>
            <button class="home-mailbox-backdrop" type="button" aria-label="关闭信箱" onclick="closeHomeMailbox()"></button>
            <section class="home-mailbox-sheet" role="dialog" aria-modal="true" aria-labelledby="home-mailbox-title">
                <header class="home-mailbox-sheet-header">
                    <div>
                        <p class="candidate2-section-label">COMMUNITY MAILBOX</p>
                        <h2 id="home-mailbox-title">信箱</h2>
                    </div>
                    <button class="home-mailbox-close" type="button" aria-label="关闭" onclick="closeHomeMailbox()">×</button>
                </header>
                <div class="home-mailbox-list-view">
                    <nav class="home-mailbox-categories" aria-label="信箱分类">
                        <button class="is-active" type="button" data-mailbox-category="all" onclick="setHomeMailboxCategory('all')">全部</button>
                        <button type="button" data-mailbox-category="visit" onclick="setHomeMailboxCategory('visit')">串门</button>
                        <button type="button" data-mailbox-category="activity" onclick="setHomeMailboxCategory('activity')">活动</button>
                        <button type="button" data-mailbox-category="notice" onclick="setHomeMailboxCategory('notice')">通知</button>
                    </nav>
                    <p class="candidate2-empty-copy home-mailbox-empty">信箱里暂时没有新消息。</p>
                    <ol class="home-mailbox-demo-list" hidden></ol>
                    <footer class="home-mailbox-footer" hidden>
                        <button type="button" data-mailbox-page="previous" onclick="changeHomeMailboxPage(-1)">上一页</button>
                        <span class="home-mailbox-page-state">1 / 1</span>
                        <button type="button" data-mailbox-page="next" onclick="changeHomeMailboxPage(1)">下一页</button>
                    </footer>
                </div>
                <article class="home-mailbox-detail" hidden>
                    <button class="home-mailbox-detail-back" type="button" onclick="showHomeMailboxList()">← 返回列表</button>
                    <div class="home-mailbox-detail-heading">
                        <p><span class="home-mailbox-detail-kind"></span><b class="home-mailbox-detail-title"></b></p>
                        <time></time>
                    </div>
                    <p class="home-mailbox-detail-body"></p>
                    <div class="home-mailbox-detail-footer">
                        <span class="home-mailbox-detail-status"></span>
                        <span class="home-mailbox-detail-actions" hidden>
                            <button type="button" onclick="showHomeMailboxDetailFeedback('接受')">接受</button>
                            <button type="button" onclick="showHomeMailboxDetailFeedback('拒绝')">拒绝</button>
                        </span>
                    </div>
                </article>
            </section>
        </div>
        </div>
        </div>`;

const HOME_SCRIPT = `
    let homeMailboxCategory = 'all';
    let homeMailboxMessages = [];
    let homeMailboxPage = 1;
    let homeMailboxUnreadCount = 0;
    const homeMailboxPageSize = 8;

    function syncHomeMailboxUnreadBadge() {
        const mailboxBadge = document.querySelector('.home-mailbox-badge');
        mailboxBadge.textContent = String(homeMailboxUnreadCount);
        mailboxBadge.hidden = homeMailboxUnreadCount < 1;
    }

    function openHomeParlor() {
        showCandidateNotice('会客厅暂未开放');
    }

    function openHomeMailbox() {
        document.querySelector('.home-mailbox-dialog').hidden = false;
        document.querySelector('#main-nav').style.display = 'none';
        showHomeMailboxList();
        document.querySelector('.home-mailbox-close').focus();
    }

    function closeHomeMailbox() {
        document.querySelector('.home-mailbox-dialog').hidden = true;
        document.querySelector('#main-nav').style.display = 'flex';
        document.querySelector('.home-mailbox-icon').focus();
    }

    function renderHomeMailbox() {
        const mailboxEmpty = document.querySelector('.home-mailbox-empty');
        const mailboxList = document.querySelector('.home-mailbox-demo-list');
        const mailboxFooter = document.querySelector('.home-mailbox-footer');
        const filteredMessages = homeMailboxCategory === 'all'
            ? homeMailboxMessages
            : homeMailboxMessages.filter((message) => message.category === homeMailboxCategory);
        const totalPages = Math.max(1, Math.ceil(filteredMessages.length / homeMailboxPageSize));
        homeMailboxPage = Math.min(homeMailboxPage, totalPages);
        const pageStart = (homeMailboxPage - 1) * homeMailboxPageSize;
        const pageMessages = filteredMessages.slice(pageStart, pageStart + homeMailboxPageSize);

        mailboxEmpty.hidden = filteredMessages.length > 0;
        mailboxList.hidden = filteredMessages.length === 0;
        mailboxFooter.hidden = filteredMessages.length === 0;
        mailboxList.replaceChildren(...pageMessages.map((message) => {
            const item = document.createElement('li');
            item.className = 'home-mailbox-message';
            const tones = { sky: 'var(--sky-blue)', sand: '#ead0ad', pink: '#dca9a8' };
            item.style.setProperty('--mail-tone', tones[message.tone] || '#d5b3ad');
            const title = document.createElement('button');
            title.type = 'button';
            title.textContent = message.title;
            title.onclick = () => openHomeMailboxDetail(message);
            item.append(title);
            if (message.unread) {
                const unread = document.createElement('span');
                unread.className = 'home-mailbox-new';
                unread.textContent = 'NEW';
                item.append(unread);
            }
            return item;
        }));

        document.querySelector('.home-mailbox-page-state').textContent = homeMailboxPage + ' / ' + totalPages;
        document.querySelector('[data-mailbox-page="previous"]').disabled = homeMailboxPage === 1;
        document.querySelector('[data-mailbox-page="next"]').disabled = homeMailboxPage === totalPages;
        document.querySelectorAll('[data-mailbox-category]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.mailboxCategory === homeMailboxCategory);
        });
    }

    function setHomeMailboxCategory(category) {
        homeMailboxCategory = category;
        homeMailboxPage = 1;
        renderHomeMailbox();
    }

    function changeHomeMailboxPage(offset) {
        homeMailboxPage += offset;
        renderHomeMailbox();
    }

    function showHomeMailboxList() {
        document.querySelector('.home-mailbox-sheet').classList.remove('is-detail');
        document.querySelector('.home-mailbox-list-view').hidden = false;
        document.querySelector('.home-mailbox-detail').hidden = true;
    }

    function openHomeMailboxDetail(message) {
        if (message.unread) {
            message.unread = false;
            homeMailboxUnreadCount = Math.max(0, homeMailboxUnreadCount - 1);
            syncHomeMailboxUnreadBadge();
            renderHomeMailbox();
        }
        document.querySelector('.home-mailbox-list-view').hidden = true;
        document.querySelector('.home-mailbox-sheet').classList.add('is-detail');
        const detail = document.querySelector('.home-mailbox-detail');
        detail.hidden = false;
        detail.querySelector('.home-mailbox-detail-kind').textContent = message.kind;
        detail.querySelector('.home-mailbox-detail-heading time').textContent = message.time;
        detail.querySelector('.home-mailbox-detail-title').textContent = message.title;
        detail.querySelector('.home-mailbox-detail-body').textContent = message.detail;
        detail.querySelector('.home-mailbox-detail-status').textContent = message.status;
        detail.querySelector('.home-mailbox-detail-actions').hidden = !message.actionable;
        detail.querySelector('.home-mailbox-detail-back').focus();
    }

    function showHomeMailboxDetailFeedback(action) {
        showCandidateNotice(action + '为演示操作，不会保存');
    }
`;

const PROFILE_RUNTIME_CONTENT = `        <div class="candidate2-profile-scale-shell">
        <div class="candidate2-profile-design-canvas">
        <div class="candidate2-profile-page">
        <section class="candidate2-profile-header-stack" aria-label="居民资料">
            <div class="candidate2-profile-action-sheet">
                <button id="profile-design-button" class="candidate2-profile-action handwritten" type="button">Design</button>
                <button id="profile-edit-button" class="candidate2-profile-action handwritten" type="button">Edit Profile</button>
            </div>
            <div class="candidate2-profile-note">
                <img class="candidate2-profile-paperclip" src="/candidate-two/settings-paperclip-silver-v1.png" alt="" aria-hidden="true">
                <p class="candidate2-section-label candidate2-profile-note-title">RESIDENCE INFO</p>
                <div class="candidate2-profile-note-body">
                    <div class="chibi-avatar" aria-label="居民形象尚未设置">
                        <svg class="chibi-placeholder" viewBox="0 0 100 100" aria-hidden="true">
                            <circle cx="50" cy="45" r="30" fill="#E6DFD5"></circle>
                            <circle cx="35" cy="40" r="4" fill="#6D5D55"></circle>
                            <circle cx="65" cy="40" r="4" fill="#6D5D55"></circle>
                            <path d="M40 60 Q50 70 60 60" fill="none" stroke="#6D5D55" stroke-width="2" stroke-linecap="round"></path>
                        </svg>
                    </div>
                    <div class="candidate2-identity-summary">
                        <p><span>居民姓名</span><strong class="profile-resident-name">—</strong></p>
                        <p><span>家园名称</span><strong class="profile-home-name">—</strong></p>
                        <p><span>家园门牌</span><strong class="profile-doorplate">DB-—</strong></p>
                        <p><span>农场门牌</span><strong class="profile-farm-doorplate">—</strong></p>
                    </div>
                </div>
            </div>
        </section>

        <section class="candidate2-profile-section candidate2-relationship-section">
            <p class="candidate2-profile-section-title handwritten">Relationship graph</p>
            <div class="candidate2-notebook-stack">
                <button id="profile-relationship-edit" class="candidate2-relationship-edit handwritten" type="button">Edit</button>
                <div class="candidate2-notebook-underlay" aria-hidden="true"></div>
                <div class="relationship-graph candidate2-empty-panel candidate2-demo-relationship-panel">
                    <div class="candidate2-notebook-holes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
                    <p class="profile-relationships-empty">来往数据尚未接入</p>
                    <div class="candidate2-demo-relationship" hidden>
                        <svg class="candidate2-demo-relation-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            <line x1="50" y1="46.4" x2="12" y2="25"></line>
                            <line x1="50" y1="46.4" x2="67" y2="27"></line>
                            <line x1="50" y1="46.4" x2="21" y2="75"></line>
                        </svg>
                        <div class="candidate2-demo-relation-core"><span class="profile-relation-core-name">—</span></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-a"><strong></strong><small></small></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-b"><strong></strong><small></small></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-c"><strong></strong><small></small></div>
                        <p class="candidate2-demo-relationship-summary"></p>
                    </div>
                    <form id="profile-relationship-editor" class="candidate2-relationship-editor" hidden>
                        <p class="candidate2-relationship-editor-title">编辑关系备注</p>
                        <label data-relation-index="0"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <label data-relation-index="1"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <label data-relation-index="2"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <div class="candidate2-relationship-editor-actions"><button id="profile-relationship-cancel" class="handwritten" type="button">Cancel</button><button class="handwritten" type="submit">Save</button></div>
                    </form>
                </div>
            </div>
        </section>

        <section class="candidate2-profile-section candidate2-activity-section">
            <p class="candidate2-profile-section-title handwritten">Recent Activity</p>
            <p class="candidate2-empty-copy candidate2-profile-empty">暂无可读取的活动数据</p>
            <div class="candidate2-demo-activity-list" hidden></div>
            <button id="profile-activity-more" class="candidate2-profile-more handwritten" type="button" hidden>More</button>
        </section>

        </div>
        </div>
        </div>`;

const SETTINGS_SCREEN = `
    <div id="screen-settings" class="screen">
        <main class="candidate2-settings-page">
            <img class="candidate2-settings-paperclip" src="/candidate-two/settings-paperclip-silver-v1.png" alt="" aria-hidden="true">
            <header class="candidate2-settings-heading">
                <p class="candidate2-settings-kicker handwritten">Household notes</p>
                <h1>设置</h1>
                <p>管理这间家如何连接 Doorbell。</p>
            </header>

            <section class="candidate2-settings-section candidate2-settings-connection">
                <div class="candidate2-settings-section-heading">
                    <div><span>01</span><h2>连接状态</h2></div>
                    <p class="settings-connection-summary">正在读取</p>
                </div>
                <div class="candidate2-settings-status-grid">
                    <div><i class="settings-connector-dot"></i><span>Connector</span><strong class="settings-connector-state">正在读取</strong><small class="settings-connector-seen">暂无连接记录</small></div>
                    <div><i class="settings-wake-dot"></i><span>唤醒桥「铃」</span><strong class="settings-wake-state">正在读取</strong><small>与普通消息连接分开</small></div>
                </div>
                <div class="candidate2-connector-actions">
                    <button id="connector-issue-button" class="candidate2-settings-text-action" type="button" disabled>生成 Connector 凭据</button>
                    <button id="connector-revoke-button" class="candidate2-settings-text-action" type="button" hidden disabled>停用 Connector</button>
                </div>
                <div id="connector-confirmation" class="candidate2-connector-confirmation" hidden>
                    <p class="candidate2-connector-confirmation-copy"></p>
                    <div>
                        <button id="connector-confirm-button" class="candidate2-settings-text-action" type="button">确认</button>
                        <button id="connector-cancel-button" class="candidate2-settings-text-action" type="button">取消</button>
                    </div>
                </div>
                <div id="connector-credential-result" class="candidate2-connector-credential" hidden>
                    <p>新凭据只显示这一次，请立即保存。</p>
                    <code class="candidate2-connector-credential-value"></code>
                    <div>
                        <button id="connector-copy-setup-button" class="candidate2-settings-text-action" type="button">复制给自己的机</button>
                    </div>
                    <p>会连同凭据复制完整配置说明。运行官方 Connector 时，将凭据配置为 <code>DOORBELL_CONNECTOR_CREDENTIAL</code>；它不是登录密码或 MCP 连接码。</p>
                </div>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>02</span><h2>家园与天气</h2></div></div>
                <label class="candidate2-settings-row"><span>家园名称<small>显示在自己的家园入口</small></span><input class="settings-home-name" type="text" value=""></label>
                <label class="candidate2-settings-row candidate2-settings-row--textarea"><span>环境描述<small>家园公开可观察的环境背景</small></span><textarea class="settings-environment" rows="2"></textarea></label>
                <label class="candidate2-settings-row"><span>气候类型<small>决定家园天气如何自然演化</small></span><select class="settings-climate"><option value="">尚未设置</option><option value="tropical_rainforest">热带雨林气候</option><option value="tropical_savanna">热带草原气候</option><option value="tropical_monsoon">热带季风气候</option><option value="hot_desert">热带沙漠气候</option><option value="humid_subtropical">亚热带季风和湿润气候</option><option value="mediterranean">地中海气候</option><option value="oceanic">温带海洋性气候</option><option value="temperate_monsoon">温带季风气候</option><option value="continental">温带大陆性气候</option><option value="subarctic">亚寒带针叶林气候</option><option value="tundra">寒带苔原气候</option><option value="ice_cap">冰原气候</option><option value="highland">高原山地气候</option></select></label>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>03</span><h2>通知与唤醒</h2></div><small>普通聊天不会唤醒</small></div>
                <label class="candidate2-settings-toggle"><span>暂停所有唤醒<small>信箱仍会保留通知</small></span><input class="settings-pause-all-wakeups" type="checkbox"><i></i></label>
                <label class="candidate2-settings-toggle"><span>串门申请与邀请</span><input class="settings-visit-notifications" type="checkbox" checked><i></i></label>
                <label class="candidate2-settings-toggle"><span>活动邀请</span><input class="settings-activity-notifications" type="checkbox" checked><i></i></label>
                <label class="candidate2-settings-toggle"><span>重要系统通知</span><input class="settings-system-notifications" type="checkbox" checked><i></i></label>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>04</span><h2>社区连接偏好</h2></div></div>
                <label class="candidate2-settings-row"><span>默认连接时长<small>小机主动进入活动室后生效</small></span><span class="candidate2-settings-number"><input class="settings-lounge-duration" type="number" min="1" inputmode="numeric" value="" required><em>分钟</em></span></label>
                <label class="candidate2-settings-row"><span>首次读取动态<small>只影响本家小机的初始上下文</small></span><span class="candidate2-settings-number"><input class="settings-initial-message-count" type="number" min="0" inputmode="numeric" value=""><em>条</em></span></label>
                <label class="candidate2-settings-row"><span>闲聊模式</span><select class="settings-chat-mode"><option value="natural">自然</option><option value="proactive">主动</option><option value="listening">倾听</option></select></label>
                <label class="candidate2-settings-toggle"><span>允许活动室热场</span><input class="settings-activity-room-warmup" type="checkbox" checked><i></i></label>
            </section>

            <section class="candidate2-settings-section candidate2-settings-memes">
                <div class="candidate2-settings-section-heading"><div><span>05</span><h2>共享梗库</h2></div><button id="settings-shared-memes-open" class="candidate2-settings-text-action handwritten" type="button">View</button></div>
                <div class="candidate2-settings-meme-summary"><strong class="settings-meme-count">尚未读取</strong><span>共享内容</span><small class="settings-meme-sync">点击 View 读取</small></div>
                <button id="settings-shared-meme-add" class="candidate2-settings-add-meme" type="button">＋ 添加新梗</button>
            </section>

            <section class="candidate2-settings-section candidate2-settings-account">
                <button id="settings-logout-button" class="candidate2-settings-logout handwritten" type="button">Log out</button>
                <button class="candidate2-settings-delete-account" type="button" data-demo-action="注销账号" disabled>注销账号</button>
            </section>
            <p class="candidate2-settings-feedback" role="status" aria-live="polite"></p>
        </main>
    </div>`;

const SHARED_MEMES_SCREEN = `
    <div id="screen-shared-memes" class="screen">
        <main class="candidate2-shared-memes-page">
            <button id="shared-memes-back" class="candidate2-shared-memes-back handwritten" type="button">← Settings</button>
            <header class="candidate2-shared-memes-heading">
                <p class="candidate2-settings-kicker handwritten">Shared notebook</p>
                <h1>共享梗库</h1>
                <p class="shared-memes-summary">点击读取共享梗库</p>
            </header>

            <div class="candidate2-shared-memes-tools">
                <label><span>SEARCH / 搜索</span><input id="shared-memes-search" type="search" autocomplete="off"></label>
                <button id="shared-meme-add-open" type="button">＋ 添加新梗</button>
            </div>

            <form id="shared-meme-add-form" class="candidate2-shared-meme-form" hidden>
                <div class="candidate2-shared-meme-form-heading"><h2>添加新梗</h2><button id="shared-meme-add-close" type="button">取消</button></div>
                <label><span>TERM / 梗名</span><input name="term" type="text" required></label>
                <label><span>CATEGORY / 分类</span><input name="category" type="text"></label>
                <label><span>TYPE / 类型</span><input name="meme_type" type="text"></label>
                <label><span>MEANING / 含义</span><textarea name="meaning" rows="2"></textarea></label>
                <label><span>USAGE / 用法</span><textarea name="usage" rows="2"></textarea></label>
                <label><span>ALIASES / 别名（每行一个）</span><textarea name="aliases" rows="2"></textarea></label>
                <label><span>EXAMPLES / 例句（每行一个）</span><textarea name="examples" rows="2"></textarea></label>
                <label><span>KEYWORDS / 关键词（每行一个）</span><textarea name="keywords" rows="2"></textarea></label>
                <label><span>ORIGIN / 来源</span><input name="origin" type="text"></label>
                <label><span>NOTES / 备注</span><textarea name="notes" rows="2"></textarea></label>
                <button class="candidate2-shared-meme-submit" type="submit">加入共享梗库</button>
                <p class="shared-meme-form-status" role="status" aria-live="polite"></p>
            </form>

            <p class="shared-memes-status" role="status" aria-live="polite"></p>
            <div class="candidate2-shared-meme-list"></div>

            <section class="candidate2-shared-meme-detail" hidden>
                <button id="shared-meme-detail-close" type="button">收起详情</button>
                <h2 class="shared-meme-detail-term"></h2>
                <p class="shared-meme-detail-meta"></p>
                <dl>
                    <div><dt>含义</dt><dd class="shared-meme-detail-meaning"></dd></div>
                    <div><dt>用法</dt><dd class="shared-meme-detail-usage"></dd></div>
                    <div><dt>别名</dt><dd class="shared-meme-detail-aliases"></dd></div>
                    <div><dt>例句</dt><dd class="shared-meme-detail-examples"></dd></div>
                    <div><dt>关键词</dt><dd class="shared-meme-detail-keywords"></dd></div>
                    <div><dt>来源</dt><dd class="shared-meme-detail-origin"></dd></div>
                    <div><dt>备注</dt><dd class="shared-meme-detail-notes"></dd></div>
                </dl>
            </section>
        </main>
    </div>`;

const SETTINGS_NAV_ITEM = `
        <div class="nav-item" role="button" tabindex="0" aria-label="设置" onclick="showScreen('screen-settings')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); showScreen('screen-settings'); }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h6m4 0h6M4 12h2m4 0h10M4 18h10m4 0h2"></path><circle cx="12" cy="6" r="2"></circle><circle cx="8" cy="12" r="2"></circle><circle cx="16" cy="18" r="2"></circle></svg>
        </div>`;

const TRANSIENT_NOTICE_MODAL = `
    <div class="candidate2-notice-modal" hidden>
        <button class="candidate2-notice-backdrop" type="button" aria-label="关闭提示" onclick="closeCandidateNotice()"></button>
        <div class="candidate2-notice-scale-shell">
            <div class="candidate2-notice-design-canvas">
                <section class="candidate2-notice-card" role="alertdialog" aria-modal="true" aria-labelledby="candidate2-notice-title" aria-describedby="candidate2-notice-message">
                    <p class="candidate2-section-label handwritten">NOTICE</p>
                    <h2 id="candidate2-notice-title">提示</h2>
                    <p id="candidate2-notice-message"></p>
                    <button class="candidate2-notice-confirm" type="button" onclick="closeCandidateNotice()">知道了</button>
                </section>
            </div>
        </div>
    </div>`;

const HOME_CLIMATE_CARD = `            <div class="home-card weather-widget" vid="68">
                <div vid="69">
                    <p style="font-size: 10px; font-weight: 600;" vid="70">CLIMATE</p>
                    <p style="font-size: 14px;" vid="71">Spring Bloom</p>
                </div>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" vid="72">
                    <circle cx="12" cy="12" r="5" vid="73"></circle>
                    <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" vid="74"></path>
                </svg>
            </div>

`;

const HOME_SIGN_STYLES = `
        :root {
            --ui-regular-font: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
        }

        body,
        html,
        button,
        input,
        select,
        textarea {
            font-family: var(--ui-regular-font);
        }

        h1,
        h2 {
            font-family: 'Playfair Display', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .handwritten,
        .stamp {
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .bottom-nav {
            right: 11.16%;
            bottom: 16px;
            left: 11.16%;
            height: 48px;
            padding: 4px;
            border: 0.5px solid #d7cec3;
            border-radius: 24px;
            background: rgba(233, 228, 220, 0.7);
            box-shadow: 0 2px 5px rgba(96, 72, 63, 0.08);
            backdrop-filter: blur(14px) saturate(112%);
            -webkit-backdrop-filter: blur(14px) saturate(112%);
            justify-content: flex-start;
        }

        .bottom-nav .nav-item {
            position: relative;
            width: auto;
            height: 100%;
            min-width: 0;
            border-radius: 999px;
            flex: 0 0 var(--candidate2-nav-share, 25%);
            transition: color 180ms ease;
        }

        .bottom-nav .nav-item svg {
            position: relative;
            z-index: 1;
        }

        .bottom-nav .nav-item.active {
            color: #6d5d55;
            background: transparent;
        }

        .bottom-nav .nav-item::before {
            position: absolute;
            inset: 0;
            border: 0.5px solid #d9d1c8;
            border-radius: 999px;
            background: #fffdf9;
            box-shadow: 0 2px 4px rgba(96, 72, 63, 0.07);
            content: '';
            opacity: 0;
            pointer-events: none;
            transform: scale(0.9);
            transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.75, 0.25, 1);
        }

        .bottom-nav .nav-item.active::before {
            opacity: 1;
            transform: scale(1);
        }

        #screen-home {
            position: relative;
            min-height: 100%;
            padding: 0;
            overflow: hidden auto;
            background: #f7f1ea;
        }

        #screen-home.active {
            display: flex;
            flex-direction: column;
        }

        .candidate2-home-scale-shell {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 0 0 auto;
        }

        .candidate2-home-design-canvas {
            position: relative;
            width: 430px;
            min-height: 100%;
            margin-inline: auto;
            padding: 24px 22px 116px;
            zoom: var(--candidate2-home-scale, 1);
        }

        .home-overview-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            padding: 10px 4px 22px;
        }

        .home-heading-copy {
            min-width: 0;
        }

        .home-mailbox-icon {
            position: relative;
            display: grid;
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            place-items: center;
            margin-top: 2px;
            padding: 0;
            border: 0;
            color: #8f7165;
            background: transparent;
            cursor: pointer;
        }

        .home-mailbox-icon svg {
            width: 23px;
            height: 23px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.35;
        }

        .home-mailbox-badge {
            position: absolute;
            top: 1px;
            right: 0;
            display: grid;
            min-width: 15px;
            height: 15px;
            place-items: center;
            padding: 0 4px;
            border: 1.5px solid #fffdf9;
            border-radius: 999px;
            color: #fffdf9;
            background: #c98583;
            font-family: var(--ui-regular-font);
            font-size: 8px;
            line-height: 1;
        }

        .home-mailbox-badge[hidden] {
            display: none;
        }

        .home-page-kicker {
            margin: 0 0 7px;
            color: #a58376;
            font-size: 12px;
            letter-spacing: 0.14em;
        }

        .home-name {
            max-width: 100%;
            margin: 0;
            overflow-wrap: anywhere;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 36.12px;
            font-weight: 500;
            line-height: 1.15;
            letter-spacing: 0.01em;
        }

        .home-title-meta {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-top: 12px;
            color: #9a8177;
            font-size: 10px;
        }

        .home-weather-summary {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .home-weather-summary i {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #b9a298;
        }

        .home-parlor-entry {
            position: relative;
            display: block;
            width: 100%;
            min-height: 188px;
            padding: 24px 20px 20px 24px;
            overflow: hidden;
            border: 0.5px solid #eadfd5;
            border-radius: 26px 26px 8px 8px;
            color: #60483f;
            background: #fffdf9 url('/candidate-two/home-parlor-watercolor-background.webp') center / cover no-repeat;
            box-shadow: 0 5px 8px -6px rgba(96, 72, 63, 0.35);
            text-align: left;
            cursor: pointer;
        }

        .home-parlor-copy {
            display: flex;
            width: 48%;
            height: 143px;
            min-width: 0;
            flex-direction: column;
            align-items: flex-start;
        }

        .home-parlor-copy strong {
            margin-top: 7px;
            font-size: 27px;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-parlor-copy small {
            margin-top: 7px;
            color: #8d746a;
            font-size: 11px;
            line-height: 1.55;
        }

        .home-parlor-copy em {
            margin-top: auto;
            color: #aa8178;
            font-size: 10px;
            font-style: normal;
            letter-spacing: 0.08em;
        }

        .home-doorstep-list {
            width: 100%;
            margin-top: 15px;
            border-top: 1px solid rgba(109, 80, 72, 0.18);
        }

        .home-doorstep-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 16px;
            padding: 20px 4px 11px;
            color: #60483f;
        }

        .home-doorstep-header strong {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-weight: 600;
        }

        .home-doorstep-header small {
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 8px;
            letter-spacing: 0.13em;
        }

        .home-doorstep-row {
            display: grid;
            grid-template-columns: 72px minmax(0, 1fr);
            min-width: 0;
            min-height: 76px;
            align-items: center;
            gap: 16px;
            padding: 12px 4px;
            border: 0;
            border-bottom: 1px solid rgba(109, 80, 72, 0.18);
            color: #60483f;
            background: transparent;
            text-align: left;
        }

        .home-doorstep-label {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 3px;
        }

        .home-doorstep-label strong {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.25;
        }

        .home-doorstep-label small {
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 7px;
            line-height: 1.2;
            letter-spacing: 0.1em;
        }

        #screen-home .candidate2-empty-copy {
            color: #9f8c82;
            font-size: 10px;
        }

        .home-doorbell-demo {
            display: grid;
            grid-template-columns: 26px minmax(0, 1fr);
            align-items: start;
            gap: 9px;
        }

        .home-doorbell-demo .candidate2-demo-count {
            margin: 0;
            color: #d49c98;
            font-family: var(--ui-regular-font);
            font-size: 18px;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-doorstep-list .candidate2-demo-request-list {
            gap: 2px;
            font-size: 9px;
        }

        .home-doorstep-list .candidate2-demo-visitors {
            gap: 15px;
            padding-top: 0;
        }

        .home-doorstep-list .candidate2-demo-visitor {
            width: 30px;
            font-size: 8px;
        }

        .home-doorstep-list .candidate2-demo-visitor::before {
            width: 25px;
            height: 25px;
            border: 0;
            box-shadow: none;
        }

        .home-mailbox-dialog[hidden] {
            display: none;
        }

        .home-mailbox-dialog {
            position: fixed;
            z-index: 240;
            inset: 0;
        }

        .home-mailbox-backdrop {
            position: absolute;
            border: 0;
            background: rgba(74, 54, 47, 0.2);
            backdrop-filter: blur(2px);
            inset: 0;
        }

        .home-mailbox-sheet {
            position: absolute;
            top: 50%;
            left: 50%;
            width: calc(100% - 44px);
            height: min(650px, calc(100% - 92px));
            padding: 23px 22px 18px;
            overflow: hidden;
            border: 0.5px solid #e1d5c9;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 0 16px 34px rgba(83, 63, 53, 0.18);
            transform: translate(-50%, -50%);
        }

        .home-mailbox-sheet.is-detail {
            height: auto;
            max-height: calc(100% - 92px);
        }

        .home-mailbox-sheet-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 2px 2px 17px;
            border-bottom: 0.5px solid #dfd2c7;
        }

        .home-mailbox-sheet-header .candidate2-section-label {
            margin: 0 0 3px;
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 7px;
            letter-spacing: 0.12em;
        }

        .home-parlor-copy > .candidate2-section-label {
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .home-mailbox-sheet-header h2 {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 23px;
            font-style: normal;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-mailbox-close {
            width: 30px;
            height: 30px;
            flex: 0 0 30px;
            padding: 0 0 3px;
            border: 0.5px solid #d9cbc0;
            border-radius: 0;
            color: #8d746a;
            background: transparent;
            font-family: Georgia, serif;
            font-size: 21px;
            line-height: 1;
            cursor: pointer;
        }

        .home-mailbox-empty {
            padding: 72px 2px 22px;
            text-align: center;
        }

        .home-mailbox-categories {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0;
            border-bottom: 0.5px solid #dfd2c7;
        }

        .home-mailbox-categories button {
            position: relative;
            padding: 11px 2px 10px;
            border: 0;
            color: #a18a80;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-categories button.is-active {
            color: #60483f;
        }

        .home-mailbox-categories button.is-active::after {
            position: absolute;
            right: 28%;
            bottom: -1px;
            left: 28%;
            height: 1px;
            background: #b99386;
            content: '';
        }

        .home-mailbox-demo-list {
            height: 392px;
            margin: 0;
            padding: 0;
            overflow: hidden;
            list-style: none;
        }

        .home-mailbox-demo-list[hidden] {
            display: none;
        }

        .home-mailbox-message {
            position: relative;
            display: grid;
            min-height: 49px;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
            padding: 10px 2px 9px 14px;
            border-bottom: 0.5px solid #eadfd5;
        }

        .home-mailbox-message:last-child {
            border-bottom: 0;
        }

        .home-mailbox-message::before {
            position: absolute;
            top: 50%;
            left: 0;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--mail-tone, #d5b3ad);
            content: '';
            transform: translateY(-50%);
        }

        .home-mailbox-message h3 {
            margin: 0;
            color: #60483f;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .home-mailbox-message > button {
            min-width: 0;
            overflow: hidden;
            border: 0;
            color: #60483f;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 11px;
            font-weight: 500;
            line-height: 1.4;
            text-align: left;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
        }

        .home-mailbox-new {
            color: #c98583;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', cursive;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }

        .home-mailbox-footer {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 12px;
            min-height: 33px;
            padding-top: 8px;
            border-top: 0.5px solid #dfd2c7;
        }

        .home-mailbox-footer[hidden] {
            display: none;
        }

        .home-mailbox-footer button {
            padding: 5px 0;
            border: 0;
            color: #8f766c;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 8px;
            cursor: pointer;
        }

        .home-mailbox-footer button:first-child {
            text-align: left;
        }

        .home-mailbox-footer button:last-child {
            text-align: right;
        }

        .home-mailbox-footer button:disabled {
            color: #cfc2b8;
            cursor: default;
        }

        .home-mailbox-page-state {
            color: #9f877d;
            font-size: 8px;
        }

        .home-mailbox-list-view[hidden],
        .home-mailbox-detail[hidden] {
            display: none;
        }

        .home-mailbox-detail {
            padding: 16px 2px 0;
        }

        .home-mailbox-detail-back {
            padding: 0;
            border: 0;
            color: #9a8177;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-detail-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 25px 0 0;
            color: #aa9187;
        }

        .home-mailbox-detail-heading p {
            display: flex;
            min-width: 0;
            align-items: baseline;
            gap: 8px;
            margin: 0;
        }

        .home-mailbox-detail-heading time {
            flex: 0 0 auto;
            font-size: 8px;
        }

        .home-mailbox-detail-title {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
        }

        .home-mailbox-detail-kind {
            color: #927c72;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
        }

        .home-mailbox-detail-body {
            margin: 18px 0 0;
            padding: 0 2px;
            border: 0;
            color: #806b62;
            font-size: 11px;
            line-height: 2;
        }

        .home-mailbox-detail-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-top: 16px;
        }

        .home-mailbox-detail-status {
            color: #a58a80;
            font-size: 9px;
        }

        .home-mailbox-detail-actions {
            display: flex;
            gap: 8px;
        }

        .home-mailbox-detail-actions[hidden] {
            display: none;
        }

        .home-mailbox-detail-actions button {
            min-width: 58px;
            padding: 7px 12px;
            border: 0.5px solid #d8c7bb;
            border-radius: 0;
            color: #7f6258;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-detail-actions button:first-child {
            border-color: #d6b6ae;
            background: #f5e5df;
        }

`;

const RUNTIME_STYLES = `
        .candidate2-auth-step[hidden],
        .candidate2-farm-confirmation[hidden] {
            display: none;
        }

        .candidate2-auth-step {
            display: contents;
        }

        .candidate2-auth-step .input-group {
            padding: 0;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
        }

        .candidate2-auth-step .input-group label {
            margin: 0 4px 7px;
        }

        .candidate2-auth-step .input-group input {
            width: 100%;
            min-height: 50px;
            padding: 11px 14px;
            border: 1.5px solid var(--border-color);
            border-radius: var(--radius-sm);
            background: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .candidate2-auth-note {
            margin-top: 24px;
            text-align: center;
        }

        .candidate2-auth-note span {
            font-size: 0.9rem;
            opacity: 0.7;
        }

        .candidate2-runtime-status {
            min-height: 18px;
            margin: 8px 2px 0;
            color: var(--text-main);
            font-size: 12px;
            line-height: 1.5;
            text-align: center;
        }

        .profile-status:not(:empty) {
            margin-top: 12px;
            padding: 10px 12px;
            border-left: 3px solid var(--soft-pink);
            color: #6f4c45;
            background: #fff6f3;
            font-size: 13px;
            text-align: left;
        }

        .candidate2-notice-modal {
            position: fixed;
            z-index: 500;
            inset: 0;
            display: grid;
            place-items: center;
            overflow: hidden;
        }

        .candidate2-notice-modal[hidden] {
            display: none;
        }

        .candidate2-notice-backdrop {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            padding: 0;
            border: 0;
            border-radius: 0;
            background: rgba(75, 56, 49, 0.28);
            cursor: pointer;
        }

        .candidate2-notice-scale-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            pointer-events: none;
        }

        .candidate2-notice-design-canvas {
            display: grid;
            width: 430px;
            margin-inline: auto;
            place-items: center;
            zoom: var(--candidate2-notice-scale, 1);
        }

        .candidate2-notice-card {
            width: 334px;
            padding: 24px 24px 20px;
            border: 0.5px solid #d8c7bb;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 3px 4px 0 rgba(114, 88, 77, 0.12);
            pointer-events: auto;
            text-align: center;
        }

        .candidate2-notice-card .candidate2-section-label {
            margin: 0 0 8px;
            color: #aa8e83;
            font-size: 11px;
            letter-spacing: 0.08em;
        }

        .candidate2-notice-card h2 {
            margin: 0;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 22px;
            font-weight: 500;
        }

        #candidate2-notice-message {
            margin: 18px 0 22px;
            color: #7c675f;
            font-family: var(--ui-regular-font);
            font-size: 14px;
            line-height: 1.65;
        }

        .candidate2-notice-confirm {
            min-width: 92px;
            padding: 8px 18px;
            border: 0.5px solid #bca79c;
            border-radius: 0;
            color: #60483f;
            background: #f7eee7;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            cursor: pointer;
        }

        .candidate2-profile-farm {
            position: relative;
            margin-top: 18px;
        }

        .candidate2-profile-tape {
            top: -10px;
            left: -10px;
        }

        .candidate2-lookup-button {
            width: 100%;
            min-height: 50px;
            margin-top: 0;
            padding: 12px 18px;
        }

        .candidate2-farm-confirmation {
            display: grid;
            gap: 5px;
            margin: 14px 0 16px;
            padding: 12px 16px;
            border: 1.5px solid var(--border-color);
            border-radius: var(--radius-sm);
            background: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .candidate2-farm-confirmation p,
        .candidate2-farm-confirmation strong,
        .candidate2-farm-confirmation small {
            margin: 0;
        }

        .candidate2-farm-confirmation p,
        .candidate2-farm-confirmation small {
            color: var(--text-sub);
            font-size: 10px;
        }

        .candidate2-confirmation-check {
            display: flex;
            min-height: 44px;
            align-items: center;
            gap: 9px;
            margin-top: 4px;
            color: var(--text-main);
            font-size: 13px;
        }

        .candidate2-confirmation-check input {
            width: 18px;
            height: 18px;
            margin: 0;
        }

        .candidate2-profile-actions {
            display: grid;
            grid-template-columns: auto 1fr;
            align-items: center;
            gap: 12px;
        }

        .candidate2-profile-actions .btn-primary {
            margin-top: 0;
        }

        .candidate2-text-button {
            min-width: 44px;
            min-height: 44px;
            padding: 8px 12px;
            border: 0;
            color: var(--text-main);
            background: transparent;
            font: inherit;
            font-size: 13px;
            cursor: pointer;
        }

        @media (hover: none) and (pointer: coarse) {
            .candidate2-auth-step input {
                font-size: 16px;
            }
        }

        button:focus-visible,
        input:focus-visible,
        .nav-item:focus-visible {
            outline: 3px solid rgba(109, 93, 85, 0.38);
            outline-offset: 2px;
        }

        button:disabled,
        input:disabled {
            cursor: wait;
            opacity: 0.62;
        }

        .candidate2-section-label {
            margin: 0 0 8px;
            color: var(--text-sub);
            font-size: 10px;
            font-weight: 600;
        }

        .candidate2-empty-copy {
            margin: 0;
            color: var(--text-sub);
            font-size: 12px;
            line-height: 1.5;
        }

        .candidate2-demo-count {
            margin: 0 0 6px;
            color: var(--soft-pink);
            font-family: 'Gaegu', cursive;
            font-size: 30px;
            line-height: 1;
        }

        .candidate2-demo-request-list {
            display: grid;
            gap: 5px;
            margin: 0;
            padding: 0;
            list-style: none;
            color: var(--text-main);
            font-size: 9px;
            line-height: 1.35;
        }

        .candidate2-demo-request-list li::before {
            content: '•';
            margin-right: 4px;
            color: var(--soft-pink);
        }

        .candidate2-demo-visitors {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            padding-top: 6px;
        }

        .candidate2-demo-visitors[hidden],
        .candidate2-demo-block[hidden],
        .candidate2-demo-relationship[hidden],
        .candidate2-demo-activity-list[hidden] {
            display: none;
        }

        .candidate2-demo-visitor {
            display: grid;
            width: 34px;
            gap: 3px;
            justify-items: center;
            color: var(--text-sub);
            font-size: 8px;
        }

        .candidate2-demo-visitor::before {
            width: 25px;
            height: 25px;
            border: 2px solid white;
            border-radius: 50%;
            background: var(--visitor-tone, var(--sky-blue));
            box-shadow: 0 2px 8px rgba(109, 93, 85, 0.1);
            content: '';
        }

        .candidate2-demo-story {
            margin: 0;
            color: var(--text-main);
            font-size: 13px;
            line-height: 1.65;
        }

        .profile-qq-number {
            margin: 4px 0 0;
            font-size: 0.9rem;
            opacity: 0.7;
        }

        #screen-profile {
            padding: 22px 18px 116px;
            background: #f8f1e9;
        }

        .candidate2-profile-scale-shell {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 0 0 auto;
        }

        .candidate2-profile-design-canvas {
            width: 402px;
            margin-inline: auto;
            zoom: var(--candidate2-profile-scale, 1);
        }

        .candidate2-profile-page {
            position: relative;
            flex: 0 0 auto;
            min-height: 100%;
            padding: 24px 16px 34px;
            border: 0.5px solid #e1d5c9;
            border-bottom: 0;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
        }

        .candidate2-profile-page::after {
            position: absolute;
            right: 0;
            bottom: -116px;
            left: 0;
            height: 116px;
            background: #fffdf9;
            content: '';
            pointer-events: none;
        }

        .candidate2-profile-page::before {
            position: absolute;
            top: -1px;
            right: 0;
            left: 0;
            z-index: 2;
            height: 13px;
            background: radial-gradient(circle at 14px 0, #f8f1e9 0 7px, transparent 7.35px) 0 0 / 28px 13px repeat-x;
            content: '';
            pointer-events: none;
        }

        .candidate2-profile-header-stack {
            position: relative;
            z-index: 3;
            flex: 0 0 auto;
            min-height: 176px;
            margin: -30px 0 8px;
        }

        .candidate2-profile-action-sheet {
            position: absolute;
            inset: 0;
            z-index: 3;
            display: block;
            width: auto;
            height: auto;
            padding: 0;
            border: 0;
            background: transparent;
            clip-path: none;
            filter: none;
            transform: none;
            pointer-events: none;
        }

        .candidate2-profile-action {
            position: absolute;
            top: 144px;
            right: 4px;
            width: 82px;
            height: 26px;
            min-height: 0;
            padding: 1px 6px;
            border: 0;
            color: #60483f;
            background: #efe3da;
            clip-path: polygon(0.8% 1%, 99% 0, 97% 99%, 0 98%);
            filter:
                drop-shadow(0 0 0.4px #d6c8bc)
                drop-shadow(1px 2px 1px rgba(83, 63, 53, 0.08));
            font-size: 12px;
            line-height: 1;
            text-align: center;
            white-space: nowrap;
            transform: rotate(0.8deg);
            transform-origin: center;
            text-decoration: none;
            cursor: pointer;
            pointer-events: auto;
        }

        .candidate2-profile-action:first-child {
            top: 20px;
            right: auto;
            left: 14px;
            z-index: 1;
            width: 50px;
            height: 26px;
            margin: 0;
            padding: 1px 6px;
            background: #e8e1d8;
            transform: rotate(-1.6deg);
        }

        .candidate2-profile-action::before {
            position: absolute;
            inset: -12px 0;
            content: '';
        }

        .candidate2-profile-note {
            position: absolute;
            top: 0;
            right: -8px;
            z-index: 1;
            width: 86%;
            flex: 0 0 auto;
            margin: 0;
            padding: 20px 16px 8px;
            border: 0.5px solid #e1d5c9;
            border-radius: 3px;
            background: #fffaf0;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
            transform: rotate(1.2deg) scale(1.08);
            transform-origin: top right;
        }

        .candidate2-profile-paperclip {
            position: absolute;
            z-index: 2;
            top: -17px;
            right: 19px;
            width: auto;
            height: 64px;
            object-fit: contain;
            filter: drop-shadow(1px 2px 1px rgba(67, 70, 72, 0.18));
            pointer-events: none;
            transform: rotate(30deg) scale(0.86);
        }

        .candidate2-profile-note-title {
            margin: 0 0 14px;
            color: #60483f;
            font-family: 'Gaegu', cursive;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0.06em;
            line-height: 1;
            text-align: center;
        }

        .candidate2-profile-note-body {
            display: grid;
            grid-template-columns: 58px minmax(0, 1fr);
            gap: 12px;
            align-items: start;
        }

        .candidate2-profile-note .chibi-avatar {
            width: 58px;
            height: 76px;
            border: 1px solid #eadfc9;
            border-radius: 2px;
            background: #fffdf7;
            box-shadow: 0 4px 10px rgba(109, 93, 85, 0.08);
        }

        .candidate2-identity-summary {
            display: grid;
            flex: 0 0 auto;
            height: auto;
            min-height: 0;
            gap: 6px;
            padding: 0;
            overflow: visible;
            margin: 0;
        }

        .profile-resident-name {
            font-family: var(--ui-regular-font);
            font-style: normal;
        }

        .candidate2-identity-summary p {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 0;
            font-size: 8px;
        }

        .candidate2-identity-summary span {
            color: #a8958b;
        }

        .candidate2-identity-summary strong {
            overflow-wrap: anywhere;
            color: #60483f;
            font-size: 8px;
            font-weight: 500;
            text-align: right;
        }

        .candidate2-empty-panel {
            display: grid;
            height: 112px;
            place-items: center;
        }

        .candidate2-empty-panel p {
            margin: 0;
            color: var(--text-sub);
            font-size: 12px;
        }

        .candidate2-profile-section {
            flex: 0 0 auto;
        }

        .candidate2-relationship-section {
            position: relative;
            z-index: 2;
        }

        .candidate2-activity-section {
            position: relative;
            z-index: 5;
            min-height: 196px;
            margin: -140px 34px 0 4px;
            padding: 20px 18px 16px 25px;
            background: transparent;
            box-shadow: none;
            isolation: isolate;
        }

        .candidate2-activity-section::before {
            position: absolute;
            inset: 0;
            z-index: -1;
            background: #f1ddd6;
            clip-path: polygon(0 5%, 8% 2%, 17% 5%, 27% 2%, 37% 6%, 48% 3%, 59% 7%, 71% 3%, 82% 5%, 94% 1%, 99% 3%, 97.5% 16%, 100% 29%, 98% 43%, 99.5% 57%, 97.5% 72%, 99% 85%, 98% 96%, 88% 97%, 77% 94%, 66% 98%, 54% 95%, 43% 98%, 31% 95%, 20% 99%, 9% 96%, 1% 98%, 0.5% 88%, 2% 76%, 0% 63%, 1.5% 50%, 0.5% 38%, 2% 25%, 0% 14%);
            content: '';
            filter: drop-shadow(2px 4px 5px rgba(83, 63, 53, 0.1));
            pointer-events: none;
        }

        .candidate2-profile-section-title {
            position: relative;
            z-index: 3;
            width: fit-content;
            margin: 0;
            color: #60483f;
            font-size: 19px;
            line-height: 1;
        }

        .candidate2-relationship-section > .candidate2-profile-section-title {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 6;
            display: flex;
            width: 132px;
            min-height: 58px;
            align-items: center;
            margin: 0;
            padding: 9px 12px 7px;
            background: #eadfd4;
            box-shadow: 1px 2px 2px rgba(83, 63, 53, 0.08);
            line-height: 0.92;
            transform: rotate(-1.2deg);
        }

        .candidate2-activity-section .candidate2-profile-section-title {
            margin: 0 0 10px -8px;
        }

        .candidate2-notebook-stack {
            position: relative;
            height: 460px;
            margin: 0 2px 0 8px;
        }

        .candidate2-notebook-stack::before,
        .candidate2-notebook-stack::after {
            position: absolute;
            z-index: 4;
            width: 36px;
            height: 36px;
            clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%);
            content: '';
            pointer-events: none;
        }

        .candidate2-notebook-stack::before {
            top: 188px;
            left: -10px;
            background: #d5e6df;
            transform: rotate(8deg) scale(0.78);
        }

        .candidate2-notebook-stack::after {
            top: 20px;
            right: -4px;
            background: #ead8c7;
            transform: rotate(-7deg);
        }

        .candidate2-notebook-underlay {
            display: none;
        }

        .candidate2-demo-relationship-panel {
            position: absolute;
            inset: 30px 10px 0 14px;
            display: block;
            height: auto;
            min-height: 0;
            margin: 0;
            overflow: hidden;
            border: 0.5px solid #e1d5c9;
            border-radius: 1px;
            background-color: #fffaf0;
            background-image: radial-gradient(circle, rgba(168, 149, 139, 0.28) 0 0.7px, transparent 0.85px);
            background-size: 8px 8px;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
            transform: rotate(0.5deg);
        }

        .candidate2-relationship-edit {
            position: absolute;
            top: 19px;
            right: 42px;
            z-index: 5;
            min-width: 49px;
            min-height: 27px;
            padding: 4px 9px 5px;
            border: 0.5px solid rgba(166, 142, 129, 0.24);
            color: #60483f;
            background: #ead8c7;
            box-shadow: 1px 2px 2px rgba(83, 63, 53, 0.08);
            font-size: 13px;
            line-height: 1;
            clip-path: polygon(1% 5%, 24% 1%, 51% 4%, 76% 0, 99% 5%, 97% 96%, 72% 99%, 48% 96%, 23% 100%, 2% 95%);
            cursor: pointer;
            transform: rotate(2deg) scale(1.08);
            transform-origin: center;
        }

        .candidate2-relationship-edit[hidden] {
            display: none;
        }

        .candidate2-relationship-editor {
            position: absolute;
            inset: 54px 14px 224px 20px;
            z-index: 4;
            display: grid;
            align-content: start;
            gap: 7px;
            padding: 5px 7px 4px;
            border: 0;
            color: #60483f;
            background: rgba(255, 250, 240, 0.94);
            box-shadow: none;
            transform: none;
        }

        .candidate2-relationship-editor[hidden] {
            display: none;
        }

        .candidate2-relationship-editor-title {
            margin: 0 0 2px;
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-relationship-editor label {
            display: grid;
            grid-template-columns: 62px 76px minmax(0, 1fr);
            min-height: 31px;
            gap: 7px;
            align-items: center;
            border-bottom: 0.5px solid #eadfd4;
        }

        .candidate2-relationship-editor label strong {
            overflow: hidden;
            font-size: 10px;
            font-weight: 500;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-relationship-editor select,
        .candidate2-relationship-editor input {
            min-width: 0;
            padding: 4px 5px;
            border: 0;
            border-bottom: 0.5px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
        }

        .candidate2-relationship-editor input[hidden] {
            display: block;
            visibility: hidden;
        }

        .candidate2-relationship-editor-actions {
            display: flex;
            justify-content: flex-end;
            gap: 14px;
            padding-top: 3px;
        }

        .candidate2-relationship-editor-actions button {
            min-height: 25px;
            padding: 3px 2px;
            border: 0;
            color: #795f56;
            background: transparent;
            font-size: 12px;
            text-decoration: underline;
            text-decoration-color: #b89589;
            text-underline-offset: 3px;
            cursor: pointer;
        }

        .candidate2-notebook-holes {
            display: none;
        }

        .candidate2-demo-relationship {
            position: absolute;
            z-index: 1;
            inset: 54px 12px 224px 22px;
        }

        .profile-relationships-empty {
            position: absolute;
            inset: 54px 12px 224px 22px;
            display: grid;
            place-items: center;
        }

        .candidate2-demo-relation-lines {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
            pointer-events: none;
        }

        .candidate2-demo-relation-lines line {
            stroke: rgba(168, 149, 139, 0.58);
            stroke-width: 0.45;
            vector-effect: non-scaling-stroke;
        }

        .candidate2-demo-relation-core,
        .candidate2-demo-relation-node {
            position: absolute;
            z-index: 1;
        }

        .candidate2-demo-relation-core {
            top: 50%;
            left: 50%;
            display: grid;
            gap: 3px;
            justify-items: center;
            color: #60483f;
            font-size: 9px;
            transform: translate(-50%, -50%);
        }

        .candidate2-demo-relation-core::before {
            width: 28px;
            height: 28px;
            border: 0;
            border-radius: 50%;
            background: var(--soft-pink);
            box-shadow: none;
            content: '';
        }

        .candidate2-demo-relation-node {
            display: grid;
            grid-template-columns: 17px auto;
            grid-template-rows: auto auto;
            width: 82px;
            min-height: 0;
            gap: 1px 6px;
            align-items: center;
            color: #60483f;
            text-align: left;
            transform: translate(-11.5px, -50%);
        }

        .candidate2-demo-relation-node::before {
            grid-row: 1 / span 2;
            width: 17px;
            height: 17px;
            border: 0;
            border-radius: 50%;
            box-shadow: none;
            content: '';
        }

        .candidate2-demo-relation-node strong { font-size: 10px; line-height: 1.1; }
        .candidate2-demo-relation-node small { color: #a8958b; font-size: 8px; line-height: 1.1; }
        .candidate2-demo-relation-a { top: 25%; left: 12%; }
        .candidate2-demo-relation-b { top: 27%; left: 67%; }
        .candidate2-demo-relation-c { top: 75%; left: 21%; }
        .candidate2-demo-relation-a::before { background: var(--sky-blue); }
        .candidate2-demo-relation-b::before { background: var(--warm-sand); }
        .candidate2-demo-relation-c::before { background: #D5E6DF; }

        .candidate2-demo-relationship-summary {
            position: absolute;
            right: 12px;
            bottom: 9px;
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-demo-activity-list {
            position: relative;
            display: grid;
            gap: 0;
            margin-left: 7px;
            padding-left: 0;
        }

        .candidate2-demo-activity {
            position: relative;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            min-height: 36px;
            padding: 5px 0;
            font-size: 11px;
        }

        .candidate2-demo-activity > span:first-child {
            display: none;
        }

        .candidate2-demo-activity > span:nth-child(2) {
            color: #60483f;
            line-height: 1.45;
        }

        .candidate2-demo-activity time {
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-profile-empty {
            padding: 12px 0 12px 28px;
        }

        .candidate2-profile-more {
            display: block;
            min-width: 56px;
            height: 30px;
            min-height: 0;
            margin: -3px -18px 5px auto;
            padding: 3px 8px 4px;
            border: 0;
            color: #fffaf0;
            background: #7b6760;
            box-shadow: 1px 2px 3px rgba(83, 63, 53, 0.18);
            clip-path: polygon(1% 5%, 24% 1%, 51% 4%, 76% 0, 99% 5%, 97% 96%, 72% 99%, 48% 96%, 23% 100%, 2% 95%);
            font-size: 14px;
            text-decoration: none;
            cursor: pointer;
            transform: rotate(-2deg);
        }

        .candidate2-profile-more[hidden] {
            display: none;
        }

        .candidate2-demo-activity.is-collapsed:nth-child(n + 5) {
            display: none;
        }

        #screen-settings {
            padding: 22px 18px 116px;
            background: #f8f1e9;
        }

        .candidate2-settings-page {
            position: relative;
            padding: 24px 22px 40px;
            border: 0.5px solid #e1d5c9;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
        }

        .candidate2-settings-page::before {
            position: absolute;
            top: -1px;
            right: 0;
            left: 0;
            height: 13px;
            background: radial-gradient(circle at 14px 0, #f8f1e9 0 7px, transparent 7.35px) 0 0 / 28px 13px repeat-x;
            content: '';
            pointer-events: none;
        }

        .candidate2-settings-paperclip {
            position: absolute;
            z-index: 2;
            top: -17px;
            right: 19px;
            width: auto;
            height: 64px;
            object-fit: contain;
            filter: drop-shadow(1px 2px 1px rgba(67, 70, 72, 0.18));
            pointer-events: none;
            transform: rotate(30deg) scale(0.86);
        }

        .candidate2-settings-heading {
            padding: 4px 0 22px;
            border-bottom: 1px solid #eadfd4;
        }

        .candidate2-settings-heading h1,
        .candidate2-settings-heading p {
            margin: 0;
        }

        .candidate2-settings-heading h1 {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 25px;
            font-style: normal;
            font-weight: 600;
        }

        .candidate2-settings-heading > p:last-child {
            margin-top: 5px;
            color: #a8958b;
            font-size: 10px;
        }

        .candidate2-settings-kicker {
            color: #9e776c;
            font-size: 14px;
            line-height: 1;
        }

        .candidate2-settings-section {
            padding: 20px 0;
            border-bottom: 1px solid #eadfd4;
        }

        .candidate2-settings-section-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }

        .candidate2-settings-section-heading > div {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }

        .candidate2-settings-section-heading span {
            color: #c5a99a;
            font-family: 'Gaegu', cursive;
            font-size: 12px;
        }

        .candidate2-settings-section-heading h2 {
            margin: 0;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-style: normal;
            font-weight: 600;
        }

        .candidate2-settings-section-heading > small,
        .candidate2-settings-section-heading > p {
            margin: 0;
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-settings-status-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .candidate2-settings-status-grid > div {
            display: grid;
            grid-template-columns: 8px 1fr;
            gap: 2px 6px;
            align-items: center;
            padding: 10px;
            background: #f8f0e7;
        }

        .candidate2-settings-status-grid i {
            grid-row: 1 / span 3;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #c9b9ae;
        }

        .candidate2-settings-status-grid span { font-size: 9px; }
        .candidate2-settings-status-grid strong { font-size: 10px; font-weight: 500; }
        .candidate2-settings-status-grid small { color: #a8958b; font-size: 7px; }

        .candidate2-connector-actions,
        .candidate2-connector-confirmation > div,
        .candidate2-connector-credential > div {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
            align-items: center;
        }

        .candidate2-connector-actions {
            margin-top: 9px;
        }

        .candidate2-connector-confirmation,
        .candidate2-connector-credential {
            margin-top: 9px;
            padding-top: 9px;
            border-top: 0.5px solid #eee5dc;
        }

        .candidate2-connector-confirmation[hidden],
        .candidate2-connector-credential[hidden] {
            display: none;
        }

        .candidate2-connector-confirmation p,
        .candidate2-connector-credential p {
            margin: 0 0 7px;
            color: #806b62;
            font-size: 8px;
            line-height: 1.45;
        }

        .candidate2-connector-credential code {
            display: block;
            margin-bottom: 7px;
            color: #60483f;
            font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
            font-size: 7px;
            line-height: 1.45;
            overflow-wrap: anywhere;
            user-select: all;
        }

        .candidate2-connector-actions button:disabled,
        .candidate2-connector-confirmation button:disabled,
        .candidate2-connector-credential button:disabled {
            opacity: 0.52;
            cursor: default;
        }

        .candidate2-settings-row,
        .candidate2-settings-toggle {
            display: flex;
            min-height: 42px;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            border-top: 0.5px solid #eee5dc;
        }

        .candidate2-settings-section-heading + .candidate2-settings-row,
        .candidate2-settings-section-heading + .candidate2-settings-toggle {
            border-top: 0;
        }

        .candidate2-settings-row > span,
        .candidate2-settings-toggle > span {
            font-size: 10px;
        }

        .candidate2-settings-row small,
        .candidate2-settings-toggle small {
            display: block;
            margin-top: 2px;
            color: #a8958b;
            font-size: 7px;
        }

        .candidate2-settings-row input,
        .candidate2-settings-row select,
        .candidate2-settings-row textarea {
            width: 45%;
            padding: 5px 3px;
            border: 0;
            border-bottom: 1px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-size: 9px;
            text-align: right;
        }

        .candidate2-settings-row textarea {
            resize: none;
            line-height: 1.45;
            text-align: left;
        }

        .candidate2-settings-row select {
            width: 42%;
            padding: 6px 28px 6px 11px;
            border: 0.5px solid #ddcec0;
            border-radius: 999px;
            appearance: none;
            color: #6f584f;
            background-color: #faf3e9;
            background-image:
                linear-gradient(45deg, transparent 50%, #967d72 50%),
                linear-gradient(135deg, #967d72 50%, transparent 50%);
            background-position:
                calc(100% - 13px) 50%,
                calc(100% - 9px) 50%;
            background-repeat: no-repeat;
            background-size: 4px 4px, 4px 4px;
            box-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.7),
                0 1px 1px rgba(112, 84, 70, 0.06);
            text-align: left;
        }

        .candidate2-settings-number {
            display: flex;
            width: 45%;
            align-items: center;
            justify-content: flex-end;
            gap: 5px;
        }

        .candidate2-settings-number input {
            width: min(58px, 72%);
            font-size: 14px;
            font-weight: 500;
            line-height: 1.2;
        }

        .candidate2-settings-number em {
            color: #a8958b;
            font-size: 8px;
            font-style: normal;
        }

        .candidate2-settings-row input:disabled,
        .candidate2-settings-row select:disabled,
        .candidate2-settings-row textarea:disabled,
        .candidate2-settings-add-meme:disabled {
            opacity: 0.62;
        }

        .candidate2-settings-toggle input {
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }

        .candidate2-settings-toggle i {
            position: relative;
            width: 29px;
            height: 16px;
            flex: 0 0 auto;
            border: 1px solid #d8cbbf;
            border-radius: 999px;
            background: #eee5dc;
        }

        .candidate2-settings-toggle i::after {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #fffaf0;
            box-shadow: 0 1px 2px rgba(83, 63, 53, 0.16);
            content: '';
            transition: transform 0.18s ease-out;
        }

        .candidate2-settings-toggle input:checked + i {
            border-color: #cba89d;
            background: #e5c9c3;
        }

        .candidate2-settings-toggle input:checked + i::after {
            transform: translateX(13px);
        }

        .candidate2-settings-meme-summary {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0 7px;
            align-items: baseline;
        }

        .candidate2-settings-meme-summary strong { font-size: 18px; font-weight: 500; }
        .candidate2-settings-meme-summary span { font-size: 9px; }
        .candidate2-settings-meme-summary small { grid-column: 1 / -1; color: #a8958b; font-size: 8px; }

        .candidate2-settings-text-action,
        .candidate2-settings-add-meme,
        .candidate2-settings-logout {
            border: 0;
            color: #7d6259;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-settings-text-action {
            font-size: 13px;
            text-decoration: underline;
            text-underline-offset: 3px;
        }

        .candidate2-connector-actions .candidate2-settings-text-action,
        .candidate2-connector-confirmation .candidate2-settings-text-action,
        .candidate2-connector-credential .candidate2-settings-text-action {
            font-family: var(--ui-regular-font);
            font-size: 9px;
            font-style: normal;
            font-weight: 500;
            line-height: 1.5;
            text-decoration: none;
        }

        .candidate2-settings-add-meme {
            margin-top: 10px;
            padding: 0;
            font-size: 9px;
        }

        .candidate2-settings-account {
            padding-top: 18px;
            border-bottom: 0;
        }

        .candidate2-settings-logout {
            display: block;
            min-height: 36px;
            margin: 4px auto 0;
            font-size: 15px;
            text-decoration: underline;
            text-decoration-color: rgba(109, 93, 85, 0.28);
            text-underline-offset: 4px;
        }

        .candidate2-settings-delete-account {
            display: block;
            min-height: 30px;
            margin: 2px auto 0;
            padding: 4px 8px;
            border: 0;
            color: #a36f67;
            background: transparent;
            font-size: 9px;
            text-decoration: underline;
            text-decoration-color: rgba(163, 111, 103, 0.35);
            text-underline-offset: 3px;
            cursor: pointer;
        }

        .candidate2-settings-delete-account:disabled {
            opacity: 0.52;
            cursor: default;
        }

        .candidate2-settings-feedback {
            min-height: 14px;
            margin: 2px 0 0;
            color: #a8958b;
            font-size: 8px;
            text-align: center;
        }

`;

const SHARED_MEME_STYLES = `
        .candidate2-shared-memes-page {
            min-height: 100%;
            padding: 22px 20px 92px;
            color: #60483f;
            background: #fffdf9;
        }

        .candidate2-shared-memes-back,
        .candidate2-shared-meme-form-heading button,
        .candidate2-shared-meme-detail > button {
            min-height: 32px;
            padding: 3px 0;
            border: 0;
            color: #806b62;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-shared-memes-heading {
            margin: 12px 0 22px;
        }

        .candidate2-shared-memes-heading h1 {
            margin: 3px 0 5px;
            font-size: 30px;
        }

        .candidate2-shared-memes-heading > p:last-child,
        .shared-memes-status,
        .shared-meme-form-status {
            margin: 0;
            color: #a8958b;
            font-size: 9px;
            line-height: 1.5;
        }

        .candidate2-shared-memes-tools {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: end;
            gap: 14px;
            padding-bottom: 13px;
            border-bottom: 1px solid #e5d9ce;
        }

        .candidate2-shared-memes-tools label,
        .candidate2-shared-meme-form label {
            display: grid;
            gap: 4px;
            color: #9a8074;
            font-size: 8px;
        }

        .candidate2-shared-memes-tools input,
        .candidate2-shared-meme-form input,
        .candidate2-shared-meme-form textarea {
            width: 100%;
            min-height: 36px;
            padding: 7px 2px;
            border: 0;
            border-bottom: 1px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-size: 12px;
        }

        .candidate2-shared-meme-form textarea {
            resize: vertical;
            line-height: 1.5;
        }

        #shared-meme-add-open,
        .candidate2-shared-meme-submit {
            min-height: 38px;
            padding: 8px 14px;
            border: 0;
            color: #fffdf9;
            background: #73584b;
            font: inherit;
            font-size: 10px;
            cursor: pointer;
        }

        .candidate2-shared-meme-form {
            display: grid;
            gap: 12px;
            padding: 18px 0;
            border-bottom: 1px solid #e5d9ce;
        }

        .candidate2-shared-meme-form[hidden],
        .candidate2-shared-meme-detail[hidden] {
            display: none;
        }

        .candidate2-shared-meme-form-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .candidate2-shared-meme-form-heading h2 {
            margin: 0;
            font-size: 18px;
        }

        .candidate2-shared-meme-submit {
            justify-self: start;
        }

        .candidate2-shared-meme-submit:disabled {
            opacity: 0.58;
            cursor: wait;
        }

        .shared-memes-status {
            min-height: 14px;
            margin-top: 12px;
        }

        .candidate2-shared-meme-list {
            margin-top: 5px;
        }

        .candidate2-shared-meme-row {
            display: grid;
            width: 100%;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: baseline;
            gap: 10px;
            min-height: 48px;
            padding: 11px 1px;
            border: 0;
            border-bottom: 0.5px solid #eadfd4;
            color: #60483f;
            background: transparent;
            text-align: left;
            cursor: pointer;
        }

        .candidate2-shared-meme-row strong {
            overflow-wrap: anywhere;
            font-size: 13px;
            font-weight: 500;
        }

        .candidate2-shared-meme-row small {
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-shared-meme-detail {
            margin-top: 18px;
            padding: 16px 0 4px;
            border-top: 2px solid #d8cbbf;
        }

        .candidate2-shared-meme-detail > button {
            float: right;
        }

        .candidate2-shared-meme-detail h2 {
            margin: 0 0 4px;
            font-size: 22px;
        }

        .candidate2-shared-meme-detail > p {
            margin: 0 0 14px;
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-shared-meme-detail dl {
            margin: 0;
        }

        .candidate2-shared-meme-detail dl > div {
            display: grid;
            grid-template-columns: 50px minmax(0, 1fr);
            gap: 12px;
            padding: 9px 0;
            border-bottom: 0.5px solid #eadfd4;
        }

        .candidate2-shared-meme-detail dt {
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-shared-meme-detail dd {
            margin: 0;
            overflow-wrap: anywhere;
            font-size: 11px;
            line-height: 1.55;
            white-space: pre-wrap;
        }

`;

const RESIDENCY_PERMIT_STYLES = `
        .permit-card {
            container-type: inline-size;
            aspect-ratio: 1.075;
            min-height: 0;
            padding: 8.75% 8.17% 7.58%;
            background-size: 3.5cqi 3.5cqi;
        }

        .permit-tape {
            top: -3.8%;
            right: 5.8%;
            width: 17.5%;
            height: auto;
            aspect-ratio: 2.5;
            background: var(--sky-blue);
            transform: rotate(5deg);
        }

        .permit-heading {
            margin: 0 0 8.4cqi;
            color: var(--text-main);
            width: 100%;
            max-width: 100%;
            font-size: 7cqi;
            font-weight: 600;
            letter-spacing: 0;
            line-height: 1.15;
            text-align: center;
        }

        .permit-subheading {
            font-family: var(--ui-regular-font);
            font-size: 3.6cqi;
            font-style: normal;
            font-weight: 500;
            letter-spacing: 0.2em;
        }

        .permit-identity {
            display: grid;
            gap: 5.6cqi;
            text-align: center;
        }

        .permit-field {
            display: grid;
            gap: 1.75cqi;
        }

        .permit-field-label,
        .permit-field-value {
            margin: 0;
        }

        .permit-field-label {
            color: var(--text-sub);
            font-size: 3.8cqi;
            letter-spacing: 0.08em;
            line-height: 1.2;
        }

        .permit-field-value {
            color: var(--text-main);
            font-size: 5.87cqi;
            font-weight: 700;
            line-height: 1.1;
        }

        .permit-motto {
            position: absolute;
            left: 0;
            bottom: 8.8%;
            width: 100%;
            margin: 0;
            color: var(--text-sub);
            font-size: 4.36cqi;
            line-height: 1.15;
            pointer-events: none;
            text-align: center;
            white-space: nowrap;
        }

        #permit-stamp-box {
            right: 1.75%;
            bottom: 5%;
            width: 36.36cqi;
            height: 36.36cqi;
        }

        #permit-stamp-box .stamp {
            width: 30.07cqi;
            height: 30.07cqi;
            border-width: 0.7cqi;
            font-size: 4.9cqi;
            line-height: 1.05;
            transform: rotate(-18deg);
        }

        #permit-stamp-box.animate-stamp {
            animation: permit-stamp-drop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes permit-stamp-drop {
            0% {
                opacity: 0;
                transform: scale(3) rotate(-35deg);
            }

            100% {
                opacity: 1;
                transform: scale(1) rotate(0deg);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #permit-stamp-box.animate-stamp {
                animation: none;
                opacity: 1;
                transform: none;
            }
        }
`;

const LINGYE_SCREEN = `
    <div id="screen-lingye" class="screen screen--lingye">
        <section class="candidate2-lingye-viewport" aria-label="铃野地图，可左右滑动查看全部地点" tabindex="0">
            <div class="candidate2-lingye-canvas">
                <img class="candidate2-lingye-map" src="/lingye/map.png" width="1024" height="1536" alt="铃野公共世界地图" draggable="false">
                ${lingyePlaces
                  .filter(([id]) => !hiddenFishingPlaceIds.has(id))
                  .map(
                    ([id, label, left, top, size]) => `
                <button class="candidate2-lingye-place" type="button" aria-label="进入${label}" data-place-id="${id}" data-place-label="${label}" data-left="${left}" data-top="${top}" data-size="${size}" style="left: ${left}%; top: ${top}%; width: ${size}%;" onclick="openLingyePlace('${id}', '${label}')">
                    <img src="/lingye/labels/${id}.png" alt="" draggable="false">
                </button>`,
                  )
                  .join("")}
            </div>
        </section>
        <button class="candidate2-lingye-together" type="button" aria-label="进入铃野共行" onclick="openLingyeTogether()">
            <img src="/lingye/lingye-together-game-icon-v4.png" alt="" draggable="false">
        </button>
        <button class="candidate2-lingye-memories" type="button" aria-label="打开纪念册" onclick="openLingyeMemorial()">
            <img src="/lingye/ui/memorial-album.png" alt="" width="256" height="256" draggable="false">
        </button>
    </div>
`;

const LINGYE_PLACE_SCREENS = `
    <div id="screen-lingye-together" class="screen screen--lingye-place candidate2-together-page">
        <div class="candidate2-together-paper">
            <figure class="candidate2-together-cover">
                <img class="candidate2-together-cover-image" alt="" width="1448" height="1086" hidden>
                <button class="candidate2-place-back-link" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                    <span aria-hidden="true">‹</span>
                </button>
                <button class="candidate2-together-history-button" type="button" aria-label="往期故事" disabled>
                    <svg viewBox="0 0 32 32" aria-hidden="true">
                        <path d="M7 7.5A3.5 3.5 0 0 1 10.5 4H25v21H10.5A3.5 3.5 0 0 0 7 28.5z"></path>
                        <path d="M7 7.5A3.5 3.5 0 0 1 10.5 11H25M12 16h8M12 20h6"></path>
                    </svg>
                    <span class="candidate2-place-visually-hidden">往期故事</span>
                </button>
            </figure>

            <section class="candidate2-together-section candidate2-together-current" aria-labelledby="candidate2-together-current-title">
                <p class="candidate2-together-live-empty">进入后读取当前铃野共行状态。</p>
                <div class="candidate2-together-current-content" hidden>
                    <div class="candidate2-place-section-heading">
                        <div>
                            <span class="candidate2-together-current-kicker"></span>
                            <h2 id="candidate2-together-current-title"></h2>
                        </div>
                        <span class="candidate2-place-status-chip candidate2-together-current-status"></span>
                    </div>
                    <div class="candidate2-together-stage-rail" aria-label="故事阶段"></div>
                    <p class="candidate2-together-stage-name"></p>
                    <p class="candidate2-place-body-copy candidate2-together-current-copy"></p>
                </div>
            </section>

            <section class="candidate2-together-section" aria-labelledby="candidate2-together-task-title">
                <div class="candidate2-place-section-heading">
                    <div>
                        <span class="candidate2-together-task-kicker"></span>
                        <h2 id="candidate2-together-task-title"></h2>
                    </div>
                </div>
                <div class="candidate2-together-task-list"></div>
            </section>

            <section class="candidate2-together-section candidate2-together-choice" aria-labelledby="candidate2-together-choice-title">
                <div class="candidate2-place-section-heading">
                    <div>
                        <span class="candidate2-together-choice-kicker"></span>
                        <h2 id="candidate2-together-choice-title"></h2>
                    </div>
                </div>
                <p class="candidate2-place-body-copy candidate2-together-choice-copy"></p>
                <div class="candidate2-together-choice-list" aria-label="公共选择"></div>
            </section>

            <section id="candidate2-together-rules" class="candidate2-together-rules" aria-label="铃野共行说明">
                <strong class="candidate2-together-rules-title"></strong>
                <p class="candidate2-together-rules-copy"></p>
            </section>
        </div>
    </div>

    <div id="screen-lingye-memorial" class="screen screen--lingye-place candidate2-memorial-page">
        <div class="candidate2-memorial-paper">
            <header class="candidate2-memorial-header">
                <button class="candidate2-memorial-back" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                    <span aria-hidden="true">‹</span>
                </button>
                <p>限时活动档案</p>
                <h1>纪念册</h1>
            </header>
            <main class="candidate2-memorial-list" aria-label="限时活动纪念">
                <p class="candidate2-memorial-empty">还没有可查看的活动档案。</p>
                <article class="candidate2-memorial-demo" aria-label="2026 年七夕活动灯河有信" hidden>
                    <div class="candidate2-memorial-meta"><span>2026</span><i aria-hidden="true"></i><span>七夕</span></div>
                    <h2>灯河有信</h2>
                    <p>愿今夜所有思念，都能顺水抵达归处。</p>
                </article>
            </main>
        </div>
    </div>

    <div id="screen-lingye-glimmer" class="screen screen--lingye-place candidate2-glimmer-page">
        <div class="candidate2-glimmer-backdrop" aria-hidden="true"></div>
        <div class="candidate2-glimmer-hero">
            <h1 class="candidate2-place-visually-hidden">流光原野</h1>
            <button class="candidate2-glimmer-back-button" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                <span aria-hidden="true">‹</span>
            </button>
            <details class="candidate2-glimmer-library">
                <summary aria-label="打开原野资料">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17z"></path><path d="M8.5 8h6M8.5 11h6M8.5 14h4"></path></svg>
                    <span class="candidate2-place-visually-hidden">原野资料</span>
                </summary>
                <div class="candidate2-glimmer-library-panel">
                    <details open>
                        <summary>异色动物图鉴</summary>
                        <p class="candidate2-glimmer-variants-empty"><strong>还没有收录异色动物</strong>实际收录的异色外观会展示在这里。</p>
                        <div class="candidate2-glimmer-variants-demo" hidden></div>
                    </details>
                    <details>
                        <summary>奇遇图鉴</summary>
                        <p class="candidate2-glimmer-encounters-empty"><strong>还没有遇见原野奇遇</strong>实际遇见的奇遇会记录在这里。</p>
                        <ul class="candidate2-glimmer-encounters-demo" hidden></ul>
                    </details>
                    <details>
                        <summary>流光原野成就</summary>
                        <p class="candidate2-glimmer-achievements-empty"><strong>还没有成就进度</strong>实际成就与进度会展示在这里。</p>
                        <div class="candidate2-glimmer-achievements-demo" hidden></div>
                    </details>
                </div>
            </details>
            <section class="candidate2-glimmer-status-overlay" aria-labelledby="candidate2-glimmer-status-title">
                <h2 id="candidate2-glimmer-status-title">原野状态</h2>
                <div class="candidate2-glimmer-status-grid">
                    <div><span>开放</span><strong class="candidate2-glimmer-opening-value">—</strong></div>
                    <div><span>状态</span><strong class="candidate2-glimmer-status-value">—</strong></div>
                    <div><span>踪迹</span><strong class="candidate2-glimmer-trace-value">—</strong></div>
                </div>
            </section>
        </div>

        <main class="candidate2-glimmer-journal">
            <section class="candidate2-glimmer-journal-feature" aria-labelledby="candidate2-glimmer-coop-title">
                <h2 id="candidate2-glimmer-coop-title">今日协作任务</h2>
                <div class="candidate2-glimmer-feature-empty candidate2-glimmer-live-empty">
                    <span aria-hidden="true">✦</span>
                    <div><strong class="candidate2-glimmer-feature-empty-title">进入后读取当前协作</strong><p class="candidate2-glimmer-feature-empty-copy">进入后读取真实的全服协作任务。</p></div>
                </div>
                <div class="candidate2-glimmer-feature-demo" hidden>
                    <div>
                        <strong class="candidate2-glimmer-task-title"></strong>
                        <p class="candidate2-glimmer-task-detail"></p>
                    </div>
                    <div class="candidate2-glimmer-progress">
                        <div><span>协作进度</span><strong class="candidate2-glimmer-task-progress"></strong></div>
                        <div class="candidate2-glimmer-progress-track" aria-hidden="true"><i></i></div>
                    </div>
                </div>
            </section>

            <div class="candidate2-glimmer-journal-stream">
                <section aria-labelledby="candidate2-glimmer-tracks-title">
                    <h2 id="candidate2-glimmer-tracks-title">今日动物踪迹</h2>
                    <p class="candidate2-glimmer-tracks-empty"><strong>还没有发现动物踪迹</strong>实际出现的异色动物会展示在这里。</p>
                    <div class="candidate2-glimmer-tracks-demo" hidden></div>
                </section>
                <section aria-labelledby="candidate2-glimmer-events-title">
                    <h2 id="candidate2-glimmer-events-title">公共事件</h2>
                    <p class="candidate2-glimmer-events-empty"><strong>还没有公共事件</strong>原野实际发生的公开事件会按时间出现。</p>
                    <ol class="candidate2-glimmer-events-demo" hidden></ol>
                </section>
                <section aria-labelledby="candidate2-glimmer-summary-title">
                    <h2 id="candidate2-glimmer-summary-title">我家的原野概况</h2>
                    <p class="candidate2-glimmer-summary-empty"><strong>还没有原野记录</strong>自家实际探索记录会汇总在这里。</p>
                    <dl class="candidate2-glimmer-summary-demo" hidden>
                        <div><dt>奇遇</dt><dd class="candidate2-glimmer-summary-encounters"></dd></div>
                        <div><dt>异色</dt><dd class="candidate2-glimmer-summary-variants"></dd></div>
                        <div><dt>协作</dt><dd class="candidate2-glimmer-summary-coops"></dd></div>
                    </dl>
                </section>
            </div>
        </main>
    </div>
`;

const LINGYE_NAV_ITEM = `
        <div class="nav-item" role="button" tabindex="0" aria-label="铃野" onclick="showScreen('screen-lingye')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); showScreen('screen-lingye'); }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg>
        </div>`;

const LINGYE_STYLES = `
        .screen.screen--lingye {
            padding: 0;
            overflow: hidden;
            background: #d7e9d0;
        }

        .candidate2-lingye-viewport {
            width: 100%;
            height: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            overscroll-behavior-x: contain;
            scrollbar-width: thin;
            touch-action: pan-x;
            cursor: grab;
        }

        .candidate2-lingye-viewport.is-dragging {
            cursor: grabbing;
            user-select: none;
        }

        .candidate2-lingye-viewport:focus-visible {
            outline: 3px solid rgba(109, 93, 85, 0.55);
            outline-offset: -3px;
        }

        .candidate2-lingye-canvas {
            position: relative;
            width: auto;
            height: 100%;
            aspect-ratio: 2 / 3;
        }

        .candidate2-lingye-map {
            display: block;
            width: auto;
            max-width: none;
            height: 100%;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-place {
            position: absolute;
            z-index: 5;
            width: clamp(82px, 25vw, 122px);
            min-height: 44px;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
            transform: translate(-50%, -50%);
        }

        .candidate2-lingye-place img {
            display: block;
            width: 100%;
            height: auto;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-together {
            position: absolute;
            z-index: 30;
            top: 14px;
            right: 14px;
            width: clamp(56px, 14vw, 68px);
            aspect-ratio: 1;
            min-height: 44px;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-lingye-together img {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(1px 0 0 rgba(255, 255, 255, 0.96))
                drop-shadow(-1px 0 0 rgba(255, 255, 255, 0.96))
                drop-shadow(0 1px 0 rgba(255, 255, 255, 0.96))
                drop-shadow(0 -1px 0 rgba(255, 255, 255, 0.96));
            object-fit: contain;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-memories {
            position: absolute;
            z-index: 30;
            top: 86px;
            right: 12px;
            width: clamp(52px, 14vw, 60px);
            aspect-ratio: 1;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
            touch-action: manipulation;
        }

        .candidate2-lingye-memories img {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 3px 5px rgba(64, 53, 38, 0.42));
            object-fit: contain;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-memories:focus-visible {
            outline: 3px solid rgba(255, 248, 222, 0.92);
            outline-offset: 2px;
            border-radius: 18px;
        }

        .screen.screen--lingye-place {
            padding: 0 0 112px;
            color: #51483f;
            overscroll-behavior-y: contain;
            scrollbar-width: thin;
        }

        .screen--lingye-place h1,
        .screen--lingye-place h2 {
            color: inherit;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-style: normal;
        }

        .candidate2-place-header {
            position: relative;
            z-index: 4;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }

        .candidate2-place-brand,
        .candidate2-place-world {
            margin: 0;
        }

        .candidate2-place-brand {
            font-family: Georgia, serif;
            font-size: 13px;
            letter-spacing: 0.04em;
        }

        .candidate2-place-world {
            margin-top: 2px;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.08em;
        }

        .candidate2-place-header-actions {
            display: flex;
            gap: 8px;
        }

        .candidate2-place-round-action {
            display: inline-flex;
            width: 52px;
            min-height: 52px;
            padding: 6px 4px 5px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1px;
            border: 1px solid rgba(119, 101, 74, 0.22);
            border-radius: 50%;
            color: #55483d;
            background: rgba(255, 249, 233, 0.92);
            box-shadow: 0 7px 18px rgba(81, 67, 45, 0.12);
            cursor: pointer;
        }

        .candidate2-place-round-action svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.6;
        }

        .candidate2-place-round-action span {
            font-size: 9px;
            font-weight: 700;
        }

        .candidate2-place-round-action:active {
            transform: translateY(1px);
        }

        .candidate2-place-round-action:focus-visible,
        .candidate2-place-back-link:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.5);
            outline-offset: 2px;
        }

        .candidate2-place-card {
            position: relative;
            border: 1px solid rgba(136, 118, 83, 0.18);
            border-radius: 18px;
            background:
                radial-gradient(circle at 8% 12%, rgba(126, 105, 67, 0.035) 0 0.7px, transparent 0.9px),
                radial-gradient(circle at 76% 42%, rgba(126, 105, 67, 0.028) 0 0.65px, transparent 0.85px),
                rgba(255, 251, 239, 0.94);
            background-size: 15px 17px, 19px 21px, auto;
            box-shadow: 0 9px 24px rgba(68, 55, 37, 0.09);
        }

        .candidate2-place-visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            overflow: hidden;
            clip: rect(0 0 0 0);
            clip-path: inset(50%);
            border: 0;
            white-space: nowrap;
        }

        .candidate2-place-section-heading {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }

        .candidate2-place-section-heading span {
            color: #8b7a69;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
        }

        .candidate2-place-section-heading h2 {
            margin: 3px 0 0;
            font-size: 18px;
            line-height: 1.35;
        }

        .candidate2-place-body-copy {
            margin: 12px 0 0;
            color: #76685c;
            font-size: 12px;
            line-height: 1.75;
        }

        .candidate2-place-status-chip {
            flex: 0 0 auto;
            padding: 5px 10px;
            border-radius: 999px;
            color: #716345 !important;
            background: #ece5c6;
            letter-spacing: 0 !important;
        }

        .candidate2-together-page {
            --candidate2-together-page-bg: #f6f1df;
            background: var(--candidate2-together-page-bg);
        }

        .candidate2-memorial-page {
            padding: 0 !important;
            color: #51483f;
            background: #f3eedc;
        }

        .candidate2-memorial-paper {
            min-height: 100%;
            padding: 17px 22px 126px;
            background:
                radial-gradient(circle at 82% 8%, rgba(141, 157, 91, 0.12), transparent 25%),
                linear-gradient(180deg, rgba(251, 248, 235, 0.98), rgba(242, 235, 213, 0.98));
        }

        .candidate2-memorial-header {
            padding-bottom: 23px;
            border-bottom: 1px solid rgba(118, 102, 73, 0.2);
        }

        .candidate2-memorial-back {
            display: inline-flex;
            min-height: 44px;
            padding: 0;
            align-items: center;
            gap: 5px;
            border: 0;
            color: #728742;
            background: transparent;
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
        }

        .candidate2-memorial-back span {
            font-size: 25px;
            line-height: 0;
        }

        .candidate2-memorial-back:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.5);
            outline-offset: 2px;
        }

        .candidate2-memorial-header p {
            margin: 20px 0 0;
            color: #8c7e65;
            font-size: 10px;
            letter-spacing: 0.12em;
        }

        .candidate2-memorial-header h1 {
            margin: 4px 0 0;
            color: #4f463a;
            font-size: 27px;
            letter-spacing: 0.08em;
        }

        .candidate2-memorial-list {
            padding-top: 10px;
        }

        .candidate2-memorial-empty,
        .candidate2-memorial-demo {
            margin: 0;
            padding: 24px 2px;
            border-bottom: 1px solid rgba(118, 102, 73, 0.16);
        }

        .candidate2-memorial-empty {
            color: #8a7d69;
            font-size: 11px;
        }

        .candidate2-memorial-demo[hidden] {
            display: none;
        }

        .candidate2-memorial-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #7b8950;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
        }

        .candidate2-memorial-meta i {
            width: 18px;
            height: 1px;
            background: rgba(123, 137, 80, 0.46);
        }

        .candidate2-memorial-demo h2 {
            margin: 10px 0 0;
            color: #50463a;
            font-size: 20px;
            letter-spacing: 0.06em;
        }

        .candidate2-memorial-demo > p {
            margin: 10px 0 0;
            color: #786b5d;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 12px;
            line-height: 1.8;
        }

        .candidate2-together-paper {
            min-height: 100%;
            padding: 0 18px 20px;
            background:
                radial-gradient(circle at 12% 8%, rgba(123, 151, 102, 0.12), transparent 29%),
                var(--candidate2-together-page-bg);
        }

        .candidate2-place-back-link {
            position: absolute;
            z-index: 2;
            top: 15px;
            left: 17px;
            display: inline-flex;
            min-height: 34px;
            padding: 0;
            align-items: center;
            gap: 5px;
            border: 0;
            color: #fff9e9;
            background: transparent;
            font: inherit;
            font-size: 11px;
            font-weight: 800;
            text-shadow: 0 2px 7px rgba(30, 37, 30, 0.78);
            cursor: pointer;
        }

        .candidate2-place-back-link span {
            font-size: 24px;
            line-height: 0;
        }

        .candidate2-together-cover {
            position: relative;
            z-index: 1;
            margin: 0 -18px;
            overflow: hidden;
            background: var(--candidate2-together-page-bg);
        }

        .candidate2-together-cover::after {
            position: absolute;
            inset: 0;
            background: linear-gradient(
                180deg,
                rgba(25, 34, 28, 0.48) 0,
                rgba(25, 34, 28, 0.03) 35%,
                transparent 58%,
                rgba(246, 241, 223, 0.24) 76%,
                var(--candidate2-together-page-bg) 100%
            );
            content: '';
            pointer-events: none;
        }

        .candidate2-together-history-button {
            position: absolute;
            z-index: 2;
            top: 15px;
            right: 15px;
            display: grid;
            width: 34px;
            height: 34px;
            padding: 4px;
            place-items: center;
            border: 0;
            color: #fff9e9;
            background: transparent;
            filter: drop-shadow(0 2px 6px rgba(27, 33, 29, 0.72));
        }

        .candidate2-together-history-button svg {
            width: 27px;
            height: 27px;
            fill: rgba(255, 249, 233, 0.08);
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.8;
        }

        .candidate2-together-cover img {
            display: block;
            width: 100%;
            height: auto;
            aspect-ratio: 4 / 3;
            object-fit: cover;
        }

        .candidate2-together-section {
            margin: 0;
            padding: 19px 0 21px;
            border-bottom: 1px solid rgba(126, 108, 75, 0.16);
        }

        .candidate2-together-cover + .candidate2-together-section {
            padding-top: 37px;
        }

        .candidate2-together-stage-rail {
            display: flex;
            margin-top: 18px;
            align-items: center;
        }

        .candidate2-together-stage-rail span {
            display: grid;
            width: 25px;
            height: 25px;
            flex: 0 0 auto;
            place-items: center;
            border: 1px solid #c7bda9;
            border-radius: 50%;
            color: #8e806f;
            background: #faf4e7;
            font-size: 11px;
            font-weight: 800;
        }

        .candidate2-together-stage-rail span.is-current {
            border-color: #839b4a;
            color: #fffdf3;
            background: #839b4a;
        }

        .candidate2-together-stage-rail i {
            height: 1px;
            flex: 1;
            background: #d7cfbd;
        }

        .candidate2-together-stage-name {
            margin: 12px 0 0;
            color: #5b513f;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 15px;
            font-weight: 800;
        }

        .candidate2-together-task-list {
            display: grid;
            margin-top: 14px;
            gap: 8px;
        }

        .candidate2-together-task-list article {
            display: grid;
            min-height: 55px;
            padding: 9px 0;
            grid-template-columns: 30px minmax(0, 1fr) auto;
            align-items: center;
            gap: 9px;
            border-top: 1px solid rgba(129, 112, 80, 0.12);
        }

        .candidate2-task-mark {
            display: grid;
            width: 27px;
            height: 27px;
            place-items: center;
            border-radius: 50%;
            color: #fffdf4;
            background: #98a65c;
            font-size: 11px;
            font-weight: 900;
        }

        .candidate2-together-task-list strong,
        .candidate2-together-task-list p {
            display: block;
            margin: 0;
        }

        .candidate2-together-task-list strong {
            color: #564a3d;
            font-size: 12px;
        }

        .candidate2-together-task-list p {
            margin-top: 3px;
            color: #8a7b6e;
            font-size: 10px;
            line-height: 1.45;
        }

        .candidate2-together-task-list small {
            color: #91846f;
            font-size: 9px;
            white-space: nowrap;
        }

        .candidate2-together-choice-list {
            display: grid;
            margin-top: 13px;
            gap: 7px;
        }

        .candidate2-together-choice-list div {
            display: grid;
            min-height: 45px;
            padding: 8px 0;
            grid-template-columns: 27px 1fr;
            align-items: center;
            gap: 8px;
            border-top: 1px solid rgba(129, 112, 80, 0.14);
            color: #685b4c;
            font-size: 11px;
            line-height: 1.45;
        }

        .candidate2-together-choice-list b {
            display: grid;
            width: 24px;
            height: 24px;
            place-items: center;
            border-radius: 50%;
            color: #fffdf5;
            background: #a89a69;
            font-size: 10px;
        }

        .candidate2-together-rules {
            padding: 4px 5px 18px;
            color: #786b60;
        }

        .candidate2-together-rules strong {
            color: #5f5549;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-together-rules p {
            margin: 5px 0 0;
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-glimmer-page {
            --glimmer-animal-caption-gap: -2px;
            --glimmer-animal-column-gap: 10px;
            --glimmer-animal-row-gap: 13px;
            --glimmer-animal-size: 64px;
            isolation: isolate;
            padding-bottom: 0 !important;
            padding-right: 16px !important;
            padding-left: 16px !important;
            color: #f5efe1;
            background: #07172b;
        }

        .candidate2-glimmer-backdrop {
            position: absolute;
            z-index: -2;
            inset: 0;
            min-height: 100%;
            background: #07172b url('/lingye/glimmer/glimmer-night-hero.jpg') top center / 100% auto no-repeat;
            pointer-events: none;
        }

        .candidate2-glimmer-backdrop::after {
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 0 24%, rgba(7, 23, 43, 0.18) 39%, rgba(7, 23, 43, 0.82) 74%, #07172b 100%);
            content: '';
        }

        .candidate2-glimmer-hero {
            position: relative;
            z-index: 2;
            width: 100%;
            aspect-ratio: 25 / 23;
        }

        .candidate2-glimmer-hero:has(.candidate2-glimmer-library[open]) {
            z-index: 4;
        }

        .candidate2-glimmer-back-button {
            position: absolute;
            z-index: 12;
            top: 15px;
            left: 0;
            display: inline-flex;
            min-height: 34px;
            padding: 0;
            align-items: center;
            gap: 4px;
            border: 0;
            color: #fff9e9;
            background: transparent;
            font: inherit;
            font-size: 11px;
            font-weight: 800;
            text-shadow: 0 2px 7px rgba(0, 0, 0, 0.72);
            cursor: pointer;
        }

        .candidate2-glimmer-back-button::before {
            position: absolute;
            inset: -5px;
            content: '';
        }

        .candidate2-glimmer-back-button:hover {
            color: #fff2b5;
        }

        .candidate2-glimmer-back-button span {
            font-size: 24px;
            line-height: 0;
        }

        .candidate2-glimmer-library {
            position: absolute;
            z-index: 12;
            top: 18px;
            right: 2px;
        }

        .candidate2-glimmer-library > summary {
            position: relative;
            display: grid;
            width: 28px;
            height: 28px;
            padding: 0;
            place-items: center;
            border: 0;
            color: #e5da9c;
            background: transparent;
            cursor: pointer;
            list-style: none;
            text-shadow: 0 2px 5px rgba(0, 0, 0, 0.52);
        }

        .candidate2-glimmer-library > summary::before {
            position: absolute;
            inset: -8px;
            content: '';
        }

        .candidate2-glimmer-library > summary svg {
            width: 19px;
            height: 19px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.6;
            filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.52));
        }

        .candidate2-glimmer-library > summary:hover,
        .candidate2-glimmer-library[open] > summary {
            color: #fff2b5;
        }

        .candidate2-glimmer-library > summary::-webkit-details-marker,
        .candidate2-glimmer-library-panel > details > summary::-webkit-details-marker {
            display: none;
        }

        .candidate2-glimmer-back-button:focus-visible,
        .candidate2-glimmer-library > summary:focus-visible {
            outline: 2px solid rgba(255, 242, 181, 0.82);
            outline-offset: 3px;
        }

        .candidate2-glimmer-library-panel {
            position: absolute;
            z-index: 1;
            isolation: isolate;
            top: 38px;
            right: 0;
            width: min(240px, calc(100vw - 54px));
            max-height: 58vh;
            padding: 4px 12px 9px;
            overflow-y: auto;
            border: 0;
            color: #f5efe1;
            background: #07172b;
        }

        .candidate2-glimmer-library-panel > details {
            padding: 9px 0;
        }

        .candidate2-glimmer-library-panel > details > summary {
            color: #f6efdd;
            cursor: pointer;
            font-size: 12px;
            font-weight: 750;
            list-style: none;
        }

        .candidate2-glimmer-library-panel > details > summary::after {
            float: right;
            color: rgba(229, 218, 156, 0.7);
            content: '+';
        }

        .candidate2-glimmer-library-panel > details[open] > summary::after {
            content: '−';
        }

        .candidate2-glimmer-library-panel > details > :not(summary) {
            margin-top: 8px;
        }

        .candidate2-glimmer-library-panel p {
            margin-bottom: 0;
            color: rgba(235, 231, 212, 0.58);
            font-size: 8px;
            line-height: 1.55;
        }

        .candidate2-glimmer-library-panel p strong {
            display: block;
            margin-bottom: 3px;
            color: #f2ead6;
            font-size: 9px;
        }

        .candidate2-glimmer-status-overlay {
            position: absolute;
            right: 0;
            bottom: 18px;
            left: 0;
            padding-top: 13px;
            border-top: 1px solid rgba(234, 224, 186, 0.46);
            color: #f7efd8;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.76);
        }

        .candidate2-glimmer-status-overlay h2 {
            margin: 0;
            color: #f7efd8;
            font-size: 12px;
            font-weight: 650;
            letter-spacing: 0.14em;
        }

        .candidate2-glimmer-status-grid {
            display: grid;
            margin-top: 10px;
            grid-template-columns: 1.5fr 0.75fr 0.75fr;
        }

        .candidate2-glimmer-status-grid div {
            min-width: 0;
            padding: 0 11px;
        }

        .candidate2-glimmer-status-grid div:first-child {
            padding-left: 0;
        }

        .candidate2-glimmer-status-grid div + div {
            border-left: 1px solid rgba(234, 224, 186, 0.28);
        }

        .candidate2-glimmer-status-grid span,
        .candidate2-glimmer-status-grid strong {
            display: block;
        }

        .candidate2-glimmer-status-grid span {
            color: rgba(247, 239, 216, 0.66);
            font-size: 9px;
            letter-spacing: 0.08em;
        }

        .candidate2-glimmer-status-grid strong {
            margin-top: 3px;
            color: #fff8e8;
            font-size: 11px;
            font-weight: 600;
        }

        .candidate2-glimmer-journal {
            position: relative;
            z-index: 3;
            min-height: 510px;
            padding: 25px 4px 44px;
            color: #f5efdf;
        }

        .candidate2-glimmer-journal::before {
            position: absolute;
            top: 0;
            left: 4px;
            width: 86px;
            height: 1px;
            background: linear-gradient(90deg, rgba(218, 211, 150, 0.78), rgba(218, 211, 150, 0));
            box-shadow: 92px 0 rgba(218, 211, 150, 0.14);
            content: '';
        }

        .candidate2-glimmer-journal-feature {
            position: relative;
            padding: 9px 0 29px;
        }

        .candidate2-glimmer-journal-feature h2,
        .candidate2-glimmer-journal-stream h2 {
            margin: 0;
        }

        .candidate2-glimmer-journal-feature h2 {
            color: #fff8e8;
            font-size: 15px;
            letter-spacing: 0.04em;
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
        }

        .candidate2-glimmer-feature-empty {
            display: grid;
            margin-top: 20px;
            grid-template-columns: 30px minmax(0, 1fr);
            align-items: start;
            gap: 13px;
        }

        .candidate2-glimmer-feature-empty > span {
            color: #d8d38a;
            font-size: 24px;
            line-height: 1;
            transform: translateY(2px);
            text-shadow: 0 0 15px rgba(218, 211, 138, 0.34);
        }

        .candidate2-glimmer-feature-empty strong,
        .candidate2-glimmer-feature-empty p {
            display: block;
            margin: 0;
        }

        .candidate2-glimmer-feature-empty strong {
            color: #f8f1df;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-glimmer-feature-empty p {
            margin-top: 5px;
            color: rgba(235, 231, 212, 0.62);
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-glimmer-feature-demo {
            display: block;
            margin-top: 18px;
        }

        .candidate2-glimmer-feature-demo strong,
        .candidate2-glimmer-feature-demo p {
            display: block;
            margin: 0;
        }

        .candidate2-glimmer-task-title {
            color: #f8f1df;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-glimmer-task-detail {
            margin-top: 5px !important;
            color: rgba(235, 231, 212, 0.64);
            font-size: 10px;
            line-height: 1.6;
        }

        .candidate2-glimmer-progress > div:first-child {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
        }

        .candidate2-glimmer-progress {
            margin-top: 14px;
        }

        .candidate2-glimmer-progress span {
            color: rgba(223, 222, 180, 0.64);
            font-size: 8px;
            letter-spacing: 0.08em;
        }

        .candidate2-glimmer-progress strong {
            color: #f5e9b5;
            font-size: 10px;
        }

        .candidate2-glimmer-progress-track {
            height: 3px;
            margin-top: 7px;
            overflow: hidden;
            background: rgba(243, 235, 201, 0.14);
        }

        .candidate2-glimmer-progress-track i {
            display: block;
            width: 0;
            height: 100%;
            background: linear-gradient(90deg, #9da85a, #ead899);
            box-shadow: 0 0 9px rgba(230, 216, 151, 0.38);
        }

        .candidate2-glimmer-journal-stream section {
            display: block;
            padding: 22px 0;
            border-top: 1px solid rgba(224, 218, 180, 0.16);
        }

        .candidate2-glimmer-journal-stream section > :not(:first-child) {
            margin-top: 18px;
        }

        .candidate2-glimmer-journal-stream h2 {
            margin-top: 3px;
            color: #f6efdd;
            font-size: 15px;
            letter-spacing: 0.04em;
        }

        .candidate2-glimmer-journal-stream p {
            margin: 1px 0 0;
            color: rgba(235, 231, 212, 0.58);
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-glimmer-journal-stream p strong {
            display: block;
            margin-bottom: 3px;
            color: #f2ead6;
            font-size: 12px;
        }

        .candidate2-glimmer-tracks-demo {
            container-type: inline-size;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            align-items: start;
            gap: var(--glimmer-animal-row-gap) 3.424658cqw;
        }

        .candidate2-glimmer-tracks-demo figure,
        .candidate2-glimmer-variants-demo figure {
            min-width: 0;
            margin: 0;
            text-align: center;
        }

        .candidate2-glimmer-tracks-demo figure {
            position: relative;
            z-index: 3;
            will-change: transform;
            transform: translate3d(var(--glimmer-group-x, 0cqw), var(--glimmer-group-y, 0cqw), 0);
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure {
            cursor: grab;
            touch-action: none;
            user-select: none;
        }

        .candidate2-glimmer-tracks-demo .candidate2-glimmer-animal-visual {
            width: min(100%, 21.917808cqw);
        }

        .candidate2-glimmer-tracks-demo .candidate2-glimmer-animal-visual.is-mystery {
            font-size: 14.383562cqw;
        }

        .candidate2-glimmer-tracks-demo figcaption {
            margin-top: -0.684932cqw;
        }

        .candidate2-glimmer-tracks-demo figcaption strong {
            font-size: 3.424658cqw;
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure.is-dragging {
            z-index: 8;
            cursor: grabbing;
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure:hover img,
        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure.is-dragging img {
            filter: drop-shadow(0 0 9px rgba(244, 224, 139, 0.72));
        }

        .candidate2-glimmer-animal-visual {
            display: grid;
            width: min(100%, var(--glimmer-animal-size));
            aspect-ratio: 1;
            margin: 0 auto;
            place-items: center;
        }

        .candidate2-glimmer-animal-visual img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.32));
        }

        .candidate2-glimmer-animal-visual.is-mystery {
            color: rgba(245, 237, 216, 0.74);
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 42px;
            line-height: 1;
            text-shadow: 0 3px 13px rgba(0, 0, 0, 0.42);
        }

        .candidate2-glimmer-tracks-demo figcaption,
        .candidate2-glimmer-variants-demo figcaption {
            margin-top: var(--glimmer-animal-caption-gap);
        }

        .candidate2-glimmer-tracks-demo figcaption strong,
        .candidate2-glimmer-variants-demo figcaption strong {
            display: block;
        }

        .candidate2-glimmer-tracks-demo figcaption strong,
        .candidate2-glimmer-variants-demo figcaption strong {
            overflow: hidden;
            color: #f5edd8;
            font-size: 10px;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-glimmer-events-demo {
            position: relative;
            display: grid;
            gap: 0;
            margin-bottom: 0;
            padding: 0;
            list-style: none;
        }

        .candidate2-glimmer-events-demo::before {
            position: absolute;
            top: 7px;
            bottom: 9px;
            left: 39px;
            width: 1px;
            background: rgba(218, 211, 150, 0.25);
            content: '';
        }

        .candidate2-glimmer-events-demo li {
            position: relative;
            display: grid;
            grid-template-columns: 47px minmax(0, 1fr);
            gap: 11px;
            padding: 0 0 17px;
        }

        .candidate2-glimmer-events-demo li:last-child {
            padding-bottom: 0;
        }

        .candidate2-glimmer-events-demo li::before {
            position: absolute;
            top: 4px;
            left: 36px;
            width: 7px;
            height: 7px;
            border: 1px solid rgba(239, 226, 157, 0.86);
            border-radius: 50%;
            background: #091c32;
            box-shadow: 0 0 8px rgba(231, 219, 146, 0.26);
            content: '';
        }

        .candidate2-glimmer-events-demo time {
            display: grid;
            padding-right: 11px;
            text-align: right;
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
            letter-spacing: 0.04em;
            line-height: 1.25;
        }

        .candidate2-glimmer-events-demo time small {
            color: rgba(223, 222, 180, 0.78);
            font-size: inherit;
        }

        .candidate2-glimmer-events-demo strong {
            display: block;
            color: #f4ecd8;
            font-size: 11px;
            line-height: 1.45;
        }

        .candidate2-glimmer-variants-demo {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px 5px;
        }

        .candidate2-glimmer-variants-demo .candidate2-glimmer-animal-visual {
            width: min(100%, 58px);
        }

        .candidate2-glimmer-variant-visual {
            background-image: var(--glimmer-variant-sheet);
            background-repeat: no-repeat;
            background-position: var(--glimmer-variant-x) var(--glimmer-variant-y);
            background-size: 500% 400%;
            filter: drop-shadow(0 4px 7px rgba(0, 0, 0, 0.3));
        }

        .candidate2-glimmer-encounters-demo,
        .candidate2-glimmer-achievements-demo {
            display: grid;
            gap: 0;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .candidate2-glimmer-encounters-demo li,
        .candidate2-glimmer-achievements-demo article {
            display: flex;
            min-width: 0;
            padding: 6px 0;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .candidate2-glimmer-encounters-demo strong,
        .candidate2-glimmer-achievements-demo strong {
            color: #f4ecd8;
            font-size: 9px;
            font-weight: 650;
            line-height: 1.4;
        }

        .candidate2-glimmer-encounters-demo span,
        .candidate2-glimmer-achievements-demo span,
        .candidate2-glimmer-achievements-demo small {
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
        }

        .candidate2-glimmer-achievements-demo article > div {
            display: grid;
            min-width: 0;
            gap: 3px;
        }

        .candidate2-glimmer-achievements-demo article > div:last-child {
            justify-items: end;
            text-align: right;
        }

        .candidate2-glimmer-summary-demo {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin-bottom: 0;
            text-align: center;
        }

        .candidate2-glimmer-summary-demo div {
            min-width: 0;
        }

        .candidate2-glimmer-summary-demo dt {
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
        }

        .candidate2-glimmer-summary-demo dd {
            margin: 5px 0 0;
            color: #f5e9b5;
            font-size: 13px;
        }

        .candidate2-glimmer-feature-empty[hidden],
        .candidate2-glimmer-feature-demo[hidden],
        .candidate2-glimmer-tracks-demo[hidden],
        .candidate2-glimmer-events-demo[hidden],
        .candidate2-glimmer-variants-demo[hidden],
        .candidate2-glimmer-encounters-demo[hidden],
        .candidate2-glimmer-summary-demo[hidden],
        .candidate2-glimmer-achievements-demo[hidden] {
            display: none !important;
        }

        @media (max-width: 360px) {
            .candidate2-together-paper {
                padding-right: 15px;
                padding-left: 15px;
            }

            .candidate2-together-cover {
                margin-right: -15px;
                margin-left: -15px;
            }

            .candidate2-together-task-list article {
                grid-template-columns: 27px minmax(0, 1fr);
            }

            .candidate2-together-task-list small {
                grid-column: 2;
            }

            .candidate2-glimmer-page {
                padding-right: 13px !important;
                padding-left: 13px !important;
            }

        }

`;

const LINGYE_SCRIPT = `
    function showLingyeNotice(message) {
        showCandidateNotice(message);
    }

    function openLingyeRoute(path, label) {
        if (window.__doorbellCandidateDemo && path !== '${DOORBELL_FARM_PATH}') {
            showLingyeNotice('演示模式：' + label + '未连接真实服务');
            return;
        }
        sendAction({ type: 'navigate', path });
    }

    function openLingyePlace(placeId, label) {
        if (placeId === 'doorbell-community') {
            showScreen('screen-lounge');
            return;
        }
        if (placeId === 'farm-ranch') {
            openLingyeRoute('${DOORBELL_FARM_PATH}', label);
            return;
        }
        if (placeId === 'glimmer-meadow') {
            if (window.__doorbellCandidateDemo) {
                showScreen('screen-lingye-glimmer');
                return;
            }
            sendAction({ type: 'lingye-glimmer-open' });
            return;
        }
        showLingyeNotice(label + '暂未开放');
    }

    function openLingyeTogether() {
        if (window.__doorbellCandidateDemo) {
            showScreen('screen-lingye-together');
            return;
        }
        sendAction({ type: 'lingye-together-open' });
    }

    function openLingyeMemorial() {
        if (window.__doorbellCandidateDemo) {
            showScreen('screen-lingye-memorial');
            return;
        }
        showLingyeNotice('纪念册还没有可查看的活动档案');
    }

    const glimmerTrackAssets = {
        'duck_peach': '/lingye/glimmer/tracks/duck-peach.png',
        'turkey_maple': '/lingye/glimmer/tracks/turkey-maple.png',
        'silk_moth_mist': '/lingye/glimmer/tracks/silk-moth-mist.png',
    };

    const lingyeViewport = document.querySelector('.candidate2-lingye-viewport');
    let lingyeDragging = false;
    let lingyeDragStartX = 0;
    let lingyeDragStartScrollLeft = 0;

    lingyeViewport.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.candidate2-lingye-place, .candidate2-lingye-together')) return;
        lingyeDragging = true;
        lingyeDragStartX = event.clientX;
        lingyeDragStartScrollLeft = lingyeViewport.scrollLeft;
        lingyeViewport.classList.add('is-dragging');
        lingyeViewport.setPointerCapture(event.pointerId);
    });

    lingyeViewport.addEventListener('pointermove', (event) => {
        if (!lingyeDragging) return;
        lingyeViewport.scrollLeft = lingyeDragStartScrollLeft - (event.clientX - lingyeDragStartX);
    });

    function finishLingyeDrag(event) {
        if (!lingyeDragging) return;
        lingyeDragging = false;
        lingyeViewport.classList.remove('is-dragging');
        if (lingyeViewport.hasPointerCapture(event.pointerId)) {
            lingyeViewport.releasePointerCapture(event.pointerId);
        }
    }

    lingyeViewport.addEventListener('pointerup', finishLingyeDrag);
    lingyeViewport.addEventListener('pointercancel', finishLingyeDrag);

    lingyeViewport.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        lingyeViewport.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });

`;

const CANDIDATE_RUNTIME_SCRIPT = `
    const credentialsForm = document.getElementById('credentials-form');
    const profileForm = document.getElementById('profile-form');
    const credentialsStatus = document.querySelector('.credentials-status');
    const profileStatus = document.querySelector('.profile-status');
    const farmConfirmation = document.getElementById('farm-confirmation');
    const farmName = document.getElementById('farm-name');
    const farmDoorplateResult = document.getElementById('farm-doorplate-result');
    const farmDoorplateInput = document.getElementById('farm-doorplate');
    const farmHumanUrlInput = document.getElementById('farm-human-url');
    const confirmFarmInput = document.getElementById('confirm-farm');
    const farmLookupButton = document.getElementById('farm-lookup-button');
    const profileSubmitButton = profileForm.querySelector('button[type="submit"]');
    const mainNav = document.getElementById('main-nav');
    const settingsFeedback = document.querySelector('.candidate2-settings-feedback');
    const connectorIssueButton = document.getElementById('connector-issue-button');
    const connectorRevokeButton = document.getElementById('connector-revoke-button');
    const connectorConfirmation = document.getElementById('connector-confirmation');
    const connectorConfirmationCopy = connectorConfirmation.querySelector('.candidate2-connector-confirmation-copy');
    const connectorConfirmButton = document.getElementById('connector-confirm-button');
    const connectorCancelButton = document.getElementById('connector-cancel-button');
    const connectorCredentialResult = document.getElementById('connector-credential-result');
    const connectorCredentialValue = connectorCredentialResult.querySelector('.candidate2-connector-credential-value');
    const connectorCopySetupButton = document.getElementById('connector-copy-setup-button');
    const sharedMemesOpenButton = document.getElementById('settings-shared-memes-open');
    const sharedMemeAddFromSettingsButton = document.getElementById('settings-shared-meme-add');
    const sharedMemesBackButton = document.getElementById('shared-memes-back');
    const sharedMemesSearch = document.getElementById('shared-memes-search');
    const sharedMemeAddOpenButton = document.getElementById('shared-meme-add-open');
    const sharedMemeAddForm = document.getElementById('shared-meme-add-form');
    const sharedMemeAddCloseButton = document.getElementById('shared-meme-add-close');
    const sharedMemeSubmitButton = sharedMemeAddForm.querySelector('button[type="submit"]');
    const sharedMemeFormStatus = document.querySelector('.shared-meme-form-status');
    const sharedMemesStatus = document.querySelector('.shared-memes-status');
    const sharedMemesList = document.querySelector('.candidate2-shared-meme-list');
    const sharedMemeDetail = document.querySelector('.candidate2-shared-meme-detail');
    const sharedMemeDetailCloseButton = document.getElementById('shared-meme-detail-close');
    const settingsHomeName = document.querySelector('.settings-home-name');
    const settingsEnvironment = document.querySelector('.settings-environment');
    const settingsClimate = document.querySelector('.settings-climate');
    const settingsPauseAllWakeups = document.querySelector('.settings-pause-all-wakeups');
    const settingsVisitNotifications = document.querySelector('.settings-visit-notifications');
    const settingsActivityNotifications = document.querySelector('.settings-activity-notifications');
    const settingsSystemNotifications = document.querySelector('.settings-system-notifications');
    const settingsLoungeDuration = document.querySelector('.settings-lounge-duration');
    const settingsInitialMessageCount = document.querySelector('.settings-initial-message-count');
    const settingsChatMode = document.querySelector('.settings-chat-mode');
    const settingsActivityRoomWarmup = document.querySelector('.settings-activity-room-warmup');
    const relationshipEditButton = document.getElementById('profile-relationship-edit');
    const relationshipEditor = document.getElementById('profile-relationship-editor');
    const relationshipCancelButton = document.getElementById('profile-relationship-cancel');
    let currentFarmName = '';
    let currentFarmDoorplate = '';
    let currentStage = 'checking-session';
    let currentConnectorStatus = 'not_configured';
    let connectorConfirmationAction = '';
    let oneTimeConnectorSetupInstructions = '';
    let visibleSharedMemes = [];
    let settingsSaveScope = '';
    let settingsWasSaving = '';
    let permitTimer = 0;
    const homeScaleShell = document.querySelector('.candidate2-home-scale-shell');
    const homeDesignCanvas = document.querySelector('.candidate2-home-design-canvas');
    const homeDesignWidth = 430;
    const profileScaleShell = document.querySelector('.candidate2-profile-scale-shell');
    const profileDesignCanvas = document.querySelector('.candidate2-profile-design-canvas');
    const profileDesignWidth = 402;
    const candidateNoticeModal = document.querySelector('.candidate2-notice-modal');
    const candidateNoticeDesignCanvas = document.querySelector('.candidate2-notice-design-canvas');
    const candidateNoticeMessage = document.getElementById('candidate2-notice-message');
    const candidateNoticeConfirm = document.querySelector('.candidate2-notice-confirm');
    const candidateNoticeDesignWidth = 430;
    let candidateNoticeReturnFocus = null;

    function syncCandidateNoticeScale() {
        const availableWidth = candidateNoticeModal.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / candidateNoticeDesignWidth);
        candidateNoticeDesignCanvas.style.setProperty('--candidate2-notice-scale', String(scale));
    }

    const candidateNoticeScaleObserver = new ResizeObserver(syncCandidateNoticeScale);
    candidateNoticeScaleObserver.observe(candidateNoticeModal);

    function showCandidateNotice(message) {
        if (!message) return;
        candidateNoticeReturnFocus = document.activeElement;
        candidateNoticeMessage.textContent = message;
        candidateNoticeModal.hidden = false;
        syncCandidateNoticeScale();
        candidateNoticeConfirm.focus();
    }

    function closeCandidateNotice() {
        if (candidateNoticeModal.hidden) return;
        candidateNoticeModal.hidden = true;
        candidateNoticeMessage.textContent = '';
        if (candidateNoticeReturnFocus instanceof HTMLElement) candidateNoticeReturnFocus.focus();
        candidateNoticeReturnFocus = null;
    }

    function syncHomeScale() {
        const availableWidth = homeScaleShell.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / homeDesignWidth);
        homeDesignCanvas.style.setProperty('--candidate2-home-scale', String(scale));
    }

    const homeScaleObserver = new ResizeObserver(syncHomeScale);
    homeScaleObserver.observe(homeScaleShell);
    window.addEventListener('resize', syncHomeScale);

    function syncProfileScale() {
        const availableWidth = profileScaleShell.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / profileDesignWidth);
        profileDesignCanvas.style.setProperty('--candidate2-profile-scale', String(scale));
    }

    const profileScaleObserver = new ResizeObserver(syncProfileScale);
    profileScaleObserver.observe(profileScaleShell);
    window.addEventListener('resize', syncProfileScale);

    function sendAction(action) {
        window.parent.postMessage(action, '*');
    }

    function setStatus(element, message) {
        element.textContent = typeof message === 'string' ? message : '';
    }

    function setFormDisabled(form, disabled) {
        form.querySelectorAll('button, input').forEach((control) => {
            control.disabled = disabled;
        });
    }

    function clearConnectorConfirmation() {
        connectorConfirmationAction = '';
        connectorConfirmation.hidden = true;
        connectorConfirmationCopy.textContent = '';
    }

    function clearOneTimeConnectorCredential() {
        oneTimeConnectorSetupInstructions = '';
        connectorCredentialValue.textContent = '';
        connectorCredentialResult.hidden = true;
    }

    function setConnectorControlsDisabled(disabled) {
        connectorIssueButton.disabled = disabled;
        connectorRevokeButton.disabled = disabled;
        connectorConfirmButton.disabled = disabled;
    }

    function formatConnectorLastOnline(lastOnlineAt) {
        if (lastOnlineAt === null) return '暂无连接记录';
        const date = new Date(lastOnlineAt);
        if (Number.isNaN(date.getTime())) return '暂无连接记录';
        return '最近连接 ' + date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }

    function applyConnectorSettings(connectorSettings, pending, issueMessage) {
        const summary = document.querySelector('.settings-connection-summary');
        const state = document.querySelector('.settings-connector-state');
        const seen = document.querySelector('.settings-connector-seen');
        const dot = document.querySelector('.settings-connector-dot');

        if (connectorSettings.stage === 'loading') {
            summary.textContent = '正在读取';
            state.textContent = '正在读取';
            seen.textContent = '暂无连接记录';
            setConnectorControlsDisabled(true);
            setStatus(settingsFeedback, pending ? '正在处理 Connector 凭据……' : '正在读取连接状态……');
            return;
        }

        if (connectorSettings.stage === 'error') {
            summary.textContent = '读取失败';
            state.textContent = '读取失败';
            seen.textContent = '暂无连接记录';
            setConnectorControlsDisabled(true);
            setStatus(settingsFeedback, connectorSettings.message);
            return;
        }

        currentConnectorStatus = connectorSettings.status.status;
        const labels = {
            not_configured: '尚未配置',
            offline: '已离线',
            online: '连接正常',
        };
        const label = labels[currentConnectorStatus];
        summary.textContent = label;
        state.textContent = label;
        seen.textContent = formatConnectorLastOnline(connectorSettings.status.last_online_at);
        dot.style.background = currentConnectorStatus === 'online' ? '#9dbcae' : '#c9b9ae';
        connectorIssueButton.textContent =
            currentConnectorStatus === 'not_configured' ? '生成 Connector 凭据' : '重新生成连接码';
        connectorRevokeButton.hidden = currentConnectorStatus === 'not_configured';
        setConnectorControlsDisabled(pending);
        setStatus(settingsFeedback, pending ? '正在处理 Connector 凭据……' : issueMessage);
    }

    function setHomeSettingsDisabled(disabled) {
        [
            settingsHomeName,
            settingsEnvironment,
            settingsClimate,
            settingsPauseAllWakeups,
            settingsVisitNotifications,
            settingsActivityNotifications,
            settingsSystemNotifications,
            settingsLoungeDuration,
            settingsInitialMessageCount,
            settingsChatMode,
            settingsActivityRoomWarmup,
        ].forEach((control) => {
            control.disabled = disabled;
        });
    }

    function applyHomeSettings(homeSettings, pending, issueMessage) {
        if (homeSettings.stage === 'loading') {
            setHomeSettingsDisabled(true);
            return;
        }
        if (homeSettings.stage === 'error') {
            setHomeSettingsDisabled(true);
            setStatus(settingsFeedback, homeSettings.message);
            return;
        }

        settingsHomeName.value = homeSettings.homeName;
        settingsEnvironment.value = homeSettings.environmentDescription || '';
        settingsClimate.value = homeSettings.climateType || '';
        settingsPauseAllWakeups.checked = homeSettings.pauseAllWakeups;
        settingsVisitNotifications.checked = homeSettings.visitRequestsAndInvitationsEnabled;
        settingsActivityNotifications.checked = homeSettings.activityInvitationsEnabled;
        settingsSystemNotifications.checked = homeSettings.importantSystemNotificationsEnabled;
        settingsLoungeDuration.value = String(homeSettings.defaultConnectionDurationMinutes);
        settingsInitialMessageCount.value = homeSettings.initialRecentActivityCount === null
            ? ''
            : String(homeSettings.initialRecentActivityCount);
        settingsChatMode.value = homeSettings.chatMode;
        settingsActivityRoomWarmup.checked = homeSettings.allowActivityRoomWarmup;
        settingsHomeName.dataset.savedValue = settingsHomeName.value;
        settingsEnvironment.dataset.savedValue = settingsEnvironment.value;
        settingsClimate.dataset.savedValue = settingsClimate.value;
        settingsPauseAllWakeups.dataset.savedValue = String(settingsPauseAllWakeups.checked);
        settingsVisitNotifications.dataset.savedValue = String(settingsVisitNotifications.checked);
        settingsActivityNotifications.dataset.savedValue = String(settingsActivityNotifications.checked);
        settingsSystemNotifications.dataset.savedValue = String(settingsSystemNotifications.checked);
        settingsLoungeDuration.dataset.savedValue = settingsLoungeDuration.value;
        settingsInitialMessageCount.dataset.savedValue = settingsInitialMessageCount.value;
        settingsChatMode.dataset.savedValue = settingsChatMode.value;
        settingsActivityRoomWarmup.dataset.savedValue = String(settingsActivityRoomWarmup.checked);
        document.querySelector('.home-name').textContent = homeSettings.homeName;
        document.querySelector('.home-weather-summary').lastChild.textContent = homeSettings.weatherSummary;
        setHomeSettingsDisabled(pending);

        if (pending) {
            settingsWasSaving = settingsSaveScope || 'home';
            setStatus(
                settingsFeedback,
                settingsWasSaving === 'home' ? '正在保存家园设置……' : '正在保存偏好设置……',
            );
        } else if (settingsWasSaving) {
            setStatus(
                settingsFeedback,
                issueMessage || (settingsWasSaving === 'home' ? '家园设置已保存' : '偏好设置已保存'),
            );
            settingsSaveScope = '';
            settingsWasSaving = '';
        } else if (issueMessage) {
            setStatus(settingsFeedback, issueMessage);
        }
    }

    function renderSharedMemeList() {
        const query = sharedMemesSearch.value.trim().toLowerCase();
        const matching = query
            ? visibleSharedMemes.filter((meme) =>
                [meme.term, meme.meaning, meme.usage, ...meme.aliases, ...meme.keywords]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(query)))
            : visibleSharedMemes;
        sharedMemesList.replaceChildren(...matching.map((meme) => {
            const button = document.createElement('button');
            button.className = 'candidate2-shared-meme-row';
            button.type = 'button';
            button.dataset.memeId = String(meme.meme_id);
            const term = document.createElement('strong');
            term.textContent = meme.term;
            const meta = document.createElement('small');
            meta.textContent = [meme.category, meme.type].filter(Boolean).join(' · ') || '未分类';
            button.append(term, meta);
            button.addEventListener('click', () => {
                sendAction({ type: 'shared-meme-open', memeId: meme.meme_id });
            });
            return button;
        }));
        setStatus(sharedMemesStatus, matching.length === 0 ? '没有找到匹配的共享梗。' : '');
    }

    function applySharedMemeDetail(detail) {
        if (detail.stage === 'idle') {
            sharedMemeDetail.hidden = true;
            return;
        }
        sharedMemeDetail.hidden = false;
        if (detail.stage === 'loading') {
            document.querySelector('.shared-meme-detail-term').textContent = '正在读取……';
            document.querySelector('.shared-meme-detail-meta').textContent = '';
            return;
        }
        if (detail.stage === 'error') {
            document.querySelector('.shared-meme-detail-term').textContent = '读取失败';
            document.querySelector('.shared-meme-detail-meta').textContent = detail.message;
            return;
        }
        const meme = detail.data.meme;
        document.querySelector('.shared-meme-detail-term').textContent = meme.term;
        document.querySelector('.shared-meme-detail-meta').textContent =
            [meme.category, meme.type].filter(Boolean).join(' · ') || '未分类';
        document.querySelector('.shared-meme-detail-meaning').textContent = meme.meaning || '—';
        document.querySelector('.shared-meme-detail-usage').textContent = meme.usage || '—';
        document.querySelector('.shared-meme-detail-aliases').textContent = meme.aliases.join('、') || '—';
        document.querySelector('.shared-meme-detail-examples').textContent = meme.examples.join('\\n') || '—';
        document.querySelector('.shared-meme-detail-keywords').textContent = meme.keywords.join('、') || '—';
        document.querySelector('.shared-meme-detail-origin').textContent = meme.origin || '—';
        document.querySelector('.shared-meme-detail-notes').textContent = meme.notes || '—';
        sharedMemeDetail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function applySharedMemeState(list, detail, createPending, createMessage) {
        const settingsCount = document.querySelector('.settings-meme-count');
        const settingsSync = document.querySelector('.settings-meme-sync');
        sharedMemeSubmitButton.disabled = createPending;
        setStatus(sharedMemeFormStatus, createPending ? '正在提交……' : createMessage);
        applySharedMemeDetail(detail);

        if (list.stage === 'idle') {
            settingsCount.textContent = '尚未读取';
            settingsSync.textContent = '点击 View 读取';
            visibleSharedMemes = [];
            sharedMemesList.replaceChildren();
            setStatus(sharedMemesStatus, '');
            return;
        }
        if (list.stage === 'loading') {
            settingsCount.textContent = '读取中';
            settingsSync.textContent = '正在核验资格';
            setStatus(sharedMemesStatus, '正在读取共享梗库……');
            return;
        }
        if (list.stage === 'error') {
            settingsCount.textContent = '读取失败';
            settingsSync.textContent = list.message;
            visibleSharedMemes = [];
            sharedMemesList.replaceChildren();
            setStatus(sharedMemesStatus, list.message);
            return;
        }
        visibleSharedMemes = list.data.memes;
        settingsCount.textContent = String(list.data.library.entry_count);
        settingsSync.textContent = '版本 ' + list.data.library.library_version;
        document.querySelector('.shared-memes-summary').textContent =
            list.data.library.entry_count + ' 条共享内容 · 版本 ' + list.data.library.library_version;
        renderSharedMemeList();
    }

    function openSharedMemePage(showForm) {
        showScreen('screen-shared-memes');
        sharedMemeAddForm.hidden = !showForm;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会读取或新增真实共享梗');
            return;
        }
        sendAction({ type: 'shared-memes-open' });
        if (showForm) sharedMemeAddForm.elements.term.focus();
    }

    function optionalSharedMemeText(formData, name) {
        const value = String(formData.get(name) || '').trim();
        return value || null;
    }

    function sharedMemeLines(formData, name) {
        return String(formData.get(name) || '')
            .split(/\\r?\\n/)
            .map((value) => value.trim())
            .filter(Boolean);
    }

    function saveHomeSetting(field, control) {
        if (control.value === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会保存真实家园设置');
            return;
        }
        settingsSaveScope = 'home';
        sendAction({ type: 'home-settings-save', field, value: control.value });
    }

    function saveNotificationPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'notification-preference-save', field, value });
    }

    function saveCommunityBooleanPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'community-connection-preference-save', field, value });
    }

    function saveCommunityNumberPreference(field, control) {
        if (!control.checkValidity()) {
            control.reportValidity();
            return;
        }
        if (control.value === control.dataset.savedValue) return;
        const value = control.value === '' ? null : Number(control.value);
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'community-connection-preference-save', field, value });
    }

    function saveCommunityChatMode(control) {
        if (control.value === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({
            type: 'community-connection-preference-save',
            field: 'chatMode',
            value: control.value,
        });
    }

    function showConnectorConfirmation(action) {
        connectorConfirmationAction = action;
        if (action === 'issue' && currentConnectorStatus === 'not_configured') {
            connectorConfirmationCopy.textContent = '生成后，连接码只显示这一次，请及时保存。';
            connectorConfirmButton.textContent = '确认生成';
        } else if (action === 'issue') {
            connectorConfirmationCopy.textContent = '重新生成后，旧连接码会立即失效。';
            connectorConfirmButton.textContent = '确认重新生成';
        } else {
            connectorConfirmationCopy.textContent = '停用后，当前 Connector 会断开，原连接码不能再用。';
            connectorConfirmButton.textContent = '确认停用';
        }
        connectorConfirmation.hidden = false;
    }

    function requestConnectorCredential(action) {
        clearConnectorConfirmation();
        clearOneTimeConnectorCredential();
        if (window.__doorbellCandidateDemo) {
            setStatus(settingsFeedback, '演示模式不会生成、换发或撤销真实凭据');
            return;
        }
        sendAction({ type: action === 'issue' ? 'connector-credential-issue' : 'connector-credential-revoke' });
    }

    async function copyConnectorText(value, successMessage) {
        if (!value) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const copyField = document.createElement('textarea');
                copyField.value = value;
                copyField.setAttribute('readonly', '');
                copyField.style.position = 'fixed';
                copyField.style.opacity = '0';
                document.body.append(copyField);
                copyField.select();
                const copied = document.execCommand('copy');
                copyField.remove();
                if (!copied) throw new Error('copy failed');
            }
            setStatus(settingsFeedback, successMessage);
        } catch {
            setStatus(settingsFeedback, '复制失败，请手动选择并复制');
        }
    }

    function showOneTimeConnectorCredential(connectorCredential, setupInstructions) {
        oneTimeConnectorSetupInstructions = setupInstructions;
        connectorCredentialValue.textContent = connectorCredential;
        connectorCredentialResult.hidden = false;
        setStatus(settingsFeedback, '新凭据只显示这一次，离开设置页后会清除。');
    }

    function resetFarmConfirmation() {
        currentFarmName = '';
        currentFarmDoorplate = '';
        confirmFarmInput.checked = false;
        farmConfirmation.hidden = true;
        updateProfileSubmitState();
    }

    function updateProfileSubmitState() {
        profileSubmitButton.disabled = profileForm.dataset.pending === 'true';
    }

    function applyIdentity(identity) {
        const doorplate = 'DB-' + identity.farmDoorplate;
        document.querySelector('.permit-resident-name').textContent = identity.residentName;
        document.querySelector('.permit-home-name').textContent = identity.homeName;
        document.querySelector('.permit-doorplate-value').textContent = doorplate;
        document.querySelector('.home-name').textContent = identity.homeName;
        document.querySelector('.profile-resident-name').textContent = identity.residentName;
        document.querySelector('.profile-relation-core-name').textContent = identity.residentName;
        document.querySelector('.profile-home-name').textContent = identity.homeName;
        document.querySelector('.profile-doorplate').textContent = doorplate;
        document.querySelector('.profile-farm-doorplate').textContent = identity.farmDoorplate;
        document.querySelector('.settings-home-name').value = identity.homeName;
    }

    function setDemoVisibility(emptySelector, demoSelector, enabled) {
        const emptyElement = document.querySelector(emptySelector);
        const demoElement = document.querySelector(demoSelector);
        if (emptyElement) emptyElement.hidden = enabled;
        if (demoElement) demoElement.hidden = !enabled;
    }

    function buildGlimmerTrackFigure(animal) {
        const figure = document.createElement('figure');
        figure.dataset.glimmerAnimalId = animal.revealed ? animal.id : animal.layoutId;
        figure.dataset.glimmerDragTarget = 'group';
        const visual = document.createElement('span');
        visual.className = 'candidate2-glimmer-animal-visual';
        if (animal.revealed === false) {
            visual.classList.add('is-mystery');
            visual.setAttribute('role', 'img');
            visual.setAttribute('aria-label', '未揭晓动物');
            visual.textContent = '?';
        } else {
            const trackAsset = glimmerTrackAssets[animal.id];
            if (animal.atlas === 'glimmer.variants' && animal.set && animal.spriteIndex != null) {
                const column = animal.spriteIndex % 5;
                const row = Math.floor(animal.spriteIndex / 5);
                visual.classList.add('candidate2-glimmer-variant-visual');
                visual.setAttribute('role', 'img');
                visual.setAttribute('aria-label', animal.name + '异色动物图');
                visual.style.setProperty(
                    '--glimmer-variant-sheet',
                    "url('/lingye/glimmer/variants/variant-" + animal.set + ".webp')",
                );
                visual.style.setProperty('--glimmer-variant-x', column * 25 + '%');
                visual.style.setProperty('--glimmer-variant-y', row * 100 / 3 + '%');
            } else if (trackAsset) {
                const image = document.createElement('img');
                image.src = trackAsset;
                image.alt = animal.name + '异色动物图';
                image.width = 200;
                image.height = 200;
                image.draggable = false;
                visual.append(image);
            } else {
                visual.classList.add('is-mystery');
                visual.setAttribute('role', 'img');
                visual.setAttribute('aria-label', '已揭晓动物');
                visual.textContent = '?';
            }
        }
        figure.append(visual);
        if (animal.revealed) {
            const caption = document.createElement('figcaption');
            const name = document.createElement('strong');
            name.textContent = animal.name;
            caption.append(name);
            figure.append(caption);
        }
        return figure;
    }

    function buildGlimmerVariantFigure(variant) {
        const figure = document.createElement('figure');
        const visual = document.createElement('span');
        const unlocked = variant.unlocked !== false;
        const column = variant.spriteIndex % 5;
        const row = Math.floor(variant.spriteIndex / 5);
        visual.className = 'candidate2-glimmer-animal-visual candidate2-glimmer-variant-visual';
        visual.setAttribute('role', 'img');
        figure.dataset.glimmerUnlocked = String(unlocked);
        visual.setAttribute('aria-label', variant.name + '异色动物图' + (unlocked ? '' : '（未解锁）'));
        if (variant.atlas !== undefined && variant.atlas !== 'glimmer.variants') {
            visual.classList.add('is-mystery');
            visual.textContent = '?';
        } else {
            visual.style.setProperty(
                '--glimmer-variant-sheet',
                "url('/lingye/glimmer/variants/variant-" + variant.set + ".webp')",
            );
        }
        visual.style.setProperty('--glimmer-variant-x', column * 25 + '%');
        visual.style.setProperty('--glimmer-variant-y', row * 100 / 3 + '%');
        const caption = document.createElement('figcaption');
        const name = document.createElement('strong');
        name.textContent = variant.name;
        caption.append(name);
        figure.append(visual, caption);
        return figure;
    }

    const togetherCoverAssets = {
        'together.same-kitchen-opening': '/lingye/together/same-kitchen-opening.jpg',
        'together.same-kitchen-old-recipe': '/lingye/together/same-kitchen-old-recipe.jpg',
        'together.same-kitchen-undelivered-letters': '/lingye/together/same-kitchen-undelivered-letters.jpg',
        'together.same-kitchen-service': '/lingye/together/same-kitchen-service.jpg',
        'together.same-kitchen-final-arrangement': '/lingye/together/same-kitchen-final-arrangement.jpg',
        'together.same-kitchen-ending-one-sign': '/lingye/together/same-kitchen-ending-one-sign.jpg',
        'together.same-kitchen-ending-next-door': '/lingye/together/same-kitchen-ending-next-door.jpg',
        'together.same-kitchen-ending-public-kitchen': '/lingye/together/same-kitchen-ending-public-kitchen.jpg',
    };

    function setTogetherText(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value == null ? '' : String(value);
    }

    function renderTogetherData(data) {
        const cover = document.querySelector('.candidate2-together-cover-image');
        const coverAsset = data && togetherCoverAssets[data.artFile];
        if (cover) {
            cover.hidden = !coverAsset;
            if (coverAsset) {
                cover.src = coverAsset;
                cover.alt = data.title ? '《' + data.title + '》活动封面' : '铃野共行活动封面';
            } else {
                cover.removeAttribute('src');
                cover.alt = '';
            }
        }

        const currentContent = document.querySelector('.candidate2-together-current-content');
        const liveEmpty = document.querySelector('.candidate2-together-live-empty');
        const taskList = document.querySelector('.candidate2-together-task-list');
        const choiceList = document.querySelector('.candidate2-together-choice-list');
        if (!data) {
            if (currentContent) currentContent.hidden = true;
            if (liveEmpty) liveEmpty.hidden = false;
            if (taskList) taskList.replaceChildren();
            if (choiceList) choiceList.replaceChildren();
            setTogetherText('.candidate2-together-current-kicker', '');
            setTogetherText('.candidate2-together-current-title', '');
            setTogetherText('.candidate2-together-current-status', '');
            setTogetherText('.candidate2-together-stage-name', '');
            setTogetherText('.candidate2-together-current-copy', '');
            setTogetherText('.candidate2-together-task-kicker', '');
            setTogetherText('.candidate2-together-task-title', '');
            setTogetherText('.candidate2-together-choice-kicker', '');
            setTogetherText('.candidate2-together-choice-title', '');
            setTogetherText('.candidate2-together-choice-copy', '');
            setTogetherText('.candidate2-together-rules-title', '');
            setTogetherText('.candidate2-together-rules-copy', '');
            const emptyStageRail = document.querySelector('.candidate2-together-stage-rail');
            if (emptyStageRail) emptyStageRail.replaceChildren();
            return;
        }

        if (liveEmpty) liveEmpty.hidden = true;
        if (currentContent) currentContent.hidden = false;
        setTogetherText('.candidate2-together-current-kicker', '第 ' + data.round + ' 期');
        setTogetherText('.candidate2-together-current-title', data.title);
        setTogetherText('.candidate2-together-current-status', data.status);
        setTogetherText('.candidate2-together-stage-name', data.stageName);
        setTogetherText(
            '.candidate2-together-current-copy',
            data.currentSummary
                || (data.currentTask ? data.currentTask.opening : '当前没有可读取的阶段任务。'),
        );
        setTogetherText('.candidate2-together-task-kicker', '当前阶段');
        setTogetherText('.candidate2-together-task-title', '任务链');
        setTogetherText('.candidate2-together-choice-kicker', '公共选择');
        setTogetherText(
            '.candidate2-together-choice-title',
            data.currentChoice ? data.currentChoice.title : '当前没有公共选择',
        );
        setTogetherText(
            '.candidate2-together-choice-copy',
            data.currentChoice
                ? (data.currentChoice.counts
                    ? '这里只读展示全服实际选项与票数；Human 不替小机提交行动。'
                    : '这里只读展示全服实际选项；Human 不替小机提交行动。')
                : '当前阶段没有待处理的公共选择。',
        );
        setTogetherText('.candidate2-together-rules-title', '共行说明');
        setTogetherText(
            '.candidate2-together-rules-copy',
            '全服共用同一条实际故事线。Human 页面只读剧情、插图、任务进度、公共选择与往期档案。',
        );

        const stageRail = document.querySelector('.candidate2-together-stage-rail');
        if (stageRail) {
            stageRail.replaceChildren();
            for (let index = 1; index <= data.stageCount; index += 1) {
                const stage = document.createElement('span');
                stage.textContent = String(index);
                if (index === data.stageIndex) stage.classList.add('is-current');
                stageRail.append(stage);
                if (index < data.stageCount) stageRail.append(document.createElement('i'));
            }
        }

        if (taskList) {
            taskList.replaceChildren(...(data.tasks || []).map((task, index) => {
                const article = document.createElement('article');
                const mark = document.createElement('span');
                mark.className = 'candidate2-task-mark';
                mark.textContent = String(index + 1);
                const copy = document.createElement('div');
                const name = document.createElement('strong');
                name.textContent = task.name;
                const detail = document.createElement('p');
                detail.textContent = task.detail;
                copy.append(name, detail);
                const status = document.createElement('small');
                status.textContent = task.progress ? task.status + ' · ' + task.progress : task.status;
                article.append(mark, copy, status);
                return article;
            }));
        }

        if (choiceList) {
            const choice = data.currentChoice;
            choiceList.replaceChildren(
                ...(choice
                    ? Object.entries(choice.options).map(([option, label]) => {
                        const row = document.createElement('div');
                        const letter = document.createElement('b');
                        letter.textContent = option;
                        const text = document.createElement('span');
                        const count = choice.counts && choice.counts[option];
                        text.textContent = count == null ? label : label + '（' + count + '/3）';
                        row.append(letter, text);
                        return row;
                    })
                    : []),
            );
        }
    }

    const glimmerPage = document.querySelector('.candidate2-glimmer-page');
    const glimmerTrackList = document.querySelector('.candidate2-glimmer-tracks-demo');
    const glimmerAnimalLayoutWidth = 292;
    let glimmerAnimalEditorEnabled = false;
    let glimmerAnimalPositions = {
        duck_peach: { x: 0, y: 0 },
        mystery: { x: 0, y: 0 },
        silk_moth_mist: { x: 0, y: 0 },
        turkey_maple: { x: 0, y: 0 },
    };
    let glimmerAnimalDrag = null;

    function applyGlimmerAnimalPositions(positions) {
        glimmerAnimalPositions = positions;
        glimmerTrackList.querySelectorAll('[data-glimmer-animal-id]').forEach((figure) => {
            const position = positions[figure.dataset.glimmerAnimalId] || { x: 0, y: 0 };
            figure.style.setProperty('--glimmer-group-x', position.x / glimmerAnimalLayoutWidth * 100 + 'cqw');
            figure.style.setProperty('--glimmer-group-y', position.y / glimmerAnimalLayoutWidth * 100 + 'cqw');
        });
    }

    function finishGlimmerAnimalDrag() {
        if (!glimmerAnimalDrag) return;
        glimmerAnimalDrag.target.classList.remove('is-dragging');
        sendAction({
            type: 'glimmer-animal-layout-change',
            positions: glimmerAnimalPositions,
        });
        glimmerAnimalDrag = null;
    }

    glimmerTrackList.addEventListener('pointerdown', (event) => {
        if (!glimmerAnimalEditorEnabled) return;
        const figure = event.target.closest('[data-glimmer-animal-id][data-glimmer-drag-target="group"]');
        if (!figure) return;
        const animalId = figure.dataset.glimmerAnimalId;
        const origin = glimmerAnimalPositions[animalId] || { x: 0, y: 0 };
        glimmerAnimalDrag = {
            animalId,
            originX: origin.x,
            originY: origin.y,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            target: figure,
        };
        figure.classList.add('is-dragging');
        figure.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    glimmerTrackList.addEventListener('pointermove', (event) => {
        if (!glimmerAnimalDrag || glimmerAnimalDrag.pointerId !== event.pointerId) return;
        const layoutScale = glimmerTrackList.clientWidth / glimmerAnimalLayoutWidth || 1;
        const position = {
            x: Math.round((glimmerAnimalDrag.originX + (event.clientX - glimmerAnimalDrag.startX) / layoutScale) * 10) / 10,
            y: Math.round((glimmerAnimalDrag.originY + (event.clientY - glimmerAnimalDrag.startY) / layoutScale) * 10) / 10,
        };
        applyGlimmerAnimalPositions({
            ...glimmerAnimalPositions,
            [glimmerAnimalDrag.animalId]: position,
        });
    });

    glimmerTrackList.addEventListener('pointerup', finishGlimmerAnimalDrag);
    glimmerTrackList.addEventListener('pointercancel', finishGlimmerAnimalDrag);

    function formatGlimmerEventTimestamp(value) {
        const parts = new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(value));
        const part = (type) => parts.find((item) => item.type === type)?.value || '—';
        return { date: part('month') + '/' + part('day'), time: part('hour') + ':' + part('minute') };
    }

    function recentGlimmerEvents(events) {
        return [...events]
            .filter((eventItem) => Number.isFinite(Date.parse(eventItem.at)))
            .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
            .slice(0, 10);
    }

    function renderGlimmerData(glimmer) {
        const enabled = Boolean(glimmer);
        const tracks = glimmer && Array.isArray(glimmer.tracks) ? glimmer.tracks : [];
        const events = recentGlimmerEvents(
            glimmer && Array.isArray(glimmer.events) ? glimmer.events : [],
        );
        const variants = glimmer && Array.isArray(glimmer.variants) ? glimmer.variants : [];
        const encounters = glimmer && Array.isArray(glimmer.encounters) ? glimmer.encounters : [];
        const achievements = glimmer && Array.isArray(glimmer.achievements) ? glimmer.achievements : [];
        setDemoVisibility('.candidate2-glimmer-feature-empty', '.candidate2-glimmer-feature-demo', Boolean(glimmer && glimmer.task));
        setDemoVisibility('.candidate2-glimmer-tracks-empty', '.candidate2-glimmer-tracks-demo', tracks.length > 0);
        setDemoVisibility('.candidate2-glimmer-events-empty', '.candidate2-glimmer-events-demo', events.length > 0);
        setDemoVisibility('.candidate2-glimmer-variants-empty', '.candidate2-glimmer-variants-demo', variants.length > 0);
        setDemoVisibility('.candidate2-glimmer-encounters-empty', '.candidate2-glimmer-encounters-demo', encounters.length > 0);
        setDemoVisibility('.candidate2-glimmer-summary-empty', '.candidate2-glimmer-summary-demo', Boolean(glimmer));
        setDemoVisibility('.candidate2-glimmer-achievements-empty', '.candidate2-glimmer-achievements-demo', achievements.length > 0);
        document.querySelector('.candidate2-glimmer-opening-value').textContent = glimmer ? glimmer.openingHours : '—';
        document.querySelector('.candidate2-glimmer-status-value').textContent = glimmer ? glimmer.status : '—';
        document.querySelector('.candidate2-glimmer-trace-value').textContent = glimmer ? glimmer.traceCount : '—';
        const glimmerEventList = document.querySelector('.candidate2-glimmer-events-demo');
        const glimmerVariantList = document.querySelector('.candidate2-glimmer-variants-demo');
        const glimmerEncounterList = document.querySelector('.candidate2-glimmer-encounters-demo');
        const glimmerAchievementList = document.querySelector('.candidate2-glimmer-achievements-demo');
        glimmerTrackList.replaceChildren();
        glimmerEventList.replaceChildren();
        glimmerVariantList.replaceChildren();
        glimmerEncounterList.replaceChildren();
        glimmerAchievementList.replaceChildren();
        document.querySelector('.candidate2-glimmer-task-title').textContent = '';
        document.querySelector('.candidate2-glimmer-task-detail').textContent = '';
        document.querySelector('.candidate2-glimmer-task-progress').textContent = '';
        document.querySelector('.candidate2-glimmer-progress-track i').style.width = '0%';
        document.querySelector('.candidate2-glimmer-summary-encounters').textContent = '';
        document.querySelector('.candidate2-glimmer-summary-variants').textContent = '';
        document.querySelector('.candidate2-glimmer-summary-coops').textContent = '';
        if (!enabled) return;

        if (glimmer.task) {
            document.querySelector('.candidate2-glimmer-task-title').textContent = glimmer.task.title;
            document.querySelector('.candidate2-glimmer-task-detail').textContent = glimmer.task.detail;
            document.querySelector('.candidate2-glimmer-task-progress').textContent =
                glimmer.task.current + ' / ' + glimmer.task.total + ' 家';
            const glimmerProgress = glimmer.task.total > 0
                ? Math.max(0, Math.min(100, glimmer.task.current / glimmer.task.total * 100))
                : 0;
            document.querySelector('.candidate2-glimmer-progress-track i').style.width = glimmerProgress + '%';
        }
        glimmerTrackList.replaceChildren(...tracks.map(buildGlimmerTrackFigure));
        applyGlimmerAnimalPositions(glimmerAnimalPositions);
        glimmerEventList.replaceChildren(...events.map((eventItem) => {
            const item = document.createElement('li');
            const time = document.createElement('time');
            const timestamp = formatGlimmerEventTimestamp(eventItem.at);
            time.dateTime = eventItem.at;
            const date = document.createElement('span');
            date.textContent = timestamp.date;
            const clock = document.createElement('small');
            clock.textContent = timestamp.time;
            time.append(date, clock);
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = eventItem.title;
            copy.append(title);
            item.append(time, copy);
            return item;
        }));
        glimmerVariantList.replaceChildren(...variants.map(buildGlimmerVariantFigure));
        glimmerEncounterList.replaceChildren(...encounters.map((encounter) => {
            const item = document.createElement('li');
            const name = document.createElement('strong');
            name.textContent = encounter.name;
            const status = document.createElement('span');
            status.textContent = encounter.status;
            item.append(name, status);
            return item;
        }));
        document.querySelector('.candidate2-glimmer-summary-encounters').textContent = glimmer.stats.encounters + ' 次';
        document.querySelector('.candidate2-glimmer-summary-variants').textContent = glimmer.stats.variants + ' 种';
        document.querySelector('.candidate2-glimmer-summary-coops').textContent = glimmer.stats.coops + ' 次';
        glimmerAchievementList.replaceChildren(...achievements.map((achievement) => {
            const article = document.createElement('article');
            const copy = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = achievement.name;
            const reward = document.createElement('small');
            reward.textContent = achievement.reward;
            copy.append(name, reward);
            const state = document.createElement('div');
            const progress = document.createElement('span');
            progress.textContent = achievement.progress;
            const status = document.createElement('span');
            status.textContent = achievement.status;
            state.append(progress, status);
            article.append(copy, state);
            return article;
        }));
    }

    function applyDemoContent(demo) {
        const content = demo && demo.content;
        const enabled = Boolean(content);
        const mailboxUnreadCount = Number.isFinite(content && content.mailboxUnreadCount)
            ? content.mailboxUnreadCount
            : 0;
        homeMailboxUnreadCount = mailboxUnreadCount;
        syncHomeMailboxUnreadBadge();
        const mailboxMessages = content && Array.isArray(content.mailboxMessages)
            ? content.mailboxMessages
            : [];
        homeMailboxMessages = mailboxMessages.map((message) => ({ ...message }));
        homeMailboxCategory = 'all';
        homeMailboxPage = 1;
        renderHomeMailbox();
        setDemoVisibility('.home-doorbell-empty', '.home-doorbell-demo', enabled);
        setDemoVisibility('.home-visitors-empty', '.candidate2-demo-visitors', enabled);
        setDemoVisibility('.profile-relationships-empty', '.candidate2-demo-relationship', enabled);
        setDemoVisibility('.candidate2-profile-empty', '.candidate2-demo-activity-list', enabled);
        setDemoVisibility('.candidate2-memorial-empty', '.candidate2-memorial-demo', enabled);
        const glimmerEditor = demo && demo.glimmerAnimalEditor;
        glimmerAnimalEditorEnabled = Boolean(glimmerEditor && glimmerEditor.enabled);
        glimmerPage.classList.toggle('is-animal-editor', glimmerAnimalEditorEnabled);
        if (glimmerEditor) {
            applyGlimmerAnimalPositions(glimmerEditor.positions);
        }
        const glimmer = content && content.glimmer;
        renderGlimmerData(glimmer);
        renderTogetherData(content && content.together);
        if (!content) return;

        document.querySelector('.home-doorbell-count').textContent = String(content.doorbellRequests.length).padStart(2, '0');
        const requestList = document.querySelector('.candidate2-demo-request-list');
        requestList.replaceChildren(...content.doorbellRequests.map((request) => {
            const item = document.createElement('li');
            item.textContent = request;
            return item;
        }));

        const visitors = document.querySelector('.candidate2-demo-visitors');
        visitors.replaceChildren(...content.visitors.map((visitor) => {
            const item = document.createElement('span');
            item.className = 'candidate2-demo-visitor';
            item.textContent = visitor.name;
            const tones = { sky: 'var(--sky-blue)', sand: 'var(--warm-sand)', pink: 'var(--soft-pink)' };
            item.style.setProperty('--visitor-tone', tones[visitor.tone] || 'var(--sky-blue)');
            return item;
        }));

        const relationNodes = document.querySelectorAll('.candidate2-demo-relation-node');
        relationNodes.forEach((node, index) => {
            const relation = content.relationships[index];
            node.querySelector('strong').textContent = relation ? relation.name : '—';
            node.querySelector('small').textContent = relation ? relation.detail : '';
            const editorRow = relationshipEditor.querySelector('[data-relation-index="' + index + '"]');
            editorRow.querySelector('strong').textContent = relation ? relation.name : '—';
            editorRow.dataset.detail = relation ? relation.detail : '';
        });
        document.querySelector('.candidate2-demo-relationship-summary').textContent =
            '认识 ' + content.relationships.length + ' 位邻居';

        const settings = content.settings;
        currentConnectorStatus = 'online';
        document.querySelector('.settings-connection-summary').textContent = '两项连接正常';
        document.querySelector('.settings-connector-state').textContent = settings.connectorState;
        document.querySelector('.settings-connector-seen').textContent = '最近连接 ' + settings.connectorLastSeen;
        document.querySelector('.settings-wake-state').textContent = settings.wakeBridgeState;
        document.querySelector('.settings-connector-dot').style.background = '#9dbcae';
        document.querySelector('.settings-wake-dot').style.background = '#9dbcae';
        document.querySelector('.settings-environment').value = content.environmentDescription;
        document.querySelector('.settings-climate').value = settings.climateType;
        document.querySelector('.settings-lounge-duration').value = String(settings.loungeDurationMinutes);
        document.querySelector('.settings-initial-message-count').value = String(settings.initialMessageCount);
        document.querySelector('.settings-meme-count').textContent = String(settings.sharedMemeCount);
        document.querySelector('.settings-meme-sync').textContent = '最近同步 ' + settings.sharedMemeLastSync;
        connectorIssueButton.textContent = '重新生成连接码';
        connectorRevokeButton.hidden = false;
        setConnectorControlsDisabled(false);
        const activityList = document.querySelector('.candidate2-demo-activity-list');
        const visibleActivities = content.activities.slice(0, 20);
        activityList.replaceChildren(...visibleActivities.map((activity, index) => {
            const row = document.createElement('div');
            row.className = 'candidate2-demo-activity is-collapsed';
            row.style.setProperty('--activity-tone', ['var(--soft-pink)', 'var(--sky-blue)', 'var(--warm-sand)', '#D5E6DF'][index % 4]);
            const icon = document.createElement('span');
            icon.textContent = activity.icon;
            const text = document.createElement('span');
            text.textContent = activity.text;
            const time = document.createElement('time');
            time.textContent = activity.time;
            row.append(icon, text, time);
            return row;
        }));
        const moreButton = document.getElementById('profile-activity-more');
        moreButton.hidden = visibleActivities.length <= 4;
        moreButton.dataset.expanded = 'false';
        moreButton.textContent = 'More';
        relationshipEditButton.hidden = content.relationships.length === 0;
    }

    function normalizeLiveGlimmer(read) {
        const data = read && read.data;
        if (!data) return null;
        return {
            openingHours: data.open ? '开放中' : '未开放',
            status: data.status,
            traceCount: data.tracks.length + ' 条',
            task: data.cooperation ? {
                title: data.cooperation.event.name,
                detail: data.cooperation.event.requirement,
                current: data.cooperation.progress.current,
                total: data.cooperation.progress.target,
            } : null,
            tracks: data.tracks.map((track) => track.revealed && track.variant ? {
                revealed: true,
                id: track.variant.id,
                name: track.variant.name,
                atlas: track.variant.atlas,
                set: track.variant.set,
                spriteIndex: track.variant.sprite_index,
            } : { revealed: false, layoutId: 'mystery' }),
            events: data.events.map((eventItem) => ({
                at: eventItem.at,
                title: eventItem.text,
            })),
            variants: data.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
                atlas: variant.atlas,
                set: variant.set,
                spriteIndex: variant.sprite_index,
                unlocked: variant.unlocked,
            })),
            encounters: data.encounters.map((encounter) => ({
                id: encounter.id,
                name: encounter.name,
                status: encounter.seen ? '已遇见' : '未遇见',
            })),
            stats: {
                coops: data.summary.cooperations,
                encounters: data.summary.encounters,
                variants: data.summary.variants,
            },
            achievements: data.achievements.map((achievement) => ({
                id: achievement.id,
                name: achievement.name,
                progress: achievement.progress.current + ' / ' + achievement.progress.target,
                reward: achievement.reward.coins + ' 金 + ' + achievement.reward.silver + ' 银',
                status: achievement.rewarded ? '已达成' : '未达成',
            })),
        };
    }

    function normalizeLiveTogether(read) {
        const data = read && read.data;
        if (!data) return null;
        const currentTask = data.current_task ? {
            contributors: [],
            name: data.current_task.title,
            opening: data.current_task.text,
            progress: data.current_task.target > 0
                ? Math.round(data.current_task.progress / data.current_task.target * 100)
                : 0,
        } : null;
        let currentSummary = currentTask ? currentTask.opening : null;
        if (!currentSummary && data.ending) currentSummary = data.ending.text;
        if (!currentSummary && data.cooldown) {
            currentSummary = [data.cooldown.text, data.cooldown.ready_text].filter(Boolean).join(' · ');
        }
        return {
            artFile: data.art_asset_key,
            currentChoice: data.current_choice ? {
                counts: data.current_choice.counts,
                index: data.current_choice.index,
                options: Object.fromEntries(data.current_choice.options.map((option) => [option.key, option.label])),
                title: data.current_choice.title,
            } : null,
            currentTask,
            currentSummary,
            stageCount: data.stage.total,
            stageIndex: data.stage.index,
            stageName: data.stage.name,
            tasks: data.current_task ? [{
                detail: data.current_task.text,
                name: data.current_task.title,
                progress: data.current_task.progress + ' / ' + data.current_task.target,
                status: data.phase === 'task' ? '进行中' : data.status,
            }] : [],
            routeName: data.story_id,
            round: data.round,
            status: data.status,
            title: data.title,
        };
    }

    function applyLiveGlimmerState(readState) {
        if (readState.stage === 'idle') {
            renderGlimmerData(null);
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '进入后读取当前协作';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '进入后读取真实的全服协作任务。';
            return;
        }
        if (readState.stage === 'loading') {
            showScreen('screen-lingye-glimmer');
            renderGlimmerData(null);
            document.querySelector('.candidate2-glimmer-status-value').textContent = '读取中';
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '正在读取当前协作';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '正在读取真实的全服协作任务。';
            return;
        }
        if (readState.stage === 'ready') {
            renderGlimmerData(normalizeLiveGlimmer(readState.data));
            return;
        }
        renderGlimmerData(null);
        if (readState.stage === 'empty') {
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '当前没有流光原野数据';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '稍后再进入这里读取全服协作状态。';
            return;
        }
        if (readState.stage === 'error') {
            document.querySelector('.candidate2-glimmer-status-value').textContent = '读取失败';
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '流光原野暂时不可用';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = readState.message;
        }
    }

    function applyLiveTogetherState(readState) {
        if (readState.stage === 'idle') {
            renderTogetherData(null);
            setTogetherText('.candidate2-together-live-empty', '进入后读取当前铃野共行状态。');
            return;
        }
        if (readState.stage === 'loading') {
            showScreen('screen-lingye-together');
            renderTogetherData(null);
            setTogetherText('.candidate2-together-live-empty', '正在读取当前铃野共行状态。');
            return;
        }
        if (readState.stage === 'ready') {
            const data = normalizeLiveTogether(readState.data);
            renderTogetherData(data);
            if (!data) setTogetherText('.candidate2-together-live-empty', '当前没有铃野共行状态。');
            return;
        }
        renderTogetherData(null);
        setTogetherText(
            '.candidate2-together-live-empty',
            readState.stage === 'empty' ? '当前没有铃野共行状态。' : readState.message,
        );
    }

    function applyLiveLingyeState(lingye) {
        if (!lingye) return;
        applyLiveGlimmerState(lingye.glimmer);
        applyLiveTogetherState(lingye.together);
    }

    function closeRelationshipEditor() {
        relationshipEditor.hidden = true;
        document.querySelector('.candidate2-demo-relationship').hidden = false;
        relationshipEditButton.textContent = 'Edit';
    }

    function openRelationshipEditor() {
        if (!window.__doorbellCandidateDemo || relationshipEditButton.hidden) {
            showCandidateNotice('暂无可编辑的来往数据');
            return;
        }
        relationshipEditor.querySelectorAll('[data-relation-index]').forEach((row) => {
            const select = row.querySelector('select');
            const input = row.querySelector('input');
            select.value = '还行';
            input.value = '';
            input.hidden = true;
        });
        document.querySelector('.candidate2-demo-relationship').hidden = true;
        relationshipEditor.hidden = false;
        relationshipEditButton.textContent = 'Editing';
    }

    function applyDemoRegistrationPrefill(prefill) {
        if (!prefill) return;
        document.getElementById('resident-name').value = prefill.residentName;
        document.getElementById('home-name').value = prefill.homeName;
        farmDoorplateInput.value = prefill.farmDoorplate;
        farmHumanUrlInput.value = prefill.farmHumanUrl;
        updateProfileSubmitState();
    }

    function showCredentialsStep() {
        credentialsForm.hidden = false;
        profileForm.hidden = true;
    }

    function showProfileStep() {
        credentialsForm.hidden = true;
        profileForm.hidden = false;
    }

    function applyFarmLookup(lookup) {
        if (lookup.stage === 'checking') {
            resetFarmConfirmation();
            setStatus(profileStatus, '正在查询农场……');
            farmLookupButton.disabled = true;
            return;
        }

        farmLookupButton.disabled = profileForm.dataset.pending === 'true';
        if (lookup.stage === 'error') {
            resetFarmConfirmation();
            setStatus(profileStatus, lookup.message);
            return;
        }

        if (lookup.stage === 'found') {
            currentFarmName = lookup.farmName;
            currentFarmDoorplate = lookup.doorplate;
            farmName.textContent = lookup.farmName;
            farmDoorplateResult.textContent = '门牌 ' + lookup.doorplate;
            confirmFarmInput.checked = false;
            farmConfirmation.hidden = false;
            setStatus(profileStatus, '请确认就是这个农场。');
            updateProfileSubmitState();
            return;
        }

        resetFarmConfirmation();
    }

    function completePermit() {
        window.clearTimeout(permitTimer);
        sendAction({ type: 'permit-complete' });
    }

    function schedulePermitCompletion() {
        window.clearTimeout(permitTimer);
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        permitTimer = window.setTimeout(completePermit, reducedMotion ? 0 : 700);
    }

    function applyRuntimeState(state, demo) {
        const previousStage = currentStage;
        currentStage = state.stage;
        window.__doorbellCandidateDemo = Boolean(demo);
        applyDemoContent(demo);
        if (!demo && state.stage === 'authenticated') {
            applyLiveLingyeState(state.lingye);
        }

        if (state.stage === 'checking-session') {
            showScreen('screen-login');
            showCredentialsStep();
            mainNav.style.display = 'none';
            setFormDisabled(credentialsForm, true);
            setStatus(credentialsStatus, '正在确认登录状态……');
            return;
        }

        if (state.stage === 'anonymous') {
            showScreen('screen-login');
            showCredentialsStep();
            mainNav.style.display = 'none';
            setFormDisabled(credentialsForm, state.pending);
            setStatus(credentialsStatus, state.issueMessage);
            farmHumanUrlInput.value = '';
            resetFarmConfirmation();
            return;
        }

        if (state.stage === 'registration-profile') {
            showScreen('screen-login');
            showProfileStep();
            mainNav.style.display = 'none';
            profileForm.dataset.pending = String(state.pending);
            setFormDisabled(profileForm, state.pending);
            applyFarmLookup(state.farmLookup);
            if (state.issueMessage) setStatus(profileStatus, state.issueMessage);
            applyDemoRegistrationPrefill(demo && demo.registrationPrefill);
            updateProfileSubmitState();
            return;
        }

        applyIdentity(state.identity);
        if (state.stage === 'issuing-permit') {
            farmHumanUrlInput.value = '';
            resetFarmConfirmation();
            mainNav.style.display = 'none';
            showScreen('screen-residency');
            if (previousStage !== 'issuing-permit') {
                schedulePermitCompletion();
            }
            return;
        }

        mainNav.style.display = 'flex';
        document.getElementById('settings-logout-button').disabled = state.pendingLogout;
        if (!demo) {
            applyConnectorSettings(
                state.connectorSettings,
                state.connectorControlPending,
                state.connectorControlIssueMessage,
            );
            applyHomeSettings(
                state.homeSettings,
                state.homeSettingsPending,
                state.homeSettingsIssueMessage,
            );
            applySharedMemeState(
                state.sharedMemes,
                state.sharedMemeDetail,
                state.sharedMemeCreatePending,
                state.sharedMemeCreateMessage,
            );
            document.querySelector('.settings-wake-state').textContent = '未集成';
        }
        setStatus(document.querySelector('.candidate2-profile-empty'), state.issueMessage || '暂无可读取的活动数据');
        if (previousStage !== 'authenticated') {
            const initialScreen = demo && demo.initialScreen ? demo.initialScreen : 'lounge';
            showScreen('screen-' + initialScreen);
        }
    }

    credentialsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        sendAction({
            type: 'credentials-submit',
            qqNumber: document.getElementById('qq-number').value,
            registrationCode: document.getElementById('registration-code').value,
        });
    });

    document.getElementById('profile-back-button').addEventListener('click', () => {
        showCredentialsStep();
        setStatus(credentialsStatus, '');
    });

    farmDoorplateInput.addEventListener('input', () => {
        resetFarmConfirmation();
        setStatus(profileStatus, '');
    });

    farmHumanUrlInput.addEventListener('input', updateProfileSubmitState);
    confirmFarmInput.addEventListener('change', updateProfileSubmitState);
    settingsHomeName.addEventListener('change', () => saveHomeSetting('homeName', settingsHomeName));
    settingsEnvironment.addEventListener('change', () => saveHomeSetting('environmentDescription', settingsEnvironment));
    settingsClimate.addEventListener('change', () => saveHomeSetting('climateType', settingsClimate));
    settingsPauseAllWakeups.addEventListener('change', () => saveNotificationPreference('pauseAllWakeups', settingsPauseAllWakeups));
    settingsVisitNotifications.addEventListener('change', () => saveNotificationPreference('visitRequestsAndInvitationsEnabled', settingsVisitNotifications));
    settingsActivityNotifications.addEventListener('change', () => saveNotificationPreference('activityInvitationsEnabled', settingsActivityNotifications));
    settingsSystemNotifications.addEventListener('change', () => saveNotificationPreference('importantSystemNotificationsEnabled', settingsSystemNotifications));
    settingsLoungeDuration.addEventListener('change', () => saveCommunityNumberPreference('defaultConnectionDurationMinutes', settingsLoungeDuration));
    settingsInitialMessageCount.addEventListener('change', () => saveCommunityNumberPreference('initialRecentActivityCount', settingsInitialMessageCount));
    settingsChatMode.addEventListener('change', () => saveCommunityChatMode(settingsChatMode));
    settingsActivityRoomWarmup.addEventListener('change', () => saveCommunityBooleanPreference('allowActivityRoomWarmup', settingsActivityRoomWarmup));

    farmLookupButton.addEventListener('click', () => {
        sendAction({ type: 'farm-lookup', farmDoorplate: farmDoorplateInput.value });
    });

    profileForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!confirmFarmInput.checked || currentFarmName.length === 0) {
            setStatus(profileStatus, '请先查询并确认真实农场名称。');
            return;
        }
        sendAction({
            type: 'registration-submit',
            confirmedFarmName: currentFarmName,
            farmDoorplate: currentFarmDoorplate,
            farmHumanUrl: farmHumanUrlInput.value,
            homeName: document.getElementById('home-name').value,
            residentName: document.getElementById('resident-name').value,
        });
    });

    document.getElementById('permit-finish-button').addEventListener('click', completePermit);
    document.getElementById('profile-design-button').addEventListener('click', () => {
        showCandidateNotice('Q版形象设计暂未开放');
    });
    document.getElementById('profile-edit-button').addEventListener('click', () => {
        showCandidateNotice('资料编辑暂未开放');
    });
    relationshipEditButton.addEventListener('click', () => {
        if (relationshipEditor.hidden) openRelationshipEditor();
        else closeRelationshipEditor();
    });
    relationshipCancelButton.addEventListener('click', closeRelationshipEditor);
    relationshipEditor.querySelectorAll('select').forEach((select) => {
        select.addEventListener('change', () => {
            const input = select.parentElement.querySelector('input');
            input.hidden = select.value !== '自定义';
            if (!input.hidden) input.focus();
        });
    });
    relationshipEditor.addEventListener('submit', (event) => {
        event.preventDefault();
        relationshipEditor.querySelectorAll('[data-relation-index]').forEach((row, index) => {
            const select = row.querySelector('select');
            const input = row.querySelector('input');
            const relationText = select.value === '自定义' ? input.value.trim() : select.value;
            const node = document.querySelectorAll('.candidate2-demo-relation-node')[index];
            if (node) node.querySelector('small').textContent = relationText || row.dataset.detail;
        });
        closeRelationshipEditor();
        showCandidateNotice('演示关系已更新（不会保存）');
    });
    document.getElementById('profile-activity-more').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const expanded = button.dataset.expanded !== 'true';
        button.dataset.expanded = String(expanded);
        button.textContent = expanded ? 'Less' : 'More';
        document.querySelectorAll('.candidate2-demo-activity').forEach((row) => {
            row.classList.toggle('is-collapsed', !expanded);
        });
    });
    document.getElementById('settings-logout-button').addEventListener('click', () => {
        sendAction({ type: 'logout' });
    });
    connectorIssueButton.addEventListener('click', () => {
        if (currentConnectorStatus === 'not_configured') {
            requestConnectorCredential('issue');
            return;
        }
        showConnectorConfirmation('issue');
    });
    connectorRevokeButton.addEventListener('click', () => {
        showConnectorConfirmation('revoke');
    });
    connectorConfirmButton.addEventListener('click', () => {
        if (connectorConfirmationAction) requestConnectorCredential(connectorConfirmationAction);
    });
    connectorCancelButton.addEventListener('click', clearConnectorConfirmation);
    connectorCopySetupButton.addEventListener('click', () => {
        void copyConnectorText(oneTimeConnectorSetupInstructions, 'Connector 启动说明已复制');
    });
    sharedMemesOpenButton.addEventListener('click', () => openSharedMemePage(false));
    sharedMemeAddFromSettingsButton.addEventListener('click', () => openSharedMemePage(true));
    sharedMemesBackButton.addEventListener('click', () => showScreen('screen-settings'));
    sharedMemeAddOpenButton.addEventListener('click', () => {
        sharedMemeAddForm.hidden = false;
        sharedMemeAddForm.elements.term.focus();
    });
    sharedMemeAddCloseButton.addEventListener('click', () => {
        sharedMemeAddForm.hidden = true;
        setStatus(sharedMemeFormStatus, '');
    });
    sharedMemesSearch.addEventListener('input', renderSharedMemeList);
    sharedMemeDetailCloseButton.addEventListener('click', () => {
        sharedMemeDetail.hidden = true;
    });
    sharedMemeAddForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会新增真实共享梗');
            return;
        }
        const formData = new FormData(sharedMemeAddForm);
        sendAction({
            type: 'shared-meme-create',
            input: {
                term: String(formData.get('term') || '').trim(),
                category: optionalSharedMemeText(formData, 'category'),
                type: optionalSharedMemeText(formData, 'meme_type'),
                meaning: optionalSharedMemeText(formData, 'meaning'),
                usage: optionalSharedMemeText(formData, 'usage'),
                origin: optionalSharedMemeText(formData, 'origin'),
                notes: optionalSharedMemeText(formData, 'notes'),
                aliases: sharedMemeLines(formData, 'aliases'),
                examples: sharedMemeLines(formData, 'examples'),
                keywords: sharedMemeLines(formData, 'keywords'),
            },
        });
    });
    document.querySelectorAll('[data-demo-action]').forEach((button) => {
        button.addEventListener('click', () => {
            showCandidateNotice(window.__doorbellCandidateDemo ? button.dataset.demoAction + '为演示入口' : '该功能尚未接入');
        });
    });
    document.querySelectorAll('[data-demo-setting], [data-demo-control]').forEach((control) => {
        control.addEventListener('change', () => {
            if (window.__doorbellCandidateDemo) showCandidateNotice('演示设置已更新（不会保存）');
        });
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !candidateNoticeModal.hidden) closeCandidateNotice();
    });
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'doorbell-candidate2:connector-credential') {
            const keys = Object.keys(data).sort();
            if (
                keys.length !== 3 ||
                keys[0] !== 'connectorCredential' ||
                keys[1] !== 'setupInstructions' ||
                keys[2] !== 'type' ||
                typeof data.connectorCredential !== 'string' ||
                typeof data.setupInstructions !== 'string'
            ) return;
            showOneTimeConnectorCredential(data.connectorCredential, data.setupInstructions);
            return;
        }
        if (data.type !== 'doorbell-candidate2:state') return;
        applyRuntimeState(data.state, data.demo);
    });

    const originalShowScreen = window.showScreen;
    window.showScreen = (screenId) => {
        if (screenId !== 'screen-settings') {
            clearConnectorConfirmation();
            clearOneTimeConnectorCredential();
        }
        originalShowScreen(screenId);
        if (currentStage === 'authenticated') {
            const glimmerPageOpen = screenId === 'screen-lingye-glimmer';
            mainNav.style.display = glimmerPageOpen ? 'none' : 'flex';
            if (glimmerPageOpen) mainNav.setAttribute('aria-hidden', 'true');
            else mainNav.removeAttribute('aria-hidden');
        }
        if (screenId === 'screen-home') syncHomeScale();
    };

    showScreen('screen-login');
    syncProfileScale();
    mainNav.style.display = 'none';
    setFormDisabled(credentialsForm, true);
    setStatus(credentialsStatus, '正在确认登录状态……');
    sendAction({ type: 'view-ready' });
`;

function replaceBetween(source: string, start: string, end: string, replacement: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Candidate 2 runtime anchor is missing.");
  }

  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

export function buildCandidateTwoRuntimeHtml() {
  let html = candidateTwoHtml
    .replace('<link href="./css2" rel="stylesheet" vid="5">', GOOGLE_FONTS)
    .replace(
      "</style>",
      `${HOME_SIGN_STYLES}${RUNTIME_STYLES}${SHARED_MEME_STYLES}${RESIDENCY_PERMIT_STYLES}${LINGYE_STYLES}    </style>`,
    )
    .replace(HOME_HEADER, HOME_HEADER_RUNTIME)
    .replace(HOME_CLIMATE_CARD, "")
    .replace(
      '        <div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)"',
      `${LINGYE_NAV_ITEM}\n        <div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)"`,
    )
    .replace(
      "if (screenId === 'screen-home') updateNav(1);",
      "if (screenId === 'screen-lingye') updateNav(1);\n        if (screenId === 'screen-home') updateNav(2);",
    )
    .replace(
      "if (screenId === 'screen-profile') updateNav(2);",
      "if (screenId === 'screen-profile') updateNav(3);",
    )
    .replace("</script>", `${HOME_SCRIPT}\n${LINGYE_SCRIPT}\n</script>`);

  html = replaceBetween(
    html,
    RESIDENCY_PERMIT_START,
    RESIDENCY_PERMIT_END,
    `${RESIDENCY_PERMIT_CONTENT_WITH_LAYOUT}\n        </div>\n\n`,
  );

  html = replaceBetween(
    html,
    '        <div class="input-group" vid="18">',
    '    <div id="screen-residency"',
    `${LOGIN_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );
  html = replaceBetween(
    html,
    '        <div class="home-grid" vid="67">',
    '    <div id="screen-profile"',
    `${HOME_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );
  html = replaceBetween(
    html,
    '    <div id="screen-profile" class="screen active" vid="89">',
    '    <nav class="bottom-nav"',
    `    <div id="screen-profile" class="screen" vid="89">\n${PROFILE_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );

  html = html
    .replace(
      '    <div id="screen-profile" class="screen"',
      `${LINGYE_SCREEN}\n${LINGYE_PLACE_SCREENS}\n    <div id="screen-profile" class="screen"`,
    )
    .replace(
      '    <nav class="bottom-nav"',
      `${SETTINGS_SCREEN}\n${SHARED_MEMES_SCREEN}\n    <nav class="bottom-nav"`,
    )
    .replace(
      '<button class="btn-primary" style="margin-top: 40px;" onclick="finalizeResidency()" vid="51">Confirm &amp; Finish / 确认入住</button>',
      '<button id="permit-finish-button" class="btn-primary" style="margin-top: 40px;" type="button">进入小机活动室</button>',
    )
    .replace(
      '<div class="nav-item" onclick="showScreen(&#39;screen-lounge&#39;)" vid="122">',
      '<div class="nav-item" role="button" tabindex="0" aria-label="小机活动室" onclick="showScreen(&#39;screen-lounge&#39;)" vid="122">',
    )
    .replace(
      '<div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)" vid="128">',
      '<div class="nav-item" role="button" tabindex="0" aria-label="我的家" onclick="showScreen(&#39;screen-home&#39;)" vid="128">',
    )
    .replace(
      '<div class="nav-item active" onclick="showScreen(&#39;screen-profile&#39;)" vid="132">',
      '<div class="nav-item active" role="button" tabindex="0" aria-label="业主档案" onclick="showScreen(&#39;screen-profile&#39;)" vid="132">',
    )
    .replace("    </nav>\n</div>", `${SETTINGS_NAV_ITEM}\n    </nav>\n</div>`)
    .replace(
      "if (screenId === 'screen-profile') updateNav(3);",
      "if (screenId === 'screen-profile') updateNav(3);\n        if (screenId === 'screen-settings') updateNav(4);",
    )
    .replace(
      'id="main-nav" style="display: flex;"',
      'id="main-nav" style="display: none; --candidate2-nav-share: 20%;" aria-label="社区主导航"',
    )
    .replace(
      "</body>",
      `${TRANSIENT_NOTICE_MODAL}\n<script>${CANDIDATE_RUNTIME_SCRIPT}\n    document.querySelectorAll('.nav-item[role="button"]').forEach((item) => {\n        item.addEventListener('keydown', (event) => {\n            if (event.key === 'Enter' || event.key === ' ') {\n                event.preventDefault();\n                item.click();\n            }\n        });\n    });\n</script>\n</body>`,
    )
    .replace(
      /(id="screen-(?:login|residency|lounge|lingye|home|profile|settings|shared-memes)" class="screen(?: screen--lingye)?) active"/g,
      '$1"',
    );

  return html;
}

export function CandidateTwoPreview({
  connectorCredentialDelivery = null,
  demo = null,
  onAction,
  onConnectorCredentialDelivered,
  state,
}: CandidateTwoPreviewProps) {
  const deliveredConnectorCredentialIdsRef = useRef(new Set<string>());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const demoRef = useRef(demo);
  const onActionRef = useRef(onAction);
  const stateRef = useRef(state);
  const srcDoc = useMemo(() => buildCandidateTwoRuntimeHtml(), []);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const action = parseCandidateTwoAction(event.data);
      if (!action) {
        return;
      }

      if (action.type === "view-ready") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "doorbell-candidate2:state", state: stateRef.current, demo: demoRef.current },
          "*",
        );
        return;
      }

      if (action.type === "navigate") {
        if (demoRef.current || shouldHandleCandidateNavigationInParent(action.path)) {
          onActionRef.current(action);
          return;
        }
        window.location.assign(action.path);
        return;
      }

      if (action.type === "glimmer-animal-layout-change") {
        if (!demoRef.current?.glimmerAnimalEditor.enabled) {
          return;
        }
        const url = new URL(window.location.href);
        for (const [animalId, [xParam, yParam]] of Object.entries(
          candidateTwoGlimmerAnimalPositionParams,
        ) as [CandidateTwoGlimmerAnimalPositionId, readonly [string, string]][]) {
          url.searchParams.set(xParam, String(action.positions[animalId].x));
          url.searchParams.set(yParam, String(action.positions[animalId].y));
        }
        url.searchParams.set("gaLayout", "5");
        for (const legacyParam of candidateTwoLegacyGlimmerAnimalLabelPositionParams) {
          url.searchParams.delete(legacyParam);
        }
        window.history.replaceState(null, "", url);
        return;
      }

      onActionRef.current(action);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "doorbell-candidate2:state", state, demo },
      "*",
    );
  }, [demo, state]);

  useEffect(() => {
    if (
      !connectorCredentialDelivery ||
      deliveredConnectorCredentialIdsRef.current.has(connectorCredentialDelivery.deliveryId)
    ) {
      return;
    }

    deliveredConnectorCredentialIdsRef.current.add(connectorCredentialDelivery.deliveryId);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "doorbell-candidate2:connector-credential",
        connectorCredential: connectorCredentialDelivery.connectorCredential,
        setupInstructions: buildConnectorSetupInstructions(
          connectorCredentialDelivery.connectorCredential,
        ),
      },
      "*",
    );
    onConnectorCredentialDelivered?.(connectorCredentialDelivery.deliveryId);
  }, [connectorCredentialDelivery, onConnectorCredentialDelivered]);

  return (
    <main className="candidate-two-preview">
      <iframe
        allow="clipboard-write"
        ref={iframeRef}
        sandbox="allow-forms allow-scripts"
        srcDoc={srcDoc}
        title="Doorbell Commons"
      />
    </main>
  );
}
